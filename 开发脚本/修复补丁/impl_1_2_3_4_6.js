const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// === 1. Better loading screen ===
t = t.replace(
  "if (!ready) return (\n    <View style={[st.container, { justifyContent: \"center\", alignItems: \"center\" }]}>\n      <ActivityIndicator size=\"large\" color=\"#B8944C\" />\n      <Text style={{ fontSize: 13, color: isDark ? \"#8A8070\" : \"#8A8068\", marginTop: 20 }}>加载中...</Text>\n    </View>\n  );",
  "const greetings = ['世界正在苏醒…', '墨水尚未干透…', '故事即将开始…', '角色们正在就位…', '帷幕缓缓拉开…', '翻页的声音…', '一阵风吹过书页…'];\n  const [greeting] = useState(greetings[Math.floor(Math.random() * greetings.length)]);\n  if (!ready) return (\n    <View style={[st.container, { justifyContent: \"center\", alignItems: \"center\" }]}>\n      <Text style={{ fontSize: 48, marginBottom: 16 }}>📖</Text>\n      <ActivityIndicator size=\"large\" color=\"#B8944C\" />\n      <Text style={{ fontSize: 14, color: isDark ? \"#8A8070\" : \"#8A8068\", marginTop: 24, letterSpacing: 2 }}>{greeting}</Text>\n      <Text style={{ fontSize: 11, color: isDark ? \"#5A5450\" : \"#B8B0A4\", marginTop: 8 }}>{session.world?.name || '世界'}</Text>\n    </View>\n  );"
);

// === 2. saveSession debounce (every 5 turns) ===
t = t.replace(
  'turnCount.current++; smartScroll(); saveSession(updated);',
  'turnCount.current++; smartScroll(); if (turnCount.current % 5 === 0) saveSession(updated);'
);

// === 3. Toast on character introduction ===
t = t.replace(
  "setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc], recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), name + '进入了场景'] }));",
  "setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc], recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), name + '进入了场景'] }));\n                setToast({ msg: name + ' 进入了场景', type: 'success' });"
);

t = t.replace(
  "setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc] }));\n                // 添加世界事件\n                const event = ch.narrative || (ch.character_name + '出现了');",
  "setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc] }));\n                setToast({ msg: ch.character_name + ' 进入了场景', type: 'success' });\n                const event = ch.narrative || (ch.character_name + '出现了');"
);

t = t.replace(
  "activeChars.current = activeChars.current.filter(n => n !== ch.character_name);\n                const event = ch.narrative || (ch.character_name + '离开了');",
  "activeChars.current = activeChars.current.filter(n => n !== ch.character_name);\n                setToast({ msg: ch.character_name + ' 离开了场景', type: 'info' });\n                const event = ch.narrative || (ch.character_name + '离开了');"
);

// === 4. Show [说]/[行动] label on user bubbles ===
t = t.replace(
  "if (item.role === 'user') return <View style={st.userBubble}><Text style={st.userMsgText}>{item.content}</Text></View>;",
  "if (item.role === 'user') {\n    const lines = item.content.split('\\n');\n    return <View>{lines.map((line, i) => {\n      const tagMatch = line.match(/^\\[(.+?)\\]\\s/);\n      const tag = tagMatch ? tagMatch[1] : '';\n      const text = tagMatch ? line.slice(tagMatch[0].length) : line;\n      return <View key={i} style={[st.userBubble, { paddingVertical: 6, marginBottom: 4 }]}>\n        {tag ? <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '700', marginBottom: 2, letterSpacing: 1 }}>{tag}</Text> : null}\n        <Text style={st.userMsgText}>{text}</Text>\n      </View>;\n    })}</View>;\n  }"
);

// === 6. Connect bedrockMemories and conversation summary ===
t = t.replace(
  "const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';",
  "const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';\n      // 注入 bedrock 记忆（永不遗忘的关键事件）\n      const bedrockText = ((session as any).bedrockMemories || []).length > 0\n        ? '\\n角色核心记忆（这些事件塑造了角色，永不遗忘——请自然融入叙事而非直接复述）：\\n' + ((session as any).bedrockMemories || []).map((m: any) => '  · ' + (m.content || m)).join('\\n')\n        : '';"
);

t = t.replace(
  "chapterPrompt,\n          styleFeat,",
  "chapterPrompt,\n          bedrockText,\n          styleFeat,"
);

// Conversation summary injection (if summaryRef exists)
t = t.replace(
  'const turnCount = useRef(Math.floor(initialSession.messages.length / 2));',
  'const turnCount = useRef(Math.floor(initialSession.messages.length / 2));\n  const summaryRef = useRef<string>('');'
);

t = t.replace(
  "const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';\n      // 注入 bedrock 记忆",
  "// 对话摘要（长对话自动压缩）\n      if (messages.length > 30 && !summaryRef.current && turnCount.current % 10 === 0) {\n        const oldMsgs = messages.slice(0, messages.length - 30);\n        if (oldMsgs.length > 10) {\n          const sp = [{ role: 'system' as const, content: '将对话压缩为摘要。格式：事件/关系/情感各30字内。' }, { role: 'user' as const, content: oldMsgs.map((m: any) => (m.role==='user'?'玩家':'')+':'+m.content.slice(0,150)).join('\\n').slice(0, 8000) }];\n          chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, sp, { maxTokens: 300, temperature: 0.2 }).then(raw => {\n            if (raw && raw.length > 20) summaryRef.current = '[对话摘要]\\n' + raw.slice(0, 400);\n          }).catch(() => {});\n        }\n      }\n      const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';\n      // 注入 bedrock 记忆"
);

// Inject summary into prompt
t = t.replace(
  'chapterPrompt,\n          bedrockText,',
  'chapterPrompt,\n          summaryRef.current ? summaryRef.current : \\'\\',\n          bedrockText,'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('1,2,3,4,6 done');
