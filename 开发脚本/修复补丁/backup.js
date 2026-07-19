const fs = require('fs');
const path = require('path');

const src = 'D:/koyoi/src';
const dst = 'C:/Users/windows11/Desktop/KoyoiApp/src';

function copyDir(s, d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(s)) {
    const sp = path.join(s, f);
    const dp = path.join(d, f);
    if (fs.statSync(sp).isDirectory()) {
      if (f === 'node_modules' || f === 'android' || f === '.expo' || f === '.git') continue;
      copyDir(sp, dp);
    } else {
      fs.copyFileSync(sp, dp);
    }
  }
}

copyDir(src, dst);
console.log('src/ backed up');

// Copy root files
const rootFiles = ['App.tsx', 'app.json', 'package.json'];
for (const f of rootFiles) {
  const p = 'D:/koyoi/' + f;
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, 'C:/Users/windows11/Desktop/KoyoiApp/' + f);
    console.log(f, 'backed up');
  } else {
    console.log(f, 'NOT FOUND');
  }
}

// Also copy assets
const assetSrc = 'D:/koyoi/assets';
const assetDst = 'C:/Users/windows11/Desktop/KoyoiApp/assets';
if (fs.existsSync(assetSrc)) {
  copyDir(assetSrc, assetDst);
  console.log('assets/ backed up');
}

console.log('\nBackup complete');
