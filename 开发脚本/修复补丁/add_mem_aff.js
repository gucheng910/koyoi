const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 1. Pass memories to buildDialogueContext
t = t.replace(
  "chapterCtx = await buildDialogueContext(session.worldNovelId, session.currentChapter || 0, (session.recentWorldEvents || []).slice(-5), finalText);",
  "chapterCtx = await buildDialogueContext(session.worldNovelId, session.currentChapter || 0, (session.recentWorldEvents || []).slice(-5), finalText, session.memories);"
);

// 2. Add affection display to character descriptions
t = t.replace(
  "if (deep) line += ` | ${deep}`;\n        if ((c as any).arc",
  "const att = ((session as any).characterAttitudes || {})[c.name];\n        if (att && att.affection !== undefined) { const label = att.affection > 60 ? '亲近' : att.affection > 30 ? '友好' : att.affection > 0 ? '平淡' : att.affection < -30 ? '厌恶' : att.affection < 0 ? '冷淡' : '中性'; line += ` | 好感：${att.affection.toFixed(1)}（${label}）`; }\n        if (deep) line += ` | ${deep}`;\n        if ((c as any).arc"
);

// 3. Add attitude tracking ref
t = t.replace(
  'const turnCount = useRef(Math.floor(initialSession.messages.length / 2));',
  'const turnCount = useRef(Math.floor(initialSession.messages.length / 2));\n  const attitudes = useRef<Record<string, any>>((session as any).characterAttitudes || {});'
);

// 4. Apply affection delta from simulation
t = t.replace(
  "for (const a of charActions) record[a.name] = {intent:a.intent, mood:a.mood};\n            lastSimResults.current = record;",
  "for (const a of charActions) { record[a.name] = {intent:a.intent, mood:a.mood}; if (a.affectionDelta && Math.abs(a.affectionDelta) > 0.001) { if (!attitudes.current[a.name]) attitudes.current[a.name] = { trust: 50, affection: 0, fear: 20, lastUpdate: '' }; let delta = a.affectionDelta; const aff = attitudes.current[a.name].affection || 0; if (aff > 80) delta *= 0.25; else if (aff > 60) delta *= 0.5; else if (aff < -50) delta *= 1.5; attitudes.current[a.name].affection = Math.max(-100, Math.min(100, aff + delta)); } }\n            lastSimResults.current = record;"
);

// 5. Update affection reference in character display
t = t.replace(
  "((session as any).characterAttitudes || {})[c.name]",
  "attitudes.current[c.name]"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('memories + affection + attitudes');
