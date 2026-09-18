// ============================================================
//  风格特征分析器
//  从文风样本中提取可操作的写作风格特征
//  供 Polish 和主 prompt 使用
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import type { ApiConfig, KnowledgeBase } from '../types';

/**
 * 从知识库的文风样本中分析写作风格特征
 */
/** 参与分析的样本段数 */
const SAMPLE_COUNT = 8;
/** 每段送入模型的字符上限。留足句长/标点这类统计特征的样本量 */
const SAMPLE_CHARS = 600;

export async function analyzeStyleFeatures(
  config: ApiConfig,
  kb: KnowledgeBase
): Promise<string> {
  // 取样必须「沿全书均匀」。
  //
  // 原实现是 styleProfile.flatMap(s => s.samples).slice(0, 8) —— 只取前 8 段。
  // 但 styleProfile 的数组顺序是**块完成的顺序**，而 analyzeAllChunks 是 3~5 并发，
  // 顺序并不确定：实测分析 300 万字小说时，取到的 8 段来自最先返回的两三个块
  //（styleProfile[0] 是「第29~42章」而不是第 1 章），只覆盖全书约 0.08% 的正文，
  // 却要拿去定义整本书的文风、并指导每一轮对话的抛光。
  //
  // 改为先按章节号排序，再等距抽样，让样本横跨全书。
  const ordered = (kb.styleProfile || [])
    .filter(s => Array.isArray(s.samples) && s.samples.some(Boolean))
    .sort((a, b) => (a.chapterRange?.[0] ?? 0) - (b.chapterRange?.[0] ?? 0));

  const picked: Array<{ text: string; chapter: number }> = [];
  if (ordered.length > 0) {
    const step = Math.max(1, Math.floor(ordered.length / SAMPLE_COUNT));
    for (let i = 0; i < ordered.length && picked.length < SAMPLE_COUNT; i += step) {
      const text = ordered[i].samples.find(Boolean);
      if (text) picked.push({ text, chapter: ordered[i].chapterRange?.[0] ?? 0 });
    }
    // 等距抽样受步长取整影响可能少取一两段，从尾部补足
    for (let i = ordered.length - 1; i >= 0 && picked.length < SAMPLE_COUNT; i--) {
      const text = ordered[i].samples.find(Boolean);
      if (text && !picked.some(p => p.text === text)) {
        picked.push({ text, chapter: ordered[i].chapterRange?.[0] ?? 0 });
      }
    }
  }

  if (picked.length < 2) {
    console.warn('[STYLE] not enough samples: ' + picked.length + ' styleProfile=' + (kb.styleProfile?.length || 0));
    return '';
  }

  console.log('[STYLE] analyzing ' + picked.length + ' samples from chapters ' +
    picked.map(p => p.chapter + 1).join(','));
  const sampleText = picked
    .map((p, i) => '[sample' + (i + 1) + ' 第' + (p.chapter + 1) + '章]\n' + p.text.slice(0, SAMPLE_CHARS))
    .join('\n\n');

  try {
    const prompt = [
      { role: 'system' as const, content: '你是写作风格分析师。从以下小说片段中提取具体的、可操作的风格特征。不要泛泛而谈，要能指导另一个AI精准模仿。\n\n输出格式（纯文本，不要JSON）：\n\n平均句长：X字左右（短/中/长）\n节奏特点：（如：排比密集/短句连击/长短交替/流水句）\n标点习惯：（如：爱用分号连接从句/省略号控制呼吸/破折号插叙/极少用引号）\n叙事距离：（如：紧贴角色内心/远距离白描/随时切换/全知视角）\n感官密度：（如：每段必有一个触觉或听觉/视觉为主/极少感官描写）\n对话比例：（如：对话占70%/大量内心独白/纯叙事极少对话）\n修辞习惯：（如：爱用比喻尤其食物比喻/拟人频繁/极少修辞/反问多）\n情绪写法：（如：直接写情绪词/通过动作透露/借景物渲染/留白不写）\n高频词汇：（列出3-8个反复出现的标志性词汇）' },
      { role: 'user' as const, content: sampleText },
    ];
    const raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      prompt,
      { maxTokens: 1000, temperature: 0.2 }
    );
    if (!raw || !raw.trim()) {
      console.warn('[STYLE] empty API response, retrying once...');
      // 重试一次
      const retry = await chatCompletionSync(
        { ...config, thinkingMode: 'disabled' },
        prompt,
        { maxTokens: 1000, temperature: 0.3 }
      );
      if (retry && retry.trim()) {
        console.log('[STYLE] retry result length: ' + retry.length);
        return retry.trim();
      }
      console.warn('[STYLE] retry also failed');
      return '';
    }
    console.log('[STYLE] result length: ' + raw.length);
    return raw.trim();
  } catch (e: any) {
    console.warn('[STYLE] exception:', e.message);
    return '';
  }
}
