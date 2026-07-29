// ============================================================
//  世界信息服务
//  getWorldInfo: 关键词匹配激活世界观条目
//  extractMemories: 每10轮提取关键记忆
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { withSilentRetry } from './retry';
import type { ChatMessage, WorldSession } from '../types';
import type { CharacterAction } from './characterSimulator';

/**
 * 根据用户输入和最近消息激活相关世界观条目
 */
export function getWorldInfo(
  session: WorldSession,
  userText: string,
  recentMsgs: ChatMessage[]
): string {
  const combinedText = userText + ' ' + recentMsgs.slice(-5).map(m => m.content).join(' ');
  const MAX_TOKENS = 800;

  interface WiEntry { key: string | RegExp; content: string; priority: number; source: string }
  const allEntries: WiEntry[] = [];

  for (const c of session.selectedCharacters) {
    allEntries.push({ key: new RegExp(c.name, 'i'), content: `${c.name}: ${c.personality.traits.join('/')}，${c.relationship.status}，位于${c.currentContext.location}`, priority: 100, source: c.id });
  }
  for (const n of session.npcs) {
    allEntries.push({ key: new RegExp(n.name, 'i'), content: `${n.name}: ${n.role}，${n.personality}，${n.currentStatus}`, priority: 80, source: 'npc_' + n.name });
  }
  for (const loc of (session.world.locations || [])) {
    allEntries.push({ key: new RegExp(loc.name, 'i'), content: `${loc.name}: ${loc.description}`, priority: 60, source: 'loc_' + loc.name });
  }
  allEntries.push({ key: /世界|这里|地方/, content: `${session.world.name}: ${session.world?.rules?.supernatural || ""} | ${session.world?.rules?.society || ""}`, priority: 40, source: 'world_rules' });

  const activated = new Map<string, WiEntry>();
  if (session.currentScene) {
    allEntries.push({ key: /./, content: `当前场景：${session.currentScene}`, priority: 200, source: 'current_scene' });
  }
  for (const entry of allEntries) {
    const key = entry.key instanceof RegExp ? entry.key.test(combinedText) : combinedText.toLowerCase().includes(entry.key.toLowerCase());
    if (key) activated.set(entry.source, entry);
  }

  let added = true;
  while (added) {
    added = false;
    const activatedText = Array.from(activated.values()).map(e => e.content).join(' ');
    for (const entry of allEntries) {
      if (activated.has(entry.source)) continue;
      const key = entry.key instanceof RegExp ? entry.key.test(activatedText) : activatedText.toLowerCase().includes(entry.key.toLowerCase());
      if (key) { activated.set(entry.source, entry); added = true; }
    }
  }

  const sorted = Array.from(activated.values()).sort((a, b) => b.priority - a.priority);
  let totalChars = 0;
  const budgeted: string[] = [];
  for (const entry of sorted) {
    const len = entry.content.length;
    if (totalChars + len > MAX_TOKENS * 1.5) break;
    budgeted.push(`[${entry.source.replace(/^.+_/, '')}] ${entry.content}`);
    totalChars += len;
  }
  return budgeted.length > 0 ? '----- CONTEXTUAL LORE -----\n' + budgeted.join('\n') : '';
}

/**
 * 每10轮提取1-2条关键记忆
 */
export async function extractMemories(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  lastSimResults: Record<string, { intent: string; mood: string }>
): Promise<string[]> {
  try {
    const recent = messages.slice(-10).map(m => m.content).join('\n');
    const simData = Object.entries(lastSimResults).map(([k, v]) => `${k}: ${v.intent} (${v.mood})`).join('；');
    const prompt = [
      { role: 'system' as const, content: `从对话和角色状态中提取1-2条关键记忆。分类：
- bedrock：角色身份的核心记忆（初次见面、重大背叛、生死时刻、告白、关键决定）——永不遗忘
- core：重要的情感节点和事件——随时间衰减
返回JSON: [{"content":"...","importance":1-5,"type":"core"|"bedrock"}]。没有则返回[]。\n角色状态：${simData || '无'}` },
      { role: 'user' as const, content: recent },
    ];
    const raw = await withSilentRetry(() => chatCompletionSync(
      { id: '', label: '', baseUrl, apiKey, model: model || 'deepseek-v4-flash', thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 0.3, maxTokens: 200, safetyFilter: 'off', streamOutput: true, showSystemPrompt: false, autoPolish: false, isDefault: false },
      prompt, { maxTokens: 200, temperature: 0.3 }
    ), '');
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const items = JSON.parse(match[0]);
      if (items.length > 0) return items.map((it: any) => ({ content: it.content, importance: it.importance || 3, type: it.type || 'core', weight: it.importance || 3, lastActivated: Date.now() }));
    }
  } catch {}
  return [];
}
