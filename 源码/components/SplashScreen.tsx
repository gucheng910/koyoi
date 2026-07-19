import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';

interface Props { onFinish: () => void; }

const { width: SW } = Dimensions.get('window');

export default function SplashScreen({ onFinish }: Props) {
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const spineScaleY = useRef(new Animated.Value(0)).current;
  const pageScaleX = useRef(new Animated.Value(0)).current;
  const ink1 = useRef(new Animated.Value(0)).current;
  const ink2 = useRef(new Animated.Value(0)).current;
  const ink3 = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.sequence([
      // Ring pulse 0-400ms
      Animated.timing(ringOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(ringScale, { toValue: 1.6, duration: 800, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
      // Spine + Page parallel 200ms
      Animated.parallel([
        Animated.spring(spineScaleY, { toValue: 1, friction: 10, tension: 120, useNativeDriver: true }),
        Animated.spring(pageScaleX, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
      ]),
      // Ink dots stagger 80ms each
      Animated.stagger(80, [
        Animated.spring(ink1, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
        Animated.spring(ink2, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
        Animated.spring(ink3, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
      ]),
      // Wordmark
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(wordY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setTimeout(onFinish, 250);
    });
  }, []);

  const dotIn = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-15, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1.3, 1] }) },
    ],
  });

  return (
    <View style={S.container}>
      {/* Ring */}
      <Animated.View style={[S.ring, {
        opacity: ringOpacity,
        transform: [{ scale: ringScale }],
      }]} />

      {/* Book: centered flex row */}
      <View style={S.bookRow}>
        {/* Spine */}
        <Animated.View style={[S.spine, {
          transform: [{ scaleY: spineScaleY }],
        }]} />
        {/* Page */}
        <Animated.View style={[S.page, {
          transform: [{ scaleX: pageScaleX }],
        }]} />
      </View>

      {/* Ink dots */}
      <View style={S.inkRow}>
        <Animated.View style={[S.inkDot, dotIn(ink1)]} />
        <Animated.View style={[S.inkDot, dotIn(ink2)]} />
        <Animated.View style={[S.inkDot, dotIn(ink3)]} />
      </View>

      {/* Wordmark */}
      <Animated.View style={{
        opacity: wordOpacity,
        transform: [{ translateY: wordY }],
      }}>
        <Text style={S.wordmarkText}>Koyoi</Text>
        <Text style={S.wordmarkSub}>互动小说</Text>
      </Animated.View>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0C0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 1.5, borderColor: 'rgba(91,155,213,0.2)',
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 90,
    marginBottom: 20,
  },
  spine: {
    width: 3,
    backgroundColor: '#E8DCC8',
    borderRadius: 2,
  },
  page: {
    width: 60,
    backgroundColor: '#C8BFA0',
    borderRadius: 2,
  },
  inkRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  inkDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#5B9BD5',
  },
  wordmarkText: {
    fontSize: 36, fontWeight: '300',
    color: '#E8DCC8', letterSpacing: 12,
    textAlign: 'center',
  },
  wordmarkSub: {
    fontSize: 10, color: '#8A8070', letterSpacing: 6,
    marginTop: 6, textAlign: 'center',
  },
});
