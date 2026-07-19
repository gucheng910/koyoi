const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Only replace color values - keep all structure intact
t = t.replace(/#0d0d0d/g, '#0D0C0A');
t = t.replace(/#fafafa/g, '#FAF8F5');
t = t.replace(/#e91e63/g, '#B8944C');
t = t.replace(/#f5f5f5/g, '#E8DCC8');
t = t.replace(/#1a1a1a/g, '#1A1814');
t = t.replace(/#fce4ec/g, '#F5ECD7');
t = t.replace(/#2a1020/g, '#2A2418');

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('Settings colors only - structure untouched');
