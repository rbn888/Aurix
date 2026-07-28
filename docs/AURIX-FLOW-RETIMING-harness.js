'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-FLOW-RETIMING-harness — SPEC FLOW-RETIMING (identidad de serie · tandas ·
// exclusividad por capacidad y confianza · suelo temporal)
// ════════════════════════════════════════════════════════════════════════════
// Carga el motor REAL (sin reimplementarlo) y certifica los invariantes del plan global de
// asignación de flujos. Los fixtures reproducen los casos MEDIDOS en la cuenta de producción:
// dos colisiones reales (ratios 1,932 y 1,990), la tanda de +113.735 que quedaba huérfana y el
// flujo del 21-07 anterior al primer snapshot utilizable.
// NO cubre —a propósito— el guard `double_matched_flow_step` ni `_aurixComputePeriodReturn`:
// este SPEC no los toca y sus harnesses existentes siguen siendo su dueño.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSource(n) { return fnSrc(n); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  →  ' + x : '')); } };
const D = 864e5, H = 36e5, MIN = 6e4;

// ── contexto: funciones reales del owner ────────────────────────────────────
const ctx = { console: { log() {}, debug() {} }, Math, JSON, Object, Number, String, Boolean, Array, Map, Set, isFinite, Infinity, NaN, RegExp, Date, window: undefined };
ctx.IS_DEV = false;
let SERIES_SRC = [];           // categoryHistory que ve _aurixInvestableSnapshots
let FX = 1;                    // moneda base: 1 = USD, ≠1 = otra divisa
vm.createContext(ctx);
['_AURIX_FLOW_CORROBORATE_MS', '_AURIX_FLOW_CORROBORATE_FRAC', '_AURIX_STEP_MATCH_LO', '_AURIX_STEP_MATCH_HI',
 '_AURIX_STEP_MATCH_MIN_CONF', '_AURIX_STEP_SUSTAIN'].forEach(c => vm.runInContext(konstSrc(c), ctx));
vm.runInContext('var _AURIX_LEDGER_SELF_HEAL = true;', ctx);
['_aurixEarliestTrackedTs', '_aurixRetimeSeries', '_aurixRetimeAmountBase', '_aurixRetimeSteps', '_aurixStepClaims',
 '_aurixRetimeIntervalIdx', '_aurixFlowTsCorroboratedByHistory', '_aurixMatchHistoricalStep',
 '_aurixPlanFlowRetiming', '_aurixFlowRetimeDecision', '_aurixInvestableSnapshots'].forEach(f => vm.runInContext(fnSrc(f), ctx));
// dependencias que el owner consume (no las define): unidad base, epoch y fuente de display.
vm.runInContext('var toBase = function (v) { return v * FX; };', ctx);
vm.runInContext('var _aurixPortfolioEpoch = function () { return 0; };', ctx);
vm.runInContext('var _aurixHistorySourceForDisplay = function () { return SERIES_SRC; };', ctx);
vm.runInContext('var categoryHistory = [];', ctx);
Object.defineProperty(ctx, 'SERIES_SRC', { get: () => SERIES_SRC });
Object.defineProperty(ctx, 'FX', { get: () => FX });
const plan = c => vm.runInContext('_aurixPlanFlowRetiming', ctx)(c);
const series = () => vm.runInContext('_aurixRetimeSeries', ctx)();
const steps = () => vm.runInContext('_aurixRetimeSteps', ctx)(series());

// helper: construye categoryHistory (total incl. inmuebles + real_estate aparte)
const T0 = Date.parse('2026-07-22T18:00:00.000Z');
function build(points, realEstate) {
  return points.map(p => ({ ts: p.ts, total: +(p.inv + (realEstate || 0)).toFixed(2), real_estate: +(realEstate || 0).toFixed(2) }));
}
function ramp(fromTs, toTs, stepMs, v0, jumps) {
  const out = []; let v = v0;
  for (let t = fromTs; t <= toTs; t += stepMs) {
    (jumps || []).forEach(j => { if (t === j.ts) v += j.by; });
    out.push({ ts: t, inv: +v.toFixed(2) });
  }
  return out;
}

console.log('AURIX-FLOW-RETIMING — plan global de asignación\n');

// ── 1) IDENTIDAD DE SERIE ───────────────────────────────────────────────────
console.log('1 — identidad de serie (invertible, sin inmuebles, moneda base):');
ok('1.1 el owner ya NO lee portfolioHistory (patrimonio total en USD crudo)',
   !/function _aurixMatchHistoricalStep[\s\S]{0,900}portfolioHistory/.test(app) &&
   !/function _aurixFlowTsCorroboratedByHistory[\s\S]{0,700}portfolioHistory/.test(app));
ok('1.2 la serie de casado se deriva de _aurixInvestableSnapshots (misma que el retorno)',
   /function _aurixRetimeSeries\(\)[\s\S]{0,320}_aurixInvestableSnapshots\('all'\)/.test(app));
ok('1.3 los importes se comparan en moneda base, nunca en USD crudo',
   /function _aurixRetimeAmountBase[\s\S]{0,220}toBase\(n, 'USD'\)/.test(app));
{
  // misma cartera con y SIN inmuebles ⇒ el casado debe ser idéntico (los inmuebles no participan)
  FX = 1;
  const pts = ramp(T0, T0 + 20 * D, 6 * H, 100000, [{ ts: T0 + 10 * D, by: 8000 }]);
  const cands = [{ key: 'a', amountUSD: 8000, originalTs: T0 + 3 * D }];
  SERIES_SRC = build(pts, 0);       const sinRE = plan(cands).get('a');
  SERIES_SRC = build(pts, 480000);  const conRE = plan(cands).get('a');
  ok('1.4 misma decisión con y sin inmuebles (la capa inmobiliaria no altera el casado)',
     sinRE.effectiveTs === conRE.effectiveTs && sinRE.matchedStepTs === conRE.matchedStepTs &&
     sinRE.reason === conRE.reason, JSON.stringify({ sinRE: sinRE.reason, conRE: conRE.reason }));
  ok('1.5 y el escalón casado es el REAL de la serie invertible',
     sinRE.matchedStepTs === T0 + 10 * D, String(sinRE.matchedStepTs));
  // moneda base ≠ USD: la serie y los importes se escalan JUNTOS ⇒ misma decisión
  FX = 0.86; SERIES_SRC = build(pts, 0);
  const enEUR = plan(cands).get('a');
  ok('1.6 con moneda base ≠ USD la decisión no cambia (serie e importe en la misma unidad)',
     enEUR.effectiveTs === sinRE.effectiveTs && enEUR.matchedStepTs === sinRE.matchedStepTs);
  FX = 1;
}

// ── 2) TANDAS ───────────────────────────────────────────────────────────────
console.log('\n2 — tandas: la suma se corrobora contra el escalón combinado:');
{
  // Caso real: varias altas en el MISMO intervalo producen un escalón de +113.735 que ningún
  // importe individual explica. Antes: nadie se corroboraba y todos se exiliaban.
  const batchTs = T0 + 2 * D;
  const pts = ramp(T0, T0 + 20 * D, 6 * H, 800000, [{ ts: batchTs, by: 113735.68 }]);
  SERIES_SRC = build(pts, 0);
  const miembros = [
    { key: 'b1', amountUSD: 60000, originalTs: batchTs - 30 * MIN },
    { key: 'b2', amountUSD: 40000, originalTs: batchTs - 20 * MIN },
    { key: 'b3', amountUSD: 13735.68, originalTs: batchTs - 10 * MIN },
  ];
  const p = plan(miembros);
  ok('2.1 los tres miembros de la tanda CONSERVAN su ts original',
     miembros.every(m => p.get(m.key).effectiveTs === m.originalTs),
     miembros.map(m => p.get(m.key).effectiveTs - m.originalTs).join(','));
  ok('2.2 quedan marcados como corroborados en tanda', miembros.every(m => p.get(m.key).corroborated === true &&
     p.get(m.key).reason === 'corroborated_batch_at_original_ts'));
  // `matchedStepTs` = "escalón al que fui RE-TIMED". Un corroborado no se reubica ⇒ queda null,
  // igual que en el camino corroborado previo. Marcarlo haría saltar `double_matched_flow_step`
  // sobre una tanda legítima, que es el caso RESUELTO, no una ambigüedad.
  ok('2.3 una tanda corroborada NO deja matchedStepTs (no se cuenta como colisión)',
     miembros.every(m => p.get(m.key).matchedStepTs == null));
  ok('2.4 ninguno se desplaza a un escalón lejano',
     miembros.every(m => Math.abs(p.get(m.key).effectiveTs - m.originalTs) === 0));
  // un flujo solo en su intervalo sigue corroborándose como antes (sin regresión)
  const solo = plan([{ key: 's1', amountUSD: 113735.68, originalTs: batchTs - 5 * MIN }]).get('s1');
  ok('2.5 un flujo único en su intervalo mantiene el comportamiento previo',
     solo.corroborated === true && solo.reason === 'corroborated_at_original_ts');
}

// ── 3) EXCLUSIVIDAD — las DOS colisiones reales ─────────────────────────────
console.log('\n3 — exclusividad por capacidad y confianza (colisiones reales 1,932 y 1,990):');
{
  // Colisión 1 medida en producción: escalón 5.709,11 reclamado por 5.140,25 y 5.891.
  // Colisión 2: escalón 390,32 reclamado por 389,15 y 387,42.
  const s1 = T0 + 6 * D, s2 = T0 + 4 * D;
  const pts = ramp(T0, T0 + 10 * D, 6 * H, 900000, [{ ts: s2, by: 390.32 }, { ts: s1, by: 5709.11 }]);
  SERIES_SRC = build(pts, 480000);
  const c1 = [
    { key: 'c1a', amountUSD: 5140.25, originalTs: T0 + 1 * D },
    { key: 'c1b', amountUSD: 5891.00, originalTs: T0 + 1 * D + 3 * H },
  ];
  const p1 = plan(c1);
  const asignados1 = c1.map(c => p1.get(c.key).matchedStepTs).filter(x => x != null);
  ok('3.1 colisión 1: el escalón de 5.709,11 lo consume UN solo flujo',
     new Set(asignados1).size === asignados1.length && asignados1.length <= 1, JSON.stringify(asignados1));
  ok('3.2 colisión 1: gana el de MAYOR confianza (5.891 sobre 5.140)',
     p1.get('c1b').matchedStepTs === s1 && p1.get('c1a').matchedStepTs == null,
     'c1b=' + p1.get('c1b').matchedStepTs + ' c1a=' + p1.get('c1a').matchedStepTs);
  ok('3.3 colisión 1: el rechazado cae al ancla base con motivo explícito',
     /fallback_base/.test(p1.get('c1a').reason), p1.get('c1a').reason);
  const c2 = [
    { key: 'c2a', amountUSD: 389.15, originalTs: T0 + 1 * D },
    { key: 'c2b', amountUSD: 387.42, originalTs: T0 + 1 * D + 2 * H },
  ];
  const p2 = plan(c2);
  const asignados2 = c2.map(c => p2.get(c.key).matchedStepTs).filter(x => x != null);
  ok('3.4 colisión 2: el escalón de 390,32 lo consume UN solo flujo',
     asignados2.length === 1, JSON.stringify(asignados2));
  // INVARIANTE de capacidad sobre el conjunto completo
  const todos = c1.concat(c2);
  const pAll = plan(todos);
  const consumo = {};
  todos.forEach(c => { const m = pAll.get(c.key).matchedStepTs; if (m != null) consumo[m] = (consumo[m] || 0) + Math.abs(c.amountUSD); });
  const stepMag = { [s1]: 5709.11, [s2]: 390.32 };
  ok('3.5 INVARIANTE Σ asignado ≤ capacidad del escalón (|step|/0.6)',
     Object.keys(consumo).every(k => consumo[k] <= (stepMag[k] / 0.6) + 0.01),
     JSON.stringify(consumo));
  ok('3.6 INVARIANTE ningún escalón sobreconsumido (ratio ≤ 1 sobre su capacidad)',
     Object.keys(consumo).every(k => consumo[k] / (stepMag[k] / 0.6) <= 1.0001));
  ok('3.7 INVARIANTE ningún flujo asignado a dos escalones',
     todos.every(c => { const m = pAll.get(c.key).matchedStepTs; return m == null || typeof m === 'number'; }));
}

// ── 4) SUELO TEMPORAL ───────────────────────────────────────────────────────
console.log('\n4 — suelo temporal: nada anterior al primer snapshot se desplaza hacia delante:');
{
  const pts = ramp(T0, T0 + 10 * D, 6 * H, 900000, [{ ts: T0 + 6 * D, by: 5140.25 }]);
  SERIES_SRC = build(pts, 0);
  // el flujo real del 21-07 15:16, anterior al primer snapshot utilizable (22-07 18:00)
  const pre = plan([{ key: 'pre', amountUSD: 5140.25, originalTs: T0 - 27 * H }]).get('pre');
  ok('4.1 un flujo anterior al primer snapshot NO se retima hacia adelante',
     pre.effectiveTs < T0 && pre.reason === 'fallback_base_pre_history',
     pre.reason + ' @' + new Date(pre.effectiveTs).toISOString());
  ok('4.2 y no consume ningún escalón (queda como capital base)', pre.matchedStepTs == null);
  ok('4.3 el ancla base queda ESTRICTAMENTE antes del primer punto (fuera de toda ventana)',
     pre.effectiveTs < series()[0].ts);
}

// ── 5) INVARIANTES TRANSVERSALES ────────────────────────────────────────────
console.log('\n5 — invariantes transversales:');
{
  const s1 = T0 + 6 * D, s2 = T0 + 4 * D, batchTs = T0 + 2 * D;
  const pts = ramp(T0, T0 + 10 * D, 6 * H, 900000,
    [{ ts: batchTs, by: 113735.68 }, { ts: s2, by: 390.32 }, { ts: s1, by: 5709.11 }]);
  SERIES_SRC = build(pts, 480000);
  const universo = [
    { key: 'z1', amountUSD: 5140.25, originalTs: T0 - 27 * H },
    { key: 'z2', amountUSD: 5891.00, originalTs: T0 + 1 * D },
    { key: 'z3', amountUSD: 389.15, originalTs: T0 + 1 * D + 2 * H },
    { key: 'z4', amountUSD: 387.42, originalTs: T0 + 1 * D + 3 * H },
    { key: 'z5', amountUSD: 60000, originalTs: batchTs - 30 * MIN },
    { key: 'z6', amountUSD: 53735.68, originalTs: batchTs - 10 * MIN },
  ];
  const ref = plan(universo);
  // (a) orden de iteración irrelevante — se prueban varias permutaciones deterministas
  let mismos = true, detalle = '';
  for (let k = 1; k <= 5; k++) {
    const barajado = universo.map((c, i) => [c, (i * 7 + k * 13) % universo.length]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    const p = plan(barajado);
    for (const c of universo) {
      const a = ref.get(c.key), b = p.get(c.key);
      if (a.effectiveTs !== b.effectiveTs || a.matchedStepTs !== b.matchedStepTs || a.reason !== b.reason) {
        mismos = false; detalle = c.key + ': ' + a.reason + '@' + a.effectiveTs + ' vs ' + b.reason + '@' + b.effectiveTs;
      }
    }
  }
  ok('5.1 INVARIANTE resultado independiente del orden de iteración (5 permutaciones)', mismos, detalle);
  // (b) originalTs e importes intactos
  ok('5.2 INVARIANTE originalTs permanece inmutable',
     universo.every(c => ref.get(c.key).originalTs === c.originalTs));
  ok('5.3 INVARIANTE el plan no toca los importes (no los devuelve ni los reescribe)',
     universo.every(c => !('amountUSD' in ref.get(c.key))));
  // (c) capacidad global
  const consumo = {};
  universo.forEach(c => { const m = ref.get(c.key).matchedStepTs; if (m != null) consumo[m] = (consumo[m] || 0) + Math.abs(c.amountUSD); });
  const capacidad = {}; steps().forEach(s => { capacidad[s.ts] = s.capacity; });
  ok('5.4 INVARIANTE Σ asignado ≤ capacidad en TODOS los escalones del universo',
     Object.keys(consumo).every(k => consumo[k] <= (capacidad[k] || 0) + 0.01),
     JSON.stringify({ consumo, capacidad }));
  // (d) ningún flujo pre-baseline acaba dentro de la ventana
  const baseline = T0 + 1 * D;   // baseline hipotética de la ventana
  const pre = universo.filter(c => c.originalTs < baseline);
  ok('5.5 INVARIANTE ningún flujo anterior a la baseline termina dentro de la ventana',
     pre.every(c => ref.get(c.key).effectiveTs <= baseline),
     pre.filter(c => ref.get(c.key).effectiveTs > baseline).map(c => c.key).join(','));
}

// ── 6) NO REGRESIÓN DE CONTRATO ─────────────────────────────────────────────
console.log('\n6 — contrato y límites del SPEC:');
ok('6.1 _aurixFlowRetimeDecision conserva su forma pública', (() => {
  SERIES_SRC = build(ramp(T0, T0 + 10 * D, 6 * H, 900000, [{ ts: T0 + 5 * D, by: 4000 }]), 0);
  const d = vm.runInContext('_aurixFlowRetimeDecision', ctx)(4000, T0 + 1 * D);
  return ['originalTs', 'effectiveTs', 'corroborated', 'matchedStepTs', 'confidence', 'reason'].every(k => k in d);
})());
ok('6.2 un solo flujo pasa por el MISMO plan (sin segunda fuente de verdad)',
   /function _aurixFlowRetimeDecision[\s\S]{0,420}_aurixPlanFlowRetiming\(\[\{ key: '_single'/.test(app));
ok('6.3 hay UN solo planificador y UN solo punto de escritura del ledger',
   (app.match(/^function _aurixPlanFlowRetiming\(/gm) || []).length === 1 &&
   (app.match(/_aurixCaptureFlow\(c\.isSell \? 'asset_remove' : 'asset_add'/g) || []).length === 1);
ok('6.4 el backfill recolecta y planifica ANTES de escribir (no decide dentro del bucle)',
   /const candidates = \[\];[\s\S]{0,1400}const plan = _aurixPlanFlowRetiming\(candidates\);[\s\S]{0,600}_aurixCaptureFlow\(/.test(app) &&
   !/for \(const tx of a\.transactions\)[\s\S]{0,700}_aurixFlowRetimeDecision\(/.test(app));
ok('6.5 NO se tocó el guard double_matched_flow_step',
   /winFlows\.forEach\(f => \{ if \(f\.matchedStepTs != null\) stepCounts\[f\.matchedStepTs\] = \(stepCounts\[f\.matchedStepTs\] \|\| 0\) \+ 1; \}\);/.test(app) &&
   /if \(Object\.keys\(stepCounts\)\.some\(k => stepCounts\[k\] > 1\)\) untrust\.push\('double_matched_flow_step'\);/.test(app));
ok('6.6 NO se tocó _aurixComputePeriodReturn (fórmula flow-neutral intacta)',
   (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1 && /neutralDelta = rawDelta - nf\.net/.test(app));
ok('6.7 _aurixCaptureFlow, el esquema del ledger y el id siguen intactos',
   /const id = `\$\{kind\}:\$\{assetId \|\| 'cash'\}:\$\{t\}:\$\{Math\.round\(Math\.abs\(amountUSD\)\)\}`;/.test(app) &&
   (app.match(/function _aurixCaptureFlow\(/g) || []).length === 1);
ok('6.8 el backfill sigue escribiendo originalTs = ts de la transacción',
   /\{ originalTs: c\.originalTs, retimeReason: dec\.reason/.test(app));

// ── 7) FORENSE V2 DESPLEGADO ────────────────────────────────────────────────
// El diagnóstico vive en el bundle a propósito: pegarlo a mano en la consola lo corrompía.
console.log('\n7 — forense de asignación desplegado (window.aurixChartForensicsV2):');
{
  const fnV2 = (app.indexOf('window.aurixChartForensicsV2 = function') >= 0)
    ? braceSlice(app.indexOf('window.aurixChartForensicsV2 = function')) : '';
  // Todo assert de "no usa X" mira CÓDIGO, nunca comentarios: los comentarios de la propia
  // función nombran a los owners descartados y darían falsos negativos.
  const fnV2Code = fnV2.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  ok('7.1 la función existe una sola vez y acepta el rango',
     (app.match(/window\.aurixChartForensicsV2 = function/g) || []).length === 1 && /function \(range\)/.test(fnV2));
  ok('7.2 es SOLO LECTURA: no escribe ledger, storage ni histórico',
     !/_aurixSaveCapitalFlows|localStorage\.setItem|localStorage\.removeItem|_aurixCaptureFlow\(|portfolioHistory\s*=[^=]|categoryHistory\s*=[^=]|assets\s*=[^=]/.test(fnV2Code));
  ok('7.3 devuelve las claves que exige el diagnóstico',
     ['build', 'resumen', 'ledger', 'COLISIONES', 'escalones_detectados',
      'escalones_sin_flujo_asignado', 'impacto', 'ledger_completo'].every(k => new RegExp('\\b' + k + ':').test(fnV2)));
  ok('7.4 compara el importe consumido contra la magnitud REAL del escalón',
     /ratio_consumido_sobre_escalon: ratio/.test(fnV2) && /stepUSD: \+\(ph\[i\]\.value - ph\[i - 1\]\.value\)/.test(fnV2));
  ok('7.5 los huérfanos se buscan con _aurixVerticalJumps (no con _aurixCapitalStepBreaks)',
     /_aurixVerticalJumps\(/.test(fnV2Code) && !/_aurixCapitalStepBreaks/.test(fnV2Code));
  ok('7.6 no reemplaza al forense existente (ambos conviven)',
     (app.match(/window\.aurixChartForensics = function/g) || []).length === 1);
  // El id del ledger incluye el ts EFECTIVO, así que al converger varios flujos en el ancla base
  // dos transacciones del mismo activo e importe comparten id y sólo se materializa una fila. No
  // es pérdida (la fuente son las transacciones y el ancla queda fuera de toda ventana), pero debe
  // quedar DEMOSTRADO fila a fila, no afirmado.
  ok('7.7 reporta integridad del ledger derivado (qué filas no se materializan y por qué)',
     /integridad_ledger: integridad/.test(fnV2) && /registros_que_no_aparecen: colapsadas\.length/.test(fnV2) &&
     /id_compartido: fid/.test(fnV2));
  ok('7.8 distingue si algún importe colapsado caía DENTRO de la ventana (única vía de pérdida real)',
     /importe_no_materializado_DENTRO_de_ventana/.test(fnV2) && /movimientos_perdidos: colapsadas\.some\(x => x\.dentroDeVentana\)/.test(fnV2));
  ok('7.9 el bloque de integridad reusa el plan real (no reimplementa la asignación)',
     /_aurixPlanFlowRetiming\(cand\)/.test(fnV2));
  ok('7.10 y el id se recompone con el MISMO esquema que _aurixCaptureFlow',
     /c\.kind \+ ':' \+ \(c\.assetId \|\| 'cash'\) \+ ':' \+ t \+ ':' \+ Math\.round\(Math\.abs\(c\.amountUSD\)\)/.test(fnV2));
}

// ── 8) AUDITORÍA DE MATERIALIZACIÓN ─────────────────────────────────────────
// Responde "qué transacción derivable no acabó con fila y por qué", OBSERVANDO en el instante de
// la escritura. Un diagnóstico que re-planifica más tarde miente: la serie ya cambió.
console.log('\n8 — auditoría de materialización del ledger derivado:');
{
  const bf = fnSource('_aurixBackfillFlowsFromTransactions');
  const bfCode = bf.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  ok('8.1 la auditoría se construye DENTRO del backfill (mismo instante que la escritura)',
     /_aurixLastBackfillAudit = \{/.test(bfCode) && /const post = _aurixLoadCapitalFlows\(\);/.test(bfCode));
  ok('8.2 vive sólo en memoria: no se persiste ni se sincroniza',
     (app.match(/_aurixLastBackfillAudit/g) || []).length >= 3 &&
     !/localStorage\.setItem\([^)]*_aurixLastBackfillAudit/.test(app) &&
     !/_aurixLastBackfillAudit[\s\S]{0,80}JSON\.stringify[\s\S]{0,40}setItem/.test(app));
  ok('8.3 clasifica la omisión por las DOS únicas vías de _aurixCaptureFlow',
     /importe_redondea_a_cero/.test(bfCode) && /id_ya_presente/.test(bfCode));
  ok('8.4 identifica al dueño del id cuando la fila no se materializa',
     /duenoDelId: dueno \? \{ source: dueno\.source/.test(bfCode));
  ok('8.5 distingue "duplicado evitado" de "sin rastro" (la única vía de pérdida real)',
     /cubiertas_por_fila_existente/.test(bfCode) && /sin_rastro_en_el_ledger/.test(bfCode));
  ok('8.6 la gemela NO se busca excluyendo el id: la fila que ocupa el id puede ser la operación',
     /const gemela = mia \? null : post\.find/.test(bfCode) && !/f\.id !== idEsperado/.test(bfCode));
  ok('8.7 el forense lo expone y avisa si el backfill aún no ha corrido',
     /materializacion: \(typeof _aurixLastBackfillAudit !== 'undefined'\) \? _aurixLastBackfillAudit : null/.test(app));
  ok('8.8 la auditoría no reintenta ni reescribe nada (sólo lee el ledger ya escrito)',
     !/_aurixCaptureFlow\(/.test(bfCode.slice(bfCode.indexOf('const post = _aurixLoadCapitalFlows();'))) &&
     !/_aurixSaveCapitalFlows/.test(bfCode));
}

console.log('\nRESULT: ' + (fail === 0 ? 'ALL PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
