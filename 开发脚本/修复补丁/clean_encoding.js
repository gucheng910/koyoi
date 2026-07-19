const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// Remove the old detectAndDecode function
const fnStart = t.indexOf('function detectAndDecode');
const fnEnd = t.indexOf('\nimport {', fnStart);
t = t.slice(0, fnStart) + t.slice(fnEnd);

// Replace import of gbkDecode with normalizeEncoding
t = t.replace(
  "import { gbkDecode } from '../services/gbkDecoder';",
  "import { normalizeEncoding } from '../services/encoding';"
);

// Replace detectAndDecode calls with normalizeEncoding
t = t.replace(/detectAndDecode\(/g, 'normalizeEncoding(');

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('simplified to normalizeEncoding');
