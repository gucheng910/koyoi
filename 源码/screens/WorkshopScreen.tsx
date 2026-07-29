// ============================================================
//  场景工坊 - 自定义场景参数后进入对话
// ============================================================
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { Character, WorldType } from '../types';
import { SAFE_TOP } from '../theme/safeArea';

interface Props { character: Character; isDark: boolean; onStart: (c: Character) => void; onBack: () => void; }

const SCENE_TEMPLATES: { label: string; location: string; time: string; mood: string }[] = [
  { label: '办公室加班', location: '深夜的办公室', time: '晚上十点', mood: '疲惫但不太想回家' },
  { label: '温泉旅行', location: '温泉旅馆的私汤', time: '午夜', mood: '被热气蒸得有些晕眩，浴衣松散' },
  { label: '酒后', location: '居酒屋的包间', time: '深夜', mood: '微醺，话比平时多，防线在下降' },
  { label: '雨天', location: '你的公寓', time: '暴雨的午后', mood: '被雨淋湿了，有点冷，不想回去' },
  { label: '清晨', location: '卧室', time: '天刚亮', mood: '半梦半醒，不想起床，想再赖一会儿' },
  { label: '出差', location: '陌生城市的酒店房间', time: '深夜', mood: '出差最后一晚，明天就要回去了' },
];

export default function WorkshopScreen({ character, isDark, onStart, onBack }: Props) {
  const [loc, setLoc] = useState(character.currentContext.location);
  const [time, setTime] = useState(character.currentContext.timeOfDay);
  const [mood, setMood] = useState(character.currentContext.mood);
  const [outfit, setOutfit] = useState(character.currentContext.outfit);
  const [specialRule, setSpecialRule] = useState('');

  const S = styles(isDark, SAFE_TOP);

  const applyTemplate = (tpl: typeof SCENE_TEMPLATES[0]) => {
    setLoc(tpl.location); setTime(tpl.time); setMood(tpl.mood);
  };

  const start = () => {
    const modified: Character = {
      ...character,
      currentContext: {
        ...character.currentContext,
        location: loc, timeOfDay: time, mood,
        outfit: outfit || character.currentContext.outfit,
        recentEvents: specialRule || character.currentContext.recentEvents,
      },
    };
    onStart(modified);
  };

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={S.title}>场景工坊</Text>
        <Text style={S.sub}>自定义{character.name}的当前场景</Text>
      </View>

      <ScrollView contentContainerStyle={S.content}>
        <Text style={S.sectionTitle}>快速模板</Text>
        <View style={S.templateRow}>
          {SCENE_TEMPLATES.map(tpl => (
            <TouchableOpacity key={tpl.label} style={S.templateBtn} onPress={() => applyTemplate(tpl)}>
              <Text style={S.templateText}>{tpl.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={S.sectionTitle}>场景细节</Text>
        <Text style={S.label}>地点</Text>
        <TextInput style={S.input} value={loc} onChangeText={setLoc} placeholder="在哪里？" placeholderTextColor="#666" />
        <Text style={S.label}>时间</Text>
        <TextInput style={S.input} value={time} onChangeText={setTime} placeholder="什么时间？" placeholderTextColor="#666" />
        <Text style={S.label}>她的心情</Text>
        <TextInput style={S.input} value={mood} onChangeText={setMood} placeholder="她此刻的心情" placeholderTextColor="#666" />
        <Text style={S.label}>穿着</Text>
        <TextInput style={S.input} value={outfit} onChangeText={setOutfit} placeholder="她穿着什么？" placeholderTextColor="#666" />
        <Text style={S.label}>特殊设定（可选）</Text>
        <TextInput style={[S.input, S.multi]} value={specialRule} onChangeText={setSpecialRule} placeholder="比如：她喝醉了 / 你们刚吵完架 / 今天是她的生日..." placeholderTextColor="#666" multiline />

        <TouchableOpacity style={S.startBtn} onPress={start}>
          <Text style={S.startBtnText}>进入场景</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function styles(dark: boolean, safeTop?: number) {
  const SAFE_TOP = safeTop ?? 56;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: dark ? '#0d0d0d' : '#fafafa' },
    header: { paddingHorizontal: 20, paddingTop: SAFE_TOP, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: dark ? '#1a1a1a' : '#e8e8e8' },
    backBtn: { color: '#e91e63', fontSize: 15, marginBottom: 12 },
    title: { fontSize: 26, fontWeight: '700', color: dark ? '#f5f5f5' : '#1a1a1a' },
    sub: { fontSize: 13, color: dark ? '#888' : '#999', marginTop: 4 },
    content: { padding: 20 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e91e63', marginTop: 20, marginBottom: 10 },
    templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    templateBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: dark ? '#1a1020' : '#f3e5f5', borderWidth: 1, borderColor: dark ? '#3a1a3a' : '#e1bee7' },
    templateText: { fontSize: 13, color: dark ? '#ce93d8' : '#8e24aa' },
    label: { fontSize: 14, color: dark ? '#aaa' : '#666', marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: dark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: dark ? '#333' : '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: dark ? '#f5f5f5' : '#1a1a1a', fontSize: 15 },
    multi: { minHeight: 80, textAlignVertical: 'top' },
    startBtn: { marginTop: 24, backgroundColor: '#e91e63', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
