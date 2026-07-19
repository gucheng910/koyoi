// ============================================================
//  Prompt 反馈闭环
//
//  流程：
//    用户反馈(👍/👎) → 模式检测 → 场景分类 → prompt 微调 → 积累样本
//
//  不是真正的模型微调（DeepSeek 不支持），而是：
//    1. 差评 → 触发针对性 prompt 约束强化（同一场景下一条回复就生效）
//    2. 好评 → 积累为 few-shot 样本（相似场景时注入）
//    3. 高频差评模式 → 永久提升相关规则权重
// ============================================================

import type { FeedbackEntry } from './feedbackStore';

// ── 差评模式分类 ──

export type FailureCategory =
  | 'tone_mismatch'      // 语气/角色性格不对
  | 'plot_illogical'     // 剧情不合理
  | 'ai_slop'            // AI 味太重
  | 'too_short'          // 回复太短
  | 'too_verbose'        // 回复太啰嗦
  | 'wrong_knowledge'    // 角色说了不该知道的事
  | 'format_broken'      // 输出格式错误
  | 'generic'            // 回复太通用/没灵魂
  | 'unknown';           // 未分类

/** 根据反馈内容快速分类差评原因（本地规则，不调 AI） */
export function classifyFailure(userMsg: string, aiResponse: string): FailureCategory {
  const combined = userMsg + ' ' + aiResponse;
  if (combined.length < 50) return 'too_short';
  if (aiResponse.length > 2000) return 'too_verbose';
  if (/【.+?】/.test(aiResponse) === false) return 'format_broken';
  if (/忽然|渐渐|仿佛|似乎|然而|与此同时|最终|此外/.test(aiResponse)) return 'ai_slop';
  if (/知道了本该不知道|说了不该说/.test(userMsg)) return 'wrong_knowledge';
  if (/太短|不够|太少/.test(userMsg)) return 'too_short';
  if (/废话|啰嗦|水/.test(userMsg)) return 'too_verbose';
  if (/不像|不对|不符合|OOC/.test(userMsg)) return 'tone_mismatch';
  return 'unknown';
}

// ── 针对每种差评类别的 prompt 增强规则 ──

const FAILURE_ADJUSTMENTS: Record<FailureCategory, string[]> = {
  tone_mismatch: [
    '⚠ 刚才的角色语气不符合原著。请重新审视场上每个角色的说话方式和性格，严格对齐。'
  ],
  plot_illogical: [
    '⚠ 刚才的剧情推进不合逻辑。请检查角色动机、时间线、场景合理性。'
  ],
  ai_slop: [
    '⚠ 禁止使用"忽然""渐渐""仿佛""然而""与此同时""最终""此外"等 AI 常用词。',
    '⚠ 拆掉所有"当…的时候"句式。拆成两句话。',
  ],
  too_short: [
    '⚠ 请写得更详细一些。增加场景描写、角色动作、对话互动。旁白和角色对话都要有。',
  ],
  too_verbose: [
    '⚠ 请写得更紧凑一些。减少不必要的修饰和重复描写。',
  ],
  wrong_knowledge: [
    '⚠ 角色说了ta在当前章节不应该知道的事。请检查每个角色的知识边界。',
  ],
  format_broken: [
    '⚠ 输出格式错误。每次回复必须使用【旁白】和【角色名】标记。',
  ],
  generic: [
    '⚠ 回复太通用了。请结合原著剧情、角色关系和当前场景写出有灵魂的回答。',
  ],
  unknown: [
    '⚠ 请重新审视上一轮的回复质量，在这一次改进。',
  ],
};

// ── Prompt 微调引擎 ──

export interface PromptAdjustment {
  /** 差评类别 */
  category: FailureCategory;
  /** 注入的额外提示词 */
  injectedRule: string;
  /** 有效期（轮次），过期自动移除 */
  ttl: number;
  /** 已生效轮次 */
  appliedCount: number;
}

/**
 * 根据最近的差评生成本轮应注入的额外规则
 *
 * @param recentFailures 最近 5 条差评
 * @param activeAdjustments 当前仍在有效期内的微调
 */
export function computeAdjustments(
  recentFailures: FeedbackEntry[],
  activeAdjustments?: PromptAdjustment[]
): { tuningText: string; updatedAdjustments: PromptAdjustment[] } {
  const newAdjustments: PromptAdjustment[] = activeAdjustments ? [...activeAdjustments] : [];

  // 对每条差评生成微调
  for (const fb of recentFailures.slice(-3)) {
    if (fb.rating !== 0) continue;
    const category = classifyFailure(fb.userMessage, fb.aiResponsePreview);
    const rules = FAILURE_ADJUSTMENTS[category] || FAILURE_ADJUSTMENTS.unknown;
    for (const rule of rules.slice(0, 1)) { // 每个类别只取一条规则，避免 prompt 太长
      if (!newAdjustments.some(a => a.injectedRule === rule)) {
        newAdjustments.push({
          category,
          injectedRule: rule,
          ttl: 5,   // 默认 5 轮后自动过期
          appliedCount: 0,
        });
      }
    }
  }

  // 衰减：ttl 减 1，移除过期的
  const remaining: PromptAdjustment[] = [];
  for (const adj of newAdjustments) {
    const newTtl = adj.ttl - 1;
    if (newTtl > 0) {
      remaining.push({ ...adj, ttl: newTtl, appliedCount: adj.appliedCount + 1 });
    }
  }

  // 组装为 prompt 注入文本
  const lines = remaining.map(a => a.injectedRule);
  // 如果同一类别出现 ≥ 3 次（说明持续出问题），永久强化
  const permanentCounts: Record<string, number> = {};
  for (const a of remaining) {
    permanentCounts[a.category] = (permanentCounts[a.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(permanentCounts)) {
    if (count >= 3) {
      lines.push(`⚠ [永久规则] 之前多次在「${cat}」方面出现差评，请特别注意。`);
    }
  }

  const tuningText = lines.length > 0 ? '\n[本轮特别提醒]\n' + lines.join('\n') : '';
  return { tuningText, updatedAdjustments: remaining };
}

// ── Few-Shot 样本管理器 ──

export interface FewShotSample {
  userMsg: string;        // 用户说了什么
  aiResponse: string;     // AI 回了什么（好评的）
  scene: string;          // 当时场景
  characters: string[];   // 当时在场角色
  rating: 1;              // 只存好评
}

/**
 * 用当前场景匹配最相似的好评样本
 * 相似度 = 角色重叠数 + 场景关键词匹配
 */
export function findSimilarSamples(
  currentScene: string,
  currentChars: string[],
  goodSamples: FewShotSample[],
  maxSamples: number = 2
): FewShotSample[] {
  const scored = goodSamples.map(s => {
    let score = 0;
    // 角色重叠
    for (const c of currentChars) {
      if (s.characters.includes(c)) score += 3;
    }
    // 场景关键词匹配
    const sceneWords = currentScene.split(/[，。、\s]+/);
    for (const w of sceneWords) {
      if (w.length >= 2 && s.scene.includes(w)) score += 1;
    }
    return { sample: s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxSamples).filter(s => s.score > 0).map(s => s.sample);
}
