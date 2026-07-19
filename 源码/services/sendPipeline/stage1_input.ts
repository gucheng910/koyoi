// ============================================================
//  发送管线 — 阶段 1: 输入处理
// ============================================================

import type { ChatMessage } from '../types';

export interface InputResult {
  finalText: string;
  userMsg: ChatMessage;
  msgsWithUser: ChatMessage[];
}

export function processInput(
  segments: { text: string; tag: string }[],
  messages: ChatMessage[]
): InputResult {
  const finalText = segments.map(s => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\n');
  const userMsg: ChatMessage = { role: 'user', content: finalText, timestamp: new Date().toISOString() };
  return { finalText, userMsg, msgsWithUser: [...messages, userMsg] };
}
