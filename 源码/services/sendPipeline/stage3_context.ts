// ============================================================
//  发送管线 — 阶段 3: 上下文构建
// ============================================================

import { buildDialogueContext } from '../dialogueContext';
import { getWorldInfo as getWorldInfoFn } from '../worldInfoService';
import type { WorldSession, ChatMessage } from '../../types';

export interface ContextResult {
  chapterCtx: any;
  isFanfic: boolean;
  worldInfo: string;
}

export async function buildContext(
  session: WorldSession,
  finalText: string,
  messages: ChatMessage[],
  turnCount: number
): Promise<ContextResult> {
  console.log('[PIPELINE] stage3 buildContext start turn=' + turnCount);
  const worldInfo = getWorldInfoFn(session, finalText, messages);

  let chapterCtx: any = null;
  try {
    if (session.worldNovelId) {
      chapterCtx = await buildDialogueContext(
        session.worldNovelId,
        session.currentChapter || 0,
        (session.recentWorldEvents || []).slice(-5),
        finalText
      );
    }
  } catch { /* chapter context unavailable */ }

  const isFanfic = !!(session.worldNovelId || (session.world?.writingStyle && session.world?.characters?.length));
  return { chapterCtx, isFanfic, worldInfo };
}
