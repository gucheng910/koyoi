const fs = require('fs');
const dir = 'C:/Users/windows11/Desktop/KoyoiGitHub/src/';

// 1. base.ts - 性描写词汇
let base = fs.readFileSync(dir + 'prompts/templates/base.ts', 'utf8');
base = base.replace(/## 性描写[\s\S]*?(?=\n\n\$\{)/, `## 成人内容\n根据世界设定和角色关系自然地推进亲密场景。注意情感递进和角色反应的合理性。\n\n身体语言：紧张→绞衣角/咬嘴唇。动情→瞳孔放大/喉咙滚动。高潮→脚趾蜷缩/大腿颤抖/眼神失焦。`);
fs.writeFileSync(dir + 'prompts/templates/base.ts', base);

// 2. worldRules.ts
let wr = fs.readFileSync(dir + 'prompts/worldRules.ts', 'utf8');
wr = wr.replace(/性描写：来自《仙子的修行》[\s\S]*?性爱密集。`/, `成人内容：根据世界设定和角色关系自然地推进亲密场景。`);
fs.writeFileSync(dir + 'prompts/worldRules.ts', wr);

// 3. CreateScreen - already clean in latest sync? Check
let cs = fs.readFileSync(dir + 'screens/CreateScreen.tsx', 'utf8');
// KINKS_POOL - already replaced in latest source
// 性偏好 → 偏好设定 already done
// 性欲 → 欲望 already done
console.log('CreateScreen KINKS clean:', !cs.includes('口交') && !cs.includes('肛交'));
console.log('CreateScreen 性偏好:', cs.includes('性偏好'));
console.log('CreateScreen 偏好设定:', cs.includes('偏好设定'));

// 4. CharacterDetail
let cd = fs.readFileSync(dir + 'screens/CharacterDetail.tsx', 'utf8');
console.log('CharacterDetail 性欲:', cd.includes('性欲'));
console.log('CharacterDetail 性偏好:', cd.includes('性偏好'));

// 5. presets.ts - check what's still there
let pr = fs.readFileSync(dir + 'prompts/characters/presets.ts', 'utf8');
console.log('presets 口交:', pr.includes('口交'));

// 6. WorldSetupScreen
let ws = fs.readFileSync(dir + 'screens/WorldSetupScreen.tsx', 'utf8');
console.log('WorldSetup 性观念:', ws.includes('性观念'));

// 7. SettingsScreen - sk- placeholder is fine (it's a placeholder, not a real key)
console.log('\nSummary:');
console.log('- base.ts: ' + (base.includes('肉棒') ? 'HAS explicit' : 'clean'));
console.log('- worldRules: ' + (wr.includes('肉棒') ? 'HAS explicit' : 'clean'));
