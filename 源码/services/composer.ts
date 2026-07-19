// ============================================================
//  提示词拼接引擎 (Composer)
//  职责：将世界规则、角色卡、记忆、玩法规则拼接成
//  每次 API 请求的 messages 数组
//
//  缓存优化策略：
//  - 稳定内容（框架、世界、角色卡）作为多个独立 system message
//  - 每段独立，系统自动检测公共前缀并缓存
//  - 变动内容（记忆、偏差、对话历史）放在最后
// ============================================================

import type {
  Character,
  World,
  Session,
  GameMode,
  ChatMessage,
} from '../types';
import {
  BASE_FRAMEWORK,
  MODE_CHAT,
  MODE_ADVENTURE,
  MODE_DOMINATION,
  MODE_FANFIC,
} from '../prompts/templates/base';

// ---- 拼接参数 ----

export interface ComposeParams {
  character: Character;
  world: World;
  session: Session;
  mode: GameMode;
  userMessage: string;
  postHistory?: string;
  floatingNote?: string;
  floatingDepth?: number;
  userPersona?: string;
}

export interface ComposeResult {
  messages: ChatMessage[];
  /** 估算的稳定前缀 token 数（参考意义） */
  estimatedPrefixTokens: number;
}

// ---- 模式规则映射 ----

function getModeRules(mode: GameMode, character: Character, session?: Session): string {
  let rules: string;

  switch (mode) {
    case 'chat':
      rules = MODE_CHAT;
      break;
    case 'adventure':
      rules = MODE_ADVENTURE;
      break;
    case 'domination':
      rules = MODE_DOMINATION
        .replace('{{POWER_DYNAMIC}}', 'Player is dominant')
        .replace('{{SUBMISSION}}', String(character.relationship.submission))
        .replace('{{AROUSAL}}', String(character.relationship.arousal))
        .replace('{{PERSONALITY_TRAITS}}', character.personality.traits.join(', '));
      break;
    case 'fanfic':
      rules = MODE_FANFIC
        .replace('{{NOVEL_TITLE}}', session?.fanficConfig?.entryTimepoint || 'Unknown')
        .replace('{{TRANSMIGRATION_TYPE}}', session?.fanficConfig?.type === 'soul'
          ? 'soul transmigration (occupying a character\'s body)'
          : 'body transmigration (arriving in their own body)')
        .replace('{{WRITING_STYLE}}', '文风要求：请匹配原著的写作风格、人物说话方式和叙事节奏。')
        .replace('{{ORIGINAL_TIMELINE}}', 'See world rules for timeline reference.')
        .replace('{{TIMELINE_DEVIATIONS}}', session?.dynamicState?.butterflyDeviations?.join('\n') || 'No deviations yet.');
      break;
    case 'workshop':
      rules = MODE_CHAT;
      break;
    default:
      rules = MODE_CHAT;
  }

  return rules;
}

// ---- 角色卡转文本 ----

function characterToPrompt(c: Character): string {
  const parts: string[] = [];

  // 基础信息
  parts.push(`Name: ${c.name}`);
  parts.push(`Gender: ${c.gender}`);
  parts.push(`Age: ${c.age}`);

  // 外貌
  parts.push(`\nPhysical Appearance:`);
  parts.push(`Height: ${c.appearance.height}`);
  parts.push(`Body Type: ${c.appearance.bodyType}`);
  parts.push(`Bust: ${c.appearance.bust}`);
  parts.push(`Waist: ${c.appearance.waist}`);
  parts.push(`Hips: ${c.appearance.hips}`);
  parts.push(`Skin: ${c.appearance.skinTone}`);
  parts.push(`Hair: ${c.appearance.hairStyle}`);
  parts.push(`Facial Features: ${c.appearance.facialFeatures}`);
  parts.push(`Intimate Details: ${c.appearance.intimateDetails}`);

  // 性格
  parts.push(`\nPersonality:`);
  parts.push(`Traits: ${c.personality.traits.join(', ')}`);
  parts.push(`How these traits show through behavior:`);
  parts.push(...c.personality.traits.map(t => getTraitBehavior(t)));
  parts.push(`Speaking Style: ${c.personality.speakingStyle}`);
  if (c.personality.mbti) parts.push(`MBTI: ${c.personality.mbti}`);
  parts.push(`Habits: ${c.personality.habits.join(', ')}`);
  parts.push(`Likes: ${c.personality.likes.join(', ')}`);
  parts.push(`Dislikes: ${c.personality.dislikes.join(', ')}`);

  // 性偏好
  parts.push(`\nSexual Profile:`);
  parts.push(`Libido: ${c.sexualProfile.libido}/10`);
  parts.push(`Experience: ${c.sexualProfile.experience}/10`);
  parts.push(`Dominance: ${c.sexualProfile.dominance}/10 (0=completely submissive, 10=completely dominant)`);
  parts.push(`Kinks/Fetishes: ${c.sexualProfile.kinks.join(', ')}`);
  parts.push(`Soft Limits: ${c.sexualProfile.softLimits.join(', ')}`);
  parts.push(`Hard Limits (NEVER BREACH): ${c.sexualProfile.hardLimits.join(', ')}`);
  parts.push(`Sensitive Zones: ${c.sexualProfile.sensitiveZones.join(', ')}`);
  parts.push(`Sexual Response Pattern: ${c.sexualProfile.sexualResponse}`);

  // 背景
  if (c.backstory) {
    parts.push(`\nBackstory: ${c.backstory}`);
  }

  // 世界观上下文
  parts.push(`\nWorld Context: ${worldContextToText(c)}`);

  // 自主行为
  parts.push(`\nAutonomy:`);
  parts.push(`Personal Goals: ${c.autonomy.goals.join(', ')}`);
  parts.push(`Daily Schedule: ${c.autonomy.schedule}`);
  parts.push(`Agency Level: ${c.autonomy.agency}/10`);

  // 示例对话（few-shot）
  if (c.exampleDialogues.length > 0) {
    parts.push(`\nExample Dialogue Style:`);
    c.exampleDialogues.slice(0, 3).forEach(d => {
      parts.push(`Player: ${d.user}`);
      parts.push(`${c.name}: ${d.character}`);
    });
  }

  return parts.join('\n');
}

function worldContextToText(c: Character): string {
  const ctx = c.worldContext;
  switch (ctx.type) {
    case 'modern':
      return `Occupation: ${ctx.occupation}, Social Class: ${ctx.socialClass}`;
    case 'cultivation':
      return `Cultivation Realm: ${ctx.realm}, Sect: ${ctx.sect}, Techniques: ${ctx.techniques.join(', ')}`;
    case 'fantasy':
      return `Race: ${ctx.race}, Class: ${ctx.class}, Mana Affinity: ${ctx.manaAffinity}`;
    case 'cyberpunk':
      return `Corporation: ${ctx.corp}, Implants: ${ctx.implants.join(', ')}, Net Worth: ${ctx.networth}`;
    case 'apocalypse':
      return `Faction: ${ctx.faction}, Role: ${ctx.role}, Mutations: ${ctx.mutations}`;
    case 'historical':
      return `Dynasty: ${ctx.dynasty}, Rank: ${ctx.rank}, Family: ${ctx.family}`;
    case 'campus':
      return `Grade: ${ctx.grade}, Club: ${ctx.club}, Social Circle: ${ctx.socialCircle}`;
    case 'fanfic':
      return `Source Novel: ${ctx.sourceNovel}, Original Role: ${ctx.originalRole}, Original Fate: ${ctx.originalFate}`;
    case 'custom':
      return Object.entries(ctx.customFields).map(([k, v]) => `${k}: ${v}`).join(', ');
    default:
      return '';
  }
}

// ---- 世界规则转文本 ----

function worldToPrompt(w: World): string {
  const lines: string[] = [];

  lines.push(`World Type: ${w.type}`);
  lines.push(`\nPhysics/Metaphysics: ${w.rules?.physics || ""}`);
  lines.push(`超自然: ${(w.rules?.supernatural || '').slice(0,60)}`);
  lines.push(`Technology Level: ${w.rules?.technology || ""}`);
  lines.push(`Social Structure: ${w.rules?.society || ""}`);
  lines.push(`Moral Framework: ${w.rules?.morality || ""}`);
  lines.push(`Sexual Norms: ${w.rules?.sexualNorms || ""}`);

  if (w.locations.length > 0) {
    lines.push(`\nImportant Locations:`);
    w.locations.forEach(loc => {
      lines.push(`- ${loc.name}: ${loc.description}`);
    });
  }

  if (w.factions.length > 0) {
    lines.push(`\nFactions:`);
    w.factions.forEach(f => {
      lines.push(`- ${f.name}: ${f.description} (Goal: ${f.goals})`);
    });
  }

  if (w.customRules) {
    lines.push(`\nCustom Rules: ${w.customRules}`);
  }

  return lines.join('\n');
}

// ---- 关系状态转文本 ----

function relationshipToPrompt(r: Character['relationship']): string {
  return [
    `Relationship Status: ${r.status}`,
    `Intimacy: ${r.intimacy}/100 (0=stranger, 30=acquaintance, 60=close, 90=lover)`,
    `Trust: ${r.trust}/100`,
    `Submission: ${r.submission}/100 (0=defiant, 50=neutral, 100=completely submissive)`,
    `Current Arousal: ${r.arousal}/100`,
  ].join('\n');
}

function contextToPrompt(ctx: Character['currentContext']): string {
  return [
    `Current Location: ${ctx.location} (evaluate appropriateness of sexual activity here)`,
    `Time: ${ctx.timeOfDay}`,
    `Character's Outfit: ${ctx.outfit}`,
    `Character's Current Mood: ${ctx.mood}`,
    `Recent Events: ${ctx.recentEvents}`,
  ].join('\n');
}

// ---- 主拼接函数 ----

export function composePrompt(params: ComposeParams): ComposeResult {
  const { character, world, session, mode, userMessage } = params;

  // 稳定前缀（会被缓存）—— 不包含任何会变化的数据
  const stableSystemMessages: ChatMessage[] = [
    {
      role: 'system',
      content: BASE_FRAMEWORK
        .replace('{{WORLD_RULES}}', worldToPrompt(world))
        .replace('{{CHARACTER_PROFILE}}', characterToPrompt(character))
        .replace('{{RELATIONSHIP_STATUS}}', '')  // 移入动态段，避免破坏缓存
        .replace('{{CURRENT_CONTEXT}}', '')       // 移入动态段
        .replace('{{MEMORIES}}', '')
        .replace('{{MODE_RULES}}', getModeRules(mode, character, session))
        .replace('{{USER_PERSONA}}', params.userPersona || 'The player is an adult interacting with the character.'),
      timestamp: new Date().toISOString(),
    },
  ];

  // 段2：同人模式额外信息（稳定，同人世界不变）
  if (mode === 'fanfic' && session.fanficConfig) {
    stableSystemMessages.push({
      role: 'system',
      content: formatFanficContext(session),
      timestamp: new Date().toISOString(),
    });
  }

  // 动态段：所有会变的数据集中在这里（不缓存，量小）
  const dynamicMessage: ChatMessage = {
    role: 'system',
    content: [
      `[玩家画像] ${params.userPersona || '一个成年人'}`,
      `[关系] ${relationshipToPrompt(character.relationship)}`,
      `[场景] ${contextToPrompt(character.currentContext)}`,
      session.dynamicState.memorySummaries.length > 0
        ? `[记忆] ${session.dynamicState.memorySummaries.slice(-5).join('；')}`
        : '',
      session.dynamicState.butterflyDeviations.length > 0
        ? `[时间线偏离] ${session.dynamicState.butterflyDeviations.slice(-3).join('；')}`
        : '',
      session.dynamicState.worldEvents.length > 0
        ? `[世界事件] ${session.dynamicState.worldEvents.slice(-3).join('；')}`
        : '',
    ].filter(Boolean).join('\n'),
    timestamp: new Date().toISOString(),
  };

  // 构建完整 messages 数组
  const messages: ChatMessage[] = [
    ...stableSystemMessages,
    dynamicMessage,
    // 对话历史（最近的 N 轮）
    ...session.messages.slice(-40), // 1M 上下文可以轻松容纳
    // 当前用户消息
    {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    },
  ];

  // Post-History（末尾，最高优先级）
  if (params.postHistory) {
    messages.push({ role: 'system', content: params.postHistory, timestamp: new Date().toISOString() });
  }

  // Author's Note（浮动提示词：混入对话倒数第N条，不贴末尾）
  if (params.floatingNote) {
    const depth = params.floatingDepth || 3;
    const insertAt = messages.length - Math.min(depth, messages.length - 3);
    if (insertAt > 2) {
      messages.splice(insertAt, 0, { role: 'system', content: `[World Note] ${params.floatingNote}`, timestamp: new Date().toISOString() });
    }
  }

  // 估算前缀 token 数（中文约 1.5 字符/token，英文约 4 字符/token）
  const prefixText = stableSystemMessages.map(m => m.content).join('');
  const estimatedPrefixTokens = Math.ceil(prefixText.length / 2.5);

  return { messages, estimatedPrefixTokens };
}

// ---- 辅助函数 ----

function formatMemories(c: Character): string {
  if (c.memories.length === 0) return 'No significant memories yet.';

  const important = c.memories
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15);

  return important.map(m =>
    `- [${m.type}] ${m.content} (importance: ${m.importance})`
  ).join('\n');
}

function formatFanficContext(session: Session): string {
  const fc = session.fanficConfig;
  if (!fc) return '';

  return [
    `[Fanfic World Context]`,
    `Transmigration Type: ${fc.type === 'soul' ? 'Soul Transmigration (魂穿)' : 'Body Transmigration (身穿)'}`,
    fc.type === 'soul' ? `Occupied Character: ${fc.targetCharacterId || 'Unknown'}` : '',
    `Original Soul Status: ${fc.originalSoulStatus}`,
    `Entry Time Point: ${fc.entryTimepoint}`,
    `Entry Location: ${fc.entryLocation}`,
    fc.playerAppearance ? `Player Appearance: ${fc.playerAppearance}` : '',
    `Player knows original plot: ${fc.playerAbilities.plotKnowledge ? 'Yes' : 'No'}`,
    `Player has modern knowledge: ${fc.playerAbilities.modernKnowledge ? 'Yes' : 'No'}`,
    `Historical Inertia: ${fc.worldParams.inertia} (0=free, 1=fixed)`,
    `Butterfly Sensitivity: ${fc.worldParams.butterflySensitivity} (0=stable, 1=chaotic)`,
    `Character Awareness: ${fc.worldParams.characterAwareness === 'treatAsOriginal' ? 'Characters treat player as the original person' : 'Characters know player is a transmigrator'}`,
  ].filter(Boolean).join('\n');
}

// ---- 后台任务专用拼接 ----

/**
 * 为世界评估任务拼接精简 prompt
 * 前缀稳定（世界规则 + 时间线），便于缓存命中
 */
export function composeWorldEvalPrompt(
  world: World,
  recentEvents: string,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        `You are a world simulation evaluator. Analyze recent events in a fictional world and determine:`,
        `1. What butterfly effects have been triggered by recent player actions?`,
        `2. How does the current timeline deviate from the original?`,
        `3. What chain reactions are likely to unfold next?`,
        `4. Are any high-inertia events approaching in altered form?`,
        ``,
        `World Rules:`,
        worldToPrompt(world),
        ``,
        `Original Timeline:`,
        ...world.timeline.map(e =>
          `- ${e.description} (Inevitability: ${e.inevitability}, Status: ${e.status})`
        ),
      ].join('\n'),
      timestamp: new Date().toISOString(),
    },
    {
      role: 'user',
      content: `Recent events to evaluate:\n${recentEvents}\n\nAnalyze butterfly effects and output structured results.`,
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * 为记忆提取任务拼接精简 prompt
 */
export function composeMemoryExtractPrompt(
  character: Character,
  recentDialogue: string,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        `You are a memory extraction system. Read the recent dialogue between a player and a character, and extract key events that should be remembered long-term.`,
        ``,
        `Character: ${character.name}`,
        `Character Personality: ${character.personality.traits.join(', ')}`,
        ``,
        `Extract events of these types:`,
        `- milestone: significant relationship developments`,
        `- discovery: new information about preferences, sensitive zones, fears`,
        `- boundary: expressions of limits or consent`,
        `- event: notable occurrences that affect the story`,
        ``,
        `Output ONLY valid JSON array of memory objects:`,
        `[{"type": "...", "content": "具体描述(中文)", "importance": 1-10}]`,
        `If nothing significant happened, output empty array [].`,
      ].join('\n'),
      timestamp: new Date().toISOString(),
    },
    {
      role: 'user',
      content: recentDialogue,
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * 为智能路由拼接精简 prompt
 */
export function composeRouterPrompt(
  roundsSinceEval: number,
  roundsSinceAutonomy: number,
  recentActionImpact: number,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        `You are a game state router. Based on current metrics, decide which background tasks to trigger. Return ONLY valid JSON.`,
        ``,
        `Decision rules:`,
        `- worldEval: impact>=7 OR rounds>=10 OR majorWorldImpact=true`,
        `- autonomy: rounds>=20 OR keyCharacterInvolved OR majorWorldImpact`,
        `- memoryExtract: containsSignificantEvent OR relationshipChanged`,
      ].join('\n'),
      timestamp: new Date().toISOString(),
    },
    {
      role: 'user',
      content: JSON.stringify({
        roundsSinceWorldEval: roundsSinceEval,
        roundsSinceAutonomy: roundsSinceAutonomy,
        recentActionImpact,
      }),
      timestamp: new Date().toISOString(),
    },
  ];
}

function getTraitBehavior(trait: string): string {
  const map: Record<string, string> = {
    '傲娇': '嘴上说才不是关心你但行动出卖了她',
    '害羞': '不敢看对方的眼睛脸红从耳尖蔓延到脖子手指绞着衣角',
    '温柔': '轻声细语默默记住小习惯在需要时悄悄出现',
    '高冷': '话极少表情淡漠眼神像结了冰但目光会偷偷停留',
    '泼辣': '行动力极强不爽直接表达对自已人极其护短',
    '活泼': '笑声有感染力走路带风拉着人分享开心事',
    '倔强': '咬着嘴唇不肯认输眼里含泪背挺得笔直',
    '可爱': '表情丰富想到什么说什么做让人心头一软的小动作',
    '柔弱': '容易受伤需要保护但内心有惊人韧性',
    '强势': '习惯掌控说话不容反驳信任的人面前卸下铠甲',
    '腹黑': '笑容温和话里有话看似随意的安排都是精心设计',
    '纯真': '充满好奇相信美好眼神清澈像没被污染过的湖水',
    '成熟': '稳重可靠懂得照顾人是让人安心的存在',
    '忧郁': '眼神飘向远方笑容很淡沉默里藏着很深的过去',
    '痴女': '极度热情毫不掩饰渴望主动得让人招架不住',
  };
  return '  ' + trait + ': ' + (map[trait] || '通过具体行动展现而非直接描述');
}

