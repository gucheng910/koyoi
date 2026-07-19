const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Remove unused text variable
t = t.replace(
  "const text = inputText.trim(); setInputText('');\n    const finalText",
  'const finalText'
);

// Add setSegments([]) before building message
t = t.replace(
  'const msgsWithUser = [...messages, userMsg];',
  'setSegments([]);\n    const msgsWithUser = [...messages, userMsg];'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed');
