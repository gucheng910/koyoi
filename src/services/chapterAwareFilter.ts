// ============================================================
//  章节感知的角色上下文过滤器
//  根据当前章节只注入角色在该时间点「应知道」的信息
//  解决：知识边界越界 + 关系状态不对齐时间点
// ============================================================

import type { Character, KnowledgeBase } from '../types';

export interface ChapterAwareCharProfile {
  name: string;
  role: string;
  /** 该时间点的表面性格 */
  traits: string[];
  /** 该时间点的关系状态（从关系变化历史中取最近一次） */
  relationshipStatus: string;
  /** 该时间点的说话风格 */
  speechStyle: string;
  /** 该时间点及之前的代表性台词（最多 3 条） */
  speechSamples: string[];
  /** 该角色在当前章节的已知事件 */
  knownEvents: string[];
  /** 该角色不知道的事件（来自后续章节）——用于约束 AI 不能提及 */
  unknownEvents: string[];
  /** 知识边界：该角色首次出场和当前章节 */
  chapterRange: [number, number];
}

/**
 * 从知识库中提取当前章节的角色快照
 * 
 * @param kb 知识库
 * @param currentChapter 当前章节（0-based）
 * @param characterNames 需要构建的角色名列表
 */
export function buildChapterAwareProfiles(
  kb: KnowledgeBase,
  currentChapter: number,
  characterNames: string[]
): ChapterAwareCharProfile[] {
  const profiles: ChapterAwareCharProfile[] = [];

  for (const name of characterNames) {
    const kbChar = kb.characters.find(c => c.name === name);
    if (!kbChar) continue;

    // 该角色在该时间点是否已出场
    const hasAppeared = kbChar.firstAppear <= currentChapter;

    // 说话样本：只取当前章节及之前的
    const speechSamples = (kbChar.speechSamples || [])
      .filter(s => s.chapter <= currentChapter)
      .slice(-3)
      .map(s => s.quote);

    // 关系状态：从关系变化中取最近一次 <= currentChapter 的状态
    const relations = kb.relations.filter(r =>
      r.from === name || r.to === name
    );
    const relationshipStatus = relations
      .map(r => {
        let status = r.type;
        for (const change of (r.changes || [])) {
          if (change.chapter <= currentChapter) {
            status = change.to || change.from || status;
          }
        }
        return `${r.from === name ? r.to : r.from}：${status}`;
      })
      .join('；') || '无已知关系';

    // 已知事件：该角色涉及且发生在当前章节及之前
    const knownEvents = kb.globalTimeline
      .filter(e =>
        e.chapter <= currentChapter &&
        e.involvedCharacters?.some(c => c === name)
      )
      .slice(-5)
      .map(e => `第${e.chapter + 1}章：${e.event}`);

    // 未知事件（来自后续章节，用于约束 AI）
    const unknownEvents = kb.globalTimeline
      .filter(e =>
        e.chapter > currentChapter &&
        e.involvedCharacters?.some(c => c === name)
      )
      .slice(0, 3)
      .map(e => `第${e.chapter + 1}章：${e.event}`);

    profiles.push({
      name,
      role: kbChar.role,
      traits: kbChar.traits,
      relationshipStatus,
      speechStyle: kbChar.speechStyle,
      speechSamples,
      knownEvents,
      unknownEvents,
      chapterRange: [kbChar.firstAppear, currentChapter],
    });
  }

  return profiles;
}

/**
 * 将章节感知的角色上下文注入角色推演 prompt
 */
export function injectChapterAwareContext(
  profile: ChapterAwareCharProfile
): string {
  const parts: string[] = [];

  parts.push(`${profile.name}（${profile.role}）`);
  parts.push(`性格：${profile.traits.join('、')}`);
  parts.push(`说话风格：${profile.speechStyle}`);

  if (profile.speechSamples.length > 0) {
    parts.push(`⚠ 必须这样说话：`);
    profile.speechSamples.forEach(s => parts.push(`  「${s}」`));
  }

  parts.push(`当前关系：${profile.relationshipStatus}`);

  if (profile.knownEvents.length > 0) {
    parts.push(`已知事件：\n${profile.knownEvents.join('\n')}`);
  }

  if (profile.unknownEvents.length > 0) {
    parts.push(`⚠ 角色不知道的未来事件（严禁提及）：\n${profile.unknownEvents.join('\n')}`);
  }

  return parts.join('\n');
}
