// Prototype: verify the Proposal->Commit model against REAL Koyoi types
import type { WorldSession, CharacterMoodState, NotableEvent, WorldLogEntry } from '../源码/types';

type SessionChange =
  | { kind: 'clock.advance'; by: number }
  | { kind: 'moods.set'; moods: Record<string, CharacterMoodState> }
  | { kind: 'events.append'; events: NotableEvent[] }
  | { kind: 'worldLog.append'; entries: WorldLogEntry[] }
  | { kind: 'chapter.advance'; chapter: number };

interface SessionChangeSet { source: string; changes: SessionChange[] }

function applyChange(s: WorldSession, c: SessionChange): WorldSession {
  switch (c.kind) {
    case 'clock.advance':   return { ...s, worldClock: (s.worldClock || 0) + c.by };
    case 'moods.set':       return { ...s, characterMoods: { ...(s.characterMoods || {}), ...c.moods } };
    case 'events.append':   return { ...s, notableEvents: [...(s.notableEvents || []), ...c.events].slice(-20) };
    case 'worldLog.append': return { ...s, worldLog: [...(s.worldLog || []), ...c.entries] };
    case 'chapter.advance':
      if (c.chapter < (s.currentChapter || 0)) throw new Error('chapter regression blocked');
      return { ...s, currentChapter: c.chapter };
  }
}

function commitChanges(session: WorldSession, sets: SessionChangeSet[]) {
  const applied: string[] = [], rejected: string[] = [];
  let draft: WorldSession = JSON.parse(JSON.stringify(session));
  const base: WorldSession = JSON.parse(JSON.stringify(session));
  for (const set of sets) {
    const before = draft;
    try {
      for (const c of set.changes) draft = applyChange(draft, c);
      applied.push(set.source);
    } catch (e) {
      rejected.push(set.source + ': ' + (e as Error).message);
      draft = before;   // per-subset rollback
    }
  }
  void base;
  return { next: draft, applied, rejected };
}

// ---- TEST ----
const base: WorldSession = {
  id: 't1', world: { id:'w', name:'W', type:'modern', rules:{physics:'',supernatural:'',technology:'',society:'',morality:'',sexualNorms:''}, locations:[], factions:[], timeline:[], inertia:{majorEvents:0,characterFate:0,worldReaction:0}, butterflySensitivity:{minor:'',major:''} },
  selectedCharacters: [], npcs: [], currentScene: 's', worldState: '', butterflyLog: [],
  timelineDeviations: [], recentWorldEvents: [], worldLog: [], messages: [], createdAt: '',
  currentChapter: 5, worldClock: 10,
};

const results = commitChanges(base, [
  { source: 'clock',     changes: [{ kind: 'clock.advance', by: 1 }] },
  { source: 'moods',     changes: [{ kind: 'moods.set', moods: { A: { emotion: 'rage', intensity: 8, sinceRound: 11, expressed: false } } }] },
  { source: 'chapter',   changes: [{ kind: 'chapter.advance', chapter: 2 }] },   // MUST be rejected
  { source: 'worldLog',  changes: [{ kind: 'worldLog.append', entries: [{ id:'e1', type:'world_event', content:'x', timestamp:'', round: 11 }] }] },
  { source: 'events',    changes: [{ kind: 'events.append', events: [{ id:'n1', round: 11, type:'public_action', description:'d', involvedChars:[], witnessChars:[], visibility:'public', impact:1 }] }] },
]);

console.log('applied :', results.applied.join(', '));
console.log('rejected:', results.rejected.join(', '));
console.log('clock      10 ->', results.next.worldClock, '(expect 11)');
console.log('chapter     5 ->', results.next.currentChapter, '(expect 5, unchanged)');
console.log('moods keys   :', Object.keys(results.next.characterMoods || {}).join(',') || 'none');
console.log('worldLog len :', (results.next.worldLog || []).length, '(expect 1 - survived sibling failure)');
console.log('events len   :', (results.next.notableEvents || []).length, '(expect 1)');
