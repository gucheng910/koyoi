// ============================================================
//  异步世界时钟
//  核心原理：世界在你不看它的时候也在运转。
//  玩家回来时，世界已经向前推进了——有人来过、有事发生、有消息在等。
//  不需要持续调用 AI，只在玩家回归时触发一次总结。
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { useConfigStore } from '../store/configStore';
import type { WorldSession, WorldLogEntry } from '../types';

export interface ClockResult {
  events: WorldLogEntry[];
  summary: string;  // 可注入 prompt 的一句话总结
}

/**
 * 推进世界时钟 —— 每轮递增
 */
export function advanceClock(session: WorldSession): number {
  const current = session.worldClock || 0;
  session.worldClock = current + 1;
  return current + 1;
}

/**
 * 检测是否该触发世界呼吸
 * 每 5 轮触发一次，但只在非生成状态下
 */
export function shouldBreathe(session: WorldSession, turnCount: number): boolean {
  const clock = session.worldClock || 0;
  return clock > 0 && clock % 5 === 0;
}

/**
 * 生成"你不在时发生的事"
 * 当玩家回归或间隔 N 轮时调用
 * 规则引擎生成候选事件 → AI 选择一个并润色
 */
export async function generateWorldPulse(
  session: WorldSession,
  turnCount: number
): Promise<ClockResult | null> {
  console.log('[WORLD] generateWorldPulse turn=' + turnCount);
  const cfg = useConfigStore.getState().getActiveConfig();
  if (!cfg) return null;

  // 规则引擎：基于世界状态生成 3 个候选事件
  const candidates = generateCandidates(session, turnCount);

  try {
    const prompt = [
      {
        role: 'system' as const,
        content: `你是${session.world?.name || '这个世界'}的幕后叙事引擎。从以下候选事件中选择最有趣的一个，用 50 字以内中文描述。要求具体：涉及 NPC 名字、地点、具体行动。`,
      },
      {
        role: 'user' as const,
        content: [
          `当前场景：${session.currentScene}`,
          `在场角色：${session.selectedCharacters.map(c => c.name).join('、')}`,
          `最近事件：${(session.recentWorldEvents || []).slice(-3).join('；')}`,
          ``,
          `候选事件：`,
          ...candidates.map((c, i) => `${i + 1}. ${c}`),
          ``,
          `选择最有趣的事件并用一句中文描述。`,
        ].join('\n'),
      },
    ];

    const result = await chatCompletionSync(
      { ...cfg, thinkingMode: 'disabled' },
      prompt,
      { maxTokens: 80, temperature: 0.9 }
    );

    const clean = (result || candidates[0])
      .replace(/["「」""\n]/g, '')
      .replace(/^\d+[.、)\s]+/, '')
      .trim()
      .slice(0, 80);

    const entry: WorldLogEntry = {
      id: 'wp_' + Date.now(),
      type: 'world_event',
      content: clean,
      timestamp: new Date().toISOString(),
      round: turnCount,
    };

    return {
      events: [entry],
      summary: clean,
    };
  } catch {
    // AI 不可用时回退到规则引擎
    const fallback = candidates[0];
    return {
      events: [{
        id: 'wp_' + Date.now(),
        type: 'world_event',
        content: fallback,
        timestamp: new Date().toISOString(),
        round: turnCount,
      }],
      summary: fallback,
    };
  }
}

/**
 * 规则引擎：基于世界状态和角色关系生成候选事件
 * 不调用 AI，纯逻辑推演
 */
function generateCandidates(session: WorldSession, turnCount: number): string[] {
  const chars = session.selectedCharacters.map(c => c.name);
  const npcs = (session.npcs || []).map(n => n.name);
  const allNames = [...chars, ...npcs];
  const worldName = session.world?.name || '这个世界';

  const templates: string[] = [];

  // 模板 1：不在场 NPC 的活动
  if (allNames.length >= 2) {
    const absent = allNames.find(n => !session.currentScene.includes(n)) || allNames[allNames.length - 1];
    templates.push(`${absent}在${randomPlace(worldName)}${randomAction()}`);
  }

  // 模板 2：世界环境变化
  templates.push(...[
    `${randomPlace(worldName)}的${randomWeather()}${randomConsequence()}`,
    `${randomFaction(session)}传来了新的消息`,
    `有陌生人出现在${randomPlace(worldName)}附近，引起了议论`,
  ]);

  // 模板 3：关系涟漪
  if (chars.length >= 2 && Math.random() < 0.5) {
    const a = chars[Math.floor(Math.random() * chars.length)];
    const b = chars.filter(c => c !== a)[Math.floor(Math.random() * (chars.length - 1))];
    templates.push(`${a}和${b}之间的紧张/亲密被旁人注意到了`);
  }

  // 模板 4：回响前序事件
  const recentEvents = session.recentWorldEvents || [];
  if (recentEvents.length > 0 && Math.random() < 0.4) {
    const lastEvent = recentEvents[recentEvents.length - 1];
    templates.push(`之前的"${lastEvent.slice(0, 20)}"在远处产生了回响`);
  }

  return templates.slice(0, 4);
}

function randomPlace(world: string): string {
  const places = ['街角', '路口', '门口', '走廊', '窗边', '后院', '广场', '楼梯口'];
  return places[Math.floor(Math.random() * places.length)];
}

function randomAction(): string {
  const actions = ['遇到了熟人', '发现了一样东西', '匆匆离开了', '在观察着什么', '做了个出人意料的举动'];
  return actions[Math.floor(Math.random() * actions.length)];
}

function randomWeather(): string {
  const weather = ['传来了声响', '弥漫着某种气氛', '一阵风吹过', '光线暗了下来', '周围安静了片刻'];
  return weather[Math.floor(Math.random() * weather.length)];
}

function randomConsequence(): string {
  const consequences = ['让路过的人侧目', '引起了小声议论', '没有人注意到', '被谁看了一眼'];
  return consequences[Math.floor(Math.random() * consequences.length)];
}

function randomFaction(session: WorldSession): string {
  const factions = session.world?.factions || [];
  if (factions.length > 0) {
    return factions[Math.floor(Math.random() * factions.length)].name;
  }
  return '附近的势力';
}
