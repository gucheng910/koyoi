// ============================================================
//  成本估算测试
// ============================================================

import { estimateNovelCost, formatEstimate } from '../costEstimate';
import type { ApiConfig } from '../../types';

const makeCfg = (model: string): ApiConfig => ({
  id: 'test', label: 'test', baseUrl: '', apiKey: 'sk-test',
  model, thinkingMode: 'disabled', reasoningEffort: 'high',
  temperature: 0.2, maxTokens: 4096, safetyFilter: 'off',
  streamOutput: true, showSystemPrompt: false, autoPolish: false, isDefault: false,
});

describe('estimateNovelCost', () => {
  it('短篇小说估算', () => {
    const est = estimateNovelCost(50000, makeCfg('deepseek-v4-flash'));
    expect(est.totalChars).toBe(50000);
    expect(est.estimatedChunks).toBe(1);
    expect(est.totalCost).toBeGreaterThan(0);
  });

  it('长篇小说估算', () => {
    const est = estimateNovelCost(500000, makeCfg('deepseek-v4-flash'));
    expect(est.estimatedChunks).toBeGreaterThan(5);
    expect(est.totalCost).toBeGreaterThan(0.1);
  });

  it('Pro 模型比 Flash 贵', () => {
    const flash = estimateNovelCost(500000, makeCfg('deepseek-v4-flash'));
    const pro = estimateNovelCost(500000, makeCfg('deepseek-v4-pro'));
    expect(pro.totalCost).toBeGreaterThan(flash.totalCost);
  });

  it('包含 buildOpening 和合成成本', () => {
    const est = estimateNovelCost(300000, makeCfg('deepseek-v4-flash'));
    expect(est.totalInputTokens).toBeGreaterThan(100000);
    expect(est.totalOutputTokens).toBeGreaterThan(50000);
  });
});

describe('formatEstimate', () => {
  it('格式化输出包含关键信息', () => {
    const est = estimateNovelCost(300000, makeCfg('deepseek-v4-flash'));
    const formatted = formatEstimate(est);
    expect(formatted).toContain('万字');
    expect(formatted).toContain('块');
    expect(formatted).toContain('¥');
  });
});

// ------------------------------------------------------------
//  峰谷定价（2026 官方新规则）
// ------------------------------------------------------------

/** 北京时间构造 */
function beijing(y: number, mo: number, d: number, h: number, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - 8 * 3600 * 1000);
}
const MON_PEAK = beijing(2026, 9, 14, 10, 0);   // 周一 10:00 高峰
const SAT_OFF = beijing(2026, 9, 19, 10, 0);    // 周六 10:00 空闲

describe('峰谷价对估算的影响', () => {
  it('同一部小说，高峰时段估算是空闲时段的两倍', () => {
    const peak = estimateNovelCost(500000, makeCfg('deepseek-flash'), MON_PEAK);
    const off = estimateNovelCost(500000, makeCfg('deepseek-flash'), SAT_OFF);
    expect(peak.tier).toBe('peak');
    expect(off.tier).toBe('off-peak');
    expect(peak.totalCost).toBeCloseTo(off.totalCost * 2, 4);
  });

  it('格式化的文案标明所用档位，避免用户误以为算错', () => {
    const peakTxt = formatEstimate(estimateNovelCost(300000, makeCfg('deepseek-flash'), MON_PEAK));
    const offTxt = formatEstimate(estimateNovelCost(300000, makeCfg('deepseek-flash'), SAT_OFF));
    expect(peakTxt).toContain('高峰价');
    expect(offTxt).toContain('空闲价');
    // 提醒高峰期翻倍
    expect(peakTxt).toContain('翻倍');
  });

  it('估算会计入缓存命中假设（命中价远低于未命中）', () => {
    const est = estimateNovelCost(500000, makeCfg('deepseek-flash'), SAT_OFF);
    expect(est.cacheHitRatio).toBeGreaterThan(0);
    // 全部按未命中算的话会更贵
    expect(est.inputCost).toBeGreaterThan(0);
  });
});

describe('不可计价的情形（不静默猜价）', () => {
  it('未识别的模型 priced=false，费用为 0', () => {
    const est = estimateNovelCost(300000, makeCfg('gpt-4o'), SAT_OFF);
    expect(est.priced).toBe(false);
    expect(est.totalCost).toBe(0);
    expect(est.modelId).toBeNull();
    // 但 token 仍要统计
    expect(est.totalInputTokens).toBeGreaterThan(0);
  });

  it('非官方端点不按 DeepSeek 价估算', () => {
    const cfg = { ...makeCfg('deepseek-flash'), baseUrl: 'https://my-proxy.example.com/v1' };
    const est = estimateNovelCost(300000, cfg, SAT_OFF);
    expect(est.priced).toBe(false);
    expect(est.totalCost).toBe(0);
  });

  it('不可计价时格式化文案不显示假的金额', () => {
    const txt = formatEstimate(estimateNovelCost(300000, makeCfg('gpt-4o'), SAT_OFF));
    expect(txt).not.toContain('¥');
    expect(txt).toContain('仅统计 token');
  });

  it('旧模型名 deepseek-v4-flash 仍可计价（官方：按 Flash 计费）', () => {
    const est = estimateNovelCost(300000, makeCfg('deepseek-v4-flash'), SAT_OFF);
    expect(est.priced).toBe(true);
    expect(est.modelId).toBe('deepseek-flash');
    expect(est.totalCost).toBeGreaterThan(0);
  });
});
