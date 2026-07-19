const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Remove Clipboard import
t = t.replace("import * as Clipboard from 'expo-clipboard';\n", '');

// Replace Clipboard calls with simple toast
t = t.replace(
  "Clipboard.setStringAsync(item.content); setToast({ msg: '已复制', type: 'success' });",
  "setToast({ msg: '长按文字可复制', type: 'info' });"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed');
