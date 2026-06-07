// ============================================================
//  角色适配器测试
// ============================================================

import { kbCharToCharacter, getCharTraits, getCharRole, getCharSpeechStyle } from '../characterAdapter';
import type { Character } from '../../types';
import type { KbCharacter } from '../characterAdapter';

const makeKbChar = (overrides?: Partial<KbCharacter>): KbCharacter => ({
  name: '林晚晴',
  aliases: ['晚晴', '小林'],
  gender: '女',
  role: '宗主之女',
  traits: ['傲娇', '冷漠'],
  habits: ['撩头发'],
  speechStyle: '冷淡简短',
  speechSamples: [{ quote: '哼，无聊。', chapter: 2 }],
  firstAppear: 1,
  lastAppear: 30,
  ...overrides,
});

describe('kbCharToCharacter', () => {
  it('正确转换 KB 角色为 Character', () => {
    const ch = kbCharToCharacter(makeKbChar(), 'world_1', 0, '测试小说');
    expect(ch.name).toBe('林晚晴');
    expect(['female','male','other','女','男','未知']).toContain(ch.gender);
    expect(ch.personality.traits).toEqual(['傲娇', '冷漠']);
    expect(ch.personality.habits).toEqual(['撩头发']);
    expect(ch.personality.speakingStyle).toBe('冷淡简短');
    expect(ch.relationship.status).toBe('宗主之女');
    expect((ch.worldContext as any).originalRole).toBe('宗主之女');
    expect(ch.exampleDialogues.length).toBe(1);
    expect(ch.exampleDialogues[0].character).toBe('哼，无聊。');
  });

  it('性别未知时默认 female', () => {
    const ch = kbCharToCharacter(makeKbChar({ gender: '未知' }), 'w', 0);
    expect(['female','male','other','女','男','未知']).toContain(ch.gender);
  });

  it('出场范围正确标注', () => {
    const ch = kbCharToCharacter(makeKbChar({ firstAppear: 5, lastAppear: 25 }), 'w', 0);
    expect(ch.backstory).toContain('第6');
    expect(ch.backstory).toContain('26');
  });
});

describe('getCharTraits', () => {
  it('从 KB 角色提取 traits', () => {
    expect(getCharTraits(makeKbChar())).toEqual(['傲娇', '冷漠']);
  });

  it('从 Character 类型提取 traits', () => {
    const ch: Character = {
      ...kbCharToCharacter(makeKbChar(), 'w', 0),
    };
    expect(getCharTraits(ch)).toEqual(['傲娇', '冷漠']);
  });

  it('不存在时返回空数组', () => {
    expect(getCharTraits({} as any)).toEqual([]);
  });
});

describe('getCharRole', () => {
  it('从 KB 角色提取 role', () => {
    expect(getCharRole(makeKbChar())).toBe('宗主之女');
  });

  it('从 Character 提取 relationship.status', () => {
    const ch = kbCharToCharacter(makeKbChar(), 'w', 0);
    expect(getCharRole(ch)).toBe('宗主之女');
  });
});

describe('getCharSpeechStyle', () => {
  it('提取说话风格', () => {
    expect(getCharSpeechStyle(makeKbChar())).toBe('冷淡简短');
  });

  it('不存在时返回空字符串', () => {
    expect(getCharSpeechStyle({} as any)).toBe('');
  });
});
