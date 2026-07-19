const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Replace only the finalText line
t = t.replace(
  "const finalText = '[行动] ' + text;",
  "const finalText = segments.map((s: any) => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\\n');"
);

// Verify
const idx = t.indexOf('const finalText');
if (idx >= 0) console.log('NEW:', t.slice(idx, idx + 100));
else console.log('NOT FOUND');

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
