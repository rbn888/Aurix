'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-SEMANTICS-CERTIFICATION — CIERRE DE FASE 1
// ════════════════════════════════════════════════════════════════════════════
// Certifica que el 24H del Dashboard describe RENTABILIDAD ECONÓMICA REAL de las
// últimas 24 horas, después del cierre de Cash Ledger / Performance Truth (v668).
//
// No duplica lo ya certificado: la publicación 24H (AURIX-24H-PUBLICATION-NON-
// REGRESSION), la recuperación PENDING→READY (AURIX-24H-PENDING-RECOVERY), el
// recorte cosmético (AURIX-WN12-BOUNDED-RANGE-SPAN-GUARD) y la contabilidad de
// liquidez (AURIX-CASH-LEDGER-PERFORMANCE-TRUTH) tienen dueño propio. Lo que aquí
// se afirma es la SEMÁNTICA de extremo a extremo: los diez puntos del SPEC de
// cierre, sobre los owners reales, con la cadena montada como en producción:
//
//   _aurixInvestableSnapshots → _aurixEligibleInvestableSeries → _aurixRangeReturn
//     → _aurixFlowNeutralize (Pass A heurístico + Pass B ledger) → gate de sanidad
//
// Las series son ENTRADAS de la prueba; el cálculo lo hace el código de producción.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');

let pass = 0, fail = 0; const failed = [];
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failed.push(n); console.log('  ✗ ' + n + (x ? '  →  ' + x : '')); } };
function fnSource(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === '{') { d++; st = true; }
    else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
  }
  return '';
}
function stripComments(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }

const H = 36e5, T0 = 1_700_000_000_000, BASE = 83000;

console.log('\nAURIX-24H-SEMANTICS-CERTIFICATION — cierre de Fase 1\n');

// ── Cadena real montada ─────────────────────────────────────────────────────
let SRC = [], FLOWS = [];
const toBase = (v) => v;
const investableValueBase = () => BASE;
const _WSC_INTERNAL_KINDS = { asset_add: 1, asset_remove: 1, import_baseline: 1, internal_buy: 1, internal_sell: 1, internal_transfer: 1, qty_edit: 1 };
const _aurixFlowIsInternal = new Function('_WSC_INTERNAL_KINDS', fnSource('_aurixFlowIsInternal') + '\n;return _aurixFlowIsInternal;')(_WSC_INTERNAL_KINDS);
const _aurixLoadCapitalFlows = () => FLOWS.filter(f => !f.deletedAt);

// Fuente de snapshots: `category_history` normalizado (total + real_estate).
const _aurixHistorySourceForDisplay = () => SRC.map(p => ({ ts: p.ts, total: p.value, real_estate: 0 }));
const investableSnapshots = new Function(
  '_aurixHistorySourceForDisplay', '_aurixPortfolioEpoch', 'toBase', '_aurixPointValuationIncomplete', 'categoryHistory', 'Date',
  fnSource('_aurixInvestableSnapshots') + '\n;return _aurixInvestableSnapshots;')(
    _aurixHistorySourceForDisplay, () => 0, toBase, () => false, [], Date);
const eligibleSeries = new Function(
  '_aurixInvestableSnapshots', 'investableValueBase', '_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD', '_AURIX_WN12_MIN_SPAN_RETENTION', '_AURIX_WN12_BOUNDED_RANGES', '_aurixLoadCapitalFlows', 'toBase',
  fnSource('_aurixEligibleInvestableSeries') + '\n;return _aurixEligibleInvestableSeries;')(
    investableSnapshots, investableValueBase, true, 0.80, { '24h': 1, '7d': 1, '30d': 1, '1y': 1 }, _aurixLoadCapitalFlows, toBase);
// Predicado de contrapartida REAL (mismo owner que INT.02), no un stub.
const _AURIX_FLOW_MATCH_REL_TOL = Number((app.match(/const _AURIX_FLOW_MATCH_REL_TOL = ([\d.]+);/) || [])[1]);
const _aurixFlowCounterpartObserved = new Function('_AURIX_FLOW_MATCH_REL_TOL',
  fnSource('_aurixFlowCounterpartObserved') + '\n;return _aurixFlowCounterpartObserved;')(_AURIX_FLOW_MATCH_REL_TOL);
const flowNeutralize = new Function('investableValueBase', '_aurixLoadCapitalFlows', 'toBase', '_aurixFlowIsInternal', '_aurixFlowCounterpartObserved',
  fnSource('_aurixFlowNeutralize') + '\n;return _aurixFlowNeutralize;')(
    investableValueBase, _aurixLoadCapitalFlows, toBase, _aurixFlowIsInternal, _aurixFlowCounterpartObserved);
const rangeReturn = new Function(
  '_aurixEligibleInvestableSeries', '_aurixFlowNeutralize', '_AURIX_RETURN_COMPARABLE_RATIO', 'activeRange', '_aurixFlowLedgerRevision', 'window',
  fnSource('_aurixRangeReturn') + '\n;return _aurixRangeReturn;')(
    eligibleSeries, flowNeutralize, { '24h': 3.0, '7d': 3.0, '30d': 3.0, '1y': 3.0, all: 3.0 }, '24h', () => 7, undefined);

// El predicado del gate, tal y como quedó en `_aurixPerformanceSanityCheck`.
const gatePublishes = (r) => !((r.unmatchedFlows || 0) > 0);
const flat24h = (base, n) => Array.from({ length: n }, (_, i) => ({ ts: T0 + i * (24 * H / (n - 1)), value: base }));
const step = (s, at, amt) => s.map((p, i) => ({ ts: p.ts, value: i >= at ? p.value + amt : p.value }));

// ── 1 · INSTANTE BASELINE / INSTANTE CURRENT ────────────────────────────────
console.log('1 — Qué instante mide 24H:');
{
  SRC = flat24h(BASE, 25); FLOWS = [];
  const nowRef = SRC[SRC.length - 1].ts;
  const el = eligibleSeries('24h');
  const r  = rangeReturn('24h');
  ok('1.1 la ventana se ancla en el ÚLTIMO snapshot compartido, no en el reloj del dispositivo',
     /nowRef/.test(fnSource('_aurixInvestableSnapshots')) && !/const start = range === 'all' \? 0 : Date\.now\(\)/.test(app));
  ok('1.2 current = ese último snapshot', r.lastTs === nowRef, 'lastTs=' + r.lastTs + ' nowRef=' + nowRef);
  ok('1.3 baseline = primer snapshot elegible dentro de [nowRef − 24 h, nowRef]',
     r.baselineTs >= nowRef - 864e5 && r.baselineTs === el.series[0].ts,
     'baselineTs=' + r.baselineTs + ' Δ=' + ((nowRef - r.baselineTs) / H).toFixed(2) + ' h');
  ok('1.4 la ventana medida cubre 24 h reales (no un recorte cosmético)',
     (r.lastTs - r.baselineTs) >= 0.8 * 864e5, 'span=' + ((r.lastTs - r.baselineTs) / H).toFixed(2) + ' h');
  ok('1.5 nada anterior a la ventana entra en el cálculo',
     el.series.every(p => p.ts >= nowRef - 864e5));
}

// ── 2 · FLUJO EXTERNO: DEPÓSITO Y RETIRADA ──────────────────────────────────
console.log('\n2 — Depósitos y retiradas no son rentabilidad:');
{
  SRC = step(flat24h(BASE, 25), 12, 540); FLOWS = [{ id: 'f1', ts: SRC[12].ts, kind: 'deposit', amountUSD: 540 }];
  const r = rangeReturn('24h');
  ok('2.1 un depósito de 540 USD no genera rentabilidad',
     Math.abs(r.deltaPct) < 0.01 && gatePublishes(r), 'pct=' + r.deltaPct + ' neutralizado=' + r.netFlowsNeutralized);
  SRC = step(flat24h(BASE, 25), 12, -540); FLOWS = [{ id: 'f2', ts: SRC[12].ts, kind: 'withdrawal', amountUSD: -540 }];
  const w = rangeReturn('24h');
  ok('2.2 una retirada de 540 USD no genera pérdida',
     Math.abs(w.deltaPct) < 0.01 && gatePublishes(w), 'pct=' + w.deltaPct);
  ok('2.3 y ninguno queda por debajo de un umbral de materialidad (RECORD_MAT retirado)',
     Math.abs(r.netFlowsNeutralized - 540) < 1 && !/RECORD_MAT/.test(stripComments(fnSource('_aurixFlowNeutralize'))));
}

// ── 3 · MOVIMIENTO INTERNO ──────────────────────────────────────────────────
console.log('\n3 — Comprar/vender con capital existente es interno:');
{
  // El patrimonio NO cambia: el cash se convierte en BTC. Nada que neutralizar.
  SRC = flat24h(BASE, 25); FLOWS = [{ id: 'i1', ts: SRC[12].ts, kind: 'asset_add', amountUSD: 5000, assetId: 'btc' }];
  const r = rangeReturn('24h');
  ok('3.1 una compra con cash interno no altera el 24H',
     Math.abs(r.deltaPct) < 0.01, 'pct=' + r.deltaPct);
  ok('3.2 y se clasifica como INTERNA, no como aportación externa',
     _aurixFlowIsInternal('asset_add') === true && _aurixFlowIsInternal('internal_sell') === true
     && _aurixFlowIsInternal('deposit') === false && _aurixFlowIsInternal('withdrawal') === false);
  SRC = flat24h(BASE, 25); FLOWS = [{ id: 'i2', ts: SRC[12].ts, kind: 'asset_remove', amountUSD: -5000, assetId: 'btc' }];
  ok('3.3 una venta hacia cash tampoco', Math.abs(rangeReturn('24h').deltaPct) < 0.01);
}

// ── 4 · LIQUIDEZ: AÑADIR / EDITAR / ELIMINAR ────────────────────────────────
console.log('\n4 — Añadir, editar o borrar liquidez no fabrica retorno:');
{
  const mk = (amt, at) => { SRC = step(flat24h(BASE, 25), at, amt); FLOWS = [{ id: 'c1', ts: SRC[at].ts, kind: amt > 0 ? 'deposit' : 'withdrawal', amountUSD: amt, revision: 1 }]; };
  mk(500, 10);
  ok('4.1 añadir 500 → 0 %', Math.abs(rangeReturn('24h').deltaPct) < 0.01);
  // Editar 500 → 700: mismo flow_id, revisión 2, y el patrimonio refleja 700.
  SRC = step(flat24h(BASE, 25), 10, 700); FLOWS = [{ id: 'c1', ts: SRC[10].ts, kind: 'deposit', amountUSD: 700, revision: 2 }];
  ok('4.2 editar 500 → 700 sigue en 0 % (no suma 1200)',
     Math.abs(rangeReturn('24h').deltaPct) < 0.01 && Math.abs(rangeReturn('24h').netFlowsNeutralized - 700) < 1,
     'neutralizado=' + rangeReturn('24h').netFlowsNeutralized);
  // Borrar: tombstone fuera de la lectura Y el patrimonio vuelve a su sitio.
  SRC = flat24h(BASE, 25); FLOWS = [{ id: 'c1', ts: SRC[10].ts, kind: 'deposit', amountUSD: 700, revision: 3, deletedAt: T0 + 20 * H }];
  const d = rangeReturn('24h');
  ok('4.3 borrar la aportación deja 0 % y sin flujo colgando',
     Math.abs(d.deltaPct) < 0.01 && d.unmatchedFlows === 0 && gatePublishes(d),
     'pct=' + d.deltaPct + ' unmatched=' + d.unmatchedFlows);
  ok('4.4 un flujo con tombstone no entra en la lectura económica',
     _aurixLoadCapitalFlows().length === 0 && /!f\.deletedAt/.test(fnSource('_aurixLoadCapitalFlows')));
}

// ── 5 · CAMBIO DE COMPOSICIÓN ───────────────────────────────────────────────
console.log('\n5 — Cambiar la composición no fabrica retorno:');
{
  // Rotación completa: sale 20k de un activo y entra 20k en otro. Patrimonio igual.
  SRC = flat24h(BASE, 25);
  FLOWS = [{ id: 'r1', ts: SRC[8].ts,  kind: 'asset_remove', amountUSD: -20000, assetId: 'btc' },
           { id: 'r2', ts: SRC[9].ts,  kind: 'asset_add',    amountUSD:  20000, assetId: 'eth' }];
  const r = rangeReturn('24h');
  ok('5.1 una rotación 20k BTC → 20k ETH deja el 24H en 0 %', Math.abs(r.deltaPct) < 0.01, 'pct=' + r.deltaPct);
  ok('5.2 y no se contabiliza como flujo externo',
     r.netFlowsNeutralized === 0 || Math.abs(r.netFlowsNeutralized) < 1, 'neutralizado=' + r.netFlowsNeutralized);
}

// ── 6 · FAIL-CLOSED: SIN EVIDENCIA NO HAY CIFRA ─────────────────────────────
console.log('\n6 — Ausencia o retraso de snapshots no produce cifra falsa:');
{
  SRC = [{ ts: T0, value: BASE }]; FLOWS = [];
  ok('6.1 con un solo snapshot no hay retorno (no se inventa)',
     rangeReturn('24h').valid === false && rangeReturn('24h').deltaPct === null);
  SRC = []; FLOWS = [];
  ok('6.2 sin snapshots tampoco', rangeReturn('24h').valid === false);
  // Flujo registrado sin contrapartida observable: no sabemos si es mercado o capital.
  SRC = flat24h(BASE, 25); FLOWS = [{ id: 'u1', ts: SRC[12].ts, kind: 'deposit', amountUSD: 5000 }];
  const u = rangeReturn('24h');
  ok('6.3 un flujo sin contrapartida NO se resta a ciegas',
     u.unmatchedFlows === 1 && Math.abs(u.deltaPct) < 0.01, 'unmatched=' + u.unmatchedFlows + ' pct=' + u.deltaPct);
  ok('6.4 y el gate se cierra en lugar de publicar (pending_flow_reconciliation)',
     gatePublishes(u) === false && /pending_flow_reconciliation/.test(fnSource('_aurixPerformanceSanityCheck')));
  ok('6.5 el gate también exige cobertura y baseline en la serie',
     /INSUFFICIENT_ELAPSED_COVERAGE|coverage_ratio_below_floor/.test(app)
     && /baseline_not_in_series/.test(fnSource('_aurixPerformanceSanityCheck')));
  ok('6.6 y no hay delay, timeout ni LKG en ese camino',
     !/setTimeout|setInterval|lastKnownGood|\bLKG\b/i.test(stripComments(fnSource('_aurixPerformanceSanityCheck'))));
}

// ── 7 · REFRESH, RELOAD Y SEGUNDO DISPOSITIVO ───────────────────────────────
console.log('\n7 — Refresh, reload y segundo dispositivo convergen:');
{
  SRC = step(flat24h(BASE, 25), 12, 540); FLOWS = [{ id: 'f1', ts: SRC[12].ts, kind: 'deposit', amountUSD: 540 }];
  const a = rangeReturn('24h');
  const b = rangeReturn('24h');                                   // refresh: mismo input
  SRC = JSON.parse(JSON.stringify(SRC)); FLOWS = JSON.parse(JSON.stringify(FLOWS));
  const c = rangeReturn('24h');                                   // reload: round-trip de almacenamiento
  ok('7.1 refresh no cambia el 24H', a.deltaPct === b.deltaPct && a.baselineTs === b.baselineTs);
  ok('7.2 reload tampoco', a.deltaPct === c.deltaPct && a.netFlowsNeutralized === c.netFlowsNeutralized);
  ok('7.3 el windowing es determinista entre dispositivos (ancla en dato, no en reloj)',
     /if \(!\(nowRef > 0\)\) nowRef = Date\.now\(\);/.test(fnSource('_aurixInvestableSnapshots')),
     'Date.now() sólo como último recurso defensivo con fuente vacía');
  ok('7.4 el badge autenticado se lee del performance_state remoto, no de un cómputo local',
     /performance_state/.test(fnSource('_mergeRemoteState')) && /byRange/.test(app));
  ok('7.5 y el ledger de flujos se reconcilia en el mismo ciclo remoto (v668)',
     /_aurixCapitalFlowsPull\(\); \} catch \(_\) \{\}/.test(app));
}

// ── 8 · % Y $ CUENTAN LA MISMA HISTORIA ─────────────────────────────────────
console.log('\n8 — % y $ son la misma historia económica:');
{
  SRC = flat24h(BASE, 25).map((p, i) => ({ ts: p.ts, value: BASE * (1 + 0.02 * i / 24) }));
  FLOWS = [];
  const r = rangeReturn('24h');
  const pctFromAbs = (r.deltaAbs / r.startValue) * 100;
  ok('8.1 deltaPct === deltaAbs / startValue (mismo par baseline/current)',
     Math.abs(r.deltaPct - pctFromAbs) < 0.01, 'pct=' + r.deltaPct + ' vs ' + pctFromAbs.toFixed(4));
  ok('8.2 ambos salen de la serie NEUTRALIZADA, no uno de cruda y otro de neutral',
     r.startValue === +r.startValue && /const first = adj\[0\], last = adj\[adj\.length - 1\]/.test(fnSource('_aurixRangeReturn')));
  ok('8.3 el gate rechaza que % y $ discrepen del baseline publicado',
     /pct_value_baseline_incoherent/.test(fnSource('_aurixPerformanceSanityCheck')));
  ok('8.4 y el bruto sin neutralizar se conserva aparte para auditoría, no para mostrar',
     Number.isFinite(r.grossDeltaPct) && /grossDeltaPct/.test(fnSource('_aurixRangeReturn')));
}

// ── 9 · GRÁFICO Y BADGE NO PUEDEN CONTRADECIRSE ─────────────────────────────
console.log('\n9 — Gráfico y badge comparten semántica:');
{
  SRC = step(flat24h(BASE, 25), 12, 540); FLOWS = [{ id: 'f1', ts: SRC[12].ts, kind: 'deposit', amountUSD: 540 }];
  const el = eligibleSeries('24h');
  const r  = rangeReturn('24h');
  ok('9.1 ambos consumen la MISMA serie elegible',
     r.points === el.series.length, 'return=' + r.points + ' pts vs elegible=' + el.series.length);
  ok('9.2 y la misma neutralización de flujos (un solo owner)',
     (app.match(/^function _aurixFlowNeutralize\(/gm) || []).length === 1
     && (app.match(/^function _aurixEligibleInvestableSeries\(/gm) || []).length === 1);
  ok('9.3 el recorte cosmético no puede redefinir la ventana financiera (guard WN.12)',
     /_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD = true/.test(app) && /_AURIX_WN12_MIN_SPAN_RETENTION = 0\.80/.test(app));
  ok('9.4 la retención mínima es el mismo 0,80 que la autoridad de cobertura del rango',
     /_AURIX_24H_COVERAGE_THR = 0\.8/.test(app));
  {
    // Prueba dura: un lead-in denso y plano que WN.12 querría recortar entero.
    const dense = [];
    for (let i = 0; i < 40; i++) dense.push({ ts: T0 + i * 60000, value: BASE });          // 40 min a 1/min
    for (let i = 1; i <= 20; i++) dense.push({ ts: T0 + 40 * 60000 + i * H, value: BASE }); // luego 20 h
    SRC = dense; FLOWS = [];
    const rr = rangeReturn('24h');
    const span = (rr.lastTs - rr.baselineTs) / H;
    ok('9.5 con lead-in denso, la ventana medida sigue siendo la del rango (no 1,75 h)',
       span >= 0.8 * 20, 'span medido=' + span.toFixed(2) + ' h sobre ~20 h disponibles');
  }
}

// ── 10 · CASH LEDGER v668 EN LA RUTA REAL, SIN ATAJOS ───────────────────────
console.log('\n10 — Cash Ledger v668 y capital_flows están en el camino real:');
{
  ok('10.1 la neutralización lee el ledger de capital (único origen de flujos)',
     /_aurixLoadCapitalFlows\(\)/.test(fnSource('_aurixFlowNeutralize')));
  ok('10.2 ese ledger excluye tombstones', /!f\.deletedAt/.test(fnSource('_aurixLoadCapitalFlows')));
  ok('10.3 y se alimenta del ledger REMOTO (capital_flows), no sólo del dispositivo',
     /from\('capital_flows'\)\s*\n?\s*\.select\(/.test(app) && /function _aurixCapitalFlowsPull/.test(app));   // la lectura es ahora PAGINADA: `.select(` puede ir en otra línea
  ok('10.4 toda operación de liquidez pasa por el owner económico único',
     (app.match(/aurixCashOperation\('deposit'/g) || []).length >= 2
     && (app.match(/aurixCashOperation\('withdrawal'/g) || []).length >= 1);
  ok('10.5 NO queda una ruta antigua de cash que escriba saldo sin ledger',
     !/existingCash\.qty\s*=\s*\+\(existingCash\.qty \+ qty\)/.test(app),
     'el modal de liquidez volvería a mutar el saldo por su cuenta');
  ok('10.6 sólo hay UN reductor de retorno por rango y UN gate de publicación',
     (app.match(/^function _aurixRangeReturn\(/gm) || []).length === 1
     && (app.match(/^function _aurixPerformanceSanityCheck\(/gm) || []).length === 1);
  ok('10.7 el gate consume la evidencia de reconciliación del ledger',
     /out\.unmatchedFlows\s*=\s*ret \?/.test(app) && /unmatchedFlows \|\| 0\) > 0/.test(fnSource('_aurixPerformanceSanityCheck')));
  ok('10.8 y la revisión del ledger viaja con el cálculo',
     /flowLedgerRevision/.test(fnSource('_aurixPerformanceSanityCheck')) && /function _aurixFlowLedgerRevision/.test(app));
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
