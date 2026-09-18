// ============================================================
//  章节追踪 —— 回归测试
//
//  背景：旧提示词写着「confidence < 0.3 时说明不确定，chapter 可以随便给」，
//  而放行逻辑只按 confidence > 0.6 判断。实测开场（第1章，波龙/断头饭场景）
//  被一跳写成第 45 章——因为模型不确定时随手填了 44 且置信度报得很高。
// ============================================================

import { shouldAdvanceChapter } from '../chapterTracker';

describe('shouldAdvanceChapter', () => {
  it('置信度不足时不推进', () => {
    expect(shouldAdvanceChapter(3, { chapter: 10, confidence: 0.5, reason: '' })).toBeNull();
  });

  it('正常小幅推进被接受', () => {
    expect(shouldAdvanceChapter(3, { chapter: 5, confidence: 0.9, reason: '' })).toBe(5);
  });

  it('拒绝倒退', () => {
    expect(shouldAdvanceChapter(30, { chapter: 5, confidence: 0.95, reason: '' })).toBeNull();
  });

  it('拒绝原地不动', () => {
    expect(shouldAdvanceChapter(7, { chapter: 7, confidence: 0.9, reason: '' })).toBeNull();
  });

  it('单次跳章过大时被钳到上限（防幻觉跳跃）', () => {
    // 实测 bug：开场第 1 章被跳到第 45 章
    const r = shouldAdvanceChapter(0, { chapter: 44, confidence: 0.95, reason: '' });
    expect(r).not.toBeNull();
    expect(r).toBeLessThanOrEqual(5);
    expect(r).toBe(5);
  });

  it('null 位置不推进', () => {
    expect(shouldAdvanceChapter(3, null)).toBeNull();
  });
});
