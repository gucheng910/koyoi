// Verify: does the current stage8 pattern REALLY lose updates? (old-snapshot overwrite)
import type { WorldSession } from '../源码/types';

// --- Simulate the CURRENT pattern: fire-and-forget with captured snapshot ---
async function currentPattern() {
  let session = { currentChapter: 0, memories: [] as string[] } as any;
  const setSession = (fn: any) => { session = fn(session); };

  const slow = (ms: number, v: any) => new Promise(r => setTimeout(() => r(v), ms));

  // turn N: capture snapshot, fire background call that takes 300ms
  const snapshotAtTurnN = { ...session };
  slow(300, 'pulse-from-round-N').then(pulse => {
    // stage8_hooks.ts:90-98 style: uses CAPTURED session
    setSession((prev: any) => ({ ...prev, recentWorldEvents: [...(prev.recentWorldEvents || []), pulse] }));
  });

  // meanwhile, 2 MORE turns complete synchronously-ish (faster than the bg call)
  setSession((prev: any) => ({ ...prev, currentChapter: 1 }));
  setSession((prev: any) => ({ ...prev, currentChapter: 2 }));

  await slow(400, null);   // let the background call land
  return { snapshotHadChapter: snapshotAtTurnN.currentChapter, finalChapter: session.currentChapter, events: session.recentWorldEvents };
}

// --- Simulate the COMMIT pattern ---
async function commitPattern() {
  let session = { currentChapter: 0, recentWorldEvents: [] as string[] } as any;
  const results = await Promise.allSettled([
    new Promise(r => setTimeout(() => r({ source: 'pulse', chapterDelta: 0, event: 'pulse-from-round-N' }), 300)),
    Promise.resolve({ source: 'chapter', chapterDelta: 2 }),
  ]);
  const next = { ...session };
  for (const r of results) if (r.status === 'fulfilled') {
    const v: any = r.value;
    if (v.event) next.recentWorldEvents = [...(next.recentWorldEvents || []), v.event];
    if (v.chapterDelta) next.currentChapter = (next.currentChapter || 0) + v.chapterDelta;
  }
  session = next;   // single atomic write
  return { finalChapter: session.currentChapter, events: session.recentWorldEvents };
}

(async () => {
  const a = await currentPattern();
  console.log('=== CURRENT (fire-and-forget) ===');
  console.log('final chapter :', a.finalChapter, '(expect 2)');
  console.log('events landed :', JSON.stringify(a.events ?? 'UNDEFINED'));
  const b = await commitPattern();
  console.log('=== COMMIT (proposal->commit) ===');
  console.log('final chapter :', b.finalChapter, '(expect 2)');
  console.log('events landed :', JSON.stringify(b.events));
})();
