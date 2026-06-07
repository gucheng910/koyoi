// ============================================================
//  时间线合成器
//  将各块提取的数据整合为全局时间线
//  支持 AI 调用工具读取章节原文验证
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { safeParseJSON } from './utils';
import { getChapter } from './novelStorage';
import type { ApiConfig, KnowledgeBase } from '../types';

interface SynthesisResult {
  worldType: string;
  summary: string;
  writingStyle: string;
  rules: {
    supernatural: string;
    society: string;
    culture: string;
    sexualNorms: string;
  };
  globalTimeline: Array<{
    chapter: number;
    time: string;
    event: string;
    involvedCharacters: string[];
    significance: string;
  }>;
  characterArcs: Array<{
    name: string;
    arc: string;
    keyChapters: number[];
  }>;
  relationEvolution: Array<{
    from: string;
    to: string;
    timeline: Array<{ chapter: number; status: string }>;
  }>;
  keyDecisions: Array<{
    who: string;
    chapter: number;
    dilemma: string;
    chose: string;
    consequence: string;
  }>;
}

function buildSynthesisPrompt(kb: KnowledgeBase): string {
  // 前 50 角色 + 完整信息
  const topChars = kb.characters.slice(0, 50);
  const charSummary = topChars.map(c =>
    `${c.name}（${c.gender}，${c.role}）| 性格：${c.traits.join('/')} | 习惯：${c.habits.join('/') || '无'} | 说话：${c.speechStyle || '未知'} | 出场：第${c.firstAppear+1}~${c.lastAppear+1}章` +
    (c.speechSamples.length > 0 ? `\n  台词：「${c.speechSamples.slice(0, 5).map(s => s.quote).join('」「')}」` : '')
  ).join('\n\n');

  const relSummary = kb.relations.map(r => {
    let s = `${r.from} ↔ ${r.to}：${r.type}（起始第${r.startChapter+1}章）`;
    for (const ch of r.changes) {
      s += `\n  第${ch.chapter+1}章：${ch.from} → ${ch.to}（${ch.evidence}）`;
    }
    return s;
  }).join('\n\n');

  const plotSummary = kb.plot.map(p =>
    `第${p.chapter+1}章：${p.summary}`
  ).join('\n');

  return `你是一位资深编辑。请基于以下小说的结构化分析数据，进行全局合成。

## 角色总览（${kb.characters.length}人）
${charSummary}

## 关系总览（含变化节点）
${relSummary}

## 逐章剧情
${plotSummary}

## 文风样本
${kb.styleProfile.map(s => `第${s.chapterRange[0]+1}~${s.chapterRange[1]+1}章：${s.samples.slice(0, 2).join(' / ')}`).join('\n')}

---

## 你的任务

### 1. 世界观综合
基于角色身份、关系、场景，推断世界观：
- worldType：cultivation / modern / fantasy / historical / campus / scifi
- supernatural：超自然规则（如"灵气体系""灵力等级划分"）
- society：社会结构（如"学院制""宗门制""现代都市"）
- culture：文化特色（如"尊卑分明""校园文化"）
- sexualNorms：性观念
- summary：200字概括全书

### 2. 全局时间线
将所有逐章事件串成完整时间线，补充时间标记（如果原文有时间信息）：
[{chapter, time, event, involvedCharacters, significance:"主线/支线/日常"}]

### 3. 角色弧线
每个主要角色从出场到结局的变化轨迹。弧线描述要具体——不是"成长了"而是"从害怕被抛弃→学会独处→最终能主动离开不对的人"。标注转折点章节号。
[{name, arc:"具体的变化轨迹描述", keyChapters:[转折点章节数组]}]

### 4. 关系演化总结
将各章的关系变化串成完整演化线：
[{from, to, timeline:[{chapter, status}]}]

### 5. 关键选择
角色做出的影响剧情走向的决定：
[{who, chapter, dilemma, chose, consequence}]

---

如果你需要验证某些信息，可以要求调取特定章节的原文。
输出纯 JSON：
{"worldType":"","summary":"","writingStyle":"","rules":{...},"globalTimeline":[...],"characterArcs":[...],"relationEvolution":[...],"keyDecisions":[...]}`;
}

/**
 * 简化版工具调用：检测 FETCH_CHAPTER 指令并返回章节内容
 */
async function handleToolRequest(
  worldId: string,
  response: string
): Promise<string | null> {
  const match = response.match(/FETCH_CHAPTER[:\s]*(\d+)/i);
  if (!match) return null;

  const chapterNum = parseInt(match[1]);
  const chapterText = await getChapter(worldId, chapterNum - 1); // 1-based → 0-based
  if (!chapterText) return `第${chapterNum}章不存在。`;

  return `## 第${chapterNum}章原文\n${chapterText.slice(0, 3000)}\n---\n请基于此继续分析。`;
}

/**
 * 合成全局时间线（支持工具调用最多 3 轮）
 */
export async function synthesizeTimeline(
  config: ApiConfig,
  worldId: string,
  kb: KnowledgeBase
): Promise<SynthesisResult | null> {
  const prompt = buildSynthesisPrompt(kb);

  try {
    // 第一轮
    let raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      [
        { role: 'system', content: '你是资深编辑。基于分析数据合成全局时间线。如有疑问可输出 FETCH_CHAPTER:N 来调取原文。' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2 }
    );

    // 工具调用循环（最多 2 轮）
    for (let round = 0; round < 2; round++) {
      const toolResult = await handleToolRequest(worldId, raw);
      if (!toolResult) break;

      raw = await chatCompletionSync(
        { ...config, thinkingMode: 'disabled' },
        [
          { role: 'system', content: '基于补充的原文继续合成。' },
          { role: 'assistant', content: raw },
          { role: 'user', content: toolResult },
        ],
        { temperature: 0.2 }
      );
    }

    // 解析结果
    const parsed = safeParseJSON(raw);
    if (!parsed || !parsed.globalTimeline) return null;
    return parsed as SynthesisResult;
  } catch {
    return null;
  }
}

/**
 * 将合成结果合并回知识库
 */
export function applySynthesis(kb: KnowledgeBase, synth: SynthesisResult): KnowledgeBase {
  return {
    ...kb,
    worldSettings: {
      ...kb.worldSettings,
      supernatural: synth.rules?.supernatural || "" || kb.worldSettings.supernatural,
      society: synth.rules?.society || "" || kb.worldSettings.society,
      culture: synth.rules?.culture || "" || kb.worldSettings.culture,
      sexualNorms: synth.rules?.sexualNorms || "" || kb.worldSettings.sexualNorms,
    },
    globalTimeline: synth.globalTimeline.map(t => ({
      chapter: t.chapter,
      time: t.time || '',
      event: t.event,
      involvedCharacters: t.involvedCharacters || [],
    })),
    characters: kb.characters.map(c => {
      const arc = synth.characterArcs?.find((a: any) => a.name === c.name);
      return arc ? { ...c, arc: { description: arc.arc, keyChapters: arc.keyChapters || [] } } : c;
    }),
    // 将 keyDecisions 注入关系数据
    relations: kb.relations.map(r => {
      const evo = synth.relationEvolution?.find((e: any) => {
        const key = [e.from, e.to].sort().join('↔');
        return [r.from, r.to].sort().join('↔') === key;
      });
      if (!evo || r.changes.length > 0) return r; // 已有变化数据的不覆盖
      return {
        ...r,
        changes: (evo.timeline || []).map((t: any) => ({
          chapter: t.chapter,
          from: '',
          to: t.status,
          evidence: '',
        })),
      };
    }),
  };
}

/**
 * 提取关键选择（供 WorldChatScreen 提示词使用）
 */
export function extractKeyDecisions(synth: SynthesisResult | null): Array<{
  who: string; dilemma: string; chose: string; consequence: string;
}> {
  if (!synth?.keyDecisions) return [];
  return synth.keyDecisions.map(d => ({
    who: d.who || '',
    dilemma: d.dilemma || '',
    chose: d.chose || '',
    consequence: d.consequence || '',
  }));
}
