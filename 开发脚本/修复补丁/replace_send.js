const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Add import for sendPipeline
t = t.replace(
  "import { WORLD_RULES, NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE } from '../prompts/worldRules';",
  "import { WORLD_RULES, NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE } from '../prompts/worldRules';\nimport { processInput, maybeGenerateSummary, buildContext, runCharacterSimulation, assemblePrompt, callAI, postProcessResponse, runPostSendHooks } from '../services/sendPipeline';"
);

// Now replace the entire send function body
// Find "const send = useCallback(async () => {" and replace the body
const sendStart = t.indexOf('const send = useCallback(async () => {');
const sendEnd = t.indexOf('  }, [isGenerating, session, messages, segments]);', sendStart);
const oldSend = t.slice(sendStart, sendEnd + '  }, [isGenerating, session, messages, segments]);'.length);

const newSend = `const send = useCallback(async () => {
    if (segments.length === 0 || isGenerating) return;
    const cfg = useConfigStore.getState().getActiveConfig();
    if (!cfg?.apiKey) { setError('请先配置API Key'); return; }

    // 阶段 1: 输入处理
    setError(null); setIsGenerating(true); setStreamingText('');
    const { finalText, userMsg, msgsWithUser } = processInput(segments, messages);
    setSegments([]);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages(msgsWithUser);
    smartScroll();

    try {
      // 阶段 2: 摘要生成（非阻塞）
      maybeGenerateSummary(messages, turnCount.current, summaryRef, cfg);

      // 阶段 3: 上下文构建
      const { chapterCtx, isFanfic, worldInfo } = await buildContext(session, finalText, messages, turnCount.current);

      // 阶段 4: 角色推演
      const hasRounds = turnCount.current >= 2;
      const charActions = hasRounds
        ? await runCharacterSimulation(session, cfg, chapterCtx, isFanfic, turnCount.current, activeChars, lastSimResults, attitudes)
        : [];

      // 阶段 5: 提示词组装
      const { prompt } = await assemblePrompt(session, msgsWithUser, messages, charActions, chapterCtx, isFanfic, cfg, summaryRef, attitudes);

      // 阶段 6: API 调用
      const raw = await callAI(cfg, prompt, setStreamingText);

      if (raw) {
        // 阶段 7: 响应后处理
        const { displayText, newNpcs } = await postProcessResponse(raw, session, cfg, chapterCtx, activeChars);
        if (newNpcs) {
          for (const npc of newNpcs) {
            setSession(prev => ({
              ...prev,
              npcs: [...(prev.npcs || []), npc],
              recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), npc.name + '进入了场景'],
            }));
            if (!activeChars.current.includes(npc.name)) activeChars.current.push(npc.name);
          }
        }

        const msg: ChatMessage = { role: 'assistant', content: displayText || raw, timestamp: new Date().toISOString() };
        const updated = [...msgsWithUser, msg];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setMessages(updated);
        smartScroll();

        // 阶段 8: 后处理钩子
        runPostSendHooks({ session, updated, turnCount, saveSession, setSession, activeChars, lastSimResults });
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.includes('429')) setError('请求过于频繁，已自动降速。请稍等片刻再试。');
      else if (msg.includes('401')) setError('API Key 无效，请前往设置重新配置。');
      else if (msg.includes('402')) setError('账户余额不足，请充值。');
      else if (msg.includes('500') || msg.includes('502')) setError('服务器繁忙，请稍后重试。');
      else if (msg.includes('超时') || msg.includes('timeout')) setError('请求超时，请检查网络连接。');
      else setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, session, messages, segments]);`;

t = t.replace(oldSend, newSend);

// Also remove unused imports that are now in sendPipeline
// NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE, WORLD_RULES are still used elsewhere
// Don't remove them

// Remove unused import: chatCompletion, polishText, simulateCharacters, buildDialogueContext, etc.
// Actually they might be used elsewhere in the component too. Let me check.

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('send function replaced with pipeline orchestrator');
