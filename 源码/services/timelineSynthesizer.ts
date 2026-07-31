// ============================================================
//  时间线合成器
//  将各块提取的数据整合为全局时间线
//  支持 AI 调用工具读取章节原文验证
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { safeParseJSON } from './utils';
import { getChapter } from './novelStorage';
import type { ApiConfig, KnowledgeBase, AbilityState, RelationshipMilestoneSet, SignatureScene } from '../types';

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
  abilities?: AbilityState[];  // 能力状态时间线（无能力体系的小说为空）
  milestones?: RelationshipMilestoneSet[];  // 关系里程碑（按角色，无关系发展为空）
  scenes?: SignatureScene[];  // 名场面清单（影响全局的关键场面）
}

function buildSynthesisPrompt(kb: KnowledgeBase): string {
  // 前 50 角色 + 完整信息
  const topChars = kb.characters.slice(0, 20);
  const charSummary = topChars.map(c =>
    `${c.name}（${c.gender}，${c.role}）| ${c.traits.slice(0, 8).join('/')}` +
    ` | 出场：第${c.firstAppear+1}~${c.lastAppear+1}章`
  ).join('\n');

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

  // 能力/规则线索（各块提取，含能力变化标记）
  const ruleClues = (kb.worldRuleClues || []).slice(0, 20).join('\n');

  return `你是一位资深编辑。请基于以下小说的结构化分析数据，进行全局合成。

## 角色总览（${kb.characters.length}人）
${charSummary}

## 关系总览（含变化节点）
${relSummary}

## 逐章剧情
${plotSummary}

## 文风样本
${kb.styleProfile.map(s => `第${s.chapterRange[0]+1}~${s.chapterRange[1]+1}章：${s.samples.slice(0, 2).join(' / ')}`).join('\n')}

## 能力与规则线索（逐块提取，含能力变化标记）
${ruleClues || '（无）'}

---

## 你的任务

### 1. 世界观综合
基于角色身份、关系、场景，推断世界观：
- worldType：cultivation / modern / fantasy / historical / campus / scifi
- supernatural：**超自然能力体系的完整规则**。必须归纳能力全貌与演变规律，例如：
  - 能力是什么（如有多种能力，全部列出）
  - 能力是否变化/新增/刷新/退化（如"主角每周刷新一个新能力，旧能力退化"）
  - 能力的代价或限制
  **不要只写某一章出现的能力细节，要从能力线索和剧情中归纳出规则本身**
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
### 6. 能力状态时间线（动态规则）
根据能力线索归纳主角/重要角色的超能力状态变化。**无超能力体系的小说返回空数组 []**。

规则：
- 每个能力一条：{"name":"能力名","start":起始章节(1-based),"end":退化/失去的章节(没有则 null),"status":"active"或"degraded","details":"能力描述与限制(30字内)"}
- start 取能力首次出现的章节，end 取能力退化/消失的章节
- status：当前仍在使用=active，已退化/弱化/消失=degraded
- 若能力随剧情变化（新增/刷新/退化），必须完整列出所有阶段

### 8. 名场面
从剧情中选出 10~20 个**影响全局的关键场面**（高光/转折/名场面，如破门救人表白重大对决）。每个场面：
{"title":"场面名(10字内)","trigger":{"location":"触发地点(可空)","characters":["关键角色"],"keywords":["触发关键词(2-4字)"]},"originalPlot":"原著此处剧情走向(50字内)","chapter":参考章节(1-based)}

规则：
- 选情绪张力大、影响关系或剧情走向的场面
- trigger 用于运行时识别"当前情境接近此场面"：location 取场景名，keywords 取场面中标志性的物件/话语/情境（如"炭""头绳""表白"）
- originalPlot 描述原著此场面的走向与结果，简洁

### 7. 关系里程碑
为**重要角色**（与主角有明确关系发展的角色，2~5人）生成关系里程碑序列。里程碑是关系发展的关键节点（如：初识→获救→暧昧→表白→确定关系）。

规则：
- 每个角色一组：{"character":"角色名","milestones":[{"name":"节点名(4字内)","boundEvent":"可匹配的剧情事件描述(10字内，取自剧情)","chapter":参考章节或null}]}
- 里程碑 3~6 个，覆盖从初识到当前的关系发展
- boundEvent 必须能在剧情中找到对应（如"救下烧炭自杀的她""表白被拒"）
- 没有明确关系发展的角色不列

输出纯 JSON：
{"worldType":"","summary":"","writingStyle":"","rules":{...},"globalTimeline":[...],"characterArcs":[...],"relationEvolution":[...],"keyDecisions":[...],"abilities":[{"name":"","start":1,"end":null,"status":"active","details":""}],"milestones":[{"character":"","milestones":[{"name":"","boundEvent":"","chapter":null}]}],"scenes":[{"title":"","trigger":{"location":"","characters":[],"keywords":[]},"originalPlot":"","chapter":1}]}`;
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
  const MAX_OUT = 6000; // flash 输出稳定区间（过大反而空响应/截断）

  try {
    // 第一轮
    let raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      [
        { role: 'system', content: '你是资深编辑。基于分析数据合成全局时间线。如有疑问可输出 FETCH_CHAPTER:N 来调取原文。' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2, maxTokens: MAX_OUT }
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
        { temperature: 0.2, maxTokens: MAX_OUT }
      );
    }

    // 解析结果
    let parsed = safeParseJSON(raw);
    if (!parsed || !parsed.globalTimeline) {
      console.warn('[TIMELINE] parse failed, retrying with compact prompt...');
      // 重试：用精简 prompt（截断角色/事件，降低输出量，避免超长截断）
      try {
        const compactPrompt = buildCompactPrompt(kb);
        const raw2 = await chatCompletionSync(
          { ...config, thinkingMode: 'disabled' },
          [
            { role: 'system', content: '你是资深编辑。基于分析数据合成全局时间线。直接输出 JSON，不要 markdown 代码块。' },
            { role: 'user', content: compactPrompt },
          ],
          { temperature: 0.2, maxTokens: MAX_OUT }
        );
        parsed = safeParseJSON(raw2);
        if (parsed && parsed.globalTimeline) {
          console.log('[TIMELINE] compact retry succeeded');
          return parsed as SynthesisResult;
        }
      } catch (e: any) {
        console.warn('[TIMELINE] compact retry failed:', e.message);
      }
      console.warn('[TIMELINE] parse failed: raw preview=' + (raw || '').slice(0, 200));
      return null;
    }
    return parsed as SynthesisResult;
  } catch (e: any) {
    console.warn('[TIMELINE] exception:', e.message);
    return null;
  }
}

/**
 * 精简版合成 prompt：截断角色/事件/线索，控制输出量
 */
function buildCompactPrompt(kb: KnowledgeBase): string {
  const topChars = kb.characters.slice(0, 15);
  const charSummary = topChars.map(c => `${c.name}（${c.gender}，${c.role}）| ${c.traits.slice(0, 5).join('/')}`).join('\n');
  const plotSummary = kb.plot.slice(0, 60).map(p => `第${p.chapter+1}章：${p.summary}`).join('\n');
  const ruleClues = (kb.worldRuleClues || []).slice(0, 20).join('\n');

  return `你是资深编辑。基于以下分析数据合成世界观规则和全局时间线。直接输出 JSON（不要 markdown 代码块）：

## 角色（前15）
${charSummary}

## 逐章剧情
${plotSummary}

## 能力与规则线索
${ruleClues || '（无）'}

输出格式：
{
  "worldType": "cultivation/modern/fantasy/historical/campus/scifi",
  "summary": "200字概括",
  "writingStyle": "写作风格",
  "rules": {"supernatural": "超自然能力体系的完整规则（含能力变化规律，如每周刷新/旧能力退化）", "society": "社会结构", "culture": "文化", "sexualNorms": "性观念"},
  "globalTimeline": [{"chapter":1,"time":"","event":"事件","involvedCharacters":[],"significance":"主线|支线|日常"}],
  "characterArcs": [],
  "relationEvolution": [],
  "keyDecisions": [],
  "abilities": [{"name":"能力名","start":1,"end":null,"status":"active","details":"描述"}],
  "milestones": [{"character":"角色名","milestones":[{"name":"节点名","boundEvent":"事件","chapter":null}]}],
  "scenes": [{"title":"场面名","trigger":{"location":"","characters":[],"keywords":[]},"originalPlot":"走向","chapter":1}]
}`;
}

/**
 * 将合成结果合并回知识库
 */
export function applySynthesis(kb: KnowledgeBase, synth: SynthesisResult): KnowledgeBase {
  // AI 可能返回非字符串（对象/数组），只接受非空字符串，否则保留原值
  const safeRule = (v: any, fallback: string): string =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;

  return {
    ...kb,
    worldSettings: {
      ...kb.worldSettings,
      supernatural: safeRule(synth.rules?.supernatural, kb.worldSettings.supernatural),
      society: safeRule(synth.rules?.society, kb.worldSettings.society),
      culture: safeRule(synth.rules?.culture, kb.worldSettings.culture),
      sexualNorms: safeRule(synth.rules?.sexualNorms, kb.worldSettings.sexualNorms),
      // 保存 AI 判定的世界观类型（重载时恢复用）
      ...(typeof synth.worldType === 'string' && synth.worldType ? { worldType: synth.worldType } : {}),
      // 名场面清单（合成阶段生成）
      ...(Array.isArray(synth.scenes) && synth.scenes.length > 0
        ? { scenes: synth.scenes
            .filter((s: any) => s && typeof s.title === 'string' && s.title)
            .map((s: any) => ({
              title: String(s.title).slice(0, 20),
              trigger: {
                location: typeof s.trigger?.location === 'string' ? s.trigger.location.slice(0, 20) : undefined,
                characters: Array.isArray(s.trigger?.characters) ? s.trigger.characters.filter((c: any) => typeof c === 'string').map((c: string) => c.slice(0, 10)).slice(0, 5) : [],
                keywords: Array.isArray(s.trigger?.keywords) ? s.trigger.keywords.filter((k: any) => typeof k === 'string').map((k: string) => k.slice(0, 8)).slice(0, 5) : [],
              },
              originalPlot: typeof s.originalPlot === 'string' ? s.originalPlot.slice(0, 100) : '',
              chapter: Number(s.chapter) || 1,
            })) }
        : {}),
      // 关系里程碑（合成阶段生成）
      ...(Array.isArray(synth.milestones) && synth.milestones.length > 0
        ? { milestones: synth.milestones
            .filter((s: any) => s && typeof s.character === 'string' && s.character)
            .map((s: any) => ({
              character: String(s.character).slice(0, 20),
              milestones: Array.isArray(s.milestones)
                ? s.milestones
                    .filter((m: any) => m && typeof m.name === 'string' && m.name)
                    .map((m: any) => ({
                      name: String(m.name).slice(0, 10),
                      boundEvent: typeof m.boundEvent === 'string' ? m.boundEvent.slice(0, 20) : '',
                      chapter: m.chapter != null ? Number(m.chapter) : null,
                    }))
                : [],
            })) }
        : {}),
      // 伏笔清单（分析阶段聚合，写入 worldSettings 以便持久化）
      ...(Array.isArray((kb as any).foreshadows) && (kb as any).foreshadows.length > 0
        ? { foreshadows: (kb as any).foreshadows }
        : {}),
      // 能力状态时间线（动态规则系统）
      ...(Array.isArray(synth.abilities) && synth.abilities.length > 0
        ? { abilities: synth.abilities
            .filter(a => a && typeof a.name === 'string' && a.name)
            .map(a => ({
              name: String(a.name).slice(0, 20),
              start: Number(a.start) || 1,
              end: a.end != null ? Number(a.end) : null,
              status: a.status === 'degraded' ? 'degraded' as const : 'active' as const,
              details: typeof a.details === 'string' ? a.details.slice(0, 100) : '',
            })) }
        : {}),
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
