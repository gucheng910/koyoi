const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Replace only color values in the styles function
const colorMap = {
  "'#0d0d0d'": "'#0D0C0A'",
  "'#fafafa'": "'#FAF8F5'",
  "'#1a1a1a'": "'#1A1814'",
  "'#333'": "'#2A2822'",
  "'#ddd'": "'#E8E4DD'",
  "'#e91e63'": "'#B8944C'",
  "'#f5f5f5'": "'#E8DCC8'",
  "'#888'": "'#8A8070'",
  "'#999'": "'#8A8070'",
  "'#aaa'": "'#B8B0A4'",
  "'#666'": "'#8A8070'",
  "'#fff'": "'#FFFFFF'",
};

for (const [old, neo] of Object.entries(colorMap)) {
  t = t.replace(new RegExp(old, 'g'), neo);
}

// Align section labels - make them left-aligned with consistent spacing
t = t.replace(
  "section: { marginBottom: 20, paddingHorizontal: 20 },",
  "section: { marginBottom: 24, paddingHorizontal: 20 },"
);

t = t.replace(
  "label: { fontSize: 14, color: dark ? '#aaa' : '#666', marginBottom: 8 },",
  "label: { fontSize: 14, fontWeight: '600', color: dark ? '#E8DCC8' : '#2D2822', marginBottom: 10 },"
);

t = t.replace(
  "row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 },",
  "row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },"
);

t = t.replace(
  "switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },",
  "switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },"
);

t = t.replace(
  "input: {",
  "fieldLabel: { fontSize: 12, fontWeight: '600', color: dark ? '#8A8070' : '#8A8070', marginBottom: 6, letterSpacing: 1 }, input: {"
);

// Improve button styles
t = t.replace(
  "btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },",
  "btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },"
);

t = t.replace(
  "btnActive: { backgroundColor: dark ? '#2A2418' : '#F5ECD7', borderColor: '#B8944C' },",
  "btnActive: { backgroundColor: dark ? '#2A2418' : '#F5ECD7', borderColor: '#B8944C', borderWidth: 1.5 },"
);

t = t.replace(
  "btnText: { fontSize: 14, color: dark ? '#B8B0A4' : '#8A8070' },",
  "btnText: { fontSize: 13, color: dark ? '#8A8070' : '#8A8070' },"
);

t = t.replace(
  "btnTextActive: { color: '#B8944C' },",
  "btnTextActive: { color: '#B8944C', fontWeight: '600' },"
);

// Section title
t = t.replace(
  "sectionTitle: { fontSize: 12, fontWeight: '700', color: '#B8944C', letterSpacing: 2, paddingHorizontal: 20, marginBottom: 12, marginTop: 20 },",
  "sectionTitle: { fontSize: 12, fontWeight: '700', color: '#B8944C', letterSpacing: 2, paddingHorizontal: 20, marginBottom: 14, marginTop: 24, textTransform: 'uppercase' },"
);

// Card style (if exists)
if (t.includes('card: {')) {
  t = t.replace(
    "card: { backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, marginHorizontal: 20, borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },",
    "card: { backgroundColor: dark ? '#1A1814' : '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10, marginHorizontal: 20, borderWidth: 1, borderColor: dark ? '#2A2822' : '#E8E4DD' },"
  );
}

fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('Settings UI improved');
