const fs = require('fs');

// === Replace encoding.ts with char-encoding-detector based version ===
const newEncoding = `// ============================================================
//  编码检测 & 解码（基于 ICU chardet，无需任何猜测）
//  依赖：char-encoding-detector（ICU 检测算法的纯 JS 移植）
// ============================================================

import { detectEncoding } from 'char-encoding-detector';

/**
 * 一步到位：检测编码并返回 UTF-8 字符串
 * 不需要任何启发式、不需要任何阈值——完全交给 ICU 的统计算法
 */
export function normalizeEncoding(bytes: Uint8Array): string {
  if (bytes.length < 4) return new TextDecoder('utf-8').decode(bytes);

  // BOM 优先
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }

  // ICU chardet 检测（传入原始字节数组，不做任何预处理）
  const result = detectEncoding(bytes);
  console.log('[ENCODING] detected:', result);

  if (!result) return utf8Decode(bytes);

  const enc = result.toLowerCase();

  // UTF-8/ASCII → 直接解码
  if (enc === 'utf-8' || enc === 'ascii') return utf8Decode(bytes);

  // GB18030/GB2312/GBK → 用我们的 JS 解码器
  if (enc === 'gb18030' || enc === 'gb2312') return gbkDecode(bytes);

  // Big5 → 尝试原生，不行走兜底
  if (enc === 'big5') {
    try { return new TextDecoder('big5', { fatal: false }).decode(bytes); }
    catch { return utf8Decode(bytes); }
  }

  // Shift-JIS / EUC-JP / EUC-KR → 原生
  if (enc === 'shift_jis' || enc === 'euc-jp' || enc === 'euc-kr' || enc === 'iso-2022-jp') {
    try { return new TextDecoder(enc, { fatal: false }).decode(bytes); }
    catch { return utf8Decode(bytes); }
  }

  // 其他（windows-1252 等西文编码）→ UTF-8 兜底
  return utf8Decode(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

// ── GBK 解码（Hermes 不支持 native TextDecoder('gbk')）──────────────────

import { GBK_TABLE } from './gbkTable';

function gbkDecode(bytes: Uint8Array): string {
  // 优先原生（Node.js / 部分 Hermes + ICU）
  try {
    const decoded = new TextDecoder('gbk', { fatal: false }).decode(bytes);
    if ((decoded.match(/[\u4e00-\u9fff]/g) || []).length > 3) return decoded;
  } catch {}

  // 纯 JS 回退
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b <= 0x7F) { out.push(String.fromCharCode(b)); continue; }
    if (i + 1 >= bytes.length) break;
    const hi = b, lo = bytes[++i];
    if (hi < 0x81 || hi > 0xFE || lo < 0x40 || lo > 0xFE || lo === 0x7F) continue;
    const code = (hi - 0x81) * 190 + (lo - 0x40) - (lo > 0x7F ? 1 : 0);
    out.push(code < GBK_TABLE.length ? GBK_TABLE[code] : '\uFFFD');
  }
  return out.join('');
}
`;

fs.writeFileSync('D:/koyoi/src/services/encoding.ts', newEncoding);
console.log('encoding.ts replaced with ICU chardet');

// === Remove garbled title check from FanficScreen (no longer needed) ===
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');
ff = ff.replace(
  /\/\/ 章节标题乱码检测[\s\S]*?if \(chapters\.length === 0\)/,
  'if (chapters.length === 0'
);
fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);
console.log('garbled check removed (no longer needed)');
