const { execSync } = require('child_process');
const raw = execSync('gh api repos/PocketRisu/PocketRisu/contents/src/ts/process/memory/hypamemory.ts --jq ".content"', { encoding: 'utf8' }).trim();
const clean = raw.replace(/^"|"$/g, '');
const text = Buffer.from(clean, 'base64').toString('utf8');
// Just get the key parts - interfaces and core functions
const lines = text.split('\n');
const interesting = lines.filter(l => l.includes('export') || l.includes('interface') || l.includes('function') || l.includes('class') || l.includes('memoryVector'));
console.log(interesting.join('\n').slice(0, 2000));
