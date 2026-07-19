const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Add LayoutAnimation import
t = t.replace(
  "import { View, Text, TextInput, TouchableOpacity, FlatList,",
  "import { View, Text, TextInput, TouchableOpacity, FlatList, LayoutAnimation,"
);

// Add before setMessages
t = t.replace(
  'const msgsWithUser = [...messages, userMsg];\n    setMessages(msgsWithUser);',
  'const msgsWithUser = [...messages, userMsg];\n    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);\n    setMessages(msgsWithUser);'
);

// Also for the updated messages after API response
t = t.replace(
  'const updated = [...msgsWithUser, msg];\n        setMessages(updated);',
  'const updated = [...msgsWithUser, msg];\n        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);\n        setMessages(updated);'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('LayoutAnimation added');
