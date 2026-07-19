const fs = require('fs');

// 1. 修复 FanficScreen - 加载 FanficWorldCard 时做规范化
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 在点击 savedWorld 的地方加保护
ff = ff.replace(
  'onPress={() => { setWorldCard(w); setStep(\'config\'); }}',
  'onPress={() => { const fixed = normalizeWorldCard(w); setWorldCard(fixed); setStep(\'config\'); }}'
);

// 添加 normalizeWorldCard 函数
ff = ff.replace(
  "import { useConfigStore } from '../store/configStore';",
  `import { useConfigStore } from '../store/configStore';

// 规范化 FanficWorldCard，确保所有字段都有合法默认值
function normalizeWorldCard(card: any): FanficWorldCard {
  if (!card || typeof card !== 'object') return card;
  if (typeof card.rules !== 'object' || !card.rules) {
    card.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' };
  }
  if (!Array.isArray(card.characters)) card.characters = [];
  if (!Array.isArray(card.locations)) card.locations = [];
  if (!Array.isArray(card.timeline)) card.timeline = [];
  if (!Array.isArray(card.factions)) card.factions = [];
  if (!card.worldType) card.worldType = 'modern';
  if (!card.novelTitle) card.novelTitle = '未知小说';
  if (!card.writingStyle) card.writingStyle = '';
  if (!Array.isArray(card.styleSamples)) card.styleSamples = [];
  if (!card.totalChapters) card.totalChapters = 1;
  card._normalized = true;
  return card;
}`
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);

// 2. 修复 ErrorBoundary 的强制规范化 - 同时处理 WorldSession 和 FanficWorldCard
let eb = fs.readFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', 'utf8');

// 在强制规范化逻辑中添加对 FanficWorldCard 扁平格式的处理
const oldLoop = `for (let i = 0; i < sessions.length; i++) {
              const s = sessions[i];
              if (!s?.id) continue;
              if (typeof s.world !== 'object' || !s.world || Array.isArray(s.world)) { s.world = { name: '修复的世界', type: 'custom', rules: {}, locations: [], timeline: [], characters: [], writingStyle: '' }; fixed++; }
              const w = s.world;`;

const newLoop = `for (let i = 0; i < sessions.length; i++) {
              const s = sessions[i];
              if (!s?.id) continue;
              // 判断格式: WorldSession (有 world 嵌套) 还是 FanficWorldCard (扁平)
              const isSession = typeof s.world === 'object' && s.world && !Array.isArray(s.world);
              const isCard = s.rules !== undefined || s.characters !== undefined;
              if (isSession) {
                let w = s.world;
                if (!w.name) w.name = '修复的世界';
                if (!w.type) w.type = 'custom';`;

eb = eb.replace(oldLoop, newLoop);

// Add the rest of the session logic and card logic
eb = eb.replace(
  "if (!w.name) w.name = '修复的世界';\n              if (!w.type) w.type = 'custom';\n              if (!w.rules || typeof w.rules !== 'object') { w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' }; fixed++; }\n              if (!Array.isArray(w.locations)) { w.locations = []; fixed++; }\n              if (!Array.isArray(w.timeline)) { w.timeline = []; fixed++; }\n              if (!Array.isArray(w.characters)) { w.characters = []; fixed++; }\n              if (!Array.isArray(s.selectedCharacters)) { s.selectedCharacters = []; fixed++; }\n              if (!Array.isArray(s.npcs)) { s.npcs = []; fixed++; }\n              if (!Array.isArray(s.messages)) { s.messages = []; fixed++; }\n              if (!Array.isArray(s.worldLog)) { s.worldLog = []; fixed++; }\n              if (!s.currentScene) s.currentScene = '';",
  `if (!w.name) w.name = '修复的世界';
                if (!w.type) w.type = 'custom';
                if (!w.rules || typeof w.rules !== 'object') { w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' }; fixed++; }
                if (!Array.isArray(w.locations)) { w.locations = []; fixed++; }
                if (!Array.isArray(w.timeline)) { w.timeline = []; fixed++; }
                if (!Array.isArray(w.characters)) { w.characters = []; fixed++; }
                if (!Array.isArray(s.selectedCharacters)) { s.selectedCharacters = []; fixed++; }
                if (!Array.isArray(s.npcs)) { s.npcs = []; fixed++; }
                if (!Array.isArray(s.messages)) { s.messages = []; fixed++; }
                if (!Array.isArray(s.worldLog)) { s.worldLog = []; fixed++; }
                if (!s.currentScene) s.currentScene = '';
              } else if (isCard) {
                // FanficWorldCard 扁平格式
                if (!s.novelTitle) s.novelTitle = '修复的小说';
                if (!s.worldType) s.worldType = 'modern';
                if (typeof s.rules !== 'object' || !s.rules) { s.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' }; fixed++; }
                if (!Array.isArray(s.characters)) { s.characters = []; fixed++; }
                if (!Array.isArray(s.locations)) { s.locations = []; fixed++; }
                if (!Array.isArray(s.timeline)) { s.timeline = []; fixed++; }
              }`
);

fs.writeFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', eb);

console.log('fixed card format');
