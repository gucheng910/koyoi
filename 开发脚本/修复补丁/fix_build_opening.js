const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 1. 降低 maxTokens 到合理值 (65536 → 4096)
t = t.replace(
  'maxTokens: 65536, safetyFilter: \'off\' as const',
  'maxTokens: 4096, safetyFilter: \'off\' as const'
);

// 2. 给 buildOpening 加超时和更好的错误提示
t = t.replace(
  'try {\n      const raw = await chatCompletionSync(cfg, prompt, { temperature: 0.8 });',
  'try {\n      const controller = new AbortController();\n      const timeout = setTimeout(() => controller.abort(), 60000); // 60s 超时\n      const raw = await chatCompletionSync(cfg, prompt, { temperature: 0.8, maxTokens: 4096, signal: controller.signal });\n      clearTimeout(timeout);'
);

// 3. 改进 catch 错误提示
t = t.replace(
  "catch (e: any) { setBuilding(false); setToast({msg: '开场生成失败: ' + (e.message || ''), type: 'error'}); setStep('config'); }",
  "catch (e: any) {\n      clearTimeout(typeof timeout !== 'undefined' ? timeout : 0);\n      setBuilding(false);\n      const msg = e.name === 'AbortError' ? '开场生成超时（60秒），请检查网络或换个时间重试' : '开场生成失败: ' + (e.message || '');\n      setToast({msg, type: 'error'});\n      setStep('config');\n    }"
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('timeout + maxTokens fix applied');
