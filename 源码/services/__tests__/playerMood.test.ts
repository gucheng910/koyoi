// ============================================================
//  玩家情绪推导 —— 回归测试
//
//  背景：同人模式下玩家角色不参与推演（stage4_simulation 有意排除），
//  导致 updateMoods 的入参里永远没有玩家。实测连续 6 轮后
//  characterMoods 只有 NPC 一个键，玩家自己的心境从不进入 moodsToPrompt。
// ============================================================

import { derivePlayerMood, updateMoods } from '../emotionalInertia';
import type { CharacterAction } from '../characterSimulator';

function mkAction(p: Partial<CharacterAction> & { name: string }): CharacterAction {
  return {
    intent: '', mood: '平静', innerThought: '', bodyLanguage: '', subtext: '',
    emotionalDirection: 'holding', triggerContext: '', toward: 'none',
    wantsInteraction: false, affectionDelta: 0,
    ...p,
  } as CharacterAction;
}

describe('derivePlayerMood', () => {
  it('从指向玩家的 NPC 情绪推导出玩家心境', () => {
    const actions = [
      mkAction({ name: '夏心语', mood: '悲伤', toward: 'player', affectionDelta: 10 }),
      mkAction({ name: '老莫', mood: '平静', toward: 'player' }),
    ];
    const r = derivePlayerMood(actions, '陈源', {}, 3);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('陈源');
    expect(r!.mood.intensity).toBeGreaterThan(0);
    expect(r!.mood.sinceRound).toBe(3);
    expect(r!.mood.expressed).toBe(false);
  });

  it('无视不指向玩家的 NPC 情绪', () => {
    const actions = [mkAction({ name: '周宇', mood: '愤怒', toward: 'self' })];
    expect(derivePlayerMood(actions, '陈源', {}, 1)).toBeNull();
  });

  it('玩家已有情绪时不重复推导', () => {
    const actions = [mkAction({ name: '夏心语', mood: '愤怒', toward: 'player' })];
    const existing = { 陈源: { emotion: 'joy', intensity: 5, cause: '', sinceRound: 1, expressed: true } };
    expect(derivePlayerMood(actions, '陈源', existing as any, 2)).toBeNull();
  });

  it('平静情绪不产生玩家心境', () => {
    const actions = [mkAction({ name: '夏心语', mood: '平静', toward: 'player' })];
    expect(derivePlayerMood(actions, '陈源', {}, 1)).toBeNull();
  });

  it('取指向玩家中最强烈的一条', () => {
    const actions = [
      mkAction({ name: 'A', mood: '开心', toward: 'player', affectionDelta: 1 }),
      mkAction({ name: 'B', mood: '愤怒', toward: 'player', affectionDelta: 60 }),
    ];
    const r = derivePlayerMood(actions, '陈源', {}, 1);
    expect(r!.mood.intensity).toBeGreaterThan(5);
  });

  it('玩家名称为空时安全返回', () => {
    expect(derivePlayerMood([mkAction({ name: 'A', mood: '愤怒', toward: 'player' })], '', {}, 1)).toBeNull();
  });
});

describe('updateMoods 不回归', () => {
  it('NPC 情绪照常更新', () => {
    const r = updateMoods([mkAction({ name: '夏心语', mood: '愤怒', toward: 'player' })], {}, 1);
    expect(Object.keys(r)).toContain('夏心语');
  });
});
