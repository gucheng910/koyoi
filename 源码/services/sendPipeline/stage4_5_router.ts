// ============================================================
//  发送管线 — 阶段 4.5: 内容路由器（Route）
//  每轮一次 flash 调用，决定本轮注入哪些动态内容、保留哪些历史
//  失败时返回 null → stage5 回退全量注入（零风险）
// ============================================================

import { chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig, WorldSession, ChatMessage } from '../../types';

export interface RouterDecision {
  /** 玩家意图分类 */
  intent: string;
  /** 本轮核心角色（角色卡深度注入名单） */
  focusChars: string[];
  /** 注入的动态内容 id（如 "ability:梦境入侵" / "foreshadow:夏心语数字"） */
  select: string[];
  /** 保留的历史轮次索引（目录中的编号），其余走摘要 */
  historyKeep: number[];
  /** 需要补注入完整档案的不在场角色 */
  extraChars: string[];
  /** 玩家提到的其他章节（1-based，注入该章事件/原文） */
  chapterRefs: number[];
  /** 本轮叙事基调 */
  tone: string;
  /** 场景建议（可选） */
  sceneHint: string | null;
}

// ─────────────────────────────────────────────
// 内容索引构建（供路由器目录 + stage5 选择展开共用）
// ─────────────────────────────────────────────

export interface AbilityItem {
  id: string;
  name: string;
  owner: string;
  status: '活跃' | '已退化';
  text: string;      // 详情（含章节范围）
}

/** 活跃/退化能力索引 */
export function buildAbilitiesIndex(world: any, chapter: number, soulName?: string): AbilityItem[] {
  const abilities = world?.abilities;
  if (!Array.isArray(abilities) || abilities.length === 0) return [];
  const cur = chapter + 1;
  const items: AbilityItem[] = [];
  for (const a of abilities) {
    const active = a.start <= cur && (!a.end || a.end >= cur);
    const degraded = a.end && a.end < cur;
    if (!active && !degraded) continue;
    const owner = a.owner || '其他角色';
    const mine = soulName ? owner === soulName : false;
    const who = mine ? `玩家(${soulName})` : owner;
    items.push({
      id: 'ability:' + a.name,
      name: a.name,
      owner: who,
      status: degraded ? '已退化' : '活跃',
      text: `${a.name}（${who}，${degraded ? '已退化，第' + (a.end || cur) + '章后失效' : '第' + a.start + '章起活跃'}）${a.details ? '：' + a.details : ''}`,
    });
  }
  return items.slice(0, 8);
}

export interface ForeshadowItem {
  id: string;
  name: string;
  planted: number;
  hint: string;
}

/** 未回收伏笔索引 */
export function buildForeshadowIndex(world: any, chapter: number): ForeshadowItem[] {
  const foreshadows = world?.foreshadows;
  if (!Array.isArray(foreshadows) || foreshadows.length === 0) return [];
  const cur = chapter + 1;
  const resolvedNames = new Set<string>();
  const timeline = (world?.timeline || []).filter((t: any) => (t.chapter || 0) <= chapter);
  for (const f of foreshadows) {
    if (!f.name) continue;
    for (const ev of timeline) {
      if ((ev.chapter || 0) <= (f.planted || 1)) continue;
      const desc = ev.description || ev.event || '';
      if (desc.includes(f.name)) { resolvedNames.add(f.name); break; }
    }
  }
  return foreshadows
    .filter(f => f.name && f.planted <= cur && !f.resolved && !resolvedNames.has(f.name))
    .slice(0, 6)
    .map(f => ({
      id: 'foreshadow:' + f.name,
      name: f.name,
      planted: f.planted || 1,
      hint: f.hint || '',
    }));
}

export interface MilestoneItem {
  id: string;
  char: string;
  progress: string;
  achieved: string;
  pending: string;
}

/** 关系里程碑索引 */
export function buildMilestoneIndex(world: any, chapter: number): MilestoneItem[] {
  const sets = world?.milestones;
  if (!Array.isArray(sets) || sets.length === 0) return [];
  const cur = chapter + 1;
  const timeline = (world?.timeline || []).filter((t: any) => (t.chapter || 0) <= chapter);
  const items: MilestoneItem[] = [];
  for (const set of sets) {
    const ms = (set.milestones || []).filter((m: any) => m && m.name);
    if (ms.length === 0) continue;
    const achieved = ms.filter((m: any) => {
      if (m.achieved) return true;
      return m.boundEvent && timeline.some((ev: any) => {
        const desc = ev.description || ev.event || '';
        return desc.includes(m.boundEvent);
      });
    });
    const pending = ms.filter((m: any) => !achieved.includes(m) && (!m.chapter || m.chapter <= cur));
    items.push({
      id: 'milestone:' + set.character,
      char: set.character,
      progress: `${achieved.length}/${ms.length}`,
      achieved: achieved.map((m: any) => m.name).join('、') || '无',
      pending: pending.map((m: any) => m.name).join('、') || '无',
    });
  }
  return items.slice(0, 4);
}

export interface SceneItem {
  id: string;
  title: string;
  chapter: number;
  originalPlot: string;
}

/** 名场面索引（规则预筛后的候选） */
export function buildSceneIndex(world: any, chapter: number, scene: string, activeChars: string[]): SceneItem[] {
  const scenes = world?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return [];
  const cur = chapter + 1;
  return scenes
    .filter((s: any) => {
      if (!s.title) return false;
      const chNear = Math.abs((s.chapter || 0) - cur) <= 25;
      const kwHit = (s.trigger?.keywords || []).some((k: string) => k && scene.includes(k));
      if (kwHit && (s.chapter || 0) <= cur + 25) return true;
      const upcoming = (s.chapter || 0) >= cur - 2;
      const charHit = (s.trigger?.characters || []).some((c: string) => activeChars.includes(c));
      return upcoming && charHit && Math.abs((s.chapter || 0) - cur) <= 8;
    })
    .slice(0, 4)
    .map((s: any) => ({
      id: 'scene:' + s.title,
      title: s.title,
      chapter: (s.chapter || 0) + 1,
      originalPlot: String(s.originalPlot || '').slice(0, 80),
    }));
}

// ─────────────────────────────────────────────
// 路由器调用
// ─────────────────────────────────────────────

const ROUTER_SYSTEM = `你是互动小说的内容路由决策器。你的工作是：根据玩家当前消息和对话上下文，决定本轮正文生成需要注入哪些世界内容、保留哪些历史对话。

【你的唯一输出】一个 JSON 对象，不要输出任何其他文字、注释或 Markdown：
{"intent":"玩家意图","focusChars":["角色名"],"select":["内容id"],"historyKeep":[轮次编号],"extraChars":["角色名"],"chapterRefs":[章节号],"tone":"基调","sceneHint":"场景描述或null"}

【字段规则】
- intent：从【推进剧情|闲聊|打听情报|攻略角色|触发事件|情感交流|其他】中选一个最贴切的
- focusChars：本轮最可能回应的在场角色，最多 2 个
- select：从【可用内容目录】中挑选与本轮最相关的 1~4 项，填它们的 id；目录里没有的内容不要编造 id
- historyKeep：从【历史对话】中挑选与当前话题相关的轮次编号（编在每条前面），最多 10 个；拿不准就选最近 4 个
- extraChars：玩家可能提起但不在场、需要补身份档案的角色（防止 AI 编造其身份/位置），最多 2 个
- chapterRefs：玩家提到的其他章节（如"第20章的事"），填章节号；没提就填 []
- tone：从【日常|紧张|冲突|温情|悬疑|爆笑】中选
- sceneHint：如果对话暗示场景应切换，给一句新场景描述；否则 null

【判断要点】
- 玩家聊什么，就注入什么：聊角色关系 → 选里程碑；聊能力/超能力 → 选能力；聊往事/剧情 → 选伏笔或名场面
- 历史轮次中与当前话题同一条线索的对话必须保留，无关的可以省略
- 拿不准时宁可多选一两条相关的，不要漏掉明显相关的`;

export async function routeContent(
  cfg: ApiConfig,
  session: WorldSession,
  msgsWithUser: ChatMessage[],
  recentText: string
): Promise<RouterDecision | null> {
  try {
    const world = (session as any).world as any;
    const chapter = session.currentChapter || 0;
    const soulName = ((session as any).fanficConfig?.type === 'soul' && session.selectedCharacters.length > 0)
      ? session.selectedCharacters[0].name
      : undefined;
    const activeChars = session.selectedCharacters.map(c => c.name);
    const scene = session.currentScene || '未知地点';

    // ── 详细目录 ──
    const abilities = buildAbilitiesIndex(world, chapter, soulName);
    const foreshadows = buildForeshadowIndex(world, chapter);
    const milestones = buildMilestoneIndex(world, chapter);
    const scenes = buildSceneIndex(world, chapter, scene, activeChars);

    const historyLines = msgsWithUser.slice(1, 1 + 14).map((m, i) => {
      const who = m.role === 'user' ? '玩家' : 'AI';
      const txt = String(m.content || '').replace(/\n+/g, ' ').slice(0, 70);
      return `- [${i}] ${who}：${txt}`;
    }).join('\n');

    const recentDialog = msgsWithUser.slice(-4).map(m => {
      const who = m.role === 'user' ? '玩家' : 'AI';
      return `${who}：${String(m.content || '').replace(/\n+/g, ' ').slice(0, 150)}`;
    }).join('\n');

    const fc = (session as any).fanficConfig;
    const identityNote = fc?.type === 'soul'
      ? `魂穿${soulName || '角色'}${fc.playerAbilities?.plotKnowledge ? '，知晓原著剧情' : '，无原著知识'}`
      : '普通同人视角';

    const catalog: string[] = [];
    catalog.push(`【当前状态】章节：第${chapter + 1}章 | 场景：${scene} | 在场：${activeChars.join('、') || '无'} | ${identityNote}`);

    if (abilities.length > 0) {
      catalog.push('【可用内容·能力】');
      catalog.push(abilities.map(a => `- ${a.id} | ${a.status} | ${a.text}`).join('\n'));
    }
    if (foreshadows.length > 0) {
      catalog.push('【可用内容·伏笔】');
      catalog.push(foreshadows.map(f => `- ${f.id} | 第${f.planted}章埋设${f.hint ? ' | ' + f.hint : ''} | 未回收`).join('\n'));
    }
    if (milestones.length > 0) {
      catalog.push('【可用内容·关系里程碑】');
      catalog.push(milestones.map(m => `- ${m.id} | 进度${m.progress} | 已达成：${m.achieved} | 未达成：${m.pending}`).join('\n'));
    }
    if (scenes.length > 0) {
      catalog.push('【可用内容·名场面】');
      catalog.push(scenes.map(s => `- ${s.id} | 原著第${s.chapter}章 | ${s.originalPlot}`).join('\n'));
    }

    const candidateChars = (world?.characters || []).slice(0, 12)
      .filter((c: any) => c.name && !activeChars.includes(c.name))
      .map((c: any) => `${c.name}（${c.role || '未知身份'}）`).join('、');

    const userMsg = msgsWithUser[msgsWithUser.length - 1]?.content || '';

    const input = [
      '【最近对话】',
      recentDialog,
      '',
      catalog.join('\n'),
      candidateChars ? '\n【可补充档案的角色】' + candidateChars : '',
      historyLines ? '\n【历史对话（编号=轮次，供 historyKeep 引用）】\n' + historyLines : '',
      '',
      '【本轮玩家消息】',
      userMsg,
      '',
      '请输出决策 JSON。',
    ].join('\n');

    const raw = await chatCompletionSync(
      { ...cfg, thinkingMode: 'disabled', temperature: 0.2, maxTokens: 2048 } as ApiConfig,
      [
        { role: 'system', content: ROUTER_SYSTEM },
        { role: 'user', content: input },
      ],
      { temperature: 0.2, maxTokens: 600 }
    ).catch(() => null);

    if (!raw) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed: any;
    try { parsed = JSON.parse(match[0]); } catch { return null; }

    // 字段校验 + 默认值
    const validIds = new Set([
      ...abilities.map(a => a.id),
      ...foreshadows.map(f => f.id),
      ...milestones.map(m => m.id),
      ...scenes.map(s => s.id),
    ]);
    const select = (Array.isArray(parsed.select) ? parsed.select : [])
      .filter((s: any) => typeof s === 'string' && validIds.has(s))
      .slice(0, 6);
    const historyKeep = (Array.isArray(parsed.historyKeep) ? parsed.historyKeep : [])
      .filter((n: any) => typeof n === 'number' && n >= 0 && n < historyLines.length)
      .slice(0, 10);
    const extraChars = (Array.isArray(parsed.extraChars) ? parsed.extraChars : [])
      .filter((s: any) => typeof s === 'string' && s && !activeChars.includes(s))
      .slice(0, 2);
    const chapterRefs = (Array.isArray(parsed.chapterRefs) ? parsed.chapterRefs : [])
      .filter((n: any) => typeof n === 'number' && n >= 1 && n <= (world?.chapterCount || 999))
      .slice(0, 3);

    const decision: RouterDecision = {
      intent: typeof parsed.intent === 'string' ? parsed.intent.slice(0, 20) : '其他',
      focusChars: (Array.isArray(parsed.focusChars) ? parsed.focusChars : [])
        .filter((s: any) => typeof s === 'string' && activeChars.includes(s))
        .slice(0, 2),
      select,
      historyKeep,
      extraChars,
      chapterRefs,
      tone: typeof parsed.tone === 'string' ? parsed.tone.slice(0, 10) : '日常',
      sceneHint: typeof parsed.sceneHint === 'string' && parsed.sceneHint ? parsed.sceneHint.slice(0, 40) : null,
    };
    console.log('[ROUTER] intent=' + decision.intent + ' select=' + decision.select.length + ' hist=' + decision.historyKeep.length + ' extra=' + decision.extraChars.length + ' refs=' + decision.chapterRefs.length + ' tone=' + decision.tone);
    return decision;
  } catch (e) {
    console.warn('[ROUTER] failed: ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

/** 路由器决策 → prompt 注入文本（叙事方向） */
export function routerToPrompt(d: RouterDecision | null): string {
  if (!d) return '';
  const parts: string[] = ['[本轮叙事方向]'];
  const toneMap: Record<string, string> = {
    '日常': '平实自然，节奏轻快',
    '紧张': '语速加快，短句压迫',
    '冲突': '火药味，台词交锋要利落',
    '温情': '细节柔软，节奏放慢',
    '悬疑': '留白，别急着揭晓',
    '爆笑': '喜剧节奏，接梗要快',
  };
  if (toneMap[d.tone]) parts.push('基调：' + toneMap[d.tone]);
  if (d.intent && d.intent !== '其他') parts.push('玩家意图：' + d.intent + '（回应围绕该意图展开，不要答非所问）');
  if (d.sceneHint) parts.push('场景线索：' + d.sceneHint);
  return '\n' + parts.join('\n');
}
