const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Fix 1: Remove segment puts text back into input
t = t.replace(
  "onPress={() => setSegments(prev => prev.filter((_, idx) => idx !== i))}",
  "onPress={() => { setInputText(prev => prev + (prev ? ' ' : '') + seg.text); setSegments(prev => prev.filter((_, idx) => idx !== i)); }}"
);

// Fix 2: Send builds from segments with correct prefixes
t = t.replace(
  "const text = inputText.trim(); setInputText('');\n    const finalText = '[行动] ' + text;",
  "setInputText('');\n    const finalText = segments.map(s => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\\n');"
);

// Fix 3: Clear segments after building message
t = t.replace(
  'const userMsg: ChatMessage = { role: \'user\', content: finalText, timestamp: new Date().toISOString() };\n    setSegments([]);',
  'const userMsg: ChatMessage = { role: \'user\', content: finalText, timestamp: new Date().toISOString() };'
);

// Add setSegments after userMsg
t = t.replace(
  'const userMsg: ChatMessage = { role: \'user\', content: finalText, timestamp: new Date().toISOString() };\n    const msgsWithUser',
  'const userMsg: ChatMessage = { role: \'user\', content: finalText, timestamp: new Date().toISOString() };\n    setSegments([]);\n    const msgsWithUser'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed segments + send + remove');
