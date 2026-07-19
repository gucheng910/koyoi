const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Fix the broken line - find it by the unique text
t = t.replace(
  "角色列表。`,('",
  "角色列表。`,\n          POST_HISTORY_BASE,\n        ].join('"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);

// Verify
const lines = t.split('\n');
for (let i = 233; i < 238; i++) {
  console.log((i+1) + ':', lines[i] ? lines[i].slice(0, 80) : '(empty)');
}
