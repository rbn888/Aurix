'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-BACKEND-SNAPSHOTS-harness — SPEC DSH.CHART.BACKEND-SNAPSHOTS.V1.01
// ════════════════════════════════════════════════════════════════════════════
// Read-only backend-snapshot merge (frontend dense wins; backend fills gaps; no dup; no synthetic points;
// deterministic; stale market marked) + pipeline integration (partial_history) + diagnostics + siblings.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }
function konst(name) { const m = app.match(new RegExp('const ' + name + '\\s*=.*?;')); if (!m) throw new Error('missing ' + name); return m[0]; }
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const MIN = 60e3, DAY = 864e5;

// ── MERGE sandbox ──
const MS = { console, Math, JSON, Array, Number, isFinite, Infinity };
vm.createContext(MS);
['_AURIX_SNAP_NEAR_MS', '_AURIX_SNAP_NEAR_FRAC', '_AURIX_SNAP_FE_AUTHORITY_MS'].forEach(c => vm.runInContext(konst(c), MS));
['_aurixNormalizeBackendSnapshot', '_aurixMergeSnapshotSources'].forEach(n => vm.runInContext(fn(n), MS));
function merge(fe, be, opts) { MS.__fe = fe; MS.__be = be; return vm.runInContext('_aurixMergeSnapshotSources(__fe, __be, ' + JSON.stringify(opts || {}) + ')', MS); }

// ── PIPELINE sandbox ──
let HIST = [], LEDGER = [];
const PS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set, Object, isNaN, parseInt, parseFloat, String,
  toBase: v => v, _aurixLoadCapitalFlows: () => LEDGER, _aurixHistorySourceForDisplay: () => HIST, currentUser: { id: 'u' }, activeRange: '7d', __setHist: h => { HIST = h; } };
vm.createContext(PS);
['_AURIX_EMG_RANGE_MS', '_AURIX_EMG_ADJ_JUMP', '_AURIX_EMG_FALLBACK_TAIL', '_AURIX_EMG_MIN_POINTS', '_AURIX_HPQ_MIN_POINTS', '_AURIX_HPQ_SPIKE_JUMP', '_AURIX_HPQ_SPIKE_REVERT_FRAC', '_AURIX_HPQ_FUTURE_MS', '_AURIX_PROD_MIN_POINTS', '_AURIX_PROD_GATE_PCT', '_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT', '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_ALL_MIN_TRUST_SPAN_MS', '_AURIX_VJUMP_MIN_FRAC', '_AURIX_VJUMP_P95_MULT', '_AURIX_CAPSTEP_RATIO_LO', '_AURIX_CAPSTEP_RATIO_HI', '_AURIX_CAPSTEP_TS_PAD_MS', '_AURIX_CAPITAL_STEP_SEG_ENABLED'].forEach(c => vm.runInContext(konst(c), PS));
['_aurixEmergencyHash', '_aurixProdPlateauFilter', '_aurixProdVisualGate', '_aurixHpqIso', '_aurixHpqDiag', '_aurixHpqRangesContaining', '_aurixHpqRawStages', '_aurixHpqTrimConstruction', '_aurixHpqQuarantineSpikes', '_aurixHpqFirstInvalidStage', 'buildValidatedHistoricalSeries', '_aurixNetFlowsInWindow', '_aurixComputePeriodReturn', '_aurixVerticalJumps', '_aurixCapitalStepBreaks', 'buildProductionPortfolioChart'].forEach(n => vm.runInContext(fn(n), PS));
function build(range) { return vm.runInContext('buildProductionPortfolioChart(' + JSON.stringify(range) + ')', PS); }

console.log('AURIX-CHART-BACKEND-SNAPSHOTS — SPEC DSH.CHART.BACKEND-SNAPSHOTS.V1.01\n');

console.log('Merge (frontend dense wins, backend fills gaps, no dup, no synthetic):');
const T0 = 1_800_000_000_000;
// dense frontend today (last ~day), sparse backend covering older days
const feDense = []; for (let i = 0; i < 48; i++) feDense.push({ ts: T0 + i * 30 * MIN, total: 10000 + i, real_estate: 0 });
const beOlder = []; for (let i = 1; i <= 4; i++) beOlder.push({ ts: T0 - i * DAY, total_value_usd: 9800 - i * 10, real_estate: 0, market_state: 'crypto_24_7', price_staleness: 'live', confidence: 'scheduled' });
{ const m = merge(feDense, beOlder);
  ok('1 backend fills older gap (kept before frontend cluster)', m.length === feDense.length + beOlder.length && m[0].source === 'backend_snapshot', 'n=' + m.length); }
// near-duplicate backend at same instant/value as a frontend point → dropped (frontend wins where dense)
{ const beDup = [{ ts: feDense[10].ts + 60000, total_value_usd: feDense[10].total + 1, real_estate: 0 }];
  const m = merge(feDense, beDup); ok('1b frontend dense wins: near-duplicate backend dropped', m.length === feDense.length, 'n=' + m.length); }
// backend fills a real gap in the middle of frontend
{ const feGap = feDense.slice(0, 10).concat(feDense.slice(38)); const beFill = [{ ts: T0 + 24 * 30 * MIN, total_value_usd: 10024, real_estate: 0 }];
  const m = merge(feGap, beFill); const inGap = m.some(p => p.source === 'backend_snapshot' && p.ts > feGap[9].ts && p.ts < feDense[38].ts);
  ok('2 backend fills a genuine mid gap', inGap && m.length === feGap.length + 1, 'n=' + m.length); }
// no duplicate snapshots: backend-backend near-dupes collapsed
{ const beDupes = [{ ts: T0 - 2 * DAY, total_value_usd: 9700, real_estate: 0 }, { ts: T0 - 2 * DAY + 60000, total_value_usd: 9701, real_estate: 0 }];
  const m = merge([], beDupes); ok('no duplicate snapshots (backend near-dupe collapsed)', m.length === 1, 'n=' + m.length); }
// stale market prices marked (normalization preserves market_state / price_staleness / source)
{ const be = [{ ts: T0 - DAY, total_value_usd: 9800, real_estate: 0, market_state: 'closed', price_staleness: 'last_close' }];
  const m = merge([], be); ok('stale market prices marked (market_state/price_staleness preserved)', m[0].market_state === 'closed' && m[0].price_staleness === 'last_close' && m[0].source === 'backend_snapshot'); }
// deterministic
{ const a = merge(feDense, beOlder), b = merge(feDense, beOlder); ok('merge deterministic', JSON.stringify(a) === JSON.stringify(b)); }
// no synthetic points: every merged point ts ∈ frontend ∪ backend
{ const m = merge(feDense, beOlder); const src = new Set(feDense.map(p => p.ts).concat(beOlder.map(p => p.ts)));
  ok('no synthetic points (every ts is a real frontend/backend ts)', m.every(p => src.has(p.ts))); }
// empty backend → strict no-op (identical to frontend)
{ const m = merge(feDense, []); ok('empty backend → NO-OP (frontend byte-identical)', JSON.stringify(m) === JSON.stringify(feDense)); }

// SPEC DSH.CHART.POINT-LINEAGE.DISCONTINUITY.AUDIT.10 — the REAL prod near-duplicate: backend 9508.19 at
// 12:15:06 and remote 9459.25 at 12:15:14 (8 s apart, 0.5% apart) must NOT both plot. The OLD rule (also
// required 0.2% value proximity) let this survive → intraday teeth + cross-source badge.
{ const remote = [{ ts: T0 + 8000, total: 9459.25, real_estate: 0 }];               // remote/frontend @12:15:14
  const be = [{ ts: T0, total_value_usd: 9508.19, real_estate: 0 }];                 // backend @12:15:06 (0.5% higher)
  const m = merge(remote, be);
  ok('SPEC.10: backend 9508.19 near remote 9459.25 (8s, 0.5%) DROPPED — not both plotted', m.length === 1 && m[0].source !== 'backend_snapshot', 'n=' + m.length + ' src0=' + (m[0] && m[0].source)); }

// SPEC.10 #8 — dense frontend/remote over 24H ⇒ ZERO backend plotted in that span (frontend authority),
// while backend OLDER than the frontend span is still kept (long-range history).
{ const feDay = []; for (let i = 0; i < 190; i++) feDay.push({ ts: T0 + i * 7.6 * MIN, total: 9450 + (i % 6) * 3, real_estate: 0 });  // ~188 pts / 24h (prod-like)
  const beIntraday = []; for (let i = 0; i < 83; i++) beIntraday.push({ ts: T0 + i * 17 * MIN + 30000, total_value_usd: 9500 + (i % 5) * 4, real_estate: 0 });  // backend scattered in the same 24h
  const beOld = [{ ts: T0 - 10 * DAY, total_value_usd: 8000, real_estate: 0 }];      // genuine older history
  const m = merge(feDay.concat(beOld ? [] : []), beIntraday.concat(beOld));
  const backendInSpan = m.filter(p => p.source === 'backend_snapshot' && p.ts >= feDay[0].ts && p.ts <= feDay[feDay.length - 1].ts).length;
  const backendOldKept = m.some(p => p.source === 'backend_snapshot' && p.ts < feDay[0].ts);
  ok('SPEC.10 #8: 0 backend plotted inside the dense frontend 24H span', backendInSpan === 0, 'inSpan=' + backendInSpan);
  ok('SPEC.10 #6: older-than-frontend backend still kept (long-range history intact)', backendOldKept); }

console.log('\nPipeline integration (partial_history honesty):');
// frontend ~3.5d dense + backend older extends to ~5.5d total → 7D coverage ~0.78 (<0.8) → partial_history
function densePipe(startTs, days) { const n = Math.round(days * 24 * 2), out = []; for (let i = 0; i < n; i++) out.push({ ts: startTs + i * 30 * MIN, total: 10000 + i * 0.5, real_estate: 0 }); return out; }
{ const fe = densePipe(T0, 3.5); const be = []; for (let i = 1; i <= 4; i++) be.push({ ts: T0 - i * (12 * 3600e3), total_value_usd: 9950 - i, real_estate: 0 }); // extend ~2d older
  const merged = merge(fe, be); PS.__setHist(merged);
  const p7 = build('7d'); ok('7 7D with backend (partial coverage) → partial_history', p7.displayedRangeState === 'partial_history' && p7.coverageRatio < 0.8, 'state=' + p7.displayedRangeState + ' cov=' + p7.coverageRatio);
  const p30 = build('30d'); ok('8 30D with backend (still short) → partial_history', p30.displayedRangeState === 'partial_history', 'state=' + p30.displayedRangeState + ' cov=' + p30.coverageRatio); }
// full coverage (backend gives >0.8 of 7D) → full (honest upgrade)
{ const merged = densePipe(T0 - 7.5 * DAY, 7.6); PS.__setHist(merged); const p = build('7d');
  ok('+ 7D with full backend coverage → full (honest upgrade)', p.displayedRangeState === 'full' && p.coverageRatio >= 0.8, 'state=' + p.displayedRangeState + ' cov=' + p.coverageRatio); }

console.log('\nWiring + diagnostics + safety (source):');
ok('merge wired at chokepoint behind flag (NO-OP until data)', /_AURIX_BACKEND_SNAPSHOTS_ENABLED && Array\.isArray\(_aurixBackendSnapshots\) && _aurixBackendSnapshots\.length/.test(app) && /return _aurixMergeSnapshotSources\(base, _aurixBackendSnapshots\)/.test(app));
ok('_aurixBackendSnapshots defaults empty (strict no-op today)', /let _aurixBackendSnapshots = \[\];/.test(app));
ok('diagnostics exposed', /window\.aurixSnapshotSourceAudit = function/.test(app) && /window\.aurixSnapshotMergeDebug = function/.test(app));
ok('no new table write from frontend (append-only backend table is service-role only)', !/from\('portfolio_snapshots'\)[\s\S]{0,40}\.(insert|upsert|update|delete)/.test(app));
ok('migration file present (not applied)', fs.existsSync(path.join(root, 'db', 'portfolio_snapshots_1.sql')));

console.log('\nRead-only loader (NO-OP until activation) + security:');
// behavioural: _aurixFetchBackendSnapshots with a mock supabase client
const LS = { console, Math, JSON, Array, Number, isFinite, Infinity, Date };
vm.createContext(LS);
['_AURIX_BACKEND_SNAPSHOTS_ENABLED', '_AURIX_BACKEND_SNAPSHOT_LOOKBACK_DAYS'].forEach(c => vm.runInContext(konst(c), LS));
vm.runInContext('async ' + fn('_aurixFetchBackendSnapshots'), LS);   // fn() extractor drops the async keyword
function mockClient(result) {
  const chain = {}; ['from', 'select', 'eq', 'gte', 'order', 'limit'].forEach(m => chain[m] = () => chain);
  chain.then = (res) => res(result);   // awaitable → {data,error}
  return { from: () => chain };
}
async function fetchWith(clientResult, authed) {
  LS.supabaseClient = clientResult === null ? null : mockClient(clientResult);
  LS.currentUser = authed ? { id: 'u1' } : null;
  return vm.runInContext('_aurixFetchBackendSnapshots()', LS);
}
(async () => {
  const iso = new Date(1_800_000_000_000).toISOString();
  const rowsOk = await fetchWith({ data: [{ ts: iso, total_value_usd: 12345, real_estate: 0, category_values: {}, confidence: 'scheduled', market_state: 'crypto_24_7', price_staleness: 'live' }], error: null }, true);
  ok('loader maps rows → pipeline shape (ts→ms, source tagged)', rowsOk.length === 1 && rowsOk[0].ts === 1_800_000_000_000 && rowsOk[0].source === 'backend_snapshot' && rowsOk[0].total_value_usd === 12345);
  const rowsErr = await fetchWith({ data: null, error: { message: 'relation "portfolio_snapshots" does not exist' } }, true);
  ok('loader on table-missing/error → [] (strict NO-OP, chart == v481)', Array.isArray(rowsErr) && rowsErr.length === 0);
  const rowsAnon = await fetchWith({ data: [{ ts: iso, total_value_usd: 1 }], error: null }, false);
  ok('loader when NOT authed → [] (no query result used)', Array.isArray(rowsAnon) && rowsAnon.length === 0);

  // security (source): no service-role in frontend; edge fn uses env; frontend never writes the table
  const loginTxt = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
  ok('no service_role key in app.js/login.html', !/service_role/i.test(app) && !/service_role/i.test(loginTxt));
  const edge = fs.existsSync(path.join(root, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts')) ? fs.readFileSync(path.join(root, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts'), 'utf8') : '';
  ok('edge function reads service-role from env (never hardcoded)', /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(edge) && !/eyJ[A-Za-z0-9_-]{20,}/.test(edge));
  ok('edge function supports DRY_RUN (verify before real inserts)', /DRY_RUN/.test(edge));
  ok('frontend reads portfolio_snapshots via .select only (never insert/upsert/update/delete)',
    /from\('portfolio_snapshots'\)[\s\S]{0,80}\.select\(/.test(app) && !/from\('portfolio_snapshots'\)[\s\S]{0,120}\.(insert|upsert|update|delete)\(/.test(app));
  // SPEC ACTIVATE-READ.04 — read now activated: autoload ON, but load fires ONLY after auth+client (bounded poll)
  ok('autoload ACTIVATED (fires only after auth+client, bounded poll)', /const _AURIX_BACKEND_SNAPSHOTS_AUTOLOAD = true;/.test(app));
  ok('autoload waits for currentUser+supabaseClient then loads once (not a blind timeout)', /if \(typeof currentUser !== 'undefined' && currentUser && currentUser\.id && typeof supabaseClient !== 'undefined' && supabaseClient\)[\s\S]{0,80}aurixLoadBackendSnapshots\(\)/.test(app));
  ok('autoload poll is bounded (never loops forever)', /_blTries < 20/.test(app));
  ok('per-range backend-usage diagnostic exposed (perRange)', /perRange\[rg\] = \{ backendInWindow/.test(app));
  ok('window.aurixLoadBackendSnapshots exposed for manual/activation load', /window\.aurixLoadBackendSnapshots = async function/.test(app));

  console.log('\nSiblings remain green:');
  for (const [label, file] of [['auth stability freeze', 'AURIX-AUTH-MOBILE-STABILITY-FREEZE-harness.js'], ['desktop OTP', 'AURIX-AUTH-DESKTOP-OTP-WEB-ONLY-harness.js'], ['DATA-TRUTH', 'AURIX-CHART-INSTITUTIONAL-DATA-TRUTH-harness.js'], ['V480 cleanup', 'AURIX-CHART-V480-RUNTIME-CLEANUP-harness.js'], ['24H premium reference', 'AURIX-CHART-24H-PREMIUM-REFERENCE-harness.js'], ['TRUTHFUL_RANGES', 'AURIX-CHART-TRUTHFUL-RANGES-harness.js']]) {
    let good = false; try { cp.execSync('node ' + JSON.stringify(path.join(__dirname, file)), { stdio: 'ignore' }); good = true; } catch (_) {}
    ok(label + ' remains green', good);
  }
  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
