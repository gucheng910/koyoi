// ============================================================
//  成本估算 - 分析前预估 token 和费用
//
//  定价取自 services/pricing.ts（唯一真源）。
//  原先这里自备了一份 PRICING 表，与 usageStore 的那份不一致——
//  同一个 app 里「预估费用」和「实际记账」用两套价，结论必然矛盾。
// ============================================================

import type { ApiConfig } from '../types';
import { calcCallCost, isOfficialBaseUrl, pricesAt, normalizeModel, tierAt } from './pricing';

interface CostEstimate {
  totalChars: number;
  estimatedChunks: number;
  inputTokensPerChunk: number;
  outputTokensPerChunk: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  modelName: string;
  /** 是否能计价（非官方端点或未识别模型 → false，费用为 0） */
  priced: boolean;
  /** 估算所依据的档位 */
  tier: 'peak' | 'off-peak';
  modelId: string | null;
  /** 估算所依据的缓存命中率假设 */
  cacheHitRatio: number;
}

// 分析阶段的 token 预估参数
//
// 换算比例来自官方《Token 用量计算》：
//   1 个中文字符 ≈ 0.6 token，1 个英文字符 ≈ 0.3 token
// 分块分析的小说以中文为主，故取 0.6。
const CHARS_PER_CHUNK = 60000;
const CJK_TOKENS_PER_CHAR = 0.6;
const INPUT_PER_CHUNK = CHARS_PER_CHUNK * CJK_TOKENS_PER_CHAR;
const OUTPUT_PER_CHUNK = 12000;  // 每块约 12000 token 输出（含角色/事件/关系/文风）
const SYNTH_INPUT = 200000;     // 合成阶段输入
const SYNTH_OUTPUT = 30000;     // 合成阶段输出
const OPENING_INPUT = 8000;     // buildOpening 输入（含章节原文）
const OPENING_OUTPUT = 3000;    // buildOpening 输出
const TIMELINE_INPUT = 150000;  // 时间线合成输入
const TIMELINE_OUTPUT = 20000;  // 时间线合成输出

/**
 * 分析阶段的缓存命中率假设。
 *
 * 分块分析每块的 prompt 前缀（system + 分析指令）高度重复，
 * 官方按前缀完整匹配计命中，故命中率不低；但每块正文不同，
 * 保守取 30%。
 */
const ASSUMED_CACHE_HIT_RATIO = 0.3;

export function estimateNovelCost(
  totalChars: number,
  config: ApiConfig,
  at: Date = new Date()
): CostEstimate {
  // 长篇：分块分析 + 合成 + 时间线合成 + 开场生成
  const chunks = Math.ceil(totalChars / CHARS_PER_CHUNK);
  const totalInput = chunks * INPUT_PER_CHUNK + SYNTH_INPUT + TIMELINE_INPUT + OPENING_INPUT;
  const totalOutput = chunks * OUTPUT_PER_CHUNK + SYNTH_OUTPUT + TIMELINE_OUTPUT + OPENING_OUTPUT;

  const official = isOfficialBaseUrl(config.baseUrl);
  const resolved = pricesAt(config.model, at);
  const priced = official && resolved !== null;

  // 按假设的缓存命中率拆分输入
  const hit = priced ? totalInput * ASSUMED_CACHE_HIT_RATIO : 0;
  const miss = priced ? totalInput - hit : totalInput;

  const breakdown = priced
    ? calcCallCost({ cacheHitTokens: hit, cacheMissTokens: miss, outputTokens: totalOutput }, config.model, at)
    : null;

  const inputCost = breakdown ? breakdown.cacheHitCostRmb + breakdown.cacheMissCostRmb : 0;
  const outputCost = breakdown ? breakdown.outputCostRmb : 0;

  return {
    totalChars,
    estimatedChunks: chunks,
    inputTokensPerChunk: Math.round(INPUT_PER_CHUNK),
    outputTokensPerChunk: Math.round(OUTPUT_PER_CHUNK),
    totalInputTokens: Math.round(totalInput),
    totalOutputTokens: Math.round(totalOutput),
    inputCost: Math.round(inputCost * 10000) / 10000,
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
    modelName: config.model,
    priced,
    tier: tierAt(at),
    modelId: normalizeModel(config.model),
    cacheHitRatio: ASSUMED_CACHE_HIT_RATIO,
  };
}

export function formatEstimate(est: CostEstimate): string {
  const lines = [
    `总字数：${(est.totalChars / 10000).toFixed(0)}万字`,
    `分块数：${est.estimatedChunks} 块`,
    `预估输入：${(est.totalInputTokens / 1000).toFixed(0)}k tokens`,
    `预估输出：${(est.totalOutputTokens / 1000).toFixed(0)}k tokens`,
  ];
  if (est.priced) {
    // 峰谷价差一倍，必须标明按哪个档位估的，否则用户会以为算错
    const tierName = est.tier === 'peak' ? '高峰价' : '空闲价';
    lines.push(`预估费用：约 ¥${est.totalCost.toFixed(2)}（${est.modelName} · ${tierName}）`);
    lines.push(`（按缓存命中率 ${(est.cacheHitRatio * 100).toFixed(0)}% 估算；高峰期费用翻倍）`);
  } else {
    lines.push(`预估费用：—（${est.modelId ? '非官方端点' : '未识别模型'}，仅统计 token）`);
  }
  return lines.join('\n');
}
