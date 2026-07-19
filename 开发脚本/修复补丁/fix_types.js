const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/types/index.ts', 'utf8');

// Add missing fields to World interface
t = t.replace(
  "writingStyle: string;\n  styleSamples: string[];",
  "writingStyle: string;\n  styleSamples: string[];\n  styleFeatures?: string;   // 同人模式：AI 提取的写作风格\n  totalChapters?: number;    // 同人模式：原著总章节数\n  characters?: any[];        // 同人模式：原著角色（暂存，可能移入 KB）\n  keyDecisions?: any[];      // 同人模式：原著关键选择"
);

// Add missing fields to WorldSession
t = t.replace(
  "export interface WorldSession {\n  id: string;\n  world: World;\n  selectedCharacters: Character[];\n  npcs: WorldNpc[];\n  currentScene: string;\n  worldState: string;\n  worldBible?: string;\n  butterflyLog: string[];\n  timelineDeviations: string[];\n  recentWorldEvents: string[];\n  worldLog: WorldLogEntry[];\n  messages: ChatMessage[];\n  createdAt: string;\n  memories?: string[];\n  currentChapter?: number;\n  worldNovelId?: string;\n  timelinePosition?: TimelinePosition;\n}",
  "export interface WorldSession {\n  id: string;\n  world: World;\n  selectedCharacters: Character[];\n  npcs: WorldNpc[];\n  currentScene: string;\n  worldState: string;\n  worldBible?: string;\n  butterflyLog: string[];\n  timelineDeviations: string[];\n  recentWorldEvents: string[];\n  worldLog: WorldLogEntry[];\n  messages: ChatMessage[];\n  createdAt: string;\n  memories?: string[];         // 提取的记忆条目\n  currentChapter?: number;     // 当前章节（0-based）\n  worldNovelId?: string;       // 关联 NovelStorage\n  timelinePosition?: TimelinePosition;\n  characterAttitudes?: Record<string, any>;  // 角色态度\n  fanficConfig?: FanficConfig;  // 同人配置\n  dynamicState?: DynamicState;  // 动态状态\n}"
);

// Add DynamicState interface
t = t.replace(
  "export interface FanficWorldCard {",
  "export interface DynamicState {\n  butterflyDeviations?: string[];\n  memorySummaries?: string[];\n  worldImpact?: number;\n}\n\nexport interface FanficConfig {\n  entryTimepoint?: string;\n  type?: 'soul' | 'body';\n  targetCharacterId?: string;\n}\n\nexport interface FanficWorldCard {"
);

fs.writeFileSync('D:/koyoi/src/types/index.ts', t);
console.log('types enhanced');
