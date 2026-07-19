const fs = require('fs');
let eb = fs.readFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', 'utf8');

// Replace the repair logic to check BOTH storage keys
// Fix the AI repair: try koyoi_world_sessions first, then koyoi_custom_worlds
eb = eb.replace(
  "const raw = await AsyncStorage.getItem('@koyoi_world_sessions');\n      if (!raw) { setStatus('没有可修复的世界数据'); setRepairing(false); return; }\n      const sessions = JSON.parse(raw);\n      if (!Array.isArray(sessions) || sessions.length === 0) { setStatus('世界列表为空'); setRepairing(false); return; }",
  "// 尝试两个存储键\n      let raw = await AsyncStorage.getItem('@koyoi_world_sessions');\n      let storeKey = '@koyoi_world_sessions';\n      if (!raw) {\n        raw = await AsyncStorage.getItem('@koyoi_custom_worlds');\n        storeKey = '@koyoi_custom_worlds';\n      }\n      if (!raw) { setStatus('未找到任何世界数据（两个存储均为空）。请先创建一个世界。'); setRepairing(false); return; }\n      let sessions = JSON.parse(raw);\n      if (!Array.isArray(sessions) || sessions.length === 0) { setStatus('数据格式异常或为空'); setRepairing(false); return; }"
);

// Fix the save path
eb = eb.replace(
  "await AsyncStorage.setItem('@koyoi_world_sessions', JSON.stringify(sessions));\n      setRepaired(true);",
  "await AsyncStorage.setItem(storeKey, JSON.stringify(sessions));\n      setRepaired(true);"
);

// Fix the force normalize too
eb = eb.replace(
  "const raw = await AsyncStorage.getItem('@koyoi_world_sessions');\n            if (!raw) { setStatus('存储为空'); setRepairing(false); return; }\n            const sessions = JSON.parse(raw);\n            if (!Array.isArray(sessions)) { setStatus('数据格式错误'); setRepairing(false); return; }",
  "let raw = await AsyncStorage.getItem('@koyoi_world_sessions');\n            let storeKey = '@koyoi_world_sessions';\n            if (!raw) { raw = await AsyncStorage.getItem('@koyoi_custom_worlds'); storeKey = '@koyoi_custom_worlds'; }\n            if (!raw) { setStatus('存储为空（两个键均无数据）'); setRepairing(false); return; }\n            const sessions = JSON.parse(raw);\n            if (!Array.isArray(sessions)) { setStatus('数据格式错误'); setRepairing(false); return; }"
);

eb = eb.replace(
  "await AsyncStorage.setItem('@koyoi_world_sessions', JSON.stringify(sessions));\n            setStatus('已修复 ' + fixed + ' 个字段，可重试进入');",
  "await AsyncStorage.setItem(storeKey, JSON.stringify(sessions));\n            setStatus('已修复 ' + fixed + ' 个字段，可重试进入');"
);

// Also fix the "没有可修复的世界数据" check to be more helpful
eb = eb.replace(
  "if (brokenIdx < 0) { setStatus('未找到可修复的世界数据（数据看起来是完整的）'); setRepairing(false); return; }",
  "if (brokenIdx < 0) { setStatus('未找到明显损坏（数据可能完整但渲染出错）。试强制规范化。'); setRepairing(false); return; }"
);

fs.writeFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', eb);
console.log('fixed dual storage keys');
