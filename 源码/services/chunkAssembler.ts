// ============================================================
//  分块组合器
//  将已分割的章节智能合并为 AI 可处理的分析块
//
//  ⚠️ 这里的上限必须与提示词预算一致，两处共用一个常量。
//
//  chapterAnalyzer 构造提示词时是 `chunkText.slice(0, ANALYSIS_CHUNK_MAX_CHARS)`，
//  所以组块一旦超过这个数，超出部分会被**静默丢弃**，既不报错也不留痕。
//
//  历史 bug（v2.14.0 引入，存活到 v2.20.0）：这里曾是
//      TARGET_CHARS = 60000 / MAX_CHARS = 100000
//  且注释写着「上限（约 65k token，远低于 DeepSeek 1M 上下文）」——
//  也就是说，设计时是假定**整块都会进模型**的。但提示词只切 28000 字。
//  实测《斗罗大陆》（689 章 → 55 块）：55/55 块全部超限，
//  300 章（43.5%）从未进入模型。因为丢的永远是每块**尾部**，
//  损失呈「每 ~13 章一个空洞」的周期性分布——对"梳理全书角色弧线与
//  全局时间线"这个功能来说，比随机丢 43% 更有害：synthesizeTimeline
//  不会意识到缺数据，它会拿半截剧情自信地外推。
//
//  修法：组块阶段就保证不超限，让提示词里的 slice 退化为纯保险丝。
// ============================================================

import type { ChapterMeta } from '../types';
import { getChapterRange } from './chapterSplitter';

/**
 * 单块正文的硬上限（字符）。
 * 必须与 chapterAnalyzer 的提示词截断长度一致——改这里就等于同时改两边。
 */
export const ANALYSIS_CHUNK_MAX_CHARS = 28000;

const TARGET_CHARS = ANALYSIS_CHUNK_MAX_CHARS;   // 目标每块字数
const MAX_CHARS = ANALYSIS_CHUNK_MAX_CHARS;      // 硬上限

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
      const nextChars = chapters[end].charCount || 0;

      // 收口判断必须在**加入之前**：若加上这一章会超过硬上限，就到此为止。
      // 原实现是「先加再判断」，于是块能超出一整章（本书最长章 9225 字），
      // MAX_CHARS 形同虚设，提示词里的 slice 照切不误。
      // end > i 保证每块至少保留一章——单章本身超长时无法再切分，
      // 这种情况由 chapterAnalyzer 的截断告警兜底。
      if (end > i && charSum + nextChars > MAX_CHARS) break;

      charSum += nextChars;
      end++;

      if (charSum >= TARGET_CHARS && end < chapters.length - 1) break;
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
