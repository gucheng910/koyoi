// ============================================================
//  知识图谱关系遍历
//  在扁平的字符/关系/事件数据上构建图结构
//  支持：最短路径 / 共同事件 / N 跳邻居
// ============================================================

import type { KnowledgeBase } from '../types';

export interface GraphNode {
  id: string;           // 角色名
  type: 'character';
  traits: string[];
  role: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;         // 关系类型
  chapter: number;      // 关系首次出现章节
  events: string[];     // 共同参与的事件
}

export class KnowledgeGraph {
  nodes: Map<string, GraphNode> = new Map();
  edges: GraphEdge[] = [];
  /** 邻接表：角色名 → [{neighbor, relationType, sharedEvents}] */
  adjacency: Map<string, Array<{ neighbor: string; relationType: string; sharedEvents: string[] }>> = new Map();

  constructor(kb: KnowledgeBase, currentChapter?: number) {
    // 构建节点
    for (const c of kb.characters) {
      this.nodes.set(c.name, {
        id: c.name,
        type: 'character',
        traits: c.traits,
        role: c.role,
      });
    }

    // 构建边（关系）
    for (const r of kb.relations) {
      let status = r.type;
      const ch = currentChapter ?? 9999;
      for (const change of (r.changes || [])) {
        if (change.chapter <= ch) status = change.to || change.from || status;
      }
      // 找出两个角色共同参与的事件
      const sharedEvents = kb.globalTimeline
        .filter(e =>
          e.chapter <= ch &&
          (e.involvedCharacters || []).includes(r.from) &&
          (e.involvedCharacters || []).includes(r.to)
        )
        .map(e => `第${e.chapter + 1}章：${e.event}`);

      this.edges.push({
        from: r.from,
        to: r.to,
        type: status,
        chapter: r.changes?.[0]?.chapter ?? 0,
        events: sharedEvents,
      });

      // 填充邻接表
      this.ensureAdj(r.from).push({ neighbor: r.to, relationType: status, sharedEvents });
      this.ensureAdj(r.to).push({ neighbor: r.from, relationType: status, sharedEvents });
    }

    // 通过共同事件补充隐式关系
    for (const e of kb.globalTimeline) {
      const involved = e.involvedCharacters || [];
      for (let i = 0; i < involved.length; i++) {
        for (let j = i + 1; j < involved.length; j++) {
          const a = involved[i], b = involved[j];
          if (!a || !b || a === b) continue;
          // 检查是否已有直接关系
          const hasDirect = this.edges.some(ed =>
            (ed.from === a && ed.to === b) || (ed.from === b && ed.to === a)
          );
          if (!hasDirect) {
            // 弱连接：仅通过共同事件关联
            const eventText = `第${e.chapter + 1}章：${e.event}`;
            this.ensureAdj(a).push({ neighbor: b, relationType: '事件关联', sharedEvents: [eventText] });
            this.ensureAdj(b).push({ neighbor: a, relationType: '事件关联', sharedEvents: [eventText] });
          }
        }
      }
    }
  }

  private ensureAdj(name: string) {
    if (!this.adjacency.has(name)) this.adjacency.set(name, []);
    return this.adjacency.get(name)!;
  }

  /**
   * 最短路径：从 A 到 B 最少通过几个中间角色
   */
  shortestPath(from: string, to: string): { path: string[]; relations: string[]; length: number } | null {
    if (from === to) return { path: [from], relations: [], length: 0 };
    if (!this.adjacency.has(from) || !this.adjacency.has(to)) return null;

    const visited = new Set<string>();
    const queue: Array<{ name: string; path: string[]; relations: string[] }> = [
      { name: from, path: [from], relations: [] },
    ];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.adjacency.get(current.name) || [];

      for (const n of neighbors) {
        if (visited.has(n.neighbor)) continue;
        const newPath = [...current.path, n.neighbor];
        const newRels = [...current.relations, n.relationType];

        if (n.neighbor === to) {
          return { path: newPath, relations: newRels, length: newPath.length - 1 };
        }

        visited.add(n.neighbor);
        queue.push({ name: n.neighbor, path: newPath, relations: newRels });
      }
    }

    return null;
  }

  /**
   * N 跳邻居：找出距离 <= maxHops 的所有角色
   */
  neighborsWithin(name: string, maxHops: number): Array<{ name: string; hops: number; relation: string }> {
    if (!this.adjacency.has(name)) return [];

    const visited = new Map<string, number>(); // name → hops
    const result: Array<{ name: string; hops: number; relation: string }> = [];
    const queue: Array<{ name: string; hops: number; relation: string }> = [
      { name, hops: 0, relation: '自己' },
    ];
    visited.set(name, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.hops > 0) result.push(current);

      const neighbors = this.adjacency.get(current.name) || [];
      for (const n of neighbors) {
        const newHops = current.hops + 1;
        if (newHops > maxHops) continue;
        if (visited.has(n.neighbor) && visited.get(n.neighbor)! <= newHops) continue;
        visited.set(n.neighbor, newHops);
        queue.push({ name: n.neighbor, hops: newHops, relation: n.relationType });
      }
    }

    return result.sort((a, b) => a.hops - b.hops);
  }

  /**
   * 将图遍历结果转为 AI 可读文本（用于注入 prompt）
   */
  toRelationContext(focalCharacter: string, maxHops: number = 2): string {
    const neighbors = this.neighborsWithin(focalCharacter, maxHops);
    if (neighbors.length === 0) return '';

    const lines: string[] = [];
    // 按跳数分组
    const byHops: Record<number, typeof neighbors> = {};
    for (const n of neighbors) {
      if (!byHops[n.hops]) byHops[n.hops] = [];
      byHops[n.hops].push(n);
    }

    for (const [hops, ns] of Object.entries(byHops)) {
      if (parseInt(hops) === 1) {
        lines.push('直接关系：');
      } else {
        lines.push(`${hops} 跳关系：`);
      }
      for (const n of ns.slice(0, 5)) {
        const node = this.nodes.get(n.name);
        const traits = node?.traits?.join('/') || '';
        lines.push(`  ${n.name}${traits ? '（' + traits + '）' : ''}：${n.relation}`);
      }
    }

    // 最长路径示例
    if (neighbors.length >= 3) {
      const far = neighbors[neighbors.length - 1];
      const path = this.shortestPath(focalCharacter, far.name);
      if (path && path.length >= 3) {
        lines.push(`\n关系链示例：${path.path.join(' → ')}`);
      }
    }

    return '----- RELATION GRAPH -----\n' + lines.join('\n');
  }
}
