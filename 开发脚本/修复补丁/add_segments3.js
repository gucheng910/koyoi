const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Add segments state and commitSegment function
const inputLine = "const [inputText, setInputText] = useState('');";
const idx = t.indexOf(inputLine);
if (idx >= 0) {
  const end = idx + inputLine.length;
  const add = "\n  const [segments, setSegments] = useState<{text: string; tag: string}[]>([]);\n  const commitSegment = (tag: string) => { const txt = inputText.trim(); if (!txt) return; setSegments(prev => [...prev, { text: txt, tag: tag }]); setInputText(''); };";
  t = t.slice(0, end) + add + t.slice(end);
}

// Add [说] [行动] buttons before TextInput
const inputStart = t.indexOf('<TextInput style={st.textInput}');
if (inputStart >= 0) {
  const buttons = `
        <TouchableOpacity onPress={() => commitSegment('speech')} style={{ paddingHorizontal: 6, paddingVertical: 12, marginRight: 2 }}>
          <Text style={{ fontSize: 12, color: '#B8944C', fontWeight: '700' }}>说</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => commitSegment('action')} style={{ paddingHorizontal: 6, paddingVertical: 12, marginRight: 4 }}>
          <Text style={{ fontSize: 12, color: '#8A8070', fontWeight: '700' }}>行动</Text>
        </TouchableOpacity>
`;
  t = t.slice(0, inputStart) + buttons + '        ' + t.slice(inputStart);
}

// Add segment display chips above input bar
const barIdx = t.indexOf('<View style={st.inputBar}>');
if (barIdx >= 0) {
  const display = `      {segments.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 4, gap: 4 }}>
          {segments.map((seg, i) => (
            <TouchableOpacity key={i} onPress={() => setSegments(prev => prev.filter((_, idx) => idx !== i))} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#2A2418' : '#F5ECD7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: isDark ? '#3A3428' : '#E8E4DD' }}>
              <Text style={{ fontSize: 9, color: '#B8944C', fontWeight: '700', marginRight: 4 }}>{seg.tag === 'speech' ? '说' : '行动'}</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#E8DCC8' : '#2D2822' }} numberOfLines={1}>{seg.text.slice(0, 25)}</Text>
              <Text style={{ fontSize: 9, color: isDark ? '#8A8070' : '#8A8070', marginLeft: 4 }}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
`;
  t = t.slice(0, barIdx) + display + '\n' + t.slice(barIdx);
}

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('done');
