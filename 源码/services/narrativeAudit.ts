// ============================================================
//  叙事自检（开发期）
//
//  为什么需要它：
//
//  这个 app 的核心主张是"世界在静默地运转"——用户不该看到机制。
//  但这带来一个副作用：**它失败的时候也静默**。
//
//  用户无法区分这两种情况：
//    「这个世界在微妙地活着」  vs  「这游戏没反应」
//
//  所以"不展示"这个产品决定，反而**加剧了对内部正确性的依赖**。
//  不能靠用户反馈发现问题——用户会以为"可能就是这样的"。
//
//  这个模块做的是**不自欺**：每轮结束后，用确定性规则检查输出里
//  有没有明显的崩坏，把结果记进 trace，在「调用诊断」里呈现。
//
//  设计原则：
//  - 只报**可判定**的问题（名单外的角色名是确定的，情绪是否"演出来"是启发式）
//  - 启发式检查标 info，确定性问题标 warn —— 不把猜测当结论
//  - 纯函数，不依赖 AI，不增加调用
// ============================================================

import type { WorldSession, EchoItem } from '../types';

export type IssueKind =
  | 'unknown-character'   // 输出里出现了名单外的角色名（凭空造人）
  | 'echo-unused'         // 注入了往事回响，但输出完全没接
  | 'mood-not-shown';     // 高强度未表达情绪，输出里看不到行为破绽（启发式）

export interface NarrativeIssue {
  kind: IssueKind;
  severity: 'warn' | 'info';
  detail: string;
}

export interface AuditInput {
  /** 本轮 AI 输出的正文（已剥离 ___META___） */
  output: string;
  session: WorldSession;
  /** 合法的角色名（选中角色 + NPC + 原著角色库） */
  knownNames: string[];
  /** 本轮注入的往事回响 */
  injectedEchoes?: EchoItem[];
  /** 本轮通过 ___META___ 正式引入的新角色（这些不算"凭空造"） */
  declaredNewChars?: string[];
  /** 情绪启发式检查的强度阈值 */
  moodThreshold?: number;
}

/** 【X】 形式的说话人标记 */
const SPEAKER_RE = /[【\[]([^】\]]{1,20})[】\]]/g;

/** 旁白类标记，不当作角色名 */
const NARRATION_MARKS = new Set(['旁白', '叙述', '场景', '背景', '其他', '众人', '群杂']);

/**
 * 从输出里抽出所有【X】标记里看起来像人名的。
 * 过滤掉明显不是名字的（含标点、过长、纯符号）。
 */
export function extractSpeakerNames(output: string): string[] {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  SPEAKER_RE.lastIndex = 0;
  while ((m = SPEAKER_RE.exec(output)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    if (NARRATION_MARKS.has(raw)) continue;
    // 名字里通常不含这些
    if (/[，。！？…、：；“”"'（）()]/.test(raw)) continue;
    if (raw.length > 8) continue;
    names.add(raw);
  }
  return [...names];
}

/** 取文本里长度 >= 3 的中文片段，用于粗判"有没有提到某件事" */
function snippets(text: string, minLen = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i + minLen <= text.length; i++) {
    const s = text.slice(i, i + minLen);
    if (/^[\u4e00-\u9fff]{3,}$/.test(s)) out.push(s);
  }
  return out;
}

/**
 * 检查输出是否"接住"了注入的回响。
 *
 * 用 3 字片段重合度做粗判——会有漏报（模型换了完全不同的措辞），
 * 所以只在**完全零重合**时判定为未使用，避免误报。
 */
export function echoWasUsed(output: string, seed: string): boolean {
  const parts = snippets(seed, 3);
  if (parts.length === 0) return true;   // 种子太短，无从判断，不算问题
  return parts.some(p => output.includes(p));
}

export function auditNarrative(input: AuditInput): NarrativeIssue[] {
  const {
    output, session, knownNames, injectedEchoes = [],
    declaredNewChars = [], moodThreshold = 6,
  } = input;

  const issues: NarrativeIssue[] = [];
  if (!output) return issues;

  // ── 1. 凭空造角色（确定性）──
  const allowed = new Set([...knownNames, ...declaredNewChars]);
  for (const name of extractSpeakerNames(output)) {
    if (!allowed.has(name)) {
      issues.push({
        kind: 'unknown-character',
        severity: 'warn',
        detail: `输出里出现了名单外的说话人「${name}」`,
      });
    }
  }

  // ── 2. 回响被完全忽略（近似确定性：零重合才算）──
  for (const e of injectedEchoes) {
    if (!echoWasUsed(output, e.seed)) {
      issues.push({
        kind: 'echo-unused',
        severity: 'info',
        detail: `注入了第 ${e.sourceRound} 轮的回响，但输出里没有任何重合：${e.seed.slice(0, 24)}…`,
      });
    }
  }

  // ── 3. 高强度未表达情绪没有外显（启发式，只报 info）──
  //
  // 说明：判定"有没有演出来"本质上需要理解语义，这里只能做很粗的检查：
  // 角色在本轮被提到，但输出里找不到任何身体/行为类的词。
  // 这是**提示**不是结论——开发者据此去翻该轮的实际文本。
  const BEHAVIOR_HINTS = /(手|指|眼|肩|喉|呼吸|声音|嘴角|脸|眉|脚|背|停|顿|别过|低|缩|攥|放|站|坐|转身|沉默|没说|没接)/;
  const onStage = new Set(session.selectedCharacters.map(c => c.name).concat((session.npcs || []).map(n => n.name)));
  for (const [name, mood] of Object.entries(session.characterMoods || {})) {
    if (mood.expressed) continue;
    if (mood.intensity < moodThreshold) continue;
    if (!onStage.has(name)) continue;            // 不在场就不该要求他表现
    if (!output.includes(name)) continue;        // 本轮根本没写到他
    if (BEHAVIOR_HINTS.test(output)) continue;   // 有行为词，大概率写了
    issues.push({
      kind: 'mood-not-shown',
      severity: 'info',
      detail: `${name} 有未表达情绪（${mood.emotion} 强度 ${mood.intensity.toFixed(1)}），但输出里看不出行为破绽`,
    });
  }

  return issues;
}

/** 汇总成一行，便于写进 trace / 诊断面板 */
export function summarizeIssues(issues: NarrativeIssue[]): string {
  if (issues.length === 0) return '';
  const warn = issues.filter(i => i.severity === 'warn').length;
  return `叙事自检：${issues.length} 项（${warn} 警告）`;
}
