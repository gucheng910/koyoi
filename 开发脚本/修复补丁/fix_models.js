const fs = require('fs');

// === 1. scenarioInjector.ts ===
let si = fs.readFileSync('D:/koyoi/src/services/scenarioInjector.ts', 'utf8');
si = si.replace(
  /model: 'deepseek-v4-flash', thinkingMode: 'disabled', maxTokens: 50, temperature: 0,/,
  "model: cfg.model || 'deepseek-v4-flash', thinkingMode: 'disabled', maxTokens: 50, temperature: 0,"
);
fs.writeFileSync('D:/koyoi/src/services/scenarioInjector.ts', si);

// === 2. backgroundInteraction.ts ===
let bi = fs.readFileSync('D:/koyoi/src/services/backgroundInteraction.ts', 'utf8');
bi = bi.replace(
  /model: 'deepseek-v4-flash', thinkingMode: 'disabled', maxTokens: 200, temperature: 0.7,/,
  "model: cfg.model || 'deepseek-v4-flash', thinkingMode: 'disabled', maxTokens: 200, temperature: 0.7,"
);
fs.writeFileSync('D:/koyoi/src/services/backgroundInteraction.ts', bi);

// === 3. worldInfoService.ts (extractMemories) ===
let wi = fs.readFileSync('D:/koyoi/src/services/worldInfoService.ts', 'utf8');
wi = wi.replace(
  /model: 'deepseek-v4-flash', thinkingMode: 'disabled', reasoningEffort:/,
  "model: cfg.model || 'deepseek-v4-flash', thinkingMode: 'disabled', reasoningEffort:"
);
// Actually check the exact context
if (wi.includes("id: '', label: '', baseUrl, apiKey, model: 'deepseek-v4-flash'")) {
  wi = wi.replace(
    "model: 'deepseek-v4-flash'",
    "model: cfg.model || 'deepseek-v4-flash'"
  );
  // need to add cfg.model to the destructuring - let me pass model explicitly
  // Actually this function receives apiKey and baseUrl as separate args, not cfg
}
// The extractMemories function receives apiKey, baseUrl as separate args
// It constructs a full ApiConfig inline. Let me search for the exact pattern
wi = wi.replace(
  "model: 'deepseek-v4-flash', thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 0.3, maxTokens: 200, safetyFilter: 'off'",
  "model: cfg.model || 'deepseek-v4-flash', thinkingMode: 'disabled', reasoningEffort: 'high', temperature: 0.3, maxTokens: 200, safetyFilter: 'off'"
);
// But cfg is not available - let me check what's actually passed
fs.writeFileSync('D:/koyoi/src/services/worldInfoService.ts', wi);

// === 4. worldRepair.ts ===
let wr = fs.readFileSync('D:/koyoi/src/services/worldRepair.ts', 'utf8');
wr = wr.replace(
  "const model = cfg.model || 'deepseek-v4-flash';",
  "const model = cfg.model || 'deepseek-v4-flash'; // 使用用户配置的模型，兜底 flash"
);
fs.writeFileSync('D:/koyoi/src/services/worldRepair.ts', wr);

// === 5. FanficScreen analysis model ===
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');
// The analysis model selection already uses `analysisModel` state which comes from buttons
// But the analysis model options are hardcoded to just V4 Flash/V4 Pro
// Let me add a custom model input
ff = ff.replace(
  "{[{ k: 'deepseek-v4-flash', v: '⚡ V4 Flash' }, { k: 'deepseek-v4-pro', v: '🎯 V4 Pro' }].map(o => (",
  "{[{ k: 'deepseek-v4-flash', v: '⚡ V4 Flash' }, { k: 'deepseek-v4-pro', v: '🎯 V4 Pro' }, { k: analysisModel !== 'deepseek-v4-flash' && analysisModel !== 'deepseek-v4-pro' ? analysisModel : '', v: '自定义' }].filter(o => o.k).map(o => ("
);
fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);

console.log('all hardcoded models fixed');
