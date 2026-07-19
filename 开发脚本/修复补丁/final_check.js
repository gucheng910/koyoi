const fs = require('fs'), path = require('path');
const bad = ['肉棒','蜜穴','鸡巴','淫水','抽插','射精','口交','肛交','颜射','奸淫','强奸','操你','骚逼','性欲','性癖','性反应','性偏好','性观念'];
const results = [];

function scan(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'android' && e.name !== '.expo') scan(p);
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx') || e.name.endsWith('.json')) {
      const t = fs.readFileSync(p, 'utf8');
      bad.forEach(w => {
        const c = t.split(w).length - 1;
        if (c > 0) results.push(w + ' in ' + p.replace('C:/Users/windows11/Desktop/KoyoiGitHub/', '') + ': ' + c);
      });
    }
  });
}

scan('C:/Users/windows11/Desktop/KoyoiGitHub/src');

// Also check root files
['App.tsx', 'app.json', 'package.json'].forEach(f => {
  const pf = 'C:/Users/windows11/Desktop/KoyoiGitHub/' + f;
  if (fs.existsSync(pf)) {
    const t = fs.readFileSync(pf, 'utf8');
    bad.forEach(w => {
      const c = t.split(w).length - 1;
      if (c > 0) results.push(w + ' in ' + f);
    });
  }
});

if (results.length === 0) console.log('ALL CLEAN ✅');
else results.forEach(r => console.log(r));
