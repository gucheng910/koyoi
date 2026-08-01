// ============================================================
//  追加上传服务
//  为已分析的世界追加新章节文件
//  只分析新增章节，合并到已有知识库
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import { detectChapters } from './chapterSplitter';
import { assembleChunks } from './chunkAssembler';
import { analyzeAllChunks } from './chapterAnalyzer';
import { buildKnowledgeBase, saveKnowledgeBase, loadKnowledgeBase, invalidateKnowledgeBaseCache } from './knowledgeBase';
import { synthesizeTimeline, applySynthesis } from './timelineSynthesizer';
import { analyzeStyleFeatures } from './styleAnalyzer';
import { getNovelMeta, updateNovelMeta, saveChapter } from './novelStorage';
import type { ApiConfig, KnowledgeBase, ChapterMeta, FanficWorldCard } from '../types';

/** 合并角色列表：按名字去重，保留旧数据，追加新 traits 和台词 */
function mergeAppend(existing: any[], incoming: any[]): any[] {
  const merged = [...existing];
  for (const inc of incoming) {
    const idx = merged.findIndex((e: any) => e.name === inc.name);
    if (idx >= 0) {
      // 已存在：合并 traits 和台词
      const exist = merged[idx];
      for (const t of (inc.traits || [])) {
        if (!exist.traits.includes(t)) exist.traits.push(t);
      }
      for (const s of (inc.speechSamples || [])) {
        const dup = exist.speechSamples?.find((es: any) => es.quote === s.quote);
        if (!dup) {
          if (!exist.speechSamples) exist.speechSamples = [];
          exist.speechSamples.push(s);
        }
      }
      // 更新出场范围
      if (inc.firstAppear < exist.firstAppear) exist.firstAppear = inc.firstAppear;
      if (inc.lastAppear > exist.lastAppear) exist.lastAppear = inc.lastAppear;
    } else {
      merged.push(inc);
    }
  }
  return merged;
}

export interface AppendResult {
  /** 合并后的章节总数 */
  chapterCount: number;
  /** 新增分析的角色数 */
  newCharacters: number;
  /** 新增的事件数 */
  newEvents: number;
}

/**
 * 向已分析世界追加上传新文件
 *
 * @param config API 配置
 * @param worldId 世界 ID
 * @param appendContent 新文件的解码后文本
 * @param existingKB 已有知识库（可不传，自动加载）
 * @param onProgress 进度回调
 */
export async function appendToWorld(
  config: ApiConfig,
  worldId: string,
  appendContent: string,
  existingKB?: KnowledgeBase,
  onProgress?: (msg: string) => void
): Promise<AppendResult> {
  // 1. 加载已有数据
  onProgress?.('正在加载已有数据...');
  const meta = await getNovelMeta(worldId);
  if (!meta) throw new Error('未找到小说元数据');

  const kb = existingKB || await loadKnowledgeBase(worldId);
  if (!kb) throw new Error('未找到知识库数据');

  const oldChapterCount = meta.chapterCount;

  // 2. 分章并合并
  onProgress?.('正在扫描新章节...');
  const newChapters = detectChapters(appendContent);
  if (newChapters.length === 0) throw new Error('未检测到新章节');

  // 计算偏移量：新章节跟在已有章节后面
  // 需要知道已有章节占用的总字符数
  let totalExistingChars = 0;
  for (const ch of meta.chapters) {
    totalExistingChars = Math.max(totalExistingChars, ch.endChar);
  }

  // 偏移新章节的 startChar/endChar
  const offset = totalExistingChars + 1; // +1 用于换行分隔
  const shiftedChapters = newChapters.map((c, i) => ({
    ...c,
    index: oldChapterCount + i,
    startChar: c.startChar + offset,
    endChar: c.endChar + offset,
  }));

  // 合并章节列表
  const mergedChapters = [...meta.chapters, ...shiftedChapters];

  // 3. 保存新章节文件
  onProgress?.('正在保存新章节...');
  for (let i = 0; i < shiftedChapters.length; i++) {
    const ch = shiftedChapters[i];
    const chText = appendContent.slice(
      newChapters[i].startChar,
      newChapters[i].endChar
    );
    if (chText.trim().length > 0) {
      await saveChapter(worldId, ch.index, chText);
    }
  }

  // 4. 更新元数据
  const updatedMeta = {
    ...meta,
    chapters: mergedChapters,
    chapterCount: mergedChapters.length,
    totalChars: meta.totalChars + appendContent.length + 1,
  };
  await updateNovelMeta(worldId, updatedMeta as any);

  // 5. 仅分析新增的章节块
  onProgress?.('正在分析新增章节...');
  const newOnlyChapters = shiftedChapters.map(c => ({
    startChar: 0, // 不用于块组装，仅占位
    endChar: c.endChar - c.startChar,
    ...c,
  }));
  const newChunks = assembleChunks(shiftedChapters);
  if (newChunks.length === 0) throw new Error('新增章节不足以形成分析块');

  let analyzedCount = 0;
  const newResults = await analyzeAllChunks(
    config,
    worldId,
    newOnlyChapters.map(c => ({ startChar: 0, endChar: c.charCount })),
    newChunks,
    (current, total) => {
      onProgress?.(`分析中... ${current}/${total} 块`);
    }
  );

  if (newResults.length === 0) {
    return { chapterCount: mergedChapters.length, newCharacters: 0, newEvents: 0 };
  }

  // 6. 合并到已有知识库
  onProgress?.('正在合并到知识库...');
  const oldCharCount = kb.characters.length;
  const oldEventCount = kb.globalTimeline?.length || 0;
  const oldPlotCount = kb.plot?.length || 0;

  // 构建新增部分的知识库
  const newKB = buildKnowledgeBase(worldId, mergedChapters.length, newResults);

  // 手动合并：角色去重、事件追加、风格追加
  const mergedCharacters = mergeAppend(kb.characters, newKB.characters);
  const mergedPlot = [...kb.plot, ...newKB.plot.filter((p: any) => !kb.plot.some((op: any) => op.summary === p.summary))];
  const mergedRelations = [...kb.relations, ...newKB.relations.filter((r: any) => !kb.relations.some((or: any) => or.from === r.from && or.to === r.to))];
  const mergedStyle = [...kb.styleProfile, ...newKB.styleProfile];

  // 重新全局合成（包含新事件）
  onProgress?.('正在重新合成时间线...');
  const mergedKB: KnowledgeBase = {
    ...kb,
    chapterCount: mergedChapters.length,
    characters: mergedCharacters,
    plot: mergedPlot,
    relations: mergedRelations,
    styleProfile: mergedStyle,
    worldSettings: {
      ...kb.worldSettings,
      // 合并地理位置
      geography: [kb.worldSettings.geography, newKB.worldSettings.geography].filter(Boolean).join('\n'),
    },
    globalTimeline: mergedPlot.map((p: any) => ({
      chapter: p.chapter,
      time: '',
      event: p.summary,
      involvedCharacters: [],
    })),
    worldRuleClues: [...new Set([...(kb.worldRuleClues || []), ...(newKB.worldRuleClues || [])])].slice(0, 40),
  };
  try {
    const synth = await synthesizeTimeline(config, worldId, mergedKB);
    if (synth) {
      const applied = applySynthesis(mergedKB, synth);
      // update mergedKB with synthesis results
      mergedKB = { ...mergedKB, ...applied };
    }
  } catch { /* 合成失败不影响追加 */ }

  // 更新风格特征
  try {
    const newStyle = await analyzeStyleFeatures(config, mergedKB);
    if (newStyle && kb.styleFeatures) {
      mergedKB.styleFeatures = kb.styleFeatures + '\n' + newStyle;
    }
  } catch {}

  // 保存
  await saveKnowledgeBase(mergedKB);
  invalidateKnowledgeBaseCache(worldId);

  return {
    chapterCount: mergedChapters.length,
    newCharacters: mergedKB.characters.length - oldCharCount,
    newEvents: (mergedKB.globalTimeline?.length || 0) - oldEventCount,
  };
}
