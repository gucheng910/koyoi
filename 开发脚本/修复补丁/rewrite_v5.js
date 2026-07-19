const fs = require('fs');

const clean = `// ============================================================
//  设置页面 v5
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

function fmtK(n: number) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n>=1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function fmtRmb(n: number) { if (!n||isNaN(n)||n<0) return '¥0.00'; if (n<0.01) return '<¥0.01'; return '¥'+n.toFixed(2); }
function fmtPct(n: number) { if (!n||isNaN(n)) return '0%'; return (n*100).toFixed(0)+'%'; }

interface Props { isDark: boolean; onToggleTheme: () => void; }

// ── 主设置页 ──
function MainPage({ isDark, onToggleTheme, onNav }: { isDark: boolean; onToggleTheme: () => void; onNav: (p: string) => void }) {
  const S = useStyles(isDark);
  const persona = usePersonaStore();
  const s = useUsageStore();
  const u = s?.usage || { today:{inputTokens:0,outputTokens:0,calls:0,inputCostRmb:0,outputCostRmb:0}, total:{inputTokens:0,outputTokens:0,calls:0,inputCostRmb:0,outputCostRmb:0} };
  const [show, setShow] = useState(false);
  const [cm, setCm] = useState({ totalCalls:0, hitTokens:0, missTokens:0, lastHitRate:0 });

  useEffect(() => { s?.load?.(); }, []);

  return (
    <ScrollView style={S.root} showsVerticalScrollIndicator={false}>
      <Text style={S.header}>设置</Text>

      <Text style={S.section}>偏好</Text>
      <View style={S.card}>
        <View style={S.row}><Text style={S.rowLabel}>玩家性别</Text><View style={{flexDirection:'row',gap:8}}><Chip label="♂ 男" on={persona.gender==='male'} onPress={()=>persona.setGender('male')} dark={isDark} /><Chip label="♀ 女" on={persona.gender==='female'} onPress={()=>persona.setGender('female')} dark={isDark} /></View></View>
        <View style={[S.row,{marginTop:12}]}><Text style={S.rowLabel}>主题</Text><View style={{flexDirection:'row',gap:8}}><Chip label="☀️ 浅色" on={!isDark} onPress={()=>!isDark||onToggleTheme()} dark={isDark} /><Chip label="🌙 深色" on={isDark} onPress={()=>isDark||onToggleTheme()} dark={isDark} /></View></View>
      </View>

      <Text style={S.section}>用量</Text>
      <View style={S.card}>
        <View style={{flexDirection:'row',justifyContent:'space-between'}}>
          <Stat label="今日 token" value={fmtK(u.today.inputTokens+u.today.outputTokens)} dark={isDark} />
          <Stat label="累计 token" value={fmtK(u.total.inputTokens+u.total.outputTokens)} dark={isDark} />
          <Stat label="调用次数" value={u.total.calls+'次'} dark={isDark} />
          {u.total.inputCostRmb>0 && <Stat label="费用" value={fmtRmb(u.total.inputCostRmb+u.total.outputCostRmb)} dark={isDark} accent />}
        </View>
        <TouchableOpacity style={{marginTop:10}} onPress={()=>{setShow(!show);if(!show)try{setCm(getCacheMetrics())}catch{}}}>
          <Text style={{fontSize:12,color:'#5B9BD5'}}>{show?'收起 ▴':'展开详情 ▾'}</Text>
        </TouchableOpacity>
        {show && <View style={{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor: isDark?'#2C2A22':'#E8E4DD'}}>
          <Text style={{fontSize:11,color:isDark?'#8A8070':'#8A8070',marginBottom:6}}>缓存 · 命中 {fmtPct(cm.lastHitRate)}</Text>
          <Text style={{fontSize:11,color:isDark?'#ccc':'#555'}}>今日输入 {fmtK(u.today.inputTokens)} · 输出 {fmtK(u.today.outputTokens)} · 调用 {u.today.calls}次{u.today.inputCostRmb>0?' · ¥'+fmtRmb(u.today.inputCostRmb+u.today.outputCostRmb):''}</Text>
        </View>}
      </View>

      <Text style={S.section}>其他</Text>
      {[
        {icon:'🔑',label:'API 配置',sub:'模型 / 温度 / maxtokens / 流式',page:'api'},
        {icon:'❤️',label:'赞赏',sub:'支持 Koyoi 的持续开发',page:'reward'},
        {icon:'ℹ️',label:'关于 Koyoi',sub:'版本 2.14.0 · 免责声明',page:'about'},
      ].map(item=>(
        <TouchableOpacity key={item.page} style={S.navItem} onPress={()=>onNav(item.page)} activeOpacity={0.7}>
          <Text style={{fontSize:18,marginRight:12}}>{item.icon}</Text>
          <View style={{flex:1}}><Text style={{fontSize:14,fontWeight:'600',color:isDark?'#E8DCC8':'#2D2822'}}>{item.label}</Text><Text style={{fontSize:11,color:isDark?'#7A7060':'#9A9080',marginTop:2}}>{item.sub}</Text></View>
          <Text style={{fontSize:14,color:isDark?'#555':'#ccc'}}>›</Text>
        </TouchableOpacity>
      ))}
      <View style={{height:40}}/>
    </ScrollView>
  );
}

// ── API 配置 ──
function ApiPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const S = useStyles(isDark);
  const { configs, activeConfigId, isLoaded, loadConfigs, saveConfig, testConnection } = useConfigStore();
  const [apiKey, setApiKey] = useState(''); const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-v4-flash'); const [thinkingMode, setThinkingMode] = useState<'disabled'|'low'|'high'>('disabled');
  const [reasoningEffort, setReasoningEffort] = useState<'low'|'high'>('high');
  const [temperature, setTemperature] = useState('1.3'); const [maxTokens, setMaxTokens] = useState('4096');
  const [safetyFilter, setSafetyFilter] = useState<'off'|'moderate'|'strict'>('off');
  const [streamOutput, setStreamOutput] = useState(true); const [autoPolish, setAutoPolish] = useState(true);
  const [testing, setTesting] = useState(false);
  const [fb, setFb] = useState<{t:string;m:string}>({t:'',m:''});
  const showFb = (t:string,m:string) => { setFb({t,m}); setTimeout(()=>setFb({t:'',m:''}),2500); };

  useEffect(() => { if (!isLoaded) loadConfigs(); }, [isLoaded]);
  useEffect(() => {
    const a = configs.find(c => c.id === activeConfigId);
    if (a) { setApiKey(a.apiKey); setBaseUrl(a.baseUrl); setModel(a.model); setThinkingMode((a.thinkingMode==='enabled'?'high':a.thinkingMode)||'disabled'); setReasoningEffort((a.reasoningEffort==='max'?'high':a.reasoningEffort)||'high'); setTemperature(String(a.temperature)); setMaxTokens(String(a.maxTokens)); setSafetyFilter(a.safetyFilter); setStreamOutput(a.streamOutput); setAutoPolish(a.autoPolish!==false); }
  }, [activeConfigId, configs]);

  const handleTest = async () => { setTesting(true); try { await testConnection(activeConfigId??''); showFb('success','连接成功'); } catch(e:any){ showFb('error','失败: '+(e.message||'')); } setTesting(false); };
  const handleSave = async () => {
    const a = configs.find(c=>c.id===activeConfigId); if(!a)return;
    await saveConfig({...a,apiKey:apiKey.trim(),baseUrl:baseUrl.trim().replace(/\\/$/,''),model,thinkingMode,reasoningEffort,temperature:parseFloat(temperature)||1.3,maxTokens:parseInt(maxTokens)||2048,safetyFilter,streamOutput,autoPolish});
    showFb('success','已保存');
  };

  return (
    <ScrollView style={S.root} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{paddingHorizontal:20,paddingTop:56,paddingBottom:12}}><Text style={{fontSize:15,color:'#5B9BD5'}}>← 设置</Text></TouchableOpacity>
      <Text style={S.header}>API 配置</Text>

      <View style={S.card}><Text style={S.field}>API 地址</Text><TextInput style={S.input} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.deepseek.com" placeholderTextColor="#666" autoCapitalize="none" /></View>
      <View style={S.card}><Text style={S.field}>API Key</Text><TextInput style={S.input} value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor="#666" autoCapitalize="none" secureTextEntry /></View>
      <TouchableOpacity style={[S.card,{flexDirection:'row',alignItems:'center',gap:10}]} onPress={()=>Linking.openURL('https://platform.deepseek.com/api_keys')} activeOpacity={0.7}><Text style={{fontSize:22}}>🔑</Text><View style={{flex:1}}><Text style={{fontSize:12,color:isDark?'#ccc':'#555'}}>前往 DeepSeek 获取 Key</Text><Text style={{fontSize:11,color:'#5B9BD5',marginTop:2}}>platform.deepseek.com → API Keys</Text></View><Text style={{fontSize:12,color:'#5B9BD5'}}>↗</Text></TouchableOpacity>

      <View style={S.card}><Text style={S.field}>模型</Text><TextInput style={S.input} value={model} onChangeText={setModel} placeholder="deepseek-v4-flash" placeholderTextColor="#666" autoCapitalize="none" /><View style={{flexDirection:'row',gap:8,marginTop:8}}><Chip label="V4 Flash" on={model==='deepseek-v4-flash'} onPress={()=>setModel('deepseek-v4-flash')} dark={isDark} /><Chip label="V4 Pro" on={model==='deepseek-v4-pro'} onPress={()=>setModel('deepseek-v4-pro')} dark={isDark} /></View><Text style={{fontSize:10,color:'#888',marginTop:6}}>支持任何 OpenAI 兼容 API 的模型名</Text></View>

      <View style={S.card}><Text style={S.field}>思考模式</Text><Text style={{fontSize:11,color:'#888',marginBottom:8}}>关闭适合日常对话。开启后先推理再回复，质量更高但消耗翻倍。</Text><View style={{flexDirection:'row',gap:8}}><Chip label="关闭" on={thinkingMode==='disabled'} onPress={()=>setThinkingMode('disabled')} dark={isDark} /><Chip label="轻度" on={thinkingMode==='low'} onPress={()=>{setThinkingMode('low');setReasoningEffort('low');}} dark={isDark} /><Chip label="深度" on={thinkingMode==='high'} onPress={()=>{setThinkingMode('high');setReasoningEffort('high');}} dark={isDark} /></View></View>

      {thinkingMode==='disabled' && <View style={S.card}><Text style={S.field}>Temperature · {temperature}</Text><View style={{flexDirection:'row',gap:8}}><Chip label="0.7" on={temperature==='0.7'} onPress={()=>setTemperature('0.7')} dark={isDark} /><Chip label="1.0" on={temperature==='1.0'} onPress={()=>setTemperature('1.0')} dark={isDark} /><Chip label="1.3" on={temperature==='1.3'} onPress={()=>setTemperature('1.3')} dark={isDark} /><Chip label="1.5" on={temperature==='1.5'} onPress={()=>setTemperature('1.5')} dark={isDark} /></View></View>}

      <View style={S.card}><Text style={S.field}>最大输出</Text><View style={{flexDirection:'row',gap:8}}>{['1024','2048','4096','8192'].map(t=><Chip key={t} label={t} on={maxTokens===t} onPress={()=>setMaxTokens(t)} dark={isDark} />)}</View></View>

      <View style={S.card}><Text style={S.field}>内容过滤</Text><View style={{flexDirection:'row',gap:8}}><Chip label="关闭" on={safetyFilter==='off'} onPress={()=>setSafetyFilter('off')} dark={isDark} /><Chip label="中等" on={safetyFilter==='moderate'} onPress={()=>setSafetyFilter('moderate')} dark={isDark} /><Chip label="严格" on={safetyFilter==='strict'} onPress={()=>setSafetyFilter('strict')} dark={isDark} /></View></View>

      <View style={S.card}>
        <View style={S.switchRow}><View style={{flex:1,marginRight:12}}><Text style={S.field}>流式输出</Text><Text style={{fontSize:11,color:autoPolish?'#ff9800':'#888',marginTop:2}}>{autoPolish?'（润色开启时不可用）':'逐字显示'}</Text></View><Switch value={streamOutput&&!autoPolish} onValueChange={(v)=>{setStreamOutput(v);if(v)setAutoPolish(false)}} trackColor={{false:'#ddd',true:'#5B9BD5'}} thumbColor="#fff" disabled={autoPolish}/></View>
        <View style={[S.switchRow,{marginTop:14}]}><View style={{flex:1,marginRight:12}}><Text style={S.field}>自动润色</Text><Text style={{fontSize:11,color:'#ff9800',marginTop:2}}>{streamOutput?'（流式开启时不可用）':'去 AI 味，每次额外少量 token'}</Text></View><Switch value={autoPolish&&!streamOutput} onValueChange={(v)=>{setAutoPolish(v);if(v)setStreamOutput(false)}} trackColor={{false:'#ddd',true:'#5B9BD5'}} thumbColor="#fff" disabled={streamOutput}/></View>
      </View>

      <View style={{flexDirection:'row',gap:10,paddingHorizontal:20,marginTop:10}}>
        <TouchableOpacity style={[S.btn,{flex:1,backgroundColor:isDark?'#25231F':'#e0e0e0'}]} onPress={handleTest} disabled={testing||!apiKey.trim()}>{testing?<ActivityIndicator size="small" color="#5B9BD5"/>:<Text style={[S.btnText,{color:isDark?'#fff':'#333'}]}>测试连接</Text>}</TouchableOpacity>
        <TouchableOpacity style={[S.btn,{flex:1,backgroundColor:'#5B9BD5'}]} onPress={handleSave}><Text style={[S.btnText,{color:'#fff'}]}>保存</Text></TouchableOpacity>
      </View>
      {fb.m!=='' && <View style={{marginHorizontal:20,marginTop:10,padding:12,borderRadius:10,backgroundColor:fb.t==='success'?'#1a3a1a':'#3a1a1a'}}><Text style={{color:fb.t==='success'?'#4caf50':'#ff6b6b',fontSize:13,textAlign:'center'}}>{fb.m}</Text></View>}
      <View style={{height:40}}/>
    </ScrollView>
  );
}

// ── 赞赏 ──
function RewardPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const S = useStyles(isDark);
  return (
    <View style={S.root}>
      <TouchableOpacity onPress={onBack} style={{paddingHorizontal:20,paddingTop:56,paddingBottom:12}}><Text style={{fontSize:15,color:'#5B9BD5'}}>← 设置</Text></TouchableOpacity>
      <View style={{flex:1,justifyContent:'center',alignItems:'center',paddingBottom:80}}>
        <Image source={require('../../assets/reward.png')} style={{width:200,height:200,borderRadius:12}} resizeMode="contain"/>
        <Text style={{fontSize:13,color:isDark?'#8A8070':'#8A8070',marginTop:16}}>感谢支持 Koyoi</Text>
      </View>
    </View>
  );
}

// ── 关于 ──
function AboutPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const S = useStyles(isDark);
  return (
    <ScrollView style={S.root} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={{paddingHorizontal:20,paddingTop:56,paddingBottom:12}}><Text style={{fontSize:15,color:'#5B9BD5'}}>← 设置</Text></TouchableOpacity>
      <View style={{alignItems:'center',paddingTop:30}}>
        <Text style={{fontSize:32,fontWeight:'800',color:isDark?'#E8DCC8':'#2D2822',marginBottom:8}}>Koyoi</Text>
        <Text style={{fontSize:13,color:isDark?'#8A8070':'#8A8070'}}>版本 2.14.0</Text>
        <Text style={{fontSize:12,color:isDark?'#666':'#999',marginTop:4}}>Expo SDK 56 · React Native</Text>
      </View>
      <View style={{paddingHorizontal:30,marginTop:30}}>
        <Text style={{fontSize:13,color:isDark?'#ccc':'#555',lineHeight:22,textAlign:'center'}}>{'AI 驱动的互动小说应用。上传小说，魂穿到故事中。\\n基于 DeepSeek V4，完全本地存储。\\n\\n免责声明：本应用 AI 生成内容仅供娱乐。同人穿越功能旨在为创作者提供灵感，请勿上传无版权作品。'}</Text>
      </View>
      <TouchableOpacity style={{marginTop:30,alignSelf:'center'}} onPress={()=>Linking.openURL('https://github.com')}><Text style={{fontSize:13,color:'#5B9BD5'}}>GitHub →</Text></TouchableOpacity>
      <View style={{height:60}}/>
    </ScrollView>
  );
}

// ── 组件 ──
function Chip({ label, on, onPress, dark }: { label: string; on: boolean; onPress: () => void; dark: boolean }) {
  return <TouchableOpacity style={{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:on?(dark?'#1A2430':'#E8F0F8'):(dark?'#25231F':'#F0EDE8'),borderWidth:1,borderColor:on?'#5B9BD5':'transparent'}} onPress={onPress}><Text style={{fontSize:12,fontWeight:on?'600':'400',color:on?'#5B9BD5':(dark?'#8A8070':'#8A8070')}}>{label}</Text></TouchableOpacity>;
}

function Stat({ label, value, dark, accent }: { label: string; value: string; dark: boolean; accent?: boolean }) {
  return <View><Text style={{fontSize:10,color:dark?'#5A5450':'#B8B0A4',marginBottom:2}}>{label}</Text><Text style={{fontSize:17,fontWeight:'700',color:accent?'#5B9BD5':(dark?'#E8DCC8':'#2D2822')}}>{value}</Text></View>;
}

function useStyles(dark: boolean) {
  const c = dark ? { bg:'#0E0D0B', card:'#1C1912', border:'#2C2A22', text:'#E8DCC8', muted:'#8A8070', faded:'#5A5450', input:'#13110F' } : { bg:'#F8F9FA', card:'#FFFFFF', border:'#E8E4DD', text:'#2D2822', muted:'#8A8070', faded:'#B8B0A4', input:'#F0EDE8' };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { fontSize: 28, fontWeight: '700', color: c.text, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, letterSpacing: 1 },
    section: { fontSize: 11, fontWeight: '700', color: c.faded, letterSpacing: 2, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
    card: { backgroundColor: c.card, borderRadius: 12, padding: 16, marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: c.border },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowLabel: { fontSize: 13, fontWeight: '600', color: c.text },
    navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, marginHorizontal: 20, marginBottom: 4, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border },
    field: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8 },
    input: { backgroundColor: c.input, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 13, borderWidth: 1, borderColor: c.border },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    btnText: { fontSize: 15, fontWeight: '600' },
  });
}

// ── 入口 ──
export default function SettingsScreen({ isDark, onToggleTheme }: Props) {
  const [page, setPage] = useState('main');
  if (page==='api') return <ApiPage isDark={isDark} onBack={()=>setPage('main')}/>;
  if (page==='reward') return <RewardPage isDark={isDark} onBack={()=>setPage('main')}/>;
  if (page==='about') return <AboutPage isDark={isDark} onBack={()=>setPage('main')}/>;
  return <MainPage isDark={isDark} onToggleTheme={onToggleTheme} onNav={setPage}/>;
}
`;

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', clean);
console.log('SettingsScreen v5 written');
