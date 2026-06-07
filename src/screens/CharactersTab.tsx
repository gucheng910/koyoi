// ============================================================
//  角色库 v2 — iOS 风格列表
// ============================================================
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { showAlert } from '../components/AnimatedAlert';
import { useCharacterStore } from '../store/characterStore';
import { getPresetCharacters, getPresetWorld } from '../prompts/characters/presets';
import type { Character } from '../types';

interface Props { isDark: boolean; onSelectChar: (c: Character) => void; }

const colors = (d: boolean) => d
  ? { bg: '#0E0D0B', card: '#1C1912', sep: 'rgba(255,255,255,0.06)', text: '#E8DCC8', muted: '#8A8070', accent: '#5B9BD5' }
  : { bg: '#F2F1F0', card: '#FFFFFF', sep: 'rgba(0,0,0,0.06)', text: '#1C1C1E', muted: '#8E8E93', accent: '#5B9BD5' };

export default function CharactersTab({ isDark, onSelectChar }: Props) {
  const c = colors(isDark);
  const customChars = useCharacterStore(s => s.customCharacters);
  const [chars, setChars] = useState<Character[]>([]);

  useEffect(() => { setChars([...getPresetCharacters(), ...customChars]); }, [customChars]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 32, fontWeight: '800', color: c.text, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8, letterSpacing: 0.5 }}>角色库</Text>
      <Text style={{ fontSize: 13, color: c.muted, paddingHorizontal: 20, paddingBottom: 20 }}>共 {chars.length} 个角色</Text>
      <FlatList
        data={chars}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        renderItem={({ item, index }) => {
          const world = getPresetWorld(item.worldId);
          const last = index === chars.length - 1;
          return (
            <TouchableOpacity
              style={{ backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderTopLeftRadius: index === 0 ? 12 : 0, borderTopRightRadius: index === 0 ? 12 : 0, borderBottomLeftRadius: last ? 12 : 0, borderBottomRightRadius: last ? 12 : 0 }}
              onPress={() => onSelectChar(item)}
              onLongPress={() => {
                if (item.isPreset) return;
                showAlert('删除角色', `确定删除 ${item.name}？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '删除', style: 'destructive', onPress: () => { useCharacterStore.getState().deleteCharacter(item.id); setChars(prev => prev.filter(x => x.id !== item.id)); } },
                ]);
              }}
              activeOpacity={0.6}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? '#1A2430' : '#E8F0F8', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 20, color: c.accent, fontWeight: '300' }}>{item.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{item.age} · {item.gender === 'female' ? '女' : '男'}{world ? ' · ' + world.name : ''}</Text>
              </View>
              <Text style={{ fontSize: 16, color: isDark ? '#444' : '#ccc' }}>›</Text>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ marginLeft: 72, height: StyleSheet.hairlineWidth, backgroundColor: c.sep }} />}
      />
    </View>
  );
}
