// ============================================================
//  Koyoi 主题系统
//  暖调浅色（默认）/ 暖调深色，平等并列
//  色彩 + 间距 + 字体 + 圆角 + 动画 token
// ============================================================

export const colors = {
  light: {
    bg:        '#FAF8F5',   // 暖米白 页面背景
    card:      '#FFFFFF',   // 纯白   卡片
    border:    '#E8E4DD',   // 淡米灰 边框
    accent:    '#5B9BD5',   // 琥珀金 主色
    accentBg:  '#E8F0F8',   // 琥珀底
    text:      '#2D2822',   // 深棕   主文字
    textMuted: '#8A8070',   // 暖灰   次级文字
    textFaded: '#B8B0A4',   // 浅灰   弱文字
    danger:    '#C44B4B',   // 危险/删除
    success:   '#5A8A5A',   // 成功
    warning:   '#C4944B',   // 警告
    overlay:   'rgba(0,0,0,0.3)',
  },
  dark: {
    bg:        '#0D0C0A',   // 暖黑
    card:      '#1A1814',
    border:    '#2A2822',
    accent:    '#6CB4EE',
    accentBg:  '#1A2430',
    text:      '#E8DCC8',   // 暖白
    textMuted: '#8A8068',
    textFaded: '#5A5450',
    danger:    '#D46A6A',
    success:   '#6A9A6A',
    warning:   '#D4A45A',
    overlay:   'rgba(0,0,0,0.6)',
  },
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm:  8,
  md:  10,
  lg:  12,
  xl:  16,
} as const;

export const fontSize = {
  xs:  11,
  sm:  13,
  md:  15,
  lg:  17,
  xl:  20,
  xxl: 26,
} as const;

export const fontWeight = {
  normal: '400' as const,
  bold:   '600' as const,
};

export const fontFamily = undefined; // 使用系统默认字体

// 动画 token（配合 moti 使用）
export const spring = {
  type: 'spring' as const,
  damping: 18,
  stiffness: 200,
};

export const gentle = {
  type: 'timing' as const,
  duration: 250,
};

export const quick = {
  type: 'timing' as const,
  duration: 150,
};

export const bouncy = {
  type: 'spring' as const,
  damping: 12,
  stiffness: 180,
  mass: 0.8,
};

// ── 安全区域辅助（替代硬编码 paddingTop） ──
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 获取顶部安全区域值（状态栏高度 + 额外空隙）
 * 替代所有硬编码的 paddingTop: 50/56/60
 */
export function useSafeAreaTop(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, 24); // 至少 24px 间隙
}

/**
 * 获取底部安全区域值（导航栏高度 + 额外空隙）
 */
export function useSafeAreaBottom(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 16);
}

export type Theme = typeof colors.light;
export type ThemeMode = 'light' | 'dark';
