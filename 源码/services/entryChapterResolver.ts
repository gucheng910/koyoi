// ============================================================
//  穿越入口章节解析器
//  将用户输入的时间点描述（"第三章"、"开篇"、"高潮"等）
//  解析为具体的章节序号（0-based）
// ============================================================

export interface EntryChapterInput {
  /** 用户输入的时间点文本 */
  timePoint: string;
  /** 总章节数 */
  totalChapters: number;
  /** 时间线事件列表（用于模糊匹配） */
  events?: Array<{ chapter?: number; description: string; event?: string }>;
}

/**
 * 解析穿越入口章节
 * 优先级：精确章号 > 关键词 > 数字提取 > 模糊事件匹配
 * 返回 0-based 章节序号
 */
export function resolveEntryChapter(input: EntryChapterInput): number {
  const { timePoint, totalChapters, events = [] } = input;
  const totalCh = totalChapters || 100;
  const tp = timePoint.trim();

  if (!tp) return 0;

  // 1. 精确章号匹配："第X章"
  const chMatch = tp.match(/第(\d+)章/);
  if (chMatch) {
    return clamp(parseInt(chMatch[1]) - 1, 0, totalCh - 1);
  }

  // 2. 关键词阶段匹配
  const stageMap: Array<{ keywords: string[]; ratio: number }> = [
    { keywords: ['开篇', '开始', '开头', '初始', '序章', '引子', '楔子'], ratio: 0.02 },
    { keywords: ['发展', '中期', '展开', '中段'], ratio: 0.25 },
    { keywords: ['高潮', '关键', '转折', '决战', '巅峰'], ratio: 0.55 },
    { keywords: ['结局', '尾声', '末尾', '最后', '终章', '结尾'], ratio: 0.95 },
  ];

  for (const stage of stageMap) {
    if (stage.keywords.some(k => tp.includes(k))) {
      return clamp(Math.floor(totalCh * stage.ratio), 0, totalCh - 1);
    }
  }

  // 3. 纯数字提取
  const numMatch = tp.match(/\d+/);
  if (numMatch) {
    return clamp(parseInt(numMatch[0]) - 1, 0, totalCh - 1);
  }

  // 4. 模糊事件匹配：在时间线事件描述中搜索 bigram 重合
  const allEvents = events.map((e, i) => ({
    chapter: e.chapter ?? i,
    description: e.description || e.event || '',
  }));

  let bestChapter = 0;
  let bestScore = 0;

  for (const e of allEvents) {
    let score = 0;
    for (let i = 0; i < tp.length - 1; i++) {
      if (e.description.includes(tp.slice(i, i + 2))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestChapter = e.chapter;
    }
  }

  return bestScore > 0
    ? clamp(bestChapter, 0, totalCh - 1)
    : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
