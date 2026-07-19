const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// Replace the entire detectAndDecode function with a version that works without jschardet
const newDetectFn = `function detectAndDecode(bytes: Uint8Array): string {
  // BOM 优先
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2));
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.slice(2));
  }

  // 先用 UTF-8 解码
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const sample = utf8.slice(0, 5000);
  // 统计 CJK 和乱码密度
  const cjk = (sample.match(/[\\u4e00-\\u9fff]/g) || []).length;
  const garbled = (sample.match(/\\uFFFD/g) || []).length;
  const density = cjk / Math.max(1, sample.length);

  console.log('[ENCODING] UTF-8 CJK:', cjk, 'density:', density.toFixed(3), 'garbled:', garbled);

  // 中文密度够 + 乱码少 → UTF-8 正确
  if (cjk > 20 && garbled < 10) return utf8;
  // 有中文但乱码多 → 可能编码错误
  if (garbled > 5 || (cjk < 5 && garbled > 0)) {
    // 尝试 GBK
    const gbk = new TextDecoder('gbk', { fatal: false }).decode(bytes);
    const gbkCjk = (gbk.slice(0, 5000).match(/[\\u4e00-\\u9fff]/g) || []).length;
    console.log('[ENCODING] GBK CJK:', gbkCjk);
    if (gbkCjk > cjk * 1.5 || (gbkCjk > 0 && cjk === 0)) return gbk;
  }
  // 中文很少但可读字符多 → 英文文本
  if (density < 0.02 && garbled < 5) return utf8;

  // 兜底：GBK（中文 TXT 文件更可能是 GBK 而非 UTF-8）
  try {
    const gbk = new TextDecoder('gbk', { fatal: false }).decode(bytes);
    const gbkSample = gbk.slice(0, 5000);
    if (gbkSample.includes('第') && gbkSample.includes('章')) return gbk;
    if (gbkSample.includes('第') && gbkSample.includes('话')) return gbk;
    if (gbkSample.includes('第') && gbkSample.includes('卷')) return gbk;
  } catch {}

  return utf8;
}`;

// Find old function and replace
const fnStart = t.indexOf('function detectAndDecode(bytes: Uint8Array): string {');
const fnEnd = t.indexOf('\nimport {', fnStart);
if (fnStart >= 0 && fnEnd >= 0) {
  t = t.slice(0, fnStart) + newDetectFn + '\n' + t.slice(fnEnd);
} else {
  console.log('could not find function boundaries');
}
fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('detectAndDecode rewritten without jschardet');
