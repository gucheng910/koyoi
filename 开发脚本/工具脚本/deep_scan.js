const fs = require('fs'), path = require('path');
const results = [];

function scan(dir, prefix) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'android' && e.name !== '.expo' && e.name !== '__tests__' && e.name !== 'vendor') {
      scan(p, prefix + e.name + '/');
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      const t = fs.readFileSync(p, 'utf8');
      const lines = t.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const fname = prefix + e.name;
        
        // 1. setState inside useEffect without cleanup
        // (already checked above)
        
        // 2. Missing optional chaining on data that could be null
        if (l.match(/\.length\b/) && !l.includes('?.length') && !l.includes('|| []') && !l.includes('|| \'\'') && !l.includes('Array.isArray(')) {
          const before = t.slice(Math.max(0, i-2), i).match(/if\s*\(.+?\)/);
          if (!before) {
            results.push({ file: fname, line: i+1, issue: 'unprotected .length', code: l.trim().slice(0, 80) });
          }
        }
        
        // 3. useEffect without cleanup (setInterval/addEventListener)
        if (l.includes('setInterval(') && !t.slice(i, i+200).includes('clearInterval')) {
          results.push({ file: fname, line: i+1, issue: 'setInterval without clearInterval', code: l.trim().slice(0, 80) });
        }
        
        // 4. Dangerous map without key
        if (l.match(/\.map\(.*=>/) && l.includes('return') && !t.slice(Math.max(0,i-5), i+5).join('\n').includes('key=') && !t.slice(Math.max(0,i-20), i).join('\n').includes('FlatList') && !t.slice(Math.max(0,i-20), i).join('\n').includes('keyExtractor')) {
          results.push({ file: fname, line: i+1, issue: 'map without key', code: l.trim().slice(0, 80) });
        }
      }
      
      // 5. Check for require('./something') that might fail
      const reqs = t.match(/require\(['"]\.\//g);
      if (reqs) {
        for (const r of reqs) {
          const modPath = t.slice(t.indexOf(r) + 9, t.indexOf("'", t.indexOf(r) + 10));
          // Skip if it's a relative import
        }
      }
    }
  });
}

scan('D:/koyoi/src/screens', '');
scan('D:/koyoi/src/services', '');

// Show unique results, limited
const unique = results.filter((r, i) => results.findIndex(x => x.file === r.file && x.line === r.line) === i);
unique.slice(0, 15).forEach(r => console.log(r.file + ':' + r.line + ': ' + r.issue + '\n  ' + r.code + '\n'));

if (unique.length === 0) console.log('No issues found');
else console.log('Total:', unique.length, 'issues');
