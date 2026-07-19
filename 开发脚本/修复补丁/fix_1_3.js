const fs = require('fs');

// === Fix 1: Better analysis progress in FanficScreen ===
let fanfic = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// Update the progress display to show chapter range and elapsed time
fanfic = fanfic.replace(
  "setParsingStatus('AI 提取 ' + cur + '/' + total + '\\n' + formatChunkInfo(chunk) + '\\n⚠ 不要退出，预计还需 ' + eta);",
  "const elapsedMin = Math.floor((Date.now() - analyzeStart) / 60000);\n        const chapterRange = chunk.chapterStart === chunk.chapterEnd ? '第' + (chunk.chapterStart+1) + '章' : '第' + (chunk.chapterStart+1) + '~' + (chunk.chapterEnd+1) + '章';\n        setParsingStatus('AI 分析中 ' + cur + '/' + total + ' 块\\n' + chapterRange + '（' + (chunk.charCount / 1000).toFixed(0) + 'k字）\\n已用 ' + elapsedMin + ' 分钟，预计还需 ' + eta + '\\n⚠ 不要退出');"
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', fanfic);
console.log('1. analysis progress improved');

// === Fix 3: Enable simulation for fanfic worlds even without NPCs ===
let w = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Change: run simulation when it's a fanfic world AND has rounds, even without NPCs
w = w.replace(
  "const hasNPCs = !!(session.npcs && session.npcs.length > 0);\n      const hasRounds = turnCount.current >= 2;\n      const isFanfic = !!(session.worldNovelId || (session.world?.writingStyle && session.world?.characters?.length));\n      let charActions: CharacterAction[] = [];\n      if (hasNPCs && hasRounds) {",
  "const hasRounds = turnCount.current >= 2;\n      const isFanfic = !!(session.worldNovelId || (session.world?.writingStyle && session.world?.characters?.length));\n      let charActions: CharacterAction[] = [];\n      if (hasRounds) {"
);

// Add selectedCharacters to the simulation even without NPCs
w = w.replace(
  "const chars = [\n          ...session.selectedCharacters.filter(c => activeChars.current.includes(c.name)).map",
  "const allSimChars = [\n          ...session.selectedCharacters.filter(c => activeChars.current.includes(c.name)).map"
);

w = w.replace(
  "...(session.npcs || []).map(n => ({ name: n.name, personality: n.personality, deepPersonality: '', role: n.role, status: n.currentStatus, goal: n.goal || '', relationship: '路人', interactionState: activeChars.current.includes(n.name) ? 'active' as const : 'inactive' as const })),",
  "...(session.npcs || []).map(n => ({ name: n.name, personality: n.personality, deepPersonality: '', role: n.role, status: n.currentStatus, goal: n.goal || '', relationship: '路人', interactionState: activeChars.current.includes(n.name) ? 'active' as const : 'inactive' as const })),\n        // 同人世界：未出场的原著角色也推演（知道他们在想什么）\n        ...(isFanfic && turnCount.current % 3 === 0 ? (session.world?.characters || []).filter((c: Character) => { const n = c.name || ''; return !session.selectedCharacters.some(sc => sc.name === n) && !(session.npcs||[]).some(np => np.name === n); }).slice(0, 5).map((c: Character) => ({ name: c.name || '', personality: (c.personality?.traits || ['未知']).join('/'), deepPersonality: (c.personality as any)?._deepProfile || '', role: c.relationship?.status || '', status: '故事某处', goal: '', relationship: '原著角色', interactionState: 'inactive' as const })) : []),"
);

w = w.replace(
  "allSimChars.length > 0",
  "chars.length > 0"
);

// Fix the variable name
w = w.replace(/allSimChars/g, 'chars');

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', w);
console.log('3. simulation enabled for all fanfic worlds');
