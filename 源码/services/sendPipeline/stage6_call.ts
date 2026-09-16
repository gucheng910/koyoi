// ============================================================
//  发送管线 — 阶段 6: API 调用
// ============================================================

import { chatCompletion, chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig, ChatMessage } from '../../types';
import { withTag, beginTurn, endTurn } from '../trace';
import { getWorldState } from '../../store/worldSessionStore';

export async function callAI(
  cfg: ApiConfig,
  prompt: ChatMessage[],
  setStreamingText: (text: string) => void
): Promise<string> {
  // 标记本轮开始：后续所有 AI 调用都归到这一轮
  const turn = getWorldState().turnCount;
  beginTurn(turn);

  return new Promise<string>((resolve, reject) => {
    if (cfg.streamOutput) {
      let full = '';
      let lastUpdate = 0;
      withTag('narrator', () => chatCompletion({
        // 温度固定 0.75：文学创作温度过高（默认 1.3）会发散致乱
        config: { ...cfg, thinkingMode: 'disabled', temperature: 0.75 },
        messages: prompt,
        onToken: (token) => {
          full += token;
          const now = Date.now();
          if (now - lastUpdate > 50) { setStreamingText(full); lastUpdate = now; }
        },
        onComplete: (text) => { setStreamingText(''); endTurn(turn); resolve(text || full); },
        onError: (e) => { endTurn(turn); reject(e); },
      })).catch((e) => { endTurn(turn); reject(e); });
    } else {
      withTag('narrator', () => chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { temperature: 0.8 }))
        .then((r) => { endTurn(turn); resolve(r); })
        .catch((e) => { endTurn(turn); reject(e); });
    }
  });
}
