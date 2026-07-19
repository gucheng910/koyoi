const fs = require('fs');
let ff = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 1. 替换 import
ff = ff.replace(
  "import { detectChapters, getChapterStats } from '../services/chapterSplitter';\n\n// 编码检测：GBK vs UTF-8\nfunction detectAndDecode(bytes: Uint8Array): string {",
  "import { detectChapters, getChapterStats } from '../services/chapterSplitter';\nimport jschardet from 'jschardet';\n\n// 编码检测（基于 jschardet）\nfunction detectAndDecode(bytes: Uint8Array): string {"
);

// 2. 替换 detectAndDecode 函数体为 jschardet 版本
const newFn = `function detectAndDecode(bytes: Uint8Array): string {
  // BOM 优先判断
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2));
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.slice(2));
  }

  // 取前 64KB 样本做检测（足够了）
  const sampleSize = Math.min(bytes.length, 65536);
  const sampleBuffer = Buffer.from(bytes.slice(0, sampleSize));

  console.log('[ENCODING] jschardet detecting on', sampleSize, 'bytes...');
  const result = jschardet.detect(sampleBuffer, { minimumThreshold: 0.5 });

  console.log('[ENCODING] detected:', result.encoding, 'confidence:', result.confidence?.toFixed(3));

  if (result.encoding && result.confidence && result.confidence > 0.6) {
    const enc = result.encoding.toLowerCase();
    // 映射 jschardet 输出到 TextDecoder 支持的编码名
    const encMap: Record<string, string> = {
      'gb2312': 'gbk',
      'gb18030': 'gbk',
      'gbk': 'gbk',
      'big5': 'big5',
      'shift_jis': 'shift_jis',
      'euc-jp': 'euc-jp',
      'euc-kr': 'euc-kr',
      'utf-8': 'utf-8',
      'ascii': 'utf-8',
      'windows-1252': 'utf-8',
    };
    const mapped = encMap[enc] || 'utf-8';
    console.log('[ENCODING] using:', mapped);
    try {
      return new TextDecoder(mapped, { fatal: false }).decode(bytes);
    } catch {
      console.log('[ENCODING] decode failed, falling back to utf-8');
    }
  }

  // 兜底：UTF-8
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}`;

// 找到旧的 detectAndDecode 函数
const fnStart = ff.indexOf('function detectAndDecode(bytes: Uint8Array): string {');
const fnEnd = ff.indexOf('\n\n  const pickFile', fnStart);
if (fnStart >= 0 && fnEnd >= 0) {
  ff = ff.slice(0, fnStart) + newFn + '\n' + ff.slice(fnEnd);
} else {
  console.log('ERROR: could not find function boundaries');
  console.log('fnStart:', fnStart, 'fnEnd:', fnEnd);
}

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', ff);
console.log('jschardet integrated');
