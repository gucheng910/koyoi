const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');

// Add helper functions after imports
t = t.replace(
  "const WORLDS_KEY = '@koyoi_world_sessions';",
  "const WORLDS_KEY = '@koyoi_world_sessions';\n\nfunction formatRelativeTime(ts: string) { if (!ts) return ''; const diff = Date.now() - new Date(ts).getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return '刚刚'; if (mins < 60) return mins + '分钟前'; const hours = Math.floor(mins / 60); if (hours < 24) return hours + '小时前'; const days = Math.floor(hours / 24); if (days < 30) return days + '天前'; return Math.floor(days / 30) + '个月前'; }\nfunction formatChapter(s: any) { const ch = (s.currentChapter || 0) + 1; const total = (s.world as any)?.totalChapters || 0; return total > 0 ? ch + '/' + total + '章' : ''; }"
);

// Improve the world card - add chapter progress and relative time
t = t.replace(
  "item.selectedCharacters.map(c => c.name).join('、') || '无角色'} · {item.messages.length}轮对话",
  "item.selectedCharacters.map(c => c.name).slice(0, 3).join('、') || '无角色'}{(item.selectedCharacters||[]).length > 3 ? ' 等' + item.selectedCharacters.length + '人' : ''} · {item.messages.length}轮{((item as any).worldNovelId) ? ' · ' + formatChapter(item) : ''}"
);

t = t.replace(
  "<Text style={S.worldTime}>{formatTime(item.createdAt)}</Text>",
  "<Text style={S.worldTime}>{formatRelativeTime(item.messages[item.messages.length-1]?.timestamp || item.createdAt)}</Text>"
);

fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', t);
console.log('HomeScreen improved (safe version)');
