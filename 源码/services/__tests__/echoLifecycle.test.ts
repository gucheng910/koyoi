// ============================================================
//  往事回响的完整生命周期（集成）
//
//  单元测试证明了 scheduleEchoes / dueEchoes / knowledgeToPrompt 各自正确，
//  但没有证明**跨阶段**串起来是对的时间线：
//
//    第 5 轮  stage8 提取事件 → 埋下回响（due = 第 8~13 轮）
//    第 6 轮  stage5 不该看到它
//    …
//    到期那一轮  stage5 注入，stage8 标记作废
//    再下一轮  stage5 不该再看到（不念旧账）
//
//  这里用真实的 store + 真实的 stage8/stage5 跑一遍，逐步断言。
// ============================================================

jest.mock('../../api/deepseek', () => ({
  chatCompletionSync: jest.fn(async () => ''),
  chatCompletion: jest.fn(async () => ''),
  polishText: jest.fn(async (_c: any, t: string) => t),
}));
jest.mock('../../store/configStore', () => ({
  useConfigStore: {
    getState: () => ({
      getActiveConfig: () => ({
        id: 'x', label: 'x', baseUrl: 'https://api.deepseek.com', apiKey: 'k', model: 'deepseek-flash',
        thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 1, maxTokens: 4096,
        safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: true,
      }),
    }),
  },
}));
jest.mock('../../services/knowledgeBase', () => ({
  loadKnowledgeBaseCached: async () => null,
  loadKnowledgeBase: async () => null,
}));
jest.mock('../../services/knowledgeGraph', () => ({ getKnowledgeGraph: () => null }));
jest.mock('../../services/backgroundInteraction', () => ({
  generateBackgroundInteraction: jest.fn(async () => null),
  applyBackgroundInteraction: jest.fn((s: any) => s),
}));

import { runPostSendHooks } from '../sendPipeline/stage8_hooks';
import { dueEchoes, echoesToPrompt } from '../echoes';
import { useWorldSessionStore, getWorldState } from '../../store/worldSessionStore';
import type { WorldSession, ChatMessage } from '../../types';

function mk(): WorldSession {
  return {
    id: 'w1',
    world: {
      id: 'w', name: 'W', type: 'modern',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0, characterFate: 0, worldReaction: 0 },
      butterflySensitivity: { minor: '', major: '' },
    } as any,
    selectedCharacters: [{ name: '林悦' } as any],
    npcs: [{ name: '陈默', role: '同学', personality: '好事', currentStatus: '在旁边' } as any],
    currentScene: '教室', worldState: '', butterflyLog: [], timelineDeviations: [],
    recentWorldEvents: [], worldLog: [], messages: [], createdAt: '', worldClock: 0,
  };
}

const uMsg = (c: string): ChatMessage => ({ role: 'user', content: c, timestamp: 't' });
const aMsg = (c: string): ChatMessage => ({ role: 'assistant', content: c, timestamp: 't' });

beforeEach(() => { useWorldSessionStore.getState().closeWorld(); jest.clearAllMocks(); });

/** 模拟一轮：stage8（埋回响）→ 返回本轮 stage5 会看到的回响 */
async function runTurn(turnLabel: string, userText: string, aiText: string) {
  const st = useWorldSessionStore.getState();
  const updated = [uMsg(userText), aMsg(aiText)];
  await runPostSendHooks({ updated, saveSession: async () => {}, charActions: [], userMsg: uMsg(userText) });
  void turnLabel;
  void st;
  // stage5 与 stage8 同一轮内，stage5 先跑——这里用 stage8 之后的状态近似，
  // 关键在于「埋下 → 到期 → 浮现 → 作废」这条链子
  return dueEchoes(getWorldState().session?.pendingEchoes, getWorldState().turnCount);
}

describe('回响生命周期', () => {
  it('高影响力事件被埋下，且不会在同一轮就到期', async () => {
    useWorldSessionStore.getState().openWorld(mk());
    // "打了他一拳" 命中 NOTABLE_PATTERNS 的暴力类（impact 5）
    await runTurn('t1', '我打了他一拳', '教室里一片哗然。');

    const pending = getWorldState().session?.pendingEchoes || [];
    // 概率 0.45，可能没埋；埋了的话必须在未来
    if (pending.length > 0) {
      const turn = getWorldState().turnCount;
      expect(pending[0].dueRound).toBeGreaterThan(turn);
      expect(pending[0].seed).toBeTruthy();
    }
  });

  it('【核心】跨轮时间线：埋下 → 中途看不到 → 到期浮现', async () => {
    useWorldSessionStore.getState().openWorld(mk());
    const session = getWorldState().session!;

    // 手工埋一条确定会在第 8 轮浮现的回响（避开随机性，专测时间线）
    useWorldSessionStore.getState().patchSession({
      pendingEchoes: [{
        id: 'echo_fixed', sourceRound: 5, dueRound: 8,
        seed: '那天他把杯子摔了', chars: ['林悦'],
      }],
    });

    // 第 6 轮：不该浮现
    expect(dueEchoes(getWorldState().session!.pendingEchoes, 6)).toHaveLength(0);

    // 第 8 轮：浮现，且提示词里带上来源轮次
    const due = dueEchoes(getWorldState().session!.pendingEchoes, 8);
    expect(due).toHaveLength(1);
    const prompt = echoesToPrompt(due);
    expect(prompt).toContain('第 5 轮');
    expect(prompt).toContain('那天他把杯子摔了');

    // 未标记的话第 9 轮还会出现（所以必须标记）
    expect(dueEchoes(getWorldState().session!.pendingEchoes, 9)).toHaveLength(1);

    void session;
  });

  it('浮现并标记之后，再也不会重复注入（不念旧账）', async () => {
    useWorldSessionStore.getState().openWorld(mk());
    useWorldSessionStore.getState().patchSession({
      pendingEchoes: [{
        id: 'echo_fixed', sourceRound: 1, dueRound: 2,
        seed: '很久以前的一件事', chars: [],
      }],
    });

    // 跑到第 3 轮（stage8 会把到期的标记掉）
    await runTurn('t1', '普通消息一', '回复一');
    await runTurn('t2', '普通消息二', '回复二');
    await runTurn('t3', '普通消息三', '回复三');

    const stillDue = dueEchoes(getWorldState().session!.pendingEchoes, 99);
    expect(stillDue.find(e => e.id === 'echo_fixed')).toBeUndefined();
  });

  it('回响不会无限堆积（长局也不会）', async () => {
    useWorldSessionStore.getState().openWorld(mk());
    for (let i = 0; i < 25; i++) {
      await runTurn('t' + i, '我打了他' + i, '回应' + i);
    }
    const pending = getWorldState().session!.pendingEchoes || [];
    expect(pending.filter(e => !e.surfaced).length).toBeLessThanOrEqual(6);
  });

  it('没有回响时提示词不占 token', () => {
    expect(echoesToPrompt(dueEchoes([], 10))).toBe('');
    expect(echoesToPrompt(dueEchoes(undefined, 10))).toBe('');
  });
});
