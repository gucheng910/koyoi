// ============================================================
//  世界会话状态（Zustand）
//
//  为什么要有这个 store：
//
//  WorldChatScreen 原本把会话状态放在 useState，而服务层（sendPipeline 的
//  8 个 stage）需要读最新值，于是组件里手工维护了 6 个 useRef 做同步：
//    turnCount / activeChars / lastSimResults / attitudes / summaryRef
//  每个 ref 都是一次「React 状态没法被服务层读」的妥协。
//
//  更严重的是 stage8_hooks 直接就地改写 session 对象（session.worldClock = ...），
//  而它拿到的是 sessionRef.current——一个在 render 期间才与 state 对齐的引用。
//  setSession 造新对象后、下一次 render 重新赋值前，两者是分叉的，
//  这个窗口内 saveSession 读到的是被就地改过的旧对象。
//
//  这里把上述状态收进 store，使：
//    - 服务层用 getState() 读到的永远是当前值，不依赖 render 时机
//    - 所有更新都经由明确的 action，可被追踪和测试
// ============================================================

import { create } from 'zustand';
import type { WorldSession, ChatMessage, CharacterMoodState } from '../types';

/** 单轮角色推演结果（供下一轮作为"上一轮状态"注入） */
export type SimResult = { intent: string; mood: string };

/** 角色态度（好感度累积） */
export interface CharacterAttitude {
  trust: number;
  affection: number;
  fear: number;
  lastUpdate: string;
}

interface WorldSessionState {
  /** 当前世界会话（含 messages 的权威副本） */
  session: WorldSession | null;
  /** 消息列表。与 session.messages 同源，单独暴露便于订阅 */
  messages: ChatMessage[];
  /** 已完成的回合数 */
  turnCount: number;
  /** 当前在场角色名单（stage4 维护，stage5 用于物理锚定） */
  activeChars: string[];
  /** 上一轮各角色的意图/情绪 */
  lastSimResults: Record<string, SimResult>;
  /** 各角色累积好感度 */
  attitudes: Record<string, CharacterAttitude>;
  /** 滚动摘要（每 10 轮压缩一次） */
  summary: string;

  // ---- 生命周期 ----
  /** 载入一个世界（进入对话界面时调用） */
  openWorld: (session: WorldSession) => void;
  /** 关闭世界（离开对话界面时调用，避免下一个世界读到脏状态） */
  closeWorld: () => void;

  // ---- 会话对象更新 ----
  /**
   * 合并式更新 session 字段。
   *
   * 这是替代 `setSession(prev => ({ ...prev, ... }))` 的唯一入口。
   * stage 不再直接改写 session 对象，避免 state 与引用分叉。
   */
  patchSession: (patch: Partial<WorldSession>) => void;

  // ---- 消息 ----
  setMessages: (messages: ChatMessage[]) => void;
  pushMessage: (message: ChatMessage) => void;

  // ---- 回合与推演 ----
  setTurnCount: (n: number) => void;
  bumpTurn: () => number;
  setActiveChars: (names: string[]) => void;
  addActiveChar: (name: string) => void;
  removeActiveChar: (name: string) => void;
  setLastSimResults: (r: Record<string, SimResult>) => void;
  setAttitudes: (a: Record<string, CharacterAttitude>) => void;
  setSummary: (s: string) => void;

  // ---- 常用局部更新 ----
  setMoods: (moods: Record<string, CharacterMoodState>) => void;
  setScene: (scene: string) => void;
  setChapter: (chapter: number) => void;
}

/** 从 WorldSession 里推导初始的 round 数（每条 assistant 消息算一轮） */
function deriveTurnCount(session: WorldSession): number {
  return Math.floor((session.messages?.length || 0) / 2);
}

export const useWorldSessionStore = create<WorldSessionState>((set, get) => ({
  session: null,
  messages: [],
  turnCount: 0,
  activeChars: [],
  lastSimResults: {},
  attitudes: {},
  summary: '',

  openWorld: (session) => set({
    session,
    messages: session.messages || [],
    turnCount: deriveTurnCount(session),
    activeChars: session.selectedCharacters?.map(c => c.name) || [],
    lastSimResults: {},
    attitudes: (session as any).characterAttitudes || {},
    summary: '',
  }),

  closeWorld: () => set({
    session: null,
    messages: [],
    turnCount: 0,
    activeChars: [],
    lastSimResults: {},
    attitudes: {},
    summary: '',
  }),

  patchSession: (patch) => {
    const cur = get().session;
    if (!cur) return;
    set({ session: { ...cur, ...patch } });
  },

  setMessages: (messages) => {
    const cur = get().session;
    set({
      messages,
      session: cur ? { ...cur, messages } : cur,
    });
  },

  pushMessage: (message) => {
    const cur = get().session;
    const messages = [...get().messages, message];
    set({
      messages,
      session: cur ? { ...cur, messages } : cur,
    });
  },

  setTurnCount: (turnCount) => set({ turnCount }),

  bumpTurn: () => {
    const next = get().turnCount + 1;
    set({ turnCount: next });
    return next;
  },

  setActiveChars: (activeChars) => set({ activeChars }),

  addActiveChar: (name) => {
    const cur = get().activeChars;
    if (cur.includes(name)) return;
    set({ activeChars: [...cur, name] });
  },

  removeActiveChar: (name) => set({
    activeChars: get().activeChars.filter(n => n !== name),
  }),

  setLastSimResults: (lastSimResults) => set({ lastSimResults }),
  setAttitudes: (attitudes) => set({ attitudes }),
  setSummary: (summary) => set({ summary }),

  setMoods: (moods) => {
    const cur = get().session;
    if (!cur) return;
    set({ session: { ...cur, characterMoods: { ...(cur.characterMoods || {}), ...moods } } });
  },

  setScene: (scene) => {
    const cur = get().session;
    if (!cur) return;
    set({ session: { ...cur, currentScene: scene } });
  },

  setChapter: (chapter) => {
    const cur = get().session;
    if (!cur) return;
    // 章节只前进不后退（后台回调乱序回来时保护）
    if (chapter < (cur.currentChapter || 0)) return;
    set({ session: { ...cur, currentChapter: chapter } });
  },
}));

/**
 * 服务层读取入口。
 *
 * stage 里用这个而不是 hook——它们不是组件，也不该因为订阅而重渲染。
 */
export function getWorldState() {
  return useWorldSessionStore.getState();
}
