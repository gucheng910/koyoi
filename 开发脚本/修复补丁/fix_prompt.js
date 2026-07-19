const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Fix 1: Add player identity
t = t.replace(
  "`你是${session.world?.name || '未知世界'}的叙事引擎。${NARRATOR_BASE}${fanficAppend}`,",
  "`你是${session.world?.name || '未知世界'}的叙事引擎。${NARRATOR_BASE}${fanficAppend}`,\n          `【玩家身份】${session.selectedCharacters.length > 0 ? session.selectedCharacters[0].name : '玩家'}是你正在互动的玩家角色。玩家输入格式：[说] 表示玩家角色在说话，[行动] 表示玩家角色的行为动作。你要把 [说] 当成玩家角色的台词——它从玩家角色的嘴里说出来，会被周围所有人听到。你要把 [行动] 当成玩家角色的行为——它发生在场景里，会被周围所有人看到。你扮演除玩家以外的所有角色和旁白。不要让其他角色替玩家说话或替玩家做决定。`,"
);

// Fix 2: Add VOCAB_LOCK for fanfic
t = t.replace(
  'chapterPrompt,\n          styleFeat,',
  'chapterPrompt,\n          styleFeat,\n          isFanfic ? VOCAB_LOCK : \'\','
);

// Fix 3: Add POST_HISTORY_BASE
t = t.replace(
  'worldInfo || \'\',\n        ].join(\'\\n\') },',
  'worldInfo || \'\',\n          POST_HISTORY_BASE,\n        ].join(\'\\n\') },'
);

// Fix 4: Enrich simulation results display
t = t.replace(
  "charActions.length > 0 ? `\\n角色推演：\\n${charActions.map(a => `  ${a.name}：${a.intent}（${a.mood}）→ ${a.wantsInteraction ? '想互动' : '不想互动'}`).join('\\n')}` : '',",
  "charActions.length > 0 ? `\\n角色推演（每个角色此刻的内心状态）：\\n${charActions.map(a => {\n    let s = `  ${a.name}：${a.intent}（${a.mood}）`;\n    if (a.innerThought) s += `\\n    内心：${a.innerThought}`;\n    if (a.bodyLanguage) s += `\\n    身体：${a.bodyLanguage}`;\n    if (a.subtext) s += `\\n    潜台词：${a.subtext}`;\n    s += `\\n    方向：${a.emotionalDirection || 'holding'} | 指向：${a.toward === 'player' ? '玩家' : a.toward || 'none'}${a.wantsInteraction ? ' | 想参与互动' : ''}`;\n    if (a.triggerContext) s += `\\n    触发：${a.triggerContext}`;\n    return s;\n  }).join('\\n')}` : '',"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('fixed 1-4');
