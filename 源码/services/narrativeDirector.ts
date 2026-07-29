// ============================================================
//  叙事导演 — Director Model
//  每 5~8 轮评估叙事节奏，输出场景推进方向
//  不直接生成文本，只输出结构化指令
//  结果注入到 stage5 提示词组装中
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { useConfigStore } from '../store/configStore';
import type { WorldSession, ChatMessage, ApiConfig } from '../types';

export interface DirectorDecision {
  /** 节奏建议 */
  pacing: 'speed_up' | 'maintain' | 'slow_down';
  /** 下一轮应该聚焦的方向 */
  suggestedFocus: string;
  /** 建议编织进叙事的事件（1~2 条，来自全局时间线或 NPC agenda） */
  events: string[];
  /** 建议 spotlight 的角色 */
  characterSpotlight?: string;
  /** 场景是否应该自然切换 */
  suggestSceneChange?: boolean;
  /** 新场景描述（如果 suggestSceneChange） */
  newSceneHint?: string;
}

/**
 * 调用叙事导演，评估当前状态并给出方向
 * 非阻塞——即使失败也不影响主流程
 */
export async function consultDirector(
  session: WorldSession,
  recentMessages: ChatMessage[],
  turnCount: number,
  chapter: number
): Promise<DirectorDecision | null> {
  const cfg = useConfigStore.getState().getActiveConfig();
  if (!cfg?.apiKey) return null;

  // 只每 5 轮检查一次
  if (turnCount % 5 !== 0) return null;

  try {
    const focus = buildDirectorPrompt(session, recentMessages, turnCount, chapter);
    const raw = await chatCompletionSync(
      { ...cfg, thinkingMode: 'disabled', maxTokens: 4096 } as ApiConfig,
      [
        { role: 'system', content: '你是互动小说的叙事导演。你的工作是评估当前的叙事节奏，决定故事是否需要推进、转场或聚焦某个角色。\n\n输出格式（纯 JSON，不要其他文字）：\n{"pacing":"maintain","suggestedFocus":"一句话描述","events":["可选事件1","可选事件2"],"characterSpotlight":"角色名或null","suggestSceneChange":false,"newSceneHint":"如果需要转场，描述新场景氛围"} \n\npacing 取值：speed_up（加速/推进剧情）| maintain（保持当前节奏）| slow_down（放慢/深入当前场景）。events 最多 2 条，从已有时间线中选取合适的，用 20 字以内描述。' },
        { role: 'user', content: focus },
      ],
      { temperature: 0.3, maxTokens: 500 }
    );

    if (!raw) return null;
    // 提取 JSON
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      pacing: parsed.pacing || 'maintain',
      suggestedFocus: parsed.suggestedFocus || '',
      events: Array.isArray(parsed.events) ? parsed.events.slice(0, 2) : [],
      characterSpotlight: parsed.characterSpotlight || undefined,
      suggestSceneChange: !!parsed.suggestSceneChange,
      newSceneHint: parsed.newSceneHint || undefined,
    };
  } catch {
    return null;
  }
}

function buildDirectorPrompt(
  session: WorldSession,
  recentMessages: ChatMessage[],
  turnCount: number,
  chapter: number
): string {
  const lastFew = recentMessages.slice(-6).map(m => m.content.slice(0, 100)).join('\n');

  return [
    '当前状态：',
    `- 章节：第${chapter + 1}章`,
    `- 已进行 ${turnCount} 轮对话`,
    `- 当前场景：${session.currentScene || '未知'}`,
    `- 在场角色：${session.selectedCharacters.map(c => c.name).join('、')}`,
    `- 世界类型：${session.world?.type || '未知'}`,
    '',
    '最近对话：',
    lastFew.slice(0, 800),
    '',
    '请评估叙事节奏并给出推进建议。',
  ].join('\n');
}

/**
 * 在提示词组装阶段注入导演指令
 */
export function directorToPrompt(dir: DirectorDecision | null): string {
  if (!dir) return '';

  const parts: string[] = ['[叙事导演指示]'];

  if (dir.pacing === 'speed_up') {
    parts.push('节奏提示：适当推进剧情，不要停留在当前细节上。');
  } else if (dir.pacing === 'slow_down') {
    parts.push('节奏提示：放慢节奏，深入描写当前场景的情感和氛围。');
  }

  if (dir.suggestedFocus) {
    parts.push('叙事焦点：' + dir.suggestedFocus);
  }

  if (dir.characterSpotlight) {
    parts.push('角色焦点：可以多描写' + dir.characterSpotlight + '的反应和状态。');
  }

  if (dir.suggestSceneChange && dir.newSceneHint) {
    parts.push('场景转场建议：' + dir.newSceneHint + '——如果叙事自然推进到这一步可以触发转场。');
  }

  if (dir.events.length > 0) {
    parts.push('可编织的背景事件：' + dir.events.join('；'));
  }

  return '\n' + parts.join('\n') + '\n[/叙事导演指示]';
}
