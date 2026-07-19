const { execSync } = require('child_process');
const raw = execSync('gh api repos/PocketRisu/PocketRisu/contents/src/ts/process/memory/hypav3.ts --jq ".content"', { encoding: 'utf8' }).trim();
const clean = raw.replace(/^"|"$/g, '');
const text = Buffer.from(clean, 'base64').toString('utf8');
console.log(text.slice(0, 6000));
