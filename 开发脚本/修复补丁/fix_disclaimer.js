const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/components/DisclaimerScreen.tsx', 'utf8');

// Fix the card to have a fixed height so ScrollView can scroll
t = t.replace(
  "card: { backgroundColor: c.bg, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80%', borderWidth: 1, borderColor: c.border },",
  "card: { backgroundColor: c.bg, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, height: '70%', borderWidth: 1, borderColor: c.border },"
);

fs.writeFileSync('D:/koyoi/src/components/DisclaimerScreen.tsx', t);
console.log('fixed height');
