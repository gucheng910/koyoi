const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 重写 buildOpening 的 try/catch，timeout 提升到外部作用域
t = t.replace(
  'if (!cfg?.apiKey) { setToast({msg:\'请先配置API Key\', type:\'error\'}); setBuilding(false); return; }\n    setStep(\'opening\');\n    setParsingStatus(\'AI 正在构建世界圣经...\');',
  'if (!cfg?.apiKey) { setToast({msg:\'请先配置API Key\', type:\'error\'}); setBuilding(false); return; }\n    setStep(\'opening\');\n    setParsingStatus(\'AI 正在构建世界圣经...\');\n    console.log(\'[KOYOI] buildOpening start, model:\', cfg.model);'
);

// 替换超时逻辑
t = t.replace(
  /let timeout;[\s\S]*?startGame\(data\.worldBible/,
  ''
);
t = t.replace(
  'try {\n      const controller = new AbortController();\n      const timeout = setTimeout(() => controller.abort(), 60000); // 60s 超时\n      const raw = await chatCompletionSync(cfg, prompt, { temperature: 0.8, maxTokens: 4096, signal: controller.signal });\n      clearTimeout(timeout);\n      const data = safeParseJSON(raw) || {};\n      startGame(data.worldBible',
  'let timeoutId: any;\n    try {\n      console.log(\'[KOYOI] calling API for opening...\');\n      const controller = new AbortController();\n      timeoutId = setTimeout(() => { console.log(\'[KOYOI] buildOpening timeout, aborting\'); controller.abort(); }, 90000);\n      setParsingStatus(\'AI ??? ...\');\n      const raw = await chatCompletionSync(cfg, prompt, { temperature: 0.8, maxTokens: 4096, signal: controller.signal });\n      clearTimeout(timeoutId);\n      console.log(\'[KOYOI] API response len:\', raw.length);\n      const data = safeParseJSON(raw) || {};\n      console.log(\'[KOYOI] parsed, keys:\', Object.keys(data).join(\',\'));\n      startGame(data.worldBible'
);

t = t.replace(
  'catch (e: any) {\n      clearTimeout(typeof timeout !== \'undefined\' ? timeout : 0);\n      setBuilding(false);\n      const msg = e.name === \'AbortError\' ? \'开场生成超时（60秒），请检查网络或换个时间重试\' : \'开场生成失败: \' + (e.message || \'\');\n      setToast({msg, type: \'error\'});\n      setStep(\'config\');\n    }',
  'catch (e: any) {\n      if (timeoutId) clearTimeout(timeoutId);\n      console.log(\'[KOYOI] buildOpening error:\', e.name, e.message);\n      setBuilding(false);\n      const msg = e.name === \'AbortError\' ? \'AI          60   \' : \'   : \' + (e.message || \'\');\n      showAlert(\'   \', msg, [{text:\'  \', onPress: () => setStep(\'config\')}]);\n      setStep(\'config\');\n    }'
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('logs + timeout fix applied');
