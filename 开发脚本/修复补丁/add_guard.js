const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 1. 回退刚才的复杂修改
t = t.replace(
  /step === 'config' && worldCard \? \(\(\(\) => \{[\s\S]*?\}\)\(\) : null\)\n\s*\{\s*step === 'config' && worldCard && \(/,
  "step === 'config' && worldCard && ("
);

// 2. 在 return 前添加 worldCard 完整性守卫。搜索 "return (" 并在 return 前插入
t = t.replace(
  "  return (\n    \n    <FadeIn style={{ flex: 1 }}><View style={st.container}>",
  "  // 数据完整性守卫：检测 worldCard 是否损坏\n" +
  "  if (worldCard && step === 'config') {\n" +
  "    const broken = !worldCard.rules || typeof worldCard.rules !== 'object';\n" +
  "    if (broken) {\n" +
  "      return (\n" +
  "        <View style={{ flex: 1, backgroundColor: isDark ? '#0D0C0A' : '#FAF8F5', justifyContent: 'center', alignItems: 'center', padding: 40 }}>\n" +
  "          <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>\n" +
  "          <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#E8DCC8' : '#2D2822', marginBottom: 12 }}>分析数据不完整</Text>\n" +
  "          <Text style={{ fontSize: 13, color: isDark ? '#8A8070' : '#8A8070', textAlign: 'center', marginBottom: 24 }}>分析可能被中断，规则数据未提取。\n请重新分析或从已分析列表重试。</Text>\n" +
  "          <TouchableOpacity style={{ paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, backgroundColor: '#5B9BD5', marginBottom: 10 }} onPress={() => setStep('split_done')}>\n" +
  "            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>← 重新分析</Text>\n" +
  "          </TouchableOpacity>\n" +
  "          <TouchableOpacity onPress={onBack} style={{ marginTop: 20 }}>\n" +
  "            <Text style={{ color: '#5B9BD5', fontSize: 14 }}>← 返回</Text>\n" +
  "          </TouchableOpacity>\n" +
  "        </View>\n" +
  "      );\n" +
  "    }\n" +
  "  }\n" +
  "\n  return (\n    \n    <FadeIn style={{ flex: 1 }}><View style={st.container}>"
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('guard added');
