// ============================================================
//  大世界设置 - 选择世界观+角色，AI构建世界
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import FadeIn from '../components/FadeIn';
import { useConfigStore } from '../store/configStore';
import { usePersonaStore } from '../store/personaStore';
import { safeParseJSON } from '../services/utils';
import { chatCompletionSync } from '../api/deepseek';
import {
  getPresetCharacters, getPresetWorld,
  modernWorld, cultivationWorld, historicalWorld, campusWorld, wuxiaWorld, urbanWorld, interstellarWorld, gameWorld, supernaturalWorld, alternateHistoryWorld,
} from '../prompts/characters/presets';
import type { Character, World, WorldNpc, WorldSession } from '../types';
import Toast from '../components/Toast';
import { useWorldStore } from '../store/worldStore';
import { SAFE_TOP } from '../theme/safeArea';


interface Props { isDark: boolean; onStart: (session: WorldSession) => void; onBack: () => void; }

const AVAILABLE_WORLDS = [modernWorld, cultivationWorld, historicalWorld, campusWorld, wuxiaWorld, urbanWorld, interstellarWorld, gameWorld, supernaturalWorld, alternateHistoryWorld];

function getAvailableWorlds(): World[] {
  const customWorlds = useWorldStore.getState().getCustomWorlds();
  return [...AVAILABLE_WORLDS, ...customWorlds];
}

export default function WorldSetupScreen({ isDark, onStart, onBack }: Props) {
      const [step, setStep] = useState<'select' | 'build' | 'ready'>('select');
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}>({msg:'',type:'success'});
  const [selectedWorld, setSelectedWorld] = useState<World>(getAvailableWorlds()[0]);
  const [selectedChars, setSelectedChars] = useState<Character[]>([]);
  const [worldChars, setWorldChars] = useState<Character[]>([]);
  const [npcs, setNpcs] = useState<WorldNpc[]>([]);
  const [initialScene, setInitialScene] = useState('');
  const [customRule, setCustomRule] = useState('');
  const [building, setBuilding] = useState(false);
  const [worldsLoaded, setWorldsLoaded] = useState(false);
  const S = styles(isDark, SAFE_TOP);

  useEffect(() => { useWorldStore.getState().load().then(() => setWorldsLoaded(true)); }, []);
  useEffect(() => {
    const all = getPresetCharacters();
    setWorldChars(all.filter(c => c.worldId === selectedWorld.id));
    setSelectedChars([]);
  }, [selectedWorld]);

  const toggleChar = (c: Character) => {
    setSelectedChars(prev =>
      prev.find(x => x.id === c.id)
        ? prev.filter(x => x.id !== c.id)
        : [...prev, c]
    );
  };

  const buildWorld = async () => {
    const cfg = useConfigStore.getState().getActiveConfig();
    if (!cfg?.apiKey) { setToast({msg:'请先配置API Key', type:'error'}); return; }
    setStep('build');
    setBuilding(true);

    const personaGender = usePersonaStore.getState().gender;
    const personaDesc = `性别：${personaGender === 'female' ? '女' : '男'}。${personaGender === 'female' ? '玩家是女性，请用她、女性称谓。不要当成男性。' : ''}`

    const charList = selectedChars.length > 0
      ? selectedChars.map(c => `${c.name}(${c.personality.traits.join('/')})`).join('；')
      : '（无预设角色，请AI自由创造NPC）';

    const prompt = [
      { role: 'system' as const, content: `你是世界构建引擎。为玩家创建完整世界和开场场景。

你需要先构建世界观（供内部使用），再写一个让人想继续探索的开场。

1. worldBible（世界圣经，300-500字，供后续对话参考）：
   - 时代背景、社会等级、权力矛盾
   - 性别观念与权力结构
   - 最近发生的大事或暗流
   - 普通人的日常生活

2. scene（开场，200-400字）：
   这是玩家看到的第一段文字。必须写成小说开场，不是说明书。
   - 从一个具体瞬间开始：一个动作、一个感官细节、一段对话。不要"你是xxx"起头。
   - 玩家的身份和处境通过场景自然透露：她递来竹简时说"师弟，该去拜见师尊了"（你从这句话知道自己是个刚入门的师弟）。
   - 环境通过身体感受传递：石阶的凉意透过鞋底，香炉的青烟呛得你眯眼，远处钟声在山谷里荡开。
   - 至少一个角色在场景中做自己的事（不是在等你），让你感觉世界本来就活着。
   - 结尾留一个让人想回复的钩子：不是"你想做什么"而是"她回头看了你一眼，似乎在等你的回答。"
   - 用第二人称"你"。角色说话用【角色名】，叙述用【旁白】。

3. worldState：一句话概括局势

4. npcs(2-4个)：[{name,role,personality,currentStatus,goal}]

5. factions(如有)：[{name,description,goal,attitude}]

返回JSON：{"worldBible":"...","scene":"...","worldState":"...","npcs":[...],"factions":[...]}` },
      { role: 'user' as const, content: [
        `世界：${selectedWorld.name}(${selectedWorld.type})`,
        `规则：${selectedWorld?.rules?.supernatural || ""}`,
        `社会：${selectedWorld?.rules?.society || ""}`,
        `观念：${selectedWorld?.rules?.sexualNorms || ""}`,
        `已选角色：${charList}`,
        `玩家画像：${personaDesc}`,
        `自定义：${customRule || '请根据以上信息自由构建'}`,
        `请先构建完整的世界圣经，再写开场序幕。`,
      ].join('\n') },
    ];

    try {
      const raw = await chatCompletionSync(cfg, prompt, { maxTokens: 4000, temperature: 0.8 });
      const data = safeParseJSON(raw) || {};

      const worldBible = data.worldBible || '';
      const scene = data.scene || `你来到了${selectedWorld.name}。`;
      const worldState = data.worldState || '';
      const npcs = data.npcs || [{ name: '路人', role: '路人', personality: '普通', currentStatus: '路过' }];

      setInitialScene(scene);
      setNpcs(npcs);

      const session: WorldSession = {
        id: 'world_' + Date.now(),
        world: selectedWorld,
        selectedCharacters: selectedChars,
        npcs: (data.npcs || []).filter((n: any) => !selectedChars.some(c => c.name === n.name)),
        currentScene: data.scene || '',
        worldState: worldState,
        worldBible: worldBible,
        butterflyLog: [],
        timelineDeviations: [],
        recentWorldEvents: [],
        worldLog: [],
        messages: [{
          role: 'assistant', content: data.scene || `欢迎来到${selectedWorld.name}`,
          timestamp: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
      };

      setBuilding(false);
      onStart(session);
    } catch (e: any) {
      setBuilding(false);
      setStep('select');
      setToast({msg: '构建失败: ' + (e.message || '未知错误'), type: 'error'});
    }
  };

  return (
    <FadeIn style={{ flex: 1 }}><View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={S.title}>大世界</Text>
        <Text style={S.sub}>选择一个世界，然后进入</Text>
      </View>

      <ScrollView contentContainerStyle={S.content}>
        <Toast visible={toast.msg!==''} message={toast.msg} type={toast.type} onHide={()=>setToast({msg:'',type:'success'})} />
        {/* 选世界观 */}
        <Text style={S.sectionTitle}>选择世界观</Text>
        <View style={S.worldRow}>
          {getAvailableWorlds().map(w => (
            <TouchableOpacity key={w.id} style={[S.worldBtn, selectedWorld.id === w.id && S.worldBtnActive]} onPress={() => setSelectedWorld(w)}>
              <Text style={[S.worldBtnText, selectedWorld.id === w.id && S.worldBtnTextActive]}>{w.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 选角色（可多选） */}
        <Text style={S.sectionTitle}>选择角色（可多选，也可不选让AI自由生成）</Text>
        {worldChars.map(c => (
          <TouchableOpacity key={c.id} style={[S.charRow, selectedChars.find(x => x.id === c.id) && S.charRowActive]} onPress={() => toggleChar(c)}>
            <View style={[S.checkbox, selectedChars.find(x => x.id === c.id) && S.checkboxActive]}>
              {selectedChars.find(x => x.id === c.id) && <Text style={S.checkmark}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.charName}>{c.name}</Text>
              <Text style={S.charMeta}>{c.personality.traits.slice(0, 3).join(' · ')}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* 自定义设定 */}
        <Text style={S.sectionTitle}>自定义设定（可选）</Text>
        <TextInput style={S.input} value={customRule} onChangeText={setCustomRule} placeholder="比如：故事发生在宗门大比前三天 / 你是新入门的弟子..." placeholderTextColor="#666" multiline />

        {/* 开始按钮 */}
        <TouchableOpacity style={S.startBtn} onPress={buildWorld} disabled={building}>
          {building ? <ActivityIndicator color="#fff" /> : <Text style={S.startBtnText}>AI 构建世界并进入</Text>}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
    </FadeIn>
  );
}

function styles(dark: boolean, safeTop?: number) {
  const top = safeTop ?? 48;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
    header: { paddingHorizontal: 20, paddingTop: top, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: dark ? '#1A1814' : '#ddd' },
    backBtn: { color: '#5B9BD5', fontSize: 15, marginBottom: 12 },
    title: { fontSize: 26, fontWeight: '700', color: dark ? '#E8F0F8' : '#1A1814' },
    sub: { fontSize: 13, color: dark ? '#888' : '#888', marginTop: 4 },
    content: { padding: 20 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#5B9BD5', marginTop: 20, marginBottom: 10 },
    worldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    worldBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: dark ? '#1A1814' : '#E8F0F8', borderWidth: 1, borderColor: dark ? '#333' : '#ddd' },
    worldBtnActive: { backgroundColor: dark ? '#1A2430' : '#E8F0F8', borderColor: '#5B9BD5' },
    worldBtnText: { fontSize: 15, color: dark ? '#888' : '#888' },
    worldBtnTextActive: { color: '#5B9BD5', fontWeight: '600' },
    charRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: dark ? '#1A1814' : '#E8F0F8', marginBottom: 6, borderWidth: 1, borderColor: dark ? '#333' : '#e8e8e8' },
    charRowActive: { borderColor: '#5B9BD5', backgroundColor: dark ? '#1A2430' : '#E8F0F8' },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: dark ? '#555' : '#aaa', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
    checkboxActive: { backgroundColor: '#5B9BD5', borderColor: '#5B9BD5' },
    checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
    charName: { fontSize: 15, fontWeight: '600', color: dark ? '#E8F0F8' : '#1A1814' },
    charMeta: { fontSize: 12, color: dark ? '#888' : '#888', marginTop: 2 },
    input: { backgroundColor: dark ? '#1A1814' : '#fff', borderWidth: 1, borderColor: dark ? '#333' : '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: dark ? '#E8F0F8' : '#1A1814', fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
    startBtn: { marginTop: 24, backgroundColor: '#5B9BD5', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}

