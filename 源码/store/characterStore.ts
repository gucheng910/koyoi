// ============================================================
//  自定义角色存储
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Character } from '../types';

const CUSTOM_CHARS_KEY = '@koyoi_custom_characters';

interface CharacterStoreState {
  customCharacters: Character[];
  isLoaded: boolean;

  loadCharacters: () => Promise<void>;
  addCharacter: (c: Character) => Promise<void>;
  updateCharacter: (c: Character) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  getAllCharacters: () => Character[];
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => ({
  customCharacters: [],
  isLoaded: false,

  loadCharacters: async () => {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_CHARS_KEY);
      if (raw) {
        set({ customCharacters: JSON.parse(raw), isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  addCharacter: async (c) => {
    const updated = [...get().customCharacters, c];
    await AsyncStorage.setItem(CUSTOM_CHARS_KEY, JSON.stringify(updated));
    set({ customCharacters: updated });
  },

  updateCharacter: async (c) => {
    const updated = get().customCharacters.map(x => x.id === c.id ? { ...c, updatedAt: new Date().toISOString() } : x);
    await AsyncStorage.setItem(CUSTOM_CHARS_KEY, JSON.stringify(updated));
    set({ customCharacters: updated });
  },

  deleteCharacter: async (id) => {
    const updated = get().customCharacters.filter(x => x.id !== id);
    await AsyncStorage.setItem(CUSTOM_CHARS_KEY, JSON.stringify(updated));
    set({ customCharacters: updated });
  },

  getAllCharacters: () => get().customCharacters,
}));
