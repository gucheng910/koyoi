// ============================================================
//  首页 - 世界列表 v2
//  改动：卡片交错宽度 / 呼吸灯 / 空状态优化 / 背景微暖
// ============================================================
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Animated } from 'react-native';
import { showAlert } from '../components/AnimatedAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfigStore } from '../store/configStore';
import { diagnoseError, repairWorld, mergeRepair } from '../services/worldRepair';
import type { WorldSession } from '../types';

function normalizeSession(s: any): WorldSession {
  if (typeof s.world !== 'object' || !s.world || Array.isArray(s.world)) {
    s.world = { name: '损坏的世界', type: 'custom', rules: {}, locations: [], timeline: [], characters: [], writingStyle: '', styleSamples: [] };
  }
  const w = s.world;
  if (!w.rules || typeof w.rules !== 'object') w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' };
  if (!Array.isArray(w.locations)) w.locations = [];
  if (!Array.isArray(w.timeline)) w.timeline = [];
  if (!Array.isArray(w.characters)) w.characters = [];
  if (!Array.isArray(s.selectedCharacters)) s.selectedCharacters = [];
  if (!Array.isArray(s.npcs)) s.npcs = [];
  if (!Array.isArray(s.messages)) s.messages = [];
  if (!Array.isArray(s.worldLog)) s.worldLog = [];
  if (!s.createdAt) s.createdAt = new Date().toISOString();
  if (!s.currentScene) s.currentScene = '';
  return s as WorldSession;
}

const WORLDS_KEY = '@koyoi_world_sessions';

function formatRelativeTime(ts: string) {
  if (!ts) return ''; const diff = Date.now() - new Date(ts).getTime(); const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚'; if (mins < 60) return mins + '分钟前';
  const hours = Math.floor(mins / 60); if (hours < 24) return hours + '小时前';
  const days = Math.floor(hours / 24); if (days < 30) return days + '天前';
  return Math.floor(days / 30) + '个月前';
}
function formatChapter(s: any) { const ch = (s.currentChapter || 0) + 1; const total = (s.world as any)?.totalChapters || 0; return total > 0 ? ch + '/' + total + '章' : ''; }
function getWorldLabel(type: string) { const m: Record<string,string> = {modern:'现代',cultivation:'修仙',historical:'古代',campus:'校园',scifi:'科幻',fantasy:'奇幻',wuxia:'武侠',urban:'都市',interstellar:'星际',game:'游戏',supernatural:'灵异',alternate_history:'架空',cyberpunk:'赛博',apocalypse:'末日'}; return m[type] || type; }
function getWorldColor(type: string) { const m: Record<string,string> = {modern:'#4A90D9',cultivation:'#6CB4EE',historical:'#8B4513',campus:'#5A8A5A',scifi:'#7B68EE',fantasy:'#D4467E'}; return m[type] || '#5B9BD5'; }

interface Props { isDark: boolean; onEnterWorld: (session: WorldSession) => void; onNewWorld: () => void; onNewFanfic: () => void; onViewCharacters: () => void; }

export default function HomeScreen({ isDark, onEnterWorld, onNewWorld, onNewFanfic, onViewCharacters }: Props) {
  const [sessions, setSessions] = useState<WorldSession[]>([]);
  const [configured, setConfigured] = useState(false);
  const S = styles(isDark);
  const pulseAnim = useRef(new Animated.Value(0.2)).current;

  // 呼吸灯
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 1500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => { setConfigured(!!useConfigStore.getState().getActiveConfig()?.apiKey); loadSessions(); }, []);
  const loadSessions = async () => {
    try {
      let rawIdx = await AsyncStorage.getItem('@koyoi_world_index');
      // 迁移旧数据：@koyoi_world_sessions 数组 → 新的 per-key 格式
      if (!rawIdx) {
        const oldRaw = await AsyncStorage.getItem('@koyoi_world_sessions');
        if (oldRaw) {
          try {
            const oldSessions = JSON.parse(oldRaw);
            if (Array.isArray(oldSessions) && oldSessions.length > 0) {
              const index: any = {};
              for (const s of oldSessions) {
                if (!s?.id || !s?.world) continue;
                await AsyncStorage.setItem('@koyoi_session_' + s.id, JSON.stringify(s));
                index[s.id] = { id: s.id, name: s.world?.name || '未知', type: s.world?.type || 'custom', charCount: s.selectedCharacters?.length || 0, msgCount: s.messages?.length || 0, lastActivity: s.createdAt || new Date().toISOString(), hasNovelId: !!s.worldNovelId, currentChapter: s.currentChapter || 0 };
              }
              await AsyncStorage.setItem('@koyoi_world_index', JSON.stringify(index));
              rawIdx = JSON.stringify(index);
            }
          } catch {}
        }
      }
      if (!rawIdx) return;
      const index = JSON.parse(rawIdx);
      const ids = Object.keys(index);
      const sessions = [];
      for (const id of ids) {
        try {
          const raw = await AsyncStorage.getItem('@koyoi_session_' + id);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.id && parsed?.world) sessions.push(normalizeSession(parsed));
          }
        } catch {}
      }
      // 按最后活跃时间排序
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(sessions);
    } catch {}
  };
  const deleteSession = async (id: string) => {
    const updated = sessions.filter(s => s.id !== id); setSessions(updated);
    // 删除独立 key
    await AsyncStorage.removeItem('@koyoi_session_' + id);
    // 更新索引
    const rawIdx = await AsyncStorage.getItem('@koyoi_world_index');
    if (rawIdx) {
      const index = JSON.parse(rawIdx);
      delete index[id];
      await AsyncStorage.setItem('@koyoi_world_index', JSON.stringify(index));
    }
  };

  const handleRepair = async (session: WorldSession) => {
    const cfg = useConfigStore.getState().getActiveConfig();
    if (!cfg?.apiKey) { showAlert('无法修复', '请先在设置中配置 API Key'); return; }
    showAlert('AI 修复', '将用 AI 尝试修复此世界的损坏数据，不会重新扫描小说。是否继续？', [
      { text: '取消', style: 'cancel' },
      { text: '开始修复', onPress: async () => {
        const target = diagnoseError(new Error('Manual repair triggered'), session);
        if (!target) { showAlert('修复失败', '无法定位损坏字段'); return; }
        try {
          const repaired = await repairWorld(session, target, cfg);
          if (!repaired || Object.keys(repaired).length === 0) { showAlert('修复失败', 'AI 返回数据不足'); return; }
          const merged = mergeRepair(session, repaired);
          const updated = sessions.map(s => s.id === merged.id ? merged : s);
          setSessions(updated);
          await AsyncStorage.setItem(WORLDS_KEY, JSON.stringify(updated));
          showAlert('修复完成', '世界数据已修复，可以进入了', [{ text: '好的' }]);
        } catch (e: any) { showAlert('修复失败', e.message || '未知错误'); }
      } },
    ]);
  };

  const showSessionMenu = (session: WorldSession) => {
    showAlert(session.world.name, '', [
      { text: '🔧 修复数据', onPress: () => handleRepair(session) },
      { text: '删除', style: 'destructive', onPress: () => deleteSession(session.id) },
      { text: '取消', style: 'cancel' },
    ]);
  };

  return (
    <View style={S.container}>
      {/* 呼吸灯 */}
      <Animated.View style={[S.breathe, { opacity: pulseAnim }]} />
      <View style={S.header}>
        <Text style={S.title}>Koyoi</Text>
        <Text style={S.sub}>选择一个世界，开始你的故事</Text>
        {!configured ? (
          sessions.length === 0 ? (
            <View style={[S.card, { marginHorizontal: 20, marginBottom: 16, borderColor: '#5B9BD5' }]}>
              <Text style={[S.cardName, { marginBottom: 8 }]}>欢迎使用 Koyoi</Text>
              <Text style={{ fontSize: 12, color: isDark ? '#8A8070' : '#8A8070', lineHeight: 20 }}>
                三步开始：
1. 前往设置填入 DeepSeek API Key
2. 新建世界或上传小说
3. 选择世界，开始对话
              </Text>
            </View>
          ) : (
            <View style={S.warning}><Text style={S.warningText}>⚡ 请先前往设置配置 API Key</Text></View>
          )
        ) : null}
      </View>
      <View style={S.actions}>
        <TouchableOpacity style={S.btnPrimary} onPress={onNewWorld}><Text style={S.btnPrimaryText}>🌍 新建世界</Text></TouchableOpacity>
        <TouchableOpacity style={S.btnSecondary} onPress={onNewFanfic}><Text style={S.btnSecondaryText}>📖 同人穿越</Text></TouchableOpacity>
      </View>
      <Text style={S.sectionTitle}>已开世界</Text>
      <FlatList data={sessions} keyExtractor={item => item.id} contentContainerStyle={S.list}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyEmoji}>📖</Text>
            <Text style={S.emptyText}>还没有世界</Text>
            <Text style={S.emptyHint}>点「新建世界」或「同人穿越」开始</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const accent = getWorldColor(item.world.type);
          const lastTs = item.messages[item.messages.length-1]?.timestamp || item.createdAt;
          // 交错宽度：偶数下标缩进 16px
          const isStagger = index % 2 === 1;
          return (
            <TouchableOpacity style={[S.card, isStagger && { marginLeft: 16, marginRight: -8 }]} onPress={() => onEnterWorld(item)} onLongPress={() => showSessionMenu(item)} activeOpacity={0.85}>
              <View style={[S.cardAccent, { backgroundColor: accent }]} />
              <View style={S.cardBody}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={S.cardName} numberOfLines={1}>{item.world.name}</Text>
                  <Text style={[S.cardType, { color: accent }]}>{getWorldLabel(item.world.type)}</Text>
                </View>
                <Text style={S.cardMeta} numberOfLines={1}>
                  {item.selectedCharacters.map(c=>c.name).slice(0,3).join('、')||'无角色'}{(item.selectedCharacters||[]).length>3?' 等'+item.selectedCharacters.length+'人':''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Text style={S.cardStat}>{item.messages.length}轮</Text>
                  {(item as any).worldNovelId ? <Text style={[S.cardStat, { color: '#5B9BD5', fontWeight: '600' }]}>{formatChapter(item)}</Text> : null}
                  <Text style={S.cardStat}>{formatRelativeTime(lastTs)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

function styles(dark: boolean) {
  const c = dark
    ? { bg: '#0E0D0B', card: '#1C1912', border: '#2C2A22', text: '#E8DCC8', muted: '#8A8070', faded: '#5A5450' }
    : { bg: '#F8F9FA', card: '#FFFFFF', border: '#E8E4DD', text: '#2D2822', muted: '#8A8070', faded: '#B8B0A4' };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    breathe: { position: 'absolute', top: 0, left: '50%', width: 60, height: 2, backgroundColor: '#5B9BD5', borderRadius: 1, marginLeft: -30, zIndex: 10 },
    header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
    title: { fontSize: 28, fontWeight: '700', color: c.text, letterSpacing: 1 },
    sub: { fontSize: 14, color: c.muted, marginTop: 4 },
    warning: { marginTop: 10, backgroundColor: dark ? '#1A2430' : '#E8F0F8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#5B9BD5' },
    warningText: { color: '#5B9BD5', fontSize: 12, fontWeight: '600' },
    actions: { flexDirection: 'row', paddingHorizontal: 24, gap: 12, marginBottom: 24 },
    btnPrimary: { flex: 1, backgroundColor: '#5B9BD5', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    btnPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    btnSecondary: { flex: 1, backgroundColor: dark ? '#1A2430' : '#E8F0F8', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#5B9BD5' },
    btnSecondaryText: { color: '#5B9BD5', fontSize: 14, fontWeight: '700' },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: c.faded, letterSpacing: 2, paddingHorizontal: 24, marginBottom: 12 },
    list: { paddingHorizontal: 24, paddingBottom: 40 },
    card: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: 14 },
    cardName: { fontSize: 16, fontWeight: '600', color: c.text },
    cardType: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    cardMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    cardStat: { fontSize: 11, color: c.faded },
    empty: { paddingTop: 40, alignItems: 'center' },
    emptyEmoji: { fontSize: 40, marginBottom: 12, opacity: 0.6 },
    emptyText: { fontSize: 13, color: c.faded },
    emptyHint: { fontSize: 12, color: c.muted, marginTop: 6 },
  });
}
