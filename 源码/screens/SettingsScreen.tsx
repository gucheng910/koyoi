// ============================================================
//  设置页面 v6 — iOS 风格分组列表
//  参考：iOS Human Interface / react-native-mobile-skill
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, ActivityIndicator, Linking, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { REWARD_IMAGE_URI } from '../theme/rewardImage';
import { summarizeByTag, getTrace, exportTrace } from '../services/trace';
import { useConfigStore } from '../store/configStore';
import { usePersonaStore } from '../store/personaStore';
import { useUsageStore } from '../store/usageStore';
import Constants from 'expo-constants';
import { getCacheMetrics } from '../api/deepseek';
import { SAFE_TOP } from '../theme/safeArea';

interface Props { isDark: boolean; onToggleTheme: () => void; }

function fmtK(n: number) { if (n>=1e6) return (n/1e6).toFixed(1)+'M'; if (n>=1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function fmtRmb(n: number) { if (!n||isNaN(n)||n<0) return '¥0.00'; if (n<0.01) return '<¥0.01'; return '¥'+n.toFixed(2); }
function fmtPct(n: number) { if (!n||isNaN(n)) return '0%'; return (n*100).toFixed(0)+'%'; }

// ── 通用组件 ──
function Row({ icon, label, value, onPress, last, dark }: { icon?: string; label: string; value?: string; onPress?: () => void; last?: boolean; dark: boolean }) {
  const c = colors(dark);
  const Inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 }}>
      {icon && <Text style={{ fontSize: 17, marginRight: 12 }}>{icon}</Text>}
      <Text style={{ flex: 1, fontSize: 15, color: c.text }}>{label}</Text>
      {value && <Text style={{ fontSize: 15, color: c.muted, marginRight: onPress ? 4 : 0 }}>{value}</Text>}
      {onPress && <Text style={{ fontSize: 16, color: c.chevron }}>›</Text>}
    </View>
  );
  if (onPress) return <TouchableOpacity activeOpacity={0.6} onPress={onPress}>{Inner}{!last && <View style={{ marginLeft: icon ? 45 : 16, height: StyleSheet.hairlineWidth, backgroundColor: c.sep }} />}</TouchableOpacity>;
  return <View>{Inner}{!last && <View style={{ marginLeft: icon ? 45 : 16, height: StyleSheet.hairlineWidth, backgroundColor: c.sep }} />}</View>;
}

function RowSwitch({ icon, label, sub, value, onValueChange, last, dark, disabled }: { icon?: string; label: string; sub?: string; value: boolean; onValueChange: (v: boolean) => void; last?: boolean; dark: boolean; disabled?: boolean }) {
  const c = colors(dark);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, opacity: disabled ? 0.45 : 1 }}>
        {icon && <Text style={{ fontSize: 17, marginRight: 12 }}>{icon}</Text>}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: c.text }}>{label}</Text>
          {sub && <Text style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{sub}</Text>}
        </View>
        <Switch value={value} onValueChange={onValueChange} disabled={!!disabled} trackColor={{ false: c.switchOff, true: '#5B9BD5' }} thumbColor="#fff" />
      </View>
      {!last && <View style={{ marginLeft: icon ? 45 : 16, height: StyleSheet.hairlineWidth, backgroundColor: c.sep }} />}
    </View>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      {title && <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 20, marginBottom: 6 }}>{title}</Text>}
      <View style={{ marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function colors(dark: boolean) {
  return dark
    ? { bg: '#0E0D0B', card: '#1C1912', sep: 'rgba(255,255,255,0.06)', text: '#E8DCC8', muted: '#8A8070', chevron: '#555', switchOff: '#444' }
    : { bg: '#F2F1F0', card: '#FFFFFF', sep: 'rgba(0,0,0,0.06)', text: '#1C1C1E', muted: '#8E8E93', chevron: '#C7C7CC', switchOff: '#E0E0E0' };
}

// ── 主设置页 ──
function MainPage({ isDark, onToggleTheme, onNav }: { isDark: boolean; onToggleTheme: () => void; onNav: (p: string) => void }) {
  const c = colors(isDark);
      const persona = usePersonaStore();
  const s = useUsageStore();
  const u = s?.usage || { today:{inputTokens:0,outputTokens:0,calls:0,inputCostRmb:0,outputCostRmb:0}, total:{inputTokens:0,outputTokens:0,calls:0,inputCostRmb:0,outputCostRmb:0} };
  const [showUsage, setShowUsage] = useState(false);
  const [cm, setCm] = useState({ totalCalls:0, hitTokens:0, missTokens:0, lastHitRate:0 });

  useEffect(() => { s?.load?.(); }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 32, fontWeight: '800', color: c.text, paddingHorizontal: 20, paddingTop: SAFE_TOP, paddingBottom: 28, letterSpacing: 0.5 }}>设置</Text>

      <Section title="偏好">
        <Row icon="👤" label="玩家性别" value={persona.gender==='male'?'男':'女'} onPress={()=>persona.setGender(persona.gender==='male'?'female':'male')} dark={isDark} last />
      </Section>

      <Section title="外观">
        <Row icon={isDark?'🌙':'☀️'} label="主题" value={isDark?'深色':'浅色'} onPress={onToggleTheme} dark={isDark} last />
      </Section>

      <Section title="用量">
        <View style={{ backgroundColor: c.card, paddingVertical: 12, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ alignItems: 'center', flex: 1 }}><Text style={{ fontSize: 10, color: c.muted }}>今日</Text><Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{fmtK(u.today.inputTokens+u.today.outputTokens)}</Text><Text style={{ fontSize: 9, color: c.muted }}>token</Text></View>
            <View style={{ alignItems: 'center', flex: 1 }}><Text style={{ fontSize: 10, color: c.muted }}>累计</Text><Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{fmtK(u.total.inputTokens+u.total.outputTokens)}</Text><Text style={{ fontSize: 9, color: c.muted }}>token</Text></View>
            <View style={{ alignItems: 'center', flex: 1 }}><Text style={{ fontSize: 10, color: c.muted }}>调用</Text><Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{u.total.calls}</Text><Text style={{ fontSize: 9, color: c.muted }}>次</Text></View>
            {u.total.inputCostRmb>0 && <View style={{ alignItems: 'center', flex: 1 }}><Text style={{ fontSize: 10, color: c.muted }}>费用</Text><Text style={{ fontSize: 18, fontWeight: '700', color: '#5B9BD5' }}>{fmtRmb(u.total.inputCostRmb+u.total.outputCostRmb)}</Text><Text style={{ fontSize: 9, color: c.muted }}>累计</Text></View>}
          </View>
          <TouchableOpacity style={{ marginTop: 10 }} onPress={()=>{setShowUsage(!showUsage);if(!showUsage)try{setCm(getCacheMetrics())}catch{}}}>
            <Text style={{ fontSize: 12, color: '#5B9BD5', textAlign: 'center' }}>{showUsage?'收起':'缓存详情'}</Text>
          </TouchableOpacity>
          {showUsage && <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.sep }}><Text style={{ fontSize: 11, color: c.muted }}>命中 {fmtPct(cm.lastHitRate)} · 命中 {fmtK(cm.hitTokens)} · 未中 {fmtK(cm.missTokens)} · 今日输入 {fmtK(u.today.inputTokens)} · 输出 {fmtK(u.today.outputTokens)}</Text></View>}
        </View>
      </Section>

      <Section>
        <Row icon="🔑" label="API 配置" value="DeepSeek V4" onPress={()=>onNav('api')} dark={isDark} />
        <Row icon="📊" label="调用诊断" value="按子系统看开销" onPress={()=>onNav('diagnostics')} dark={isDark} />
        <Row icon="❤️" label="赞赏" value="支持 Koyoi" onPress={()=>onNav('reward')} dark={isDark} />
        <Row icon="ℹ️" label="关于" value={"v" + (Constants.expoConfig?.version || '2.19.0')} onPress={()=>onNav('about')} dark={isDark} last />
      </Section>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── API 配置页 ──
function ApiPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const c = colors(isDark);
      const { configs, activeConfigId, isLoaded, loadConfigs, saveConfig, testConnection } = useConfigStore();
  const [apiKey, setApiKey] = useState(''); const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-v4-flash'); const [thinking, setThinking] = useState<'disabled'|'low'|'high'>('disabled');
  const [effort, setEffort] = useState<'low'|'high'>('high');
  const [temp, setTemp] = useState('1.3'); const [maxTok, setMaxTok] = useState('4096');
  const [filter, setFilter] = useState<'off'|'moderate'|'strict'>('off');
  const [stream, setStream] = useState(true); const [polish, setPolish] = useState(true);
  const [testing, setTesting] = useState(false);
  const [fb, setFb] = useState<{t:string;m:string}>({t:'',m:''});
  const showFb = (t:string,m:string) => { setFb({t,m}); setTimeout(()=>setFb({t:'',m:''}),2500); };

  useEffect(() => { if (!isLoaded) loadConfigs(); }, [isLoaded]);
  useEffect(() => {
    const a = configs.find(c=>c.id===activeConfigId);
    if (a) {
      // 旧版本（≤v2.16）曾用 thinkingMode='enabled' / reasoningEffort='max'，这里做向后兼容归一化
      const legacyThinking = a.thinkingMode as string;
      const legacyEffort = a.reasoningEffort as string;
      setApiKey(a.apiKey); setBaseUrl(a.baseUrl); setModel(a.model);
      setThinking(legacyThinking === 'enabled' ? 'high' : a.thinkingMode);
      setEffort(legacyEffort === 'max' ? 'high' : a.reasoningEffort);
      setTemp(String(a.temperature)); setMaxTok(String(a.maxTokens)); setFilter(a.safetyFilter); setStream(a.streamOutput); setPolish(a.autoPolish!==false);
    }
  }, [activeConfigId, configs]);

  const save = async () => {
    const a = configs.find(c=>c.id===activeConfigId); if (!a) return;
    await saveConfig({...a,apiKey:apiKey.trim(),baseUrl:baseUrl.trim().replace(/\/$/,''),model,thinkingMode:thinking,reasoningEffort:effort,temperature:parseFloat(temp)||1.3,maxTokens:parseInt(maxTok)||2048,safetyFilter:filter,streamOutput:stream,autoPolish:polish});
    showFb('success','已保存');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{ paddingLeft: 20, paddingTop: SAFE_TOP, paddingBottom: 12 }}><Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text></TouchableOpacity>
      <Text style={{ fontSize: 32, fontWeight: '800', color: c.text, paddingHorizontal: 20, paddingBottom: 24, letterSpacing: 0.5 }}>API 配置</Text>

      <Section title="连接">
        <View style={{ backgroundColor: c.card, padding: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: c.muted, marginBottom: 6 }}>API 地址</Text>
          <TextInput style={{ backgroundColor: isDark?'#13110F':'#F0EDE8', borderRadius: 8, padding: 10, color: c.text, fontSize: 14, borderWidth: 1, borderColor: isDark?'#2C2A22':'#E8E4DD' }} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.deepseek.com" placeholderTextColor="#666" autoCapitalize="none" />
        </View>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.sep, marginLeft: 16 }} />
        <View style={{ backgroundColor: c.card, padding: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: c.muted, marginBottom: 6 }}>API Key</Text>
          <TextInput style={{ backgroundColor: isDark?'#13110F':'#F0EDE8', borderRadius: 8, padding: 10, color: c.text, fontSize: 14, borderWidth: 1, borderColor: isDark?'#2C2A22':'#E8E4DD' }} value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor="#666" autoCapitalize="none" secureTextEntry />
        </View>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.sep, marginLeft: 16 }} />
        <TouchableOpacity style={{ backgroundColor: c.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={()=>Linking.openURL('https://platform.deepseek.com/api_keys')} activeOpacity={0.6}>
          <Text style={{ fontSize: 18 }}>🔑</Text><Text style={{ flex: 1, fontSize: 13, color: c.muted }}>前往 DeepSeek 获取 API Key</Text><Text style={{ fontSize: 14, color: '#5B9BD5' }}>↗</Text>
        </TouchableOpacity>
      </Section>

      <Section title="模型">
        <View style={{ backgroundColor: c.card, padding: 16 }}>
          <TextInput style={{ backgroundColor: isDark?'#13110F':'#F0EDE8', borderRadius: 8, padding: 10, color: c.text, fontSize: 14, borderWidth: 1, borderColor: isDark?'#2C2A22':'#E8E4DD', marginBottom: 8 }} value={model} onChangeText={setModel} placeholder="deepseek-v4-flash" placeholderTextColor="#666" autoCapitalize="none" />
          <View style={{ flexDirection: 'row', gap: 6 }}>{['deepseek-v4-flash','deepseek-v4-pro'].map(m=><Chip key={m} label={m==='deepseek-v4-flash'?'V4 Flash':'V4 Pro'} on={model===m} onPress={()=>setModel(m)} dark={isDark} />)}</View>
          <Text style={{ fontSize: 10, color: c.muted, marginTop: 6 }}>支持任何 OpenAI 兼容 API 的模型名</Text>
        </View>
      </Section>

      <Section title="参数">
        <RowSwitch icon="🧠" label="思考模式" sub={thinking==='disabled'?'关闭（速度快）':thinking==='low'?'轻度推理':'深度推理（消耗翻倍）'} value={thinking==='high'} onValueChange={(v)=>setThinking(v?'high':'disabled')} dark={isDark} />
        {thinking==='disabled' && <Row icon="🌡️" label="Temperature" value={temp} onPress={()=>{const opts=['0.7','1.0','1.3','1.5'];const i=opts.indexOf(temp);setTemp(opts[(i+1)%opts.length])}} dark={isDark} />}
        <Row icon="📏" label="最大输出" value={maxTok} onPress={()=>{const opts=['1024','2048','4096','8192'];const i=opts.indexOf(maxTok);setMaxTok(opts[(i+1)%opts.length])}} dark={isDark} />
        <Row icon="🛡️" label="内容过滤" value={filter==='off'?'关闭':filter==='moderate'?'中等':'严格'} onPress={()=>setFilter(filter==='off'?'moderate':filter==='moderate'?'strict':'off')} dark={isDark} last />
      </Section>

      <Section title="输出">
        <RowSwitch icon="⚡" label="流式输出" sub={polish?'润色开启时不可用':'逐字显示 AI 回复'} value={stream&&!polish} onValueChange={(v)=>{setStream(v);if(v)setPolish(false)}} dark={isDark} disabled={polish} />
        <RowSwitch icon="✨" label="自动润色" sub={stream?'流式开启时不可用':'去 AI 味，额外少量 token'} value={polish&&!stream} onValueChange={(v)=>{setPolish(v);if(v)setStream(false)}} dark={isDark} disabled={stream} last />
      </Section>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 }}>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: isDark?'#25231F':'#E0E0E0', alignItems: 'center' }} onPress={async()=>{setTesting(true);try{const r = await testConnection(); if (r.success) showFb('success', r.message); else showFb('error', r.message);}catch(e:any){showFb('error','失败: '+(e.message||''))}setTesting(false)}} disabled={testing||!apiKey.trim()}>
          {testing?<ActivityIndicator size="small" color="#5B9BD5"/>:<Text style={{ fontSize: 15, fontWeight: '600', color: isDark?'#fff':'#333' }}>测试连接</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#5B9BD5', alignItems: 'center' }} onPress={save}><Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>保存</Text></TouchableOpacity>
      </View>
      {fb.m!=='' && <View style={{ marginHorizontal: 16, marginBottom: 20, padding: 12, borderRadius: 10, backgroundColor: fb.t==='success'?'#1a3a1a':'#3a1a1a' }}><Text style={{ color: fb.t==='success'?'#4caf50':'#ff6b6b', fontSize: 13, textAlign: 'center' }}>{fb.m}</Text></View>}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── 赞赏 & 关于 ──
function RewardPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const c = colors(isDark);
  const bottomPad = 24;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TouchableOpacity onPress={onBack} style={{ paddingLeft: 20, paddingTop: SAFE_TOP, paddingBottom: 12 }}><Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text></TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: bottomPad }}>
        <Image source={{ uri: REWARD_IMAGE_URI }} style={{ width: 200, height: 200, borderRadius: 12 }} resizeMode="contain" />
        <Text style={{ fontSize: 13, color: c.muted, marginTop: 16 }}>感谢支持 Koyoi</Text>
      </View>
    </View>
  );
}

function AboutPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const c = colors(isDark);
      return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{ paddingLeft: 20, paddingTop: SAFE_TOP, paddingBottom: 12 }}><Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', paddingTop: 30 }}>
        <Text style={{ fontSize: 32, fontWeight: '800', color: c.text, marginBottom: 8 }}>Koyoi</Text>
        <Text style={{ fontSize: 13, color: c.muted }}>版本 2.17.0 · Expo SDK 56</Text>
      </View>
      <View style={{ paddingHorizontal: 30, marginTop: 30 }}>
        <Text style={{ fontSize: 13, color: c.muted, lineHeight: 22, textAlign: 'center' }}>
          {'打开一本书，走进一个世界。\nAI 驱动的互动小说引擎。\n上传 txt 小说，AI 自动分析角色与剧情，\n让你穿越到故事中，改变命运。\n\n基于 DeepSeek V4，完全本地存储。\n\n免责声明：本应用 AI 生成内容仅供娱乐。\n请勿上传无版权作品。'}
        </Text>
      </View>
      <TouchableOpacity style={{ marginTop: 30, alignSelf: 'center' }} onPress={()=>Linking.openURL('https://github.com/gucheng910/koyoi')}><Text style={{ fontSize: 13, color: '#5B9BD5' }}>GitHub →</Text></TouchableOpacity>
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ── 诊断（阶段七）──
//
// 项目有 100 处 console.*，release 构建里全丢。这个页面把 trace 记录的
// 「哪个子系统花了多少钱/多少时间/失败几次」呈现出来，支持导出。
function DiagnosticsPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const c = colors(isDark);
  const [tab, setTab] = useState<'cost' | 'turns'>('cost');
  const [copied, setCopied] = useState('');

  // 每次进入/切换时重新读取（trace 在内存里，非响应式）
  const summary = summarizeByTag();
  const trace = getTrace();
  const totalCost = summary.reduce((a, r) => a + r.costRmb, 0);
  const totalCalls = summary.reduce((a, r) => a + r.calls, 0);
  const totalErrors = summary.reduce((a, r) => a + r.errors, 0);

  const fmtCost = (v: number) => (v < 0.01 ? '¥' + v.toFixed(4) : '¥' + v.toFixed(3));
  const fmtTok = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));

  const doExport = async () => {
    try {
      const json = exportTrace();
      await Clipboard.setStringAsync(json);
      setCopied('已复制到剪贴板');
    } catch {
      setCopied('复制失败');
    }
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{ paddingLeft: 20, paddingTop: SAFE_TOP, paddingBottom: 12 }}>
        <Text style={{ fontSize: 15, color: '#5B9BD5' }}>← 设置</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, paddingHorizontal: 20, marginBottom: 4 }}>调用诊断</Text>
      <Text style={{ fontSize: 12, color: c.muted, paddingHorizontal: 20, marginBottom: 16, lineHeight: 18 }}>
        按子系统统计本次运行的 AI 调用开销。数据仅在内存中，不上传。
      </Text>

      {/* 总计 */}
      <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 12, backgroundColor: isDark ? '#1A1814' : '#FFFFFF', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#5B9BD5' }}>{totalCalls}</Text>
            <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>调用次数</Text>
          </View>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#5B9BD5' }}>{fmtCost(totalCost)}</Text>
            <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>费用</Text>
          </View>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: totalErrors > 0 ? '#ff6b6b' : c.text }}>{totalErrors}</Text>
            <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>失败</Text>
          </View>
        </View>
      </View>

      {/* 标签页 */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
        {([['cost', '按子系统'], ['turns', '按轮次']] as const).map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)}
            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: tab === k ? '#5B9BD522' : 'transparent', borderWidth: 1, borderColor: tab === k ? '#5B9BD5' : 'transparent' }}>
            <Text style={{ fontSize: 12, color: tab === k ? '#5B9BD5' : c.muted, fontWeight: tab === k ? '600' : '400' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'cost' && (
        <View style={{ marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? '#1A1814' : '#FFFFFF' }}>
          {summary.length === 0 ? (
            <Text style={{ padding: 20, fontSize: 12, color: c.muted, textAlign: 'center' }}>还没有调用记录{'\n'}去世界里发一条消息试试</Text>
          ) : summary.map((r, i) => (
            <View key={r.tag} style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.sep }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{SUBSYSTEM_LABEL[r.tag] || r.tag}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#5B9BD5' }}>{fmtCost(r.costRmb)}</Text>
              </View>
              <Text style={{ fontSize: 11, color: c.muted, marginTop: 3 }}>
                {r.calls} 次 · {fmtTok(r.inputTokens)} 入 / {fmtTok(r.outputTokens)} 出 · 均 {r.avgMs}ms
                {r.errors > 0 ? ` · ⚠ ${r.errors} 失败` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {tab === 'turns' && (
        <View style={{ marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? '#1A1814' : '#FFFFFF' }}>
          {trace.turns.length === 0 ? (
            <Text style={{ padding: 20, fontSize: 12, color: c.muted, textAlign: 'center' }}>还没有轮次记录</Text>
          ) : trace.turns.slice(0, 8).map((t, i) => (
            <View key={t.turn} style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.sep }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>第 {t.turn + 1} 轮</Text>
                <Text style={{ fontSize: 12, color: c.muted }}>{t.durationMs}ms · {t.calls.length} 次调用</Text>
              </View>
              {t.calls.length > 0 && (
                <Text style={{ fontSize: 11, color: c.muted, marginTop: 3 }}>
                  {t.calls.map(c2 => `${SUBSYSTEM_LABEL[String(c2.tag)] || c2.tag} ${c2.durationMs}ms${c2.ok ? '' : '✗'}`).join(' · ')}
                </Text>
              )}
              {t.errors.length > 0 && (
                <Text style={{ fontSize: 11, color: '#ff6b6b', marginTop: 3 }}>{t.errors.join('; ')}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={doExport} style={{ marginHorizontal: 16, marginTop: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: isDark ? '#25231F' : '#E0E0E0', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: isDark ? '#E8DCC8' : '#333' }}>导出诊断数据</Text>
      </TouchableOpacity>
      {copied !== '' && <Text style={{ textAlign: 'center', fontSize: 12, color: '#4caf50', marginTop: 8 }}>{copied}</Text>}

      <Text style={{ fontSize: 11, color: c.muted, paddingHorizontal: 20, marginTop: 16, lineHeight: 16 }}>
        提示：若某个子系统费用异常偏高，通常是它的输入上下文过长。
        角色推演与抛光是大头。
      </Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/** 子系统内部名 → 中文展示名 */
const SUBSYSTEM_LABEL: Record<string, string> = {
  'character-sim': '角色推演',
  'router': '内容路由',
  'narrator': '正文生成',
  'polish': '润色',
  'summary': '对话摘要',
  'memory-extract': '记忆提取',
  'memory-resummarize': '记忆压缩',
  'world-pulse': '世界脉冲',
  'chapter-track': '章节追踪',
  'background-interaction': '背景互动',
  'novel-analyze': '小说分析',
  'timeline-synth': '时间线合成',
  'style-analyze': '文风分析',
  'other': '其他',
};

const Chip = ({ label, on, onPress, dark }: { label: string; on: boolean; onPress: () => void; dark: boolean }) => <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: on?(dark?'#1A2430':'#E8F0F8'):(dark?'#25231F':'#F0EDE8'), borderWidth: 1, borderColor: on?'#5B9BD5':'transparent' }} onPress={onPress}><Text style={{ fontSize: 11, fontWeight: on?'600':'400', color: on?'#5B9BD5':(dark?'#8A8070':'#8A8070') }}>{label}</Text></TouchableOpacity>;

export default function SettingsScreen({ isDark, onToggleTheme }: Props) {
  const [page, setPage] = useState('main');
  if (page==='api') return <ApiPage isDark={isDark} onBack={()=>setPage('main')} />;
  if (page==='reward') return <RewardPage isDark={isDark} onBack={()=>setPage('main')} />;
  if (page==='about') return <AboutPage isDark={isDark} onBack={()=>setPage('main')} />;
  if (page==='diagnostics') return <DiagnosticsPage isDark={isDark} onBack={()=>setPage('main')} />;
  return <MainPage isDark={isDark} onToggleTheme={onToggleTheme} onNav={setPage} />;
}
