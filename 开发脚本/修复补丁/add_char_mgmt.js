const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 1. Import INTERACTION_TOOL
t = t.replace(
  "import { simulateCharacters } from '../services/characterSimulator';",
  "import { simulateCharacters, INTERACTION_TOOL } from '../services/characterSimulator';"
);

// 2. Pass INTERACTION_TOOL to simulation and handle pull_in/push_out
t = t.replace(
  "const result = await simulateCharacters(cfg, chars, session.currentScene, (session.recentWorldEvents || []).slice(-2).join('；'), activeChars.current.join('、'), lastSimResults.current, simKbContext);",
  "const result = await simulateCharacters(cfg, chars, session.currentScene, (session.recentWorldEvents || []).slice(-2).join('；'), activeChars.current.join('、'), lastSimResults.current, simKbContext);\n            // 处理拉入/推出\n            for (const ch of result.interactionChanges) {\n              if (ch.action === 'pull_in' && ch.character_name && !activeChars.current.includes(ch.character_name)) {\n                activeChars.current.push(ch.character_name);\n                // 如果不在 npcs 里，从原著角色中查找并加入\n                const worldChars = (session.world as any)?.characters || [];\n                const existingNpc = (session.npcs || []).find(n => n.name === ch.character_name);\n                const inSelected = session.selectedCharacters.some(c => c.name === ch.character_name);\n                if (!existingNpc && !inSelected) {\n                  const wc = worldChars.find((wc: any) => wc.name === ch.character_name);\n                  const newNpc = wc ? {\n                    name: wc.name, role: wc.relationship?.status || wc.role || '原著角色',\n                    personality: (wc.personality?.traits || ['未知']).join('/'),\n                    currentStatus: '刚刚出现', goal: '',\n                  } : { name: ch.character_name, role: '原著角色', personality: '未知', currentStatus: '刚刚出现', goal: '' };\n                  setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc] }));\n                }\n                // 添加世界事件\n                const event = ch.narrative || (ch.character_name + '出现了');\n                setSession(prev => ({ ...prev, recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), event] }));\n              } else if (ch.action === 'push_out' && ch.character_name) {\n                activeChars.current = activeChars.current.filter(n => n !== ch.character_name);\n                const event = ch.narrative || (ch.character_name + '离开了');\n                setSession(prev => ({ ...prev, recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), event] }));\n              }\n            }"
);

// 3. Add ___META___ parsing for new characters from narrator AI
t = t.replace(
  "if (raw) {\n        const msg: ChatMessage = { role: 'assistant', content: raw, timestamp: new Date().toISOString() };",
  "if (raw) {\n        // 解析 ___META___：叙事AI可能引入新角色\n        let displayText = raw;\n        const metaMatch = raw.match(/___META___\\s*(\\{[\\s\\S]*\\})/);\n        if (metaMatch) {\n          try {\n            const meta = JSON.parse(metaMatch[1]);\n            displayText = raw.replace(/___META___[\\s\\S]*$/, '').trim();\n            // 新角色引入\n            if (meta.newCharacter && typeof meta.newCharacter === 'string') {\n              const name = meta.newCharacter;\n              const inScene = session.selectedCharacters.some(c => c.name === name) || (session.npcs||[]).some(n => n.name === name);\n              if (!inScene) {\n                const worldChars = (session.world as any)?.characters || [];\n                const wc = worldChars.find((wc: any) => wc.name === name);\n                const newNpc = wc ? {\n                  name: wc.name, role: wc.relationship?.status || wc.role || '原著角色',\n                  personality: (wc.personality?.traits || ['未知']).join('/'),\n                  currentStatus: '刚刚进入场景', goal: '',\n                } : { name, role: '原著角色', personality: '未知', currentStatus: '刚刚进入场景', goal: '' };\n                setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc], recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), name + '进入了场景'] }));\n                if (!activeChars.current.includes(name)) activeChars.current.push(name);\n              }\n            }\n            // 世界状态更新\n            if (meta.worldFlags) for (const [k, v] of Object.entries(meta.worldFlags)) { /* 存储 */ }\n          } catch {}\n        }\n        const msg: ChatMessage = { role: 'assistant', content: displayText || raw, timestamp: new Date().toISOString() };"
);

// 4. Add instruction to narrator prompt for character introduction
t = t.replace(
  "POST_HISTORY_BASE,\n        ].join",
  "`\\n【角色引入】当你需要在场景中引入一个新的原著角色时，请自然地描写ta的出现（敲门、路过、从楼梯上走下来等），然后在回复末尾添加 ___META___ {\\\"newCharacter\\\": \\\"角色名\\\"}。系统会自动将ta加入角色列表。`,"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('character management system added');
