// ============================================================
//  角色创建工坊
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useCharacterStore } from '../store/characterStore';
import { useWorldStore } from '../store/worldStore';
import type { Character, WorldType, World } from '../types';

interface Props {
  isDark: boolean;
  onCreated?: () => void;
}

function S(dark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
    header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
    title: { fontSize: 26, fontWeight: '700', color: dark ? '#E8DCC8' : '#1A1814' },
    sub: { fontSize: 13, color: dark ? '#8A8070' : '#8A8070', marginTop: 4, marginBottom: 20 },
    tabBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16, backgroundColor: dark ? '#252525' : '#E8F0F8' },
    tabBtnActive: { backgroundColor: '#5B9BD5' },
    tabBtnText: { fontSize: 15, color: dark ? '#8A8070' : '#8A8070', fontWeight: '500' },
    tabBtnTextActive: { color: '#fff' },
    chipBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: dark ? '#252525' : '#f0f0f0', borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },
    chipBtnActive: { backgroundColor: dark ? '#1A2430' : '#E8F0F8', borderColor: '#5B9BD5' },
    chipBtnText: { fontSize: 12, color: dark ? '#B8B0A4' : '#8A8070' },
    chipBtnTextActive: { color: '#5B9BD5', fontWeight: '600' },
    section: { marginBottom: 24, paddingHorizontal: 20 },
    label: { fontSize: 14, fontWeight: '600', color: dark ? '#B8B0A4' : '#5A5450', marginBottom: 8 },
    input: {
      backgroundColor: dark ? '#1A1814' : '#fff', borderWidth: 1, borderColor: dark ? '#333' : '#ddd',
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: dark ? '#E8DCC8' : '#1A1814', fontSize: 15, marginBottom: 10,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    tag: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
      backgroundColor: dark ? '#1A1814' : '#f0f0f0',
      borderWidth: 1, borderColor: dark ? '#333' : '#ddd',
    },
    tagActive: { backgroundColor: dark ? '#1A2430' : '#E8F0F8', borderColor: '#5B9BD5' },
    tagText: { fontSize: 13, color: dark ? '#8A8070' : '#8A8070' },
    tagTextActive: { color: '#5B9BD5' },
    worldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    worldBtn: {
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
      backgroundColor: dark ? '#1A1814' : '#f0f0f0',
      borderWidth: 1, borderColor: dark ? '#333' : '#ddd',
    },
    worldBtnActive: { backgroundColor: dark ? '#1A2430' : '#E8F0F8', borderColor: '#5B9BD5' },
    worldBtnText: { fontSize: 14, color: dark ? '#8A8070' : '#8A8070' },
    worldBtnTextActive: { color: '#5B9BD5' },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sliderVal: { fontSize: 13, color: '#5B9BD5', fontWeight: '600', width: 30, textAlign: 'center' },
    sliderBtn: {
      width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: dark ? '#1A1814' : '#f0f0f0', borderWidth: 1, borderColor: dark ? '#333' : '#ddd',
    },
    sliderBtnText: { fontSize: 16, color: dark ? '#B8B0A4' : '#8A8070' },
    createBtn: {
      marginHorizontal: 20, marginVertical: 30, paddingVertical: 16, borderRadius: 14,
      backgroundColor: '#5B9BD5', alignItems: 'center',
    },
    createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    divider: { height: 1, backgroundColor: dark ? '#1A1814' : '#eee', marginVertical: 8, marginHorizontal: 20 },
  });
}

const WORLDS: { key: WorldType; label: string }[] = [
  { key: 'modern', label: '现代都市' },
  { key: 'cultivation', label: '修仙' },
  { key: 'historical', label: '古风' },
  { key: 'campus', label: '校园' },
  { key: 'fantasy', label: '奇幻' },
  { key: 'cyberpunk', label: '赛博' },
  { key: 'custom', label: '自定义' },
];

const TRAITS_POOL = ['傲娇', '温柔', '冷酷', '热情', '腹黑', '纯真', '成熟', '活泼', '忧郁', '强势', '柔弱', '毒舌', '天然呆', '痴女', '禁欲', '放荡', '忠犬', '女王', '病娇', '小恶魔'];

const KINKS_POOL = ['温柔', '霸道', '占有', '服从', '禁欲', '放纵', '支配', '被支配', '角色扮演', '束缚', '言语刺激', '若即若离', '膝枕', '亲密接触', '默默守护', '若隐若现', '强势', '依恋', '试探', '对比'];

export default function CreateScreen({ isDark, onCreated }: Props) {
  const st = S(isDark);
  const { addCharacter } = useCharacterStore();
  const [mode, setMode] = useState<'character' | 'world'>('character');

  // 世界创建 state
  const [worldName, setWorldName] = useState('');
  const [worldTypeCreate, setWorldTypeCreate] = useState<WorldType>('modern');
  const [worldSupernatural, setWorldSupernatural] = useState('');
  const [worldSociety, setWorldSociety] = useState('');
  const [worldSexualNorms, setWorldSexualNorms] = useState('');

  // 角色创建 state
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [age, setAge] = useState('');
  const [worldType, setWorldType] = useState<WorldType>('modern');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [height, setHeight] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [bust, setBust] = useState('');
  const [appearance, setAppearance] = useState('');
  const [intimateDetails, setIntimateDetails] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState('');
  const [likes, setLikes] = useState('');
  const [dislikes, setDislikes] = useState('');
  const [libido, setLibido] = useState(5);
  const [experience, setExperience] = useState(3);
  const [dominance, setDominance] = useState(3);
  const [kinks, setKinks] = useState<string[]>([]);
  const [softLimits, setSoftLimits] = useState('');
  const [hardLimits, setHardLimits] = useState('');
  const [zones, setZones] = useState('');
  const [response, setResponse] = useState('');
  const [backstory, setBackstory] = useState('');
  const [location, setLocation] = useState('');
  const [mood, setMood] = useState('');
  const [outfit, setOutfit] = useState('');

  const toggleTrait = (t: string) => {
    setTraits(prev => prev.includes(t) ? prev.filter(x => x !== t) : prev.length < 5 ? [...prev, t] : prev);
  };

  const toggleKink = (k: string) => {
    setKinks(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  const slider = (val: number, set: (v: number) => void) => (
    <View style={st.sliderRow}>
      <TouchableOpacity style={st.sliderBtn} onPress={() => set(Math.max(0, val - 1))}><Text style={st.sliderBtnText}>−</Text></TouchableOpacity>
      <Text style={st.sliderVal}>{val}</Text>
      <TouchableOpacity style={st.sliderBtn} onPress={() => set(Math.min(10, val + 1))}><Text style={st.sliderBtnText}>+</Text></TouchableOpacity>
    </View>
  );

  const handleCreate = async () => {
    if (!name.trim()) { setErrorMsg('请至少填写角色名'); return; }

    const newChar: Character = {
      id: 'custom_' + Date.now(),
      name: name.trim(),
      worldId: 'world_' + worldType,
      gender, age: age || '未知',
      appearance: {
        height: height || '未设定', bodyType: bodyType || '未设定',
        bust: bust || '未设定', waist: '未设定', hips: '未设定',
        skinTone: '未设定', hairStyle: '未设定', facialFeatures: appearance || '未设定',
        intimateDetails: intimateDetails || '未设定',
      },
      personality: {
        traits: traits.length ? traits : ['神秘'],
        speakingStyle: speaking || '未设定', habits: [], likes: likes ? likes.split(',') : [],
        dislikes: dislikes ? dislikes.split(',') : [],
      },
      sexualProfile: {
        libido, experience, dominance,
        kinks: kinks.length ? kinks : ['待探索'],
        softLimits: softLimits ? softLimits.split(',') : [],
        hardLimits: hardLimits ? hardLimits.split(',') : [],
        sensitiveZones: zones ? zones.split(',') : [],
        sexualResponse: response || '未设定',
      },
      relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: '初次见面' },
      backstory: backstory || '未设定',
      worldContext: buildWorldContext(worldType),
      autonomy: { goals: [], schedule: '', agency: 5 },
      memories: [],
      exampleDialogues: [],
      currentContext: {
        location: location || '未知', timeOfDay: '未知',
        mood: mood || '平静', outfit: outfit || '未设定', recentEvents: '故事即将开始',
      },
      isPreset: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await addCharacter(newChar);
    onCreated?.();
  };

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={st.header}>
          <Text style={st.title}>创建</Text>
          <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
            <TouchableOpacity style={[st.tabBtn, mode === 'character' && st.tabBtnActive]} onPress={() => setMode('character')}>
              <Text style={[st.tabBtnText, mode === 'character' && st.tabBtnTextActive]}>角色</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.tabBtn, mode === 'world' && st.tabBtnActive]} onPress={() => setMode('world')}>
              <Text style={[st.tabBtnText, mode === 'world' && st.tabBtnTextActive]}>世界</Text>
            </TouchableOpacity>
          </View>
        </View>

        {mode === 'character' && (<>
        {/* 基础 */}
        <Text style={[st.label, { paddingHorizontal: 20 }]}>基础信息</Text>
        <View style={st.section}>
          <TextInput style={st.input} placeholder="角色名（必填）" placeholderTextColor="#666" value={name} onChangeText={setName} />
          <View style={st.row}>
            <TextInput style={[st.input, { flex: 2 }]} placeholder="年龄" placeholderTextColor="#666" value={age} onChangeText={setAge} />
            <TextInput style={[st.input, { flex: 2 }]} placeholder="身高" placeholderTextColor="#666" value={height} onChangeText={setHeight} />
          </View>
          <View style={st.row}>
            {['female', 'male'].map(g => (
              <TouchableOpacity key={g} style={[st.tag, gender === g && st.tagActive]} onPress={() => setGender(g as any)}>
                <Text style={[st.tagText, gender === g && st.tagTextActive]}>{g === 'female' ? '♀ 女' : '♂ 男'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 世界观 */}
        <Text style={[st.label, { paddingHorizontal: 20 }]}>世界观</Text>
        <View style={st.section}>
          <View style={st.worldRow}>
            {WORLDS.map(w => (
              <TouchableOpacity key={w.key} style={[st.worldBtn, worldType === w.key && st.worldBtnActive]} onPress={() => setWorldType(w.key)}>
                <Text style={[st.worldBtnText, worldType === w.key && st.worldBtnTextActive]}>{w.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={st.divider} />

        {/* 外貌 */}
        <Text style={[st.label, { paddingHorizontal: 20 }]}>外貌</Text>
        <View style={st.section}>
          <TextInput style={st.input} placeholder="体型描述" placeholderTextColor="#666" value={bodyType} onChangeText={setBodyType} />
          <TextInput style={st.input} placeholder="胸围/胸部描述" placeholderTextColor="#666" value={bust} onChangeText={setBust} />
          <TextInput style={st.input} placeholder="五官/面容" placeholderTextColor="#666" value={appearance} onChangeText={setAppearance} />
          <TextInput style={[st.input, st.inputMulti]} placeholder="私密部位描述（色情游戏的灵魂）" placeholderTextColor="#666" value={intimateDetails} onChangeText={setIntimateDetails} multiline />
        </View>

        <View style={st.divider} />

        {/* 性格 */}
        <Text style={[st.label, { paddingHorizontal: 20 }]}>性格塑造</Text>
        <View style={st.section}>
          <Text style={{ fontSize: 11, color: '#8A8070', marginBottom: 10, lineHeight: 16 }}>💡 不要只写标签，要写行动。不说"她很害羞"，要说"她悄悄抬眼，对上他的视线，又飞快移开，耳廓染上薄红"</Text>
          <Text style={[st.label, { fontSize: 13, marginTop: 8 }]}>性格标签（最多5个）</Text>
          <View style={st.row}>
            {TRAITS_POOL.map(t => (
              <TouchableOpacity key={t} style={[st.tag, traits.includes(t) && st.tagActive]} onPress={() => toggleTrait(t)}>
                <Text style={[st.tagText, traits.includes(t) && st.tagTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={st.input} placeholder="说话风格（例：语气冷淡但身体诚实...）" placeholderTextColor="#666" value={speaking} onChangeText={setSpeaking} />
          <TextInput style={st.input} placeholder="喜欢的事物（用逗号分隔）" placeholderTextColor="#666" value={likes} onChangeText={setLikes} />
          <TextInput style={st.input} placeholder="讨厌的事物" placeholderTextColor="#666" value={dislikes} onChangeText={setDislikes} />
        </View>

        <View style={st.divider} />

        {/* 偏好设定 */}
        <Text style={[st.label, { paddingHorizontal: 20 }]}>偏好设定</Text>
        <View style={st.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#8A8070', marginBottom: 6 }}>欲望</Text>
              {slider(libido, setLibido)}
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#8A8070', marginBottom: 6 }}>经验</Text>
              {slider(experience, setExperience)}
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#8A8070', marginBottom: 6 }}>主导</Text>
              {slider(dominance, setDominance)}
            </View>
          </View>

          <Text style={[st.label, { fontSize: 13, marginTop: 8 }]}>偏好标签</Text>
          <View style={st.row}>
            {KINKS_POOL.map(k => (
              <TouchableOpacity key={k} style={[st.tag, kinks.includes(k) && st.tagActive]} onPress={() => toggleKink(k)}>
                <Text style={[st.tagText, kinks.includes(k) && st.tagTextActive]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput style={st.input} placeholder="软限制（可以尝试但需引导）" placeholderTextColor="#666" value={softLimits} onChangeText={setSoftLimits} />
          <TextInput style={st.input} placeholder="硬限制（绝对不行）" placeholderTextColor="#666" value={hardLimits} onChangeText={setHardLimits} />
          <TextInput style={st.input} placeholder="敏感带（逗号分隔）" placeholderTextColor="#666" value={zones} onChangeText={setZones} />
          <TextInput style={[st.input, st.inputMulti]} placeholder="反应模式" placeholderTextColor="#666" value={response} onChangeText={setResponse} multiline />
        </View>

        <View style={st.divider} />

        {/* 背景 */}
        <Text style={[st.label, { paddingHorizontal: 20 }]}>背景与场景</Text>
        <View style={st.section}>
          <TextInput style={[st.input, st.inputMulti]} placeholder="角色背景故事" placeholderTextColor="#666" value={backstory} onChangeText={setBackstory} multiline />
          <TextInput style={st.input} placeholder="初次见面的地点" placeholderTextColor="#666" value={location} onChangeText={setLocation} />
          <TextInput style={st.input} placeholder="她此刻的心情" placeholderTextColor="#666" value={mood} onChangeText={setMood} />
          <TextInput style={st.input} placeholder="她的穿着" placeholderTextColor="#666" value={outfit} onChangeText={setOutfit} />
        </View>

        {errorMsg !== '' && <Text style={{ color: '#C44B4B', fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginTop: 10 }}>{errorMsg}</Text>}

        <TouchableOpacity style={st.createBtn} onPress={handleCreate}>
          <Text style={st.createBtnText}>创建角色</Text>
        </TouchableOpacity>
        </>
        )}

        {mode === 'world' && (<>
        <Text style={[st.label, { paddingHorizontal: 20 }]}>世界观信息</Text>
        <View style={st.section}>
          <TextInput style={st.input} placeholder="世界名称（必填）" placeholderTextColor="#666" value={worldName} onChangeText={setWorldName} />
          <View style={st.row}>
            {['cultivation','modern','fantasy','historical','campus'].map(k => (
              <TouchableOpacity key={k} style={[st.chipBtn, worldTypeCreate === k && st.chipBtnActive]} onPress={() => setWorldTypeCreate(k as WorldType)}>
                <Text style={[st.chipBtnText, worldTypeCreate === k && st.chipBtnTextActive]}>{({cultivation:'修仙',modern:'现代',fantasy:'奇幻',historical:'古风',campus:'校园'})[k]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[st.input, st.inputMulti]} placeholder="力量/超自然体系" placeholderTextColor="#666" value={worldSupernatural} onChangeText={setWorldSupernatural} multiline />
          <TextInput style={[st.input, st.inputMulti]} placeholder="社会结构/权力分布" placeholderTextColor="#666" value={worldSociety} onChangeText={setWorldSociety} multiline />
          <TextInput style={[st.input, st.inputMulti]} placeholder="性观念/性别关系" placeholderTextColor="#666" value={worldSexualNorms} onChangeText={setWorldSexualNorms} multiline />
        </View>

        <TouchableOpacity style={st.createBtn} onPress={async () => {
          if (!worldName.trim()) { setErrorMsg('请填写世界名称'); return; }
          const world: World = {
            id: 'custom_world_' + Date.now(),
            name: worldName.trim(),
            type: worldTypeCreate,
            rules: { physics: '', supernatural: worldSupernatural, technology: '', society: worldSociety, morality: '', sexualNorms: worldSexualNorms },
            locations: [], factions: [], timeline: [], inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
            butterflySensitivity: { minor: '', major: '' },
          };
          await useWorldStore.getState().addWorld(world);
          setWorldName(''); setWorldSupernatural(''); setWorldSociety(''); setWorldSexualNorms('');
          setErrorMsg('');
          onCreated?.();
        }}>
          <Text style={st.createBtnText}>创建世界</Text>
        </TouchableOpacity>
        </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildWorldContext(worldType: string): any {
  switch (worldType) {
    case 'modern': return { type: 'modern' as const, occupation: '', socialClass: '' };
    case 'cultivation': return { type: 'cultivation' as const, realm: '', sect: '', techniques: [] };
    case 'historical': return { type: 'historical' as const, dynasty: '', rank: '', family: '' };
    case 'campus': return { type: 'campus' as const, grade: '', club: '', socialCircle: '' };
    case 'fantasy': return { type: 'fantasy' as const, race: '', class: '', manaAffinity: '' };
    case 'cyberpunk': return { type: 'cyberpunk' as const, corp: '', implants: [], networth: '' };
    case 'apocalypse': return { type: 'apocalypse' as const, faction: '', role: '', mutations: '' };
    default: return { type: 'custom' as const, customFields: {} };
  }
}
