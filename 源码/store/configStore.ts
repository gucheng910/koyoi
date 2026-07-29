// ============================================================
//  API 配置存储
//  用户自行填写的 API 密钥、地址等配置
//  使用 SecureStore 加密存储敏感字段
// ============================================================

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { ApiConfig } from '../types';

const CONFIG_LIST_KEY = 'koyoi_config_list';
const ANALYSIS_CONFIG_KEY = 'koyoi_analysis_config';
const DEFAULT_CONFIG_ID = 'koyoi_default_config';

// 默认配置模板
const createDefaultConfig = (): ApiConfig => ({
  id: DEFAULT_CONFIG_ID,
  label: '默认配置',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
  thinkingMode: 'disabled',
  reasoningEffort: 'high',
  temperature: 1.3,
  maxTokens: 4096,
  safetyFilter: 'off',
  streamOutput: true,
  showSystemPrompt: false,
  autoPolish: true,
  isDefault: true,
});

interface ConfigState {
  configs: ApiConfig[];
  activeConfigId: string | null;
  analysisConfig: ApiConfig | null;  // 同人分析专用配置
  isLoaded: boolean;

  // Actions
  loadConfigs: () => Promise<void>;
  saveConfig: (config: ApiConfig) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  setActiveConfig: (id: string) => void;
  getActiveConfig: () => ApiConfig | null;
  getAnalysisConfig: () => ApiConfig | null;  // 获取分析配置（未设置则回退到默认）
  saveAnalysisConfig: (config: ApiConfig) => Promise<void>;
  testConnection: () => Promise<{ success: boolean; message: string }>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  configs: [],
  activeConfigId: null,
  analysisConfig: null,
  isLoaded: false,

  loadConfigs: async () => {
    try {
      // 添加 5 秒超时，防止 SecureStore 在模拟器上卡死
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SecureStore timeout')), 5000));
      const raw = await Promise.race([
        SecureStore.getItemAsync(CONFIG_LIST_KEY),
        timeoutPromise
      ]) as string | null;
      let configs: ApiConfig[];
      if (raw) {
        configs = JSON.parse(raw);
      } else {
        const defaultConfig = createDefaultConfig();
        configs = [defaultConfig];
        SecureStore.setItemAsync(CONFIG_LIST_KEY, JSON.stringify(configs)).catch(() => {});
      }
      const activeId = configs.find(c => c.isDefault)?.id || configs[0]?.id || null;
      // 加载分析配置
      let analysisConfig: ApiConfig | null = null;
      try {
        const aRaw = await Promise.race([
          SecureStore.getItemAsync(ANALYSIS_CONFIG_KEY),
          timeoutPromise
        ]) as string | null;
        analysisConfig = aRaw ? JSON.parse(aRaw) : null;
      } catch {}
      set({ configs, activeConfigId: activeId, analysisConfig, isLoaded: true });
    } catch (e) {
      console.warn('Failed to load configs, using defaults:', e);
      const defaultConfig = createDefaultConfig();
      set({ configs: [defaultConfig], activeConfigId: defaultConfig.id, analysisConfig: null, isLoaded: true });
    }
  },

  saveConfig: async (config: ApiConfig) => {
    const { configs } = get();
    const idx = configs.findIndex(c => c.id === config.id);

    let newConfigs: ApiConfig[];
    if (config.isDefault) {
      // 新默认配置，取消其他默认
      newConfigs = configs.map(c => ({ ...c, isDefault: c.id === config.id }));
    } else {
      newConfigs = [...configs];
    }

    if (idx >= 0) {
      newConfigs[idx] = { ...config };
    } else {
      newConfigs.push(config);
    }

    // 敏感字段不直接存 JSON，但在当前自用场景下可以接受
    // 如需更严格的安全，可以用 SecureStore 逐字段存储
    await SecureStore.setItemAsync(CONFIG_LIST_KEY, JSON.stringify(newConfigs));
    set({ configs: newConfigs });
  },

  deleteConfig: async (id: string) => {
    const { configs, activeConfigId } = get();
    if (configs.length <= 1) return; // 至少保留一个

    const newConfigs = configs.filter(c => c.id !== id);
    const newActiveId = activeConfigId === id
      ? (newConfigs.find(c => c.isDefault)?.id || newConfigs[0]?.id || null)
      : activeConfigId;

    await SecureStore.setItemAsync(CONFIG_LIST_KEY, JSON.stringify(newConfigs));
    set({ configs: newConfigs, activeConfigId: newActiveId });
  },

  setActiveConfig: (id: string) => {
    set({ activeConfigId: id });
  },

  getActiveConfig: () => {
    const { configs, activeConfigId } = get();
    return configs.find(c => c.id === activeConfigId) || null;
  },

  getAnalysisConfig: () => {
    const { analysisConfig, configs, activeConfigId } = get();
    // 有分析专用配置用专用，否则回退到当前激活的聊天配置
    if (analysisConfig?.apiKey) return analysisConfig;
    return configs.find(c => c.id === activeConfigId) || null;
  },

  saveAnalysisConfig: async (config: ApiConfig) => {
    await SecureStore.setItemAsync(ANALYSIS_CONFIG_KEY, JSON.stringify(config));
    set({ analysisConfig: config });
  },

  testConnection: async () => {
    const config = get().getActiveConfig();
    if (!config || !config.apiKey) {
      return { success: false, message: '请先填写 API Key' };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return { success: true, message: '连接成功' };
      } else if (response.status === 401) {
        return { success: false, message: 'API Key 无效' };
      } else {
        return { success: false, message: `连接失败 (${response.status})` };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { success: false, message: '连接超时，请检查 API 地址' };
      }
      return { success: false, message: `网络错误: ${e.message}` };
    }
  },
}));
