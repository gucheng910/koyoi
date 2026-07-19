const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 1. Add loading state
t = t.replace(
  'const [toast, setToast] = useState',
  'const [ready, setReady] = useState(false);\n  const [toast, setToast] = useState'
);

t = t.replace(
  '  const scrollToBottom = ()',
  '  useEffect(() => { const tm = setTimeout(() => setReady(true), 500); return () => clearTimeout(tm); }, []);\n\n  const scrollToBottom = ()'
);

t = t.replace(
  '  return (\n    <FadeIn',
  '  if (!ready) return (\n    <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>\n      <ActivityIndicator size="large" color="#B8944C" />\n      <Text style={{ fontSize: 13, color: isDark ? "#8A8070" : "#8A8068", marginTop: 20 }}>加载中...</Text>\n    </View>\n  );\n\n  return (\n    <FadeIn'
);

// 2. Richer character descriptions in the narrator prompt
t = t.replace(
  "...session.selectedCharacters.map(c => `- ${c.name}：${c.personality.traits.join('/')}，${c.relationship.status}`),",
  "...session.selectedCharacters.map(c => {\n        const deep = (c.personality as any)?._deepProfile || '';\n        const dialogue = (c.exampleDialogues || []).slice(0, 2).map((d: any) => d.character).join(' / ');\n        let line = `- ${c.name}：${c.personality.traits.join('、')}，${c.relationship.status}`;\n        if (deep) line += ` | ${deep}`;\n        if (c.personality.speakingStyle) line += ` | 说话：${c.personality.speakingStyle}`;\n        if (dialogue) line += ` | 台词：「${dialogue}」`;\n        return line;\n      }),"
);

// 3. Add character arc to the prompt
t = t.replace(
  "session.worldBible ? `\\n世界圣经：${session.worldBible}` : '',",
  "session.worldBible ? `\\n世界圣经：${session.worldBible}` : '',\n          (session.world as any)?.styleSamples?.length > 0 ? `\\n风格参考：${(session.world as any).styleSamples.slice(0, 2).map((s: string) => '「' + s + '」').join('\\n')}` : '',"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('loading + richer chars + style samples');
