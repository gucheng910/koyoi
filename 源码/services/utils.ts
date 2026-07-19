// ============================================================
//  共享工具函数
// ============================================================

/** 安全解析 AI 返回的 JSON */
export function safeParseJSON(raw: string): any | null {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  for (const c of [objMatch?.[0], arrMatch?.[0]].filter(Boolean) as string[]) {
    try { return JSON.parse(c); } catch {}
  }
  try { return JSON.parse(cleaned); } catch {}
  return null;
}

/** 解析影子对话 *text* */
export function parseShadowText(text: string): { type: 'normal' | 'inner'; text: string }[] {
  const segments: { type: 'normal' | 'inner'; text: string }[] = [];
  const re = /\*(.+?)\*/g;
  let lastIdx = 0, match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) segments.push({ type: 'normal', text: text.slice(lastIdx, match.index) });
    segments.push({ type: 'inner', text: match[1] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) segments.push({ type: 'normal', text: text.slice(lastIdx) });
  const merged: typeof segments = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) { last.text += seg.text; }
    else { merged.push(seg); }
  }
  return merged.length > 0 ? merged : [{ type: 'normal', text }];
}

/** 冒险模式选项解析 */
export function parseChoices(text: string): { narrative: string; choices: string[] } {
  const re = /\[(\d+|自定义输入[^\]]*)\]\s*(.+)/g;
  const choices: string[] = [];
  let narrative = text;
  const matched: { idx: number; full: string }[] = [];
  let match;
  while ((match = re.exec(text)) !== null) { matched.push({ idx: match.index, full: match[0] }); choices.push(match[2].trim()); }
  for (let i = matched.length - 1; i >= 0; i--) narrative = narrative.slice(0, matched[i].idx) + narrative.slice(matched[i].idx + matched[i].full.length);
  return { narrative: narrative.trim(), choices };
}

/** 毒性拒绝检测 */
const REFUSAL_SIGNALS = ['I cannot', "I can't", 'I won\'t', 'unable to', 'not appropriate', '我不能', '无法', '不合适', '不能继续', 'against my guidelines', 'content policy'];
export function isRefusal(text: string): boolean {
  return REFUSAL_SIGNALS.some(s => text.toLowerCase().includes(s.toLowerCase()));
}
