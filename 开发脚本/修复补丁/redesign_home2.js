const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');

// Update card styles only - add accent stripe, better spacing, warmer tones
t = t.replace(
  "worldCard: { backgroundColor: dark ? '#1A1814' : '#FAF8F5', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },",
  "worldCard: { flexDirection: 'row', backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD', overflow: 'hidden' },"
);

// Add card accent stripe to style sheet
t = t.replace(
  "worldAvatar: {",
  "cardAccent: { width: 4 },\n  cardBody: { flex: 1, padding: 14 },\n  worldAvatar: {"
);

// Update the world card JSX to use accent stripe
t = t.replace(
  "renderItem={({ item }) => (\n          <TouchableOpacity\n            style={S.worldCard}\n            onPress={() => onEnterWorld(item)}",
  "renderItem={({ item }) => {\n          const accent = getWorldColor(item.world.type);\n          const chapterInfo = (item as any).worldNovelId ? formatChapter(item) : '';\n          const lastTs = item.messages[item.messages.length-1]?.timestamp || item.createdAt;\n          return (\n          <TouchableOpacity style={S.worldCard} onPress={() => onEnterWorld(item)}"
);

// Add accent stripe and restructure card content
t = t.replace(
  "activeOpacity={0.7}\n          >\n            <View style={S.worldAvatar}>\n              <Text style={S.worldAvatarText}>{getWorldEmoji(item.world.type)}</Text>\n            </View>\n            <View style={S.worldInfo}>\n              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>\n                <Text style={S.worldName}>{item.world.name}</Text>\n                <View style={[S.typeBadge, { backgroundColor: getWorldColor(item.world.type) + '22' }]}>\n                  <Text style={[S.typeBadgeText, { color: getWorldColor(item.world.type) }]}>{getWorldLabel(item.world.type)}</Text>\n                </View>\n              </View>\n              <Text style={S.worldMeta}>\n                {item.selectedCharacters.map(c => c.name).slice(0, 3).join('、') || '无角色'}{(item.selectedCharacters||[]).length > 3 ? ' 等' + item.selectedCharacters.length + '人' : ''} · {item.messages.length}轮{((item as any).worldNovelId) ? ' · ' + formatChapter(item) : ''}\n              </Text>\n              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>\n                <Text style={S.worldTime}>{item.messages.length}轮对话</Text>\n                {(item as any).worldNovelId ? <Text style={[S.worldTime, { color: '#B8944C' }]}>{sessionChapterText(item)}</Text> : null}\n                <Text style={S.worldTime}>{formatRelativeTime(item.messages[item.messages.length-1]?.timestamp || item.createdAt)}</Text>\n              </View>\n            </View>\n          </TouchableOpacity>\n        )}",
  "activeOpacity={0.85}>\n            <View style={[S.cardAccent, { backgroundColor: accent }]} />\n            <View style={S.cardBody}>\n              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>\n                <Text style={S.worldName} numberOfLines={1}>{item.world.name}</Text>\n                <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 1 }}>{getWorldLabel(item.world.type)}</Text>\n              </View>\n              <Text style={S.worldMeta} numberOfLines={1}>\n                {item.selectedCharacters.map(c => c.name).slice(0, 3).join('、') || '无角色'}{(item.selectedCharacters||[]).length > 3 ? ' 等' + item.selectedCharacters.length + '人' : ''}\n              </Text>\n              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>\n                <Text style={{ fontSize: 11, color: dark ? '#5A5450' : '#B8B0A4' }}>{item.messages.length}轮</Text>\n                {chapterInfo ? <Text style={{ fontSize: 11, color: '#B8944C', fontWeight: '600' }}>{chapterInfo}</Text> : null}\n                <Text style={{ fontSize: 11, color: dark ? '#5A5450' : '#B8B0A4' }}>{formatRelativeTime(lastTs)}</Text>\n              </View>\n            </View>\n          </TouchableOpacity>\n        )}}"
);

// Close the renderItem function properly  
t = t.replace(
  "const accent = getWorldColor(item.world.type);\n          const chapterInfo",
  "const accent = getWorldColor(item.world.type); const chapterInfo"
);

// Remove unused old style references
t = t.replace('worldAvatar_unused: {', '/*');
t = t.replace('worldAvatarText_unused: {', '/*');
t = t.replace('worldInfo_unused: {', '/*');
t = t.replace('typeBadge_unused: {', '/*');
t = t.replace('typeBadgeText_unused: {', '/*');
t = t.replace('worldTime_unused: {', '/*');

fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', t);
console.log('HomeScreen redesigned');
