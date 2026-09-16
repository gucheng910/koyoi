// ============================================================
//  谣言传播回归测试
//
//  背景：types/index.ts 曾把 WorldSession.notableEvents 声明为 string[]，
//  而 rumorPropagation 全程按 NotableEvent 对象使用（event.round /
//  event.witnessChars / event.description）。这导致：
//    - roundsSince 算出 NaN（NaN > 20 恒为 false）
//    - for...of undefined 抛 TypeError
//    - 异常被 stage8_hooks 的 catch 静默吞掉
//  于是谣言系统 + 依赖它的 4 个子系统长期失效。
//
//  这些测试锁住「结构化对象」这一契约，防止类型再次漂移。
// ============================================================

import { extractNotableEvents, propagateRumors, knowledgeToPrompt } from '../rumorPropagation';
import type { WorldSession, NotableEvent, Character } from '../../types';

/** 造一个最小的 WorldSession */
function makeSession(overrides: Partial<WorldSession> = {}): WorldSession {
  return {
    id: 'test',
    world: {
      id: 'w', name: '测试世界', type: 'modern',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
    },
    selectedCharacters: [
      { name: '林悦' } as Character,
      { name: '陈默' } as Character,
    ],
    npcs: [],
    currentScene: '教室',
    worldState: '',
    butterflyLog: [],
    timelineDeviations: [],
    recentWorldEvents: [],
    worldLog: [],
    messages: [],
    createdAt: '2026-01-01',
    worldClock: 10,
    ...overrides,
  };
}

const sampleEvent: NotableEvent = {
  id: 'ne_5_public_action',
  round: 5,
  type: 'public_action',
  description: '林悦在教室打了陈默一拳',
  involvedChars: ['林悦'],
  witnessChars: ['陈默'],
  visibility: 'public',
  impact: 5,
};

describe('extractNotableEvents', () => {
  it('从文本中提取事件，返回结构化对象（非字符串）', () => {
    const events = extractNotableEvents(makeSession(), '我揍了他一拳', '教室里一片哗然', 5);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);

    const e = events[0];
    // 关键契约：必须是对象，且字段可读
    expect(typeof e).toBe('object');
    expect(typeof e.round).toBe('number');
    expect(typeof e.description).toBe('string');
    expect(Array.isArray(e.witnessChars)).toBe(true);
    expect(Array.isArray(e.involvedChars)).toBe(true);
  });

  it('round 字段是数字而非 undefined（NaN 会静默禁用陈旧清理）', () => {
    const events = extractNotableEvents(makeSession(), '我吻了她', '她愣住了', 7);
    for (const e of events) {
      expect(Number.isFinite(e.round)).toBe(true);
      expect(e.round).toBe(7);
    }
  });

  it('最多返回 3 条', () => {
    const events = extractNotableEvents(
      makeSession(),
      '打了他，然后吻了她，还给了她钱，最后说了秘密',
      '教室里吵成一片',
      3,
    );
    expect(events.length).toBeLessThanOrEqual(3);
  });
});

describe('propagateRumors', () => {
  it('目击者获得亲眼所见的知识（不抛异常）', () => {
    const session = makeSession({ notableEvents: [sampleEvent], worldClock: 5 });
    const knowledge = propagateRumors(session);

    expect(knowledge['陈默']).toBeDefined();
    expect(knowledge['陈默'].knownFacts.length).toBeGreaterThan(0);
    expect(knowledge['陈默'].knownFacts[0].source).toBe('亲眼所见');
  });

  it('不因 event.witnessChars 为 undefined 而抛错', () => {
    // 这是原 bug 的直接复现条件：NotableEvent 被当作对象访问
    const session = makeSession({ notableEvents: [sampleEvent], worldClock: 5 });
    expect(() => propagateRumors(session)).not.toThrow();
  });

  it('世界时钟大幅推进后，陈旧信息被清理（依赖 round 是数字）', () => {
    const session = makeSession({ notableEvents: [sampleEvent], worldClock: 100 });
    const knowledge = propagateRumors(session);
    // learnedAt=5，worldClock=100，差值 95 > 30 → 应被过滤
    const facts = knowledge['陈默']?.knownFacts ?? [];
    expect(facts.length).toBe(0);
  });

  it('空 notableEvents 不崩溃', () => {
    expect(() => propagateRumors(makeSession({ notableEvents: [] }))).not.toThrow();
    expect(() => propagateRumors(makeSession({ notableEvents: undefined }))).not.toThrow();
  });
});

describe('knowledgeToPrompt', () => {
  it('把角色已知信息渲染为提示词文本', () => {
    const knowledge = {
      '陈默': {
        knownFacts: [
          { fact: '林悦打了他', certainty: 0.9, source: '亲眼所见', learnedAt: 5 },
        ],
      },
    };
    const text = knowledgeToPrompt(knowledge, ['陈默']);
    expect(text).toContain('陈默');
    expect(text).toContain('林悦打了他');
  });

  it('无相关信息时返回空串', () => {
    expect(knowledgeToPrompt({}, ['陈默'])).toBe('');
  });
});
