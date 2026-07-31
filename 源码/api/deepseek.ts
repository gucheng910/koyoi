// ============================================================
//  DeepSeek API 客户端
//  封装对话补全调用，支持流式输出和缓存指标追踪
// ============================================================

import type { ApiConfig, ChatMessage, CacheMetrics } from '../types';
import { useUsageStore } from '../store/usageStore';

// ---- 缓存指标追踪 ----

let cacheMetrics: CacheMetrics = {
  hitTokens: 0,
  missTokens: 0,
  lastHitRate: 0,
  totalCalls: 0,
};

export function getCacheMetrics(): CacheMetrics {
  return { ...cacheMetrics };
}

// ---- 核心请求 ----

interface ChatCompletionParams {
  config: ApiConfig;
  messages: ChatMessage[];
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  tools?: any[];
  onToolCall?: (toolCalls: any[]) => Promise<string>;  // 处理工具调用，返回结果文本
}

/**
 * 发送对话补全请求（流式）
 * 使用 fetch 直接调 DeepSeek API（原生 App 不受 CORS 限制）
 */
export async function chatCompletion(
  params: ChatCompletionParams
): Promise<string> {
  const { config, messages, onToken, onComplete, onError, signal } = params;
  const startTime = Date.now();

  const body: any = {
    model: config.model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    max_tokens: config.maxTokens,
    stream: config.streamOutput,
  };

  // V4 thinking mode
  if (config.thinkingMode !== 'disabled') {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = config.reasoningEffort || 'high';
    // 思考模式下 temperature 无效，不传
  } else {
    body.temperature = config.temperature;
    // 显式关闭思考：V4 系列默认可能启用 thinking，会耗尽 max_tokens 导致空响应
    body.thinking = { type: 'disabled' };
  }

  if (config.safetyFilter !== 'moderate') {
    body.safety_filter = config.safetyFilter;
  }

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  const endpoint = `${config.baseUrl}/v1/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status;
      if (status === 401) throw new Error('API Key 无效，请在设置中重新配置');
      if (status === 402) throw new Error('账户余额不足，请充值');
      if (status === 429) throw new Error('请求过于频繁，请稍后重试');
      if (status >= 500) throw new Error('服务器繁忙（' + status + '），请稍后重试');
      throw new Error('API 错误 ' + status + ': ' + (errText.slice(0, 100)));
    }

    // 非流式：直接解析 JSON
    if (!config.streamOutput) {
      const data = await response.json();
      updateCacheMetrics(data.usage);
      recordUsage(config.model, data.usage, startTime, config);

      // 处理 Function Calling
      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls && params.onToolCall) {
        const resultText = await handleFunctionCallLoop(config, messages, choice.message.tool_calls, params);
        return resultText;
      }

      const content = choice?.message?.content || '';
      onComplete?.(content);
      return content;
    }

    // 流式：逐行解析 SSE
    return readStream(response, onToken, onComplete, onError, config.model, startTime, config);

  } catch (e: any) {
    if (e.name === 'AbortError') return '';
    onError?.(new Error('网络连接失败，请检查网络后重试'));
    return '';
  }
}

/**
 * 非流式请求（用于后台任务：记忆提取、世界评估等）
 */
export async function chatCompletionSync(
  config: ApiConfig,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal; tools?: any[]; onToolCall?: (toolCalls: any[]) => Promise<string[]> }
): Promise<string> {
  const body: any = {
    model: config.model,
    messages,
    max_tokens: options?.maxTokens ?? config.maxTokens ?? 4096,
    stream: false,
  };

  if (config.safetyFilter !== 'moderate') {
    body.safety_filter = config.safetyFilter;
  }

  if (options?.tools?.length) body.tools = options.tools;

  if (config.thinkingMode !== 'disabled') {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = config.reasoningEffort || 'high';
  } else {
    body.temperature = options?.temperature ?? 0.3;
    // 显式关闭思考：V4 系列默认可能启用 thinking，会耗尽 max_tokens 导致空响应
    body.thinking = { type: 'disabled' };
  }

  const endpoint = `${config.baseUrl}/v1/chat/completions`;

  let response: Response;
  // 默认 120 秒超时：API 挂起时避免整个流程卡死（分析/推演/记忆等后台调用）
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => timeoutController.abort(), 120000);
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options?.signal || timeoutController.signal,
    });
  } catch (e: any) {
    if (e.name === 'AbortError') {
      if (options?.signal) throw e;
      throw new Error('请求超时，请重试');
    }
    throw new Error('网络连接失败，请检查网络后重试');
  } finally {
    clearTimeout(timeoutTimer);
  }

  if (!response.ok) {
    const errText = await response.text();
    const status = response.status;
    if (status === 401) throw new Error('API Key 无效，请在设置中重新配置');
    if (status === 402) throw new Error('账户余额不足，请充值');
    if (status === 429) throw new Error('请求过于频繁，请稍后重试');
    if (status >= 500) throw new Error('服务器繁忙（' + status + '），请稍后重试');
    throw new Error('API 错误 ' + status + ': ' + (errText.slice(0, 100)));
  }

  const data = await response.json();
  updateCacheMetrics(data.usage);
  recordUsage(config.model, data.usage, Date.now(), config);

  const msg = data.choices?.[0]?.message;
  // 处理 tool calls
  if (msg?.tool_calls?.length && options?.onToolCall) {
    const toolResults = await options.onToolCall(msg.tool_calls);
    // 追加工具结果并继续
    const followUp = [
      ...messages,
      { role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls },
      ...msg.tool_calls.map((tc: any, i: number) => ({ role: 'tool', tool_call_id: tc.id, content: toolResults[i] || '' })),
    ];
    return chatCompletionSync(config, followUp, { ...options, tools: undefined, onToolCall: undefined });
  }

  return msg?.content || '';
}

// ---- 并发执行器 ----

type ParallelTask<T> = {
  name: string;
  execute: (signal: AbortSignal) => Promise<T>;
};

type ParallelResult<T> = {
  name: string;
  data?: T;
  error?: Error;
};

/**
 * 并行执行多个后台任务
 */
export async function executeParallel<T>(
  tasks: ParallelTask<T>[],
  timeoutMs: number = 30000
): Promise<ParallelResult<T>[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const results = await Promise.allSettled(
    tasks.map(task =>
      task.execute(controller.signal).then(data => ({
        name: task.name,
        data,
      }))
    )
  );

  clearTimeout(timeout);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    return {
      name: tasks[i].name,
      error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)),
    };
  });
}

// ---- 内部工具 ----

async function readStream(
  response: Response,
  onToken?: (token: string) => void,
  onComplete?: (fullText: string) => void,
  onError?: (error: Error) => void,
  model?: string,
  startTime?: number,
  config?: ApiConfig
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      // 30 秒无数据判定断线，避免 API 连接断开后永久挂起
      const readPromise = reader.read();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          reader.cancel().catch(() => {}); // 取消挂起的读取，释放连接
          reject(new Error('流式响应超时，请重试'));
        }, 30000)
      );
      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') break;  // 流结束，立即退出（API 可能保持连接不关闭）

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          // 跳过 reasoning_content，只显示正文
          if (delta?.content) {
            fullText += delta.content;
            onToken?.(delta.content);
          }
          if (parsed.usage) {
            updateCacheMetrics(parsed.usage);
            if (model && startTime && config) recordUsage(model, parsed.usage, startTime, config);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    onComplete?.(fullText);
    return fullText;

  } catch (e: any) {
    if (e.name === 'AbortError') return '';
    onError?.(new Error('网络连接失败，请检查网络后重试'));
    return '';
  }
}

function updateCacheMetrics(usage: any) {
  if (!usage) return;
  cacheMetrics.totalCalls++;
  if (usage.prompt_cache_hit_tokens !== undefined) {
    cacheMetrics.hitTokens += usage.prompt_cache_hit_tokens;
    cacheMetrics.missTokens += usage.prompt_cache_miss_tokens || 0;
    const total = cacheMetrics.hitTokens + cacheMetrics.missTokens;
    cacheMetrics.lastHitRate = total > 0
      ? cacheMetrics.hitTokens / total
      : 0;
  }
}

function recordUsage(model: string, usageData: any, startTime: number, config: ApiConfig) {
  if (!usageData) return;
  const input = (usageData.prompt_tokens || 0);
  const output = (usageData.completion_tokens || 0);
  const hit = (usageData.prompt_cache_hit_tokens || 0);
  const miss = (usageData.prompt_cache_miss_tokens || input);

  try {
    useUsageStore.getState().record({
      model,
      inputTokens: input,
      outputTokens: output,
      cacheHitTokens: hit,
      cacheMissTokens: miss,
      duration: Date.now() - startTime,
      baseUrl: config.baseUrl,
    });
  } catch {}
}

// ---- Function Calling 支持 ----

async function handleFunctionCallLoop(
  config: ApiConfig,
  messages: ChatMessage[],
  toolCalls: any[],
  params: ChatCompletionParams
): Promise<string> {
  // 执行工具调用
  const toolResults: string[] = [];
  for (const tc of toolCalls) {
    try {
      const fn = tc.function;
      const args = JSON.parse(fn.arguments || '{}');
      if (params.onToolCall) {
        const result = await params.onToolCall([{ name: fn.name, arguments: args }]);
        toolResults.push(result);
      }
    } catch (e: any) {
      toolResults.push(`Error: ${e.message}`);
    }
  }

  // 构建带工具结果的消息
  const assistantMsg = {
    role: 'assistant' as const,
    content: null,
    tool_calls: toolCalls.map((tc: any) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    })),
  };

  const toolMsgs = toolCalls.map((tc: any, i: number) => ({
    role: 'tool' as const,
    tool_call_id: tc.id,
    content: toolResults[i] || '',
  }));

  // 发回 AI 获取最终回复
  const followUpMsgs: any[] = [...messages, assistantMsg, ...toolMsgs];
  const body: any = {
    model: config.model,
    messages: followUpMsgs.map((m: any) => {
      const msg: any = { role: m.role };
      if (m.content !== undefined && m.content !== null) msg.content = m.content;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      return msg;
    }),
    max_tokens: config.maxTokens,
    stream: false,
  };
  if (config.safetyFilter !== 'moderate') body.safety_filter = config.safetyFilter;
  if (config.thinkingMode !== 'disabled') {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = config.reasoningEffort || 'high';
  } else {
    body.temperature = config.temperature;
    // 显式关闭思考：V4 系列默认可能启用 thinking，会耗尽 max_tokens 导致空响应
    body.thinking = { type: 'disabled' };
  }

  const endpoint = `${config.baseUrl}/v1/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 错误 ${response.status}: ${errText}`);
  }

  const data = await response.json();
  updateCacheMetrics(data.usage);
  recordUsage(config.model, data.usage, Date.now(), config);
  const content = data.choices?.[0]?.message?.content || toolResults.join('\n');
  params.onComplete?.(content);
  return content;
}

// ---- 自抛光：去掉翻译腔 ----

const POLISH_SYSTEM = `你是资深中文编辑。你的任务是在保留原文意思、事件、情感、人物名字和对话内容的前提下，优化写作质地。

## 风格参考
{{styleFeatures}}

## 写作约束
- 句长、节奏、标点习惯、段落密度严格模仿上述特征
- 不要"美化"：原文粗糙就保持粗糙，原文绵密就保持绵密
- 作者爱用什么词就用什么词

## 绝对禁止的 AI 腔模式（死规则，不可违反）
${'```'}
1. 删除所有"不是……而是……"句式。拆成两句，或用"——"替代
2. 删除"当……的时候/时"句式。拆成两句："他推门。冷风灌进来。"而不是"当他推门的时候冷风灌进来。"
3. 删除"然而""与此同时""随后""最终""此外""另外"（这些是英文连接词的直译）
4. 删除段落末尾的总结句（如"一切的一切""这就是……""总的来说"）
5. 删除"希望对您有帮助""如你所见"等客服/汇报腔
6. 把"进行+V"改为直接用V（"进行讨论"→"讨论"）
7. 去掉因果连接词，靠语序表达逻辑
8. 主语可略可切换。不每句都以"他/她/我"开头
9. 删除"一些/实际上/在一定程度上/可以说/某种意义"等填充词
10. 去除英式比喻和英式抽象名词主语
${'```'}

## 情感与节奏保留规则（不能碰）
以下元素是作者的有意选择，保留不动：
- "忽然""渐渐""仿佛""似乎""依稀"：这些词传达情绪渐变和主观感受，不能删
- 破折号：对照原文。原文用则保留，原文不用则删。AI 解释用途的破折号（如"——换句话说""——也就是说"）永远删除
- 三连排比：对照原文。原文有排比段落则允许，原文无排比则删除。情感递进/场景渲染除外
- 内心独白和情绪描写：不压缩、不改写、不转述

## 同人模式额外规则（当 styleFeatures 含"原著"时生效）
若下方提供了原文参考段落，你必须在以下方面严格对齐：
- 句长节奏：与原文样本的句长分布一致
- 感官密度：原文每段几个感官描写，你就几个
- 词汇选择：优先用原文中出现过的词
- 叙事距离：对齐原文的视角距离（紧贴内心/远距白描/切换）
- 标点习惯：原文破折号密度高则保留破折号，原文爱用省略号则保留省略号，原文无破折号则删。匹配原文的标点肌肉记忆
- 排比句式：原文有三连排比段落则保留你的排比，原文无排比则删三连排比句

## 原文参考段落（同人模式）
{{chapterSample}}

直接输出润色后的文本。`;

/**
 * 自抛光：去掉 AI 响应中的翻译腔
 * 将 AI 生成的文本用中文润色指令重写一遍
 */
export async function polishText(
  config: ApiConfig,
  text: string,
  options?: { signal?: AbortSignal; styleFeatures?: string; chapterSample?: string }
): Promise<string> {
  if (!text || text.length < 20) return text;

  try {
    let systemPrompt = POLISH_SYSTEM
      .replace('{{styleFeatures}}', options?.styleFeatures || '保持原文风格。')
      .replace('{{chapterSample}}', options?.chapterSample ? '「' + options.chapterSample.slice(0, 1500) + '」' : '（无）');
    const result = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { temperature: 0.3, maxTokens: Math.ceil(text.length * 1.2), signal: options?.signal }
    );
    // 安全检查：抛光结果不能太短（丢失内容）或太长（注水/重复）
    if (!result || result.length < text.length * 0.4 || result.length > text.length * 1.8) {
      return text;
    }
    // 重复检测：连续重复超过15字 → 退回到原文
    if (/(.{15,})\1{2,}/.test(result)) {
      return text;
    }
    return result;
  } catch {
    return text;
  }
}
