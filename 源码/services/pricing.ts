// ============================================================
//  DeepSeek 定价（唯一真源）
//
//  为什么单独成文件：原先有两套（store/usageStore.ts 与
//  services/costEstimate.ts），互相不一致——分析前的「预估费用」和
//  分析后的「实际记账」用的是不同价格表。同一个 app 里两个答案，
//  用户自然会觉得「价格算得有问题」。
//
//  官方来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
//
//  峰谷规则（官方脚注 3）：
//    「空闲时段价格为高峰时段价格的一半。高峰时段为北京时间周一至周五
//      9:00-12:00、14:00-18:00（其余为空闲时段）。」
//
//  ⚠️ 注意「周一至周五」。社区里有个同类项目只判断了小时、没判断星期，
//  结果周末也被算成高峰价——这里不要重蹈覆辙，见 isPeakTime 的测试。
// ============================================================

/** 每百万 tokens 的人民币单价 */
export interface TierPrices {
  /** 输入 · 缓存命中 */
  cacheHit: number;
  /** 输入 · 缓存未命中 */
  cacheMiss: number;
  /** 输出 */
  output: number;
}

export type PriceTier = 'peak' | 'off-peak';

export interface ModelPricing {
  /** 展示名 */
  label: string;
  /** 官方模型版本 */
  version: string;
  peak: TierPrices;
  offPeak: TierPrices;
}

// ---------------------------------------------------------------
//  官方价格表（元 / 百万 tokens）
// ---------------------------------------------------------------

export const PRICING: Record<string, ModelPricing> = {
  'deepseek-flash': {
    label: 'V4.1 Flash',
    version: 'DeepSeek-V4.1-Flash',
    offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  },
  'deepseek-v4-pro': {
    label: 'V4 Pro',
    version: 'DeepSeek-V4-Pro-0813',
    offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
  },
};

/** 默认模型（官方现名；旧名 deepseek-v4-flash 已下线） */
export const DEFAULT_MODEL = 'deepseek-flash';

/**
 * 模型名归一化。
 *
 * 官方现名：deepseek-flash / deepseek-v4-pro
 * 旧名（仍可调用，由 V4.1-Flash 提供服务并按 Flash 计费）：
 *   deepseek-v4-flash、deepseek-v4-flash-vision-exp
 * 更早的别名：deepseek-chat（→ Flash）
 *
 * 返回 null 表示**不认识**。调用方应据此只统计 token、不显示费用，
 * 而不是静默按 Flash 价估算——那正是过去 pro 被低估的原因。
 */
export function normalizeModel(model: string | undefined | null): string | null {
  if (!model) return null;
  const m = model.trim().toLowerCase();
  if (!m) return null;

  // 精确命中
  if (m in PRICING) return m;

  // 带版本号 / 灰度后缀：deepseek-v4-pro-0813、deepseek-flash-2026xx
  if (/^deepseek-flash([-.]|$)/.test(m)) return 'deepseek-flash';
  if (/^deepseek-v4-pro([-.]|$)/.test(m)) return 'deepseek-v4-pro';

  // 旧名：v4-flash 系列（含 vision-exp）统一按 Flash 计费
  if (/^deepseek-v4-flash([-.]|$)/.test(m)) return 'deepseek-flash';

  // 更早的通用别名
  if (m === 'deepseek-chat' || m === 'deepseek-coder') return 'deepseek-flash';

  return null;
}

// ---------------------------------------------------------------
//  峰谷判定
// ---------------------------------------------------------------

/** 北京时间 = UTC+8 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 高峰时段（北京时间，分钟数，左闭右开） */
const PEAK_WINDOWS_MIN: Array<[number, number]> = [
  [9 * 60, 12 * 60],   // 09:00 - 12:00
  [14 * 60, 18 * 60],  // 14:00 - 18:00
];

/**
 * 判断某时刻是否为高峰时段。
 *
 * 规则：北京时间，周一至周五，09:00-12:00 与 14:00-18:00。
 * 边界取左闭右开：09:00 算高峰、12:00 不算；14:00 算、18:00 不算。
 */
export function isPeakTime(at: Date = new Date()): boolean {
  // 把 UTC 时间平移到北京墙上时间，再一律用 getUTC* 读取，
  // 避免依赖运行环境的本地时区（设备可能在任意时区）。
  const cst = new Date(at.getTime() + CST_OFFSET_MS);
  const day = cst.getUTCDay();              // 0=周日 … 6=周六
  if (day === 0 || day === 6) return false; // 周末全天空闲
  const minutes = cst.getUTCHours() * 60 + cst.getUTCMinutes();
  return PEAK_WINDOWS_MIN.some(([s, e]) => minutes >= s && minutes < e);
}

export function tierAt(at: Date = new Date()): PriceTier {
  return isPeakTime(at) ? 'peak' : 'off-peak';
}

/** 距离下一次峰谷切换还有多少毫秒（用于 UI 提示，null 表示无法计算） */
export function msUntilTierChange(at: Date = new Date()): number | null {
  const before = isPeakTime(at);
  // 最多向后看 3 天（跨周末时足够）
  for (let min = 1; min <= 3 * 24 * 60; min++) {
    const t = new Date(at.getTime() + min * 60_000);
    if (isPeakTime(t) !== before) return min * 60_000;
  }
  return null;
}

// ---------------------------------------------------------------
//  计价
// ---------------------------------------------------------------

export interface CallTokens {
  /** 输入 · 缓存命中 */
  cacheHitTokens: number;
  /** 输入 · 缓存未命中 */
  cacheMissTokens: number;
  outputTokens: number;
}

export interface CostBreakdown {
  /** 是否能计价（未知模型 → false，费用为 0，但仍可统计 token） */
  priced: boolean;
  modelId: string | null;
  tier: PriceTier;
  cacheHitCostRmb: number;
  cacheMissCostRmb: number;
  outputCostRmb: number;
  totalCostRmb: number;
  prices: TierPrices | null;
}

/** 取某模型在某时刻适用的单价；未知模型返回 null */
export function pricesAt(model: string | undefined | null, at: Date = new Date()): {
  modelId: string;
  tier: PriceTier;
  prices: TierPrices;
} | null {
  const id = normalizeModel(model);
  if (!id) return null;
  const entry = PRICING[id];
  if (!entry) return null;
  const tier = tierAt(at);
  return { modelId: id, tier, prices: tier === 'peak' ? entry.peak : entry.offPeak };
}

const PER_MILLION = 1_000_000;

/**
 * 计算一次调用的费用。
 *
 * @param at 调用**发生**的时刻——费用取决于那一刻是峰还是谷，
 *           不能用「现在」去算历史记录。
 */
export function calcCallCost(
  tokens: CallTokens,
  model: string | undefined | null,
  at: Date = new Date()
): CostBreakdown {
  const hit = Math.max(0, tokens.cacheHitTokens || 0);
  const miss = Math.max(0, tokens.cacheMissTokens || 0);
  const out = Math.max(0, tokens.outputTokens || 0);

  const resolved = pricesAt(model, at);
  if (!resolved) {
    return {
      priced: false,
      modelId: normalizeModel(model),
      tier: tierAt(at),
      cacheHitCostRmb: 0,
      cacheMissCostRmb: 0,
      outputCostRmb: 0,
      totalCostRmb: 0,
      prices: null,
    };
  }

  const { prices, tier, modelId } = resolved;
  const cacheHitCostRmb = (hit / PER_MILLION) * prices.cacheHit;
  const cacheMissCostRmb = (miss / PER_MILLION) * prices.cacheMiss;
  const outputCostRmb = (out / PER_MILLION) * prices.output;

  return {
    priced: true,
    modelId,
    tier,
    cacheHitCostRmb,
    cacheMissCostRmb,
    outputCostRmb,
    totalCostRmb: cacheHitCostRmb + cacheMissCostRmb + outputCostRmb,
    prices,
  };
}

/** 仅 DeepSeek 官方端点才计价（第三方兼容端点价格未知） */
export function isOfficialBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return true;
  return baseUrl.includes('api.deepseek.com');
}

/** UI 展示用的档位名 */
export function tierLabel(tier: PriceTier): string {
  return tier === 'peak' ? '高峰价' : '空闲价';
}
