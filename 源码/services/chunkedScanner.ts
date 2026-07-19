// 分块扫描章节：不加载全文，只记录章节标记位置
// 空白行检查在内存中完成，不做额外 HTTP 请求
export function scanChapterMarkers(text: string, baseOffset: number): Array<{pos: number, title: string}> {
  const markers: Array<{pos: number, title: string}> = [];
  const patterns = [
    /^第[零一二三四五六七八九十百千\d]+[章节话卷集部篇回]/gm,
    /^Chapter\s+\d+/gim,
    /^[序楔终][章言子]|^尾声|^番外|^后记|^引子|^开篇/gm,
    /^第[零一二三四五六七八九十百千\d]+回/gm,
  ];
  
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
      const absPos = baseOffset + lineStart;
      // 去重
      if (markers.some(ex => Math.abs(ex.pos - absPos) < 5)) continue;
      const lineEnd = text.indexOf('\n', m.index);
      const title = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim().slice(0, 40);
      if (title.length < 2) continue;
      // 空白行检查：标记前必须是空行或文件开头
      if (lineStart > 0) {
        const before = text.slice(Math.max(0, lineStart - 3), lineStart);
        if (!/(^|\n)\s*$/.test(before)) continue;
      }
      markers.push({ pos: absPos, title });
    }
  }
  return markers;
}
