import { detectChapters, getChapterStats } from '../chapterSplitter';
import type { ChapterMeta } from '../../types';

describe('detectChapters', () => {
  const pad = 'x'.repeat(600);

  it('识别标准章节格式「第X章」', () => {
    const text = '第1章 穿越\n\n' + pad + '\n\n第2章 初遇\n\n' + pad;
    const chapters = detectChapters(text);
    expect(chapters.length).toBe(2);
    if (chapters.length >= 2) {
      expect(chapters[0].title).toContain('第1章');
      expect(chapters[1].title).toContain('第2章');
    }
  });

  it('识别中文数字章节', () => {
    const text = '第一章 开始\n\n' + pad + '\n\n第二章 继续\n\n' + pad;
    const chapters = detectChapters(text);
    expect(chapters.length).toBeGreaterThanOrEqual(1);
  });

  it('无章节标记时回退到等长分块', () => {
    const text = 'A'.repeat(50000);
    const chapters = detectChapters(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  it('空文本返回空数组', () => {
    expect(detectChapters('')).toEqual([]);
    expect(detectChapters('ab')).toEqual([]);
  });
});

describe('getChapterStats', () => {
  it('计算章节统计', () => {
    const chapters: ChapterMeta[] = [
      { index: 0, title: '第一章', startChar: 0, endChar: 1000, charCount: 1000, isSpecial: false },
      { index: 1, title: '第二章', startChar: 1000, endChar: 3000, charCount: 2000, isSpecial: false },
      { index: 2, title: '第三章', startChar: 3000, endChar: 4500, charCount: 1500, isSpecial: false },
    ];
    const stats = getChapterStats(chapters);
    expect(stats.total).toBe(4500);
    expect(stats.min).toBe(1000);
    expect(stats.max).toBe(2000);
    expect(stats.avg).toBe(1500);
  });

  it('空数组返回零', () => {
    expect(getChapterStats([]).total).toBe(0);
  });
});
