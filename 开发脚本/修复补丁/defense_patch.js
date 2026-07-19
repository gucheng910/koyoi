const fs = require('fs');

// 1. Fix timelineSynthesizer.ts - synth.rules accesses
let t = fs.readFileSync('D:/koyoi/src/services/timelineSynthesizer.ts', 'utf8');
t = t.replace(/synth\.rules\.supernatural/g, 'synth.rules?.supernatural || ""');
t = t.replace(/synth\.rules\.society/g, 'synth.rules?.society || ""');
t = t.replace(/synth\.rules\.culture/g, 'synth.rules?.culture || ""');
t = t.replace(/synth\.rules\.sexualNorms/g, 'synth.rules?.sexualNorms || ""');
fs.writeFileSync('D:/koyoi/src/services/timelineSynthesizer.ts', t);

// 2. Fix WorldSetupScreen.tsx - selectedWorld.rules accesses
t = fs.readFileSync('D:/koyoi/src/screens/WorldSetupScreen.tsx', 'utf8');
t = t.replace(/selectedWorld\.rules\.supernatural/g, 'selectedWorld?.rules?.supernatural || ""');
t = t.replace(/selectedWorld\.rules\.society/g, 'selectedWorld?.rules?.society || ""');
t = t.replace(/selectedWorld\.rules\.sexualNorms/g, 'selectedWorld?.rules?.sexualNorms || ""');
fs.writeFileSync('D:/koyoi/src/screens/WorldSetupScreen.tsx', t);

// 3. Add normalizeSession to HomeScreen - fix broken sessions on load
let home = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');
home = home.replace(
  "if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setSessions(parsed.filter((s: any) => s?.id && s?.world)); }",
  "if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setSessions(parsed.filter((s: any) => s?.id && s?.world).map(normalizeSession)); }"
);
home = home.replace(
  "import type { WorldSession } from '../types';",
  `import type { WorldSession } from '../types';

function normalizeSession(s: any): WorldSession {
  if (!s.world) s.world = {};
  if (!s.world.rules) s.world.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' };
  if (!s.world.locations) s.world.locations = [];
  if (!s.world.timeline) s.world.timeline = [];
  if (!s.world.characters) s.world.characters = [];
  if (!s.selectedCharacters) s.selectedCharacters = [];
  if (!s.npcs) s.npcs = [];
  if (!s.messages) s.messages = [];
  if (!s.worldLog) s.worldLog = [];
  return s as WorldSession;
}`
);
fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', home);

// 4. Also normalize in WorldChatScreen's load or entry
let ws = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');
const hasNormalize = ws.includes('normalizeSession');
if (!hasNormalize) {
  // Add normalize call at start of component
  ws = ws.replace(
    "export default function WorldChatScreen({ session: initialSession, onBack, isDark }: Props) {",
    `function normalizeSession(s: any) {
  const w = s.world || {};
  if (!w.rules) w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' };
  if (!w.locations) w.locations = [];
  if (!w.timeline) w.timeline = [];
  if (!w.characters) w.characters = [];
  s.world = w;
  if (!s.selectedCharacters) s.selectedCharacters = [];
  if (!s.npcs) s.npcs = [];
  if (!s.messages) s.messages = [];
  if (!s.worldLog) s.worldLog = [];
  return s;
}

export default function WorldChatScreen({ session: initialSession, onBack, isDark }: Props) {`
  );
}
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', ws);

console.log('all files fixed');
