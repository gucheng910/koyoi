// ============================================================
//  worldSessionStore 测试
//
//  这个 store 的存在是为了消灭 WorldChatScreen 里手工同步的 6 个 useRef，
//  并让服务层能读到「当前」状态（而不是 render 时才对齐的引用）。
//  测试重点放在这些语义上，而不是 getter/setter 的机械覆盖。
// ============================================================

import { useWorldSessionStore, getWorldState } from '../worldSessionStore';
import type { WorldSession, ChatMessage } from '../../types';

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
      { name: '林悦' } as any,
      { name: '陈默' } as any,
    ],
    npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: [],
    createdAt: '2026-01-01',
    currentChapter: 3,
    ...overrides,
  };
}

const msg = (content: string, role: 'user' | 'assistant' = 'user'): ChatMessage =>
  ({ role, content, timestamp: '2026-01-01' });

beforeEach(() => {
  useWorldSessionStore.getState().closeWorld();
});

describe('openWorld / closeWorld', () => {
  it('载入世界时从消息数推导回合数', () => {
    const s = makeSession({ messages: [msg('a'), msg('b', 'assistant'), msg('c'), msg('d', 'assistant')] });
    useWorldSessionStore.getState().openWorld(s);

    const st = getWorldState();
    expect(st.turnCount).toBe(2);       // 4 条消息 = 2 轮
    expect(st.messages).toHaveLength(4);
    expect(st.session?.id).toBe('w1');
  });

  it('在场角色名单从 selectedCharacters 初始化', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    expect(getWorldState().activeChars).toEqual(['林悦', '陈默']);
  });

  it('closeWorld 清空所有状态，避免下一个世界读到脏数据', () => {
    useWorldSessionStore.getState().openWorld(makeSession({ messages: [msg('a')] }));
    useWorldSessionStore.getState().bumpTurn();
    useWorldSessionStore.getState().addActiveChar('路人');

    useWorldSessionStore.getState().closeWorld();

    const st = getWorldState();
    expect(st.session).toBeNull();
    expect(st.messages).toEqual([]);
    expect(st.turnCount).toBe(0);
    expect(st.activeChars).toEqual([]);
    expect(st.summary).toBe('');
  });
});

describe('patchSession', () => {
  it('合并字段而非替换整个 session', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().patchSession({ currentScene: '天台' });

    const s = getWorldState().session!;
    expect(s.currentScene).toBe('天台');
    expect(s.currentChapter).toBe(3);      // 未提及的字段保持
    expect(s.world.name).toBe('测试世界');
  });

  it('不因就地改写而与 messages 分叉（原 bug 的核心）', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().setMessages([msg('hello')]);
    useWorldSessionStore.getState().patchSession({ currentScene: '走廊' });

    // session.messages 与顶层 messages 必须始终同源
    expect(getWorldState().session!.messages).toEqual(getWorldState().messages);
  });

  it('未载入世界时是 no-op，不抛错', () => {
    expect(() => useWorldSessionStore.getState().patchSession({ currentScene: 'x' })).not.toThrow();
    expect(getWorldState().session).toBeNull();
  });
});

describe('setChapter', () => {
  it('章节只能前进，不能后退', () => {
    useWorldSessionStore.getState().openWorld(makeSession({ currentChapter: 5 }));

    useWorldSessionStore.getState().setChapter(8);
    expect(getWorldState().session!.currentChapter).toBe(8);

    // 乱序回来的后台回调不应把章节拉回去
    useWorldSessionStore.getState().setChapter(3);
    expect(getWorldState().session!.currentChapter).toBe(8);
  });

  it('相同章节幂等', () => {
    useWorldSessionStore.getState().openWorld(makeSession({ currentChapter: 4 }));
    useWorldSessionStore.getState().setChapter(4);
    expect(getWorldState().session!.currentChapter).toBe(4);
  });
});

describe('activeChars', () => {
  it('addActiveChar 去重', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().addActiveChar('王老师');
    useWorldSessionStore.getState().addActiveChar('王老师');
    expect(getWorldState().activeChars).toEqual(['林悦', '陈默', '王老师']);
  });

  it('removeActiveChar 移除指定角色', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().removeActiveChar('陈默');
    expect(getWorldState().activeChars).toEqual(['林悦']);
  });
});

describe('bumpTurn', () => {
  it('自增并返回新值（供 stage 同步使用）', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    expect(useWorldSessionStore.getState().bumpTurn()).toBe(1);
    expect(useWorldSessionStore.getState().bumpTurn()).toBe(2);
    expect(getWorldState().turnCount).toBe(2);
  });
});

describe('setMoods', () => {
  it('合并到 characterMoods 而不是整体替换', () => {
    useWorldSessionStore.getState().openWorld(makeSession({
      characterMoods: { 林悦: { emotion: 'joy', intensity: 5, sinceRound: 1, expressed: true } },
    }));
    useWorldSessionStore.getState().setMoods({
      陈默: { emotion: 'rage', intensity: 8, sinceRound: 2, expressed: false },
    });

    const moods = getWorldState().session!.characterMoods!;
    expect(Object.keys(moods).sort()).toEqual(['林悦', '陈默']);
    expect(moods['林悦'].intensity).toBe(5);
  });
});

describe('服务层读取', () => {
  it('getWorldState() 反映最新值，无需等 render', () => {
    useWorldSessionStore.getState().openWorld(makeSession());
    useWorldSessionStore.getState().setSummary('摘要A');
    useWorldSessionStore.getState().setActiveChars(['甲']);

    // 模拟服务层（非组件）读取
    const st = getWorldState();
    expect(st.summary).toBe('摘要A');
    expect(st.activeChars).toEqual(['甲']);
  });
});
