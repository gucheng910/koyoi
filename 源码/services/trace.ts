// ============================================================
//  调用追踪（阶段七）
//
//  要解决的问题：
//
//  项目有 100 处 console.*，release 构建里全部丢失——出问题时无法定位。
//  已有的 usageStore 记录了 token/费用/耗时，但**没有子系统归因**：
//  看到某天费用翻倍，你不知道这笔钱花在角色推演、抛光、还是世界脉冲上。
//
//  这个模块给每次 AI 调用打上「哪个子系统发的」标签，并记录逐轮耗时，
//  供设置页的诊断面板展示与导出。
//
//  设计取舍：
//  - 不用「层层传参」的方式传标签（要改十几个函数签名），改用
//    withTag 作用域。
//  - 环形缓冲，内存有上限，不会因为长会话无限增长。
//  - 只在内存里，不落盘也不上报——本地优先，隐私不外泄。
//
//  ⚠️ 并发正确性（真机测试后修正）：
//  最初我在这里断言「这些调用都是 await 出来的，没有并发交叉写入」——
//  **这个假设是错的**。stage4 用 Promise.all 把角色推演和内容路由**并发**跑：
//      await Promise.all([runCharacterSimulation(...), routeContent(...)])
//  两者各自 push 标签到同一个全局栈，于是**先返回的那个调用会读到后压入的
//  标签**，归因互相污染。
//
//  真机上表现为：内容路由被记成「4 次 · 3.2k 出」，而它的 max_tokens 只有 600
//  ——每次 800 输出是不可能的；同时角色推演只剩 47 出/次。数字自相矛盾，
//  正好暴露了这个 bug。
//
//  修法：标签在**调用发起的那一刻**同步捕获（此时栈顶一定是对的），
//  而不是等响应回来再去读栈顶。见 captureTag() 与各 API 函数的用法。
// ============================================================

/** 已知的子系统标签（自由字符串也接受，这里只用于展示排序） */
export type SubsystemTag =
  | 'character-sim'
  | 'router'
  | 'narrator'
  | 'polish'
  | 'summary'
  | 'memory-extract'
  | 'memory-resummarize'
  | 'world-pulse'
  | 'chapter-track'
  | 'background-interaction'
  | 'novel-analyze'
  | 'timeline-synth'
  | 'style-analyze'
  | 'character-dive'
  | 'other';

export interface TraceCall {
  id: string;
  tag: SubsystemTag | string;
  model: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  costRmb: number;
  turn?: number;
  error?: string;
  /** 仅在 debug 模式下填充（prompt 可能含用户隐私内容） */
  promptPreview?: string;
}

export interface TurnTrace {
  turn: number;
  startedAt: number;
  durationMs: number;
  calls: TraceCall[];
  errors: string[];
}

const MAX_CALLS = 200;
const MAX_TURNS = 20;

interface TraceState {
  calls: TraceCall[];
  turns: TurnTrace[];
  /** 调用栈式的标签栈：进入 scope 时压入，退出时弹出 */
  scopeStack: string[];
  /** 当前轮次（由 startTurn 设置，供归因用） */
  currentTurn: number;
  debug: boolean;
}

const state: TraceState = {
  calls: [],
  turns: [],
  scopeStack: [],
  currentTurn: 0,
  debug: false,
};

// ── 标签作用域 ──

/** 当前应归属的子系统标签 */
export function currentTag(): string {
  return state.scopeStack.length > 0 ? state.scopeStack[state.scopeStack.length - 1] : 'other';
}

/**
 * 在调用**发起瞬间**捕获标签。
 *
 * 这是并发安全的关键：AI 请求函数在入口处同步调用它，把结果一路带下去，
 * 而不是等响应回来再读全局栈（那时栈顶可能已经是别的子系统了）。
 */
export function captureTag(): string {
  return currentTag();
}

/**
 * 在一个子系统标签下执行。
 *
 * 用法：await withTag('polish', () => polishText(...))
 * 嵌套时取最内层标签。
 */
export async function withTag<T>(tag: SubsystemTag | string, fn: () => Promise<T>): Promise<T> {
  state.scopeStack.push(tag);
  try {
    return await fn();
  } finally {
    state.scopeStack.pop();
  }
}

// ── 轮次 ──

export function beginTurn(turn: number): void {
  state.currentTurn = turn;
  state.turns.unshift({
    turn,
    startedAt: Date.now(),
    durationMs: 0,
    calls: [],
    errors: [],
  });
  if (state.turns.length > MAX_TURNS) state.turns.length = MAX_TURNS;
}

export function endTurn(turn: number): void {
  const t = state.turns.find(x => x.turn === turn);
  if (t) t.durationMs = Date.now() - t.startedAt;
}

export function noteTurnError(turn: number, error: string): void {
  const t = state.turns.find(x => x.turn === turn);
  if (t) t.errors.push(error);
}

// ── 记录 ──

export function recordCall(entry: Omit<TraceCall, 'id' | 'tag' | 'turn' | 'startedAt'> & {
  tag?: string;
  startedAt?: number;
}): void {
  const call: TraceCall = {
    id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
    tag: entry.tag || currentTag(),
    turn: state.currentTurn || undefined,
    startedAt: entry.startedAt ?? Date.now(),
    ...entry,
  } as TraceCall;

  state.calls.unshift(call);
  if (state.calls.length > MAX_CALLS) state.calls.length = MAX_CALLS;

  // 归入当前轮次
  if (state.currentTurn) {
    const t = state.turns.find(x => x.turn === state.currentTurn);
    if (t) {
      t.calls.push(call);
      if (t.calls.length > 40) t.calls.shift();
    }
  }

  if (!entry.ok && entry.error) noteTurnError(state.currentTurn, call.tag + ': ' + entry.error);
}

// ── 读取 ──

export function getTrace() {
  return {
    calls: state.calls,
    turns: state.turns,
    currentTurn: state.currentTurn,
  };
}

/** 按子系统汇总（用于「钱花在哪了」） */
export function summarizeByTag(): Array<{
  tag: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costRmb: number;
  avgMs: number;
  errors: number;
}> {
  const map = new Map<string, { calls: number; inputTokens: number; outputTokens: number; costRmb: number; totalMs: number; errors: number }>();
  for (const c of state.calls) {
    const k = String(c.tag);
    const cur = map.get(k) || { calls: 0, inputTokens: 0, outputTokens: 0, costRmb: 0, totalMs: 0, errors: 0 };
    cur.calls++;
    cur.inputTokens += c.inputTokens;
    cur.outputTokens += c.outputTokens;
    cur.costRmb += c.costRmb;
    cur.totalMs += c.durationMs;
    if (!c.ok) cur.errors++;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([tag, v]) => ({
      tag,
      calls: v.calls,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      costRmb: v.costRmb,
      avgMs: v.calls > 0 ? Math.round(v.totalMs / v.calls) : 0,
      errors: v.errors,
    }))
    .sort((a, b) => b.costRmb - a.costRmb || b.calls - a.calls);
}

/** 导出为可粘贴的 JSON（供反馈问题时附上） */
export function exportTrace(): string {
  const s = summarizeByTag();
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    byTag: s,
    totals: {
      calls: state.calls.length,
      costRmb: Number(state.calls.reduce((a, c) => a + c.costRmb, 0).toFixed(6)),
      errors: state.calls.filter(c => !c.ok).length,
    },
    turns: state.turns.slice(0, 10).map(t => ({
      turn: t.turn,
      durationMs: t.durationMs,
      calls: t.calls.length,
      errors: t.errors,
      breakdown: t.calls.map(c => ({ tag: c.tag, ms: c.durationMs, ok: c.ok })),
    })),
  }, null, 2);
}

export function setTraceDebug(on: boolean): void { state.debug = on; }
export function isTraceDebug(): boolean { return state.debug; }

export function clearTrace(): void {
  state.calls.length = 0;
  state.turns.length = 0;
  state.scopeStack.length = 0;
}
