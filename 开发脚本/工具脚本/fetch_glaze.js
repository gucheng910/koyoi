const { execSync } = require('child_process');
const raw = execSync('gh api repos/hydall/Glaze/readme --jq ".content"', { encoding: 'utf8' }).trim();
const clean = raw.replace(/^"|"$/g, '');
const text = Buffer.from(clean, 'base64').toString('utf8');
console.log(text.slice(0, 3000));
