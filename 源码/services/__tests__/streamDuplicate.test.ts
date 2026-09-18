// ============================================================
//  流式解析 —— 回归测试
//
//  背景：readStream 的 `if (data === '[DONE]') break;` 只能跳出内层
//  for 循环，外层 `while (true)` 会继续 reader.read()。上游若在 [DONE]
//  之后再吐一帧（部分网关会重发尾部内容），该帧会被再次 fullText += ，
//  表现为回答里整句复读。
//  实测症状：同一句「你知道她在等你把话说完」连续出现三次。
//
//  这里用一个假的 fetch Response 喂 SSE 数据，直接驱动 chatCompletion。
// ============================================================

import { chatCompletion } from '../../api/deepseek';
import type { ApiConfig } from '../../types';

function sseStream(chunks: string[]): any {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () => {
            if (i >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: encoder.encode(chunks[i++]) };
          },
          cancel: async () => {},
        };
      },
    },
  } as any;
}

function frame(content: string): string {
  return JSON.stringify({ choices: [{ delta: { content } }] });
}

/** 把若干帧包成一个 SSE 文本块 */
function block(...contents: string[]): string {
  return contents.map(c => 'data: ' + c + '\n\n').join('');
}

const DONE_BLOCK = 'data: [DONE]\n\n';

const cfg: ApiConfig = {
  id: 'c1', apiKey: 'k', baseUrl: 'http://x', model: 'm',
  thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 0.75,
  maxTokens: 100, safetyFilter: 'moderate', streamOutput: true, autoPolish: false,
} as any;

describe('readStream SSE 解析', () => {
  afterEach(() => { (global as any).fetch = undefined; });

  it('[DONE] 之后到来的帧不会被重复拼接', async () => {
    const tail = '尾巴内容。';
    // 关键：尾部帧在 [DONE] **之后的一次独立 read()** 中到达，
    // 这才是真实网关的行为，也是旧实现会把内容再拼一遍的场景。
    (global as any).fetch = async () => sseStream([
      block(frame('第一句。'), frame('第二句。')),
      DONE_BLOCK,
      block(frame(tail)),
    ]);

    const out = await chatCompletion({ config: cfg, messages: [{ role: 'user', content: 'hi' }] as any });
    expect(out).toBe('第一句。第二句。');
    expect(out).not.toContain(tail);
  });

  it('同一批次里 [DONE] 后的帧也不拼接', async () => {
    (global as any).fetch = async () => sseStream([
      block(frame('A')) + DONE_BLOCK + block(frame('B')),
    ]);
    const out = await chatCompletion({ config: cfg, messages: [{ role: 'user', content: 'hi' }] as any });
    expect(out).toBe('A');
  });

  it('正常流按序拼接', async () => {
    (global as any).fetch = async () => sseStream([
      block(frame('A'), frame('B')),
      block(frame('C')),
      DONE_BLOCK,
    ]);
    const out = await chatCompletion({ config: cfg, messages: [{ role: 'user', content: 'hi' }] as any });
    expect(out).toBe('ABC');
  });

  it('onToken 收到的内容与最终文本一致（无重复投递）', async () => {
    const tokens: string[] = [];
    (global as any).fetch = async () => sseStream([
      block(frame('甲')),
      DONE_BLOCK,
      block(frame('乙')),   // 不应被投递
    ]);
    const out = await chatCompletion({
      config: cfg,
      messages: [{ role: 'user', content: 'hi' }] as any,
      onToken: (t: string) => tokens.push(t),
    });
    expect(tokens.join('')).toBe(out);
    expect(tokens.join('')).toBe('甲');
  });

  it('忽略非 data 行与畸形 JSON', async () => {
    (global as any).fetch = async () => sseStream([
      'data: ' + frame('好') + '\n\n' + ': keep-alive\n\n' + 'data: {bad json\n\n',
      DONE_BLOCK,
    ]);
    const out = await chatCompletion({ config: cfg, messages: [{ role: 'user', content: 'hi' }] as any });
    expect(out).toBe('好');
  });

  it('流中断时保留已收到的正文，并上报「可能不完整」', async () => {
    // 模拟：先给一段正文，随后读取抛错（如 30s 无数据被掐断）。
    // 旧行为是 return '' 把已收到的内容整段丢掉。
    const enc = new TextEncoder();
    let n = 0;
    (global as any).fetch = async () => ({
      ok: true, status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            n++;
            if (n === 1) return { done: false, value: enc.encode(block(frame('前半句。'))) };
            throw new Error('流式响应超时(30s 无数据)，输出可能不完整');
          },
          cancel: async () => {},
        }),
      },
    } as any);

    const errors: string[] = [];
    const out = await chatCompletion({
      config: cfg,
      messages: [{ role: 'user', content: 'hi' }] as any,
      onError: (e: Error) => errors.push(e.message),
    });
    // 正文被保留
    expect(out).toBe('前半句。');
    // 同时告知用户可能不完整
    expect(errors.join(' ')).toContain('不完整');
  });
});
