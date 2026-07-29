// ============================================================
//  安全区域辅助（静态值）
//  顶部用 StatusBar.currentHeight 计算
//  底部用 react-native-safe-area-context hook
// ============================================================
import { Platform, StatusBar } from 'react-native';

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

/** 顶部安全区域（状态栏高度 + 额外间距） */
export const SAFE_TOP = Math.max(STATUSBAR_HEIGHT + 8, 32);
