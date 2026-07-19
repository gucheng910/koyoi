const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/services/sendPipeline.ts', 'utf8');

// Replace the old getFeedbackStats + raw AsyncStorage read with new getRecentBadFeedback
const oldPattern = 'const { getFeedbackStats } = require';
const newPattern = 'const { getRecentBadFeedback, getGoodSamples } = require';

if (t.includes(oldPattern)) {
  t = t.replace(oldPattern, newPattern);
  // Also remove the raw AsyncStorage read line and use simplified logic
  t = t.replace(
    "const stats = await getFeedbackStats();\n    if (stats.bad > 0) {\n      // 获取最近差评的详细信息\n      const raw = await require('@react-native-async-storage/async-storage').default.getItem('@koyoi_feedback');\n      const entries = raw ? JSON.parse(raw) : [];\n      const recentBad = entries.filter((e: any) => e.rating === 0).slice(-5);\n      const recentGood = entries.filter((e: any) => e.rating === 1).slice(-20);",
    "const recentBad = await getRecentBadFeedback(5);\n    if (recentBad.length > 0) {\n      const recentGood = await getGoodSamples(20);"
  );
  // Remove the extra closing brace from the old nested if
  t = t.replace(
    "      if (recentBad.length > 0) {\n        const { computeAdjustments } = require('./promptTuner');",
    "      const { computeAdjustments } = require('./promptTuner');"
  );
  
  // Remove one level of nesting - close the extra bracket
  let count = 0;
  const lines = t.split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('} catch {}') && lines[i-1]?.includes('      }') && !found) {
      // Remove the extra closing brace from the old nested if
      lines.splice(i-1, 1);
      found = true;
    }
  }
  t = lines.join('\n');
  
  fs.writeFileSync('D:/koyoi/src/services/sendPipeline.ts', t);
  console.log('sendPipeline simplified');
} else {
  console.log('old pattern not found');
}
