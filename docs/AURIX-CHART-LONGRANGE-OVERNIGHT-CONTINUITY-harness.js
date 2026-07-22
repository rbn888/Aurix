'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-LONGRANGE-OVERNIGHT-CONTINUITY-harness — 7D/30D inactivity continuity
// ════════════════════════════════════════════════════════════════════════════
// PROVEN (production): backend writes gap-free snapshots every 15 min for every account.
// DEFECT: _aurixEnforceSegmentSourceAuthority split runs on the MERGED (backend-filled)
// series, so a genuine FRONTEND gap (days of inactivity) was hidden by the backend
// fillers → the whole span became ONE run containing frontend → ALL backend dropped
// ("frontend owns the segment") → the frontend-only series re-opened the multi-day hole
// → 7D/30D discontinuous / "Historial parcial".
// CONTRACT: a backend point must SURVIVE when it lies in a GENUINE frontend gap ≥ the
// real-gap floor (it bridges a real hole); it is dropped ONLY where frontend is dense
// around it (both bracketing frontend points < floor apart) — preserving the certified
// SPEC.38 behaviour (interior interlopers dropped; tails/own-segments kept).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length; const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } };

const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, Infinity, Array, Object, String, Set };
vm.createContext(ctx);
['_AURIX_VP_GAP_FLOOR_MS', '_AURIX_VP_GAP_MEDIAN_MULT'].forEach(n => vm.runInContext(konstSrc(n), ctx));
vm.runInContext('const _AURIX_CHART_SEGMENT_SOURCE_AUTHORITY = true;', ctx);
vm.runInContext(fnSrc('_aurixRealGapFloorMs'), ctx);
vm.runInContext(fnSrc('_aurixSourceFamily'), ctx);
vm.runInContext(fnSrc('_aurixEnforceSegmentSourceAuthority'), ctx);
const enforce = (src, r) => vm.runInContext('_aurixEnforceSegmentSourceAuthority', ctx)(src, r);

const HOUR = 36e5, DAY = 864e5, T0 = 1_700_000_000_000;
const fe = (ts, v) => ({ ts, total: v, real_estate: 0, source: 'remote_canonical' });
const be = (ts, v) => ({ ts, total: v, real_estate: 0, source: 'backend_snapshot' });
const beCount = out => out.filter(p => p.source === 'backend_snapshot').length;
const feCount = out => out.filter(p => p.source !== 'backend_snapshot').length;
const subsetOf = (out, src) => out.every(p => src.indexOf(p) >= 0);   // no fabricated points (object identity)

console.log('\nAURIX-CHART-LONGRANGE-OVERNIGHT-CONTINUITY\n');

// 7D: frontend active days 0–1, INACTIVE days 1–6 (≥2d hole; backend fills every 6h), active days 6–7.
function longGapSrc() {
  const src = [];
  for (let h = 0; h <= 24; h += 6) src.push(fe(T0 + h * HOUR, 1000 + h));                 // day 0–1 frontend
  for (let h = 30; h <= 6 * 24 - 6; h += 6) src.push(be(T0 + h * HOUR, 1050 + (h % 20)));  // days 1–6 backend fillers (frontend hole)
  for (let h = 6 * 24; h <= 7 * 24; h += 6) src.push(fe(T0 + h * HOUR, 1080 + h));         // day 6–7 frontend
  return src;
}
(function () {
  const src = longGapSrc();
  const out = enforce(src, '7d');
  const bridged = out.filter(p => p.source === 'backend_snapshot' && p.ts > T0 + 24 * HOUR && p.ts < T0 + 6 * 24 * HOUR).length;
  ok('1 backend fillers in the ≥2d frontend hole SURVIVE (7D bridged, not partial)', bridged >= 5, 'bridgedBackend=' + bridged);
  ok('1b every frontend point survives', feCount(out) === feCount(src));
  ok('1c no fabricated points', subsetOf(out, src));
})();

// 30D: frontend active, then a genuine ≥7d frontend hole (backend fills), then active.
(function () {
  const src = [];
  for (let d = 0; d <= 2; d++) src.push(fe(T0 + d * DAY, 5000 + d));                        // days 0–2 frontend
  for (let d = 3; d <= 11; d++) src.push(be(T0 + d * DAY + HOUR, 5100 + d));                // days 3–11 backend (≥7d hole)
  for (let d = 12; d <= 14; d++) src.push(fe(T0 + d * DAY, 5200 + d));                       // days 12–14 frontend
  const out = enforce(src, '30d');
  const bridged = out.filter(p => p.source === 'backend_snapshot' && p.ts > T0 + 2 * DAY && p.ts < T0 + 12 * DAY).length;
  ok('2 backend fillers in the ≥7d frontend hole SURVIVE (30D genuine history)', bridged >= 5, 'bridgedBackend=' + bridged);
})();

// ── Certified SPEC.38 behaviour must be preserved (mirrors ELIMINATE-SOURCE-ALTERNATION) ──
(function () {
  // 3 interior backend inside a DENSE frontend segment (6h apart, < 2d floor) ⇒ DROPPED.
  const src = [fe(T0, 1000), be(T0 + 6 * HOUR, 1080), fe(T0 + 12 * HOUR, 1010), be(T0 + 18 * HOUR, 1075), fe(T0 + 24 * HOUR, 1015)];
  const out = enforce(src, '7d');
  ok('3 interior backend in a dense frontend segment still DROPPED (SPEC.38 preserved)', beCount(out) === 0 && feCount(out) === 3);
})();
(function () {
  // 4 backend-only tail ≥floor before frontend ⇒ KEPT as its own segment.
  const src = [be(T0 - 6 * DAY, 900), be(T0 - 5.5 * DAY, 905), fe(T0, 1000), fe(T0 + 6 * HOUR, 1005), fe(T0 + 12 * HOUR, 1010)];
  const out = enforce(src, '7d');
  ok('4 backend-only tail (≥floor from frontend) still KEPT (SPEC.38 preserved)', beCount(out) === 2 && feCount(out) === 3);
})();
(function () {
  // 5 no backend ⇒ strict NO-OP (identity).
  const src = [fe(T0, 1000), fe(T0 + 6 * HOUR, 1010)];
  ok('5 no-backend src returned unchanged (identity)', enforce(src, '30d') === src);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
