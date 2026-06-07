// ============================================================
//  用户性别存储
// ============================================================
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GENDER_KEY = '@koyoi_user_gender';

interface GenderState {
  gender: 'male' | 'female';
  isLoaded: boolean;
  load: () => Promise<void>;
  setGender: (g: 'male' | 'female') => Promise<void>;
}

export const usePersonaStore = create<GenderState>((set, get) => ({
  gender: 'male',
  isLoaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(GENDER_KEY);
      if (raw === 'female' || raw === 'male') set({ gender: raw });
      set({ isLoaded: true });
    } catch { set({ isLoaded: true }); }
  },

  setGender: async (g) => {
    await AsyncStorage.setItem(GENDER_KEY, g);
    set({ gender: g });
  },

  // 兼容旧接口
  getActive: () => undefined as any,
}));
