const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

const oldSave = `  const saveSession = useCallback(async (msgs?: ChatMessage[]) => {
    const latestMessages = msgs ?? messagesRef.current;
    const latestSession = sessionRef.current;
    try {
    try {
      const current = JSON.stringify({
        ...latestSession,
        messages: latestMessages,
        recentWorldEvents: latestSession.recentWorldEvents || [],
        worldLog: latestSession.worldLog || [],
        memories: latestSession.memories || [],
        currentChapter: latestSession.currentChapter || 0,
      });
      const size = (current?.length || 0);
      if (size > 512 * 1024) {
        console.warn('[SAVE] Large session (' + (size/1024).toFixed(0) + 'KB) for', latestSession.id);
      }
      await AsyncStorage.setItem(SESSION_KEY, current);
        ...latestSession,
        messages: latestMessages,
        recentWorldEvents: latestSession.recentWorldEvents || [],
        worldLog: latestSession.worldLog || [],
        memories: latestSession.memories || [],
        currentChapter: latestSession.currentChapter || 0,
      }));

      // 索引写入加锁
      while (indexLock.current) { await new Promise(r => setTimeout(r, 50)); }
      indexLock.current = true;
      try {
        const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
        const index = rawIdx ? JSON.parse(rawIdx) : {};
        index[latestSession.id] = {
          id: latestSession.id,
          name: latestSession.world?.name || '未知',
          type: latestSession.world?.type || 'custom',
          charCount: latestSession.selectedCharacters?.length || 0,
          msgCount: latestMessages.length,
          lastActivity: new Date().toISOString(),
          hasNovelId: !!latestSession.worldNovelId,
          currentChapter: latestSession.currentChapter || 0,
        };
        await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      } finally {
        indexLock.current = false;
      }
    } catch { indexLock.current = false; }
  }, [SESSION_KEY, INDEX_KEY]);`;

const newSave = `  const saveSession = useCallback(async (msgs?: ChatMessage[]) => {
    const latestMessages = msgs ?? messagesRef.current;
    const latestSession = sessionRef.current;
    if (!latestSession?.id || !latestMessages) return;
    try {
      const current = JSON.stringify({
        ...latestSession,
        messages: latestMessages,
        recentWorldEvents: latestSession.recentWorldEvents || [],
        worldLog: latestSession.worldLog || [],
        memories: latestSession.memories || [],
        currentChapter: latestSession.currentChapter || 0,
      });
      await AsyncStorage.setItem(SESSION_KEY, current);

      // 索引写入加锁
      while (indexLock.current) { await new Promise(r => setTimeout(r, 50)); }
      indexLock.current = true;
      try {
        const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
        const index = rawIdx ? JSON.parse(rawIdx) : {};
        index[latestSession.id] = {
          id: latestSession.id,
          name: latestSession.world?.name || '未知',
          type: latestSession.world?.type || 'custom',
          charCount: latestSession.selectedCharacters?.length || 0,
          msgCount: latestMessages.length,
          lastActivity: new Date().toISOString(),
          hasNovelId: !!latestSession.worldNovelId,
          currentChapter: latestSession.currentChapter || 0,
        };
        await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      } finally {
        indexLock.current = false;
      }
    } catch { indexLock.current = false; }
  }, [SESSION_KEY, INDEX_KEY]);`;

t = t.replace(oldSave, newSave);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('saveSession fixed');
