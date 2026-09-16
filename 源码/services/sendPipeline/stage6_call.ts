// ============================================================
//  发送管线 — 阶段 6: API 调用
// ============================================================

import { chatCompletion, chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig, ChatMessage } from '../../types';
import { withTag } from '../trace';

export async function callAI(
  cfg: ApiConfig,
  prompt: ChatMessage[],
  setStreamingText: (text: string) => void
): Promise<string> {
  // 注意：轮次的起点/终点由调用方（WorldChatScreen.send）划定，
  // 不在本阶段处理——否则 stage4 的并发调用会被算进上一轮。
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
        onComplete: (text) => { setStreamingText(''); resolve(text || full); },
        onError: reject,
      })).catch(reject);
    } else {
      withTag('narrator', () => chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { temperature: 0.8 }))
        .then(resolve)
        .catch(reject);
    }
  });
}
