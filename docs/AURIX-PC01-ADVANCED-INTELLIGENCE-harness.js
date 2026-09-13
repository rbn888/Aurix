'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PC01-ADVANCED-INTELLIGENCE — la foundation de Advanced Intelligence
// ════════════════════════════════════════════════════════════════════════════
// QUÉ SE CERTIFICA AQUÍ: la PROYECCIÓN. `_aurixAdvancedIntelligence` no calcula
// dinero — traduce lo que ya certificaron INT.02/INT.03, `_aurixHealthSnapshot` y
// `_aurixEffectiveDiversification` en un modelo direccionable con disponibilidad,
// cobertura y códigos de causa. Así que el owner se CARGA DE VERDAD en un sandbox
// (nada de grep sobre su fuente para afirmar comportamiento) y sus ENTRADAS son
// fixtures deterministas: eso es lo contrario de stubear lo certificado — las
// entradas son datos, el owner bajo prueba es el que se ejecuta.
//
// Los umbrales NO se reescriben aquí: se extraen los reales de app.js
// (`_AURIX_FACT_MATERIAL`, `_AURIX_FACT_STATUS`, …). Un harness con sus propios
// números certificaría un producto que no existe.
//
// NO se re-audita lo que ya tiene gate (CLAUDE.md §6): la matemática de INT.02, el
// fact ledger y el dedup por raíz causal de INT.03, el radar de INT.07, el
// resolutor de entitlements ni billing.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function block(startStr, endStr) {
  const i = src.indexOf(startStr); if (i < 0) throw new Error('missing ' + startStr);
  const e = src.indexOf(endStr, i); if (e < 0) throw new Error('missing ' + endStr);
  return src.slice(i, e + endStr.length);
}
function fnSrc(name) {
  const s = 'function ' + name + '('; const i = src.indexOf(s);
  if (i < 0) throw new Error('missing fn ' + name);
  let k = src.indexOf('{', i), d = 0;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}

// Contratos REALES del Core que la proyección consume.
const CORE_CONSTS = block('const _AURIX_FACT_STATUS = Object.freeze({', '  effectiveNRatio:  0.6,');
const CORE_TAIL   = block('  top3MinPct:       70,', '});');
const OBS_CONST   = block('const _AURIX_INVPERF_HIGH_CONFIDENCE_OBS', ';');
// El bloque PC.01 entero, tal cual está en producción.
const PC01 = block('const _AURIX_AI_AVAIL = Object.freeze({',
                   "        + 'unavailable never becomes 0; no aggregate wealth-health score.',\n  });\n}");

const sandbox = {
  console, Object, Number, Math, Array, Set, JSON, isNaN, isFinite,
  _AURIX_CATHIST_INVESTABLE: ['stock', 'etf', 'fund', 'crypto', 'metal', 'liquidity', 'other'],
};
sandbox.window = undefined;
vm.createContext(sandbox);
// `const` en un script de vm vive en el ámbito léxico del script, NO en el objeto
// de contexto: hay que exportar explícitamente lo que el harness va a ejercer.
const EXPORTS = '\nglobalThis._aurixAdvancedIntelligence = _aurixAdvancedIntelligence;'
  + '\nglobalThis._AURIX_FACT_STATUS = _AURIX_FACT_STATUS;'
  + '\nglobalThis._AURIX_FACT_MATERIAL = _AURIX_FACT_MATERIAL;';
vm.runInContext(CORE_CONSTS + '\n' + CORE_TAIL + '\n' + OBS_CONST + '\n' + PC01 + EXPORTS, sandbox);
const AI = sandbox._aurixAdvancedIntelligence;
const ST = sandbox._AURIX_FACT_STATUS, MAT = sandbox._AURIX_FACT_MATERIAL;

let pass = 0, fail = 0;
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
function group(n) { console.log('\n' + n); }

// ── FIXTURES ────────────────────────────────────────────────────────────────
const snap = (o) => Object.assign({
  totUSD: 100000, assetCount: 6, categoryCount: 4, cashPct: 10, cryptoPct: 10,
  realEstatePct: 0, liquidPct: 100, uncertifiablePositions: 0,
  topInvestedAsset: { name: 'VWCE', type: 'etf', pctTotal: 22 },
  topCategory: { type: 'etf', pctTotal: 40 }, worstAsset: null, bestAsset: null,
}, o || {});
const div = (o) => Object.assign({
  status: ST.AVAILABLE, reason: '', positions: 6, hhi: 0.18, effectiveN: 5.56,
  topWeightPct: 22, denominator: 'investable_value_usd', unit: 'positions',
}, o || {});
const fact = (o) => Object.assign({
  semanticKey: 'x', family: 'exposure', causalRoot: 'category_mix', value: 0, unit: 'percent',
  values: {}, window: { range: '30D', startAt: 1, endAt: 2 }, direction: 'flat',
  materiality: 0.5, magnitude: 0.3, confidence: 1, priority: 0.5,
}, o || {});
const core = (facts, gaps, obs) => ({
  version: 'int03', generatedAt: 1700000000000,
  ledger: { facts: facts || [], gaps: gaps || [] },
  dataAvailability: { observation: obs || { observations: 12, startAt: 1, endAt: 2, spanMs: 1 } },
});
const EMPTY_SNAP = snap({ totUSD: 0, assetCount: 0, categoryCount: 0, cashPct: 0,
  topInvestedAsset: null, topCategory: null });

const RET = (pct) => fact({ semanticKey: 'investable_return_30d', family: 'performance',
  causalRoot: 'investable_return', value: pct, unit: 'percent', confidence: 1,
  window: { range: '30D', startAt: 1, endAt: 2 } });
const CAP = (usd) => fact({ semanticKey: 'recorded_capital_net', family: 'capital_flow',
  causalRoot: 'external_capital', value: usd, unit: 'usd' });
const LEVEL = (pct, startUSD) => fact({ semanticKey: 'investable_level_change',
  family: 'wealth_level', causalRoot: 'wealth_level', value: pct, unit: 'percent',
  direction: pct > 0 ? 'up' : 'down', values: { startUSD }, changeFact: true });
const CASHDRIFT = (pp, startPct) => fact({ semanticKey: 'cash_drift_liquidity_30D',
  family: 'liquidity', causalRoot: 'cash_weight', value: pp, unit: 'percentage_points',
  values: { startPct, endPct: startPct + pp, deltaPp: pp, category: 'liquidity' },
  direction: pp > 0 ? 'up' : 'down' });
const EXPDRIFT = (cat, pp, startPct) => fact({ semanticKey: 'exposure_drift_' + cat + '_30D',
  family: 'exposure', causalRoot: 'category_mix', value: pp, unit: 'percentage_points',
  values: { startPct, endPct: startPct + pp, deltaPp: pp, category: cat },
  direction: pp > 0 ? 'up' : 'down', materiality: 0.55, priority: 0.55 });

// ── A · CONTRATO Y PUREZA ───────────────────────────────────────────────────
group('A · contrato · un owner canónico, puro y sin verdad propia');
const bareBlock = PC01.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
ok('A.1 el owner existe y es una función', typeof AI === 'function');
ok('A.2 no persiste NADA: ni localStorage ni sessionStorage ni IndexedDB',
  !/localStorage|sessionStorage|indexedDB|AurixRuntime/.test(bareBlock));
ok('A.3 no registra listeners ni temporizadores (no hay bucle de render)',
  !/addEventListener|setInterval|setTimeout|requestAnimationFrame/.test(bareBlock));
ok('A.4 no consulta el entitlement: la VERDAD es la misma para Free y Premium',
  !/hasFeature|requireFeature|_aurixEnt\b|_aurixEntitlements|isPremium/.test(bareBlock));
ok('A.5 no emite copy: cero llamadas a la función de traducción',
  !/\bt\(['"]/.test(bareBlock) && !/switchLang|lang ===/.test(bareBlock));
ok('A.6 NO recalcula dinero: no llama a ningún agregador financiero propio',
  !/investableValueUSD|assetValueUSD|computeAurixTWRSeries|_aurixInvestablePerformance|_aurixTwrChain/.test(bareBlock));
// Se NOMBRA en `legacyScoreOwner` a propósito (trazabilidad); lo prohibido es
// LLAMARLO: consumirlo importaría a esta capa los juicios que el §7 rechaza.
ok('A.7 no consume el score heredado: lo nombra, nunca lo invoca',
  !/_aurixHealthScore\s*\(/.test(bareBlock) && /legacyScoreOwner/.test(bareBlock));
const r1 = AI({ core: core([RET(4)]), snapshot: snap(), diversification: div(), categoryWeights: null, top3Pct: 55 });
const r2 = AI({ core: core([RET(4)]), snapshot: snap(), diversification: div(), categoryWeights: null, top3Pct: 55 });
ok('A.8 determinista: la misma entrada produce EXACTAMENTE la misma salida (recarga)',
  JSON.stringify(r1) === JSON.stringify(r2));
ok('A.9 declara sus fuentes, así que una cifra siempre es rastreable',
  !!(r1.sources && r1.sources.core === 'int03' && r1.sources.diversification === 'aurixEffectiveDiversification'));

// ── B · MODELO CANÓNICO A–H ─────────────────────────────────────────────────
group('B · modelo canónico · las siete dimensiones son direccionables');
const DIMS = ['structure', 'concentration', 'diversification', 'liquidity', 'evolution', 'stability', 'growth'];
ok('B.1 existen las 7 dimensiones + confianza', DIMS.every(d => !!r1.model[d]) && !!r1.model.confidence);
ok('B.2 cada dimensión publica availability + coverage + reason',
  DIMS.every(d => ['available', 'partial', 'unavailable'].includes(r1.model[d].availability)
    && ['sufficient', 'partial', 'unavailable'].includes(r1.model[d].coverage)
    && typeof r1.model[d].reason === 'string'));
ok('B.3 STABILITY es unavailable con causa, no 0',
  r1.model.stability.availability === 'unavailable'
  && r1.model.stability.reason === 'no_volatility_engine'
  && r1.model.stability.value === null);
ok('B.4 GROWTH es unavailable con causa, y la causa es la ESCALA (no el valor)',
  r1.model.growth.availability === 'unavailable'
  && r1.model.growth.reason === 'growth_scale_undefined'
  && r1.model.growth.value === null);
ok('B.5 ninguna dimensión unavailable publica un número',
  DIMS.filter(d => r1.model[d].availability === 'unavailable')
      .every(d => { const m = r1.model[d];
        return [m.value, m.topWeightPct, m.effectiveN, m.cashPct, m.returnPct]
          .every(v => v === undefined || v === null); }));
ok('B.6 estructura publica total, cuentas y top, todo del snapshot certificado',
  r1.model.structure.availability === 'available'
  && r1.model.structure.totalInvestable === 100000 && r1.model.structure.assetCount === 6
  && r1.model.structure.topPosition.pct === 22);
ok('B.7 los pesos por categoría declaran su LIMITACIÓN y no se inventan',
  r1.model.structure.categoryWeights === null
  && r1.model.structure.categoryWeightsReason.length > 0);
// El reader de historia de categorías tiene un contrato de contención con UN
// consumidor declarado (`_aurixFactLedger`), fijado por su propio gate. PC.01 NO
// lo ensancha: declara la limitación. Esta aserción convierte esa decisión en
// propiedad certificada, de modo que cablearlo exija una decisión explícita.
ok('B.7b PC.01 NO llama al reader protegido de historia de categorías',
  !/_aurixCatExposureDelta|_aurixCatHistWindow|_aurixCatExposurePct/.test(bareBlock));
ok('B.7c …y la causa nombra el contrato, no un fallo genérico',
  AI({ core: core([]), snapshot: snap(), diversification: div() })
    .model.structure.categoryWeightsReason === 'category_reader_single_consumer_contract');
const rw = AI({ core: core([]), snapshot: snap(), diversification: div(),
  categoryWeights: { rows: [{ category: 'etf', pct: 40 }, { category: 'crypto', pct: 30 }], reason: '' } });
ok('B.8 …y con el reader disponible los publica ordenados por peso',
  rw.model.structure.categoryWeights.length === 2
  && rw.model.structure.categoryWeights[0].category === 'etf');

// ── C · CARTERA VACÍA / UN ACTIVO / SOLO LIQUIDEZ ───────────────────────────
group('C · carteras degeneradas · el caso vacío no puede parecer sano');
const rEmpty = AI({ core: core([]), snapshot: EMPTY_SNAP,
  diversification: div({ status: ST.UNAVAILABLE_SOURCE, reason: 'no_positions', positions: 0, hhi: null, effectiveN: null, topWeightPct: null }),
  categoryWeights: null });
ok('C.1 cartera VACÍA: estructura unavailable con causa', rEmpty.model.structure.availability === 'unavailable'
  && rEmpty.model.structure.reason === 'no_positions');
ok('C.2 …y NO se publica ni concentración ni diversificación',
  rEmpty.model.concentration.availability === 'unavailable'
  && rEmpty.model.diversification.availability === 'unavailable');
ok('C.3 …y la confianza global es unavailable, no "suficiente por defecto"',
  rEmpty.model.confidence.overall === 'unavailable');
ok('C.4 …y no se fabrica ningún insight de atención con números',
  rEmpty.attention.every(i => i.currentValue === null));
const rOne = AI({ core: core([]), snapshot: snap({ assetCount: 1, cashPct: 0, categoryCount: 1,
    topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 100 }, topCategory: { type: 'crypto', pctTotal: 100 } }),
  diversification: div({ positions: 1, hhi: 1, effectiveN: 1, topWeightPct: 100 }), categoryWeights: null });
ok('C.5 UN activo: concentración = posición dominante al 100%',
  rOne.model.concentration.semanticLabel === 'dominant_position'
  && rOne.model.concentration.topWeightPct === 100);
ok('C.6 …y la diversificación NO premia el caso degenerado (ratio 1 con 1 posición)',
  rOne.model.diversification.semanticLabel === 'insufficient_evidence'
  && rOne.model.diversification.reason === 'single_position');
const rCash = AI({ core: core([]), snapshot: snap({ assetCount: 1, cashPct: 100, categoryCount: 1,
    topInvestedAsset: null, topCategory: { type: 'liquidity', pctTotal: 100 } }),
  diversification: div({ positions: 1, hhi: 1, effectiveN: 1, topWeightPct: 100 }), categoryWeights: null });
ok('C.7 SOLO LIQUIDEZ: la liquidez se publica al 100% sin emitir juicio',
  rCash.model.liquidity.cashPct === 100 && rCash.model.liquidity.judgement === null);
ok('C.8 …y ningún código de explicación dice si eso es bueno o malo',
  rCash.insights.every(i => !/good|bad|healthy|unhealthy|poor|risky|should/i.test(i.explanationCode)));

// ── D · CONCENTRACIÓN vs DIVERSIFICACIÓN (no-vacuidad) ──────────────────────
group('D · no-vacuidad · carteras distintas → conclusiones distintas');
const CONC = { core: core([]), categoryWeights: null,
  snapshot: snap({ assetCount: 5, cryptoPct: 70, topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 68 }, topCategory: { type: 'crypto', pctTotal: 70 } }),
  diversification: div({ positions: 5, hhi: 0.49, effectiveN: 2.04, topWeightPct: 68 }) };
const DIVERS = { core: core([]), categoryWeights: null, snapshot: snap(),
  diversification: div({ positions: 9, hhi: 0.12, effectiveN: 8.33, topWeightPct: 16 }) };
const rConc = AI(CONC), rDiv = AI(DIVERS);
ok('D.1 cartera CONCENTRADA → dominant_position', rConc.model.concentration.semanticLabel === 'dominant_position');
ok('D.2 cartera REPARTIDA → balanced', rDiv.model.concentration.semanticLabel === 'balanced');
ok('D.3 …y "balanced" está MEDIDO (available), no es silencio',
  rDiv.model.concentration.availability === 'available' && rDiv.model.concentration.coverage === 'sufficient');
ok('D.4 muchos activos con pesos desiguales NO es patrimonio repartido',
  rConc.model.diversification.semanticLabel === 'spread_lopsided' && rConc.model.diversification.positions === 5);
ok('D.5 …y con pesos parejos sí lo es', rDiv.model.diversification.semanticLabel === 'spread_even');
ok('D.6 las dos carteras producen ATENCIÓN distinta (no-vacuidad)',
  JSON.stringify(rConc.attention.map(i => [i.id, i.semanticLabel]))
  !== JSON.stringify(rDiv.attention.map(i => [i.id, i.semanticLabel])));
ok('D.7 la concentrada eleva la severidad a worth_reviewing',
  rConc.attention.some(i => i.dimension === 'concentration' && i.severity === 'worth_reviewing'));
ok('D.8 la repartida la deja en informational, sin alarmismo',
  rDiv.insights.find(i => i.dimension === 'concentration').severity === 'informational');
ok('D.9 se declara el límite de PROFUNDIDAD: sector/geografía/correlación no son medibles',
  rDiv.model.diversification.depthLimitation === 'sector_geography_correlation_not_supported');
const rRE = AI({ core: core([]), categoryWeights: null,
  snapshot: snap({ realEstatePct: 72, topInvestedAsset: { name: 'Piso', type: 'real_estate', pctTotal: 72 }, topCategory: { type: 'real_estate', pctTotal: 72 } }),
  diversification: div({ positions: 4, hhi: 0.55, effectiveN: 1.82, topWeightPct: 72 }) });
ok('D.10 cartera con INMUEBLE pesado: se publica su peso sin re-definir la fuente',
  rRE.model.structure.realEstatePct === 72 && rRE.model.concentration.topWeightPct === 72);

// ── E · LIQUIDEZ ────────────────────────────────────────────────────────────
group('E · liquidez · nivel y deriva, sin decir si subir o bajar es mejor');
const rLiqUp = AI({ core: core([CASHDRIFT(9, 6)]), snapshot: snap({ cashPct: 15 }), diversification: div(), categoryWeights: null });
const rLiqDn = AI({ core: core([CASHDRIFT(-8, 18)]), snapshot: snap({ cashPct: 10 }), diversification: div(), categoryWeights: null });
ok('E.1 deriva al alza → increasing, con ventana y valor previo',
  rLiqUp.model.liquidity.semanticLabel === 'increasing' && rLiqUp.model.liquidity.changePp === 9
  && rLiqUp.model.liquidity.previousPct === 6 && rLiqUp.model.liquidity.window === '30D');
ok('E.2 deriva a la baja → decreasing', rLiqDn.model.liquidity.semanticLabel === 'decreasing');
ok('E.3 sin deriva medida: nivel disponible pero cobertura PARCIAL con causa',
  rDiv.model.liquidity.availability === 'available' && rDiv.model.liquidity.coverage === 'partial'
  && rDiv.model.liquidity.reason === 'no_measured_drift');
ok('E.4 un movimiento material de liquidez es notable_change (no "malo")',
  rLiqUp.insights.find(i => i.dimension === 'liquidity').severity === 'notable_change');
ok('E.5 el insight de liquidez lleva actual, previo y cambio con unidad',
  (() => { const i = rLiqUp.insights.find(x => x.dimension === 'liquidity');
    return i.currentValue === 15 && i.previousValue === 6
      && i.change.unit === 'percentage_points' && i.change.value === 9; })());

// ── F · EVOLUCIÓN / HISTORIA / FLUJOS ───────────────────────────────────────
group('F · evolución · mercado y capital separados sólo cuando se puede');
const rNoHist = AI({ core: core([], [{ family: 'performance', semanticKey: 'investable_return_30d',
    status: ST.INSUFFICIENT_HISTORY, reason: 'history_too_short' }]),
  snapshot: snap(), diversification: div(), categoryWeights: null });
ok('F.1 HISTORIA INSUFICIENTE: evolución unavailable con el reason del ledger',
  rNoHist.model.evolution.availability === 'unavailable'
  && rNoHist.model.evolution.reason === 'history_too_short'
  && rNoHist.model.evolution.returnPct === null);
ok('F.2 …y eso produce un insight de EVIDENCIA INSUFICIENTE, que es una conclusión',
  rNoHist.insights.some(i => i.severity === 'insufficient_evidence'
    && i.reasonCode === 'history_too_short' && i.currentValue === null));
const rHist = AI({ core: core([RET(7.4), CAP(5000)]), snapshot: snap(), diversification: div(), categoryWeights: null });
ok('F.3 HISTORIA SUFICIENTE + aportación: mercado y capital son separables',
  rHist.model.evolution.marketVsFlowSeparable === true
  && rHist.model.evolution.returnPct === 7.4 && rHist.model.evolution.recordedCapitalNet === 5000);
ok('F.4 …y el código lo dice explícitamente',
  rHist.insights.find(i => i.dimension === 'evolution').explanationCode === 'evolution_market_and_capital_separable');
const rLvlOnly = AI({ core: core([LEVEL(12, 80000)]), snapshot: snap(), diversification: div(), categoryWeights: null });
ok('F.5 con SOLO nivel, el retorno no se sustituye por la variación de nivel',
  rLvlOnly.model.evolution.returnPct === null && rLvlOnly.model.evolution.marketVsFlowSeparable === false
  && rLvlOnly.insights.find(i => i.dimension === 'evolution').explanationCode === 'evolution_level_only');
const rWd = AI({ core: core([RET(-3.2), CAP(-4000)]), snapshot: snap(), diversification: div(), categoryWeights: null });
ok('F.6 RETIRADA (capital negativo) se publica tal cual, sin suavizar la pérdida',
  rWd.model.evolution.recordedCapitalNet === -4000 && rWd.model.evolution.returnPct === -3.2
  && rWd.model.evolution.semanticLabel === 'decreasing');
const rLowObs = AI({ core: core([RET(5)], [], { observations: 2, startAt: 1, endAt: 2, spanMs: 1 }),
  snapshot: snap(), diversification: div(), categoryWeights: null });
ok('F.7 COBERTURA PARCIAL: poca densidad de observación baja la cobertura y la confianza',
  rLowObs.model.evolution.coverage === 'partial'
  && rLowObs.model.evolution.reason === 'low_observation_density'
  && rLowObs.insights.find(i => i.dimension === 'evolution').confidence === 0.6);

// ── G · DATOS DE MERCADO NO DISPONIBLES / PARCIALES ─────────────────────────
group('G · datos ausentes · unavailable sigue siendo unavailable');
const rUnval = AI({ core: core([]), snapshot: snap(),
  diversification: div({ status: ST.LOW_CONFIDENCE, reason: 'unvalued_position', hhi: null, effectiveN: null, topWeightPct: null }),
  categoryWeights: null });
ok('G.1 una posición sin valorar: diversificación NO se publica, y dice por qué',
  rUnval.model.diversification.availability === 'unavailable'
  && rUnval.model.diversification.reason === 'unvalued_position'
  && rUnval.model.diversification.effectiveN === null);
ok('G.2 …pero la cobertura reconoce que hay evidencia parcial (no la borra)',
  rUnval.model.diversification.coverage === 'partial');
ok('G.3 …y la concentración cae al snapshot declarándolo (coverage parcial + reason)',
  rUnval.model.concentration.availability === 'available'
  && rUnval.model.concentration.coverage === 'partial'
  && rUnval.model.concentration.reason === 'snapshot_fallback'
  && rUnval.sources.concentration === 'aurixHealthSnapshot');
const rUncert = AI({ core: core([]), snapshot: snap({ uncertifiablePositions: 2 }), diversification: div(), categoryWeights: null });
ok('G.4 posiciones no certificables degradan la COBERTURA de la estructura',
  rUncert.model.structure.coverage === 'partial'
  && rUncert.model.structure.reason === 'uncertifiable_positions');
ok('G.5 la confianza global se declara PARCIAL si alguna dimensión lo es',
  rUncert.model.confidence.overall === 'partial');
ok('G.6 la confianza expone cuántas dimensiones hay y los códigos de hueco',
  rNoHist.model.confidence.dimensionsTotal === 7
  && rNoHist.model.confidence.gapReasons.includes('history_too_short'));

// ── H · TOP 3 ATENCIÓN ──────────────────────────────────────────────────────
group('H · atención · pocas conclusiones, ordenadas y sin repetir la misma');
const rMany = AI({ core: core([RET(9), CAP(8000), CASHDRIFT(11, 5), EXPDRIFT('crypto', 14, 30)]),
  snapshot: snap({ cashPct: 16, topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 61 } }),
  diversification: div({ positions: 7, hhi: 0.41, effectiveN: 2.44, topWeightPct: 61 }),
  categoryWeights: null });
ok('H.1 la atención está acotada a 3', rMany.attention.length === 3);
ok('H.2 hay más insights que tarjetas: se prioriza, no se vacía el cajón',
  rMany.insights.length > rMany.attention.length);
ok('H.3 cada tarjeta es de una dimensión/categoría distinta (no tres versiones de lo mismo)',
  new Set(rMany.attention.map(i => i.dimension + '|' + i.category)).size === 3);
ok('H.4 se ordena por prioridad descendente',
  rMany.attention.every((i, k, a) => k === 0 || a[k - 1].priority >= i.priority));
ok('H.5 la SELECCIÓN la decide la materialidad: lo más material no se cae',
  rMany.attention.some(i => i.materiality === Math.max.apply(null, rMany.insights.map(x => x.materiality))));
ok('H.6 el límite es configurable sin tocar el owner',
  AI(Object.assign({ attentionLimit: 1 }, CONC)).attention.length === 1);
ok('H.7 la atención es estáble entre llamadas (ids idénticos)',
  JSON.stringify(AI(CONC).attention.map(i => i.id)) === JSON.stringify(rConc.attention.map(i => i.id)));

// ── I · FORMA DEL INSIGHT ───────────────────────────────────────────────────
group('I · forma del insight · todo lo que exige el SPEC, y nada traducido');
const FIELDS = ['id', 'dimension', 'category', 'severity', 'fact', 'explanationCode', 'evidence',
  'confidence', 'coverage', 'availability', 'currentValue', 'previousValue', 'change',
  'unit', 'semanticLabel', 'reasonCode', 'materiality', 'priority'];
ok('I.1 todo insight lleva los 18 campos del contrato',
  rMany.insights.every(i => FIELDS.every(f => f in i)));
ok('I.2 los id son estables y únicos', new Set(rMany.insights.map(i => i.id)).size === rMany.insights.length
  && rMany.insights.every(i => /^ai_[a-z0-9_]+$/.test(i.id)));
ok('I.3 la severidad sale del vocabulario semántico, sin good/bad',
  rMany.insights.every(i => ['notable_change', 'worth_reviewing', 'informational', 'insufficient_evidence'].includes(i.severity)));
ok('I.4 cada insight medible referencia la EVIDENCIA que lo sostiene',
  rMany.insights.filter(i => i.availability === 'available').every(i => Array.isArray(i.evidence)));
ok('I.5 la evidencia son semanticKeys REALES del ledger, no inventadas',
  (() => { const keys = rMany.insights.flatMap(i => i.evidence);
    const have = core([RET(9), CAP(8000), CASHDRIFT(11, 5), EXPDRIFT('crypto', 14, 30)]).ledger.facts.map(f => f.semanticKey);
    return keys.length > 0 && keys.every(k => have.includes(k)); })());
ok('I.6 ningún campo emitido contiene una frase traducida (sólo códigos y datos)',
  (() => {
    // Una frase traducida lleva ESPACIOS; un código nunca. Se exceptúa `name`,
    // que es el nombre real del activo —dato del usuario, no copy— y sí puede
    // llevar espacios ("Banco Santander").
    const bad = [];
    (function walk(v, key) {
      if (typeof v === 'string') { if (key !== 'name' && /\s/.test(v)) bad.push(key + '=' + v); return; }
      if (Array.isArray(v)) { v.forEach(x => walk(x, key)); return; }
      if (v && typeof v === 'object') { Object.keys(v).forEach(k => walk(v[k], k)); }
    })({ model: rMany.model, insights: rMany.insights, attention: rMany.attention,
         wealthHealth: rMany.wealthHealth, experience: rMany.experience }, 'root');
    return bad.length === 0 ? true : bad;
  })() === true);
ok('I.6b …y no hay texto en castellano ni inglés natural en ningún código',
  (() => { const strs = [];
    (function walk(v) { if (typeof v === 'string') strs.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(rMany.insights);
    return strs.every(s => !/[áéíóúñ¿¡]/i.test(s)); })());
ok('I.7 no hay lenguaje prescriptivo en ningún código emitido',
  rMany.insights.every(i => !/should|must|buy|sell|recommend|advice|rebalance/i.test(
    i.explanationCode + '|' + i.severity + '|' + (i.semanticLabel || ''))));

// ── J · WEALTH HEALTH ───────────────────────────────────────────────────────
group('J · wealth health · sin score agregado, y dicho con causa');
ok('J.1 NO se fabrica un agregado', rMany.wealthHealth.aggregate === null
  && rMany.wealthHealth.aggregateDeferred === true);
ok('J.2 el diferimiento tiene causa explícita y revisable',
  /weights_not_justifiable/.test(rMany.wealthHealth.aggregateDeferredReason));
ok('J.3 el score heredado se nombra pero NO se consume',
  rMany.wealthHealth.legacyScoreOwner === '_aurixHealthScore'
  && rMany.wealthHealth.legacyScoreConsumed === false);
ok('J.4 se publican las 7 dimensiones por separado, con su disponibilidad',
  rMany.wealthHealth.dimensions.length === 7
  && rMany.wealthHealth.dimensions.every(d => !!d.dimension && !!d.availability));
ok('J.5 una dimensión unavailable NO aporta 0 al conjunto: aporta ausencia',
  rMany.wealthHealth.dimensions.filter(d => d.availability === 'unavailable')
    .every(d => !('score' in d) && !('value' in d)));

// ── K · EXPERIENCIA GUIADA / EQUILIBRADA / AVANZADA ─────────────────────────
group('K · experiencia · tres niveles, UNA verdad');
ok('K.1 el contrato declara los tres niveles',
  JSON.stringify(rMany.experience.levels) === JSON.stringify(['guided', 'balanced', 'advanced']));
ok('K.2 declara qué puede variar', JSON.stringify(rMany.experience.varies)
  === JSON.stringify(['language', 'density', 'depth', 'technical_detail']));
ok('K.3 …y qué NO puede variar nunca', JSON.stringify(rMany.experience.invariant)
  === JSON.stringify(['data_access', 'calculation', 'financial_result', 'availability']));
const g = AI(Object.assign({ experience: 'guided' }, CONC));
const a = AI(Object.assign({ experience: 'advanced' }, CONC));
ok('K.4 el nivel NO cambia el modelo ni un decimal',
  JSON.stringify(g.model) === JSON.stringify(a.model));
ok('K.5 …ni la disponibilidad ni la atención',
  JSON.stringify(g.attention) === JSON.stringify(a.attention));
ok('K.6 un nivel inventado cae al equilibrado, no rompe',
  AI(Object.assign({ experience: 'wizard' }, CONC)).experience.requested === 'balanced');
ok('K.7 la presentación queda explícitamente diferida a PC.02',
  rMany.experience.presentationOwner === 'pc02');

// ── L · AISLAMIENTO DE CUENTA A→B ───────────────────────────────────────────
group('L · aislamiento · A nunca ve nada de B');
const A_IN = { core: core([RET(9)]), snapshot: snap({ totUSD: 250000, assetCount: 8 }), diversification: div(), categoryWeights: null };
const B_IN = { core: core([]), snapshot: EMPTY_SNAP,
  diversification: div({ status: ST.UNAVAILABLE_SOURCE, reason: 'no_positions', positions: 0, hhi: null, effectiveN: null, topWeightPct: null }),
  categoryWeights: null };
const outA = AI(A_IN), outB = AI(B_IN), outA2 = AI(A_IN);
ok('L.1 sin estado entre llamadas: B no hereda NADA de A',
  outB.model.structure.totalInvestable === null && outB.attention.every(i => i.currentValue === null));
ok('L.2 …y volver a A no arrastra nada de B',
  JSON.stringify(outA) === JSON.stringify(outA2));
ok('L.3 el owner no tiene caché propia que aislar (no hay estado módulo)',
  !/^\s*let\s+_aurixAi/m.test(bareBlock) && !/_aurixAiCache|_aurixAiMemo/.test(bareBlock));
ok('L.4 no lee identidad: no puede confundir de quién es el dato',
  !/_aurixActiveUserId|_aurixCacheOwner|supabase/.test(bareBlock));

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
