const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/prompts/characters/presets.ts', 'utf8');

// Fix double quotes inside single-quoted strings in characters  
t = t.replace("别过脸\"", "别过脸'");
t = t.replace("落在地上\"", "落在地上'");

fs.writeFileSync('D:/koyoi/src/prompts/characters/presets.ts', t);
console.log('fixed');
