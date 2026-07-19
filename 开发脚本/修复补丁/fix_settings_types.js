const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Fix the broken useState types
t = t.replace(
  "useState<any>(<'enabled' | 'disabled'>('disabled')",
  "useState<string>('disabled')"
);
t = t.replace(
  "useState<any>(<'high' | 'max'>('high')",
  "useState<string>('high')"
);

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('fixed');
