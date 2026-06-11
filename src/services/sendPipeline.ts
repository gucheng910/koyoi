// ============================================================
//  发送管线 — WorldChatScreen send 函数拆分
//
//  将 300+ 行 send 函数拆为 8 个独立阶段
//  每个阶段纯函数或可独立测试的异步函数
// ============================================================

import { chatCompletion, chatCompletionSync, polishText } from '../api/deepseek';
import { simulateCharacters } from '../services/characterSimulator';
import { buildDialogueContext, contextToPrompt } from '../services/dialogueContext';
import { getWorldInfo as getWorldInfoFn } from '../services/worldInfoService';
import { enhanceWithScenario } from '../services/scenarioInjector';
import { NARRATOR_BASE, NARRATOR_FANFIC_APPEND, VOCAB_LOCK, POST_HISTORY_BASE, WORLD_RULES } from '../prompts/worldRules';
import type { WorldSession, ChatMessage, Character } from '../types';
import type { CharacterAction } from '../services/characterSimulator';
import type { ApiConfig } from '../types';

// ── 阶段 1: 输入处理 ──
export interface InputResult {
  finalText: string;
  userMsg: ChatMessage;
  msgsWithUser: ChatMessage[];
}

export function processInput(
  segments: { text: string; tag: string }[],
  messages: ChatMessage[]
): InputResult {
  const finalText = segments.map(s => '[' + (s.tag === 'speech' ? '说' : '行动') + '] ' + s.text).join('\n');
  const userMsg: ChatMessage = { role: 'user', content: finalText, timestamp: new Date().toISOString() };
  return { finalText, userMsg, msgsWithUser: [...messages, userMsg] };
}

// ── 阶段 2: 摘要生成（每10轮触发一次，非阻塞） ──
export function maybeGenerateSummary(
  messages: ChatMessage[],
  turnCount: number,
  summaryRef: React.MutableRefObject<string>,
  cfg: ApiConfig
): void {
  if (messages.length <= 30 || summaryRef.current || turnCount % 10 !== 0) return;
  const oldMsgs = messages.slice(0, messages.length - 30);
  if (oldMsgs.length <= 10) return;

  const sp = [
    { role: 'system' as const, content: '将对话压缩为摘要。事件/关系/情感各30字内。' },
    { role: 'user' as const, content: oldMsgs.map(m => (m.role === 'user' ? '玩家' : '') + ':' + m.content.slice(0, 150)).join('\n').slice(0, 8000) },
  ];
  chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, sp, { maxTokens: 300, temperature: 0.2 })
    .then(raw => { if (raw && raw.length > 20) summaryRef.current = '[对话摘要]\n' + raw.slice(0, 400); })
    .catch(() => {});
}

// ── 阶段 3: 上下文构建 ──
export interface ContextResult {
  chapterCtx: any;
  isFanfic: boolean;
  worldInfo: string;
}

export async function buildContext(
  session: WorldSession,
  finalText: string,
  messages: ChatMessage[],
  turnCount: number
): Promise<ContextResult> {
  const worldInfo = getWorldInfoFn(session, finalText, messages);

  let chapterCtx: any = null;
  try {
    if (session.worldNovelId) {
      chapterCtx = await buildDialogueContext(
        session.worldNovelId,
        session.currentChapter || 0,
        (session.recentWorldEvents || []).slice(-5),
        finalText
      );
    }
  } catch {}

  const isFanfic = !!(session.worldNovelId || (session.world?.writingStyle && session.world?.characters?.length));
  return { chapterCtx, isFanfic, worldInfo };
}

// ── 阶段 4: 角色推演 ──
export async function runCharacterSimulation(
  session: WorldSession,
  cfg: ApiConfig,
  chapterCtx: any,
  isFanfic: boolean,
  turnCount: number,
  activeChars: React.MutableRefObject<string[]>,
  lastSimResults: React.MutableRefObject<Record<string, { intent: string; mood: string }>>,
  attitudes: React.MutableRefObject<Record<string, any>>
): Promise<CharacterAction[]> {
  const chars = [
    ...session.selectedCharacters
      .filter(c => activeChars.current.includes(c.name))
      .map(c => ({
        name: c.name, personality: c.personality.traits.join('/'), deepPersonality: '',
        role: c.relationship.status, status: c.currentContext.location, goal: '',
        relationship: '亲密' + c.relationship.intimacy + '/100', interactionState: 'active' as const,
      })),
    ...(session.npcs || []).map(n => ({
      name: n.name, personality: n.personality, deepPersonality: '',
      role: n.role, status: n.currentStatus, goal: n.goal || '', relationship: '路人',
      interactionState: activeChars.current.includes(n.name) ? 'active' as const : 'inactive' as const,
    })),
    ...(isFanfic && turnCount % 3 === 0
      ? (session.world?.characters || [])
          .filter((c: Character) => {
            const n = c.name || '';
            return !session.selectedCharacters.some(sc => sc.name === n) && !(session.npcs || []).some(np => np.name === n);
          })
          .slice(0, 5)
          .map((c: Character) => ({
            name: c.name || '', personality: (c.personality?.traits || ['未知']).join('/'),
            deepPersonality: (c.personality as any)?._deepProfile || '',
            role: c.relationship?.status || '', status: '故事某处', goal: '',
            relationship: '原著角色', interactionState: 'inactive' as const,
          }))
      : []
    ),
  ];
  if (chars.length === 0) return [];

  const simKbContext: Record<string, string> = {};
  if (chapterCtx?.activeCharacters) {
    for (const c of chars) {
      const kb = chapterCtx.activeCharacters.find((ac: any) => ac.name === c.name);
      if (kb) {
        const parts: string[] = [];
        if (kb.traits?.length) parts.push('性格：' + kb.traits.join('、'));
        if (kb.deepTraits?.length) parts.push('真实性格：' + kb.deepTraits.join('、'));
        if (kb.defenseMechanism) parts.push('防御机制：' + kb.defenseMechanism);
        if (kb.role) parts.push('身份：' + kb.role);
        if (kb.speechStyle) parts.push('说话方式：' + kb.speechStyle);
        if (kb.speechSample) parts.push('台词示例：' + kb.speechSample);
        simKbContext[c.name] = parts.join('\n');
      }
    }
  }

  try {
    const result = await simulateCharacters(
      cfg, chars, session.currentScene,
      (session.recentWorldEvents || []).slice(-2).join('；'),
      activeChars.current.join('、'), lastSimResults.current, simKbContext
    );
    const actions = result.actions;

    // 更新好感度
    const record: Record<string, { intent: string; mood: string }> = {};
    for (const a of actions) {
      record[a.name] = { intent: a.intent, mood: a.mood };
      if (a.affectionDelta && Math.abs(a.affectionDelta) > 0.001) {
        if (!attitudes.current[a.name]) attitudes.current[a.name] = { trust: 50, affection: 0, fear: 20, lastUpdate: '' };
        let delta = a.affectionDelta;
        const aff = attitudes.current[a.name].affection || 0;
        if (aff > 80) delta *= 0.25;
        else if (aff > 60) delta *= 0.5;
        else if (aff < -50) delta *= 1.5;
        attitudes.current[a.name].affection = Math.max(-100, Math.min(100, aff + delta));
      }
    }
    lastSimResults.current = record;

    // 处理互动变化
    for (const ch of result.interactionChanges) {
      if (ch.action === 'pull_in' && ch.character_name && !activeChars.current.includes(ch.character_name)) {
        activeChars.current.push(ch.character_name);
      } else if (ch.action === 'push_out' && ch.character_name) {
        activeChars.current = activeChars.current.filter(n => n !== ch.character_name);
      }
    }

    return actions;
  } catch {
    return [];
  }
}

// ── 阶段 5: 提示词组装 ──
export interface PromptResult {
  prompt: { role: 'system' | 'user' | 'assistant'; content: string }[];
  chapterPrompt: string;
  scenarioBlock: string;
}

// ── 跨轮次的微调状态（模块级变量，整个 session 生命周期内有效）──
let activeTuningAdjustments: import('./promptTuner').PromptAdjustment[] = [];

export async function assemblePrompt(
  session: WorldSession,
  msgsWithUser: ChatMessage[],
  messages: ChatMessage[],
  charActions: CharacterAction[],
  chapterCtx: any,
  isFanfic: boolean,
  cfg: ApiConfig,
  summaryRef: React.MutableRefObject<string>,
  attitudes: React.MutableRefObject<Record<string, any>>
): Promise<PromptResult> {
  const fanficAppend = isFanfic ? NARRATOR_FANFIC_APPEND : '';
  const chapterPrompt = (isFanfic && chapterCtx) ? contextToPrompt(chapterCtx) : '';

  // 情景注入
  let scenarioBlock = '';
  const lastUserText = msgsWithUser.filter(m => m.role === 'user').pop()?.content || '';
  const hasMemoryTrigger = (session.memories || []).some(m =>
    lastUserText.includes(m.split(/[:：]/)[0]?.slice(0, 3) || '')
  );
  if (hasMemoryTrigger || (session.memories || []).length <= 5) {
    try {
      const sc = await enhanceWithScenario(session, messages.slice(-6), cfg);
      if (sc.scenarioBlock) scenarioBlock = '\n' + sc.scenarioBlock;
    } catch {}
  }

  const bedrockMems = (session as any).bedrockMemories || [];
  const bedrockText = bedrockMems.length > 0
    ? '\n核心记忆（永不遗忘）：\n' + bedrockMems.map((m: any) => '  - ' + (m.content || m)).join('\n')
    : '';
  const styleFeat = (session.world as any)?.styleFeatures
    ? '\n风格特征：\n' + (session.world as any).styleFeatures
    : '';

  // 反馈闭环：差评即时微调 + 好评 few-shot
  let tuningBlock = '';
  try {
    const { getRecentBadFeedback, getGoodSamples } = require('./feedbackStore');
    const recentBad = await getRecentBadFeedback(5);
    if (recentBad.length > 0) {
      const recentGood = await getGoodSamples(20);
      const { computeAdjustments } = require('./promptTuner');
      const currentChars = session.selectedCharacters.map(c => c.name);
      const result = computeAdjustments(recentBad, activeTuningAdjustments);
      activeTuningAdjustments = result.updatedAdjustments;
      if (result.tuningText) tuningBlock += result.tuningText;
      
      if (recentGood.length >= 3) {
        const { findSimilarSamples } = require('./promptTuner');
        const samples = findSimilarSamples(
          session.currentScene || '', currentChars,
          recentGood.map((e: any) => ({ userMsg: e.userMessage, aiResponse: e.aiResponsePreview, scene: e.scene, characters: e.activeCharacters, rating: 1 as const })),
          1
        );
        if (samples.length > 0) tuningBlock += '\n[参考：之前类似场景的高质量回复]\n' + samples[0].aiResponse.slice(0, 200);
      }
    }
  } catch {}

  const prompt = [
    {
      role: 'system' as const,
      content: [
        '你是' + (session.world?.name || '未知世界') + '的叙事引擎。' + NARRATOR_BASE + fanficAppend,
        '【玩家身份】' + (session.selectedCharacters.length > 0 ? session.selectedCharacters[0].name : '玩家') + '是你正在互动的玩家角色。[说]=玩家角色在说话，[行动]=玩家角色的行为。你扮演除玩家以外的所有角色和旁白。',
        '世界观：' + (session.world?.type || '') + ' | ' + (session.world?.rules?.supernatural || ''),
        chapterPrompt,
        summaryRef.current || '',
        bedrockText,
        scenarioBlock,
        styleFeat,
        tuningBlock,
        isFanfic ? VOCAB_LOCK : '',
        ...WORLD_RULES,
        '\n场景：' + (session.currentScene || '未知地点'),
        ...session.selectedCharacters.map(c => {
          const deep = (c.personality as any)?._deepProfile || '';
          const dialogue = (c.exampleDialogues || []).slice(0, 2).map((d: any) => d.character).join(' / ');
          let line = '- ' + c.name + '：' + c.personality.traits.join('、') + '，' + c.relationship.status;
          const att = attitudes.current[c.name];
          if (att && att.affection !== undefined) {
            const label = att.affection > 60 ? '亲近' : att.affection > 30 ? '友好' : att.affection > 0 ? '平淡'
              : att.affection < -30 ? '厌恶' : att.affection < 0 ? '冷淡' : '中性';
            line += ' | 好感：' + att.affection.toFixed(1) + '（' + label + '）';
          }
          if (deep) line += ' | ' + deep;
          if ((c as any).arc?.description) {
            const arc = (c as any).arc;
            const pastChs = arc.keyChapters?.filter((k: number) => k <= (session.currentChapter || 0)) || [];
            line += ' | 弧线：' + arc.description + (pastChs.length > 0 ? '（已走过' + pastChs.map((k: number) => '第' + (k + 1) + '章').join('→') + '）' : '');
          }
          if (c.personality.speakingStyle) line += ' | 说话：' + c.personality.speakingStyle;
          if (dialogue) line += ' | 台词：「' + dialogue + '」';
          return line;
        }),
        ...(session.npcs || []).filter(n => !session.selectedCharacters.some(c => c.name === n.name)).map(n => {
          const wc = ((session.world as any)?.characters || []).find((wc: any) => wc.name === n.name);
          const orig = wc?.role || wc?.relationship?.status || '';
          const deep = (wc?.personality as any)?._deepProfile || '';
          let line = '- ' + n.name + '：' + n.role + (orig ? '（原著：' + orig + '）' : '') + '，' + n.personality;
          if (deep) line += ' | ' + deep;
          return line;
        }),
        charActions.length > 0 ? '\n角色推演：\n' + charActions.map(a => {
          let s = '  ' + a.name + '：' + a.intent + '（' + a.mood + '）';
          if (a.innerThought) s += '\n    内心：' + a.innerThought;
          if (a.bodyLanguage) s += '\n    身体：' + a.bodyLanguage;
          if (a.subtext) s += '\n    潜台词：' + a.subtext;
          s += '\n    方向：' + (a.emotionalDirection || 'holding') + ' | 指向：' + (a.toward === 'player' ? '玩家' : a.toward || 'none') + (a.wantsInteraction ? ' | 想互动' : '');
          if (a.triggerContext) s += '\n    触发：' + a.triggerContext;
          return s;
        }).join('\n') : '',
        session.worldBible ? '\n世界圣经：' + session.worldBible : '',
        (session.world as any)?.styleSamples?.length > 0
          ? '\n风格参考：' + (session.world as any).styleSamples.slice(0, 2).map((s: string) => '「' + s + '」').join('\n')
          : '',
        '\n【角色引入】需要引入原著新角色时，在回复末尾添加 ___META___ {"newCharacter":"角色名"}',
        POST_HISTORY_BASE,
      ].join('\n'),
    },
    ...msgsWithUser.slice(1).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  return { prompt, chapterPrompt, scenarioBlock };
}

// ── 阶段 6: API 调用 ──
export async function callAI(
  cfg: ApiConfig,
  prompt: { role: string; content: string }[],
  setStreamingText: (text: string) => void
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (cfg.streamOutput) {
      let full = '';
      let lastUpdate = 0;
      chatCompletion({
        config: { ...cfg, thinkingMode: 'disabled' },
        messages: prompt,
        onToken: (token) => {
          full += token;
          const now = Date.now();
          if (now - lastUpdate > 50) { setStreamingText(full); lastUpdate = now; }
        },
        onComplete: (text) => { setStreamingText(''); resolve(text || full); },
        onError: reject,
      });
    } else {
      chatCompletionSync({ ...cfg, thinkingMode: 'disabled' }, prompt, { temperature: 0.8 }).then(resolve).catch(reject);
    }
  });
}

// ── 阶段 7: 响应后处理 ──
export interface PostProcessResult {
  displayText: string;
  newNpcs?: Array<{ name: string; role: string; personality: string; currentStatus: string; goal: string }>;
}

export async function postProcessResponse(
  raw: string,
  session: WorldSession,
  cfg: ApiConfig,
  chapterCtx: any,
  activeChars: React.MutableRefObject<string[]>
): Promise<PostProcessResult> {
  let displayText = raw;

  // 同人模式：抛光对齐文风
  if (session.worldNovelId && cfg.autoPolish !== false) {
    try {
      const styleFeatures = session.world?.writingStyle || '';
      const chapterSample = chapterCtx?.chapterText || '';
      if (styleFeatures || chapterSample) {
        displayText = await polishText(cfg, displayText, { styleFeatures, chapterSample });
      }
    } catch {}
  }

  // 解析角色引入标记
  const metaMatch = raw.match(/___META___\s*(\{[\s\S]*\})/);
  const newNpcs: PostProcessResult['newNpcs'] = [];
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      displayText = raw.replace(/___META___[\s\S]*$/, '').trim();
      if (meta.newCharacter && typeof meta.newCharacter === 'string') {
        const name = meta.newCharacter;
        const inScene = session.selectedCharacters.some(c => c.name === name)
          || (session.npcs || []).some(n => n.name === name);
        if (!inScene) {
          const worldChars = (session.world as any)?.characters || [];
          const wc = worldChars.find((wc: any) => wc.name === name);
          newNpcs.push(wc
            ? { name: wc.name, role: wc.relationship?.status || '原著角色', personality: (wc.personality?.traits || ['未知']).join('/'), currentStatus: '刚刚进入场景', goal: '' }
            : { name, role: '原著角色', personality: '未知', currentStatus: '刚刚进入场景', goal: '' }
          );
        }
      }
    } catch {}
  }

  return { displayText, newNpcs: newNpcs.length > 0 ? newNpcs : undefined };
}

// ── 阶段 8: 后处理钩子 ──
export interface PostSendHooksParams {
  session: WorldSession;
  updated: ChatMessage[];
  turnCount: React.MutableRefObject<number>;
  saveSession: (msgs?: ChatMessage[]) => Promise<void>;
  setSession: React.Dispatch<React.SetStateAction<WorldSession>>;
  activeChars: React.MutableRefObject<string[]>;
  lastSimResults: React.MutableRefObject<Record<string, { intent: string; mood: string }>>;
}

export function runPostSendHooks(params: PostSendHooksParams) {
  const { updated, turnCount, saveSession, setSession, session } = params;

  turnCount.current++;
  if (turnCount.current % 5 === 0) saveSession(updated);

  // 章节追踪（每3轮）
  if (turnCount.current % 3 === 0 && session.worldNovelId) {
    const cfg = require('../store/configStore').useConfigStore.getState().getActiveConfig();
    if (cfg) {
      const { estimateChapterPosition, shouldAdvanceChapter } = require('../services/chapterTracker');
      const recentTexts = updated.slice(-6).filter((m: any) => !m.isStreaming).map((m: any) => m.content).join('\n');
      estimateChapterPosition(cfg, session.worldNovelId, session.currentChapter || 0, [recentTexts])
        .then((pos: any) => {
          const newCh = shouldAdvanceChapter(session.currentChapter || 0, pos);
          if (newCh !== null) setSession(prev => ({ ...prev, currentChapter: newCh }));
        }).catch(() => {});
    }
  }

  // 记忆提取（每10轮）
  if (turnCount.current % 10 === 0) {
    const mcfg = require('../store/configStore').useConfigStore.getState().getActiveConfig();
    if (mcfg) {
      const { extractMemories } = require('../services/worldInfoService');
      extractMemories(mcfg.apiKey, mcfg.baseUrl, mcfg.model, updated, params.lastSimResults.current)
        .then((mems: string[]) => {
          if (mems.length) setSession(prev => ({ ...prev, memories: [...(prev.memories || []), ...mems].slice(-20) }));
        });
    }
  }

  // 角色自主互动（每5轮）
  if (turnCount.current % 5 === 0 && session.selectedCharacters.length >= 2) {
    const bcfg = require('../store/configStore').useConfigStore.getState().getActiveConfig();
    if (bcfg) {
      const { generateBackgroundInteraction, applyBackgroundInteraction } = require('../services/backgroundInteraction');
      const activeList = session.selectedCharacters.map(c => ({
        name: c.name, personality: c.personality.traits.join('/'),
        status: c.currentContext?.mood || '平静', relationship: c.relationship?.status || '陌生人',
      }));
      generateBackgroundInteraction(bcfg, activeList, session.currentScene || '未知场景')
        .then((interaction: any) => {
          if (interaction) setSession(prev => applyBackgroundInteraction(prev, interaction));
        }).catch(() => {});
    }
  }
}
