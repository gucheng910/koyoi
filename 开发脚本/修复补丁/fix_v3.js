const fs = require('fs');

// === 1. 扩展修复诊断 - 覆盖更多崩溃类型 ===
let eb = fs.readFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', 'utf8');

// 替换修复逻辑中的检测部分
eb = eb.replace(
  "let brokenIdx = -1;\n      for (let i = 0; i < sessions.length; i++) {\n        const s = sessions[i];\n        if (s?.world && (!s.world.rules || typeof s.world.rules !== 'object')) {\n          brokenIdx = i; break;\n        }\n      }\n      if (brokenIdx < 0) { setStatus('未找到可修复的世界（数据看起来是完整的）'); setRepairing(false); return; }",
  "let brokenIdx = -1;\n      let brokenReason = '';\n      for (let i = 0; i < sessions.length; i++) {\n        const s = sessions[i];\n        if (!s?.id) continue;\n        // 多种损坏检测\n        if (!s.world || typeof s.world !== 'object' || Array.isArray(s.world)) { brokenIdx = i; brokenReason = 'world 字段损坏（非对象）'; break; }\n        if (!s.world.rules || typeof s.world.rules !== 'object') { brokenIdx = i; brokenReason = 'world.rules 缺失'; break; }\n        if (s.messages && !Array.isArray(s.messages)) { brokenIdx = i; brokenReason = 'messages 非数组'; break; }\n        if (s.selectedCharacters && !Array.isArray(s.selectedCharacters)) { brokenIdx = i; brokenReason = 'selectedCharacters 非数组'; break; }\n        // 深度检查：world 对象中存在 undefined 的数组字段\n        for (const key of ['locations', 'timeline', 'characters']) {\n          if (typeof s.world[key] === 'undefined') { brokenIdx = i; brokenReason = 'world.' + key + ' 为 undefined'; break; }\n        }\n        if (brokenIdx >= 0) break;\n      }\n      if (brokenIdx < 0) { setStatus('未找到明显损坏的世界。尝试修复 error message 中提到的字段...'); \n        // 兜底：对第一个有 world 的 session 做通用修复\n        for (let i = 0; i < sessions.length; i++) { if (sessions[i]?.id && sessions[i]?.world) { brokenIdx = i; brokenReason = '通用修复'; break; } }\n      }\n      if (brokenIdx < 0) { setStatus('没有可修复的世界数据（存储为空）'); setRepairing(false); return; }"
);

// 更新状态消息
eb = eb.replace(
  "setStatus('备份并修复 ' + broken.world?.name || '未知世界');",
  "const brokenName = broken.world?.name || broken.world?.novelTitle || '未知世界';\n      setStatus('修复 ' + brokenName + '（' + brokenReason + '）...');"
);

fs.writeFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', eb);

// === 2. 最强防卫: 在 ErrorBoundary 中添加「强行规范化全部世界」按钮 ===
eb = eb.replace(
  "{!repairing && !repaired && !status && (\n        <TouchableOpacity style={styles.repairBtn} onPress={handleRepair}>\n          <Text style={styles.repairBtnText}>🤖 AI 智能修复</Text>\n        </TouchableOpacity>\n      )}",
  "{!repairing && !repaired && !status && (\n        <>\n        <TouchableOpacity style={styles.repairBtn} onPress={handleRepair}>\n          <Text style={styles.repairBtnText}>🤖 AI 智能修复</Text>\n        </TouchableOpacity>\n        <TouchableOpacity style={styles.btn} onPress={async () => {\n          setRepairing(true); setStatus('正在规范化全部世界数据...');\n          try {\n            const raw = await AsyncStorage.getItem('@koyoi_world_sessions');\n            if (!raw) { setStatus('存储为空'); setRepairing(false); return; }\n            const sessions = JSON.parse(raw);\n            if (!Array.isArray(sessions)) { setStatus('数据格式错误'); setRepairing(false); return; }\n            let fixed = 0;\n            for (let i = 0; i < sessions.length; i++) {\n              const s = sessions[i];\n              if (!s?.id) continue;\n              if (typeof s.world !== 'object' || !s.world || Array.isArray(s.world)) { s.world = { name: '修复的世界', type: 'custom', rules: {}, locations: [], timeline: [], characters: [], writingStyle: '' }; fixed++; }\n              const w = s.world;\n              if (!w.name) w.name = '修复的世界';\n              if (!w.type) w.type = 'custom';\n              if (!w.rules || typeof w.rules !== 'object') { w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' }; fixed++; }\n              if (!Array.isArray(w.locations)) { w.locations = []; fixed++; }\n              if (!Array.isArray(w.timeline)) { w.timeline = []; fixed++; }\n              if (!Array.isArray(w.characters)) { w.characters = []; fixed++; }\n              if (!Array.isArray(s.selectedCharacters)) { s.selectedCharacters = []; fixed++; }\n              if (!Array.isArray(s.npcs)) { s.npcs = []; fixed++; }\n              if (!Array.isArray(s.messages)) { s.messages = []; fixed++; }\n              if (!Array.isArray(s.worldLog)) { s.worldLog = []; fixed++; }\n              if (!s.currentScene) s.currentScene = '';\n            }\n            await AsyncStorage.setItem('@koyoi_world_sessions', JSON.stringify(sessions));\n            setStatus('已修复 ' + fixed + ' 个字段，可重试进入');\n          } catch (e) { setStatus('修复失败: ' + (e.message || '')); }\n          setRepairing(false);\n        }}>\n          <Text style={styles.btnText}>🔧 强制规范化（无需 AI）</Text>\n        </TouchableOpacity>\n        </>\n      )}"
);

fs.writeFileSync('D:/koyoi/src/components/ErrorBoundary.tsx', eb);

// === 3. WorldChatScreen 初始化加 try-catch ===
let ws = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 查找 useEffect 中的初始化代码并包裹 try-catch
const initPattern = /(useEffect\(\s*\(\)\s*=>\s*\{)\s*(const session = )/;
if (initPattern.test(ws)) {
  ws = ws.replace(initPattern, '$1\n    try {\n    $2');
  // 找到对应的 }, []) 并添加 catch
  ws = ws.replace(/(\},?\s*\[\])/, '    } catch (e: any) { console.warn("[WorldChat] init error:", e.message); }\n$1');
}

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', ws);

console.log('fixes applied');
