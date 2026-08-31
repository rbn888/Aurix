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
  renderCalls: 0, rwcCalls: 0, mobileCalls: 0, timers: [], lastVisualSig: { desktop: 'stale', mobile: 'stale' },
  listeners: {}, ltCalls: [],
};
function mkQuery() { const q = {}; ['from', 'select', 'eq', 'gte', 'order', 'limit'].forEach(m => q[m] = () => q);
  // `lt` = cursor de la lectura paginada. Se captura el valor para poder AFIRMAR que la segunda
  // página arranca en la fila más antigua de la primera (un mock que no lo conozca haría que la
  // función lanzara y devolviera null, y el harness "pasaría" por el camino equivocado).
  q.lt = (col, val) => { env.ltCalls.push(val); return q; };
  // PostgREST devuelve `count` cuando la consulta lo pide (`{count:'exact'}`), y el loader lo usa para
  // no gastar una petición vacía final. Un mock que lo omitiera forzaría a agotar el presupuesto de
  // páginas — es decir, modelaría un servidor que no existe.
  q.then = (res, rej) => Promise.resolve().then(env.mockResult)
    .then(r => (r && Array.isArray(r.data) && r.count == null) ? Object.assign({}, r, { count: r.data.length }) : r)
    .then(res, rej); return q; }
const ctx = {
  console: { log() {}, error() {}, warn() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite, Date, Promise, setImmediate,
  get currentUser() { return env.authed ? { id: 'u1' } : null; },
  get supabaseClient() { return env.authed ? { from: () => mkQuery() } : null; },
  activeRange: '30d',
  _aurixRemoteLoadOutcome: 'ok-row', _aurixCanonicalHistoryLoaded: true,   // sesión reconciliada: la única pierna en juego es la backend
  render(_a) { env.renderCalls++; },
  renderWealthCurve(_a) { env.rwcCalls++; },
  updateChart() { env.rwcCalls++; },
  scheduleAurixMobileLite(_r) { env.mobileCalls++; },
  _aurixLastVisualSig: env.lastVisualSig,
  setTimeout(fn, d) { const id = env.timers.length + 1; env.timers.push({ id, fn, d, done: false }); return id; },
  clearTimeout(id) { const t = env.timers.find(x => x.id === id); if (t) t.done = true; },
  document: { hidden: false, addEventListener(ev, fn) { (env.listeners[ev] = env.listeners[ev] || []).push(fn); } },
};
ctx.window = ctx;
vm.createContext(ctx);
// consts the state machine reads
// SPEC P0 CHART RELIABILITY — la rama de éxito repinta AHORA a través de `_aurixNoteCanonicalOutcome`,
// así que este sandbox tiene que poder evaluar el gate de publicación de verdad. Sin estas consts la
// llamada caería al fallback y el harness certificaría la ruta secundaria, no la real.
['_AURIX_BACKEND_SNAPSHOTS_ENABLED', '_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD', '_AURIX_BACKEND_SNAPSHOT_LOOKBACK_DAYS',
 '_AURIX_CHART_FIRSTPAINT_HOLD_ALL_RANGES', '_AURIX_CHART_BLOCK_ON_CANONICAL_READ_FAILED',
 '_AURIX_PUBLICATION_STATE', '_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED',
 '_AURIX_BACKEND_SNAPSHOT_PAGE', '_AURIX_BACKEND_SNAPSHOT_MAX_PAGES'].forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { console.log('(const ' + c + ' fail ' + e.message + ')'); } });
// ONE script so the module `let` state + functions share a lexical scope, exposed via __hyd
const bundle = [
  letSrc('_aurixBackendSnapshots'),
  letSrc('_aurixBackendSnapshotsState'), letSrc('_aurixBackendHydrateSeq'), letSrc('_aurixBackendHydrateInFlight'),
  letSrc('_aurixBackendHydrateAttempts'), letSrc('_aurixBackendHydrateRetryTimer'),
  fnSrc('_aurixBackendAuthClientReady'), fnSrc('_aurixSetBackendSnapshotsState'), fnSrc('_aurixForceMergedChartRepaint'),
  letSrc('_aurixChartPublicationWasPending'),
  fnSrc('_aurixResolvePublicationReadiness'), fnSrc('_aurixChartPublicationSourcesPending'),
  fnSrc('_aurixNoteCanonicalOutcome'),
  fnSrc('_aurixScheduleBackendHydrateRetry'), asyncFnSrc('_aurixHydrateBackendSnapshots'), asyncFnSrc('_aurixFetchBackendSnapshots'),
  'globalThis.__hyd = { hydrate:_aurixHydrateBackendSnapshots, fetch:_aurixFetchBackendSnapshots, reHydrate:function(r){ if(_aurixBackendSnapshotsState!=="ready") return _aurixHydrateBackendSnapshots(r); },'
  + ' state:function(){return _aurixBackendSnapshotsState;}, snaps:function(){return _aurixBackendSnapshots;}, seq:function(){return _aurixBackendHydrateSeq;},'
  + ' setSnaps:function(v){_aurixBackendSnapshots=v;}, clearInFlight:function(){_aurixBackendHydrateInFlight=false;},'
  + ' wasPending:function(){return _aurixChartPublicationWasPending;},'
  + ' reset:function(){_aurixChartPublicationWasPending=false;_aurixBackendSnapshotsState="idle";_aurixBackendHydrateSeq=0;_aurixBackendHydrateInFlight=false;_aurixBackendHydrateAttempts=0;_aurixBackendHydrateRetryTimer=null;_aurixBackendSnapshots=[];} };',
].join('\n');
vm.runInContext(bundle, ctx);
const H = ctx.__hyd;
function runTimers() { const pend = env.timers.filter(t => !t.done); env.timers = []; pend.forEach(t => { try { t.fn(); } catch (_) {} }); }
function resetEnv() { env.ltCalls = []; env.authed = false; env.mockResult = () => ({ data: [], error: null }); env.renderCalls = 0; env.rwcCalls = 0; env.mobileCalls = 0; env.timers = []; env.lastVisualSig.desktop = 'stale'; env.lastVisualSig.mobile = 'stale'; H.reset(); }
const ROWS = [{ ts: '2026-07-16T00:00:00Z', total_value_usd: 17000 }, { ts: '2026-07-16T00:15:00Z', total_value_usd: 17010 }];

(async () => {
// ── 1) auth ready immediately → loaded before authoritative paint ──────────────
console.log('\n1) auth ready immediately:');
resetEnv(); env.authed = true; env.mockResult = () => ({ data: ROWS, error: null });
await H.hydrate('mount'); await wait();
ok('1 state ready', H.state() === 'ready', H.state());
ok('1 backend snapshots assigned (2)', H.snaps().length === 2);
ok('1 forced repaint (desktop wealth curve + mobile lite)', env.rwcCalls >= 1 && env.mobileCalls >= 1, 'rwc=' + env.rwcCalls + ' mobile=' + env.mobileCalls);
ok('1 visual memo invalidated (desktop+mobile null)', env.lastVisualSig.desktop === null && env.lastVisualSig.mobile === null);
// SPEC P0 CHART RELIABILITY — el aterrizaje tiene que DESARMAR el latch de recuperación. Si queda
// armado, el primer resync de primer plano dispara un `_aurixForceMergedChartRepaint()` sin ninguna
// causa de dato, que anula todo `_aurixLastVisualSig` y hace reescribir innerHTML + repetir la
// animación en las dos superficies. Se comprueba aquí porque es esta rama la que lo resuelve.
ok('1 el aterrizaje desarma el latch de recuperación (sin repintado espurio después)',
  H.wasPending() === false, 'wasPending=' + H.wasPending());
{ const rwc0 = env.rwcCalls, mob0 = env.mobileCalls;
  vm.runInContext('_aurixNoteCanonicalOutcome()', ctx);   // simula el resync de primer plano siguiente
  ok('1 un resync posterior NO repinta de nuevo', env.rwcCalls === rwc0 && env.mobileCalls === mob0,
    'rwc ' + rwc0 + '→' + env.rwcCalls + ' mobile ' + mob0 + '→' + env.mobileCalls); }

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
ok('3 second attempt ready + repaint', H.state() === 'ready' && H.snaps().length === 2 && env.rwcCalls >= 1);

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
ok('11 both surfaces repainted (desktop wealth curve + mobile lite each ≥1)', env.rwcCalls >= 1 && env.mobileCalls >= 1);

// ── 12) returns unchanged + source invariants ───────────────────────────────────
console.log('\n12) source invariants:');
ok('12 return engine untouched (flow-neutral computePeriodReturn unchanged marker present)', /function _aurixComputePeriodReturn\(/.test(app));
ok('S owner is read/load only — merge fn not modified (single _aurixMergeSnapshotSources)', (app.match(/function _aurixMergeSnapshotSources\(/g) || []).length === 1);
ok('S _aurixTrustedChartSource untouched (single def)', (app.match(/function _aurixTrustedChartSource\(/g) || []).length === 1);
ok('S state machine present (idle/loading/ready/failed)', /_aurixBackendSnapshotsState = 'idle'/.test(app) && /'loading'/.test(app) && /'ready'/.test(app) && /'failed'/.test(app));
ok('S immediate start (microtask), not only setTimeout(3s)', /Promise\.resolve\(\)\.then\(function \(\) \{ _aurixHydrateBackendSnapshots\('mount'\)/.test(app) && !/setTimeout\(_blTick, 3000\)/.test(app));
ok('S bounded exponential backoff + stale-seq guard + dedupe present', /Math\.pow\(2, n\)/.test(app) && /seq !== _aurixBackendHydrateSeq/.test(app) && /_aurixBackendHydrateInFlight/.test(app));
ok('S retry triggers: visibilitychange + focus + online', /addEventListener\('visibilitychange'/.test(app) && /addEventListener\('focus'/.test(app) && /addEventListener\('online'/.test(app));
ok('S fetch signals failure(null) vs empty([]) for retryability', /if \(error \|\| !Array\.isArray\(_rows\)\) return null;/.test(app));
// ── 14) SPEC P0 HISTORICAL CONTINUITY — paginación real de la lectura de snapshots ──────────────
// El defecto: `.order('ts', ascending: true).limit(5000)` recibía las 1000 filas MÁS ANTIGUAS
// (PostgREST recorta en `max-rows` sin señalar error) y la historia reciente era invisible para
// siempre. Aquí se EJECUTA la lectura contra un mock de dos páginas: los asserts estáticos de abajo
// no distinguirían una paginación rota de una correcta.
console.log('\n14) lectura paginada (descendente + cursor):');
{
  const T0 = Date.parse('2026-08-29T00:00:00Z');
  // página 1 = las 1000 MÁS RECIENTES, en orden descendente (como las devuelve el servidor)
  const P1 = Array.from({ length: 1000 }, (_, i) => ({ ts: new Date(T0 - i * 15 * 60000).toISOString(), total_value_usd: 20000 + i }));
  const P2 = [{ ts: new Date(T0 - 1000 * 15 * 60000).toISOString(), total_value_usd: 19000 },
              { ts: new Date(T0 - 1001 * 15 * 60000).toISOString(), total_value_usd: 18990 }];
  resetEnv(); env.authed = true;
  let call = 0;
  env.mockResult = () => ({ data: (call++ === 0 ? P1 : P2), error: null, count: 1002 });
  const out = await H.fetch();
  ok('14 se piden DOS páginas (la primera venía llena)', call === 2, 'llamadas=' + call);
  ok('14 la segunda usa CURSOR = la fila más antigua de la primera',
    env.ltCalls.length === 1 && env.ltCalls[0] === P1[P1.length - 1].ts, JSON.stringify(env.ltCalls));
  ok('14 devuelve las filas de AMBAS páginas', out.length === 1002, 'n=' + out.length);
  ok('14 salida ASCENDENTE', out.every((p, i) => i === 0 || p.ts >= out[i-1].ts));
  ok('14 sin duplicados de ts', new Set(out.map(p => p.ts)).size === out.length);
  ok('14 la fila MÁS RECIENTE está presente (era justo lo que se perdía)',
    out[out.length - 1].ts === Date.parse(P1[0].ts), new Date(out[out.length-1].ts).toISOString());

  // un fallo en la SEGUNDA página no puede publicarse como historia completa
  resetEnv(); env.authed = true; call = 0;
  env.mockResult = () => (call++ === 0 ? { data: P1, error: null, count: 1002 } : { data: null, error: { message: 'boom' } });
  const bad = await H.fetch();
  ok('14 fallo en una página intermedia ⇒ null (reintentable), no historia a medias', bad === null, JSON.stringify(bad && bad.length));

  // TOPE DEL SERVIDOR MENOR QUE LA PÁGINA PEDIDA. Si el proyecto baja `max-rows` a 500, cada página
  // vuelve con 500 filas aunque se pidan 1000. La condición de parada anterior (`_rows.length < _PAGE`)
  // habría roto el bucle en la primera y el cliente habría creído tener la historia COMPLETA — el mismo
  // fallo silencioso que este bloque arregla. `count` es el TOTAL de filas que casan, no el tamaño de la
  // página, así que la paginación debe continuar.
  {
    const TOT = 1200, CAP = 500, T1 = Date.parse('2026-08-20T00:00:00Z');
    resetEnv(); env.authed = true;
    let n = 0;
    env.mockResult = () => { const from = n * CAP, take = Math.max(0, Math.min(CAP, TOT - from)); n++;
      return { data: Array.from({ length: take }, (_, i) => ({ ts: new Date(T1 - (from + i) * 60000).toISOString(), total_value_usd: 100 + from + i })), error: null, count: TOT }; };
    const out = await H.fetch();
    ok('14 tope de servidor (500) menor que la página pedida (1000) ⇒ NO corta: sigue paginando',
      n === 3 && out.length === TOT, 'peticiones=' + n + ' filas=' + (out && out.length));
    ok('14 …y la fila más reciente sigue presente', out[out.length - 1].ts === T1);
  }

  // PRESUPUESTO AGOTADO: 12 páginas llenas ⇒ se marca truncado y es auditable.
  {
    resetEnv(); env.authed = true;
    let n = 0; const T2 = Date.parse('2026-08-25T00:00:00Z');
    env.mockResult = () => { const from = n * 1000; n++;
      return { data: Array.from({ length: 1000 }, (_, i) => ({ ts: new Date(T2 - (from + i) * 60000).toISOString(), total_value_usd: 500 + from + i })), error: null, count: 999999 }; };
    const out = await H.fetch();
    ok('14 presupuesto agotado ⇒ exactamente 12 páginas', n === 12, 'peticiones=' + n);
    ok('14 …devuelve 12 000 filas sin duplicar', out.length === 12000 && new Set(out.map(p => p.ts)).size === 12000, 'n=' + out.length);
    ok('14 …y el recorte queda MARCADO (auditable, no silencioso)', ctx.aurixBackendSnapshotsTruncated === true,
      'truncated=' + ctx.aurixBackendSnapshotsTruncated);
    ok('14 …conservando la ventana RECIENTE (lo que se pierde es la cola antigua)',
      out[out.length - 1].ts === T2);
  }

  // una cuenta pequeña se resuelve en UNA sola petición
  resetEnv(); env.authed = true; call = 0;
  env.mockResult = () => { call++; return { data: P2, error: null }; };
  const small = await H.fetch();
  ok('14 cuenta pequeña ⇒ una sola petición, sin cursor', call === 1 && env.ltCalls.length === 0, 'llamadas=' + call);
  ok('14 …y devuelve sus filas ordenadas', small.length === 2 && small[0].ts < small[1].ts);
}

// ── SPEC P0 HISTORICAL CONTINUITY — la lectura NO puede recortar la ventana reciente ─────────────
// La consulta pedía `.order('ts', ascending: true).limit(5000)`. PostgREST recorta en su `max-rows`
// (1000) SIN señalar error, así que el cliente se quedaba con las 1000 filas MÁS ANTIGUAS y nunca
// veía nada posterior: en la cuenta del founder, 1000 filas exactas hasta 2026-08-29T05:45 y un
// «hueco» de 55,47 h que en el servidor NO existía. Le pasa a cualquier cuenta a los ~10,4 días.
ok('S lectura DESCENDENTE (si se recorta, se pierde la cola ANTIGUA, nunca la ventana reciente)',
  /\.order\('ts', \{ ascending: false \}\)/.test(app) && !/ascending: true \}\)\.limit\(5000\)/.test(app));
ok('S paginación por CURSOR, no por offset (un insert del cron no puede duplicar ni saltar filas)',
  /_q\.lt\('ts', _cursorIso\)/.test(app));
ok('S un fallo en CUALQUIER página es reintentable (nunca historia a medias como completa)',
  /for \(let _page = 0; _page < _MAXP; _page\+\+\)[\s\S]{0,900}if \(error \|\| !Array\.isArray\(_rows\)\) return null;/.test(app));
ok('S el recorte por presupuesto es AUDITABLE (no invisible como el de 1000)',
  /_aurixBackendSnapshotsTruncated = _truncated/.test(app));
// El sandbox DEBE cargar las constantes reales del bundle: sin ellas el fetch cae a sus literales de
// respaldo y este harness certificaría valores que no son los de app.js. Comprobado: con `_PAGE=500` y
// `_MAX_PAGES=1` —que restaura el defecto de una sola página— el harness pasaba igual.
ok('S el sandbox usa las constantes REALES del bundle, no los literales de respaldo',
  vm.runInContext('_AURIX_BACKEND_SNAPSHOT_PAGE', ctx) === 1000 && vm.runInContext('_AURIX_BACKEND_SNAPSHOT_MAX_PAGES', ctx) === 12,
  'PAGE=' + vm.runInContext('_AURIX_BACKEND_SNAPSHOT_PAGE', ctx) + ' MAXP=' + vm.runInContext('_AURIX_BACKEND_SNAPSHOT_MAX_PAGES', ctx));
ok('S la parada NO asume el tope del servidor (página VACÍA, no página corta)',
  /if \(_rows\.length === 0\) break;/.test(app) && !/if \(_rows\.length < _PAGE\) break;/.test(app));
ok('S salida ordenada ASCENDENTE y deduplicada por ts (mismo contrato que consumía el merge)',
  /\.sort\(\(a, b\) => a\.ts - b\.ts\)[\s\S]{0,260}p\.ts !== arr\[i - 1\]\.ts/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();
