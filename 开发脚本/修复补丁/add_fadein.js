const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Add FadeIn import and wrapper
t = t.replace(
  "import Toast from '../components/Toast';",
  "import Toast from '../components/Toast';\nimport FadeIn from '../components/FadeIn';"
);

t = t.replace(
  'return (\n    <KeyboardAvoidingView',
  'return (\n    <FadeIn style={{ flex: 1 }}>\n    <KeyboardAvoidingView'
);

t = t.replace(
  '    </KeyboardAvoidingView>\n  );',
  '    </KeyboardAvoidingView>\n    </FadeIn>\n  );'
);

fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('FadeIn added');
