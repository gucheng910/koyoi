// ============================================================
//  角色卡导入器 — Character Card V2 格式解析
//  支持 JSON 和 PNG（内嵌 tEXt 元数据）
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { Character, World } from '../types';

export interface ImportedCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogues: string[];
  systemPrompt: string;
  creatorNotes: string;
  tags: string[];
  /** 原始数据，供后续使用 */
  raw: any;
}

/**
 * 从用户选择的文件中解析 Character Card
 */
export async function pickAndParseCard(): Promise<ImportedCard | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'image/png', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;

    const file = result.assets[0];
    let raw: any;

    if (file.name.endsWith('.png')) {
      // PNG: 读取为 base64，解析 tEXt 块中的 JSON
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      raw = extractCardFromPng(base64);
      if (!raw) throw new Error('PNG 中未找到角色卡数据');
    } else {
      // JSON: 直接解析
      const text = await FileSystem.readAsStringAsync(file.uri);
      raw = JSON.parse(text);
    }

    return parseCardV2(raw);
  } catch (e: any) {
    console.warn('[IMPORT] failed:', e.message);
    return null;
  }
}

/**
 * 从 PNG 的 base64 数据中提取内嵌的 JSON（tEXt 块）
 * Character Card V2 格式将 JSON 存在 PNG 的 "chara" 文本块中
 */
function extractCardFromPng(base64: string): any {
  try {
    // Hermes 不支持 Buffer，用纯 JS base64 解码
    const bytes = base64ToUint8Array(base64);
    const text = Array.from(bytes.slice(0, Math.min(bytes.length, 65536)), b => String.fromCharCode(b)).join('');

    // 搜索 "tEXt" 标志
    let pos = 0;
    while ((pos = text.indexOf('tEXt', pos)) >= 0) {
      const keywordEnd = text.indexOf('\0', pos + 4);
      if (keywordEnd < 0) { pos += 4; continue; }
      const keyword = text.slice(pos + 4, keywordEnd);
      // PNG chunk: 4字节长度 + 4字节类型 + 数据 + 4字节CRC
      const dataLen = (bytes[pos - 4] << 24) | (bytes[pos - 3] << 16) | (bytes[pos - 2] << 8) | bytes[pos - 1];
      const textStart = keywordEnd + 1;
      const textContent = text.slice(textStart, textStart + dataLen - (keyword.length + 1));

      if (keyword === 'chara' || keyword === 'ccv3') {
        try {
          const decoded = new TextDecoder().decode(base64ToUint8Array(textContent));
          return JSON.parse(decoded);
        } catch {
          try { return JSON.parse(textContent); } catch { /* ignore */ }
        }
      }
      pos += 4;
    }
  } catch {}
  return null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * 解析 Character Card V2 JSON 为统一格式
 */
function parseCardV2(raw: any): ImportedCard {
  const data = raw.data || raw;
  return {
    name: data.name || raw.name || '未命名',
    description: data.description || '',
    personality: data.personality || '',
    scenario: data.scenario || '',
    firstMessage: data.first_mes || data.mes_example || '',
    exampleDialogues: typeof data.mes_example === 'string'
      ? data.mes_example.split('\n').filter((l: string) => l.trim().length > 5).slice(0, 8)
      : [],
    systemPrompt: data.system_prompt || '',
    creatorNotes: data.creator_notes || '',
    tags: data.tags || [],
    raw,
  };
}

/**
 * 将导入的角色卡转为 Koyoi Character
 */
export function cardToCharacter(card: ImportedCard, worldId?: string): Character {
  const traits = card.personality
    .split(/[,，\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    id: 'import_' + Date.now(),
    name: card.name,
    worldId: worldId || 'custom',
    gender: 'other',
    age: '',
    appearance: { height: '', bodyType: '', bust: '', waist: '', hips: '', skinTone: '', hairStyle: '', facialFeatures: card.description?.slice(0, 50) || '', intimateDetails: '' },
    personality: {
      traits,
      speakingStyle: '',
      habits: [],
      likes: [],
      dislikes: [],
    },
    sexualProfile: { libido: 5, experience: 3, dominance: 5, kinks: [], softLimits: [], hardLimits: [], sensitiveZones: [], sexualResponse: '' },
    relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: '' },
    backstory: card.description || '',
    worldContext: { type: 'custom', sourceNovel: '', originalRole: '', originalFate: '' },
    autonomy: { goals: [], schedule: '', agency: 5 },
    memories: [],
    exampleDialogues: card.exampleDialogues.map(line => ({ user: '', character: line })),
    currentContext: { location: '', timeOfDay: '', mood: '', outfit: '', recentEvents: '' },
    isPreset: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 将导入的角色卡转为 Koyoi World（含一个预设角色）
 */
export function cardToWorld(card: ImportedCard, worldId?: string): World {
  const id = worldId || 'import_world_' + Date.now();
  return {
    id,
    name: card.name,
    type: 'custom',
    rules: {
      physics: card.creatorNotes || card.description?.slice(0, 200) || '',
      supernatural: '',
      technology: '',
      society: '',
      morality: '',
      sexualNorms: '',
    },
    locations: [],
    factions: [],
    timeline: [],
    inertia: { majorEvents: 0.5, characterFate: 0.5, worldReaction: 0.5 },
    butterflySensitivity: { minor: '', major: '' },
    writingStyle: '',
    styleSamples: [],
    styleFeatures: card.systemPrompt || '',
    characters: [cardToCharacter(card)],
    keyDecisions: [],
  };
}
