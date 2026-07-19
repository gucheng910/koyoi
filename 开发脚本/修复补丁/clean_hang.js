const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 恢复简单的 buildOpening
// 先移除我之前加的所有复杂改动，回到原始简洁版本
// 从 "const buildOpening" 到 "const startGame" 之间全部替换

const newBuildOpening = `const buildOpening = async () => {
    if (!worldCard || building) return;
    setBuilding(true);
    const cfg = (() => { const c = configStore.getActiveConfig(); return c ? { ...c, model: analysisModel, temperature: parseFloat(analysisTemp)||0.2, thinkingMode: 'disabled' as const, maxTokens: 4096, safetyFilter: 'off' as const } : null; })();
    if (!cfg?.apiKey) { setToast({msg:'请先配置API Key', type:'error'}); setBuilding(false); return; }
    setStep('opening');
    setParsingStatus('正在构建世界，可能需要30-60秒...');
    let entryChapterText = '';
    let entryChapterNum = 0;
    const chMatch = timePoint.match(/第(\d+)章/);
    if (chMatch) entryChapterNum = parseInt(chMatch[1]) - 1;
    else if (timePoint.includes('高潮')) entryChapterNum = Math.floor((worldCard.totalChapters || 10) / 2);
    else if (timePoint.includes('结局')) entryChapterNum = (worldCard.totalChapters || 10) - 2;
    if (entryChapterNum > 0 && novelMeta) {
      setParsingStatus('正在加载入口章节...');
      try { const chText = await getChapter(worldCard.id, entryChapterNum); if (chText) entryChapterText = chText.slice(0, 2000); } catch {}
    }
    const worldChars = worldCard.characters || [];
    const charList = worldChars.slice(0, 8).map((c: any) =>
      c.name + '（' + ((c.personality?.traits || c.traits || []).join('/') || '未知') + '，' + (c.relationship?.status || c.role || '') + '）'
    ).join('\\n');
    const events = (worldCard.timeline || []).slice(0, 3).map((e: any, i: number) =>
      (i+1) + '. ' + (typeof e === 'string' ? e : (e.event || e.description || ''))
    ).join('\\n');

    const prompt = [
      { role: 'system' as const, content: '你是世界构建引擎。基于原著分析结果，为玩家创建同人穿越世界。\\n1. worldBible：200-400字世界观概要\\n2. scene：200-400字开场场景（第二人称"你"）\\n3. npcs：2-5个初始在场NPC [{name,role,personality,currentStatus}]\\n4. worldState：一句话世界局势\\n只返回JSON。' },
      { role: 'user' as const, content: [
        '书名：《' + worldCard.novelTitle + '》',
        '类型：' + worldCard.worldType,
        '角色：\\n' + charList,
        '关键事件：\\n' + events,
        '穿越设定：' + (transType === 'soul' ? '魂穿到' + (targetCharId || '某角色') : '身穿降临'),
        '时间：' + (timePoint || '故事开始') + '（第' + (entryChapterNum+1) + '章附近）',
        '地点：' + (entryLocation || '未指定'),
        '玩家：' + (usePersonaStore.getState().gender === 'female' ? '女' : '男') + '性，' + (playerDesc || '外表未指定'),
        plotKnowledge ? '玩家知晓剧情' : '玩家不知晓剧情',
        entryChapterText ? '章节原文参考：' + entryChapterText : '',
      ].filter(Boolean).join('\\n') },
    ];

    try {
      const result = await Promise.race([
        chatCompletionSync(cfg, prompt, { temperature: 0.8, maxTokens: 4096 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 90000)),
      ]) as string;
      const data = safeParseJSON(result) || {};
      startGame(data.worldBible || '', data.scene || '你来到了' + worldCard.novelTitle + '的世界。', data.npcs || [], data.worldState || '');
      setBuilding(false);
    } catch (e: any) {
      setBuilding(false);
      if (e.message === 'TIMEOUT') {
        setToast({msg: '构建超时（90秒），可能是网络问题或API繁忙，请稍后重试', type: 'error'});
      } else {
        setToast({msg: '构建失败: ' + (e.message || '未知错误'), type: 'error'});
      }
      setStep('config');
    }
  };`;

// Find and replace the entire buildOpening function
const buildStart = t.indexOf('const buildOpening = async () => {');
const startGameIdx = t.indexOf('const startGame = (', buildStart);
t = t.slice(0, buildStart) + newBuildOpening + '\n\n  ' + t.slice(startGameIdx);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('clean buildOpening with Promise.race');
