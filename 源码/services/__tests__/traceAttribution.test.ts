// ============================================================
//  追踪归因的端到端验证
//
//  单元测试证明了 trace 模块自身正确；这里证明**真实管线**里的调用
//  确实被归到了正确的子系统——否则诊断面板看到的是「other」一片。
// ============================================================

const calls: { url: string; body: any }[] = [];

jest.mock('../../api/deepseek', () => {
  const actual = jest.requireActual('../../api/deepseek');
  return {
    ...actual,
    chatCompletionSync: jest.fn(async (cfg: any, messages: any[]) => {
      // 复用真实实现的计费/归因逻辑：直接调 recordUsage 的等价路径
      const { recordCall } = jest.requireActual('../trace');
      recordCall({
        model: cfg.model, durationMs: 10, ok: true,
        inputTokens: 100, outputTokens: 50, cacheHitTokens: 0, costRmb: 0.001,
      });
      const sys = String(messages.find((m: any) => m.role === 'system')?.content || '');
      if (sys.includes('内容路由决策器')) return '{"intent":"闲聊","select":[],"historyKeep":[]}';
      if (sys.includes('提取1-2条关键记忆')) return '[{"content":"m","importance":3,"type":"core"}]';
      return '[]';
    }),
    chatCompletion: jest.fn(async () => '正文'),
    polishText: jest.fn(async (_c: any, t: string) => {
      const { recordCall } = jest.requireActual('../trace');
      recordCall({ model: 'm', durationMs: 20, ok: true, inputTokens: 200, outputTokens: 100, cacheHitTokens: 0, costRmb: 0.002 });
      return t;
    }),
  };
});

jest.mock('../../store/configStore', () => ({
  useConfigStore: {
    getState: () => ({
      getActiveConfig: () => ({
        id: 'x', label: 'x', baseUrl: 'https://x', apiKey: 'k', model: 'm',
        thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 1, maxTokens: 4096,
        safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: true, isDefault: true,
      }),
    }),
  },
}));

jest.mock('../backgroundInteraction', () => ({
  generateBackgroundInteraction: jest.fn(async () => {
    const { recordCall } = jest.requireActual('../trace');
    recordCall({ model: 'm', durationMs: 5, ok: true, inputTokens: 50, outputTokens: 20, cacheHitTokens: 0, costRmb: 0.0005 });
    return { participants: [], summary: 'x', lines: [] };
  }),
  applyBackgroundInteraction: jest.fn((s: any) => s),
}));

import { routeContent } from '../sendPipeline/stage4_5_router';
import { postProcessResponse } from '../sendPipeline/stage7_post';
import { runPostSendHooks } from '../sendPipeline/stage8_hooks';
import { useWorldSessionStore, getWorldState } from '../../store/worldSessionStore';
import { clearTrace, summarizeByTag, getTrace } from '../trace';
import type { WorldSession, ChatMessage } from '../../types';

const cfg: any = {
  id: 'x', label: 'x', baseUrl: 'https://x', apiKey: 'k', model: 'm', thinkingMode: 'disabled',
  reasoningEffort: 'high', temperature: 1, maxTokens: 4096, safetyFilter: 'off',
  streamOutput: false, showSystemPrompt: false, autoPolish: true, isDefault: true,
};

function mk(overrides: Partial<WorldSession> = {}): WorldSession {
  return {
    id: 'w1',
    world: {
      id: 'w', name: '世界', type: 'fanfic',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
      writingStyle: '冷峻',
    },
    selectedCharacters: [
      { name: '林悦', personality: { traits: ['a'], speakingStyle: '', habits: [], likes: [], dislikes: [] }, relationship: { intimacy: 1, trust: 1, status: 'x' } } as any,
      { name: '陈默', personality: { traits: ['b'], speakingStyle: '', habits: [], likes: [], dislikes: [] }, relationship: { intimacy: 1, trust: 1, status: 'x' } } as any,
    ],
    npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: [], createdAt: '', worldNovelId: 'n1', worldClock: 0,
    ...overrides,
  };
}

const uMsg: ChatMessage = { role: 'user', content: 'hi', timestamp: 't' };
const aMsg: ChatMessage = { role: 'assistant', content: 'yo', timestamp: 't' };

beforeEach(() => {
  clearTrace();
  useWorldSessionStore.getState().closeWorld();
  jest.clearAllMocks();
});

describe('真实管线的归因', () => {
  it('router 调用被归到 router 而不是 other', async () => {
    const s = mk();
    await routeContent(cfg, s, [uMsg, aMsg], 'hi');

    const s2 = summarizeByTag();
    expect(s2.some(x => x.tag === 'router')).toBe(true);
    expect(s2.every(x => x.tag !== 'other')).toBe(true);
  });

  it('polish 调用被归到 polish', async () => {
    const s = mk();
    postProcessResponse('正文内容', s, cfg, { chapterText: 'x' });
    await new Promise(r => setImmediate(r));

    expect(summarizeByTag().some(x => x.tag === 'polish')).toBe(true);
  });

  it('stage8 的异步钩子分别归到自己的标签', async () => {
    const s = mk();
    useWorldSessionStore.getState().openWorld(s);
    useWorldSessionStore.getState().setTurnCount(9);   // bump → 10，命中全部钩子

    await runPostSendHooks({
      updated: [uMsg, aMsg], saveSession: async () => {}, charActions: [], userMsg: uMsg,
    });
    await new Promise(r => setTimeout(r, 150));

    const tags = summarizeByTag().map(x => x.tag);
    expect(tags).toContain('memory-extract');
    expect(tags).toContain('world-pulse');
    expect(tags).toContain('background-interaction');
  });

  it('归因结果里没有「other」——说明每个调用点都打了标签', async () => {
    const s = mk();
    useWorldSessionStore.getState().openWorld(s);
    useWorldSessionStore.getState().setTurnCount(4);   // bump → 5

    await routeContent(cfg, s, [uMsg, aMsg], 'hi');
    postProcessResponse('正文', s, cfg, { chapterText: 'x' });
    await runPostSendHooks({
      updated: [uMsg, aMsg], saveSession: async () => {}, charActions: [], userMsg: uMsg,
    });
    await new Promise(r => setTimeout(r, 150));

    const tags = summarizeByTag();
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.map(t => t.tag)).not.toContain('other');
  });

  it('开销可按子系统累加（诊断面板的核心用途）', async () => {
    const s = mk();
    await routeContent(cfg, s, [uMsg, aMsg], 'hi');
    postProcessResponse('正文', s, cfg, { chapterText: 'x' });
    await new Promise(r => setImmediate(r));

    const rows = summarizeByTag();
    const total = rows.reduce((a, r) => a + r.costRmb, 0);
    expect(total).toBeGreaterThan(0);
    // 每行都有可展示的字段
    for (const r of rows) {
      expect(typeof r.calls).toBe('number');
      expect(typeof r.avgMs).toBe('number');
    }
  });
});
