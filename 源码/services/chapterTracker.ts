// ============================================================
//  章节追踪器
//  让 AI 自报当前剧情对应的原著章节位置
//  每 3 轮调用一次，避免重复开销
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import type { ApiConfig, KnowledgeBase } from '../types';
import { loadKnowledgeBase } from './knowledgeBase';

export interface ChapterPosition {
  chapter: number;       // 0-based 章节号
  confidence: number;    // 0-1
  reason: string;        // 判断依据
}

/**
 * 让 AI 判断当前剧情在原著时间线上的位置
 *
 * @param cfg API 配置
 * @param worldId 世界 ID
 * @param prevChapter 上一轮的章节号
 * @param recentMessages 最近 6 条对话
 * @param kb 知识库（可选，不传则自动加载）
 */
console.log('[CHAPTER] estimateChapterPosition called');
export async function estimateChapterPosition(
  cfg: ApiConfig,
  worldId: string,
  prevChapter: number,
  recentMessages: string[],
  kb?: KnowledgeBase | null
): Promise<ChapterPosition | null> {
  try {
    if (!kb) {
      kb = await loadKnowledgeBase(worldId);
      if (!kb) return null;
    }

    // 构建章节参考信息
    const chapterEvents = kb.globalTimeline
      .slice(Math.max(0, prevChapter - 3), Math.min(kb.chapterCount, prevChapter + 5))
      .map((e, i) => `第${e.chapter + 1}章：${e.event}`)
      .join('\n');

    const prompt = [
      {
        role: 'system' as const,
        content: `你是剧情位置判断器。你的工作是读完最近的对话，判断故事现在推进到了原著的哪个章节。

线索来源：
1. 看对话中提到的事件是否与原著某章的事件匹配
2. 看角色关系状态是否与某章一致
3. 看场景地点是否与某章吻合

上一轮判断：第${prevChapter + 1}章附近。
原著事件参考：
${chapterEvents || '（无）'}

返回JSON：{"chapter":章节号(0-based),"confidence":0-1,"reason":"判断依据(20字)"}

重要：chapter 必须是你真实推断出的章节号，**不要随便填**。
证据不足时把 confidence 给低（<0.3），chapter 填你最保守的猜测（通常应接近上一轮）。
只有当你确实在对话中看到与「原著事件参考」相符的情节时，才把 confidence 给到 0.6 以上。
不要编造。`,
      },
      { role: 'user' as const, content: recentMessages.join('\n') },
    ];

    const raw = await chatCompletionSync(
      { ...cfg, thinkingMode: 'disabled' },
      prompt,
      { maxTokens: 200, temperature: 0.1 }
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('[CHAPTER] no JSON in response, raw=' + String(raw).slice(0, 120));
      return null;
    }
    const parsed = JSON.parse(match[0]);

    const chapter = Math.max(0, Math.min((kb.chapterCount || 100) - 1, parseInt(parsed.chapter) || prevChapter));
    console.log('[CHAPTER] prev=' + prevChapter + ' -> chapter=' + chapter +
      ' conf=' + parsed.confidence + ' reason=' + String(parsed.reason || '').slice(0, 40));
    return {
      chapter,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reason: parsed.reason || '',
    };
  } catch (e: any) {
    console.warn('[CHAPTER] estimate failed: ' + (e?.message || e));
    return null;
  }
}

/**
 * 推进章节（仅在 AI 高置信度报告新章节时更新）
 *
 * 除了置信度门槛，还限制单次推进幅度：每 3 轮最多前进 MAX_STEP 章。
 * 实测（`chapterTracker.ts` 旧提示词写着「不确定时 chapter 可以随便给」，
 * 而这里又只按 confidence 放行）出现过开场第 1 章被一跳到第 45 章的情况——
 * 上下文还在波龙/断头饭，章节却跳到原著的「数学测试成绩公布」。
 * 倒退一律拒绝（剧情时间线是单调的）。
 */
const MAX_STEP = 5;
console.log('[CHAPTER] shouldAdvanceChapter called');
export function shouldAdvanceChapter(
  prev: number,
  newPos: ChapterPosition | null
): number | null {
  if (!newPos) return null;
  if (newPos.confidence <= 0.6) return null;
  if (newPos.chapter === prev) return null;
  // 倒退不接受
  if (newPos.chapter < prev) return null;
  // 单次最多前进 MAX_STEP 章，超出视为幻觉
  const capped = Math.min(newPos.chapter, prev + MAX_STEP);
  return capped;
}
