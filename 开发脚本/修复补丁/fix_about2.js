const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Find the problematic section
const idx = t.indexOf("AI 驱动的互动小说应用。上传小说，魂穿到故事中。{");
if (idx > 0) {
  // Find the end of the Text element
  let end = t.indexOf('</Text>', idx);
  if (end < 0) end = t.indexOf('</Text>', idx + 10);
  
  const replacement = `AI 驱动的互动小说应用。上传小说，魂穿到故事中。基于 DeepSeek V4，完全本地存储。\\n\\n免责声明：本应用 AI 生成内容仅供娱乐。同人穿越功能旨在为创作者提供灵感，请勿上传无版权作品。`;
  
  // Replace from the chinese text start to before </Text>
  const before = t.slice(0, idx);
  const after = t.slice(end);
  t = before + replacement + after;
  fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
  console.log('about text fixed, new length:', t.length);
} else {
  console.log('could not find about text');
}
