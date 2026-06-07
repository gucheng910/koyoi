import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function FadeIn({ children, style }: { children: React.ReactNode; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (hasAnimated.current) { opacity.setValue(1); return; }
    hasAnimated.current = true;
    Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={[style, { opacity }]} pointerEvents="box-none">{children}</Animated.View>;
}
