// ============================================================
//  角色批量推演（阶段六）
//
//  实测背景：原先 simulateCharacters 是 Promise.all(每个角色一次请求)，
//  5 个在场角色 = 5 次出站请求，首字延迟 = max(5 个推演)。
//  合并为一次请求后，请求数 N → 1。
//
//  这里锁住三件事：
//    1. N 个角色只发 1 次请求
//    2. 情报差隔离仍在（inactive 角色不带对话内容）
//    3. 批量解析失败时退回逐角色请求，不丢整轮推演
// ============================================================

const outbound: string[] = [];

jest.mock('../../api/deepseek', () => ({
  chatCompletionSync: jest.fn(async (_cfg: any, messages: any[]) => {
    const sys = messages.find(m => m.role === 'system');
    outbound.push(String(sys?.content || '').slice(0, 40));
    const r = (globalThis as any).__mockResponse;
    return typeof r === 'string' ? r : '[]';
  }),
}));

import { simulateCharactersBatch, simulateCharacters } from '../characterSimulator';
import { chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig } from '../../types';

const cfg = {
  id: 'x', label: 'x', baseUrl: 'https://x', apiKey: 'k', model: 'm', thinkingMode: 'disabled',
  reasoningEffort: 'high', temperature: 1, maxTokens: 4096, safetyFilter: 'off',
  streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: true,
} as ApiConfig;

const char = (name: string, state: 'active' | 'inactive' = 'active') => ({
  name, personality: '傲娇/细心', role: '学生', status: '教室里',
  relationship: '同学', interactionState: state,
});

beforeEach(() => {
  outbound.length = 0;
  jest.clearAllMocks();
  (globalThis as any).__mockResponse = '[]';
});

describe('请求数', () => {
  it('5 个角色只发 1 次请求（原先 5 次）', async () => {
    (globalThis as any).__mockResponse = JSON.stringify(
      ['甲', '乙', '丙', '丁', '戊'].map(n => ({ name: n, intent: 'x', mood: '平静', affectionDelta: 0 }))
    );

    const r = await simulateCharactersBatch(
      cfg,
      ['甲', '乙', '丙', '丁', '戊'].map(n => char(n)),
      '教室', '', '甲、乙、丙、丁、戊'
    );

    expect(chatCompletionSync).toHaveBeenCalledTimes(1);
    expect(r.actions).toHaveLength(5);
    expect(r.actions.map(a => a.name).sort()).toEqual(['丁', '丙', '乙', '甲', '戊'].sort());
  });

  it('单角色时也只发 1 次（走聚焦 prompt）', async () => {
    (globalThis as any).__mockResponse = JSON.stringify({ name: '甲', intent: 'y', mood: '平静' });
    await simulateCharactersBatch(cfg, [char('甲')], '教室', '', '甲');
    expect(chatCompletionSync).toHaveBeenCalledTimes(1);
  });

  it('对照：旧的逐角色实现确实是 N 次请求', async () => {
    (globalThis as any).__mockResponse = JSON.stringify({ name: 'x', intent: 'y', mood: 'z' });
    await simulateCharacters(cfg, [char('甲'), char('乙'), char('丙')], '教室', '', '甲、乙、丙');
    expect(chatCompletionSync).toHaveBeenCalledTimes(3);
  });
});

describe('情报差隔离', () => {
  it('inactive 角色不注入对话内容，active 角色注入', async () => {
    (globalThis as any).__mockResponse = JSON.stringify([
      { name: '甲', intent: 'x', mood: 'a' },
      { name: '乙', intent: 'y', mood: 'b' },
    ]);

    await simulateCharactersBatch(
      cfg,
      [char('甲', 'active'), char('乙', 'inactive')],
      '教室', '', '甲',
      {}, {}, {},
      { '甲': '玩家：你好', /* 乙 没有 dialogue */ }
    );

    const call = (chatCompletionSync as jest.Mock).mock.calls[0];
    const user = String(call[1].find((m: any) => m.role === 'user').content);

    expect(user).toContain('玩家：你好');          // 甲 看得到
    expect(user).toContain('不在玩家视线内');      // 乙 被标注不在场
    // 乙 的段落里不应出现对话原文
    const yiBlock = user.slice(user.indexOf('角色 2：乙'));
    expect(yiBlock).not.toContain('玩家：你好');
  });

  it('不在场角色被明确告知不知道对话（批量路径）', async () => {
    (chatCompletionSync as jest.Mock).mockResolvedValueOnce(JSON.stringify([
      { name: '甲', intent: 'x', mood: 'a' },
      { name: '乙', intent: 'y', mood: 'b' },
    ]));
    // 必须 ≥2 个角色才会走批量路径（单角色走聚焦 prompt）
    await simulateCharactersBatch(cfg, [char('甲', 'active'), char('乙', 'inactive')], '教室', '', '甲');
    const call = (chatCompletionSync as jest.Mock).mock.calls[0];
    const user = String(call[1].find((m: any) => m.role === 'user').content);
    expect(user).toContain('不在玩家视线内');
  });
});

describe('健壮性', () => {
  it('模型编造的角色名被丢弃', async () => {
    (globalThis as any).__mockResponse = JSON.stringify([
      { name: '甲', intent: 'x', mood: 'a' },
      { name: '不存在的角色', intent: 'y', mood: 'b' },
    ]);

    const r = await simulateCharactersBatch(cfg, [char('甲')], '教室', '', '甲');
    expect(r.actions.every(a => a.name === '甲')).toBe(true);
  });

  it('数组损坏时退回逐角色请求，不丢整轮推演', async () => {
    // 第一次（批量）返回垃圾，后续（逐角色）返回合法对象
    let n = 0;
    (chatCompletionSync as jest.Mock).mockImplementation(async () => {
      n++;
      if (n === 1) return '这不是 JSON';
      return JSON.stringify({ name: '甲', intent: '回退成功', mood: 'ok' });
    });

    const r = await simulateCharactersBatch(cfg, [char('甲'), char('乙')], '教室', '', '甲、乙');

    // 1 次批量失败 + 2 次逐角色回退
    expect(chatCompletionSync).toHaveBeenCalledTimes(3);
    expect(r.actions.length).toBeGreaterThan(0);
  });

  it('模型漏输出某个角色时补空动作，保持与输入等长', async () => {
    (chatCompletionSync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([{ name: '甲', intent: 'x', mood: 'a' }])
    );
    const r = await simulateCharactersBatch(cfg, [char('甲'), char('乙'), char('丙')], '教室', '', '甲、乙、丙');

    expect(r.actions).toHaveLength(3);
    const yi = r.actions.find(a => a.name === '乙');
    expect(yi).toBeDefined();
    expect(yi!.intent).toBe('');   // 空动作，但不至于让下游 undefined
  });

  it('解析互动标记（pull_in / push_out）', async () => {
    (chatCompletionSync as jest.Mock).mockResolvedValueOnce([
      JSON.stringify([{ name: '甲', intent: 'x', mood: 'a' }]),
      '___INTERACTION___ {"action":"pull_in","character_name":"乙","narrative":"乙推门进来"}',
    ].join('\n'));

    const r = await simulateCharactersBatch(cfg, [char('甲'), char('乙')], '教室', '', '甲');
    expect(r.interactionChanges).toHaveLength(1);
    expect(r.interactionChanges[0].action).toBe('pull_in');
    expect(r.interactionChanges[0].character_name).toBe('乙');
  });

  it('互动标记里的未知角色被忽略', async () => {
    (chatCompletionSync as jest.Mock).mockResolvedValueOnce([
      JSON.stringify([{ name: '甲', intent: 'x', mood: 'a' }]),
      '___INTERACTION___ {"action":"pull_in","character_name":"编造的人","narrative":"x"}',
    ].join('\n'));

    const r = await simulateCharactersBatch(cfg, [char('甲')], '教室', '', '甲');
    expect(r.interactionChanges).toHaveLength(0);
  });

  it('空角色列表不发请求', async () => {
    const r = await simulateCharactersBatch(cfg, [], '教室', '', '');
    expect(chatCompletionSync).not.toHaveBeenCalled();
    expect(r.actions).toEqual([]);
  });

  it('maxTokens 随角色数增长（避免长数组被截断）', async () => {
    (globalThis as any).__mockResponse = JSON.stringify([{ name: '甲', intent: 'x', mood: 'a' }]);
    await simulateCharactersBatch(cfg, [char('甲'), char('乙'), char('丙'), char('丁')], '教室', '', '甲');
    const opts = (chatCompletionSync as jest.Mock).mock.calls[0][2];
    expect(opts.maxTokens).toBeGreaterThanOrEqual(4 * 320);
  });
});
