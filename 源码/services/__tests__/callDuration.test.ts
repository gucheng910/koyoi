// ============================================================
//  调用耗时测量（真机诊断面板发现）
//
//  实机跑通一轮后，诊断面板显示：
//      正文生成  均 3359ms     ← 正确（流式路径）
//      内容路由  均 1ms        ← 明显不对，一次 API 往返不可能 1ms
//
//  根因：chatCompletionSync 调 recordUsage 时把 Date.now() 当成了
//  **起始时间**传进去，于是 duration = Date.now() - Date.now() ≈ 0。
//  所有非流式调用（路由/推演/记忆/世界脉冲/章节追踪）的耗时都记成 ~0-1ms。
//
//  handleFunctionCallLoop 里也有同样写法，一并修掉。
// ============================================================

const recorded: any[] = [];

jest.mock('../../store/usageStore', () => ({
  useUsageStore: {
    getState: () => ({
      record: (r: any) => { recorded.push(r); },
    }),
  },
  estimateCallCost: () => 0.001,
}));
jest.mock('../../services/trace', () => ({
  recordCall: jest.fn(),
  recordFailedCall: jest.fn(),
  currentTag: () => 'other',
  captureTag: () => 'other',
  withTag: async (_t: string, fn: () => any) => fn(),
}));

import { chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig } from '../../types';

const cfg = {
  id: 'x', label: 'x', baseUrl: 'https://api.test', apiKey: 'k', model: 'm',
  thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 1, maxTokens: 100,
  safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: true,
} as ApiConfig;

const origFetch = globalThis.fetch;

beforeEach(() => {
  recorded.length = 0;
  jest.clearAllMocks();
  (globalThis as any).fetch = origFetch;
});

/** 让 fetch 消耗 ms 毫秒后返回一个合法响应 */
function slowFetch(ms: number) {
  return jest.fn(async () => {
    await new Promise(r => setTimeout(r, ms));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10 },
      }),
      text: async () => '',
    };
  });
}

describe('非流式调用耗时', () => {
  it('记录的是真实往返耗时，而不是 ~0ms', async () => {
    (globalThis as any).fetch = slowFetch(120);

    await chatCompletionSync(cfg, [{ role: 'user', content: 'hi' }]);

    expect(recorded).toHaveLength(1);
    const d = recorded[0].duration;
    // 关键断言：不能再是 0-1ms
    expect(d).toBeGreaterThanOrEqual(100);
    expect(d).toBeLessThan(600);
  });

  it('耗时随实际往返时间变化（不是固定值）', async () => {
    (globalThis as any).fetch = slowFetch(50);
    await chatCompletionSync(cfg, [{ role: 'user', content: 'a' }]);
    const fast = recorded[0].duration;

    recorded.length = 0;
    (globalThis as any).fetch = slowFetch(250);
    await chatCompletionSync(cfg, [{ role: 'user', content: 'b' }]);
    const slow = recorded[0].duration;

    expect(slow).toBeGreaterThan(fast);
    expect(slow - fast).toBeGreaterThan(120);
  });

  it('token 统计不受影响', async () => {
    (globalThis as any).fetch = slowFetch(10);
    await chatCompletionSync(cfg, [{ role: 'user', content: 'hi' }]);

    expect(recorded[0].inputTokens).toBe(10);
    expect(recorded[0].outputTokens).toBe(5);
  });
});
