const fs = require('fs');

const files = [
  'D:/koyoi/src/screens/FanficScreen.tsx',
  'D:/koyoi/src/screens/ChatScreen.tsx',
  'D:/koyoi/src/screens/HomeScreen.tsx',
  'D:/koyoi/src/screens/SettingsScreen.tsx',
  'D:/koyoi/src/screens/WorldSetupScreen.tsx',
  'D:/koyoi/src/screens/CreateScreen.tsx',
  'D:/koyoi/src/screens/CharactersTab.tsx',
  'D:/koyoi/src/screens/CharacterDetail.tsx',
  'D:/koyoi/App.tsx',
];

const replacements = [
  ["'#e91e63'", "'#B8944C'"],  // main accent
  ["'#c2185b'", "'#A0783C'"],  // dark accent
  ["'#fce4ec'", "'#F5ECD7'"],  // light accent bg
  ["'#2a1020'", "'#2A2418'"],  // dark accent bg
  ["'#e8e0d0'", "'#E8DCC8'"],  // warm text
  ["'#0a0a0a'", "'#0D0C0A'"],  // bg variant
  ["'#2a2a2a'", "'#2A2822'"],  // dark border
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let t = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    const before = t;
    t = t.replace(new RegExp(from, 'g'), to);
    if (t !== before) changed = true;
  }
  if (changed) {
    fs.writeFileSync(file, t);
    console.log('Updated:', file.split('/').pop());
  }
}
console.log('Done');
