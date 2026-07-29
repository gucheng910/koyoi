// ============================================================
//  发送管线 — 阶段 6: API 调用
// ============================================================

import { chatCompletion, chatCompletionSync } from '../../api/deepseek';
import type { ApiConfig, ChatMessage } from '../../types';

export async function callAI(
  cfg: ApiConfig,
  prompt: { role: string; content: string }[],
  setStreamingText: (text: string) => void
): Promise<string> {
  console.log('[PIPELINE] stage6 callAI start stream=' + cfg.streamOutput + ' promptLen=' + prompt.length);
  const startTime = Date.now();
  return new Promise<string>((resolve, reject) => {
    const origReject = reject;
    reject = (e) => { console.log('[PIPELINE] stage6 callAI failed after ' + (Date.now()-startTime) + 'ms:', e?.message); origReject(e); };
    if (cfg.streamOutput) {
      let full = '';
      let lastUpdate = 0;
      // 思考模式在流式输出时无法正确消费 reasoning_content token，强制禁用
      chatCompletion({
        config: { ...cfg, thinkingMode: 'disabled' },
        messages: prompt as ChatMessage[],
        onToken: (token) => {
          full += token;
          const now = Date.now();
          if (now - lastUpdate > 50) { setStreamingText(full); lastUpdate = now; }
        },
        onComplete: (text) => { setStreamingText(''); resolve(text || full); },
        onError: reject,
      });
    } else {
      // 非流式：保留思考模式配置（保持用户设置）
      chatCompletionSync(cfg, prompt, { temperature: 0.8 }).then(resolve).catch(reject);
    }
  });
}
