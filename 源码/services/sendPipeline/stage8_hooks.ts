// ============================================================
//  发送管线 — 阶段 8: 后处理钩子
//  包含世界时钟、情绪惯性与衰减、谣言传播、世界呼吸、
//  章节追踪、记忆提取、角色自主互动
// ============================================================

import React from 'react';
import { useConfigStore } from '../../store/configStore';
import { estimateChapterPosition, shouldAdvanceChapter } from '../chapterTracker';
import { reSummarizeMemories } from '../memoryManager';
import { extractMemories } from '../worldInfoService';
import { generateBackgroundInteraction, applyBackgroundInteraction } from '../backgroundInteraction';
import { loadKnowledgeBase } from '../knowledgeBase';
import { KnowledgeGraph } from '../knowledgeGraph';
import { decayMoods, updateMoods } from '../emotionalInertia';
import { generateWorldPulse } from '../worldClock';
import { extractNotableEvents, propagateRumors } from '../rumorPropagation';
import type { WorldSession, ChatMessage, CharacterKnowledge, MemoryItem } from '../../types';
import type { CharacterAction } from '../characterSimulator';
import { getWorldState, useWorldSessionStore } from '../../store/worldSessionStore';

export interface PostSendHooksParams {
  updated: ChatMessage[];
  saveSession: (msgs?: ChatMessage[]) => Promise<void>;
  charActions?: CharacterAction[];
  userMsg?: ChatMessage;
}

export async function runPostSendHooks(params: PostSendHooksParams) {
  const { updated, saveSession, charActions, userMsg } = params;

  // 从 store 读当前值，而不是从组件传进来的 ref——
  // 服务层不再依赖组件的 render 时机，也不再有「state 与 ref 分叉」的窗口
  const store = getWorldState();
  const session = store.session;
  if (!session) {
    console.warn('[sendPipeline] stage8 skipped: no active session in store');
    return;
  }

  // 回合自增：store 是唯一真源
  const turn = useWorldSessionStore.getState().bumpTurn();
  console.log('[PIPELINE] stage8 hooks start turn=' + turn);

  // hooks 整体保护：任一子逻辑抛错不得中断后续（保存已在 send 主流程完成，hooks 失败不影响数据）
  try {

  useWorldSessionStore.getState().patchSession({ worldClock: (session.worldClock || 0) + 1 });

  // 情绪惯性：将角色推演结果同步到情绪系统
  if (charActions && charActions.length > 0) {
    const updatedMoodsFromActions = updateMoods(charActions, session.characterMoods || {}, turn);
    useWorldSessionStore.getState().setMoods(updatedMoodsFromActions);
    console.log('[MOOD] updated from ' + Object.keys(updatedMoodsFromActions).length + ' chars');
  }

  // 情绪衰减（即使没有推演结果也执行）
  // 注意：读 store 最新值而非上面那份 session 快照——moods 可能刚被更新
  const updatedMoods = decayMoods(
    getWorldState().session?.characterMoods || {},
    turn
  );

  const lastUserMsg = userMsg?.content || '';
  const lastAIRes = updated.length > 0 ? updated[updated.length - 1]?.content || '' : '';
  const newEvents = extractNotableEvents(session, lastUserMsg, lastAIRes, turn);
  const allEvents = [...(session.notableEvents || []), ...newEvents].slice(-20);

  let updatedKnowledge: Record<string, CharacterKnowledge> | undefined;
  if (allEvents.length > 0) {
    try {
      const kb = session.worldNovelId ? await loadKnowledgeBase(session.worldNovelId) : null;
      if (kb) {
        const graph = new KnowledgeGraph(kb, session.currentChapter || 0);
        const tempSession: WorldSession = { ...session, notableEvents: allEvents, worldClock: turn };
        updatedKnowledge = propagateRumors(tempSession, graph);
      }
    } catch (e) {
      console.warn('[sendPipeline] rumor propagation failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // 一次性提交本轮的所有派生状态（不再就地改写 session 对象）
  useWorldSessionStore.getState().patchSession({
    characterMoods: updatedMoods,
    notableEvents: allEvents,
    ...(updatedKnowledge ? { characterKnowledge: updatedKnowledge } : {}),
  });

  if (turn % 5 === 0) {
    generateWorldPulse({ ...session, worldClock: turn } as any, turn).then(pulse => {
      if (!pulse) return;
      // 用 store 的最新值计算，避免覆盖这期间的其他更新
      const cur = getWorldState().session;
      if (!cur) return;
      useWorldSessionStore.getState().patchSession({
        recentWorldEvents: [...(cur.recentWorldEvents || []).slice(-10), pulse.summary],
        worldLog: [...(cur.worldLog || []), ...pulse.events],
      });
    }).catch(() => { console.warn('[sendPipeline] world pulse failed'); });
  }

  // 每轮保存：防止崩溃/杀进程丢对话（曾因仅每5轮保存导致6轮对话丢失）
  saveSession(updated);

  // 叙事导演已并入内容路由器（每轮输出 tone/intent/sceneHint），此处不再独立调用

  if (turn % 3 === 0 && session.worldNovelId) {
    const cfg = useConfigStore.getState().getActiveConfig();
    if (cfg) {
      const recentTexts = updated.slice(-6).filter((m: any) => !m.isStreaming).map((m: any) => m.content).join('\n');
      estimateChapterPosition(cfg, session.worldNovelId, session.currentChapter || 0, [recentTexts])
        .then((pos: any) => {
          // setChapter 内含单调性保护：乱序回来的旧结果不会把章节拉回去
          const newCh = shouldAdvanceChapter(getWorldState().session?.currentChapter || 0, pos);
          if (newCh !== null) useWorldSessionStore.getState().setChapter(newCh);
        }).catch(() => { console.warn('[sendPipeline] chapter tracking failed'); });
    }
  }

  if (turn % 10 === 0) {
    const mcfg = useConfigStore.getState().getActiveConfig();
    if (mcfg) {
      const simResults = getWorldState().lastSimResults;
      extractMemories(mcfg.apiKey, mcfg.baseUrl, mcfg.model, updated, simResults)
        .then(async (mems: MemoryItem[]) => {
          if (!mems.length) return;
          const cur = getWorldState().session;
          if (!cur) return;
          const merged = [...(cur.memories || []), ...mems];
          useWorldSessionStore.getState().patchSession({ memories: merged.slice(-30) });

          if (merged.length > 25) {
            reSummarizeMemories(mcfg.apiKey, mcfg.baseUrl, mcfg.model, merged).then(compressed => {
              if (compressed) useWorldSessionStore.getState().patchSession({ memories: compressed.slice(-30) });
            }).catch(() => { console.warn('[sendPipeline] memory re-summarize failed'); });
          }
        });
    }
  }

  if (turn % 5 === 0 && (session.selectedCharacters.length + (session.npcs || []).length) >= 2) {
    const bcfg = useConfigStore.getState().getActiveConfig();
    if (bcfg) {
      // 合并选中角色 + 世界 NPC + 世界角色库中的未出场角色
      const allChars = [
        ...session.selectedCharacters.map(c => ({
          name: c.name, personality: c.personality.traits.join('/'),
          status: c.currentContext?.mood || '平静', relationship: c.relationship?.status || '陌生人',
        })),
        ...(session.npcs || []).map(n => ({
          name: n.name, personality: n.personality || '未知',
          status: n.currentStatus || '平静', relationship: '路人',
        })),
      ];
      const activeList = allChars.slice(0, 6);
      generateBackgroundInteraction(bcfg, activeList, session.currentScene || '未知场景')
        .then((interaction: any) => {
          if (!interaction) return;
          const cur = getWorldState().session;
          if (!cur) return;
          useWorldSessionStore.getState().patchSession(applyBackgroundInteraction(cur, interaction));
        }).catch(() => { console.warn('[sendPipeline] background interaction failed'); });
    }
  }
  } catch (e) {
    console.warn('[sendPipeline] stage8 hooks error: ' + (e instanceof Error ? e.message : String(e)));
  }
}
