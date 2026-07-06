'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-SHORT-HISTORY-DISPLAY-harness — SPEC DSH.CHART.SHORT-HISTORY-PREMIUM-DISPLAY.16
// ════════════════════════════════════════════════════════════════════════════
// Presentation-layer policy: when trustworthy history is shorter than the requested range, don't draw the
// long chart as a full historic — drop small INITIAL construction fragments (never bridge them), draw a
// CLEAN partial line of the recent main cluster when stable, else the premium "building" state. 24H is
// untouched (SPEC.11). syntheticPoints stays 0 (only drops, never fabricates). GATE OFF (flag absent) =
// v497 (full points, no trim). Tests _aurixShortHistoryDisplay(emg, range) directly with synthetic emg.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fn(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konst(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }
const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;

function mkCtx(withFlag) {
  const ctx = { console, Math, JSON, Array, Number, isFinite, Infinity };
  vm.createContext(ctx);
  vm.runInContext(konst('_AURIX_CHART_SHORT_HISTORY_MIN_DAYS'), ctx);
  if (withFlag) vm.runInContext(konst('_AURIX_CHART_SHORT_HISTORY_DISPLAY'), ctx);   // absent ⇒ undefined ⇒ GATE OFF
  vm.runInContext(fn('_aurixShortHistoryDisplay'), ctx);
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const shd = (ctx, emg, r) => vm.runInContext('_aurixShortHistoryDisplay', ctx)(emg, r);
// synthetic emg
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
function emgOf(range, points) { return { range: range, state: 'ready', color: 'up', pointCount: points.length, points: points }; }
const subsetOf = (disp, input) => disp.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-SHORT-HISTORY-DISPLAY — SPEC DSH.CHART.SHORT-HISTORY-PREMIUM-DISPLAY.16\n');

// ── 1. GATE OFF = v497 (full, no trim) ──
console.log('1. GATE OFF preserves v497 (full points, no trim):');
{
  const pts = [].concat(seg(T0 - 4.8 * DAY, 2, 6 * HOUR, 9520, -1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  const off = shd(OFF, emgOf('7d', pts), '7d');
  ok('mode = full', off.mode === 'full', off.reason);
  ok('displayPoints = all input (no trim)', off.displayPoints.length === pts.length);
  ok('droppedLeadingFragmentPts = 0', off.droppedLeadingFragmentPts === 0);
}

// ── 2. 24H untouched (SPEC.11) even with fragments ──
console.log('\n2. 24H untouched (SPEC.11):');
{
  const pts = [].concat(seg(T0 - 20 * HOUR, 2, 30 * MIN, 9500, 1), seg(T0 - 6 * HOUR, 30, 10 * MIN, 9000, 1));
  const on = shd(ON, emgOf('24h', pts), '24h');
  ok('mode = full (24h never trimmed)', on.mode === 'full' && on.reason === '24h_unchanged');
  ok('displayPoints unchanged', on.displayPoints.length === pts.length);
}

// ── 3. Observed scenario A: small leading fragments + recent cluster, 7D → drop fragments, clean partial ──
console.log('\n3. 7D: 2 small initial fragments + recent cluster → fragments dropped, clean partial:');
{
  const pts = [].concat(seg(T0 - 4.8 * DAY, 2, 6 * HOUR, 9520, -1), seg(T0 - 3.5 * DAY, 2, 6 * HOUR, 9480, 1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  const on = shd(ON, emgOf('7d', pts), '7d');
  ok('mode = partial_clean', on.mode === 'partial_clean', on.reason);
  ok('leading fragments dropped (4 pts)', on.droppedLeadingFragmentPts === 4, 'dropped=' + on.droppedLeadingFragmentPts);
  ok('displayPoints = recent main cluster (40)', on.displayPoints.length === 40, 'n=' + on.displayPoints.length);
  ok('no synthetic points (displayPoints ⊆ input)', subsetOf(on.displayPoints, pts) && on.syntheticPoints === 0);
  ok('fragments NOT bridged (dropped, first display ts = main start)', on.displayPoints[0].ts >= T0 - 1 * DAY);
}

// ── 4. same fragments in 30D / 1Y / ALL → dropped there too (range-independent trim) ──
console.log('\n4. 30D/1Y/ALL: same initial fragments dropped → clean recent cluster:');
{
  const pts = [].concat(seg(T0 - 4.8 * DAY, 2, 6 * HOUR, 9520, -1), seg(T0 - 3.5 * DAY, 2, 6 * HOUR, 9480, 1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  ['30d', '1y', 'all'].forEach(r => { const on = shd(ON, emgOf(r, pts), r); ok(r + ': fragments dropped, partial_clean 40pts', on.mode === 'partial_clean' && on.displayPoints.length === 40, r + ' n=' + on.displayPoints.length); });
}

// ── 5. short single clean cluster (no fragments) → partial_clean, all points (no visual change) ──
console.log('\n5. 7D short single clean cluster (no fragments) → partial_clean, all points:');
{
  const pts = seg(T0 - 1 * DAY, 48, 30 * MIN, 9000, 1);   // 1 day, clean
  const on = shd(ON, emgOf('7d', pts), '7d');
  ok('mode = partial_clean', on.mode === 'partial_clean', on.reason);
  ok('all points kept (nothing dropped)', on.displayPoints.length === pts.length && on.droppedLeadingFragmentPts === 0);
}

// ── 6. sufficient history, no fragments → full (byte-identical v497) ──
console.log('\n6. 7D sufficient history (≥2d) clean → full line:');
{
  const pts = seg(T0 - 5 * DAY, 240, 30 * MIN, 9000, 0.2);   // 5 days clean
  const on = shd(ON, emgOf('7d', pts), '7d');
  ok('mode = full', on.mode === 'full', on.reason);
  ok('displayPoints = all', on.displayPoints.length === pts.length);
}

// ── 7. per-range minimum thresholds (30d<7d, 1y<30d, all<7d) ──
console.log('\n7. Per-range short-history thresholds:');
{
  // 30D: 5-day clean single cluster → short (min 7d) → partial_clean(all)
  const p30 = seg(T0 - 5 * DAY, 120, HOUR, 9000, 0.5);
  const on30 = shd(ON, emgOf('30d', p30), '30d');
  ok('30D 5d < 7d → partial_clean', on30.mode === 'partial_clean' && on30.minSpanDays === 7, 'reason=' + on30.reason);
  // 30D: 10-day clean → full
  const p30b = seg(T0 - 10 * DAY, 240, HOUR, 9000, 0.2);
  ok('30D 10d ≥ 7d → full', shd(ON, emgOf('30d', p30b), '30d').mode === 'full');
  // 1Y: 20-day clean → short (min 30d)
  const p1y = seg(T0 - 20 * DAY, 200, 2 * HOUR, 9000, 0.2);
  ok('1Y 20d < 30d → partial_clean', shd(ON, emgOf('1y', p1y), '1y').mode === 'partial_clean');
  // ALL: 5-day clean → short (min 7d)
  const pall = seg(T0 - 5 * DAY, 120, HOUR, 9000, 0.2);
  ok('ALL 5d < 7d → partial_clean', shd(ON, emgOf('all', pall), 'all').mode === 'partial_clean');
}

// ── 8. building when < 2 points remain after trim ──
console.log('\n8. Building placeholder when nothing stable remains:');
{
  ok('1 point → building', shd(ON, emgOf('7d', seg(T0 - 1 * DAY, 1, MIN, 9000, 0)), '7d').mode === 'building');
  // small dense leading fragment (3 pts) + real gap + single recent point → after drop, <2 remain → building
  const pts = [].concat(seg(T0 - 4 * DAY, 3, 30 * MIN, 9500, 1), [{ ts: T0 - 1 * HOUR, value: 9000 }]);
  const on = shd(ON, emgOf('7d', pts), '7d');
  ok('fragment cluster + 1 recent point → building (no line)', on.mode === 'building' && on.showLine === false && on.displayPoints.length === 0, on.reason);
}

// ── 9. large legitimate earlier cluster NOT dropped (only small fragments) ──
console.log('\n9. Large earlier cluster preserved (only small fragments dropped):');
{
  // 20-pt earlier cluster + 30-pt recent cluster separated by a real gap, total < min? span ~5d for 7d
  const pts = [].concat(seg(T0 - 5 * DAY, 20, 30 * MIN, 8000, 1), seg(T0 - 1 * DAY, 30, 30 * MIN, 9000, 1));
  const on = shd(ON, emgOf('7d', pts), '7d');
  ok('large earlier cluster kept (both clusters ⊂ displayPoints)', on.displayPoints.length === 50 && on.droppedLeadingFragmentPts === 0, 'n=' + on.displayPoints.length + ' dropped=' + on.droppedLeadingFragmentPts);
  ok('no synthetic points', subsetOf(on.displayPoints, pts) && on.syntheticPoints === 0);
}

// ── 10. syntheticPoints always 0 + monotonic + input not mutated ──
console.log('\n10. Invariants: syntheticPoints 0, monotonic, no mutation:');
{
  const pts = [].concat(seg(T0 - 4.8 * DAY, 2, 6 * HOUR, 9520, -1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  const before = JSON.stringify(pts);
  const on = shd(ON, emgOf('7d', pts), '7d');
  ok('syntheticPoints 0', on.syntheticPoints === 0);
  ok('displayPoints monotonic in ts', on.displayPoints.every((p, i) => i === 0 || p.ts > on.displayPoints[i - 1].ts));
  ok('input not mutated', JSON.stringify(pts) === before);
}

// ── 11. determinism across permutations (emg.points sorted by pipeline; helper deterministic) ──
console.log('\n11. Deterministic:');
{
  const pts = [].concat(seg(T0 - 4.8 * DAY, 2, 6 * HOUR, 9520, -1), seg(T0 - 3.5 * DAY, 2, 6 * HOUR, 9480, 1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  const sig = o => o.mode + '|' + o.displayPoints.length + '|' + o.droppedLeadingFragmentPts + '|' + o.reason;
  const a = sig(shd(ON, emgOf('7d', pts), '7d')), b = sig(shd(ON, emgOf('7d', pts.slice()), '7d'));
  ok('same input → same policy', a === b, a);
}

console.log('\n=== SOURCE CONTRACT ===');
ok('reversible flag present', /const _AURIX_CHART_SHORT_HISTORY_DISPLAY = true;/.test(app));
ok('per-range min-days table present', /const _AURIX_CHART_SHORT_HISTORY_MIN_DAYS = \{/.test(app) && /'7d': 2/.test(app) && /'30d': 7/.test(app) && /'1y': 30/.test(app) && /'all': 7/.test(app));
ok('helper defined + exported', /function _aurixShortHistoryDisplay/.test(app) && /window\._aurixShortHistoryDisplay =/.test(app));
ok('desktop paint routes building + trims to displayPoints', /_shd && _shd\.mode === 'building'/.test(app) && /emg\.points = _shd\.displayPoints/.test(app));
ok('mobile paint routes building + trims to displayPoints', /_shdM && _shdM\.mode === 'building'/.test(app) && /emg\.points = _shdM\.displayPoints/.test(app));
ok('render calls keep emg.points verbatim (no parallel source)', /renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/.test(app));
ok('helper never fabricates (only drops; syntheticPoints:0)', /syntheticPoints: 0/.test(fn('_aurixShortHistoryDisplay')));
ok('lineage audit exposes shortHistoryDisplay', /shortHistoryDisplay: shortHistoryDisplay,/.test(app));
ok('24H untouched marker', /24h_unchanged/.test(app));
ok('marker SPEC.16 present', /DSH\.CHART\.SHORT-HISTORY-PREMIUM-DISPLAY\.16/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
