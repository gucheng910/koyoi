// ============================================================
//  会话状态管理
// ============================================================

import { create } from 'zustand';
import type { ChatMessage } from '../types';

interface SessionState {
  messages: ChatMessage[];
  isGenerating: boolean;
  streamingText: string;
  error: string | null;
  memorySummaries: string[];

  clearMessages: () => void;
  setMessages: (msgs: ChatMessage[]) => void;
  startGenerating: () => void;
  appendStreamToken: (token: string) => void;
  setError: (error: string) => void;
  clearError: () => void;
  addMemorySummaries: (summaries: string[]) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  messages: [],
  isGenerating: false,
  streamingText: '',
  error: null,
  memorySummaries: [],

  clearMessages: () => set({ messages: [], memorySummaries: [], error: null }),
  setMessages: (msgs) => set({ messages: msgs }),
  startGenerating: () => set({ isGenerating: true, streamingText: '' }),

  appendStreamToken: (token) => {
    set(state => ({ streamingText: state.streamingText + token }));
  },

  setError: (error) => set({ error, isGenerating: false }),
  clearError: () => set({ error: null }),

  addMemorySummaries: (summaries) => {
    set(state => ({
      memorySummaries: [...state.memorySummaries, ...summaries].slice(-20),
    }));
  },
}));
