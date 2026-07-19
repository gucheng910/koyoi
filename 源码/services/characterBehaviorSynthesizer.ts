// ============================================================
//  角色行为画像合成器
//  核心原理：标签不等于行为。
//  "傲娇"是标签。"当感到脆弱时先推开别人，然后偷偷看对方
//  是否还在——如果不在就告诉自己从来不需要"是行为引擎。
//  这个模块把前者合成为后者，一次调用，终身使用。
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import type { ApiConfig } from '../types';
import type { CharacterBehaviorProfile } from '../types';

export interface SynthesisInput {
  name: string;
  traits: string[];
  deepTraits: string[];
  defenseMechanism: string;
  contradictions: string;
  role: string;
  signatureScenes: Array<{ chapter: number; description: string }>;
  statusChanges: Array<{ chapter: number; from: string; to: string }>;
  speechStyle: string;
  speechSamples: Array<{ quote: string; chapter: number }>;
}

const SYNTHESIS_SYSTEM = `你是角色行为学家。你的任务是根据角色的表面性格、深层性格、防御机制、矛盾点和原著中的关键场景，推断角色的**行为决策引擎**。

你不会重复输入数据。你推断的是数据背后的逻辑——"当X发生时，这个角色会怎么做，为什么"。

输出必须是有效的 JSON，包含以下字段：

- priorityHierarchy: 决策优先级。当多个价值冲突时，这个角色先保什么？格式如"尊严 > 生存 > 感情"。不超过 30 字。
- pressurePoints: 压力点数组。什么情境会触发这个角色的防御机制？每条 15 字内，2-4 条。注意：压力点必须是具体可识别的，不是模糊的"被伤害"。
- breakingPoint: 断裂点。在什么条件下这个角色会完全偏离惯常行为模式？不是情绪波动，是"人设崩塌"级别的偏离。50 字内。
- relationshipPatterns: 关系模板。这个角色如何对待不同类型的人——强者、弱者、同辈、陌生人？各用一句话。60 字内。
- activeConflict: 内心冲突。此刻在角色内部持续进行的拉扯对。格式如"渴望X vs 恐惧Y"。30 字内。
- resolutionTendency: 解决倾向。角色倾向于用什么方式处理内心冲突？是爆发、压抑、转化、还是逃避？20 字内。
- behavioralSummary: 综合画像。一段流畅中文，概括此角色的行为逻辑——不是性格描述，是**决策规则**。回答的问题是："在任意情境中，这个角色会怎么做？" 100-200 字。必须包含具体的"如果...就..."行为推断。

关键原则：
1. 行为推断必须基于原著数据，不能凭空捏造
2. 防御机制是关键——它决定了角色的"默认反应模式"
3. 矛盾点揭示了角色行为中不可预测的部分——看似矛盾的行为反而是最真实的
4. 签名场景是最有说服力的证据——从它们中推断行为模式
5. 用具体的、可执行的语言，不要用学术腔`;

function buildSynthesisPrompt(input: SynthesisInput): string {
  const parts: string[] = [
    `## 角色：${input.name}`,
    `身份：${input.role}`,
    ``,
    `### 表面性格`,
    input.traits.join('、'),
    ``,
    `### 深层性格（他人未必看到的一面）`,
    input.deepTraits.length > 0 ? input.deepTraits.join('、') : '（未提取）',
    ``,
    `### 防御机制`,
    input.defenseMechanism || '（未提取）',
    ``,
    `### 矛盾点`,
    input.contradictions || '（未提取）',
    ``,
    `### 说话方式`,
    input.speechStyle || '（未提取）',
    ``,
    `### 台词样本`,
    ...input.speechSamples.slice(0, 3).map(s =>
      `"${s.quote}"（第${s.chapter + 1}章）`
    ),
    ``,
    `### 关键场景`,
    ...input.signatureScenes.slice(0, 3).map(s =>
      `第${s.chapter + 1}章：${s.description}`
    ),
    ``,
    `### 状态变化`,
    ...input.statusChanges.slice(0, 3).map(s =>
      `第${s.chapter + 1}章：从「${s.from}」变为「${s.to}」`
    ),
    ``,
    `请基于以上数据，推断${input.name}的行为决策引擎。`,
  ];

  return parts.join('\n');
}

function safeParse(raw: string): Partial<CharacterBehaviorProfile> | null {
  try {
    // 尝试直接解析
    return JSON.parse(raw);
  } catch {
    // 尝试提取 JSON 块
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 从角色分析数据合成行为画像
 * 每个角色调用一次，永久缓存
 */
export async function synthesizeBehaviorProfile(
  config: ApiConfig,
  input: SynthesisInput
): Promise<CharacterBehaviorProfile | null> {
  if (!input.traits.length && !input.deepTraits.length) return null;

  const prompt = [
    { role: 'system' as const, content: SYNTHESIS_SYSTEM },
    { role: 'user' as const, content: buildSynthesisPrompt(input) },
  ];

  try {
    const raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      prompt,
      { temperature: 0.4, maxTokens: 800 }
    );

    const parsed = safeParse(raw);
    if (!parsed) return null;

    return {
      priorityHierarchy: parsed.priorityHierarchy || '',
      pressurePoints: Array.isArray(parsed.pressurePoints) ? parsed.pressurePoints : [],
      breakingPoint: parsed.breakingPoint || '',
      relationshipPatterns: parsed.relationshipPatterns || '',
      activeConflict: parsed.activeConflict || '',
      resolutionTendency: parsed.resolutionTendency || '',
      behavioralSummary: parsed.behavioralSummary || '',
    };
  } catch {
    return null;
  }
}

/**
 * 批量合成：并行处理所有角色
 */
export async function synthesizeAllBehaviors(
  config: ApiConfig,
  characters: SynthesisInput[],
  onProgress?: (current: number, total: number) => void
): Promise<Record<string, CharacterBehaviorProfile>> {
  const results: Record<string, CharacterBehaviorProfile> = {};

  // 每次并行 3 个
  for (let i = 0; i < characters.length; i += 3) {
    const batch = characters.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (char) => {
        const profile = await synthesizeBehaviorProfile(config, char);
        return { name: char.name, profile };
      })
    );

    for (const { name, profile } of batchResults) {
      if (profile) results[name] = profile;
      onProgress?.(i + batch.indexOf(characters.find(c => c.name === name)!), characters.length);
    }
  }

  return results;
}

/**
 * 将行为画像转为可注入 simulation prompt 的文本
 */
export function profileToPrompt(profile: CharacterBehaviorProfile): string {
  if (!profile.behavioralSummary) return '';

  const parts: string[] = [];

  // 核心行为逻辑（最重要的部分）
  parts.push(`行为逻辑：${profile.behavioralSummary}`);

  // 决策优先级
  if (profile.priorityHierarchy) {
    parts.push(`决策优先级：${profile.priorityHierarchy}`);
  }

  // 压力点
  if (profile.pressurePoints.length > 0) {
    parts.push(`触发防御的情境：${profile.pressurePoints.join('；')}`);
  }

  // 断裂点
  if (profile.breakingPoint) {
    parts.push(`可能失控的时刻：${profile.breakingPoint}`);
  }

  // 内心冲突与解决
  if (profile.activeConflict || profile.resolutionTendency) {
    const conflict = profile.activeConflict ? `内心冲突：${profile.activeConflict}` : '';
    const resolution = profile.resolutionTendency ? `。处理方式：${profile.resolutionTendency}` : '';
    parts.push(conflict + resolution);
  }

  // 关系模式
  if (profile.relationshipPatterns) {
    parts.push(`关系本能：${profile.relationshipPatterns}`);
  }

  return parts.join('\n');
}
