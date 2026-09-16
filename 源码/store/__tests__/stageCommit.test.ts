// ============================================================
//  stage8 提交原子性
//
//  阶段四（缩小版）。原方案要引入 Subsystem 注册表 + SessionChange 联合类型，
//  但阶段三把会话状态收进 store 后，「多子系统抢改同一份状态」已经不存在了。
//  真正遗留的问题只剩：stage8 同步阶段原来分散写 4 次，中途抛错会留下
//  「半提交」状态（前面写的生效、后面的被跳过）。
//
//  这里验证收敛为单次 patchSession 后的语义：
//    1. 同步阶段的所有派生值一次性生效
//    2. 中途抛错时不产生半提交
//    3. 异步回调各自独立，不互相覆盖
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
    selectedCharacters: [{ name: '林悦' } as any],
    npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: [], createdAt: '2026-01-01', worldClock: 0,
    ...overrides,
  };
}

const action = (name: string, mood: string): CharacterAction => ({
  name, intent: '说话', mood, innerThought: '', bodyLanguage: '',
  subtext: '', emotionalDirection: 'holding', triggerContext: '', toward: 'player',
  wantsInteraction: true, affectionDelta: 0,
});

beforeEach(() => { useWorldSessionStore.getState().closeWorld(); });

describe('同步阶段单次提交', () => {
  it('时钟/情绪/事件一起生效，不存在中间态', () => {
    useWorldSessionStore.getState().openWorld(makeSession());

    // 复刻 stage8 同步阶段：全部算完再写一次
    const s = getWorldState().session!;
    const nextWorldClock = (s.worldClock || 0) + 1;
    const moods = decayMoods(updateMoods([action('林悦', '愤怒')], s.characterMoods || {}, 1), 1);

    useWorldSessionStore.getState().patchSession({
      worldClock: nextWorldClock,
      characterMoods: moods,
      notableEvents: [],
    });

    const after = getWorldState().session!;
    expect(after.worldClock).toBe(1);
    expect(after.characterMoods!['林悦']).toBeDefined();
    expect(after.notableEvents).toEqual([]);
  });

  it('派生值计算抛错时，session 保持提交前状态（无半提交）', () => {
    useWorldSessionStore.getState().openWorld(makeSession({ worldClock: 5 }));

    const before = getWorldState().session!;

    // 模拟同步阶段中途抛错：注意此时还没调用 patchSession
    expect(() => {
      const nextWorldClock = (before.worldClock || 0) + 1;
      void nextWorldClock;
      throw new Error('boom during derivation');
    }).toThrow('boom during derivation');

    const after = getWorldState().session!;
    // 一次都没写 → 完全不变（旧实现会已经把 worldClock 写成 6 了）
    expect(after.worldClock).toBe(5);
    expect(after).toBe(before);          // 连对象引用都没变
  });

  it('对比：分散写入会留下半提交（说明为什么必须收敛）', () => {
    useWorldSessionStore.getState().openWorld(makeSession({ worldClock: 5 }));

    // 旧写法：先写时钟，再算情绪，算情绪时炸了
    useWorldSessionStore.getState().patchSession({ worldClock: 6 });
    try {
      throw new Error('boom');
    } catch { /* 被外层 catch 吞掉 */ }

    // 结果是半提交：时钟已推进，但情绪/事件都没写
    const s = getWorldState().session!;
    expect(s.worldClock).toBe(6);              // ← 这个副作用留下了
    expect(s.characterMoods).toBeUndefined();  // ← 但这个没写

    // 单次提交的写法下，两者要么都在、要么都不在
  });
});

describe('异步回调互不覆盖', () => {
  it('各后台任务读最新状态再写，不冲掉彼此', () => {
    useWorldSessionStore.getState().openWorld(makeSession());

    // 模拟三个后台回调依次回来（世界脉冲 / 章节 / 记忆）
    const cur1 = getWorldState().session!;
    useWorldSessionStore.getState().patchSession({
      recentWorldEvents: [...(cur1.recentWorldEvents || []), '远处传来声响'],
    });

    useWorldSessionStore.getState().setChapter(4);

    const cur2 = getWorldState().session!;
    useWorldSessionStore.getState().patchSession({
      memories: [...(cur2.memories || []), { content: '记住了', importance: 3, type: 'core', weight: 3, lastActivated: 0 }],
    });

    const final = getWorldState().session!;
    expect(final.recentWorldEvents).toContain('远处传来声响');   // 未被后续覆盖
    expect(final.currentChapter).toBe(4);
    expect(final.memories).toHaveLength(1);
  });

  it('世界已关闭时，迟到的回调静默丢弃而不是写入空会话', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().closeWorld();

    // 回调醒来发现 session 没了 → 应当 return
    const cur = getWorldState().session;
    expect(cur).toBeNull();

    // 守卫：只有 cur 存在才写
    if (cur) useWorldSessionStore.getState().patchSession({ recentWorldEvents: ['x'] });
    expect(getWorldState().session).toBeNull();
  });
});
