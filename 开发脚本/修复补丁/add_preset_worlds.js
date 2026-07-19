const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/prompts/characters/presets.ts', 'utf8');

// Find the end of campusWorld and add new worlds
const insertAfter = 'export const campusWorld';
const idx = t.indexOf(insertAfter);
if (idx >= 0) {
  // Find the end of campusWorld definition
  const endOfCampus = t.indexOf('// ---- 预设', idx + 500);
  const insertionPoint = endOfCampus > 0 ? endOfCampus : t.indexOf('export function getPresetCharacters', idx);
  
  const newWorlds = `

// ---- 预设世界：武侠江湖 ----
export const wuxiaWorld: World = {
  id: 'world_wuxia', name: '武侠江湖', type: 'wuxia',
  rules: { physics: '内力、轻功、经脉体系', supernatural: '内功心法、剑气外放', technology: '古代冷兵器时代', society: '江湖门派林立，正邪对立，朝廷与武林共存', morality: '侠义精神，恩怨分明', sexualNorms: '古代礼教约束' },
  locations: [{ name: '青云山', description: '武林圣地，终年云雾缭绕' },{ name: '醉仙楼', description: '江湖消息集散地，人来人往' },{ name: '藏剑山庄', description: '天下名剑的归宿' }],
  factions: [], timeline: [], characters: [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' },
  writingStyle: '', styleSamples: [],
};

export const urbanWorld: World = {
  id: 'world_urban', name: '都市', type: 'urban',
  rules: { physics: '现实物理', supernatural: '无', technology: '当代科技水平', society: '现代都市，职场社交，阶层分明', morality: '法律与道德并重', sexualNorms: '现代开放' },
  locations: [{ name: 'CBD写字楼', description: '金融中心，白领聚集地' },{ name: '老街巷', description: '隐藏在城市角落的烟火气' }],
  factions: [], timeline: [], characters: [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' },
  writingStyle: '', styleSamples: [],
};

export const interstellarWorld: World = {
  id: 'world_interstellar', name: '星际', type: 'interstellar',
  rules: { physics: '曲速引擎、跃迁技术', supernatural: '未知宇宙生命', technology: '星际航行时代，AI与人类共存', society: '星际联邦，多种族共存', morality: '星际公约与丛林法则并存', sexualNorms: '多种族文化融合' },
  locations: [{ name: '星舰舰桥', description: '指挥中心，俯瞰星河' },{ name: '殖民星球地表', description: '异星地貌，未知生态' },{ name: '太空站', description: '星际贸易枢纽' }],
  factions: [], timeline: [], characters: [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' },
  writingStyle: '', styleSamples: [],
};

export const gameWorld: World = {
  id: 'world_game', name: '游戏世界', type: 'game',
  rules: { physics: '游戏规则即物理法则', supernatural: '系统赋予的超能力', technology: 'VR完全沉浸技术', society: '玩家公会、NPC社会、系统秩序', morality: '游戏内无真实死亡，但情感真实', sexualNorms: '虚拟世界自由探索' },
  locations: [{ name: '新手村', description: '一切开始的地方' },{ name: '公会大厅', description: '玩家聚集交流的场所' },{ name: '迷宫深处', description: '隐藏着最强Boss的领域' }],
  factions: [], timeline: [], characters: [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' },
  writingStyle: '', styleSamples: [],
};

export const supernaturalWorld: World = {
  id: 'world_supernatural', name: '灵异', type: 'supernatural',
  rules: { physics: '现实物理为主，灵异现象可突破', supernatural: '鬼魂、妖怪、超自然力量', technology: '现代科技为主', society: '普通人社会与灵异世界并存', morality: '因果报应，善恶有终', sexualNorms: '现代与传统的交织' },
  locations: [{ name: '老旧公寓', description: '发生过很多故事的走廊尽头' },{ name: '废弃医院', description: '夜晚的脚步声不属于任何人' },{ name: '寺庙', description: '最后的庇护所' }],
  factions: [], timeline: [], characters: [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' },
  writingStyle: '', styleSamples: [],
};

export const alternateHistoryWorld: World = {
  id: 'world_alt_history', name: '架空历史', type: 'alternate_history',
  rules: { physics: '现实物理', supernatural: '无或微弱的宿命论', technology: '古代科技+可能的超前技术', society: '王朝帝国，权力斗争', morality: '忠孝节义，成王败寇', sexualNorms: '古代礼教+架空设定' },
  locations: [{ name: '皇宫大殿', description: '权力的中心，暗流涌动' },{ name: '边境军镇', description: '抵御外敌的第一道防线' },{ name: '江湖客栈', description: '消息与人流汇聚之处' }],
  factions: [], timeline: [], characters: [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' },
  writingStyle: '', styleSamples: [],
};
`;

  t = t.slice(0, insertionPoint) + newWorlds + t.slice(insertionPoint);
}

// Update AVAILABLE_WORLDS in WorldSetupScreen
let ws = fs.readFileSync('D:/koyoi/src/screens/WorldSetupScreen.tsx', 'utf8');
ws = ws.replace(
  "import { modernWorld, cultivationWorld, historicalWorld, campusWorld } from '../prompts/characters/presets';",
  "import { modernWorld, cultivationWorld, historicalWorld, campusWorld, wuxiaWorld, urbanWorld, interstellarWorld, gameWorld, supernaturalWorld, alternateHistoryWorld } from '../prompts/characters/presets';"
);
ws = ws.replace(
  'AVAILABLE_WORLDS = [modernWorld, cultivationWorld, historicalWorld, campusWorld];',
  'AVAILABLE_WORLDS = [modernWorld, cultivationWorld, historicalWorld, campusWorld, wuxiaWorld, urbanWorld, interstellarWorld, gameWorld, supernaturalWorld, alternateHistoryWorld];'
);

fs.writeFileSync('D:/koyoi/src/prompts/characters/presets.ts', t);
fs.writeFileSync('D:/koyoi/src/screens/WorldSetupScreen.tsx', ws);
console.log('worlds added');
