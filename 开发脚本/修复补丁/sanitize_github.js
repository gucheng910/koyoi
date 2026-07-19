const fs = require('fs');

// Sanitize base.ts in GitHub copy
let base = fs.readFileSync('C:/Users/windows11/Desktop/KoyoiGitHub/src/prompts/templates/base.ts', 'utf8');

// Replace explicit vocabulary section
base = base.replace(
  /## 性描写\n词汇参考：男\([\s\S]*?身体语言：紧张\(绞衣角\/咬嘴唇\)→动情\(瞳孔放大\/喉咙滚动\)→高潮\(脚趾蜷缩\/大腿颤抖\/眼神失焦\)。`/,
  `## 成人内容\n根据世界设定和角色关系自然地推进亲密场景。注意情感递进和角色反应的合理性。\n\n身体语言：紧张→绞衣角/咬嘴唇。动情→瞳孔放大/喉咙滚动。高潮→脚趾蜷缩/大腿颤抖/眼神失焦。\``
);

// Replace explicit writing sample
base = base.replace(
  /写作密度参考：「[\s\S]*?娇媚呻吟。」/,
  '写作密度参考：请参考原文风格特征的句长、节奏和感官密度来写。'
);

fs.writeFileSync('C:/Users/windows11/Desktop/KoyoiGitHub/src/prompts/templates/base.ts', base);
console.log('base.ts sanitized');

// Sanitize worldRules.ts
let wr = fs.readFileSync('C:/Users/windows11/Desktop/KoyoiGitHub/src/prompts/worldRules.ts', 'utf8');
wr = wr.replace(
  /`- 性描写：来自《仙子的修行》[\s\S]*?性爱密集。`/,
  "`- 成人内容：根据世界设定和角色关系自然地推进亲密场景。分阶段写：铺垫→互动→余韵。情感递进优先于生理描写。`"
);
fs.writeFileSync('C:/Users/windows11/Desktop/KoyoiGitHub/src/prompts/worldRules.ts', wr);
console.log('worldRules.ts sanitized');

// app.json description
let aj = JSON.parse(fs.readFileSync('C:/Users/windows11/Desktop/KoyoiGitHub/app.json', 'utf8'));
aj.expo.description = 'AI互动小说 — 创建世界、上传小说、沉浸式角色扮演。支持 DeepSeek V4，完全本地存储。';
fs.writeFileSync('C:/Users/windows11/Desktop/KoyoiGitHub/app.json', JSON.stringify(aj, null, 2));
console.log('app.json updated');

console.log('\nGitHub version ready at: C:/Users/windows11/Desktop/KoyoiGitHub');
