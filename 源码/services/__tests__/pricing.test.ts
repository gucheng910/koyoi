// ============================================================
//  DeepSeek 定价（唯一真源）
//
//  官方：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
//  峰谷规则（脚注 3）：空闲价 = 高峰价的一半；
//  高峰时段为**北京时间周一至周五** 9:00-12:00、14:00-18:00。
//
//  这里重点锁住三件容易错的事：
//    1. 周末全天空闲（社区同类项目只判小时不判星期，这里不能重蹈）
//    2. 边界左闭右开（09:00 算高峰、12:00 不算）
//    3. 谷价恒为峰价一半（价格表打错一个字就能靠这条断言抓出来）
// ============================================================

import {
  PRICING, DEFAULT_MODEL, normalizeModel, isPeakTime, tierAt,
  pricesAt, calcCallCost, isOfficialBaseUrl, tierLabel, msUntilTierChange,
} from '../pricing';

/** 构造一个北京时间的时刻（莫斯科/设备时区无关，一律用 UTC 表达） */
function beijing(y: number, mo: number, d: number, h: number, mi = 0): Date {
  // 北京时间 = UTC+8 → 用 UTC 构造后减去 8 小时
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - 8 * 3600 * 1000);
}

describe('价格表与官方一致', () => {
  it('Flash 空闲价：命中 0.02 / 未命中 1 / 输出 4', () => {
    expect(PRICING['deepseek-flash'].offPeak).toEqual({ cacheHit: 0.02, cacheMiss: 1, output: 4 });
  });

  it('Flash 高峰价：命中 0.04 / 未命中 2 / 输出 8', () => {
    expect(PRICING['deepseek-flash'].peak).toEqual({ cacheHit: 0.04, cacheMiss: 2, output: 8 });
  });

  it('Pro 空闲价：命中 0.15 / 未命中 4.5 / 输出 13.5', () => {
    expect(PRICING['deepseek-v4-pro'].offPeak).toEqual({ cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 });
  });

  it('Pro 高峰价：命中 0.30 / 未命中 9 / 输出 27', () => {
    expect(PRICING['deepseek-v4-pro'].peak).toEqual({ cacheHit: 0.3, cacheMiss: 9, output: 27 });
  });

  it('空闲价恒为高峰价的一半（防手抖写错任意一项）', () => {
    for (const [id, p] of Object.entries(PRICING)) {
      for (const k of ['cacheHit', 'cacheMiss', 'output'] as const) {
        expect(`${id}.${k}: ${p.offPeak[k] * 2}`).toBe(`${id}.${k}: ${p.peak[k]}`);
      }
    }
  });
});

describe('模型名归一化', () => {
  it('官方现名', () => {
    expect(normalizeModel('deepseek-flash')).toBe('deepseek-flash');
    expect(normalizeModel('deepseek-v4-pro')).toBe('deepseek-v4-pro');
  });

  it('旧名 deepseek-v4-flash 归一化为 flash（官方：由 V4.1-Flash 提供服务并按 Flash 计费）', () => {
    expect(normalizeModel('deepseek-v4-flash')).toBe('deepseek-flash');
    expect(normalizeModel('deepseek-v4-flash-vision-exp')).toBe('deepseek-flash');
  });

  it('带版本号/灰度后缀', () => {
    expect(normalizeModel('deepseek-v4-pro-0813')).toBe('deepseek-v4-pro');
    expect(normalizeModel('deepseek-flash-20260101')).toBe('deepseek-flash');
  });

  it('大小写与空白不敏感', () => {
    expect(normalizeModel('  DeepSeek-Flash  ')).toBe('deepseek-flash');
  });

  it('更早的别名 deepseek-chat → flash', () => {
    expect(normalizeModel('deepseek-chat')).toBe('deepseek-flash');
  });

  it('未知模型返回 null —— 不静默按 Flash 猜价', () => {
    // 这正是过去 pro 被低估的根因：未知模型回退 flash 价且无提示
    expect(normalizeModel('gpt-4o')).toBeNull();
    expect(normalizeModel('qwen-max')).toBeNull();
    expect(normalizeModel('')).toBeNull();
    expect(normalizeModel(undefined)).toBeNull();
  });

  it('不会把含 pro 字样的无关模型误判为 pro', () => {
    expect(normalizeModel('my-proxy-model')).toBeNull();
    expect(normalizeModel('gpt-4-turbo-pro')).toBeNull();
  });
});

describe('峰谷判定（北京时间）', () => {
  it('周一 09:00 是高峰（左闭）', () => {
    // 2026-09-14 是周一
    expect(isPeakTime(beijing(2026, 9, 14, 9, 0))).toBe(true);
  });

  it('周一 08:59 不是高峰', () => {
    expect(isPeakTime(beijing(2026, 9, 14, 8, 59))).toBe(false);
  });

  it('周一 12:00 不是高峰（右开）', () => {
    expect(isPeakTime(beijing(2026, 9, 14, 12, 0))).toBe(false);
  });

  it('周一 11:59 是高峰', () => {
    expect(isPeakTime(beijing(2026, 9, 14, 11, 59))).toBe(true);
  });

  it('周一 14:00 是高峰，18:00 不是', () => {
    expect(isPeakTime(beijing(2026, 9, 14, 14, 0))).toBe(true);
    expect(isPeakTime(beijing(2026, 9, 14, 18, 0))).toBe(false);
  });

  it('周一 13:00（午休间隙）不是高峰', () => {
    expect(isPeakTime(beijing(2026, 9, 14, 13, 0))).toBe(false);
  });

  it('周五 18:00 之后进入空闲', () => {
    // 2026-09-18 是周五
    expect(isPeakTime(beijing(2026, 9, 18, 17, 59))).toBe(true);
    expect(isPeakTime(beijing(2026, 9, 18, 18, 0))).toBe(false);
  });

  it('【关键】周六、周日全天空闲 —— 官方明确「周一至周五」', () => {
    // 2026-09-19 周六 / 2026-09-20 周日
    for (const h of [9, 10, 11, 14, 15, 17]) {
      expect(isPeakTime(beijing(2026, 9, 19, h, 0))).toBe(false);
      expect(isPeakTime(beijing(2026, 9, 20, h, 0))).toBe(false);
    }
  });

  it('【关键】周六 10:00 若只按小时判断会被误判为高峰（社区同类项目的 bug）', () => {
    const sat10 = beijing(2026, 9, 19, 10, 0);
    const utcHour = sat10.getUTCHours();
    // 北京时间 10:00 = UTC 02:00，正落在社区项目写死的 [1,4) 区间里
    expect(utcHour).toBe(2);
    // 但它必须是空闲——因为那天是周六
    expect(isPeakTime(sat10)).toBe(false);
  });

  it('日期用 UTC 表达也能正确判定（设备时区无关）', () => {
    // 同一时刻，无论用什么方式构造 Date，判定结果一致
    const t1 = beijing(2026, 9, 14, 10, 0);
    const t2 = new Date(t1.getTime());
    expect(isPeakTime(t1)).toBe(isPeakTime(t2));
    expect(isPeakTime(t1)).toBe(true);
  });

  it('tierAt 与 isPeakTime 一致', () => {
    expect(tierAt(beijing(2026, 9, 14, 10, 0))).toBe('peak');
    expect(tierAt(beijing(2026, 9, 19, 10, 0))).toBe('off-peak');
  });

  it('msUntilTierChange 能在周末场景下算出下一次切换', () => {
    // 周五 17:00（高峰）→ 下一次切换是 18:00，60 分钟
    const ms = msUntilTierChange(beijing(2026, 9, 18, 17, 0));
    expect(ms).not.toBeNull();
    expect(Math.round(ms! / 60000)).toBe(60);
  });
});

describe('计价', () => {
  const at = beijing(2026, 9, 14, 10, 0);      // 周一高峰
  const offAt = beijing(2026, 9, 19, 10, 0);   // 周六空闲

  it('全 miss + 输出，按高峰价', () => {
    const c = calcCallCost({ cacheHitTokens: 0, cacheMissTokens: 1_000_000, outputTokens: 1_000_000 }, 'deepseek-flash', at);
    expect(c.priced).toBe(true);
    expect(c.tier).toBe('peak');
    expect(c.cacheMissCostRmb).toBeCloseTo(2, 6);   // 1M × 2元
    expect(c.outputCostRmb).toBeCloseTo(8, 6);      // 1M × 8元
    expect(c.totalCostRmb).toBeCloseTo(10, 6);
  });

  it('同一用量在空闲时段只要一半', () => {
    const tokens = { cacheHitTokens: 0, cacheMissTokens: 1_000_000, outputTokens: 1_000_000 };
    const peak = calcCallCost(tokens, 'deepseek-flash', at);
    const off = calcCallCost(tokens, 'deepseek-flash', offAt);
    expect(off.totalCostRmb).toBeCloseTo(peak.totalCostRmb / 2, 6);
  });

  it('缓存命中比未命中便宜得多（Flash：0.04 vs 2，50 倍）', () => {
    const hitOnly = calcCallCost({ cacheHitTokens: 1_000_000, cacheMissTokens: 0, outputTokens: 0 }, 'deepseek-flash', at);
    const missOnly = calcCallCost({ cacheHitTokens: 0, cacheMissTokens: 1_000_000, outputTokens: 0 }, 'deepseek-flash', at);
    expect(hitOnly.cacheHitCostRmb).toBeCloseTo(0.04, 6);
    expect(missOnly.cacheMissCostRmb).toBeCloseTo(2, 6);
  });

  it('Pro 比 Flash 贵', () => {
    const tokens = { cacheHitTokens: 0, cacheMissTokens: 1_000_000, outputTokens: 1_000_000 };
    const flash = calcCallCost(tokens, 'deepseek-flash', at);
    const pro = calcCallCost(tokens, 'deepseek-v4-pro', at);
    expect(pro.totalCostRmb).toBeGreaterThan(flash.totalCostRmb);
    expect(pro.cacheMissCostRmb).toBeCloseTo(9, 6);
    expect(pro.outputCostRmb).toBeCloseTo(27, 6);
  });

  it('旧模型名按 Flash 价计费', () => {
    const tokens = { cacheHitTokens: 0, cacheMissTokens: 1_000_000, outputTokens: 0 };
    const legacy = calcCallCost(tokens, 'deepseek-v4-flash', at);
    const now = calcCallCost(tokens, 'deepseek-flash', at);
    expect(legacy.totalCostRmb).toBeCloseTo(now.totalCostRmb, 9);
    expect(legacy.modelId).toBe('deepseek-flash');
  });

  it('未知模型：priced=false，费用 0，但仍给出 tier（便于 UI 提示）', () => {
    const c = calcCallCost({ cacheHitTokens: 100, cacheMissTokens: 200, outputTokens: 50 }, 'gpt-4o', at);
    expect(c.priced).toBe(false);
    expect(c.totalCostRmb).toBe(0);
    expect(c.modelId).toBeNull();
    expect(c.tier).toBe('peak');
  });

  it('负数/NaN 输入被夹到 0（不产生负费用）', () => {
    const c = calcCallCost({ cacheHitTokens: -5, cacheMissTokens: NaN as any, outputTokens: -1 }, 'deepseek-flash', at);
    expect(c.totalCostRmb).toBe(0);
  });

  it('明细各项之和等于总额', () => {
    const c = calcCallCost({ cacheHitTokens: 1234, cacheMissTokens: 5678, outputTokens: 9012 }, 'deepseek-v4-pro', at);
    expect(c.cacheHitCostRmb + c.cacheMissCostRmb + c.outputCostRmb).toBeCloseTo(c.totalCostRmb, 10);
  });
});

describe('pricesAt', () => {
  it('高峰取 peak 价，空闲取 offPeak 价', () => {
    expect(pricesAt('deepseek-flash', beijing(2026, 9, 14, 10, 0))!.prices.output).toBe(8);
    expect(pricesAt('deepseek-flash', beijing(2026, 9, 19, 10, 0))!.prices.output).toBe(4);
  });

  it('未知模型返回 null', () => {
    expect(pricesAt('gpt-4o')).toBeNull();
  });
});

describe('端点判定', () => {
  it('官方端点计价', () => {
    expect(isOfficialBaseUrl('https://api.deepseek.com')).toBe(true);
    expect(isOfficialBaseUrl(undefined)).toBe(true);
  });

  it('第三方端点不按 DeepSeek 价算', () => {
    expect(isOfficialBaseUrl('https://api.openai.com')).toBe(false);
    expect(isOfficialBaseUrl('https://my-proxy.example.com/v1')).toBe(false);
  });
});

describe('展示标签', () => {
  it('档位中文名', () => {
    expect(tierLabel('peak')).toBe('高峰价');
    expect(tierLabel('off-peak')).toBe('空闲价');
  });

  it('默认模型是官方现名', () => {
    expect(DEFAULT_MODEL).toBe('deepseek-flash');
    expect(PRICING[DEFAULT_MODEL]).toBeDefined();
  });
});
