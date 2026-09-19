// ============================================================
//  发送管线 — 阶段 7: 响应后处理
//
//  两个改动（阶段六）：
//
//  1. 修 bug：原先先抛光、再用 `displayText = raw.replace(META...)` 重置，
//     只要 AI 输出了 ___META___，抛光结果就被整段丢弃（白花一次 API 调用）。
//     正确顺序是「先剥离 META，再抛光」。
//
//  2. 抛光不再阻塞正文显示：原实现是 await polishText，用户在流式正文
//     读完之后还要空等一次完整调用的时间。改为返回原文 + 后台抛光 Promise，
//     调用方先渲染、抛光完成后再替换。
// ============================================================

import { polishText } from '../../api/deepseek';
import { withTag } from '../trace';
import { OPTIONS_MARKER } from '../../prompts/modules/options';
import { PROSE_MARKER } from '../../prompts/modules/reasoning';
import type { WorldSession } from '../../types';
import type { ApiConfig } from '../../types';

export interface PostProcessResult {
  /** 立即可渲染的正文（已剥离 ___META___，但尚未抛光） */
  displayText: string;
  /**
   * 模型在 <思考> 里写的过程（若启用了 reasoning 模块）。
   * 不渲染给玩家，但保留下来供观测台审查——思考质量直接决定正文质量。
   */
  thinking?: string;
  /** 行动选项（单侧标记之后的全部内容）。仍留在 displayText 里给玩家看，这里单独存一份供审查。 */
  options?: string;
  newNpcs?: Array<{ name: string; role: string; personality: string; currentStatus: string; goal: string }>;
  /** 场景转变（AI 通过 ___META___ {"scene":"..."} 上报） */
  scene?: string;
  /**
   * 后台抛光 Promise。为 null 表示无需抛光（非模式 / 关闭 / 无风格样本）。
   * resolve 出抛光后的文本；失败或结果不可信时 resolve 回原文。
   */
  polished: Promise<string> | null;
}

/**
 * 去除**相邻的整句复读**。
 *
 * 实测症状（真实会话原文）：
 *   扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。
 *   你知道她在等你把话说完。你知道她为什么没跑。
 *   （空行）你知道她在等你把话说完。你知道她为什么没跑。
 *
 * 成因有两层：提示词第 2 条写了「可以有重复」（本意是口语里的词），
 * 模型理解成允许复制句子；而第 3 条又明令禁止「你知道……知道……」排比，
 * 自相矛盾。提示词已收紧，但提示词管不住模型，这里再加一层确定性兜底。
 *
 * 只删「与前面刚出现过的内容完全相同」的句子/短行，不做模糊匹配，
 * 避免误伤正常的排比修辞（如「你不说。你不承认。你不面对。」各句不同，不受影响）。
 */
export function dedupeRepeats(text: string): string {
  if (!text) return text;
  const paragraphs = text.split(/\n{2,}/);
  const out: string[] = [];

  for (const para of paragraphs) {
    const lines = para.split('\n');
    const kept: string[] = [];
    const seenInPara = new Set<string>();

    for (const line of lines) {
      const key = line.trim();
      // 短行（台词标签、空行）不参与去重判断
      if (key.length < 8) { kept.push(line); continue; }
      // 段落内完全相同的整行 → 丢弃
      if (seenInPara.has(key)) continue;
      seenInPara.add(key);
      kept.push(line);
    }

    // 段落级：与「上一个段落」完全相同则丢弃（整段复读）。
    // 加长度门槛：极短段落（如单独一行台词 "好。"）可能是两个角色分别说的，
    // 属于合法内容；只有较长段落的整段复读才是模型复读。
    const rebuilt = kept.join('\n');
    const prev = out.length > 0 ? out[out.length - 1] : '';
    if (rebuilt.trim().length >= 12 && rebuilt.trim() === prev.trim()) continue;

    out.push(rebuilt);
  }

  let result = out.join('\n\n');

  // 句级：检测「同一组句子紧邻重复」。
  // 真实案例是 A。B。A。B。（重复单元是 2 句，不是 1 句），
  // 单句反向引用抓不到，所以要枚举单元长度 1~3 逐个比对。
  // 逐行处理，避免把换行/分段结构吃掉。
  result = result
    .split('\n')
    .map(line => collapseSentenceCycles(line))
    .join('\n');

  // 跨段整句去重：同一句完整句子在**本条消息内**再次出现时删掉后来那次。
  // 实测案例（428 字的回复里）：
  //   [段0] …她的呼吸变得很急，却不敢喘气。
  //   [段6] …她的呼吸变得很急，却不敢喘气。她的眼睛盯着你…
  // 两句隔了 5 个段落，相邻段落比较抓不到。
  // 只处理「完全相同的完整句」且长度 ≥10 字，正常复沓/呼应不受影响。
  result = dedupeSentencesAcrossParagraphs(result);

  return result;
}

/**
 * 消掉**同一行内紧邻重复的文字块**。
 *
 * 真实案例（线上 chat.jsonl 原文）：
 *   "说得很慢。眼神扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。
 *    扫过你手里攥着的十块钱。扫过你嘴角挂着的笑。"
 * 注意重复的边界**不在句子边界上**：第一份是 "眼神扫过…笑。"，
 * 第二份是 "扫过…笑。"（少了 "眼神"）。所以按句子切分再比较永远匹配不上，
 * 必须退到**字符级**找「紧邻重复的子串」。
 *
 * 算法：对每个起点 i，取长度 L 的窗口 S；若 S 紧接着又出现一次
 *（即 line[i+L .. i+2L) === S），则删掉后面那份，重复直到不再命中。
 * 只处理「完全相同」的紧邻重复，且要求 L ≥ 8 字以防误伤正常修辞。
 */
function collapseSentenceCycles(line: string): string {
  if (line.length < 16) return line;

  const MIN = 8;           // 最短重复块，避免误删短排比
  const MAX = 200;         // 最短重复块上限，防止长距离误判
  let out = line;
  let changed = true;
  let guard = 0;

  while (changed && guard++ < 20) {
    changed = false;
    // 从长到短找，优先删掉更大的重复块
    for (let len = MAX; len >= MIN && !changed; len--) {
      for (let i = 0; i + len * 2 <= out.length; i++) {
        const s = out.slice(i, i + len);
        if (out.slice(i + len, i + len * 2) !== s) continue;
        // 命中紧邻重复：保留一份，吞掉后续所有相同块
        let end = i + len * 2;
        while (out.slice(end, end + len) === s) end += len;
        out = out.slice(0, i + len) + out.slice(end);
        changed = true;
        break;
      }
    }
  }

  return out;
}

/**
 * 跨段落删除**完全相同的整句**重复（保留首次出现）。
 *
 * 与 collapseSentenceCycles 的区别：后者只管同一行内紧邻的重复；
 * 这里管「隔了几个段落又原样说了一遍」的情况。
 * 只比较完全相同、且长度 ≥10 字的完整句子；
 * 短句与不完整片段一律放过，避免误伤正常修辞。
 */
function dedupeSentencesAcrossParagraphs(text: string): string {
  const seen = new Set<string>();
  // 按行处理，保留原有换行/分段结构
  return text
    .split('\n')
    .map(line => {
      if (line.trim().length < 10) return line;
      // 把一行拆成句子（保留标点），逐句判断
      const parts = line.match(/[^。！？]*[。！？]|[^。！？]+/g);
      if (!parts) return line;
      const kept = parts.filter(p => {
        const s = p.trim();
        if (s.length < 10) return true;          // 短句放过
        if (!/[。！？]$/.test(s)) return true;   // 不完整片段放过
        if (seen.has(s)) return false;           // 之前出现过 → 丢弃
        seen.add(s);
        return true;
      });
      return kept.join('');
    })
    .join('\n');
}

export function postProcessResponse(
  raw: string,
  session: WorldSession,
  cfg: ApiConfig,
  chapterCtx: any
): PostProcessResult {
  console.log('[PIPELINE] stage7 postProcess start rawLen=' + raw.length);

  // ── 先剥离 ___META___ ──
  // 注意顺序：必须在抛光之前。原实现先 await polishText，随后又用
  // `displayText = raw.replace(...)` 把它覆盖掉，等于抛光白做。
  //
  // 剥离分两步：先按「标记到文末」整段砍掉（无论 JSON 是否合法），
  // 再尝试解析其中的 JSON。JSON 坏掉时只丢弃标记，绝不让 ___META___
  // 出现在用户看到的正文里。
  let body = raw;

  // ── 先摘出 <思考> 块 ──
  // reasoning 模块要求模型先想再写。思考过程绝不能渲染给玩家，
  // 但也不能直接丢掉——它决定了正文质量，观测台要看。
  // 放在最前面处理：思考里的内容可能包含 ___META___ 字样，先摘掉免得被后面误判。
  let thinking: string | undefined;
  const thinkOpen = body.indexOf('<思考>');
  if (thinkOpen >= 0) {
    const rest = body.slice(thinkOpen + '<思考>'.length);
    const proseMark = rest.indexOf(PROSE_MARKER);
    const closeTag = rest.indexOf('</思考>');
    // 优先认单侧分隔符（实测出现率远高于闭合标签），其次兼容旧的 </思考>
    let cut = -1;
    let cutLen = 0;
    if (proseMark >= 0 && (closeTag < 0 || proseMark < closeTag)) {
      cut = proseMark; cutLen = PROSE_MARKER.length;
    } else if (closeTag >= 0) {
      cut = closeTag; cutLen = '</思考>'.length;
    }
    if (cut >= 0) {
      thinking = rest.slice(0, cut).trim().slice(0, 4000);
      body = rest.slice(cut + cutLen).trim();
    } else {
      // 两个标记都没有 → 丢弃到第一个正文块标记【为止，别把半截思考当正文
      thinking = rest.trim().slice(0, 4000);
      const i = rest.indexOf('【');
      body = i >= 0 ? rest.slice(i).trim() : '';
    }
  }

  // 行动选项：单侧标记，标记之后到文末都是选项。
  // 从 displayText 里**摘掉** —— UI 会把它们单独渲染成可点击的按钮，
  // 留在正文里会重复显示。原始文本另存一份供观测台审查。
  let options: string | undefined;
  const optIdx = body.indexOf(OPTIONS_MARKER);
  if (optIdx >= 0) {
    options = body.slice(optIdx + OPTIONS_MARKER.length).trim();
    body = body.slice(0, optIdx).trim();
  }

  const metaIdx = body.search(/___META___/);
  const newNpcs: NonNullable<PostProcessResult['newNpcs']> = [];
  let scene: string | undefined;

  if (metaIdx >= 0) {
    // 注意：索引基于 body（已剥掉 <思考>），不能再拿 raw 去切。
    // 且必须先取出 jsonPart 再截断 body —— 反过来会把 JSON 一起截掉。
    const jsonPart = body.slice(metaIdx).replace(/^___META___\s*/, '');
    body = body.slice(0, metaIdx).trim();
    const objMatch = jsonPart.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const meta = JSON.parse(objMatch[0]);
        if (typeof meta.scene === 'string' && meta.scene.trim()) {
          scene = meta.scene.trim().slice(0, 40);
        }
        if (meta.newCharacter && typeof meta.newCharacter === 'string') {
          const name = meta.newCharacter;
          const inScene = session.selectedCharacters.some(c => c.name === name)
            || (session.npcs || []).some(n => n.name === name);
          if (!inScene) {
            const worldChars = (session.world as any)?.characters || [];
            const wc = worldChars.find((wc: any) => wc.name === name);
            newNpcs.push(wc
              ? { name: wc.name, role: wc.relationship?.status || '原著角色', personality: (wc.personality?.traits || ['未知']).join('/'), currentStatus: '刚刚进入场景', goal: '' }
              : { name, role: '原著角色', personality: '未知', currentStatus: '刚刚进入场景', goal: '' }
            );
          }
        }
      } catch { /* JSON 损坏：标记已剥离，正文照常用 */ }
    }
  }

  // ── 场景上报的第二种形态：行尾 [场景: xxx] ──
  // 实测（观测台两次真实游玩）：提示词要求用 ___META___{"scene":"..."}，
  // 但模型经常改用行尾标记——「[场景: 圣魂村村口土路，晨雾渐散…]」。
  // 上面那段只认 ___META___，于是这个标记**原样进了玩家看到的正文**，
  // 同时场景上报丢失（下一轮 router 的 sceneHint 变空，表现为场景粘滞）。
  // 这里作为兜底：只在**正文末尾**匹配，避免误伤正文里正常出现的方括号。
  if (!scene) {
    const sceneTail = body.match(/[\s　]*[\[【]\s*场景\s*[:：]\s*([^\]】\n]{1,60}?)\s*[\]】][\s　]*$/);
    if (sceneTail) {
      scene = sceneTail[1].trim().slice(0, 40);
      body = body.slice(0, body.length - sceneTail[0].length).trim();
      console.log('[PIPELINE] stage7 scene from tail marker: ' + scene);
    }
  }

  // ── 去复读（确定性兜底）──
  const deduped = dedupeRepeats(body);
  if (deduped !== body) {
    console.log('[PIPELINE] stage7 dedupe removed ' + (body.length - deduped.length) + ' chars of repetition');
  }
  body = deduped;

  // ── 抛光：不阻塞渲染 ──
  let polished: Promise<string> | null = null;
  if (session.worldNovelId && cfg.autoPolish !== false) {
    // 优先用 AI 分析出的结构化风格特征（句长/节奏/标点/修辞…），
    // writingStyle 只是一堆原文样本的拼接，塞进 {{styleFeatures}}
    // 会把提示词挤满原文而给不出任何可执行的风格指引。
    const styleFeatures = session.world?.styleFeatures || '';
    const styleFallback = session.world?.writingStyle || '';
    const chapterSample = chapterCtx?.chapterText || '';
    if (styleFeatures || styleFallback || chapterSample) {
      polished = withTag('polish', () => polishText(cfg, body, {
        styleFeatures: styleFeatures || styleFallback,
        chapterSample,
      }))
        .catch(() => { console.warn('[sendPipeline] polish failed'); return body; });
    }
  }

  return {
    displayText: body,
    thinking,
    options,
    newNpcs: newNpcs.length > 0 ? newNpcs : undefined,
    scene,
    polished,
  };
}
