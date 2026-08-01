// ============================================================
//  知识库
//  去重合并各块的提取结果，按章节索引
//  持久化到 FileSystem
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import type { ChapterAnalyzeResult, KnowledgeBase } from '../types';
import { getNovelDir } from './novelStorage';

/**
 * 角色去重合并：按名字 + 别名匹配
 */
function mergeCharacters(allResults: ChapterAnalyzeResult[]): KnowledgeBase['characters'] {
  const merged: KnowledgeBase['characters'] = [];

  for (const result of allResults) {
    for (const ch of result.characters) {
      // 查找是否已存在（按名字完全匹配 或 别名重叠）
      const existing = merged.find(m =>
        m.name === ch.name ||
        ch.aliases.some(a => m.name === a || m.aliases.includes(a))
      );

      if (existing) {
        // 合并别名
        for (const a of ch.aliases) {
          if (!existing.aliases.includes(a) && a !== existing.name) {
            existing.aliases.push(a);
          }
        }
        // 合并台词样本
        for (const s of ch.speechSamples) {
          if (!existing.speechSamples.some(es => es.quote === s.quote)) {
            existing.speechSamples.push(s);
          }
        }
        existing.speechSamples.sort((a, b) => a.chapter - b.chapter);
        // 合并 traits（去重）
        for (const t of ch.traits) {
          if (!existing.traits.includes(t)) existing.traits.push(t);
        }
        // 合并深层性格
        for (const t of (ch as any).deepTraits || []) {
          if (!(existing as any).deepTraits) (existing as any).deepTraits = [];
          if (!(existing as any).deepTraits.includes(t)) (existing as any).deepTraits.push(t);
        }
        // 防御机制：取最长的
        if (((ch as any).defenseMechanism || '').length > ((existing as any).defenseMechanism || '').length) {
          (existing as any).defenseMechanism = (ch as any).defenseMechanism;
        }
        // 矛盾点：合并
        if ((ch as any).contradictions && (existing as any).contradictions !== (ch as any).contradictions) {
          (existing as any).contradictions = (existing as any).contradictions
            ? (existing as any).contradictions + '；' + (ch as any).contradictions
            : (ch as any).contradictions;
        }
        // 标志性场景去重
        if ((ch as any).signatureScenes) {
          if (!(existing as any).signatureScenes) (existing as any).signatureScenes = [];
          for (const s of (ch as any).signatureScenes) {
            if (!(existing as any).signatureScenes.some((es: any) => es.chapter === s.chapter)) {
              (existing as any).signatureScenes.push(s);
            }
          }
        }
        // 合并状态变化
        if ((ch as any).statusChanges) {
          if (!(existing as any).statusChanges) (existing as any).statusChanges = [];
          for (const sc of (ch as any).statusChanges) {
            if (!(existing as any).statusChanges.some((es: any) => es.chapter === sc.chapter)) {
              (existing as any).statusChanges.push(sc);
            }
          }
          (existing as any).statusChanges.sort((a: any, b: any) => a.chapter - b.chapter);
        }
        // 合并习惯
        for (const h of ch.habits) {
          if (!existing.habits.includes(h)) existing.habits.push(h);
        }
        // 更新出场范围
        if (ch.firstAppear < existing.firstAppear) existing.firstAppear = ch.firstAppear;
        if (ch.lastAppear > existing.lastAppear) existing.lastAppear = ch.lastAppear;
        // 合并说话方式描述（取最长的）
        if (ch.speechStyle.length > existing.speechStyle.length) {
          existing.speechStyle = ch.speechStyle;
        }
        // 合并身份（取最长的）
        if (ch.role.length > existing.role.length) {
          existing.role = ch.role;
        }
        // 性别：优先非"未知"
        if (existing.gender === '未知' && ch.gender !== '未知') {
          existing.gender = ch.gender;
        }
      } else {
        merged.push({ ...ch });
      }
    }
  }

  return merged;
}

/**
 * 关系去重合并：同名+同向去重，保留变化节点
 */
function mergeRelations(allResults: ChapterAnalyzeResult[]): KnowledgeBase['relations'] {
  const merged: KnowledgeBase['relations'] = [];

  for (const result of allResults) {
    for (const rel of result.relations) {
      const key = [rel.from, rel.to].sort().join('↔');
      const existing = merged.find(m =>
        [m.from, m.to].sort().join('↔') === key
      );

      if (existing) {
        // 合并变化节点
        for (const change of rel.changes) {
          if (!existing.changes.some(c => c.chapter === change.chapter)) {
            existing.changes.push(change);
          }
        }
        existing.changes.sort((a, b) => a.chapter - b.chapter);
        // 更新起始章（取最早的）
        if (rel.startChapter < existing.startChapter) {
          existing.startChapter = rel.startChapter;
        }
      } else {
        merged.push({ ...rel });
      }
    }
  }

  return merged;
}

/**
 * 事件合并去重，按章节排序
 */
function mergeEvents(allResults: ChapterAnalyzeResult[]): KnowledgeBase['plot'] {
  const all: KnowledgeBase['plot'] = [];
  const seen = new Set<string>();

  for (const result of allResults) {
    for (const evt of result.events) {
      const key = `${evt.chapter}_${evt.event.slice(0, 30)}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push({ chapter: evt.chapter, summary: evt.event });
      }
    }
  }

  return all.sort((a, b) => a.chapter - b.chapter);
}

/**
 * 构建知识库
 */
export function buildKnowledgeBase(
  worldId: string,
  chapterCount: number,
  allResults: ChapterAnalyzeResult[]
): KnowledgeBase {
  const characters = mergeCharacters(allResults);
  const relations = mergeRelations(allResults);
  const plot = mergeEvents(allResults);

  // 汇总各块提取的能力/规则线索（供全局合成归纳能力体系）
  const worldRuleClues = [...new Set(allResults.flatMap(r => r.worldRules || []))].slice(0, 40);

  // 汇总伏笔：按名称去重，取最早埋设章节
  const fMap = new Map<string, { name: string; planted: number; hint?: string }>();
  for (const r of allResults) {
    for (const f of r.foreshadows || []) {
      if (!f.name) continue;
      const ex = fMap.get(f.name);
      if (!ex || f.planted < ex.planted) {
        fMap.set(f.name, { name: f.name, planted: f.planted, hint: f.hint || ex?.hint });
      }
    }
  }
  const foreshadows = [...fMap.values()].slice(0, 30);

  // 文风：按块聚合
  const styleProfile: KnowledgeBase['styleProfile'] = allResults.map(r => ({
    chapterRange: r.chapterRange as [number, number],
    traits: '',
    samples: r.styleSamples.map(s => s.text),
  }));

  // 地点去重
  const locMap = new Map<string, KnowledgeBase['worldSettings']['geography']>();
  for (const r of allResults) {
    for (const loc of r.locations) {
      if (!locMap.has(loc.name)) {
        locMap.set(loc.name, loc.description);
      }
    }
  }
  const geography = Array.from(locMap.entries())
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');

  return {
    worldId,
    analyzedAt: new Date().toISOString(),
    chapterCount,
    analyzedChunks: allResults.length,
    characters,
    relations,
    plot,
    worldSettings: {
      supernatural: '',  // 留给全局合成填充
      society: '',
      culture: '',
      architecture: '',
      geography,
      sexualNorms: '',
    },
    styleProfile,
    globalTimeline: plot.map(p => ({
      chapter: p.chapter,
      time: '',
      event: p.summary,
      involvedCharacters: [],
    })),
    worldRuleClues,
    foreshadows,
  };
}

/**
 * 保存知识库到文件
 */
export async function saveKnowledgeBase(kb: KnowledgeBase): Promise<void> {
  const dir = getNovelDir(kb.worldId) + 'knowledge/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  const files: Array<{ name: string; data: any }> = [
    { name: 'characters.json', data: kb.characters },
    { name: 'relations.json', data: kb.relations },
    { name: 'plot.json', data: kb.plot },
    { name: 'style.json', data: kb.styleProfile },
    { name: 'world.json', data: kb.worldSettings },
    // 不写 index.json：避免大对象 JSON.stringify OOM
  ];

  for (const { name, data } of files) {
    try {
      await FileSystem.writeAsStringAsync(
        dir + name,
        JSON.stringify(data, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (e) {
      // 单个文件写入失败不中断
    }
  }
}

/**
 * 加载知识库（兼容旧 index.json 格式，优先按需加载）
 */
console.log('[KB] loadKnowledgeBase called');
export async function loadKnowledgeBase(worldId: string): Promise<KnowledgeBase | null> {
  const dir = getNovelDir(worldId) + 'knowledge/';
  try {
    // 优先尝试加载分文件（新格式）
    const chars = await loadJsonFile(dir + 'characters.json');
    if (chars) {
      const relations = await loadJsonFile(dir + 'relations.json') || [];
      const plot = await loadJsonFile(dir + 'plot.json') || [];
      const styleProfile = await loadJsonFile(dir + 'style.json') || [];
      const worldSettings = await loadJsonFile(dir + 'world.json') || {};
      // 清洗旧数据：早期版本可能把 AI 返回的对象存进了 worldSettings 字段
      // 对象 → 提取可读文本（description/rulesList/name），而非 JSON 字符串
      const ruleToText = (v: any): string => {
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.filter((x: any) => typeof x === 'string').join('；');
        if (v && typeof v === 'object') {
          const parts: string[] = [];
          if (typeof v.description === 'string' && v.description) parts.push(v.description);
          if (Array.isArray(v.rulesList)) parts.push(...v.rulesList.filter((x: any) => typeof x === 'string'));
          if (typeof v.name === 'string' && v.name && !parts.some((p: string) => p.includes(v.name))) parts.unshift(v.name);
          return parts.filter(Boolean).join('；');
        }
        return '';
      };
      for (const k of ['supernatural', 'society', 'culture', 'architecture', 'geography', 'sexualNorms']) {
        if (typeof worldSettings[k] !== 'string') {
          worldSettings[k] = ruleToText(worldSettings[k]);
        }
      }
      // 从 chapterCount 推断或从 plot 计算
      const maxChapter = plot.length > 0 ? Math.max(...plot.map((p: any) => p.chapter || 0)) + 1 : 1;
      return {
        worldId, analyzedAt: '', chapterCount: maxChapter, analyzedChunks: 0,
        characters: chars, relations, plot,
        worldSettings: worldSettings as KnowledgeBase['worldSettings'],
        styleProfile, globalTimeline: plot.map((p: any) => ({ chapter: p.chapter, time: '', event: p.summary, involvedCharacters: [] })),
        worldRuleClues: [],
        foreshadows: (worldSettings as any).foreshadows || [],
      };
    }
    // 回退到旧 index.json
    const raw = await FileSystem.readAsStringAsync(dir + 'index.json');
    return JSON.parse(raw);
  } catch (e: any) {
    console.log('[KB] loadKnowledgeBase failed:', e?.message || String(e));
    return null;
  }
}

async function loadJsonFile(path: string): Promise<any | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}


// ---- 会话级知识库缓存：同一世界在会话中不重复读取文件 ----
import { invalidateGraphCache } from './knowledgeGraph';

const kbCache = new Map<string, KnowledgeBase | null>();

export function loadKnowledgeBaseCached(worldId: string): Promise<KnowledgeBase | null> {
  if (kbCache.has(worldId)) {
    return Promise.resolve(kbCache.get(worldId) || null);
  }
  return loadKnowledgeBase(worldId).then(kb => {
    kbCache.set(worldId, kb);
    return kb;
  });
}

/**
 * 知识库变化后失效缓存（重新分析章节/追加章节后调用）
 */
export function invalidateKnowledgeBaseCache(worldId?: string): void {
  if (worldId) {
    kbCache.delete(worldId);
  } else {
    kbCache.clear();
  }
  invalidateGraphCache(worldId);
}
