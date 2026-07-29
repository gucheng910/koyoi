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

let activeTuningAdjustments: PromptAdjustment[] = [];

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

  const dynamicParts: string[] = [
    '【玩家身份】' + (session.selectedCharacters.length > 0 ? session.selectedCharacters[0].name : '玩家') + '是你正在互动的玩家角色。[说]=玩家角色在说话，[行动]=玩家角色的行为。你扮演除玩家以外的所有角色和旁白。',
    '世界观：' + (session.world?.type || '') + ' | ' + (session.world?.rules?.supernatural || ''),
    chapterPrompt,
    summaryRef.current || '',
    scenarioBlock,
    styleFeat,
    tuningBlock,
    relationGraphBlock,
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
