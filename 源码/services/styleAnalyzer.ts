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
export async function analyzeStyleFeatures(
  config: ApiConfig,
  kb: KnowledgeBase
): Promise<string> {
  const samples = kb.styleProfile
    .flatMap(s => s.samples)
    .filter(Boolean)
    .slice(0, 8);

  if (samples.length < 2) {
    console.warn('[STYLE] not enough samples: ' + samples.length + ' styleProfile=' + (kb.styleProfile?.length || 0));
    return '';
  }

  console.log('[STYLE] analyzing with ' + samples.length + ' samples');
  const sampleText = samples.map((s, i) => '[sample' + (i + 1) + ']\n' + s.slice(0, 400)).join('\n\n');

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
