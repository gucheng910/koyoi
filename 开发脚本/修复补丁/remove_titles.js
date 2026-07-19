const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Remove "我的" section title
t = t.replace(
  "{/* ====== 我的 ====== */}\n      <Text style={S.sectionTitle}>我的</Text>\n",
  ''
);

// Remove "外观" section title
t = t.replace(
  "{/* 外观 */}\n      <Text style={S.sectionTitle}>外观</Text>\n",
  ''
);

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('removed section titles');
