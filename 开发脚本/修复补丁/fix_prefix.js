const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Fix: build finalText from segments with correct prefixes
t = t.replace(
  "const text = inputText.trim(); setInputText('');\n    const finalText = '[行动] ' + text;",
  "const finalText = segments.map(s => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\\n');"
);

// Verify
const idx = t.indexOf('const finalText');
console.log(t.slice(idx, idx+100));

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed');
