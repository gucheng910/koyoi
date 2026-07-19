const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', 'utf8');

// Find the insert point: after the imports, before MainSettings
const insertPoint = t.indexOf('// ── 主设置页 ──');
const BtnFn = `
function Btn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const isDark = true; // 从父组件无法直接获取，用行内 style
  return (
    <TouchableOpacity style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: active ? '#1A2430' : (isDark ? '#252525' : '#f0f0f0'), alignItems: 'center', borderWidth: active ? 1 : 0, borderColor: active ? '#5B9BD5' : 'transparent' }]} onPress={onPress}>
      <Text style={{ color: active ? '#5B9BD5' : '#999', fontSize: 13, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}
`;

t = t.slice(0, insertPoint) + BtnFn + '\n' + t.slice(insertPoint);
fs.writeFileSync('D:/koyoi/src/screens/SettingsScreen.tsx', t);
console.log('Btn added');
