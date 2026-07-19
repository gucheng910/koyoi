const fs = require('fs');

// === Fix 4: HomeScreen bookshelf-style world cards ===
let home = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');

// Enhance world card with progress, chapter, last activity
home = home.replace(
  '<Text style={S.worldMeta}>\n                {item.selectedCharacters.map(c => c.name).join(\'、\') || \'无角色\'} · {item.messages.length}轮对话\n              </Text>\n              <Text style={S.worldTime}>{formatTime(item.createdAt)}</Text>',
  '<Text style={S.worldMeta}>\n                {item.selectedCharacters.map(c => c.name).slice(0, 3).join(\'、\') || \'无角色\'}{item.selectedCharacters.length > 3 ? \' 等\' + item.selectedCharacters.length + \'人\' : \'\'}\n              </Text>\n              <View style={{ flexDirection: \'row\', gap: 8, marginTop: 4 }}>\n                <Text style={S.worldTime}>{item.messages.length}轮对话</Text>\n                {(item as any).worldNovelId ? <Text style={[S.worldTime, { color: \'#B8944C\' }]}>{sessionChapterText(item)}</Text> : null}\n                <Text style={S.worldTime}>{formatRelativeTime(item.messages[item.messages.length-1]?.timestamp || item.createdAt)}</Text>\n              </View>'
);

// Add helper functions for chapter display and relative time
home = home.replace(
  'const { width } = Dimensions.get(\'window\');',
  'const { width } = Dimensions.get(\'window\');\n\nfunction sessionChapterText(s: any) { const ch = (s.currentChapter || 0) + 1; const total = (s.world as any)?.totalChapters || 0; return total > 0 ? \'第\' + ch + \'/\' + total + \'章\' : \'\'; }\nfunction formatRelativeTime(ts: string) { if (!ts) return \'\'; const diff = Date.now() - new Date(ts).getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return \'刚刚\'; if (mins < 60) return mins + \'分钟前\'; const hours = Math.floor(mins / 60); if (hours < 24) return hours + \'小时前\'; const days = Math.floor(hours / 24); if (days < 30) return days + \'天前\'; return Math.floor(days / 30) + \'个月前\'; }'
);

// Also add the chapter display in the card
home = home.replace(
  "const chapterText = sessionChapterText(item);",
  "const chapterText = '';"
);

fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', home);
console.log('4. HomeScreen bookshelf cards');

// === Fix 5: SettingsScreen collapsible sections ===
let settings = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Add collapsible state
settings = settings.replace(
  "const persona = usePersonaStore();",
  "const persona = usePersonaStore();\n  const [showApi, setShowApi] = useState(false);\n  const [showAdvanced, setShowAdvanced] = useState(false);"
);

// Wrap API section with collapsible
settings = settings.replace(
  '{/* API 配置 */}',
  '{/* API 配置 */}\n      <TouchableOpacity style={[S.card, { flexDirection: \'row\', alignItems: \'center\', justifyContent: \'space-between\' }]} onPress={() => setShowApi(!showApi)}>\n        <Text style={S.sectionTitle}>API 配置 {showApi ? \'▾\' : \'▸\'}</Text>\n      </TouchableOpacity>'
);

// Hide API content when collapsed
settings = settings.replace(
  '{showApi && (\n        <>\n          <View style={S.card}>',
  '{showApi ? (<>\n          <View style={S.card}>'
);

// Find the closing of the API section and add closing tag
settings = settings.replace(
  '          </View>\n        </>\n      )}',
  '          </View>\n        </>) : null}'
);

// Wrap advanced settings
settings = settings.replace(
  '            </View>\n          </View>\n          <View style={S.card}>\n            <View style={S.switchRow}>\n              <Text style={S.fieldLabel}>流式输出</Text>',
  '            </View>\n          </View>\n          <TouchableOpacity style={[S.card, { flexDirection: \'row\', alignItems: \'center\', justifyContent: \'space-between\' }]} onPress={() => setShowAdvanced(!showAdvanced)}>\n            <Text style={S.sectionTitle}>高级选项 {showAdvanced ? \'▾\' : \'▸\'}</Text>\n          </TouchableOpacity>\n          {showAdvanced ? (<>\n          <View style={S.card}>\n            <View style={S.switchRow}>\n              <Text style={S.fieldLabel}>流式输出</Text>'
);

// Close advanced section
settings = settings.replace(
  '              <Switch value={autoPolish} onValueChange={setAutoPolish} trackColor={{ false: \'#ddd\', true: \'#B8944C\' }} thumbColor="#fff" /></View>\n          </View>',
  '              <Switch value={autoPolish} onValueChange={setAutoPolish} trackColor={{ false: \'#ddd\', true: \'#B8944C\' }} thumbColor="#fff" /></View>\n          </View>\n          </>) : null}'
);

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', settings);
console.log('5. Settings collapsible sections');
