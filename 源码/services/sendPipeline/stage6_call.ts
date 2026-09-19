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
  // 预填充检测：stage5 可能在最末尾追加了一条 assistant 消息作为"起头"。
  // OpenAI 兼容端点只返回**续写部分**，不含这条前缀 —— 必须补回去，
  // 否则正文会丢掉开头的【旁白】标记，格式反而更乱。
  const tail = prompt[prompt.length - 1];
  const prefill = tail && tail.role === 'assistant' ? tail.content : '';

  // 模型有时会**把前缀自己又写一遍**（实测 3 轮里 1 轮不写、2 轮重复写）。
  // 无条件补前缀会得到「【旁白】【旁白】…」。所以只在它没写时才补。
  const withPrefix = (t: string): string =>
    !prefill || t.startsWith(prefill) ? t : prefill + t;

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
          if (now - lastUpdate > 50) { setStreamingText(withPrefix(full)); lastUpdate = now; }
        },
        onComplete: (text) => { setStreamingText(''); resolve(withPrefix(text || full)); },
        onError: reject,
      })).catch(reject);
    } else {
      withTag('narrator', () => chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { temperature: 0.8 }))
        .then(t => resolve(withPrefix(t)))
        .catch(reject);
    }
  });
}
