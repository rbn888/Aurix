'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-OVERNIGHT-CONTINUITY-harness — client-side inactivity continuity
// ════════════════════════════════════════════════════════════════════════════
// PROVEN (production): the backend writes gap-free snapshots every 15 min for every
// account, 24/7. The overnight break is CLIENT-SIDE in _aurixApplyRangeSourceAuthority:
// its 24H frontend-authority (RULE 1) excludes ALL backend points when
// feCount>=2 && feCoverage>=thr — but feCoverage = span(fe)/window = (max−min)/W is
// SPAN-based, NOT gap-aware. So two frontend points near the window edges (active last
// evening + reopened this evening) give feCoverage>=0.8 across a ~23h OVERNIGHT GAP,
// and RULE 1 drops the backend gap-fillers that would bridge it → broken 24H line.
// CONTRACT: when the frontend has an internal gap ≥ the real-gap floor that backend
// fills, RULE 1 must NOT strip those bridging backend points (keep them; a dense/
// healthy 24H and the isolated-backend false-return protection stay byte-identical).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length; const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } };

function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Set };
  vm.createContext(ctx);
  ['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT'].forEach(n => vm.runInContext(konstSrc(n), ctx));
  vm.runInContext('const _AURIX_CHART_CONTINUITY_UNIFICATION = true;', ctx);
  vm.runInContext('const _AURIX_CHART_SEGMENT_SOURCE_AUTHORITY = true;', ctx);
  vm.runInContext('const _AURIX_CHART_24H_COVERAGE_AWARE_AUTHORITY = true;', ctx);
  vm.runInContext(konstSrc('_AURIX_24H_COVERAGE_THR'), ctx);
  vm.runInContext(konstSrc('_AURIX_24H_MIN_BACKEND_POINTS'), ctx);
  vm.runInContext(fnSrc('_aurixRealGapFloorMs'), ctx);
  vm.runInContext(fnSrc('_aurixSourceFamily'), ctx);
  vm.runInContext(fnSrc('_aurixFrontendUsableInWindow'), ctx);
  vm.runInContext(fnSrc('_aurix24hSourceCoverage'), ctx);
  vm.runInContext(fnSrc('_aurixEnforceSegmentSourceAuthority'), ctx);
  vm.runInContext(fnSrc('_aurixApplyRangeSourceAuthority'), ctx);
  return ctx;
}
const ctx = mkCtx();
const auth = (src, r) => vm.runInContext('_aurixApplyRangeSourceAuthority', ctx)(src, r);

const HOUR = 36e5, MIN = 60000, NOW = 1_720_000_000_000;
const fe = (ts, v) => ({ ts, total: v, real_estate: 0, source: 'remote_canonical' });
const be = (ts, v) => ({ ts, total: v, real_estate: 0, source: 'backend_snapshot' });
const hasBackend = out => out.some(p => p.source === 'backend_snapshot');
const maxGapH = out => { const t = out.filter(p => Number.isFinite(p.ts)).map(p => p.ts).sort((a, b) => a - b); let g = 0; for (let i = 1; i < t.length; i++) g = Math.max(g, t[i] - t[i - 1]); return +(g / HOUR).toFixed(1); };
const subsetOf = (out, src) => out.every(p => src.indexOf(p) >= 0);   // no fabricated points (object identity)

console.log('\nAURIX-CHART-OVERNIGHT-CONTINUITY\n');

// ── Scenario DENSE (certified — must stay byte-identical: frontend authority, no backend) ──
(function () {
  const src = [];
  for (let m = 0; m <= 24 * 60; m += 15) src.push(fe(NOW - 24 * HOUR + m * MIN, 10000 + m));   // dense FE across 24h
  for (let m = 0; m <= 24 * 60; m += 15) src.push(be(NOW - 24 * HOUR + m * MIN, 9800 + (m % 40)));
  const out = auth(src, '24h');
  ok('1 dense 24H frontend keeps frontend authority (backend excluded) — certified unchanged', !hasBackend(out) && subsetOf(out, src));
})();

// ── Scenario OVERNIGHT GAP (the defect → must bridge with backend after fix) ──
// Active last evening (2h block), reopened this evening (1h block) — ~23h apart, big
// overnight gap; backend gap-free every 15 min across the whole 24h window.
function overnightSrc() {
  const src = [];
  for (let m = 0; m <= 120; m += 15) src.push(fe(NOW - 24 * HOUR + m * MIN, 10000 + m));   // last-evening FE block (edge of window)
  for (let m = 0; m <= 60; m += 15) src.push(fe(NOW - 60 * MIN + m * MIN, 10500 + m));      // this-evening FE block (now)
  for (let m = 0; m <= 24 * 60; m += 15) src.push(be(NOW - 24 * HOUR + m * MIN, 10100 + (m % 30)));  // gap-free backend
  return src;
}
(function () {
  const src = overnightSrc();
  const out = auth(src, '24h');
  // CONTRACT: the overnight hole between the two FE blocks must be bridged by surviving
  // backend gap-fillers → backend present AND no ~23h hole in the rendered series.
  ok('2 overnight backend gap-fillers SURVIVE 24H authority (line is bridged, not broken)',
    hasBackend(out) && maxGapH(out) <= 2, 'hasBackend=' + hasBackend(out) + ' maxGapH=' + maxGapH(out));
  ok('2b no fabricated points (every survivor is an original object)', subsetOf(out, src));
})();

// ── Scenario ISOLATED BACKEND (certified false-return protection — must stay) ──
// Dense frontend + ONE isolated stray backend point → backend must still be excluded
// so it can never become the first-plotted point and cross into a false return.
(function () {
  const src = [];
  for (let m = 0; m <= 24 * 60; m += 15) src.push(fe(NOW - 24 * HOUR + m * MIN, 10000 + m));   // dense FE (no gaps)
  src.push(be(NOW - 20 * HOUR, 9550));   // one isolated stale backend point inside a dense FE window
  const out = auth(src, '24h');
  ok('3 isolated stray backend point still excluded from dense 24H (false-return protection intact)', !hasBackend(out));
})();

// NOTE: long-range (7D/30D) backend continuity is governed by a DIFFERENT certified
// function (_aurixEnforceSegmentSourceAuthority, SPEC.38) — a separate exact condition,
// intentionally NOT changed by this minimal 24H patch. Tracked as the next exact fix.

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
