const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Fix send and duplicate issues
const s1 = t.indexOf('const send = useCallback');
const s2 = t.indexOf('const send = useCallback', s1 + 10);
if (s2 > 0) t = t.slice(0, s1) + t.slice(s2);

// Fix braces
const lines = t.split('\n');
for (let i = lines.length - 8; i < lines.length; i++) {
  if (lines[i] && lines[i].trim() === ');' && lines[i+1] && lines[i+1].trim() === ');') lines[i] = '';
}
let bc = 0;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i] && lines[i].trim() === '}') { if (bc >= 1) lines[i] = ''; bc++; }
  else if (lines[i] && lines[i].trim()) break;
}
t = lines.join('\n');

// Remove dupe turnsInChapterRef
const f1 = t.indexOf('turnsInChapterRef = useRef');
const f2 = t.indexOf('turnsInChapterRef = useRef', f1 + 10);
if (f2 > 0) { let ls = f2; while (ls > 0 && t[ls-1] !== '\n') ls--; let le = f2; while (le < t.length && t[le] !== '\n') le++; t = t.slice(0, ls) + t.slice(le + 1); }

// Fix: use inputText directly, bypass segments
t = t.replace(
  'if (segments.length === 0 || isGenerating) return;',
  'if (!inputText.trim() || isGenerating) return;'
);

t = t.replace(
  "const finalText = segments.map(s => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\\n');",
  "const text = inputText.trim(); setInputText(''); const finalText = '[行动] ' + text;"
);

t = t.replace('setSegments([]);\n', '');

// Fix button: disabled only on isGenerating
t = t.replace(
  'disabled={segments.length === 0 || isGenerating}',
  'disabled={isGenerating}'
);

t = t.replace(
  '(segments.length === 0 || isGenerating) && st.sendBtnOff',
  'false && st.sendBtnOff'
);

// Add await after setMessages to yield
t = t.replace(
  'setMessages(msgsWithUser);\n    smartScroll();',
  'setMessages(msgsWithUser);\n    await new Promise(r => setTimeout(r, 10));\n    smartScroll();'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed with yield');
