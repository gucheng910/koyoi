const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/FanficScreen.tsx', 'utf8');

// 找到 step === 'config' 的第一个渲染行
const configIdx = t.indexOf("step === 'config' && worldCard && (");
if (configIdx < 0) { console.log('NOT FOUND'); process.exit(1); }

// 在 config step 渲染前加完整性检查
t = t.replace(
  "step === 'config' && worldCard && (",
  "step === 'config' && worldCard ? ((() => {\n" +
  "            // 数据完整性检查\n" +
  "            const issues: string[] = [];\n" +
  "            if (!worldCard.rules || typeof worldCard.rules !== 'object') issues.push('rules 为空');\n" +
  "            if (!Array.isArray(worldCard.characters)) issues.push('characters 不是数组');\n" +
  "            if (!Array.isArray(worldCard.timeline)) issues.push('timeline 不是数组');\n" +
  "            if (!Array.isArray(worldCard.locations)) issues.push('locations 不是数组');\n" +
  "            if (!worldCard.worldType) issues.push('worldType 缺失');\n" +
  "            if (issues.length > 0) {\n" +
  "              return (\n" +
  "                <>\n" +
  "                  <Text style={st.stepNum}>STEP 3</Text>\n" +
  "                  <Text style={st.stepTitle}>数据异常</Text>\n" +
  "                  <View style={{ backgroundColor: isDark ? '#2A1A1A' : '#FEE8E8', borderRadius: 10, padding: 16, marginBottom: 20 }}>\n" +
  "                    <Text style={{ color: '#E0556A', fontSize: 13, marginBottom: 8 }}>检测到以下字段损坏：</Text>\n" +
  "                    {issues.map((iss, i) => <Text key={i} style={{ color: '#E0A0A0', fontSize: 12 }}>· {iss}</Text>)}\n" +
  "                  </View>\n" +
  "                  <Text style={{ color: '#8A8070', fontSize: 13, marginBottom: 16 }}>这通常是 AI 分析阶段中断造成的。你可以回到上一步重新分析，或在报错页面使用 AI 修复。</Text>\n" +
  "                  <TouchableOpacity style={st.startBtn} onPress={async () => {\n" +
  "                    const cfg = configStore.getActiveConfig();\n" +
  "                    if (!cfg?.apiKey) { showAlert('无法修复', '请先配置 API Key'); return; }\n" +
  "                    setParsingStatus('AI 修复中...');\n" +
  "                    try {\n" +
  "                      const { repairWorld: rw, mergeRepair: mr, diagnoseError: de, backupSession: bs } = require('../services/worldRepair');\n" +
  "                      const dummySession = { id: worldCard.id, world: { name: worldCard.novelTitle, type: worldCard.worldType, rules: worldCard.rules || {}, locations: worldCard.locations || [], timeline: worldCard.timeline || [], characters: worldCard.characters || [], writingStyle: worldCard.writingStyle || '', styleSamples: worldCard.styleSamples || [], keyDecisions: worldCard.keyDecisions || [], inertia: { majorEvents: 0.7, characterFate: 0.5, worldReaction: 0.5 }, butterflySensitivity: { minor: '', major: '' } }, selectedCharacters: [], npcs: [], messages: [], worldLog: [], createdAt: new Date().toISOString() };\n" +
  "                      const target = de(new Error('Length check failed'), dummySession) || { field: 'rules', expectedType: 'object', actualValue: 'undefined', missingFields: 'physics,supernatural,technology,society' };\n" +
  "                      const repaired = await rw(dummySession, target, cfg);\n" +
  "                      if (repaired) {\n" +
  "                        const updated = { ...worldCard, ...repaired };\n" +
  "                        if (repaired.rules) updated.rules = { ...worldCard.rules, ...repaired.rules };\n" +
  "                        setWorldCard(updated);\n" +
  "                        setToast({msg: '修复完成', type: 'success'});\n" +
  "                      }\n" +
  "                    } catch (e: any) { setToast({msg: '修复失败: ' + e.message, type: 'error'}); }\n" +
  "                    setParsingStatus('');\n" +
  "                  }}><Text style={st.startBtnText}>🤖 在此修复</Text></TouchableOpacity>\n" +
  "                  <TouchableOpacity style={[st.startBtn, { backgroundColor: isDark ? '#2A2822' : '#E8E4DD', marginTop: 10 }]} onPress={() => setStep('split_done')}><Text style={[st.startBtnText, { color: isDark ? '#888' : '#555' }]}>← 返回重新分析</Text></TouchableOpacity>\n" +
  "                </>\n" +
  "              );\n" +
  "            }\n" +
  "            return null;\n" +
  "          })() : null}\n" +
  "          {step === 'config' && worldCard && ("
);

fs.writeFileSync('D:/koyoi/src/screens/FanficScreen.tsx', t);
console.log('integrity check added');
