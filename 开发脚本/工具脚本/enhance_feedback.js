const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/services/feedbackStore.ts', 'utf8');

// Insert getRecentBadFeedback and getGoodSamples before getFeedbackStats
const insertBefore = 'export async function getFeedbackStats';
const newFns = `/**
 * 获取最近差评（只取最后 N 条，避免全量读取）
 */
export async function getRecentBadFeedback(limit: number = 5): Promise<FeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const entries: FeedbackEntry[] = JSON.parse(raw);
    return entries.filter(e => e.rating === 0).slice(-limit);
  } catch { return []; }
}

/**
 * 获取好评样本（只取最后 N 条）
 */
export async function getGoodSamples(limit: number = 20): Promise<FeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const entries: FeedbackEntry[] = JSON.parse(raw);
    return entries.filter(e => e.rating === 1).slice(-limit);
  } catch { return []; }
}

`;

t = t.replace(insertBefore, newFns + insertBefore);
fs.writeFileSync('D:/koyoi/src/services/feedbackStore.ts', t);
console.log('feedbackStore enhanced');
