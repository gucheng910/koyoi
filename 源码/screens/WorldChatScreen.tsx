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
import { processInput, maybeGenerateSummary, buildContext, runCharacterSimulation, assemblePrompt, callAI, postProcessResponse, runPostSendHooks } from '../services/sendPipeline';
import { routeContent } from '../services/sendPipeline/stage4_5_router';
import { recordFeedback as rf } from '../services/feedbackStore';
import { SAFE_TOP } from '../theme/safeArea';
import { useSafeBottom } from '../theme/useSafeBottom';

interface Props { session: WorldSession; onBack: () => void; isDark: boolean; }

const T = (dark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
  topBarBase: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: dark ? '#2A2822' : '#E8E4DD' },
  backBtn: { color: '#5B9BD5', fontSize: 15, paddingRight: 12 },
  topName: { fontSize: 16, fontWeight: '700', color: dark ? '#E8DCC8' : '#2D2822' },
  topStatus: { fontSize: 10, color: dark ? '#8A8070' : '#8A8070', marginTop: 2 },
  messageList: { paddingHorizontal: 16, paddingVertical: 12 },
  msgBubble: { alignSelf: 'flex-start', backgroundColor: dark ? '#1C1912' : '#FBF9F6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderBottomLeftRadius: 4, marginBottom: 10, maxWidth: '80%', borderWidth: 1, borderColor: dark ? '#2C2A22' : '#E8E4DD', borderLeftWidth: 2, borderLeftColor: '#5B9BD5' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#5B9BD5', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderBottomRightRadius: 4, marginBottom: 10, maxWidth: '85%' },
  speakerName: { fontSize: 11, fontWeight: '600', marginBottom: 4, color: '#5B9BD5' },
  msgText: { fontSize: 15, color: dark ? '#E8DCC8' : '#2D2822', lineHeight: 24 },
  userMsgText: { color: '#FFFFFF' },
  inputBarBase: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 0, borderTopWidth: 1, borderTopColor: dark ? '#2A2822' : '#E8E4DD', alignItems: 'flex-end' },
  textInput: { flex: 1, backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: dark ? '#E8DCC8' : '#2D2822', fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },
  sendBtn: { backgroundColor: '#5B9BD5', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, marginLeft: 8 },
  sendBtnOff: { backgroundColor: dark ? '#333' : '#ddd' },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

/** 引号对话高亮：无【角色名】标记时，将引号内容渲染为对话样式 */
function highlightQuotes(text: string, isDark: boolean): React.ReactNode {
  const parts = text.split(/([“"][^“”"]*[”"])/);
  return parts.map((p, i) => {
    const isQuote = /^[“"].+[”"]$/.test(p);
    if (isQuote) {
      return <Text key={i} style={{ color: '#5B9BD5', fontWeight: '600' }}>{p}</Text>;
    }
    if (p) {
      return <Text key={i} style={{ color: isDark ? '#E8DCC8' : '#2D2822', fontSize: 15, lineHeight: 24 }}>{p}</Text>;
    }
    return null;
  });
}

function parseSpeakers(text: string): { speaker: string; content: string }[] {
  const segments: { speaker: string; content: string }[] = [];
  // 支持全角【】和半角[]两种标记
  const re = /[【\[](.+?)[】\]]\s*/g;
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
  const st = T(isDark, SAFE_TOP);
  const bottomInset = useSafeBottom();
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

  const recordFeedback = (rating: 1 | 0, msg: ChatMessage, userMsg: ChatMessage | undefined, s: WorldSession) => {
    rf({
      worldId: s.id, worldName: s.world?.name || '',
      turnNumber: turnCount.current,
      userMessage: userMsg?.content?.slice(0, 200) || '',
      aiResponsePreview: msg.content?.slice(0, 300) || '',
      rating, scene: s.currentScene || '',
      activeCharacters: s.selectedCharacters.map(c => c.name),
      isFanfic: !!s.worldNovelId,
      currentChapter: s.currentChapter,
    });
  };

  const handleRegenerate = () => {
    if (isGenerating) return;
    const trimTo = messages.map((m, i) => m.role === 'assistant' ? i : -1).filter(i => i >= 0);
    // 找到倒数第二条 assistant 消息的位置（或 0，如果只有一条）
    const cutIdx = trimTo.length >= 2 ? trimTo[trimTo.length - 2] + 1 : (trimTo.length === 1 ? trimTo[0] : messages.length);
    showAlert('重新生成', '将删除上一条 AI 回复，你可以修改后重新发送。', [
      { text: '取消', style: 'cancel' },
      { text: '重新生成', onPress: () => {
        const trimmed = messages.slice(0, cutIdx);
        setMessages(trimmed);
        setToast({msg: '已移除上一条回复，修改消息后重新发送', type: 'success'});
      } },
    ]);
  };

  const SESSION_KEY = '@koyoi_session_' + session.id;
  const INDEX_KEY = '@koyoi_world_index';
  const messagesRef = useRef(messages);
  const sessionRef = useRef(session);
  messagesRef.current = messages;
  sessionRef.current = session;

  // 索引写入锁：防止并发写覆盖
  const indexLock = useRef(false);

  const saveSession = useCallback(async (msgs?: ChatMessage[]) => {
    const latestMessages = msgs ?? messagesRef.current;
    const latestSession = sessionRef.current;
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
        ...latestSession,
        messages: latestMessages,
        recentWorldEvents: latestSession.recentWorldEvents || [],
        worldLog: latestSession.worldLog || [],
        memories: latestSession.memories || [],
        currentChapter: latestSession.currentChapter || 0,
      }));

      // 索引写入加锁
      while (indexLock.current) { await new Promise(r => setTimeout(r, 50)); }
      indexLock.current = true;
      try {
        const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
        const index = rawIdx ? JSON.parse(rawIdx) : {};
        index[latestSession.id] = {
          id: latestSession.id,
          name: latestSession.world?.name || '未知',
          type: latestSession.world?.type || 'custom',
          charCount: latestSession.selectedCharacters?.length || 0,
          msgCount: latestMessages.length,
          lastActivity: new Date().toISOString(),
          hasNovelId: !!latestSession.worldNovelId,
          currentChapter: latestSession.currentChapter || 0,
        };
        await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      } finally {
        indexLock.current = false;
      }
    } catch { indexLock.current = false; }
  }, [SESSION_KEY, INDEX_KEY]);

  const send = useCallback(async () => {
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

      // 阶段 4: 角色推演 + 内容路由器（并行，互不依赖）
      const hasRounds = turnCount.current >= 2;
      const recentText = msgsWithUser.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4).map(m => m.content).join(' ');
      const [charActions, routerDecision] = await Promise.all([
        hasRounds
          ? runCharacterSimulation(session, cfg, chapterCtx, isFanfic, turnCount.current, activeChars, lastSimResults, attitudes)
          : Promise.resolve([] as CharacterAction[]),
        routeContent(cfg, session, msgsWithUser, recentText),
      ]);

      // 阶段 5: 提示词组装
      const { prompt } = await assemblePrompt(session, msgsWithUser, messages, charActions, chapterCtx, isFanfic, cfg, summaryRef, attitudes, routerDecision, activeChars.current);

      // 阶段 6: API 调用
      const raw = await callAI(cfg, prompt, setStreamingText);

      if (raw) {
        // 阶段 7: 响应后处理
        const { displayText, newNpcs, scene } = await postProcessResponse(raw, session, cfg, chapterCtx, activeChars);
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
        // 场景转变：AI 上报的新场景写回 session（消除场景粘滞）
        if (scene) {
          setSession(prev => ({ ...prev, currentScene: scene }));
          console.log('[SCENE] -> ' + scene);
        } else if (routerDecision?.sceneHint) {
          // flash 常不遵守 META 上报，路由器场景建议作为兜底
          setSession(prev => ({ ...prev, currentScene: routerDecision.sceneHint as string }));
          console.log('[SCENE] router -> ' + routerDecision.sceneHint);
        }

        const msg: ChatMessage = { role: 'assistant', content: displayText || raw, timestamp: new Date().toISOString() };
        const updated = [...msgsWithUser, msg];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setMessages(updated);
        smartScroll();

        // 阶段 8: 后处理钩子
        runPostSendHooks({ session: sessionRef.current, updated, turnCount, saveSession, setSession, activeChars, lastSimResults, charActions, userMsg });
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
  }, [isGenerating, session, messages, segments, saveSession]);

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
    const isLastAssistant = item.role === 'assistant' && messages.length > 0 && messages[messages.length - 1] === item && !isGenerating;
    // 无【角色名】标记时（AI 用引号对话），引号内容高亮为对话样式
    const hasSpeakerFormat = speakers.some(s => s.speaker);
    const inner = hasSpeakerFormat
      ? <View>{speakers.map((seg, i) => {
          if (seg.speaker && seg.speaker !== '旁白') return <View key={i} style={st.msgBubble}><Text style={st.speakerName}>{seg.speaker}</Text><Text style={st.msgText}>{seg.content}</Text></View>;
          return <Text key={i} style={[st.msgText, { paddingHorizontal: 16, paddingVertical: 4, color: isDark ? '#8A8070' : '#8A8068', fontStyle: 'italic', fontSize: 14, lineHeight: 22, borderLeftWidth: 2, borderLeftColor: isDark ? '#2C2A22' : '#E8E4DD', marginLeft: 4 }]}>{seg.content}</Text>;
        })}</View>
      : <View style={st.msgBubble}>{highlightQuotes(item.content, isDark)}</View>;
    if (isLastAssistant) {
      return (
        <TouchableOpacity activeOpacity={0.9} onLongPress={handleRegenerate}>
          {inner}
          <View style={{ flexDirection: 'row', paddingLeft: 16, marginTop: -2, marginBottom: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => { recordFeedback(1, item, messages[messages.length - 2], session); setToast({msg:'已反馈',type:'success'}); }}>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>👍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { recordFeedback(0, item, messages[messages.length - 2], session); setToast({msg:'已反馈',type:'success'}); }}>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>👎</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 9, color: isDark ? '#5A5450' : '#B8B0A4', alignSelf: 'center' }}>长按重生成</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return inner;
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
      <View style={[st.topBarBase, { paddingTop: SAFE_TOP }]}>
        <TouchableOpacity onPress={() => { if (isGenerating) showAlert('退出','对话生成中，确定退出？',[{text:'取消'},{text:'退出',style:'destructive',onPress: async () => { try { await saveSession(); } catch {} finally { onBack(); } }}]); else { saveSession().then(() => onBack()).catch(() => onBack()); } }}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>
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
      <View style={[st.inputBarBase, { paddingBottom: bottomInset }]}>
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
