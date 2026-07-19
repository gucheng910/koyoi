// ============================================================
//  发送管线 — 统一导出
//  保持与旧 sendPipeline.ts 完全兼容的接口
// ============================================================

export { processInput } from './stage1_input';
export type { InputResult } from './stage1_input';

export { maybeGenerateSummary } from './stage2_summary';

export { buildContext } from './stage3_context';
export type { ContextResult } from './stage3_context';

export { runCharacterSimulation } from './stage4_simulation';

export { assemblePrompt } from './stage5_assemble';
export type { PromptResult } from './stage5_assemble';

export { callAI } from './stage6_call';

export { postProcessResponse } from './stage7_post';
export type { PostProcessResult } from './stage7_post';

export { runPostSendHooks } from './stage8_hooks';
export type { PostSendHooksParams } from './stage8_hooks';
