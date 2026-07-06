'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-VISUAL-TRUST-GATE-harness — SPEC DSH.CHART.VISUAL-TRUST-GATE.17
// ════════════════════════════════════════════════════════════════════════════
// The visual trust gate removes disconnected INITIAL islands from the drawn line for EVERY range (incl 24H):
// when there is more than one real visual segment it keeps only the recent MAIN segment (small earlier
// islands dropped, never bridged; LARGE legitimate earlier clusters preserved for SPEC.13). If the main is
// not trustworthy (too few points / too brief) it renders nothing → premium building. Never fabricates a
// point (syntheticPoints=0). GATE OFF (flag absent) = v498 passthrough. Tests _aurixVisualTrustGate directly.
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
  vm.runInContext(konst('_AURIX_VTG_MIN_MAIN_PTS'), ctx);
  vm.runInContext(konst('_AURIX_VTG_MIN_MAIN_SPAN_MS'), ctx);
  if (withFlag) vm.runInContext(konst('_AURIX_CHART_VISUAL_TRUST_GATE'), ctx);   // absent ⇒ GATE OFF
  vm.runInContext(fn('_aurixVisualTrustGate'), ctx);
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const gate = (ctx, pts, r) => vm.runInContext('_aurixVisualTrustGate', ctx)(pts, r);
function seg(t0, n, stepMs, v0, dv) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: t0 + i * stepMs, value: +(v0 + i * dv).toFixed(2) }); return o; }
const subsetOf = (out, input) => out.every(p => input.some(q => q.ts === p.ts && q.value === p.value));

console.log('AURIX-CHART-VISUAL-TRUST-GATE — SPEC DSH.CHART.VISUAL-TRUST-GATE.17\n');

// ── 1. 24H island + main → island disappears ──
console.log('1. 24H left island + main → island removed, main only:');
{
  const pts = [].concat(seg(T0 - 20 * HOUR, 2, 30 * MIN, 9500, 1), seg(T0 - 6 * HOUR, 30, 30 * MIN / 2.4, 9000, 2));
  const on = gate(ON, pts, '24h');
  ok('mode line (main drawn)', on.mode === 'line', on.reason);
  ok('island dropped (droppedSegmentCount ≥1)', on.droppedSegmentCount >= 1, 'dropped=' + on.droppedSegmentCount);
  ok('rendered points = main cluster (30)', on.points.length === 30, 'n=' + on.points.length);
  ok('island NOT in output (first point ≥ main start)', on.points[0].ts >= T0 - 6 * HOUR);
  ok('no synthetic / subset of input', subsetOf(on.points, pts) && on.syntheticPoints === 0);
}

// ── 2. 2 initial islands + main in 7D/30D/1Y/ALL → only main ──
console.log('\n2. 2 initial islands + main in 7D/30D/1Y/ALL → main only:');
{
  const pts = [].concat(seg(T0 - 6 * DAY, 2, 6 * HOUR, 9500, -1), seg(T0 - 4 * DAY, 2, 6 * HOUR, 9480, 1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  ['7d', '30d', '1y', 'all'].forEach(r => { const on = gate(ON, pts, r); ok(r + ': main only (40), all initial islands dropped', on.mode === 'line' && on.points.length === 40 && on.droppedSegmentCount >= 2 && on.points[0].ts >= T0 - 1 * DAY, r + ' n=' + on.points.length + ' dropped=' + on.droppedSegmentCount); });
}

// ── 3. mature multi-segment real (large clusters) → NO regression (both kept) ──
console.log('\n3. Mature real multi-segment (large clusters) → preserved, not dropped:');
{
  const pts = [].concat(seg(T0 - 20 * DAY, 20, 6 * HOUR, 8000, 2), seg(T0 - 2 * DAY, 30, HOUR, 9000, 1));
  const on = gate(ON, pts, '1y');
  ok('both clusters kept (50 pts)', on.points.length === 50 && on.droppedSegmentCount === 0, 'n=' + on.points.length + ' dropped=' + on.droppedSegmentCount);
  ok('reason = multi_segment_legit_preserved', /multi_segment_legit_preserved/.test(on.reason), on.reason);
}

// ── 4. large real gap → not falsely joined (both kept, no bridge) ──
console.log('\n4. Large real gap between two substantial clusters → segmented, not bridged:');
{
  const pts = [].concat(seg(T0 - 25 * DAY, 15, 6 * HOUR, 9000, 1), seg(T0 - 1 * DAY, 20, HOUR, 9100, 1));
  const on = gate(ON, pts, '30d');
  ok('both clusters preserved (35 pts)', on.points.length === 35 && on.droppedSegmentCount === 0);
  ok('segmentCount ≥ 2 (real gap kept)', on.segmentCount >= 2, 'segs=' + on.segmentCount);
  ok('no synthetic points', subsetOf(on.points, pts) && on.syntheticPoints === 0);
}

// ── 5. real deposit as MAIN legit tramo → not deleted ──
console.log('\n5. Real deposit segments (large pre + large post) → legit main preserved:');
{
  // app closed (time gap) then reopened after a deposit: pre-deposit 15pts + gap + post-deposit 20pts (higher value)
  const pts = [].concat(seg(T0 - 6 * DAY, 15, 6 * HOUR, 9000, 1), seg(T0 - 1 * DAY, 20, HOUR, 14000, 2));
  const on = gate(ON, pts, '7d');
  ok('legit pre-deposit cluster NOT deleted (35 pts kept)', on.points.length === 35 && on.droppedSegmentCount === 0, 'n=' + on.points.length);
}

// ── 6. GATE OFF passthrough (v498) ──
console.log('\n6. GATE OFF = passthrough (no gate):');
{
  const pts = [].concat(seg(T0 - 20 * HOUR, 2, 30 * MIN, 9500, 1), seg(T0 - 6 * HOUR, 30, 30 * MIN, 9000, 2));
  const off = gate(OFF, pts, '24h');
  ok('mode line, all points kept', off.mode === 'line' && off.points.length === pts.length);
  ok('droppedSegmentCount 0', off.droppedSegmentCount === 0);
}

// ── 7. building when main not trustworthy ──
console.log('\n7. Main segment not trustworthy → building (no line):');
{
  // island(3) + gap + tiny recent main (3 pts over 5 min < 15min span)
  const pts = [].concat(seg(T0 - 4 * DAY, 3, 30 * MIN, 9500, 1), seg(T0 - 10 * MIN, 3, 2 * MIN, 9000, 1));
  const on = gate(ON, pts, '7d');
  ok('mode building', on.mode === 'building', on.reason);
  ok('no line points', on.points.length === 0);
  // island + main of only 2 points → building (min pts 3)
  const pts2 = [].concat(seg(T0 - 4 * DAY, 3, 30 * MIN, 9500, 1), seg(T0 - 3 * HOUR, 2, 30 * MIN, 9000, 1));
  ok('island + 2-pt main → building', gate(ON, pts2, '7d').mode === 'building');
}

// ── 8. single segment mature dense → passthrough unchanged ──
console.log('\n8. Single dense segment (mature) → passthrough:');
{
  const pts = seg(T0 - 20 * HOUR, 120, 10 * MIN, 9000, 0.5);
  const on = gate(ON, pts, '24h');
  ok('mode line, all kept, 1 segment', on.mode === 'line' && on.points.length === pts.length && on.segmentCount === 1);
  ok('reason single_segment_passthrough', on.reason === 'single_segment_passthrough');
}

// ── 9. syntheticPoints 0 + input not mutated + monotonic ──
console.log('\n9. Invariants:');
{
  const pts = [].concat(seg(T0 - 6 * DAY, 2, 6 * HOUR, 9500, -1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  const before = JSON.stringify(pts);
  const on = gate(ON, pts, '7d');
  ok('syntheticPoints 0', on.syntheticPoints === 0);
  ok('input not mutated', JSON.stringify(pts) === before);
  ok('output monotonic in ts', on.points.every((p, i) => i === 0 || p.ts > on.points[i - 1].ts));
}

// ── 10. determinism ──
console.log('\n10. Deterministic:');
{
  const pts = [].concat(seg(T0 - 6 * DAY, 2, 6 * HOUR, 9500, -1), seg(T0 - 4 * DAY, 2, 6 * HOUR, 9480, 1), seg(T0 - 1 * DAY, 40, 30 * MIN, 9000, 2));
  const sig = o => o.mode + '|' + o.points.length + '|' + o.droppedSegmentCount + '|' + o.reason;
  ok('same input → same result', sig(gate(ON, pts, '7d')) === sig(gate(ON, pts.slice(), '7d')));
}

console.log('\n=== SOURCE CONTRACT ===');
ok('reversible flag present', /const _AURIX_CHART_VISUAL_TRUST_GATE = true;/.test(app));
ok('helper defined + exported', /function _aurixVisualTrustGate/.test(app) && /window\._aurixVisualTrustGate =/.test(app));
ok('applies to ALL ranges (no 24h exemption in the gate)', !/if \(r === '24h'\) \{ out\.reason/.test(fn('_aurixVisualTrustGate')));
ok('desktop paint wires the gate + building', /_aurixVisualTrustGate\(emg\.points, emg\.range\)/.test(app) && /_vtg && _vtg\.mode === 'building'/.test(app));
ok('mobile paint wires the gate + building', /_aurixVisualTrustGate\(emg\.points, r\)/.test(app) && /_vtgM && _vtgM\.mode === 'building'/.test(app));
ok('render calls keep emg.points verbatim', /renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/.test(app));
ok('never fabricates (syntheticPoints:0 in helper)', /syntheticPoints: 0/.test(fn('_aurixVisualTrustGate')));
ok('large legitimate earlier cluster preserved (fragMax gate)', /large legitimate earlier cluster/.test(app));
ok('lineage audit exposes visualTrustGate', /visualTrustGate: visualTrustGate,/.test(app));
ok('marker SPEC.17 present', /DSH\.CHART\.VISUAL-TRUST-GATE\.17/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
