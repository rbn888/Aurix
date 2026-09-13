'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AURI-INTELLIGENCE-ENGINE — el cerebro patrimonial y su honestidad
// ════════════════════════════════════════════════════════════════════════════
// La aserción que gobierna todo el fichero:
//
//   FINANCIAL TRUTH  ≠  USER CONTEXT  ≠  INTERPRETATION  ≠  PRESENTATION
//
// El contexto puede mover relevancia, prioridad, lenguaje y explicación. NO puede
// mover una cifra, su disponibilidad ni su cobertura. Se demuestra ejecutando el
// motor REAL dos veces con el mismo patrimonio y distinto contexto y comparando
// la verdad byte a byte, no leyendo su código.
//
// El motor se carga de verdad en un sandbox; las entradas (modelo de PC.01,
// snapshot, diversificación, memoria almacenada) son fixtures deterministas. Es lo
// contrario de stubear lo certificado: lo que se prueba es el cerebro, y eso son
// sus entradas.
//
// NO se re-audita lo que ya tiene gate (CLAUDE.md §6): PC.01 (86), el ledger y el
// dedup de INT.03, la matemática de INT.02, el radar de INT.07, billing ni
// entitlements.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function block(a, b) {
  const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a);
  const e = src.indexOf(b, i); if (e < 0) throw new Error('missing ' + b);
  return src.slice(i, e + b.length);
}
function fnSrc(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing fn ' + name);
  let k = src.indexOf('{', i), d = 0;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}
const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const CORE   = block('const _AURIX_FACT_STATUS = Object.freeze({', '  effectiveNRatio:  0.6,')
             + block('  top3MinPct:       70,', '});');
const OBS    = block('const _AURIX_INVPERF_HIGH_CONFIDENCE_OBS', ';');
const PC01   = block('const _AURIX_AI_AVAIL = Object.freeze({',
  "        + 'unavailable never becomes 0; no aggregate wealth-health score.',\n  });\n}");
const AURI_SRC = block('const _AURIX_AURI_FIELDS = Object.freeze({',
  "        + 'It may never change a financial value, its availability or its coverage.',\n  });\n}");

// Storage de mentira PERO con la semántica real: un Map por clave. El owner y el
// sellado los decide el motor, que es justo lo que hay que probar.
function mkStore() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: k => m.delete(k), _raw: m };
}
const sandbox = { console, Object, Number, Math, Array, Set, Map, JSON, isFinite, Date,
  _AURIX_CATHIST_INVESTABLE: ['stock', 'etf', 'fund', 'crypto', 'metal', 'liquidity', 'other'] };
sandbox.window = undefined;
vm.createContext(sandbox);
vm.runInContext(CORE + '\n' + OBS + '\n' + PC01 + '\n' + AURI_SRC
  + '\nglobalThis.AI = _aurixAdvancedIntelligence;'
  + '\nglobalThis.AURI = _aurixAuri;'
  + '\nglobalThis.REC = _aurixAuriRecordAnswer;'
  + '\nglobalThis.CTXREAD = _aurixAuriContext;'
  + '\nglobalThis.DISP = _aurixAuriDispersion;'
  + '\nglobalThis.MEMCOMMIT = _aurixAuriCommitMemory;'
  + '\nglobalThis.FIELDS = _AURIX_AURI_FIELDS;'
  + '\nglobalThis.ST = _AURIX_FACT_STATUS;', sandbox);
const { AURI, REC, CTXREAD, DISP, MEMCOMMIT, FIELDS, ST } = sandbox;

let pass = 0, fail = 0;
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
const group = n => console.log('\n' + n);

// ── FIXTURES ────────────────────────────────────────────────────────────────
const snap = (o) => Object.assign({ totUSD: 1e5, assetCount: 6, categoryCount: 4, cashPct: 10,
  cryptoPct: 10, realEstatePct: 0, uncertifiablePositions: 0,
  topInvestedAsset: { name: 'VWCE', type: 'etf', pctTotal: 22 },
  topCategory: { type: 'etf', pctTotal: 40 } }, o || {});
const div = (o) => Object.assign({ status: ST.AVAILABLE, reason: '', positions: 6, hhi: 0.18,
  effectiveN: 5.56, topWeightPct: 22 }, o || {});
const fact = (o) => Object.assign({ semanticKey: 'x', family: 'exposure', causalRoot: 'category_mix',
  value: 0, unit: 'percent', values: {}, window: { range: '30D', startAt: 1, endAt: 2 },
  direction: 'flat', materiality: 0.5, magnitude: 0.3, confidence: 1, priority: 0.5 }, o || {});
const core = (f, g, obs) => ({ version: 'int03', generatedAt: 1700000000000,
  ledger: { facts: f || [], gaps: g || [] },
  dataAvailability: { observation: obs || { observations: 12 } } });
const RET = p => fact({ semanticKey: 'investable_return_30d', family: 'performance',
  causalRoot: 'investable_return', value: p, unit: 'percent', confidence: 1 });
const CAP = v => fact({ semanticKey: 'recorded_capital_net', family: 'capital_flow',
  causalRoot: 'external_capital', value: v, unit: 'usd' });
const CASHDRIFT = (pp, st) => fact({ semanticKey: 'cash_drift_liquidity_30D', family: 'liquidity',
  causalRoot: 'cash_weight', value: pp, unit: 'percentage_points',
  values: { startPct: st, endPct: st + pp, deltaPp: pp, category: 'liquidity' },
  direction: pp > 0 ? 'up' : 'down' });

// Perfiles ESTRUCTURALMENTE distintos del §12.
const P = {
  empty:      { snapshot: snap({ totUSD: 0, assetCount: 0, topInvestedAsset: null, topCategory: null }),
                diversification: div({ status: ST.UNAVAILABLE_SOURCE, reason: 'no_positions', positions: 0, hhi: null, effectiveN: null, topWeightPct: null }), core: core([]) },
  one:        { snapshot: snap({ assetCount: 1, cashPct: 0, categoryCount: 1, topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 100 }, topCategory: { type: 'crypto', pctTotal: 100 } }),
                diversification: div({ positions: 1, hhi: 1, effectiveN: 1, topWeightPct: 100 }), core: core([]) },
  allBtc:     { snapshot: snap({ assetCount: 3, cryptoPct: 100, cashPct: 0, topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 92 }, topCategory: { type: 'crypto', pctTotal: 100 } }),
                diversification: div({ positions: 3, hhi: 0.86, effectiveN: 1.16, topWeightPct: 92 }), core: core([]) },
  concentr:   { snapshot: snap({ assetCount: 5, topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 68 } }),
                diversification: div({ positions: 5, hhi: 0.49, effectiveN: 2.04, topWeightPct: 68 }), core: core([]) },
  diversified:{ snapshot: snap({ assetCount: 9 }),
                diversification: div({ positions: 9, hhi: 0.12, effectiveN: 8.33, topWeightPct: 16 }), core: core([]) },
  cashHeavy:  { snapshot: snap({ cashPct: 85, topInvestedAsset: { name: 'VWCE', type: 'etf', pctTotal: 12 } }),
                diversification: div({ positions: 4, hhi: 0.3, effectiveN: 3.33, topWeightPct: 12 }), core: core([CASHDRIFT(9, 76)]) },
  noCash:     { snapshot: snap({ cashPct: 0 }), diversification: div(), core: core([]) },
  realEstate: { snapshot: snap({ realEstatePct: 78, topInvestedAsset: { name: 'Piso', type: 'real_estate', pctTotal: 78 }, topCategory: { type: 'real_estate', pctTotal: 78 } }),
                diversification: div({ positions: 4, hhi: 0.62, effectiveN: 1.61, topWeightPct: 78 }), core: core([]) },
  partialVal: { snapshot: snap({ uncertifiablePositions: 1 }),
                diversification: div({ status: ST.LOW_CONFIDENCE, reason: 'unvalued_position', hhi: null, effectiveN: null, topWeightPct: null }), core: core([]) },
  noHistory:  { snapshot: snap(), diversification: div(),
                core: core([], [{ family: 'performance', semanticKey: 'investable_return_30d', status: ST.INSUFFICIENT_HISTORY, reason: 'history_too_short' }]) },
  history:    { snapshot: snap(), diversification: div(), core: core([RET(6.2)]) },
  bigInflow:  { snapshot: snap(), diversification: div(), core: core([RET(0.3), CAP(25000)]) },
  drawdown:   { snapshot: snap(), diversification: div(), core: core([RET(-14.5)]) },
  withdrawal: { snapshot: snap(), diversification: div(), core: core([RET(-2.1), CAP(-18000)]) },
};
const run = (prof, extra) => AURI(Object.assign({ now: 2000000000000, context: { fields: {}, answered: 0, source: 'none' },
  memory: null, depth: 'premium' }, prof, extra || {}));

// ── A · LA SEPARACIÓN, DEMOSTRADA ───────────────────────────────────────────
group('A · truth ≠ context ≠ interpretation · el contexto NO mueve una cifra');
const ctxOf = (f) => ({ fields: f, answered: Object.keys(f).length, source: 'stored' });
const CTX_DELIB = ctxOf({ concentration_intent: { value: 'deliberate', provenance: 'user_answer',
  answeredAt: 1, subject: 'BTC', purpose: 'interpretation_of_concentration', changes: 'interpretation' } });
const noCtx = run(P.concentr);
const withCtx = run(P.concentr, { context: CTX_DELIB });
ok('A.1 el MODELO financiero es idéntico con y sin contexto',
  JSON.stringify(noCtx.model) === JSON.stringify(withCtx.model));
ok('A.2 …incluido el índice de dispersión',
  JSON.stringify(noCtx.dispersion) === JSON.stringify(withCtx.dispersion));
ok('A.3 70% BTC sigue siendo 70% BTC: el valor del insight no se mueve',
  noCtx.attention[0].currentValue === withCtx.attention.find(i => i.dimension === 'concentration').currentValue);
ok('A.4 …y su disponibilidad y cobertura tampoco',
  (() => { const a = noCtx.attention.find(i => i.dimension === 'concentration'),
                 b = withCtx.attention.find(i => i.dimension === 'concentration');
    return a.availability === b.availability && a.coverage === b.coverage; })());
ok('A.5 lo que SÍ cambia es la relevancia, y queda dicho',
  (() => { const a = noCtx.attention.find(i => i.dimension === 'concentration'),
                 b = withCtx.attention.find(i => i.dimension === 'concentration');
    return b.relevance < a.relevance && b.contextApplied === true
      && b.qualifiers.includes('intent_declared_deliberate'); })());
ok('A.6 …y la explicación, que pasa a reconocer que es deliberada',
  withCtx.attention.find(i => i.dimension === 'concentration').interpretationCode
    === 'concentration_dominant_declared_deliberate');
ok('A.7 una concentración NO deliberada sube la relevancia (mismo dato, otra lectura)',
  (() => { const b = run(P.concentr, { context: ctxOf({ concentration_intent: { value: 'not_deliberate',
      provenance: 'user_answer', answeredAt: 1, subject: 'BTC', purpose: 'interpretation_of_concentration', changes: 'interpretation' } }) });
    const x = b.attention.find(i => i.dimension === 'concentration');
    const y = noCtx.attention.find(i => i.dimension === 'concentration');
    return x.relevance > y.relevance && x.currentValue === y.currentValue; })());
ok('A.8 NINGÚN campo del catálogo puede cambiar un valor',
  Object.keys(FIELDS).every(k => FIELDS[k].changes !== 'value')
  && Object.keys(FIELDS).every(k => ['coverage', 'priority', 'interpretation', 'language'].includes(FIELDS[k].changes)));
ok('A.9 el pipeline se declara en orden y es auditable',
  (() => { const c = block("    pipeline: ['truth'", "'presentation'],");
    return /truth.*context.*observations.*change.*interpretation.*priority.*memory.*presentation/s.test(c); })());

// ── B · CATÁLOGO DE CONTEXTO ────────────────────────────────────────────────
group('B · contexto · siete campos, cada uno con propósito y procedencia');
ok('B.1 exactamente 7 campos, ni un cuestionario', Object.keys(FIELDS).length === 7);
ok('B.2 cada campo declara purpose, changes y opciones cerradas',
  Object.keys(FIELDS).every(k => !!FIELDS[k].purpose && !!FIELDS[k].changes
    && Array.isArray(FIELDS[k].options) && FIELDS[k].options.length >= 2));
const tokensOf = (s) => String(s).split(/[_\W]+/).filter(Boolean);
ok('B.3 NO se pregunta tolerancia al riesgo, ni edad, ni ingresos (PII innecesaria)',
  !Object.keys(FIELDS).some(k => tokensOf(k)
    .some(tk => ['risk', 'tolerance', 'age', 'birth', 'income', 'salary', 'net', 'worth'].includes(tk))));
ok('B.4 la concentración exige SUJETO: un «es deliberada» sin decir de qué no vale',
  FIELDS.concentration_intent.subjectRequired === true);
const st1 = mkStore();
ok('B.5 una respuesta se guarda con dueño, procedencia y timestamp',
  REC('primary_goal', 'preserve', { store: st1, owner: 'user-A', now: 111 })
  && /"owner":"user-A"/.test(st1.getItem('aurix_auri_ctx_v1'))
  && /"provenance":"user_answer"/.test(st1.getItem('aurix_auri_ctx_v1'))
  && /"answeredAt":111/.test(st1.getItem('aurix_auri_ctx_v1')));
ok('B.6 …y es ACTUALIZABLE sin acumular un histórico de respuestas',
  (() => { REC('primary_goal', 'grow', { store: st1, owner: 'user-A', now: 222 });
    const c = CTXREAD({ store: st1, owner: 'user-A' });
    return c.fields.primary_goal.value === 'grow' && c.fields.primary_goal.answeredAt === 222
      && (st1.getItem('aurix_auri_ctx_v1').match(/"provenance"/g) || []).length === 1; })());
ok('B.7 un valor fuera del catálogo se RECHAZA al escribir',
  REC('primary_goal', 'hodl', { store: st1, owner: 'user-A' }) === false);
ok('B.8 …y un storage manipulado no puede inyectar opciones ni campos nuevos',
  (() => { const s = mkStore();
    s.setItem('aurix_auri_ctx_v1', JSON.stringify({ owner: 'u', fields: {
      primary_goal: { value: 'moon', provenance: 'user_answer', answeredAt: 1 },
      secret_field: { value: 'x', provenance: 'user_answer', answeredAt: 1 } } }));
    const c = CTXREAD({ store: s, owner: 'u' });
    return c.answered === 0 && !c.fields.secret_field; })());

// ── C · AISLAMIENTO A/B ─────────────────────────────────────────────────────
group('C · aislamiento · el contexto de A no puede llegarle a B');
ok('C.1 un registro de A es ILEGIBLE para B', (() => {
  const s = mkStore();
  REC('horizon', 'long', { store: s, owner: 'user-A' });
  return CTXREAD({ store: s, owner: 'user-B' }).answered === 0
      && CTXREAD({ store: s, owner: 'user-A' }).answered === 1; })());
ok('C.2 sin dueño resuelto la lectura FALLA CERRADA (el agujero de M.06 era un sello NULO)',
  (() => { const s = mkStore(); REC('horizon', 'long', { store: s, owner: 'user-A' });
    return CTXREAD({ store: s, owner: null }).answered === 0; })());
ok('C.3 …y la escritura también: no hay estado «de nadie»',
  REC('horizon', 'long', { store: mkStore(), owner: null }) === false);
ok('C.4 la memoria observada de A tampoco la lee B', (() => {
  const s = mkStore();
  MEMCOMMIT({ seen: [{ id: 'ai_x', dimension: 'concentration', label: 'concentrated',
    firstSeenAt: 1, lastSeenAt: 1, observations: 2 }] }, { value: 60 }, 5, { store: s, owner: 'user-A' });
  const asB = AURI(Object.assign({ now: 9, depth: 'premium', store: s, owner: 'user-B' }, P.concentr));
  return asB.memory.hasHistory === false; })());
ok('C.5 las dos claves están en el ciclo de vida de cambio de usuario',
  /'aurix_auri_ctx_v1', 'aurix_auri_mem_v1'/.test(src)
  && src.indexOf("'aurix_auri_ctx_v1'") > src.indexOf('const USER_SCOPED_LOCAL_KEYS'));
ok('C.6 el motor no lee identidad por su cuenta más que para SELLAR',
  (() => { const f = bare(fnSrc('_aurixAuriOwner'));
    return /_aurixActiveUserId|_aurixCacheOwner/.test(f)
      && !/_aurixHealthScore|investableValueUSD/.test(bare(AURI_SRC)); })());

// ── D · DISPERSIÓN DE PESOS (el Health retirado) ────────────────────────────
group('D · dispersión · el índice se llama por lo que mide');
const dOk = DISP(div({ positions: 9, effectiveN: 8.33 }), snap());
ok('D.1 con reparto medible publica un índice REESCALADO sin el suelo 1/N',
  dOk.availability === 'available' && dOk.value === 92 && dOk.metric === 'weight_dispersion');
ok('D.1b el índice es COMPARABLE entre carteras: 0 = todo en una, 100 = repartido',
  (() => { const casi1 = DISP(div({ positions: 9, hhi: 0.98, effectiveN: 1.02 }), snap());
    const perfecto = DISP(div({ positions: 9, hhi: 1 / 9, effectiveN: 9 }), snap());
    return casi1.value === 0 && perfecto.value === 100; })());
ok('D.1c DOS posiciones 80/20 no publican cifra: el índice degenera con N=2',
  (() => { const x = DISP(div({ positions: 2, hhi: 0.68, effectiveN: 1.47, topWeightPct: 80 }), snap({ assetCount: 2 }));
    return x.value === null && x.reason === 'too_few_positions'; })());
ok('D.2 declara PROHIBIDO enmarcarlo como salud, riesgo, calidad o nota',
  ['health', 'risk', 'quality', 'grade'].every(k => dOk.forbiddenFraming.includes(k)));
ok('D.3 y arrastra su límite de profundidad',
  dOk.depthLimitation === 'sector_geography_correlation_not_supported');
ok('D.4 con UNA posición no hay reparto: no se publica número',
  (() => { const x = DISP(div({ positions: 1, effectiveN: 1, topWeightPct: 100 }), snap({ assetCount: 1 }));
    return x.availability === 'unavailable' && x.value === null && x.reason === 'too_few_positions'; })());
ok('D.4b sin snapshot FALLA CERRADO en vez de publicar sobre un universo sin comprobar',
  DISP(div({ positions: 9, effectiveN: 8.33 }), null).value === null);
ok('D.5 con una posición NO VALORABLE tampoco: era el fallo del score viejo',
  (() => { const x = DISP(div(), snap({ uncertifiablePositions: 1 }));
    return x.availability === 'unavailable' && x.value === null
      && x.reason === 'uncertifiable_positions'; })());
ok('D.6 sin fuente certificada no se inventa',
  DISP(div({ status: ST.LOW_CONFIDENCE, reason: 'unvalued_position' }), snap()).value === null);
ok('D.7 el veredicto del agregado viaja en el contrato, no en un comentario',
  (() => { const r = run(P.diversified);
    return r.wealthHealth.aggregate === null && r.wealthHealth.aggregateVerdict === 'not_computable'
      && r.wealthHealth.replacedBy === 'weight_dispersion'
      && r.wealthHealth.legacyScoreRetiredFromSurface === true; })());

// ── E · MEMORIA ─────────────────────────────────────────────────────────────
group('E · memoria · Intelligence deja de reiniciarse mentalmente');
const first = run(P.concentr);
ok('E.1 primera observación: no hay historia y todo es NUEVO',
  first.memory.hasHistory === false && first.memory.seen.every(e => e.state === 'new'));
ok('E.1b …y NO se anuncia ningún cambio: sin observación previa no hay «desde entonces»',
  first.memory.changeCount === 0 && first.now.state !== 'material_change');
const storedMem = { observedAt: 1000, dispersion: first.dispersion.value, seen: first.memory.seen.map(e =>
  ({ id: e.id, dimension: e.dimension, label: e.label, firstSeenAt: e.firstSeenAt,
     lastSeenAt: e.lastSeenAt, observations: e.observations })) };
const second = run(P.concentr, { memory: storedMem });
ok('E.2 segunda con el mismo patrimonio: PERSISTE y no se anuncia como nuevo',
  second.memory.hasHistory === true && second.memory.changeCount === 0
  && second.memory.seen.every(e => e.state === 'persisting'));
const moved = run(P.diversified, { memory: storedMem });
ok('E.3 si la LECTURA cambia, se dice de qué a qué',
  moved.memory.changesSinceLastObservation.some(c => c.kind === 'reading_changed'
    && c.from === 'dominant_position' && c.to === 'balanced'));
ok('E.4 un insight que desaparece se marca RESUELTO, no se borra en silencio',
  run(P.empty, { memory: storedMem }).memory.changesSinceLastObservation
    .some(c => c.kind === 'insight_resolved'));
ok('E.5 lo demasiado viejo CADUCA: la memoria no es ilimitada',
  (() => { const old = { observedAt: 1, dispersion: null, seen: [{ id: 'ai_ghost',
      dimension: 'liquidity', label: 'stable', firstSeenAt: 1, lastSeenAt: 1, observations: 9 }] };
    return !run(P.empty, { memory: old }).memory.seen.some(e => e.id === 'ai_ghost'); })());
ok('E.6 un movimiento del índice de dispersión se registra con su dirección',
  moved.memory.changesSinceLastObservation.some(c => c.kind === 'dispersion_moved'
    && c.direction === 'increasing'));
ok('E.7 la memoria NO guarda ni una cifra de patrimonio ni nada identificable',
  (() => { const s = mkStore();
    MEMCOMMIT(second.memory, second.dispersion, 7, { store: s, owner: 'u' });
    const raw = s.getItem('aurix_auri_mem_v1');
    return !/100000|VWCE|BTC|Piso|email|@/.test(raw); })());
ok('E.8 lo que se repite cede prioridad a lo nuevo, sin dejar de ser verdad',
  (() => { const many = { observedAt: 1000, dispersion: first.dispersion.value, seen: first.memory.seen.map(e =>
      ({ id: e.id, dimension: e.dimension, label: e.label, firstSeenAt: 1, lastSeenAt: 1, observations: 5 })) };
    const r = run(P.concentr, { memory: many });
    return r.memory.persisting.length > 0
      && r.attention.every(i => i.currentValue !== undefined); })());

// ── F · SURPRISE ENGINE ─────────────────────────────────────────────────────
group('F · descubrimientos · relaciones que un número solo no dice');
const dApparent = run({ snapshot: snap({ assetCount: 7 }),
  diversification: div({ positions: 7, hhi: 0.4, effectiveN: 2.5, topWeightPct: 55 }), core: core([]) });
ok('F.1 diversificación APARENTE vs EFECTIVA (7 posiciones, peso de 2,5)',
  dApparent.discoveries.some(d => d.code === 'apparent_vs_effective_diversification'
    && d.values.positions === 7 && d.evidence.includes('effective_holdings')));
ok('F.2 el patrimonio que sube por CAPITAL y no por rendimiento',
  run(P.bigInflow).discoveries.some(d => d.code === 'level_rose_on_capital_not_return'
    && d.values.recordedCapitalNet === 25000));
ok('F.3 concentración CRECIENTE sólo si la memoria lo sostiene',
  (() => { const prev = { observedAt: 1, dispersion: 90, seen: [{ id: 'ai_concentration_top_position',
      dimension: 'concentration', label: 'balanced', firstSeenAt: 1, lastSeenAt: 1, observations: 2 }] };
    const r = run(P.concentr, { memory: prev });
    return r.discoveries.some(d => d.code === 'concentration_crossed_upward'); })());
ok('F.4 …y NO se afirma tendencia sin observación previa (un nivel no es una subida)',
  !run(P.concentr).discoveries.some(d => d.code === 'concentration_crossed_upward'));
ok('F.5 intención declarada vs estructura observada (requiere contexto)',
  run(P.concentr, { context: ctxOf({ primary_goal: { value: 'preserve', provenance: 'user_answer',
    answeredAt: 1, purpose: 'relevance_ordering', changes: 'priority' } }) })
    .discoveries.some(d => d.code === 'declared_goal_distant_from_observed_structure'
      && d.contextDependent === true));
ok('F.6 liquidez que baja habiendo declarado que se necesita',
  run({ snapshot: snap({ cashPct: 6 }), diversification: div(), core: core([CASHDRIFT(-9, 15)]) },
    { context: ctxOf({ liquidity_need: { value: 'imminent', provenance: 'user_answer', answeredAt: 1,
      purpose: 'relevance_of_liquidity', changes: 'priority' } }) })
    .discoveries.some(d => d.code === 'liquidity_fell_while_need_declared'));
ok('F.7 lo que PERSISTE se declara como tal: deja de reclamar atención por novedad',
  (() => { const many = { observedAt: 1, dispersion: first.dispersion.value, seen: first.memory.seen.map(e =>
      ({ id: e.id, dimension: e.dimension, label: e.label, firstSeenAt: 1, lastSeenAt: 1, observations: 6 })) };
    return run(P.concentr, { memory: many }).discoveries
      .some(d => d.code === 'reading_persists_across_observations'); })());
ok('F.8 varios cambios menores a la vez son un hecho conjunto',
  (() => { const prev = { observedAt: 1, dispersion: first.dispersion.value, seen: [
      { id: 'ai_concentration_top_position', dimension: 'concentration', label: 'balanced', firstSeenAt: 1, lastSeenAt: 1, observations: 2 },
      { id: 'ai_diversification_spread', dimension: 'diversification', label: 'spread_even', firstSeenAt: 1, lastSeenAt: 1, observations: 2 }] };
    return run(P.concentr, { memory: prev }).discoveries
      .some(d => d.code === 'several_readings_moved_together'); })());
ok('F.9 NINGÚN descubrimiento afirma causalidad',
  run(P.bigInflow).discoveries.every(d => d.causalityClaimed === false));
ok('F.10 …y todos llevan evidencia rastreable',
  dApparent.discoveries.every(d => Array.isArray(d.evidence)));
ok('F.11 no se inventan benchmarks, correlaciones ni predicciones',
  !/benchmark|forecast|predict|sp500|index_compare/i.test(bare(AURI_SRC))
  // La ÚNICA aparición de «correlation» permitida es la que declara que NO es medible.
  && (bare(AURI_SRC).match(/correlation/g) || []).length
     === (bare(AURI_SRC).match(/correlation_not_supported/g) || []).length);

// ── G · PREGUNTAS ───────────────────────────────────────────────────────────
group('G · preguntas · sólo cuando la respuesta cambia la interpretación');
const qConc = run(P.concentr);
ok('G.1 una concentración material dispara la pregunta de intención, con sujeto',
  qConc.questions.length === 1 && qConc.questions[0].field === 'concentration_intent'
  && qConc.questions[0].subject === 'BTC' && qConc.questions[0].trigger === 'top_position_weight');
ok('G.2 UNA sola pregunta a la vez', run(P.diversified).questions.length <= 1);
ok('G.3 lo que ya se sabe NO se vuelve a preguntar',
  !run(P.concentr, { context: CTX_DELIB }).questions.some(q => q.field === 'concentration_intent'));
ok('G.4 sin hecho que la necesite, no hay pregunta de concentración',
  !run(P.diversified).questions.some(q => q.field === 'concentration_intent'));
ok('G.5 la liquidez sólo se pregunta si se ha MOVIDO',
  !run(P.noCash, { questionLimit: 9 }).questions.some(q => q.field === 'liquidity_need')
  && run(P.cashHeavy, { questionLimit: 9 }).questions.some(q => q.field === 'liquidity_need'));
ok('G.6 una cuenta VACÍA no recibe ninguna pregunta: no habría nada que interpretar',
  run(P.empty).questions.length === 0);
ok('G.7 cada pregunta declara qué cambia, para qué y por qué',
  qConc.questions.every(q => !!q.changes && !!q.purpose && !!q.whyCode));
ok('G.8 la pregunta NUNCA se gatea: Free recibe la misma',
  JSON.stringify(run(P.concentr, { depth: 'free' }).questions)
  === JSON.stringify(qConc.questions));

// ── H · QUÉ IMPORTA AHORA ───────────────────────────────────────────────────
group('H · qué importa ahora · sin urgencia fabricada y sin frase rotatoria');
ok('H.1 no se afirma urgencia sin un hecho material que la sostenga',
  [P.empty, P.one, P.diversified, P.noHistory, P.history, P.cashHeavy, P.concentr, P.allBtc]
    .every(p => { const r = run(p); return !r.now.urgencyClaimed || r.now.supportedByFact; }));
ok('H.2 una cuenta vacía dice que no hay datos, no que requiera atención',
  run(P.empty).now.state === 'no_data');
// El orden importa y es una decisión de producto: una PREGUNTA accionable gana a
// declarar falta de historia, porque la historia llega sola y el contexto no. Así
// que «falta historia» es el estado cuando ya no queda nada útil que preguntar.
const FULL_CTX = ctxOf({
  wealth_coverage: { value: 'complete', provenance: 'user_answer', answeredAt: 1, purpose: 'scope_qualifier', changes: 'coverage' },
  primary_goal: { value: 'grow', provenance: 'user_answer', answeredAt: 1, purpose: 'relevance_ordering', changes: 'priority' },
  liquidity_need: { value: 'none_known', provenance: 'user_answer', answeredAt: 1, purpose: 'relevance_of_liquidity', changes: 'priority' },
  concentration_intent: { value: 'deliberate', provenance: 'user_answer', answeredAt: 1, subject: 'VWCE', purpose: 'interpretation_of_concentration', changes: 'interpretation' } });
ok('H.3 sin historia y sin nada que preguntar, se dice que falta HISTORIA (no que algo va mal)',
  (() => { const r = run(P.noHistory, { context: FULL_CTX });
    return r.now.state === 'insufficient_history' && r.now.urgencyClaimed === false; })());
ok('H.3b …y con una pregunta útil pendiente, se prefiere preguntar',
  run(P.noHistory).now.state === 'context_needed');
ok('H.4 con memoria, contexto completo y sin cambios: estado ESTABLE explícito',
  (() => { const base = run(P.diversified, { context: FULL_CTX });
    const mem = { observedAt: 1000, dispersion: base.dispersion.value,
      seen: base.memory.seen.map(e => ({ id: e.id, dimension: e.dimension, label: e.label,
        firstSeenAt: e.firstSeenAt, lastSeenAt: e.lastSeenAt, observations: e.observations })) };
    const r = run(P.diversified, { context: FULL_CTX, memory: mem });
    return r.now.state === 'stable_no_change' && r.now.changeCount === 0
      && r.now.urgencyClaimed === false; })());
ok('H.5 un cambio desde la última observación lo encabeza',
  ['material_change', 'discovery', 'readings_changed'].includes(moved.now.state));
ok('H.5b y se distingue «se movió» de «se movió algo MATERIAL»',
  (() => { const r = run(P.diversified, { memory: storedMem });
    return r.now.state === 'readings_changed' && r.now.urgencyClaimed === false
      && r.now.changeCount > 0; })());
ok('H.6 cuando falta contexto útil, el estado lo pide en vez de inventar una lectura',
  (() => { const r = run({ snapshot: snap({ assetCount: 4, cashPct: 12 }),
      diversification: div({ positions: 4, hhi: 0.27, effectiveN: 3.7, topWeightPct: 30 }), core: core([]) });
    return r.now.state === 'context_needed' && r.questions.length === 1; })());
ok('H.7 el estado SIEMPRE viene con el ancla del hecho que lo sostiene o sin urgencia',
  run(P.allBtc).now.supportedByFact === true);

// ── I · FREE vs PREMIUM ─────────────────────────────────────────────────────
group('I · free vs premium · misma verdad, distinta profundidad');
const fr = run(P.concentr, { memory: storedMem, depth: 'free' });
const pr = run(P.concentr, { memory: storedMem, depth: 'premium' });
ok('I.1 la VERDAD financiera es idéntica', JSON.stringify(fr.model) === JSON.stringify(pr.model));
ok('I.2 …y el índice de dispersión también', JSON.stringify(fr.dispersion) === JSON.stringify(pr.dispersion));
ok('I.3 Free ve UN insight y sabe cuántos hay (nada oculto, menos profundidad)',
  fr.attention.length === 1 && fr.attentionTotal === pr.attentionTotal);
ok('I.4 Premium ve hasta 3', pr.attention.length <= 3 && pr.attention.length >= 1);
ok('I.5 Free ve UN descubrimiento entero, no un teaser recortado',
  (() => { const f = run(P.bigInflow, { depth: 'free' }), p = run(P.bigInflow, { depth: 'premium' });
    return f.discoveries.length === 1 && f.discoveriesTotal === p.discoveriesTotal
      && JSON.stringify(f.discoveries[0]) === JSON.stringify(p.discoveries[0]); })());
ok('I.6 Free ve el CONTADOR de cambios y en qué dimensiones, no el detalle',
  (() => { const f = run(P.diversified, { memory: storedMem, depth: 'free' });
    return Number.isFinite(f.memory.changeCount) && Array.isArray(f.memory.changedDimensions)
      && f.memory.changesSinceLastObservation.length === 0; })());
ok('I.7 Premium ve qué cambió, de qué a qué',
  moved.memory.changesSinceLastObservation.length > 0);
ok('I.8 Free NUNCA recibe una cifra falsa, degradada ni censurada',
  (() => { const f = fr.attention[0], p = pr.attention.find(i => i.id === f.id);
    return f.currentValue === p.currentValue && f.coverage === p.coverage
      && f.availability === p.availability; })());

// ── J · EXPERIENCIA ─────────────────────────────────────────────────────────
group('J · guided / balanced / advanced · lenguaje, nunca acceso');
ok('J.1 sin contexto se propone el nivel intermedio, y se dice de dónde sale',
  run(P.concentr).experience.resolved === 'balanced'
  && run(P.concentr).experience.inferredFrom === 'default');
ok('J.2 la experiencia declarada PROPONE el nivel',
  run(P.concentr, { context: ctxOf({ experience: { value: 'starting', provenance: 'user_answer',
    answeredAt: 1, purpose: 'explanation_language', changes: 'language' } }) })
    .experience.resolved === 'guided');
ok('J.3 la elección explícita del usuario MANDA sobre lo inferido',
  run(P.concentr, { context: ctxOf({
    experience: { value: 'starting', provenance: 'user_answer', answeredAt: 1, purpose: 'explanation_language', changes: 'language' },
    explanation_depth: { value: 'advanced', provenance: 'user_answer', answeredAt: 2, purpose: 'explanation_density', changes: 'language' } }) })
    .experience.resolved === 'advanced');
ok('J.4 el nivel NO se infiere del patrimonio: el dinero no dice cuánto sabes',
  !/totUSD|totalInvestable|assetCount/.test(bare(fnSrc('_aurixAuri')).split('experience:')[1] || ''));
ok('J.5 el nivel es siempre modificable por el usuario',
  run(P.concentr).experience.userOverridable === true);
ok('J.6 y no cambia ni el modelo ni la disponibilidad',
  (() => { const g = run(P.concentr, { context: ctxOf({ explanation_depth: { value: 'guided',
      provenance: 'user_answer', answeredAt: 1, purpose: 'explanation_density', changes: 'language' } }) });
    const a = run(P.concentr, { context: ctxOf({ explanation_depth: { value: 'advanced',
      provenance: 'user_answer', answeredAt: 1, purpose: 'explanation_density', changes: 'language' } }) });
    return JSON.stringify(g.model) === JSON.stringify(a.model); })());

// ── K · MATRIZ DE PERFILES · NO-VACUIDAD Y COMPATIBILIDAD ───────────────────
group('K · matriz · ninguna cuenta recibe una lectura incompatible con sus datos');
const KEYS = Object.keys(P);
const results = KEYS.map(k => [k, run(P[k])]);
ok('K.1 los ' + KEYS.length + ' perfiles devuelven lectura sin excepción',
  results.every(([, r]) => !!r && !!r.now && !!r.model));
ok('K.2 perfiles distintos producen estados o anclas distintas (no-vacuidad)',
  new Set(results.map(([, r]) => r.now.state + '|' + (r.now.anchor || ''))).size >= 5);
ok('K.3 ninguna cuenta sin posiciones recibe un insight con cifra',
  run(P.empty).attention.every(i => i.currentValue === null));
ok('K.4 una cartera de UN activo no recibe conclusión de reparto',
  run(P.one).model.diversification.semanticLabel === 'insufficient_evidence');
ok('K.5 100% BTC: concentración dominante y dispersión mínima, coherentes entre sí',
  (() => { const r = run(P.allBtc);
    return r.model.concentration.semanticLabel === 'dominant_position'
      && r.dispersion.semanticLabel === 'spread_lopsided'; })());
ok('K.6 una caída sin retirada NO se publica como retirada',
  (() => { const r = run(P.drawdown);
    return r.model.evolution.returnPct === -14.5 && r.model.evolution.recordedCapitalNet === null
      && r.model.evolution.marketVsFlowSeparable === false; })());
ok('K.7 una retirada grande se publica tal cual, sin suavizarla',
  run(P.withdrawal).model.evolution.recordedCapitalNet === -18000);
ok('K.8 valoración parcial: no hay número de dispersión, y se dice por qué',
  (() => { const r = run(P.partialVal);
    return r.dispersion.value === null && r.dispersion.reason.length > 0
      && r.model.structure.coverage === 'partial'; })());
ok('K.9 inmueble dominante: se lee su peso sin redefinir la fuente',
  run(P.realEstate).model.structure.realEstatePct === 78);
ok('K.10 determinista: recargar con el mismo estado da el mismo resultado',
  JSON.stringify(run(P.concentr, { memory: storedMem })) === JSON.stringify(run(P.concentr, { memory: storedMem })));

// ── L · CUMPLIMIENTO ────────────────────────────────────────────────────────
group('L · cumplimiento · informa, no aconseja');
const allStrings = (() => { const s = [];
  results.forEach(([, r]) => (function walk(v) {
    if (typeof v === 'string') s.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(r)); return s; })();
const PRESCRIPTIVE = ['buy', 'sell', 'reduce', 'trim', 'rebalance', 'recommend', 'recommended',
  'advice', 'advise', 'avoid', 'exit', 'diversify', 'should'];
ok('L.1 ningún código emitido dirige un verbo de acción al usuario',
  allStrings.every(x => !tokensOf(x).some(tk => PRESCRIPTIVE.includes(tk))),
  allStrings.filter(x => tokensOf(x).some(tk => PRESCRIPTIVE.includes(tk))));
ok('L.2 no se emite juicio moral sobre la estructura',
  allStrings.every(x => !/^(good|bad|poor|excellent|healthy|unhealthy)$/i.test(x)));
ok('L.3 el motor no infiere tolerancia al riesgo',
  !/riskTolerance|risk_tolerance|riskProfile/.test(bare(AURI_SRC)));
ok('L.4 preferencia y capacidad no se confunden: el contexto sólo cualifica',
  Object.keys(FIELDS).every(k => FIELDS[k].changes !== 'coverage' || k === 'wealth_coverage'));
ok('L.5 el patrimonio declarado PARCIAL cualifica el alcance de toda conclusión',
  run(P.concentr, { context: ctxOf({ wealth_coverage: { value: 'partial', provenance: 'user_answer',
    answeredAt: 1, purpose: 'scope_qualifier', changes: 'coverage' } }) })
    .attention.every(i => i.qualifiers.includes('partial_wealth_coverage')));
ok('L.6 el motor no emite copy: los strings son códigos, no frases',
  allStrings.filter(x => !['VWCE', 'BTC', 'Piso', 'etf', 'crypto', 'real_estate'].includes(x))
    .every(x => !/\s/.test(x)));

// ── M · SUPERFICIE ──────────────────────────────────────────────────────────
group('M · superficie · los tres defectos nombrados por el founder');
const readingFn = bare(fnSrc('_intv5Reading'));
ok('M.1 el header YA NO lo decide `score < 60`',
  !/score\.score\s*!=\s*null\s*&&\s*score\.score\s*<\s*60/.test(readingFn)
  && /auri\.now|nowState/.test(readingFn));
ok('M.2 …y el estado sale de AURI, con un hecho detrás',
  /_aurixAuriNow/.test(bare(fnSrc('_aurixAuri'))) && /auri_now_/.test(readingFn));
const hsFn = bare(fnSrc('_intccHealthScore'));
ok('M.3 Intelligence ya no publica el score heredado: publica dispersión',
  /_aurixAuriDispersion/.test(hsFn) && !/_aurixHealthScore\s*\(/.test(hsFn));
ok('M.4 …y el score heredado sigue INTACTO para Dashboard/Workspace (cero regresión)',
  /function _aurixHealthScore\(snap\)/.test(src)
  && (src.match(/_aurixHealthScore\(/g) || []).length >= 4);
ok('M.5 un solo tono para el índice: no vuelve a ser una escalera verde→roja',
  /tone:\s*'neutral'/.test(hsFn) && !/_intccScoreTone\(/.test(hsFn));
ok('M.6 el chip «A vigilar» deja de depender de un score retirado',
  !/score\.score/.test(bare(fnSrc('_intv5Chips'))));
const radarFn = bare(fnSrc('_intv7RadarHtml'));
ok('M.7 el radar pliega sus tres párrafos permanentes en un disclosure NATIVO',
  /<details class="intv8-radar-more"/.test(radarFn) && /<summary/.test(radarFn));
ok('M.8 …sin perder una palabra: leyenda, significado y ejes pendientes siguen ahí',
  /intv7_radar_legend/.test(radarFn) && /intv7_stab_meaning/.test(radarFn)
  && /intv7-radar-pending/.test(radarFn));
ok('M.9 …y la limitación se sigue VIENDO sin abrir nada (ejes atenuados en el SVG)',
  /is-unavailable/.test(bare(fnSrc('_intccRadarSvg'))));
ok('M.10 la pregunta se pinta con la primitiva de chip existente, sin slot nuevo',
  /intv8-auri-q/.test(src) && /class="intcc-chip intv8-auri-opt"/.test(src));
ok('M.11 responder tiene efecto inmediato: se guarda y se repinta',
  /_aurixAuriRecordAnswer/.test(src) && /renderIntelligenceTab\(\);/.test(src));
ok('M.12 y si no hay sesión, la escritura falla cerrada y se DICE',
  /saved \? _intv4T\('auri_q_thanks'\)/.test(src));
ok('M.13 la memoria se consolida con throttle: no se vacía al repintar',
  /30 \* 60 \* 1000/.test(src) && /_aurixAuriCommitMemory/.test(src));

group('N · CSS · clases nuevas, sin alfa blanco y con foco visible');
const newCss = css.slice(css.indexOf('SPEC AURI · INTELLIGENCE ENGINE'));
ok('N.1 el bloque nuevo no introduce alfa blanco (= gris neutro sobre el lienzo)',
  !/rgba\(255,\s*255,\s*255/.test(newCss));
ok('N.2 usa la escalera --elev-* y el azul institucional por token',
  /var\(--elev-1\)/.test(newCss) && /var\(--aurix-blue-rgb\)/.test(newCss));
ok('N.3 el anillo del índice deja de ser verde de «bien»',
  /--health-ring-color:\s*var\(--aurix-blue\)/.test(newCss));
ok('N.4 los controles nuevos tienen foco visible (teclado)',
  (newCss.match(/:focus-visible/g) || []).length >= 2);
ok('N.5 el disclosure no depende de hover, que en móvil no existe',
  /\.intv8-radar-summary\s*\{[\s\S]*?cursor: pointer/.test(newCss));
ok('N.6 hay ruta móvil declarada para lo táctil',
  /@media \(max-width: 640px\)[\s\S]*intv8-auri-opt/.test(newCss));
ok('N.7 no se modifica ninguna regla existente: todas las nuevas son .intv8-* o is-tone-neutral',
  newCss.split('\n').filter(l => /^\.[a-z]/.test(l.trim()))
    .every(l => /intv8-|is-tone-neutral/.test(l)));

// ── O · LA SUPERFICIE SE EJECUTA ────────────────────────────────────────────
// La revisión adversarial encontró un TypeError que este harness no podía ver: el
// grupo M certificaba la superficie con REGEX SOBRE EL FUENTE. `_intv4T('k')(args)`
// parece razonable leyéndolo y estalla al ejecutarlo —`_intv4T` ya invoca la
// función del diccionario—, y `renderIntelligenceTab` se tragaba la excepción
// dejando la pestaña en el layout legacy SIN AURI y en silencio. Es exactamente
// `feedback_harness_no_stubear_lo_certificado`. Así que aquí se cargan las
// funciones REALES de presentación con los diccionarios REALES y se ejercen TODOS
// los estados en los DOS idiomas.
group('O · presentación · ejecutada de verdad, en ES y EN');
{
  // Diccionarios reales: se extraen las líneas `auri_*` y las `intcc_*` que la
  // lectura consume, de cada uno de los dos bloques de idioma.
  const NEEDED = /^\s*(auri_[a-z0-9_]+|intcc_(read|sub)_[a-z_]+|intcc_health_title|intcc_health_suffix|intcc_band_empty):/;
  // Se agrupa POR CLAVE y se toma la 1ª aparición para ES y la 2ª para EN. Un
  // límite de línea global no sirve: los dos diccionarios no declaran las claves
  // en el mismo orden, así que partir el fichero por una clave concreta atribuía
  // al idioma equivocado todo lo que estuviera antes de ella.
  const byKey = new Map();
  src.split('\n').forEach(l => {
    const m = l.match(NEEDED); if (!m) return;
    const k = m[1];
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(l.trim().replace(/,$/, ''));
  });
  const twice = Array.from(byKey.keys()).filter(k => byKey.get(k).length === 2);
  const notTwice = Array.from(byKey.keys()).filter(k => byKey.get(k).length !== 2);
  const mk = (idx) => {
    const body = twice.map(k => byKey.get(k)[idx]).join(',\n');
    // eslint-disable-next-line no-new-func
    return new Function('return ({' + body + '})')();
  };
  const ES = mk(0), EN = mk(1);
  ok('O.1 cada clave de la lectura existe EXACTAMENTE dos veces: una por idioma',
    notTwice.length === 0, notTwice);
  ok('O.1b …y los dos diccionarios resuelven el mismo juego de claves',
    JSON.stringify(Object.keys(ES).sort()) === JSON.stringify(Object.keys(EN).sort()));

  const sb2 = { console, Object, Number, Math, Array, JSON, isFinite, window: undefined };
  vm.createContext(sb2);
  vm.runInContext(fnSrc('_intv4T') + '\n' + fnSrc('_intv4Num') + '\n'
    + fnSrc('_auriDiscoveryText') + '\n' + fnSrc('_auriQuestionText') + '\n'
    + fnSrc('_intv5Reading') + '\n'
    + 'globalThis.READ = _intv5Reading; globalThis.DT = _auriDiscoveryText;'
    + 'globalThis.QT = _auriQuestionText;', sb2);

  const STATES = ['no_data', 'material_change', 'discovery', 'attention_material_fact',
    'readings_changed', 'context_needed', 'insufficient_history', 'stable_no_change', 'stable'];
  const DISCOVERY_CODES = ['apparent_vs_effective_diversification', 'concentration_crossed_upward',
    'level_rose_on_capital_not_return', 'declared_goal_distant_from_observed_structure',
    'liquidity_fell_while_need_declared', 'reading_persists_across_observations',
    'several_readings_moved_together'];
  const QFIELDS = ['concentration_intent', 'wealth_coverage', 'liquidity_need', 'primary_goal'];
  const badStates = [], badDisc = [], badQ = [];
  ['es', 'en'].forEach(lang => {
    sb2.t = k => (lang === 'es' ? ES : EN)[k];
    STATES.forEach(st => {
      const auri = { now: { state: st, changeCount: 2 },
        discoveries: [{ code: 'apparent_vs_effective_diversification', values: { positions: 7, effectiveN: 2.5 } }],
        questions: [{ field: 'concentration_intent', subject: 'BTC' }],
        context: { fields: {} } };
      let r = null;
      try { r = sb2.READ(null, {}, null, auri); } catch (e) { badStates.push([lang, st, 'THROW ' + e.message]); return; }
      if (!r || !r.title || !r.sub || /undefined|\[object/.test(r.title + r.sub)) badStates.push([lang, st, r && r.title, r && r.sub]);
    });
    DISCOVERY_CODES.forEach(code => {
      let txt = null;
      try { txt = sb2.DT({ code, values: { positions: 7, effectiveN: 2.5, topWeightPct: 68, observations: 4, count: 3 } }); }
      catch (e) { badDisc.push([lang, code, 'THROW ' + e.message]); return; }
      if (!txt || /undefined|\[object/.test(txt)) badDisc.push([lang, code, txt]);
    });
    QFIELDS.forEach(field => {
      let q = null;
      try { q = sb2.QT({ field, subject: 'BTC' }); } catch (e) { badQ.push([lang, field, 'THROW ' + e.message]); return; }
      if (!q.text || !q.why || /undefined/.test(q.text + q.why)) badQ.push([lang, field, q]);
    });
  });
  ok('O.2 los ' + STATES.length + ' estados renderizan título y subtítulo REALES en ES y EN',
    badStates.length === 0, badStates);
  ok('O.3 los ' + DISCOVERY_CODES.length + ' descubrimientos tienen texto en los dos idiomas',
    badDisc.length === 0, badDisc);
  ok('O.4 las ' + QFIELDS.length + ' preguntas tienen enunciado Y porqué en los dos idiomas',
    badQ.length === 0, badQ);
  ok('O.5 el sujeto del activo viaja al enunciado (no se pierde el nombre)',
    (() => { sb2.t = k => ES[k]; return /BTC/.test(sb2.QT({ field: 'concentration_intent', subject: 'BTC' }).text); })());
  ok('O.6 el contexto «patrimonio parcial» CUALIFICA el subtítulo renderizado',
    (() => { sb2.t = k => ES[k];
      const auri = { now: { state: 'stable', changeCount: 0 }, discoveries: [], questions: [],
        context: { fields: { wealth_coverage: { value: 'partial' } } } };
      const r = sb2.READ(null, {}, null, auri);
      return r.sub.includes(ES.auri_ctx_partial); })());
  ok('O.7 sin motor AURI la lectura NO afirma estabilidad: falla cerrada',
    (() => { sb2.t = k => ES[k]; const r = sb2.READ(null, {}, null, null);
      return r.auriState === 'insufficient_history' && r.title === ES.auri_now_history; })());
  ok('O.8 ningún estado publica urgencia en su clase visual sin venir de AURI',
    (() => { sb2.t = k => ES[k];
      const r = sb2.READ(null, {}, null, { now: { state: 'stable_no_change', changeCount: 0 },
        discoveries: [], questions: [], context: { fields: {} } });
      return r.state === 'healthy'; })());
}

// ── P · MEMORIA · un cambio se anuncia UNA vez ──────────────────────────────
group('P · memoria · sin cambios fabricados por repetición');
{
  // El ciclo exacto que encontró la revisión: se resuelve un insight y se vuelve
  // tres veces más sin que nada cambie.
  const base = run(P.diversified);
  const commit = (r) => ({ observedAt: 1, dispersion: r.dispersion.value,
    seen: r.memory.seen.map(e => ({ id: e.id, dimension: e.dimension, label: e.label,
      firstSeenAt: e.firstSeenAt, lastSeenAt: e.lastSeenAt, observations: e.observations,
      resolvedAt: Number.isFinite(e.resolvedAt) ? e.resolvedAt : null })) });
  const v2 = run(P.empty, { memory: commit(base) });
  const v3 = run(P.empty, { memory: commit(v2) });
  const v4 = run(P.empty, { memory: commit(v3) });
  ok('P.1 la resolución se anuncia en la visita en que ocurre',
    v2.memory.changesSinceLastObservation.some(c => c.kind === 'insight_resolved'));
  ok('P.2 …y NO se vuelve a anunciar en las visitas siguientes (era un cambio fabricado 45 días)',
    v3.memory.changeCount === 0 && v4.memory.changeCount === 0);
  ok('P.3 …así que el hero deja de publicar urgencia en bucle',
    v3.now.urgencyClaimed === false && v4.now.urgencyClaimed === false);
  // Reaparición
  const r1 = run(P.concentr);
  const gone = run(P.empty, { memory: commit(r1) });
  const back = run(P.concentr, { memory: commit(gone) });
  ok('P.4 reaparecer se cuenta como APARICIÓN, no como que nunca se fue',
    back.memory.changesSinceLastObservation.some(c => c.kind === 'insight_appeared'
      && c.id === 'ai_concentration_top_position'));
  ok('P.5 …y el contador de observaciones se reinicia, así que no se afirma «sigue igual»',
    (() => { const e = back.memory.seen.find(x => x.id === 'ai_concentration_top_position');
      return e.observations === 1 && e.state === 'new'; })());
  // Nivel estático ya visto
  ok('P.6 un NIVEL estático ya visto varias veces deja de reclamar atención',
    (() => { const many = { observedAt: 1, dispersion: r1.dispersion.value,
        seen: r1.memory.seen.map(e => ({ id: e.id, dimension: e.dimension, label: e.label,
          firstSeenAt: 1, lastSeenAt: 1, observations: 7, resolvedAt: null })) };
      const r = run(P.concentr, { memory: many, context: FULL_CTX });
      return r.now.state !== 'attention_material_fact'; })());
  ok('P.7 …pero un CAMBIO medido sí la reclama las veces que ocurra',
    (() => { const prof = { snapshot: snap({ cashPct: 22 }), diversification: div(),
        core: core([CASHDRIFT(12, 10)]) };
      const f = run(prof);
      const many = { observedAt: 1, dispersion: f.dispersion.value,
        seen: f.memory.seen.map(e => ({ id: e.id, dimension: e.dimension, label: e.label,
          firstSeenAt: 1, lastSeenAt: 1, observations: 9, resolvedAt: null })) };
      const r = run(prof, { memory: many, context: FULL_CTX });
      return r.now.urgencyClaimed === true && r.now.supportedByFact === true; })());
}

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
