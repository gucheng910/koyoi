const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 替换「分析数据不完整」页面中的"重新分析"按钮行为：
// 不回到 split_done（文件已丢失），而是直接用已有数据引发一次新的知识库提取
t = t.replace(
  "onPress={() => setStep('split_done')}",
  "onPress={() => { if (worldCard.id) loadKnowledgeBase(worldCard.id).then(kb => { if (kb && kb.characters.length > 0) { const card = buildWorldCardFromKB(kb, novelMeta); if (card.characters.length > 0 || card.timeline.length > 0) { setWorldCard(card); setStep('config'); } else setStep('upload'); } else setStep('upload'); }).catch(() => setStep('upload')); }}"
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('reanalyze path fixed');
