// Verify: does direct mutation of the caller's session object cause real corruption?
// stage8_hooks.ts:42  session.worldClock = (session.worldClock||0)+1  <-- mutates the object it was handed
// WorldChatScreen.tsx:295  runPostSendHooks({ session: sessionRef.current, ... })
// sessionRef.current === the SAME object stored in React state

let reactState: any = { worldClock: 0, memories: [] as string[] };
const sessionRef = { current: reactState };        // sessionRef.current points AT the state object
const setSession = (fn: any) => { reactState = fn(reactState); };

// --- what stage8 does: mutate in place, THEN setSession ---
function runStage8(session: any, setSession: any) {
  session.worldClock = (session.worldClock || 0) + 1;     // MUTATION of the state object
  setSession((prev: any) => ({ ...prev, worldClock: session.worldClock }));
}

console.log('BEFORE  reactState =', JSON.stringify(reactState));
console.log('BEFORE  ref.current  =', JSON.stringify(sessionRef.current));
runStage8(sessionRef.current, setSession);
console.log('AFTER   reactState =', JSON.stringify(reactState));
console.log('AFTER   ref.current =', JSON.stringify(sessionRef.current));

// --- Now the real test: React StrictMode / double-render / interrupted commit ---
console.log('\n--- double-invocation (StrictMode or retry) ---');
const s2: any = { worldClock: 0 };
const ref2 = { current: s2 };
let state2: any = s2;
const set2 = (fn: any) => { state2 = fn(state2); };
runStage8(ref2.current, set2);   // turn runs
runStage8(ref2.current, set2);   // e.g. StrictMode double-invoke, or a retry after error
console.log('after 2 invocations, worldClock =', state2.worldClock, '(expect 2, but see below)');
console.log('ref2.current === state2 ?', ref2.current === state2);
console.log('ref2.current.worldClock =', ref2.current.worldClock);
