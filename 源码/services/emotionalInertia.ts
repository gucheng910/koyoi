// ============================================================
//  情绪惯性系统
//  核心原理：角色的情绪不会在下一轮归零。
//  真实的人带着昨天的愤怒进入今天的对话。
//  未表达的情绪在最不合时宜的时刻爆发。
// ============================================================

import type { CharacterMoodState, CharacterKnowledge } from '../types';
import type { CharacterAction } from './characterSimulator';

// 情绪强度衰减表（每轮衰减量，取决于当前强度）
const DECAY_TABLE: Record<string, number> = {
  // 高强度情绪衰减慢
  'rage': 0.3,      // 愤怒很难消散
  'terror': 0.5,    // 恐惧持续
  'grief': 0.3,     // 悲伤滞留
  // 中强度情绪正常衰减
  'shame': 0.8,     // 羞耻较快消退
  'joy': 1.0,       // 快乐自然消散
  'anxiety': 0.7,   // 焦虑中等
  'confusion': 1.2, // 困惑消散最快
  // 默认
  'default': 0.8,
};

// 情绪关键词映射
const EMOTION_ALIAS: Record<string, string> = {
  '怒': 'rage', '愤怒': 'rage', '愤': 'rage', '恨': 'rage', '恼': 'rage',
  '恐': 'terror', '怕': 'terror', '恐惧': 'terror', '惊': 'terror',
  '悲': 'grief', '哀': 'grief', '悲伤': 'grief', '哭': 'grief', '失落': 'grief',
  '羞': 'shame', '羞耻': 'shame', '愧': 'shame', '尴尬': 'shame',
  '喜': 'joy', '乐': 'joy', '开心': 'joy', '喜悦': 'joy', '幸福': 'joy', '兴奋': 'joy',
  '焦虑': 'anxiety', '不安': 'anxiety', '紧张': 'anxiety', '烦躁': 'anxiety',
  '困惑': 'confusion', '疑惑': 'confusion', '不解': 'confusion',
};

function detectEmotion(moodText: string): { emotion: string; decayRate: number } {
  const lower = moodText.toLowerCase();
  for (const [keyword, emotion] of Object.entries(EMOTION_ALIAS)) {
    if (lower.includes(keyword)) {
      return { emotion: keyword, decayRate: DECAY_TABLE[emotion] || DECAY_TABLE.default };
    }
  }
  return { emotion: moodText.slice(0, 10), decayRate: DECAY_TABLE.default };
}

/**
 * 从本轮角色推演结果更新情绪状态
 * 新情绪如果比旧情绪强烈，会覆盖；否则旧情绪继续主导
 */
export function updateMoods(
  actions: CharacterAction[],
  currentMoods: Record<string, CharacterMoodState>,
  turnCount: number
): Record<string, CharacterMoodState> {
  const moods = { ...currentMoods };

  for (const action of actions) {
    if (!action.mood || action.mood === '平静' || action.mood === 'neutral') {
      // 角色回归平静 → 降低现有情绪强度但不消除
      if (moods[action.name] && moods[action.name].intensity > 1) {
        moods[action.name] = {
          ...moods[action.name],
          intensity: moods[action.name].intensity - 1.5,
        };
      }
      continue;
    }

    const { emotion, decayRate } = detectEmotion(action.mood);
    const intensity = Math.min(10, 3 + (action.affectionDelta ? Math.abs(action.affectionDelta) / 10 : 0));

    // 如果角色已有情绪，比较强度
    const existing = moods[action.name];
    if (existing && existing.emotion === emotion) {
      // 同类情绪叠加
      moods[action.name] = {
        ...existing,
        intensity: Math.min(10, existing.intensity + intensity * 0.5),
        cause: action.triggerContext || existing.cause,
      };
    } else if (!existing || intensity > existing.intensity) {
      // 新情绪覆盖旧情绪（或首次设置）
      moods[action.name] = {
        emotion,
        intensity,
        cause: action.triggerContext || action.intent,
        sinceRound: turnCount,
        expressed: action.bodyLanguage ? action.bodyLanguage.length > 0 : false,
      };
    }
    // 否则旧情绪继续主导
  }

  return moods;
}

/**
 * 对每一轮结束后所有角色的情绪执行衰减
 * 强度降到 1 以下时清除
 */
export function decayMoods(
  moods: Record<string, CharacterMoodState>,
  currentRound: number
): Record<string, CharacterMoodState> {
  const result: Record<string, CharacterMoodState> = {};

  for (const [name, mood] of Object.entries(moods)) {
    const emotionKey = Object.entries(EMOTION_ALIAS).find(([k]) => mood.emotion.includes(k))?.[1];
    const decayRate = DECAY_TABLE[emotionKey || 'default'] || DECAY_TABLE.default;
    const roundsSince = currentRound - mood.sinceRound;
    
    // 衰减速度随经过轮次递增（新情绪衰减慢，旧情绪衰减快）
    const accelerationFactor = 1 + (roundsSince > 3 ? (roundsSince - 3) * 0.3 : 0);
    const newIntensity = mood.intensity - decayRate * accelerationFactor;

    if (newIntensity > 0.5) {
      result[name] = { ...mood, intensity: Math.min(10, Math.max(0, newIntensity)) };
    }
    // 否则情绪消散，不保留
  }

  return result;
}

/**
 * 检查是否有"未表达"的强烈情绪——这些情绪可能在下一轮爆发
 * 未表达的情绪 + 高强度 → 角色行为不可预测
 */
export function checkUnspentEmotions(
  moods: Record<string, CharacterMoodState>,
): Array<{ name: string; mood: CharacterMoodState }> {
  return Object.entries(moods)
    .filter(([, m]) => !m.expressed && m.intensity > 4)
    .map(([name, mood]) => ({ name, mood }));
}

/**
 * 将情绪状态转为 prompt 注入文本
 * 只输出强度 ≥ 2 的情绪（太弱的情绪不占 token）
 */
export function moodsToPrompt(
  moods: Record<string, CharacterMoodState>,
  knowledge?: Record<string, CharacterKnowledge>
): string {
  const entries = Object.entries(moods).filter(([, m]) => m.intensity >= 2);
  if (entries.length === 0) return '';

  const lines: string[] = ['【情绪惯性——角色此刻的心理状态】'];
  
  for (const [name, mood] of entries) {
    let line = `${name}：${mood.emotion}（强度 ${mood.intensity.toFixed(1)}/10，持续 ${mood.sinceRound} 轮）`;
    if (mood.cause) line += `。原因：${mood.cause}`;
    if (!mood.expressed) {
      line += `。⚠ 此情绪尚未外显——角色在压抑，可能在不相关的情境中突然爆发`;
    }
    
    // 如果角色知道一些相关信息，补充上下文
    if (knowledge?.[name]) {
      const relevantFacts = knowledge[name].knownFacts
        .filter(f => f.certainty > 0.3)
        .slice(0, 2);
      if (relevantFacts.length > 0) {
        line += `。已知：${relevantFacts.map(f => f.fact).join('；')}`;
      }
    }
    
    lines.push(line);
  }

  return lines.join('\n');
}
