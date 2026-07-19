const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Revert my changes - remove chapterProfiles block
t = t.replace(
  /\/\/ 构建角色描述行[\s\S]*?for \(const c of session\.selectedCharacters\) \{[\s\S]*?charLines\.push\(line\);[\s\S]*?\}\s*\}[,\s]*\)\s*,\s*'\\n角色：',/,
  ''
);

// Remove the chapterProfiles loading block
t = t.replace(
  "let chapterProfiles: any[] = [];\n      try {\n        if (session.worldNovelId) {\n          chapterCtx = await buildDialogueContext(session.worldNovelId, session.currentChapter || 0, (session.recentWorldEvents || []).slice(-5), finalText);\n          // 章节感知的角色画像（知识边界 + 关系时间点对齐）\n          if (chapterCtx) {\n            const { buildChapterAwareProfiles, injectChapterAwareContext } = require('../services/chapterAwareFilter');\n            const allNames = [...session.selectedCharacters.map(c => c.name), ...(session.npcs || []).map(n => n.name)];\n            try {\n              const kb = await (require('../services/knowledgeBase').loadKnowledgeBase(session.worldNovelId));\n              if (kb) {\n                chapterProfiles = buildChapterAwareProfiles(kb, session.currentChapter || 0, allNames);\n              }\n            } catch {}\n          }\n        }\n      } catch {}",
  "try { if (session.worldNovelId) chapterCtx = await buildDialogueContext(session.worldNovelId, session.currentChapter || 0, (session.recentWorldEvents || []).slice(-5), finalText); } catch {}"
);

t = t.replace('let chapterCtx: any = null;\n', 'let chapterCtx: any = null;\n');

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('WorldChatScreen reverted to clean state');
