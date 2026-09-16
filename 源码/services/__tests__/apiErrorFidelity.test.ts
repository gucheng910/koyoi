// ============================================================
//  API 错误保真（真机测试中发现的问题）
//
//  实机测试时发送消息报「网络连接失败，请检查网络后重试」，
//  但同一个 APK 里：设备 `curl https://api.deepseek.com/v1/models`
//  返回 HTTP 401（0.16s），说明网络完全正常。
//
//  根因：chatCompletion 的 catch 把**任何**异常都替换成
//  「网络连接失败」，真实的 name / message 被丢弃——401、404、
//  JSON 解析失败、超时 全都长得一样，无法定位。
//
//  这个文件锁住：错误原因必须被保留。
// ============================================================

const origFetch = globalThis.fetch;

jest.mock('../../store/usageStore', () => ({
  useUsageStore: { getState: () => ({ record: jest.fn() }) },
  estimateCallCost: () => 0,
}));

// 注意：recordFailedCall 是 deepseek.ts 内部的**局部函数**（不是从 trace 导入的），
// 无法通过 mock 模块断言；它内部会调 trace 的 recordCall —— 断言那一层。
const mockRecordCall = jest.fn();
jest.mock('../../services/trace', () => ({
  recordCall: (...a: any[]) => mockRecordCall(...a),
  recordFailedCall: jest.fn(),
  currentTag: () => 'other',
  captureTag: () => 'other',
  withTag: async (_t: string, fn: () => any) => fn(),
}));

import { chatCompletion } from '../../api/deepseek';
import type { ApiConfig } from '../../types';

const cfg = {
  id: 'x', label: 'x', baseUrl: 'https://api.test', apiKey: 'k', model: 'm',
  thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 1, maxTokens: 100,
  safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: true,
} as ApiConfig;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).fetch = origFetch;
});

/** 收集 onError 传出的错误 */
function captureError(): { get: () => Error | null } {
  let captured: Error | null = null;
  return { get: () => captured };
}

describe('错误保真', () => {
  it('fetch 抛 TypeError 时，错误消息带上真实原因', async () => {
    (globalThis as any).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });

    let err: Error | null = null;
    await chatCompletion({
      config: cfg,
      messages: [{ role: 'user', content: 'hi', timestamp: 't' }],
      onError: (e) => { err = e; },
    });

    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeError');
    expect(err!.message).toContain('Network request failed');
    // 不能只有那句笼统的提示
    expect(err!.message).not.toBe('网络连接失败，请检查网络后重试');
  });

  it('失败时写入 trace，便于诊断面板看到', async () => {
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('boom');
    });

    await chatCompletion({
      config: cfg,
      messages: [{ role: 'user', content: 'hi', timestamp: 't' }],
    });

    expect(mockRecordCall).toHaveBeenCalled();
    const entry = mockRecordCall.mock.calls[0][0];
    expect(entry.ok).toBe(false);
    expect(entry.error).toContain('boom');
  });

  it('AbortError 仍然静默返回（用户主动取消不算错误）', async () => {
    const abortErr: any = new Error('Aborted');
    abortErr.name = 'AbortError';
    (globalThis as any).fetch = jest.fn(async () => { throw abortErr; });

    let called = false;
    const r = await chatCompletion({
      config: cfg,
      messages: [{ role: 'user', content: 'hi', timestamp: 't' }],
      onError: () => { called = true; },
    });

    expect(r).toBe('');
    expect(called).toBe(false);
    expect(mockRecordCall).not.toHaveBeenCalled();
  });

  it('HTTP 401 走的是响应分支，错误消息含状态码', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: false, status: 401, text: async () => 'Unauthorized',
    }));

    let err: Error | null = null;
    await chatCompletion({
      config: cfg,
      messages: [{ role: 'user', content: 'hi', timestamp: 't' }],
      onError: (e) => { err = e; },
    });

    expect(err!.message).toContain('API Key 无效');
  });
});
