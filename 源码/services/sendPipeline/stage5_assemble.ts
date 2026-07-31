// ============================================================
//  发送管线 — 阶段 5: 提示词组装
// ============================================================

import React from 'react';
import { NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE, WORLD_RULES } from '../../prompts/worldRules';
import { contextToPrompt } from '../dialogueContext';
import { selectMemoriesForPrompt } from '../memoryManager';
import { loadKnowledgeBase } from '../knowledgeBase';
import { KnowledgeGraph } from '../knowledgeGraph';
import { getRecentBadFeedback, getGoodSamples } from '../feedbackStore';
import { computeAdjustments, findSimilarSamples } from '../promptTuner';
import type { PromptAdjustment } from '../promptTuner';
import { moodsToPrompt } from '../emotionalInertia';
import { knowledgeToPrompt } from '../rumorPropagation';
import { OOC_RULES } from '../../prompts/tokens';
import { FORMAT_RULES } from '../../prompts/tokens';
import { directorToPrompt } from '../narrativeDirector';
import type { WorldSession, ChatMessage, Character } from '../../types';
import type { CharacterAction } from '../characterSimulator';
import type { ApiConfig } from '../../types';

export interface PromptResult {
  prompt: { role: 'system' | 'user' | 'assistant'; content: string }[];
  chapterPrompt: string;
  scenarioBlock: string;
}

/**
 * 玩家身份提示：魂穿时说明占据身体、原主状态、原著知识
 */
function playerIdentityPrompt(session: any): string {
  const pName = session.selectedCharacters?.[0]?.name || '玩家';
  let identity = `【玩家身份】${pName}是你正在互动的玩家角色。[说]=玩家角色在说话，[行动]=玩家角色的行为。你扮演除玩家以外的所有角色和旁白。`;
  const fc = session.fanficConfig;
  if (fc?.type === 'soul') {
    const soulStatus = fc.originalSoulStatus === 'coexisting'
      ? '原主意识仍存在，可能干扰玩家'
      : fc.originalSoulStatus === 'dormant'
        ? '原主意识沉睡'
        : '原主意识已消散';
    identity += `\n玩家魂穿占据了${pName}的身体（${soulStatus}），拥有${pName}的记忆与处境`;
    identity += fc.playerAbilities?.plotKnowledge ? '，同时知晓原著剧情走向。' : '，无原著知识。';
  }
  return identity;
}

let activeTuningAdjustments: PromptAdjustment[] = [];

/**
 * 动态规则系统：按当前章节计算活跃/退化能力
 * 无 abilities 数据时返回空串（不影响非能力小说）
 */
function currentAbilities(world: any, chapter: number, soulName?: string): string {
  const abilities = world?.abilities;
  if (!Array.isArray(abilities) || abilities.length === 0) return '';
  const cur = chapter + 1; // 章节 0-based → 1-based
  const active = abilities.filter((a: any) => a.start <= cur && (!a.end || a.end >= cur));
  const degraded = abilities.filter((a: any) => a.end && a.end < cur);
  const parts: string[] = [];
  if (active.length > 0) {
    // 魂穿时以玩家为主体（"你（陈源）的能力"），身穿时第三人称
    const subject = soulName ? `你（${soulName}）` : '当前角色';
    parts.push(subject + '的能力：' + active.map((a: any) => a.name + (a.details ? '（' + a.details + '）' : '')).join('；'));
  }
  if (degraded.length > 0) {
    parts.push('已退化能力：' + degraded.map((a: any) => a.name).join('、'));
  }
  return parts.length > 0 ? '【能力状态】' + parts.join('。') : '';
}

/**
 * 伏笔追踪：注入已埋设未回收的伏笔
 * 回收检测：已发生剧情的事件摘要包含伏笔名 → 视为回收
 * 无 foreshadows 数据时返回空串
 */
function currentForeshadows(world: any, chapter: number): string {
  const foreshadows = world?.foreshadows;
  if (!Array.isArray(foreshadows) || foreshadows.length === 0) return '';
  const cur = chapter + 1; // 1-based

  // 从已发生剧情中收集已回收的伏笔名
  const resolvedNames = new Set<string>();
  const timeline = (world?.timeline || []).filter((t: any) => (t.chapter || 0) <= chapter);
  for (const ev of timeline) {
    const desc = ev.description || ev.event || '';
    for (const f of foreshadows) {
      if (f.name && desc.includes(f.name)) resolvedNames.add(f.name);
    }
  }

  const unresolved = foreshadows
    .filter(f => f.planted <= cur && !f.resolved && !resolvedNames.has(f.name))
    .slice(0, 5);
  if (unresolved.length === 0) return '';

  return '【未回收伏笔】' + unresolved
    .map(f => f.name + (f.hint ? '（' + f.hint + '）' : ''))
    .join('；') + '（演绎时可自然呼应，但不要提前揭示）';
}

/**
 * 关系里程碑：注入各角色关系发展进度
 * 达成检测：已发生剧情的事件描述包含 boundEvent → 标记达成
 * 无 milestones 数据时返回空串
 */
function relationshipProgress(world: any, chapter: number): string {
  const sets = world?.milestones;
  if (!Array.isArray(sets) || sets.length === 0) return '';
  const cur = chapter + 1; // 1-based
  const timeline = (world?.timeline || []).filter((t: any) => (t.chapter || 0) <= chapter);

  const lines: string[] = [];
  for (const set of sets) {
    const ms = (set.milestones || []).filter((m: any) => m && m.name);
    if (ms.length === 0) continue;
    const achieved = ms.filter((m: any) => {
      if (m.achieved) return true;
      return m.boundEvent && timeline.some((ev: any) => {
        const desc = ev.description || ev.event || '';
        return desc.includes(m.boundEvent);
      });
    });
    const pending = ms.filter((m: any) => !achieved.includes(m) && (!m.chapter || m.chapter <= cur));
    const parts: string[] = [`${set.character}：${achieved.length}/${ms.length}`];
    if (achieved.length > 0) parts.push('已达成：' + achieved.map((m: any) => m.name).join('、'));
    if (pending.length > 0) parts.push('未达成：' + pending.map((m: any) => m.name).join('、'));
    lines.push(parts.join('；'));
  }
  return lines.length > 0 ? '【关系进度】' + lines.join('。') : '';
}

/**
 * 名场面情境匹配：当前章节接近 + 在场角色/场景关键词命中 → 注入原著走向
 * 魂穿模式下：相关名场面提示玩家可触发/改变
 */
function sceneContext(world: any, chapter: number, scene: string, activeChars: string[]): string {
  const scenes = world?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return '';
  const cur = chapter + 1; // 1-based

  const matches = scenes
    .filter((s: any) => {
      if (!s.title) return false;
      const chNear = Math.abs((s.chapter || 0) - cur) <= 25;
      const kwHit = (s.trigger?.keywords || []).some((k: string) => k && scene.includes(k));
      // 关键词命中（玩家提及标志物/话语）→ 名场面已发生的任意时刻可作回忆/呼应
      if (kwHit && (s.chapter || 0) <= cur + 25) return true;
      // 仅角色在场 → 需名场面即将发生或刚发生（窄窗口）
      const upcoming = (s.chapter || 0) >= cur - 2;
      const charHit = (s.trigger?.characters || []).some((c: string) => activeChars.includes(c));
      return upcoming && charHit && Math.abs((s.chapter || 0) - cur) <= 8;
    })
    .slice(0, 2);
  if (matches.length === 0) return '';

  return '【可关联的名场面】' + matches.map((s: any) =>
    `「${s.title}」原著走向：${s.originalPlot}（玩家行为可改变此走向，蝴蝶效应自洽即可）`
  ).join('；');
}

export async function assemblePrompt(
  session: WorldSession,
  msgsWithUser: ChatMessage[],
  messages: ChatMessage[],
  charActions: CharacterAction[],
  chapterCtx: any,
  isFanfic: boolean,
  cfg: ApiConfig,
  summaryRef: React.MutableRefObject<string>,
  attitudes: React.MutableRefObject<Record<string, any>>
): Promise<PromptResult> {
  console.log('[PIPELINE] stage5 assemble start promptMsgs=' + msgsWithUser.length);
  const fanficAppend = isFanfic ? NARRATOR_FANFIC_APPEND : '';
  const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';

  const stableSystem = [
    '你是' + (session.world?.name || '未知世界') + '的叙事引擎。' + NARRATOR_BASE + fanficAppend,
    OOC_RULES.NO_AI_ASSISTANT,
    isFanfic ? VOCAB_LOCK : '',
    ...WORLD_RULES,
    POST_HISTORY_BASE,
  ].join('\n');

  let scenarioBlock = '';
  const recentText = msgsWithUser.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4).map(m => m.content).join(' ');
  const memories = (session.memories || []) as any[];
  if (memories.length > 0) {
    const memBlock = selectMemoriesForPrompt(memories, recentText, 600);
    if (memBlock) scenarioBlock = '\n' + memBlock;
  }

  let relationGraphBlock = '';
  if (isFanfic && session.worldNovelId && session.selectedCharacters.length > 0) {
    try {
      const kb = await loadKnowledgeBase(session.worldNovelId);
      if (kb) {
        const graph = new KnowledgeGraph(kb, session.currentChapter || 0);
        const focal = session.selectedCharacters[0]?.name;
        if (focal && graph.adjacency.has(focal)) {
          relationGraphBlock = graph.toRelationContext(focal, 2);
        }
      }
    } catch { /* knowledge graph unavailable */ }
  }

  const styleFeat = (session.world as any)?.styleFeatures
    ? '\n风格特征：\n' + (session.world as any).styleFeatures
    : '';

  let tuningBlock = '';
  try {
    const recentBad = await getRecentBadFeedback(5);
    if (recentBad.length > 0) {
      const recentGood = await getGoodSamples(20);
      const currentChars = session.selectedCharacters.map(c => c.name);
      const result = computeAdjustments(recentBad, activeTuningAdjustments);
      activeTuningAdjustments = result.updatedAdjustments;
      if (activeTuningAdjustments.length > 5) {
        activeTuningAdjustments = activeTuningAdjustments.slice(-5);
      }
      if (result.tuningText) tuningBlock += result.tuningText;
      
      if (recentGood.length >= 3) {
        const samples = findSimilarSamples(
          session.currentScene || '', currentChars,
          recentGood.map((e: any) => ({ userMsg: e.userMessage, aiResponse: e.aiResponsePreview, scene: e.scene, characters: e.activeCharacters, rating: 1 as const })),
          1
        );
        if (samples.length > 0) tuningBlock += '\n[参考：之前类似场景的高质量回复]\n' + samples[0].aiResponse.slice(0, 200);
      }
    }
  } catch { console.warn('[sendPipeline] feedback tuning failed'); }

  const moodCtx = session.characterMoods
    ? moodsToPrompt(session.characterMoods, session.characterKnowledge)
    : '';
  
  const focalChars = session.selectedCharacters.map(c => c.name);
  const knowledgeCtx = session.characterKnowledge
    ? knowledgeToPrompt(session.characterKnowledge, focalChars)
    : '';

  // 魂穿时能力注入以玩家为主体（"你（陈源）的能力"）
  const fc = (session as any).fanficConfig;
  const soulName = fc?.type === 'soul' ? session.selectedCharacters[0]?.name : undefined;

  const dynamicParts: string[] = [
    playerIdentityPrompt(session),
    '世界观：' + (session.world?.type || '') + ' | ' + (session.world?.rules?.supernatural || ''),
    chapterPrompt,
    summaryRef.current || '',
    scenarioBlock,
    styleFeat,
    tuningBlock,
    relationGraphBlock,
    currentAbilities(session.world, session.currentChapter || 0, soulName),
    currentForeshadows(session.world, session.currentChapter || 0),
    relationshipProgress(session.world, session.currentChapter || 0),
    sceneContext(session.world, session.currentChapter || 0, session.currentScene || '', session.selectedCharacters.map(c => c.name)),
    '\n场景：' + (session.currentScene || '未知地点'),
    moodCtx,
    knowledgeCtx,
  ];

  // ═══════════════════════════════════════════════════════
  // 知识边界 Gate — 同人模式下硬约束角色知识范围
  // ═══════════════════════════════════════════════════════
  if (isFanfic && chapterCtx?.activeCharacters) {
    const hasBoundaryIssues = chapterCtx.activeCharacters.some(
      (ac: any) => ac.knowledgeWarning || ac.unknownEvents?.length > 0
    );
    if (hasBoundaryIssues) {
      // 硬约束放在动态层最前面，优先级最高
      dynamicParts.unshift(OOC_RULES.KNOWLEDGE_BOUNDARY);
      dynamicParts.unshift(OOC_RULES.CHARACTER_CONSISTENCY);
    }
  }

  for (const c of session.selectedCharacters) {
    const deep = c.personality._deepProfile || '';
    const dialogue = (c.exampleDialogues || []).slice(0, 2).map((d: any) => d.character).join(' / ');
    let line = '- ' + c.name + '：' + c.personality.traits.join('、') + '，' + c.relationship.status;
    const att = attitudes.current[c.name];
    if (att && att.affection !== undefined) {
      const label = att.affection > 60 ? '亲近' : att.affection > 30 ? '友好' : att.affection > 0 ? '平淡'
        : att.affection < -30 ? '厌恶' : att.affection < 0 ? '冷淡' : '中性';
      line += ' | 好感：' + att.affection.toFixed(1) + '（' + label + '）';
    }
    if (deep) line += ' | ' + deep;
    if ((c as any).arc?.description) {
      const arc = (c as any).arc;
      const pastChs = arc.keyChapters?.filter((k: number) => k <= (session.currentChapter || 0)) || [];
      line += ' | 弧线：' + arc.description + (pastChs.length > 0 ? '（已走过' + pastChs.map((k: number) => '第' + (k + 1) + '章').join('→') + '）' : '');
    }
    if (c.personality.speakingStyle) line += ' | 说话：' + c.personality.speakingStyle;
    const override = c.personality.promptOverride;
    if (override) line += ' | ⚡：' + override;
    if (dialogue) line += ' | 台词：「' + dialogue + '」';
    dynamicParts.push(line);
  }

  // ═══════════════════════════════════════════════════════
  // NPC 对话级知识边界：中途入场的角色不知道之前的对话
  // ═══════════════════════════════════════════════════════
  const lateJoiners = (session.npcs || []).filter(n => !session.selectedCharacters.some(c => c.name === n.name));
  if (lateJoiners.length > 0) {
    dynamicParts.push(
      '\u26a0 对话级知识边界：以下角色在对话中途进入场景。他们不知道进入之前玩家对其他角色说了什么。' +
      '他们只能基于自己进入后观察到的事实和原著知识来反应。' +
      '他们不应知道进入前玩家的行动、其他角色的表态、或已做出的决定。'
    );
  }

  for (const n of lateJoiners) {
    const wc = ((session.world as any)?.characters || []).find((wc: any) => wc.name === n.name);
    const orig = wc?.role || wc?.relationship?.status || '';
    const deep = wc?.personality._deepProfile || '';
    let line = '- ' + n.name + '：' + n.role + (orig ? '（原著：' + orig + '）' : '') + '，' + n.personality;
    if (deep) line += ' | ' + deep;
    dynamicParts.push(line);
  }

  if (charActions.length > 0) {
    dynamicParts.push('\n角色推演：\n' + charActions.map(a => {
      let s = '  ' + a.name + '：' + a.intent + '（' + a.mood + '）';
      if (a.innerThought) s += '\n    内心：' + a.innerThought;
      if (a.bodyLanguage) s += '\n    身体：' + a.bodyLanguage;
      if (a.subtext) s += '\n    潜台词：' + a.subtext;
      s += '\n    方向：' + (a.emotionalDirection || 'holding') + ' | 指向：' + (a.toward === 'player' ? '玩家' : a.toward || 'none') + (a.wantsInteraction ? ' | 想互动' : '');
      if (a.triggerContext) s += '\n    触发：' + a.triggerContext;
      return s;
    }).join('\n'));
  }

  if (session.worldBible) dynamicParts.push('\n世界圣经：' + session.worldBible);

  if ((session.world as any)?.styleSamples?.length > 0) {
    dynamicParts.push('\n风格参考：' + (session.world as any).styleSamples.slice(0, 2).map((s: string) => '「' + s + '」').join('\n'));
  }

  // 叙事导演指示
  const dir = (session as any).directorDecision;
  if (dir) {
    const dirText = directorToPrompt(dir);
    if (dirText) dynamicParts.push(dirText);
  }

  dynamicParts.push('\n【角色引入】需要引入原著新角色时，在回复末尾添加 ___META___ {"newCharacter":"角色名"}');

  const dynamicSystem = dynamicParts.filter(p => p && p.trim().length > 0).join('\n');

  const prompt = [
    { role: 'system' as const, content: stableSystem },
    { role: 'system' as const, content: dynamicSystem },
    ...msgsWithUser.slice(1).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  return { prompt, chapterPrompt, scenarioBlock };
}
