// ============================================================
//  迁移路径验证
//
//  真实场景：老用户的数据在 AsyncStorage 的 @koyoi_session_<id> /
//  @koyoi_world_index（以及更早的 @koyoi_world_sessions 数组）。
//  新代码改用 JSONL 文件存储。这个测试保证：
//    1. 旧格式能被识别并迁移
//    2. 迁移后消息不丢失、顺序不变
//    3. 迁移后旧 key 被清理，不会重复迁移
//    4. 迁移期间个别损坏的会话不会中断整体
// ============================================================

const mockMemfs = new Map<string, string>();
const mockDirs = new Set<string>();
const mockAsync = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/doc/',
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: jest.fn(async (p: string) =>
    mockDirs.has(p) ? { exists: true, isDirectory: true }
      : mockMemfs.has(p) ? { exists: true, isDirectory: false }
        : { exists: false, isDirectory: false }),
  makeDirectoryAsync: jest.fn(async (p: string) => { mockDirs.add(p); }),
  readAsStringAsync: jest.fn(async (p: string) => {
    const v = mockMemfs.get(p);
    if (v === undefined) throw new Error('ENOENT ' + p);
    return v;
  }),
  writeAsStringAsync: jest.fn(async (p: string, c: string) => { mockMemfs.set(p, c); }),
  moveAsync: jest.fn(async ({ from, to }: any) => {
    const v = mockMemfs.get(from);
    if (v === undefined) throw new Error('ENOENT ' + from);
    mockMemfs.set(to, v); mockMemfs.delete(from);
  }),
  copyAsync: jest.fn(async ({ from, to }: any) => {
    const v = mockMemfs.get(from); if (v !== undefined) mockMemfs.set(to, v);
  }),
  deleteAsync: jest.fn(async (p: string) => {
    mockMemfs.delete(p);
    for (const k of [...mockMemfs.keys()]) if (k.startsWith(p)) mockMemfs.delete(k);
  }),
  readDirectoryAsync: jest.fn(async (p: string) => {
    const out = new Set<string>();
    for (const k of [...mockMemfs.keys(), ...mockDirs]) {
      if (k.startsWith(p) && k !== p) { const s = k.slice(p.length).split('/')[0]; if (s) out.add(s); }
    }
    return [...out];
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockAsync.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockAsync.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { mockAsync.delete(k); }),
  },
}));

import { loadIndex, loadSession, saveFullSession } from '../sessionStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorldSession, ChatMessage } from '../../types';

const WORLDS_KEY = '@koyoi_world_sessions';

function legacySession(id: string, msgCount: number) {
  return {
    id,
    world: {
      id: 'w_' + id, name: '世界' + id, type: 'modern',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
    },
    selectedCharacters: [], npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: Array.from({ length: msgCount }, (_, i): ChatMessage => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `第${i}条`,
      timestamp: '2026-01-0' + ((i % 9) + 1),
    })),
    createdAt: '2026-01-01',
  };
}

/** 复刻 HomeScreen.migrateLegacySessions 的逻辑（保持行为一致） */
async function migrateLegacySessions(): Promise<void> {
  try {
    // v2: per-key 格式
    const rawIdx = mockAsync.get('@koyoi_world_index');
    if (rawIdx) {
      const ids = Object.keys(JSON.parse(rawIdx));
      for (const id of ids) {
        try {
          const raw = mockAsync.get('@koyoi_session_' + id);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (!parsed?.id || !parsed?.world) continue;
          await saveFullSession(parsed as WorldSession, parsed.messages || []);
          await AsyncStorage.removeItem('@koyoi_session_' + id);
        } catch { /* 单条损坏不影响其余 */ }
      }
      await AsyncStorage.removeItem('@koyoi_world_index').catch(() => {});
    }

    // v1: 数组格式（数据内嵌在数组里，没有 per-key 条目）
    const oldRaw = mockAsync.get(WORLDS_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      if (Array.isArray(old)) {
        for (const s of old) {
          if (!s?.id || !s?.world) continue;
          try { await saveFullSession(s as WorldSession, s.messages || []); } catch {}
        }
      }
      await AsyncStorage.removeItem(WORLDS_KEY).catch(() => {});
    }
  } catch { /* 整体失败不抛出 */ }
}

beforeEach(() => {
  mockMemfs.clear(); mockDirs.clear(); mockAsync.clear();
  jest.clearAllMocks();
});

describe('旧数据迁移', () => {
  it('从 per-key 格式（@koyoi_session_<id> + 索引）迁移', async () => {
    mockAsync.set('@koyoi_world_index', JSON.stringify({ s1: {}, s2: {} }));
    mockAsync.set('@koyoi_session_s1', JSON.stringify(legacySession('s1', 4)));
    mockAsync.set('@koyoi_session_s2', JSON.stringify(legacySession('s2', 7)));

    // 迁移前：文件存储是空的
    expect(await loadIndex()).toHaveLength(0);

    await migrateLegacySessions();

    const index = await loadIndex();
    expect(index.map(e => e.id).sort()).toEqual(['s1', 's2']);

    // 消息条数与顺序必须完整保留
    const s1 = await loadSession('s1');
    expect(s1).not.toBeNull();
    expect(s1!.messages).toHaveLength(4);
    expect(s1!.messages[0].content).toBe('第0条');
    expect(s1!.messages[3].content).toBe('第3条');

    const s2 = await loadSession('s2');
    expect(s2!.messages).toHaveLength(7);
  });

  it('从更早的 @koyoi_world_sessions 数组格式迁移', async () => {
    mockAsync.set(WORLDS_KEY, JSON.stringify([legacySession('a', 3), legacySession('b', 2)]));

    await migrateLegacySessions();

    const index = await loadIndex();
    expect(index.map(e => e.id).sort()).toEqual(['a', 'b']);
    expect((await loadSession('a'))!.messages).toHaveLength(3);
  });

  it('迁移后清理旧 key，重复调用不会重复迁移', async () => {
    mockAsync.set('@koyoi_world_index', JSON.stringify({ s1: {} }));
    mockAsync.set('@koyoi_session_s1', JSON.stringify(legacySession('s1', 2)));

    await migrateLegacySessions();
    expect(mockAsync.has('@koyoi_session_s1')).toBe(false);
    expect(mockAsync.has('@koyoi_world_index')).toBe(false);

    // 再迁一次：没有旧 key，不应产生任何变化
    const before = (await loadSession('s1'))!.messages.length;
    await migrateLegacySessions();
    expect((await loadSession('s1'))!.messages.length).toBe(before);
    expect(await loadIndex()).toHaveLength(1);
  });

  it('单条损坏不影响其余会话迁移', async () => {
    mockAsync.set('@koyoi_world_index', JSON.stringify({ good: {}, bad: {}, alsoGood: {} }));
    mockAsync.set('@koyoi_session_good', JSON.stringify(legacySession('good', 2)));
    mockAsync.set('@koyoi_session_bad', '{ 这不是合法 JSON');
    mockAsync.set('@koyoi_session_alsoGood', JSON.stringify(legacySession('alsoGood', 5)));

    await migrateLegacySessions();

    const index = await loadIndex();
    expect(index.map(e => e.id).sort()).toEqual(['alsoGood', 'good']);
    expect((await loadSession('alsoGood'))!.messages).toHaveLength(5);
  });

  it('没有旧数据时静默返回，不产生副作用', async () => {
    await expect(migrateLegacySessions()).resolves.toBeUndefined();
    expect(await loadIndex()).toHaveLength(0);
  });
});
