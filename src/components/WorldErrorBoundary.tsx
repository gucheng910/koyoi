// ============================================================
//  世界错误边界
//  拦截 WorldChatScreen 渲染崩溃，提供 AI 修复入口
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { WorldSession } from '../types';
import { diagnoseError, repairWorld, mergeRepair, backupSession } from '../services/worldRepair';
import { useConfigStore } from '../store/configStore';

interface Props {
  session: WorldSession;
  /** 修复完成后回调：传入修复后的 session */
  onRepair: (repairedSession: WorldSession) => void;
  /** 放弃修复，返回 */ 
  onBack: () => void;
  /** 暗色模式 */
  isDark: boolean;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  repairing: boolean;
  repairStatus: string;
  repairFailed: boolean;
}

export default class WorldErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, repairing: false, repairStatus: '', repairFailed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.warn('[WorldErrorBoundary] Crash:', error.message);
  }

  handleRepair = async () => {
    const { session, onRepair } = this.props;
    const { error } = this.state;
    if (!error) return;

    const cfg = useConfigStore.getState().getActiveConfig();
    if (!cfg?.apiKey) {
      this.setState({ repairStatus: '请先在设置中配置 API Key', repairFailed: true });
      return;
    }

    this.setState({ repairing: true, repairStatus: '正在诊断损坏字段...' });

    // 1. 备份
    await backupSession(session);

    // 2. 诊断
    const target = diagnoseError(error, session);
    if (!target) {
      this.setState({ repairing: false, repairStatus: '无法诊断错误类型，建议重新分析', repairFailed: true });
      return;
    }
    this.setState({ repairStatus: `诊断：${target.field} 损坏（${target.actualValue}），AI 修复中...` });

    // 3. 修复
    try {
      const repaired = await repairWorld(session, target, cfg);
      if (!repaired || Object.keys(repaired).length === 0) {
        this.setState({ repairing: false, repairStatus: 'AI 返回为空，可能数据不足以修复', repairFailed: true });
        return;
      }

      // 4. 合并
      const merged = mergeRepair(session, repaired);
      this.setState({ repairStatus: '修复完成', repairing: false });
      onRepair(merged);
    } catch (e: any) {
      this.setState({ repairing: false, repairStatus: `修复失败: ${e.message || ''}`, repairFailed: true });
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, repairing: false, repairStatus: '', repairFailed: false });
  };

  render() {
    const { children, isDark } = this.props;
    const { hasError, error, repairing, repairStatus, repairFailed } = this.state;
    const c = isDark
      ? { bg: '#0D0C0A', card: '#1A1814', text: '#E8DCC8', muted: '#8A8070', accent: '#5B9BD5', err: '#E0556A', btn: '#1A2430' }
      : { bg: '#FAF8F5', card: '#FFFFFF', text: '#2D2822', muted: '#8A8070', accent: '#4A8AC4', err: '#C44B4B', btn: '#E8F0F8' };

    if (!hasError) return <>{children}</>;

    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Text style={[styles.icon]}>🧩</Text>
        <Text style={[styles.title, { color: c.text }]}>世界加载异常</Text>
        <View style={[styles.errorBox, { backgroundColor: isDark ? '#2A1A1A' : '#FEE8E8', borderColor: c.err }]}>
          <Text style={[styles.errorText, { color: c.err }]}>{error?.message || '未知错误'}</Text>
        </View>

        {repairing && (
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <ActivityIndicator size="small" color={c.accent} style={{ marginBottom: 8 }} />
            <Text style={[styles.status, { color: c.muted }]}>{repairStatus}</Text>
          </View>
        )}
        {repairFailed && (
          <Text style={[styles.status, { color: c.err, marginBottom: 20 }]}>{repairStatus}</Text>
        )}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: c.accent }]}
          onPress={repairFailed ? this.handleRetry : this.handleRepair}
          disabled={repairing}
        >
          <Text style={styles.btnPrimary}>
            {repairFailed ? '🔄 重试' : repairing ? '⏳ 修复中…' : '🤖 AI 智能修复'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: c.btn, borderWidth: 1, borderColor: isDark ? '#2A2822' : '#E8E4DD' }]} onPress={this.handleRetry}>
          <Text style={[styles.btnText, { color: c.muted }]}>🔄 重新加载</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={this.props.onBack}>
          <Text style={[styles.backLink, { color: c.accent }]}>← 返回首页</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  errorBox: { borderRadius: 10, padding: 14, marginBottom: 24, borderWidth: 1, maxWidth: 320 },
  errorText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  status: { fontSize: 13, textAlign: 'center', marginBottom: 16, maxWidth: 280 },
  btn: { width: 220, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  btnPrimary: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  btnText: { fontSize: 14, fontWeight: '600' },
  backLink: { fontSize: 14, marginTop: 20 },
});
