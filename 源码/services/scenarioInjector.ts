// ============================================================
//  情景注入器（Reference: DeepRolePlay memory architecture）
//  每次 AI 请求前，从记忆库中检索相关情景并注入 prompt
//  用轻量模型做检索（deepseek-v4-flash），不影响主对话质量
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import type { ChatMessage, WorldSession } from '../types';

export interface ScenarioContext {
  /** 检索到的相关记忆（1-3 条） */
  recalledMemories: string[];
  /** 当前活跃角色的状态摘要 */
  characterStates: string;
  /** 最近的世界事件（已压缩） */
  worldEventsSummary: string;
  /** 注入到 prompt 的完整情景段落 */
  scenarioBlock: string;
}

/**
 * 检索相关记忆：用轻量模型扫描记忆库，找出与当前对话相关的条目
 *
 * @param config API 配置
 * @param memories 已存储的记忆库
 * @param recentMessages 最近 4 条消息
 */
async function recallMemories(
  cfg: { apiKey: string; baseUrl: string },
  memories: string[],
  recentMessages: string
): Promise<string[]> {
  if (!memories || memories.length === 0) return [];
  if (memories.length <= 3) return memories; // 记忆少就直接全取

  try {
    const prompt = [
      {
        role: 'system' as const,
        content: '你是记忆检索器。从记忆列表中选出与当前对话最相关的 1-3 条记忆。\n只返回序号（如：1,3,5），不要解释。没有相关的就返回 0。',
      },
      {
        role: 'user' as const,
        content: '当前对话：\n' + recentMessages.slice(0, 500) + '\n\n记忆列表：\n' + memories.map((m, i) => (i + 1) + '. ' + m).join('\n'),
      },
    ];
    const raw = await chatCompletionSync(
      { ...cfg, model: cfg.model || 'deepseek-v4-flash', thinkingMode: 'disabled', maxTokens: 50, temperature: 0, safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: false },
      prompt,
      { maxTokens: 50, temperature: 0 }
    );
    const nums = raw.match(/\d+/g)?.map(Number) || [];
    return nums
      .filter(n => n >= 1 && n <= memories.length)
      .slice(0, 3)
      .map(n => memories[n - 1]);
  } catch {
    // 检索失败：取最近的 2 条
    return memories.slice(-2);
  }
}

/**
 * 构建当前活跃角色的状态摘要
 */
function buildCharacterStates(session: WorldSession): string {
  const chars = [
    ...session.selectedCharacters,
    ...(session.npcs || []).filter(n => !session.selectedCharacters.some(c => c.name === n.name)),
  ];
  if (chars.length === 0) return '';

  return chars.slice(0, 8).map(c => {
    const mood = (c as any).currentContext?.mood || '';
    const loc = (c as any).currentContext?.location || '';
    const status = (c as any).relationship?.status || '';
    return `${c.name}：${mood || '无情绪'}${loc ? '，在' + loc : ''}${status ? '，' + status : ''}`;
  }).join('\n');
}

/**
 * 获取最新的世界事件（压缩版）
 */
function getRecentWorldEvents(session: WorldSession, max: number = 3): string {
  const events = session.recentWorldEvents || [];
  if (events.length === 0) return '';
  return events.slice(-max).map((e, i) => (i + 1) + '. ' + e).join('\n');
}

/**
 * 主入口：为 prompt 构建情景上下文
 *
 * 在每次 AI 请求前调用，返回应注入到 system prompt 的情景段落
 */
export async function enhanceWithScenario(
  session: WorldSession,
  recentMessages: ChatMessage[],
  cfg: { apiKey: string; baseUrl: string }
): Promise<ScenarioContext> {
  const recentText = recentMessages.slice(-4).map(m => m.content).join('\n');
  const memories = session.memories || [];
  const recalledMemories = await recallMemories(cfg, memories, recentText);
  const characterStates = buildCharacterStates(session);
  const worldEventsSummary = getRecentWorldEvents(session);

  // 构建注入段落
  const parts: string[] = [];
  if (recalledMemories.length > 0) {
    parts.push('[记忆闪回]\n' + recalledMemories.map(m => '· ' + m).join('\n'));
  }
  if (characterStates) {
    parts.push('[角色状态]\n' + characterStates);
  }
  if (worldEventsSummary) {
    parts.push('[世界动态]\n' + worldEventsSummary);
  }

  return {
    recalledMemories,
    characterStates,
    worldEventsSummary,
    scenarioBlock: parts.join('\n\n'),
  };
}
