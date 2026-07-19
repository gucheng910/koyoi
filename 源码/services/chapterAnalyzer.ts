// ============================================================
//  逐块分析器
//  每块调用 AI 提取角色/事件/关系/地点/文风
//  输出标注章节来源，供知识库合并
// ============================================================

import { chatCompletionSync } from '../api/deepseek';
import { safeParseJSON } from './utils';
import * as FileSystem from 'expo-file-system/legacy';
import { getNovelDir, getChapter } from './novelStorage';
import type { ApiConfig, ChapterAnalyzeResult } from '../types';
import type { AnalysisChunk } from './chunkAssembler';

const ANALYZE_SYSTEM_SIMPLE = `你是小说分析引擎。从以下小说片段中提取角色、事件、文风。直接返回JSON，不要任何解释文字。`;

function buildSimplePrompt(chunk: AnalysisChunk, chunkText: string): string {
  return `分析第${chunk.chapterStart+1}~${chunk.chapterEnd+1}章。提取角色（真实名字）、事件、文风段落。\n\n只返回JSON（注意"name"要填角色的真实名字，不要填"角色名"三个字）：\n{\n  "characters": [{"name":"这里填角色真实名字","gender":"男/女/未知","role":"身份","traits":["性格词"],"dialogue":["原文台词"]}],\n  "events": [{"chapter":${chunk.chapterStart+1},"event":"发生了什么"}],\n  "styleSamples": ["原文段落"]\n}\n\n小说片段：\n${chunkText.slice(0, 28000)}`;
}

const ANALYZE_SYSTEM = `你是小说分析引擎。你的任务是逐块提取小说信息，为后续全局合成提供原材料。

核心原则：
1. 每个角色/事件/关系都要标注来源章节号
2. 关系是动态的——注意暧昧→恋爱→分手的变化，标注变化节点
3. 角色说话方式必须引用原文原句，不要改写
4. 地点名保持原文称呼
5. 文风样本直接从原文截取完整段落

输出 JSON 格式（不要省略任何角色）：`;

/**
 * 构建单块分析提示词
 */
function buildAnalyzePrompt(chunk: AnalysisChunk, chunkText: string): string {
  const chapterRange = chunk.chapterStart === chunk.chapterEnd
    ? `第${chunk.chapterStart + 1}章`
    : `第${chunk.chapterStart + 1}~${chunk.chapterEnd + 1}章`;

  return `分析以下小说片段（${chapterRange}）。

提取以下信息，每项标注章节号（当前块内的章节号，从第${chunk.chapterStart + 1}章开始）：

### 角色
每人一行，格式（注意第一列是角色名字，不是"角色名"这三个字）：
\`\`\`
角色名|别名(逗号分隔)|性别|身份/职业|表面性格|深层性格|习惯动作|说话方式
  - 台词原文："具体原句"（第X章）
  - 防御机制：如"用冷漠保护自己"
  - 矛盾点：如"表面大大咧咧内心敏感"
  - 状态变化：第X章 从[旧]→[新]
  - 标志性场景：第X章 场景简述
  出场：第X~Y章
\`\`\`

示例（请注意第一列是真实角色名字，不要输出"角色名"这三个字作为名字）：
\`\`\`
李寻欢|小李探花,李探花|男|江湖浪子|忧郁,深情,嗜酒|自我毁灭倾向,逃避真心|轻抚刀鞘,沉默良久|简短克制,爱用反问
  - 台词原文："我不杀你，只因你是你爹的妹妹。"（第3章）
  - 防御机制：用酒精麻痹自己，回避所有亲密关系
  - 矛盾点：明明有能力却放任自己被误解，渴望被原谅又不敢开口
  出场：第1~8章
\`\`\`

### 事件
按时间顺序，格式：
\`\`\`
第X章：发生了什么（30字以内）
第Y章：发生了什么
\`\`\`

### 关系
格式：
\`\`\`
角色A ↔ 角色B：关系类型
  起始：第X章 描述
  变化：第Y章 从[旧状态] → [新状态]（证据：原文引用）
\`\`\`
注意暧昧→恋爱、朋友→敌人等动态变化。

### 地点
格式：
\`\`\`
地点名：描述（出现：第X,Y,Z章）
\`\`\`

### 文风
截取 2~4 个典型段落原文（每段 200~500 字，足够长才能看出句长和节奏），标注章节号：
\`\`\`
第X章："原文段落..."
第Y章："原文段落..."
\`\`\`

最终用 JSON 包裹所有结果：
{
  "chapterRange": [${chunk.chapterStart + 1}, ${chunk.chapterEnd + 1}],
  "rawCharacters": "上述角色部分的完整文本",
  "rawEvents": "上述事件部分的完整文本",
  "rawRelations": "上述关系部分的完整文本",
  "rawLocations": "上述地点部分的完整文本",
  "styleSamples": [{"text":"原文段落","chapter":X}, ...]
}

小说片段：
${chunkText.slice(0, 28000)}`;
}

/**
 * 宽松回退：从原始文本中提取任何可用信息
 */
function fallbackParse(raw: string, chunk: AnalysisChunk): ChapterAnalyzeResult | null {
  const ch = chunk.chapterStart;
  const characters: ChapterAnalyzeResult['characters'] = [];
  const events: ChapterAnalyzeResult['events'] = [];

  // 尝试匹配任何看起来像"名|..."的行
  const lines = raw.split('\n');
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 2 && parts[0].length >= 1 && parts[0].length <= 10 && !/[{}\[\]"']/.test(parts[0]) && parts[0] !== '名' && parts[0] !== '角色名' && parts[0] !== '角色名字') {
      characters.push({
        name: parts[0].trim(),
        aliases: parts[1] ? parts[1].split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
        gender: parts[2]?.trim() || '未知',
        role: parts[3]?.trim() || '',
        traits: parts[4] ? parts[4].split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
        deepTraits: [], defenseMechanism: '', contradictions: '',
        signatureScenes: [], statusChanges: [],
        habits: [],
        speechStyle: parts[5]?.trim() || '',
        speechSamples: [],
        firstAppear: ch,
        lastAppear: ch,
      });
    }
  }

  // 尝试匹配 "第X章：..." 格式
  const eventMatches = raw.matchAll(/第(\d+)章[：:](.+)/g);
  for (const m of eventMatches) {
    events.push({ chapter: parseInt(m[1]) - 1, time: '', event: m[2].trim().slice(0,60) });
  }

  if (characters.length === 0 && events.length === 0) return null;

  return {
    chapterRange: [chunk.chapterStart, chunk.chapterEnd],
    characters,
    events,
    relations: [],
    locations: [],
    styleSamples: [],
  };
}

/**
 * 解析 AI 返回的原始分析结果
 */
function parseAnalysis(
  raw: string,
  chunk: AnalysisChunk
): ChapterAnalyzeResult | null {
  try {
    const parsed = safeParseJSON(raw);
    if (!parsed) {
      // 宽松回退：尝试从原始文本中提取任何可用的角色名
      return fallbackParse(raw, chunk);
    }

    const chapterStart = chunk.chapterStart;

    // 解析角色
    const characters: ChapterAnalyzeResult['characters'] = [];
    if (parsed.rawCharacters) {
      const charBlocks = parsed.rawCharacters.split(/\n(?=[^\s\-])/);
      for (const block of charBlocks) {
        const lines = block.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;
        const header = lines[0].split('|');
        if (header.length < 3) continue;
        // 跳过 AI 误输出的格式头
        const rawName = header[0].trim();
        if (rawName === '名' || rawName === '角色名' || rawName === '角色名字' || rawName.includes('姓名') || rawName.length === 0) continue;

        const speechSamples: Array<{ quote: string; chapter: number }> = [];
        const signatureScenes: Array<{ chapter: number; description: string }> = [];
        const statusChanges: Array<{ chapter: number; from: string; to: string }> = [];
        let defenseMechanism = '';
        let contradictions = '';
        let firstAppear = chunk.chapterEnd + 1;
        let lastAppear = chunk.chapterStart;

        for (const line of lines.slice(1)) {
          // 防御机制
          const defMatch = line.match(/防御机制[：:]\s*(.+)/);
          if (defMatch) { defenseMechanism = defMatch[1].trim(); continue; }
          // 矛盾点
          const conMatch = line.match(/矛盾点[：:]\s*(.+)/);
          if (conMatch) { contradictions = conMatch[1].trim(); continue; }
          // 状态变化
          const stMatch = line.match(/状态变化[：:]\s*第(\d+)章\s*从\s*(.+?)\s*[→]\s*(.+)/);
          if (stMatch) { statusChanges.push({ chapter: parseInt(stMatch[1]) - 1, from: stMatch[2].trim(), to: stMatch[3].trim() }); continue; }
          // 标志性场景
          const sigMatch = line.match(/标志性场景[：:]\s*第(\d+)章\s*(.+)/);
          if (sigMatch) { signatureScenes.push({ chapter: parseInt(sigMatch[1]) - 1, description: sigMatch[2].trim() }); continue; }
          // 台词
          const qMatch = line.match(/["「]([^"」]+)["」]\s*[(（]第(\d+)章[)）]/);
          if (qMatch) {
            const chNum = parseInt(qMatch[2]) - 1;
            speechSamples.push({ quote: qMatch[1], chapter: chNum });
            if (chNum < firstAppear) firstAppear = chNum;
            if (chNum > lastAppear) lastAppear = chNum;
            continue;
          }
          // 出场范围
          const appearMatch = line.match(/出场[：:]\s*第(\d+)\s*[~～]\s*第(\d+)章/);
          if (appearMatch) {
            firstAppear = Math.min(firstAppear, parseInt(appearMatch[1]) - 1);
            lastAppear = Math.max(lastAppear, parseInt(appearMatch[2]) - 1);
          }
        }

        // header: 名|别名|性别|身份|表面性格|深层性格|习惯|说话方式
        characters.push({
          name: header[0].trim(),
          aliases: header[1] ? header[1].split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
          gender: header[2]?.trim() || '未知',
          role: header[3]?.trim() || '',
          traits: header[4] ? header[4].split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
          deepTraits: header[5] ? header[5].split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
          defenseMechanism,
          contradictions,
          signatureScenes,
          statusChanges: statusChanges as any,
          habits: header[6] ? header[6].split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
          speechStyle: header[7]?.trim() || '',
          speechSamples,
          firstAppear: firstAppear <= chunk.chapterEnd ? firstAppear : chapterStart,
          lastAppear: lastAppear >= chunk.chapterStart ? lastAppear : chunk.chapterEnd - 1,
        });
      }
    }

    // 解析关系
    const relations: ChapterAnalyzeResult['relations'] = [];
    if (parsed.rawRelations) {
      const relBlocks = parsed.rawRelations.split(/\n(?=[^\s\-])/);
      for (const block of relBlocks) {
        const lines = block.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;
        const hMatch = lines[0].match(/^(.+?)\s*[↔→]\s*(.+?)[：:](.+)/);
        if (!hMatch) continue;

        const changes: Array<{ chapter: number; from: string; to: string; evidence: string }> = [];
        for (const line of lines.slice(1)) {
          const cMatch = line.match(/变化[：:]\s*第(\d+)章\s*从[「"\[]?(.+?)[」"\]]?\s*[→]\s*[「"\[]?(.+?)[」"\]]?[(（]证据[：:](.+?)[)）]/);
          if (cMatch) {
            changes.push({
              chapter: parseInt(cMatch[1]) - 1,
              from: cMatch[2],
              to: cMatch[3],
              evidence: cMatch[4].trim(),
            });
          }
        }

        relations.push({
          from: hMatch[1].trim(),
          to: hMatch[2].trim(),
          type: hMatch[3].trim(),
          startChapter: chapterStart,
          changes,
        });
      }
    }

    // 解析事件
    const events: ChapterAnalyzeResult['events'] = [];
    if (parsed.rawEvents) {
      const eventLines = parsed.rawEvents.split('\n').filter(Boolean);
      for (const line of eventLines) {
        const m = line.match(/第(\d+)章[：:](.+)/);
        if (m) {
          events.push({ chapter: parseInt(m[1]) - 1, time: '', event: m[2].trim() });
        }
      }
    }

    // 解析地点
    const locations: ChapterAnalyzeResult['locations'] = [];
    if (parsed.rawLocations) {
      const locLines = parsed.rawLocations.split('\n').filter(Boolean);
      for (const line of locLines) {
        const m = line.match(/^(.+?)[：:](.+?)[(（]出现[：:](.+?)[)）]/);
        if (m) {
          const chNums = m[3].match(/\d+/g)?.map(Number) || [chapterStart + 1];
          locations.push({
            name: m[1].trim(),
            description: m[2].trim(),
            chapters: chNums.map((n: number) => n - 1),
          });
        }
      }
    }

    // 文风样本
    const styleSamples = (parsed.styleSamples || []).map((s: any) => ({
      text: typeof s === 'string' ? s : s.text || '',
      chapter: typeof s === 'object' ? (s.chapter || chapterStart + 1) - 1 : chapterStart,
    }));

    return {
      chapterRange: [chunk.chapterStart, chunk.chapterEnd],
      characters,
      events,
      relations,
      locations,
      styleSamples: styleSamples.filter((s: any) => s.text.length > 10),
    };
  } catch {
    return null;
  }
}

/**
 * 分析单个块
 */
export async function analyzeChunk(
  config: ApiConfig,
  worldId: string,
  chunk: AnalysisChunk
): Promise<ChapterAnalyzeResult | null> {
  // 按需逐章读取
  const texts: string[] = [];
  for (let ch = chunk.chapterStart; ch <= chunk.chapterEnd; ch++) {
    try {
      const t = await getChapter(worldId, ch);
      if (t) texts.push(t);
    } catch {}
  }
  const chunkText = texts.join('\n\n') || '';
  if (chunkText.length < 50) return null;

  // 第一轮：标准分析
  const prompt = buildAnalyzePrompt(chunk, chunkText);
  try {
    const raw = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      [{ role: 'system', content: ANALYZE_SYSTEM }, { role: 'user', content: prompt }],
      { temperature: 0.2, maxTokens: 8192 }
    );
    const result = parseAnalysis(raw, chunk);
    if (result) return result;
  } catch {}

  // 第二轮：简化格式重试
  try {
    const simplePrompt = buildSimplePrompt(chunk, chunkText);
    const raw2 = await chatCompletionSync(
      { ...config, thinkingMode: 'disabled' },
      [{ role: 'system', content: ANALYZE_SYSTEM_SIMPLE }, { role: 'user', content: simplePrompt }],
      { temperature: 0.3, maxTokens: 8192 }
    );
    const parsed = safeParseJSON(raw2);
    if (parsed?.characters?.length > 0 || parsed?.events?.length > 0) {
      return {
        chapterRange: [chunk.chapterStart, chunk.chapterEnd],
        characters: (parsed.characters || []).map((c: any) => ({
          name: c.name || '?', aliases: c.aliases || [], gender: c.gender || '未知',
          role: c.role || '', traits: c.traits || [], habits: [],
          speechStyle: '', speechSamples: (c.dialogue || []).map((d: string) => ({ quote: d, chapter: chunk.chapterStart })),
          firstAppear: chunk.chapterStart, lastAppear: chunk.chapterEnd,
        })),
        events: (parsed.events || []).map((e: any) => ({ chapter: e.chapter || chunk.chapterStart, time: '', event: e.event || '' })),
        relations: [],
        locations: [],
        styleSamples: (parsed.styleSamples || []).filter((s: any) => typeof s === 'string' && s.length > 10).map((s: string) => ({ text: s, chapter: chunk.chapterStart })),
      };
    }
  } catch {}

  return null;
}

/**
 * 批量分析所有块（3 块并行，支持断点续传）
 */
export async function analyzeAllChunks(
  config: ApiConfig,
  worldId: string,
  chapters: { startChar: number; endChar: number }[],
  chunks: AnalysisChunk[],
  onProgress: (current: number, total: number, chunk: AnalysisChunk) => void,
  signal?: AbortSignal
): Promise<ChapterAnalyzeResult[]> {
  const results: ChapterAnalyzeResult[] = [];
  const partialPath = worldId ? getNovelDir(worldId) + 'knowledge/_partial.json' : null;
  let concurrency = 3;                 // 动态并发数
  let successStreak = 0;               // 连续成功计数
  let last429Time = 0;                 // 上次 429 的时间
  let completed = 0;

  // 断点续传：加载已完成的块
  if (partialPath) {
    try {
      const raw = await FileSystem.readAsStringAsync(partialPath);
      const partial = JSON.parse(raw);
      if (Array.isArray(partial.results) && partial.completedChunks > 0) {
        results.push(...partial.results);
        completed = partial.completedChunks;
      }
    } catch {}
  }

  // 流水线式并发：每完成一个块立即启动下一个
  const remaining = chunks.slice(completed);
  let nextIdx = 0;

  const worker = async (): Promise<void> => {
    while (nextIdx < remaining.length && !signal?.aborted) {
      const idx = nextIdx++;
      const chunk = remaining[idx];
      const globalIdx = completed + idx + 1;
      onProgress(globalIdx, chunks.length, chunk);
      try {
        const r = await analyzeChunk(config, worldId, chunk);
        if (r) results.push(r);
        // 成功：累积连续成功计数
        successStreak++;
        // 连续 15 次成功且未达上限 → 提升并发
        if (successStreak >= 15 && concurrency < 5) {
          concurrency++;
          successStreak = 0;
          // 启动一个新 worker 利用新增的并发位
          if (nextIdx < remaining.length) {
            worker(); // fire-and-forget
          }
        }
      } catch (e: any) {
        // 429 限流：降并发 + 延迟
        if (e?.message?.includes('429') || e?.message?.includes('频繁')) {
          concurrency = Math.max(1, Math.floor(concurrency / 2));
          successStreak = 0;
          // 当前块重试一次
          const delay = 3000 + Math.random() * 2000;
          await new Promise(r => setTimeout(r, delay));
          try {
            const r = await analyzeChunk(config, worldId, chunk);
            if (r) results.push(r);
          } catch { /* 重试仍失败就跳过 */ }
        }
        // 其他错误：跳过当前块，不降并发
      }
      completed++;

      // 每 15 块写一次断点
      if (partialPath && completed % 15 === 0) {
        await savePartial(partialPath, completed, chunks.length, results);
      }
    }
  };

  // 启动初始并发 worker
  const initialCount = Math.min(concurrency, remaining.length);
  const workers = Array(initialCount).fill(0).map(() => worker());
  await Promise.all(workers);

  // 最终保存
  if (partialPath) {
    await savePartial(partialPath, completed, chunks.length, results);
    try { await FileSystem.deleteAsync(partialPath, { idempotent: true }); } catch {}
  }

  return results;
}

async function savePartial(partialPath: string, completed: number, total: number, results: ChapterAnalyzeResult[]) {
  try {
    const dir = partialPath.slice(0, partialPath.lastIndexOf('/'));
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(partialPath, JSON.stringify({
      completedChunks: completed,
      totalChunks: total,
      results,
    }));
  } catch {}
}
