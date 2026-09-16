// ============================================================
//  发送管线 — 阶段 2: 摘要生成（每 10 轮触发一次，非阻塞）
// ============================================================

import { chatCompletionSync } from '../../api/deepseek';
import type { ChatMessage } from '../../types';
import type { ApiConfig } from '../../types';
import { getWorldState, useWorldSessionStore } from '../../store/worldSessionStore';

export function maybeGenerateSummary(
  messages: ChatMessage[],
  turnCount: number,
  cfg: ApiConfig
): void {
  console.log('[PIPELINE] stage2 maybeGenerateSummary turn=' + turnCount + ' msgs=' + messages.length);
  // 摘要已存在或未到触发点则跳过
  if (messages.length <= 30 || getWorldState().summary || turnCount % 10 !== 0) return;
  const oldMsgs = messages.slice(0, messages.length - 30);
  if (oldMsgs.length <= 10) return;

  const sp = [
    { role: 'system' as const, content: '将对话压缩为摘要。要求：1) 事件/关系/情感各30字内；2) 必须记录新增角色及玩家与他们的关系进展（如"周芙：新同桌，约了看球"）；3) 已发生的约定、承诺、未完成事项必须保留。' },
    { role: 'user' as const, content: oldMsgs.map(m => (m.role === 'user' ? '玩家' : '') + ':' + m.content.slice(0, 150)).join('\n').slice(0, 8000) },
  ];
  chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, sp, { maxTokens: 300, temperature: 0.2 })
    .then(raw => {
      // 写回前检查：若期间已换世界（closeWorld 清空），丢弃这次迟到结果
      if (raw && raw.length > 20 && getWorldState().session) {
        useWorldSessionStore.getState().setSummary('[对话摘要]\n' + raw.slice(0, 400));
      }
    })
    .catch(() => {});
}
