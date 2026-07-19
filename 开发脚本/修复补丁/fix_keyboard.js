const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');
t = t.replace(
  "behavior={Platform.OS === 'ios' ? 'padding' : undefined}",
  "behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"
);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed keyboard');
