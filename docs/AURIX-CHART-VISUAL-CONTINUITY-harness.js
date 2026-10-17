'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-VISUAL-CONTINUITY-harness — FASE 3 · continuidad visual premium
// ════════════════════════════════════════════════════════════════════════════
// Certifica, sobre el pipeline REAL (replay-lib: fuente → FRC, sin stubs) y el renderer de producción
// (`renderValidatedPortfolioChartWithInstitutionalRenderer`, bytes de app.js), las dos piezas de la fase:
//   A. 24H con sesión densa del cliente: el trazo deja de ser un pegote (envolvente por columna), sin
//      perder primero/último/mín/máx ni la altura de ninguna columna, y dibujando sólo puntos REALES.
//   B. Laguna real: los tramos quedan unidos por un enlace recto y discontinuo entre observaciones reales;
//      sin enlace cuando la serie es continua; el tooltip (visiblePoints) no gana ningún punto.
//   C. Nada más cambia: cadencia normal y resto de rangos byte-idénticos; %, badge y color idénticos.
// Cada aserción discrimina: el mismo escenario con `_AURIX_24H_DRAWN_THINNING = false` reproduce el defecto.
const vm = require('vm'), fs = require('fs'), path = require('path');
const lib = require('./_aurix-chart-replay-lib.cjs');
const APP = fs.readFileSync(path.join(lib.ROOT, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(lib.ROOT, 'styles.css'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const NOW = 1_800_000_000_000, DAY = 864e5, M15 = 9e5;
const RENDER_FNS = ['renderValidatedPortfolioChartWithInstitutionalRenderer', '_aurixThinDrawn24h', 'computeAurixTimeScale', '_aurixVpTargetPointCount',
  'downsampleAurixAdaptive', 'downsampleAurixLTTB', '_aurixSignificantLocalExtrema', '_aurixRenderBucketPolicyOn', '_aurixRenderBucketReduce',
  'computeAurixAdaptiveXScale', 'computeAurixValueScale', '_aurixMonotonePath', 'buildAurixAreaPath', '_aurixSplitAtGaps', '_aurixStructuralBreaks',
  '_aurixBuildContinuityValidatedSeries', '_aurixConfirmedBridgeGaps', '_aurixCapitalStepBreaks', '_aurixSparseRampBreaks'];
const RENDER_CONSTS = ['_AURIX_24H_DRAWN_THINNING', '_AURIX_RENDER_SPACING_BY_RANGE', '_AURIX_IR_VALUE_MARGIN', '_AURIX_RC_ASPECT', '_AURIX_RC_PAD_FRAC',
  '_AURIX_UNIFIED_VP_DENSITY', '_AURIX_CHART_UNIFIED_REAL_POINT_DENSITY', '_AURIX_VP_DENSITY', '_AURIX_RENDER_BUCKET_ENABLED', '_AURIX_RENDER_BUCKET_CLOSE_FRAC',
  '_AURIX_RENDER_BUCKET_PROM_FRAC', '_AURIX_RENDER_BUCKET_EXEMPT_RANGES', '_AURIX_X_FILL_BETA', '_AURIX_UNIFIED_X_FILL_BETA', '_AURIX_CHART_UNIFIED_X_PROJECTION_POLICY',
  '_AURIX_Y_JUMP_DOMINANCE', '_AURIX_Y_LEGIBLE_ALPHA', '_AURIX_CHART_CONTINUITY_UNIFICATION', '_AURIX_ORPHAN_CLEANUP_ENABLED', '_AURIX_ORPHAN_MAX_PTS'];

// Serie con la forma real de producción: 1 fila/día > 35 d (retención), 15 min dentro de 35 d (cron),
// sesiones del cliente a 1 min con la alternancia de cotización, y huecos de 48 h cuando se pide.
function series(o) {
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const rows = []; let v = 50000;
  for (let t = NOW - 400 * DAY; t <= NOW; ) {
    const age = NOW - t, step = age > 35 * DAY ? DAY : M15, dd = step / DAY;
    v *= 1 + 0.0002 * dd + 0.012 * Math.sqrt(dd) * gauss();
    const hole = o.gaps && age < 35 * DAY && (Math.floor(age / DAY) % 7) < 2;
    if (!hole) rows.push({ ts: t, total: +v.toFixed(2), real_estate: 0, source: 'server' });
    if ((o.sessions && age < 3 * DAY && age > M15 && (Math.floor(age / 36e5) % 9) === 0) || (o.live && age === M15)) {
      for (let k = 1; k < 15; k++) rows.push({ ts: t + k * 6e4, total: +(v * (1 + 0.0015 * (k % 2 ? 1 : -1) + 0.0005 * gauss())).toFixed(2), real_estate: 0, source: 'frontend' });
    }
    t += step;
  }
  return rows.sort((a, b) => a.ts - b.ts);
}
const MBOX = { left: 14, right: 900, top: 24, bottom: 236 };   // caja móvil de producción (viewBox 1000×260)
const _runs = new Map();   // cada escenario se construye una sola vez
function run(o, thinningOn) {
  const key = JSON.stringify(o) + thinningOn;
  if (!_runs.has(key)) _runs.set(key, build(o, thinningOn));
  return _runs.get(key);
}
function build(o, thinningOn) {
  const ctx = lib.newSession({ now: NOW });
  if (!thinningOn) vm.runInContext('const _AURIX_24H_DRAWN_THINNING = false;', ctx);
  for (const c of RENDER_CONSTS) { try { vm.runInContext(lib.constSrc(c), ctx); } catch (e) { if (!/already been declared/.test(e.message)) throw e; } }
  for (const f of RENDER_FNS) { try { vm.runInContext(lib.fnSrc(f), ctx); } catch (e) { if (!/already been declared/.test(e.message)) throw e; } }
  const rows = series(o);
  lib.setTruth(ctx, { remote: rows, backend: rows, local: rows.slice(-200) });
  lib.setHydration(ctx, 'ready');
  const out = {};
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const st = lib.stages(ctx, r, 'mobile');
    ctx.__pts = (st.__frc.renderPoints || []).map(p => ({ ts: p.time != null ? p.time : p.ts, value: p.value }));
    ctx.__box = MBOX;
    const rc = lib.call(ctx, `renderValidatedPortfolioChartWithInstitutionalRenderer(__pts, { range: '${r}', vw: 1000, vh: 260, box: __box })`);
    out[r] = { rc, input: ctx.__pts, ret: st.__emg.returnPct, badge: st.S7_plotted.badgeEligible, color: st.S7_plotted.colorState };
  }
  return out;
}
// Vértices dibujados y máximo de cambios de dirección en una ventana de 20 px CSS (móvil ≈ 0,34 px/viewBox).
function geometry(d) {
  const v = []; const re = /([MLC])([^MLC]*)/g; let m;
  while ((m = re.exec(d))) { const a = m[2].trim().split(/[\s,]+/).map(Number); v.push(m[1] === 'C' ? [a[4] * 0.34, a[5]] : [a[0] * 0.34, a[1]]); }
  let maxRev = 0;
  for (let i = 0; i < v.length; i++) {
    let rev = 0;
    for (let j = i + 2; j < v.length && v[j][0] - v[i][0] <= 20; j++) if ((v[j - 1][1] - v[j - 2][1]) * (v[j][1] - v[j - 1][1]) < 0) rev++;
    maxRev = Math.max(maxRev, rev);
  }
  return { vertices: v.length, maxRev };
}
const vals = a => a.map(p => p.value);

console.log('AURIX-CHART-VISUAL-CONTINUITY');
const BASE = geometry(run({}, true)['24h'].rc.linePath).maxRev;   // textura de la cadencia normal de 15 min
// ── A. 24H con sesión densa ─────────────────────────────────────────────────
for (const [name, o] of [['sesiones previas', { sessions: true }], ['sesión ACTUAL (borde derecho)', { live: true }]]) {
  const off = run(o, false)['24h'], on = run(o, true)['24h'];
  const gOff = geometry(off.rc.linePath), gOn = geometry(on.rc.linePath);
  ok(`A1 ${name}: el defecto existe sin el cambio (giros/20px ${gOff.maxRev} > 2× base ${BASE})`, gOff.maxRev > 2 * BASE, JSON.stringify(gOff));
  ok(`A2 ${name}: el pegote desaparece (giros/20px ${gOff.maxRev} → ${gOn.maxRev} ≤ 2× base, vértices ${gOff.vertices} → ${gOn.vertices})`, gOn.maxRev <= 2 * BASE && gOn.vertices < gOff.vertices, JSON.stringify(gOn));
  const inT = new Map(on.input.map(p => [p.ts, p.value]));
  ok(`A3 ${name}: sólo se dibujan puntos REALES (subconjunto exacto de la serie)`, on.rc.visiblePoints.every(p => inT.get(p.time) === p.value));
  const iv = vals(on.input), ov = vals(on.rc.visiblePoints);
  ok(`A4 ${name}: primero, último, mínimo y máximo intactos`, on.rc.visiblePoints[0].time === on.input[0].ts && on.rc.visiblePoints.at(-1).time === on.input.at(-1).ts
    && Math.min(...ov) === Math.min(...iv) && Math.max(...ov) === Math.max(...iv));
  // ninguna columna pierde altura: el mín y máx de cada columna de 8 viewBox (tiempo real) sobreviven
  const t0 = on.input[0].ts, span = on.input.at(-1).ts - t0, colW = (MBOX.right - MBOX.left);
  const col = ts => Math.floor((MBOX.left + ((ts - t0) / span) * colW) / 8);
  const env = (pts, key) => { const m = new Map(); pts.forEach(p => { const c = col(p[key]); const e = m.get(c) || [Infinity, -Infinity]; m.set(c, [Math.min(e[0], p.value), Math.max(e[1], p.value)]); }); return m; };
  const eIn = env(on.input, 'ts'), eOut = env(on.rc.visiblePoints, 'time');
  ok(`A5 ${name}: la envolvente de cada columna es la real (ningún movimiento pierde altura)`, [...eIn].every(([c, e]) => eOut.has(c) && eOut.get(c)[0] === e[0] && eOut.get(c)[1] === e[1]));
  ok(`A6 ${name}: %, badge y color idénticos`, on.ret === off.ret && on.badge === off.badge && on.color === off.color);
}
// ── B. Laguna real ──────────────────────────────────────────────────────────
{
  const g = run({ gaps: true }, true);
  for (const r of ['30d', '1y']) {
    const rc = g[r].rc, links = (rc.gapLinkPath.match(/M /g) || []).length;
    ok(`B1 ${r}: un enlace por laguna (${rc.segmentCount} tramos → ${links} enlaces)`, rc.segmentCount >= 2 && links === rc.segmentCount - 1);
    // cada enlace une el último punto real de un tramo con el primero del siguiente, en línea RECTA
    const segs = rc.linePath.split(/(?=M )/).map(s => s.trim()).filter(Boolean);
    const ends = segs.map(s => { const n = s.match(/-?\d+(?:\.\d+)?/g).map(Number); return { first: [n[0], n[1]], last: [n[n.length - 2], n[n.length - 1]] }; });
    const lk = rc.gapLinkPath.split(/(?=M )/).map(s => s.match(/-?\d+(?:\.\d+)?/g).map(Number));
    ok(`B2 ${r}: enlaces rectos entre observaciones reales de tramos contiguos`, lk.every((n, i) => n.length === 4 && /^M [^LC]+ L [^LC]+$/.test(rc.gapLinkPath.split(/(?=M )/)[i].trim())
      && n[0] === ends[i].last[0] && n[1] === ends[i].last[1] && n[2] === ends[i + 1].first[0] && n[3] === ends[i + 1].first[1]));
    const ga = rc.gapAreaPath.split(/(?=M )/).map(x => x.match(/-?\d+(?:\.\d+)?/g).map(Number));
    ok(`B2b ${r}: relleno atenuado bajo cada enlace (mismo trazo recto, cerrado a la base)`, ga.length === lk.length && ga.every((n, i) => n.length === 8
      && n[0] === lk[i][0] && n[1] === lk[i][1] && n[2] === lk[i][2] && n[3] === lk[i][3] && n[5] === n[7] && n[5] >= Math.max(n[1], n[3])));
    const inT = new Set(g[r].input.map(p => p.ts));
    ok(`B3 ${r}: el tooltip no gana puntos (visiblePoints ⊂ observaciones)`, rc.visiblePoints.every(p => inT.has(p.time)));
  }
  const c = run({}, true);
  ok('B4 serie continua: sin enlace en ningún rango', ['24h', '7d', '30d', '1y', 'all'].every(r => c[r].rc.gapLinkPath === '' && c[r].rc.gapAreaPath === ''));
}
// ── C. Nada más cambia ──────────────────────────────────────────────────────
for (const [name, o] of [['cadencia normal', {}], ['sesiones', { sessions: true }], ['lagunas', { gaps: true }]]) {
  const off = run(o, false), on = run(o, true);
  const ranges = name === 'cadencia normal' || name === 'lagunas' ? ['24h', '7d', '30d', '1y', 'all'] : ['7d', '30d', '1y', 'all'];
  ok(`C1 ${name}: trazo y área byte-idénticos en ${ranges.join('/')}`, ranges.every(r => on[r].rc.linePath === off[r].rc.linePath && on[r].rc.areaPath === off[r].rc.areaPath));
  ok(`C2 ${name}: %, badge y color idénticos en los cinco rangos`, ['24h', '7d', '30d', '1y', 'all'].every(r => on[r].ret === off[r].ret && on[r].badge === off[r].badge && on[r].color === off[r].color));
}
// ── D. Los dos hosts de producción pintan el enlace, tenue y sin fase propia ─
ok('D1 escritorio pinta .wsc-gap-link desde rc.gapLinkPath', /class="wsc-gap-link" d="' \+ rc\.gapLinkPath/.test(APP));
ok('D2 móvil pinta .aurix-lite-gap-link desde _rc.gapLinkPath', /class="aurix-lite-gap-link" d="' \+ _rc\.gapLinkPath/.test(APP));
ok('D1b escritorio y móvil pintan el relleno de laguna con el degradado del área', /class="wsc-gap-area" d="' \+ rc\.gapAreaPath \+ '" fill="url\(#wscArea-/.test(APP)
  && /class="aurix-lite-gap-area" d="' \+ _rc\.gapAreaPath \+ '" fill="url\(#' \+ gid/.test(APP));
ok('D3 CSS: discontinuo, tenue y revelado con el área (también sin movimiento reducido)', /\.wsc-gap-link, \.aurix-lite-gap-link \{[^}]*stroke-dasharray/.test(CSS)
  && /\.aurix-lite-in\.aurix-pm \.aurix-lite-gap-link, \.aurix-lite-in\.aurix-pm \.aurix-lite-gap-area \{ animation: aurixAreaReveal/.test(CSS)
  && /\.aurix-lite-in\.aurix-pm \.aurix-lite-gap-link, \.aurix-lite-in\.aurix-pm \.aurix-lite-gap-area \{ animation: none; \}/.test(CSS)
  && /\.wsc-gap-area, \.aurix-lite-gap-area \{ opacity: \.6; \}/.test(CSS));

console.log(`\n${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
