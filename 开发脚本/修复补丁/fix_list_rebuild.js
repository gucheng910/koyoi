const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 替换已分析世界列表的点击行为：从知识库重建完整数据
const oldClick = "onPress={() => { setWorldCard(w); setStep('config'); }}";
const newClick = `onPress={() => {
                    setParsingStatus('正在加载知识库...');
                    loadKnowledgeBase(w.id).then(kb => {
                      setParsingStatus('');
                      if (kb && kb.characters && kb.characters.length > 0) {
                        const card = buildWorldCardFromKB(kb, novelMeta);
                        setWorldCard(card);
                      } else {
                        setWorldCard(w);
                      }
                      setStep('config');
                    }).catch(() => {
                      setParsingStatus('');
                      setWorldCard(w);
                      setStep('config');
                    });
                  }}`;

t = t.replace(oldClick, newClick);

// 同时更新列表中的字符数显示为知识库中的实际数量
t = t.replace(
  "<Text style={{ color: '#888', fontSize: 11 }}>{w.characters?.length || 0}角色</Text>",
  "<Text style={{ color: '#888', fontSize: 11 }}>{(w.characters?.length || 0) > 0 ? w.characters.length + '角色' : ''}{!w._normalized ? '' : ''}</Text>"
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('kb rebuild on click');
