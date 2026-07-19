// ============================================================
//  同人分析辅助搜索
//  基于 DuckDuckGo Lite 端点，零依赖，无需 API Key
//  在同人分析过程中搜索补充信息优化分析结果
// ============================================================

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * 搜索 DuckDuckGo Lite（无 API Key，纯 HTTP）
 * 返回标题、摘要和 URL 的列表
 */
export async function searchWeb(
  query: string,
  maxResults: number = 5
): Promise<SearchResult[]> {
  try {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Koyoi/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!resp.ok) return [];

    const html = await resp.text();
    return parseDDGLiteResults(html, maxResults);
  } catch {
    return [];
  }
}

/**
 * 解析 DuckDuckGo Lite 的 HTML 结果
 */
function parseDDGLiteResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG Lite 的结果格式:
  // <a rel="nofollow" href="URL">TITLE</a>
  // <span class="link-text">SNIPPET</span>
  const linkRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>\s*<span[^>]*class="[^"]*link-text[^"]*"[^>]*>([^<]*)<\/span>/gi;

  let match;
  while ((match = linkRegex.exec(html)) !== null && results.length < max) {
    const url = decodeURIComponent(match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&rut=.*/, ''));
    results.push({
      title: match[2].trim(),
      snippet: match[3].trim(),
      url,
    });
  }

  // 回退：如果正则没匹配到，尝试更宽松的解析
  if (results.length === 0) {
    const altRegex = /<a[^>]*href="([^"]*)"[^>]*class="[^"]*result-link[^"]*"[^>]*>([^<]*)<\/a>[\s\S]*?<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([^<]*)</gi;
    let altMatch;
    while ((altMatch = altRegex.exec(html)) !== null && results.length < max) {
      results.push({
        title: altMatch[2].trim(),
        snippet: altMatch[3].trim(),
        url: altMatch[1],
      });
    }
  }

  return results;
}

/**
 * 为同人分析构建搜索查询
 */
export function buildNovelSearchQueries(
  novelTitle: string,
  characterNames: string[] = []
): string[] {
  const queries: string[] = [];

  // 1. 小说基本信息
  queries.push(`${novelTitle} 小说 剧情 介绍`);

  // 2. 主要角色（最多前 5 个）
  for (const name of characterNames.slice(0, 5)) {
    queries.push(`${name} ${novelTitle} 角色 性格`);
  }

  // 3. 写作风格
  queries.push(`${novelTitle} 作者 写作风格 文笔`);

  return queries;
}

/**
 * 批量搜索并聚合结果
 * 用于同人分析阶段，为知识库补充外部信息
 */
export async function searchNovelContext(
  novelTitle: string,
  characterNames: string[] = [],
  onProgress?: (current: number, total: number) => void
): Promise<Record<string, SearchResult[]>> {
  const queries = buildNovelSearchQueries(novelTitle, characterNames);
  const results: Record<string, SearchResult[]> = {};

  for (let i = 0; i < queries.length; i++) {
    results[queries[i]] = await searchWeb(queries[i], 3);
    onProgress?.(i + 1, queries.length);

    // 速率限制：每个查询间隔 500ms
    if (i < queries.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * 将搜索结果转为可注入 prompt 的文本
 */
export function searchResultsToPrompt(
  results: Record<string, SearchResult[]>
): string {
  const lines: string[] = [];

  for (const [query, items] of Object.entries(results)) {
    if (items.length === 0) continue;
    lines.push(`\n【搜索：${query}】`);
    for (const item of items.slice(0, 2)) {
      lines.push(`  · ${item.title}`);
      if (item.snippet) lines.push(`    ${item.snippet.slice(0, 120)}`);
    }
  }

  return lines.length > 0
    ? '\n----- 外部参考资料 -----' + lines.join('\n')
    : '';
}
