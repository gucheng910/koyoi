// ============================================================
//  Koyoi v2 - 世界中心架构
//  首页=世界列表, 角色卡在"角色"tab, 亲密度世界内隔离
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, AppState, BackHandler, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfigStore } from './src/store/configStore';
import { useCharacterStore } from './src/store/characterStore';
import { usePersonaStore } from './src/store/personaStore';
import { useUsageStore } from './src/store/usageStore';
import FadeIn from './src/components/FadeIn';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CreateScreen from './src/screens/CreateScreen';
import CharacterDetail from './src/screens/CharacterDetail';
import CharactersTab from './src/screens/CharactersTab';
import WorldSetupScreen from './src/screens/WorldSetupScreen';
import WorldChatScreen from './src/screens/WorldChatScreen';
import WorldErrorBoundary from './src/components/WorldErrorBoundary';
import FanficScreen from './src/screens/FanficScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AnimatedAlertProvider } from './src/components/AnimatedAlert';
import DisclaimerScreen from './src/components/DisclaimerScreen';
import type { Character, WorldSession } from './src/types';

type Tab = 'home' | 'characters' | 'create' | 'settings';
const THEME_KEY = '@koyoi_theme';
const WORLDS_KEY = '@koyoi_world_sessions';

export default function App() {
  return (
    <ThemeProvider>
      <AnimatedAlertProvider>
        <AppContent />
      </AnimatedAlertProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const { mode, t, setMode } = useTheme();
  const isDark = mode === 'dark';
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('@koyoi_disclaimer').then(v => setDisclaimerAgreed(v === 'true'));
  }, []);
  const agreeDisclaimer = () => { AsyncStorage.setItem('@koyoi_disclaimer', 'true'); setDisclaimerAgreed(true); };

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const { isLoaded, loadConfigs } = useConfigStore();

  // 世界状态
  const [showWorldSetup, setShowWorldSetup] = useState(false);
  const [showFanfic, setShowFanfic] = useState(false);
  const [worldSession, setWorldSession] = useState<WorldSession | null>(null);
  const [detailChar, setDetailChar] = useState<Character | null>(null);

  useEffect(() => {
    loadConfigs();
    useCharacterStore.getState().loadCharacters();
    usePersonaStore.getState().load();
    // 后台时强制保存用量
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        useUsageStore.getState().flush();
      }
    });
    return () => sub.remove();
  }, []);

  // Android 返回键处理
  useEffect(() => {
    const handler = () => {
      if (worldSession) { setWorldSession(null); return true; }
      if (showWorldSetup) { setShowWorldSetup(false); return true; }
      if (showFanfic) { setShowFanfic(false); return true; }
      if (detailChar) { setDetailChar(null); return true; }
      // 主界面：再按一次退出
      if (activeTab !== 'home') { setActiveTab('home'); return true; }
      return false; // 默认行为：退出 app
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [worldSession, showWorldSetup, showFanfic, detailChar, activeTab]);

  const T = theme(isDark);

  // ===== 世界持久化辅助 =====
  const saveWorldSession = async (session: WorldSession) => {
    try {
      // 新格式：独立 key + 索引
      await AsyncStorage.setItem('@koyoi_session_' + session.id, JSON.stringify(session));
      const rawIdx = await AsyncStorage.getItem('@koyoi_world_index');
      const index = rawIdx ? JSON.parse(rawIdx) : {};
      index[session.id] = {
        id: session.id,
        name: session.world?.name || '未知',
        type: session.world?.type || 'custom',
        charCount: session.selectedCharacters?.length || 0,
        msgCount: session.messages?.length || 0,
        lastActivity: new Date().toISOString(),
        hasNovelId: !!session.worldNovelId,
        currentChapter: session.currentChapter || 0,
      };
      await AsyncStorage.setItem('@koyoi_world_index', JSON.stringify(index));
    } catch {}
  };

  // ===== 世界对话 =====
  if (worldSession) {
    return (
      <ErrorBoundary>
      <View style={T.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        
        <WorldErrorBoundary
          session={worldSession}
          isDark={isDark}
          onRepair={async (repaired) => {
            setWorldSession(repaired);
            await saveWorldSession(repaired);
          }}
          onBack={() => setWorldSession(null)}
        >
          <WorldChatScreen
            session={worldSession}
            onBack={async () => {
              setWorldSession(null);
            }}
            isDark={isDark}
          />
        </WorldErrorBoundary>

      </View>


        
        
</ErrorBoundary>
    );
  }

  // ===== 大世界设置 =====
  if (showWorldSetup) {
    return (
      <ErrorBoundary>
      <View style={T.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        
        <WorldSetupScreen
          isDark={isDark}
          onBack={() => setShowWorldSetup(false)}
          onStart={async (session) => {
            // 剥离角色的当前场景（世界有独立场景，不需角色卡场景）
            session.selectedCharacters = session.selectedCharacters.map(c => ({
              ...c,
              relationship: { ...c.relationship },
              currentContext: { location: session.world.name, timeOfDay: '未知', mood: '', outfit: '', recentEvents: '' },
            }));
            setWorldSession(session);
            setShowWorldSetup(false);
            await saveWorldSession(session);
          }}
        />
      </View>
      </ErrorBoundary>
    );
  }

  // ===== 同人穿越 =====
  if (showFanfic) {
    return (
      <ErrorBoundary>
      <View style={T.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <FanficScreen
          isDark={isDark}
          onBack={() => setShowFanfic(false)}
          onStart={async (world, character, tmConfig, worldBible, openingScene, npcs, worldState) => {
            const initialScene = openingScene || (
              tmConfig.entryTimepoint
                ? `你睁开眼。这里是《${world.name}》的世界。时间点：${tmConfig.entryTimepoint}。`
                : `你穿越到了《${world.name}》的世界。周围的一切陌生又熟悉。`
            );

            const bible = worldBible || `这是《${world.name}》的同人世界。${tmConfig.type === 'soul' ? '你魂穿到了' + (character.name) + '的身体里。' : '你以本体降临到这个世界。'}原著剧情作为参考但你的行动会改变一切。`;

            const st = worldState || `穿越到《${world.name}》的世界`;

            const session: WorldSession = {
              id: 'fanfic_' + Date.now(),
              world,
              worldNovelId: world.id,  // 关联 NovelStorage
              currentChapter: 0,       // 起始章节（后续可根据 timePoint 推断）
              selectedCharacters: [{ ...character, relationship: { ...character.relationship } }],
              npcs: npcs || [],
              currentScene: initialScene,
              worldState: st,
              worldBible: bible,
              butterflyLog: [],
              timelineDeviations: [],
              recentWorldEvents: [],
              worldLog: [],
              messages: [{
                role: 'assistant' as const,
                content: initialScene,
                timestamp: new Date().toISOString(),
              }],
              createdAt: new Date().toISOString(),
            };
            setWorldSession(session);
            setShowFanfic(false);
            await saveWorldSession(session);
          }}
        />
      </View>
      </ErrorBoundary>
    );
  }

  // ===== 角色详情 =====
  if (detailChar) {
    return (
      <ErrorBoundary>
      <View style={T.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CharacterDetail
          character={detailChar}
          onBack={() => setDetailChar(null)}
          onStart={(c) => setDetailChar(null)}
          isDark={isDark}
        />
      </View>
      </ErrorBoundary>
    );
  }

    if (!disclaimerAgreed) return <DisclaimerScreen visible={true} onAgree={agreeDisclaimer} onExit={() => BackHandler.exitApp()} />;

  if (!isLoaded || !true) {
    return <View style={T.loadingContainer}><StatusBar style="light" /><ActivityIndicator size="large" color="#e91e63" /></View>;
  }

  return (
    <View style={T.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
        
        <FadeIn key={`${isDark}-${activeTab}`} style={{ flex: 1 }}><View style={T.content}>
        {activeTab === 'home' && (
          <ErrorBoundary>
          <HomeScreen
            isDark={isDark}
            onEnterWorld={(session) => setWorldSession(session)}
            onNewWorld={() => setShowWorldSetup(true)}
            onNewFanfic={() => setShowFanfic(true)}
            onViewCharacters={() => setActiveTab('characters')}
          />
          </ErrorBoundary>
        )}
        {activeTab === 'settings' && (
          <ErrorBoundary>
          <SettingsScreen isDark={isDark} onToggleTheme={() => setMode(isDark ? 'light' : 'dark')} />
          </ErrorBoundary>
        )}
        {activeTab === 'characters' && (
          <ErrorBoundary>
          <CharactersTab isDark={isDark} onSelectChar={(c) => setDetailChar(c)} />
          </ErrorBoundary>
        )}
        {activeTab === 'create' && (
          <ErrorBoundary>
          <CreateScreen isDark={isDark} onCreated={() => setActiveTab('characters')} />
          </ErrorBoundary>
        )}
      </View>
              
        
        </FadeIn>
<View style={T.tabBar}>
        {[
          { key: 'home' as Tab, icon: '🌍', label: '世界' },
          { key: 'characters' as Tab, icon: '♟', label: '角色' },
          { key: 'create' as Tab, icon: '+', label: '创建' },
          { key: 'settings' as Tab, icon: '⚙', label: '设置' },
        ].map(tab => (
          <TouchableOpacity key={tab.key} style={T.tab} onPress={() => setActiveTab(tab.key)}>
            <Text style={[T.tabIcon, activeTab === tab.key && T.tabIconActive]}>{tab.icon}</Text>
            <Text style={[T.tabLabel, activeTab === tab.key && T.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function theme(dark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: dark ? '#0d0d0d' : '#fafafa' },
    loadingContainer: { flex: 1, backgroundColor: dark ? '#0d0d0d' : '#fafafa', justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    tabBar: {
      flexDirection: 'row', borderTopWidth: 1,
      borderTopColor: dark ? '#1a1a1a' : '#e8e8e8',
      backgroundColor: dark ? '#0d0d0d' : '#fafafa',
      paddingBottom: 20, paddingTop: 8,
    },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
    tabIcon: { fontSize: 18, color: dark ? '#555' : '#bbb', marginBottom: 2 },
    tabIconActive: { color: '#5B9BD5' },
    tabLabel: { fontSize: 11, color: dark ? '#555' : '#bbb' },
    tabLabelActive: { color: '#5B9BD5' },
  });
}


