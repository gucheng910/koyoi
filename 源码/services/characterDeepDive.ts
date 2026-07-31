// ============================================================
//  关键角色深挖
//  计算角色中心度（出场跨度/事件参与/关系数）筛选主角团，
//  对主角调用行为画像合成器生成"行为决策引擎"，
//  写回知识库角色卡，供 stage4 推演与对话注入使用
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { synthesizeBehaviorProfile, synthesizeAllBehaviors } from './characterBehaviorSynthesizer';
import type { ApiConfig, KnowledgeBase, CharacterBehaviorProfile } from '../types';

/**
 * 计算每个角色的中心度
 * 出场跨度(章) × 1 + 事件参与 × 1.5 + 关系连接 × 2
 */
export function computeCentrality(kb: KnowledgeBase): Record<string, number> {
  const score: Record<string, number> = {};
  const totalChapters = kb.chapterCount || 1;

  for (const c of kb.characters) {
    // 出场跨度（至少 1 章）
    const span = Math.max(1, (c.lastAppear || 0) - (c.firstAppear || 0) + 1);
    score[c.name] = (score[c.name] || 0) + span;
  }

  // 事件参与：优先用 globalTimeline.involvedCharacters，缺失时从摘要匹配角色名
  const timeline = kb.globalTimeline && kb.globalTimeline.length > 0 ? kb.globalTimeline : kb.plot;
  const names = new Set(kb.characters.map(c => c.name));
  for (const ev of timeline || []) {
    const involved: string[] = (ev as any).involvedCharacters || [];
    if (involved.length > 0) {
      for (const n of involved) {
        if (names.has(n)) score[n] = (score[n] || 0) + 1.5;
      }
    } else {
      const summary: string = (ev as any).summary || (ev as any).event || '';
      for (const n of names) {
        if (n.length >= 2 && summary.includes(n)) score[n] = (score[n] || 0) + 1.5;
      }
    }
  }

  // 关系连接数
  for (const r of kb.relations || []) {
    score[r.from] = (score[r.from] || 0) + 2;
    score[r.to] = (score[r.to] || 0) + 2;
  }

  return score;
}

/**
 * 筛选主角团：中心度 top N，且满足最低参与度（避免把龙套选进来）
 */
export function selectProtagonists(
  kb: KnowledgeBase,
  count: number = 5,
  minEvents: number = 3
): string[] {
  const score = computeCentrality(kb);
  const totalChapters = kb.chapterCount || 1;

  const candidates = kb.characters
    .map(c => {
      const s = score[c.name] || 0;
      const span = Math.max(1, (c.lastAppear || 0) - (c.firstAppear || 0) + 1);
      return { name: c.name, score: s, span, char: c };
    })
    .filter(c => c.span >= Math.min(3, Math.ceil(totalChapters * 0.05)))  // 至少出场 5% 章节
    .sort((a, b) => b.score - a.score);

  const top = candidates.slice(0, count);

  // 兜底：如果筛选后为空（小样本），放宽条件取前 count
  if (top.length === 0) {
    return kb.characters
      .map(c => ({ name: c.name, score: score[c.name] || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(count, kb.characters.length))
      .map(c => c.name);
  }
  return top.map(c => c.name);
}

/**
 * 从知识库角色构造行为画像合成器的输入
 */
function toSynthesisInput(c: any) {
  return {
    name: c.name,
    traits: c.traits || [],
    deepTraits: (c as any).deepTraits || [],
    defenseMechanism: (c as any).defenseMechanism || '',
    contradictions: (c as any).contradictions || '',
    role: c.role || '',
    signatureScenes: (c as any).signatureScenes || [],
    statusChanges: (c as any).statusChanges || [],
    speechStyle: c.speechStyle || '',
    speechSamples: c.speechSamples || [],
  };
}

/**
 * 对主角团执行深挖：合成行为画像并写回知识库角色
 * 返回实际生成画像的角色名集合
 */
export async function deepDiveProtagonists(
  config: ApiConfig,
  kb: KnowledgeBase,
  onProgress?: (msg: string) => void
): Promise<string[]> {
  const protagonists = selectProtagonists(kb, 5);
  if (protagonists.length === 0) return [];

  // 过滤掉已有行为画像的角色（幂等）
  const targets = protagonists.filter(name => {
    const c = kb.characters.find(x => x.name === name);
    return c && !(c as any).behaviorProfile;
  });
  if (targets.length === 0) return [];

  onProgress?.(`深挖主要角色（${targets.length}人）...`);
  const inputs = targets
    .map(name => kb.characters.find(x => x.name === name))
    .filter(Boolean)
    .map(toSynthesisInput);

  // 批量合成（内部 3 并发）
  const profiles = await synthesizeAllBehaviors(config, inputs, (cur, total) => {
    onProgress?.(`深挖角色 ${cur}/${total}...`);
  });

  // 写回知识库
  let written = 0;
  for (const name of Object.keys(profiles)) {
    const c = kb.characters.find(x => x.name === name);
    if (c && profiles[name]) {
      (c as any).behaviorProfile = profiles[name];
      written++;
    }
  }
  return written > 0 ? Object.keys(profiles) : [];
}

/**
 * 生成深挖总结文本（供界面展示/调试）
 */
export function deepDiveSummary(profiles: Record<string, CharacterBehaviorProfile>): string {
  return Object.entries(profiles)
    .map(([name, p]) => `${name}：${p.behavioralSummary?.slice(0, 60) || '（无）'}`)
    .join('\n');
}
