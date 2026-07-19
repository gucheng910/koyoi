const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// Add import for appendToWorld
t = t.replace(
  "import { loadKnowledgeBase } from '../services/knowledgeBase';",
  "import { loadKnowledgeBase } from '../services/knowledgeBase';\nimport { appendToWorld } from '../services/novelAppend';"
);

// Add appendWorld function (after the checkPartial function)
const appendWorldFn = `
  const appendToExistingWorld = async (worldId: string, worldName: string) => {
    const cfg = (() => { const c = configStore.getActiveConfig(); return c ? { ...c, model: analysisModel, temperature: 0.2, thinkingMode: 'disabled' as const, maxTokens: 16384, safetyFilter: 'off' as const } : null; })();
    if (!cfg?.apiKey) { setToast({msg: '请先配置API Key', type: 'error'}); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setParsingStatus('正在读取追加文件...');
      const fetchResp = await fetch(file.uri);
      const rawBytes = new Uint8Array(await fetchResp.arrayBuffer());
      const content = detectAndDecode(rawBytes);
      if (!content || content.length < 100) { setToast({msg:'文件内容过短', type:'error'}); setParsingStatus(''); return; }
      setStep('parsing');
      const res = await appendToWorld(cfg, worldId, content, undefined, (msg) => setParsingStatus(msg));
      setToast({msg: '追加完成！新增 ' + res.newCharacters + ' 角色，' + res.newEvents + ' 事件，共 ' + res.chapterCount + ' 章', type: 'success'});
      setStep('upload');
      loadWorlds();
    } catch (e: any) { setToast({msg: '追加失败: ' + (e.message || ''), type: 'error'}); setParsingStatus(''); setStep('upload'); }
  };`;

// Insert after analyzeChapters or similar
const marker = "async function checkPartial";
t = t.replace(marker, appendWorldFn + '\n\n  ' + marker);

// Add append button to each saved world card - Replace the onLongPress with append + delete
const cardPattern = /(<TouchableOpacity key=\{w\.id\} style=\{\[st\.btn, \{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, marginBottom: 8, width: '100%' \}\]\} \s*onPress=\{\(\) => \{[\s\S]*?\}\} onLongPress=\{\(\) => deleteSavedWorld\(w\)\}>)/;
t = t.replace(cardPattern, (match) => {
  return match.replace("onLongPress={() => deleteSavedWorld(w)}>", 
    "onLongPress={() => deleteSavedWorld(w)}>\n" +
    "                    <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#5B9BD522', marginRight: 8 }} onPress={(e) => { e.stopPropagation(); appendToExistingWorld(w.id, w.novelTitle); }}>\n" +
    "                      <Text style={{ fontSize: 10, color: '#5B9BD5' }}>＋追加</Text>\n" +
    "                    </TouchableOpacity>"
  );
});

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('append UI added');
