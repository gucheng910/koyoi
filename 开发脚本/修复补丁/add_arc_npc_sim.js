const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// 1. Add character arc to character descriptions
t = t.replace(
  "if (deep) line += ` | ${deep}`;",
  "if (deep) line += ` | ${deep}`;\n        if ((c as any).arc?.description) { const arc = (c as any).arc; const ch = session.currentChapter || 0; const pastChs = arc.keyChapters?.filter((k: number) => k <= ch) || []; line += ` | 弧线：${arc.description}${pastChs.length > 0 ? '（已走过' + pastChs.map((k:number)=>'第'+(k+1)+'章').join('→') + '）' : ''}`; }"
);

// 2. Add NPC descriptions to the narrator prompt  
t = t.replace(
  "...(session.npcs || []).filter(n => !session.selectedCharacters.some(c => c.name === n.name)).map(n => `- ${n.name}：${n.role}，${n.personality}`),",
  "...(session.npcs || []).filter(n => !session.selectedCharacters.some(c => c.name === n.name)).map(n => {\n        const wc = ((session.world as any)?.characters || []).find((wc: any) => wc.name === n.name);\n        const orig = wc?.role || wc?.relationship?.status || '';\n        const deep = (wc?.personality as any)?._deepProfile || '';\n        let line = `- ${n.name}：${n.role}${orig ? '（原著：' + orig + '）' : ''}，${n.personality}`;\n        if (deep) line += ` | ${deep}`;\n        return line;\n      }),"
);

// 3. Add better character simulation context
t = t.replace(
  "const result = await simulateCharacters(cfg, chars, session.currentScene, (session.recentWorldEvents || []).slice(-2).join('；'), activeChars.current.join('、'), lastSimResults.current);",
  "const simKbContext: Record<string, string> = {};\n          if (chapterCtx?.activeCharacters) {\n            for (const c of chars) {\n              const kb = chapterCtx.activeCharacters.find((ac: any) => ac.name === c.name);\n              if (kb) {\n                const parts: string[] = [];\n                if (kb.traits?.length) parts.push('性格：' + kb.traits.join('、'));\n                if (kb.deepTraits?.length) parts.push('真实性格：' + kb.deepTraits.join('、'));\n                if (kb.defenseMechanism) parts.push('防御机制：' + kb.defenseMechanism);\n                if (kb.role) parts.push('身份：' + kb.role);\n                if (kb.speechStyle) parts.push('说话方式：' + kb.speechStyle);\n                if (kb.speechSample) parts.push('台词示例：' + kb.speechSample);\n                simKbContext[c.name] = parts.join('\\n');\n              }\n            }\n          }\n          const result = await simulateCharacters(cfg, chars, session.currentScene, (session.recentWorldEvents || []).slice(-2).join('；'), activeChars.current.join('、'), lastSimResults.current, simKbContext);"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('arc + npc rich + sim context');
