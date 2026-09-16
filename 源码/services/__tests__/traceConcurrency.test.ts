// ============================================================
//  归因的并发正确性（真机测试发现）
//
//  真机上诊断面板显示：
//      内容路由  4 次 · 6.1k 入 / 3.2k 出   ← 每次 800 输出，而 maxTokens=600
//      角色推演  4 次 · 4.2k 入 /   188 出  ← 每次仅 47 输出，远低于预期
//
//  两组数字都自相矛盾，说明**归因串了**。
//
//  根因：trace 用全局标签栈，而 stage4 是
//      await Promise.all([runCharacterSimulation(), routeContent()])
//  两者并发。先返回的那个调用在 recordCall 时读到的栈顶，可能已经被
//  另一个子系统压入了 —— 于是角色推演的 token 记到了内容路由头上。
//
//  我自己在 trace.ts 的注释里曾断言「这些调用都是 await 出来的，
//  没有并发交叉写入」—— 这个假设是错的，正是本测试要钉住的地方。
//
//  修法：标签在**发起请求那一刻**同步捕获（captureTag），随调用一路带下去。
// ============================================================

const recorded: any[] = [];

jest.mock('../../store/usageStore', () => ({
  useUsageStore: { getState: () => ({ record: jest.fn() }) },
  estimateCallCost: () => 0.001,
}));

// 只 mock 记录层，withTag/captureTag 用真实实现——要测的就是它们
jest.mock('../../services/trace', () => {
  const actual = jest.requireActual('../../services/trace');
  return {
    ...actual,
    recordCall: (e: any) => { recorded.push(e); },
  };
});

import { chatCompletionSync } from '../../api/deepseek';
import { withTag } from '../../services/trace';
import type { ApiConfig } from '../../types';

const cfg = {
  id: 'x', label: 'x', baseUrl: 'https://api.test', apiKey: 'k', model: 'm',
  thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 1, maxTokens: 100,
  safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: true,
} as ApiConfig;

const origFetch = globalThis.fetch;

/** 让不同调用有不同耗时，以制造「后发先至」的交错 */
function makeFetch(delays: Record<string, number>) {
  return jest.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const content = String(body.messages?.[0]?.content || '');
    const ms = delays[content] ?? 10;
    await new Promise(r => setTimeout(r, ms));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 1 },
      }),
      text: async () => '',
    };
  });
}

beforeEach(() => {
  recorded.length = 0;
  jest.clearAllMocks();
  (globalThis as any).fetch = origFetch;
});

describe('并发调用不串标签', () => {
  it('【核心】先压栈的调用先返回时，不会读到后压入的标签', async () => {
    // 关键时序：character-sim 先 push、且**先返回**。
    // 它返回时栈顶还是后压入的 'router'，若在那一刻读全局栈就会归错。
    //
    // 真机上正是这个顺序：角色推演 783ms 先于内容路由 4936ms 返回，
    // 于是推演的 token 被算到了路由头上（路由显示 800 出/次，超过 maxTokens）。
    //
    // ⚠️ 必须校验**身份**而非数量：归因错乱的表现是两个标签**互换**，
    // 各 1 条，数量完全正常。用耗时把「哪次调用」和「哪个标签」绑定。
    (globalThis as any).fetch = makeFetch({ sim: 10, rtr: 120 });

    await Promise.all([
      withTag('character-sim', () => chatCompletionSync(cfg, [{ role: 'user', content: 'sim' }])),
      withTag('router', () => chatCompletionSync(cfg, [{ role: 'user', content: 'rtr' }])),
    ]);

    expect(recorded).toHaveLength(2);
    const simRec = recorded.find(r => r.tag === 'character-sim')!;
    const rtrRec = recorded.find(r => r.tag === 'router')!;
    // 120ms 那条属于 router，10ms 那条属于 character-sim
    expect(rtrRec.durationMs).toBeGreaterThanOrEqual(100);
    expect(simRec.durationMs).toBeLessThan(60);
  });

  it('后发先至的相反顺序同样正确', async () => {
    (globalThis as any).fetch = makeFetch({ sim: 120, rtr: 10 });

    await Promise.all([
      withTag('character-sim', () => chatCompletionSync(cfg, [{ role: 'user', content: 'sim' }])),
      withTag('router', () => chatCompletionSync(cfg, [{ role: 'user', content: 'rtr' }])),
    ]);

    const simRec = recorded.find(r => r.tag === 'character-sim')!;
    const rtrRec = recorded.find(r => r.tag === 'router')!;
    expect(simRec.durationMs).toBeGreaterThanOrEqual(100);
    expect(rtrRec.durationMs).toBeLessThan(60);
  });

  it('交错的多个并发调用各自归位', async () => {
    (globalThis as any).fetch = makeFetch({ a: 10, b: 60, c: 120 });

    await Promise.all([
      withTag('narrator', () => chatCompletionSync(cfg, [{ role: 'user', content: 'a' }])),
      withTag('polish', () => chatCompletionSync(cfg, [{ role: 'user', content: 'b' }])),
      withTag('world-pulse', () => chatCompletionSync(cfg, [{ role: 'user', content: 'c' }])),
    ]);

    // 同样按耗时绑定身份，而不是只数个数
    expect(recorded.find(r => r.tag === 'narrator')!.durationMs).toBeLessThan(45);
    expect(recorded.find(r => r.tag === 'polish')!.durationMs).toBeGreaterThanOrEqual(45);
    expect(recorded.find(r => r.tag === 'polish')!.durationMs).toBeLessThan(95);
    expect(recorded.find(r => r.tag === 'world-pulse')!.durationMs).toBeGreaterThanOrEqual(95);
  });

  it('校验真机症状：token 归属正确（小 token 不被算到大 token 头上）', async () => {
    // 角色推演返回大 token 且**先返回**；内容路由小 token 后返回。
    // 这正是真机上「路由显示 800 出/次」的成因。
    (globalThis as any).fetch = jest.fn(async (_url: string, init: any) => {
      const content = String(JSON.parse(init.body).messages?.[0]?.content || '');
      const isSim = content === 'sim';
      await new Promise(r => setTimeout(r, isSim ? 10 : 120));
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: {
            prompt_tokens: isSim ? 2000 : 100,
            completion_tokens: isSim ? 800 : 20,
            prompt_cache_hit_tokens: 0,
            prompt_cache_miss_tokens: isSim ? 2000 : 100,
          },
        }),
        text: async () => '',
      };
    });

    await Promise.all([
      withTag('character-sim', () => chatCompletionSync(cfg, [{ role: 'user', content: 'sim' }])),
      withTag('router', () => chatCompletionSync(cfg, [{ role: 'user', content: 'rtr' }])),
    ]);

    const sim = recorded.find(r => r.tag === 'character-sim')!;
    const router = recorded.find(r => r.tag === 'router')!;

    // 大 token 属于 character-sim，小 token 属于 router —— 不能颠倒
    expect(sim.outputTokens).toBe(800);
    expect(router.outputTokens).toBe(20);
  });

  it('串行调用（无并发）仍然正确', async () => {
    (globalThis as any).fetch = makeFetch({ x: 5 });

    await withTag('summary', () => chatCompletionSync(cfg, [{ role: 'user', content: 'x' }]));
    await withTag('memory-extract', () => chatCompletionSync(cfg, [{ role: 'user', content: 'x' }]));

    expect(recorded.map(r => r.tag)).toEqual(['summary', 'memory-extract']);
  });

  it('没有 withTag 包裹时归到 other（不丢记录）', async () => {
    (globalThis as any).fetch = makeFetch({ z: 5 });
    await chatCompletionSync(cfg, [{ role: 'user', content: 'z' }]);
    expect(recorded[0].tag).toBe('other');
  });
});
