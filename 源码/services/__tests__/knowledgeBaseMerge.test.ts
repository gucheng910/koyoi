// ============================================================
//  知识库角色合并 —— 回归测试
//
//  背景：模型对"没有别名"的角色会输出字面量 "无别名" / "别名(无)"。
//  旧实现的匹配是 `ch.aliases.some(a => m.name === a || m.aliases.includes(a))`，
//  于是所有无别名角色因共用 "无别名" 被合并进第一条记录。
//  实测在 74 万字小说上，主角陈源被灌入 34 条来自其他角色的 traits，
//  38 个角色塌缩、主角/女主角色卡全部失真。
// ============================================================

import { buildKnowledgeBase } from '../knowledgeBase';
import type { ChapterAnalyzeResult } from '../../types';

const pad = { worldRules: [], foreshadows: [], locations: [], relations: [], plot: [], events: [], styleSamples: [] };

function mkChar(name: string, aliases: string[], traits: string[]) {
  return {
    name,
    aliases,
    gender: '未知',
    role: '',
    traits,
    habits: [],
    speechStyle: '',
    speechSamples: [],
    firstAppear: 0,
    lastAppear: 0,
  } as any;
}

function mkResult(characters: any[]): ChapterAnalyzeResult {
  return { chapterRange: [0, 1], characters, ...pad } as any;
}

describe('buildKnowledgeBase 角色合并', () => {
  it('不会因「无别名」占位词把不同角色合并到一起', () => {
    const kb = buildKnowledgeBase('w1', 2, [
      mkResult([
        mkChar('陈源', ['无别名', '超子(能力名)'], ['厌世脸']),
        mkChar('夏心语', ['无别名'], ['乖巧', '对陈源殷勤']),
        mkChar('唐思文', ['无别名', '别名(无)'], ['冷艳', '成绩顶尖']),
        mkChar('周宇', ['无别名'], ['话痨', '贪吃']),
      ]),
    ]);

    // 四个角色必须各自独立存在
    expect(kb.characters.length).toBe(4);
    const names = kb.characters.map(c => c.name).sort();
    expect(names).toEqual(['周宇', '夏心语', '唐思文', '陈源'].sort());

    // 主角不能被灌入别人的 traits
    const chen = kb.characters.find(c => c.name === '陈源')!;
    expect(chen.traits).toEqual(['厌世脸']);
  });

  it('占位别名不会被写进知识库', () => {
    const kb = buildKnowledgeBase('w2', 1, [
      mkResult([
        mkChar('陈源', ['无别名', '别名(无)', '别名(陈源)'], ['冷淡']),
        mkChar('老莫', ['莫老师'], ['严厉']),
      ]),
    ]);

    const chen = kb.characters.find(c => c.name === '陈源')!;
    expect(chen.aliases).not.toContain('无别名');
    expect(chen.aliases).not.toContain('别名(无)');
    // "别名(陈源)" 去包裹后等于本人名字，也不该保留
    expect(chen.aliases).not.toContain('别名(陈源)');

    // 正常别名仍然保留
    const mo = kb.characters.find(c => c.name === '老莫')!;
    expect(mo.aliases).toContain('莫老师');
  });

  it('同一角色跨块出现时仍然正确合并', () => {
    const kb = buildKnowledgeBase('w3', 2, [
      mkResult([mkChar('陈源', ['无别名'], ['厌世脸'])]),
      mkResult([mkChar('陈源', ['超子'], ['喜欢挨夸'])]),
    ]);

    expect(kb.characters.length).toBe(1);
    const chen = kb.characters[0];
    expect(chen.traits.sort()).toEqual(['厌世脸', '喜欢挨夸'].sort());
    expect(chen.aliases).toContain('超子');
  });

  it('真实别名重叠时仍能合并（不能因噎废食）', () => {
    const kb = buildKnowledgeBase('w4', 2, [
      mkResult([mkChar('老莫', [], ['严厉'])]),
      mkResult([mkChar('莫老师', ['老莫'], ['关心学生'])]),
    ]);

    expect(kb.characters.length).toBe(1);
    expect(kb.characters[0].traits.sort()).toEqual(['关心学生', '严厉'].sort());
  });
});
