// ============================================================
//  调用追踪（阶段七）
//
//  项目有 100 处 console.*，release 里全丢；usageStore 记了 token/费用
//  但**没有子系统归因**——看到费用翻倍不知道钱花在哪。
//
//  这里锁住：标签正确归属、嵌套取最内层、并发不串味、
//  按子系统汇总、环形缓冲有上限、失败调用也留痕。
// ============================================================

import {
  withTag, currentTag, recordCall, getTrace, summarizeByTag,
  beginTurn, endTurn, clearTrace, exportTrace,
} from '../trace';

beforeEach(() => clearTrace());

describe('标签作用域', () => {
  it('默认标签为 other', () => {
    expect(currentTag()).toBe('other');
  });

  it('withTag 内 currentTag 返回该标签', async () => {
    await withTag('polish', async () => {
      expect(currentTag()).toBe('polish');
    });
    expect(currentTag()).toBe('other');
  });

  it('退出作用域后标签恢复（含异常路径）', async () => {
    await expect(withTag('router', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(currentTag()).toBe('other');   // finally 保证弹栈
  });

  it('嵌套取最内层', async () => {
    await withTag('narrator', async () => {
      expect(currentTag()).toBe('narrator');
      await withTag('polish', async () => {
        expect(currentTag()).toBe('polish');
      });
      expect(currentTag()).toBe('narrator');
    });
  });

  it('并发调用不串味（每个调用有自己的作用域）', async () => {
    const seen: string[] = [];
    await Promise.all([
      withTag('character-sim', async () => {
        await new Promise(r => setTimeout(r, 20));
        seen.push(currentTag());
      }),
      withTag('router', async () => {
        await new Promise(r => setTimeout(r, 5));
        seen.push(currentTag());
      }),
    ]);
    expect(seen.sort()).toEqual(['character-sim', 'router']);
  });
});

describe('记录与归因', () => {
  it('recordCall 归到当前标签', async () => {
    await withTag('world-pulse', async () => {
      recordCall({ model: 'm', durationMs: 100, ok: true, inputTokens: 10, outputTokens: 5, cacheHitTokens: 0, costRmb: 0.001 });
    });
    const { calls } = getTrace();
    expect(calls).toHaveLength(1);
    expect(calls[0].tag).toBe('world-pulse');
  });

  it('按子系统汇总，费用高的排前面', async () => {
    await withTag('character-sim', async () => {
      recordCall({ model: 'm', durationMs: 2000, ok: true, inputTokens: 5000, outputTokens: 1000, cacheHitTokens: 0, costRmb: 0.05 });
    });
    await withTag('router', async () => {
      recordCall({ model: 'm', durationMs: 500, ok: true, inputTokens: 800, outputTokens: 100, cacheHitTokens: 0, costRmb: 0.002 });
    });
    await withTag('character-sim', async () => {
      recordCall({ model: 'm', durationMs: 1800, ok: true, inputTokens: 4800, outputTokens: 900, cacheHitTokens: 0, costRmb: 0.048 });
    });

    const s = summarizeByTag();
    expect(s[0].tag).toBe('character-sim');
    expect(s[0].calls).toBe(2);
    expect(s[0].avgMs).toBe(1900);          // (2000+1800)/2
    expect(s[1].tag).toBe('router');
  });

  it('失败的调用也留痕，并计入 errors', async () => {
    await withTag('narrator', async () => {
      recordCall({ model: 'm', durationMs: 50, ok: false, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costRmb: 0, error: 'timeout' });
    });
    const s = summarizeByTag();
    expect(s[0].errors).toBe(1);
    expect(getTrace().calls[0].error).toBe('timeout');
  });

  it('显式传入 tag 时覆盖当前作用域', async () => {
    await withTag('narrator', async () => {
      recordCall({ tag: 'polish', model: 'm', durationMs: 1, ok: true, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costRmb: 0 });
    });
    expect(getTrace().calls[0].tag).toBe('polish');
  });
});

describe('轮次归因', () => {
  it('调用归入当前轮次', () => {
    beginTurn(7);
    recordCall({ model: 'm', durationMs: 1, ok: true, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costRmb: 0 });
    endTurn(7);

    const t = getTrace().turns.find(x => x.turn === 7)!;
    expect(t.calls).toHaveLength(1);
    expect(getTrace().calls[0].turn).toBe(7);
  });

  it('endTurn 记录耗时', async () => {
    beginTurn(1);
    await new Promise(r => setTimeout(r, 15));
    endTurn(1);
    expect(getTrace().turns[0].durationMs).toBeGreaterThanOrEqual(10);
  });
});

describe('内存上限', () => {
  it('调用记录有环形上限，不会无限增长', () => {
    for (let i = 0; i < 300; i++) {
      recordCall({ model: 'm', durationMs: 1, ok: true, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costRmb: 0 });
    }
    expect(getTrace().calls.length).toBeLessThanOrEqual(200);
  });

  it('轮次记录有上限', () => {
    for (let i = 0; i < 40; i++) beginTurn(i);
    expect(getTrace().turns.length).toBeLessThanOrEqual(20);
  });

  it('最新记录排在最前（诊断时看最近的）', () => {
    recordCall({ model: 'old', durationMs: 1, ok: true, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costRmb: 0 });
    recordCall({ model: 'new', durationMs: 1, ok: true, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, costRmb: 0 });
    expect(getTrace().calls[0].model).toBe('new');
  });
});

describe('导出', () => {
  it('导出可解析的 JSON，含按子系统汇总与总计', async () => {
    await withTag('character-sim', async () => {
      recordCall({ model: 'm', durationMs: 100, ok: true, inputTokens: 100, outputTokens: 50, cacheHitTokens: 0, costRmb: 0.01 });
    });
    beginTurn(1);
    endTurn(1);

    const json = JSON.parse(exportTrace());
    expect(json.byTag[0].tag).toBe('character-sim');
    expect(json.totals.calls).toBe(1);
    expect(json.totals.costRmb).toBeCloseTo(0.01, 5);
    expect(json.turns[0].turn).toBe(1);
  });
});
