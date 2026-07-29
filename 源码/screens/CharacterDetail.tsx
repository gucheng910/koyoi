// ============================================================
//  角色详情 v2 — iOS 风格分组列表
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Share } from 'react-native';
import { showAlert } from '../components/AnimatedAlert';
import { useCharacterStore } from '../store/characterStore';
import { getPresetWorld } from '../prompts/characters/presets';
import type { Character } from '../types';
import { SAFE_TOP } from '../theme/safeArea';

interface Props { character: Character; onBack: () => void; onStart: (c: Character) => void; isDark: boolean; }

const colors = (d: boolean) => d
  ? { bg: '#0E0D0B', card: '#1C1912', sep: 'rgba(255,255,255,0.06)', text: '#E8DCC8', muted: '#8A8070', accent: '#5B9BD5', btn: '#25231F' }
  : { bg: '#F2F1F0', card: '#FFFFFF', sep: 'rgba(0,0,0,0.06)', text: '#1C1C1E', muted: '#8E8E93', accent: '#5B9BD5', btn: '#E0E0E0' };

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      {title && <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 20, marginBottom: 6, color: '#8E8E93' }}>{title}</Text>}
      <View style={{ marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Row({ label, value, last, dark }: { label: string; value: string; last?: boolean; dark: boolean }) {
  const c = colors(dark);
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingVertical: 13, paddingHorizontal: 16, backgroundColor: c.card }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.muted, width: 72 }}>{label}</Text>
        <Text style={{ fontSize: 14, color: c.text, flex: 1 }}>{value || '未设定'}</Text>
      </View>
      {!last && <View style={{ marginLeft: 16, height: StyleSheet.hairlineWidth, backgroundColor: c.sep }} />}
    </View>
  );
}

export default function CharacterDetail({ character, onBack, onStart, isDark }: Props) {
      const c = colors(isDark);
  const { deleteCharacter } = useCharacterStore();
  const world = getPresetWorld(character.worldId);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: SAFE_TOP, paddingBottom: 12, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={onBack}><Text style={{ fontSize: 15, color: c.accent }}>← 返回</Text></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: c.text }}>{character.name}</Text>
        <TouchableOpacity onPress={async () => { try { await Share.share({ message: JSON.stringify(character, null, 2), title: character.name + '.json' }); } catch {} }}><Text style={{ fontSize: 13, color: c.accent, marginRight: 12 }}>导出</Text></TouchableOpacity>
        {!character.isPreset && <TouchableOpacity onPress={() => showAlert('删除角色', `确定删除 ${character.name}？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => { await deleteCharacter(character.id); onBack(); } }])}><Text style={{ fontSize: 13, color: '#C44B4B' }}>删除</Text></TouchableOpacity>}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isDark ? '#1A2430' : '#E8F0F8', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 32, color: c.accent }}>{character.name[0]}</Text>
          </View>
        </View>

        <Section title="基础">
          <Row label="年龄" value={character.age} dark={isDark} />
          <Row label="世界" value={world?.name || '自定义'} dark={isDark} />
          <Row label="身高" value={character.appearance.height} dark={isDark} />
          <Row label="体型" value={character.appearance.bodyType} dark={isDark} />
          <Row label="面容" value={character.appearance.facialFeatures} dark={isDark} last />
        </Section>

        <Section title="性格">
          <Row label="标签" value={(character.personality.traits || []).join('、') || '未设定'} dark={isDark} />
          <Row label="说话" value={character.personality.speakingStyle} dark={isDark} />
          <Row label="喜欢" value={(character.personality.likes || []).join('、') || '未设定'} dark={isDark} />
          <Row label="讨厌" value={(character.personality.dislikes || []).join('、') || '未设定'} dark={isDark} last />
        </Section>

        <Section title="背景">
          <View style={{ backgroundColor: c.card, padding: 16 }}><Text style={{ fontSize: 13, color: c.text, lineHeight: 21 }}>{character.backstory || '暂无背景故事'}</Text></View>
        </Section>

        <Section title="设定">
        </Section>

        {character.memories.length > 0 && (
          <Section title="关系里程碑">
            {character.memories.sort((a, b) => b.importance - a.importance).slice(0, 5).map((m, i) => (
              <View key={i}>
                <View style={{ flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 16, backgroundColor: c.card }}>
                  <Text style={{ fontSize: 14, color: c.text, flex: 1 }}>{m.content}</Text>
                  <Text style={{ fontSize: 10, color: c.muted }}>{m.type === 'milestone' ? '💎' : m.type === 'discovery' ? '🔍' : m.type === 'boundary' ? '🛑' : '📌'}</Text>
                </View>
                {i < 4 && <View style={{ marginLeft: 16, height: StyleSheet.hairlineWidth, backgroundColor: c.sep }} />}
              </View>
            ))}
          </Section>
        )}

        {character.currentContext?.location && character.currentContext.location !== '未知' && (
          <Section title="当前场景">
            <Row label="地点" value={character.currentContext.location} dark={isDark} />
            <Row label="心情" value={character.currentContext.mood} dark={isDark} />
            <Row label="穿着" value={character.currentContext.outfit} dark={isDark} last />
          </Section>
        )}

        <View style={{ paddingHorizontal: 16, marginBottom: 40 }}>
          <TouchableOpacity style={{ paddingVertical: 15, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center' }} onPress={() => onStart(character)}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>开始对话</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
