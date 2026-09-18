// ============================================================
//  知识库
//  去重合并各块的提取结果，按章节索引
//  持久化到 FileSystem
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import type { ChapterAnalyzeResult, KnowledgeBase } from '../types';
import { getNovelDir } from './novelStorage';

// 模型对"没有别名"的角色会输出这些占位词。若把它们当真实别名参与匹配，
// 所有无别名角色会因共用 "无别名" 而被错误合并到同一条记录上。
const PLACEHOLDER_ALIASES = new Set([
  '无别名', '无', '暂无', '无别名（无）', '没有', '未知', 'none', 'n/a', '无别名。', '—', '-', '',
]);

function isPlaceholderAlias(a: unknown): boolean {
  if (typeof a !== 'string') return true;
  const s = a.trim();
  if (s.length < 2) return true;
  if (PLACEHOLDER_ALIASES.has(s.toLowerCase())) return true;
  // "别名(无)" / "别名（无）" / "无别名(暂无)" 这类包裹写法
  const inner = s.replace(/^别名\s*[（(]/, '').replace(/[)）]$/, '').trim();
  return PLACEHOLDER_ALIASES.has(inner.toLowerCase());
}

/** 取出一个角色记录里真正可用的别名（过滤占位词与自我指涉） */
function realAliases(c: { name?: string; aliases?: unknown }): string[] {
  const out: string[] = [];
  for (const a of (c.aliases as unknown[]) || []) {
    if (isPlaceholderAlias(a)) continue;
    const s = (a as string).trim();
    if (!s || s === c.name) continue;
    // "别名(陈源)" 这类包裹写法若解开后等于本人名字，也不是有效别名
    const inner = s.replace(/^别名\s*[（(]/, '').replace(/[)）]$/, '').trim();
    if (inner && inner === c.name) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * 角色去重合并：按名字 + 别名匹配
 *
 * 注意：别名匹配必须是**双向且以名字为准**的。原先的 `ch.aliases.some(...)`
 * 只要任一别名出现在对方名字或别名表中就判定为同一人，配合模型输出的
 * "无别名" 占位词，会把全书角色都合并进第一条记录（实测主角被灌入 34 条
 * 来自其他角色的 traits）。因此这里：
 *   1. 过滤占位别名；
 *   2. 名字精确相等优先；
 *   3. 别名互查时也要求别名本身不是占位词。
 */
function mergeCharacters(allResults: ChapterAnalyzeResult[]): KnowledgeBase['characters'] {
  const merged: KnowledgeBase['characters'] = [];

  for (const result of allResults) {
    for (const ch of result.characters) {
      const chAliases = realAliases(ch as any);
      const existing = merged.find(m => {
        if (m.name === ch.name) return true;
        const mAliases = realAliases(m as any);
        if (mAliases.length === 0 && chAliases.length === 0) return false;
        // 交叉匹配：只在双方都有真实别名时才有意义
        return chAliases.some(a => a === m.name || mAliases.includes(a));
      });

      if (existing) {
        // 合并别名（跳过占位词，避免 "无别名" 之类的垃圾写进知识库）
        for (const a of chAliases) {
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
        // 新记录：同样清掉占位别名，并压平可能重复的 traits
        merged.push({
          ...ch,
          aliases: chAliases,
          traits: Array.from(new Set(ch.traits || [])),
        } as any);
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
    // 合成的全局时间线必须落盘。
    // 原先这里没有它，于是 synthesizeTimeline 产出的 involvedCharacters /
    // time / significance 只活在**首次会话**的内存里：一重启，loadKnowledgeBase
    // 就从 plot 重建一份，且 involvedCharacters 一律补成 []。
    // 下游 chapterAwareFilter / knowledgeGraph / dialogueContext /
    // characterDeepDive 全都读 globalTimeline——其中 characterDeepDive 明写
    // 「优先用 involvedCharacters，缺失时退回按摘要匹配角色名」，
    // 也就是说重启后它永远走 fallback，且不报错。
    { name: 'timeline.json', data: kb.globalTimeline },
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

      // 优先用合成的全局时间线（带 involvedCharacters / time / significance）；
      // 没有 timeline.json 时（老数据、或合成失败）才从 plot 重建裸版本。
      const savedTimeline = await loadJsonFile(dir + 'timeline.json');
      const globalTimeline = Array.isArray(savedTimeline) && savedTimeline.length > 0
        ? savedTimeline
        : plot.map((p: any) => ({ chapter: p.chapter, time: '', event: p.summary, involvedCharacters: [] }));

      return {
        worldId, analyzedAt: '', chapterCount: maxChapter, analyzedChunks: 0,
        characters: chars, relations, plot,
        worldSettings: worldSettings as KnowledgeBase['worldSettings'],
        styleProfile, globalTimeline,
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
