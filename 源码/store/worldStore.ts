import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { World, FanficWorldCard } from '../types';

const WORLDS_KEY = '@koyoi_custom_worlds';

interface WorldStore {
  customWorlds: (World | FanficWorldCard)[];
  isLoaded: boolean;
  load: () => Promise<void>;
  addWorld: (w: World | FanficWorldCard) => Promise<void>;
  removeWorld: (id: string) => Promise<void>;
  getWorlds: () => (World | FanficWorldCard)[];
  getFanficWorlds: () => FanficWorldCard[];
  getCustomWorlds: () => World[];
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  customWorlds: [],
  isLoaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(WORLDS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const worlds = (Array.isArray(saved) ? saved : []).map((w: any) => {
          // 摘要格式：补充 UI 需要的字段
          if (w.charactersCount !== undefined && !w.characters) {
            w.characters = new Array(w.charactersCount); // 占位数组，让 .length 可用
          }
          return w;
        });
        set({ customWorlds: worlds, isLoaded: true });
      } else set({ isLoaded: true });
    } catch { set({ isLoaded: true }); }
  },

  addWorld: async (w) => {
    const getName = (x: any) => x?.novelTitle || x?.name || '';
    const worlds = [...get().customWorlds.filter(x => getName(x) !== getName(w)), w];
    set({ customWorlds: worlds });
    // 只存摘要，大数组走 FileSystem
    const toSave = worlds.map(x => ({
      id: (x as any).id, name: (x as any).name || (x as any).novelTitle || '',
      novelTitle: (x as any).novelTitle, writingStyle: (x as any).writingStyle,
      worldType: (x as any).worldType, totalChapters: (x as any).totalChapters,
      parsedAt: (x as any).parsedAt, type: (x as any).type,
      charactersCount: ((x as any).characters || []).length,
      timelineCount: ((x as any).timeline || []).length,
    }));
    try { await AsyncStorage.setItem(WORLDS_KEY, JSON.stringify(toSave)); } catch {}
  },

  removeWorld: async (id) => {
    const worlds = get().customWorlds.filter(w => (w as any).id !== id);
    set({ customWorlds: worlds });
    const toSave = worlds.map(x => ({ id: (x as any).id, name: (x as any).name || (x as any).novelTitle || '', novelTitle: (x as any).novelTitle }));
    try { await AsyncStorage.setItem(WORLDS_KEY, JSON.stringify(toSave)); } catch {}
  },

  getWorlds: () => get().customWorlds,
  getFanficWorlds: () => get().customWorlds.filter(w => 'novelTitle' in w) as FanficWorldCard[],
  getCustomWorlds: () => get().customWorlds.filter(w => 'type' in w) as World[],
}));
