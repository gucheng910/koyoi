// ============================================================
//  发送管线 — 阶段 7: 响应后处理
//
//  两个改动（阶段六）：
//
//  1. 修 bug：原先先抛光、再用 `displayText = raw.replace(META...)` 重置，
//     只要 AI 输出了 ___META___，抛光结果就被整段丢弃（白花一次 API 调用）。
//     正确顺序是「先剥离 META，再抛光」。
//
//  2. 抛光不再阻塞正文显示：原实现是 await polishText，用户在流式正文
//     读完之后还要空等一次完整调用的时间。改为返回原文 + 后台抛光 Promise，
//     调用方先渲染、抛光完成后再替换。
// ============================================================

import { polishText } from '../../api/deepseek';
import { withTag } from '../trace';
import type { WorldSession } from '../../types';
import type { ApiConfig } from '../../types';

export interface PostProcessResult {
  /** 立即可渲染的正文（已剥离 ___META___，但尚未抛光） */
  displayText: string;
  newNpcs?: Array<{ name: string; role: string; personality: string; currentStatus: string; goal: string }>;
  /** 场景转变（AI 通过 ___META___ {"scene":"..."} 上报） */
  scene?: string;
  /**
   * 后台抛光 Promise。为 null 表示无需抛光（非模式 / 关闭 / 无风格样本）。
   * resolve 出抛光后的文本；失败或结果不可信时 resolve 回原文。
   */
  polished: Promise<string> | null;
}

export function postProcessResponse(
  raw: string,
  session: WorldSession,
  cfg: ApiConfig,
  chapterCtx: any
): PostProcessResult {
  console.log('[PIPELINE] stage7 postProcess start rawLen=' + raw.length);

  // ── 先剥离 ___META___ ──
  // 注意顺序：必须在抛光之前。原实现先 await polishText，随后又用
  // `displayText = raw.replace(...)` 把它覆盖掉，等于抛光白做。
  //
  // 剥离分两步：先按「标记到文末」整段砍掉（无论 JSON 是否合法），
  // 再尝试解析其中的 JSON。JSON 坏掉时只丢弃标记，绝不让 ___META___
  // 出现在用户看到的正文里。
  let body = raw;
  const metaIdx = raw.search(/___META___/);
  const newNpcs: NonNullable<PostProcessResult['newNpcs']> = [];
  let scene: string | undefined;

  if (metaIdx >= 0) {
    body = raw.slice(0, metaIdx).trim();
    const jsonPart = raw.slice(metaIdx).replace(/^___META___\s*/, '');
    const objMatch = jsonPart.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const meta = JSON.parse(objMatch[0]);
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
      } catch { /* JSON 损坏：标记已剥离，正文照常用 */ }
    }
  }

  // ── 抛光：不阻塞渲染 ──
  let polished: Promise<string> | null = null;
  if (session.worldNovelId && cfg.autoPolish !== false) {
    const styleFeatures = session.world?.writingStyle || '';
    const chapterSample = chapterCtx?.chapterText || '';
    if (styleFeatures || chapterSample) {
      polished = withTag('polish', () => polishText(cfg, body, { styleFeatures, chapterSample }))
        .catch(() => { console.warn('[sendPipeline] polish failed'); return body; });
    }
  }

  return {
    displayText: body,
    newNpcs: newNpcs.length > 0 ? newNpcs : undefined,
    scene,
    polished,
  };
}
