// ============================================================
//  小说上传管线
//  提取自 FanficScreen.pickFile，使其可独立测试
//  处理：文件选择 → URI 解析 → 编码检测 → 分章 → 创建存储
// ============================================================

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { detectChapters } from './chapterSplitter';
import { normalizeEncoding } from './encoding';
import { createNovel } from './novelStorage';
import type { NovelMeta } from '../types';

export interface NovelUploadResult {
  worldId: string;
  fileName: string;
  novelTitle: string;
  totalChars: number;
  content: string;
  novelMeta: NovelMeta;
}

/**
 * 选择并上传小说文件
 * 处理 content:// URI → FileSystem 缓存、编码检测、分章、存储创建
 * @param onStatus 进度回调
 * @throws 文件为空、无章节等用户可理解的错误
 */
export async function pickAndUploadNovel(
  onStatus: (msg: string) => void
): Promise<NovelUploadResult> {
  // 1. 选择文件
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/plain', 'application/epub+zip', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    throw new Error('CANCELLED');
  }

  const file = result.assets[0];
  let uri = file.uri;
  let needsCleanup = false;

  // 2. 处理 content:// URI
  if (uri.startsWith('content://')) {
    onStatus('复制文件...');
    const cachedUri = FileSystem.cacheDirectory + 'novel_upload_' + Date.now() + '.txt';
    await FileSystem.copyAsync({ from: uri, to: cachedUri });
    uri = cachedUri;
    needsCleanup = true;
  }

  // 3. 读取文件内容
  onStatus('读取中…');
  const resp = await fetch(uri);
  const rawBytes = new Uint8Array(await resp.arrayBuffer());
  const content = normalizeEncoding(rawBytes);

  if (!content || content.length < 10) {
    throw new Error('文件为空或内容过短');
  }

  // 4. 分章检测
  onStatus('正在扫描章节…');
  const chapters = detectChapters(content);
  if (chapters.length === 0) {
    throw new Error('未检测到章节');
  }

  // 5. 创建小说存储
  const nameBase = file.name.replace(/\.\w+$/, '');
  const worldId = 'fanfic_' + Date.now();

  const meta = await createNovel(worldId, file.name, content, chapters, (cur, total) => {
    onStatus('写入章节 ' + cur + '/' + total);
  });

  // 清理临时文件
  if (needsCleanup) {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }

  return {
    worldId,
    fileName: file.name,
    novelTitle: nameBase,
    totalChars: content.length,
    content,
    novelMeta: meta,
  };
}
