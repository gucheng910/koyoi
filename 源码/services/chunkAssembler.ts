// ============================================================
//  分块组合器
//  将已分割的章节智能合并为 AI 可处理的分析块
//  每块 2~3 章，总量控制在 15k~25k 字
// ============================================================

import type { ChapterMeta } from '../types';
import { getChapterRange } from './chapterSplitter';

const TARGET_CHARS = 60000;   // 目标每块字数
const MIN_CHARS = 20000;      // 最小块
const MAX_CHARS = 100000;     // 上限（约 65k token，远低于 DeepSeek 1M 上下文）

export interface AnalysisChunk {
  chunkIndex: number;
  chapterStart: number;       // 起始章序号（0-based）
  chapterEnd: number;         // 结束章序号（含）
  charCount: number;
  chapterLabels: string[];    // 章节标题列表
  isLastChunk: boolean;
}

/**
 * 将章节列表组装为分析块
 */
export function assembleChunks(chapters: ChapterMeta[]): AnalysisChunk[] {
  if (chapters.length === 0) return [];

  const chunks: AnalysisChunk[] = [];
  let chunkIndex = 0;
  let i = 0;

  while (i < chapters.length) {
    let charSum = 0;
    let end = i;

    while (end < chapters.length) {
      charSum += chapters[end].charCount || 0;
      if (charSum >= TARGET_CHARS && end < chapters.length - 1) break;
      if (charSum > MAX_CHARS && end > i) {
        charSum -= chapters[end].charCount;
        end--;
        break;
      }
      end++;
    }

    // 未推进 end（单章触发 break 但未到 MAX）→ 强制推进
    if (end === i) {
      end = i + 1;
    }

    const chEnd = Math.min(end, chapters.length) - 1;

    chunks.push({
      chunkIndex,
      chapterStart: i,
      chapterEnd: chEnd,
      charCount: chapters.slice(i, chEnd + 1).reduce((s, c) => s + (c.charCount || 0), 0),
      chapterLabels: chapters.slice(i, chEnd + 1).map(c => c.title),
      isLastChunk: chEnd >= chapters.length - 1,
    });

    i = chEnd + 1;
    chunkIndex++;
  }

  return chunks;
}

/**
 * 从原始文本中提取某块的完整内容
 */
export function getChunkText(
  fullText: string,
  chapters: ChapterMeta[],
  chunk: AnalysisChunk
): string {
  return getChapterRange(fullText, chapters, chunk.chapterStart, chunk.chapterEnd);
}

/**
 * 格式化块信息用于显示
 */
export function formatChunkInfo(chunk: AnalysisChunk): string {
  const range = chunk.chapterStart === chunk.chapterEnd
    ? `第${chunk.chapterStart + 1}章`
    : `第${chunk.chapterStart + 1}~${chunk.chapterEnd + 1}章`;
  return `${range}（${(chunk.charCount / 1000).toFixed(1)}k字）`;
}
