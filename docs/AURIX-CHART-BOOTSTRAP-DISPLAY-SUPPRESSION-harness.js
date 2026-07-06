'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-BOOTSTRAP-DISPLAY-SUPPRESSION-harness — SPEC DSH.CHART.BOOTSTRAP-DISPLAY-SUPPRESSION.18
// ════════════════════════════════════════════════════════════════════════════
// When the badge is Calculando (short/untrusted history), the chart must hide the low bootstrap/construction
// prefix (a single time-continuous ramp that SPEC.16/17 keep because there is no time gap) and show only the
// trailing STABLE tramo — the first point within ±15% of the current value with ≥3 pts / ≥30 min stable
// continuity after and no construction jump at the edge. No stable tramo ⇒ building. Mature/clean (badge OK)
// ⇒ passthrough. Never bridges/interpolates/fabricates (only hides a prefix) ⇒ syntheticPoints=0. GATE OFF
// (flag absent) ⇒ v499 passthrough. Tests _aurixStableDisplayAnchor(points, range, context) directly.
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
  ['_AURIX_STABLE_BAND_LO', '_AURIX_STABLE_MIN_PTS', '_AURIX_STABLE_MIN_SPAN_MS', '_AURIX_STABLE_CONSTRUCTION_JUMP'].forEach(c => vm.runInContext(konst(c), ctx));
  // _AURIX_STABLE_BAND_HI shares the _LO statement
  if (withFlag) vm.runInContext(konst('_AURIX_CHART_BOOTSTRAP_SUPPRESSION'), ctx);   // absent ⇒ GATE OFF
  vm.runInContext(fn('_aurixStableDisplayAnchor'), ctx);
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const anchor = (ctx, pts, r, calc) => vm.runInContext('_aurixStableDisplayAnchor', ctx)(pts, r, { badgeCalculando: calc });
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
const subsetOf = (out, input) => out.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-BOOTSTRAP-DISPLAY-SUPPRESSION — SPEC DSH.CHART.BOOTSTRAP-DISPLAY-SUPPRESSION.18\n');

// ── 1. reset account: single continuous bootstrap ramp + stable tramo → hide prefix, show stable ──
console.log('1. Reset account bootstrap ramp → hidden prefix, stable tramo shown (7D/30D/1Y/ALL):');
{
  // continuous 30-min cadence: 20 pts ramping 100→8600 (bootstrap), then 40 pts stable ~9000 (current)
  const ramp = seg(T0 - 5 * DAY, 20, 30 * MIN, 100, 447);            // 100 .. ~8593 (out of band low)
  const stable = seg(T0 - 5 * DAY + 20 * 30 * MIN, 40, 30 * MIN, 9000, 1);
  const pts = ramp.concat(stable);
  ['7d', '30d', '1y', 'all'].forEach(r => {
    const on = anchor(ON, pts, r, true);
    ok(r + ': mode line + prefix hidden + starts stable', on.mode === 'line' && on.hiddenPrefixPts > 0 && on.points[0].value >= on.bandLo, r + ' hidden=' + on.hiddenPrefixPts + ' first=' + (on.points[0] && on.points[0].value));
  });
  const on = anchor(ON, pts, 'all', true);
  ok('rendered tramo ⊆ input (no synthetic)', subsetOf(on.points, pts) && on.syntheticPoints === 0);
  ok('no interpolation (all rendered ts ∈ input)', on.points.every(p => pts.some(q => q.ts === p.ts)));
  ok('prefix hidden ~= ramp length', on.hiddenPrefixPts >= 15, 'hidden=' + on.hiddenPrefixPts);
}

// ── 2. 24H clean (badge OK) → unchanged ──
console.log('\n2. 24H clean, badge OK → passthrough (unchanged):');
{
  const pts = seg(T0 - 23 * HOUR, 138, 10 * MIN, 9000, 3);
  const on = anchor(ON, pts, '24h', false);   // badge OK
  ok('mode line, all points kept', on.mode === 'line' && on.points.length === pts.length);
  ok('reason badge_ok_passthrough', on.reason === 'badge_ok_passthrough');
}

// ── 3. mature account (badge OK) → identical even in long range ──
console.log('\n3. Mature account badge OK → identical (no suppression):');
{
  const pts = seg(T0 - 30 * DAY, 300, 2 * HOUR, 8000, 3);   // long dense history
  const on = anchor(ON, pts, '1y', false);
  ok('all points kept, no prefix hidden', on.points.length === pts.length && on.hiddenPrefixPts === 0);
}

// ── 4. large real deposit inside stable tramo → not erased ──
console.log('\n4. Real deposit within a stable recent tramo → tramo preserved (not building):');
{
  // low bootstrap 5000 (out of band vs current ~10000) then deposit-driven stable tramo 9600→10400 (all in band)
  const boot = seg(T0 - 5 * DAY, 12, 30 * MIN, 5000, 10);            // ~5000 (out of band, hidden)
  const stable = seg(T0 - 5 * DAY + 12 * 30 * MIN, 40, 30 * MIN, 9600, 20);   // 9600..~10380, current ~10380
  const pts = boot.concat(stable);
  const on = anchor(ON, pts, '30d', true);
  ok('mode line (tramo shown, not building)', on.mode === 'line', on.reason);
  ok('stable tramo preserved (>= 30 pts)', on.points.length >= 30, 'n=' + on.points.length);
  ok('low bootstrap hidden', on.hiddenPrefixPts >= 10, 'hidden=' + on.hiddenPrefixPts);
  ok('no synthetic', subsetOf(on.points, pts) && on.syntheticPoints === 0);
}

// ── 5. only bootstrap, no stability → building ──
console.log('\n5. Only bootstrap ramp, no stable tramo → building:');
{
  // pure ramp, current value only reached at the very last point; nothing stable near current with ≥3 pts/≥30min
  const pts = seg(T0 - 2 * HOUR, 8, 60 * 1000, 100, 1200);   // 100 .. ~8500 over 8 min, still climbing to current
  const on = anchor(ON, pts, 'all', true);
  ok('mode building (no stable tramo)', on.mode === 'building', on.reason);
  ok('no line points', on.points.length === 0);
}

// ── 6. GATE OFF passthrough ──
console.log('\n6. GATE OFF = passthrough:');
{
  const ramp = seg(T0 - 5 * DAY, 20, 30 * MIN, 100, 447).concat(seg(T0 - 5 * DAY + 20 * 30 * MIN, 40, 30 * MIN, 9000, 1));
  const off = anchor(OFF, ramp, '7d', true);
  ok('mode line, all kept, nothing hidden', off.mode === 'line' && off.points.length === ramp.length && off.hiddenPrefixPts === 0);
}

// ── 7. already-stable short history (in band from start) → shown from start ──
console.log('\n7. Already-stable short history (in band from start) → shown, nothing hidden:');
{
  const pts = seg(T0 - 20 * HOUR, 40, 30 * MIN, 9000, 1);   // all near current, badge Calculando (short)
  const on = anchor(ON, pts, '7d', true);
  ok('mode line, hiddenPrefixPts 0', on.mode === 'line' && on.hiddenPrefixPts === 0, on.reason);
  ok('all points kept', on.points.length === pts.length);
}

// ── 8. anchor skips a still-constructing in-band point (jump at edge) ──
console.log('\n8. In-band point followed by construction jump → anchor moves later:');
{
  // an in-band value, then a >15% jump (construction), then a stable tramo
  const pts = [].concat(
    [{ ts: T0 - 6 * HOUR, value: 9000 }],                  // in band (current ~9500) but followed by a jump
    seg(T0 - 5.5 * HOUR, 2, 30 * MIN, 7000, 0),            // drop (construction) out of band
    seg(T0 - 4 * HOUR, 8, 30 * MIN, 9500, 1));            // stable near current
  const on = anchor(ON, pts, '7d', true);
  ok('anchor is the stable tramo start (value in band, no jump after)', on.mode === 'line' && on.points[0].value >= on.bandLo && on.points[0].ts >= T0 - 4 * HOUR, 'first=' + (on.points[0] && on.points[0].value) + ' @' + (on.points[0] && on.points[0].ts));
}

// ── 9. invariants ──
console.log('\n9. Invariants (no mutation, monotonic, syntheticPoints 0):');
{
  const pts = seg(T0 - 5 * DAY, 20, 30 * MIN, 100, 447).concat(seg(T0 - 5 * DAY + 20 * 30 * MIN, 40, 30 * MIN, 9000, 1));
  const before = JSON.stringify(pts);
  const on = anchor(ON, pts, 'all', true);
  ok('input not mutated', JSON.stringify(pts) === before);
  ok('output monotonic', on.points.every((p, i) => i === 0 || p.ts > on.points[i - 1].ts));
  ok('syntheticPoints 0', on.syntheticPoints === 0);
}

// ── 10. determinism ──
console.log('\n10. Deterministic:');
{
  const pts = seg(T0 - 5 * DAY, 20, 30 * MIN, 100, 447).concat(seg(T0 - 5 * DAY + 20 * 30 * MIN, 40, 30 * MIN, 9000, 1));
  const sig = o => o.mode + '|' + o.points.length + '|' + o.hiddenPrefixPts + '|' + o.reason;
  ok('same input → same anchor', sig(anchor(ON, pts, 'all', true)) === sig(anchor(ON, pts.slice(), 'all', true)));
}

console.log('\n=== SOURCE CONTRACT ===');
ok('reversible flag present', /const _AURIX_CHART_BOOTSTRAP_SUPPRESSION = true;/.test(app));
ok('band 85-115% constants', /_AURIX_STABLE_BAND_LO = 0\.85, _AURIX_STABLE_BAND_HI = 1\.15/.test(app));
ok('helper defined + exported', /function _aurixStableDisplayAnchor/.test(app) && /window\._aurixStableDisplayAnchor =/.test(app));
ok('badge-Calculando gated (mature passthrough)', /badge_ok_passthrough/.test(app) && /context\.badgeCalculando/.test(app));
ok('desktop paint wires SPEC.18 before SPEC.17', /_aurixStableDisplayAnchor\(emg\.points, emg\.range/.test(app) && /_sda && _sda\.mode === 'building'/.test(app));
ok('mobile paint wires SPEC.18', /_aurixStableDisplayAnchor\(emg\.points, r/.test(app) && /_sdaM && _sdaM\.mode === 'building'/.test(app));
ok('render calls keep emg.points verbatim', /renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/.test(app));
ok('never fabricates (syntheticPoints:0 in helper)', /syntheticPoints: 0/.test(fn('_aurixStableDisplayAnchor')));
ok('lineage audit exposes stableDisplayAnchor', /stableDisplayAnchor: stableDisplayAnchor,/.test(app));
ok('marker SPEC.18 present', /DSH\.CHART\.BOOTSTRAP-DISPLAY-SUPPRESSION\.18/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
