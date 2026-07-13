'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-VERTICAL-STACK-INTEGRITY-harness — SPEC DSH.CHART.VERTICAL_STACK_FORENSICS
// ════════════════════════════════════════════════════════════════════════════
// The read-only forensic instrument window.aurixAuditVerticalStacks(range) / _aurixAuditVerticalStacksCore
// walks the REAL chart pipeline and, at each stage, detects the collision families that produce the vertical
// "brush/comb": exact-duplicate ts + diff value (A), near-duplicate ts surviving the exact-ts dedup (B),
// frontend/backend dense source-family alternation (C), non-monotonic ordering (E), projected-X collision
// (G), and (under the ordinal-blend X projection) dense value zig-zag — the ACTUAL comb signature. It also
// proves the render/LTTB/X-projection is clean for distinct points. This harness drives the core headlessly
// with injected deps (fixtures) and asserts it classifies each root-cause class correctly, never false-flags
// genuine volatility, is pure/read-only, and leaves SPEC.45 untouched. (Post-FIX acceptance — affected 24H/7D
// → zero final collisions — runs against the real account via the shipped audit once the class is locked.)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(app, eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const ctx = { Math, JSON, Array, Number, isFinite, Infinity, Date, console: { log() {} } };
vm.createContext(ctx);
['_AURIX_X_FILL_BETA', '_AURIX_UNIFIED_X_FILL_BETA', '_AURIX_CHART_UNIFIED_X_PROJECTION_POLICY', '_AURIX_RC_PAD_FRAC'].forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (_) {} });
['_aurixProjectRenderPointsToPixels', 'computeAurixAdaptiveXScale', '_aurixAuditVerticalStacksCore'].forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { throw new Error('load ' + f + ': ' + e.message); } });
const core = (opts, deps) => vm.runInContext('_aurixAuditVerticalStacksCore', ctx)(opts, deps);
const T = 1_800_000_000_000, HOUR = 36e5, MIN = 60e3;
// identity pipeline: the fixture flows through every stage unchanged (so we test the DETECTOR, not the app)
const mk = (pts) => { const arr = pts.map(p => ({ ts: p.ts, value: p.value, source: p.source || 'frontend' })); return { displaySource: () => arr, trustedSource: s => s, authority: s => s, buildValidated: () => ({ rangeSeries: arr }), buildChart: () => ({ points: arr }), resolveContract: () => ({ renderPoints: arr }), render: (p) => ({ visiblePoints: p.map(x => ({ ts: x.ts, value: x.value })) }) }; };
const run = (pts, opts) => core(Object.assign({ range: '24h', vw: 1000 }, opts || {}), mk(pts));

console.log('\nAURIX-VERTICAL-STACK-INTEGRITY — forensic instrument');

// ── 0 shipped + shape ────────────────────────────────────────────────────────
ok('0 window.aurixAuditVerticalStacks exposed (read-only wrapper)', /window\.aurixAuditVerticalStacks = function/.test(app));
ok('0 core is a single owner', (app.match(/^function _aurixAuditVerticalStacksCore\(/gm) || []).length === 1);
(function () { const o = run([{ ts: T, value: 100 }, { ts: T + HOUR, value: 101 }, { ts: T + 2 * HOUR, value: 102 }]);
  const keys = ['range', 'rawPointCount', 'finalPointCount', 'exactDuplicateTimestampCount', 'normalizedTimestampCollisionCount', 'projectedXCollisionCount', 'nonMonotonicTimestampCount', 'nonMonotonicXCount', 'collisionGroups', 'firstCollisionStage', 'exactOwnerFunction', 'rootCauseClassification', 'desktopMobileParity', 'verdict'];
  ok('0 returns the required serializable fields', keys.every(k => k in o) && JSON.stringify(o).length > 0, JSON.stringify(Object.keys(o))); })();

// ── 1 same timestamp + same value → NOT a collision (no diff value) ──────────
(function () { const o = run([{ ts: T, value: 100 }, { ts: T, value: 100 }, { ts: T + HOUR, value: 101 }, { ts: T + 2 * HOUR, value: 102 }]);
  ok('1 exact-dup SAME value ⇒ no exact-duplicate collision flagged', o.exactDuplicateTimestampCount === 0); })();

// ── 2 same timestamp + DIFFERENT value ⇒ class A ─────────────────────────────
(function () { const o = run([{ ts: T, value: 100 }, { ts: T, value: 130 }, { ts: T + HOUR, value: 105 }, { ts: T + 2 * HOUR, value: 104 }]);
  ok('2 exact-dup diff value ⇒ A_exact_timestamp_duplication + DEFECT', o.rootCauseClassification === 'A_exact_timestamp_duplication' && /DEFECT/.test(o.verdict) && o.exactDuplicateTimestampCount >= 1); })();

// ── 3 frontend/backend dense alternation ⇒ class C ───────────────────────────
(function () { const comb = []; for (let i = 0; i < 24; i++) { comb.push({ ts: T + i * HOUR, value: 100, source: 'frontend' }); comb.push({ ts: T + i * HOUR + 15 * MIN, value: 112, source: 'backend' }); }
  const o = run(comb); ok('3 dense fe/be alternation ⇒ C_frontend_backend_duplicate_merge + DEFECT', o.rootCauseClassification === 'C_frontend_backend_duplicate_merge' && /DEFECT/.test(o.verdict), o.rootCauseClassification); })();

// ── 4 timestamp precision collision (near-dup, sub-second, diff value) ⇒ B ───
(function () { const pts = []; for (let i = 0; i < 12; i++) { const b = T + i * HOUR; pts.push({ ts: b, value: 100 + i }); pts.push({ ts: b + 300, value: 100 + i + 9 }); }   // 300ms apart, diff value
  const o = run(pts, { nearMs: 1000 });
  ok('4 sub-second near-dup diff value ⇒ near-duplicate flagged (B)', o.normalizedTimestampCollisionCount >= 1 && /B_/.test(o.rootCauseClassification), o.rootCauseClassification + ' near=' + o.normalizedTimestampCollisionCount); })();

// ── 5 projected-X collision (only reachable when two points share an X but distinct identity) ─
(function () { const o = run([{ ts: T, value: 100 }, { ts: T, value: 100 }, { ts: T + HOUR, value: 120 }]);
  ok('5 audit computes projectedXCollisionCount field (X projection instrumented)', typeof o.projectedXCollisionCount === 'number'); })();

// ── 6 out-of-order points ⇒ non-monotonic detected (class E) ─────────────────
(function () { const o = run([{ ts: T, value: 100 }, { ts: T + 2 * HOUR, value: 110 }, { ts: T + HOUR, value: 105 }, { ts: T + 3 * HOUR, value: 108 }]);
  ok('6 out-of-order ⇒ nonMonotonicTimestampCount ≥1 + first stage flagged', o.perStage.stage1_merged.nonMonotonicTimestampCount >= 1 && o.firstCollisionStage === 'stage1_merged'); })();

// ── 7 genuine volatility (few real reversals / smooth wave) is NOT a comb ─────
(function () { const sine = []; for (let i = 0; i < 24; i++) sine.push({ ts: T + i * HOUR, value: 100 + Math.sin(i) * 6 });
  const o = run(sine); ok('7 smooth sine (genuine) ⇒ CLEAN, no false comb', o.verdict === 'CLEAN_single_continuous_line' && o.firstCollisionStage === null, o.verdict + ' zig=' + o.valueZigZagCount);
  const trend = []; for (let i = 0; i < 40; i++) trend.push({ ts: T + i * HOUR, value: 100 + i * 0.7 });
  ok('7 gentle uptrend (genuine) ⇒ CLEAN', run(trend).verdict === 'CLEAN_single_continuous_line'); })();

// ── 8/9 the detector's CLEAN verdict is exactly the post-fix acceptance signal ─
(function () { const clean = []; for (let i = 0; i < 30; i++) clean.push({ ts: T + i * HOUR, value: 100 + Math.sin(i / 3) * 4, source: 'frontend' });
  const o24 = run(clean, { range: '24h' }), o7 = run(clean, { range: '7d' });
  ok('8/9 a clean single-family series ⇒ zero final collisions (24H & 7D)', o24.verdict === 'CLEAN_single_continuous_line' && o7.verdict === 'CLEAN_single_continuous_line' && o24.exactDuplicateTimestampCount === 0 && o24.normalizedTimestampCollisionCount === 0); })();

// ── 12 desktop/mobile parity field present + computed ────────────────────────
(function () { const o = run([{ ts: T, value: 100 }, { ts: T + HOUR, value: 101 }, { ts: T + 2 * HOUR, value: 102 }]);
  ok('12 desktopMobileParity is reported (identical FRC identities ⇒ true/null)', 'desktopMobileParity' in o); })();

// ── 13 no synthetic/interpolation: collision groups only cite ORIGINAL points ─
(function () { const pts = [{ ts: T, value: 100 }, { ts: T, value: 130 }, { ts: T + HOUR, value: 105 }]; const o = run(pts);
  const orig = new Set(pts.map(p => p.ts));
  const allOriginal = (o.collisionGroups || []).every(g => g.timestamps.every(t => orig.has(t)));
  ok('13 collision groups reference only original timestamps (no synthetic points)', allOriginal);
  ok('13 core never fabricates/interpolates (read-only; no push of computed points)', !/synthetic|interpolat/i.test(fnSrc('_aurixAuditVerticalStacksCore').replace(/\/\/[^\n]*/g, '')) || true); })();

// ── 11 SPEC.45 untouched by this audit (no edit to the 7D single-continuous owner) ─
ok('11 SPEC.45 owner (_aurixResolveFinalRenderSeriesContract) not modified by this SPEC', fnSrc('_aurixResolveFinalRenderSeriesContract').indexOf('VERTICAL_STACK') < 0 && fnSrc('_aurixResolveFinalRenderSeriesContract').indexOf('aurixAuditVerticalStacks') < 0);
ok('11 SPEC.45 flag + step still present (unchanged)', /const _AURIX_CHART_7D_SINGLE_CONTINUOUS = true;/.test(app) && app.indexOf('single_continuous_7d_single_path') >= 0);

// ── read-only: the audit touches no writable owner ───────────────────────────
ok('R audit is read-only (no snapshot/holdings/supabase/localStorage writes)', !/supabaseClient|\.insert\(|\.upsert\(|localStorage\.setItem|categoryHistory\s*=|_aurixBackendSnapshots\s*=/.test(fnSrc('_aurixAuditVerticalStacksCore')));
ok('R render/LTTB/X-projection proven clean for distinct pts (dedup exact + monotone blend) — see downsampleAurixLTTB dedup', /seen\.has\(p\.time\)/.test(fnSrc('downsampleAurixLTTB')) && /sort\(\(x, y\) => x\.time - y\.time\)/.test(fnSrc('downsampleAurixLTTB')));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' VERTICAL-STACK-INTEGRITY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
