const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Insert Btn and fmtPercent right before MainSettings
const marker = '// ── 主设置页 ──';
const insert = `function fmtPercent(n: number): string {
  if (!n || isNaN(n)) return '0%';
  return (n * 100).toFixed(0) + '%';
}

function Btn({ label, active, onPress, dark }: { label: string; active: boolean; onPress: () => void; dark: boolean }) {
  return (
    <TouchableOpacity style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: active ? (dark ? '#1A2430' : '#E8F0F8') : (dark ? '#252525' : '#f0f0f0'), alignItems: 'center', borderWidth: active ? 1 : 0, borderColor: active ? '#5B9BD5' : 'transparent' }]} onPress={onPress}>
      <Text style={{ color: active ? '#5B9BD5' : '#999', fontSize: 13, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}

${marker}`;

t = t.replace(marker, insert);
fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('Btn inserted, new length:', t.length);
