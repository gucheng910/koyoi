const fs = require('fs');

// Update types
let types = fs.readFileSync('D:/koyoi/src/types/index.ts', 'utf8');
types = types.replace(
  "| 'custom';",
  "| 'wuxia' | 'urban' | 'interstellar' | 'game' | 'supernatural' | 'alternate_history' | 'custom';"
);
fs.writeFileSync('D:/koyoi/src/types/index.ts', types);

// Update WorldSetupScreen - add new worlds
let ws = fs.readFileSync('D:/koyoi/src/screens/WorldSetupScreen.tsx', 'utf8');
// Find getAvailableWorlds function and add new world entries
ws = ws.replace(
  "{ id: 'custom', name: '自定义', emoji: '✏️', description: '自由定义世界观' }",
  "{ id: 'custom', name: '自定义', emoji: '✏️', description: '自由定义世界观' },\n  { id: 'wuxia', name: '武侠江湖', emoji: '⚔️', description: '刀光剑影，侠客行天下' },\n  { id: 'urban', name: '都市', emoji: '🏙️', description: '现代都市的日常与暗流' },\n  { id: 'interstellar', name: '星际', emoji: '🚀', description: '浩瀚星海，文明碰撞' },\n  { id: 'game', name: '游戏世界', emoji: '🎮', description: 'VR/系统/异界游戏化' },\n  { id: 'supernatural', name: '灵异', emoji: '👻', description: '鬼怪、灵异、超自然现象' },\n  { id: 'alternate_history', name: '架空历史', emoji: '📜', description: '平行历史，王朝争霸' }"
);
fs.writeFileSync('D:/koyoi/src/screens/WorldSetupScreen.tsx', ws);

// Update HomeScreen helpers
let home = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');
home = home.replace(
  "const m: Record<string,string> = {modern:'🏙️',cultivation:'⛰️',historical:'🏛️',campus:'🎓',scifi:'🚀',fantasy:'🐉'}; return m[type] || '🌍';",
  "const m: Record<string,string> = {modern:'🏙️',cultivation:'⛰️',historical:'🏛️',campus:'🎓',scifi:'🚀',fantasy:'🐉',wuxia:'⚔️',urban:'🏙️',interstellar:'🚀',game:'🎮',supernatural:'👻',alternate_history:'📜',cyberpunk:'🤖',apocalypse:'💀'}; return m[type] || '🌍';"
);
home = home.replace(
  "const m: Record<string,string> = {modern:'现代',cultivation:'修仙',historical:'古代',campus:'校园',scifi:'科幻',fantasy:'奇幻'}; return m[type] || type;",
  "const m: Record<string,string> = {modern:'现代',cultivation:'修仙',historical:'古代',campus:'校园',scifi:'科幻',fantasy:'奇幻',wuxia:'武侠',urban:'都市',interstellar:'星际',game:'游戏',supernatural:'灵异',alternate_history:'架空',cyberpunk:'赛博',apocalypse:'末日'}; return m[type] || type;"
);
home = home.replace(
  "const m: Record<string,string> = {modern:'#4A90D9',cultivation:'#C4A45C',historical:'#8B4513',campus:'#5A8A5A',scifi:'#7B68EE',fantasy:'#D4467E'}; return m[type] || '#B8944C';",
  "const m: Record<string,string> = {modern:'#4A90D9',cultivation:'#8B6914',historical:'#8B4513',campus:'#5A8A5A',scifi:'#7B68EE',fantasy:'#D4467E',wuxia:'#CD853F',urban:'#607D8B',interstellar:'#4FC3F7',game:'#66BB6A',supernatural:'#AB47BC',alternate_history:'#795548',cyberpunk:'#00BCD4',apocalypse:'#FF7043'}; return m[type] || '#5B9BD5';"
);
fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', home);

// Update FanficScreen worldType selector if it exists
let fanfic = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');
fanfic = fanfic.replace(
  "cultivation' | 'modern' | 'fantasy' | 'historical' | 'campus' | 'scifi'",
  "cultivation' | 'modern' | 'fantasy' | 'historical' | 'campus' | 'scifi' | 'wuxia' | 'urban' | 'interstellar' | 'game' | 'supernatural' | 'alternate_history'"
);
fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', fanfic);

console.log('all world types updated');
