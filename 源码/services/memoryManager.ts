// ============================================================
//  HypaMemory 风格记忆管理器
//  三池检索 + Token 预算 + 再摘要
// ============================================================

import { chatCompletionSync } from '../api/deepseek';

export interface MemoryItem {
  content: string;
  importance: number;    // 1-5
  type: 'core' | 'bedrock';
  weight: number;
  lastActivated: number; // timestamp
  reSummarized?: boolean;
}

/**
 * 三池检索：根据当前消息从记忆库中选最相关的条目
 * 
 * 近期池(40%)：最近激活的 N 条
 * 关键词池(40%)：与当前消息有共同关键词的
 * 重要池(20%)：importance >= 4 的 bedrock 记忆
 * 
 * @param memories 全部记忆
 * @param recentText 最近的对话文本
 * @param maxTokens 最大输出 token 数
 */
export function selectMemoriesForPrompt(
  memories: MemoryItem[],
  recentText: string,
  maxTokens: number = 600
): string {
  if (!memories || memories.length === 0) return '';

  // 提取当前话题的关键词
  const topicWords = extractKeywords(recentText);

  // 池 1: 近期池（最近激活的，按时间倒序）
  const recentPool = [...memories]
    .sort((a, b) => b.lastActivated - a.lastActivated)
    .slice(0, 5);

  // 池 2: 关键词池（与当前话题相关的）
  const keywordPool = memories
    .filter(m => topicWords.some(w => m.content.includes(w)))
    .slice(0, 5);

  // 池 3: 重要池（bedrock 且高重要性）
  const importantPool = memories
    .filter(m => m.type === 'bedrock' && m.importance >= 4)
    .slice(0, 3);

  // 去重合并（以 content 为 key）
  const seen = new Set<string>();
  const selected: MemoryItem[] = [];
  for (const m of [...importantPool, ...keywordPool, ...recentPool]) {
    const key = m.content.slice(0, 30);
    if (!seen.has(key)) { seen.add(key); selected.push(m); }
  }

  // Token 预算管理：按重要性排序，截断到预算
  selected.sort((a, b) => b.importance - a.importance);
  let chars = 0;
  const budgeted: string[] = [];
  const charLimit = maxTokens * 1.5; // 中文约 1.5 字符/token

  for (const m of selected) {
    if (chars + m.content.length > charLimit) break;
    budgeted.push(m.type === 'bedrock' ? `💎 ${m.content}` : `· ${m.content}`);
    chars += m.content.length;
  }

  // 标记激活时间
  const now = Date.now();
  for (const m of selected) m.lastActivated = now;

  return budgeted.length > 0
    ? '[关键记忆]\n' + budgeted.join('\n')
    : '';
}

/**
 * 记忆再摘要：当记忆超过阈值时，用 Flash 压缩旧记忆
 */
export async function reSummarizeMemories(
  apiKey: string,
  baseUrl: string,
  model: string,
  memories: MemoryItem[]
): Promise<MemoryItem[]> {
  if (memories.length <= 20) return memories;

  try {
    const old = memories
      .filter(m => m.type === 'core' && m.importance <= 3 && !m.reSummarized)
      .sort((a, b) => a.lastActivated - b.lastActivated)
      .slice(0, 10);

    if (old.length < 5) return memories;

    const prompt = [
      { role: 'system' as const, content: '将以下 10 条记忆压缩为 2-3 条。保留核心信息，合并相关事件。直接输出压缩后的记忆，每行一条。' },
      { role: 'user' as const, content: old.map((m, i) => `${i + 1}. ${m.content}`).join('\n') },
    ];
    const raw = await chatCompletionSync(
      { id: '', label: '', baseUrl, apiKey, model: model || 'deepseek-v4-flash', thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 0.3, maxTokens: 300, safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: false },
      prompt, { maxTokens: 300, temperature: 0.3 }
    );

    const lines = raw.split('\n').filter((l: string) => l.trim().length > 10).slice(0, 3);
    const rewritten: MemoryItem[] = lines.map((l: string) => ({
      content: l.replace(/^\d+[\.\、\s]+/, '').trim(),
      importance: 2,
      type: 'core' as const,
      weight: 2,
      lastActivated: Date.now(),
      reSummarized: true,
    }));

    // 替换旧记忆
    const oldContents = new Set(old.map(m => m.content.slice(0, 30)));
    const kept = memories.filter(m => !oldContents.has(m.content.slice(0, 30)));
    return [...kept, ...rewritten].slice(-30);
  } catch {
    return memories;
  }
}

function extractKeywords(text: string): string[] {
  // 按标点切分后取有语义的整词（2~6 字），避免滑动窗口重叠噪声
  const rawSegments = text.split(/[，。！？、；：""''（）\[\]【】\s]+/);
  const words = rawSegments.filter(s => /^[\u4e00-\u9fff]{2,6}$/.test(s));
  // 去重后取前 10 个
  return [...new Set(words)].slice(0, 10);
}
