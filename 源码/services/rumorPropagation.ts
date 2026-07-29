// ============================================================
//  谣言与信息传播系统
//  核心原理：关于玩家的信息不会停留在原地。
//  它通过角色的社交网络传播，在传播过程中扭曲。
//  NPC 对你的看法可能来自他们听说的事，而非亲眼所见。
// ============================================================

import type { WorldSession, NotableEvent, CharacterKnowledge } from '../types';
import type { KnowledgeGraph } from './knowledgeGraph';

// 需要被传播的事件关键词
const NOTABLE_PATTERNS = [
  // 暴力/冲突
  { regex: /打|揍|踹|扇|推倒|摔|砸|杀|砍|刺|血|吵架|骂|冲突/i, type: 'public_action' as const, impact: 5 },
  // 亲密/情感
  { regex: /吻|抱|亲|告白|表白|我爱你|喜欢|心动|牵手|依偎|约会|恋爱/i, type: 'relationship_shift' as const, impact: 4 },
  // 羞辱/权力
  { regex: /跪下|求饶|侮辱|羞辱|命令|威胁|惩罚|奖赏|批评|训斥/i, type: 'public_action' as const, impact: 4 },
  // 金钱/交易
  { regex: /钱|付款|买|卖|交易|赠送|借钱|还钱|工资|奖金|便宜|贵/i, type: 'public_action' as const, impact: 3 },
  // 秘密/信息
  { regex: /秘密|真相|其实|原来|不知道|发现|暴露|听说|据说|传闻|爆料/i, type: 'private_action' as const, impact: 3 },
  // 场景变化
  { regex: /离开|进入|到达|前往|消失|出现|走进|走出|回到|来到/i, type: 'scene_change' as const, impact: 2 },
  // 社交/日常
  { regex: /邀请|约|聚会|吃饭|一起|帮忙|求助|答应|拒绝|同意|商量/i, type: 'public_action' as const, impact: 2 },
  // 情绪/状态
  { regex: /哭|笑|叹气|发呆|紧张|尴尬|生气|惊讶|感动|失望|开心|难过/i, type: 'private_action' as const, impact: 2 },
];

/**
 * 从当前轮的用户行动和 AI 回复中提取值得传播的事件
 */
export function extractNotableEvents(
  session: WorldSession,
  userAction: string,
  aiResponse: string,
  round: number
): NotableEvent[] {
  console.log('[RUMOR] extractNotableEvents round=' + round);
  const combined = userAction + ' ' + aiResponse.slice(0, 1000);
  const events: NotableEvent[] = [];

  for (const pattern of NOTABLE_PATTERNS) {
    if (pattern.regex.test(combined)) {
      // 找出行动中涉及的角色
      const involvedChars = session.selectedCharacters
        .filter(c => combined.includes(c.name))
        .map(c => c.name);

      // 找出在场目击者（不在场的不算）
      const witnessChars = [
        ...session.selectedCharacters.map(c => c.name),
        ...(session.npcs || []).map(n => n.name),
      ].filter(n => n !== involvedChars[0]); // 排除行动主体

      events.push({
        id: 'ne_' + round + '_' + pattern.type,
        round,
        type: pattern.type,
        description: extractedDescription(combined, pattern),
        involvedChars,
        witnessChars,
        visibility: witnessChars.length > 1 ? 'public' : 'witness_only',
        impact: pattern.impact,
      });
    }
  }

  return events.slice(0, 3); // 最多 3 个事件
}

function extractedDescription(text: string, pattern: (typeof NOTABLE_PATTERNS)[0]): string {
  const match = text.match(new RegExp(`.{0,30}${pattern.regex.source}.{0,30}`, 'i'));
  return match ? match[0].trim().slice(0, 80) : text.slice(0, 80);
}

/**
 * 通过知识图谱传播谣言
 * 传播规则：
 * 1. 目击者 (1 hop) 直接知晓 → certainty 0.9
 * 2. 从目击者听说 (2 hop) → certainty 0.5-0.7
 * 3. 从 2 hop 再传 (3 hop) → certainty 0.2-0.4, 可能扭曲
 */
export function propagateRumors(
  session: WorldSession,
  graph?: KnowledgeGraph
): Record<string, CharacterKnowledge> {
  const knowledge: Record<string, CharacterKnowledge> = { ...session.characterKnowledge };
  const events = session.notableEvents || [];

  for (const event of events) {
    // 只传播 roundish 的事件
    const roundsSince = (session.worldClock || 0) - event.round;
    if (roundsSince > 20) continue;

    // Level 1: 目击者直接知晓
    for (const witness of event.witnessChars) {
      ensureKnowledge(knowledge, witness);
      addFact(knowledge[witness], {
        fact: event.description,
        certainty: event.visibility === 'public' ? 0.95 : 0.8,
        source: '亲眼所见',
        learnedAt: event.round,
      });
    }

    // Level 2: 如果知识图谱可用，沿关系传播
    if (graph) {
      for (const witness of event.witnessChars) {
        const neighbors = graph.neighborsWithin(witness, 2);
        for (const neighbor of neighbors) {
          if (event.witnessChars.includes(neighbor.name)) continue; // 跳过目击者
          ensureKnowledge(knowledge, neighbor.name);
          
          // 传播中的信息扭曲
          const distortedFact = distortFact(event.description, neighbor.hops);
          const certainty = Math.max(0.1, 0.7 - neighbor.hops * 0.25);
          
          addFact(knowledge[neighbor.name], {
            fact: distortedFact,
            certainty,
            source: `从${witness}听说`,
            learnedAt: event.round + neighbor.hops,
          });
        }
      }
    }
  }

  // 清理过于陈旧的信息
  for (const [name, k] of Object.entries(knowledge)) {
    k.knownFacts = k.knownFacts
      .filter(f => (session.worldClock || 0) - f.learnedAt < 30)
      .sort((a, b) => b.certainty - a.certainty)
      .slice(0, 10);
  }

  return knowledge;
}

/**
 * 信息在传播过程中扭曲——第三次转述已经和原文不同了
 */
function distortFact(fact: string, hops: number): string {
  if (hops <= 1) return fact;
  
  // 简化：越传越短越模糊
  const maxLen = Math.max(15, 80 - hops * 20);
  const distortions = [
    fact.slice(0, maxLen) + '…',
    '据说' + fact.slice(0, maxLen - 5) + '…',
    fact.replace(/具体|确切|准确/g, '大概').slice(0, maxLen) + '…',
  ];
  return distortions[Math.min(hops - 1, distortions.length - 1)];
}

function ensureKnowledge(knowledge: Record<string, CharacterKnowledge>, name: string) {
  if (!knowledge[name]) {
    knowledge[name] = { knownFacts: [] };
  }
}

function addFact(knowledge: CharacterKnowledge, fact: CharacterKnowledge['knownFacts'][0]) {
  // 去重：相同或高度相似的 fact 不重复添加
  const exists = knowledge.knownFacts.some(
    f => f.fact === fact.fact || similarity(f.fact, fact.fact) > 0.7
  );
  if (!exists) {
    knowledge.knownFacts.push(fact);
  }
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let matches = 0;
  for (let i = 0; i < shorter.length - 1; i++) {
    if (longer.includes(shorter.slice(i, i + 2))) matches++;
  }
  return matches / Math.max(1, shorter.length - 1);
}

/**
 * 将角色所知的信息转为 prompt 注入文本
 */
export function knowledgeToPrompt(
  knowledge: Record<string, CharacterKnowledge>,
  focalChars: string[]
): string {
  const relevant = focalChars.filter(name => knowledge[name]?.knownFacts?.length > 0);
  if (relevant.length === 0) return '';

  const lines: string[] = ['【信息传播——角色们知道什么】'];

  for (const name of relevant) {
    const facts = knowledge[name].knownFacts
      .filter(f => f.certainty > 0.2)
      .slice(0, 3);

    if (facts.length === 0) continue;

    const factLines = facts.map(f => {
      const certaintyLabel = f.certainty > 0.7 ? '确信' : f.certainty > 0.4 ? '听说' : '隐约知道';
      return `  ${certaintyLabel}：${f.fact}（来源：${f.source}）`;
    });

    lines.push(`${name}：`, ...factLines);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}
