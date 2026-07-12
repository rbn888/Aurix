'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-UNIFIED-RENDER-FINISH-harness — SPEC DSH.CHART.UNIFIED_RENDER_FINISH.39
// ════════════════════════════════════════════════════════════════════════════
// The LAST per-range visual divergence lived in _wscRenderPolish: 30D/1Y/ALL got a thinner stroke (2.35 vs
// 2.7), weaker glow (1.55 vs 2.05) and a quieter area (0.62–0.84 vs 1.0) → the SAME geometry read as a
// different "engine". SPEC.39 unifies the ACABADO ONLY: with the flag ON every range resolves to ONE shared
// institutional finish (= 24H's proven values). 24H is byte-identical ON vs OFF; 30D/1Y/ALL adopt 24H's
// finish; flag OFF restores the exact legacy per-range table. This harness proves: 24H byte-identical, all
// long ranges == 24H finish under ON, exact legacy under OFF, single owner, and that ONLY finish attributes
// change — the geometry owners (downsample / X / Y / gaps / path / curvature) are NOT referenced by the fix.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing ' + n); return braceSlice(app, i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length; const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// Build a sandbox with the flag ON and one with the flag OFF (legacy). Only the flag const differs.
function mkCtx(flagOn) {
  const ctx = { console: { log() {} }, Math, JSON, Number, isFinite, window: { devicePixelRatio: 2 } };
  vm.createContext(ctx);
  vm.runInContext('const _AURIX_CHART_UNIFIED_RENDER_FINISH = ' + (flagOn ? 'true' : 'false') + ';', ctx);
  vm.runInContext(konstSrc('_AURIX_UNIFIED_FINISH'), ctx);
  vm.runInContext(fnSrc('_wscRenderPolish'), ctx);
  return ctx;
}
const ON = mkCtx(true), OFF = mkCtx(false);
const polish = (ctx, r, mobile, tone) => vm.runInContext('_wscRenderPolish', ctx)(r, mobile, tone);
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const finishKeys = ['strokeWidth', 'glowStrength', 'glowAlpha', 'areaOpacity', 'renderPolishMode'];
const pick = o => finishKeys.reduce((a, k) => (a[k] = o[k], a), {});
const eq = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));

console.log('\nAURIX-CHART-UNIFIED-RENDER-FINISH — SPEC.39');

// ── 1 marker + flag + single owner ───────────────────────────────────────────
ok('1 SPEC.39 marker present', app.indexOf('UNIFIED_RENDER_FINISH.39') >= 0);
ok('1 flag _AURIX_CHART_UNIFIED_RENDER_FINISH defined + true (live)', /const _AURIX_CHART_UNIFIED_RENDER_FINISH = true;/.test(app));
ok('1 single _wscRenderPolish owner', (app.match(/^function _wscRenderPolish\(/gm) || []).length === 1);
ok('1 shared config _AURIX_UNIFIED_FINISH present', /const _AURIX_UNIFIED_FINISH = \{/.test(app));

// ── 2 24H byte-identical ON vs OFF (desktop + mobile, up/down/flat) ───────────
(function () {
  let allEq = true, detail = '';
  [false, true].forEach(mob => ['up', 'down', 'flat'].forEach(tone => {
    const a = polish(ON, '24h', mob, tone), b = polish(OFF, '24h', mob, tone);
    // FULL object identity (every returned key), not just finish subset — 24H must be untouched.
    if (JSON.stringify(a) !== JSON.stringify(b)) { allEq = false; detail = 'mob=' + mob + ' tone=' + tone + ' ON=' + JSON.stringify(a) + ' OFF=' + JSON.stringify(b); }
  }));
  ok('2 24H byte-identical ON vs OFF (all surfaces/tones, full object)', allEq, detail);
})();

// ── 3 7D unchanged (already sat at 24H finish under legacy) ──────────────────
(function () {
  let allEq = true;
  [false, true].forEach(mob => { if (JSON.stringify(polish(ON, '7d', mob, 'up')) !== JSON.stringify(polish(OFF, '7d', mob, 'up'))) allEq = false; });
  ok('3 7D byte-identical ON vs OFF (already institutional)', allEq);
})();

// ── 4 with flag ON, EVERY long range resolves to the SAME finish as 24H ──────
(function () {
  [false, true].forEach(mob => {
    const ref = polish(ON, '24h', mob, 'up');
    ['7d', '30d', '1y', 'all'].forEach(r => {
      ok('4 ' + r + (mob ? ' (mobile)' : ' (desktop)') + ' finish == 24H finish (flag ON)', eq(polish(ON, r, mob, 'up'), ref),
        'r=' + JSON.stringify(pick(polish(ON, r, mob, 'up'))) + ' 24h=' + JSON.stringify(pick(ref)));
    });
  });
})();

// ── 5 flag OFF restores the EXACT legacy per-range table ─────────────────────
(function () {
  // legacy desktop expectations (from the frozen table)
  const legacyDesktop = {
    '24h': { strokeWidth: 2.7, glowStrength: 2.05, areaOpacity: 1, renderPolishMode: 'sharp-intraday' },
    '7d':  { strokeWidth: 2.7, glowStrength: 2.05, areaOpacity: 1, renderPolishMode: 'sharp-intraday' },
    '30d': { strokeWidth: 2.35, glowStrength: 1.55, areaOpacity: +Math.min(1, 0.84 * 1.10).toFixed(3), renderPolishMode: 'institutional-smooth' },
    '1y':  { strokeWidth: 2.35, glowStrength: 1.55, areaOpacity: +Math.min(1, 0.72 * 1.10).toFixed(3), renderPolishMode: 'institutional-smooth' },
    'all': { strokeWidth: 2.35, glowStrength: 1.55, areaOpacity: +Math.min(1, 0.62 * 1.10).toFixed(3), renderPolishMode: 'institutional-smooth' },
  };
  let allOk = true, detail = '';
  RANGES.forEach(r => {
    const o = polish(OFF, r, false, 'up'), e = legacyDesktop[r];
    Object.keys(e).forEach(k => { if (o[k] !== e[k]) { allOk = false; detail = r + '.' + k + ' got ' + o[k] + ' want ' + e[k]; } });
  });
  ok('5 flag OFF == exact legacy per-range table (desktop)', allOk, detail);
})();

// ── 6 long-range finish ACTUALLY CHANGED ON vs OFF (the intended visual fix) ─
(function () {
  let changed = true, detail = '';
  ['30d', '1y', 'all'].forEach(r => {
    const a = polish(ON, r, false, 'up'), b = polish(OFF, r, false, 'up');
    if (eq(a, b)) { changed = false; detail = r + ' finish did not change'; }
    // and it must now MATCH 24H
    if (!eq(a, polish(ON, '24h', false, 'up'))) { changed = false; detail = r + ' != 24H under ON'; }
  });
  ok('6 30D/1Y/ALL finish changed ON vs OFF AND now equals 24H', changed, detail);
})();

// ── 7 unified stroke/glow/area/mode values are exactly 24H's proven values ───
(function () {
  const d = polish(ON, 'all', false, 'up'), m = polish(ON, 'all', true, 'up');
  ok('7 desktop unified: stroke 2.7 / glow 2.05 / area 1 / sharp-intraday',
    d.strokeWidth === 2.7 && d.glowStrength === 2.05 && d.areaOpacity === 1 && d.renderPolishMode === 'sharp-intraday',
    JSON.stringify(pick(d)));
  ok('7 mobile unified: stroke 2.4 / glow 1.74 / area 1 / sharp-intraday',
    m.strokeWidth === 2.4 && m.glowStrength === 1.74 && m.areaOpacity === 1 && m.renderPolishMode === 'sharp-intraday',
    JSON.stringify(pick(m)));
})();

// ── 8 glowAlpha is preserved (range-independent; DPR + down-tone only) ───────
(function () {
  // down tone must still soften ×0.80, identical ON vs OFF and across ranges
  const upOn = polish(ON, 'all', false, 'up').glowAlpha, downOn = polish(ON, 'all', false, 'down').glowAlpha;
  const upOff = polish(OFF, 'all', false, 'up').glowAlpha;
  ok('8 glowAlpha down < up (soft red preserved)', downOn < upOn);
  ok('8 glowAlpha identical ON vs OFF (not touched by SPEC.39)', upOn === upOff);
  let sameAcrossRanges = true; RANGES.forEach(r => { if (polish(ON, r, false, 'up').glowAlpha !== upOn) sameAcrossRanges = false; });
  ok('8 glowAlpha range-independent', sameAcrossRanges);
})();

// ── 9 fix is PURELY visual — the geometry/data owners are NOT referenced here ─
(function () {
  const src = fnSrc('_wscRenderPolish');
  const forbidden = ['downsampleAurixAdaptive', 'computeAurixAdaptiveXScale', 'computeAurixValueScale',
    '_aurixMonotonePath', '_aurixStructuralBreaks', 'buildProductionPortfolioChart', '_aurixResolveFinalRenderSeriesContract',
    'renderPoints', 'syntheticPoints', 'returnPct', 'badgeReturnPct', '.points', 'emg.', 'timestamp'];
  const hit = forbidden.filter(t => src.indexOf(t) >= 0);
  ok('9 _wscRenderPolish references NO geometry/data/return owner (pure finish)', hit.length === 0, 'refs: ' + hit.join(','));
  // Strip line comments, then assert the returned object exposes ONLY finish attributes (no points/ts/values).
  const code = src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const retKeys = ['visualFinishApplied', 'visualFinishFinalApplied', 'strokeWidth', 'glowStrength', 'glowAlpha', 'areaOpacity', 'desktopAreaOpacity', 'redStateGlowStrength', 'devicePixelRatio', 'renderPolishMode'];
  const retMatch = /return \{([\s\S]*?)\};/.exec(code);
  const retBody = retMatch ? retMatch[1] : '';
  const bad = /\b(points|timestamps|renderPoints|renderPath|badgeReturnPct|returnPct)\b/.test(retBody);
  ok('9 _wscRenderPolish return exposes only finish attributes (no points/ts/return)', retBody.length > 0 && !bad, 'ret=' + retBody.replace(/\s+/g, ' ').trim().slice(0, 120));
})();

// ── 10 dead-code engine untouched (SPEC scope: do NOT refactor) ──────────────
ok('10 _wscPaintSurface still present (not removed)', app.indexOf('function _wscPaintSurface(') >= 0);
ok('10 _wscResample/_wscMovingAvg/_wscActivityWeights still present (not removed)',
  app.indexOf('_wscResample') >= 0 && app.indexOf('_wscMovingAvg') >= 0 && app.indexOf('_wscActivityWeights') >= 0);
ok('10 emergency painter still delegated first (dead-code guard intact)', /if \(_wscPaintEmergency\(changeEl, hostEl, opts\)\) return;/.test(app));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.39 UNIFIED-RENDER-FINISH — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
