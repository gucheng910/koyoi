const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Add Clipboard import
t = t.replace(
  "} from 'react-native';",
  "} from 'react-native';\nimport * as Clipboard from 'expo-clipboard';"
);

// Add long press handler to user bubbles
t = t.replace(
  "if (item.role === 'user') {\n    const lines = item.content.split('\\n');\n    return <View>{lines.map((line, i) => {\n      const tagMatch = line.match(/^\\[(.+?)\\]\\s/);\n      const tag = tagMatch ? tagMatch[1] : '';\n      const text = tagMatch ? line.slice(tagMatch[0].length) : line;\n      return <View key={i} style={[st.userBubble, { paddingVertical: 6, marginBottom: 4 }]}>",
  "if (item.role === 'user') {\n    const lines = item.content.split('\\n');\n    const handleLongPress = () => {\n      Alert.alert('消息操作', '', [\n        { text: '复制', onPress: () => { Clipboard.setStringAsync(item.content); setToast({ msg: '已复制', type: 'success' }); } },\n        { text: '删除', style: 'destructive', onPress: () => { setMessages(prev => prev.filter(m => m.timestamp !== item.timestamp)); } },\n        { text: '取消', style: 'cancel' },\n      ]);\n    };\n    return <View>{lines.map((line, i) => {\n      const tagMatch = line.match(/^\\[(.+?)\\]\\s/);\n      const tag = tagMatch ? tagMatch[1] : '';\n      const text = tagMatch ? line.slice(tagMatch[0].length) : line;\n      return <TouchableOpacity key={i} activeOpacity={0.8} onLongPress={handleLongPress}><View style={[st.userBubble, { paddingVertical: 6, marginBottom: 4 }]}>"
);

// Close the TouchableOpacity
t = t.replace(
  "        <Text style={st.userMsgText}>{text}</Text>\n      </View>;\n    })}</View>;\n  }",
  "        <Text style={st.userMsgText}>{text}</Text>\n      </View></TouchableOpacity>;\n    })}</View>;\n  }"
);

// Add long press to AI messages (regenerate/copy/delete)
t = t.replace(
  "const renderMsg = ({ item }: { item: ChatMessage }) => {",
  "const renderMsg = ({ item }: { item: ChatMessage }) => {\n    const handleAiLongPress = () => {\n      Alert.alert('消息操作', '', [\n        { text: '复制', onPress: () => { Clipboard.setStringAsync(item.content); setToast({ msg: '已复制', type: 'success' }); } },\n        { text: '重新生成', onPress: () => { setMessages(prev => prev.filter(m => m.timestamp !== item.timestamp)); setTimeout(() => send(), 100); } },\n        { text: '删除', style: 'destructive', onPress: () => { setMessages(prev => prev.filter(m => m.timestamp !== item.timestamp)); } },\n        { text: '取消', style: 'cancel' },\n      ]);\n    };"
);

// Wrap AI message content in TouchableOpacity with long press
t = t.replace(
  "if (item.role === 'user') {\n    const lines",
  "if (item.role === 'user') {\n    const lines"
);

// Add long press to the outer View of AI messages
t = t.replace(
  "return <View>{speakers.map((seg, i) => {",
  "return <TouchableOpacity activeOpacity={0.9} onLongPress={handleAiLongPress}><View>{speakers.map((seg, i) => {"
);

t = t.replace(
  "})}</View>;",
  "})}</View></TouchableOpacity>;"
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('added long press menu');
