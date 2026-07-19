const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Fix getStyles: add navItem, use warm colors, consistent with app theme
const oldStyles = `function getStyles(dark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: dark ? '#0D0C0A' : '#FAF8F5' },
    title: { fontSize: 32, fontWeight: '800', color: dark ? '#E8DCC8' : '#1a1a1a', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24, letterSpacing: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: dark ? '#aaa' : '#777', letterSpacing: 1 },
    chevron: { fontSize: 14, color: dark ? '#666' : '#bbb', marginLeft: 6 },
    card: { backgroundColor: dark ? '#1a1a1a' : '#fff', borderRadius: 16, padding: 18, marginHorizontal: 20, marginBottom: 10 },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { fontSize: 15, color: dark ? '#ddd' : '#333' },
    fieldLabel: { fontSize: 14, color: dark ? '#aaa' : '#666', marginBottom: 10 },
    input: { backgroundColor: dark ? '#111' : '#E8DCC8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: dark ? '#E8DCC8' : '#1a1a1a', fontSize: 15, borderWidth: 0 },
    row: { flexDirection: 'row', gap: 8 },
    btn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: dark ? '#252525' : '#f0f0f0', alignItems: 'center', borderWidth: 0 },
    btnActive: { backgroundColor: dark ? '#1A2430' : '#E8F0F8' },
    btnText: { color: dark ? '#999' : '#999', fontSize: 14, fontWeight: '500' },
    btnTextActive: { color: '#5B9BD5', fontWeight: '600' },
    mainBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });
}`;

const newStyles = `function getStyles(dark: boolean) {
  const c = dark
    ? { bg: '#0E0D0B', card: '#1C1912', border: '#2C2A22', text: '#E8DCC8', muted: '#8A8070', faded: '#5A5450', accent: '#5B9BD5', input: '#13110F', btnBg: '#25231F', btnActive: '#1A2430' }
    : { bg: '#F8F9FA', card: '#FFFFFF', border: '#E8E4DD', text: '#2D2822', muted: '#8A8070', faded: '#B8B0A4', accent: '#4A8AC4', input: '#F0EDE8', btnBg: '#F0EDE8', btnActive: '#E8F0F8' };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    title: { fontSize: 28, fontWeight: '700', color: c.text, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24, letterSpacing: 1 },
    card: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: c.border },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: c.faded, letterSpacing: 2, marginBottom: 8 },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8 },
    input: { backgroundColor: c.input, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontSize: 14, borderWidth: 1, borderColor: c.border },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, marginHorizontal: 20, marginBottom: 2, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border },
    mainBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    mainBtnText: { fontSize: 15, fontWeight: '600' },
    navBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    navBtnActive: { borderColor: c.accent },
    navBtnText: { fontSize: 12, fontWeight: '500', color: c.muted },
    navBtnTextActive: { color: c.accent, fontWeight: '600' },
  });
}`;

t = t.replace(oldStyles, newStyles);

// Fix Btn to use S.navBtn styles (remove inline styles)
const oldBtn = `function Btn({ label, active, onPress, dark }: { label: string; active: boolean; onPress: () => void; dark: boolean }) {
  return (
    <TouchableOpacity style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: active ? (dark ? '#1A2430' : '#E8F0F8') : (dark ? '#252525' : '#f0f0f0'), alignItems: 'center', borderWidth: active ? 1 : 0, borderColor: active ? '#5B9BD5' : 'transparent' }]} onPress={onPress}>
      <Text style={{ color: active ? '#5B9BD5' : '#999', fontSize: 13, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}`;

const newBtn = `function Btn({ label, active, onPress, dark }: { label: string; active: boolean; onPress: () => void; dark: boolean }) {
  const S = getStyles(dark);
  return (
    <TouchableOpacity style={[S.navBtn, active && S.navBtnActive]} onPress={onPress}>
      <Text style={[S.navBtnText, active && S.navBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}`;

t = t.replace(oldBtn, newBtn);

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('SettingsScreen styles rewritten');
