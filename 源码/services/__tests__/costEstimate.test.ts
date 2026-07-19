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
