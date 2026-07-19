// ============================================================
//  章节重分析
//  重新分析指定章节范围，增量更新知识库
// ============================================================

import { analyzeChunk } from './chapterAnalyzer';
import { loadKnowledgeBase, saveKnowledgeBase, buildKnowledgeBase } from './knowledgeBase';
import { getNovelMeta, getChapter } from './novelStorage';
import type { ApiConfig, ChapterAnalyzeResult } from '../types';

export async function reanalyzeChapters(
  config: ApiConfig,
  worldId: string,
  startChapter: number,
  endChapter: number,
  onProgress: (msg: string) => void
): Promise<boolean> {
  try {
    onProgress('加载章节信息...');
    const meta = await getNovelMeta(worldId);
    if (!meta) return false;

    const chapters = meta.chapters;
    const chapterCount = chapters.length;

    // 创建要重分析的块（每个章节单独分析以确保精度）
    const results: ChapterAnalyzeResult[] = [];
    for (let ch = startChapter; ch <= endChapter && ch < chapterCount; ch++) {
      onProgress(`重分析第${ch+1}/${chapterCount}章...`);

      const result = await analyzeChunk(config, worldId, {
        chunkIndex: ch,
        chapterStart: ch,
        chapterEnd: ch,
        charCount: chapters[ch].charCount,
        chapterLabels: [chapters[ch].title],
        isLastChunk: ch === chapterCount - 1,
      });
      if (result) results.push(result);
    }

    if (results.length === 0) return false;

    // 加载现有知识库，合并新结果
    onProgress('更新知识库...');
    const existingKB = await loadKnowledgeBase(worldId);
    let allResults = results;
    if (existingKB) {
      // 保留未重分析章节的旧数据（简化：用新数据覆盖对应章节范围）
      const newKB = buildKnowledgeBase(worldId, chapterCount, results);
      // 合并：新角色/事件覆盖旧数据，其余保留
      const merged = {
        ...existingKB,
        characters: mergeCharLists(existingKB.characters, newKB.characters),
        plot: mergePlotLists(existingKB.plot, newKB.plot, startChapter, endChapter),
        relations: mergeRelLists(existingKB.relations, newKB.relations),
      };
      await saveKnowledgeBase(merged);
    } else {
      const kb = buildKnowledgeBase(worldId, chapterCount, results);
      await saveKnowledgeBase(kb);
    }

    return true;
  } catch {
    return false;
  }
}

function mergeCharLists(old: any[], updated: any[]): any[] {
  const map = new Map<string, any>();
  for (const c of [...old, ...updated]) {
    const existing = map.get(c.name);
    if (existing) {
      existing.speechSamples = [...existing.speechSamples, ...c.speechSamples].filter(
        (s: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.quote === s.quote) === i
      );
      if (c.firstAppear < existing.firstAppear) existing.firstAppear = c.firstAppear;
      if (c.lastAppear > existing.lastAppear) existing.lastAppear = c.lastAppear;
    } else {
      map.set(c.name, { ...c });
    }
  }
  return Array.from(map.values());
}

function mergePlotLists(old: any[], updated: any[], startCh: number, endCh: number): any[] {
  const filtered = old.filter((p: any) => p.chapter < startCh || p.chapter > endCh);
  return [...filtered, ...updated].sort((a, b) => a.chapter - b.chapter);
}

function mergeRelLists(old: any[], updated: any[]): any[] {
  const map = new Map<string, any>();
  for (const r of [...old, ...updated]) {
    const key = [r.from, r.to].sort().join('↔');
    const existing = map.get(key);
    if (existing) {
      existing.changes = [...existing.changes, ...r.changes].filter(
        (c: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.chapter === c.chapter) === i
      );
    } else {
      map.set(key, { ...r });
    }
  }
  return Array.from(map.values());
}
