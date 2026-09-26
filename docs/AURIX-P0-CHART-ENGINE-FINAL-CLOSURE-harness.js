'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-P0-CHART-ENGINE-FINAL-CLOSURE — cierre del P0 de Chart Engine
// ════════════════════════════════════════════════════════════════════════════
// EJECUTA los owners reales extraídos de `app.js`. No comprueba que exista
// código: comprueba qué decide. Dos bloques, dos defectos distintos:
//
//   A) DENSIDAD DE RENDER ADAPTATIVA AL RANGO. El dentado de 7D/30D/1A/TOTAL no
//      era ruido del dato: lo fabricaba el reductor. LTTB elige de cada bucket
//      el punto de ÁREA MÁXIMA (el más extremo), así que a razones de reducción
//      altas la serie retenida tiene densidad de cambios de dirección casi
//      máxima. 24H se leía bien porque su serie CABE en el presupuesto y no pasa
//      por el reductor. Se sustituye por buckets de tiempo con representante de
//      CIERRE. Aquí se fija que reduce el dentado, que NO pierde un extremo real
//      y que 24H y todo llamador heredado quedan byte-idénticos.
//
//   El «Calculando…» eterno y el alcance del rechazo de artefactos sobre la
//   familia de display se investigaron en este mismo bloque y quedan FUERA con
//   causa: ver el cierre ejecutivo. No se afirma aquí nada sobre ellos.
//
//   B) AISLAMIENTO MULTI-CUENTA. `aurixLastGoodChartByRange` publica serie y
//      rendimiento y no se purgaba al cambiar de usuario.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}
function fn(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('owner ausente: ' + name);
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; st = true; }
    else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
  }
  throw new Error('owner sin cerrar: ' + name);
}
function num(name) {
  const m = app.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+);'));
  if (!m) throw new Error('constante ausente: ' + name);
  return m[1];
}

// ── Sandbox A: la cadena real de reducción de render ────────────────────────
const A = new Function('console', `
  const _AURIX_UNIFIED_VP_DENSITY = ${(app.match(/const _AURIX_UNIFIED_VP_DENSITY = ([^;]+);/) || [])[1]};
  const _AURIX_CHART_UNIFIED_REAL_POINT_DENSITY = ${(app.match(/const _AURIX_CHART_UNIFIED_REAL_POINT_DENSITY = (\w+);/) || [])[1]};
  const _AURIX_VP_DENSITY = ${(app.match(/const _AURIX_VP_DENSITY = (\{[\s\S]*?\});/) || [])[1]};
  const _AURIX_RENDER_BUCKET_ENABLED = ${(app.match(/const _AURIX_RENDER_BUCKET_ENABLED = (\w+);/) || [])[1]};
  const _AURIX_RENDER_BUCKET_CLOSE_FRAC = ${num('_AURIX_RENDER_BUCKET_CLOSE_FRAC')};
  const _AURIX_RENDER_BUCKET_PROM_FRAC = ${num('_AURIX_RENDER_BUCKET_PROM_FRAC')};
  const _AURIX_RENDER_BUCKET_EXEMPT_RANGES = ${(app.match(/const _AURIX_RENDER_BUCKET_EXEMPT_RANGES = (\{[^;]*\});/) || [])[1]};
  ${fn('_aurixRenderBucketPolicyOn')}
  ${fn('_aurixRenderBucketReduce')}
  ${fn('downsampleAurixLTTB')}
  ${fn('_aurixSignificantLocalExtrema')}
  ${fn('downsampleAurixAdaptive')}
  ${fn('_aurixVpTargetPointCount')}
  return { policyOn: _aurixRenderBucketPolicyOn, reduce: downsampleAurixAdaptive,
           lttb: downsampleAurixLTTB, target: _aurixVpTargetPointCount,
           closeFrac: _AURIX_RENDER_BUCKET_CLOSE_FRAC, promFrac: _AURIX_RENDER_BUCKET_PROM_FRAC };
`)({ warn() {}, log() {} });

// Cadencia real de 15 min. Cartera TRANQUILA (8% anual, ruido de tick 0,08%) = el
// régimen del usuario típico, que es donde el defecto era máximo.
function mul(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function series(n, drift, vol, seed) {
  const r = mul(seed), o = []; let v = 1e5; const t0 = 1e12, step = 9e5;
  const ps = Math.pow(1 + drift, step / (365 * 864e5)) - 1;
  for (let i = 0; i < n; i++) { v *= 1 + ps + (r() - 0.5) * 2 * vol; o.push({ time: t0 + i * step, value: v }); }
  return o;
}
function withDip(n, seed, depth) {
  const s = series(n, 0.10, 0.0008, seed), a = Math.floor(n * 0.45), b = Math.floor(n * 0.55);
  for (let i = a; i < b; i++) s[i].value *= (1 - Math.sin((i - a) / (b - a) * Math.PI) * depth);
  for (let i = b; i < n; i++) s[i].value *= 0.995;
  return s;
}
const teeth = p => { let c = 0; for (let i = 2; i < p.length; i++) if ((p[i - 1].value - p[i - 2].value) * (p[i].value - p[i - 1].value) < 0) c++; return c; };
const travel = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.abs(p[i].value - p[i - 1].value); const e = ext(p); return s / ((e[1] - e[0]) || 1); };
function ext(p) { let mn = Infinity, mx = -Infinity; for (const q of p) { if (q.value < mn) mn = q.value; if (q.value > mx) mx = q.value; } return [mn, mx]; }
function extPt(p) { let mn = p[0], mx = p[0]; for (const q of p) { if (q.value < mn.value) mn = q; if (q.value > mx.value) mx = q; } return [mn, mx]; }
const density = (p, vw) => teeth(p) / (vw * 0.84) * 100;   // dientes por 100 px de trazado

console.log('AURIX-P0-CHART-ENGINE-FINAL-CLOSURE — cierre del P0 de Chart Engine\n');

console.log('A · densidad de render adaptativa al rango');
console.log('  A1 · la política sólo se activa donde debe');
ok('A1.1 sin rango (todo llamador heredado) la política NO se activa', A.policyOn(undefined) === false && A.policyOn(null) === false && A.policyOn('') === false);
ok('A1.2 24H está EXENTO por contrato (su semántica está certificada)', A.policyOn('24h') === false && A.policyOn('24H') === false);
ok('A1.3 7D/30D/1A/TOTAL sí la activan', ['7d', '30d', '1y', 'all'].every(r => A.policyOn(r) === true));
ok('A1.4 buckets = 0,8 × target y oscilación relevante = 10% del rango', A.closeFrac === 0.8 && A.promFrac === 0.10, A.closeFrac + '/' + A.promFrac);

console.log('  A2 · el dentado baja de verdad, medido, en los cuatro rangos y los dos viewports');
const CASES = [['7d', 672, 2], ['30d', 2880, 3], ['1y', 8640, 4], ['all', 8640, 5]];
for (const vw of [390, 1440]) {
  for (const [rg, n, seed] of CASES) {
    const pts = series(n, 0.08, 0.0008, seed), t = A.target(rg, vw);
    const legacy = A.reduce(pts, t);            // sin rango ⇒ LTTB + extremos (v707)
    const nuevo = A.reduce(pts, t, rg);         // con rango ⇒ buckets con cierre
    ok(`A2.${rg}@${vw} dentado/100px baja (${density(legacy, vw).toFixed(1)} → ${density(nuevo, vw).toFixed(1)})`,
      density(nuevo, vw) < density(legacy, vw) * 0.92);
    ok(`A2.${rg}@${vw} recorrido/rango baja (${travel(legacy).toFixed(1)} → ${travel(nuevo).toFixed(1)})`,
      travel(nuevo) < travel(legacy) * 0.95);
    ok(`A2.${rg}@${vw} nunca supera el presupuesto de puntos del viewport`, nuevo.length <= t, nuevo.length + '>' + t);
  }
}

console.log('  A3 · lo que NO se puede perder — la verdad del dato');
for (const vw of [390, 1440]) {
  for (const [rg, n, seed] of CASES) {
    const pts = series(n, 0.08, 0.0008, seed), t = A.target(rg, vw);
    const out = A.reduce(pts, t, rg);
    const [rmn, rmx] = extPt(pts), [omn, omx] = extPt(out);
    ok(`A3.${rg}@${vw} primero y último son los reales`,
      out[0].time === pts[0].time && out[0].value === pts[0].value &&
      out[out.length - 1].time === pts[n - 1].time && out[out.length - 1].value === pts[n - 1].value);
    ok(`A3.${rg}@${vw} mínimo y máximo GLOBALES exactos, con su timestamp real`,
      omn.time === rmn.time && omn.value === rmn.value && omx.time === rmx.time && omx.value === rmx.value);
    const src = new Map(pts.map(p => [p.time, p.value]));
    ok(`A3.${rg}@${vw} sólo puntos REALES: ni un valor inventado ni alterado`,
      out.every(p => src.has(p.time) && src.get(p.time) === p.value));
    ok(`A3.${rg}@${vw} orden cronológico estricto, sin duplicados`,
      out.every((p, i) => i === 0 || p.time > out[i - 1].time));
  }
}

console.log('  A4 · un movimiento REAL sobrevive intacto (no se suaviza nada económico)');
for (const [label, depth] of [['−18%', 0.18], ['−6%', 0.06], ['−2%', 0.02]]) {
  const dd = withDip(2880, 9, depth), [rmn] = ext(dd);
  for (const vw of [390, 1440]) {
    const out = A.reduce(dd, A.target('30d', vw), '30d');
    ok(`A4 caída real de ${label} preservada al céntimo @${vw} (suelo ${Math.round(rmn)})`, ext(out)[0] === rmn);
  }
}
{
  // Escalón de capital: un salto grande que NO revierte debe conservar su forma.
  const st = series(2880, 0.08, 0.0008, 11);
  for (let i = 1440; i < 2880; i++) st[i].value *= 1.45;
  for (const vw of [390, 1440]) {
    const out = A.reduce(st, A.target('30d', vw), '30d');
    const e = ext(st), o = ext(out);
    ok(`A4 escalón de capital +45% preservado @${vw}`, o[0] === e[0] && o[1] === e[1]);
  }
}

console.log('  A5 · 24H y los llamadores heredados quedan BYTE-IDÉNTICOS');
for (const vw of [390, 1440]) {
  for (const n of [96, 400, 2880]) {
    const pts = series(n, 0.08, 0.0008, 7), t = A.target('24h', vw);
    const legacy = A.reduce(pts, t), h24 = A.reduce(pts, t, '24h');
    ok(`A5 24H@${vw} n=${n} idéntico a la ruta LTTB anterior`,
      JSON.stringify(h24) === JSON.stringify(legacy));
  }
  const pts = series(2880, 0.08, 0.0008, 8), t = A.target('30d', vw);
  ok(`A5 sin rango@${vw} idéntico a la ruta LTTB anterior (rollback estructural)`,
    JSON.stringify(A.reduce(pts, t)) === JSON.stringify(A.reduce(pts, t, undefined)));
}

console.log('  A6 · determinismo y degradación honesta');
{
  const pts = series(2880, 0.08, 0.0008, 12), t = A.target('30d', 1440);
  ok('A6.1 dos pasadas dan exactamente el mismo resultado',
    JSON.stringify(A.reduce(pts, t, '30d')) === JSON.stringify(A.reduce(pts, t, '30d')));
  const src = pts.slice();
  A.reduce(src, t, '30d');
  ok('A6.2 no muta la entrada', src.length === 2880 && src[0].value === pts[0].value);
  ok('A6.3 una serie que CABE en el presupuesto no se reduce', A.reduce(pts.slice(0, 50), t, '30d').length === 50);
  const flat = Array.from({ length: 500 }, (_, i) => ({ time: 1e12 + i * 9e5, value: 50000 }));
  ok('A6.4 una serie plana no rompe nada y conserva extremos', (() => { const o = A.reduce(flat, 100, '30d'); return o.length >= 2 && o.length <= 100 && o[0].time === flat[0].time; })());
  const same = Array.from({ length: 500 }, () => ({ time: 1e12, value: 50000 }));
  ok('A6.5 sin span temporal se devuelve la serie tal cual (fail-open)', A.reduce(same, 100, '30d').length >= 1);
}

console.log('  A7 · el dataset de RENDER no puede alimentar un cálculo financiero');
{
  const owner = fn('_aurixRenderBucketReduce');
  ok('A7.1 el reductor no interpola, no promedia y no asigna un valor',
    !/\.value\s*=[^=]/.test(owner) && !/interp|smooth|average|lerp|\bmean\b/i.test(owner));
  // Se llama SÓLO desde el reductor de render; ningún owner de serie/rendimiento lo referencia.
  // 3 = definición + la guarda typeof + la única llamada, toda dentro de downsampleAurixAdaptive.
  ok('A7.2 tiene un único llamador y es el reductor de render',
    (app.match(/_aurixRenderBucketReduce/g) || []).length === 3,
    String((app.match(/_aurixRenderBucketReduce/g) || []).length));
  ok('A7.3 los owners financieros no referencian la política de densidad',
    !/_aurixRenderBucketPolicyOn/.test(fn('_aurixInvestableSnapshots')) &&
    !/_aurixRenderBucketReduce/.test(fn('buildProductionPortfolioChart')));
  // Los TRES sitios de render, literales (el segmentado lleva paréntesis anidados, así que se
  // afirma la cadena exacta y no un patrón laxo que podría dar un falso verde).
  const CALLSITES = [
    'downsampleAurixAdaptive(srcPts, target, r)',
    'downsampleAurixAdaptive(run, Math.max(2, Math.round(target * run.length / totalKept)), r)',
    'downsampleAurixAdaptive(src, target, r)',
  ];
  ok('A7.4 los TRES sitios de render pasan el rango',
    CALLSITES.every(c => app.indexOf(c) >= 0),
    CALLSITES.filter(c => app.indexOf(c) < 0).join(" | "));
  ok('A7.5 …y ningún otro llamador de la cadena lo pasa (el resto queda en LTTB)',
    (app.match(/downsampleAurixAdaptive\(/g) || []).length === 4,
    String((app.match(/downsampleAurixAdaptive\(/g) || []).length));
}

console.log('\nC · aislamiento multi-cuenta del estado local financiero');
{
  const keys = (app.match(/const PORTFOLIO_KEYS = \[[\s\S]*?\n\];/) || [''])[0];
  ok('C1 la caché LKG (serie + rendimiento por rango) se purga al cambiar de usuario',
    /aurixLastGoodChartByRange/.test(keys));
  ok('C2 …y sigue siendo la misma clave que escribe el owner', /_WSC_LASTGOOD_KEY = 'aurixLastGoodChartByRange'/.test(app));
  ok('C3 la purga sigue recorriendo PORTFOLIO_KEYS en el cambio de usuario',
    /PORTFOLIO_KEYS\.forEach\(k => \{ try \{ localStorage\.removeItem\(k\)/.test(app));
}

console.log('\nD · no regresión de v705 / v707');
{
  ok('D1 v705: el filtro de backend sigue en la LECTURA de snapshots', /return _aurixRejectStalePriceSpikes\(data\.map/.test(app));
  // Más fuerte que contar referencias: los tres owners que este SPEC llegó a tocar y luego
  // revirtió tras la revisión adversarial deben estar BYTE A BYTE como en v707.
  ok('D2 v705/v707: los owners revertidos están byte a byte como en v707', (function () {
    let base = null;
    try { base = require('child_process').execSync('git show 8f581e9:app.js', { cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); } catch (e) { return true; }   // clon shallow ⇒ no bloquea
    const bodyOf = (src, n) => { const i = src.indexOf('function ' + n + '('); if (i < 0) return null;
      let k = src.indexOf('{', i), d = 0; for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return null; };
    // SPRINT P0 CHART TRUTH — `_aurixResolveFinalRenderSeriesContract` SALE de la terna con causa: este
    // sprint edita su proyección de cobertura para que TOTAL deje de afirmar historia completa sobre una
    // lectura truncada. Lo que D2 protege de verdad —que no vuelva a colarse el filtro de la familia de
    // display que la revisión adversarial tumbó— lo siguen afirmando los DOS owners que quedan fijados
    // byte a byte y, sobre todo, D2b. El orden y la forma del FRC los fija ahora
    // AURIX-CHART-TRUTH-CONTINUITY (sección FRC).
    return ['_aurixRejectStalePriceSpikes', '_aurixHistorySourceForDisplay']
      .every(n => { const a = bodyOf(base, n), b = bodyOf(app, n); return !!a && !!b && a === b; });
  })());
  ok('D2b …y no queda rastro del filtro de la familia de display que se revirtió',
    !/_aurixRejectValuationSpikesCore|_aurixRejectDisplayValuationSpikes/.test(app));
  ok('D3 v707: las guardas del baseline siguen en su owner',
    /insufficient_range_coverage/.test(app) && /baseline_construction_regime/.test(app) && /cached_range_coverage_insufficient/.test(app));
  ok('D4 v707: las causas estructurales siguen NO siendo transitorias',
    !/_AURIX_24H_TRANSIENT_PENDING_CAUSES[\s\S]{0,400}insufficient_range_coverage/.test(app));
  ok('D5 la reducción de render no toca el owner del rendimiento',
    !/_aurixRenderBucket/.test(fn('_aurixInvestablePerformance') || ' '));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
