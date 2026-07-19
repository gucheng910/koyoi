const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 1. Add segments state
t = t.replace(
  'const [inputText, setInputText] = useState(\'\');',
  'const [inputText, setInputText] = useState(\'\');\n  const [segments, setSegments] = useState<{text: string; tag: \'speech\' | \'action\'}[]>([]);\n  const commitSegment = (tag: \'speech\' | \'action\') => { const txt = inputText.trim(); if (!txt) return; setSegments(prev => [...prev, { text: txt, tag }]); setInputText(\'\'); };\n  const removeSegment = (idx: number) => { setSegments(prev => prev.filter((_, i) => i !== idx)); };'
);

// 2. Add segment display above the input
t = t.replace(
  '      <View style={st.inputBar}>',
  '      {segments.length > 0 && (\n        <View style={{ flexDirection: \'row\', flexWrap: \'wrap\', paddingHorizontal: 16, paddingTop: 8, gap: 6 }}>\n          {segments.map((seg, i) => (\n            <TouchableOpacity key={i} onPress={() => removeSegment(i)} style={{ flexDirection: \'row\', alignItems: \'center\', backgroundColor: isDark ? \'#2A2418\' : \'#F5ECD7\', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: isDark ? \'#3A3428\' : \'#E8E4DD\' }}>\n              <Text style={{ fontSize: 10, color: \'#B8944C\', fontWeight: \'700\', marginRight: 4 }}>{seg.tag === \'speech\' ? \'说\' : \'行动\'}</Text>\n              <Text style={{ fontSize: 12, color: isDark ? \'#E8DCC8\' : \'#2D2822\' }} numberOfLines={1}>{seg.text.slice(0, 30)}</Text>\n              <Text style={{ fontSize: 10, color: isDark ? \'#8A8070\' : \'#8A8070\', marginLeft: 6 }}>✕</Text>\n            </TouchableOpacity>\n          ))}\n        </View>\n      )}\n      <View style={st.inputBar}>'
);

// 3. Add tag toggle and commit buttons
t = t.replace(
  '<TextInput style={st.textInput} value={inputText} onChangeText={setInputText} placeholder="输入消息..."',
  '<TouchableOpacity onPress={() => commitSegment(\'speech\')} style={{ paddingHorizontal: 8, paddingVertical: 12 }}><Text style={{ fontSize: 13, color: \'#B8944C\', fontWeight: \'600\' }}>说</Text></TouchableOpacity>\n        <TouchableOpacity onPress={() => commitSegment(\'action\')} style={{ paddingHorizontal: 8, paddingVertical: 12 }}><Text style={{ fontSize: 13, color: \'#8A8070\', fontWeight: \'600\' }}>行动</Text></TouchableOpacity>\n        <TextInput style={st.textInput} value={inputText} onChangeText={setInputText} placeholder="输入消息..." onSubmitEditing={() => commitSegment(\'action\')}'
);

// 4. Update send to use segments
t = t.replace(
  'if (!inputText.trim() || isGenerating) return;',
  'if (segments.length === 0 || isGenerating) return;'
);

t = t.replace(
  "const finalText = '[行动] ' + text;",
  "setInputText('');\n    const finalText = segments.map(s => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\\n');"
);

t = t.replace(
  'const userMsg: ChatMessage = { role: \'user\', content: finalText, timestamp: new Date().toISOString() };\n    const msgsWithUser = [...messages, userMsg];',
  'const userMsg: ChatMessage = { role: \'user\', content: finalText, timestamp: new Date().toISOString() };\n    setSegments([]);\n    const msgsWithUser = [...messages, userMsg];'
);

// 5. Fix button disable condition
t = t.replace(
  'disabled={isGenerating}',
  'disabled={segments.length === 0 || isGenerating}'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('segment system restored');
