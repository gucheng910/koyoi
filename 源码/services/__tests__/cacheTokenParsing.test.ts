// ============================================================
//  缓存 token 解析（价格算错的根因之一）
//
//  原实现：
//      const miss = usageData.prompt_cache_miss_tokens ?? usageData.prompt_tokens;
//
//  当 `prompt_cache_miss_tokens` **缺失**（部分 OpenAI 兼容端点只回
//  prompt_tokens，或另有 prompt_tokens_details.cached_tokens）而
//  `prompt_cache_hit_tokens` 存在时：
//      miss = prompt_tokens  ← 含已命中的部分
//      hit  = 命中量        ← 又算一遍
//  于是**命中部分被计费两次**，账单比实际高。
//
//  原注释写的是「?? 而非 ||：完全命中缓存（miss=0）时保持 0」——
//  它修的是 miss === 0 的情况，却漏了 miss === undefined，留下了这个洞。
//
//  正确兜底：miss = prompt_tokens − hit。
// ============================================================

import { parseCacheTokens } from '../../api/deepseek';

describe('官方字段齐全时直接采用', () => {
  it('标准 DeepSeek 响应', () => {
    const r = parseCacheTokens({
      prompt_tokens: 1000,
      completion_tokens: 50,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200,
    });
    expect(r.input).toBe(1000);
    expect(r.hit).toBe(800);
    expect(r.miss).toBe(200);
    // 命中 + 未命中 = 输入总量（不重不漏）
    expect(r.hit + r.miss).toBe(r.input);
  });

  it('完全命中缓存（miss=0）保持 0', () => {
    const r = parseCacheTokens({
      prompt_tokens: 500,
      prompt_cache_hit_tokens: 500,
      prompt_cache_miss_tokens: 0,
    });
    expect(r.miss).toBe(0);
    expect(r.hit).toBe(500);
  });

  it('完全未命中（hit=0）', () => {
    const r = parseCacheTokens({
      prompt_tokens: 500,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 500,
    });
    expect(r.hit).toBe(0);
    expect(r.miss).toBe(500);
  });
});

describe('【核心】miss 缺失时的兜底不能双重计费', () => {
  it('只回 prompt_tokens 与 hit：miss 必须扣除命中量', () => {
    const r = parseCacheTokens({
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 800,
      // 没有 prompt_cache_miss_tokens
    });
    // 旧实现会给出 miss = 1000（把命中的 800 又算一遍）
    expect(r.miss).toBe(200);
    expect(r.hit + r.miss).toBe(r.input);
  });

  it('三者齐全性：任何组合下 hit + miss 都等于 input', () => {
    const cases = [
      { prompt_tokens: 1000, prompt_cache_hit_tokens: 300 },
      { prompt_tokens: 1000 },
      { prompt_tokens: 1000, prompt_cache_hit_tokens: 0 },
      { prompt_tokens: 1000, prompt_cache_hit_tokens: 1000 },
      { prompt_tokens: 1234, prompt_cache_hit_tokens: 56, prompt_cache_miss_tokens: 1178 },
    ];
    for (const c of cases) {
      const r = parseCacheTokens(c);
      // 不重不漏：命中 + 未命中 必须恰好等于输入总量
      expect(r.hit + r.miss).toBe(r.input);
    }
  });

  it('兼容 OpenAI 风格 prompt_tokens_details.cached_tokens', () => {
    const r = parseCacheTokens({
      prompt_tokens: 1000,
      prompt_tokens_details: { cached_tokens: 400 },
    });
    expect(r.hit).toBe(400);
    expect(r.miss).toBe(600);
  });

  it('官方字段优先于 OpenAI 字段', () => {
    const r = parseCacheTokens({
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 250,
      prompt_tokens_details: { cached_tokens: 999 },
    });
    expect(r.hit).toBe(250);
    expect(r.miss).toBe(750);
  });
});

describe('健壮性', () => {
  it('usage 为空对象 → 全 0', () => {
    expect(parseCacheTokens({})).toEqual({ input: 0, hit: 0, miss: 0 });
  });

  it('usage 为 null/undefined → 全 0，不抛错', () => {
    expect(parseCacheTokens(null)).toEqual({ input: 0, hit: 0, miss: 0 });
    expect(parseCacheTokens(undefined)).toEqual({ input: 0, hit: 0, miss: 0 });
  });

  it('hit 大于 input（异常响应）时 miss 夹到 0，不出现负数', () => {
    const r = parseCacheTokens({ prompt_tokens: 100, prompt_cache_hit_tokens: 150 });
    expect(r.miss).toBe(0);
    expect(r.miss).toBeGreaterThanOrEqual(0);
  });

  it('miss 为负数时夹到 0', () => {
    const r = parseCacheTokens({ prompt_tokens: 100, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: -5 });
    expect(r.miss).toBe(0);
  });

  it('字段是字符串数字时也能解析', () => {
    const r = parseCacheTokens({ prompt_tokens: '1000', prompt_cache_hit_tokens: '400' } as any);
    expect(r.input).toBe(1000);
    expect(r.hit).toBe(400);
    expect(r.miss).toBe(600);
  });
});

describe('费用影响（说明这个 bug 有多贵）', () => {
  it('旧兜底会让输入费用虚高', () => {
    // 场景：1000 输入、其中 800 命中
    const usage = { prompt_tokens: 1000, prompt_cache_hit_tokens: 800 };

    const fixed = parseCacheTokens(usage);

    // Flash 高峰价：命中 0.04 / 未命中 2（元每百万）
    const rate = { hit: 0.04, miss: 2 };
    const oldMiss = 1000; // 旧实现
    const oldCost = (800 / 1e6) * rate.hit + (oldMiss / 1e6) * rate.miss;
    const newCost = (fixed.hit / 1e6) * rate.hit + (fixed.miss / 1e6) * rate.miss;

    // 旧实现把命中部分当成未命中又算了一遍
    expect(oldCost).toBeGreaterThan(newCost);
    // 虚高比例约等于命中率
    expect(oldCost / newCost).toBeGreaterThan(1.4);
  });
});
