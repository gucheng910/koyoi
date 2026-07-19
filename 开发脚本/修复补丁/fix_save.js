const fs = require('fs');

// === 1. Rewrite WorldChatScreen saveSession ===
let ws = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

const oldSave = `  const saveSession = async (msgs?: ChatMessage[]) => {
    try {
      const raw = await AsyncStorage.getItem(WORLDS_KEY);
      let sessions = []; try { sessions = raw ? JSON.parse(raw) : []; } catch { sessions = []; }
      if (!Array.isArray(sessions)) sessions = [];
      const idx = sessions.findIndex((s: any) => s.id === session.id);
      const current = { ...session, messages: msgs ?? messages, recentWorldEvents: session.recentWorldEvents || [], worldLog: session.worldLog || [], memories: session.memories || [] };
      if (idx >= 0) sessions[idx] = current; else sessions.push(current);
      await AsyncStorage.setItem(WORLDS_KEY, JSON.stringify(sessions));
    } catch {}
  };`;

const newSave = `  const SESSION_KEY = '@koyoi_session_' + session.id;
  const INDEX_KEY = '@koyoi_world_index';

  const saveSession = async (msgs?: ChatMessage[]) => {
    try {
      const current = JSON.stringify({
        ...session,
        messages: msgs ?? messages,
        recentWorldEvents: session.recentWorldEvents || [],
        worldLog: session.worldLog || [],
        memories: session.memories || [],
        currentChapter: session.currentChapter || 0,
      });
      // 独立写：每个世界自己的 key，不存在并发覆盖
      await AsyncStorage.setItem(SESSION_KEY, current);

      // 索引更新：轻量写入，用于首页列表
      const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
      const index = rawIdx ? JSON.parse(rawIdx) : {};
      index[session.id] = {
        id: session.id,
        name: session.world?.name || '未知',
        type: session.world?.type || 'custom',
        charCount: session.selectedCharacters?.length || 0,
        msgCount: (msgs ?? messages).length,
        lastActivity: new Date().toISOString(),
        hasNovelId: !!session.worldNovelId,
        currentChapter: session.currentChapter || 0,
      };
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {}
  };`;

ws = ws.replace(oldSave, newSave);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', ws);

// === 2. Rewrite HomeScreen loadSessions ===
let hs = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');

const oldLoad = `  const loadSessions = async () => {
    try {
      const raw = await AsyncStorage.getItem(WORLDS_KEY);
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setSessions(parsed.filter((s: any) => s?.id && s?.world).map(normalizeSession)); }
    } catch {}
  };`;

const newLoad = `  const loadSessions = async () => {
    try {
      const rawIdx = await AsyncStorage.getItem('@koyoi_world_index');
      if (!rawIdx) return;
      const index = JSON.parse(rawIdx);
      const ids = Object.keys(index);
      const sessions = [];
      for (const id of ids) {
        try {
          const raw = await AsyncStorage.getItem('@koyoi_session_' + id);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.id && parsed?.world) sessions.push(normalizeSession(parsed));
          }
        } catch {}
      }
      // 按最后活跃时间排序
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(sessions);
    } catch {}
  };`;

hs = hs.replace(oldLoad, newLoad);

// Also update deleteSession
const oldDelete = `  const deleteSession = async (id: string) => {
    const updated = sessions.filter(s => s.id !== id); setSessions(updated);
    await AsyncStorage.setItem(WORLDS_KEY, JSON.stringify(updated));
  };`;

const newDelete = `  const deleteSession = async (id: string) => {
    const updated = sessions.filter(s => s.id !== id); setSessions(updated);
    // 删除独立 key
    await AsyncStorage.removeItem('@koyoi_session_' + id);
    // 更新索引
    const rawIdx = await AsyncStorage.getItem('@koyoi_world_index');
    if (rawIdx) {
      const index = JSON.parse(rawIdx);
      delete index[id];
      await AsyncStorage.setItem('@koyoi_world_index', JSON.stringify(index));
    }
  };`;

hs = hs.replace(oldDelete, newDelete);

fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', hs);
console.log('save logic rewritten to per-session keys');
