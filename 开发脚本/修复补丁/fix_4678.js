const fs = require('fs');

// === 4. 情景注入加关键词匹配兜底 ===
let ws = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');
ws = ws.replace(
  "let scenarioBlock = '';\n      try {\n        const sc = await enhanceWithScenario(session, messages.slice(-6), cfg);\n        if (sc.scenarioBlock) scenarioBlock = '\\n' + sc.scenarioBlock;\n      } catch { /* 注入失败不影响主流程 */ }",
  "let scenarioBlock = '';\n      // 只在当前消息提到记忆中实体时才触发情景注入（免浪费 token）\n      const lastUserText = msgsWithUser.filter(m => m.role === 'user').pop()?.content || '';\n      const hasMemoryTrigger = (session.memories || []).some(m => lastUserText.includes(m.split(/[:：]/)[0]?.slice(0, 3) || ''));\n      if (hasMemoryTrigger || (session.memories || []).length <= 5) {\n        try {\n          const sc = await enhanceWithScenario(session, messages.slice(-6), cfg);\n          if (sc.scenarioBlock) scenarioBlock = '\\n' + sc.scenarioBlock;\n        } catch {}\n      }"
);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', ws);

// === 6. 同人抛光匹配原文标点习惯 ===
let api = fs.readFileSync('D:/koyoi/src/api/deepseek.ts', 'utf8');
api = api.replace(
  "## 同人模式额外规则（当 styleFeatures 含\"原著\"时生效）\n若下方提供了原文参考段落，你必须在以下方面严格对齐：\n- 句长节奏：与原文样本的句长分布一致\n- 感官密度：原文每段几个感官描写，你就几个\n- 词汇选择：优先用原文中出现过的词\n- 叙事距离：对齐原文的视角距离（紧贴内心/远距白描/切换）",
  "## 同人模式额外规则（当 styleFeatures 含\"原著\"时生效）\n若下方提供了原文参考段落，你必须在以下方面严格对齐：\n- 句长节奏：与原文样本的句长分布一致\n- 感官密度：原文每段几个感官描写，你就几个\n- 词汇选择：优先用原文中出现过的词\n- 叙事距离：对齐原文的视角距离（紧贴内心/远距白描/切换）\n- 标点习惯：原文破折号密度高则保留破折号，原文爱用省略号则保留省略号，原文无破折号则删。匹配原文的标点肌肉记忆\n- 排比句式：原文有三连排比段落则保留你的排比，原文无排比则删三连排比句"
);

// Update the "不能碰" section to match
api = api.replace(
  "- 破折号：中文小说中的破折号用于呼吸控制和意识流，只删明显是 AI 解释用途的\n- 三连排比：如果是情感递进或场景渲染的排比，保留。只有空洞/套话排比才删",
  "- 破折号：对照原文。原文用则保留，原文不用则删。AI 解释用途的破折号（如\"——换句话说\"\"——也就是说\"）永远删除\n- 三连排比：对照原文。原文有排比段落则允许，原文无排比则删除。情感递进/场景渲染除外"
);
fs.writeFileSync('D:/koyoi/src/api/deepseek.ts', api);

// === 7. 分析进度条 ===
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');
ff = ff.replace(
  "<ActivityIndicator size=\"large\" color=\"#5B9BD5\" />\n              <Text style={st.parsingText}>{parsingStatus}</Text>",
  "<ActivityIndicator size=\"large\" color=\"#5B9BD5\" />\n              <Text style={st.parsingText}>{parsingStatus}</Text>\n              {parseEstimate !== '' && <Text style={{ fontSize: 12, color: '#ff9800', textAlign: 'center', marginTop: 8 }}>{parseEstimate}</Text>}"
);
fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);

// === 8. 错误信息友好化 ===
let ct = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');
ct = ct.replace(
  "} catch (e: any) { setError(e.message || String(e)); }",
  "} catch (e: any) {\n      const msg = e.message || String(e);\n      if (msg.includes('429')) setError('请求过于频繁，已自动降速。请稍等片刻再试。');\n      else if (msg.includes('401')) setError('API Key 无效，请前往设置重新配置。');\n      else if (msg.includes('402')) setError('账户余额不足，请充值。');\n      else if (msg.includes('500') || msg.includes('502')) setError('服务器繁忙，请稍后重试。');\n      else if (msg.includes('超时') || msg.includes('timeout')) setError('请求超时，请检查网络连接。');\n      else setError(msg);\n    }"
);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', ct);

console.log('items 4,6,7,8 done');
