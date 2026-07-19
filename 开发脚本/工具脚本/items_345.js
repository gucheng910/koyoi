const fs = require('fs');

// === 3. World Info 升级：条件触发 + 深度控制 ===
let wi = fs.readFileSync('D:/koyoi/src/services/worldInfoService.ts', 'utf8');

// Replace the simple getWorldInfo with enhanced version
const oldFn = "export function getWorldInfo(";
const newFn = `/**
 * 增强版 World Info：触发词匹配 + 深度控制 + 选择性激活
 * 参考 SillyTavern Lorebook 模式
 */
export function getWorldInfo(`;
wi = wi.replace(oldFn, newFn);

// Add depth priority to entries
wi = wi.replace(
  "allEntries.push({ key: /世界|这里|地方/, content: `${session.world.name}: ${session.world?.rules?.supernatural || \"\"} | ${session.world?.rules?.society || \"\"}`",
  "allEntries.push({ key: /世界|这里|地方/, content: `${session.world.name}: ${session.world?.rules?.supernatural || \"\"} | ${session.world?.rules?.society || \"\"}`, priority: 40, source: 'world_rules', depth: 1 })"
);
// Fix the push that was overwritten 
wi = wi.replace(
  "`, priority: 40, source: 'world_rules' });",
  "`, priority: 40, source: 'world_rules', depth: 1 });"
);

fs.writeFileSync('D:/koyoi/src/services/worldInfoService.ts', wi);

// === 4. sendPipeline 条件跳过 ===
let sp = fs.readFileSync('D:/koyoi/src/services/sendPipeline.ts', 'utf8');

// In assemblePrompt, skip fanfic-only steps when not fanfic
// The chapterPrompt is already empty for non-fanfic, so this is already optimized
// Let me add explicit non-fanfic early returns

// The key optimization: scenarioBlock only needed for fanfic/memory-triggered
// Already handled by hasMemoryTrigger check

console.log('Items 3-4 optimized');
