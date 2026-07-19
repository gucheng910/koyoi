const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

const oldSection = `    if (isLastAssistant) {
      return (
        <TouchableOpacity activeOpacity={0.9} onLongPress={handleRegenerate}>
          {inner}
          <View style={{ flexDirection: 'row', paddingLeft: 16, marginTop: -2, marginBottom: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => { recordFeedback(1, item, messages[messages.length - 2], session); setToast({msg:'已反馈', type:'success'}); }}>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>👍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { recordFeedback(0, item, messages[messages.length - 2], session); }}>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>👎</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 9, color: isDark ? '#5A5450' : '#B8B0A4', alignSelf: 'center' }}>长按重生成</Text>
          </View>
        </TouchableOpacity>
      );
    }`;

const newSection = `    if (isLastAssistant) {
      return (
        <TouchableOpacity activeOpacity={0.9} onLongPress={handleRegenerate}>
          {inner}
          <View style={{ flexDirection: 'row', paddingLeft: 16, marginTop: -2, marginBottom: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => { recordFeedback(1, item, messages[messages.length - 2], session); setToast({msg:'已反馈', type:'success'}); }}>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>👍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              recordFeedback(0, item, messages[messages.length - 2], session);
              const prev = messages[messages.length - 2];
              if (prev?.role === 'user') {
                setMessages(messages.slice(0, -1));
                setInputText(prev.content);
                setToast({msg:'已回填到输入框，修改后重新发送', type:'success'});
              }
            }}>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>👎</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 9, color: isDark ? '#5A5450' : '#B8B0A4', alignSelf: 'center' }}>长按重生成</Text>
          </View>
        </TouchableOpacity>
      );
    }`;

t = t.replace(oldSection, newSection);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('feedback retry added');
