// ============================================================
//  用量追踪 - 今日/累计 token 消耗及 RMB 换算
//  存储: AsyncStorage + zustand
//
//  定价**不在本文件里**——统一由 services/pricing.ts 提供，
//  因为过去这里和 costEstimate.ts 各存了一份价格表，两者不一致，
//  导致「预估费用」与「实际记账」互相矛盾。
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calcCallCost, isOfficialBaseUrl, tierAt, pricesAt, normalizeModel,
  DEFAULT_MODEL, type PriceTier,
} from '../services/pricing';

const USAGE_KEY = '@koyoi_usage';

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

/** 本地日期键（YYYY-MM-DD）。按设备本地时区，符合用户对「今天」的直觉。 */
function todayKey(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function emptyDay(at: Date = new Date()): DailyUsage {
  return {
    date: todayKey(at),
    inputTokens: 0,
    outputTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    calls: 0,
    inputCostRmb: 0,
    outputCostRmb: 0,
  };
}

/**
 * 计算一次调用的费用（RMB）。
 * 导出供 trace 归因复用——避免在别处复制一份定价表。
 *
 * @param at 调用发生时刻（决定峰/谷价）。默认取当前时间，但记账时
 *           必须传调用开始时间，否则跨峰谷边界的长请求会算错。
 */
export function estimateCallCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheHitTokens: number,
  cacheMissTokens: number,
  baseUrl?: string,
  at: number | Date = Date.now()
): number {
  return calcCost(model, inputTokens, outputTokens, cacheHitTokens, cacheMissTokens, baseUrl, at).totalCostRmb;
}

function calcCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheHitTokens: number,
  cacheMissTokens: number,
  baseUrl?: string,
  at: number | Date = Date.now()
) {
  // 仅 DeepSeek 官方 API 计算 RMB，其他提供商价格未知，只记 token
  if (!isOfficialBaseUrl(baseUrl)) {
    return { inputCostRmb: 0, outputCostRmb: 0, totalCostRmb: 0, priced: false, tier: tierAt(new Date(at)) };
  }
  const when = at instanceof Date ? at : new Date(at);
  const b = calcCallCost(
    { cacheHitTokens, cacheMissTokens, outputTokens },
    model,
    when
  );
  return {
    inputCostRmb: b.cacheHitCostRmb + b.cacheMissCostRmb,
    outputCostRmb: b.outputCostRmb,
    totalCostRmb: b.totalCostRmb,
    priced: b.priced,
    tier: b.tier,
  };
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
    /** 调用发生的时刻（毫秒时间戳），决定峰/谷价。缺省取当前时间 */
    at?: number;
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
    const at = rec.at ?? Date.now();
    const costs = calcCost(rec.model, rec.inputTokens, rec.outputTokens, rec.cacheHitTokens, rec.cacheMissTokens, rec.baseUrl, at);

    const callRecord: CallRecord = {
      // 原来用 'c_' + Date.now()，同一毫秒内的两次调用会撞 id
      // （React key 冲突）。阶段七的 trace 已用随机后缀规避，这里跟上。
      id: 'c_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      time: at,
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheHitTokens: rec.cacheHitTokens,
      cacheMissTokens: rec.cacheMissTokens,
      costRmb: costs.totalCostRmb,
      duration: rec.duration,
    };

    // 跨天重置：原先只在 load() 时检查日期，若 app 跨天不重启，
    // today 会一直累加，日报表与「今日用量」全部失真。这里在写入时再查一次。
    const tk = todayKey(new Date(at));
    const baseToday = usage.today.date === tk ? usage.today : emptyDay(new Date(at));

    const newUsage: UsageSnapshot = {
      today: {
        ...baseToday,
        inputTokens: baseToday.inputTokens + rec.inputTokens,
        outputTokens: baseToday.outputTokens + rec.outputTokens,
        cacheHitTokens: baseToday.cacheHitTokens + rec.cacheHitTokens,
        cacheMissTokens: baseToday.cacheMissTokens + rec.cacheMissTokens,
        calls: baseToday.calls + 1,
        inputCostRmb: baseToday.inputCostRmb + costs.inputCostRmb,
        outputCostRmb: baseToday.outputCostRmb + costs.outputCostRmb,
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

    // 立即写盘（fire-and-forget）：防止调用频繁时防抖 timer 一直被重置，app 被杀时用量丢失
    AsyncStorage.setItem(USAGE_KEY, JSON.stringify(newUsage)).catch(() => {});
    // 防抖兜底：确保最终状态落盘
    clearTimeout((get() as any)._saveTimer);
    (get() as any)._saveTimer = setTimeout(() => {
      const pending = get()._pendingSave;
      if (pending) {
        AsyncStorage.setItem(USAGE_KEY, JSON.stringify(pending)).catch(() => {});
        set({ _pendingSave: null });
      }
    }, 5000);
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
