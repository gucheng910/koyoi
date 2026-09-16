// ============================================================
//  会话状态一致性（阶段三回归测试）
//
//  这个测试锁住的是阶段三要解决的那个具体缺陷：
//
//  stage8_hooks 原先直接就地改写它收到的 session 对象
//  （session.worldClock = ... / session.characterMoods = ...），
//  而那个对象来自组件在 render 期间才对齐的 sessionRef.current。
//  setSession 造出新对象后、下一次 render 重新赋值前，两者分叉，
//  这个窗口内 saveSession 读到的是被就地改过的旧对象。
//
//  迁到 store 后：唯一真源是 store，服务层用 getState() 读到的
//  永远是最新值，不存在「窗口」。
// ============================================================

import { useWorldSessionStore, getWorldState } from '../worldSessionStore';
import { updateMoods, decayMoods } from '../../services/emotionalInertia';
import type { WorldSession } from '../../types';
import type { CharacterAction } from '../../services/characterSimulator';

function makeSession(overrides: Partial<WorldSession> = {}): WorldSession {
  return {
    id: 'w1',
    world: {
      id: 'w', name: '世界', type: 'modern',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
    },
    selectedCharacters: [{ name: '林悦' } as any, { name: '陈默' } as any],
    npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: [], createdAt: '2026-01-01', worldClock: 0,
    ...overrides,
  };
}

const action = (name: string, mood: string, affectionDelta = 0): CharacterAction => ({
  name, intent: '想说点什么', mood, innerThought: '', bodyLanguage: '',
  subtext: '', emotionalDirection: 'holding', triggerContext: '', toward: 'player',
  wantsInteraction: true, affectionDelta,
});

beforeEach(() => { useWorldSessionStore.getState().closeWorld(); });

describe('服务层读取的是最新状态，不是过期快照', () => {
  it('patchSession 之后立即可见于 getWorldState（无需 render）', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().patchSession({ worldClock: 7 });
    expect(getWorldState().session!.worldClock).toBe(7);
  });

  it('模拟 stage8 连续更新：每次都基于最新值，不互相覆盖', () => {
    useWorldSessionStore.getState().openWorld(makeSession());

    // stage8 的时序：推进时钟 → 更新情绪 → 衰减 → 提交
    useWorldSessionStore.getState().patchSession({ worldClock: 1 });
    useWorldSessionStore.getState().setMoods(
      updateMoods([action('林悦', '愤怒')], getWorldState().session!.characterMoods || {}, 1)
    );
    const decayed = decayMoods(getWorldState().session!.characterMoods || {}, 1);
    useWorldSessionStore.getState().setMoods(decayed);
    useWorldSessionStore.getState().patchSession({ notableEvents: [] });

    const s = getWorldState().session!;
    expect(s.worldClock).toBe(1);                  // 前面写的没被后面覆盖
    expect(s.characterMoods).toBeDefined();        // 情绪写进去了
    expect(s.notableEvents).toEqual([]);
  });

  it('没有「就地改写后又造新对象」导致的分叉', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    const before = getWorldState().session!;

    useWorldSessionStore.getState().patchSession({ worldClock: 3 });

    const after = getWorldState().session!;
    // store 走不可变更新：必须是新对象，且旧对象未被污染
    expect(after).not.toBe(before);
    expect(before.worldClock).toBe(0);   // 原对象保持不变
    expect(after.worldClock).toBe(3);
  });

  it('session.messages 与顶层 messages 始终同源', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    const m = { role: 'user' as const, content: '你好', timestamp: 't' };

    useWorldSessionStore.getState().pushMessage(m);
    expect(getWorldState().session!.messages).toEqual(getWorldState().messages);

    useWorldSessionStore.getState().setMessages([m, { role: 'assistant' as const, content: 'hi', timestamp: 't' }]);
    expect(getWorldState().session!.messages).toEqual(getWorldState().messages);
    expect(getWorldState().messages).toHaveLength(2);
  });
});

describe('回合数与章节的单调性', () => {
  it('bumpTurn 连击后回合数正确', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    for (let i = 0; i < 5; i++) useWorldSessionStore.getState().bumpTurn();
    expect(getWorldState().turnCount).toBe(5);
  });

  it('乱序的后台章节回调不会把章节拉回去', () => {
    useWorldSessionStore.getState().openWorld(makeSession({ currentChapter: 2 }));

    // 模拟两个并发后台回调：慢的先发出、快的后返回
    useWorldSessionStore.getState().setChapter(9);   // 快
    useWorldSessionStore.getState().setChapter(4);   // 慢（基于旧状态算出的结果）

    expect(getWorldState().session!.currentChapter).toBe(9);
  });
});

describe('切换世界时状态不泄漏', () => {
  it('closeWorld 后 openWorld 得到干净状态', () => {
    const A = makeSession({ messages: [{ role: 'user', content: 'A', timestamp: 't' }] });
    useWorldSessionStore.getState().openWorld(A);
    useWorldSessionStore.getState().setSummary('A 的摘要');
    useWorldSessionStore.getState().addActiveChar('路人甲');
    useWorldSessionStore.getState().bumpTurn();
    useWorldSessionStore.getState().setAttitudes({ 林悦: { trust: 90, affection: 80, fear: 0, lastUpdate: '' } });

    useWorldSessionStore.getState().closeWorld();

    const B = makeSession({ id: 'w2' });
    useWorldSessionStore.getState().openWorld(B);

    const st = getWorldState();
    expect(st.session!.id).toBe('w2');
    expect(st.summary).toBe('');            // 上一个世界的摘要没跟过来
    expect(st.activeChars).toEqual(['林悦', '陈默']);  // 按新世界重置
    expect(st.turnCount).toBe(0);
    expect(st.attitudes).toEqual({});
  });
});
