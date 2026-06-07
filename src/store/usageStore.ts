// ============================================================
//  用量追踪 - 今日/累计 token 消耗及 RMB 换算
//  存储: AsyncStorage + zustand
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USAGE_KEY = '@koyoi_usage';

// DeepSeek V4 官方定价 (RMB/1M tokens)
// 来源: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
// Pro 2.5折将于 2026/5/31 后永久生效
const PRICING: Record<string, { input: number; cached: number; output: number }> = {
  'deepseek-v4-flash': { input: 1.0, cached: 0.02, output: 2.0 },
  'deepseek-v4-pro':   { input: 3.0, cached: 0.025, output: 6.0 },
};

export interface DailyUsage {
  date: string;          // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  calls: number;
  inputCostRmb: number;
  outputCostRmb: number;
}

export interface UsageSnapshot {
  today: DailyUsage;
  total: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    calls: number;
    inputCostRmb: number;
    outputCostRmb: number;
  };
  /** 逐次调用记录（最近 50 条） */
  recentCalls: CallRecord[];
}

export interface CallRecord {
  id: string;
  time: number;          // timestamp
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  costRmb: number;       // 本次调用总花费
  duration?: number;     // ms
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(): DailyUsage {
  return {
    date: todayKey(),
    inputTokens: 0,
    outputTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    calls: 0,
    inputCostRmb: 0,
    outputCostRmb: 0,
  };
}

function calcCost(model: string, inputTokens: number, outputTokens: number, cacheHitTokens: number, cacheMissTokens: number, baseUrl?: string) {
  // 仅 DeepSeek 官方 API 计算 RMB，其他提供商只记 token
  const isOfficial = !baseUrl || baseUrl.includes('api.deepseek.com');
  if (!isOfficial) return { inputCostRmb: 0, outputCostRmb: 0, totalCostRmb: 0 };
  const p = PRICING[model] || PRICING['deepseek-v4-flash'];
  const inputMissCost = (cacheMissTokens / 1_000_000) * p.input;
  const inputHitCost = (cacheHitTokens / 1_000_000) * p.cached;
  const outputCost = (outputTokens / 1_000_000) * p.output;
  return { inputCostRmb: inputMissCost + inputHitCost, outputCostRmb: outputCost, totalCostRmb: inputMissCost + inputHitCost + outputCost };
}

interface UsageState {
  usage: UsageSnapshot;
  isLoaded: boolean;
  _pendingSave: UsageSnapshot | null;

  load: () => Promise<void>;
  record: (record: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    duration?: number;
    baseUrl?: string;
  }) => void;
  flush: () => Promise<void>;
  reset: () => Promise<void>;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  usage: {
    today: emptyDay(),
    total: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, calls: 0, inputCostRmb: 0, outputCostRmb: 0 },
    recentCalls: [],
  },
  isLoaded: false,
  _pendingSave: null,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(USAGE_KEY);
      if (raw) {
        const parsed: UsageSnapshot = JSON.parse(raw);
        // 检查是否是今天的数据
        const tk = todayKey();
        if (parsed.today.date !== tk) {
          parsed.today = emptyDay();
        }
        set({ usage: parsed, isLoaded: true });
      } else {
        set({
          usage: {
            today: emptyDay(),
            total: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, calls: 0, inputCostRmb: 0, outputCostRmb: 0 },
            recentCalls: [],
          },
          isLoaded: true,
        });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  record: (rec) => {
    const { usage } = get();
    const costs = calcCost(rec.model, rec.inputTokens, rec.outputTokens, rec.cacheHitTokens, rec.cacheMissTokens, rec.baseUrl);

    const callRecord: CallRecord = {
      id: 'c_' + Date.now(),
      time: Date.now(),
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheHitTokens: rec.cacheHitTokens,
      cacheMissTokens: rec.cacheMissTokens,
      costRmb: costs.totalCostRmb,
      duration: rec.duration,
    };

    const newUsage: UsageSnapshot = {
      today: {
        ...usage.today,
        inputTokens: usage.today.inputTokens + rec.inputTokens,
        outputTokens: usage.today.outputTokens + rec.outputTokens,
        cacheHitTokens: usage.today.cacheHitTokens + rec.cacheHitTokens,
        cacheMissTokens: usage.today.cacheMissTokens + rec.cacheMissTokens,
        calls: usage.today.calls + 1,
        inputCostRmb: usage.today.inputCostRmb + costs.inputCostRmb,
        outputCostRmb: usage.today.outputCostRmb + costs.outputCostRmb,
      },
      total: {
        inputTokens: usage.total.inputTokens + rec.inputTokens,
        outputTokens: usage.total.outputTokens + rec.outputTokens,
        cacheHitTokens: usage.total.cacheHitTokens + rec.cacheHitTokens,
        cacheMissTokens: usage.total.cacheMissTokens + rec.cacheMissTokens,
        calls: usage.total.calls + 1,
        inputCostRmb: usage.total.inputCostRmb + costs.inputCostRmb,
        outputCostRmb: usage.total.outputCostRmb + costs.outputCostRmb,
      },
      recentCalls: [callRecord, ...usage.recentCalls].slice(0, 50),
    };

    set({ usage: newUsage, _pendingSave: newUsage });

    // 延迟写入，合并短时间内的多次调用
    clearTimeout((get() as any)._saveTimer);
    (get() as any)._saveTimer = setTimeout(() => {
      const pending = get()._pendingSave;
      if (pending) {
        AsyncStorage.setItem(USAGE_KEY, JSON.stringify(pending)).catch(() => {});
        set({ _pendingSave: null });
      }
    }, 2000);
  },

  reset: async () => {
    const empty: UsageSnapshot = {
      today: emptyDay(),
      total: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, calls: 0, inputCostRmb: 0, outputCostRmb: 0 },
      recentCalls: [],
    };
    set({ usage: empty, _pendingSave: null });
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(empty));
  },

  flush: async () => {
    const pending = get()._pendingSave;
    if (pending) {
      await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(pending));
      set({ _pendingSave: null });
    }
  },
}));
