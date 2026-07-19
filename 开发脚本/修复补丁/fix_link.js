const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');
t = t.replace(
  "Linking.openURL('https://github.com')",
  "Linking.openURL('https://github.com/gucheng910/koyoi')"
);
fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('About link updated');
