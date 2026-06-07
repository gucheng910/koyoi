// ============================================================
//  角色自主演化调度器 (Reference: OpenCharacterBook A2A pattern)
//
//  核心改动：角色不再只等玩家触发
//  1. 背景互动：闲置时，两个角色之间自动发生小互动
//  2. 情绪衰减：时间流逝，角色的情绪/态度自然变化
//  3. 关系漂移：角色之间的关系随互动积累而变化
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import type { WorldSession, Character } from '../types';

export interface BackgroundInteraction {
  /** 互动的两个角色 */
  between: [string, string];
  /** AI 生成的互动描述（30-50字） */
  narrative: string;
  /** 互动类型 */
  type: 'conversation' | 'action' | 'observation' | 'conflict';
  /** 对关系的影响 */
  relationDelta: Record<string, number>;
  /** 对情绪的影响 */
  moodDelta: Record<string, string>;
}

/**
 * 角色自主互动：基于关系网络选择合理的互动配对
 *
 * OpenCharacterBook 的 Seed Resolution 模式：
 * 不随机选角色，而是根据已有关系/同场景/共同目标来筛选
 */
export async function generateBackgroundInteraction(
  cfg: { apiKey: string; baseUrl: string },
  activeChars: Array<{ name: string; personality: string; status: string; relationship: string }>,
  scene: string
): Promise<BackgroundInteraction | null> {
  if (activeChars.length < 2) return null;

  // Seed Resolution：找出"应该互动"的配对
  // 按优先级：1. 有已知关系 2. 同场景 3. 情绪相反（冲突潜力）
  const pairs: Array<{ a: typeof activeChars[0]; b: typeof activeChars[0]; reason: string; priority: number }> = [];
  for (let i = 0; i < activeChars.length; i++) {
    for (let j = i + 1; j < activeChars.length; j++) {
      const a = activeChars[i];
      const b = activeChars[j];
      let priority = 0;
      let reason = '';

      // 有明确的关系描述（非"陌生人"）→ 高优先级
      if (a.relationship && a.relationship !== '陌生人' && a.relationship.includes(b.name)) {
        priority += 5;
        reason = a.relationship;
      }
      if (b.relationship && b.relationship !== '陌生人' && b.relationship.includes(a.name)) {
        priority += 5;
        reason = reason || b.relationship;
      }

      // 同场景 → 中优先级
      if (a.status && b.status && a.status === b.status) {
        priority += 2;
      }

      // 情绪对立 → 冲突潜力
      const aMood = a.status || '';
      const bMood = b.status || '';
      if ((aMood.includes('怒') && bMood.includes('怕')) ||
          (aMood.includes('焦虑') && bMood.includes('冷静'))) {
        priority += 3;
      }

      if (priority > 0) {
        pairs.push({ a, b, reason, priority });
      }
    }
  }

  // 没有合理配对就不生成
  if (pairs.length === 0) return null;

  // 优先选最高 priority 的配对
  pairs.sort((x, y) => y.priority - x.priority);
  const selected = pairs[0];
  const [charA, charB] = [selected.a, selected.b];

  try {
    const prompt = [
      {
        role: 'system' as const,
        content: `你是背景叙事引擎。生成两个角色之间在玩家视线之外发生的简短互动。
要求：
- 30-50 字，中文
- 互动类型：conversation(对话) | action(行动) | observation(观察) | conflict(冲突)
- 必须基于这两个角色的已知关系和性格来写，不要凭空编造
- 写出具体发生了什么
返回JSON：{"narrative":"...","type":"conversation|action|observation|conflict","relationDelta":{"角色A":数字},"moodDelta":{"角色A":"新情绪"}}`,
      },
      {
        role: 'user' as const,
        content: [
          `场景：${scene}`,
          `${charA.name}：${charA.personality}，${charA.status}`,
          `${charB.name}：${charB.personality}，${charB.status}`,
          `两人关系：${selected.reason || '同在一个场景中'}`,
        ].join('\n'),
      },
    ];

    const raw = await chatCompletionSync(
      { ...cfg, model: cfg.model || 'deepseek-v4-flash', thinkingMode: 'disabled', maxTokens: 200, temperature: 0.7, safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: false },
      prompt,
      { maxTokens: 200, temperature: 0.7 }
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    return {
      between: [charA.name, charB.name],
      narrative: parsed.narrative || `${charA.name}和${charB.name}擦肩而过。`,
      type: parsed.type || 'observation',
      relationDelta: parsed.relationDelta || {},
      moodDelta: parsed.moodDelta || {},
    };
  } catch {
    return null;
  }
}

/**
 * 将背景互动应用到 session 状态
 */
export function applyBackgroundInteraction(
  session: WorldSession,
  interaction: BackgroundInteraction
): WorldSession {
  const [nameA, nameB] = interaction.between;

  const updatedChars = session.selectedCharacters.map(c => {
    if (c.name === nameA || c.name === nameB) {
      const newMood = interaction.moodDelta[c.name];
      return {
        ...c,
        currentContext: {
          ...c.currentContext,
          mood: newMood || c.currentContext.mood,
          recentEvents: (c.currentContext.recentEvents || '') + ' | ' + interaction.narrative,
        } as any,
      };
    }
    return c;
  });

  return {
    ...session,
    selectedCharacters: updatedChars,
    recentWorldEvents: [...(session.recentWorldEvents || []).slice(-19), interaction.narrative],
  };
}
