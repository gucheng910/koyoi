# Koyoi 项目架构

## 概览

Koyoi 是一个 AI 互动小说引擎，基于 Expo SDK 56 + React Native + TypeScript + Zustand 构建。核心流程：上传小说 → AI 分章分析 → 魂穿到角色 → 沉浸式群像对话。

- **97 文件 / 965 节点** (codegraph 索引)
- **64 TS + 18 TSX** 源文件
- **入口**: `App.tsx`
- **API 层**: DeepSeek V4 (OpenAI 兼容)，`src/api/deepseek.ts`
- **存储**: AsyncStorage (会话) + FileSystem (小说章节) + SecureStore (API Key)
- **codegraph**: `C:\codegraph\codegraph.bat`，索引在 `D:\koyoi\.codegraph\`

## 核心路由 (App.tsx)

```
AppContent 根据状态渲染不同全屏视图：
  worldSession != null  → WorldChatScreen   (世界群像对话)
  showFanfic            → FanficScreen      (同人穿越：上传→分析→配置→开场)
  showWorldSetup        → WorldSetupScreen  (大世界设置)
  detailChar            → CharacterDetail   (角色详情)
  默认                  → HomeScreen         (世界列表 + 导入)
                           SettingsScreen / CharactersTab / CreateScreen (TabBar)
```

## 发送管线 (对话核心路径)

**旧**: `sendPipeline.ts` (600+ 行单体)
**新**: `sendPipeline/` 目录，8 个独立 stage 文件 + `index.ts` 重导出

```
WorldChatScreen.send()
  ├─ stage1_input.ts      processInput         — 输入文本组装
  ├─ stage2_summary.ts    maybeGenerateSummary — 每 10 轮压缩摘要
  ├─ stage3_context.ts    buildContext         — 上下文构建 + 章节感知
  ├─ stage4_simulation.ts runCharacterSimulation — 角色推演 + 好感度 + 行为画像
  ├─ stage5_assemble.ts   assemblePrompt       — 提示词组装 (稳定前缀 + 动态层)
  ├─ stage6_call.ts       callAI               — DeepSeek API 调用
  ├─ stage7_post.ts       postProcessResponse  — 抛光 + NPC 引入解析
  └─ stage8_hooks.ts      runPostSendHooks     — 后置钩子 (时钟/情绪/谣言/记忆/章节追踪/A2A)
```

调用方: `WorldChatScreen.tsx:26` 导入自 `sendPipeline/index`

## 服务层架构

### 小说分析引擎 (FanficScreen →)
```
pickAndUploadNovel (novelUploader.ts) → detectChapters → createNovel
analyzeAllChunks → analyzeChunk (2 阶段回退: 标准 → 简化)
buildKnowledgeBase → synthesizeTimeline → analyzeStyleFeatures
→ synthesizeAllBehaviors → saveKnowledgeBase → buildWorldCardFromKB
```

### 角色真实性系统
- `characterSimulator.ts` — 独立推演每个角色，输出 CharacterAction
- `characterBehaviorSynthesizer.ts` — 从角色数据合成决策引擎 (一次性 API)
- `characterAdapter.ts` — KB 角色 → Character 类型转换 (含 behaviorProfile)
- `chapterAwareFilter.ts` — 章节感知的知识边界过滤
- `entryChapterResolver.ts` — 穿越时间点解析 (纯函数)

### 世界生命力系统 (runPostSendHooks 触发)
- `emotionalInertia.ts` — 情绪记忆 + 衰减 (每轮)，≤10 强度，未表达情绪爆发预警
- `worldClock.ts` — 世界时钟递增 + 规则引擎候选事件 + AI 润色 (每 5 轮)
- `rumorPropagation.ts` — 值得注意事件提取 + 知识图谱 BFS 传播 + 信息逐跳扭曲
- `breatheWorld.ts` — 已有世界呼吸服务 (共存)
- `backgroundInteraction.ts` — A2A 背景互动

### 对话质量系统
- `dialogueContext.ts` — 章节感知上下文 + 偏离度 + 蝴蝶效应
- `memoryManager.ts` — 三池检索 (近期/关键词/重要) + 再摘要压缩
- `knowledgeGraph.ts` — BFS/最短路径/N 跳邻居 + 关系链可视化
- `promptTuner.ts` — 差评分类 + 即时微调 + few-shot 匹配
- `feedbackStore.ts` — 反馈收集 + 查询
- `scenarioInjector.ts` — 记忆闪回注入
- `chapterTracker.ts` — AI 自报章节位置
- `worldInfoService.ts` — World Info 深度控制

### 提示词系统
- `templates/base.ts` — BASE_FRAMEWORK + MODE_CHAT/ADVENTURE/DOMINATION/FANFIC
- `worldRules.ts` — WORLD_RULES (30 条) + NARRATOR_BASE + POST_HISTORY_BASE + VOCAB_LOCK
- `characters/presets.ts` — 预设角色 + 世界
- POLISH_SYSTEM — 在 `deepseek.ts` 中，13 条死规则去 AI 腔

### API 层 (deepseek.ts)
- `chatCompletion` — 流式/非流式
- `chatCompletionSync` — 同步非流式 (后台任务专用)
- `polishText` — 自抛光
- `executeParallel` — 并发执行器
- 共享内部函数: `buildHeaders`, `buildRequestBody`, `throwApiError`

### 存储 (Zustand stores)
- `configStore` — API 配置 (SecureStore)
- `worldStore` — 世界列表摘要 (AsyncStorage)
- `characterStore` — 自定义角色 (AsyncStorage)
- `personaStore` — 用户性别 (AsyncStorage)
- `sessionStore` — 对话会话 (仅在 ChatScreen 用)
- `usageStore` — API 用量追踪

## 类型系统 (types/index.ts)

核心类型链:
```
World → WorldSession → { world, selectedCharacters, npcs, currentScene, messages,
  worldClock, characterMoods, notableEvents, characterKnowledge, memories,
  currentChapter, worldNovelId, timelinePosition, worldBible, butterflyLog, ... }

Character → { personality: { traits, _deepProfile, promptOverride, behaviorProfile },
  relationship, appearance, sexualProfile, worldContext, autonomy, exampleDialogues }

Personality 包含: traits, speakingStyle, mbti, habits, likes, dislikes,
  behaviorProfile?: CharacterBehaviorProfile,
  _deepProfile?: string, promptOverride?: string

CharacterBehaviorProfile → { priorityHierarchy, pressurePoints, breakingPoint,
  relationshipPatterns, activeConflict, resolutionTendency, behavioralSummary }
```

## 已知架构特征

- `require()` 调用: **0** (全部消除为静态 import)
- 测试覆盖率: 4 个文件 (chapterSplitter, characterAdapter, costEstimate, utils)
- `as any` 转型: 已大幅减少 (Personality 正式化了 _deepProfile + promptOverride)
- 所有 catch 块: 关键路径有 console.warn 标记
- WorldChatScreen 导入: 单一来源 `sendPipeline/index`

## FanficScreen 现状

- ~1060 行，7 个导出符号
- 27 个 useState (待收敛为 useReducer)
- 6 个内联异步函数: pickAndUploadNovel 已提取到 novelUploader.ts
- 其余: parseNovel, buildOpening, appendFile, appendToExistingWorld, startGame
- `worldRepair.ts` 新增 `normalizeAllWorldData()` 用于无 AI 规则修补

## 常见操作

**增量索引**: `Set-Location D:\koyoi; C:\codegraph\codegraph.bat sync`
**查询**: 使用 `mcp_codegraph_codegraph_explore` + `projectPath: "D:\\koyoi"`
**读取文件**: `mcp_codegraph_codegraph_node` + `file` 参数
