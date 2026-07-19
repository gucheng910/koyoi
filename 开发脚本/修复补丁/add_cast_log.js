const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 1. Add showCast state
t = t.replace(
  "const [toast, setToast] = useState",
  "const [showCast, setShowCast] = useState(false);\n  const [showLog, setShowLog] = useState(false);\n  const [toast, setToast] = useState"
);

// 2. Add cast bar after top bar
t = t.replace(
  "</View>\n      {error ?",
  "</View>\n      {(session.selectedCharacters.length > 0 || (session.npcs||[]).length > 0) && (\n        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, gap: 4, backgroundColor: isDark ? '#0D0C0A' : '#FAF8F5', borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2822' : '#E8E4DD' }}>\n          {[...session.selectedCharacters, ...(session.npcs||[]).filter(n => !session.selectedCharacters.some(c => c.name === n.name))].slice(0, showCast ? 20 : 5).map((c: any, i: number) => (\n            <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: isDark ? '#1A1814' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2822' : '#E8E4DD' }}>\n              <Text style={{ fontSize: 10, color: isDark ? '#E8DCC8' : '#2D2822' }}>{c.name}</Text>\n            </View>\n          ))}\n          {(session.selectedCharacters.length + (session.npcs||[]).length) > 5 && (\n            <TouchableOpacity onPress={() => setShowCast(!showCast)} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: '#B8944C22' }}>\n              <Text style={{ fontSize: 10, color: '#B8944C' }}>{showCast ? '收起' : '更多'}</Text>\n            </TouchableOpacity>\n          )}\n        </View>\n      )}\n      {error ?"
);

// 3. Add world log toggle in top bar
t = t.replace(
  '<TouchableOpacity onPress={onBack}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>\n        <Text style={st.topName}',
  '<TouchableOpacity onPress={onBack}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>\n        <View style={{ flex: 1 }}>\n        <Text style={st.topName}'
);

t = t.replace(
  "</Text>\n      </View>",
  "</Text>\n        <Text style={st.topStatus}>{session.selectedCharacters.length}个角色 · 第{turnCount.current + 1}轮{session.worldNovelId ? ' · 第' + ((session.currentChapter || 0) + 1) + '章' : ''}</Text>\n        </View>\n        <TouchableOpacity onPress={() => setShowLog(!showLog)} style={{ paddingHorizontal: 8 }}>\n          <Text style={{ fontSize: 11, color: '#B8944C' }}>{showLog ? '收起' : '📜'}</Text>\n        </TouchableOpacity>"
);

// 4. Add world log panel below cast bar
t = t.replace(
  "      {error ?",
  "      {showLog && (session.recentWorldEvents || []).length > 0 && (\n        <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: isDark ? '#0D0C0A' : '#FAF8F5', borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2822' : '#E8E4DD' }}>\n          {(session.recentWorldEvents || []).slice(-5).map((e: string, i: number) => (\n            <Text key={i} style={{ fontSize: 10, color: isDark ? '#8A8070' : '#8A8070', lineHeight: 16 }}>· {e}</Text>\n          ))}\n        </View>\n      )}\n      {error ?"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('added cast bar + world log');
