// ============================================================
//  发送管线 — 阶段 4: 角色推演
// ============================================================

import { simulateCharactersBatch } from '../characterSimulator';
import { profileToPrompt } from '../characterBehaviorSynthesizer';
import type { Character } from '../../types';
import type { CharacterAction } from '../characterSimulator';
import { getWorldState, useWorldSessionStore } from '../../store/worldSessionStore';
import { useConfigStore } from '../../store/configStore';
import { withTag } from '../trace';

/**
 * 阶段 4: 角色推演
 *
 * 会话状态（session / turnCount / activeChars / attitudes / lastSimResults）
 * 全部从 store 读取，不再由组件通过 ref 传入——服务层因此不依赖 render 时机。
 *
 * @param chapterCtx 阶段 3 产出的章节上下文。它是本轮的「输入」而非状态，
 *                   依赖玩家刚发的内容，因此显式传入而非从 store 取。
 */
export async function runCharacterSimulation(chapterCtx?: any): Promise<CharacterAction[]> {
  const store = getWorldState();
  const session = store.session;
  if (!session) return [];

  const cfg = useConfigStore.getState().getActiveConfig();
  if (!cfg) return [];

  const turnCount = store.turnCount;
  const activeChars = store.activeChars;

  console.log('[PIPELINE] stage4 simulation start turn=' + turnCount + ' active=' + activeChars.length);

  // 同人模式：玩家角色不参与推演（玩家的行动由玩家控制，不被 AI 操控）
  const isFanfic = !!session.worldNovelId;
  const playerNames = new Set<string>();
  if (isFanfic && session.selectedCharacters.length > 0) {
    playerNames.add(session.selectedCharacters[0].name);
  }
  const chars = [
    ...session.selectedCharacters
      .filter(c => !playerNames.has(c.name))
      .filter(c => activeChars.includes(c.name))
      .map(c => ({
        name: c.name, personality: c.personality.traits.join('/'), deepPersonality: '',
        role: c.relationship.status, status: c.currentContext.location, goal: '',
        relationship: '亲密' + c.relationship.intimacy + '/100', interactionState: 'active' as const,
      })),
    ...(session.npcs || []).map(n => ({
      name: n.name, personality: n.personality, deepPersonality: '',
      role: n.role, status: n.currentStatus, goal: n.goal || '', relationship: '路人',
      interactionState: activeChars.includes(n.name) ? 'active' as const : 'inactive' as const,
    })),
    ...(isFanfic && turnCount % 3 === 0
      ? (session.world?.characters || [])
          .filter((c: Character) => {
            const n = c.name || '';
            return !session.selectedCharacters.some(sc => sc.name === n) && !(session.npcs || []).some(np => np.name === n);
          })
          .slice(0, 5)
          .map((c: Character) => ({
            name: c.name || '', personality: (c.personality?.traits || ['未知']).join('/'),
            deepPersonality: c.personality._deepProfile || '',
            role: c.relationship?.status || '', status: '故事某处', goal: '',
            relationship: '原著角色', interactionState: 'inactive' as const,
          }))
      : []
    ),
  ];
  if (chars.length === 0) return [];

  const simKbContext: Record<string, string> = {};
  if (chapterCtx?.activeCharacters) {
    for (const c of chars) {
      const kb = chapterCtx.activeCharacters.find((ac: any) => ac.name === c.name);
      if (kb) {
        const parts: string[] = [];
        if (kb.traits?.length) parts.push('性格：' + kb.traits.join('、'));
        if (kb.deepTraits?.length) parts.push('真实性格：' + kb.deepTraits.join('、'));
        if (kb.defenseMechanism) parts.push('防御机制：' + kb.defenseMechanism);
        if (kb.role) parts.push('身份：' + kb.role);
        if (kb.speechStyle) parts.push('说话方式：' + kb.speechStyle);
        if (kb.speechSample) parts.push('台词示例：' + kb.speechSample);
        if (kb.sceneReason) parts.push('出场理由：' + kb.sceneReason);
        if (kb.knowledgeWarning) parts.push('⚠ 知识边界：' + kb.knowledgeWarning);
        simKbContext[c.name] = parts.join('\n');
      }
    }
  }

  // 行为画像映射（同人角色：AI 合成的决策引擎）
  const behaviorProfiles: Record<string, string> = {};
  if (isFanfic) {
    const allChars = [
      ...session.selectedCharacters,
      ...(session.npcs || []).map(n => {
        const wc = ((session.world as any)?.characters || []).find((wc: any) => wc.name === n.name);
        return wc as Character | undefined;
      }).filter(Boolean) as Character[],
      ...(session.world?.characters || []),
    ];
    for (const c of allChars) {
      const bp = c?.personality?.behaviorProfile;
      if (bp && bp.behavioralSummary) {
        behaviorProfiles[c.name] = profileToPrompt(bp);
      }
    }
  }

  try {
    // 情报差隔离：构造每角色可见对话
    // active 角色（在场）→ 看到最近对话；inactive（不在场）→ 无对话情报（系统级隔离，不靠 AI 判断）
    const dialogueByChar: Record<string, string> = {};
    const recentMsgs = (session.messages || []).slice(-6);
    if (recentMsgs.length > 0) {
      const dialogueText = recentMsgs.map(m => {
        const who = m.role === 'user' ? '[玩家]' : '[其他人]';
        return who + '：' + String(m.content || '').slice(0, 80);
      }).join('\n');
      const activeNames = new Set(activeChars);
      for (const c of chars) {
        if (c.interactionState === 'active' && activeNames.has(c.name)) {
          dialogueByChar[c.name] = dialogueText;
        }
      }
    }

    // 一次请求推演全部角色（原先每角色一次，5 人 = 5 次请求 = 首字延迟取 max）
    const result = await withTag('character-sim', () => simulateCharactersBatch(
      cfg, chars, session.currentScene,
      (session.recentWorldEvents || []).slice(-2).join('；'),
      activeChars.join('、'), store.lastSimResults, simKbContext, behaviorProfiles, dialogueByChar
    ));
    const actions = result.actions;

    // 好感度累积：基于 store 里的当前值计算，再整体写回（不再就地改 ref 对象）
    const nextAttitudes = { ...store.attitudes };
    const record: Record<string, { intent: string; mood: string }> = {};
    for (const a of actions) {
      record[a.name] = { intent: a.intent, mood: a.mood };
      if (a.affectionDelta && Math.abs(a.affectionDelta) > 0.001) {
        const prev = nextAttitudes[a.name] || { trust: 50, affection: 0, fear: 20, lastUpdate: '' };
        let delta = a.affectionDelta;
        const aff = prev.affection || 0;
        if (aff > 80) delta *= 0.25;
        else if (aff > 60) delta *= 0.5;
        else if (aff < -50) delta *= 1.5;
        nextAttitudes[a.name] = {
          ...prev,
          affection: Math.max(-100, Math.min(100, aff + delta)),
          lastUpdate: new Date().toISOString(),
        };
      }
    }
    useWorldSessionStore.getState().setLastSimResults(record);
    useWorldSessionStore.getState().setAttitudes(nextAttitudes);

    for (const ch of result.interactionChanges) {
      if (!ch.character_name) continue;
      if (ch.action === 'pull_in') {
        useWorldSessionStore.getState().addActiveChar(ch.character_name);
      } else if (ch.action === 'push_out') {
        useWorldSessionStore.getState().removeActiveChar(ch.character_name);
      }
    }

    return actions;
  } catch (e) {
    console.warn('[sendPipeline] stage4 simulation failed: ' + (e instanceof Error ? e.message : String(e)));
    return [];
  }
}
