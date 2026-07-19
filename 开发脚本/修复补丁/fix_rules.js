const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/services/composer.ts', 'utf8');
t = t.replace('w.rules.physics', 'w.rules?.physics || ""');
t = t.replace('w.rules.technology', 'w.rules?.technology || ""');
t = t.replace('w.rules.society', 'w.rules?.society || ""');
t = t.replace('w.rules.morality', 'w.rules?.morality || ""');
t = t.replace('w.rules.sexualNorms', 'w.rules?.sexualNorms || ""');
fs.writeFileSync('D:/koyoi/src/services/composer.ts', t);
console.log('fixed composer.ts');
