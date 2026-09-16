// THE REAL DEFECT: sessionRef.current is NOT updated when setSession commits a new object.
// WorldChatScreen.tsx:183-185  -> sessionRef.current = session  (assigned during render)
// stage8 mutates sessionRef.current, then calls setSession which creates a NEW object.
// The mutation lands on the OLD object. Next turn's saveSession reads sessionRef.current
// == old object. So state and ref DIVERGE.

let state: any = { worldClock: 0 };
let refCurrent: any = state;                 // ref mirrors state at render time

const setSession = (fn: any) => { state = fn(state); };   // React: creates new object

function stage8MutatesThenSets() {
  refCurrent.worldClock = (refCurrent.worldClock || 0) + 1;   // mutates OLD object
  setSession((prev: any) => ({ ...prev, worldClock: refCurrent.worldClock }));
}

// turn 1
stage8MutatesThenSets();
console.log('turn1: state =', state.worldClock, '| ref =', refCurrent.worldClock, '| same object?', state === refCurrent);

// The component re-renders and re-syncs the ref (WorldChatScreen.tsx:185)
refCurrent = state;                          // <-- this is the ONLY thing keeping them in sync
console.log('  after re-render resync: ref =', refCurrent.worldClock);

// turn 2
stage8MutatesThenSets();
console.log('turn2: state =', state.worldClock, '| ref =', refCurrent.worldClock, '| same object?', state === refCurrent);

// NOW: what if a background .then() from turn 1 lands AFTER turn 2's re-render?
// It captured `session` = the OLD object and calls setSession(prev => ...) spreading STALE fields.
console.log('\n--- background callback capturing stale session (stage8_hooks.ts:89-98) ---');
const staleSnapshot = { worldClock: 1, currentChapter: 3, memories: ['a'] };
let live = { worldClock: 2, currentChapter: 4, memories: ['a', 'b'] };
// setSession(prev => ({...prev, recentWorldEvents:[...prev.recentWorldEvents, pulse]}))
// -> uses `prev`, which is LIVE. So this specific line is safe.
console.log('confirm: setSession(prev=>...) uses live prev -> NOT the bug');
console.log('the actual bug is the OUT-OF-BAND mutation at line 42/48/77-79 reaching saveSession');
