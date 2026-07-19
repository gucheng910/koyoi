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
import { decayMoods } from '../emotionalInertia';
import { generateWorldPulse } from '../worldClock';
import { extractNotableEvents, propagateRumors } from '../rumorPropagation';
import type { WorldSession, ChatMessage } from '../../types';
import type { CharacterAction } from '../characterSimulator';

export interface PostSendHooksParams {
  session: WorldSession;
  updated: ChatMessage[];
  turnCount: React.MutableRefObject<number>;
  saveSession: (msgs?: ChatMessage[]) => Promise<void>;
  setSession: React.Dispatch<React.SetStateAction<WorldSession>>;
  activeChars: React.MutableRefObject<string[]>;
  lastSimResults: React.MutableRefObject<Record<string, { intent: string; mood: string }>>;
  charActions?: CharacterAction[];
  userMsg?: ChatMessage;
}

export async function runPostSendHooks(params: PostSendHooksParams) {
  const { updated, turnCount, saveSession, setSession, session, charActions, userMsg } = params;

  turnCount.current++;

  // 直接更新 session 对象（同步到 sessionRef），再走 setSession 通知 UI
  session.worldClock = (session.worldClock || 0) + 1;
  setSession(prev => ({ ...prev, worldClock: session.worldClock }));

  const updatedMoods = decayMoods(
    session.characterMoods || {},
    turnCount.current
  );

  const lastUserMsg = userMsg?.content || '';
  const lastAIRes = updated.length > 0 ? updated[updated.length - 1]?.content || '' : '';
  const newEvents = extractNotableEvents(session, lastUserMsg, lastAIRes, turnCount.current);
  const allEvents = [...(session.notableEvents || []), ...newEvents].slice(-20);

  let updatedKnowledge: Record<string, any> | undefined;
  if (allEvents.length > 0) {
    try {
      const kb = session.worldNovelId ? await loadKnowledgeBase(session.worldNovelId) : null;
      if (kb) {
        const graph = new KnowledgeGraph(kb, session.currentChapter || 0);
        const tempSession = { ...session, notableEvents: allEvents, worldClock: turnCount.current };
        updatedKnowledge = propagateRumors(tempSession as any, graph);
      }
    } catch {}
  }

  // 直接更新 session 对象，确保 saveSession 读到最新值
  session.characterMoods = updatedMoods;
  session.notableEvents = allEvents;
  if (updatedKnowledge) session.characterKnowledge = updatedKnowledge;
  setSession(prev => ({
    ...prev,
    characterMoods: updatedMoods,
    notableEvents: allEvents,
    characterKnowledge: updatedKnowledge || prev.characterKnowledge,
  }));

  if (turnCount.current % 5 === 0) {
    // 此时 session 已包含最新的 moods/events/knowledge，可以安全保存
    const sessionForPulse = { ...session, worldClock: turnCount.current };
    generateWorldPulse(sessionForPulse as any, turnCount.current).then(pulse => {
      if (pulse) {
        setSession(prev => ({
          ...prev,
          recentWorldEvents: [...prev.recentWorldEvents.slice(-10), pulse.summary],
          worldLog: [...prev.worldLog, ...pulse.events],
        }));
      }
    }).catch(() => { console.warn('[sendPipeline] world pulse failed'); });
    saveSession(updated);
  }

  if (turnCount.current % 3 === 0 && session.worldNovelId) {
    const cfg = useConfigStore.getState().getActiveConfig();
    if (cfg) {
      const recentTexts = updated.slice(-6).filter((m: any) => !m.isStreaming).map((m: any) => m.content).join('\n');
      estimateChapterPosition(cfg, session.worldNovelId, session.currentChapter || 0, [recentTexts])
        .then((pos: any) => {
          const newCh = shouldAdvanceChapter(session.currentChapter || 0, pos);
          if (newCh !== null) setSession(prev => ({ ...prev, currentChapter: newCh }));
        }).catch(() => { console.warn('[sendPipeline] chapter tracking failed'); });
    }
  }

  if (turnCount.current % 10 === 0) {
    const mcfg = useConfigStore.getState().getActiveConfig();
    if (mcfg) {
      extractMemories(mcfg.apiKey, mcfg.baseUrl, mcfg.model, updated, params.lastSimResults.current)
        .then(async (mems: string[]) => {
          if (!mems.length) return;
          setSession(prev => {
            let merged = [...(prev.memories || []), ...mems];
            if (merged.length > 25) {
              reSummarizeMemories(mcfg.apiKey, mcfg.baseUrl, mcfg.model, merged as any).then(compressed => {
                if (compressed) setSession(p => ({ ...p, memories: compressed.slice(-30) }));
              }).catch(() => { console.warn('[sendPipeline] memory re-summarize failed'); });
            }
            return { ...prev, memories: merged.slice(-30) };
          });
        });
    }
  }

  if (turnCount.current % 5 === 0 && session.selectedCharacters.length >= 2) {
    const bcfg = useConfigStore.getState().getActiveConfig();
    if (bcfg) {
      const activeList = session.selectedCharacters.map(c => ({
        name: c.name, personality: c.personality.traits.join('/'),
        status: c.currentContext?.mood || '平静', relationship: c.relationship?.status || '陌生人',
      }));
      generateBackgroundInteraction(bcfg, activeList, session.currentScene || '未知场景')
        .then((interaction: any) => {
          if (interaction) setSession(prev => applyBackgroundInteraction(prev, interaction));
        }).catch(() => { console.warn('[sendPipeline] background interaction failed'); });
    }
  }
}
