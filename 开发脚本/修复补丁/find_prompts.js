const fs = require('fs'), path = require('path');

function search(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of entries) {
    const p = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== 'node_modules' && f.name !== 'android' && f.name !== '.expo' && f.name !== '__tests__') {
      search(p);
    } else if (f.name.endsWith('.ts') || f.name.endsWith('.tsx')) {
      const t = fs.readFileSync(p, 'utf8');
      let i = 0;
      const results = [];
      while ((i = t.indexOf("role: 'system'", i)) >= 0) {
        let end = t.indexOf("role: 'user'", i + 20);
        if (end < 0) end = Math.min(t.length, i + 600);
        const snip = t.slice(i, end).replace(/\n/g, '\\n').slice(0, 300);
        const ln = t.slice(0, i).split('\n').length;
        results.push(`${p.replace('D:\\koyoi\\', '')}:${ln}: ${snip}`);
        i += 10;
      }
      results.forEach(r => console.log(r + '\n---'));
    }
  }
}

search('D:/koyoi/src');
