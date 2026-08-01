// ============================================================
//  发送管线 — 阶段 7: 响应后处理
// ============================================================

import React from 'react';
import { polishText } from '../../api/deepseek';
import type { WorldSession } from '../../types';
import type { ApiConfig } from '../../types';

export interface PostProcessResult {
  displayText: string;
  newNpcs?: Array<{ name: string; role: string; personality: string; currentStatus: string; goal: string }>;
  /** 场景转变（AI 通过 ___META___ {"scene":"..."} 上报） */
  scene?: string;
}

export async function postProcessResponse(
  raw: string,
  session: WorldSession,
  cfg: ApiConfig,
  chapterCtx: any,
  activeChars: React.MutableRefObject<string[]>
): Promise<PostProcessResult> {
  console.log('[PIPELINE] stage7 postProcess start rawLen=' + raw.length);
  let displayText = raw;

  if (session.worldNovelId && cfg.autoPolish !== false) {
    try {
      const styleFeatures = session.world?.writingStyle || '';
      const chapterSample = chapterCtx?.chapterText || '';
      if (styleFeatures || chapterSample) {
        displayText = await polishText(cfg, displayText, { styleFeatures, chapterSample });
      }
    } catch { console.warn('[sendPipeline] polish failed'); }
  }

  const metaMatch = raw.match(/___META___\s*(\{[\s\S]*\})/);
  const newNpcs: PostProcessResult['newNpcs'] = [];
  let scene: string | undefined;
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      displayText = raw.replace(/___META___[\s\S]*$/, '').trim();
      if (typeof meta.scene === 'string' && meta.scene.trim()) {
        scene = meta.scene.trim().slice(0, 40);
      }
      if (meta.newCharacter && typeof meta.newCharacter === 'string') {
        const name = meta.newCharacter;
        const inScene = session.selectedCharacters.some(c => c.name === name)
          || (session.npcs || []).some(n => n.name === name);
        if (!inScene) {
          const worldChars = (session.world as any)?.characters || [];
          const wc = worldChars.find((wc: any) => wc.name === name);
          newNpcs.push(wc
            ? { name: wc.name, role: wc.relationship?.status || '原著角色', personality: (wc.personality?.traits || ['未知']).join('/'), currentStatus: '刚刚进入场景', goal: '' }
            : { name, role: '原著角色', personality: '未知', currentStatus: '刚刚进入场景', goal: '' }
          );
        }
      }
    } catch {}
  }

  return { displayText, newNpcs: newNpcs.length > 0 ? newNpcs : undefined, scene };
}
