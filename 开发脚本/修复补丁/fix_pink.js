const fs = require('fs');

// Replace pink with amber - both single and double quoted versions
const files = [
  'D:/koyoi/src/screens/FanficScreen.tsx',
  'D:/koyoi/src/screens/SettingsScreen.tsx',
];

for (const file of files) {
  let t = fs.readFileSync(file, 'utf8');
  t = t.replace(/#e91e63/g, '#B8944C');
  t = t.replace(/#c2185b/g, '#A0783C');
  t = t.replace(/#fce4ec/g, '#F5ECD7');
  t = t.replace(/#2a1020/g, '#2A2418');
  fs.writeFileSync(file, t);
  console.log('Fixed:', file.split('/').pop());
}
console.log('Done');
