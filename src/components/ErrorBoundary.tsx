// ============================================================
//  错误边界 - 防止单个组件崩溃导致整个 App 白屏
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfigStore } from '../store/configStore';
import { diagnoseError, repairWorld, mergeRepair, backupSession } from '../services/worldRepair';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0C0A', justifyContent: 'center', alignItems: 'center', padding: 40 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#E8DCC8', marginBottom: 12 },
  message: { fontSize: 14, color: '#E0556A', textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  hint: { fontSize: 12, color: '#8A8070', textAlign: 'center', marginBottom: 20, backgroundColor: '#1A1814', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, overflow: 'hidden' },
  btn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2A2822', borderWidth: 1, borderColor: '#3A3832' },
  btnText: { color: '#E8DCC8', fontSize: 14, fontWeight: '600' },
  repairBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, backgroundColor: '#5B9BD5', marginBottom: 12 },
  repairBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  statusText: { fontSize: 13, color: '#8A8070', textAlign: 'center', marginBottom: 16, maxWidth: 280 },
});


function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const [repairing, setRepairing] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [repaired, setRepaired] = React.useState(false);

  const handleRepair = async () => {
    if (!error) return;
    setRepairing(true);
    setStatus('正在诊断...');
    try {
      // 尝试两个存储键
      let raw = await AsyncStorage.getItem('@koyoi_world_sessions');
      let storeKey = '@koyoi_world_sessions';
      if (!raw) {
        raw = await AsyncStorage.getItem('@koyoi_custom_worlds');
        storeKey = '@koyoi_custom_worlds';
      }
      if (!raw) { setStatus('未找到任何世界数据（两个存储均为空）。请先创建一个世界。'); setRepairing(false); return; }
      let sessions = JSON.parse(raw);
      if (!Array.isArray(sessions) || sessions.length === 0) { setStatus('数据格式异常或为空'); setRepairing(false); return; }

      // 找出第一个  world.rules 缺失的 session
      let brokenIdx = -1;
      let brokenReason = '';
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        if (!s?.id) continue;
        // 多种损坏检测
        if (!s.world || typeof s.world !== 'object' || Array.isArray(s.world)) { brokenIdx = i; brokenReason = 'world 字段损坏（非对象）'; break; }
        if (!s.world.rules || typeof s.world.rules !== 'object') { brokenIdx = i; brokenReason = 'world.rules 缺失'; break; }
        if (s.messages && !Array.isArray(s.messages)) { brokenIdx = i; brokenReason = 'messages 非数组'; break; }
        if (s.selectedCharacters && !Array.isArray(s.selectedCharacters)) { brokenIdx = i; brokenReason = 'selectedCharacters 非数组'; break; }
        // 深度检查：world 对象中存在 undefined 的数组字段
        for (const key of ['locations', 'timeline', 'characters']) {
          if (typeof s.world[key] === 'undefined') { brokenIdx = i; brokenReason = 'world.' + key + ' 为 undefined'; break; }
        }
        if (brokenIdx >= 0) break;
      }
      if (brokenIdx < 0) { setStatus('未找到明显损坏的世界。尝试修复 error message 中提到的字段...'); 
        // 兜底：对第一个有 world 的 session 做通用修复
        for (let i = 0; i < sessions.length; i++) { if (sessions[i]?.id && sessions[i]?.world) { brokenIdx = i; brokenReason = '通用修复'; break; } }
      }
      if (brokenIdx < 0) { setStatus('没有可修复的世界数据（存储为空）'); setRepairing(false); return; }

      const broken = sessions[brokenIdx];
      const brokenName = broken.world?.name || broken.world?.novelTitle || '未知世界';
      setStatus('修复 ' + brokenName + '（' + brokenReason + '）...');

      // 备份
      await backupSession(broken);

      // 诊断
      const target = diagnoseError(error, broken);
      if (!target) { setStatus('无法诊断错误类型'); setRepairing(false); return; }

      setStatus(target.field + ' 损坏，AI 修复中...');

      const cfg = useConfigStore.getState().getActiveConfig();
      if (!cfg?.apiKey) { setStatus('请先在设置中配置 API Key'); setRepairing(false); return; }

      const repaired = await repairWorld(broken, target, cfg);
      if (!repaired || Object.keys(repaired).length === 0) { setStatus('AI 返回为空'); setRepairing(false); return; }

      const merged = mergeRepair(broken, repaired);
      sessions[brokenIdx] = merged;
      await AsyncStorage.setItem(storeKey, JSON.stringify(sessions));
      setRepaired(true);
      setStatus('修复完成！点击重试进入');
    } catch (e: any) {
      setStatus('修复失败: ' + (e.message || ''));
    }
    setRepairing(false);
  };

  const msg = error?.message || '未知错误';
  const isLenError = msg.includes("length") && msg.includes("undefined");
  const isSupernatural = msg.includes("supernatural");

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🧩</Text>
      <Text style={[styles.title, { marginBottom: 8 }]}>出了点问题</Text>
      <Text style={styles.message}>{msg}</Text>

      {isLenError && <Text style={styles.hint}>检测到数据字段缺失（通常为 world.rules 为空）</Text>}
      {isSupernatural && <Text style={styles.hint}>检测到世界观规则字段缺失</Text>}

      {!repairing && !repaired && !status && (
        <>
        <TouchableOpacity style={styles.repairBtn} onPress={handleRepair}>
          <Text style={styles.repairBtnText}>🤖 AI 智能修复</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={async () => {
          setRepairing(true); setStatus('正在规范化全部世界数据...');
          try {
            let raw = await AsyncStorage.getItem('@koyoi_world_sessions');
            let storeKey = '@koyoi_world_sessions';
            if (!raw) { raw = await AsyncStorage.getItem('@koyoi_custom_worlds'); storeKey = '@koyoi_custom_worlds'; }
            if (!raw) { setStatus('存储为空（两个键均无数据）'); setRepairing(false); return; }
            const sessions = JSON.parse(raw);
            if (!Array.isArray(sessions)) { setStatus('数据格式错误'); setRepairing(false); return; }
            let fixed = 0;
            for (let i = 0; i < sessions.length; i++) {
              const s = sessions[i];
              if (!s?.id) continue;
              // 判断格式: WorldSession (有 world 嵌套) 还是 FanficWorldCard (扁平)
              const isSession = typeof s.world === 'object' && s.world && !Array.isArray(s.world);
              const isCard = s.rules !== undefined || s.characters !== undefined;
              if (isSession) {
                let w = s.world;
                if (!w.name) w.name = '修复的世界';
                if (!w.type) w.type = 'custom';
              if (!w.name) w.name = '修复的世界';
                if (!w.type) w.type = 'custom';
                if (!w.rules || typeof w.rules !== 'object') { w.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' }; fixed++; }
                if (!Array.isArray(w.locations)) { w.locations = []; fixed++; }
                if (!Array.isArray(w.timeline)) { w.timeline = []; fixed++; }
                if (!Array.isArray(w.characters)) { w.characters = []; fixed++; }
                if (!Array.isArray(s.selectedCharacters)) { s.selectedCharacters = []; fixed++; }
                if (!Array.isArray(s.npcs)) { s.npcs = []; fixed++; }
                if (!Array.isArray(s.messages)) { s.messages = []; fixed++; }
                if (!Array.isArray(s.worldLog)) { s.worldLog = []; fixed++; }
                if (!s.currentScene) s.currentScene = '';
              } else if (isCard) {
                // FanficWorldCard 扁平格式
                if (!s.novelTitle) s.novelTitle = '修复的小说';
                if (!s.worldType) s.worldType = 'modern';
                if (typeof s.rules !== 'object' || !s.rules) { s.rules = { physics: '', supernatural: '', technology: '', society: '', morality: '', sexualNorms: '' }; fixed++; }
                if (!Array.isArray(s.characters)) { s.characters = []; fixed++; }
                if (!Array.isArray(s.locations)) { s.locations = []; fixed++; }
                if (!Array.isArray(s.timeline)) { s.timeline = []; fixed++; }
              }
            }
            await AsyncStorage.setItem(storeKey, JSON.stringify(sessions));
            setStatus('已修复 ' + fixed + ' 个字段，可重试进入');
          } catch (e) { setStatus('修复失败: ' + (e.message || '')); }
          setRepairing(false);
        }}>
          <Text style={styles.btnText}>🔧 强制规范化（无需 AI）</Text>
        </TouchableOpacity>
        </>
      )}

      {repairing && (
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <ActivityIndicator size="small" color="#5B9BD5" style={{ marginBottom: 8 }} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {!repairing && status && !repaired && (
        <Text style={[styles.statusText, { color: '#E0556A' }]}>{status}</Text>
      )}

      {repaired && (
        <Text style={[styles.statusText, { color: '#5B9BD5', marginBottom: 16 }]}>{status}</Text>
      )}

      <TouchableOpacity style={styles.btn} onPress={onReset}>
        <Text style={styles.btnText}>{repaired ? '✅ 进入' : '🔄 重试'}</Text>
      </TouchableOpacity>
    </View>
  );
}