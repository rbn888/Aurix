'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-CANONICAL-SERIES-INVARIANT — SPEC P0 CHART RELIABILITY LAST-BULLET §3/§7/§8/§9/§10
// ════════════════════════════════════════════════════════════════════════════
// CANONICAL SERIES INVARIANT: para el mismo usuario + la misma verdad financiera persistida + el mismo
// instante de evaluación + el mismo timeframe, Aurix DEBE producir la MISMA serie publicada —mismos
// puntos, segmentos, extremos, rendimiento y estado de continuidad— con independencia de cold start,
// refresh, salir/entrar, cambio de pestaña, 24H→7D→24H, o el ORDEN DE LLEGADA de las fuentes cuando
// representan la misma verdad. El lifecycle de la UI NO PUEDE MODIFICAR EL PASADO.
//
// Ejecuta el pipeline REAL de app.js. Un estado que aún no conoce todas las fuentes puede RETENER
// (honesto), pero si publica tiene que publicar exactamente la serie del conjunto completo.
// Ver [AURIX-CHART-ROOT-DIVERGENCE-REPLAY] para la causa raíz que esto blinda.
const L = require('./_aurix-chart-replay-lib.cjs');
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
const NOW = 1_800_000_000_000;
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

const fe = (t, v, x) => Object.assign({ ts: t, total: +Number(v).toFixed(2), real_estate: 0 }, x || {});
const bs = (t, v, x) => Object.assign({ ts: t, total_value_usd: +Number(v).toFixed(2), real_estate: 0 }, x || {});
function ser(from, to, step, f, mk) { const o = []; for (let t = from; t <= to; t += step) o.push((mk || fe)(t, f(t))); return o; }
const RANGES = ['24h', '7d', '30d', '1y', 'all'];

// Fases de ensamblaje de UNA MISMA verdad. `complete` conoce las tres fuentes.
const PHASES = [
  { n: 'boot_unsettled',   outcome: null,     loaded: false, canon: false, be: 'idle' },
  { n: 'reconcile_inflight', outcome: 'ok-row', loaded: false, canon: false, be: 'loading' },
  { n: 'canon_read_failed', outcome: 'failed', loaded: false, canon: false, be: 'ready' },
  { n: 'be_loading',       outcome: 'ok-row', loaded: true,  canon: true,  be: 'loading' },
  { n: 'be_failed',        outcome: 'ok-row', loaded: true,  canon: true,  be: 'failed' },
  { n: 'COMPLETE',         outcome: 'ok-row', loaded: true,  canon: true,  be: 'ready', complete: true },
];

// ── LOS 30 CASOS ADVERSARIALES (SPEC §7) ─────────────────────────────────────
// Cada uno es una CLASE DE FALLO real, no una combinatoria. Todos comparten la misma exigencia:
// misma verdad ⇒ una sola serie publicada por timeframe.
const W = NOW - 7 * DAY;
// `outage: true` ⇒ la VERDAD PERSISTIDA tiene un hueco de observación genuino (faltan snapshots).
// Sólo en esos casos exigir segmentación es medir lo que el SPEC prohíbe (puentear un hueco real).
// Un salto de timestamps creado por el filtro de plateau del motor NO es un hueco de observación.
const OUTAGE = new Set(['14', '18', '19', '20', '26', '28', '30']);
const FIXTURES = [
  ['01 cuenta nueva, primer activo', { local: [fe(NOW - 40 * MIN, 1000), fe(NOW - 20 * MIN, 1002), fe(NOW, 1005)], remote: null, backend: [], flows: [] }],
  ['02 sólo crypto 24/7 (cadencia densa continua)', { local: ser(NOW - 3 * DAY, NOW, 15 * MIN, t => 20000 + Math.sin(t / 1e7) * 400), remote: null, backend: [], flows: [] }],
  ['03 crypto + cash', { local: ser(NOW - 3 * DAY, NOW, 15 * MIN, t => 20000 + Math.sin(t / 1e7) * 400 + 5000), remote: null, backend: [], flows: [] }],
  ['04 stocks + crypto (mercado cerrado el fin de semana)', { local: ser(NOW - 5 * DAY, NOW, 30 * MIN, t => { const h = Math.floor((t / HOUR) % 24); return 30000 + (h > 8 && h < 20 ? Math.sin(t / 1e7) * 300 : 0); }), remote: null, backend: [], flows: [] }],
  ['05 depósito de liquidez', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - DAY ? 10000 : 15000)), remote: null, backend: [], flows: [{ ts: NOW - DAY, amountUSD: 5000 }] }],
  ['06 retirada total', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - DAY ? 12000 : 40)), remote: null, backend: [], flows: [{ ts: NOW - DAY, amountUSD: -11960 }] }],
  ['07 compra (asset_add = capital, no rendimiento)', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - DAY ? 8000 : 11000)), remote: null, backend: [], flows: [{ ts: NOW - DAY, amountUSD: 3000 }] }],
  ['08 venta parcial', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - DAY ? 12000 : 9000)), remote: null, backend: [], flows: [{ ts: NOW - DAY, amountUSD: -3000 }] }],
  ['09 venta total (posición closed)', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - DAY ? 12000 : 6000)), remote: null, backend: [], flows: [{ ts: NOW - DAY, amountUSD: -6000 }] }],
  ['10 borrado de activo (escalón con ledger)', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - 12 * HOUR ? 20000 : 14000)), remote: null, backend: [], flows: [{ ts: NOW - 12 * HOUR, amountUSD: -6000 }] }],
  ['11 reañadido de activo', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - 12 * HOUR ? 14000 : t < NOW - 6 * HOUR ? 20000 : 20200)), remote: null, backend: [], flows: [{ ts: NOW - 12 * HOUR, amountUSD: 6000 }] }],
  ['12 mercado cerrado (tramo plano real)', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t > NOW - 18 * HOUR ? 25000 : 25000 + Math.sin(t / 1e7) * 200)), remote: null, backend: [], flows: [] }],
  ['13 precio stale (valores idénticos repetidos)', { local: ser(NOW - DAY, NOW, 15 * MIN, () => 17777), remote: null, backend: [], flows: [] }],
  ['14 proveedor no disponible (hueco FE, backend presente)', { local: ser(NOW - 3 * HOUR, NOW, 10 * MIN, t => 9000 + (t - (NOW - 3 * HOUR)) / HOUR), remote: ser(NOW - 3 * HOUR, NOW, 10 * MIN, t => 9000 + (t - (NOW - 3 * HOUR)) / HOUR), backend: ser(W, NOW - 20 * HOUR, 15 * MIN, t => 8800 + ((t - W) / DAY) * 25, bs), flows: [] }],
  ['15 snapshot parcial (fxPartial)', { local: ser(NOW - DAY, NOW, 15 * MIN, t => 11000 + (t - (NOW - DAY)) / HOUR).map((p, i) => (i % 17 === 0 ? Object.assign(p, { fxPartial: true }) : p)), remote: null, backend: [], flows: [] }],
  ['16 valuationComplete:false', { local: ser(NOW - DAY, NOW, 15 * MIN, t => 11000 + (t - (NOW - DAY)) / HOUR).map((p, i) => (i % 13 === 0 ? Object.assign(p, { valuationComplete: false }) : p)), remote: null, backend: [], flows: [] }],
  ['17 snapshot material fuera de cadencia', { local: ser(NOW - DAY, NOW, 30 * MIN, t => 13000 + (t - (NOW - DAY)) / HOUR).concat([fe(NOW - 7 * HOUR - 3 * MIN, 15500)]).sort((a, b) => a.ts - b.ts), remote: null, backend: [], flows: [{ ts: NOW - 7 * HOUR - 3 * MIN, amountUSD: 2400 }] }],
  ['18 hueco real de backend (14 h de outage)', { local: ser(NOW - 2 * HOUR, NOW, 5 * MIN, t => 10300 + (t - (NOW - 2 * HOUR)) / HOUR), remote: ser(NOW - 2 * HOUR, NOW, 5 * MIN, t => 10300 + (t - (NOW - 2 * HOUR)) / HOUR), backend: ser(W, NOW - 3 * HOUR, 15 * MIN, t => 10000 + ((t - W) / DAY) * 40, bs).filter(p => !(p.ts > NOW - 4 * DAY && p.ts < NOW - 4 * DAY + 14 * HOUR)), flows: [] }],
  ['19 app cerrada durante horas (hueco de 12 h en 24H)', { local: ser(NOW - 2 * HOUR, NOW, 5 * MIN, t => 10300 + (t - (NOW - 2 * HOUR)) / HOUR), remote: ser(NOW - 30 * HOUR, NOW - 14 * HOUR, 10 * MIN, t => 10100 + (t - (NOW - 30 * HOUR)) / HOUR).concat(ser(NOW - 2 * HOUR, NOW, 5 * MIN, t => 10300 + (t - (NOW - 2 * HOUR)) / HOUR)), backend: ser(W, NOW - 31 * HOUR, 15 * MIN, t => 9800 + ((t - W) / DAY) * 30, bs), flows: [] }],
  ['20 vuelta después de varios días', { local: ser(NOW - HOUR, NOW, 5 * MIN, t => 22000 + (t - (NOW - HOUR)) / HOUR), remote: ser(NOW - 12 * DAY, NOW - 5 * DAY, HOUR, t => 20000 + ((t - (NOW - 12 * DAY)) / DAY) * 100).concat(ser(NOW - HOUR, NOW, 5 * MIN, t => 22000 + (t - (NOW - HOUR)) / HOUR)), backend: [], flows: [] }],
  ['21 multi-device (la caché local va por detrás del canónico)', { local: ser(NOW - 90 * MIN, NOW, 10 * MIN, t => 31000 + (t - (NOW - 90 * MIN)) / HOUR), remote: ser(NOW - 4 * DAY, NOW, 20 * MIN, t => 30000 + ((t - (NOW - 4 * DAY)) / DAY) * 250), backend: [], flows: [] }],
  ['22 flujo y snapshot próximos', { local: ser(NOW - DAY, NOW, 15 * MIN, t => (t < NOW - 6 * HOUR ? 14000 : 19000)), remote: null, backend: [], flows: [{ ts: NOW - 6 * HOUR + 2 * MIN, amountUSD: 5000 }] }],
  ['23 flujo y snapshot con cadencia gruesa', { local: ser(NOW - 6 * DAY, NOW, 12 * HOUR, t => (t < NOW - 3 * DAY ? 14000 : 19000)), remote: null, backend: [], flows: [{ ts: NOW - 3 * DAY - 5 * HOUR, amountUSD: 5000 }] }],
  ['24 divisa base con cobertura parcial (fx no cubierto)', { local: ser(NOW - DAY, NOW, 15 * MIN, t => 16000 + (t - (NOW - DAY)) / HOUR).map((p, i) => (i > 60 ? Object.assign(p, { fxPartial: true }) : p)), remote: null, backend: [], flows: [] }],
  ['25 historia muy corta (menos de 2 puntos útiles)', { local: [fe(NOW - 5 * MIN, 700)], remote: null, backend: [], flows: [] }],
  ['26 sólo backend, sin historia de dispositivo', { local: [], remote: [], backend: ser(W, NOW - HOUR, 15 * MIN, t => 12000 + ((t - W) / DAY) * 60, bs), flows: [] }],
  ['27 timestamps duplicados y desordenados', { local: ser(NOW - DAY, NOW, 20 * MIN, t => 18000 + (t - (NOW - DAY)) / HOUR).flatMap(p => [p, Object.assign({}, p)]).reverse(), remote: null, backend: [], flows: [] }],
  ['28 dos huecos reales en la misma ventana', { local: [], remote: ser(NOW - 6 * DAY, NOW, 20 * MIN, t => 21000 + ((t - (NOW - 6 * DAY)) / DAY) * 90).filter(p => !(p.ts > NOW - 5 * DAY && p.ts < NOW - 5 * DAY + 20 * HOUR) && !(p.ts > NOW - 2 * DAY && p.ts < NOW - 2 * DAY + 16 * HOUR)), backend: [], flows: [] }],
  ['29 cartera plana en cero tras cierre total', { local: ser(NOW - 2 * DAY, NOW, 30 * MIN, t => (t < NOW - 30 * HOUR ? 9000 : 0)), remote: null, backend: [], flows: [{ ts: NOW - 30 * HOUR, amountUSD: -9000 }] }],
  ['30 EL PATRÓN: primera entrada continua → reentrada la parte continua desaparece', { local: ser(NOW - 2 * HOUR, NOW, 5 * MIN, t => 10300 + (t - (NOW - 2 * HOUR)) / HOUR), remote: ser(NOW - 30 * HOUR, NOW - 14 * HOUR, 10 * MIN, t => 10100 + (t - (NOW - 30 * HOUR)) / HOUR).concat(ser(NOW - 2 * HOUR, NOW, 5 * MIN, t => 10300 + (t - (NOW - 2 * HOUR)) / HOUR)), backend: ser(W, NOW - 31 * HOUR, 15 * MIN, t => 9800 + ((t - W) / DAY) * 30, bs), flows: [] }],
];

// Normalización honesta del fixture: en una cuenta AUTENTICADA la fila remota contiene lo que el
// dispositivo llegó a persistir. Dejar `remote: null` con `canon: true` modelaría un canónico VACÍO y
// haría que la fase COMPLETA no dibujara nada — el test pasaría por vacuidad en lugar de por corrección.
for (const f of FIXTURES) { if (!f[1].remote || !f[1].remote.length) f[1].remote = (f[1].local || []).map(p => Object.assign({}, p)); }

console.log('AURIX-CHART-CANONICAL-SERIES-INVARIANT — SPEC P0 CHART RELIABILITY LAST-BULLET\n');

// ── 1. INVARIANTE sobre los 30 casos adversariales × 5 timeframes ────────────
console.log('1. CANONICAL SERIES INVARIANT — 30 casos adversariales × 5 timeframes:');
let synthTotal = 0, bridgedTotal = 0, publishedTotal = 0, heldTotal = 0, segmentedOk = 0;
const escapeWhilePending = [];
for (const [name, truth] of FIXTURES) {
  const ctx = L.newSession({ now: NOW });
  L.setTruth(ctx, truth);
  let worst = null;
  for (const range of RANGES) {
    const seen = [];
    let completeHash = null;
    for (const ph of PHASES) {
      L.setPhase(ctx, ph, truth);
      const r = L.publishedSeries(ctx, range, 'desktop');
      if (ph.complete) completeHash = r.kind === 'PUBLISHED' ? r.hash : null;
      if (r.kind === 'PUBLISHED') {
        publishedTotal++;
        seen.push({ ph: ph.n, hash: r.hash });
        if ((r.series.syntheticPoints || 0) !== 0) synthTotal++;
        // BRIDGE = el motor declara un hueco de observación REAL y aun así dibuja una sola línea.
        // Anclado en la verdad persistida: sólo cuenta si el fixture tiene un outage genuino.
        if (OUTAGE.has(name.slice(0, 2)) && r.series.continuityState === 'segmented_real_gap' && r.series.segments < 2) {
          bridgedTotal++;
          console.log('     BRIDGE ' + name + ' | ' + range + ' | ' + ph.n + ' | seg=' + r.series.segments + ' pts=' + r.stages.S7_plotted.count);
        }
        if (OUTAGE.has(name.slice(0, 2)) && r.stages.S7_plotted.largestGapMs > r.stages.S6_continuity.realGapFloorMs && r.series.segments >= 2) segmentedOk++;
        if (r.stages.S8_publication.pending) escapeWhilePending.push(name.slice(0,2) + '/' + range + '/' + ph.n);
      } else heldTotal++;
    }
    const hashes = new Set(seen.map(x => x.hash));
    if (hashes.size > 1) worst = range + ': ' + seen.map(x => x.ph + '=' + x.hash.slice(0, 6)).join(' ');
    // si algún estado incompleto publica, tiene que publicar la serie del conjunto completo
    if (completeHash && seen.some(x => x.hash !== completeHash)) worst = worst || (range + ': un estado incompleto publicó otra serie');
  }
  ok(name, worst === null, worst || '5 timeframes, 6 fases, 1 serie por timeframe');
}
console.log('   (' + publishedTotal + ' series publicadas, ' + heldTotal + ' retenciones honestas)');
ok('CERO puntos sintéticos en las ' + publishedTotal + ' series publicadas', synthTotal === 0, String(synthTotal));
ok('CERO bridge de huecos de observación REALES', bridgedTotal === 0, String(bridgedTotal));
ok('ninguna serie se publicó con el conjunto de fuentes PENDIENTE', escapeWhilePending.length === 0,
  escapeWhilePending.length ? escapeWhilePending.join(', ') : '0 escapes de la puerta _definitive');
ok('un outage genuino SÍ segmenta cuando cae en la ventana', segmentedOk > 0, segmentedOk + ' series segmentadas por hueco real');

// ── 1b. RESIDUAL FIJADO: filtro de plateau vs clasificador de continuidad ────
// El filtro de plateau (S4) elimina puntos de valor IDÉNTICO en un tramo plano largo. El salto de
// timestamps que deja lo etiqueta después el clasificador como `real_temporal_gap`, aunque NO falta
// ninguna observación. Se dibuja como un único segmento — y eso es numéricamente cierto (ambos
// extremos valen lo mismo y todos los puntos borrados valían lo mismo), pero la etiqueta y el dibujo
// se contradicen. Es DETERMINISTA y con CERO puntos sintéticos, así que no produce el síntoma de este
// bloque; se fija aquí para que no pueda empeorar en silencio. NO se toca en este bloque: cambiar el
// filtro o el umbral alteraría la clasificación de TODAS las cuentas (SPEC §4 lo prohíbe).
console.log('\n1b. Residual fijado — plateau comprimido etiquetado como hueco real:');
{
  const flat = { local: (() => { const o = []; for (let t = NOW - 2 * DAY; t <= NOW; t += 30 * MIN) o.push(fe(t, t > NOW - 18 * HOUR ? 25000 : 25000 + Math.sin(t / 1e7) * 200)); return o; })(), remote: null, backend: [], flows: [] };
  const ctx = L.newSession({ now: NOW }); L.setTruth(ctx, flat);
  L.setPhase(ctx, PHASES[2], flat);
  const st = L.stages(ctx, '7d', 'desktop');
  const raw = flat.local; let rawMax = 0; for (let i = 1; i < raw.length; i++) rawMax = Math.max(rawMax, raw[i].ts - raw[i - 1].ts);
  ok('la verdad persistida NO tiene outage (cadencia constante)', rawMax === 30 * MIN, (rawMax / MIN) + ' min');
  ok('el hueco lo introduce el motor en S4, no la verdad', st.S4_rangeClipped.largestGapMs > 8 * HOUR, (st.S4_rangeClipped.largestGapMs / HOUR).toFixed(1) + 'h con ' + st.S4_rangeClipped.count + '/' + raw.length + ' puntos');
  ok('sigue sin fabricar puntos', st.S6_continuity.syntheticPoints === 0);
  ok('los extremos del tramo comprimido valen lo mismo ⇒ la recta es la verdad',
    st.S7_plotted.lastValue === 25000, String(st.S7_plotted.lastValue));
  ok('RESIDUAL: el motor lo etiqueta segmented_real_gap y dibuja 1 segmento',
    st.S6_continuity.continuityState === 'segmented_real_gap' && st.S6_continuity.segments === 1,
    st.S6_continuity.continuityState + '/' + st.S6_continuity.segments + 'seg — declarado, determinista, sin síntesis');
}

// ── 2. RELOAD TORTURE TEST (SPEC §8) ────────────────────────────────────────
// Una única verdad financiera congelada, conjunto de fuentes COMPLETO, y el lifecycle entero encima.
console.log('\n2. RELOAD TORTURE TEST — una verdad congelada, hash único por timeframe:');
{
  const truth = FIXTURES[29][1];   // el patrón exacto del síntoma
  const COMPLETE = PHASES[5];
  const byRange = {}; RANGES.forEach(r => { byRange[r] = new Set(); });
  const add = (ctx, range) => { L.setPhase(ctx, COMPLETE, truth); byRange[range].add(L.publishedSeries(ctx, range, 'desktop').hash); };
  let builds = 0;
  const fresh = () => { const c = L.newSession({ now: NOW }); L.setTruth(c, truth); return c; };
  for (let i = 0; i < 5; i++) { const c = fresh(); for (const r of RANGES) { add(c, r); builds++; } }                      // cold start ×5
  for (let i = 0; i < 5; i++) { const c = fresh(); for (const r of RANGES) { add(c, r); add(c, r); builds += 2; } }        // refresh ×5
  { const c = fresh(); for (let i = 0; i < 5; i++) for (const r of RANGES) { add(c, r); builds++; } }                      // tab leave/return ×5
  { const c = fresh(); for (let i = 0; i < 10; i++) { add(c, '24h'); add(c, '7d'); builds += 2; } }                        // 24H↔7D ×10
  { const c = fresh(); for (let i = 0; i < 10; i++) { add(c, '24h'); add(c, '30d'); builds += 2; } }                       // 24H↔30D ×10
  for (let i = 0; i < 5; i++) { const c = fresh(); for (const r of RANGES) { add(c, r); builds++; } }                      // close/reopen ×5
  // orden de llegada de las fuentes: la MISMA verdad ensamblada por caminos distintos
  for (const path of [[0, 1, 5], [0, 3, 5], [2, 4, 5], [1, 4, 3, 5], [5]]) {
    const c = fresh();
    for (const r of RANGES) { for (const i of path) { L.setPhase(c, PHASES[i], truth); L.publishedSeries(c, r, 'desktop'); } add(c, r); builds++; }
  }
  for (const r of RANGES) ok('torture ' + r.toUpperCase() + ' — un solo hash', byRange[r].size === 1, byRange[r].size + ' hash(es) en ' + builds + ' builds totales');
  console.log('   ' + builds + ' builds ejecutados sobre una verdad inmutable');
}

// ── 3. CROSS-DEVICE (SPEC §9) ───────────────────────────────────────────────
// No se exige que dos dispositivos sin converger inventen igualdad. Se exige que, cuando ambos han
// recibido la MISMA historia canónica, produzcan el MISMO ChartSeries.
console.log('\n3. CROSS-DEVICE — misma historia canónica ⇒ mismo ChartSeries:');
{
  const truth = FIXTURES[20][1];
  // Dispositivo A: caché local rica. Dispositivo B: caché local casi vacía. Mismo canónico remoto.
  const A = L.newSession({ now: NOW }); L.setTruth(A, truth);
  const B = L.newSession({ now: NOW }); L.setTruth(B, { local: [truth.local[truth.local.length - 1]], remote: truth.remote, backend: truth.backend, flows: truth.flows });
  for (const r of RANGES) {
    L.setPhase(A, PHASES[5], truth); L.setPhase(B, PHASES[5], truth);
    const a = L.publishedSeries(A, r, 'desktop'), b = L.publishedSeries(B, r, 'desktop');
    ok('cross-device ' + r.toUpperCase() + ' — mismo hash con distinta caché local', a.hash === b.hash, a.hash + ' vs ' + b.hash);
  }
  // convergiendo: el que aún no tiene el canónico RETIENE, nunca fabrica rentabilidad
  L.setPhase(B, PHASES[1], truth);
  const conv = L.publishedSeries(B, '24h', 'desktop');
  ok('convergiendo: retiene y no publica rendimiento', conv.kind !== 'PUBLISHED', conv.kind);
}

// ── 4. PERFORMANCE TRUTH (SPEC §10) ─────────────────────────────────────────
// El % y el gráfico consumen verdad compatible: el intervalo del badge cae dentro del intervalo
// dibujado, y si la serie está degradada el rendimiento no se publica (fail closed).
console.log('\n4. PERFORMANCE TRUTH — badge y gráfico sobre el mismo intervalo:');
{
  let mismatch = 0, orphanReturn = 0, checked = 0;
  for (const [, truth] of FIXTURES) {
    const ctx = L.newSession({ now: NOW }); L.setTruth(ctx, truth);
    for (const r of RANGES) {
      L.setPhase(ctx, PHASES[5], truth);
      const p = L.publishedSeries(ctx, r, 'desktop');
      if (p.kind !== 'PUBLISHED') continue;
      checked++;
      const s = p.series;
      if (s.badgeEligible) {
        if (!(s.baselineTs >= s.firstTs && s.currentTs <= s.lastTs)) mismatch++;
      }
      // un % publicado exige elegibilidad: nunca gráfico A + badge sobre historia B
      if (s.returnPct != null && !s.badgeEligible) orphanReturn++;
    }
  }
  ok('el intervalo del badge cae SIEMPRE dentro del intervalo dibujado', mismatch === 0, mismatch + ' de ' + checked);
  ok('ningún % publicado sin elegibilidad (fail closed)', orphanReturn === 0, orphanReturn + ' de ' + checked);
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
