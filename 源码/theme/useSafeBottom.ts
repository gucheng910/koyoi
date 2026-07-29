// ============================================================
//  底部安全区域 hook
//  通过 react-native-safe-area-context 原生 inset 获取精确值
//  自动区分：虚拟导航栏(48dp) / 手势条(~16dp) / 无底部装饰(0)
//  必须在 <SafeAreaProvider> 组件树内调用
// ============================================================
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useSafeBottom(): number {
  const insets = useSafeAreaInsets();
  // insets.bottom:
  //   有虚拟导航栏 → 48dp
  //   手势条 → ~16dp
  //   无底部装饰 → 0
  return Math.max(insets.bottom, 12);
}
