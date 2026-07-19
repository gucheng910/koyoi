const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Find the isLastAssistant section and replace entirely
const start = t.indexOf('    if (isLastAssistant) {');
const end = t.indexOf('    return inner;', start);
if (start < 0 || end < 0) { console.log('cannot find section'); process.exit(1); }

const cleanSection = `    if (isLastAssistant) {
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
    }
    `;

t = t.slice(0, start) + cleanSection + t.slice(end);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('isLastAssistant section replaced');
