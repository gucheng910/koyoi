const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');
t = t.replace(/<MotiView[^>]*>/, '<FadeIn style={{ alignItems: "center" }}>');
t = t.replace('</MotiView>', '</FadeIn>');
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('MotiView -> FadeIn');
