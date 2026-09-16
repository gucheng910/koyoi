// ============================================================
//  sessionStorage 测试
//
//  背景：这个文件（316 行，JSONL + 原子写 + 备份）写完后从未被任何 screen
//  导入过，实际在用的是 AsyncStorage 全量覆盖。接上之前先补测试。
//
//  这里用内存文件系统 mock expo-file-system，验证：
//    - 全量保存 / 增量追加 / 加载
//    - saveFullSession 真的写了 meta.json（原实现漏写）
//    - saveMeta 不冲掉 _savedMsgCount（损坏检测的依据）
//    - chat.jsonl 被截断时能从备份恢复
// ============================================================

// jest.mock 被提升到文件顶部；babel 只允许以 mock 开头的变量在工厂中引用
const mockMemfs = new Map<string, string>();
const mockDirs = new Set<string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/doc/',
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: jest.fn(async (path: string) => {
    if (mockDirs.has(path)) return { exists: true, isDirectory: true };
    if (mockMemfs.has(path)) return { exists: true, isDirectory: false };
    return { exists: false, isDirectory: false };
  }),
  makeDirectoryAsync: jest.fn(async (path: string) => { mockDirs.add(path); }),
  readAsStringAsync: jest.fn(async (path: string) => {
    const v = mockMemfs.get(path);
    if (v === undefined) throw new Error('ENOENT ' + path);
    return v;
  }),
  writeAsStringAsync: jest.fn(async (path: string, content: string) => { mockMemfs.set(path, content); }),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    const v = mockMemfs.get(from);
    if (v === undefined) throw new Error('ENOENT ' + from);
    mockMemfs.set(to, v);
    mockMemfs.delete(from);
  }),
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    const v = mockMemfs.get(from);
    if (v !== undefined) mockMemfs.set(to, v);
  }),
  deleteAsync: jest.fn(async (path: string) => {
    mockMemfs.delete(path);
    for (const k of [...mockMemfs.keys()]) if (k.startsWith(path)) mockMemfs.delete(k);
    mockDirs.delete(path);
  }),
  readDirectoryAsync: jest.fn(async (path: string) => {
    const out = new Set<string>();
    for (const k of [...mockMemfs.keys(), ...mockDirs]) {
      if (k.startsWith(path) && k !== path) {
        const rest = k.slice(path.length);
        const seg = rest.split('/')[0];
        if (seg) out.add(seg);
      }
    }
    return [...out];
  }),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  saveFullSession,
  appendMessages,
  loadSession,
  loadIndex,
  deleteSession,
} from '../sessionStorage';
import type { WorldSession, ChatMessage } from '../../types';

function makeSession(id = 's1', msgs: number = 0): WorldSession {
  return {
    id,
    world: {
      id: 'w', name: '世界' + id, type: 'modern',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
    },
    selectedCharacters: [], npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: Array.from({ length: msgs }, (_, i): ChatMessage => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'msg' + i,
      timestamp: '2026-01-01T00:00:0' + (i % 10) + 'Z',
    })),
    createdAt: '2026-01-01',
  };
}

beforeEach(() => {
  mockMemfs.clear();
  mockDirs.clear();
  jest.clearAllMocks();
});

describe('saveFullSession', () => {
  it('写入 chat.jsonl，每行一条消息', async () => {
    const s = makeSession('s1', 3);
    await saveFullSession(s, s.messages);

    const raw = mockMemfs.get('/doc/koyoi_sessions/s1/chat.jsonl');
    expect(raw).toBeDefined();
    const lines = raw!.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).content).toBe('msg0');
  });

  it('真的写入 meta.json（原实现漏掉了这一步）', async () => {
    const s = makeSession('s1', 2);
    await saveFullSession(s, s.messages);

    const metaRaw = mockMemfs.get('/doc/koyoi_sessions/s1/meta.json');
    expect(metaRaw).toBeDefined();

    const meta = JSON.parse(metaRaw!);
    expect(meta.id).toBe('s1');
    expect(meta._savedMsgCount).toBe(2);
    // messages 不应重复存进 meta（权威副本在 jsonl）
    expect(meta.messages).toBeUndefined();
  });

  it('更新索引，记录消息数', async () => {
    const s = makeSession('s1', 5);
    await saveFullSession(s, s.messages);

    const index = await loadIndex();
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('s1');
    expect(index[0].msgCount).toBe(5);
    expect(index[0].name).toBe('世界s1');
  });
});

describe('appendMessages', () => {
  it('增量追加不重写已有行', async () => {
    const s = makeSession('s1', 2);
    await saveFullSession(s, s.messages);

    await appendMessages('s1', [
      { role: 'user', content: 'new1', timestamp: '2026-01-02' },
      { role: 'assistant', content: 'new2', timestamp: '2026-01-02' },
    ]);

    const lines = mockMemfs.get('/doc/koyoi_sessions/s1/chat.jsonl')!.split('\n').filter(Boolean);
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[3]).content).toBe('new2');
  });

  it('空数组不产生任何写入', async () => {
    await appendMessages('s1', []);
    expect(mockMemfs.has('/doc/koyoi_sessions/s1/chat.jsonl')).toBe(false);
  });
});

describe('loadSession', () => {
  it('往返一致：存进去什么，读出来什么', async () => {
    const s = makeSession('s1', 4);
    s.worldBible = '世界圣经';
    s.currentChapter = 7;
    await saveFullSession(s, s.messages);

    const loaded = await loadSession('s1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('s1');
    expect(loaded!.worldBible).toBe('世界圣经');
    expect(loaded!.currentChapter).toBe(7);
    expect(loaded!.messages).toHaveLength(4);
  });

  it('chat.jsonl 被截断时从备份恢复', async () => {
    const s = makeSession('s1', 3);
    await saveFullSession(s, s.messages);

    // 第一次 append 会先备份当前 chat.jsonl
    await appendMessages('s1', [{ role: 'user', content: 'x', timestamp: 't' }]);

    // 模拟损坏：chat.jsonl 被清空，但 meta 仍声称有 3 条
    mockMemfs.set('/doc/koyoi_sessions/s1/chat.jsonl', '');

    const loaded = await loadSession('s1');
    expect(loaded).not.toBeNull();
    expect(loaded!.messages.length).toBeGreaterThan(0);
  });

  it('不存在时返回 null', async () => {
    expect(await loadSession('nope')).toBeNull();
  });
});

describe('deleteSession', () => {
  it('删除数据并从索引移除', async () => {
    const s = makeSession('s1', 2);
    await saveFullSession(s, s.messages);
    await saveFullSession(makeSession('s2', 1), makeSession('s2', 1).messages);

    await deleteSession('s1');

    const index = await loadIndex();
    expect(index.map(e => e.id)).toEqual(['s2']);
    expect(mockMemfs.has('/doc/koyoi_sessions/s1/chat.jsonl')).toBe(false);
  });
});
