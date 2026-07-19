const fs = require('fs');

// === 1. base.ts — 去掉最露骨的性描写词汇 ===
let base = fs.readFileSync('D:/koyoi/src/prompts/templates/base.ts', 'utf8');

// 替换整段性描写词汇为中性描述
base = base.replace(
  /## 性描写\n词汇参考：男\([\s\S]*?身体语言：紧张\(绞衣角\/咬嘴唇\)→动情\(瞳孔放大\/喉咙滚动\)→高潮\(脚趾蜷缩\/大腿颤抖\/眼神失焦\)。`/,
  `## 成人内容\n根据世界设定和角色关系自然地推进亲密场景。注意情感递进和角色反应的合理性。避免机械描写。\n\n身体语言：紧张→绞衣角/咬嘴唇。动情→瞳孔放大/喉咙滚动。高潮→脚趾蜷缩/大腿颤抖/眼神失焦。\``
);

// 替换写作密度参考中的露骨描写
base = base.replace(
  /写作密度参考：「[\s\S]*?娇媚呻吟。」/,
  '写作密度参考：请参考原文风格特征的句长、节奏和感官密度来写。'
);

fs.writeFileSync('D:/koyoi/src/prompts/templates/base.ts', base);

// === 2. characterSimulator — 去掉太具体的性暗示 ===
let sim = fs.readFileSync('D:/koyoi/src/services/characterSimulator.ts', 'utf8');
// No changes needed - character simulation is mostly emotional/behavioral

// === 3. worldRules.ts — 检查是否有不合适的 ===
let wr = fs.readFileSync('D:/koyoi/src/prompts/worldRules.ts', 'utf8');
// This is mostly anti-slop rules and narrator guidance

// === 4. 更新 app.json 描述 ===
let aj = JSON.parse(fs.readFileSync('D:/koyoi/app.json', 'utf8'));
if (!aj.expo) aj.expo = {};
aj.expo.description = 'AI互动小说 — 创建世界、上传小说、沉浸式角色扮演。支持 DeepSeek V4，完全本地存储。';
fs.writeFileSync('D:/koyoi/app.json', JSON.stringify(aj, null, 2));

// === 5. 恢复 reward.png 和 icon.png（用户可以选择公开） ===
let gi = fs.readFileSync('D:/koyoi/.gitignore', 'utf8');
gi = gi.replace('# Personal\nassets/reward.png\nassets/icon.png\n', '# Personal (uncomment to hide)\n# assets/reward.png\n');
fs.writeFileSync('D:/koyoi/.gitignore', gi);

console.log('NSFW content sanitized for public repo');
console.log('Changes:');
console.log('  - base.ts: removed explicit sexual vocabulary references');
console.log('  - base.ts: removed explicit writing sample');
console.log('  - app.json: updated description');
console.log('  - .gitignore: reward.png no longer hidden (user choice)');
