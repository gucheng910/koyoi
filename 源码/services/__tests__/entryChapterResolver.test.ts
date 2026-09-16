// ============================================================
//  entryChapterResolver（此前从未被调用的死代码）
//
//  FanficScreen 里有一份内联实现做同样的事。写测试的目的有两个：
//   1. 确认这个模块本身是否正确（死代码不等于坏代码，也不等于好代码）
//   2. 为「把内联实现换成它」提供依据 —— 两者行为一致才敢换
// ============================================================

import { resolveEntryChapter } from '../entryChapterResolver';

describe('精确章号', () => {
  it('"第3章" → 索引 2', () => {
    expect(resolveEntryChapter({ timePoint: '第3章', totalChapters: 100 })).toBe(2);
  });

  it('"第十二章" 的中文数字不被识别（已知限制，走模糊兜底）', () => {
    // 正则只匹配 \d+，中文数字会落到事件匹配或返回 0。
    // 这是现状，先锁住行为，避免以后误以为支持。
    expect(resolveEntryChapter({ timePoint: '第十二章', totalChapters: 100 })).toBe(0);
  });

  it('超出范围时被夹到最后一章', () => {
    expect(resolveEntryChapter({ timePoint: '第999章', totalChapters: 10 })).toBe(9);
  });

  it('第0章夹到 0', () => {
    expect(resolveEntryChapter({ timePoint: '第0章', totalChapters: 10 })).toBe(0);
  });
});

describe('关键词阶段', () => {
  const total = 100;

  it('开篇类 → 2%', () => {
    for (const k of ['开篇', '开始', '开头', '初始', '序章', '引子', '楔子']) {
      expect(resolveEntryChapter({ timePoint: k, totalChapters: total })).toBe(2);
    }
  });

  it('中期类 → 25%', () => {
    for (const k of ['发展', '中期', '展开', '中段']) {
      expect(resolveEntryChapter({ timePoint: k, totalChapters: total })).toBe(25);
    }
  });

  it('高潮类 → 55%', () => {
    for (const k of ['高潮', '关键', '转折', '决战', '巅峰']) {
      expect(resolveEntryChapter({ timePoint: k, totalChapters: total })).toBe(55);
    }
  });

  it('结局类 → 95%', () => {
    for (const k of ['结局', '尾声', '末尾', '最后', '终章', '结尾']) {
      expect(resolveEntryChapter({ timePoint: k, totalChapters: total })).toBe(95);
    }
  });

  it('阶段匹配优先于纯数字提取', () => {
    // "第3章的高潮" —— 两者都能匹配，按注释应先走精确章号
    expect(resolveEntryChapter({ timePoint: '第3章的高潮', totalChapters: 100 })).toBe(2);
  });
});

describe('纯数字', () => {
  it('"大约第20章" 走精确章号', () => {
    expect(resolveEntryChapter({ timePoint: '大约第20章', totalChapters: 100 })).toBe(19);
  });

  it('裸数字 "20" → 19', () => {
    expect(resolveEntryChapter({ timePoint: '20', totalChapters: 100 })).toBe(19);
  });
});

describe('模糊事件匹配', () => {
  it('按 bigram 重合度选中最佳事件所在章', () => {
    const events = [
      { chapter: 5, description: '主角在小镇遇见了老友' },
      { chapter: 40, description: '主角与宿敌在山顶决战' },
      { chapter: 80, description: '多年以后，他回到了家乡' },
    ];
    // "遇见老友" 与第 5 章事件重合最多
    expect(resolveEntryChapter({ timePoint: '遇见老友', totalChapters: 100, events })).toBe(5);
  });

  it('完全无匹配时返回 0', () => {
    const events = [{ chapter: 5, description: '主角在小镇' }];
    expect(resolveEntryChapter({ timePoint: 'ZZZZZ', totalChapters: 100, events })).toBe(0);
  });

  it('无事件列表时返回 0（不抛错）', () => {
    expect(resolveEntryChapter({ timePoint: '某个无法识别的时间点', totalChapters: 100 })).toBe(0);
  });
});

describe('边界', () => {
  it('空字符串返回 0', () => {
    expect(resolveEntryChapter({ timePoint: '', totalChapters: 100 })).toBe(0);
  });

  it('只有空白字符返回 0', () => {
    expect(resolveEntryChapter({ timePoint: '   ', totalChapters: 100 })).toBe(0);
  });

  it('totalChapters 为 0 时回退到 100（不产生 NaN）', () => {
    const r = resolveEntryChapter({ timePoint: '高潮', totalChapters: 0 });
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBe(55);
  });

  it('返回值恒在 [0, total-1] 范围内', () => {
    for (const tp of ['开篇', '高潮', '结局', '第1章', '第999章', '乱七八糟']) {
      const r = resolveEntryChapter({ timePoint: tp, totalChapters: 7 });
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(6);
    }
  });
});
