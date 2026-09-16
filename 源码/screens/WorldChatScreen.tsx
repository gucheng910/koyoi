// ============================================================
//  大世界对话界面
// ============================================================
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, LayoutAnimation, Keyboard,
} from 'react-native';
import { useConfigStore } from '../store/configStore';
import Toast from '../components/Toast';
import FadeIn from '../components/FadeIn';
import { showAlert } from '../components/AnimatedAlert';
import type { WorldSession, ChatMessage } from '../types';
import type { CharacterAction } from '../services/characterSimulator';
import { processInput, maybeGenerateSummary, buildContext, runCharacterSimulation, assemblePrompt, callAI, postProcessResponse, runPostSendHooks } from '../services/sendPipeline';
import { routeContent } from '../services/sendPipeline/stage4_5_router';
import { appendMessages, saveMeta, saveFullSession, loadSession as loadStoredSession } from '../services/sessionStorage';
import { useWorldSessionStore, getWorldState } from '../store/worldSessionStore';
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


export default function WorldChatScreen({ session: initialSession, onBack, isDark }: Props) {
  const st = T(isDark);
  const bottomInset = useSafeBottom();

  // ---- 会话状态来自 store（原先是 useState + 6 个手工同步的 useRef）----
  // 只订阅渲染真正要用的字段；activeChars / attitudes / summary 由服务层
  // 直接读 store，组件订阅它们只会带来无谓的重渲染。
  const session = useWorldSessionStore(s => s.session) ?? initialSession;
  const messages = useWorldSessionStore(s => s.messages);
  const turnCount = useWorldSessionStore(s => s.turnCount);

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
  const flatListRef = useRef<FlatList>(null);
  const isNearBottom = useRef(true);

  // 进入/切换世界时载入 store；离开时清空，避免下一个世界读到脏状态
  useEffect(() => {
    useWorldSessionStore.getState().openWorld(initialSession);
    return () => { useWorldSessionStore.getState().closeWorld(); };
  }, [initialSession.id]);

  // 键盘状态：自己监听事件拿精确键盘高度（不依赖 KAV 内部计算——不同输入法事件时序会导致残留）
  const [kbHeight, setKbHeight] = useState(0);
  const [inputBarH, setInputBarH] = useState(56);  // 输入区高度（onLayout 实测，默认估算）

  // 恢复已落盘的消息数，使本次进入后的首次保存走增量而非全量重写
  const savedMsgCount = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStoredSession(initialSession.id)
      .then(stored => {
        if (cancelled) return;
        savedMsgCount.current = stored
          ? stored.messages.length
          : initialSession.messages.length;   // 文件缺失时按"已全部落盘"处理，首次保存走全量
      })
      .catch(() => { if (!cancelled) savedMsgCount.current = null; });
    return () => { cancelled = true; };
  }, [initialSession.id]);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e: any) => {
      const h = e?.endCoordinates?.height || 0;
      setKbHeight(h);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  // 抬升量：以真机实际体验校准。用户反馈：kbHeight+bottomInset(301)略紧勉强不遮挡、
  // +inputBarH(339)稍空、+20(359)空多。取301+10=311（介于两者间，偏不遮挡）
  const kbPad = kbHeight > 0 ? kbHeight + bottomInset + 10 : 0;

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
      turnNumber: turnCount,
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
        useWorldSessionStore.getState().setMessages(trimmed);
        setToast({msg: '已移除上一条回复，修改消息后重新发送', type: 'success'});
      } },
    ]);
  };

  /**
   * 保存会话。
   *
   * 改为 JSONL 增量写：只有新增消息走 appendMessages（读取+追加+原子替换），
   * 不再每轮把整个会话（含全部历史消息）重新 stringify 后整块覆盖写。
   * 旧实现是 O(n²)，200 轮后既慢又可能撞上 AsyncStorage 单值上限。
   *
   * 当非消息字段（moods/scene/npcs/currentChapter 等）变化时走 saveMeta，
   * 它不触碰 chat.jsonl，因此开销与消息量无关。
   */
  const saveSession = useCallback(async (msgs?: ChatMessage[]) => {
    // 从 store 读当前值——不再依赖 sessionRef/messagesRef 的 render 时机对齐
    const state = getWorldState();
    const latestSession = state.session;
    if (!latestSession) return;
    const latestMessages = msgs ?? state.messages;

    try {
      const prev = savedMsgCount.current;
      const canAppend = prev !== null && latestMessages.length >= prev;

      if (canAppend && latestMessages.length > prev) {
        // 增量：只写本轮新增的尾部消息
        await appendMessages(latestSession.id, latestMessages.slice(prev));
        await saveMeta({ ...latestSession, messages: latestMessages });
      } else {
        await saveFullSession({ ...latestSession, messages: latestMessages }, latestMessages);
      }
      savedMsgCount.current = latestMessages.length;
    } catch (e) {
      console.warn('[WorldChat] saveSession failed:', (e as Error).message);
    }
  }, []);

  const send = useCallback(async () => {
    if (segments.length === 0 || isGenerating) return;
    const cfg = useConfigStore.getState().getActiveConfig();
    if (!cfg?.apiKey) { setError('请先配置API Key'); return; }

    const store = useWorldSessionStore.getState();
    const turn = store.turnCount;

    // 阶段 1: 输入处理
    setError(null); setIsGenerating(true); setStreamingText('');
    const { finalText, userMsg, msgsWithUser } = processInput(segments, messages);
    setSegments([]);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    store.setMessages(msgsWithUser);
    smartScroll();

    try {
      // 阶段 2: 摘要生成（非阻塞）
      maybeGenerateSummary(messages, turn, cfg);

      // 阶段 3: 上下文构建
      const { chapterCtx, isFanfic, worldInfo } = await buildContext(session, finalText, messages, turn);

      // 阶段 4: 角色推演 + 内容路由器（并行，互不依赖）
      const hasRounds = turn >= 2;
      const recentText = msgsWithUser.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4).map(m => m.content).join(' ');
      const [charActions, routerDecision] = await Promise.all([
        hasRounds ? runCharacterSimulation(chapterCtx) : Promise.resolve([] as CharacterAction[]),
        routeContent(cfg, session, msgsWithUser, recentText),
      ]);

      // 阶段 5: 提示词组装
      const { prompt } = await assemblePrompt(session, msgsWithUser, messages, charActions, chapterCtx, isFanfic, cfg, routerDecision);
      void worldInfo;

      // 阶段 6: API 调用
      const raw = await callAI(cfg, prompt, setStreamingText);

      if (raw) {
        // 阶段 7: 响应后处理
        const { displayText, newNpcs, scene, polished } = postProcessResponse(raw, session, cfg, chapterCtx);
        if (newNpcs) {
          for (const npc of newNpcs) {
            const cur = getWorldState().session;
            if (!cur) break;
            useWorldSessionStore.getState().patchSession({
              npcs: [...(cur.npcs || []), npc],
              recentWorldEvents: [...(cur.recentWorldEvents || []).slice(-19), npc.name + '进入了场景'],
            });
            useWorldSessionStore.getState().addActiveChar(npc.name);
          }
        }
        // 场景转变：AI 上报的新场景写回 session（消除场景粘滞）
        if (scene) {
          useWorldSessionStore.getState().setScene(scene);
          console.log('[SCENE] -> ' + scene);
        } else if (routerDecision?.sceneHint) {
          // flash 常不遵守 META 上报，路由器场景建议作为兜底
          useWorldSessionStore.getState().setScene(routerDecision.sceneHint);
          console.log('[SCENE] router -> ' + routerDecision.sceneHint);
        }

        const msg: ChatMessage = { role: 'assistant', content: displayText || raw, timestamp: new Date().toISOString() };
        const updated = [...msgsWithUser, msg];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        useWorldSessionStore.getState().setMessages(updated);
        smartScroll();

        // 立即保存（不依赖 stage8 hooks 成功）：hooks 内部逻辑抛错会中断 saveSession，导致整轮丢失
        saveSession(updated);

        // 阶段 8: 后处理钩子（内部从 store 读取状态与回合数）
        runPostSendHooks({ updated, saveSession, charActions, userMsg });

        // 抛光在后台进行：正文已经渲染给用户了，完成后原地替换该条消息。
        // 若期间用户又发了一轮，消息数组会变长——按引用定位那条消息，找不到就丢弃。
        if (polished) {
          polished.then(finalText => {
            if (!finalText || finalText === displayText) return;
            const state = getWorldState();
            if (!state.session) return;
            const list = state.messages;
            const idx = list.indexOf(msg);
            if (idx < 0) return;                     // 已被重生成/回退移除
            const next = [...list];
            next[idx] = { ...msg, content: finalText };
            useWorldSessionStore.getState().setMessages(next);
            saveSession(next);
          }).catch(() => { /* polish 内部已兜底为原文 */ });
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

  // 键盘处理：
  //   iOS：KAV padding（工作正常，保留）
  //   Android：adjustNothing（不自动调整），自己监听键盘事件手动顶起
  //   容器 paddingBottom = 键盘高度（精确、无残留）；输入区底部内边距键盘弹出时归零
  const OuterWrap = Platform.OS === 'ios' ? KeyboardAvoidingView : View;

  return (
    <FadeIn style={{ flex: 1 }}>
    <OuterWrap style={[st.container, Platform.OS === 'android' && { paddingBottom: kbPad }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={[st.topBarBase, { paddingTop: SAFE_TOP }]}>
        <TouchableOpacity onPress={() => { if (isGenerating) showAlert('退出','对话生成中，确定退出？',[{text:'取消'},{text:'退出',style:'destructive',onPress: async () => { try { await saveSession(); } catch {} finally { onBack(); } }}]); else { saveSession().then(() => onBack()).catch(() => onBack()); } }}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.topName}>{session.world?.name || '世界'}</Text>
          <Text style={st.topStatus}>{session.selectedCharacters.length}个角色 · 第{turnCount + 1}轮{session.worldNovelId ? ' · 第' + ((session.currentChapter || 0) + 1) + '章' : ''}</Text>
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
      <FlatList ref={flatListRef} data={displayMsgs} renderItem={renderMsg} keyExtractor={(_, i) => String(i)} contentContainerStyle={st.messageList} onScroll={handleScroll} scrollEventThrottle={100} onContentSizeChange={() => { if (isNearBottom.current) scrollToBottom(); }} />
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
      <View style={[st.inputBarBase, { paddingBottom: kbHeight > 0 ? 0 : bottomInset }]} onLayout={(e) => { const h = e.nativeEvent.layout.height; if (Math.abs(h - inputBarH) > 2) setInputBarH(h); }}>
        <TouchableOpacity onPress={() => commitSegment('speech')} style={{ paddingHorizontal: 6, paddingVertical: 12, marginRight: 2 }}><Text style={{ fontSize: 12, color: '#5B9BD5', fontWeight: '700' }}>说</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => commitSegment('action')} style={{ paddingHorizontal: 6, paddingVertical: 12, marginRight: 4 }}><Text style={{ fontSize: 12, color: '#8A8070', fontWeight: '700' }}>行动</Text></TouchableOpacity>
        <TextInput style={st.textInput} value={inputText} onChangeText={setInputText} placeholder="输入消息..." placeholderTextColor={isDark ? '#555' : '#bbb'} multiline maxLength={2000} editable={!isGenerating} returnKeyType="send" />
        <TouchableOpacity style={[st.sendBtn, (!!inputText.trim() || isGenerating) && st.sendBtnOff]} onPress={send} disabled={!!inputText.trim() || segments.length === 0 || isGenerating}>
          {isGenerating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.sendText}>发送</Text>}
        </TouchableOpacity>
      </View>
      <Toast visible={toast.msg !== ''} message={toast.msg} type={toast.type} onHide={() => setToast({msg:'',type:'success'})} />
    </OuterWrap>
    </FadeIn>
  );
}
