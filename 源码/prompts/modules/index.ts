// ============================================================
//  提示词模块装配器
//
//  背景：koyoi 原先把 80+ 条规则平铺在 worldRules.ts 单体里。
//  实测（观测台 3 剧本 34 轮）暴露出：规则不是不够，是**没有执行结构**——
//  前 4 轮还行，第 5 轮之后人称漂移、格式漂移、长度失控。
//  规则在长上下文里会衰减。
//
//  参考 SillyTavern / Aventuras / 社区预设的通行做法，改为：
//    1. 每个模块**单一职责**，按失效模式拆分
//    2. 每个模块**独立开关** —— 这是能做事后 A/B 的前提
//    3. 由调用方决定注入哪些、注入在哪（生成点附近 vs 系统提示词开头）
//
//  开关可在运行时改（不重启进程），观测台据此做对照实验：
//    关闭全部模块跑一遍 → 开启跑一遍 → 比客观指标
// ============================================================

import { agencyModule, type AgencyOptions } from './agency';
import { povModule, type PovOptions } from './pov';
import { lengthModule, type LengthOptions } from './length';
import { closingModule } from './closing';
import { languageModule } from './language';
import { forbiddenModule } from './forbidden';
import { truncationModule } from './truncation';
import { PREFILL_TEXT } from './prefill';
import { reasoningModule, THINK_OPEN, PROSE_MARKER } from './reasoning';
import { optionsModule, OPTIONS_MARKER } from './options';
import { styleModule } from './style';

export type ModuleId =
  | 'reasoning' | 'agency' | 'pov' | 'length' | 'closing'
  | 'language' | 'forbidden' | 'truncation' | 'prefill'
  | 'style' | 'options';

export interface ModuleFlags {
  /** 思维链脚手架（DeepSeek 增益最大） */
  reasoning: boolean;
  agency: boolean;
  pov: boolean;
  length: boolean;
  closing: boolean;
  language: boolean;
  forbidden: boolean;
  truncation: boolean;
  /** assistant 预填充：把回复首 token 锁死，防格式漂移与开头复述 */
  prefill: boolean;
  /** DeepSeek 版文风规则（可执行的中文句法） */
  style: boolean;
  /** 每轮给出行动选项，给玩家出口 */
  options: boolean;
}

/** 默认全开。A/B 时由调用方临时改。 */
const flags: ModuleFlags = {
  reasoning: true,
  agency: true,
  pov: true,
  length: true,
  closing: true,
  language: true,
  forbidden: true,
  truncation: true,
  prefill: true,
  style: true,
  options: true,
};

/** 运行时改开关（观测台 A/B 用，无需重启） */
export function setModuleFlags(patch: Partial<ModuleFlags>): void {
  Object.assign(flags, patch);
}

export function getModuleFlags(): ModuleFlags {
  return { ...flags };
}

export function resetModuleFlags(): void {
  setModuleFlags({
    reasoning: true, agency: true, pov: true, length: true, closing: true,
    language: true, forbidden: true, truncation: true, prefill: true,
    style: true, options: true,
  });
}

/** 是否启用预填充（stage5 追加 assistant 消息、stage6 回补前缀时都要问） */
export function isPrefillEnabled(): boolean {
  return flags.prefill;
}

/**
 * 预填充内容 —— 这是本轮最重要的机制。
 *
 * 预填充不只是"防格式漂移"，它是**强制任何输出的通用手段**：
 * 把开头直接塞进 assistant 消息，模型就没有位置跳过它。
 *
 * 实测教训：只靠指令要求模型写 `<思考>`，3 轮里 0 次触发
 *（DeepSeek 收到 thinking:disabled 后会抑制推理类输出）。
 * 而社区预设（Deep♂Dark）的做法正是用一条 assistant 预填充**顶开**
 * think 标签 —— 把"要不要思考"从请求变成事实。
 *
 *   reasoning 开 → 预填充 `<思考>`，模型只能接着想，想完自行闭合再写正文
 *   reasoning 关 → 预填充 `【旁白】`，锁死正文首 token
 */
export function getPrefillText(): string {
  if (!flags.prefill) return '';
  return flags.reasoning ? THINK_OPEN : PREFILL_TEXT;
}

/**
 * 尾注：紧贴玩家输入的一小段"本轮必须做到"。
 * 规则块本身很长（11 个模块），塞在里面的要求会被稀释；
 * 这里单独再强调一次最容易漏掉的那条。
 */
export function buildTailNote(): string {
  const lines: string[] = [];
  if (flags.reasoning) {
    lines.push(`先做分析，写一行 "${PROSE_MARKER}" 分隔，下面才是正文。思考里不要出现正文。`);
  }
  if (flags.options) {
    lines.push(`正文写完后另起一行写 "${OPTIONS_MARKER}"，下面用数字列出 3~4 条走向不同的选项。`);
  }
  if (lines.length) {
    lines.push('思考和选项都不计入篇幅。');
  }
  return lines.join('\n');
}

export { PREFILL_TEXT, THINK_OPEN, PROSE_MARKER, OPTIONS_MARKER };

export interface ModuleContext {
  playerName: string;
  isSoul: boolean;
  pov?: PovOptions['pov'];
  lengthTier?: LengthOptions['tier'];
}

/**
 * 组装启用中的模块。返回顺序即注入顺序：
 * 玩家自主权 → 人称 → 篇幅 → 收尾 → 语言
 * （自主权最靠前，因为它是最高优先级且违反代价最大）
 */
export function buildRuleModules(ctx: ModuleContext): string {
  const parts: string[] = [];

  // 顺序即语义顺序：
  //   先想再写 → 自主权/人称/篇幅 → 禁则 → 文风 → 收尾 → 完整性 → 语言 → 选项
  if (flags.reasoning) {
    parts.push(reasoningModule());
  }
  if (flags.agency) {
    parts.push(agencyModule({ playerName: ctx.playerName, isSoul: ctx.isSoul }));
  }
  if (flags.pov) {
    parts.push(povModule({ pov: ctx.pov || 'second', playerName: ctx.playerName }));
  }
  if (flags.length) {
    parts.push(lengthModule({ tier: ctx.lengthTier }));
  }
  if (flags.forbidden) {
    parts.push(forbiddenModule());
  }
  if (flags.style) {
    parts.push(styleModule());
  }
  if (flags.closing) {
    parts.push(closingModule());
  }
  if (flags.truncation) {
    parts.push(truncationModule());
  }
  if (flags.language) {
    parts.push(languageModule());
  }
  if (flags.options) {
    parts.push(optionsModule());
  }

  if (parts.length === 0) return '';

  return [
    '════ 规则模块（本轮必须遵守）════',
    ...parts,
    '════ 规则模块结束 ════',
  ].join('\n\n');
}

export {
  agencyModule, povModule, lengthModule, closingModule, languageModule,
  forbiddenModule, truncationModule, reasoningModule, optionsModule, styleModule,
};
