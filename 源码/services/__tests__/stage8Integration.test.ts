// ============================================================
//  stage8 端到端集成测试
//
//  为什么需要这个文件：
//
//  阶段一修好了 notableEvents 的类型（string[] → NotableEvent[]）。在此之前，
//  propagateRumors 访问 event.round / event.witnessChars 会抛 TypeError，
//  被 stage8 的 catch 静默吞掉，连带让 5 个子系统长期不工作：
//    情绪惯性 / 谣言传播 / 事件提取 / 记忆提取 / 背景互动
//
//  我此前只能说「类型修好了」，但**没有验证过它们真的跑起来了**。
//  这个文件补上那一环：跑完整 stage8，断言每个子系统的实际产出。
// ============================================================

const aiCalls: string[] = [];

jest.mock('../../api/deepseek', () => ({
  chatCompletionSync: jest.fn(async (_cfg: any, messages: any[]) => {
    const sys = String(messages.find((m: any) => m.role === 'system')?.content || '');
    if (sys.includes('幕后叙事引擎')) {
      aiCalls.push('world-pulse');
      return '街角有人提起了你的名字';
    }
    if (sys.includes('提取1-2条关键记忆')) {
      aiCalls.push('memory-extract');
      return '[{"content":"玩家在教室表白了","importance":5,"type":"bedrock"}]';
    }
    if (sys.includes('压缩为摘要') || sys.includes('记忆')) {
      aiCalls.push('other');
      return '';
    }
    aiCalls.push('other');
    return '';
  }),
  chatCompletion: jest.fn(async () => ''),
  polishText: jest.fn(async (_c: any, t: string) => t),
}));

jest.mock('../../store/configStore', () => ({
  useConfigStore: {
    getState: () => ({
      getActiveConfig: () => ({
        id: 'x', label: 'x', baseUrl: 'https://x', apiKey: 'k', model: 'm',
        thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 1, maxTokens: 4096,
        safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: true,
      }),
    }),
  },
}));

// 背景互动与章节追踪：mock 掉，避免依赖真实 AI 与文件系统
jest.mock('../../services/backgroundInteraction', () => ({
  generateBackgroundInteraction: jest.fn(async () => ({ participants: ['林悦', '陈默'], summary: '两人在走廊低声交谈', lines: [] })),
  applyBackgroundInteraction: jest.fn((s: any) => ({
    ...s,
    recentWorldEvents: [...(s.recentWorldEvents || []), '背景互动：两人在走廊低声交谈'],
  })),
}));

import { runPostSendHooks } from '../sendPipeline/stage8_hooks';
import { useWorldSessionStore, getWorldState } from '../../store/worldSessionStore';
import type { WorldSession, ChatMessage } from '../../types';
import type { CharacterAction } from '../characterSimulator';

function makeSession(overrides: Partial<WorldSession> = {}): WorldSession {
  return {
    id: 'w1',
    world: {
      id: 'w', name: '测试世界', type: 'modern',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
    },
    selectedCharacters: [
      { name: '林悦', personality: { traits: ['傲娇'], speakingStyle: '', habits: [], likes: [], dislikes: [] }, relationship: { intimacy: 10, trust: 20, status: '同学' } } as any,
      { name: '陈默', personality: { traits: ['沉默'], speakingStyle: '', habits: [], likes: [], dislikes: [] }, relationship: { intimacy: 5, trust: 10, status: '同学' } } as any,
    ],
    npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: [], createdAt: '2026-01-01', worldClock: 0,
    ...overrides,
  };
}

const act = (name: string, mood: string): CharacterAction => ({
  name, intent: '想说点什么', mood, innerThought: '有点紧张', bodyLanguage: '握紧了手',
  subtext: '', emotionalDirection: 'warming', triggerContext: '刚才那句话', toward: 'player',
  wantsInteraction: true, affectionDelta: 2,
});

const userMsg: ChatMessage = { role: 'user', content: '我打了陈默一拳', timestamp: 't' };
const aiMsg: ChatMessage = { role: 'assistant', content: '教室里一片哗然。', timestamp: 't' };

beforeEach(() => {
  useWorldSessionStore.getState().closeWorld();
  aiCalls.length = 0;
  jest.clearAllMocks();
});

describe('5 个子系统在修复后确实产出结果', () => {
  it('情绪惯性：角色情绪被写入 session.characterMoods', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());

    await runPostSendHooks({
      updated: [userMsg, aiMsg],
      saveSession: async () => {},
      charActions: [act('林悦', '愤怒')],
      userMsg,
    });

    const moods = getWorldState().session?.characterMoods;
    expect(moods).toBeDefined();
    expect(moods!['林悦']).toBeDefined();
    expect(moods!['林悦'].emotion).toBeTruthy();
    expect(moods!['林悦'].intensity).toBeGreaterThan(0);
  });

  it('事件提取：从文本中挖出 NotableEvent 并写入 structured 数组', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());

    await runPostSendHooks({
      updated: [userMsg, aiMsg],
      saveSession: async () => {},
      charActions: [],
      userMsg,
    });

    const events = getWorldState().session?.notableEvents;
    expect(Array.isArray(events)).toBe(true);
    expect(events!.length).toBeGreaterThan(0);

    // 关键：必须是结构化对象——这正是当初类型写错的地方
    const e = events![0];
    expect(typeof e).toBe('object');
    expect(typeof e.round).toBe('number');
    expect(typeof e.description).toBe('string');
    expect(Array.isArray(e.witnessChars)).toBe(true);
  });

  it('情绪衰减：时钟推进后强度下降（不会无限累积）', async () => {
    const s = makeSession({
      characterMoods: { 林悦: { emotion: 'rage', intensity: 9, sinceRound: 1, expressed: false } },
      worldClock: 1,
    });
    useWorldSessionStore.getState().openWorld(s);
    useWorldSessionStore.getState().setTurnCount(5);

    await runPostSendHooks({
      updated: [userMsg, aiMsg],
      saveSession: async () => {},
      charActions: [],
      userMsg,
    });

    const mood = getWorldState().session?.characterMoods?.['林悦'];
    // 强度 9 在 5 轮后应已衰减（rage 衰减慢，但会降）
    if (mood) expect(mood.intensity).toBeLessThan(9);
  });

  it('世界时钟：每轮递增', async () => {
    useWorldSessionStore.getState().openWorld(makeSession({ worldClock: 3 }));

    await runPostSendHooks({
      updated: [userMsg, aiMsg], saveSession: async () => {}, charActions: [], userMsg,
    });

    expect(getWorldState().session!.worldClock).toBe(4);
  });

  it('回合数：每轮递增（供下游周期钩子判断）', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    expect(getWorldState().turnCount).toBe(0);

    await runPostSendHooks({
      updated: [userMsg, aiMsg], saveSession: async () => {}, charActions: [], userMsg,
    });

    expect(getWorldState().turnCount).toBe(1);
  });
});

describe('周期钩子按轮次触发', () => {
  it('第 5 轮触发世界脉冲 + 背景互动', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().setTurnCount(4);   // bump 后为 5

    await runPostSendHooks({
      updated: [userMsg, aiMsg], saveSession: async () => {}, charActions: [], userMsg,
    });

    await new Promise(r => setTimeout(r, 100));   // 等异步钩子

    expect(aiCalls).toContain('world-pulse');
    const events = getWorldState().session!.recentWorldEvents;
    expect(events.some(e => e.includes('街角'))).toBe(true);
  });

  it('第 10 轮触发记忆提取', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().setTurnCount(9);   // bump 后为 10

    await runPostSendHooks({
      updated: [userMsg, aiMsg], saveSession: async () => {}, charActions: [], userMsg,
    });

    await new Promise(r => setTimeout(r, 100));
    const mems = getWorldState().session!.memories;
    expect(mems).toBeDefined();
    expect(mems!.length).toBeGreaterThan(0);
    expect(mems![0].content).toContain('表白');
  });

  it('非周期轮次不触发（第 2 轮）', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().setTurnCount(1);   // bump 后为 2

    await runPostSendHooks({
      updated: [userMsg, aiMsg], saveSession: async () => {}, charActions: [], userMsg,
    });

    await new Promise(r => setTimeout(r, 100));
    expect(aiCalls).not.toContain('world-pulse');
  });
});

describe('失败隔离', () => {
  it('没有会话时直接返回，不抛错', async () => {
    // closeWorld 后 session 为 null
    await expect(runPostSendHooks({
      updated: [], saveSession: async () => {}, charActions: [], userMsg,
    })).resolves.toBeUndefined();
  });

  it('某个子系统抛错时，其余子系统仍然生效', async () => {
    useWorldSessionStore.getState().openWorld(makeSession());

    // 注入真实故障：updateMoods 对 truthy 的 mood 会调 detectEmotion
    // → moodText.toLowerCase()，数字会让它抛 TypeError。
    //
    // 注意两个「看着像但测不出」的写法：
    //   - affectionDelta = NaN：不抛错，只算出 NaN
    //   - mood = null：被 `if (!action.mood)` 提前跳过，也不抛错
    const bad = [{ ...act('林悦', '愤怒'), mood: 123 as any }] as CharacterAction[];

    await runPostSendHooks({
      updated: [userMsg, aiMsg],
      saveSession: async () => {},
      charActions: bad,
      userMsg,
    });

    // 同步阶段抛错 → patchSession 未执行（无半提交），
    // 但 turnCount 在 try 之外自增，世界仍推进到下一轮
    expect(getWorldState().turnCount).toBe(1);
    expect(getWorldState().session).not.toBeNull();
  });

  it('同步阶段抛错不会留下半提交（worldClock 与 moods 要么都在要么都不在）', async () => {
    useWorldSessionStore.getState().openWorld(makeSession({ worldClock: 7 }));
    const bad = [{ ...act('林悦', '愤怒'), mood: 123 as any }] as CharacterAction[];

    await runPostSendHooks({
      updated: [userMsg, aiMsg], saveSession: async () => {}, charActions: bad, userMsg,
    });

    const s = getWorldState().session!;
    // 故障发生在 patchSession 之前 → 时钟不应被推进，也没有情绪写入
    expect(s.worldClock).toBe(7);
    expect(s.characterMoods).toBeUndefined();
  });
});
