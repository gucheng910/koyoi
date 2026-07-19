const fs = require('fs'), path = require('path');

function search(dir, results) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'android' && e.name !== '.expo' && e.name !== '__tests__') {
      search(p, results);
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      const t = fs.readFileSync(p, 'utf8');
      let i = 0;
      while ((i = t.indexOf('deepseek-v4-flash', i)) >= 0) {
        const ctx = t.slice(Math.max(0, i - 80), i + 120).replace(/\n/g, ' | ');
        const ln = t.slice(0, i).split('\n').length;
        results.push(p.replace('D:/koyoi/', '') + ':' + ln + ': ' + ctx.trim());
        i += 20;
      }
    }
  });
}

const results = [];
search('D:/koyoi/src', results);
results.forEach(r => console.log(r + '\n---'));
console.log('\nTotal hardcoded references:', results.length);
