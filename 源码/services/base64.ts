// ============================================================
//  Base64 UTF-8 工具
//  兼容 Hermes 无 atob 的情况
// ============================================================

// polyfill: Hermes 旧版可能没有全局 atob
const _atob = (typeof atob !== 'undefined' ? atob : (b64: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  b64 = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  for (let i = 0; i < b64.length;) {
    const e1 = chars.indexOf(b64[i++]);
    const e2 = chars.indexOf(b64[i++]);
    const e3 = chars.indexOf(b64[i++]);
    const e4 = chars.indexOf(b64[i++]);
    output += String.fromCharCode((e1 << 2) | (e2 >> 4));
    if (e3 !== 64) output += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== 64) output += String.fromCharCode(((e3 & 3) << 6) | e4);
  }
  return output;
}) as (b64: string) => string;

/** Base64 → UTF-8 字符串 */
export function b64ToUtf8(base64: string): string {
  try {
    const bytes = _atob(base64);
    return decodeURIComponent(
      Array.prototype.map.call(bytes, (c: string) =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
  } catch {
    return '';
  }
}

/** 简单 Base64 解码（仅 ASCII，用于短文本如空白行检测） */
export function b64ToAscii(base64: string): string {
  try { return _atob(base64); } catch { return ''; }
}
