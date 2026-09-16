// ============================================================
//  往事回响 + 信息传播的时间门控 + 叙事自检
//
//  这三个东西服务于同一个产品主张：**世界在静默地运转**。
//  用户看不到机制，只应该"恍惚觉得这事居然还有人记得"。
//
//  正因为静默，它们坏掉时也静默——用户分不清"微妙地活着"和"没反应"。
//  所以这里对每一件都写了可判定的断言。
// ============================================================

import { scheduleEchoes, dueEchoes, markSurfaced, echoesToPrompt } from '../echoes';
import { knowledgeToPrompt, resolveKnowledgeTargets } from '../rumorPropagation';
import { auditNarrative, extractSpeakerNames, echoWasUsed } from '../narrativeAudit';
import type { EchoItem, NotableEvent, WorldSession } from '../../types';

// ---------------------------------------------------------------
//  信息传播的对象（NPC 渠道）
// ---------------------------------------------------------------

describe('信息传播注入给谁（接通 NPC 渠道）', () => {
  it('【核心】在场的 NPC 也会被注入——"路人听说了你的事"', () => {
    const r = resolveKnowledgeTargets(['林悦'], ['陈默', '路人甲'], ['林悦', '路人甲']);
    expect(r).toContain('路人甲');
  });

  it('不在场的 NPC 不注入（他插不上话）', () => {
    const r = resolveKnowledgeTargets(['林悦'], ['陈默'], ['林悦']);
    expect(r).not.toContain('陈默');
  });

  it('选中角色始终包含（即使 activeChars 没同步上）', () => {
    const r = resolveKnowledgeTargets(['林悦', '陈默'], [], ['林悦']);
    expect(r).toEqual(['林悦', '陈默']);
  });

  it('同名不重复', () => {
    const r = resolveKnowledgeTargets(['林悦'], ['林悦'], ['林悦']);
    expect(r).toEqual(['林悦']);
  });

  it('onStage 为空时退回"全部都收"（不误伤没有 activeChars 的旧会话）', () => {
    const r = resolveKnowledgeTargets(['林悦'], ['陈默'], []);
    expect(r).toContain('陈默');
  });

  it('空名跳过', () => {
    const r = resolveKnowledgeTargets([], ['', '陈默'], ['陈默']);
    expect(r).toEqual(['陈默']);
  });
});

// ---------------------------------------------------------------
//  往事回响
// ---------------------------------------------------------------

const ev = (id: string, impact: number, desc = '他说了那句话'): NotableEvent => ({
  id, round: 5, type: 'public_action', description: desc,
  involvedChars: ['甲'], witnessChars: ['乙'], visibility: 'public', impact,
});

/** 确定性随机源：永远返回给定序列 */
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('埋设回响', () => {
  it('影响力不够的事件不埋', () => {
    const r = scheduleEchoes([], [ev('a', 1)], 5, seq([0]));
    expect(r).toHaveLength(0);
  });

  it('影响力足够的事件按概率埋设', () => {
    // rand 第 1 次用于判定（0 <= 0.45 通过），第 2 次用于算延迟
    const r = scheduleEchoes([], [ev('a', 5)], 5, seq([0, 0.5]));
    expect(r).toHaveLength(1);
    expect(r[0].sourceRound).toBe(5);
  });

  it('延迟落在 3~8 轮之间（这是"世界有记性"的关键）', () => {
    for (const jitter of [0, 0.25, 0.5, 0.75, 1]) {
      const r = scheduleEchoes([], [ev('a', 5)], 10, seq([0, jitter]));
      const delay = r[0].dueRound - r[0].sourceRound;
      expect(delay).toBeGreaterThanOrEqual(3);
      expect(delay).toBeLessThanOrEqual(8);
    }
  });

  it('概率未命中时不埋', () => {
    const r = scheduleEchoes([], [ev('a', 5)], 5, seq([0.9]));
    expect(r).toHaveLength(0);
  });

  it('待浮现数量有上限，不会无限堆积', () => {
    let pending: EchoItem[] = [];
    for (let t = 1; t <= 30; t++) {
      pending = scheduleEchoes(pending, [ev('e' + t, 5, '事件' + t)], t, seq([0, 0.5]));
    }
    expect(pending.filter(e => !e.surfaced).length).toBeLessThanOrEqual(6);
  });

  it('已浮现的不会重新入池', () => {
    const surfaced: EchoItem = { id: 'x', sourceRound: 1, dueRound: 4, seed: '旧事', chars: [], surfaced: true };
    const r = scheduleEchoes([surfaced], [], 10, seq([0]));
    expect(r.find(e => e.id === 'x')).toBeUndefined();
  });
});

describe('到期浮现', () => {
  const e: EchoItem = { id: 'e1', sourceRound: 5, dueRound: 9, seed: '她说过那句话', chars: ['甲'] };

  it('未到期不浮现', () => {
    expect(dueEchoes([e], 8)).toHaveLength(0);
  });

  it('到点才浮现', () => {
    expect(dueEchoes([e], 9)).toHaveLength(1);
    expect(dueEchoes([e], 12)).toHaveLength(1);
  });

  it('已浮现的不再给', () => {
    expect(dueEchoes([{ ...e, surfaced: true }], 20)).toHaveLength(0);
  });

  it('一次最多给两条（避免变成翻旧账合集）', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...e, id: 'e' + i, dueRound: 1 }));
    expect(dueEchoes(many, 10)).toHaveLength(2);
  });

  it('最早到期的优先', () => {
    const list = [
      { ...e, id: 'late', dueRound: 20 },
      { ...e, id: 'early', dueRound: 10 },
    ];
    expect(dueEchoes(list, 30)[0].id).toBe('early');
  });

  it('空输入安全', () => {
    expect(dueEchoes(undefined, 5)).toEqual([]);
    expect(dueEchoes([], 5)).toEqual([]);
  });
});

describe('标记已浮现', () => {
  it('标记后不再到期', () => {
    const list: EchoItem[] = [{ id: 'e1', sourceRound: 1, dueRound: 4, seed: 'x', chars: [] }];
    const after = markSurfaced(list, ['e1'], 5);
    expect(dueEchoes(after, 10)).toHaveLength(0);
  });

  it('未标记的仍然保留', () => {
    const list: EchoItem[] = [
      { id: 'e1', sourceRound: 1, dueRound: 4, seed: 'x', chars: [] },
      { id: 'e2', sourceRound: 2, dueRound: 9, seed: 'y', chars: [] },
    ];
    const after = markSurfaced(list, ['e1'], 5);
    expect(dueEchoes(after, 10).map(e => e.id)).toEqual(['e2']);
  });
});

describe('回响的提示词', () => {
  it('空列表返回空串（不占 token）', () => {
    expect(echoesToPrompt([])).toBe('');
  });

  it('包含来源轮次与种子', () => {
    const txt = echoesToPrompt([{ id: 'e', sourceRound: 7, dueRound: 10, seed: '他在雨中站了很久', chars: ['甲'] }]);
    expect(txt).toContain('第 7 轮');
    expect(txt).toContain('他在雨中站了很久');
    expect(txt).toContain('甲');
  });

  it('明确要求"不要直接复述"——否则就变成念旧账', () => {
    const txt = echoesToPrompt([{ id: 'e', sourceRound: 1, dueRound: 4, seed: 'x', chars: [] }]);
    expect(txt).toContain('不要直接复述');
  });
});

// ---------------------------------------------------------------
//  信息传播的时间门控
// ---------------------------------------------------------------

describe('知识按轮次门控（谣言才真的会"传播"）', () => {
  const knowledge = {
    '甲': { knownFacts: [
      { fact: '亲眼看到的事', certainty: 0.95, source: '亲眼所见', learnedAt: 5 },
      { fact: '一跳听到的事', certainty: 0.7, source: '从乙听说', learnedAt: 6 },
      { fact: '三跳听到的事', certainty: 0.2, source: '从丙听说', learnedAt: 8 },
    ] },
  };

  it('第 5 轮：只有亲眼所见', () => {
    const txt = knowledgeToPrompt(knowledge, ['甲'], 5);
    expect(txt).toContain('亲眼看到的事');
    expect(txt).not.toContain('一跳听到的事');
    expect(txt).not.toContain('三跳听到的事');
  });

  it('第 6 轮：一跳的信息才出现', () => {
    const txt = knowledgeToPrompt(knowledge, ['甲'], 6);
    expect(txt).toContain('一跳听到的事');
    expect(txt).not.toContain('三跳听到的事');
  });

  it('第 8 轮：三跳的信息也到了', () => {
    const txt = knowledgeToPrompt(knowledge, ['甲'], 8);
    expect(txt).toContain('三跳听到的事');
  });

  it('【核心】不传轮次时退回旧行为（全部展示）', () => {
    const txt = knowledgeToPrompt(knowledge, ['甲']);
    expect(txt).toContain('亲眼看到的事');
    expect(txt).toContain('三跳听到的事');
  });

  it('没有 learnedAt 的信息视为随时可知（不误伤旧数据）', () => {
    const k = { '甲': { knownFacts: [{ fact: '没有时间戳的事', certainty: 0.9 }] } };
    expect(knowledgeToPrompt(k, ['甲'], 1)).toContain('没有时间戳的事');
  });

  it('到期的信息按确定性排序，最确定的在前', () => {
    const txt = knowledgeToPrompt(knowledge, ['甲'], 10);
    expect(txt.indexOf('亲眼看到的事')).toBeLessThan(txt.indexOf('三跳听到的事'));
  });

  it('提示词引导"自然流露"，而不是逐条复述', () => {
    const txt = knowledgeToPrompt(knowledge, ['甲'], 10);
    expect(txt).toContain('自然流露');
    expect(txt).toContain('不能知道');   // 信息边界仍要守住
  });

  it('没有任何可知信息时返回空串', () => {
    const k = { '甲': { knownFacts: [{ fact: '未来的事', certainty: 0.9, learnedAt: 99 }] } };
    expect(knowledgeToPrompt(k, ['甲'], 5)).toBe('');
  });
});

// ---------------------------------------------------------------
//  叙事自检
// ---------------------------------------------------------------

function mkSession(over: Partial<WorldSession> = {}): WorldSession {
  return {
    id: 'w', world: { id: 'w', name: 'W', type: 'fanfic',
      rules: { physics:'',supernatural:'',technology:'',society:'',morality:'',sexualNorms:'' },
      locations: [], factions: [], timeline: [],
      inertia: { majorEvents:0,characterFate:0,worldReaction:0 }, butterflySensitivity:{minor:'',major:''} } as any,
    selectedCharacters: [{ name: '林悦' } as any],
    npcs: [{ name: '陈默' } as any],
    currentScene: '', worldState: '', butterflyLog: [], timelineDeviations: [],
    recentWorldEvents: [], worldLog: [], messages: [], createdAt: '',
    ...over,
  };
}

describe('说话人抽取', () => {
  it('抽出【X】形式的名字', () => {
    expect(extractSpeakerNames('【林悦】"你来了。"【旁白】她没回头。'))
      .toEqual(['林悦']);
  });

  it('旁白/场景类标记不算角色', () => {
    expect(extractSpeakerNames('【旁白】天黑了。【场景】教室')).toEqual([]);
  });

  it('支持半角方括号', () => {
    expect(extractSpeakerNames('[林悦]说话')).toEqual(['林悦']);
  });

  it('含标点或过长的标记不算名字', () => {
    expect(extractSpeakerNames('【这是，一句话】')).toEqual([]);
  });
});

describe('叙事自检', () => {
  it('【核心】抓出名单外的新角色（凭空造人）', () => {
    const issues = auditNarrative({
      output: '【林悦】"你来了。"【陌生人】"谁啊？"',
      session: mkSession(),
      knownNames: ['林悦', '陈默'],
    });
    const unknown = issues.filter(i => i.kind === 'unknown-character');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBe('warn');
    expect(unknown[0].detail).toContain('陌生人');
  });

  it('通过 ___META___ 正式引入的新角色不算凭空造', () => {
    const issues = auditNarrative({
      output: '【王老师】"上课。"',
      session: mkSession(),
      knownNames: ['林悦'],
      declaredNewChars: ['王老师'],
    });
    expect(issues.filter(i => i.kind === 'unknown-character')).toHaveLength(0);
  });

  it('名单内的角色不报', () => {
    const issues = auditNarrative({
      output: '【林悦】"嗯。"【陈默】"走了。"【旁白】天黑下来。',
      session: mkSession(),
      knownNames: ['林悦', '陈默'],
    });
    expect(issues).toHaveLength(0);
  });

  it('回响被完全忽略时报 info（不是警告——可能只是换了措辞）', () => {
    const issues = auditNarrative({
      output: '【林悦】"今天天气不错。"',
      session: mkSession(),
      knownNames: ['林悦'],
      injectedEchoes: [{ id: 'e', sourceRound: 3, dueRound: 6, seed: '他在雨中站了很久没有说话', chars: [] }],
    });
    const e = issues.filter(i => i.kind === 'echo-unused');
    expect(e).toHaveLength(1);
    expect(e[0].severity).toBe('info');
  });

  it('回响被用到时不报', () => {
    const issues = auditNarrative({
      output: '【林悦】"他那天在雨里站了很久，我记得。"',
      session: mkSession(),
      knownNames: ['林悦'],
      injectedEchoes: [{ id: 'e', sourceRound: 3, dueRound: 6, seed: '他在雨中站了很久没有说话', chars: [] }],
    });
    expect(issues.filter(i => i.kind === 'echo-unused')).toHaveLength(0);
  });

  it('高强度未表达情绪但输出无行为破绽 → info（启发式，不判死）', () => {
    const issues = auditNarrative({
      output: '【林悦】"我没事。"',
      session: mkSession({ characterMoods: { 林悦: { emotion: 'rage', intensity: 8, sinceRound: 1, expressed: false } } }),
      knownNames: ['林悦'],
    });
    const m = issues.filter(i => i.kind === 'mood-not-shown');
    expect(m).toHaveLength(1);
    expect(m[0].severity).toBe('info');
  });

  it('情绪已表达、强度低、或不在场时不报', () => {
    const base = { output: '【林悦】"我没事。"', knownNames: ['林悦'] };
    // 已表达
    expect(auditNarrative({ ...base, session: mkSession({ characterMoods: { 林悦: { emotion: 'rage', intensity: 8, sinceRound: 1, expressed: true } } }) })
      .filter(i => i.kind === 'mood-not-shown')).toHaveLength(0);
    // 强度低
    expect(auditNarrative({ ...base, session: mkSession({ characterMoods: { 林悦: { emotion: 'rage', intensity: 3, sinceRound: 1, expressed: false } } }) })
      .filter(i => i.kind === 'mood-not-shown')).toHaveLength(0);
    // 不在场
    expect(auditNarrative({ ...base, session: mkSession({ characterMoods: { 路人: { emotion: 'rage', intensity: 9, sinceRound: 1, expressed: false } } }) })
      .filter(i => i.kind === 'mood-not-shown')).toHaveLength(0);
  });

  it('输出为空时不报任何东西', () => {
    expect(auditNarrative({ output: '', session: mkSession(), knownNames: [] })).toEqual([]);
  });

  it('echoWasUsed 对过短种子不误报', () => {
    expect(echoWasUsed('随便什么内容', '短')).toBe(true);
  });
});
