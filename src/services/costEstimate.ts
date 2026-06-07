// ============================================================
//  成本估算 - 分析前预估 token 和费用
// ============================================================

import type { ApiConfig } from '../types';

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
}

// DeepSeek 官方价格（元/百万token）- 2026年5月 永久定价
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-v4-flash': { input: 1, output: 2 },
  'deepseek-v4-pro': { input: 3, output: 6 },
  'deepseek-chat': { input: 1, output: 2 },    // 已重定向到 V4 Flash
  'deepseek-reasoner': { input: 4, output: 16 }, // R1（即将退役）
};

export function estimateNovelCost(
  totalChars: number,
  config: ApiConfig
): CostEstimate {
  const CHARS_PER_CHUNK = 60000;
  const INPUT_PER_CHUNK = CHARS_PER_CHUNK * 0.6; // 中文约 0.6 token/字 + prompt 开销
  const OUTPUT_PER_CHUNK = 12000;  // 每块约 12000 token 输出（含角色/事件/关系/文风）
  const SYNTH_INPUT = 200000;     // 合成阶段输入
  const SYNTH_OUTPUT = 30000;     // 合成阶段输出
  const OPENING_INPUT = 8000;     // buildOpening 输入（含章节原文）
  const OPENING_OUTPUT = 3000;    // buildOpening 输出
  const TIMELINE_INPUT = 150000;  // 时间线合成输入
  const TIMELINE_OUTPUT = 20000;  // 时间线合成输出

  // 长篇：分块分析 + 合成 + 时间线合成 + 开场生成
  const chunks = Math.ceil(totalChars / CHARS_PER_CHUNK);
  const totalInput = chunks * INPUT_PER_CHUNK + SYNTH_INPUT + TIMELINE_INPUT + OPENING_INPUT;
  const totalOutput = chunks * OUTPUT_PER_CHUNK + SYNTH_OUTPUT + TIMELINE_OUTPUT + OPENING_OUTPUT;

  // 仅 DeepSeek 官方 API 才计算费用
  const isOfficial = !config.baseUrl || config.baseUrl.includes('api.deepseek.com');
  const pricing = isOfficial ? (PRICING[config.model] || PRICING['deepseek-v4-flash']) : { input: 0, output: 0 };
  const inputCost = (totalInput / 1000000) * pricing.input;
  const outputCost = (totalOutput / 1000000) * pricing.output;

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
  };
}

export function formatEstimate(est: CostEstimate): string {
  return [
    `总字数：${(est.totalChars / 10000).toFixed(0)}万字`,
    `分块数：${est.estimatedChunks} 块`,
    `预估输入：${(est.totalInputTokens / 1000).toFixed(0)}k tokens`,
    `预估输出：${(est.totalOutputTokens / 1000).toFixed(0)}k tokens`,
    `预估费用：约 ¥${est.totalCost.toFixed(2)}（${est.modelName}）`,
  ].join('\n');
}
