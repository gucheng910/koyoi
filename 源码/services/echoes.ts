// ============================================================
//  往事回响
//
//  为什么需要它：
//
//  现在的世界模拟是「当轮结算」的——事件提取、情绪更新、谣言传播都在
//  同一轮算完。结果读起来像一台即时响应的状态机：你做点什么它立刻反馈，
//  你不做它就静止。
//
//  真实感的来源之一是**延迟**。你第 5 轮随口说的一句话，第 10 轮从别人
//  嘴里冒出来；你第 3 轮没接住的那个话头，第 8 轮变成别人心里的疙瘩。
//  玩家不会看到任何机制，只会恍惚觉得「这事居然还有人记得」。
//
//  实现上是刻意做小的：
//  - 不新增 AI 调用。种子直接取现成的 notableEvents 描述。
//  - 浮现时**不指定形式**，只给种子 + 一句「以别的形式浮出来」，
//    让模型自己找角度（这是它能做好的部分）。
//  - 只浮现一次就作废，避免反复念旧事（那是"记性差"而不是"有记性"）。
// ============================================================

import type { EchoItem, NotableEvent } from '../types';

/** 回响最短/最长潜伏期（轮） */
const MIN_DELAY = 3;
const MAX_DELAY = 8;

/** 埋设概率：不是每件事都值得回响，否则会变成"处处伏笔"的廉价感 */
const SPAWN_CHANCE = 0.45;

/** 同时存在的回响上限，防止堆积 */
const MAX_PENDING = 6;

/** 影响力足够高的事件才值得回响 */
const MIN_IMPACT = 3;

/**
 * 从本轮事件里挑出值得埋的回响。
 *
 * 纯函数：同样输入同样输出（随机性由 rand 参数注入，便于测试）。
 *
 * @param existing 已有的待浮现回响
 * @param newEvents 本轮新提取到的事件
 * @param round 当前轮次
 * @param rand 随机源，默认 Math.random（测试里可注入固定值）
 */
export function scheduleEchoes(
  existing: EchoItem[] | undefined,
  newEvents: NotableEvent[],
  round: number,
  rand: () => number = Math.random
): EchoItem[] {
  const pending = (existing || []).filter(e => !e.surfaced);

  // 已有太多就暂时不再埋
  if (pending.length >= MAX_PENDING) return pending;

  const added: EchoItem[] = [];
  for (const ev of newEvents) {
    if (pending.length + added.length >= MAX_PENDING) break;
    if ((ev.impact ?? 0) < MIN_IMPACT) continue;
    if (!ev.description) continue;
    if (rand() > SPAWN_CHANCE) continue;

    // 夹一下：Math.random() 理论上取不到 1，但注入的随机源可能越界，
    // 不夹的话延迟会超出 MAX_DELAY。
    const delay = Math.min(
      MAX_DELAY,
      MIN_DELAY + Math.floor(rand() * (MAX_DELAY - MIN_DELAY + 1))
    );
    added.push({
      id: 'echo_' + round + '_' + ev.id,
      sourceRound: round,
      dueRound: round + delay,
      seed: ev.description.slice(0, 60),
      chars: ev.involvedChars || [],
    });
  }

  return [...pending, ...added];
}

/**
 * 取出到期待浮现的回响。
 *
 * 只返回「已经到期且尚未浮现」的；调用方注入之后应把它们标记 surfaced
 * （见 markSurfaced），否则会反复注入同一件事。
 */
export function dueEchoes(
  echoes: EchoItem[] | undefined,
  round: number
): EchoItem[] {
  if (!echoes || echoes.length === 0) return [];
  return echoes
    .filter(e => !e.surfaced && e.dueRound <= round)
    // 最早到期的优先，且一次最多给两条——多了就变成"翻旧账合集"
    .sort((a, b) => a.dueRound - b.dueRound)
    .slice(0, 2);
}

/** 标记为已浮现，并清掉太老的（留 30 轮） */
export function markSurfaced(
  echoes: EchoItem[] | undefined,
  ids: string[],
  round: number
): EchoItem[] {
  if (!echoes || echoes.length === 0) return [];
  const idSet = new Set(ids);
  return echoes
    .map(e => (idSet.has(e.id) ? { ...e, surfaced: true } : e))
    // 已浮现的留一小段（便于调试），其余丢弃；太老的直接清
    .filter(e => !e.surfaced || round - e.sourceRound < 30)
    .slice(-MAX_PENDING * 2);
}

/**
 * 渲染成 prompt 注入文本。
 *
 * 刻意**不指定表现形式**：模型擅长在给定额度内找角度，不擅长执行
 * "让 B 在第三次对话中提及"这种编排指令。
 */
export function echoesToPrompt(echoes: EchoItem[]): string {
  if (echoes.length === 0) return '';

  const lines = echoes.map(e => {
    const who = e.chars.length > 0 ? `（涉及：${e.chars.join('、')}）` : '';
    return `- 第 ${e.sourceRound} 轮：${e.seed}${who}`;
  });

  return [
    '\n【往事回响——这些事已经过去一段时间了，本轮挑一件让它以别的形式浮出来】',
    ...lines,
    '要求：不要直接复述这件事。让它以侧面方式出现——别人转述、当事人突然想起、',
    '一个不相关的细节勾起来、或者因为它的后果而改变了某个人的态度。',
    '不确定对方是否知道时，宁可让他记岔细节。没到期的旧事不要提前翻出来。',
  ].join('\n');
}
