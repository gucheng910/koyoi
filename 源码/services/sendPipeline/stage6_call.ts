// ============================================================
//  发送管线 — 阶段 6: API 调用
// ============================================================

import { chatCompletion, chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig } from '../../types';

export async function callAI(
  cfg: ApiConfig,
  prompt: { role: string; content: string }[],
  setStreamingText: (text: string) => void
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (cfg.streamOutput) {
      let full = '';
      let lastUpdate = 0;
      chatCompletion({
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
      });
    } else {
      chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { temperature: 0.8 }).then(resolve).catch(reject);
    }
  });
}
