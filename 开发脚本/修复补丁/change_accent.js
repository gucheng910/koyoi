const fs = require('fs');

const files = [
  'D:/koyoi/src/screens/WorldChatScreen.tsx',
  'D:/koyoi/src/screens/HomeScreen.tsx',
  'D:/koyoi/src/screens/SettingsScreen.tsx',
  'D:/koyoi/src/screens/FanficScreen.tsx',
  'D:/koyoi/src/screens/ChatScreen.tsx',
  'D:/koyoi/src/screens/WorldSetupScreen.tsx',
  'D:/koyoi/src/screens/CreateScreen.tsx',
  'D:/koyoi/src/screens/CharactersTab.tsx',
  'D:/koyoi/src/screens/CharacterDetail.tsx',
  'D:/koyoi/App.tsx',
  'D:/koyoi/src/theme/index.ts',
];

// Replace amber/gold with light blue
const colorMap = {
  '#B8944C': '#5B9BD5',  // main accent: amber → sky blue
  '#C4A45C': '#6CB4EE',  // dark accent: gold → lighter blue
  '#A0783C': '#4A8AC4',  // dark accent variant
  '#F5ECD7': '#E8F0F8',  // light accent bg: amber bg → blue bg
  '#2A2418': '#1A2430',  // dark accent bg: amber dark → blue dark
};

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let t = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [old, neo] of Object.entries(colorMap)) {
    const before = t;
    t = t.replace(new RegExp(old, 'g'), neo);
    if (t !== before) changed = true;
  }
  if (changed) {
    fs.writeFileSync(file, t);
    console.log('Updated:', file.split('/').pop());
  }
}
console.log('Done - accent changed to sky blue');
