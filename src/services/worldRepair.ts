// ============================================================
//  世界修复服务
//  根据错误信息定位损坏字段，用 AI 定向修补
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { withSilentRetry } from './retry';
import type { WorldSession, World } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKUP_PREFIX = '@koyoi_world_backup_';

export interface RepairTarget {
  /** 损坏的字段路径，如 'rules' / 'characters[2].personality' */
  field: string;
  /** 期望类型 */
  expectedType: string;
  /** 实际值描述 */
  actualValue: string;
  /** 需要 AI 生成的字段列表（逗号分隔） */
  missingFields: string;
}

/**
 * 从报错信息中推断损坏的字段
 */
export function diagnoseError(error: Error, session: WorldSession): RepairTarget | null {
  const msg = error.message || '';

  // 规则字段缺失
  if (msg.includes("'rules'") || msg.includes('rules') && msg.includes('undefined')) {
    return {
      field: 'world.rules',
      expectedType: 'object',
      actualValue: 'undefined',
      missingFields: 'physics, supernatural, technology, society, morality, sexualNorms',
    };
  }

  // 角色相关崩溃
  const charMatch = msg.match(/Cannot read property '(\w+)' of undefined/);
  if (charMatch && msg.includes('characters')) {
    return {
      field: 'characters 数据',
      expectedType: 'array',
      actualValue: '损坏',
      missingFields: 'name, personality, backstory, traits',
    };
  }

  // 地点
  if (msg.includes('locations') && /undefined|null/.test(msg)) {
    return {
      field: 'world.locations',
      expectedType: 'array',
      actualValue: 'undefined',
      missingFields: 'name, description',
    };
  }

  // 通用：尝试从 Cannot read property 提取
  const propMatch = msg.match(/Cannot read propert(?:y|ies) '(\w+(?:\.\w+)*)' of (undefined|null)/);
  if (propMatch) {
    return {
      field: propMatch[1],
      expectedType: 'unknown',
      actualValue: propMatch[2],
      missingFields: propMatch[1],
    };
  }

  // 无法诊断时的兜底
  return {
    field: 'world 数据',
    expectedType: '完整对象',
    actualValue: '部分损坏',
    missingFields: 'rules, locations, timeline (损坏的部分)',
  };
}

/**
 * 用 AI 修复损坏的世界数据
 * 只修补缺失/损坏字段，不动已有数据
 */
export async function repairWorld(
  session: WorldSession,
  target: RepairTarget,
  cfg: { apiKey: string; baseUrl: string; model?: string }
): Promise<Partial<World>> {
  const model = cfg.model || 'deepseek-v4-flash';
  const w = session.world;

  const context = [
    `世界名：${w.name || '未知'}`,
    `类型：${w.type || '未知'}`,
    `风格：${w.writingStyle || '未设定'}`,
    w.styleSamples?.length ? `风格样本：${w.styleSamples.slice(0, 3).join('；')}` : '',
    `角色（${w.characters?.length || 0}人）：${(w.characters || []).map(c => `${c.name}（${(c.personality?.traits || []).join('/')}）`).join('、') || '无'}`,
    `地点：${(w.locations || []).map((l: any) => l.name || l.description).join('、') || '无'}`,
    `时间线事件数：${w.timeline?.length || 0}`,
    w.inertia ? `世界惯性：${JSON.stringify(w.inertia)}` : '',
    w.butterflySensitivity ? `蝴蝶效应：${JSON.stringify(w.butterflySensitivity)}` : '',
  ].filter(Boolean).join('\n');

  const prompt = [
    {
      role: 'system' as const,
      content: `你是数据修复引擎。下面的世界数据中，"${target.field}"字段损坏（期望 ${target.expectedType}，实际 ${target.actualValue}）。
请根据现有信息推断并重新生成缺失/损坏的部分。

被要求生成的字段：${target.missingFields}

规则：
1. 只返回需要修复的字段的JSON，不要返回完整世界对象
2. 根据已有的角色、地点、世界观类型来合理推断
3. 返回格式：{ "rules": { "physics": "物理规则", "supernatural": "超自然规则", ... }, ... }
4. 保持简洁，每个字段2-3句话即可`,
    },
    {
      role: 'user' as const,
      content: context,
    },
  ];

  const raw = await withSilentRetry(
    () =>
      chatCompletionSync(
        { id: 'repair', label: 'repair', baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model, thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 0.3, maxTokens: 1000, safetyFilter: 'off', streamOutput: false, showSystemPrompt: false, autoPolish: false, isDefault: false },
        prompt,
        { temperature: 0.3, maxTokens: 1000 }
      ),
    'repair'
  );

  try {
    const json = extractJSON(raw);
    return json as Partial<World>;
  } catch {
    // 若 AI 返回格式错误，返回空对象走兜底
    return {};
  }
}

function extractJSON(raw: string): any {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return {};
}

/**
 * 将修复后的数据安全合并到 world session
 */
export function mergeRepair(session: WorldSession, repaired: Partial<World>): WorldSession {
  const world = { ...session.world };
  for (const [key, value] of Object.entries(repaired)) {
    if (value !== undefined && value !== null) {
      (world as any)[key] = value;
    }
  }
  // 兜底：确保 rules 永远不为 undefined
  if (!world.rules) {
    world.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' };
  }
  return { ...session, world };
}

/**
 * 备份当前世界 session
 */
export async function backupSession(session: WorldSession): Promise<void> {
  await AsyncStorage.setItem(BACKUP_PREFIX + session.id, JSON.stringify(session));
}

/**
 * 恢复备份
 */
export async function restoreBackup(worldId: string): Promise<WorldSession | null> {
  const raw = await AsyncStorage.getItem(BACKUP_PREFIX + worldId);
  return raw ? JSON.parse(raw) : null;
}

/**
 * 删除备份
 */
export async function deleteBackup(worldId: string): Promise<void> {
  await AsyncStorage.removeItem(BACKUP_PREFIX + worldId);
}
