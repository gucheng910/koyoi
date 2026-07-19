const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', 'utf8');

// Find: let line = '- ' + c.name + ... + c.relationship.status
// When fanfic + chapterCtx exists, use chapter-filtered relationship from chapterCtx
// Otherwise use the raw c.relationship.status

// The line looks like:
// let line = '- ' + c.name + '：' + c.personality.traits.join('、') + '，' + c.relationship.status;
const oldLine = "let line = '- ' + c.name + '：' + c.personality.traits.join('、') + '，' + c.relationship.status;";
const newLine = "const chRel = (chapterCtx?.activeRelations || []).find((r: any) => (r.from === c.name || r.to === c.name) && (r.from !== c.name || r.to !== c.name)); let line = '- ' + c.name + '：' + c.personality.traits.join('、') + '，' + (chRel ? chRel.status : c.relationship.status);";

t = t.replace(oldLine, newLine);
fs.writeFileSync('D:/koyoi/src/screens/WorldChatScreen.tsx', t);
console.log('relationship status now uses chapter-filtered data');
