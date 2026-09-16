// ============================================================
//  Koyoi - AI 成人文字游戏
//  类型定义
// ============================================================

// ---- API 配置 ----

export interface ApiConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;            // deepseek-v4-flash / deepseek-v4-pro
  thinkingMode: 'disabled' | 'low' | 'high';  // V4 思考深度
  reasoningEffort: 'low' | 'high';
  temperature: number;
  maxTokens: number;
  safetyFilter: 'off' | 'moderate' | 'strict';
  streamOutput: boolean;
  showSystemPrompt: boolean;
  autoPolish: boolean;        // 自动去翻译腔抛光
  isDefault: boolean;
}

// ---- 世界观 ----

export type WorldType =
  | 'modern'        // 现代都市
  | 'cultivation'   // 修仙世界
  | 'fantasy'       // 奇幻异世界
  | 'cyberpunk'     // 赛博朋克
  | 'apocalypse'    // 末日废土
  | 'historical'    // 古风王朝
  | 'campus'        // 校园
  | 'fanfic'        // 同人（从小说导入）
  | 'wuxia'         // 武侠
  | 'urban'         // 都市异能
  | 'interstellar'  // 星际科幻
  | 'game'          // 游戏世界
  | 'supernatural'  // 灵异/超自然
  | 'alternate_history'  // 架空历史
  | 'custom';       // 自定义

export interface WorldRules {
  physics: string;
  supernatural: string;
  technology: string;
  society: string;
  morality: string;
  sexualNorms: string;
  /** 文化/风俗（同人分析结果可能提供，预设世界未必填） */
  culture?: string;
}

export interface Faction {
  name: string;
  description: string;
  goals: string;
  relationships?: { targetFaction: string; relation: string }[];
}

export interface TimelineEvent {
  id: string;
  description: string;
  inevitability: number;    // 0-1，历史惯性强度
  causes: string[];         // 深层原因
  convergencePaths: string[]; // 替代形式
  originalOutcome: string;  // 原著中的结果
  actualOutcome?: string;   // 实际结果（玩家干预后）
  status: 'pending' | 'altered' | 'prevented' | 'occurred';
}

export interface World {
  id: string;
  name: string;
  type: WorldType;
  /** 世界简介（预设世界卡使用） */
  description?: string;
  rules: WorldRules;
  locations: { name: string; description: string }[];
  factions: Faction[];
  timeline: TimelineEvent[];
  inertia: {
    majorEvents: number;
    characterFate: number;
    worldReaction: number;
  };
  butterflySensitivity: {
    minor: string;
    major: string;
  };
  writingStyle?: string;
  styleSamples?: string[];
  /** AI 分析的写作风格特征（句长/节奏/修辞等），用于润色对齐 */
  styleFeatures?: string;
  customRules?: string;
  abilities?: AbilityState[];  // 能力状态时间线（动态规则系统，同人模式用）
  foreshadows?: Foreshadow[];  // 伏笔清单（同人模式用）
  milestones?: RelationshipMilestoneSet[];  // 关系里程碑（同人模式用）
  scenes?: SignatureScene[];  // 名场面清单（同人模式用）
  characters?: Character[];  // 同人世界：从原著解析的所有角色
  keyDecisions?: { who: string; dilemma: string; chose: string; consequence: string }[];
}

// ---- 角色 ----

export interface Appearance {
  height: string;
  bodyType: string;
  /** 可选：手动创建的角色未必填写三围 */
  bust?: string;
  waist?: string;
  hips?: string;
  skinTone: string;
  hairStyle: string;
  facialFeatures: string;
  /** 私密细节描述（预设角色卡 / 卡牌导入使用） */
  intimateDetails?: string;
}

export interface Personality {
  traits: string[];
  speakingStyle: string;
  mbti?: string;
  habits: string[];
  likes: string[];
  dislikes: string[];
  /** 深层性格（隐藏的真实面），同人分析 / 预设角色卡使用 */
  deepTraits?: string[];
  /** 防御机制，如"用冷漠保护自己" */
  defenseMechanism?: string;
  /** 矛盾点，如"表面大大咧咧内心敏感" */
  contradictions?: string;
  behaviorProfile?: CharacterBehaviorProfile;
  promptOverride?: string;
  _deepProfile?: string;
}

export interface Relationship {
  intimacy: number;         // 0-100
  trust: number;            // 0-100
  arousal?: number;         // 0-100，可选：预设角色卡未必填
  /** 服从度 0-100，支配/调教模式与卡牌导入使用 */
  submission?: number;
  status: string;           // 关系状态描述
}

/** 角色的性向档案（预设角色卡 / 卡牌导入使用） */
export interface SexualProfile {
  libido: number;
  experience: number;
  dominance: number;
  kinks?: string[];
  softLimits?: string[];
  hardLimits?: string[];
  sensitiveZones?: string[];
  sexualResponse?: string;
}

export interface CharacterMemory {
  type: 'milestone' | 'discovery' | 'boundary' | 'event';
  content: string;
  timestamp: string;
  importance: number;       // 1-10
}

export interface ExampleDialogue {
  user: string;
  character: string;
}

export interface CurrentContext {
  location: string;
  timeOfDay: string;
  mood: string;
  outfit: string;
  recentEvents: string;
}

// 世界观上下文（根据世界类型展开）
export type WorldContext =
  | { type: 'modern'; occupation: string; socialClass: string }
  | { type: 'cultivation'; realm: string; sect: string; techniques: string[] }
  | { type: 'fantasy'; race: string; class: string; manaAffinity: string }
  | { type: 'cyberpunk'; corp: string; implants: string[]; networth: string }
  | { type: 'apocalypse'; faction: string; role: string; mutations: string }
  | { type: 'historical'; dynasty: string; rank: string; family: string }
  | { type: 'campus'; grade: string; club: string; socialCircle: string }
  | { type: 'wuxia'; occupation: string; socialClass: string; sect?: string; martialArt?: string }
  | { type: 'interstellar'; occupation: string; socialClass: string; faction?: string; ship?: string }
  | { type: 'game'; occupation: string; socialClass: string; playerClass?: string; guild?: string }
  | { type: 'fanfic'; sourceNovel: string; originalRole: string; originalFate: string }
  | { type: 'custom'; customFields: Record<string, string>; sourceNovel?: string; originalRole?: string; originalFate?: string };

export interface AutonomyProfile {
  goals: string[];
  schedule: string;
  agency: number;           // 0-10，自主行动意愿
}

export interface Character {
  id: string;
  name: string;
  worldId: string;
  gender: 'female' | 'male' | 'other';
  age: string;
  /** 身份/职业。同人分析结果与预设卡片使用；手动创建角色的卡未必有 */
  role?: string;
  appearance: Appearance;
  personality: Personality;
  relationship: Relationship;
  /** 性向档案（预设角色卡 / 卡牌导入使用） */
  sexualProfile?: SexualProfile;
  backstory: string;
  worldContext: WorldContext;
  autonomy: AutonomyProfile;
  memories: CharacterMemory[];
  exampleDialogues: ExampleDialogue[];
  currentContext: CurrentContext;
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- 游戏模式 ----

export type GameMode =
  | 'chat'          // 角色沉浸对话
  | 'narrative'     // 情色叙事（第二人称）
  | 'adventure'     // 文本冒险（CYOA）
  | 'domination'    // 调教/支配
  | 'workshop'      // 场景工坊
  | 'fanfic';       // 同人穿越

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  worldType: WorldType;
  initialPrompt: string;
  tags: string[];
}

// ---- 同人系统 ----

export interface DynamicState {
  butterflyDeviations?: string[];
  memorySummaries?: string[];
  worldImpact?: number;
}

export interface FanficConfig {
  entryTimepoint?: string;
  type?: 'soul' | 'body';
  targetCharacterId?: string;
}

/** 伏笔（长线叙事元素）：埋设→回收，未回收期间持续注入提示词 */
export interface Foreshadow {
  name: string;      // 伏笔名（如头绳）
  planted: number;   // 埋设章节（1-based）
  hint?: string;     // 线索描述
  payoff?: number;   // 回收章节（运行时自动标记）
  resolved?: boolean;// 是否已回收
}

/** 关系里程碑：某角色的关系发展关键节点（运行时事件匹配自动标记达成） */
export interface RelationshipMilestone {
  name: string;         // 节点名（如获救确定关系）
  boundEvent: string;   // 绑定事件描述（用于剧情匹配，10字内）
  chapter?: number | null;  // 参考章节
  achieved?: boolean;   // 是否已达成
}

export interface RelationshipMilestoneSet {
  character: string;
  milestones: RelationshipMilestone[];
}

/** 名场面：影响全局的关键场面，运行时情境匹配后注入原著走向提示 */
export interface SignatureScene {
  title: string;              // 场面名
  trigger?: {
    location?: string;        // 触发地点
    characters?: string[];    // 关键角色
    keywords?: string[];      // 触发关键词
  };
  originalPlot: string;       // 原著此处剧情走向
  butterflyHint?: string;     // 蝴蝶效应提示
  chapter: number;            // 参考章节（1-based）
}

/** 能力状态（动态规则系统）：能力随章节时间轴变化 */
export interface AbilityState {
  name: string;
  start: number;       // 起始章节（1-based）
  end?: number | null; // 退化/结束章节
  status: 'active' | 'degraded';
  details: string;     // 能力描述与限制
  owner?: string;      // 能力拥有者角色名（魂穿/身穿视角判断用）
}

export interface FanficWorldCard {
  id: string;
  novelTitle: string;
  writingStyle?: string;
  styleSamples?: string[];
  novelAuthor?: string;
  worldType: WorldType;
  rules: WorldRules;
  locations: { name: string; description: string }[];
  factions: Faction[];
  timeline: TimelineEvent[];
  characters: Character[];  // 从原著提取的角色
  keyDecisions?: { who: string; dilemma: string; chose: string; consequence: string }[];
  totalChapters: number;
  parsedAt: string;
  styleFeatures?: string;   // AI 分析的写作风格特征（句长/节奏/修辞等）
  abilities?: AbilityState[];  // 能力状态时间线（动态规则）
  foreshadows?: Foreshadow[];  // 伏笔清单
  milestones?: RelationshipMilestoneSet[];  // 关系里程碑
  scenes?: SignatureScene[];  // 名场面清单
  /** 运行时标记：该卡片已被 normalizeAllWorldData 修补过，避免重复修补 */
  _normalized?: boolean;
}

// ---- 章节分割 & 存储 ----

export interface ChapterMeta {
  index: number;          // 章节序号，从 0 开始
  title: string;          // 章节标题，如"第一章 穿越"
  startChar: number;      // 在原文本中的起始字符位置
  endChar: number;        // 在原文本中的结束字符位置
  charCount: number;      // 字数
  isSpecial: boolean;     // 是否为特殊章节（序章/尾声/番外）
  specialType?: 'prologue' | 'epilogue' | 'extra';
}

export interface NovelMeta {
  id: string;                  // = world_id
  title: string;               // 用户可改的世界名
  originalFileName: string;    // 上传时的文件名
  totalChars: number;
  chapterCount: number;
  chapters: ChapterMeta[];
  createdAt: string;
  updatedAt: string;
}

export interface ChapterAnalyzeResult {
  chapterRange: [number, number];  // [起始章序号, 结束章序号]
  characters: Array<{
    name: string;
    aliases: string[];
    gender: string;
    role: string;
    traits: string[];          // 表面性格
    deepTraits: string[];       // 深层性格（隐藏的真实面）
    defenseMechanism: string;   // 防御机制（如"用幽默掩盖悲伤"）
    contradictions: string;     // 矛盾点（如"表面大大咧咧内心极度敏感"）
    signatureScenes: Array<{ chapter: number; description: string }>; // 标志性场景
    statusChanges: Array<{ chapter: number; from: string; to: string }>; // 状态变化
    habits: string[];
    speechStyle: string;
    speechSamples: Array<{ quote: string; chapter: number }>;
    firstAppear: number;
    lastAppear: number;
  }>;
  events: Array<{ chapter: number; time: string; event: string }>;
  relations: Array<{
    from: string;
    to: string;
    type: string;
    startChapter: number;
    changes: Array<{ chapter: number; from: string; to: string; evidence: string }>;
  }>;
  locations: Array<{ name: string; description: string; chapters: number[] }>;
  styleSamples: Array<{ text: string; chapter: number }>;
  worldRules?: string[];  // 本块提取的超自然能力/世界规则线索
  foreshadows?: Array<{ name: string; planted: number; hint?: string }>;  // 本块提取的伏笔
}

// ---- 知识库 ----

export interface KnowledgeBase {
  worldId: string;
  analyzedAt: string;
  chapterCount: number;
  analyzedChunks: number;
  characters: ChapterAnalyzeResult['characters'];
  relations: ChapterAnalyzeResult['relations'];
  plot: Array<{ chapter: number; summary: string }>;
  worldSettings: {
    supernatural: string;
    society: string;
    culture: string;
    architecture: string;
    geography: string;
    sexualNorms: string;
    worldType?: string;   // AI 判定的世界观类型（cultivation/modern/campus/...）
    abilities?: AbilityState[];  // 能力状态时间线（动态规则系统）
    foreshadows?: Foreshadow[];  // 伏笔清单（动态叙事元素）
    milestones?: RelationshipMilestoneSet[];  // 关系里程碑（按角色）
    scenes?: SignatureScene[];  // 名场面清单（情境匹配注入）
  };
  styleProfile: Array<{ chapterRange: [number, number]; traits: string; samples: string[] }>;
  globalTimeline: Array<{
    chapter: number;
    time: string;
    event: string;
    involvedCharacters: string[];
  }>;
  worldRuleClues?: string[];  // 各块汇总的能力/规则线索（供全局合成归纳）
  foreshadows?: Foreshadow[];  // 汇总的伏笔清单（运行时按章节注入）
}

export interface TransmigrationConfig {
  type: 'soul' | 'body';               // 魂穿 / 身穿
  targetCharacterId?: string;          // 魂穿目标角色
  originalSoulStatus: 'gone' | 'dormant' | 'coexisting'; // 原主意识
  entryTimepoint: string;              // 穿越时间点
  entryLocation: string;               // 出现地点（身穿）
  playerAppearance?: string;           // 身穿时的外貌
  playerAbilities: {
    modernKnowledge: boolean;
    plotKnowledge: boolean;            // 知道原著剧情
    noSpecialAbility: boolean;
  };
  worldParams: {
    inertia: number;                   // 0-1
    butterflySensitivity: number;      // 0-1
    characterAwareness: 'treatAsOriginal' | 'knowIsTransmigrator';
  };
}

// ---- 会话与消息 ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  choices?: string[];       // 文本冒险模式的选项
}

export interface Session {
  id: string;
  characterId: string;
  worldId: string;
  mode: GameMode;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  // 动态状态（每轮更新，不进入前缀）
  dynamicState: {
    relationshipSnapshot: Relationship;
    memorySummaries: string[];
    butterflyDeviations: string[];
    worldEvents: string[];
  };
  // 同人模式专用
  fanficConfig?: TransmigrationConfig;
}

// ---- 缓存追踪 ----

export interface CacheMetrics {
  hitTokens: number;
  missTokens: number;
  lastHitRate: number;
  totalCalls: number;
}

// ---- 后台任务 ----

export interface RouterDecision {
  worldEval: boolean;
  autonomy: boolean;
  memoryExtract: boolean;
  reason: string;
}

export interface WorldEvalResult {
  newDeviations: string[];
  timelineUpdates: TimelineEvent[];
  chainReactions: string[];
}

export interface MemoryExtractResult {
  newMemories: CharacterMemory[];
  relationshipDelta: Partial<Relationship>;
}

export interface AutonomyResult {
  characterActions: {
    characterId: string;
    action: string;
    impact: string;
  }[];
  worldEvent?: string;
}

// ---- 角色行为画像 ----

export interface CharacterBehaviorProfile {
  priorityHierarchy?: string;
  pressurePoints: string[];
  breakingPoint?: string;
  relationshipPatterns?: string;
  activeConflict?: string;
  resolutionTendency?: string;
  behavioralSummary: string;
}

// ---- 情绪与知识系统 ----

export interface CharacterMoodState {
  emotion: string;
  intensity: number;       // 1-10
  cause?: string;
  sinceRound: number;
  expressed: boolean;
}

export interface CharacterKnowledge {
  knownFacts: Array<{
    fact: string;
    certainty: number;     // 0-1
    source?: string;       // 信息来源
    learnedAt?: number;    // 得知时的轮次
  }>;
}

/** 长期记忆条目（memoryManager 三池检索 + worldInfoService 提取共用） */
export interface MemoryItem {
  content: string;
  importance: number;    // 1-5
  type: 'core' | 'bedrock';
  weight: number;
  lastActivated: number; // timestamp
  reSummarized?: boolean;
}

export interface NotableEvent {
  id: string;
  round: number;
  type: 'public_action' | 'relationship_shift' | 'scene_change' | 'private_action';
  description: string;
  involvedChars: string[];
  witnessChars: string[];
  visibility: 'public' | 'witness_only';
  impact: number;
}

// ---- 大世界会话 ----

export interface WorldNpc {
  name: string;
  description?: string;
  role: string;
  personality: string;
  currentStatus: string;
  goal?: string;
}

export interface WorldLogEntry {
  id: string;
  type: 'world_event' | 'character_action' | 'player_milestone' | 'chain_reaction' | 'timeline_check';
  content: string;
  timestamp: string;
  round: number;
  relatedChars?: string[];
}

/**
 * 往事回响。
 *
 * 存在的理由：状态若只在当轮结算完就消失，"世界"读起来就是一台即时响应的
 * 状态机——你做什么它立刻反应，你不做它就静止。真实感来自**延迟**：
 * 第 5 轮说错的话，第 10 轮从别人嘴里、或者在一件不相关的事里冒出来。
 *
 * 由 stage8 在提取到值得注意的事件时按概率埋设，到期后由 stage5 注入一次。
 */
export interface EchoItem {
  id: string;
  /** 源事件发生在第几轮 */
  sourceRound: number;
  /** 计划在第几轮浮现 */
  dueRound: number;
  /** 回响的种子：源事件的一句话描述 */
  seed: string;
  /** 相关角色 */
  chars: string[];
  /** 是否已浮现过（浮现一次即作废，避免反复念旧事） */
  surfaced?: boolean;
}

export interface TimelinePosition {
  currentEventIndex: number;
  progress: number;
  upcomingEvents: { index: number; description: string; inevitability: number; timeUntilOccurs: string; status: 'on_track' | 'altered' | 'prevented'; }[];
  divergenceLevel: number;
  characterFateChanges: { characterId: string; originalFate: string; currentTrajectory: string; changed: boolean; }[];
  lastCheckRound: number;
}

export interface WorldSession {
  id: string;
  world: World;
  selectedCharacters: Character[];
  npcs: WorldNpc[];
  currentScene: string;
  worldState: string;
  worldBible?: string;
  butterflyLog: string[];
  timelineDeviations: string[];
  recentWorldEvents: string[];
  worldLog: WorldLogEntry[];
  messages: ChatMessage[];
  createdAt: string;
  memories?: MemoryItem[];
  currentChapter?: number;       // 当前所处章节（0-based），同人模式用
  worldNovelId?: string;         // 关联的 NovelStorage worldId，同人模式用
  fanficConfig?: TransmigrationConfig;  // 穿越配置（魂穿/身穿），同人模式用
  timelinePosition?: TimelinePosition;
  worldClock?: number;
  characterMoods?: Record<string, CharacterMoodState>;
  notableEvents?: NotableEvent[];
  characterKnowledge?: Record<string, CharacterKnowledge>;
  /** 待浮现的往事回响（见 EchoItem） */
  pendingEchoes?: EchoItem[];
}

export interface UserPersona {
  id: string;
  name: string;
  description: string;
  socialStatus: string;   // 社会地位，直接注入提示词
  gender: 'male' | 'female';
  worldType?: WorldType;
  isDefault: boolean;
}
