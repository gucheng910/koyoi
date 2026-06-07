// ============================================================
//  大世界对话界面
// ============================================================
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, LayoutAnimation,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfigStore } from '../store/configStore';
import Toast from '../components/Toast';
import FadeIn from '../components/FadeIn';
import { showAlert } from '../components/AnimatedAlert';
import { chatCompletion, chatCompletionSync, polishText } from '../api/deepseek';
import { simulateCharacters } from '../services/characterSimulator';
import type { WorldSession, ChatMessage, Character } from '../types';
import type { CharacterAction } from '../services/characterSimulator';
import { breatheWorld as breatheWorldFn } from '../services/breatheWorld';
import { buildDialogueContext, contextToPrompt } from '../services/dialogueContext';
import { estimateChapterPosition, shouldAdvanceChapter } from '../services/chapterTracker';
import { getWorldInfo as getWorldInfoFn, extractMemories as extractMemoriesFn } from '../services/worldInfoService';
import { enhanceWithScenario } from '../services/scenarioInjector';
import { generateBackgroundInteraction, applyBackgroundInteraction } from '../services/backgroundInteraction';
import { WORLD_RULES, NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE } from '../prompts/worldRules';

interface Props { session: WorldSession; onBack: () => void; isDark: boolean; }

const T = (dark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: dark ? '#2A2822' : '#E8E4DD' },
  backBtn: { color: '#5B9BD5', fontSize: 15, paddingRight: 12 },
  topName: { fontSize: 16, fontWeight: '700', color: dark ? '#E8DCC8' : '#2D2822' },
  topStatus: { fontSize: 10, color: dark ? '#8A8070' : '#8A8070', marginTop: 2 },
  messageList: { paddingHorizontal: 16, paddingVertical: 12 },
  msgBubble: { alignSelf: 'flex-start', backgroundColor: dark ? '#1C1912' : '#FBF9F6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderBottomLeftRadius: 4, marginBottom: 10, maxWidth: '80%', borderWidth: 1, borderColor: dark ? '#2C2A22' : '#E8E4DD', borderLeftWidth: 2, borderLeftColor: '#5B9BD5' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#5B9BD5', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderBottomRightRadius: 4, marginBottom: 10, maxWidth: '85%' },
  speakerName: { fontSize: 11, fontWeight: '600', marginBottom: 4, color: '#5B9BD5' },
  msgText: { fontSize: 15, color: dark ? '#E8DCC8' : '#2D2822', lineHeight: 24 },
  userMsgText: { color: '#FFFFFF' },
  inputBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: dark ? '#2A2822' : '#E8E4DD', alignItems: 'flex-end' },
  textInput: { flex: 1, backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: dark ? '#E8DCC8' : '#2D2822', fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },
  sendBtn: { backgroundColor: '#5B9BD5', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, marginLeft: 8 },
  sendBtnOff: { backgroundColor: dark ? '#333' : '#ddd' },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

function parseSpeakers(text: string): { speaker: string; content: string }[] {
  const segments: { speaker: string; content: string }[] = [];
  const re = /【(.+?)】\s*/g;
  let lastIdx = 0; let match;
  while ((match = re.exec(text)) !== null) {
    if (lastIdx > 0 || match.index > 0) {
      const prev = text.slice(lastIdx, match.index).trim();
      if (prev && segments.length > 0) segments[segments.length - 1].content = prev;
      else if (prev && segments.length === 0) segments.push({ speaker: '', content: prev });
    }
    segments.push({ speaker: match[1], content: '' });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length && segments.length > 0) segments[segments.length - 1].content = text.slice(lastIdx).trim();
  if (segments.length === 0) segments.push({ speaker: '', content: text.trim() });
  return segments;
}

function normalizeSession(s: any) {
  const w = s.world || {};
  if (!w.rules) w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' };
  if (!w.locations) w.locations = [];
  if (!w.timeline) w.timeline = [];
  if (!w.characters) w.characters = [];
  s.world = w;
  if (!s.selectedCharacters) s.selectedCharacters = [];
  if (!s.npcs) s.npcs = [];
  if (!s.messages) s.messages = [];
  if (!s.worldLog) s.worldLog = [];
  return s;
}

export default function WorldChatScreen({ session: initialSession, onBack, isDark }: Props) {
  const st = T(isDark);
  const [session, setSession] = useState(initialSession);
  const [messages, setMessages] = useState<ChatMessage[]>(initialSession.messages);
  const [inputText, setInputText] = useState('');
  const [segments, setSegments] = useState<{text: string; tag: string}[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'|'info'}>({msg:'',type:'success'});
  const [ready, setReady] = useState(false);
  const [showOpening, setShowOpening] = useState(true);
  const [showCast, setShowCast] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const turnCount = useRef(Math.floor(initialSession.messages.length / 2));
  const flatListRef = useRef<FlatList>(null);
  const activeChars = useRef<string[]>(initialSession.selectedCharacters.map(c => c.name));
  const lastSimResults = useRef<Record<string,{intent:string;mood:string}>>({});
  const isNearBottom = useRef(true);
  const attitudes = useRef<Record<string, any>>((session as any).characterAttitudes || {});
  const summaryRef = useRef('');

  const greetings = ['世界正在苏醒…','墨水尚未干透…','故事即将开始…','角色们正在就位…'];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  useEffect(() => { const tm = setTimeout(() => setShowOpening(false), 2500); return () => clearTimeout(tm); }, []);
  useEffect(() => { const tm = setTimeout(() => setReady(true), 500); return () => clearTimeout(tm); }, []);

  const scrollToBottom = () => setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
  const handleScroll = (e: any) => { const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent; isNearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80; };
  const smartScroll = () => { if (isNearBottom.current) scrollToBottom(); };

  const commitSegment = (tag: string) => { const txt = inputText.trim(); if (!txt) return; setSegments(prev => [...prev, { text: txt, tag }]); setInputText(''); };

  const displayMsgs = [...messages, ...(isGenerating && streamingText ? [{ role: 'assistant' as const, content: streamingText, timestamp: '', isStreaming: true } as any] : [])];

  const SESSION_KEY = '@koyoi_session_' + session.id;
  const INDEX_KEY = '@koyoi_world_index';

  const saveSession = async (msgs?: ChatMessage[]) => {
    try {
      const current = JSON.stringify({
        ...session,
        messages: msgs ?? messages,
        recentWorldEvents: session.recentWorldEvents || [],
        worldLog: session.worldLog || [],
        memories: session.memories || [],
        currentChapter: session.currentChapter || 0,
      });
      // 独立写：每个世界自己的 key，不存在并发覆盖
      await AsyncStorage.setItem(SESSION_KEY, current);

      // 索引更新：轻量写入，用于首页列表
      const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
      const index = rawIdx ? JSON.parse(rawIdx) : {};
      index[session.id] = {
        id: session.id,
        name: session.world?.name || '未知',
        type: session.world?.type || 'custom',
        charCount: session.selectedCharacters?.length || 0,
        msgCount: (msgs ?? messages).length,
        lastActivity: new Date().toISOString(),
        hasNovelId: !!session.worldNovelId,
        currentChapter: session.currentChapter || 0,
      };
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {}
  };

  const send = useCallback(async () => {
    if (segments.length === 0 || isGenerating) return;
    const cfg = useConfigStore.getState().getActiveConfig();
    if (!cfg?.apiKey) { setError('请先配置API Key'); return; }
    setError(null); setIsGenerating(true); setStreamingText('');
    const finalText = segments.map((s: any) => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\n');
    setSegments([]);
    const userMsg: ChatMessage = { role: 'user', content: finalText, timestamp: new Date().toISOString() };
    const msgsWithUser = [...messages, userMsg];
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages(msgsWithUser);
    smartScroll();
    try {
      const worldInfo = getWorldInfoFn(session, finalText, messages);
      if (messages.length > 30 && !summaryRef.current && turnCount.current % 10 === 0) {
        const oldMsgs = messages.slice(0, messages.length - 30);
        if (oldMsgs.length > 10) {
          const sp = [{ role: 'system' as const, content: '将对话压缩为摘要。事件/关系/情感各30字内。' }, { role: 'user' as const, content: oldMsgs.map((m: any) => (m.role==='user'?'玩家':'')+':'+m.content.slice(0,150)).join('\n').slice(0, 8000) }];
          chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, sp, { maxTokens: 300, temperature: 0.2 }).then(raw => { if (raw && raw.length > 20) summaryRef.current = '[对话摘要]\n' + raw.slice(0, 400); }).catch(() => {});
        }
      }
      let chapterCtx: any = null;
      try { if (session.worldNovelId) chapterCtx = await buildDialogueContext(session.worldNovelId, session.currentChapter || 0, (session.recentWorldEvents || []).slice(-5), finalText); } catch {}
      const hasRounds = turnCount.current >= 2;
      const isFanfic = !!(session.worldNovelId || (session.world?.writingStyle && session.world?.characters?.length));
      let charActions: CharacterAction[] = [];
      if (hasRounds) {
        const chars = [
          ...session.selectedCharacters.filter(c => activeChars.current.includes(c.name)).map(c => ({ name: c.name, personality: c.personality.traits.join('/'), deepPersonality: '', role: c.relationship.status, status: c.currentContext.location, goal: '', relationship: '亲密' + c.relationship.intimacy + '/100', interactionState: 'active' as const })),
          ...(session.npcs || []).map(n => ({ name: n.name, personality: n.personality, deepPersonality: '', role: n.role, status: n.currentStatus, goal: n.goal || '', relationship: '路人', interactionState: activeChars.current.includes(n.name) ? 'active' as const : 'inactive' as const })),
        // 同人世界：未出场的原著角色也推演（知道他们在想什么）
        ...(isFanfic && turnCount.current % 3 === 0 ? (session.world?.characters || []).filter((c: Character) => { const n = c.name || ''; return !session.selectedCharacters.some(sc => sc.name === n) && !(session.npcs||[]).some(np => np.name === n); }).slice(0, 5).map((c: Character) => ({ name: c.name || '', personality: (c.personality?.traits || ['未知']).join('/'), deepPersonality: (c.personality as any)?._deepProfile || '', role: c.relationship?.status || '', status: '故事某处', goal: '', relationship: '原著角色', interactionState: 'inactive' as const })) : []),
        ];
        if (chars.length > 0) {
          const simKbContext: Record<string, string> = {};
          if (chapterCtx?.activeCharacters) {
            for (const c of chars) {
              const kb = chapterCtx.activeCharacters.find((ac: any) => ac.name === c.name);
              if (kb) {
                const parts: string[] = [];
                if (kb.traits?.length) parts.push('性格：' + kb.traits.join('、'));
                if (kb.deepTraits?.length) parts.push('真实性格：' + kb.deepTraits.join('、'));
                if (kb.defenseMechanism) parts.push('防御机制：' + kb.defenseMechanism);
                if (kb.role) parts.push('身份：' + kb.role);
                if (kb.speechStyle) parts.push('说话方式：' + kb.speechStyle);
                if (kb.speechSample) parts.push('台词示例：' + kb.speechSample);
                simKbContext[c.name] = parts.join('\n');
              }
            }
          }
          try {
            const result = await simulateCharacters(cfg, chars, session.currentScene, (session.recentWorldEvents || []).slice(-2).join('；'), activeChars.current.join('、'), lastSimResults.current, simKbContext);
            charActions = result.actions;
            const record: Record<string,{intent:string;mood:string}> = {};
            for (const a of charActions) {
              record[a.name] = {intent:a.intent, mood:a.mood};
              if (a.affectionDelta && Math.abs(a.affectionDelta) > 0.001) {
                if (!attitudes.current[a.name]) attitudes.current[a.name] = { trust: 50, affection: 0, fear: 20, lastUpdate: '' };
                let delta = a.affectionDelta; const aff = attitudes.current[a.name].affection || 0;
                if (aff > 80) delta *= 0.25; else if (aff > 60) delta *= 0.5; else if (aff < -50) delta *= 1.5;
                attitudes.current[a.name].affection = Math.max(-100, Math.min(100, aff + delta));
              }
            }
            lastSimResults.current = record;
            for (const ch of result.interactionChanges) {
              if (ch.action === 'pull_in' && ch.character_name && !activeChars.current.includes(ch.character_name)) {
                activeChars.current.push(ch.character_name);
                const existingNpc = (session.npcs || []).find(n => n.name === ch.character_name);
                const inSelected = session.selectedCharacters.some(c => c.name === ch.character_name);
                if (!existingNpc && !inSelected) {
                  const worldChars = (session.world as any)?.characters || [];
                  const wc = worldChars.find((wc: any) => wc.name === ch.character_name);
                  const newNpc = wc ? { name: wc.name, role: wc.relationship?.status || '原著角色', personality: (wc.personality?.traits || ['未知']).join('/'), currentStatus: '刚刚出现', goal: '' } : { name: ch.character_name, role: '原著角色', personality: '未知', currentStatus: '刚刚出现', goal: '' };
                  setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc] }));
                }
              } else if (ch.action === 'push_out' && ch.character_name) {
                activeChars.current = activeChars.current.filter(n => n !== ch.character_name);
              }
            }
          } catch {}
        }
      }
      const fanficAppend = isFanfic ? NARRATOR_FANFIC_APPEND : '';
      const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';
      const bedrockMems = (session as any).bedrockMemories || [];
      const bedrockText = bedrockMems.length > 0 ? '\n核心记忆（永不遗忘）：\n' + bedrockMems.map((m: any) => '  - ' + (m.content || m)).join('\n') : '';
      const styleFeat = (session.world as any)?.styleFeatures ? '\n风格特征：\n' + (session.world as any).styleFeatures : '';
      // 情景注入（DeepRolePlay 式记忆闪回）
      let scenarioBlock = '';
      // 只在当前消息提到记忆中实体时才触发情景注入（免浪费 token）
      const lastUserText = msgsWithUser.filter(m => m.role === 'user').pop()?.content || '';
      const hasMemoryTrigger = (session.memories || []).some(m => lastUserText.includes(m.split(/[:：]/)[0]?.slice(0, 3) || ''));
      if (hasMemoryTrigger || (session.memories || []).length <= 5) {
        try {
          const sc = await enhanceWithScenario(session, messages.slice(-6), cfg);
          if (sc.scenarioBlock) scenarioBlock = '\n' + sc.scenarioBlock;
        } catch {}
      }
      const prompt = [
        { role: 'system' as const, content: [
          '你是' + (session.world?.name || '未知世界') + '的叙事引擎。' + NARRATOR_BASE + fanficAppend,
          '【玩家身份】' + (session.selectedCharacters.length > 0 ? session.selectedCharacters[0].name : '玩家') + '是你正在互动的玩家角色。[说]=玩家角色在说话，[行动]=玩家角色的行为。你扮演除玩家以外的所有角色和旁白。',
          '世界观：' + (session.world?.type || '') + ' | ' + (session.world?.rules?.supernatural || ''),
          chapterPrompt,
          summaryRef.current || '',
          bedrockText,
          scenarioBlock,
          styleFeat,
          isFanfic ? VOCAB_LOCK : '',
          ...WORLD_RULES,
          '\n场景：' + (session.currentScene || '未知地点'),
          '\n角色：',
          ...session.selectedCharacters.map(c => {
            const deep = (c.personality as any)?._deepProfile || '';
            const dialogue = (c.exampleDialogues || []).slice(0, 2).map((d: any) => d.character).join(' / ');
            let line = '- ' + c.name + '：' + c.personality.traits.join('、') + '，' + c.relationship.status;
            const att = attitudes.current[c.name];
            if (att && att.affection !== undefined) { const label = att.affection > 60 ? '亲近' : att.affection > 30 ? '友好' : att.affection > 0 ? '平淡' : att.affection < -30 ? '厌恶' : att.affection < 0 ? '冷淡' : '中性'; line += ' | 好感：' + att.affection.toFixed(1) + '（' + label + '）'; }
            if (deep) line += ' | ' + deep;
            if ((c as any).arc?.description) { const arc = (c as any).arc; const ch = session.currentChapter || 0; const pastChs = arc.keyChapters?.filter((k: number) => k <= ch) || []; line += ' | 弧线：' + arc.description + (pastChs.length > 0 ? '（已走过' + pastChs.map((k:number)=>'第'+(k+1)+'章').join('→') + '）' : ''); }
            if (c.personality.speakingStyle) line += ' | 说话：' + c.personality.speakingStyle;
            if (dialogue) line += ' | 台词：「' + dialogue + '」';
            return line;
          }),
          ...(session.npcs || []).filter(n => !session.selectedCharacters.some(c => c.name === n.name)).map(n => {
            const wc = ((session.world as any)?.characters || []).find((wc: any) => wc.name === n.name);
            const orig = wc?.role || wc?.relationship?.status || '';
            const deep = (wc?.personality as any)?._deepProfile || '';
            let line = '- ' + n.name + '：' + n.role + (orig ? '（原著：' + orig + '）' : '') + '，' + n.personality;
            if (deep) line += ' | ' + deep;
            return line;
          }),
          charActions.length > 0 ? '\n角色推演：\n' + charActions.map(a => {
            let s = '  ' + a.name + '：' + a.intent + '（' + a.mood + '）';
            if (a.innerThought) s += '\n    内心：' + a.innerThought;
            if (a.bodyLanguage) s += '\n    身体：' + a.bodyLanguage;
            if (a.subtext) s += '\n    潜台词：' + a.subtext;
            s += '\n    方向：' + (a.emotionalDirection || 'holding') + ' | 指向：' + (a.toward === 'player' ? '玩家' : a.toward || 'none') + (a.wantsInteraction ? ' | 想互动' : '');
            if (a.triggerContext) s += '\n    触发：' + a.triggerContext;
            return s;
          }).join('\n') : '',
          session.worldBible ? '\n世界圣经：' + session.worldBible : '',
          (session.world as any)?.styleSamples?.length > 0 ? '\n风格参考：' + (session.world as any).styleSamples.slice(0, 2).map((s: string) => '「' + s + '」').join('\n') : '',
          '\n【角色引入】需要引入原著新角色时，在回复末尾添加 ___META___ {"newCharacter":"角色名"}',
          worldInfo || '',
          POST_HISTORY_BASE,
        ].join('\n') },
        ...msgsWithUser.slice(1).map(m => ({ role: m.role as 'user'|'assistant', content: m.content })),
      ];
      const raw = await new Promise<string>((resolve, reject) => {
        if (cfg.streamOutput) {
          let full = '';
          let lastUpdate = 0;
          chatCompletion({
            config: { ...cfg, thinkingMode: 'disabled' },
            messages: prompt,
            onToken: (token) => {
              full += token;
              const now = Date.now();
              if (now - lastUpdate > 50) { // 每50ms最多更新一次UI，避免过度渲染
                setStreamingText(full);
                lastUpdate = now;
              }
            },
            onComplete: (text) => { setStreamingText(''); resolve(text || full); },
            onError: reject,
          });
        } else {
          chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { temperature: 0.8 }).then(resolve).catch(reject);
        }
      });
      if (raw) {
        let displayText = raw;
        // 同人模式：用原文 + 风格特征做 polish，对齐文风
        if (session.worldNovelId && cfg.autoPolish !== false) {
          try {
            const styleFeatures = session.world?.writingStyle || '';
            const chapterSample = chapterCtx?.chapterText || '';
            if (styleFeatures || chapterSample) {
              displayText = await polishText(cfg, displayText, { styleFeatures, chapterSample });
            }
          } catch { /* polish 失败不影响主流程 */ }
        }
        const metaMatch = raw.match(/___META___\s*(\{[\s\S]*\})/);
        if (metaMatch) {
          try {
            const meta = JSON.parse(metaMatch[1]);
            displayText = raw.replace(/___META___[\s\S]*$/, '').trim();
            if (meta.newCharacter && typeof meta.newCharacter === 'string') {
              const name = meta.newCharacter;
              const inScene = session.selectedCharacters.some(c => c.name === name) || (session.npcs||[]).some(n => n.name === name);
              if (!inScene) {
                const worldChars = (session.world as any)?.characters || [];
                const wc = worldChars.find((wc: any) => wc.name === name);
                const newNpc = wc ? { name: wc.name, role: wc.relationship?.status || '原著角色', personality: (wc.personality?.traits || ['未知']).join('/'), currentStatus: '刚刚进入场景', goal: '' } : { name, role: '原著角色', personality: '未知', currentStatus: '刚刚进入场景', goal: '' };
                setSession(prev => ({ ...prev, npcs: [...(prev.npcs || []), newNpc], recentWorldEvents: [...(prev.recentWorldEvents || []).slice(-19), name + '进入了场景'] }));
                if (!activeChars.current.includes(name)) activeChars.current.push(name);
              }
            }
          } catch {}
        }
        const msg: ChatMessage = { role: 'assistant', content: displayText || raw, timestamp: new Date().toISOString() };
        const updated = [...msgsWithUser, msg];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setMessages(updated);
        turnCount.current++; smartScroll();
        if (turnCount.current % 5 === 0) saveSession(updated);
        // 章节追踪：每3轮让AI判断剧情推进到原著的哪一章
        if (turnCount.current % 3 === 0 && session.worldNovelId) {
          const tcfg = useConfigStore.getState().getActiveConfig();
          if (tcfg) {
            const recentTexts = updated.slice(-6).filter((m: any) => !m.isStreaming).map((m: any) => m.content).join('\n');
            estimateChapterPosition(tcfg, session.worldNovelId, session.currentChapter || 0, [recentTexts]).then(pos => {
              const newCh = shouldAdvanceChapter(session.currentChapter || 0, pos);
              if (newCh !== null) {
                console.log('[KOYOI] chapter advanced:', (session.currentChapter||0)+1, '→', newCh+1, pos?.reason);
                setSession(prev => ({ ...prev, currentChapter: newCh }));
              }
            }).catch(() => {});
          }
        }
        if (turnCount.current % 10 === 0) {
          const mcfg = useConfigStore.getState().getActiveConfig();
          if (mcfg) extractMemoriesFn(mcfg.apiKey, mcfg.baseUrl, mcfg.model, updated, lastSimResults.current).then(mems => {
            if (mems.length) setSession(prev => ({ ...prev, memories: [...(prev.memories || []), ...mems].slice(-20) }));
          });
        }
        // 角色自主互动（每 5 轮触发一次，参考 OpenCharacterBook A2A）
        if (turnCount.current % 5 === 0 && session.selectedCharacters.length >= 2) {
          const bcfg = useConfigStore.getState().getActiveConfig();
          if (bcfg) {
            const activeList = session.selectedCharacters.map(c => ({
              name: c.name,
              personality: c.personality.traits.join('/'),
              status: c.currentContext?.mood || '平静',
              relationship: c.relationship?.status || '陌生人',
            }));
            generateBackgroundInteraction(bcfg, activeList, session.currentScene || '未知场景').then(interaction => {
              if (interaction) {
                setSession(prev => applyBackgroundInteraction(prev, interaction));
              }
            }).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.includes('429')) setError('请求过于频繁，已自动降速。请稍等片刻再试。');
      else if (msg.includes('401')) setError('API Key 无效，请前往设置重新配置。');
      else if (msg.includes('402')) setError('账户余额不足，请充值。');
      else if (msg.includes('500') || msg.includes('502')) setError('服务器繁忙，请稍后重试。');
      else if (msg.includes('超时') || msg.includes('timeout')) setError('请求超时，请检查网络连接。');
      else setError(msg);
    }
    finally { setIsGenerating(false); }
  }, [isGenerating, session, messages, segments]);

  const renderMsg = ({ item }: { item: ChatMessage }) => {
    if (item.role === 'user') {
      const lines = item.content.split('\n');
      return <View>{lines.map((line, i) => {
        const tagMatch = line.match(/^\[(.+?)\]\s/);
        const tag = tagMatch ? tagMatch[1] : '';
        const text = tagMatch ? line.slice(tagMatch[0].length) : line;
        return <View key={i} style={[st.userBubble, { paddingVertical: 6, marginBottom: 4 }]}>
          {tag ? <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '700', marginBottom: 2, letterSpacing: 1 }}>{tag}</Text> : null}
          <Text style={st.userMsgText}>{text}</Text>
        </View>;
      })}</View>;
    }
    const speakers = parseSpeakers(item.content);
    return <View>{speakers.map((seg, i) => {
      if (seg.speaker && seg.speaker !== '旁白') return <View key={i} style={st.msgBubble}><Text style={st.speakerName}>{seg.speaker}</Text><Text style={st.msgText}>{seg.content}</Text></View>;
      return <Text key={i} style={[st.msgText, { paddingHorizontal: 16, paddingVertical: 4, color: isDark ? '#8A8070' : '#8A8068', fontStyle: 'italic', fontSize: 14, lineHeight: 22, borderLeftWidth: 2, borderLeftColor: isDark ? '#2C2A22' : '#E8E4DD', marginLeft: 4 }]}>{seg.content}</Text>;
    })}</View>;
  };

  if (showOpening) return (
    <View style={[st.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }]}>
      <FadeIn style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 56, marginBottom: 20 }}>📖</Text>
        <Text style={{ fontSize: 22, fontWeight: '600', color: isDark ? '#E8DCC8' : '#2D2822', textAlign: 'center', marginBottom: 12 }}>{session.world?.name || '世界'}</Text>
        <Text style={{ fontSize: 13, color: '#5B9BD5', letterSpacing: 4, marginBottom: 24 }}>— 故事继续 —</Text>
        <Text style={{ fontSize: 13, color: isDark ? '#8A8070' : '#8A8068', textAlign: 'center', lineHeight: 22 }}>{session.worldState || ''}</Text>
      </FadeIn>
    </View>
  );

  if (!ready) return (
    <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>📖</Text>
      <ActivityIndicator size="large" color="#5B9BD5" />
      <Text style={{ fontSize: 14, color: isDark ? '#8A8070' : '#8A8068', marginTop: 24, letterSpacing: 2 }}>{greeting}</Text>
    </View>
  );

  return (
    <FadeIn style={{ flex: 1 }}>
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={st.topBar}>
        <TouchableOpacity onPress={() => { if (isGenerating) showAlert('退出','对话生成中，确定退出？',[{text:'取消'},{text:'退出',style:'destructive',onPress: async () => { await saveSession(); onBack(); }}]); else { saveSession().then(onBack); } }}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.topName}>{session.world?.name || '世界'}</Text>
          <Text style={st.topStatus}>{session.selectedCharacters.length}个角色 · 第{turnCount.current + 1}轮{session.worldNovelId ? ' · 第' + ((session.currentChapter || 0) + 1) + '章' : ''}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowLog(!showLog)} style={{ paddingHorizontal: 8 }}><Text style={{ fontSize: 11, color: '#5B9BD5' }}>{showLog ? '收起' : '📜'}</Text></TouchableOpacity>
      </View>
      {(session.selectedCharacters.length > 0 || (session.npcs||[]).length > 0) && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, gap: 4, backgroundColor: isDark ? '#0D0C0A' : '#FAF8F5', borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2822' : '#E8E4DD' }}>
          {[...session.selectedCharacters, ...(session.npcs||[]).filter(n => !session.selectedCharacters.some(c => c.name === n.name))].slice(0, showCast ? 20 : 5).map((c: any, i: number) => (
            <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: isDark ? '#1A1814' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2822' : '#E8E4DD' }}>
              <Text style={{ fontSize: 10, color: isDark ? '#E8DCC8' : '#2D2822' }}>{c.name}</Text>
            </View>
          ))}
          {(session.selectedCharacters.length + (session.npcs||[]).length) > 5 && (
            <TouchableOpacity onPress={() => setShowCast(!showCast)} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: '#5B9BD522' }}>
              <Text style={{ fontSize: 10, color: '#5B9BD5' }}>{showCast ? '收起' : '更多'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {showLog && (session.recentWorldEvents || []).length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: isDark ? '#0D0C0A' : '#FAF8F5', borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2822' : '#E8E4DD' }}>
          {(session.recentWorldEvents || []).slice(-5).map((e: string, i: number) => (<Text key={i} style={{ fontSize: 10, color: isDark ? '#8A8070' : '#8A8070', lineHeight: 16 }}>· {e}</Text>))}
        </View>
      )}
      {error ? <View style={{ padding: 10, backgroundColor: '#3a1010' }}><Text style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</Text><TouchableOpacity onPress={() => setError(null)}><Text style={{ color: '#ff6b6b' }}> ✕</Text></TouchableOpacity></View> : null}
      <FlatList ref={flatListRef} data={displayMsgs} renderItem={renderMsg} keyExtractor={(_, i) => String(i)} contentContainerStyle={st.messageList} onScroll={handleScroll} scrollEventThrottle={100} onContentSizeChange={scrollToBottom} />
      {segments.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 4, gap: 4 }}>
          {segments.map((seg, i) => (
            <TouchableOpacity key={i} onPress={() => { setInputText(prev => prev + (prev ? ' ' : '') + seg.text); setSegments(prev => prev.filter((_, idx) => idx !== i)); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1A2430' : '#E8F0F8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: isDark ? '#3A3428' : '#E8E4DD' }}>
              <Text style={{ fontSize: 9, color: '#5B9BD5', fontWeight: '700', marginRight: 4 }}>{seg.tag === 'speech' ? '说' : '行动'}</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#E8DCC8' : '#2D2822' }} numberOfLines={1}>{seg.text.slice(0, 25)}</Text>
              <Text style={{ fontSize: 9, color: isDark ? '#8A8070' : '#8A8070', marginLeft: 4 }}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={st.inputBar}>
        <TouchableOpacity onPress={() => commitSegment('speech')} style={{ paddingHorizontal: 6, paddingVertical: 12, marginRight: 2 }}><Text style={{ fontSize: 12, color: '#5B9BD5', fontWeight: '700' }}>说</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => commitSegment('action')} style={{ paddingHorizontal: 6, paddingVertical: 12, marginRight: 4 }}><Text style={{ fontSize: 12, color: '#8A8070', fontWeight: '700' }}>行动</Text></TouchableOpacity>
        <TextInput style={st.textInput} value={inputText} onChangeText={setInputText} placeholder="输入消息..." placeholderTextColor={isDark ? '#555' : '#bbb'} multiline maxLength={2000} editable={!isGenerating} returnKeyType="send" />
        <TouchableOpacity style={[st.sendBtn, (!!inputText.trim() || isGenerating) && st.sendBtnOff]} onPress={send} disabled={!!inputText.trim() || segments.length === 0 || isGenerating}>
          {isGenerating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.sendText}>发送</Text>}
        </TouchableOpacity>
      </View>
      <Toast visible={toast.msg !== ''} message={toast.msg} type={toast.type} onHide={() => setToast({msg:'',type:'success'})} />
    </KeyboardAvoidingView>
    </FadeIn>
  );
}
