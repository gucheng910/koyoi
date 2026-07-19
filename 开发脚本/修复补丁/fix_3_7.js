const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Remove character intro toasts (#3)
t = t.replace("\n                setToast({ msg: name + ' 进入了场景', type: 'success' });", '');
t = t.replace("\n                setToast({ msg: ch.character_name + ' 进入了场景', type: 'success' });", '');
t = t.replace("\n                setToast({ msg: ch.character_name + ' 离开了场景', type: 'info' });", '');

// 7. Opening scene transition
// Add an opening state that shows before ready
t = t.replace(
  "const [ready, setReady] = useState(false);",
  "const [ready, setReady] = useState(false);\n  const [showOpening, setShowOpening] = useState(true);"
);

// Opening screen - shown before the loading screen
t = t.replace(
  "const greetings = [",
  "useEffect(() => { const tm = setTimeout(() => setShowOpening(false), 2500); return () => clearTimeout(tm); }, []);\n  const greetings = ["
);

t = t.replace(
  "if (!ready) return",
  "if (showOpening) return (\n    <View style={[st.container, { justifyContent: \"center\", alignItems: \"center\", paddingHorizontal: 40 }]}>\n      <MotiView from={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: \"timing\", duration: 800 }} style={{ alignItems: \"center\" }}>\n        <Text style={{ fontSize: 56, marginBottom: 20 }}>📖</Text>\n        <Text style={{ fontSize: 22, fontWeight: \"600\", color: isDark ? \"#E8DCC8\" : \"#2D2822\", textAlign: \"center\", marginBottom: 12 }}>{session.world?.name || \"世界\"}</Text>\n        <Text style={{ fontSize: 13, color: \"#B8944C\", letterSpacing: 4, marginBottom: 24 }}>— 故事继续 —</Text>\n        <Text style={{ fontSize: 13, color: isDark ? \"#8A8070\" : \"#8A8068\", textAlign: \"center\", lineHeight: 22 }}>{session.worldState || \"\"}</Text>\n      </MotiView>\n    </View>\n  );\n\n  if (!ready) return"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('removed #3, added #7');
