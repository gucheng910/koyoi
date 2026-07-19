const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Add chapter context injection into prompt
t = t.replace(
  'const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : \'\';',
  'const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : \'\';\n      // 风格特征\n      const styleFeat = (session.world as any)?.styleFeatures ? `\n风格特征：\n${(session.world as any).styleFeatures}` : \'\';'
);

// Add styleFeatures and chapterPrompt to the prompt
t = t.replace(
  'chapterPrompt,\n          ...WORLD_RULES,',
  'chapterPrompt,\n          styleFeat,\n          ...WORLD_RULES,'
);

// Add exit confirmation with showAlert
t = t.replace(
  "import Toast from '../components/Toast';",
  "import Toast from '../components/Toast';\nimport { showAlert } from '../components/AnimatedAlert';"
);

t = t.replace(
  '<TouchableOpacity onPress={onBack}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>',
  '<TouchableOpacity onPress={() => { if (isGenerating) { showAlert(\'退出\', \'对话正在生成中，确定退出？\', [{ text: \'取消\' }, { text: \'退出\', style: \'destructive\', onPress: onBack }]); } else { onBack(); } }}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('chapter context + exit confirmation added');
