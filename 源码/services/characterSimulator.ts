// ============================================================
//  角色自主推演引擎
//  每个NPC独立调用AI模拟，输出其当前行动/对话/情绪
//  支持 DeepSeek Function Calling: 拉入/摆脱互动
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import type { ApiConfig, Character, WorldNpc } from '../types';

export interface CharacterAction {
  name: string;
  intent: string;
  mood: string;
  innerThought: string;
  bodyLanguage: string;
  subtext: string;
  emotionalDirection: 'warming' | 'cooling' | 'breaking' | 'holding' | 'shifting';
  triggerContext: string;
  toward: string;
  wantsInteraction: boolean;
  affectionDelta: number;
  mentalState?: { believes: string; desires: string; feels: string; intends: string };   // 对玩家的好感变化，范围 -100~100，正=上升负=下降
}

/** 互动管理工具定义 */
export const INTERACTION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'manage_interaction',
    description: '将角色拉入当前互动场景，或让角色离开当前互动。拉入意味着角色将出现在玩家的视野中并可能参与对话。摆脱意味着角色因故离开场景或不再参与当前互动。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['pull_in', 'push_out'],
          description: 'pull_in=拉入互动（角色出现/走近/加入对话），push_out=摆脱互动（角色离开/走远/不再参与）'
        },
        character_name: {
          type: 'string',
          description: '要操作的角色名称'
        },
        narrative: {
          type: 'string',
          description: '用一句话描述这个角色如何出现或离开，用于叙事连贯性。例如："她从楼梯上走下来，在转角处停住"或"他看了一眼手机，匆匆推门出去"'
        }
      },
      required: ['action', 'character_name', 'narrative']
    }
  }
};

/** 工具函数：实际更新互动状态 */
export function applyInteractionChange(
  activeChars: string[],
  call: { action: string; character_name: string; narrative: string }
): { activeChars: string[]; narrative: string } {
  if (call.action === 'pull_in') {
    if (!activeChars.includes(call.character_name)) {
      return { activeChars: [...activeChars, call.character_name], narrative: call.narrative };
    }
  } else if (call.action === 'push_out') {
    return { activeChars: activeChars.filter(n => n !== call.character_name), narrative: call.narrative };
  }
  return { activeChars, narrative: '' };
}

const SIMULATE_PROMPT = `你是{{name}}。你不是在"扮演"——你就是这个人。你的每个想法、每个微小的身体反应，都来自你的性格和历史。

## 你的本质
性格关键词：{{surfaceTraits}}
{{deepSection}}
身份：{{role}} | 目标：{{goal}}

注意：以上是你的完整人格，但在当前场景中，只有与此刻情绪最相关的 1~2 个性格面会被激活。不要把所有性格特征都表现出来——人在不同情境下会呈现不同侧面。
当前状态：{{status}}
与玩家的关系：{{relationship}}
{{kbContext}}

## 此刻场景
{{scene}}
{{events}}
{{interactionState}}
{{visibleDialogue}}
在场的人：{{activeList}}

## 推演要求
请以这个角色的第一人称视角，输出你此刻的真实状态。
## 推演前请先思考（30字以内，在输出JSON之前）：
1. 你此刻的处境是什么？刚才发生了什么？
2. 你的性格中哪一面在驱动你此刻的反应？（不要展示全部性格，只有与此刻相关的1-2个面被激活）
3. 你对玩家的好感大约在什么水平？这如何影响你此刻的态度？
4. 接下来你打算怎么做——是主动、被动、回避、还是试探？

注意以下几点：

1. **内心独白**：你脑子里此刻闪过的念头是什么？这不一定是你表现出来的。
2. **身体语言**：你的身体在做什么？手指在绞衣角吗？视线在躲吗？心跳在加速吗？这些你未必意识到。
3. **潜台词**：如果你准备说或做什么，它真正的意思是什么？表面行为下的真实动机是什么？
4. **情绪方向**：你的情绪在往哪个方向走？在升温（愤怒/兴奋）？在冷却（失望/释然）？在崩溃边缘？还是在压抑？还是即将翻转？
5. **触发点**：场景里有哪个细节——一句话、一个画面、一件物品、一个人的动作——触动了你此刻的反应？
6. **好感变化**：经过这一轮互动，你对玩家的好感是升了还是降了？给出精确数字。规则：
   - 好感变化必须基于你的性格和当前处境，不是机械的"对方对你好就升"
   - 害羞/傲娇/防御心重的角色：即使内心被打动，好感上升也极微小（0.01~0.5），甚至表现出反向行为
   - 信任感低的角色：对善意保持警惕，好感不易上升
   - 重大事件才驱动大变化（舍身相救+15~30，触及逆鳞-20~40，日常闲聊±0~2）
   - 好感越高越难涨：60以上变化减半，80以上再减半，95以上几乎不动
   - 好感可为负（厌恶），负值时上升更容易
   - 数值范围：-100到100

自然一点。人不是时刻都在高潮——有时候只是累了，有时候在想晚饭吃什么，有时候没来由地烦躁。

{{prevState}}

返回JSON：
{
  "intent":"你此刻想做什么（40字以内）",
  "mood":"表面情绪（如：强装镇定/止不住笑意/烦躁不安/麻木放空）",
  "innerThought":"内心独白（20~60字）",
  "bodyLanguage":"身体语言（如：手指无意识地敲桌面/眼眶忽然发酸/不自觉地后退半步）",
  "subtext":"潜台词（表面行为背后的真实意思，如：嘴上在催他走，其实怕他看出来自己在发抖）",
  "emotionalDirection":"warming|cooling|breaking|holding|shifting",
  "triggerContext":"触发点（场景中什么触动了你，如：他提到那个名字的时候/阳光照进来那一刻/谁都没说话的时候）",
  "toward":"player/某角色名/none/self",
  "wantsInteraction":true/false,
  "affectionDelta":0,
  "mentalState":{
    "believes":"此刻相信什么（如：相信他在说谎/相信一切会好起来/什么都不确定）",
    "desires":"此刻想要什么（如：想被注意到/想一个人待着/想逃离这里）",
    "feels":"对在场某人的感觉（如：对小美感到愧疚/对宗主感到敬畏）",
    "intends":"接下来打算做什么（如：打算开口问清楚/打算沉默到底）"
  }
}`;

export function buildSimulatePrompt(
  char: { name: string; personality: string; deepPersonality?: string; role: string; status: string; goal?: string },
  scene: string,
  events: string,
  relationship: string,
  interactionState: 'active' | 'inactive',
  activeList: string,
  prevState?: string,
  kbContext?: string,
  dialogue?: string
): string {
  // 构建深层人格段落
  let deepSection = '';
  if (char.deepPersonality) {
    deepSection = `真实性格：${char.deepPersonality}`;
  }

  let prompt = SIMULATE_PROMPT
    .replace('{{name}}', char.name)
    .replace('{{surfaceTraits}}', char.personality)
    .replace('{{deepSection}}', deepSection ? `\n${deepSection}` : '')
    .replace('{{role}}', char.role)
    .replace('{{status}}', char.status)
    .replace('{{goal}}', char.goal || '未知')
    .replace('{{scene}}', scene)
    .replace('{{events}}', events || '无')
    .replace('{{relationship}}', relationship)
    .replace('{{interactionState}}', interactionState === 'active' ? '你正在与玩家互动中' : '你此刻不在玩家视线内，在做自己的事')
    .replace('{{activeList}}', activeList)
    .replace('{{kbContext}}', kbContext ? `\n原著信息：${kbContext}` : '')
    .replace('{{prevState}}', prevState ? `你上一轮的状态：${prevState}` : '')
    .replace('{{visibleDialogue}}', dialogue ? `你看到的对话：${dialogue}` : '');
  return prompt;
}

function safeParseAction(raw: string): CharacterAction {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        name: parsed.name || '',
        intent: parsed.intent || parsed.action || '',
        mood: parsed.mood || parsed.emotion || '平静',
        innerThought: parsed.innerThought || parsed.inner_thought || '',
        bodyLanguage: parsed.bodyLanguage || parsed.body_language || '',
        subtext: parsed.subtext || '',
        emotionalDirection: parsed.emotionalDirection || parsed.emotional_direction || 'holding',
        triggerContext: parsed.triggerContext || parsed.trigger_context || '',
        toward: parsed.toward || 'none',
        wantsInteraction: parsed.wantsInteraction || false,
        affectionDelta: typeof parsed.affectionDelta === 'number' ? parsed.affectionDelta : (typeof parsed.affection_delta === 'number' ? parsed.affection_delta : 0),
      };
    }
  } catch {}
  return { name: '', intent: '', mood: '平静', innerThought: '', bodyLanguage: '', subtext: '', emotionalDirection: 'holding', triggerContext: '', toward: 'none', wantsInteraction: false, affectionDelta: 0 };
}

export interface SimulateResult {
  action: CharacterAction | null;
  toolCalls: Array<{ action: string; character_name: string; narrative: string }>;
}

/**
 * 模拟单个角色的行动（支持 Function Calling）
 */
export async function simulateCharacter(
  config: ApiConfig,
  char: { name: string; personality: string; deepPersonality?: string; role: string; status: string; goal?: string },
  scene: string,
  events: string,
  relationship: string,
  interactionState: 'active' | 'inactive',
  activeList: string,
  prevState?: string,
  kbContext?: string,
  dialogue?: string
): Promise<SimulateResult> {
  try {
    const capturedCalls: Array<{ action: string; character_name: string; narrative: string }> = [];
    const prompt = [
      { role: 'system' as const, content: buildSimulatePrompt(char, scene, events, relationship, interactionState, activeList, prevState, kbContext, dialogue) },
      { role: 'user' as const, content: '推演' + char.name + '此刻的状态' },
    ];
    const raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      prompt,
      { maxTokens: 500, temperature: 0.9, tools: [INTERACTION_TOOL],
        onToolCall: async (tcs) => tcs.map(tc => {
          try {
            const args = JSON.parse(tc.function?.arguments || '{}');
            capturedCalls.push({ action: args.action || '', character_name: args.character_name || '', narrative: args.narrative || '' });
            return args.narrative || args.action || '';
          } catch { return ''; }
        }) }
    );
    // 解析 tool_calls（API 原生 function calling 已处理，这里收集结果）
    const action = safeParseAction(raw);
    if (action) action.name = char.name;
    return { action, toolCalls: capturedCalls };
  } catch {
    return { action: null, toolCalls: [] };
  }
}

function extractToolCalls(response: string): Array<{ action: string; character_name: string; narrative: string }> {
  const calls: Array<{ action: string; character_name: string; narrative: string }> = [];
  // 匹配 JSON 格式的 tool_call
  const re = /"name":\s*"manage_interaction"[^}]*"arguments":\s*"({[^"]+})"/g;
  // 简化：匹配 manage_interaction 调用
  const funcRe = /manage_interaction[\s\S]*?"action":\s*"(pull_in|push_out)"[\s\S]*?"character_name":\s*"([^"]+)"[\s\S]*?"narrative":\s*"([^"]+)"/g;
  let m;
  while ((m = funcRe.exec(response)) !== null) {
    calls.push({ action: m[1], character_name: m[2], narrative: m[3] });
  }
  return calls;
}

/**
 * 批量推演：一次请求推演全部角色（默认路径）
 *
 * 原先每个角色一次请求（Promise.all(N 个)），实测 5 个在场角色 = 5 次请求，
 * 首字延迟 = max(所有推演)。合并为一次请求后：
 *   - 请求数 N → 1，首字延迟从 max(N) 降为 1 个往返
 *   - 顺带解决一致性问题：原先各角色互相不知道对方在想什么，
 *     一次调用里模型能统筹（谁在回避、谁在逼近）
 *
 * 每个角色的档案/情报差仍按角色隔离注入（inactive 角色不带对话情报），
 * 只是把 N 个 prompt 拼进一个请求。
 */
const BATCH_SYSTEM = `你是互动小说的角色推演引擎。下面有若干角色，请**各自独立**推演他们此刻的真实状态。

【关键约束】
- 每个角色只输出自己的那一份，不要让角色之间"商量"或互相引用
- 严格保持各角色的信息边界：某个角色若被标注"不在场"，他就不知道当前对话内容
- 各角色的性格、说话方式、好感度基线互不干扰
- 你必须为每一个角色都输出一条，顺序与输入一致

【输出格式】只输出一个 JSON 数组，不要任何其他文字、注释或 Markdown：
[
  {
    "name":"角色名（必须与输入完全一致）",
    "intent":"此刻想做什么（40字以内）",
    "mood":"表面情绪",
    "innerThought":"内心独白（20~60字）",
    "bodyLanguage":"身体语言",
    "subtext":"潜台词",
    "emotionalDirection":"warming|cooling|breaking|holding|shifting",
    "triggerContext":"触发点",
    "toward":"player/某角色名/none/self",
    "wantsInteraction":true/false,
    "affectionDelta":0
  }
]

【好感变化规则】（affectionDelta，范围 -100~100）
- 必须基于性格和处境，不是机械的"对方对你好就升"
- 害羞/傲娇/防御心重的角色：即使内心被打动，上升也极微小（0.01~0.5），甚至反向
- 重大事件才驱动大变化（舍身相救 +15~30，触及逆鳞 -20~40，日常闲聊 ±0~2）
- 好感越高越难涨：60 以上减半，80 以上再减半，95 以上几乎不动
- 好感可为负；负值时上升更容易

【互动管理】若某角色需要进入或离开当前场景，在数组之后另起一行输出：
___INTERACTION___ {"action":"pull_in|push_out","character_name":"角色名","narrative":"一句话描述如何出现/离开"}

自然一点。人不是时刻都在高潮——有时候只是累了，有时候在想晚饭吃什么。`;

/** 单个角色的推演资料 */
export interface SimCharacterInput {
  name: string;
  personality: string;
  deepPersonality?: string;
  role: string;
  status: string;
  goal?: string;
  relationship: string;
  interactionState: 'active' | 'inactive';
}

/** 把单个角色的资料渲染成批量 prompt 里的一段 */
function renderCharacterBlock(
  char: SimCharacterInput,
  idx: number,
  opts: {
    scene: string;
    events: string;
    activeList: string;
    prev?: { intent: string; mood: string };
    kbContext?: string;
    behaviorProfile?: string;
    dialogue?: string;
  }
): string {
  const lines: string[] = [`── 角色 ${idx + 1}：${char.name} ──`];
  lines.push(`性格：${char.personality}`);
  if (char.deepPersonality) lines.push(`真实性格：${char.deepPersonality}`);
  lines.push(`身份：${char.role} | 目标：${char.goal || '未知'}`);
  lines.push(`当前状态：${char.status}`);
  lines.push(`与玩家的关系：${char.relationship}`);
  if (opts.kbContext) lines.push(`原著信息：${opts.kbContext}`);
  if (opts.behaviorProfile) lines.push(`行为画像：${opts.behaviorProfile}`);
  lines.push(char.interactionState === 'active'
    ? '处境：与玩家互动中'
    : '处境：不在玩家视线内，在做自己的事（你不知道当前对话内容）');
  if (opts.dialogue) lines.push(`你看到的对话：\n${opts.dialogue}`);
  if (opts.prev) lines.push(`你上一轮的状态：意图:${opts.prev.intent}, 情绪:${opts.prev.mood}`);
  return lines.join('\n');
}

/**
 * 批量推演全部角色（一次 API 调用）
 */
export async function simulateCharactersBatch(
  config: ApiConfig,
  characters: SimCharacterInput[],
  scene: string,
  events: string,
  activeList: string,
  prevStates?: Record<string, { intent: string; mood: string }>,
  kbContexts?: Record<string, string>,
  behaviorProfiles?: Record<string, string>,
  dialogueByChar?: Record<string, string>
): Promise<{ actions: CharacterAction[]; interactionChanges: Array<{ action: string; character_name: string; narrative: string }> }> {
  if (characters.length === 0) return { actions: [], interactionChanges: [] };

  // 只有 1 个角色时走原路径（prompt 更聚焦，且省掉批量格式的开销）
  if (characters.length === 1) {
    const c = characters[0];
    const prev = prevStates?.[c.name];
    const mergedKb = [kbContexts?.[c.name], behaviorProfiles?.[c.name]].filter(Boolean).join('\n');
    const r = await simulateCharacter(
      config, c, scene, events, c.relationship, c.interactionState, activeList,
      prev ? `意图:${prev.intent}, 情绪:${prev.mood}` : undefined,
      mergedKb || undefined, dialogueByChar?.[c.name]
    );
    return { actions: r.action ? [r.action] : [], interactionChanges: r.toolCalls };
  }

  const blocks = characters.map((c, i) => renderCharacterBlock(c, i, {
    scene, events, activeList,
    prev: prevStates?.[c.name],
    kbContext: kbContexts?.[c.name],
    behaviorProfile: behaviorProfiles?.[c.name],
    dialogue: dialogueByChar?.[c.name],
  }));

  const userContent = [
    `## 此刻场景\n${scene}`,
    events ? `## 最近事件\n${events}` : '',
    `## 在场的人\n${activeList}`,
    '',
    '## 需要推演的角色',
    blocks.join('\n\n'),
    '',
    `请输出包含 ${characters.length} 条记录的 JSON 数组。`,
  ].filter(Boolean).join('\n');

  try {
    const raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      [
        { role: 'system' as const, content: BATCH_SYSTEM },
        { role: 'user' as const, content: userContent },
      ],
      // 每个角色约需 200 token，留 1.5 倍余量，设下限防止单角色时过小
      { maxTokens: Math.max(800, characters.length * 320), temperature: 0.9 }
    );

    const actions: CharacterAction[] = [];
    const interactionChanges: Array<{ action: string; character_name: string; narrative: string }> = [];

    // 解析 JSON 数组
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const name = String(item?.name || '').trim();
            // 只接受输入里出现过的角色名，防止模型编造
            const known = characters.find(c => c.name === name);
            if (!known) continue;
            actions.push({
              name,
              intent: item.intent || '',
              mood: item.mood || '平静',
              innerThought: item.innerThought || '',
              bodyLanguage: item.bodyLanguage || '',
              subtext: item.subtext || '',
              emotionalDirection: item.emotionalDirection || 'holding',
              triggerContext: item.triggerContext || '',
              toward: item.toward || 'none',
              wantsInteraction: !!item.wantsInteraction,
              affectionDelta: typeof item.affectionDelta === 'number' ? item.affectionDelta : 0,
            });
          }
        }
      } catch { /* 数组损坏，走下面的兜底 */ }
    }

    // 兜底：模型没输出合法数组时，退回逐角色请求（至少保证不丢整轮推演）
    if (actions.length === 0) {
      console.warn('[SIM] batch parse failed, falling back to per-character');
      return simulateCharacters(config, characters, scene, events, activeList, prevStates, kbContexts, behaviorProfiles, dialogueByChar);
    }

    // 缺失的角色补一条空动作（保持与输入等长，下游按名字取值）
    const got = new Set(actions.map(a => a.name));
    for (const c of characters) {
      if (!got.has(c.name)) {
        actions.push({
          name: c.name, intent: '', mood: '平静', innerThought: '', bodyLanguage: '',
          subtext: '', emotionalDirection: 'holding', triggerContext: '', toward: 'none',
          wantsInteraction: false, affectionDelta: 0,
        });
      }
    }

    // 互动变更标记
    const interRe = /___INTERACTION___\s*(\{[^\n]*\})/g;
    let m: RegExpExecArray | null;
    while ((m = interRe.exec(raw)) !== null) {
      try {
        const obj = JSON.parse(m[1]);
        const nm = String(obj.character_name || '');
        if (characters.some(c => c.name === nm)) {
          interactionChanges.push({
            action: obj.action || '',
            character_name: nm,
            narrative: obj.narrative || '',
          });
        }
      } catch { /* 跳过坏行 */ }
    }

    return { actions, interactionChanges };
  } catch (e) {
    console.warn('[SIM] batch failed, falling back to per-character: ' + (e instanceof Error ? e.message : String(e)));
    return simulateCharacters(config, characters, scene, events, activeList, prevStates, kbContexts, behaviorProfiles, dialogueByChar);
  }
}

/**
 * 并行模拟：每个角色独立输出意图（不编排行动，留给主AI）
 *
 * 注意：这是 N 次请求的实现，仅作为 simulateCharactersBatch 的兜底保留。
 * 正常路径请用 simulateCharactersBatch。
 */
export async function simulateCharacters(
  config: ApiConfig,
  characters: Array<{
    name: string; personality: string; deepPersonality?: string; role: string; status: string; goal?: string;
    relationship: string; interactionState: 'active' | 'inactive';
  }>,
  scene: string,
  events: string,
  activeList: string,
  prevStates?: Record<string,{intent:string;mood:string}>,
  kbContexts?: Record<string, string>,
  behaviorProfiles?: Record<string, string>,
  dialogueByChar?: Record<string, string>
): Promise<{ actions: CharacterAction[]; interactionChanges: Array<{ action: string; character_name: string; narrative: string }> }> {
  const results = await Promise.all(characters.map(char => {
    const prev = prevStates?.[char.name];
    const prevStr = prev ? `意图:${prev.intent}, 情绪:${prev.mood}` : undefined;
    const kbCtx = kbContexts?.[char.name];
    const bpText = behaviorProfiles?.[char.name];
    const mergedKb = [kbCtx, bpText].filter(Boolean).join('\n');
    // 情报差隔离：每角色只注入其可见的对话（inactive 角色无对话情报）
    return simulateCharacter(config, char, scene, events, char.relationship, char.interactionState, activeList, prevStr, mergedKb || undefined, dialogueByChar?.[char.name]);
  }));
  const actions: CharacterAction[] = [];
  const changes: Array<{ action: string; character_name: string; narrative: string }> = [];
  for (const r of results) {
    if (r.action) actions.push(r.action);
    changes.push(...r.toolCalls);
  }
  return { actions, interactionChanges: changes };
}
