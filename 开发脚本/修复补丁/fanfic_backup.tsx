// ============================================================
//  同人系统 - 小说上传、AI解析、穿越设置
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useConfigStore } from '../store/configStore';
import { useWorldStore } from '../store/worldStore';
import { chatCompletionSync } from '../api/deepseek';
import type { World, Character, FanficWorldCard, TransmigrationConfig, WorldType, TimelineEvent } from '../types';
import Toast from '../components/Toast';

interface Props { isDark: boolean; onStart: (world: World, character: Character, config: TransmigrationConfig) => void; onBack: () => void; }

const T = (dark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: dark ? '#0d0d0d' : '#fafafa' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: dark ? '#1a1a1a' : '#e8e8e8' },
  backBtn: { color: '#e91e63', fontSize: 15, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', color: dark ? '#f5f5f5' : '#1a1a1a' },
  sub: { fontSize: 13, color: dark ? '#888' : '#999', marginTop: 4 },
  content: { padding: 20, flex: 1 },
  stepNum: { fontSize: 12, color: '#e91e63', fontWeight: '600', marginBottom: 4 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: dark ? '#f5f5f5' : '#1a1a1a', marginBottom: 16 },
  uploadBtn: { borderWidth: 2, borderColor: '#e91e63', borderStyle: 'dashed', borderRadius: 16, padding: 40, alignItems: 'center', marginBottom: 16 },
  uploadText: { color: '#e91e63', fontSize: 16, fontWeight: '600', marginTop: 8 },
  uploadSub: { color: dark ? '#666' : '#aaa', fontSize: 12, marginTop: 4 },
  fileName: { color: dark ? '#ddd' : '#333', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  parsingBox: { backgroundColor: dark ? '#1a1a1a' : '#f5f5f5', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 },
  parsingText: { color: dark ? '#ccc' : '#666', fontSize: 14, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: dark ? '#ccc' : '#555', marginBottom: 6, marginTop: 12 },
  val: { fontSize: 14, color: dark ? '#ddd' : '#333', marginBottom: 4, lineHeight: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e91e63', marginTop: 20, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: dark ? '#222' : '#eee', paddingBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: dark ? '#1a1a1a' : '#f0f0f0', borderWidth: 1, borderColor: dark ? '#333' : '#ddd' },
  btnActive: { backgroundColor: dark ? '#2a1020' : '#fce4ec', borderColor: '#e91e63' },
  btnText: { fontSize: 14, color: dark ? '#888' : '#888' },
  btnTextActive: { color: '#e91e63' },
  input: { backgroundColor: dark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: dark ? '#333' : '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: dark ? '#f5f5f5' : '#1a1a1a', fontSize: 15, marginBottom: 10, minHeight: 80, textAlignVertical: 'top' },
  startBtn: { backgroundColor: '#e91e63', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

type Step = 'upload' | 'parsing' | 'config' | 'ready';

export default function FanficScreen({ isDark, onStart, onBack }: Props) {
  const st = T(isDark);
  const config = useConfigStore.getState().getActiveConfig();
  const configStore = useConfigStore(); // 响应式

  useEffect(() => {
    useWorldStore.getState().load();
    setSavedWorlds(useWorldStore.getState().getFanficWorlds());
  }, []);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [worldCard, setWorldCard] = useState<FanficWorldCard | null>(null);
  const [parsingStatus, setParsingStatus] = useState('');
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}>({msg:'',type:'success'});
  const [savedWorlds, setSavedWorlds] = useState<FanficWorldCard[]>([]);
  // 穿越配置
  const [transType, setTransType] = useState<'soul' | 'body'>('soul');
  const [targetCharId, setTargetCharId] = useState('');
  const [soulStatus, setSoulStatus] = useState<'gone' | 'dormant' | 'coexisting'>('dormant');
  const [timePoint, setTimePoint] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  const [playerDesc, setPlayerDesc] = useState('');
  const [plotKnowledge, setPlotKnowledge] = useState(true);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'application/epub+zip', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setFileName(file.name);
      setParsingStatus('读取文件中...');
      const content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setStep('parsing');
      parseNovel(content);
    } catch (e: any) {
      setToast({msg: '文件读取失败: ' + (e.message || ''), type: 'error'});
    }
  };

  const parseNovel = async (text: string) => {
    const cfg = configStore.getActiveConfig();
    if (!cfg?.apiKey) { setToast({msg: '请先配置API Key', type: 'error'}); setStep('upload'); return; }

    const CHUNK = 200000; // 每块20万字，1M上下文可轻松容纳
    const totalChunks = Math.ceil(text.length / CHUNK);
    const allData: any[] = [];

    for (let i = 0; i < totalChunks; i++) {
      setParsingStatus(`AI 正在分析第 ${i+1}/${totalChunks} 段...`);
      const chunk = text.slice(i * CHUNK, (i + 1) * CHUNK);
      const prompt = `分析以下小说片段（第${i+1}段，共${totalChunks}段），提取结构化信息。

返回JSON：
{"characters":[{"name":"名","role":"身份","firstSeen":"何时何地出场","actions":["在这个片段中做了什么"],"traits":["标签"]}],"events":["事件：时间地点+发生了什么"],"locations":["地点：描述+出现时机"],"worldRules":"这个片段揭示的世界观规则"}

小说片段：
${chunk.slice(0, CHUNK)}`;
      try {
        const raw = await chatCompletionSync(cfg, [
          { role: 'system', content: '你是小说分析引擎。只返回JSON。' },
          { role: 'user', content: prompt },
        ], { maxTokens: 4096, temperature: 0.2 });
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) allData.push(JSON.parse(match[0]));
      } catch {}
    }

    // 合成：将各段数据汇总，再让AI梳理完整世界观
    setParsingStatus('AI 正在合成完整世界观...');
    const merged = JSON.stringify(allData);
    const synPrompt = `以下是分段提取的小说数据。请合成完整世界观。

分段数据：${merged.slice(0, 150000)}

返回JSON：
{"worldType":"cultivation|modern|fantasy|historical|campus","summary":"100字概括","rules":{"supernatural":"力量体系","society":"社会结构","sexualNorms":"性观念"},"mainCharacters":[{"name":"名","gender":"female|male","role":"身份","traits":["标签"],"fate":"结局","firstSeen":"出场时机","actions":["关键行动"]}],"keyEvents":[{"time":"时间点","event":"事件描述"}],"locations":[{"name":"地点","description":"描述+何时出现"}]}`;
    try {
      const raw = await chatCompletionSync(cfg, [
        { role: 'system', content: '你是世界观合成引擎。只返回JSON。' },
        { role: 'user', content: synPrompt },
      ], { maxTokens: 4096, temperature: 0.2 });
      const card = buildWorldCard(raw, text);
      setWorldCard(card);
      // 保存到世界库
      useWorldStore.getState().addWorld(card);
      setParsingStatus('');
      setStep('config');
    } catch (e: any) {
      setParsingStatus('');
      setToast({msg: '合成失败: ' + (e.message || ''), type: 'error'});
      setStep('upload');
    }
  };

  const buildWorldCard = (aiResponse: string, _fullText: string): FanficWorldCard => {
    let parsed: any = {};
    // 尝试提取 JSON
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* 解析失败用默认 */ }

    const worldType = (parsed.worldType || 'modern') as WorldType;
    const chars: Character[] = (parsed.mainCharacters || []).map((c: any, i: number) => ({
      id: `fanfic_char_${i}`,
      name: c.name || '未知角色',
      worldId: 'world_fanfic',
      gender: c.gender || 'female',
      age: '未知',
      appearance: { height: '', bodyType: '', bust: '', waist: '', hips: '', skinTone: '', hairStyle: '', facialFeatures: c.description || '', intimateDetails: '' },
      personality: { traits: c.traits || ['神秘'], speakingStyle: '', habits: [], likes: [], dislikes: [] },
      sexualProfile: { libido: 5, experience: 3, dominance: 5, kinks: [], softLimits: [], hardLimits: [], sensitiveZones: [], sexualResponse: '' },
      relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: c.role || '原著角色' },
      backstory: `${c.firstSeen || '未知'}。${(c.actions || []).join('；')}。结局：${c.fate || '未知'}`,
      worldContext: { type: 'fanfic', sourceNovel: fileName, originalRole: c.role || '', originalFate: c.fate || '' },
      autonomy: { goals: [], schedule: '', agency: 5 },
      memories: [], exampleDialogues: [],
      currentContext: { location: '未知', timeOfDay: '未知', mood: '', outfit: '', recentEvents: '' },
      isPreset: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }));

    // 处理新格式的事件（对象数组）
    const events: string[] = (parsed.keyEvents || []).map((e: any) =>
      typeof e === 'string' ? e : `${e.time || ''}: ${e.event || ''}`
    );
    const timeline: TimelineEvent[] = events.map((e: string, i: number) => ({
      id: `tl_${i}`,
      description: e,
      inevitability: 0.5,
      causes: [],
      convergencePaths: [],
      originalOutcome: e,
      status: 'pending' as const,
    }));

    return {
      id: 'fanfic_' + Date.now(),
      novelTitle: fileName.replace(/\.\w+$/, ''),
      worldType,
      rules: {
        physics: '基于原著',
        supernatural: parsed.rules?.supernatural || '基于原著',
        technology: '基于原著',
        society: parsed.rules?.society || '基于原著',
        morality: '基于原著',
        sexualNorms: parsed.rules?.sexualNorms || '基于原著',
      },
      locations: (parsed.locations || []).map((l: string) => ({ name: l, description: '' })),
      factions: [],
      timeline,
      characters: chars,
      totalChapters: 1,
      parsedAt: new Date().toISOString(),
    };
  };

  const startGame = () => {
    if (!worldCard) return;

    const world: World = {
      id: 'world_fanfic_' + Date.now(),
      name: worldCard.novelTitle,
      type: worldCard.worldType,
      rules: worldCard.rules,
      locations: worldCard.locations,
      factions: worldCard.factions,
      timeline: worldCard.timeline.map((e, i) => ({ ...e, id: 'tl_' + i, status: 'pending' as const })),
      inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '个人选择产生涟漪', major: '重大干预改变剧情走向' },
    };

    // 创建玩家穿越后的"角色"
    const matchedChar = targetCharId
      ? worldCard.characters.find(c => c.name === targetCharId || c.id === targetCharId)
      : null;
    const playerChar: Character = {
      id: 'char_player_fanfic',
      name: transType === 'soul' ? (matchedChar?.name || targetCharId || '穿越者') : '穿越者',
      worldId: world.id,
      gender: 'male',
      age: '未知',
      appearance: { height: '', bodyType: '', bust: '', waist: '', hips: '', skinTone: '', hairStyle: '', facialFeatures: playerDesc || '穿越者', intimateDetails: '' },
      personality: { traits: ['穿越者'], speakingStyle: '', habits: [], likes: [], dislikes: [] },
      sexualProfile: { libido: 5, experience: 3, dominance: 5, kinks: [], softLimits: [], hardLimits: [], sensitiveZones: [], sexualResponse: '' },
      relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: '刚刚穿越到这个世界' },
      backstory: `从现实世界穿越到《${worldCard.novelTitle}》的世界`,
      worldContext: { type: 'fanfic', sourceNovel: worldCard.novelTitle, originalRole: targetCharId || '外来者', originalFate: '未知' },
      autonomy: { goals: [], schedule: '', agency: 5 },
      memories: [],
      exampleDialogues: [],
      currentContext: { location: entryLocation || '未知', timeOfDay: '未知', mood: '困惑而好奇', outfit: '', recentEvents: '穿越刚刚发生' },
      isPreset: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const transmigration: TransmigrationConfig = {
      type: transType,
      targetCharacterId: targetCharId || undefined,
      originalSoulStatus: soulStatus,
      entryTimepoint: timePoint || '故事开始',
      entryLocation: entryLocation || '未知',
      playerAppearance: playerDesc || undefined,
      playerAbilities: { modernKnowledge: true, plotKnowledge, noSpecialAbility: false },
      worldParams: { inertia: 0.7, butterflySensitivity: 0.5, characterAwareness: transType === 'soul' ? 'treatAsOriginal' : 'knowIsTransmigrator' },
    };

    onStart(world, playerChar, transmigration);
  };

  return (
    <View style={st.container}>
      <Toast visible={toast.msg!==''} message={toast.msg} type={toast.type} onHide={()=>setToast({msg:'',type:'success'})} />
      <View style={st.header}>
        <TouchableOpacity onPress={onBack}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={st.title}>同人穿越</Text>
        <Text style={st.sub}>上传小说，魂穿到故事中</Text>
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* 步骤1：上传 */}
        {step === 'upload' && (
          <>
            <Text style={st.stepNum}>STEP 1</Text>
            <Text style={st.stepTitle}>选择小说文件</Text>
            <TouchableOpacity style={st.uploadBtn} onPress={pickFile}>
              <Text style={{ fontSize: 36 }}>📄</Text>
              <Text style={st.uploadText}>点击选择文件</Text>
              <Text style={st.uploadSub}>支持 TXT 格式</Text>
            </TouchableOpacity>

            {savedWorlds.length > 0 && (
              <>
                <Text style={[st.sectionTitle, { marginTop: 20 }]}>已分析的同人世界</Text>
                {savedWorlds.map(w => (
                  <TouchableOpacity key={w.id} style={[st.btn, { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, marginBottom: 8, width: '100%' }]} 
                    onPress={() => { setWorldCard(w); setStep('config'); }}
                    onLongPress={() => Alert.alert('删除', `删除《${w.novelTitle}》？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { useWorldStore.getState().removeWorld(w.id); setSavedWorlds(prev => prev.filter(x => x.id !== w.id)); } }]))}>
                    <Text style={{ color: isDark ? '#ddd' : '#333', fontSize: 14, flex: 1 }}>📖 {w.novelTitle}</Text>
                    <Text style={{ color: '#888', fontSize: 11 }}>{w.characters?.length || 0}角色</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {/* 步骤2：AI 解析中 */}
        {step === 'parsing' && (
          <>
            <Text style={st.stepNum}>STEP 2</Text>
            <Text style={st.stepTitle}>AI 正在解析</Text>
            <Text style={st.fileName}>{fileName}</Text>
            <View style={st.parsingBox}>
              <ActivityIndicator size="large" color="#e91e63" />
              <Text style={st.parsingText}>{parsingStatus}</Text>
            </View>
          </>
        )}

        {/* 步骤3：穿越配置 */}
        {step === 'config' && worldCard && (
          <>
            <Text style={st.stepNum}>STEP 3</Text>
            <Text style={st.stepTitle}>配置穿越</Text>

            <Text style={st.sectionTitle}>解析结果</Text>
            <Text style={st.label}>书名</Text>
            <Text style={st.val}>{worldCard.novelTitle}</Text>
            <Text style={st.label}>世界观类型</Text>
            <Text style={st.val}>{worldCard.worldType}</Text>
            <Text style={st.label}>世界观规则</Text>
            <Text style={st.val}>{worldCard.rules.supernatural}</Text>
            <Text style={st.val}>{worldCard.rules.society}</Text>

            <Text style={st.sectionTitle}>穿越方式</Text>
            <View style={st.row}>
              {[
                { k: 'soul', v: '魂穿（占据角色身体）' },
                { k: 'body', v: '身穿（本体降临）' },
              ].map(o => (
                <TouchableOpacity key={o.k} style={[st.btn, transType === o.k && st.btnActive]} onPress={() => setTransType(o.k as any)}>
                  <Text style={[st.btnText, transType === o.k && st.btnTextActive]}>{o.v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {transType === 'soul' && (
              <>
                <Text style={st.label}>原主意识</Text>
                <View style={st.row}>
                  {[
                    { k: 'gone', v: '完全消失' },
                    { k: 'dormant', v: '沉睡（可能苏醒）' },
                    { k: 'coexisting', v: '共存' },
                  ].map(o => (
                    <TouchableOpacity key={o.k} style={[st.btn, soulStatus === o.k && st.btnActive]} onPress={() => setSoulStatus(o.k as any)}>
                      <Text style={[st.btnText, soulStatus === o.k && st.btnTextActive]}>{o.v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={st.input} placeholder="占据哪个角色？（填角色名）" placeholderTextColor="#666" value={targetCharId} onChangeText={setTargetCharId} />
              </>
            )}

            {transType === 'body' && (
              <>
                <TextInput style={st.input} placeholder="穿越到哪个地点？" placeholderTextColor="#666" value={entryLocation} onChangeText={setEntryLocation} />
                <TextInput style={st.input} placeholder="你的外貌描述（可选）" placeholderTextColor="#666" value={playerDesc} onChangeText={setPlayerDesc} />
              </>
            )}

            <TextInput style={st.input} placeholder="穿越时间点（如：故事开始/第三章/结局后）" placeholderTextColor="#666" value={timePoint} onChangeText={setTimePoint} />

            <View style={[st.row, { marginTop: 8 }]}>
              <TouchableOpacity style={[st.btn, plotKnowledge && st.btnActive]} onPress={() => setPlotKnowledge(!plotKnowledge)}>
                <Text style={[st.btnText, plotKnowledge && st.btnTextActive]}>{plotKnowledge ? '✓ 知晓原著剧情' : '不知晓原著剧情'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={st.startBtn} onPress={startGame}>
              <Text style={st.startBtnText}>开始穿越</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}


