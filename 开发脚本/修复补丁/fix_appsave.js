const fs = require('fs');
let app = fs.readFileSync('D:/koyoi/App.tsx', 'utf8');

const oldFn = `  saveWorldSession = async (session: WorldSession) => {
    try {
      const raw = await AsyncStorage.getItem(WORLDS_KEY);
      const sessions: WorldSession[] = raw ? JSON.parse(raw) : [];
      const idx = sessions.findIndex(s => s.id === session.id);
      if (idx >= 0) sessions[idx] = session;
      else sessions.push(session);
      await AsyncStorage.setItem(WORLDS_KEY, JSON.stringify(sessions));
    } catch {}
  };`;

const newFn = `  saveWorldSession = async (session: WorldSession) => {
    try {
      // 独立写入
      await AsyncStorage.setItem('@koyoi_session_' + session.id, JSON.stringify(session));
      // 更新索引
      const rawIdx = await AsyncStorage.getItem('@koyoi_world_index');
      const index = rawIdx ? JSON.parse(rawIdx) : {};
      index[session.id] = {
        id: session.id,
        name: session.world?.name || '未知',
        type: session.world?.type || 'custom',
        charCount: session.selectedCharacters?.length || 0,
        msgCount: session.messages?.length || 0,
        lastActivity: new Date().toISOString(),
        hasNovelId: !!session.worldNovelId,
        currentChapter: session.currentChapter || 0,
      };
      await AsyncStorage.setItem('@koyoi_world_index', JSON.stringify(index));
    } catch {}
  };`;

app = app.replace(oldFn, newFn);
fs.writeFileSync('D:/koyoi/App.tsx', app);
console.log('App.tsx saveWorldSession updated');
