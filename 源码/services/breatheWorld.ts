// ============================================================
//  世界呼吸服务
//  生成玩家视线之外的世界事件
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { useConfigStore } from '../store/configStore';
import { withSilentRetry } from './retry';
import type { WorldLogEntry, WorldSession } from '../types';

export interface BreatheWorldParams {
  session: WorldSession;
  setSession: (updater: (prev: WorldSession) => WorldSession) => void;
  turnCount: number;
}

/**
 * 生成一条世界事件（在玩家视线之外发生的事）
 */
export async function breatheWorld(params: BreatheWorldParams): Promise<void> {
  const { session, setSession, turnCount } = params;
  const cfg = useConfigStore.getState().getActiveConfig();
  if (!cfg) { console.log('[WORLD] breatheWorld skipped: no config'); return; }
  console.log('[WORLD] breatheWorld start turn=' + turnCount);

  try {
    const lastEvents = (session.worldLog || []).filter(e => e.type === 'world_event' || e.type === 'chain_reaction').slice(-3);
    const eventContext = lastEvents.length > 0
      ? `最近发生的事件：${lastEvents.map(e => e.content).join('；')}`
      : '';

    const prompt = [
      { role: 'system' as const, content: `你是${session.world.name}的幕后叙事者。生成一条在玩家视线之外发生的世界事件。40字以内，中文。要求：1.事件必须具体 2.涉及具体的NPC/势力/地点 3.可能在未来影响玩家` },
      { role: 'user' as const, content: `世界局势：${session.worldState || '未知'}\n${eventContext}\n${session.selectedCharacters.map(c => c.name).join('、')}在这个世界。\n生成一条世界事件：` },
    ];
    const result = await withSilentRetry(() => chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { maxTokens: 100, temperature: 0.85 }), '');
    const clean = (result || '世界某处发生了一些事').replace(/["「」]/g, '').trim().slice(0, 60);

    const entry: WorldLogEntry = {
      id: 'we_' + Date.now(), type: 'world_event', content: clean,
      timestamp: new Date().toISOString(), round: turnCount,
    };

    setSession(prev => ({
      ...prev,
      recentWorldEvents: [...prev.recentWorldEvents.slice(-10), clean],
      worldLog: [...prev.worldLog, entry],
    }));

    // 连锁反应
    if (Math.random() < 0.3 && lastEvents.length > 0) {
      const chainClean = clean;
      const chainCfg = cfg;
      setTimeout(() => {
        breatheChain(chainClean, chainCfg as any, setSession, turnCount);
      }, 2000);
    }
  } catch {}
}

async function breatheChain(
  triggerEvent: string,
  cfg: any,
  setSession: (updater: (prev: WorldSession) => WorldSession) => void,
  turnCount: number,
) {
  try {
    const chainPrompt = [
      { role: 'system' as const, content: `刚刚发生了一件事："${triggerEvent}"。这件事引发的连锁反应是什么？用一句30字以内的中文描述后果。` },
      { role: 'user' as const, content: '连锁反应：' },
    ];
    const chainResult = await chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, chainPrompt, { maxTokens: 80, temperature: 0.9 });
    const chainClean = chainResult.replace(/["「」]/g, '').trim().slice(0, 50);
    const chainEntry: WorldLogEntry = {
      id: 'cr_' + Date.now(), type: 'chain_reaction',
      content: '↳ ' + chainClean,
      timestamp: new Date().toISOString(), round: turnCount,
    };
    setSession(prev => ({ ...prev, worldLog: [...prev.worldLog, chainEntry] }));
  } catch {}
}
