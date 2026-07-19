// ============================================================
//  会话存储 — JSONL 文件系统存储（参考 SillyTavern 设计）
//  替代 AsyncStorage 全量覆盖，支持增量写入 + 原子保存 + 备份
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import type { WorldSession, ChatMessage } from '../types';

const BASE_DIR = FileSystem.documentDirectory + 'koyoi_sessions/';
const INDEX_PATH = BASE_DIR + 'index.json';

export interface SessionIndexEntry {
  id: string;
  name: string;
  type: string;
  charCount: number;
  msgCount: number;
  lastActivity: string;
  hasNovelId: boolean;
  currentChapter: number;
}

// ── 目录初始化 ──

async function ensureDir(path: string) {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

function sessionDir(id: string) { return BASE_DIR + id + '/'; }
function metaPath(id: string) { return sessionDir(id) + 'meta.json'; }
function chatPath(id: string) { return sessionDir(id) + 'chat.jsonl'; }
function backupPath(id: string, file: string) { return sessionDir(id) + file + '.backup'; }

// ── 原子写入 ──

async function atomicWrite(filePath: string, content: string) {
  const tmp = filePath + '.tmp';
  await FileSystem.writeAsStringAsync(tmp, content);
  await FileSystem.moveAsync({ from: tmp, to: filePath });
}

async function atomicAppend(filePath: string, line: string) {
  // JSONL 追加：原子读取 → 追加 → 写入
  let existing = '';
  try { existing = await FileSystem.readAsStringAsync(filePath); } catch {}
  const tmp = filePath + '.tmp';
  await FileSystem.writeAsStringAsync(tmp, existing + line + '\n');
  await FileSystem.moveAsync({ from: tmp, to: filePath });
}

// 批量追加（一次读取 + 一次写入，比逐条 append 快 N 倍）
async function atomicAppendBatch(filePath: string, lines: string[]) {
  if (lines.length === 0) return;
  let existing = '';
  try { existing = await FileSystem.readAsStringAsync(filePath); } catch {}
  const tmp = filePath + '.tmp';
  await FileSystem.writeAsStringAsync(tmp, existing + lines.join('\n') + '\n');
  await FileSystem.moveAsync({ from: tmp, to: filePath });
}

// ── 备份 ──

async function backupFile(filePath: string) {
  const backup = filePath + '.backup';
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.copyAsync({ from: filePath, to: backup });
    }
  } catch {}
}

// ── 公开 API ──

/**
 * 保存完整 session（首次创建或重大更新时调用）
 * meta.json 存元数据，chat.jsonl 存所有消息
 */
export async function saveFullSession(
  session: WorldSession,
  messages: ChatMessage[]
): Promise<void> {
  await ensureDir(BASE_DIR);
  await ensureDir(sessionDir(session.id));

  // 备份
  await backupFile(metaPath(session.id));
  await backupFile(chatPath(session.id));

  // 消息：先写 chat.jsonl，再写 meta.json（如果中间崩溃，meta 还是旧版本）
  const jsonl = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
  await atomicWrite(chatPath(session.id), jsonl);

  // 元数据（记录消息数，供加载时验证）
  const meta = {
    ...session,
    messages: undefined,
    _savedMsgCount: messages.length,
    _savedAt: new Date().toISOString(),
  };

  // 更新索引
  await updateIndex(session, messages.length);
}

/**
 * 增量追加消息（对话进行中每轮调用）
 * 一次读取 + 一次写入，不逐条重写整个文件
 */
export async function appendMessages(
  sessionId: string,
  newMessages: ChatMessage[]
): Promise<void> {
  if (newMessages.length === 0) return;
  await ensureDir(sessionDir(sessionId));
  await backupFile(chatPath(sessionId));
  const lines = newMessages.map(m => JSON.stringify(m));
  await atomicAppendBatch(chatPath(sessionId), lines);
}

/**
 * 增量追加单条消息
 */
export async function appendMessage(
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  await ensureDir(sessionDir(sessionId));
  await backupFile(chatPath(sessionId));
  await atomicAppend(chatPath(sessionId), JSON.stringify(message));
}

/**
 * 加载完整 session
 */
export async function loadSession(sessionId: string): Promise<WorldSession | null> {
  try {
    const metaRaw = await FileSystem.readAsStringAsync(metaPath(sessionId));
    const meta = JSON.parse(metaRaw);

    // 加载消息（逐行验证，跳过损坏的行）
    let messages: ChatMessage[] = [];
    try {
      const chatRaw = await FileSystem.readAsStringAsync(chatPath(sessionId));
      const lines = chatRaw.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed.role === 'string' && typeof parsed.content === 'string') {
            messages.push(parsed);
          }
        } catch { /* skip corrupt line */ }
      }
    } catch { /* chat 文件可能为空或不存在 */ }

    // 消息为空但应该有内容 → 从备份恢复
    if (messages.length === 0 && (meta as any)._savedMsgCount > 0) {
      console.warn('[sessionStorage] meta OK but chat empty, trying backup');
      const backupSession = await loadFromBackup(sessionId);
      if (backupSession && backupSession.messages.length > 0) return backupSession;
    }

    return { ...meta, messages };
  } catch {
    // 尝试从备份恢复
    return loadFromBackup(sessionId);
  }
}

/**
 * 从备份恢复
 */
async function loadFromBackup(sessionId: string): Promise<WorldSession | null> {
  try {
    const metaRaw = await FileSystem.readAsStringAsync(backupPath(sessionId, 'meta.json'));
    const meta = JSON.parse(metaRaw);

    let messages: ChatMessage[] = [];
    try {
      const chatRaw = await FileSystem.readAsStringAsync(backupPath(sessionId, 'chat.jsonl'));
      messages = chatRaw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    } catch {}

    // 恢复备份到正式位置
    await atomicWrite(metaPath(sessionId), metaRaw);
    if (messages.length > 0) {
      await atomicWrite(chatPath(sessionId), messages.map(m => JSON.stringify(m)).join('\n') + '\n');
    }
    console.warn('[sessionStorage] restored from backup:', sessionId);
    return { ...meta, messages };
  } catch {
    return null;
  }
}

/**
 * 保存元数据（对话中更新 scene/characters/npcs 等，不包含 messages）
 */
export async function saveMeta(session: WorldSession): Promise<void> {
  await ensureDir(sessionDir(session.id));
  await backupFile(metaPath(session.id));
  const meta = { ...session, messages: undefined };
  await atomicWrite(metaPath(session.id), JSON.stringify(meta));
}

/**
 * 更新索引
 */
async function updateIndex(session: WorldSession, msgCount: number) {
  try {
    await ensureDir(BASE_DIR);
    let index: Record<string, SessionIndexEntry> = {};
    try {
      const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
      index = JSON.parse(raw);
    } catch { /* index 不存在或损坏，新建 */ }

    index[session.id] = {
      id: session.id,
      name: session.world?.name || '未知',
      type: session.world?.type || 'custom',
      charCount: session.selectedCharacters?.length || 0,
      msgCount,
      lastActivity: new Date().toISOString(),
      hasNovelId: !!session.worldNovelId,
      currentChapter: session.currentChapter || 0,
    };
    await atomicWrite(INDEX_PATH, JSON.stringify(index));
  } catch (e) {
    console.warn('[sessionStorage] index update failed, falling back to dir scan:', (e as Error).message);
    // 索引损坏时目录扫描兜底，不中断主保存流程
  }
}

/**
 * 加载所有 session 索引
 */
export async function loadIndex(): Promise<SessionIndexEntry[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
    const index = JSON.parse(raw);
    const entries = Object.values(index) as SessionIndexEntry[];
    return entries.sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  } catch {
    // 索引损坏，扫描目录重建
    return scanSessionsFromDisk();
  }
}

/** 扫描文件系统，从 meta.json 重建索引 */
async function scanSessionsFromDisk(): Promise<SessionIndexEntry[]> {
  try {
    await ensureDir(BASE_DIR);
    const items = await FileSystem.readDirectoryAsync(BASE_DIR);
    const entries: SessionIndexEntry[] = [];
    for (const name of items) {
      if (name === 'index.json' || name.endsWith('.tmp') || name.endsWith('.backup')) continue;
      const dirPath = BASE_DIR + name;
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists || !dirInfo.isDirectory) continue;
      try {
        const metaRaw = await FileSystem.readAsStringAsync(dirPath + '/meta.json');
        const meta = JSON.parse(metaRaw);
        if (meta.id && meta.world) {
          entries.push({
            id: meta.id,
            name: meta.world?.name || '未知',
            type: meta.world?.type || 'custom',
            charCount: meta.selectedCharacters?.length || 0,
            msgCount: meta._savedMsgCount || 0,
            lastActivity: meta._savedAt || meta.createdAt || '',
            hasNovelId: !!meta.worldNovelId,
            currentChapter: meta.currentChapter || 0,
          });
        }
      } catch { /* 单个 session 损坏，跳过 */ }
    }
    return entries.sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * 删除 session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(sessionDir(sessionId), { idempotent: true });

    // 更新索引
    let index: Record<string, SessionIndexEntry> = {};
    try {
      const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
      index = JSON.parse(raw);
    } catch {}
    delete index[sessionId];
    await atomicWrite(INDEX_PATH, JSON.stringify(index));
  } catch {}
}

/**
 * 迁移旧的 AsyncStorage 数据到新格式
 */
export async function migrateFromAsyncStorage(
  sessionId: string,
  sessionData: string
): Promise<void> {
  const session = JSON.parse(sessionData);
  await saveFullSession(session, session.messages || []);
}
