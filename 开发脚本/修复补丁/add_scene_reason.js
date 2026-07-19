const fs = require('fs');
let t = fs.readFileSync('D:/koyoi/src/services/dialogueContext.ts', 'utf8');

const buildSceneReasonFn = `
/**
 * 构建角色在当前章节的出场理由
 * 从原著角色数据中提取：标志性场景、目标、当前状态
 */
function buildSceneReason(char: any, chapter: number, kb: KnowledgeBase): string {
  const reasons: string[] = [];

  // 1. 该角色在当前章节附近是否有标志性场景
  const sigScenes = (char.signatureScenes || [])
    .filter((s: any) => Math.abs(s.chapter - chapter) <= 2);
  if (sigScenes.length > 0) {
    reasons.push('正在经历：' + sigScenes[0].description);
  }

  // 2. 该角色在当前章节附近是否有状态变化
  const statusChanges = (char.statusChanges || [])
    .filter((s: any) => Math.abs(s.chapter - chapter) <= 3);
  if (statusChanges.length > 0) {
    const sc = statusChanges[0];
    reasons.push('状态变化：从' + sc.from + ' → ' + sc.to + '（第' + (sc.chapter+1) + '章）');
  }

  // 3. 该角色涉及当前章节附近的事件
  const nearbyEvents = kb.globalTimeline
    .filter(e => Math.abs(e.chapter - chapter) <= 2 &&
      (e.event.includes(char.name) || (e.involvedCharacters || []).includes(char.name)))
    .slice(0, 3);
  if (nearbyEvents.length > 0) {
    reasons.push('涉及：' + nearbyEvents.map(e => '第' + (e.chapter+1) + '章 ' + e.event.slice(0, 20)).join('；'));
  }

  // 4. 该角色的身份暗示其在场合理性
  if (char.role) {
    reasons.push(char.role);
  }

  return reasons.join(' | ') || '出现在当前场景中';
}

`;

// Insert before estimateCurrentChapter
t = t.replace(
  'function estimateCurrentChapter(',
  buildSceneReasonFn + '\nfunction estimateCurrentChapter('
);

// Add sceneReason to the DialogueContext interface
t = t.replace(
  "speechSample: string;\n    firstAppear?: number;\n    lastAppear?: number;\n    knowledgeWarning?: string;",
  "speechSample: string;\n    firstAppear?: number;\n    lastAppear?: number;\n    knowledgeWarning?: string;\n    sceneReason?: string;"
);

fs.writeFileSync('D:/koyoi/src/services/dialogueContext.ts', t);
console.log('buildSceneReason added');
