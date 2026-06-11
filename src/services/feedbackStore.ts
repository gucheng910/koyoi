// ============================================================
//  反馈收集 — 为后续 prompt 优化做数据准备
//
//  当前：存储用户对 AI 回复的 👍/👎 评分
//  后续用途：
//    1. 发现哪些类型的 prompt 指令效果差（需要强化）
//    2. 发现哪些角色/场景 AI 表现不稳定
//    3. 积累正面样本用于 few-shot prompt
//    4. 识别高频差评模式 → 自动调整 prompt 权重
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '../types';

const FEEDBACK_KEY = '@koyoi_feedback';

export interface FeedbackEntry {
  id: string;                    // 唯一标识
  timestamp: string;
  worldId: string;
  worldName: string;
  turnNumber: number;
  /** 用户发送的内容 */
  userMessage: string;
  /** AI 生成的回复（前 300 字） */
  aiResponsePreview: string;
  /** 评分：1=好 0=差 */
  rating: 1 | 0;
  /** 当前场景 */
  scene: string;
  /** 活跃角色 */
  activeCharacters: string[];
  /** 是否为同人模式 */
  isFanfic: boolean;
  /** 当前章节（同人模式） */
  currentChapter?: number;
}

/**
 * 记录一条反馈
 */
export async function recordFeedback(entry: Omit<FeedbackEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    const entries: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
    entries.push({
      ...entry,
      id: 'fb_' + Date.now(),
      timestamp: new Date().toISOString(),
    });
    // 只保留最近 200 条
    if (entries.length > 200) entries.splice(0, entries.length - 200);
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(entries));
  } catch {}
}

/**
 * 获取反馈统计（供后续分析使用）
 */
/**
 * 获取最近差评（只取最后 N 条，避免全量读取）
 */
export async function getRecentBadFeedback(limit: number = 5): Promise<FeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const entries: FeedbackEntry[] = JSON.parse(raw);
    return entries.filter(e => e.rating === 0).slice(-limit);
  } catch { return []; }
}

/**
 * 获取好评样本（只取最后 N 条）
 */
export async function getGoodSamples(limit: number = 20): Promise<FeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const entries: FeedbackEntry[] = JSON.parse(raw);
    return entries.filter(e => e.rating === 1).slice(-limit);
  } catch { return []; }
}

export async function getFeedbackStats(): Promise<{
  total: number;
  good: number;
  bad: number;
  recentIssues: string[];
}> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    const entries: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
    return {
      total: entries.length,
      good: entries.filter(e => e.rating === 1).length,
      bad: entries.filter(e => e.rating === 0).length,
      recentIssues: entries
        .filter(e => e.rating === 0)
        .slice(-10)
        .map(e => e.userMessage.slice(0, 50)),
    };
  } catch {
    return { total: 0, good: 0, bad: 0, recentIssues: [] };
  }
}
