// ============================================================
//  阶段 7 后处理（阶段六）
//
//  修的两个问题：
//   1. 原实现先 await polishText，随后用 `displayText = raw.replace(META…)`
//      把它整段覆盖 —— 只要 AI 输出了 ___META___，抛光就白做了一次调用。
//   2. 抛光阻塞正文渲染：用户流式读完正文后还要空等一次完整调用。
//
//  这里锁住：META 剥离与抛光互不干扰；抛光不再阻塞；失败回落到原文。
// ============================================================

const polishCalls: string[] = [];

jest.mock('../../api/deepseek', () => ({
  polishText: jest.fn(async (_cfg: any, text: string) => {
    polishCalls.push(text);
    return '【已抛光】' + text;
  }),
}));

import { postProcessResponse } from '../sendPipeline/stage7_post';
import { polishText } from '../../api/deepseek';
import type { WorldSession, ApiConfig } from '../../types';

const cfg = {
  id: 'x', label: 'x', baseUrl: 'https://x', apiKey: 'k', model: 'm', thinkingMode: 'disabled',
  reasoningEffort: 'high', temperature: 1, maxTokens: 4096, safetyFilter: 'off',
  streamOutput: false, showSystemPrompt: false, autoPolish: true, isDefault: true,
} as ApiConfig;

function mk(overrides: Partial<WorldSession> = {}): WorldSession {
  return {
    id: 'w1',
    world: {
      id: 'w', name: '世界', type: 'fanfic',
      rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '', major: '' },
      writingStyle: '冷峻短句',
    },
    selectedCharacters: [{ name: '林悦' } as any],
    npcs: [], currentScene: '教室', worldState: '',
    butterflyLog: [], timelineDeviations: [], recentWorldEvents: [], worldLog: [],
    messages: [], createdAt: '', worldNovelId: 'n1',
    ...overrides,
  };
}

beforeEach(() => { polishCalls.length = 0; jest.clearAllMocks(); });

describe('META 剥离', () => {
  it('剥离 ___META___ 及其后的内容', () => {
    const raw = '正文内容。\n___META___ {"scene":"天台"}';
    const r = postProcessResponse(raw, mk(), cfg, { chapterText: 'x' });
    expect(r.displayText).toBe('正文内容。');
    expect(r.scene).toBe('天台');
  });

  it('无 META 时正文原样保留', () => {
    const r = postProcessResponse('正文内容。', mk(), cfg, { chapterText: 'x' });
    expect(r.displayText).toBe('正文内容。');
    expect(r.scene).toBeUndefined();
  });

  it('META 损坏时正文照常返回', () => {
    const raw = '正文内容。\n___META___ {坏掉的json';
    const r = postProcessResponse(raw, mk(), cfg, { chapterText: 'x' });
    expect(r.displayText).toBe('正文内容。');
  });
});

describe('抛光与 META 的交互（原 bug）', () => {
  it('有 META 时，抛光的是剥离后的正文，且结果不被丢弃', async () => {
    const raw = '正文内容。\n___META___ {"scene":"天台"}';
    const r = postProcessResponse(raw, mk(), cfg, { chapterText: 'x' });

    // 送去抛光的是剥离后的正文，不含 META
    expect(polishCalls).toHaveLength(1);
    expect(polishCalls[0]).toBe('正文内容。');
    expect(polishCalls[0]).not.toContain('___META___');

    // 抛光的返回值能拿到（原实现在这里有 META 时会被覆盖丢失）
    const final = await r.polished!;
    expect(final).toBe('【已抛光】正文内容。');
  });

  it('displayText 立即可用，不等抛光', () => {
    const r = postProcessResponse('正文内容。\n___META___ {"scene":"天台"}', mk(), cfg, { chapterText: 'x' });
    // 同步返回：调用方可以立刻渲染
    expect(r.displayText).toBe('正文内容。');
    expect(r.polished).toBeInstanceOf(Promise);
  });
});

describe('抛光的触发条件', () => {
  it('非小说模式（无 worldNovelId）不抛光', () => {
    const r = postProcessResponse('正文', mk({ worldNovelId: undefined }), cfg, {});
    expect(r.polished).toBeNull();
    expect(polishText).not.toHaveBeenCalled();
  });

  it('autoPolish=false 时不抛光', () => {
    const r = postProcessResponse('正文', mk(), { ...cfg, autoPolish: false }, { chapterText: 'x' });
    expect(r.polished).toBeNull();
    expect(polishText).not.toHaveBeenCalled();
  });

  it('既无写作风格也无章节样本时不抛光', () => {
    const session = mk();
    (session.world as any).writingStyle = '';
    const r = postProcessResponse('正文', session, cfg, {});
    expect(r.polished).toBeNull();
  });
});

describe('失败兜底', () => {
  it('抛光抛错时回落为原文，不改坏正文', async () => {
    (polishText as jest.Mock).mockRejectedValueOnce(new Error('API down'));
    const r = postProcessResponse('正文内容。', mk(), cfg, { chapterText: 'x' });

    const final = await r.polished!;
    expect(final).toBe('正文内容。');      // 回落原文
    expect(r.displayText).toBe('正文内容。');
  });
});

describe('新角色解析', () => {
  it('META 里的 newCharacter 转成 NPC（世界库里存在时补全档案）', () => {
    const session = mk({
      world: {
        ...mk().world,
        characters: [{ name: '王老师', relationship: { status: '班主任' }, personality: { traits: ['严厉'] } } as any],
      },
    });
    const raw = '正文。\n___META___ {"newCharacter":"王老师"}';
    const r = postProcessResponse(raw, session, cfg, { chapterText: 'x' });

    expect(r.newNpcs).toHaveLength(1);
    expect(r.newNpcs![0].name).toBe('王老师');
    expect(r.newNpcs![0].role).toBe('班主任');
  });

  it('已在场的角色不重复引入', () => {
    const raw = '正文。\n___META___ {"newCharacter":"林悦"}';
    const r = postProcessResponse(raw, mk(), cfg, { chapterText: 'x' });
    expect(r.newNpcs).toBeUndefined();
  });
});
