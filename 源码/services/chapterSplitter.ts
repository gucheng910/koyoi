// ============================================================
//  章节分割器
//  纯本地处理，零 API 成本
//  识别中文小说的章节标记并切分为独立章节
// ============================================================

import type { ChapterMeta } from '../types';

const CHAPTER_PATTERNS = [
  // === 标准中文 ===
  /^第[零一二三四五六七八九十百千\d]+[章节回]/gm,                     // 第一章/第1章/第一百回
  /^第\d+[章节回]/gm,                                                  // 第1章（纯数字兜底）

  // === 卷+章组合 ===
  /^第[零一二三四五六七八九十百千\d]+卷\s+第?[零一二三四五六七八九十百千\d]*[章节]/gm,  // 第一卷 第一章/第一卷 1章
  /^第[零一二三四五六七八九十百千\d]+卷\s+第?\d+[章节]/gm,           // 第一卷 第1章
  /^[Vv]ol(?:ume)?\.?\s*\d+\s+[Cc]h(?:apter)?\.?\s*\d+/gm,       // Vol.1 Ch.1

  // === 多卷标记 ===
  /^第[零一二三四五六七八九十百千\d]+[卷部篇]/gm,                       // 第一卷/第一部（辅助）
  /^[Pp]art\s*\d+/gm,                                                // Part 1

  // === 连续数字标题（小说常用编号格式）===
  /^[零一二三四五六七八九十百千]{1,3}[、，\s]+\S/gm,                    // 一、标题 / 十一、标题
  /^\d{1,4}[、，\.\s]+\S{2,}/gm,                                      // 1、标题 / 01.标题

  // === 番外/特殊章节 ===
  /^[序楔][章言子]/gm,                                                  // 序章/楔子
  /^(?:尾声|终章|番外|后记|引子|开篇|幕间|间章|插曲|外传)/gm,            // 各种特殊章节
  /^[Pp]rologue|[Ee]pilogue|[Ii]nterlude|[Ee]xtra/gm,                 // 英文特殊章节

  // === 日轻/Manga 格式 ===
  /^第?\d+[话節]/gm,                                                    // 1话 / 第1话 / 第1節
  /^[Ee]pisode\s*\d+/gm,                                               // Episode 1

  // === 分隔线标记 ===
  /^[=＝\-\*\#]{3,}\s*\d*\s*[=＝\-\*\#]{3,}/gm,                    // === 1 ===

  // === 上中下篇 ===
  /^[上中下][篇集]/gm,                                            // 上篇/中集
];

/**
 * 从小说文本中检测章节边界
 * 返回章节元数据数组
 */
export function detectChapters(text: string): ChapterMeta[] {
  if (!text || text.length < 10) return [];

  // 收集所有可能的章节标记位置
  interface Marker {
    pos: number;
    title: string;
    pattern: 'numbered' | 'special' | 'classic';
  }

  const markers: Marker[] = [];

  for (const pattern of CHAPTER_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
      const lineEnd = text.indexOf('\n', m.index);
      const title = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim().slice(0, 40);
      const exists = markers.some(ex => Math.abs(ex.pos - lineStart) < 5);
      if (!exists && title.length >= 2) {
        const isClassic = /回$/.test(m[0]);
        const isSpecial = /^[序楔终][章言子]|^尾声|^番外|^后记|^引子|^开篇/.test(m[0]);
        markers.push({ pos: lineStart, title, pattern: isClassic ? 'classic' : isSpecial ? 'special' : 'numbered' });
      }
    }
  }

  // 按位置排序
  markers.sort((a, b) => a.pos - b.pos);

  if (markers.length === 0) {
    return fallbackSplit(text);
  }

  // 过滤：只保留前面有空行或是文件开头的标记
  const validMarkers = markers.filter(m => {
    if (m.pos === 0) return true;
    const before = text.slice(Math.max(0, m.pos - 5), m.pos);
    // 宽松检测：前5字内是否有换行(\\n\\r)或文件头
    for (let j = before.length - 1; j >= 0; j--) {
      if (before[j] === '\n' || before[j] === '\r') return true;
      if (j === 0 && m.pos <= 10) return true;
    }
    return false;
  });

  if (validMarkers.length === 0) return fallbackSplit(text);

  const chapters: ChapterMeta[] = [];

  for (let i = 0; i < validMarkers.length; i++) {
    const start = validMarkers[i].pos;
    // 章节结束位置：下一个章节标记的开始，或文本末尾
    const end = i + 1 < validMarkers.length
      ? markers[i + 1].pos
      : text.length;

    if (end - start < 100) continue; // 过滤极短节（<100字通常不是正文）
    // 短章节警告但保留
    const isVeryShort = end - start < 300;

    let title = validMarkers[i].title;
    // 卷号前缀：在标记前 100 字内找「第X卷」
    const ctxStart = Math.max(0, start - 200);
    const ctx = text.slice(ctxStart, start);
    const volMatch = ctx.match(/(第[零一二三四五六七八九十百千\d]+[卷部]|Volume\s*\d+)/);
    if (volMatch && !title.includes(volMatch[0])) title = volMatch[0] + ' ' + title;
    const isPrologue = /^[序楔][章言子]|^引子|^开篇/.test(title);
    const isEpilogue = /^终章|^尾声|^后记/.test(title);
    const isExtra = /^番外/.test(title);

    chapters.push({
      index: chapters.length,
      title,
      startChar: start,
      endChar: end,
      charCount: end - start,
      isSpecial: isPrologue || isEpilogue || isExtra,
      specialType: isPrologue ? 'prologue'
        : isEpilogue ? 'epilogue'
        : isExtra ? 'extra'
        : undefined,
    });
  }

  // 如果标记前有内容（序章/引子前的正文），作为特殊序章
  if (chapters.length > 0 && chapters[0].startChar > 100) {
    const prelude = text.slice(0, chapters[0].startChar).trim();
    if (prelude.length > 200) {
      chapters.unshift({
        index: 0, title: '引子/前言', startChar: 0, endChar: chapters[0].startChar,
        charCount: prelude.length, isSpecial: true, specialType: 'prologue',
      });
      chapters.forEach((c, i) => { c.index = i; });
    }
  }

  return chapters;
}

/**
 * 回退方案：按固定长度切分
 * 用于无标准章节标记的小说
 */
function fallbackSplit(text: string): ChapterMeta[] {
  // 尝试按双换行分段（比固定 2 万字更智能）
  const segments = text.split(/\n{3,}/);
  if (segments.length >= 3) {
    const chapters: ChapterMeta[] = [];
    let pos = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].trim();
      if (seg.length < 500) { pos += segments[i].length + 3; continue; }
      const end = pos + seg.length;
      chapters.push({
        index: chapters.length,
        title: '第' + (chapters.length + 1) + '段',
        startChar: pos,
        endChar: end,
        charCount: seg.length,
        isSpecial: false,
      });
      pos = end + 3;
    }
    if (chapters.length >= 2) return chapters;
  }

  // 最终还是按 2 万字固定切
  const chapters: ChapterMeta[] = [];
  let pos = 0;
  let idx = 0;
  const CHUNK = 20000;

  while (pos < text.length) {
    let end = Math.min(pos + CHUNK, text.length);
    // 回退到最近的段落边界
    if (end < text.length) {
      const breakPos = text.lastIndexOf('\n\n', end);
      if (breakPos > pos + CHUNK * 0.7) end = breakPos;
    }
    const seg = text.slice(pos, end);
    chapters.push({
      index: idx,
      title: `第${idx + 1}段`,
      startChar: pos,
      endChar: end,
      charCount: seg.length,
      isSpecial: false,
    });
    pos = end;
    idx++;
  }

  return chapters;
}

/**
 * 获取指定章节的文本内容
 */
export function getChapterText(text: string, chapter: ChapterMeta): string {
  return text.slice(chapter.startChar, chapter.endChar).trim();
}

/**
 * 获取多章合并的文本（用于分块分析）
 */
export function getChapterRange(
  text: string,
  chapters: ChapterMeta[],
  startIdx: number,
  endIdx: number
): string {
  if (startIdx < 0 || endIdx >= chapters.length || startIdx > endIdx) return '';
  return text.slice(
    chapters[startIdx].startChar,
    chapters[endIdx].endChar
  ).trim();
}

/**
 * 估算章节字数的简单分析
 */
export function getChapterStats(chapters: ChapterMeta[]): {
  total: number;
  min: number;
  max: number;
  avg: number;
} {
  if (chapters.length === 0) return { total: 0, min: 0, max: 0, avg: 0 };
  const lengths = chapters.map(c => c.charCount);
  return {
    total: lengths.reduce((a, b) => a + b, 0),
    min: Math.min(...lengths),
    max: Math.max(...lengths),
    avg: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
  };
}
