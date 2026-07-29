// ============================================================
//  角色格式适配器
//  统一 KB 角色格式与 Character 类型，消除 as any
// ============================================================

import type { Character } from '../types';

/**
 * KB 角色格式（来自知识库提取）
 */
export interface KbCharacter {
  name: string;
  aliases: string[];
  gender: string;
  role: string;
  traits: string[];
  deepTraits?: string[];
  defenseMechanism?: string;
  contradictions?: string;
  signatureScenes?: Array<{ chapter: number; description: string }>;
  habits: string[];
  speechStyle: string;
  speechSamples: Array<{ quote: string; chapter: number }>;
  firstAppear: number;
  lastAppear: number;
}

/**
 * 将 KB 角色转换为 Character 类型
 */
export function kbCharToCharacter(c: KbCharacter, worldId: string, idx: number, sourceNovel?: string): Character {
  // 构建深度人设描述（注入 backstory 和 personality）
  const deepInfo: string[] = [];
  if ((c as any).deepTraits?.length) deepInfo.push('深层性格：' + (c as any).deepTraits.join('、'));
  if ((c as any).defenseMechanism) deepInfo.push('防御机制：' + (c as any).defenseMechanism);
  if ((c as any).contradictions) deepInfo.push('矛盾点：' + (c as any).contradictions);
  if ((c as any).signatureScenes?.length) {
    deepInfo.push('标志性场景：' + (c as any).signatureScenes.map((s: any) => '第' + (s.chapter+1) + '章 ' + s.description).join('；'));
  }
  const deepBackstory = deepInfo.length > 0 ? deepInfo.join(' | ') : '';

  return {
    id: `fanfic_char_${idx}`,
    name: c.name,
    worldId,
    gender: (c.gender as 'female' | 'male' | 'other') || 'female',
    age: '未知',
    appearance: { height: '', bodyType: '', bust: '', waist: '', hips: '', skinTone: '', hairStyle: '', facialFeatures: '', intimateDetails: '' },
    personality: {
      traits: c.traits,
      speakingStyle: c.speechStyle,
      habits: c.habits,
      likes: [],
      dislikes: [],
      ...(deepBackstory ? { _deepProfile: deepBackstory } : {}),
    } as any,
    
    relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: c.role },
    backstory: deepBackstory || `出场：第${(c.firstAppear || 0) + 1}~${(c.lastAppear || 0) + 1}章`,
    worldContext: { type: 'fanfic', sourceNovel: sourceNovel || '', originalRole: c.role, originalFate: '' },
    autonomy: { goals: [], schedule: '', agency: 5 },
    memories: [],
    currentContext: { location: '未知', timeOfDay: '未知', mood: '', outfit: '', recentEvents: '' },
    isPreset: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exampleDialogues: c.speechSamples.map(s => ({ user: c.name, character: s.quote })),
  };
}

/**
 * 从 Character 中提取 KB 格式的属性（用于 WorldChatScreen 中访问 KB 角色的 traits/role）
 */
export function getCharTraits(c: Character | KbCharacter): string[] {
  const surface = (c as KbCharacter).traits || (c as Character).personality?.traits || [];
  const deep = (c as KbCharacter).deepTraits || [];
  return [...surface, ...deep];
}

export function getCharRole(c: Character | KbCharacter): string {
  return (c as Character).relationship?.status || (c as KbCharacter).role || '';
}

export function getCharSpeechStyle(c: Character | KbCharacter): string {
  return (c as KbCharacter).speechStyle || (c as Character).personality?.speakingStyle || '';
}
