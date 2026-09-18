// ============================================================
//  复读去除 —— 回归测试
//
//  以下是真实会话里抓到的原文（chat.jsonl），模型把整句复读了：
//    "扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。扫过你手里攥着的十块钱。…"
//    "你知道她在等你把话说完。你知道她为什么没跑。" ×3
//  提示词第 2 条「可以有重复」被模型理解成允许复制句子。
// ============================================================

import { dedupeRepeats } from '../sendPipeline/stage7_post';

describe('dedupeRepeats', () => {
  it('去掉紧邻的整句重复（真实案例）', () => {
    const input = '说得很慢。眼神扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。';
    const out = dedupeRepeats(input);
    // 重复的那组被消掉一次
    const n = (out.match(/扫过你手里攥着的十块钱/g) || []).length;
    const m = (out.match(/扫过你嘴角挂着的笑/g) || []).length;
    expect(n).toBeLessThan(2);
    expect(m).toBeLessThan(2);
  });

  it('去掉整段重复（真实案例）', () => {
    const block = '你知道她在等你把话说完。你知道她为什么没跑。';
    const input = block + '\n\n' + block + '\n\n' + block;
    const out = dedupeRepeats(input);
    expect((out.match(/你知道她在等你把话说完/g) || []).length).toBe(1);
  });

  it('正常的排比修辞不受影响（各句不同）', () => {
    const input = '你不说。你不承认。你不面对。你不负责。';
    expect(dedupeRepeats(input)).toBe(input);
  });

  it('不含重复的文本原样返回', () => {
    const input = '她把碗推到你面前。\n\n你没接话，把勺子放下。';
    expect(dedupeRepeats(input)).toBe(input);
  });

  it('空文本安全', () => {
    expect(dedupeRepeats('')).toBe('');
  });

  it('短台词标签不被误删', () => {
    const input = '【旁白】\n她低下头。\n\n【夏心语】\n“嗯。”\n\n【旁白】\n他又看向窗外。';
    const out = dedupeRepeats(input);
    expect(out).toContain('【旁白】');
    expect(out).toContain('【夏心语】');
  });

  it('分段标记保持完好', () => {
    const input = '【旁白】\n第一段内容足够长。\n\n【夏心语】\n“第二段内容也足够长。”';
    const out = dedupeRepeats(input);
    expect(out).toContain('\n\n');
    expect(out).toContain('【夏心语】');
  });

  it('跨段落删除完全相同的整句（真实案例）', () => {
    // 实测：428 字回复里同一句隔了 5 段又出现一次
    const dup = '她的呼吸变得很急，却不敢喘气。';
    const input = [
      '【旁白】',
      '她的指甲在碗沿划出浅浅的痕迹，像是想刻进去。' + dup,
      '',
      '【夏心语】',
      '“你为什么总是这样问我？”',
      '',
      '【旁白】',
      '她的眼神扫过你手里攥着的十块钱。' + dup + '她的眼睛像被什么东西黑了进去。',
    ].join('\n');
    const out = dedupeRepeats(input);
    const n = (out.match(/她的呼吸变得很急，却不敢喘气/g) || []).length;
    expect(n).toBe(1);
  });

  it('跨段落但不完全相同的句子不受影响', () => {
    const input = '她低下头，看着碗沿那道划痕。\n\n她又低下头，盯着碗沿的那道划痕。';
    expect(dedupeRepeats(input)).toBe(input);
  });

  it('短句重复不被跨段去重误删', () => {
    // "好。" 这类短句是正常对话，不该被删
    const input = '“好。”\n\n“好。”';
    expect(dedupeRepeats(input)).toBe(input);
  });
});
