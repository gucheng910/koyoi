// ============================================================
//  同人系统 v2 - 章节分割、AI提取、知识库、时间线合成
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Alert, Animated } from 'react-native';
import { showAlert } from '../components/AnimatedAlert';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfigStore } from '../store/configStore';

import { usePersonaStore } from '../store/personaStore';
import { useWorldStore } from '../store/worldStore';
import { chatCompletionSync } from '../api/deepseek';
import { safeParseJSON } from '../services/utils';
import { estimateNovelCost, formatEstimate } from '../services/costEstimate';
import type { World, Character, FanficWorldCard, TransmigrationConfig, WorldType, TimelineEvent, WorldNpc, ApiConfig } from '../types';
import type { NovelMeta, KnowledgeBase } from '../types';
import { detectChapters, getChapterStats } from '../services/chapterSplitter';
import { normalizeEncoding } from '../services/encoding';
import jschardet from 'jschardet';

// 编码检测（基于 jschardet）

import { createNovel, updateNovelMeta, deleteNovel, getChapter, getNovelMeta } from '../services/novelStorage';
import { b64ToUtf8 } from '../services/base64';
import { assembleChunks, formatChunkInfo } from '../services/chunkAssembler';
import { analyzeAllChunks } from '../services/chapterAnalyzer';
import { buildKnowledgeBase, saveKnowledgeBase } from '../services/knowledgeBase';
import { loadKnowledgeBase } from '../services/knowledgeBase';
import { appendToWorld } from '../services/novelAppend';
import { synthesizeTimeline, applySynthesis, extractKeyDecisions } from '../services/timelineSynthesizer';
import { analyzeStyleFeatures } from '../services/styleAnalyzer';
import { deepDiveProtagonists } from '../services/characterDeepDive';
import { kbCharToCharacter } from '../services/characterAdapter';
import { reanalyzeChapters } from '../services/chapterReanalyzer';
import Toast from '../components/Toast';
import FadeIn from '../components/FadeIn';
import { SAFE_TOP } from '../theme/safeArea';

interface Props { isDark: boolean; onStart: (world: World, character: Character, config: TransmigrationConfig, worldBible?: string, openingScene?: string, npcs?: WorldNpc[], worldState?: string) => void; onBack: () => void; }

const T = (dark: boolean, safeTop?: number) => {
  const top = safeTop ?? 56;
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
  header: { paddingHorizontal: 20, paddingTop: top, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: dark ? '#1A1814' : '#ddd' },
  backBtn: { color: '#5577aa', fontSize: 15, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', color: dark ? '#E8DCC8' : '#1A1814' },
  sub: { fontSize: 13, color: dark ? '#888' : '#888', marginTop: 4 },
  stepNum: { fontSize: 12, color: '#5577aa', fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: dark ? '#E8DCC8' : '#1A1814', marginBottom: 20 },
  fileName: { fontSize: 14, color: dark ? '#aaa' : '#888', marginBottom: 16 },
  uploadBtn: { paddingVertical: 40, borderRadius: 12, borderWidth: 2, borderColor: dark ? '#333' : '#ddd', borderStyle: 'dashed', alignItems: 'center', marginBottom: 16 },
  uploadText: { fontSize: 16, color: dark ? '#ddd' : '#333', marginTop: 12, fontWeight: '600' },
  uploadSub: { fontSize: 12, color: '#888', marginTop: 4 },
  parsingBox: { backgroundColor: dark ? '#1A1814' : '#E8DCC8', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 },
  parsingText: { fontSize: 13, color: '#888', marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: dark ? '#aaa' : '#555', marginTop: 20, marginBottom: 12 },
  label: { fontSize: 13, color: dark ? '#888' : '#888', marginBottom: 6 },
  val: { fontSize: 14, color: dark ? '#ddd' : '#333', marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: dark ? '#1A1814' : '#e8f0f8', borderWidth: 1, borderColor: dark ? '#333' : '#ddd' },
  btnActive: { backgroundColor: dark ? '#1A2430' : '#e8f0f8', borderColor: '#5577aa' },
  btnText: { fontSize: 14, color: dark ? '#888' : '#888' },
  btnTextActive: { color: '#5577aa' },
  input: { fontSize: 14, color: dark ? '#ddd' : '#333', borderWidth: 1, borderColor: dark ? '#333' : '#aaa', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  startBtn: { alignItems: 'center', paddingVertical: 16, borderRadius: 12, backgroundColor: '#5577aa', marginBottom: 12 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
});
};

type Step = 'upload' | 'split_done' | 'parsing' | 'config' | 'opening' | 'ready';

export default function FanficScreen({ isDark, onStart, onBack }: Props) {
      const st = T(isDark, SAFE_TOP);
  const configStore = useConfigStore();
  const [step, setStep] = useState<Step>('upload');
  const [building, setBuilding] = useState(false);
  const [fileName, setFileName] = useState('');
  const [worldCard, setWorldCard] = useState<FanficWorldCard | null>(null);
  const [novelMeta, setNovelMeta] = useState<NovelMeta | null>(null);
  const [novelText, setNovelText] = useState('');  // 仅小文件缓存，大文件走 FileSystem
  const [worldName, setWorldName] = useState('');
  const [parsingStatus, setParsingStatus] = useState('');
  const [parseEstimate, setParseEstimate] = useState('');
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}>({msg:'',type:'success'});
  const [savedWorlds, setSavedWorlds] = useState<FanficWorldCard[]>([]);

  // 分析预览
  const [previewChars, setPreviewChars] = useState<Array<{name:string;traits:string[];sample:string}>>([]);
  const [previewTimeline, setPreviewTimeline] = useState<Array<{chapter:number;summary:string}>>([]);

  // 穿越配置
  const [transType, setTransType] = useState<'soul'|'body'>('soul');
  const [targetCharId, setTargetCharId] = useState('');
  const [soulStatus, setSoulStatus] = useState<'gone'|'dormant'|'coexisting'>('coexisting');
  const [timePoint, setTimePoint] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  const [playerDesc, setPlayerDesc] = useState('');
  const [plotKnowledge, setPlotKnowledge] = useState(true);
  const [showKB, setShowKB] = useState(false);
  const [reanalyzeMode, setReanalyzeMode] = useState(false);
  const [reanalyzeStart, setReanalyzeStart] = useState('0');
  const [reanalyzeEnd, setReanalyzeEnd] = useState('2');
  const [reanalyzing, setReanalyzing] = useState(false);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [analysisModel, setAnalysisModel] = useState('deepseek-v4-pro');
  const [analysisTemp, setAnalysisTemp] = useState('0.2');
  const [processing, setProcessing] = useState(false);
  const [hasPartial, setHasPartial] = useState(false);
  const [partialInfo, setPartialInfo] = useState('');
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, elapsed: 0 });

  // 卸载时取消进行中的分析
  useEffect(() => {
    return () => { analysisAbortRef.current?.abort(); };
  }, []);
  const [showAddChar, setShowAddChar] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharTraits, setNewCharTraits] = useState('');
  const [newCharRole, setNewCharRole] = useState('');

  const deleteSavedWorld = (w: FanficWorldCard) => {
    showAlert('删除', '删除《' + w.novelTitle + '》？删除后章节文件也将清除。', [
      { text: '取消', style: 'cancel' as const },
      { text: '删除', style: 'destructive' as const, onPress: () => {
        useWorldStore.getState().removeWorld(w.id);
        deleteNovel(w.id).catch(() => {});
        setSavedWorlds(prev => prev.filter(x => x.id !== w.id));
      }},
    ]);
  };

  useEffect(() => { loadWorlds(); }, []);
  function loadWorlds() {
    useWorldStore.getState().load().then(() => {
      setSavedWorlds(useWorldStore.getState().getFanficWorlds());
    });
  }

  
  const appendToExistingWorld = async (worldId: string, worldName: string) => {
    const cfg = (() => { const c = configStore.getActiveConfig(); return c ? { ...c, model: analysisModel, temperature: 0.2, thinkingMode: 'disabled' as const, maxTokens: 16384, safetyFilter: 'off' as const } : null; })();
    if (!cfg?.apiKey) { setToast({msg: '请先配置API Key', type: 'error'}); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setParsingStatus('正在读取追加文件...');
      const fetchResp = await fetch(file.uri);
      const rawBytes = new Uint8Array(await fetchResp.arrayBuffer());
      const content = normalizeEncoding(rawBytes);
      if (!content || content.length < 100) { setToast({msg:'文件内容过短', type:'error'}); setParsingStatus(''); return; }
      setStep('parsing');
      const res = await appendToWorld(cfg, worldId, content, undefined, (msg) => setParsingStatus(msg));
      setToast({msg: '追加完成！新增 ' + res.newCharacters + ' 角色，' + res.newEvents + ' 事件，共 ' + res.chapterCount + ' 章', type: 'success'});
      setStep('upload');
      loadWorlds();
    } catch (e: any) { setToast({msg: '追加失败: ' + (e.message || ''), type: 'error'}); setParsingStatus(''); setStep('upload'); }
  };

  async function checkPartial(worldId: string) {
    try {
      const partialPath = FileSystem.documentDirectory + 'koyoi_novels/' + worldId + '/knowledge/_partial.json';
      const info = await FileSystem.getInfoAsync(partialPath);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(partialPath);
        const partial = JSON.parse(raw);
        if (partial.completedChunks > 0 && partial.totalChunks > 0) {
          setHasPartial(true);
          setPartialInfo(partial.completedChunks + '/' + partial.totalChunks + (partial.lastChunk ? '（至第' + partial.lastChunk + '章）' : ''));
        }
      }
    } catch {}
  }

    const pickFile = async () => {
    if (processing) return;
    console.log('[KOYOI] pickFile start');
    setProcessing(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'application/epub+zip', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) { console.log('[KOYOI] pickFile cancelled'); setProcessing(false); return; }
      const file = result.assets[0];
      console.log('[KOYOI] picked file:', file.name, 'size:', (file as any).size);
      setFileName(file.name);
      const uri = file.uri;
      let needsCleanup = false;
      if (uri.startsWith('content://')) {
        console.log('[KOYOI] copyAsync from content://');
        setParsingStatus('复制文件...');
        const cachedUri = FileSystem.cacheDirectory + 'novel_upload_' + Date.now() + '.txt';
        await FileSystem.copyAsync({ from: file.uri, to: cachedUri });
        (file as any).uri = cachedUri;
        needsCleanup = true;
        console.log('[KOYOI] copyAsync done');
      }
      const readUri = (file as any).uri || uri;
      const fileInfo = await FileSystem.getInfoAsync(readUri);
      const totalSize = (fileInfo as any).size || 0;
      console.log('[KOYOI] fileInfo size:', totalSize);

      // fetch 直接读文本
      console.log('[KOYOI] fetch start');
      setParsingStatus('读取中…');
      const resp = await fetch(readUri);
      console.log('[KOYOI] fetch response ok:', resp.ok, 'status:', resp.status);
      const rawBytes = new Uint8Array(await resp.arrayBuffer());
      const content = normalizeEncoding(rawBytes);
      console.log('[KOYOI] decoded length:', content.length, (rawBytes.length !== content.length ? '(' + (rawBytes.length / content.length).toFixed(1) + 'x compression)' : '(ASCII)'));
      await new Promise(r => setTimeout(r, 300));
      if (!content || content.length < 10) { setToast({msg: '文件为空', type: 'error'}); setProcessing(false); return; }

      // 原生分章
      console.log('[KOYOI] detectChapters start');
      setParsingStatus('正在扫描章节…');
      const chapters = detectChapters(content);
      console.log('[KOYOI] detectChapters found:', chapters.length);
      if (chapters.length === 0) { setToast({msg: '未检测到章节', type: 'error'}); setProcessing(false); return; }

      const nameBase = file.name.replace(/\.\w+$/, '');
      setWorldName(nameBase);
      const worldId = 'fanfic_' + Date.now();
      console.log('[KOYOI] createNovel start, chapters:', chapters.length);
      const meta = await createNovel(worldId, file.name, content, chapters, (cur, total) => {
        setParsingStatus('写入章节 ' + cur + '/' + total);
      });
      console.log('[KOYOI] createNovel done');
      setNovelMeta(meta);
      const small = content.length < 500000;
      if (small) setNovelText(content);
      console.log('[KOYOI] setWorldCard');
      setWorldCard({
        id: worldId, novelTitle: nameBase, writingStyle: '', worldType: 'modern',
        rules: { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' },
        locations: [], factions: [], timeline: [], characters: [], totalChapters: chapters.length, parsedAt: new Date().toISOString(),
      });
      setProcessing(false);
      setStep('split_done');
      console.log('[KOYOI] pickFile done, step → split_done');
      if (needsCleanup) FileSystem.deleteAsync(readUri, { idempotent: true }).catch(() => {});
      checkPartial(worldId);
    } catch (e: any) { console.log('[KOYOI] pickFile ERROR:', e.message || String(e)); setProcessing(false); setToast({msg: '文件处理失败: ' + (e.message || String(e)), type: 'error'}); }
  };

  const appendFile = async () => {
    if (processing || !novelText) return;
    setProcessing(true);
    setParsingStatus('正在选择追加文件...');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) { setProcessing(false); setParsingStatus(''); return; }
      const file = result.assets[0];
      setParsingStatus('正在读取追加文件...');
      const fetchResp = await fetch(file.uri);
      const rawBytes = new Uint8Array(await fetchResp.arrayBuffer());
      const appendContent = normalizeEncoding(rawBytes);
      if (!appendContent || appendContent.length < 100) { setToast({msg:'追加文件内容过短', type:'error'}); setProcessing(false); return; }
      setParsingStatus('正在扫描追加章节...');
      const appendChapters = detectChapters(appendContent);
      if (appendChapters.length === 0) { setToast({msg:'追加文件中未检测到章节', type:'error'}); setProcessing(false); return; }
      const offset = novelText.length + 1;
      const shifted = appendChapters.map(c => ({ ...c, index: c.index + (novelMeta?.chapterCount || 0), startChar: c.startChar + offset, endChar: c.endChar + offset }));
      const mergedChapters = [...(novelMeta?.chapters || []), ...shifted].sort((a, b) => a.index - b.index).map((c, i) => ({ ...c, index: i }));
      const mergedText = novelText + '\n' + appendContent;
      const mergedMeta = { ...novelMeta!, chapters: mergedChapters, chapterCount: mergedChapters.length, totalChars: mergedText.length };
      setNovelText(mergedText);
      setNovelMeta(mergedMeta as any);
      setFileName(prev => prev + ' + ' + file.name);
      setToast({msg: '已追加 ' + appendChapters.length + ' 章，共 ' + mergedChapters.length + ' 章', type:'success'});
    } catch (e: any) { setToast({msg:'追加失败: ' + (e.message || ''), type:'error'}); }
    setProcessing(false); setParsingStatus('');
  };

  const parseNovel = async (text: string, forceRestart?: boolean) => {
    console.log('[KOYOI] parseNovel start, textLen:', text.length, 'novelMeta:', !!novelMeta, 'chapters:', novelMeta?.chapters?.length);
    const chatCfg = configStore.getActiveConfig();
    if (!chatCfg?.apiKey) { setToast({msg: "请先在设置中配置API Key", type: "error"}); setStep("upload"); return; }
    const cfg: ApiConfig = {
      ...chatCfg, model: analysisModel, temperature: parseFloat(analysisTemp) || 0.2,
      thinkingMode: 'disabled', maxTokens: 4096, safetyFilter: 'off',
    };
    console.log('[KOYOI] cfg model:', cfg.model);
    
    setStep('parsing');
    setParsingStatus('检查配置…');
    await new Promise(r => setTimeout(r, 50));
    // AbortController：组件卸载时取消分析
    try { analysisAbortRef.current = new AbortController(); } catch { analysisAbortRef.current = null; }
    const signal = analysisAbortRef.current?.signal;
    const estimate = estimateNovelCost(novelMeta?.totalChars || text.length, cfg);
    setParseEstimate(formatEstimate(estimate));
    console.log('[KOYOI] estimate:', estimate.estimatedChunks, 'chunks');
    try {
      setParsingStatus('加载章节元数据…');
      const chapters = novelMeta?.chapters || [];
      console.log('[KOYOI] chapters from novelMeta:', chapters.length);
      if (chapters.length === 0) throw new Error('无章节数据');
      // 章节文件验证
      if (worldCard?.id) {
        setParsingStatus('验证章节文件…');
        const testPath = FileSystem.documentDirectory + 'koyoi_novels/' + worldCard.id + '/chapters/0000.txt';
        const info = await FileSystem.getInfoAsync(testPath);
        if (!info.exists) {
          setToast({msg: "章节文件不存在，请重新上传", type: "error"});
          setStep("split_done");
          return;
        }
      }
      console.log('[KOYOI] assembleChunks start');
      const chunks = assembleChunks(chapters);
      console.log('[KOYOI] assembleChunks result:', chunks.length);

      // 强制重新分析：删除断点文件
      if (forceRestart && worldCard?.id) {
        try {
          const pp = FileSystem.documentDirectory + 'koyoi_novels/' + worldCard.id + '/knowledge/_partial.json';
          await FileSystem.deleteAsync(pp, { idempotent: true });
        } catch {}
      }

      setParsingStatus(chunks.length + ' 个分析块，开始 AI 提取...');
      console.log('[KOYOI] analyzeAllChunks start');
      const analyzeStart = Date.now();
      const results = await analyzeAllChunks(cfg, worldCard?.id || '', chapters, chunks, (cur, total, chunk) => {
        const elapsed = (Date.now() - analyzeStart) / 1000;
        const avgPerChunk = elapsed / cur;
        const remaining = (total - cur) * avgPerChunk;
        const eta = remaining < 120
          ? Math.round(remaining) + '秒'
          : Math.floor(remaining / 60) + '分' + Math.round(remaining % 60) + '秒';
        const elapsedMin = Math.floor((Date.now() - analyzeStart) / 60000);
        const chapterRange = chunk.chapterStart === chunk.chapterEnd ? '第' + (chunk.chapterStart+1) + '章' : '第' + (chunk.chapterStart+1) + '~' + (chunk.chapterEnd+1) + '章';
        setParseProgress({ current: cur, total, elapsed: elapsedMin });
        setParsingStatus(chapterRange + '（' + (chunk.charCount / 1000).toFixed(0) + 'k字）\n已用 ' + elapsedMin + ' 分钟，预计还需 ' + eta);
      }, signal);
      if (results.length === 0) throw new Error('全部分析失败');

      // 提取预览数据
      const seen = new Set<string>();
      const chars = [];
      const tl = [];
      for (const r of results) {
        for (const c of r.characters) {
          if (!seen.has(c.name) && c.speechSamples?.length > 0) {
            seen.add(c.name);
            chars.push({ name: c.name, traits: c.traits.slice(0, 4), sample: c.speechSamples[0]?.quote || '' });
            if (chars.length >= 6) break;
          }
        }
        for (const e of (r.events || []).slice(0, 3)) {
          tl.push({ chapter: e.chapter, summary: e.event });
        }
        if (chars.length >= 6) break;
      }
      setPreviewChars(chars.slice(0, 6));
      setPreviewTimeline(tl.slice(0, 12));
      console.log('[KOYOI] analyzeAllChunks done, results:', results.length);
      setParsingStatus('正在合并去重角色与关系…');
      console.log('[KOYOI] buildKnowledgeBase start');
      const worldId = worldCard?.id || 'fanfic_' + Date.now();
      let kb = buildKnowledgeBase(worldId, chapters.length, results);
      console.log('[KOYOI] kb chars:', kb.characters.length, 'plot:', kb.plot.length);
      setParsingStatus('AI 正在梳理时间线与角色弧线…\n⚠ 不要退出，这一步约需 10~20 秒');
      console.log('[KOYOI] synthesizeTimeline start');
      const synth = await synthesizeTimeline(cfg, worldId, kb);
      console.log('[KOYOI] synth result:', !!synth);
      if (synth) kb = applySynthesis(kb, synth);
      // 风格特征分析 + 关键角色深挖：两者只依赖 kb，可并行（省一次串行等待）
      setParsingStatus('分析写作风格并深挖主要角色…');
      console.log('[KOYOI] analyzeStyle + deepDive start (parallel)');
      const [styleFeatures, dived] = await Promise.all([
        analyzeStyleFeatures(cfg, kb),
        deepDiveProtagonists(cfg, kb, (msg) => setParsingStatus(msg)).catch((e: any) => { console.warn('[KOYOI] deep dive failed:', e.message); return [] as string[]; }),
      ]);
      console.log('[KOYOI] styleFeatures length:', styleFeatures?.length || 0);
      if (dived.length > 0) console.log('[KOYOI] deep dive done:', dived.length, 'chars');
      console.log('[KOYOI] saveKnowledgeBase start');
      setParsingStatus('正在保存分析结果…');
      await saveKnowledgeBase(kb);
      console.log('[KOYOI] saveKnowledgeBase done');
      const card = buildWorldCardFromKB(kb, novelMeta, synth?.worldType, styleFeatures);
      console.log('[KOYOI] card chars:', card.characters.length);
      if (synth) card.keyDecisions = extractKeyDecisions(synth);
    if (card.characters.length === 0 && card.timeline.length === 0) {
      setToast({msg: "分析完成但未提取到角色或事件，可能是AI输出格式不匹配。建议重试或换模型（V4 Pro）。", type: "error"});
      setStep("split_done");
      return;
    }
    console.log('[KOYOI] setWorldCard + addWorld');
    setWorldCard(card);
      kb = null as any;
      useWorldStore.getState().addWorld({
        id: card.id, novelTitle: card.novelTitle, worldType: card.worldType,
        writingStyle: card.writingStyle, totalChapters: card.totalChapters,
        characters: [], timeline: [], locations: [], factions: [],
        rules: card.rules, parsedAt: card.parsedAt,
      } as any);
      console.log('[KOYOI] parseNovel done → config');
      setStep('config');
    } catch (e: any) {
      console.log('[KOYOI] parseNovel ERROR:', e.message || String(e));
      setParsingStatus('');
      setToast({msg: "分析失败: " + (e.message || ""), type: "error"});
      setStep("split_done");
    }
  };

  /**
   * 世界观类型兜底推断：根据已提取的世界规则文本综合判断
   */
  function inferWorldType(ws: any): string {
    const s = String((ws && (ws.supernatural || '')) || '') + String((ws && (ws.society || '')) || '') + String((ws && (ws.culture || '')) || '');
    if (/修仙|灵气|宗门|炼丹|元婴|法宝/.test(s)) return 'cultivation';
    if (/魔法|斗气|异世界|剑与魔法/.test(s)) return 'fantasy';
    if (/高中|校园|大学|班级|学院/.test(s)) return 'campus';
    if (/赛博|义体|网络空间|黑客/.test(s)) return 'cyberpunk';
    if (/末日|丧尸|废土|幸存/.test(s)) return 'apocalypse';
    if (/古代|王朝|皇帝|科举|朝堂/.test(s)) return 'historical';
    return 'modern';
  }

  /**
   * 世界观类型中文标签
   */
  const WORLD_TYPE_LABELS: Record<string, string> = {
    modern: '现代都市', cultivation: '修仙', fantasy: '奇幻', cyberpunk: '赛博朋克',
    apocalypse: '末日废土', historical: '古风', campus: '校园', fanfic: '同人',
    wuxia: '武侠', urban: '都市', interstellar: '星际', game: '游戏世界',
    supernatural: '超自然', alternate_history: '架空历史', custom: '自定义',
  };

  function buildWorldCardFromKB(kb: KnowledgeBase, meta?: NovelMeta | null, synthWorldType?: string, styleFeatures?: string): FanficWorldCard {
    const chars: Character[] = kb.characters.map((c, i) => kbCharToCharacter(c as any, kb.worldId, i, meta?.title));
    const timeline: TimelineEvent[] = kb.plot.filter(p => p.summary).map((p, i) => ({
      id: 'tl_' + i, description: p.summary, inevitability: 0.5, causes: [], convergencePaths: [], originalOutcome: p.summary, status: 'pending' as const,
    }));
    const locs = kb.worldSettings.geography.split('\n').filter(Boolean).map((l: string) => { const p = l.split('：'); return { name: p[0] || '', description: p.slice(1).join('：') || '' }; });
    return {
      id: kb.worldId, novelTitle: meta?.title || '未知小说',
      writingStyle: kb.styleProfile.map(s => s.samples.join(' / ')).join(' | '), styleSamples: kb.styleProfile.flatMap(s => s.samples).slice(0, 8),
      worldType: (synthWorldType || (kb.worldSettings as any).worldType || inferWorldType(kb.worldSettings)) as WorldType,
      rules: { physics: '', supernatural: kb.worldSettings.supernatural, technology: '', society: kb.worldSettings.society, morality: '', culture: kb.worldSettings.culture || '', sexualNorms: kb.worldSettings.sexualNorms },
      locations: locs, factions: [], timeline, characters: chars, keyDecisions: [], totalChapters: kb.chapterCount, parsedAt: kb.analyzedAt,
      styleFeatures: styleFeatures || '',
      abilities: (kb.worldSettings as any).abilities || [],
      foreshadows: (kb.worldSettings as any).foreshadows || [],
      milestones: (kb.worldSettings as any).milestones || [],
      scenes: (kb.worldSettings as any).scenes || [],
    };
  }

  const buildOpening = async () => {
    if (!worldCard || building) return;
    // 魂穿必须选择目标角色（否则能力/记忆/关系归属会错乱）
    if (transType === 'soul' && !targetCharId) {
      setToast({msg: '请先选择魂穿目标角色', type: 'error'});
      return;
    }
    setBuilding(true);
    const cfg = (() => { const c = configStore.getActiveConfig(); return c ? { ...c, model: analysisModel, temperature: parseFloat(analysisTemp)||0.2, thinkingMode: 'disabled' as const, maxTokens: 4096, safetyFilter: 'off' as const } : null; })();
    if (!cfg?.apiKey) { setToast({msg:'请先配置API Key', type:'error'}); setBuilding(false); return; }
    setStep('opening');

    // ===== Step 1: 世界收敛（基于穿越配置） =====
    setParsingStatus('正在构建玩家视角世界观...');
    const worldChars = worldCard.characters || [];
    const allEvents = (worldCard.timeline || []).map((e: any, i: number) => {
      const desc = typeof e === 'string' ? e : (e.event || e.description || '');
      return { index: i, description: desc, chapter: e.chapter || i };
    });

    // 确定入口章节和时间点前后的事件
    let entryChapterNum = 0;
    const totalCh = worldCard.totalChapters || 100;
    const chMatch = timePoint.match(/第(\d+)章/);
    if (chMatch) {
      entryChapterNum = parseInt(chMatch[1]) - 1;
    } else {
      const tp = timePoint;
      if (tp.includes('开篇') || tp.includes('开始') || tp.includes('开头') || tp.includes('初始') || tp.includes('序章') || tp.includes('引子')) entryChapterNum = Math.floor(totalCh * 0.02);
      else if (tp.includes('发展') || tp.includes('中期') || tp.includes('展开')) entryChapterNum = Math.floor(totalCh * 0.25);
      else if (tp.includes('高潮') || tp.includes('关键') || tp.includes('转折') || tp.includes('决战')) entryChapterNum = Math.floor(totalCh * 0.55);
      else if (tp.includes('结局') || tp.includes('尾声') || tp.includes('末尾') || tp.includes('最后')) entryChapterNum = Math.floor(totalCh * 0.95);
      else if (tp.match(/\d+/)) entryChapterNum = Math.min(parseInt(tp.match(/\d+/)![0]) - 1, totalCh - 1);
      else {
        // 模糊时间点：在时间线事件中搜索匹配
        let bestMatch = -1;
        let bestScore = 0;
        for (const e of allEvents) {
          const desc = e.description;
          // 逐字搜索：用户输入的关键词在事件描述中出现了几个
          let score = 0;
          for (let i = 0; i < tp.length - 1; i++) {
            const bigram = tp.slice(i, i + 2);
            if (desc.includes(bigram)) score++;
          }
          if (score > bestScore) { bestScore = score; bestMatch = e.chapter || 0; }
        }
        if (bestMatch >= 0) entryChapterNum = bestMatch;
      }
    }
    entryChapterNum = Math.max(0, Math.min(entryChapterNum, totalCh - 1));

    // 筛选穿越相关角色：魂穿目标 + 目标的关系网 + 穿越地点附近的角色
    let relatedChars: any[] = [];
    
    // 匹配穿越地点到知识库中的实际地点
    let matchedLocation = '';
    if (entryLocation && worldCard.locations?.length > 0) {
      const locMatch = worldCard.locations.find((l: any) =>
        l.name?.includes(entryLocation) || entryLocation.includes(l.name?.slice(0, 2))
      );
      if (locMatch) {
        matchedLocation = locMatch.name + (locMatch.description ? '：' + locMatch.description : '');
      }
    }

    if (transType === 'soul' && targetCharId) {
      const target = worldChars.find((c: any) => c.name === targetCharId || c.id === targetCharId);
      if (target) {
        relatedChars = [target];
        // 找出与目标角色有关系的人
        const relatedNames = new Set([target.name]);
        for (const c of worldChars) {
          if (relatedNames.has(c.name)) continue;
          const rel = (c.relationship?.status || '') + (c.backstory || '') + (c.role || '');
          if (rel.includes(target.name)) { relatedChars.push(c); relatedNames.add(c.name); }
        }
      }
    } else {
      // 身穿：地点附近的角色
      relatedChars = worldChars.slice(0, 8);
    }

    // 筛选穿越时间点前后的关键事件
    const nearbyEvents = allEvents.filter((e: any) => {
      const ch = e.chapter || 0;
      return ch >= Math.max(0, entryChapterNum - 3) && ch <= Math.min(worldCard.totalChapters || 100, entryChapterNum + 3);
    }).slice(0, 8);

    // 加载入口章节原文
    let entryChapterText = '';
    if (entryChapterNum > 0 && novelMeta) {
      setParsingStatus('正在加载入口章节原文...');
      try { const chText = await getChapter(worldCard.id, entryChapterNum); if (chText) entryChapterText = chText.slice(0, 2000); } catch {}
    }

    // ===== 构建玩家视角的世界收束信息 =====
    const playerGender = usePersonaStore.getState().gender === 'female' ? '女' : '男';
    const isSoul = transType === 'soul';
    const targetName = targetCharId || '未知角色';

    const worldConvergence = [
      `## 原著世界`,
      `书名：《${worldCard.novelTitle}》`,
      `世界类型：${worldCard.worldType}`,
      `世界观规则：${worldCard.rules?.supernatural || '未设定'} | ${worldCard.rules?.society || ''} | ${worldCard.rules?.technology || ''}`,
      ``,
      `## 穿越配置`,
      `穿越方式：${isSoul ? '魂穿（占据他人身体）' : '身穿（本体降临）'}`,
      isSoul ? `占据角色：${targetName}${playerDesc ? '，外貌：' + playerDesc : ''}` : `玩家外貌：${playerDesc || '未设定'}`,
      `穿越时间点：${timePoint || '故事开始'}（原著第${entryChapterNum+1}章附近）`,
      `穿越地点：${entryLocation || '未指定'}${matchedLocation ? '（原著中：' + matchedLocation + '）' : ''}`,
      `原著剧情了解程度：${plotKnowledge ? '玩家对原剧情了如指掌' : '玩家对原剧情一无所知'}`,
      `原主意识状态：${isSoul ? (soulStatus === 'gone' ? '已完全消散' : soulStatus === 'dormant' ? '沉睡在最深处' : '与原主意识共存') : '无（身穿）'}`,
      ``,
      `## 穿越时刻的世界状态`,
      `时间线位置：第${entryChapterNum+1}章前后`,
      `附近关键事件：`,
      ...nearbyEvents.map((e: any, i: number) => `  ${i+1}. ${e.description}`),
      ``,
      `## 玩家视角的角色信息`,
    ];

    // 魂穿：玩家拥有目标角色的记忆
    if (isSoul && relatedChars.length > 0) {
      worldConvergence.push(`以下角色是${targetName}认识的人（玩家拥有${targetName}的记忆）：`);
      for (const c of relatedChars.slice(0, 6)) {
        const traits = (c.personality?.traits || c.traits || []).join('/') || '未知';
        const rel = c.relationship?.status || c.role || '';
        worldConvergence.push(`- ${c.name}：${traits}。${rel ? '关系：' + rel : ''}${c.backstory ? '。背景：' + c.backstory.slice(0, 60) : ''}`);
      }
    } else {
      // 身穿：只知道眼前看到的
      worldConvergence.push(`以下角色可能出现在${entryLocation || '穿越地点'}附近：`);
      for (const c of relatedChars.slice(0, 6)) {
        worldConvergence.push(`- ${c.name}：${(c.personality?.traits || c.traits || []).join('/') || '未知'}（${c.role || ''}）`);
      }
    }

    if (entryChapterText) {
      worldConvergence.push('', '## 入口章节原文（供场景参考）', entryChapterText);
    }

    // ===== Step 2: 基于收敛世界生成开场 =====
    setParsingStatus('正在生成开场场景...');

    const prompt = [
      {
        role: 'system' as const,
        content: `你是世界构建引擎。你正在为一个穿越者创建身临其境的开场。

你有两个任务：

1. worldBible（150-250字）：以穿越者的视角写一份世界概述。
${isSoul ? '魂穿模式：你占据了' + targetName + '的身体，拥有ta的全部记忆。世界概述应该包含这个角色原本知道的事情——ta的身份、ta的人际关系、ta最近的处境、这个世界的基本运行规则。' : '身穿模式：你是突然降临的陌生人。世界概述只能包含普通人可见的表面信息——时代背景、可见的社会秩序、明显的危险。'}
${plotKnowledge ? '此外，因为你对原剧情有了解，世界概述中可以暗示你对"接下来本应发生什么"的认知。' : '你对原剧情一无所知，世界概述中只写你亲眼可验证的事实。'}

2. scene（300-400字）：开场叙事。必须用第二人称"你"。
- 从一个具体的感官瞬间开始（不是天气说明）
${isSoul ? '- 魂穿：写出意识进入新身体的错位感。你发现自己的手不是自己的手。你脑中涌入了不属于你的记忆。一个不属于你的声音在叫你。' : '- 身穿：写出突兀降临的不适感。你的衣服不符合这个时代。有人注意到你的异常。一切都不对劲。'}
- 角色在场需要理由。有人进来是因为有事情，不是来迎接你。
- ${plotKnowledge ? '因为你知道剧情，你的内心活动可以包含"接下来本应…"的预感' : '你对一切感到陌生，只能凭借眼前的信息判断局势'}
- 结尾留悬念。不要总结。

3. npcs（1-4个）：初始在场的角色 {name, role, personality, currentStatus}
4. worldState：从穿越者视角看，当前世界的一句话局势

只返回JSON：{"worldBible":"...","scene":"...","npcs":[...],"worldState":"..."}`
      },
      { role: 'user' as const, content: worldConvergence.join('\n') },
    ];

    try {
      const result = await Promise.race([
        chatCompletionSync(cfg, prompt, { temperature: 0.8, maxTokens: 4096 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 90000)),
      ]) as string;
      const data = safeParseJSON(result) || {};
      startGame(data.worldBible || '', data.scene || '你来到了' + worldCard.novelTitle + '的世界。', data.npcs || [], data.worldState || '');
      setBuilding(false);
    } catch (e: any) {
      setBuilding(false);
      if (e.message === 'TIMEOUT') {
        setToast({msg: '构建超时（90秒），可能是网络问题或API繁忙，请稍后重试', type: 'error'});
      } else {
        setToast({msg: '构建失败: ' + (e.message || '未知错误'), type: 'error'});
      }
      setStep('config');
    }
  };

  const startGame = (worldBible?: string, openingScene?: string, npcs?: WorldNpc[], worldState?: string) => {
    if (!worldCard) return;
    const world: World = {
      id: worldCard.id, name: worldName || worldCard.novelTitle, type: worldCard.worldType, rules: worldCard.rules || { physics: '', supernatural: '', technology: '', society: '', morality: '', culture: '' },
      locations: worldCard.locations, factions: worldCard.factions,
      timeline: worldCard.timeline.map((e, i) => ({ ...e, id: 'tl_' + i, status: 'pending' as const })),
      inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 },
      butterflySensitivity: { minor: '个人选择产生涟漪', major: '重大干预改变剧情走向' },
      writingStyle: worldCard.writingStyle, styleSamples: worldCard.styleSamples,
      keyDecisions: worldCard.keyDecisions || [], characters: worldCard.characters,
      abilities: worldCard.abilities || [],
      foreshadows: worldCard.foreshadows || [],
      milestones: worldCard.milestones || [],
      scenes: worldCard.scenes || [],
    };
    const matchedChar = targetCharId ? worldCard.characters.find(c => c.name === targetCharId || c.id === targetCharId) : null;
    const playerChar: Character = {
      id: 'char_player_fanfic', name: transType === 'soul' ? (matchedChar?.name || targetCharId || '穿越者') : '穿越者', worldId: world.id, gender: usePersonaStore.getState().gender, age: '未知',
      appearance: { height: '', bodyType: '', bust: '', waist: '', hips: '', skinTone: '', hairStyle: '', facialFeatures: playerDesc || '穿越者', intimateDetails: '' },
      personality: { traits: ['穿越者'], speakingStyle: '', habits: [], likes: [], dislikes: [] },
      
      relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: '刚刚穿越到这个世界' },
      backstory: `从现实世界穿越到《${worldCard.novelTitle}》的世界`,
      worldContext: { type: 'fanfic', sourceNovel: worldCard.novelTitle, originalRole: targetCharId || '外来者', originalFate: '未知' },
      autonomy: { goals: [], schedule: '', agency: 5 }, memories: [], exampleDialogues: [],
      currentContext: { location: entryLocation || '未知', timeOfDay: '未知', mood: '困惑而好奇', outfit: '', recentEvents: '穿越刚刚发生' },
      isPreset: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const transmigration: TransmigrationConfig = {
      type: transType, targetCharacterId: targetCharId || undefined, originalSoulStatus: soulStatus,
      entryTimepoint: timePoint || '故事开始', entryLocation: entryLocation || '未知',
      playerAppearance: playerDesc || undefined,
      playerAbilities: { modernKnowledge: true, plotKnowledge, noSpecialAbility: false },
      worldParams: { inertia: 0.7, butterflySensitivity: 0.5, characterAwareness: transType === 'soul' ? 'treatAsOriginal' : 'knowIsTransmigrator' },
    };
    onStart(world, playerChar, transmigration, worldBible, openingScene, npcs, worldState);
  };

  // 数据完整性守卫：检测 worldCard 是否损坏
  if (worldCard && step === 'config') {
    const broken = !worldCard.rules || typeof worldCard.rules !== 'object';
    if (broken) {
      return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#0D0C0A' : '#FAF8F5', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#E8DCC8' : '#2D2822', marginBottom: 12 }}>分析数据不完整</Text>
          <Text style={{ fontSize: 13, color: isDark ? '#8A8070' : '#8A8070', textAlign: 'center', marginBottom: 24 }}>分析可能被中断，规则数据未提取。
请重新分析或从已分析列表重试。</Text>
          <TouchableOpacity style={{ paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, backgroundColor: '#5B9BD5', marginBottom: 10 }} onPress={() => { if (worldCard.id) loadKnowledgeBase(worldCard.id).then(kb => { if (kb && kb.characters.length > 0) { const card = buildWorldCardFromKB(kb, novelMeta); if (card.characters.length > 0 || card.timeline.length > 0) { setWorldCard(card); setStep('config'); } else setStep('upload'); } else setStep('upload'); }).catch(() => setStep('upload')); }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>← 重新分析</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onBack} style={{ marginTop: 20 }}>
            <Text style={{ color: '#5B9BD5', fontSize: 14 }}>← 返回</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  return (
    
    <FadeIn style={{ flex: 1 }}><View style={st.container}>
      <Toast visible={toast.msg!==''} message={toast.msg} type={toast.type} onHide={()=>setToast({msg:'',type:'success'})} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => {
           if (step === 'parsing' || step === 'opening') {
             showAlert('正在分析', '确定要取消吗？已分析的部分会保留。', [
               { text: '继续等待', style: 'cancel' },
               { text: '取消分析', style: 'destructive', onPress: () => { analysisAbortRef.current?.abort(); onBack(); } },
             ]);
           } else { onBack(); }
         }}><Text style={st.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={st.title}>同人穿越</Text>
        <Text style={st.sub}>上传小说，魂穿到故事中</Text>
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {step === 'upload' && (
          <>
            <Text style={st.stepNum}>STEP 1</Text>
            <Text style={st.stepTitle}>选择小说文件</Text>
            <TouchableOpacity style={st.uploadBtn} onPress={pickFile}>
              {parsingStatus ? (
                <>
                  <ActivityIndicator size="large" color="#5B9BD5" />
                  <Text style={st.uploadText}>{parsingStatus}</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 36 }}>📄</Text>
                  <Text style={st.uploadText}>点击选择文件</Text>
                  <Text style={st.uploadSub}>支持 TXT 格式</Text>
                </>
              )}
            </TouchableOpacity>
            {savedWorlds.length > 0 && (
              <>
                <Text style={[st.sectionTitle, { marginTop: 20 }]}>已分析的同人世界</Text>
                {savedWorlds.map(w => (
                  <TouchableOpacity key={w.id} style={[st.btn, { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, marginBottom: 8, width: '100%' }]} 
                    onPress={() => {
                    setParsingStatus('正在加载知识库...');
                    loadKnowledgeBase(w.id).then(async (kb) => {
                      setParsingStatus('');
                      if (kb && kb.characters && kb.characters.length > 0) {
                        // 加载小说元数据（标题等），避免显示"未知小说"
                        let meta: NovelMeta | null = null;
                        try {
                          meta = await getNovelMeta(w.id);
                        } catch {}
                        const card = buildWorldCardFromKB(kb, meta || (w as any));
                        setWorldCard(card);
                      } else {
                        setWorldCard(w);
                      }
                      setStep('config');
                    }).catch(() => {                      setParsingStatus('');
                      setWorldCard(w);
                      setStep('config');
                    });
                  }} onLongPress={() => deleteSavedWorld(w)}>
                    <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#5B9BD522', marginRight: 8 }} onPress={(e) => { e.stopPropagation(); appendToExistingWorld(w.id, w.novelTitle); }}>
                      <Text style={{ fontSize: 10, color: '#5B9BD5' }}>＋追加</Text>
                    </TouchableOpacity>
                    <Text style={{ color: isDark ? '#ddd' : '#333', fontSize: 14, flex: 1 }}>📖 {w.novelTitle}</Text>
                    <Text style={{ color: '#888', fontSize: 11 }}>{(w.characters?.length || 0) > 0 ? w.characters.length + '角色' : ''}{!w._normalized ? '' : ''}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {step === 'split_done' && novelMeta && (
          <>
            <Text style={st.stepNum}>STEP 1.5</Text>
            <Text style={st.stepTitle}>章节分割完成</Text>
            <Text style={st.fileName}>{fileName}</Text>
            <View style={[st.parsingBox, { alignItems: 'flex-start' }]}>
              <Text style={{ fontSize: 14, color: '#4fc3f7', fontWeight: '600', marginBottom: 12 }}>
                检测到 {novelMeta.chapterCount} 章，共 {(novelMeta.totalChars/10000).toFixed(0)} 万字
              </Text>
              {(() => { const stats = getChapterStats(novelMeta.chapters); return (
                <>
                  <Text style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>最短 {stats.min} 字 · 最长 {stats.max} 字 · 平均 {stats.avg} 字/章</Text>
                  <Text style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{novelMeta.chapters.filter(c => c.isSpecial).length} 个特殊章节</Text>
                </>
              ); })()}
              <ScrollView style={{ width: '100%', maxHeight: 400 }} nestedScrollEnabled={true}>
                {novelMeta.chapters.map(ch => (
                  <Text key={ch.index} style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{ch.title || '第'+(ch.index+1)+'章'} — {ch.charCount}字{ch.isSpecial ? ' ☆' : ''}</Text>
                ))}
                
              </ScrollView>
            </View>
            {/* 分析模型选择 */}
            <Text style={st.label}>分析模型</Text>
            <TextInput style={st.input} value={analysisModel} onChangeText={setAnalysisModel} placeholder="deepseek-v4-flash" placeholderTextColor="#666" autoCapitalize="none" />
            <View style={st.row}>
              <TouchableOpacity style={[st.btn, analysisModel === 'deepseek-v4-flash' && st.btnActive]} onPress={() => setAnalysisModel('deepseek-v4-flash')}><Text style={[st.btnText, analysisModel === 'deepseek-v4-flash' && st.btnTextActive]}>⚡ V4 Flash</Text></TouchableOpacity>
              <TouchableOpacity style={[st.btn, analysisModel === 'deepseek-v4-pro' && st.btnActive]} onPress={() => setAnalysisModel('deepseek-v4-pro')}><Text style={[st.btnText, analysisModel === 'deepseek-v4-pro' && st.btnTextActive]}>🎯 V4 Pro</Text></TouchableOpacity>
            </View>
            {/* 实时成本预估 */}
            {(() => {
              const chatCfg = configStore.getActiveConfig();
              if (!chatCfg) return null;
              const est = estimateNovelCost(novelMeta?.totalChars || novelText.length, { ...chatCfg, model: analysisModel } as any);
              return (
                <View style={{ backgroundColor: isDark ? '#1a2a1a' : '#e8f5e9', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#5A8A5A', marginBottom: 4 }}>
                    📊 预估：{est.estimatedChunks} 块 · 输入 {(est.totalInputTokens/1000).toFixed(0)}k · 输出 {(est.totalOutputTokens/1000).toFixed(0)}k tokens
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#4caf50' }}>
                    💰 约 ¥{est.totalCost.toFixed(2)}
                  </Text>
                </View>
              );
            })()}
                        {hasPartial && (
              <View style={{ backgroundColor: '#333', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#4fc3f7', fontWeight: '600', marginBottom: 4 }}>
                  📋 检测到未完成的分析（已完成 {partialInfo} 块）
                </Text>
                <Text style={{ fontSize: 11, color: '#888' }}>点击下方按钮将显示选项</Text>
              </View>
            )}
            <TouchableOpacity style={st.startBtn} onPress={() => {
              if (hasPartial) {
                showAlert('检测到未完成的分析', '已完成 ' + partialInfo + ' 块。请选择：', [
                  { text: '从断点继续', onPress: () => parseNovel(novelText) },
                  { text: '重新分析', style: 'destructive', onPress: () => parseNovel(novelText, true) },
                  { text: '取消', style: 'cancel' },
                ]);
              } else {
                parseNovel(novelText);
              }
            }}>
              <Text style={st.startBtnText}>{hasPartial ? '⚡ 继续 / 重新分析' : '确认章节，开始 AI 分析'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.startBtn, { backgroundColor: isDark ? '#1A2430' : '#E8F0F8', marginTop: 10, borderWidth: 1, borderColor: '#5B9BD5' }]} onPress={appendFile}>
              <Text style={[st.startBtnText, { color: '#5B9BD5' }]}>📎 追加上传（多文件小说）</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.startBtn, { backgroundColor: isDark ? '#1A1814' : '#e0e0e0', marginTop: 10 }]} onPress={() => setStep('upload')}>
              <Text style={[st.startBtnText, { color: isDark ? '#888' : '#555' }]}>重新选择文件</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'parsing' && (
          <>
            <Text style={st.stepNum}>STEP 2</Text>
            <Text style={st.stepTitle}>AI 正在解析</Text>
            <Text style={st.fileName}>{fileName}</Text>
            <View style={st.parsingBox}>
              {parseEstimate !== '' && <Text style={{ fontSize: 12, color: '#ff9800', textAlign: 'center', marginBottom: 16, lineHeight: 18 }}>{parseEstimate}</Text>}
              {parseProgress.total > 0 && (
                <View style={{ marginBottom: 16, width: '100%' }}>
                  <View style={{ height: 4, backgroundColor: isDark ? '#1A1814' : '#E8E4DD', borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: 4, width: (parseProgress.current / parseProgress.total * 100) + '%', backgroundColor: '#5B9BD5', borderRadius: 2 }} />
                  </View>
                  <Text style={{ fontSize: 11, color: '#8A8070', textAlign: 'center', marginTop: 6 }}>{parseProgress.current}/{parseProgress.total} 块 · 已用 {parseProgress.elapsed} 分钟</Text>
                </View>
              )}
              <ActivityIndicator size="large" color="#5B9BD5" />
              <Text style={st.parsingText}>{parsingStatus}</Text>
            </View>

            {/* 预览：角色台词卡片 */}
            {previewChars.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#8A8070', letterSpacing: 2, marginBottom: 10 }}>已发现角色</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {previewChars.map((c, i) => (
                    <View key={i} style={{ width: 160, backgroundColor: isDark ? '#1C1912' : '#FFF', borderRadius: 12, padding: 12, marginRight: 10, borderWidth: 1, borderColor: isDark ? '#2C2A22' : '#E8E4DD' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#E8DCC8' : '#2D2822', marginBottom: 4 }}>{c.name}</Text>
                      <Text style={{ fontSize: 10, color: '#5B9BD5', marginBottom: 6 }}>{c.traits.join(' · ')}</Text>
                      {c.sample ? <Text style={{ fontSize: 11, color: isDark ? '#8A8070' : '#8A8070', fontStyle: 'italic', lineHeight: 16 }}>「{c.sample.slice(0, 50)}…」</Text> : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 预览：剧情时间线 */}
            {previewTimeline.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#8A8070', letterSpacing: 2, marginBottom: 10 }}>剧情脉络</Text>
                <View style={{ backgroundColor: isDark ? '#1C1912' : '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: isDark ? '#2C2A22' : '#E8E4DD' }}>
                  {previewTimeline.slice(0, 6).map((t, i) => (
                    <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                      <Text style={{ fontSize: 10, color: '#5B9BD5', fontWeight: '600', width: 40 }}>{'第' + (t.chapter + 1) + '章'}</Text>
                      <Text style={{ fontSize: 12, color: isDark ? '#C8BFA0' : '#5A5450', flex: 1, lineHeight: 16 }}>{t.summary.slice(0, 60)}</Text>
                    </View>
                  ))}
                  {previewTimeline.length > 6 && <Text style={{ fontSize: 10, color: '#8A8070', textAlign: 'center', marginTop: 4 }}>还有 {previewTimeline.length - 6} 个事件…</Text>}
                </View>
              </View>
            )}
          </>
        )}

        {step === 'config' && worldCard && (
          <>
            <Text style={st.stepNum}>STEP 3</Text>
            <Text style={st.stepTitle}>配置穿越</Text>
            <Text style={st.label}>世界名称</Text>
            <TextInput style={st.input} value={worldName} onChangeText={(v) => { setWorldName(v); if (worldCard) { setWorldCard({ ...worldCard, novelTitle: v }); if (nameTimerRef.current) clearTimeout(nameTimerRef.current); nameTimerRef.current = setTimeout(() => { updateNovelMeta(worldCard.id, { title: v }).catch(() => {}); }, 800); } }} placeholder="输入世界名称" placeholderTextColor="#666" />
            <Text style={st.label}>原著书名</Text>
            <Text style={st.val}>{novelMeta?.originalFileName || worldCard.novelTitle}</Text>
            <Text style={st.label}>世界观类型</Text>
            <Text style={st.val}>{WORLD_TYPE_LABELS[worldCard.worldType] || worldCard.worldType}</Text>
            <Text style={st.label}>世界观规则</Text>
            {[
              worldCard.rules?.supernatural,
              worldCard.rules?.society,
              worldCard.rules?.culture,
              worldCard.rules?.sexualNorms,
            ].filter(Boolean).map((r, i) => (
              <Text key={i} style={st.val}>{String(r)}</Text>
            ))}
            {worldCard.timeline.length > 0 && (
              <>
                <Text style={st.label}>关键剧情</Text>
                <View style={{ backgroundColor: isDark ? '#1A1814' : '#E8DCC8', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  {worldCard.timeline.slice(0, 15).map((e, i) => (
                    <Text key={i} style={{ fontSize: 12, color: isDark ? '#aaa' : '#888', marginBottom: 4 }}>{i+1}. {typeof e === 'string' ? e : ((e as any).event || (e as any).description || '')}</Text>
                  ))}
                </View>
              </>
            )}
            {(worldCard.characters || []).length > 0 && (
              <>
                <Text style={st.label}>原著角色 ({(worldCard.characters || []).length}人)</Text>
                <View style={{ backgroundColor: isDark ? '#1A1814' : '#E8DCC8', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  {(worldCard.characters || []).slice(0, 20).map((c, i) => (
                    <Text key={i} style={{ fontSize: 12, color: isDark ? '#aaa' : '#555', marginBottom: 3 }}>{c.name}：{(c.personality?.traits || []).join('/') || c.backstory?.slice(0,30) || ''}</Text>
                  ))}
                </View>
              </>
            )}
                        {/* 知识库查看 */}
            <TouchableOpacity style={[st.btn, { flexDirection: 'row', justifyContent: 'space-between', width: '100%' }]} onPress={() => setShowKB(!showKB)}>
              <Text style={st.btnText}>📋 知识库查看（{(worldCard.characters||[]).length}角色 / {(worldCard.timeline||[]).length}事件）</Text>
              <Text style={st.btnText}>{showKB ? '▾' : '▸'}</Text>
            </TouchableOpacity>
            {showKB && (
              <View style={{ backgroundColor: isDark ? '#1A1814' : '#E8DCC8', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                {/* 质量验证 */}
                {(() => {
                  const issues = [];
                  const chars = worldCard.characters || [];
                  const noSpeech = chars.filter(c => !c.exampleDialogues || c.exampleDialogues.length === 0);
                  const noHabit = chars.filter(c => !c.personality?.habits || c.personality.habits.length === 0);
                  if (noSpeech.length > 0) issues.push(noSpeech.length + '个角色缺少台词样本：' + noSpeech.slice(0,3).map(c=>c.name).join('、'));
                  if (noHabit.length > 0) issues.push(noHabit.length + '个角色缺少习惯动作');
                  if (worldCard.timeline.length < 5 && worldCard.totalChapters > 10) issues.push('剧情事件较少，可能提取不完整');
                  if (issues.length === 0) return <Text style={{ fontSize: 12, color: '#4caf50', marginBottom: 10 }}>✅ 提取质量良好</Text>;
                  return (
                    <View style={{ backgroundColor: '#3a2a10', borderRadius: 6, padding: 8, marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#ff9800', marginBottom: 4 }}>⚠ 质量提示</Text>
                      {issues.map((iss, i) => <Text key={i} style={{ fontSize: 11, color: '#ffcc80', marginBottom: 2 }}>· {iss}</Text>)}
                    </View>
                  );
                })()}
                {/* 重新分析 */}
                {!reanalyzeMode ? (
                  <TouchableOpacity style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#5B9BD522', alignSelf: 'flex-start', marginBottom: 10 }}
                    onPress={() => setReanalyzeMode(true)}>
                    <Text style={{ fontSize: 11, color: '#5577aa' }}>🔄 重新分析指定章节</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <TextInput style={{ width: 50, fontSize: 12, color: isDark ? '#ddd' : '#333', borderWidth: 1, borderColor: isDark ? '#333' : '#aaa', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'center' }}
                      value={reanalyzeStart} onChangeText={setReanalyzeStart} keyboardType="numeric" placeholder="从" placeholderTextColor="#666" />
                    <Text style={{ fontSize: 12, color: '#888' }}>~</Text>
                    <TextInput style={{ width: 50, fontSize: 12, color: isDark ? '#ddd' : '#333', borderWidth: 1, borderColor: isDark ? '#333' : '#aaa', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'center' }}
                      value={reanalyzeEnd} onChangeText={setReanalyzeEnd} keyboardType="numeric" placeholder="到" placeholderTextColor="#666" />
                    <Text style={{ fontSize: 11, color: '#888' }}>章</Text>
                    <TouchableOpacity style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#5577aa' }}
                      onPress={async () => {
                        const s = parseInt(reanalyzeStart) || 0;
                        const e = parseInt(reanalyzeEnd) || Math.min(s, (worldCard.totalChapters||1)-1);
                        if (s < 0 || e >= (worldCard.totalChapters||1) || s > e) { setToast({msg:'章节范围无效', type:'error'}); return; }
                        setReanalyzing(true);
                        const cfg = (() => { const c = configStore.getActiveConfig(); return c ? { ...c, model: analysisModel, temperature: parseFloat(analysisTemp)||0.2, thinkingMode: 'disabled' as const, maxTokens: 4096, safetyFilter: 'off' as const } : null; })();
                        if (cfg) {
                          const ok = await reanalyzeChapters(cfg, worldCard.id, s, e, (m: string) => setParsingStatus(m));
                          if (ok) {
                            setToast({msg: '第'+(s+1)+'~'+(e+1)+'章重新分析完成', type:'success'});
                            loadWorlds();
                            // 重新加载更新后的知识库来刷新当前卡片
                            const updatedKB = await loadKnowledgeBase(worldCard.id);
                            if (updatedKB) {
                              const refreshed = buildWorldCardFromKB(updatedKB, novelMeta);
                              setWorldCard(refreshed);
                            }
                          } else setToast({msg:'分析失败', type:'error'});
                        }
                        setReanalyzing(false);
                        setReanalyzeMode(false);
                      }} disabled={reanalyzing}>
                      <Text style={{ fontSize: 11, color: '#fff' }}>{reanalyzing ? '分析中...' : '开始'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setReanalyzeMode(false)}>
                      <Text style={{ fontSize: 11, color: '#888' }}>取消</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#5577aa', marginBottom: 8 }}>角色 ({(worldCard.characters||[]).length}人)</Text>
                {(worldCard.characters || []).map((c, i) => (
                  <Text key={i} style={{ fontSize: 11, color: isDark ? '#aaa' : '#555', marginBottom: 4, lineHeight: 16 }}>
                    {c.name}（{(c.personality?.traits||[]).join('、')}）{c.relationship?.status || ''} {(c.personality as any)?._deepProfile ? ' | ' + (c.personality as any)._deepProfile : ''} <Text onPress={() => { setWorldCard({ ...worldCard, characters: worldCard.characters.filter(x => x.name !== c.name) }); setToast({msg: '已移除 ' + c.name, type: 'success'}); }} style={{ color: '#5577aa', fontSize: 10 }}> ✕</Text>
                  </Text>
                ))}
                
                {/* 手动添加角色 */}
                {!showAddChar ? (
                  <TouchableOpacity style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#4caf5022', alignSelf: 'flex-start', marginTop: 8, marginBottom: 8 }}
                    onPress={() => setShowAddChar(true)}>
                    <Text style={{ fontSize: 11, color: '#4caf50' }}>＋ 手动添加角色</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ marginTop: 8, marginBottom: 8 }}>
                    <TextInput style={{ fontSize: 12, color: isDark ? '#ddd' : '#333', borderWidth: 1, borderColor: isDark ? '#333' : '#aaa', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 }}
                      value={newCharName} onChangeText={setNewCharName} placeholder="角色名" placeholderTextColor="#666" />
                    <TextInput style={{ fontSize: 12, color: isDark ? '#ddd' : '#333', borderWidth: 1, borderColor: isDark ? '#333' : '#aaa', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 }}
                      value={newCharRole} onChangeText={setNewCharRole} placeholder="身份（如：宗主弟子）" placeholderTextColor="#666" />
                    <TextInput style={{ fontSize: 12, color: isDark ? '#ddd' : '#333', borderWidth: 1, borderColor: isDark ? '#333' : '#aaa', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 }}
                      value={newCharTraits} onChangeText={setNewCharTraits} placeholder="性格（逗号分隔，如：傲娇,冷漠）" placeholderTextColor="#666" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#4caf50' }}
                        onPress={() => {
                          if (!newCharName.trim()) return;
                          const newChar = {
                            id: 'manual_' + Date.now(), name: newCharName.trim(), worldId: worldCard.id,
                            gender: 'other' as const, age: '未知',
                            appearance: { height: '', bodyType: '', bust: '', waist: '', hips: '', skinTone: '', hairStyle: '', facialFeatures: '', intimateDetails: '' },
                            personality: { traits: newCharTraits.split(/[,，]/).map(s => s.trim()).filter(Boolean), speakingStyle: '', habits: [], likes: [], dislikes: [] },
                            
                            relationship: { intimacy: 0, trust: 0, submission: 0, arousal: 0, status: newCharRole.trim() || '原著角色' },
                            backstory: '手动添加', worldContext: { type: 'fanfic' as const, sourceNovel: worldCard.novelTitle, originalRole: newCharRole.trim(), originalFate: '' },
                            autonomy: { goals: [], schedule: '', agency: 5 }, memories: [], exampleDialogues: [],
                            currentContext: { location: '未知', timeOfDay: '未知', mood: '', outfit: '', recentEvents: '' },
                            isPreset: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                          };
                          setWorldCard({ ...worldCard, characters: [...worldCard.characters, newChar] });
                          setNewCharName(''); setNewCharTraits(''); setNewCharRole(''); setShowAddChar(false);
                          setToast({msg: '已添加 ' + newCharName, type: 'success'});
                        }}>
                        <Text style={{ fontSize: 11, color: '#fff' }}>确认添加</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setShowAddChar(false); setNewCharName(''); }}>
                        <Text style={{ fontSize: 11, color: '#888', paddingVertical: 4 }}>取消</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#5577aa', marginTop: 12, marginBottom: 8 }}>关键剧情</Text>
                {worldCard.timeline.slice(0, 10).map((e, i) => (
                  <Text key={i} style={{ fontSize: 11, color: isDark ? '#aaa' : '#888', marginBottom: 2 }}>
                    {i+1}. {typeof e === 'string' ? e : ((e as any).event || (e as any).description || '')}
                  </Text>
                ))}
                {(worldCard.keyDecisions || []).length > 0 && (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#5577aa', marginTop: 12, marginBottom: 8 }}>关键选择</Text>
                    {(worldCard.keyDecisions || []).map((d: any, i: number) => (
                      <Text key={i} style={{ fontSize: 11, color: isDark ? '#aaa' : '#888', marginBottom: 4 }}>
                        {i+1}. {d.who}：{d.dilemma} → {d.chose}
                      </Text>
                    ))}
                  </>
                )}
              </View>
            )}

            <Text style={st.sectionTitle}>穿越方式</Text>
            <View style={st.row}>
              {[{ k: 'soul', v: '魂穿（占据角色身体）' }, { k: 'body', v: '身穿（本体降临）' }].map(o => (
                <TouchableOpacity key={o.k} style={[st.btn, transType === o.k && st.btnActive]} onPress={() => setTransType(o.k as 'soul'|'body')}>
                  <Text style={[st.btnText, transType === o.k && st.btnTextActive]}>{o.v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {transType === 'soul' && (
              <>
                <Text style={st.label}>魂穿目标</Text>
                <View style={[st.row, { marginBottom: 8 }]}>
                  {(worldCard.characters || []).slice(0, 10).map((c, i) => (
                    <TouchableOpacity key={i} style={[st.btn, targetCharId === c.name && st.btnActive]} onPress={() => setTargetCharId(c.name)}>
                      <Text style={[st.btnText, targetCharId === c.name && st.btnTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.label}>原主意识</Text>
                <View style={st.row}>
                  {[{ k: 'gone', v: '已消散' }, { k: 'dormant', v: '沉睡中' }, { k: 'coexisting', v: '共存' }].map(o => (
                    <TouchableOpacity key={o.k} style={[st.btn, soulStatus === o.k && st.btnActive]} onPress={() => setSoulStatus(o.k as any)}>
                      <Text style={[st.btnText, soulStatus === o.k && st.btnTextActive]}>{o.v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {worldCard.locations.length > 0 && (
                  <>
                    <Text style={st.label}>穿越到哪个地点</Text>
                    <View style={[st.row, { marginBottom: 10 }]}>
                      {(worldCard.locations || []).slice(0, 6).map((l, i) => (
                        <TouchableOpacity key={i} style={[st.btn, entryLocation === l.name && st.btnActive]} onPress={() => setEntryLocation(l.name)}>
                          <Text style={[st.btnText, entryLocation === l.name && st.btnTextActive]}>{l.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <TextInput style={st.input} placeholder="或输入其他地点" placeholderTextColor="#666" value={entryLocation} onChangeText={setEntryLocation} />
                <TextInput style={st.input} placeholder="你的外貌描述（可选）" placeholderTextColor="#666" value={playerDesc} onChangeText={setPlayerDesc} />
              </>
            )}
            <TextInput style={st.input} placeholder="穿越时间点（如：故事开始/第三章/结局后）" placeholderTextColor="#666" value={timePoint} onChangeText={setTimePoint} />
            {worldCard.timeline.length > 0 && (
              <>
                <Text style={st.label}>起始场景</Text>
                <View style={[st.row, { marginBottom: 8 }]}>
                  {(() => {
                    const total = worldCard.totalChapters || worldCard.timeline.length || 100;
                    // 按章节位置找真正的开场/高潮/结局事件
                    const findEvent = (ratio: number) => {
                      const targetCh = Math.floor(total * ratio);
                      const events = worldCard.timeline as any[];
                      let best = events[0];
                      let bestDist = Infinity;
                      for (const e of events) {
                        const ch = (e as any).chapter || 0;
                        const dist = Math.abs(ch - targetCh);
                        if (dist < bestDist) { bestDist = dist; best = e; }
                      }
                      return typeof best === 'string' ? best : ((best as any)?.event || (best as any)?.description || '');
                    };
                    const scenes = [
                      { label: '🌅 开篇', event: findEvent(0.02), ratio: 0.02 },
                      { label: '📈 发展', event: findEvent(0.25), ratio: 0.25 },
                      { label: '🔥 高潮', event: findEvent(0.55), ratio: 0.55 },
                      { label: '🌙 结局', event: findEvent(0.95), ratio: 0.95 },
                    ];
                    return scenes.map((s, i) => (
                      <TouchableOpacity key={i} style={[st.btn, timePoint === s.event && st.btnActive]} onPress={() => setTimePoint(s.label)}>
                        <Text style={[st.btnText, timePoint === s.event && st.btnTextActive]} numberOfLines={1}>{s.label}</Text>
                      </TouchableOpacity>
                    ));
                  })()}
                  <TouchableOpacity style={[st.btn, timePoint === '自定义' && st.btnActive]} onPress={() => setTimePoint('自定义')}>
                    <Text style={[st.btnText, timePoint === '自定义' && st.btnTextActive]}>✏️ 自定义</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <View style={[st.row, { marginTop: 8 }]}>
              <TouchableOpacity style={[st.btn, plotKnowledge && st.btnActive]} onPress={() => setPlotKnowledge(!plotKnowledge)}>
                <Text style={[st.btnText, plotKnowledge && st.btnTextActive]}>{plotKnowledge ? '✓ 知晓原著剧情' : '不知晓原著剧情'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={st.startBtn} onPress={buildOpening}>
              <Text style={st.startBtnText}>AI 生成开场</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'opening' && (
          <>
            <Text style={st.stepNum}>STEP 4</Text>
            <Text style={st.stepTitle}>AI 构建世界</Text>
            <View style={st.parsingBox}>
              <ActivityIndicator size="large" color="#5B9BD5" />
              <Text style={st.parsingText}>{parsingStatus}</Text>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
    
    </FadeIn>
  );
}
