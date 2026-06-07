// ============================================================
//  对话上下文构建器
//  根据玩家当前剧情位置，检索相关章节原文 + 角色数据
//  注入到聊天 prompt 中
// ============================================================

import { getChapter, getNovelMeta } from './novelStorage';
import { loadKnowledgeBase } from './knowledgeBase';
import type { KnowledgeBase, ChapterMeta } from '../types';

export interface DialogueContext {
  /** 当前所在章节范围 */
  chapterRange: [number, number];
  /** 当前章节原文（前缀段，供 AI 了解当前场景）*/
  chapterText?: string;
  /** 风格模板：当前章原文中风格代表性最强的段落 */
  styleTemplate?: string;
  /** 智能摘要：当前章 ±1 章的结构化事件（优先使用） */
  chapterDigest?: Array<{ chapter: number; event: string; chars: string[] }>;
  /** 当前时间点附近的角色关系状态 */
  activeRelations: Array<{ from: string; to: string; status: string }>;
  /** 当前章节范围内出场的角色 */
  activeCharacters: Array<{
    name: string;
    role: string;
    traits: string[];
    deepTraits: string[];
    defenseMechanism: string;
    contradictions: string;
    speechStyle: string;
    speechSample: string;
  }>;
  /** 当前章节的文风样本 */
  styleSamples: string[];
  /** 当前章节附近的关键事件 */
  nearbyEvents: Array<{ chapter: number; event: string }>;
  /** 记忆注入：与当前剧情相关的关键记忆 */
  relevantMemories?: string[];
  /** 偏差影响：剧情偏离原著的后果描述 */
  deviationImpact?: string;
  /** 场景节拍：当前场景的戏剧节奏阶段 */
  sceneBeat?: string;
  searchResults?: Array<{ type: string; match: string; chapter?: number }>;
  deviation?: string;
}

/**
 * 根据章节号估算当前剧情位置
 * 优先使用显式传入的章节号，否则从事件引用推断
 */
function estimateCurrentChapter(
  kb: KnowledgeBase,
  explicitChapter?: number,
  recentEvents?: string[]
): number {
  // 显式指定优先
  if (explicitChapter !== undefined && explicitChapter >= 0) {
    return Math.min(explicitChapter, kb.chapterCount - 1);
  }

  // 从最近事件推断
  if (recentEvents && recentEvents.length > 0) {
    const eventText = recentEvents.join(' ');
    for (const event of kb.globalTimeline.slice().reverse()) {
      if (eventText.includes(event.event.slice(0, 10))) {
        return event.chapter;
      }
    }
  }

  // 从对话轮数粗略估算（每 10 轮约推进 1 章）
  return 0;
}

/**
 * 构建对话上下文
 *
 * @param worldId 小说世界 ID
 * @param currentChapter 当前章节号（可选，0-based）
 * @param recentEvents 最近的对话事件（用于推断章节位置）
 */
export async function buildDialogueContext(
  worldId: string,
  currentChapter?: number,
  recentEvents?: string[],
  userText?: string,
  memories?: string[]
): Promise<DialogueContext | null> {
  try {
    const kb = await loadKnowledgeBase(worldId);
    if (!kb) return null;

    const chapter = estimateCurrentChapter(kb, currentChapter, recentEvents);
    const startCh = Math.max(0, chapter - 2);
    const endCh = Math.min(kb.chapterCount - 1, chapter + 2);

    // 当前章节范围内的角色（先计算，后续用于原文定位和风格分析）
    const chapterChars = kb.characters.filter(c => c.firstAppear <= endCh && c.lastAppear >= startCh);

    // 加载当前章节原文（智能窗口定位）
    let chapterText = '';
    let chapterFullText = '';
    try {
      chapterFullText = await getChapter(worldId, chapter) || '';
      if (chapterFullText.length > 50) {
        // 尝试定位到与在场角色相关的段落
        let windowStart = Math.floor(chapterFullText.length * 0.15); // 默认15%处
        for (const c of chapterChars.slice(0, 5)) {
          const idx = chapterFullText.indexOf(c.name);
          if (idx > 0) {
            windowStart = Math.max(0, idx - 800);
            break;
          }
        }
        chapterText = chapterFullText.slice(windowStart, windowStart + 2500);
      }
    } catch {}

    // 风格模板：从当前章原文中智能选取最具代表性的段落
    let styleTemplate = '';
    if (chapterFullText.length > 100) {
        const paragraphs = chapterFullText.split(/\n{2,}/).filter((p: string) => p.trim().length > 30);
        const scored = paragraphs.map((p, i) => {
          let score = 0;
          if (/["「」『』]/.test(p)) score += 3;          // 含对话
          if (/[。！？…~]/.test(p)) score += 1;            // 完整句子
          if (/[看见听闻触感嗅]/.test(p)) score += 2;       // 感官描写
          if (/[忽然渐渐仿佛似乎]/.test(p)) score += 1;     // 风格标记词
          if (p.length > 80 && p.length < 400) score += 2;  // 合适的段落长度
          score -= Math.abs(i / paragraphs.length - 0.5) * 3; // 偏中间位置加分
          return { text: p.trim(), score, idx: i };
        });
        scored.sort((a, b) => b.score - a.score);
        // 取前 8 段拼成风格模板，控制在 ~4000 字
        const top = scored.slice(0, 8).sort((a, b) => a.idx - b.idx);
        styleTemplate = top.map((p: any) => p.text).join('\n\n').slice(0, 4000);
    }

    // 智能上下文：提取当前章节相关的剧情锚点 + 关键对话
    const chapterEvents = kb.globalTimeline
      .filter(e => e.chapter >= startCh && e.chapter <= endCh)
      .map(e => `第${e.chapter+1}章：${e.event}`);
    const involvedChars = new Set(chapterEvents.flatMap(e => {
      const evtText = e.toLowerCase();
      return kb.characters.filter(c => evtText.includes(c.name)).map(c => c.name);
    }));
    // 取当前章 ±1 章的关键事件
    const nearbyDigest = kb.globalTimeline
      .filter(e => e.chapter >= startCh && e.chapter <= endCh)
      .map(e => ({
        chapter: e.chapter,
        event: e.event,
        chars: kb.characters.filter(c => e.event.includes(c.name)).map(c => c.name),
      }));

    // 当前章节范围内出场的角色
    const activeCharacters = chapterChars.map(c => ({
        name: c.name,
        role: c.role,
        traits: c.traits,
        deepTraits: (c as any).deepTraits || [],
        defenseMechanism: (c as any).defenseMechanism || '',
        contradictions: (c as any).contradictions || '',
        speechStyle: c.speechStyle,
        speechSample: c.speechSamples.filter(s => s.chapter <= chapter).pop()?.quote || c.speechSamples.find(s =>
          s.chapter >= startCh && s.chapter <= endCh
        )?.quote || c.speechSamples[0]?.quote || '',
      }));

    // 当前时间点的关系状态
    const activeRelations = kb.relations.map(r => {
      // 找到当前章节时关系的最新状态
      let status = r.type;
      for (const change of r.changes) {
        if (change.chapter <= chapter) {
          status = change.to || change.from || status;
        }
      }
      return { from: r.from, to: r.to, status };
    });

    // 当前章节的文风样本
    const styleSamples = kb.styleProfile
      .filter(s => s.chapterRange[0] <= endCh && s.chapterRange[1] >= startCh)
      .flatMap(s => s.samples)
      .slice(0, 4);

    // 附近事件（不超过当前章节，不剧透未来）
    const nearbyEvents = kb.globalTimeline
      .filter(e => e.chapter >= startCh && e.chapter <= chapter)
      .slice(0, 12)
      .map(e => ({ chapter: e.chapter, event: e.event }));

    // 记忆注入：筛选与当前角色相关的记忆
    const activeCharNames = new Set(activeCharacters.map(c => c.name));
    const relevantMemories = (memories || [])
      .filter(m => activeCharNames.size === 0 || [...activeCharNames].some(n => m.includes(n)))
      .slice(-8);

    return {
      chapterRange: [startCh, endCh],
      chapterText,
      styleTemplate,
      chapterDigest: nearbyDigest,
      activeRelations,
      activeCharacters,
      styleSamples,
      nearbyEvents,
      relevantMemories,
    };
  } catch {
    return null;
  }
}

/**
 * 将构建的上下文转换为 prompt 注入文本
 */
export function contextToPrompt(ctx: DialogueContext): string {
  const parts: string[] = [];

  const devTag = ctx.deviation === '较大' || ctx.deviation === '完全偏离' ? '【原著参考，已大幅偏离】'
    : ctx.deviation === '中等' ? '【原著参考】' : '';

  // 当前章节原文（缓存友好：前缀段每章只变一次）
  if (ctx.chapterText) {
    parts.push('\n【当前章节原文】（请基于这段原文的自然节奏和细节来写，不要写成说明书）\n「' + ctx.chapterText + '」');
  }

  // 优先用智能摘要（结构化的剧情锚点，信息密度远高于原文）
  if (ctx.chapterDigest && ctx.chapterDigest.length > 0) {
    const digestLines = ctx.chapterDigest.map(d => {
      const charTags = d.chars.length > 0 ? ` [涉及：${d.chars.join('、')}]` : '';
      return `第${d.chapter+1}章：${d.event}${charTags}`;
    });
    parts.push('\n当前剧情位置（第' + (ctx.chapterRange[0]+1) + '~' + (ctx.chapterRange[1]+1) + '章）' + (devTag ? ' ' + devTag : '') + '：\n' + digestLines.join('\n'));
    // 风格模板（独立注入，告诉 AI 怎么写）
    if (ctx.styleTemplate) {
      parts.push('\n原文风格模板（请用这种句长、节奏、感官密度来写）：\n「' + ctx.styleTemplate + '」');
    }
  } else if (ctx.styleTemplate) {
    // 兜底：如果没有结构化摘要，用风格模板当原文参考
    parts.push('\n原文参考（第' + (ctx.chapterRange[0]+1) + '~' + (ctx.chapterRange[1]+1) + '章）' + (devTag ? ' ' + devTag : '') + '：\n「' + ctx.styleTemplate + '」');
  }

  if (ctx.activeCharacters.length > 0) {
    // 精简版：主叙事 AI 只需要知道角色在场、怎么说话、表面性格
    // 深层数据留给角色推演 AI
    parts.push(`\n在场角色：\n${ctx.activeCharacters.map(c => {
      const traits = c.traits.slice(0, 4).join('、');
      let line = `  ${c.name}（${c.role}）`;
      if (traits) line += ` | ${traits}`;
      line += ` | 说话：${c.speechStyle || '未知'}`;
      if (c.speechSample) line += ` | 例：「${c.speechSample.slice(0, 40)}」`;
      return line;
    }).join('\n')}`);
  }

  if (ctx.activeRelations.length > 0) {
    parts.push(`\n当前关系状态：\n${ctx.activeRelations.map(r =>
      `  ${r.from} ↔ ${r.to}：${r.status}`
    ).join('\n')}`);
  }

  if (ctx.styleSamples.length > 0) {
    parts.push(`\n当前文风参考：\n${ctx.styleSamples.slice(0, 3).map(s => '「' + s + '」').join('\n')}`);
  }

  if (ctx.searchResults && ctx.searchResults.length > 0) {
    parts.push('\n🔍 搜索匹配：\n' + ctx.searchResults.map(r => '  [' + r.type + '] ' + r.match).join('\n'));
  }
  if (ctx.nearbyEvents.length > 0) {
    parts.push(`\n附近剧情锚点：\n${ctx.nearbyEvents.map(e => `  第${e.chapter+1}章：${e.event}`).join('\n')}`);
  }

  // 记忆注入
  if (ctx.relevantMemories && ctx.relevantMemories.length > 0) {
    parts.push(`\n关键记忆（此前发生过的重要事件，请自然引用而非复述）：\n${ctx.relevantMemories.map(m => '  · ' + m).join('\n')}`);
  }

  // 偏差影响
  if (ctx.deviationImpact) {
    parts.push(`\n⚠ 剧情偏离影响：${ctx.deviationImpact}`);
  }

  // 场景节拍
  if (ctx.sceneBeat) {
    parts.push(`\n【场景节拍】${ctx.sceneBeat}`);
  }

  return parts.join('\n');
}


/** 从用户输入中提取关键词（名词/实体） */
function extractKeywords(text: string): string[] {
  const words = text.replace(/[，。！？、；：""''（）\[\]\{\}…\-\s]+/g, ' ').split(' ').filter(w => w.length >= 2);
  // 过滤掉常见停用词
  const stopWords = ['什么','怎么','为什么','可以','应该','可能','如果','已经','现在','然后','不过','但是','因为','所以','这个','那个','一个','一下','一点','还是','或者','只是','一直','已经','正在','没有'];
  return [...new Set(words.filter(w => !stopWords.includes(w) && !/^[的得了着过吗呢吧啊]$/.test(w)))].slice(0, 5);
}

/** 在知识库中搜索关键词 */
function searchKB(kb: KnowledgeBase, keywords: string[], currentStart: number, currentEnd: number) {
  const results = [];
  for (const kw of keywords) {
    // 搜角色
    for (const c of kb.characters) {
      if (c.name.includes(kw) || c.traits.some(t => t.includes(kw)) || c.role.includes(kw)) {
        if (c.firstAppear < currentStart || c.lastAppear > currentEnd) {
          results.push({ type: '角色', match: c.name + '（' + c.role + '）', chapter: c.firstAppear });
        }
      }
    }
    // 搜事件
    for (const e of kb.globalTimeline) {
      if (e.event.includes(kw) && (e.chapter < currentStart || e.chapter > currentEnd)) {
        results.push({ type: '事件', match: '第' + (e.chapter+1) + '章：' + e.event, chapter: e.chapter });
      }
    }
    // 搜关系
    for (const r of kb.relations) {
      if (r.type.includes(kw) || r.from.includes(kw) || r.to.includes(kw)) {
        results.push({ type: '关系', match: r.from + '↔' + r.to + '：' + r.type });
      }
    }
  }
  return results.slice(0, 5);
}