const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/services/sendPipeline.ts', 'utf8');
t = t.replace(
  "require('@react-native-async-storage/async-storage')",
  "require('@react-native-async-storage/async-storage').default"
);
fs.writeFileSync('D:/koyoi/src/services/sendPipeline.ts', t);
console.log('AsyncStorage require fixed');
