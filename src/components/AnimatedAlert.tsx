import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Modal, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

let globalShow: ((title: string, message: string, buttons: AlertButton[]) => void) | null = null;
const pendingAlerts: Array<[string, string, AlertButton[]]> = [];

export function showAlert(title: string, message: string, buttons: AlertButton[]) {
  if (globalShow) { globalShow(title, message, buttons); } else { pendingAlerts.push([title, message, buttons]); }
}

export function AnimatedAlertProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  const isDark = mode === 'dark';
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState<AlertButton[]>([]);
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback((t: string, m: string, b: AlertButton[]) => {
    setTitle(t); setMessage(m); setButtons(b); setVisible(true);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, []);

  useEffect(() => { globalShow = show; pendingAlerts.forEach(a => show(a[0], a[1], a[2])); pendingAlerts.length = 0; return () => { globalShow = null; }; }, [show]);

  const handlePress = (btn: AlertButton) => {
    hide();
    setTimeout(() => btn.onPress?.(), 200);
  };

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => buttons.find(b => b.style === 'cancel')?.onPress?.()}>
        <View style={styles.overlay}>
          <Animated.View style={[styles.card, { opacity, transform: [{ scale }], backgroundColor: isDark ? '#1A1814' : '#FFFFFF', borderColor: isDark ? '#2A2822' : '#E8E4DD' }]}>
            {title ? <Text style={[styles.title, { color: isDark ? '#E8DCC8' : '#2D2822' }]}>{title}</Text> : null}
            <Text style={[styles.message, { color: isDark ? '#8A8070' : '#8A8068' }]}>{message}</Text>
            <View style={styles.row}>
              {buttons.map((btn, i) => (
                <TouchableOpacity key={i} style={[styles.btn, btn.style === 'cancel' && { backgroundColor: isDark ? '#2A2822' : '#E8E4DD' }, btn.style === 'destructive' && styles.btnDestructive]} onPress={() => handlePress(btn)}>
                  <Text style={[styles.btnText, { color: isDark ? '#5B9BD5' : '#4A8AC4' }, btn.style === 'destructive' && styles.btnTextDestructive]}>{btn.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 40 },
  card: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, borderWidth: 1 },
  title: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  btnDestructive: {},
  btnText: { fontSize: 14, fontWeight: '600' },
  btnTextDestructive: { color: '#C44B4B' },
});
