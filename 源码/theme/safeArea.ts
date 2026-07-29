// ============================================================
//  安全区域辅助（无 hook 版本）
//  用 Dimensions + Platform 在模块加载时计算安全区域
//  避免依赖 SafeAreaProvider
//
//  底部安全区：Android 虚拟导航栏标准高度为 48dp，
//  直接固定这个值（screen.height - window.height 在覆盖模式下差值为 0）
// ============================================================
import { Dimensions, Platform, StatusBar } from 'react-native';

// 仅用于顶部安全区计算
const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

/** 顶部安全区域（状态栏高度 + 额外间距），用于替代硬编码 paddingTop */
export const SAFE_TOP = Math.max(STATUSBAR_HEIGHT + 8, 32);

/** 底部安全区域
 *  Android 虚拟导航栏标准高度 48dp
 *  手势条设备也无妨——多 48dp 间距不影响功能
 *  iOS → 34dp（home indicator 高度）
 */
export const SAFE_BOTTOM = Platform.OS === 'android' ? 48 : 34;
