// ============================================================
//  小说存储服务
//  将切分后的章节持久化到 FileSystem
//  按 world_id 组织目录结构
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChapterMeta, NovelMeta } from '../types';

const NOVELS_DIR = FileSystem.documentDirectory + 'koyoi_novels/';
const INDEX_KEY = '@koyoi_novel_index';

// 确保基础目录存在
async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(NOVELS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(NOVELS_DIR, { intermediates: true });
  }
}

// 确保小说目录存在
async function ensureNovelDir(worldId: string): Promise<string> {
  await ensureDir();
  const dir = NOVELS_DIR + worldId + '/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.makeDirectoryAsync(dir + 'chapters/', { intermediates: true });
    await FileSystem.makeDirectoryAsync(dir + 'knowledge/', { intermediates: true });
  }
  return dir;
}

// ---- 索引管理 ----

async function loadIndex(): Promise<Record<string, any>> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return {};
    try {
      const idx = JSON.parse(raw);
      // 清理旧条目中的 chapters 大字段
      let changed = false;
      for (const key of Object.keys(idx)) {
        if (idx[key]?.chapters) { delete idx[key].chapters; changed = true; }
      }
      if (changed) {
        try { await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch {}
      }
      return idx;
    } catch {
      // JSON 损坏或过大，清空重建
      try { await AsyncStorage.setItem(INDEX_KEY, '{}'); } catch {}
      return {};
    }
  } catch {
    return {};
  }
}

async function saveIndex(index: Record<string, any>): Promise<void> {
  try { await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch {}
}

// ---- 公开 API ----

/**
 * 创建新小说：分割章节并持久化
 */
export async function createNovel(
  worldId: string,
  originalFileName: string,
  fullText: string,
  chapters: ChapterMeta[],
  onProgress?: (cur: number, total: number) => void
): Promise<NovelMeta> {
  console.log('[KOYOI] createNovel start, chapters:', chapters.length, 'textLen:', fullText.length);
  const dir = await ensureNovelDir(worldId);

  // 小批量并发写入（每批 5 个，写完释放引用，加间隔避 ANR）
  const BATCH = 5;
  for (let i = 0; i < chapters.length; i += BATCH) {
    const batch = chapters.slice(i, i + BATCH);
    const texts = batch.map(ch => fullText.slice(ch.startChar, ch.endChar));
    await Promise.all(batch.map((ch, j) => {
      const chPath = dir + `chapters/${String(ch.index).padStart(4, '0')}.txt`;
      return FileSystem.writeAsStringAsync(chPath, texts[j], { encoding: FileSystem.EncodingType.UTF8 }).catch(() => {});
    }));
    texts.length = 0; // 释放本批字符串
    if (onProgress) onProgress(Math.min(i + BATCH, chapters.length), chapters.length);
    if (i + BATCH < chapters.length) await new Promise(r => setTimeout(r, 100));
  }

  const meta: NovelMeta = {
    id: worldId,
    title: originalFileName.replace(/\.\w+$/, ''),
    originalFileName,
    totalChars: fullText.length,
    chapterCount: chapters.length,
    chapters,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 保存元数据
  await FileSystem.writeAsStringAsync(
    dir + 'meta.json',
    JSON.stringify(meta, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );

  // 不再写 full.txt，分析时按需逐章读取

  // 索引只存摘要
  const index = await loadIndex();
  index[worldId] = { id: meta.id, title: meta.title, originalFileName: meta.originalFileName, totalChars: meta.totalChars, chapterCount: meta.chapterCount, createdAt: meta.createdAt, updatedAt: meta.updatedAt };
  try { await saveIndex(index); } catch {}
  console.log('[KOYOI] createNovel done');
  return meta;
}

/**
 * 读取小说元数据
 */
export async function getNovelMeta(worldId: string): Promise<NovelMeta | null> {
  const index = await loadIndex();
  const cached = index[worldId];
  if (cached?.chapters?.length) return cached as NovelMeta;

  try {
    const dir = NOVELS_DIR + worldId + '/';
    const raw = await FileSystem.readAsStringAsync(dir + 'meta.json');
    return JSON.parse(raw);
  } catch {
    return cached || null; // meta.json 不存在时回退到索引摘要
  }
}

/**
 * 更新小说元数据（改名等）
 */
export async function updateNovelMeta(
  worldId: string,
  patch: Partial<Pick<NovelMeta, 'title'>>
): Promise<void> {
  const meta = await getNovelMeta(worldId);
  if (!meta) return;

  const updated = { ...meta, ...patch, updatedAt: new Date().toISOString() };
  const dir = NOVELS_DIR + worldId + '/';
  await FileSystem.writeAsStringAsync(
    dir + 'meta.json',
    JSON.stringify(updated, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );

  const index = await loadIndex();
  index[worldId] = updated;
  await saveIndex(index);
}

/**
 * 读取单章内容
 */
export async function getChapter(worldId: string, chapterIndex: number): Promise<string> {
  const chPath = NOVELS_DIR + worldId + '/chapters/' + String(chapterIndex).padStart(4, '0') + '.txt';
  try {
    const resp = await fetch(chPath);
    const raw = await resp.text();
    // 快速 CJK 检查：读出的文本是否含正常中文
    const cjkCount = (raw.slice(0, 1000).match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjkCount > 5) return raw;
    // 中文不足，可能编码错误，走 FileSystem 的编码检测路径
    throw new Error('Encoding check');
  } catch {
    try {
      const raw = await FileSystem.readAsStringAsync(chPath, { encoding: FileSystem.EncodingType.UTF8 });
      const cjkCount = (raw.slice(0, 2000).match(/[\u4e00-\u9fff]/g) || []).length;
      if (cjkCount > 10) return raw;
      try {
        const buf = await FileSystem.readAsStringAsync(chPath, { encoding: FileSystem.EncodingType.Base64 });
        const bytes = Uint8Array.from(atob(buf), c => c.charCodeAt(0));
        const gbkDecoded = new TextDecoder('gbk', { fatal: false }).decode(bytes);
        if (gbkDecoded.length > raw.length * 0.8) return gbkDecoded;
      } catch {}
      return raw;
    } catch {
      return '';
    }
  }
}

/**
 * 读取连续多章内容（合并为一个字符串）
 */
export async function getChapterRange(
  worldId: string,
  startIdx: number,
  endIdx: number
): Promise<string> {
  const texts: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const t = await getChapter(worldId, i);
    if (t) texts.push(t);
  }
  return texts.join('\n\n');
}

/**
 * 读取全文本（用于分析）
 */
export async function getFullText(worldId: string): Promise<string> {
  try {
    const raw = await FileSystem.readAsStringAsync(NOVELS_DIR + worldId + '/full.txt', { encoding: FileSystem.EncodingType.UTF8 });
    // 检查是否解码正确（是否有足够中文）
    const cjkCount = (raw.slice(0, 5000).match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjkCount > 20) return raw;
    // 可能GBK：尝试重新读取
    try {
      const buf = await FileSystem.readAsStringAsync(NOVELS_DIR + worldId + '/full.txt', { encoding: FileSystem.EncodingType.Base64 });
      const bytes = Uint8Array.from(atob(buf), c => c.charCodeAt(0));
      const gbkDecoded = new TextDecoder('gbk', { fatal: false }).decode(bytes);
      if (gbkDecoded.length > cjkCount * 2) return gbkDecoded;
    } catch {}
    return raw;
  } catch {
    // 回退：从各章拼接
    const meta = await getNovelMeta(worldId);
    if (!meta) return '';
    const texts: string[] = [];
    for (let i = 0; i < meta.chapterCount; i++) {
      const t = await getChapter(worldId, i);
      if (t) texts.push(t);
    }
    return texts.join('\n\n');
  }
}

/**
 * 删除小说（含所有章节文件）
 */
export async function deleteNovel(worldId: string): Promise<void> {
  const dir = NOVELS_DIR + worldId + '/';
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {}

  const index = await loadIndex();
  delete index[worldId];
  await saveIndex(index);
}

/**
 * 获取所有小说索引
 */
export async function listNovels(): Promise<NovelMeta[]> {
  const index = await loadIndex();
  return Object.values(index).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * 获取小说目录路径
 */
export function getNovelDir(worldId: string): string {
  return NOVELS_DIR + worldId + '/';
}
