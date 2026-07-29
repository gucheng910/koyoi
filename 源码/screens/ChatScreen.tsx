// ============================================================
//  对话界面 - 支持持久化历史和主题
// ============================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { showAlert } from '../components/AnimatedAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSessionStore } from '../store/sessionStore';
import { useConfigStore } from '../store/configStore';
import { usePersonaStore } from '../store/personaStore';
import { chatCompletion, chatCompletionSync, polishText } from '../api/deepseek';
import { composePrompt } from '../services/composer';
import { getPresetWorld } from '../prompts/characters/presets';
import { isRefusal } from '../services/utils';
import type { Character, ChatMessage } from '../types';
import FadeIn from '../components/FadeIn';
import { SAFE_TOP, SAFE_BOTTOM } from '../theme/safeArea';

interface Props {
  character: Character;
  onBack: () => void;
  isDark: boolean;
}

const HISTORY_PREFIX = '@koyoi_history_';

function getStyles(dark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
    // topBar paddingTop 在组件中用 useSafeAreaInsets 动态计算
    topBarBase: {
      flexDirection: 'row', alignItems: 'center', paddingBottom: 12,
      paddingHorizontal: 16, borderBottomWidth: 1,
      borderBottomColor: dark ? '#1A1814' : '#ddd',
      backgroundColor: dark ? '#0D0C0A' : '#FAF8F5',
    },
    backBtn: { paddingRight: 12 }, backBtnText: { color: '#5577aa', fontSize: 15 },
    topBarCenter: { flex: 1, alignItems: 'center' },
    topBarName: { fontSize: 17, fontWeight: '700', color: dark ? '#E8DCC8' : '#1A1814' },
    topBarStatus: { fontSize: 11, color: dark ? '#888' : '#888', marginTop: 2 },
    regenerateBtn: { fontSize: 20, color: dark ? '#aaa' : '#888', paddingLeft: 12 },
    disabled: { opacity: 0.3 },
    errorBar: { flexDirection: 'row', backgroundColor: '#3a1010', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'space-between', alignItems: 'center' },
    errorText: { color: '#C44B4B', fontSize: 13, flex: 1 },
    errorDismiss: { color: '#ff6b6b', fontSize: 16, paddingLeft: 12 },
    messageList: { paddingHorizontal: 16, paddingVertical: 12 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 200, paddingHorizontal: 40 },
    emptyText: { fontSize: 16, color: dark ? '#555' : '#aaa', textAlign: 'center' },
    emptyHint: { fontSize: 13, color: dark ? '#444' : '#aaa', textAlign: 'center', marginTop: 8, lineHeight: 20 },
    userBubble: { alignSelf: 'flex-end', backgroundColor: '#5577aa', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderBottomRightRadius: 4, marginBottom: 12, maxWidth: '85%' },
    assistantBubble: { alignSelf: 'flex-start', backgroundColor: dark ? '#1A1814' : '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderBottomLeftRadius: 4, marginBottom: 12, maxWidth: '85%', borderWidth: 1, borderColor: dark ? '#333' : '#e8e8e8' },
    charName: { fontSize: 11, color: '#5577aa', marginBottom: 4, fontWeight: '600' },
    msgText: { fontSize: 15, color: dark ? '#E8DCC8' : '#333', lineHeight: 24 },
    userMsgText: { color: '#fff' },
    cursor: { color: '#5577aa' },
    inputBar: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: SAFE_BOTTOM, borderTopWidth: 1, borderTopColor: dark ? '#1A1814' : '#e8e8e8', backgroundColor: dark ? '#0D0C0A' : '#FAF8F5', alignItems: 'flex-end' },
    textInput: { flex: 1, backgroundColor: dark ? '#1A1814' : '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: dark ? '#E8DCC8' : '#1A1814', fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: dark ? '#333' : '#ddd' },
    sendBtn: { backgroundColor: '#5577aa', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, marginLeft: 8, minWidth: 60, alignItems: 'center' },
    sendBtnOff: { backgroundColor: dark ? '#333' : '#ddd' },
    sendText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  });
}

export default function ChatScreen({ character, onBack, isDark }: Props) {
      const S = getStyles(isDark);
  const {
    messages, setMessages, isGenerating, streamingText, error,
    startGenerating, appendStreamToken,
    setError, clearError,
  } = useSessionStore();

  const config = useConfigStore.getState().getActiveConfig();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const world = getPresetWorld(character.worldId);
  const historyKey = HISTORY_PREFIX + character.id;

  // 加载持久化历史
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(historyKey);
        if (raw) {
          const saved: ChatMessage[] = JSON.parse(raw);
          if (saved.length > 0) {
            useSessionStore.setState({ messages: saved });
          }
        }
      } catch {}
    })();
  }, [character.id]);

  // 保存历史
  const persistHistory = useCallback(async (msgs: ChatMessage[]) => {
    try {
      await AsyncStorage.setItem(historyKey, JSON.stringify(msgs.slice(-200)));
    } catch {}
  }, [historyKey]);

  const scrollToBottom = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating || !config?.apiKey) return;
    setInputText('');

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    const currentMsgs = [...useSessionStore.getState().messages, userMsg];
    useSessionStore.setState({ messages: currentMsgs });
    persistHistory(currentMsgs);
    startGenerating();
    scrollToBottom();

    try {
      if (!world) throw new Error('no world');

      const personaGender = usePersonaStore.getState().gender;
      const personaText = `性别：${personaGender === 'female' ? '女' : '男'}。${personaGender === 'female' ? '请始终将玩家视为女性来描写。用她、女性身体和称谓。不要把她当成男性写。' : ''}`

      const { messages: apiMessages } = composePrompt({
        character, world,
        userPersona: personaText,
        session: {
          id: 'active', characterId: character.id, worldId: world.id,
          mode: 'chat', messages: currentMsgs,
          createdAt: '', updatedAt: '',
          dynamicState: {
            relationshipSnapshot: character.relationship,
            memorySummaries: [],
            butterflyDeviations: [], worldEvents: [],
          },
        },
        mode: 'chat', userMessage: text,
      });

      if (config.autoPolish) {
        // 抛光模式：不走流式，一次性生成+抛光，避免"先显示后撤回"
        try {
          const raw = await chatCompletionSync(config, apiMessages, { temperature: config.temperature, maxTokens: config.maxTokens });
          let finalText = raw;
          if (isRefusal(raw) && (raw.length < 20 || /^[A-Z]/.test(raw.trim()) || /content.?policy/i.test(raw))) {
            const retry = await chatCompletionSync(config, apiMessages, { temperature: config.temperature, maxTokens: config.maxTokens });
            if (retry && !isRefusal(retry)) finalText = retry;
          }
          try { finalText = await polishText(config, finalText); } catch {}
          // 重复检测
          const lastAssistant = currentMsgs.filter(m => m.role === 'assistant').pop();
          if (lastAssistant && finalText === lastAssistant.content) {
            const retry2 = await chatCompletionSync({ ...config, thinkingMode: 'disabled' }, apiMessages, { temperature: 0.7, maxTokens: config.maxTokens });
            if (retry2 && retry2 !== lastAssistant.content) finalText = retry2;
          }
          const assistantMsg: ChatMessage = { role: 'assistant', content: finalText, timestamp: new Date().toISOString() };
          const finalMsgs = [...currentMsgs, assistantMsg];
          useSessionStore.setState({ messages: finalMsgs, isGenerating: false, streamingText: '' });
          persistHistory(finalMsgs);
          scrollToBottom();
        } catch (e: any) { setError(e.message || 'error'); useSessionStore.setState({ isGenerating: false }); }
        return;
      }

      // 非抛光模式：流式展示
      await chatCompletion({
        config, messages: apiMessages,
        onToken: (token) => appendStreamToken(token),
        onComplete: async (fullText) => {
          // 拒绝检测
          let finalText = fullText;
          const isApiRefusal = isRefusal(fullText) && (
            fullText.length < 20 ||
            /^[A-Z]/.test(fullText.trim()) ||
            /content.?policy/i.test(fullText) ||
            /guidelines/i.test(fullText) ||
            /cannot (continue|generate|write|create)/i.test(fullText)
          );
          if (isApiRefusal) {
            try {
              const retry = await chatCompletionSync(config, apiMessages, { temperature: config.temperature, maxTokens: config.maxTokens });
              if (retry && !isRefusal(retry)) finalText = retry;
            } catch {}
          }
          const assistantMsg: ChatMessage = { role: 'assistant', content: finalText, timestamp: new Date().toISOString() };
          const finalMsgs = [...currentMsgs, assistantMsg];
          useSessionStore.setState({ messages: finalMsgs, isGenerating: false, streamingText: '' });
          persistHistory(finalMsgs);
          scrollToBottom();
        },
        onError: (err) => {
          setError(err.message);
          useSessionStore.setState({ isGenerating: false, streamingText: '' });
        },
      });
    } catch (e: any) {
      setError(e.message || 'error');
      useSessionStore.setState({ isGenerating: false, streamingText: '' });
    }
  }, [inputText, isGenerating, config, character, world, persistHistory]);

  // 已持久化的消息直接显示，不用等待加载
  const displayMessages: ChatMessage[] = [
    ...messages,
    ...(isGenerating && streamingText ? [{ role: 'assistant' as const, content: streamingText, timestamp: '', isStreaming: true }] : []),
  ];

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    const handleLongPress = () => {
      if (isGenerating) return;
      const msgs = useSessionStore.getState().messages;
      if (isUser) {
        // 编辑用户消息：放入输入框，删除这条及之后的消息
        showAlert('编辑消息', '将删除这条及之后的消息重新发送', [
          { text: '取消', style: 'cancel' },
          { text: '编辑', onPress: () => {
            setInputText(item.content);
            useSessionStore.setState({ messages: msgs.slice(0, index) });
            persistHistory(msgs.slice(0, index));
          }},
        ]);
      } else {
        // 重新生成：删除这条及之后
        showAlert('重新生成', '删除这条回复并重新生成', [
          { text: '取消', style: 'cancel' },
          { text: '重新生成', onPress: () => {
            const prevMsgs = msgs.slice(0, index);
            useSessionStore.setState({ messages: prevMsgs });
            persistHistory(prevMsgs);
            const lastUser = prevMsgs.filter(m => m.role === 'user').pop();
            if (lastUser) setInputText(lastUser.content);
          }},
        ]);
      }
    };
    return (
      <TouchableOpacity onLongPress={handleLongPress} activeOpacity={0.9}>
      <View style={isUser ? S.userBubble : S.assistantBubble}>
        {!isUser && <Text style={S.charName}>{character.name}</Text>}
        <Text style={[S.msgText, isUser && S.userMsgText]}>
          {item.content}{item.isStreaming && <Text style={S.cursor}>▌</Text>}
        </Text>
      </View>
      </TouchableOpacity>
    );
  };

  return (
    
    <FadeIn style={{ flex: 1 }}><KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={[S.topBarBase, { paddingTop: SAFE_TOP }]}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <Text style={S.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <View style={S.topBarCenter}>
          <Text style={S.topBarName}>{character.name}</Text>
          <Text style={S.topBarStatus}>{character.currentContext.location} · {character.currentContext.timeOfDay}</Text>
        </View>
        <TouchableOpacity onPress={() => {
          if (isGenerating) return;
          // 重新生成：删最后一条assistant，用最后一条user消息重新发
          const msgs = useSessionStore.getState().messages;
          if (msgs.length < 2) return;
          const last = msgs[msgs.length - 1];
          if (last.role !== 'assistant') return;
          const trimmed = msgs.slice(0, -1);
          useSessionStore.setState({ messages: trimmed });
          persistHistory(trimmed);
          // 重新发送
          const lastUser = trimmed[trimmed.length - 1];
          if (lastUser?.role === 'user') {
            setInputText(lastUser.content);
          }
        }} disabled={isGenerating}>
          <Text style={[S.regenerateBtn, isGenerating && S.disabled]}>↻</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <TouchableOpacity style={S.errorBar} onPress={clearError}>
          <Text style={S.errorText}>{error}</Text><Text style={S.errorDismiss}>✕</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={displayMessages}
        renderItem={({ item, index }) => renderMessage({ item, index })}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={S.messageList}
        onContentSizeChange={scrollToBottom}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={S.emptyContainer}>
            <Text style={S.emptyText}>这是你和{character.name}的故事开始</Text>
            <Text style={S.emptyHint}>{character.currentContext.recentEvents}</Text>
          </View>
        }
      />

      <View style={S.inputBar}>
        <TextInput
          style={S.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="输入你的行动或对话..."
          placeholderTextColor={isDark ? '#555' : '#aaa'}
          multiline maxLength={2000}
          editable={!isGenerating}
          returnKeyType="send"
          blurOnSubmit
        />
        <TouchableOpacity
          style={[S.sendBtn, (!inputText.trim() || isGenerating) && S.sendBtnOff]}
          onPress={handleSend}
          disabled={!inputText.trim() || isGenerating}
        >
          {isGenerating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={S.sendText}>发送</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    
    </FadeIn>
  );
}

