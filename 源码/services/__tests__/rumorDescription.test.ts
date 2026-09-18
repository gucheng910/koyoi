// ============================================================
//  谣言事件描述 —— 回归测试
//
//  背景：旧实现用 `.{0,30}<keyword>.{0,30}` 再硬截 80 字，产出的是
//  从句子中间开始的碎片。实测线上 notableEvents 里存的内容：
//    "刺" / "不知道" / "，又像是在数什么。她的话戛然而止"
//  这些碎片被当作「事实」写进角色知识库并沿社交网络传播。
// ============================================================

import { extractNotableEvents } from '../rumorPropagation';
import type { WorldSession } from '../../types';

function mkSession(): WorldSession {
  return {
    id: 's1',
    selectedCharacters: [{ name: '陈源' }, { name: '夏心语' }] as any,
    npcs: [],
    characterKnowledge: {},
    notableEvents: [],
    worldClock: 0,
  } as any;
}

describe('extractNotableEvents 描述完整性', () => {
  it('描述应从句子边界开始，而不是从中间切入', () => {
    const ai = '她把勺子放下。她的手指在碗沿跑了一下，又缩回去。她的唇瓣有点红，像刚吻过一样。';
    const events = extractNotableEvents(mkSession(), '我看着她', ai, 1);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      // 不应以标点开头（说明是从句子中间截出来的）
      expect(/^[，。、；：！？,.]/.test(e.description)).toBe(false);
      expect(e.description.length).toBeGreaterThan(1);
    }
  });

  it('不会产出单词碎片', () => {
    const ai = '他刺了一下。然后走开了。';
    const events = extractNotableEvents(mkSession(), '你', ai, 1);
    for (const e of events) {
      // 单个字（如 "刺"）不应成为事件描述
      expect(e.description.length).toBeGreaterThan(2);
    }
  });

  it('描述应有句末标点或达到合理长度', () => {
    const ai = '陈源把钱递过去。老莫愣了一下，接过钱。';
    const events = extractNotableEvents(mkSession(), '我给钱', ai, 1);
    for (const e of events) {
      const endsClean = /[。！？；]$/.test(e.description);
      expect(endsClean || e.description.length >= 8).toBe(true);
    }
  });

  it('事件仍会被正常提取（功能未被改坏）', () => {
    const events = extractNotableEvents(mkSession(), '我打了他一拳', '场面一片混乱。', 1);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].round).toBe(1);
    expect(events[0].description.length).toBeGreaterThan(0);
  });

  it('空输入不崩', () => {
    expect(() => extractNotableEvents(mkSession(), '', '', 1)).not.toThrow();
  });
});
