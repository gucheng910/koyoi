const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

t = t.replace(
  '{worldCard.characters.length > 0 && (',
  '{(worldCard.characters || []).length > 0 && ('
);
t = t.replace(
  '<Text style={st.btnText}>📋 知识库查看（{worldCard.characters.length}角色 / {worldCard.timeline.length}事件）</Text>',
  '<Text style={st.btnText}>📋 知识库查看（{(worldCard.characters||[]).length}角色 / {(worldCard.timeline||[]).length}事件）</Text>'
);
t = t.replace(
  '<Text style={{ fontSize: 13, fontWeight: \'700\', color: \'#5577aa\', marginBottom: 8 }}>角色 ({worldCard.characters.length}人)</Text>',
  '<Text style={{ fontSize: 13, fontWeight: \'700\', color: \'#5577aa\', marginBottom: 8 }}>角色 ({(worldCard.characters||[]).length}人)</Text>'
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('length protections added');
