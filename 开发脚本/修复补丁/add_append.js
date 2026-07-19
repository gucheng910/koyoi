const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// Insert appendFile after the pickFile closing brace
const marker = "checkPartial(worldId);\n    } catch (e: any) { console.log('[KOYOI] pickFile ERROR:', e.message || String(e)); setProcessing(false); setToast({msg: '文件处理失败: ' + (e.message || String(e)), type: 'error'}); }\n  };";
const appendFn = `\n\n  const appendFile = async () => {
    if (processing || !novelText) return;
    setProcessing(true);
    setParsingStatus('正在选择追加文件...');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) { setProcessing(false); setParsingStatus(''); return; }
      const file = result.assets[0];
      setParsingStatus('正在读取追加文件...');
      const fetchResp = await fetch(file.uri);
      const rawBytes = new Uint8Array(await fetchResp.arrayBuffer());
      const appendContent = detectAndDecode(rawBytes);
      if (!appendContent || appendContent.length < 100) { setToast({msg:'追加文件内容过短', type:'error'}); setProcessing(false); return; }
      setParsingStatus('正在扫描追加章节...');
      const appendChapters = detectChapters(appendContent);
      if (appendChapters.length === 0) { setToast({msg:'追加文件中未检测到章节', type:'error'}); setProcessing(false); return; }
      const offset = novelText.length + 1;
      const shifted = appendChapters.map(c => ({ ...c, index: c.index + (novelMeta?.chapterCount || 0), startChar: c.startChar + offset, endChar: c.endChar + offset }));
      const mergedChapters = [...(novelMeta?.chapters || []), ...shifted].sort((a, b) => a.index - b.index).map((c, i) => ({ ...c, index: i }));
      const mergedText = novelText + '\\n' + appendContent;
      const mergedMeta = { ...novelMeta!, chapters: mergedChapters, chapterCount: mergedChapters.length, totalChars: mergedText.length };
      setNovelText(mergedText);
      setNovelMeta(mergedMeta as any);
      setFileName(prev => prev + ' + ' + file.name);
      setToast({msg: '已追加 ' + appendChapters.length + ' 章，共 ' + mergedChapters.length + ' 章', type:'success'});
    } catch (e: any) { setToast({msg:'追加失败: ' + (e.message || ''), type:'error'}); }
    setProcessing(false); setParsingStatus('');
  };`;

t = t.replace(marker, marker + appendFn);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('appendFile added');
