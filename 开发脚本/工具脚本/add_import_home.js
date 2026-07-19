const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/HomeScreen.tsx', 'utf8');

// Add import handler before the return
const marker = "  }, [isGenerating, session, messages, segments, saveSession]);";
t = t.replace(marker, marker + "\n\n  const handleImport = async () => {\n    const card = await pickAndParseCard();\n    if (!card) return;\n    showAlert('导入世界', `将「${card.name}」创建为新世界，包含一个预设角色。是否继续？`, [\n      { text: '取消', style: 'cancel' },\n      { text: '导入', onPress: async () => {\n        const world = cardToWorld(card);\n        await useWorldStore.getState().addWorld(world);\n        const ch = cardToCharacter(card, world.id);\n        await useCharacterStore.getState().addCharacter(ch);\n        showAlert('导入成功', `世界「${card.name}」已创建，角色「${ch.name}」已添加到角色库`);\n      } },\n    ]);\n  };\n");

// Wait, the marker doesn't exist in HomeScreen (that's in WorldChatScreen). Let me use a different marker.
// In HomeScreen, the component is a regular function, not a useCallback.
// Let me find the "showSessionMenu" function which is near the end

// Actually, let me just add the button to the actions row and the handler before return
const actionsLine = '<View style={S.actions}>';
const newActions = '<View style={S.actions}>\n        <TouchableOpacity style={[S.btnSecondary, { flex: 0.5 }]} onPress={handleImport}><Text style={S.btnSecondaryText}>📥 导入</Text></TouchableOpacity>';
t = t.replace(actionsLine, newActions);

// Also add the handler function before the return
const returnStmt = '  return (\n    <View style={S.container}>';
t = t.replace(returnStmt, "  const handleImport = async () => {\n    const card = await pickAndParseCard();\n    if (!card) return;\n    showAlert('导入世界', `将「${card.name}」创建为新世界，包含一个预设角色。是否继续？`, [\n      { text: '取消', style: 'cancel' },\n      { text: '导入', onPress: async () => {\n        const world = cardToWorld(card);\n        await useWorldStore.getState().addWorld(world);\n        const ch = cardToCharacter(card, world.id);\n        await useCharacterStore.getState().addCharacter(ch);\n        showAlert('导入成功', `世界「${card.name}」已创建，角色「${ch.name}」已添加到角色库`);\n      } },\n    ]);\n  };\n\n" + returnStmt);

fs.writeFileSync('D:/koyoi/src/screens/HomeScreen.tsx', t);
console.log('import added to HomeScreen');
