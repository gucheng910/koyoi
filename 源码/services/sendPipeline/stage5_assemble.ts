// ============================================================
//  发送管线 — 阶段 5: 提示词组装
// ============================================================

import React from 'react';
import { NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE, WORLD_RULES, ANTI_AI_PATTERN } from '../../prompts/worldRules';
import { contextToPrompt } from '../dialogueContext';
import { selectMemoriesForPrompt } from '../memoryManager';
import { routerToPrompt } from './stage4_5_router';
import type { RouterDecision } from './stage4_5_router';
import { loadKnowledgeBaseCached as loadKnowledgeBase } from '../knowledgeBase';
import { getKnowledgeGraph } from '../knowledgeGraph';
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
  identity += `\n玩家角色的名字就是「${pName}」，其他角色对玩家的称呼按此名字（或符合关系设定的昵称），不得给玩家另起新名字或改称。`;
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
function currentAbilities(world: any, chapter: number, soulName?: string, selectIds?: string[]): string {
  const abilities = world?.abilities;
  if (!Array.isArray(abilities) || abilities.length === 0) return '';
  const cur = chapter + 1; // 章节 0-based → 1-based
  const active = abilities.filter((a: any) => a.start <= cur && (!a.end || a.end >= cur));
  const degraded = abilities.filter((a: any) => a.end && a.end < cur);
  // 路由器选择过滤：selectIds 为 undefined 时全量（兜底），为数组时按 id 筛选（可能选空）
  const want = (id: string) => !selectIds || selectIds.includes(id);
  const parts: string[] = [];
  if (active.length > 0) {
    // 魂穿目标拥有的能力 → "你（X）"；其他角色的能力 → 第三人称（能力归属不随魂穿转移）
    const mine = soulName ? active.filter((a: any) => !a.owner || a.owner === soulName).filter((a: any) => want('ability:' + a.name)) : [];
    const npc = active.filter((a: any) => !mine.includes(a)).filter((a: any) => want('ability:' + a.name));
    if (mine.length > 0) {
      parts.push(`你（${soulName}）的能力：` + mine.map((a: any) => a.name + (a.details ? '（' + a.details + '）' : '')).join('；'));
    }
    // NPC 能力按拥有者分组
    const byOwner: Record<string, any[]> = {};
    for (const a of npc) {
      const owner = a.owner || '其他角色';
      (byOwner[owner] = byOwner[owner] || []).push(a);
    }
    for (const [owner, list] of Object.entries(byOwner)) {
      parts.push(owner + '的能力：' + list.map((a: any) => a.name + (a.details ? '（' + a.details + '）' : '')).join('；'));
    }
  }
  if (degraded.length > 0) {
    const deg = degraded.filter((a: any) => want('ability:' + a.name));
    if (deg.length > 0) parts.push('已退化能力：' + deg.map((a: any) => a.name).join('、'));
  }
  return parts.length > 0 ? '【能力状态】' + parts.join('。') : '';
}

/**
 * 伏笔追踪：注入已埋设未回收的伏笔
 * 回收检测：已发生剧情的事件摘要包含伏笔名 → 视为回收
 * 无 foreshadows 数据时返回空串
 */
function currentForeshadows(world: any, chapter: number, selectIds?: string[]): string {
  const foreshadows = world?.foreshadows;
  if (!Array.isArray(foreshadows) || foreshadows.length === 0) return '';
  const cur = chapter + 1; // 1-based

  // 从已发生剧情中收集已回收的伏笔名（回收事件必须严格晚于埋设章节，避免埋设事件本身误判）
  const resolvedNames = new Set<string>();
  const timeline = (world?.timeline || []).filter((t: any) => (t.chapter || 0) <= chapter);
  for (const f of foreshadows) {
    if (!f.name) continue;
    for (const ev of timeline) {
      if ((ev.chapter || 0) <= (f.planted || 1)) continue; // 埋设章及之前不算回收
      const desc = ev.description || ev.event || '';
      if (desc.includes(f.name)) { resolvedNames.add(f.name); break; }
    }
  }

  const unresolved = foreshadows
    .filter(f => f.planted <= cur && !f.resolved && !resolvedNames.has(f.name))
    .filter(f => !selectIds || selectIds.includes('foreshadow:' + f.name))
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
function relationshipProgress(world: any, chapter: number, selectIds?: string[]): string {
  const sets = world?.milestones;
  if (!Array.isArray(sets) || sets.length === 0) return '';
  const cur = chapter + 1; // 1-based
  const timeline = (world?.timeline || []).filter((t: any) => (t.chapter || 0) <= chapter);

  const lines: string[] = [];
  for (const set of sets) {
    if (selectIds && !selectIds.includes('milestone:' + set.character)) continue;
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
function sceneContext(world: any, chapter: number, scene: string, activeChars: string[], selectIds?: string[]): string {
  const scenes = world?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return '';
  const cur = chapter + 1; // 1-based

  let matches = scenes
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
    .slice(0, 4);
  if (selectIds) matches = matches.filter(s => selectIds.includes('scene:' + s.title));
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
  attitudes: React.MutableRefObject<Record<string, any>>,
  routerDecision?: RouterDecision | null,
  activeChars?: string[]
): Promise<PromptResult> {
  console.log('[PIPELINE] stage5 assemble start promptMsgs=' + msgsWithUser.length);
  const fanficAppend = isFanfic ? NARRATOR_FANFIC_APPEND : '';
  const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';

  const stableSystem = [
    POST_HISTORY_BASE,
    ANTI_AI_PATTERN,
    '你是' + (session.world?.name || '未知世界') + '的叙事引擎。' + NARRATOR_BASE + fanficAppend,
    OOC_RULES.NO_AI_ASSISTANT,
    isFanfic ? VOCAB_LOCK : '',
    ...WORLD_RULES,
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
        const graph = getKnowledgeGraph(kb, session.currentChapter || 0);
        const focal = session.selectedCharacters[0]?.name;
        if (focal && graph.adjacency.has(focal)) {
          relationGraphBlock = graph.toRelationContext(focal, 2);
        }
      }
    } catch { /* knowledge graph unavailable */ }
  }

  const styleFeat = (session.world as any)?.styleFeatures
    ? '\n风格特征：' + String((session.world as any).styleFeatures).slice(0, 400)
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

  // 在场者物理锚定：防止多角色场景动作对象写错（如"何思娇拍陈源肩膀"实为玩家）
  // activeChars 为运行时在场名单（stage4 维护），缺失时用在场角色卡兜底
  const onStage = activeChars && activeChars.length > 0
    ? activeChars
    : session.selectedCharacters.map(c => c.name);
  const playerName = session.selectedCharacters[0]?.name || '玩家';
  const onStageBlock = [
    '【当前在场者（物理位置锚定）】',
    `- 玩家：${playerName}（你）`,
    ...onStage.filter(n => n !== playerName).map(n => `- ${n}：在场`),
    '动作规则：其他角色对"你"做动作（拍肩/拉手/说话等）一律用"你"或"' + playerName + '"，禁止错写成其他在场角色名；角色名只用于该角色自己的动作和对话。',
  ].join('\n');

  // 路由器选择：undefined=路由器失败/未启用 → 全量注入（兜底）；数组=按选择注入
  const selectIds = routerDecision ? routerDecision.select : undefined;
  const focusSet = new Set(routerDecision?.focusChars || []);

  // 场景：路由器给出转场建议（sceneHint）时优先使用——玩家说"进教室"这轮就切换到新场景，
  // 避免"说了进教室但AI还在旧场景里吃包子"的转场滞后
  const sceneLabel = routerDecision?.sceneHint || session.currentScene || '未知地点';

  const dynamicParts: string[] = [
    playerIdentityPrompt(session),
    onStageBlock,
    '世界观：' + (session.world?.type || '') + ' | ' + (session.world?.rules?.supernatural || ''),
    chapterPrompt,
    summaryRef.current || '',
    scenarioBlock,
    styleFeat,
    tuningBlock,
    relationGraphBlock,
    currentAbilities(session.world, session.currentChapter || 0, soulName, selectIds),
    currentForeshadows(session.world, session.currentChapter || 0, selectIds),
    relationshipProgress(session.world, session.currentChapter || 0, selectIds),
    sceneContext(session.world, session.currentChapter || 0, session.currentScene || '', session.selectedCharacters.map(c => c.name), selectIds),
    '\n场景：' + sceneLabel,
    moodCtx,
    knowledgeCtx,
  ];

  // 路由器叙事方向（意图/基调/场景线索）
  const routerBlock = routerToPrompt(routerDecision);
  if (routerBlock) dynamicParts.push(routerBlock);

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

  // 原著关键角色档案：不在场主角的基础身份始终注入，防止身份/位置幻觉
  const worldChars = (session.world as any)?.characters || [];
  if (worldChars.length > 0) {
    const keyRoster = worldChars.slice(0, 6).map((c: any) =>
      `- ${c.name}：${c.role || '未知身份'}${(c.relationship && c.relationship.status) ? '，与玩家：' + c.relationship.status : ''}${c.personality?.traits?.length ? ' | 性格：' + c.personality.traits.slice(0, 5).join('、') : ''}${c.personality?._deepProfile ? ' | ' + String(c.personality._deepProfile).slice(0, 60) : ''}`
    ).join(String.fromCharCode(10));
    dynamicParts.push('\n【原著关键角色档案（这些角色的身份/学校/位置以此为准，不得混淆）】\n' + keyRoster);
  }

  // 路由器补充：玩家提及但不在场的角色 → 注入完整档案（防身份/位置幻觉）
  if (routerDecision && routerDecision.extraChars.length > 0) {
    const extraLines = routerDecision.extraChars
      .map(name => worldChars.find((c: any) => c.name === name))
      .filter((c: any) => c && c.name)
      .map((c: any) => `- ${c.name}：${c.role || '未知身份'} | 性格：${(c.personality?.traits || []).slice(0, 3).join('、') || '未知'}${c.relationship?.status ? ' | 与玩家：' + c.relationship.status : ''}${c.personality?._deepProfile ? ' | ' + String(c.personality._deepProfile).slice(0, 80) : ''}`);
    if (extraLines.length > 0) {
      dynamicParts.push('\n【本轮相关角色档案（该角色不在场但被玩家提及，其身份/学校/位置以此为准）】\n' + extraLines.join('\n'));
    }
  }

  // 路由器补充：玩家提及的其他章节 → 注入该章原著事件（避免 AI 瞎编旧章剧情）
  if (routerDecision && routerDecision.chapterRefs.length > 0 && isFanfic && session.worldNovelId) {
    try {
      const kb = await loadKnowledgeBase(session.worldNovelId);
      if (kb) {
        const evLines = routerDecision.chapterRefs
          .map((ch: number) => kb.globalTimeline
            .filter((e: any) => (e.chapter || 0) + 1 === ch)
            .slice(0, 2)
            .map((e: any) => `第${ch}章：${e.event}`)
            .join('\n'))
          .filter(Boolean);
        if (evLines.length > 0) {
          dynamicParts.push('\n【玩家提及的章节事件（原著，以此为准）】\n' + evLines.join('\n'));
        }
      }
    } catch {}
  }

  for (const c of session.selectedCharacters) {
    // 焦点角色（路由器指定）注入完整深度画像，非焦点角色省略 deepProfile（减负）
    const deep = focusSet.has(c.name) ? c.personality._deepProfile || '' : '';
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
    if (deep) line += ' | ' + deep.slice(0, 80);
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
    dynamicParts.push('\n原著文风锚定（旁白必须达到这个质感）：' + (session.world as any).styleSamples.slice(0, 2).map((s: string) => '「' + String(s).slice(0, 120) + '」').join('\n'));
  }

  // 叙事导演指示
  const dir = (session as any).directorDecision;
  if (dir) {
    const dirText = directorToPrompt(dir);
    if (dirText) dynamicParts.push(dirText);
  }

  dynamicParts.push('\n【角色引入】需要引入新角色时，只使用【世界角色】中的原著角色（关键角色档案里列出的），在回复末尾添加 ___META___ {"newCharacter":"角色名"}；原著不存在的角色禁止创造');
  dynamicParts.push('【场景】场景发生转变时（如从教室走到广播台），在回复末尾添加 ___META___ {"scene":"新场景名称"}；场景未转变则不添加');

  const dynamicSystem = dynamicParts.filter(p => p && p.trim().length > 0).join('\n');

  // 对话历史：默认保留最近 16 条；路由器指定时按相关轮次保留（保底最近 4 条）
  const HISTORY_LIMIT = 16;
  let historyMsgs = msgsWithUser.slice(1);
  if (routerDecision && routerDecision.historyKeep.length > 0) {
    const keepIdx = new Set<number>(routerDecision.historyKeep);
    const lastIdx = historyMsgs.length - 1;
    for (let i = Math.max(0, lastIdx - 3); i <= lastIdx; i++) keepIdx.add(i);
    // 早期稀疏抽样：每 5 轮取 1 条早期轮次，防止早期支线（角色登场/关系建立）被完全裁掉
    for (let i = 0; i < lastIdx - 3; i += 5) keepIdx.add(i);
    const kept = historyMsgs.filter((_, i) => keepIdx.has(i)).slice(-12);
    historyMsgs = kept.length >= 3 ? kept : historyMsgs.slice(-HISTORY_LIMIT);
  } else if (historyMsgs.length > HISTORY_LIMIT) {
    historyMsgs = historyMsgs.slice(-HISTORY_LIMIT);
  }

  const prompt = [
    { role: 'system' as const, content: stableSystem },
    { role: 'system' as const, content: dynamicSystem },
    ...historyMsgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  return { prompt, chapterPrompt, scenarioBlock };
}
