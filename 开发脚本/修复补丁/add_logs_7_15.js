const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Extend the try/catch to cover the REST of the send function
// Find where the try/catch currently ends and extend it

// After console.log 6, the next code is:
// const userText = finalText;
// const worldInfo = ...
// etc.
// This is all BEFORE the existing try block (which starts at simulateCharacters)

// I need to wrap everything from log 6 until the end of the send function

// Instead of extending, let me add numbered logs through the rest of the code
t = t.replace(
  "console.log('[KOYOI-SEND] 6 userMsg added:', msgsWithUser.length);\n    const userText = finalText;",
  "console.log('[KOYOI-SEND] 6 userMsg added:', msgsWithUser.length);\n    console.log('[KOYOI-SEND] 7 userText');\n    const userText = finalText;"
);

t = t.replace(
  "const worldInfo = getWorldInfoFn(session, userText, messages);\n    let chapterContext: any = null;",
  "const worldInfo = getWorldInfoFn(session, userText, messages); console.log('[KOYOI-SEND] 8 worldInfo');\n    let chapterContext: any = null;"
);

t = t.replace(
  "if (session.worldNovelId) {\n      const ch = session.currentChapter || 0;",
  "console.log('[KOYOI-SEND] 9 worldNovelId:', !!session.worldNovelId);\n    if (session.worldNovelId) {\n      const ch = session.currentChapter || 0;"
);

t = t.replace(
  "chapterContext = await buildDialogueContext(session.worldNovelId, ch, (session.recentWorldEvents || []).slice(-5), userText, session.memories);",
  "console.log('[KOYOI-SEND] 10 calling buildDialogueContext...');\n        chapterContext = await buildDialogueContext(session.worldNovelId, ch, (session.recentWorldEvents || []).slice(-5), userText, session.memories);\n        console.log('[KOYOI-SEND] 11 DC done:', !!chapterContext);"
);

t = t.replace(
  "chapterCacheRef.current = { chapter: ch, ctx: chapterContext };\n      }\n    }",
  "chapterCacheRef.current = { chapter: ch, ctx: chapterContext }; console.log('[KOYOI-SEND] 12 DC cached');\n      }\n    } else { console.log('[KOYOI-SEND] 12 no worldNovelId'); }"
);

t = t.replace(
  "const hasNPCs = !!(session.npcs && session.npcs.length > 0);",
  "console.log('[KOYOI-SEND] 13 pre-sim');\n    const hasNPCs = !!(session.npcs && session.npcs.length > 0);"
);

t = t.replace(
  "const worldPrompt = [\n      { role: 'system' as const, content: [",
  "console.log('[KOYOI-SEND] 14 building prompt');\n    const worldPrompt = [\n      { role: 'system' as const, content: ["
);

t = t.replace(
  "      });\n    } catch (e: any) { setError(e.message || 'error'); setIsGenerating(false); setStreamingText(''); }\n  }, [isGenerating, session, messages, segments]);",
  "      }); console.log('[KOYOI-SEND] 15 API call done');\n    } catch (e: any) { console.log('[KOYOI-SEND] ERR-API:', e.message || String(e)); setError(e.message || 'error'); setIsGenerating(false); setStreamingText(''); }\n  }, [isGenerating, session, messages, segments]);"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('added logs 7-15');
