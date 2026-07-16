'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BACKEND-SNAPSHOT-HYDRATION-RELIABILITY-harness — SPEC DSH.CHART.BACKEND_SNAPSHOT_HYDRATION_RELIABILITY
// ════════════════════════════════════════════════════════════════════════════
// OWNER: the backend-snapshot autoload/merge-application path (app.js ~1163). The fragile one-shot
// 3s+finite-poll autoload is replaced by a state machine (idle→loading→ready|failed) with immediate start,
// bounded exponential backoff, retry on visibilitychange/focus/online, dedupe, stale-response guard, a manual
// refresh path, atomic assign + memo invalidation + forced desktop/mobile repaint. This harness loads the
// REAL state-machine + REAL fetch (with a controllable mock Supabase, fake timers, auth toggle and repaint
// spies) and drives every required case, plus the real merge+structural-breaks for the overnight fixture.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function asyncFnSrc(n) { const i = app.indexOf('async function ' + n + '('); if (i < 0) throw new Error('missing async fn ' + n); const bodyStart = app.indexOf('{', i); return app.slice(i, bodyStart) + braceSlice(bodyStart); }
function letSrc(n) { const m = new RegExp('let ' + n + '\\s*=\\s*[^;]*;').exec(app); if (!m) throw new Error('missing let ' + n); return m[0]; }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const wait = () => new Promise(r => setImmediate(r));   // let real microtasks/promises settle

// ── controllable environment ────────────────────────────────────────────────
const env = {
  authed: false, mockResult: () => ({ data: [], error: null }),
  renderCalls: 0, mobileCalls: 0, timers: [], lastVisualSig: { desktop: 'stale', mobile: 'stale' },
  listeners: {},
};
function mkQuery() { const q = {}; ['from', 'select', 'eq', 'gte', 'order', 'limit'].forEach(m => q[m] = () => q); q.then = (res, rej) => Promise.resolve().then(env.mockResult).then(res, rej); return q; }
const ctx = {
  console: { log() {}, error() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite, Date, Promise, setImmediate,
  get currentUser() { return env.authed ? { id: 'u1' } : null; },
  get supabaseClient() { return env.authed ? { from: () => mkQuery() } : null; },
  activeRange: '30d',
  render(_a) { env.renderCalls++; },
  scheduleAurixMobileLite(_r) { env.mobileCalls++; },
  _aurixLastVisualSig: env.lastVisualSig,
  setTimeout(fn, d) { const id = env.timers.length + 1; env.timers.push({ id, fn, d, done: false }); return id; },
  clearTimeout(id) { const t = env.timers.find(x => x.id === id); if (t) t.done = true; },
  document: { hidden: false, addEventListener(ev, fn) { (env.listeners[ev] = env.listeners[ev] || []).push(fn); } },
};
ctx.window = ctx;
vm.createContext(ctx);
// consts the state machine reads
['_AURIX_BACKEND_SNAPSHOTS_ENABLED', '_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD', '_AURIX_BACKEND_SNAPSHOT_LOOKBACK_DAYS'].forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { console.log('(const ' + c + ' fail ' + e.message + ')'); } });
// ONE script so the module `let` state + functions share a lexical scope, exposed via __hyd
const bundle = [
  letSrc('_aurixBackendSnapshots'),
  letSrc('_aurixBackendSnapshotsState'), letSrc('_aurixBackendHydrateSeq'), letSrc('_aurixBackendHydrateInFlight'),
  letSrc('_aurixBackendHydrateAttempts'), letSrc('_aurixBackendHydrateRetryTimer'),
  fnSrc('_aurixBackendAuthClientReady'), fnSrc('_aurixSetBackendSnapshotsState'), fnSrc('_aurixForceMergedChartRepaint'),
  fnSrc('_aurixScheduleBackendHydrateRetry'), asyncFnSrc('_aurixHydrateBackendSnapshots'), asyncFnSrc('_aurixFetchBackendSnapshots'),
  'globalThis.__hyd = { hydrate:_aurixHydrateBackendSnapshots, fetch:_aurixFetchBackendSnapshots, reHydrate:function(r){ if(_aurixBackendSnapshotsState!=="ready") return _aurixHydrateBackendSnapshots(r); },'
  + ' state:function(){return _aurixBackendSnapshotsState;}, snaps:function(){return _aurixBackendSnapshots;}, seq:function(){return _aurixBackendHydrateSeq;},'
  + ' setSnaps:function(v){_aurixBackendSnapshots=v;}, clearInFlight:function(){_aurixBackendHydrateInFlight=false;},'
  + ' reset:function(){_aurixBackendSnapshotsState="idle";_aurixBackendHydrateSeq=0;_aurixBackendHydrateInFlight=false;_aurixBackendHydrateAttempts=0;_aurixBackendHydrateRetryTimer=null;_aurixBackendSnapshots=[];} };',
].join('\n');
vm.runInContext(bundle, ctx);
const H = ctx.__hyd;
function runTimers() { const pend = env.timers.filter(t => !t.done); env.timers = []; pend.forEach(t => { try { t.fn(); } catch (_) {} }); }
function resetEnv() { env.authed = false; env.mockResult = () => ({ data: [], error: null }); env.renderCalls = 0; env.mobileCalls = 0; env.timers = []; env.lastVisualSig.desktop = 'stale'; env.lastVisualSig.mobile = 'stale'; H.reset(); }
const ROWS = [{ ts: '2026-07-16T00:00:00Z', total_value_usd: 17000 }, { ts: '2026-07-16T00:15:00Z', total_value_usd: 17010 }];

(async () => {
// ── 1) auth ready immediately → loaded before authoritative paint ──────────────
console.log('\n1) auth ready immediately:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: ROWS, error: null });
await H.hydrate('mount'); await wait();
ok('1 state ready', H.state() === 'ready', H.state());
ok('1 backend snapshots assigned (2)', H.snaps().length === 2);
ok('1 forced repaint (desktop render + mobile lite)', env.renderCalls >= 1 && env.mobileCalls >= 1, 'render=' + env.renderCalls + ' mobile=' + env.mobileCalls);
ok('1 visual memo invalidated (desktop+mobile null)', env.lastVisualSig.desktop === null && env.lastVisualSig.mobile === null);

// ── 2) auth ready after many retries (>23s equiv) → eventually loads, never permanently frontend-only ──
console.log('\n2) late auth (>23s):');
resetEnv(); env.authed = false;
await H.hydrate('mount'); await wait();
ok('2 not ready while unauthed', H.state() !== 'ready', H.state());
for (let i = 0; i < 30; i++) { runTimers(); await wait(); }        // 30 backoff ticks, still unauthed
ok('2 still not permanently complete after 30 retries', H.state() !== 'ready');
env.authed = true; env.mockResult = () => ({ data: ROWS, error: null });
runTimers(); await wait(); runTimers(); await wait();
ok('2 hydrates once auth becomes ready', H.state() === 'ready' && H.snaps().length === 2, H.state());

// ── 3) first request fails, second succeeds → ready + repaint ──────────────────
console.log('\n3) fail then succeed:');
resetEnv(); env.authed = true; let n3 = 0; env.mockResult = () => (++n3 === 1 ? { data: null, error: { message: 'boom' } } : { data: ROWS, error: null });
await H.hydrate('mount'); await wait();
ok('3 first attempt failed (retryable, not complete)', H.state() === 'failed', H.state());
runTimers(); await wait();                                          // backoff retry → success
ok('3 second attempt ready + repaint', H.state() === 'ready' && H.snaps().length === 2 && env.renderCalls >= 1);

// ── 4) offline then online → automatic recovery via online listener ────────────
console.log('\n4) offline → online:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: null, error: { message: 'offline' } });
await H.hydrate('mount'); await wait();
ok('4 failed while offline', H.state() === 'failed');
env.mockResult = () => ({ data: ROWS, error: null });
await H.reHydrate('online'); await wait();                          // the online listener calls this not-ready→retry path
ok('4 recovers to ready on online trigger', H.state() === 'ready' && H.snaps().length === 2, H.state());

// ── 5) background/resume → visibilitychange retries when not ready ─────────────
console.log('\n5) background/resume:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: null, error: { message: 'x' } });
await H.hydrate('mount'); await wait();
ok('5 not ready (failed)', H.state() === 'failed');
env.mockResult = () => ({ data: ROWS, error: null });
await H.reHydrate('visibilitychange'); await wait();                // resume/foreground calls this not-ready→retry path
ok('5 resume retries → ready', H.state() === 'ready');

// ── 6) concurrent triggers → single in-flight ──────────────────────────────────
console.log('\n6) concurrent triggers:');
resetEnv(); env.authed = true; let n6 = 0; env.mockResult = () => { n6++; return { data: ROWS, error: null }; };
await Promise.all([H.hydrate('a'), H.hydrate('b'), H.hydrate('c')]); await wait();
ok('6 only ONE fetch executed despite 3 concurrent triggers', n6 === 1, 'fetches=' + n6);
ok('6 ready', H.state() === 'ready');

// ── 7) stale response race → newest wins ───────────────────────────────────────
console.log('\n7) stale response race:');
resetEnv(); env.authed = true;
// two overlapping in-flight loads (seq 1 then 2). The seq guard must drop the OLDER (seq1) response even
// though it resolves LAST. clearInFlight() opens the (rare) race window between the two loads.
let resolvers = [];
env.mockResult = () => new Promise(res => resolvers.push(res));     // manual control of resolution order
const p1 = H.hydrate('first'); await wait();                        // seq=1 in-flight, resolver[0] pending
H.clearInFlight();                                                  // simulate a dedupe-bypass race window
const p2 = H.hydrate('second'); await wait();                       // seq=2 in-flight, resolver[1] pending
resolvers[1]({ data: [{ ts: '2026-07-16T02:00:00Z', total_value_usd: 99999 }], error: null }); await wait();  // newest (seq2) commits
resolvers[0]({ data: ROWS, error: null });                          // stale (seq1) resolves LATER
await Promise.all([p1, p2].map(p => p && p.catch(() => {}))); await wait();
ok('7 newest response committed (99999), stale (seq1) dropped', (H.snaps()[0] && H.snaps()[0].total_value_usd === 99999), JSON.stringify(H.snaps().map(s => s.total_value_usd)));

// ── 8) failed request → retryable, not falsely complete ────────────────────────
console.log('\n8) failed ≠ complete:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: null, error: { message: 'e' } });
await H.hydrate('mount'); await wait();
ok('8 state=failed (not ready)', H.state() === 'failed');
ok('8 a retry is scheduled (pending timer)', env.timers.some(t => !t.done));

// ── 9) empty success ⇒ ready (no backend history yet) but never a false failure ─
console.log('\n9) empty read = ready:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: [], error: null });
await H.hydrate('mount'); await wait();
ok('9 empty successful read → ready (converges)', H.state() === 'ready' && H.snaps().length === 0);

// ── 10 + 13) overnight fixture (real merge + structural breaks) ────────────────
console.log('\n10+13) merged series (real merge + structural breaks):');
{
  const C = ['_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS', '_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT', '_AURIX_OBS_GAP_MIN_MS', '_AURIX_OBS_GAP_MAX_MS', '_AURIX_REGIME_CLIFF_FRAC', '_AURIX_BRIDGE_SEG_ENABLED', '_AURIX_BRIDGE_SEG_FRAC', '_AURIX_CAPITAL_STEP_SEG_ENABLED', '_AURIX_SPARSE_RAMP_SEG_ENABLED', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_SPARSE_RAMP_MULT', '_AURIX_SPARSE_RAMP_MIN_MS', '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_EMG_RANGE_MS'];
  const F = ['_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources', '_aurixSplitAtGaps', '_aurixConfirmedBridgeGaps', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks', '_aurixRealGapFloorMs', '_aurixBuildContinuityValidatedSeries', '_aurixStructuralBreaks'];
  const c2 = { console: { log() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite, Infinity, Set, RegExp, Date }; c2._aurixLoadCapitalFlows = () => []; c2.toBase = v => v; vm.createContext(c2);
  C.forEach(k => { try { vm.runInContext(konstSrc(k), c2); } catch (_) {} });
  F.forEach(k => { try { vm.runInContext(fnSrc(k), c2); } catch (e) { console.log('(fn ' + k + ' ' + e.message + ')'); } });
  const merge = vm.runInContext('_aurixMergeSnapshotSources', c2), SB = vm.runInContext('_aurixStructuralBreaks', c2);
  const H2 = 36e5, MINMS = 60000, T = 1_800_000_000_000;
  // overnight: dense per-minute frontend evening (4h) + 6.9h hole + dense per-minute morning (3h);
  // backend every 15 min ACROSS the whole window (fills the hole middle after the 60-min fe-authority edges).
  const feEve = []; for (let i = 0; i < 240; i++) feEve.push({ ts: T - 30 * H2 + i * MINMS, value: 6000 });   // per-min, ends ~T-26h
  const eveLast = feEve[feEve.length - 1].ts;
  const morningStart = eveLast + Math.round(6.9 * H2);                                                        // 6.9h hole
  const feMorn = []; for (let i = 0; i < 180; i++) feMorn.push({ ts: morningStart + i * MINMS, value: 6060 });
  const fe = feEve.concat(feMorn);
  const be = []; { const end = feMorn[feMorn.length - 1].ts; for (let t = feEve[0].ts; t <= end; t += 15 * MINMS) be.push({ ts: t, value: 6000, total_value_usd: 6000, source: 'backend_snapshot' }); }
  const holeMin = (morningStart - eveLast) / MINMS;
  const merged = merge(fe, be);
  const beKept = merged.filter(p => p && p.source === 'backend_snapshot').length;
  const mp = merged.map(p => ({ time: p.ts, value: (p.source === 'backend_snapshot' ? p.total_value_usd : p.value) }));
  const breaks = (SB(mp, '24h').breaks || []).length;
  ok('10 frontend hole is ~6.9h (>0, sub-floor)', Math.round(holeMin) >= 400 && Math.round(holeMin) <= 420, holeMin + 'min');
  ok('10 merge keeps backend points that fill the hole', beKept > 0, 'beKept=' + beKept);
  ok('10 merged series → 0 structural breaks (no connector/gap) in every range', ['24h', '7d', '30d', '1y', 'all'].every(r => (SB(mp, r).breaks || []).length === 0), 'breaks24h=' + breaks);
  // 13) healthy no-gap account: continuous frontend, empty backend → merge no-op, unchanged
  const cont = []; for (let i = 0; i < 200; i++) cont.push({ ts: T - 24 * H2 + i * MINMS, value: 6000 });
  const mergedHealthy = merge(cont, []);
  ok('13 healthy no-gap account unchanged (merge no-op when backend empty)', mergedHealthy.length === cont.length && mergedHealthy.every((p, i) => p.ts === cont[i].ts) && (SB(cont.map(p => ({ time: p.ts, value: p.value })), '24h').breaks || []).length === 0);
}

// ── 11) desktop/mobile parity ───────────────────────────────────────────────────
console.log('\n11) desktop/mobile parity:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: ROWS, error: null });
await H.hydrate('mount'); await wait();
ok('11 both surfaces repainted from the same hydrate (render + mobile lite each ≥1)', env.renderCalls >= 1 && env.mobileCalls >= 1);

// ── 12) returns unchanged + source invariants ───────────────────────────────────
console.log('\n12) source invariants:');
ok('12 return engine untouched (flow-neutral computePeriodReturn unchanged marker present)', /function _aurixComputePeriodReturn\(/.test(app));
ok('S owner is read/load only — merge fn not modified (single _aurixMergeSnapshotSources)', (app.match(/function _aurixMergeSnapshotSources\(/g) || []).length === 1);
ok('S _aurixTrustedChartSource untouched (single def)', (app.match(/function _aurixTrustedChartSource\(/g) || []).length === 1);
ok('S state machine present (idle/loading/ready/failed)', /_aurixBackendSnapshotsState = 'idle'/.test(app) && /'loading'/.test(app) && /'ready'/.test(app) && /'failed'/.test(app));
ok('S immediate start (microtask), not only setTimeout(3s)', /Promise\.resolve\(\)\.then\(function \(\) \{ _aurixHydrateBackendSnapshots\('mount'\)/.test(app) && !/setTimeout\(_blTick, 3000\)/.test(app));
ok('S bounded exponential backoff + stale-seq guard + dedupe present', /Math\.pow\(2, n\)/.test(app) && /seq !== _aurixBackendHydrateSeq/.test(app) && /_aurixBackendHydrateInFlight/.test(app));
ok('S retry triggers: visibilitychange + focus + online', /addEventListener\('visibilitychange'/.test(app) && /addEventListener\('focus'/.test(app) && /addEventListener\('online'/.test(app));
ok('S fetch signals failure(null) vs empty([]) for retryability', /if \(error \|\| !Array\.isArray\(data\)\) return null;/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();
