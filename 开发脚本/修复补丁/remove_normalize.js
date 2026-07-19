const fs = require('fs');

// 1. 移除 normalizeWorldCard，恢复直接 setWorldCard
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');
ff = ff.replace(
  "onPress={() => { const fixed = normalizeWorldCard(w); setWorldCard(fixed); setStep('config'); }}",
  "onPress={() => { setWorldCard(w); setStep('config'); }}"
);

// 2. 移除 normalizeWorldCard 函数定义
ff = ff.replace(
  /\n\/\/ 规范化 FanficWorldCard[\s\S]*?return card;\n\}\n/,
  '\n'
);

// 3. 确保所有 rules.supernatural 等访问有保护
// 已经在上次加了可选链，但检查 display 部分是否完全覆盖
ff = ff.replace(
  'worldCard.rules?.supernatural || \'未提取\'',
  '(worldCard.rules?.supernatural || worldCard.rules?.physics || \'未提取\')'
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);

// 4. 同人世界卡片加载时不做全局改写，只在有问题的字段上加保护
// 检查 config step 中还有其他没有保护的访问
const configStart = ff.indexOf('step === \'config\'');
const configEnd = ff.indexOf('step === \'opening\'', configStart);
const configSection = ff.slice(configStart, configEnd);

// worldCard.characters.length 有保护吗？
if (configSection.includes('worldCard.characters.length') && !configSection.includes('worldCard.characters?.length')) {
  console.log('WARNING: unprotected characters.length');
}

console.log('removed normalizeWorldCard, data preserved');
