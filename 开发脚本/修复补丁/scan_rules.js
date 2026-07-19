const fs = require('fs'), path = require('path'), results = [];

function search(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'android' && e.name !== '.git') {
      search(p);
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      const t = fs.readFileSync(p, 'utf8');
      let pos = 0;
      while ((pos = t.indexOf('.rules', pos)) >= 0) {
        const after = t.slice(pos + 6, pos + 20).trim();
        // 检查是否没有可选链保护且不是注释里的
        if (after && /^\.\w/.test(after) && !after.startsWith('?.')) {
          const lines = t.slice(0, pos).split('\n');
          const ln = lines.length;
          const snip = t.slice(Math.max(0, pos - 40), Math.min(t.length, pos + 50)).replace(/\n/g, '\\n');
          const rel = p.replace('D:\\koyoi\\', '');
          results.push(`${rel}:${ln}: ${snip}`);
        }
        pos++;
      }
    }
  }
}

search('D:/koyoi/src');
if (results.length === 0) console.log('No unprotected .rules accesses');
else results.forEach(r => console.log(r));
