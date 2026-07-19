const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Find where Btn function is defined to keep it
const btnStart = t.indexOf('function Btn(');
const btnEnd = t.indexOf('\nfunction getStyles', btnStart);
const BtnFn = t.slice(btnStart, btnEnd);

// Build new SettingsScreen from scratch
const newScreen = `// ============================================================
//  设置页面 v4
//  主页面→子页面导航结构
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, ActivityIndicator, Linking, Image,
} from 'react-native';
import { useConfigStore } from '../store/configStore';
import { usePersonaStore } from '../store/personaStore';
import { useUsageStore } from '../store/usageStore';
import { getCacheMetrics } from '../api/deepseek';
import * as SecureStore from 'expo-secure-store';
import type { ApiConfig } from '../types';

interface Props { isDark: boolean; onToggleTheme: () => void; }

function fmtK(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
function fmtRmb(n: number): string {
  if (!n || isNaN(n) || n < 0) return '¥0.00';
  if (n < 0.01) return '<¥0.01';
  return '¥' + n.toFixed(2);
}

${BtnFn}

// ── 主设置页 ──
function MainSettings({ isDark, onToggleTheme, onNavigate }: { isDark: boolean; onToggleTheme: () => void; onNavigate: (page: string) => void }) {
  const S = getStyles(isDark);
  const persona = usePersonaStore();
  const { usage, load: loadUsage, reset: resetUsage } = useUsageStore();
  const [usageLoaded, setUsageLoaded] = useState(false);

  useEffect(() => { loadUsage().then(() => setUsageLoaded(true)); }, []);

  const items = [
    { icon: '🔑', label: 'API 配置', sub: 'DeepSeek V4 · 模型/温度/maxtokens', page: 'api' },
    { icon: '❤️', label: '赞赏', sub: '支持 Koyoi 的持续开发', page: 'reward' },
    { icon: 'ℹ️', label: '关于 Koyoi', sub: '版本 2.14.0 · 免责声明', page: 'about' },
  ];

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 }}>
        <Text style={S.title}>设置</Text>
        <Text style={{ fontSize: 12, color: isDark ? '#666' : '#999' }}>v2.14.0</Text>
      </View>

      {/* 玩家 */}
      <View style={S.card}>
        <Text style={[S.label, { marginBottom: 10 }]}>玩家性别</Text>
        <View style={S.row}>
          <Btn label="♂ 男" active={persona.gender === 'male'} onPress={() => persona.setGender('male')} />
          <Btn label="♀ 女" active={persona.gender === 'female'} onPress={() => persona.setGender('female')} />
        </View>
      </View>

      <View style={S.card}>
        <Text style={[S.label, { marginBottom: 10 }]}>主题</Text>
        <View style={S.row}>
          <Btn label="☀️ 浅色" active={!isDark} onPress={() => !isDark || onToggleTheme()} />
          <Btn label="🌙 深色" active={isDark} onPress={() => isDark || onToggleTheme()} />
        </View>
      </View>

      {/* 用量概览 */}
      {usageLoaded && (
        <View style={S.card}>
          <Text style={S.label}>用量概览</Text>
          <View style={{ flexDirection: 'row', marginTop: 10, gap: 20 }}>
            <View><Text style={{ fontSize: 11, color: isDark ? '#888' : '#999' }}>今日</Text><Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#E8DCC8' : '#2D2822' }}>{fmtRmb(usage.today.inputCostRmb + usage.today.outputCostRmb)}</Text></View>
            <View><Text style={{ fontSize: 11, color: isDark ? '#888' : '#999' }}>累计</Text><Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#E8DCC8' : '#2D2822' }}>{fmtRmb(usage.total.inputCostRmb + usage.total.outputCostRmb)}</Text></View>
            <View><Text style={{ fontSize: 11, color: isDark ? '#888' : '#999' }}>调用</Text><Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#E8DCC8' : '#2D2822' }}>{usage.total.calls}次</Text></View>
          </View>
        </View>
      )}

      {/* 导航条目 */}
      <View style={{ marginTop: 8 }}>
        {items.map(item => (
          <TouchableOpacity key={item.page} style={S.navItem} onPress={() => onNavigate(item.page)} activeOpacity={0.7}>
            <Text style={{ fontSize: 20, marginRight: 14 }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#E8DCC8' : '#2D2822' }}>{item.label}</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#8A8070' : '#8A8070', marginTop: 2 }}>{item.sub}</Text>
            </View>
            <Text style={{ fontSize: 14, color: isDark ? '#666' : '#bbb' }}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── API 配置子页 ──
function ApiSettings({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const S = getStyles(isDark);
  const { configs, activeConfigId, isLoaded, loadConfigs, saveConfig, testConnection } = useConfigStore();
  const [apiKey, setApiKey] = useState(''); const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [thinkingMode, setThinkingMode] = useState<'disabled' | 'low' | 'high'>('disabled');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'high'>('high');
  const [temperature, setTemperature] = useState('1.3'); const [maxTokens, setMaxTokens] = useState('4096');
  const [safetyFilter, setSafetyFilter] = useState<'off' | 'moderate' | 'strict'>('off');
  const [streamOutput, setStreamOutput] = useState(true);
  const [autoPolish, setAutoPolish] = useState(true);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: string; msg: string }>({ type: '', msg: '' });
  const showFb = (type: string, msg: string) => { setFeedback({ type, msg }); setTimeout(() => setFeedback({ type: '', msg: '' }), 2500); };

  useEffect(() => { if (!isLoaded) loadConfigs(); }, [isLoaded]);
  useEffect(() => {
    const a = configs.find(c => c.id === activeConfigId);
    if (a) { setApiKey(a.apiKey); setBaseUrl(a.baseUrl); setModel(a.model); setThinkingMode((a.thinkingMode as string === 'enabled' ? 'high' : a.thinkingMode) || 'disabled'); setReasoningEffort((a.reasoningEffort as string === 'max' ? 'high' : a.reasoningEffort) || 'high'); setTemperature(String(a.temperature)); setMaxTokens(String(a.maxTokens)); setSafetyFilter(a.safetyFilter); setStreamOutput(a.streamOutput); setAutoPolish(a.autoPolish !== false); }
  }, [activeConfigId, configs]);

  const handleTest = async () => { setTesting(true); try { await testConnection(activeConfigId ?? ''); showFb('success', '连接成功'); } catch (e: any) { showFb('error', '连接失败: ' + (e.message || '')); } setTesting(false); };

  const handleSave = async () => {
    const a = configs.find(c => c.id === activeConfigId); if (!a) return;
    await saveConfig({ ...a, apiKey: apiKey.trim(), baseUrl: baseUrl.trim().replace(/\\/$/, ''), model, thinkingMode, reasoningEffort, temperature: parseFloat(temperature) || 1.3, maxTokens: parseInt(maxTokens) || 2048, safetyFilter, streamOutput, autoPolish });
    showFb('success', '已保存');
  };

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}><Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text></TouchableOpacity>
      <Text style={S.title}>API 配置</Text>

      <View style={S.card}><Text style={S.fieldLabel}>API 地址</Text><TextInput style={S.input} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.deepseek.com" placeholderTextColor="#666" autoCapitalize="none" /></View>
      <View style={S.card}><Text style={S.fieldLabel}>API Key</Text><TextInput style={S.input} value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor="#666" autoCapitalize="none" secureTextEntry /></View>
      <TouchableOpacity style={[S.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]} onPress={() => Linking.openURL('https://platform.deepseek.com/api_keys')} activeOpacity={0.7}>
        <Text style={{ fontSize: 24 }}>🔑</Text><View style={{ flex: 1 }}><Text style={{ fontSize: 13, color: isDark ? '#ccc' : '#555' }}>前往 DeepSeek 官网获取 API Key</Text><Text style={{ fontSize: 11, color: '#5B9BD5', marginTop: 2 }}>platform.deepseek.com → API Keys</Text></View><Text style={{ fontSize: 12, color: '#5B9BD5' }}>↗</Text>
      </TouchableOpacity>
      <View style={S.card}><Text style={S.fieldLabel}>模型</Text><View style={S.row}><Btn label="V4 Flash" active={model === 'deepseek-v4-flash'} onPress={() => setModel('deepseek-v4-flash')} /><Btn label="V4 Pro" active={model === 'deepseek-v4-pro'} onPress={() => setModel('deepseek-v4-pro')} /></View></View>
      <View style={S.card}>
        <Text style={S.fieldLabel}>思考模式</Text>
        <Text style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>关闭适合日常对话。开启后AI会先推理再回复，质量更高但消耗翻倍。</Text>
        <View style={S.row}><Btn label="关闭" active={thinkingMode === 'disabled'} onPress={() => setThinkingMode('disabled')} /><Btn label="轻度" active={thinkingMode === 'low'} onPress={() => { setThinkingMode('low'); setReasoningEffort('low'); }} /><Btn label="深度" active={thinkingMode === 'high'} onPress={() => { setThinkingMode('high'); setReasoningEffort('high'); }} /></View>
      </View>
      {thinkingMode === 'disabled' && <View style={S.card}><Text style={S.fieldLabel}>Temperature: {temperature}</Text><View style={S.row}><Btn label="0.7" active={temperature === '0.7'} onPress={() => setTemperature('0.7')} /><Btn label="1.0" active={temperature === '1.0'} onPress={() => setTemperature('1.0')} /><Btn label="1.3" active={temperature === '1.3'} onPress={() => setTemperature('1.3')} /><Btn label="1.5" active={temperature === '1.5'} onPress={() => setTemperature('1.5')} /></View></View>}
      <View style={S.card}><Text style={S.fieldLabel}>最大输出</Text><View style={S.row}>{['1024', '2048', '4096', '8192'].map(t => <Btn key={t} label={t} active={maxTokens === t} onPress={() => setMaxTokens(t)} />)}</View></View>
      <View style={S.card}><Text style={S.fieldLabel}>内容过滤</Text><View style={S.row}><Btn label="关闭" active={safetyFilter === 'off'} onPress={() => setSafetyFilter('off')} /><Btn label="中等" active={safetyFilter === 'moderate'} onPress={() => setSafetyFilter('moderate')} /><Btn label="严格" active={safetyFilter === 'strict'} onPress={() => setSafetyFilter('strict')} /></View></View>
      <View style={S.card}><View style={S.switchRow}><View style={{ flex: 1, marginRight: 12 }}><Text style={S.fieldLabel}>流式输出</Text><Text style={{ fontSize: 11, color: autoPolish ? '#ff9800' : '#888', marginTop: 2 }}>{autoPolish ? '（自动润色开启时不可用）' : '逐字显示 AI 回复'}</Text></View><Switch value={streamOutput && !autoPolish} onValueChange={(v) => { setStreamOutput(v); if (v) setAutoPolish(false); }} trackColor={{ false: '#ddd', true: '#5B9BD5' }} thumbColor="#fff" disabled={autoPolish} /></View></View>
      <View style={S.card}><View style={S.switchRow}><View style={{ flex: 1, marginRight: 12 }}><Text style={S.fieldLabel}>自动润色</Text><Text style={{ fontSize: 11, color: '#ff9800', marginTop: 2 }}>{streamOutput ? '（流式输出开启时不可用）' : '去 AI 味，让文字更自然，每次回复额外消耗少量 token'}</Text></View><Switch value={autoPolish && !streamOutput} onValueChange={(v) => { setAutoPolish(v); if (v) setStreamOutput(false); }} trackColor={{ false: '#ddd', true: '#5B9BD5' }} thumbColor="#fff" disabled={streamOutput} /></View></View>
      <View style={[S.row, { paddingHorizontal: 20, marginTop: 10 }]}>
        <TouchableOpacity style={[S.mainBtn, { flex: 1, backgroundColor: isDark ? '#2a2a2a' : '#e0e0e0' }]} onPress={handleTest} disabled={testing || !apiKey.trim()}>{testing ? <ActivityIndicator size="small" color="#5B9BD5" /> : <Text style={[S.mainBtnText, { color: isDark ? '#fff' : '#333' }]}>测试</Text>}</TouchableOpacity>
        <TouchableOpacity style={[S.mainBtn, { flex: 1, backgroundColor: '#5B9BD5' }]} onPress={handleSave}><Text style={S.mainBtnText}>保存</Text></TouchableOpacity>
      </View>
      {feedback.msg !== '' && <View style={{ marginHorizontal: 20, marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: feedback.type === 'success' ? '#1a3a1a' : '#3a1a1a' }}><Text style={{ color: feedback.type === 'success' ? '#4caf50' : '#ff6b6b', fontSize: 13, textAlign: 'center' }}>{feedback.msg}</Text></View>}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── 赞赏子页 ──
function RewardPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const S = getStyles(isDark);
  return (
    <View style={S.container}>
      <TouchableOpacity onPress={onBack} style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}><Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text></TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }}>
        <Image source={require('../../assets/reward.png')} style={{ width: 200, height: 200, borderRadius: 12 }} resizeMode="contain" />
        <Text style={{ fontSize: 14, color: isDark ? '#888' : '#999', marginTop: 16 }}>感谢支持 Koyoi ❤️</Text>
      </View>
    </View>
  );
}

// ── 关于子页 ──
function AboutPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const S = getStyles(isDark);
  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}><Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', paddingTop: 20 }}>
        <Text style={{ fontSize: 32, fontWeight: '800', color: isDark ? '#E8DCC8' : '#2D2822', marginBottom: 8 }}>Koyoi</Text>
        <Text style={{ fontSize: 13, color: isDark ? '#8A8070' : '#8A8070' }}>版本 2.14.0</Text>
        <Text style={{ fontSize: 12, color: isDark ? '#666' : '#999', marginTop: 4 }}>Build with Expo SDK 56 · React Native</Text>
      </View>
      <View style={{ paddingHorizontal: 30, marginTop: 30 }}>
        <Text style={{ fontSize: 13, color: isDark ? '#ccc' : '#555', lineHeight: 22, textAlign: 'center' }}>
          AI 驱动的互动小说应用。上传小说，魂穿到故事中。{'\n'}
          基于 DeepSeek V4，完全本地存储。{'\n\n'}
          免责声明：本应用 AI 生成内容仅供娱乐。同人穿越功能旨在为创作者提供灵感，请勿上传无版权作品。
        </Text>
      </View>
      <TouchableOpacity style={{ marginTop: 30, alignSelf: 'center' }} onPress={() => Linking.openURL('https://github.com')}><Text style={{ fontSize: 13, color: '#5B9BD5' }}>GitHub →</Text></TouchableOpacity>
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── 主入口 ──
export default function SettingsScreen({ isDark, onToggleTheme }: Props) {
  const [page, setPage] = useState<string>('main');

  if (page === 'api') return <ApiSettings isDark={isDark} onBack={() => setPage('main')} />;
  if (page === 'reward') return <RewardPage isDark={isDark} onBack={() => setPage('main')} />;
  if (page === 'about') return <AboutPage isDark={isDark} onBack={() => setPage('main')} />;

  return <MainSettings isDark={isDark} onToggleTheme={onToggleTheme} onNavigate={setPage} />;
}

${t.slice(btnEnd)}`;

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', newScreen);
console.log('SettingsScreen v4 written');
