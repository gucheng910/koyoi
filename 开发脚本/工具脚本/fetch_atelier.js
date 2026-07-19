const { execSync } = require('child_process');
const raw = JSON.parse(execSync('gh api repos/infinitimeless/The-Novelists-Atelier/readme --jq ".content"', { encoding: 'utf8' }));
const text = Buffer.from(raw.content.replace(/\n/g, ''), 'base64').toString('utf8');
console.log(text.slice(0, 4000));
