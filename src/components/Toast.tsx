import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

interface Props {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onHide: () => void;
}

export default function Toast({ visible, message, type = 'info', onHide }: Props) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 200, useNativeDriver: true }),
      ]).start();
      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, { toValue: -60, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => onHide());
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  const bg = type === 'success' ? '#1a3a1a' : type === 'error' ? '#3a1a1a' : '#1a2a3a';
  const color = type === 'success' ? '#4caf50' : type === 'error' ? '#ff6b6b' : '#64b5f6';

  return (
    <Animated.View style={[styles.container, { backgroundColor: bg, opacity, transform: [{ translateY }, { scale }] }]}>
      <Text style={[styles.text, { color }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 100, left: 20, right: 20,
    padding: 14, borderRadius: 12, zIndex: 999,
    alignItems: 'center',
  },
  text: { fontSize: 14, fontWeight: '600' },
});
