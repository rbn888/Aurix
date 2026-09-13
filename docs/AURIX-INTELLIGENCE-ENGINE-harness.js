'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INTELLIGENCE-ENGINE — el cerebro patrimonial y su honestidad
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
const INTEL_SRC = block('const _AURIX_INTEL_FIELDS = Object.freeze({',
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
vm.runInContext(CORE + '\n' + OBS + '\n' + PC01 + '\n' + INTEL_SRC
  + '\nglobalThis.AI = _aurixAdvancedIntelligence;'
  + '\nglobalThis.INTEL = _aurixIntel;'
  + '\nglobalThis.REC = _aurixIntelRecordAnswer;'
  + '\nglobalThis.CTXREAD = _aurixIntelContext;'
  + '\nglobalThis.DISP = _aurixIntelDispersion;'
  + '\nglobalThis.MEMCOMMIT = _aurixIntelCommitMemory;'
  + '\nglobalThis.FIELDS = _AURIX_INTEL_FIELDS;'
  + '\nglobalThis._aurixIntelMarkAsked = _aurixIntelMarkAsked;'
  + '\nglobalThis._aurixIntelDecline = _aurixIntelDecline;'
  + '\nglobalThis._aurixIntelPauseQuestions = _aurixIntelPauseQuestions;'
  + '\nglobalThis._aurixIntelHealth = _aurixIntelHealth;'
  + '\nglobalThis.MERGE = _aurixIntelCtxMerge;'
  + '\nglobalThis.ST = _AURIX_FACT_STATUS;', sandbox);
const { INTEL, REC, CTXREAD, DISP, MEMCOMMIT, FIELDS, ST } = sandbox;

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
const run = (prof, extra) => INTEL(Object.assign({ now: 2000000000000, context: { fields: {}, answered: 0, source: 'none' },
  memory: null, depth: 'premium' }, prof, extra || {}));

// ── A · LA SEPARACIÓN, DEMOSTRADA ───────────────────────────────────────────
group('A0 · naming · la superficie es AURIX INTELLIGENCE, no un segundo producto');
{
  // Instrucción explícita del founder: no existe un segundo producto llamado AURI.
  // Ni como copy, ni como namespace, ni como identificador. Esta aserción lo fija
  // para que no vuelva a entrar por comodidad de nombres cortos.
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const syms = (codeOnly.match(/\b[A-Za-z_$]*[Aa]uri(?![xX])[A-Za-z_$]*\b/g) || [])
    .filter(x => !/^Auris$/.test(x));          // `Auris`: nombre heredado, preexistente
  ok('A0.1 cero identificadores con namespace AURI en el código', syms.length === 0,
    Array.from(new Set(syms)).slice(0, 8));
  const cssSyms = (css.match(/\b[a-z-]*auri(?![xX])[a-z-]*\b/g) || []);
  ok('A0.2 cero clases CSS con namespace AURI', cssSyms.length === 0,
    Array.from(new Set(cssSyms)).slice(0, 8));
  // Y lo que de verdad ve el usuario: ninguna cadena publicable lo menciona.
  const strings = (src.match(/'[^'\n]{3,}'/g) || []).concat(src.match(/"[^"\n]{3,}"/g) || []);
  const visible = strings.filter(x => /\s/.test(x));    // con espacios = frase, no identificador
  ok('A0.3 ninguna frase publicable nombra AURI como producto',
    visible.every(x => !/\bauri\b/i.test(x)),
    visible.filter(x => /\bauri\b/i.test(x)).slice(0, 5));
  ok('A0.4 la card de salud se llama SALUD en los dos idiomas',
    /intcc_health_title:\s*'Salud'/.test(src) && /intcc_health_title:\s*'Health'/.test(src)
    && /esc\(t\('intcc_health_title'\)\)/.test(src));
}

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
  && /"owner":"user-A"/.test(st1.getItem('aurix_intel_ctx_v1'))
  && /"provenance":"user_answer"/.test(st1.getItem('aurix_intel_ctx_v1'))
  && /"answeredAt":111/.test(st1.getItem('aurix_intel_ctx_v1')));
ok('B.6 …y es ACTUALIZABLE sin acumular un histórico de respuestas',
  (() => { REC('primary_goal', 'grow', { store: st1, owner: 'user-A', now: 222 });
    const c = CTXREAD({ store: st1, owner: 'user-A' });
    return c.fields.primary_goal.value === 'grow' && c.fields.primary_goal.answeredAt === 222
      && (st1.getItem('aurix_intel_ctx_v1').match(/"provenance"/g) || []).length === 1; })());
ok('B.7 un valor fuera del catálogo se RECHAZA al escribir',
  REC('primary_goal', 'hodl', { store: st1, owner: 'user-A' }) === false);
ok('B.8 …y un storage manipulado no puede inyectar opciones ni campos nuevos',
  (() => { const s = mkStore();
    s.setItem('aurix_intel_ctx_v1', JSON.stringify({ owner: 'u', fields: {
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
  const asB = INTEL(Object.assign({ now: 9, depth: 'premium', store: s, owner: 'user-B' }, P.concentr));
  return asB.memory.hasHistory === false; })());
ok('C.5 las dos claves están en el ciclo de vida de cambio de usuario',
  /'aurix_intel_ctx_v1', 'aurix_intel_mem_v1'/.test(src)
  && src.indexOf("'aurix_intel_ctx_v1'") > src.indexOf('const USER_SCOPED_LOCAL_KEYS'));
ok('C.6 el motor no lee identidad por su cuenta más que para SELLAR',
  (() => { const f = bare(fnSrc('_aurixIntelOwner'));
    return /_aurixActiveUserId|_aurixCacheOwner/.test(f)
      && !/_aurixHealthScore|investableValueUSD/.test(bare(INTEL_SRC)); })());

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
    const raw = s.getItem('aurix_intel_mem_v1');
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
  !/benchmark|forecast|predict|sp500|index_compare/i.test(bare(INTEL_SRC))
  // La ÚNICA aparición de «correlation» permitida es la que declara que NO es medible.
  && (bare(INTEL_SRC).match(/correlation/g) || []).length
     === (bare(INTEL_SRC).match(/correlation_not_supported/g) || []).length);

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
  !/totUSD|totalInvestable|assetCount/.test(bare(fnSrc('_aurixIntel')).split('experience:')[1] || ''));
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
  results.forEach(([, r]) => (function walk(v, key) {
    // `forbiddenFraming` ENUMERA los marcos prohibidos («grade», «quality»,
    // «advice»): es lo contrario de una prescripción, así que no se audita como
    // si lo fuera.
    if (key === 'forbiddenFraming') return;
    if (typeof v === 'string') s.push(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], k));
  })(r, 'root')); return s; })();
const PRESCRIPTIVE = ['buy', 'sell', 'reduce', 'trim', 'rebalance', 'recommend', 'recommended',
  'advice', 'advise', 'avoid', 'exit', 'diversify', 'should'];
ok('L.1 ningún código emitido dirige un verbo de acción al usuario',
  allStrings.every(x => !tokensOf(x).some(tk => PRESCRIPTIVE.includes(tk))),
  allStrings.filter(x => tokensOf(x).some(tk => PRESCRIPTIVE.includes(tk))));
ok('L.2 no se emite juicio moral sobre la estructura',
  allStrings.every(x => !/^(good|bad|poor|excellent|healthy|unhealthy)$/i.test(x)));
ok('L.3 el motor no infiere tolerancia al riesgo',
  !/riskTolerance|risk_tolerance|riskProfile/.test(bare(INTEL_SRC)));
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
  && /intel\.now|nowState/.test(readingFn));
ok('M.2 …y el estado sale del motor, con un hecho detrás',
  /_aurixIntelNow/.test(bare(fnSrc('_aurixIntel'))) && /intel_now_/.test(readingFn));
const hsFn = bare(fnSrc('_intccHealthScore'));
ok('M.3 Intelligence ya no publica el score heredado: publica SALUD V2',
  /_aurixIntelHealth\s*\(/.test(hsFn) && !/_aurixHealthScore\s*\(/.test(hsFn));
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
  /intv8-intel-q/.test(src) && /class="intcc-chip intv8-intel-opt"/.test(src));
ok('M.11 responder tiene efecto inmediato: se guarda y se repinta',
  /_aurixIntelRecordAnswer/.test(src) && /renderIntelligenceTab\(\);/.test(src));
ok('M.12 y si no hay sesión, la escritura falla cerrada y se DICE',
  /saved \? _intv4T\(msg\) : _intv4T\('intel_disp_na_generic'\)/.test(src));
ok('M.13 la memoria se consolida con throttle: no se vacía al repintar',
  /30 \* 60 \* 1000/.test(src) && /_aurixIntelCommitMemory/.test(src));

// ── T · RENDIMIENTO ────────────────────────────────────────────────────────
group('T · rendimiento · una pintura, una agregación');
ok('T.1 la Salud RECIBE el modelo ya calculado en vez de recomputar el ledger',
  /function _intccHealthScore\(snap, drivers, intel\)/.test(src)
  && /let model = \(intel && intel\.model\) \|\| null;/.test(src));
ok('T.2 …y el renderer calcula el motor ANTES de la Salud, una sola vez',
  (() => { const r = fnSrc('_renderIntelligenceCommandCenter');
    return r.indexOf('_aurixIntel({') < r.indexOf('_intccHealthScore(snap, null, intel)')
      && (r.match(/_aurixIntel\(\{/g) || []).length === 1
      && (r.match(/_intccHealthScore\(/g) || []).length === 1; })());
ok('T.3 el motor no registra listeners ni timers propios',
  !/addEventListener|setInterval|setTimeout|requestAnimationFrame/.test(bare(INTEL_SRC)));
ok('T.4 la sincronización cross-device no hace polling: un tirón con suelo',
  !/setInterval/.test(src.slice(src.indexOf('_aurixIntelCtxPull'), src.indexOf('_aurixIntelCtxPull') + 4000))
  && /_nowPull - _aurixIntelCtxPulledAt > _AURIX_INTEL_CTX_PULL_FLOOR_MS/.test(src));
ok('T.5 hay UN solo listener delegado nuevo, y se arma una vez',
  (src.match(/_intelAnswerWired = true/g) || []).length === 1
  && /if \(!_intelAnswerWired\)/.test(src));

group('N · CSS · clases nuevas, sin alfa blanco y con foco visible');
const newCss = css.slice(css.indexOf('SPEC AURIX INTELLIGENCE · INTELLIGENCE ENGINE'));
ok('N.1 el bloque nuevo no introduce alfa blanco (= gris neutro sobre el lienzo)',
  !/rgba\(255,\s*255,\s*255/.test(newCss));
ok('N.1b la superficie nueva de descubrimientos usa el azul de marca POR TOKEN',
  /\.intv9-disc-mark \{[\s\S]{0,200}var\(--aurix-blue\)/.test(newCss));
ok('N.2 usa la escalera --elev-* y el azul institucional por token',
  /var\(--elev-1\)/.test(newCss) && /var\(--aurix-blue-rgb\)/.test(newCss));
ok('N.3 el anillo del índice deja de ser verde de «bien»',
  /--health-ring-color:\s*var\(--aurix-blue\)/.test(newCss));
ok('N.4 los controles nuevos tienen foco visible (teclado)',
  (newCss.match(/:focus-visible/g) || []).length >= 2);
ok('N.5 el disclosure no depende de hover, que en móvil no existe',
  /\.intv8-radar-summary\s*\{[\s\S]*?cursor: pointer/.test(newCss));
ok('N.6 hay ruta móvil declarada para lo táctil',
  /@media \(max-width: 640px\)[\s\S]*intv8-intel-opt/.test(newCss));
// El §12 del SPEC exige tocar la composición del hero (safe-zone de la esfera y
// altura adaptativa), así que una prohibición total de tocar reglas existentes
// dejaría de ser cierta. Se sustituye por una ALLOWLIST explícita: sólo estos tres
// selectores heredados, y sólo para propiedades de composición.
const TOUCHED_EXISTING = ['.intcc-hero-body', '.intcc-hero-orb-wrap', '.intcc-hero[data-has-question',
  '.intcc-m-hero-text[data-has-question',
  // El aviso legal baja una fila para que la línea compacta de «Qué ha cambiado»
  // no cierre la pantalla por debajo de él. Se reubica la FILA y nada más.
  '.aurix-intv6 .intcc-disclaimer'];
// `.intcc-tl-item.is-declared …` es un selector COMPUESTO que exige una clase
// NUEVA: no puede alterar el render de un item de memoria existente, así que es
// scoping y no modificación. Se lista aparte para que quede explícito.
const NEW_SCOPED = ['.intcc-tl-item.is-declared'];
const isNew = l => /intv8-|intv9-|is-tone-neutral/.test(l) || NEW_SCOPED.some(t => l.trim().startsWith(t));
ok('N.7 sólo se tocan 4 selectores heredados, y son los que exige el hero adaptativo',
  newCss.split('\n').filter(l => /^\.[a-z]/.test(l.trim()) && l.includes('{'))
    .every(l => isNew(l) || TOUCHED_EXISTING.some(t => l.trim().startsWith(t))),
  newCss.split('\n').filter(l => /^\.[a-z]/.test(l.trim()) && l.includes('{'))
    .filter(l => !isNew(l) && !TOUCHED_EXISTING.some(t => l.trim().startsWith(t))));
ok('N.8 …y sobre ellos sólo propiedades de composición, nunca color ni tipografía',
  (() => { const bad = [];
    newCss.split(/(?<=\})/).forEach(rule => {
      const head = (rule.match(/^[\s]*([^{]+)\{/) || [])[1] || '';
      if (!TOUCHED_EXISTING.some(t => head.trim().startsWith(t))) return;
      const props = (rule.match(/[a-z-]+\s*:/g) || []).map(x => x.replace(/\s*:$/, ''));
      props.forEach(pr => { if (!['padding-right', 'padding-top', 'padding-bottom', 'position',
        'z-index', 'pointer-events', 'align-items', 'grid-row'].includes(pr)) bad.push(head.trim() + ' → ' + pr); });
    });
    return bad.length === 0 ? true : bad; })() === true);
ok('N.8b las dos superficies nuevas declaran `order` en móvil y tablet',
  // Sin esto valían `order: 0` en un contenedor flex-column cuyos hijos van de 1 a
  // 10, así que se pintaban ANTES DEL HERO. Fue un FAIL real de la revisión.
  /@media \(max-width: 1023px\)[\s\S]{0,900}\.intv9-disc\s*\{ order: 9; \}/.test(newCss)
  && /\.intv9-changed-quiet \{ order: 9\.5; \}/.test(newCss));
ok('N.8c la línea compacta va ANTES del aviso legal, no después',
  /\.intv9-changed-quiet \{ grid-column: 1 \/ 13; grid-row: 6/.test(newCss)
  && /\.aurix-intv6 \.intcc-disclaimer \{ grid-row: 7; \}/.test(newCss));
ok('N.8d la celda de «descubrimientos» no puede tener dos ocupantes',
  /const discoveryHtml = discHtml \? '' :/.test(src));
ok('N.9 la esfera no puede robar un click a la pregunta',
  /\.intcc-hero-orb-wrap \{[^}]*pointer-events: none/.test(newCss));
ok('N.10 el hero se compacta sin pregunta y crece sólo con ella',
  /data-has-question="0"\] \{[^}]*padding-top: 16px/.test(newCss)
  && /data-has-question="1"\] \{[^}]*padding-top: 22px/.test(newCss));

// ── O · LA SUPERFICIE SE EJECUTA ────────────────────────────────────────────
// La revisión adversarial encontró un TypeError que este harness no podía ver: el
// grupo M certificaba la superficie con REGEX SOBRE EL FUENTE. `_intv4T('k')(args)`
// parece razonable leyéndolo y estalla al ejecutarlo —`_intv4T` ya invoca la
// función del diccionario—, y `renderIntelligenceTab` se tragaba la excepción
// dejando la pestaña en el layout legacy SIN el motor y en silencio. Es exactamente
// `feedback_harness_no_stubear_lo_certificado`. Así que aquí se cargan las
// funciones REALES de presentación con los diccionarios REALES y se ejercen TODOS
// los estados en los DOS idiomas.
group('O · presentación · ejecutada de verdad, en ES y EN');
{
  // Diccionarios reales: se extraen las líneas `intel_*` y las `intcc_*` que la
  // lectura consume, de cada uno de los dos bloques de idioma.
  const NEEDED = /^\s*(intel_[a-z0-9_]+|intcc_(read|sub)_[a-z_]+|intcc_health_title|intcc_health_suffix|intcc_band_empty):/;
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
    + fnSrc('_intelDiscoveryText') + '\n' + fnSrc('_intelQuestionText') + '\n'
    + fnSrc('_intv5Reading') + '\n'
    + 'globalThis.READ = _intv5Reading; globalThis.DT = _intelDiscoveryText;'
    + 'globalThis.QT = _intelQuestionText;', sb2);

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
      const intel = { now: { state: st, changeCount: 2 },
        discoveries: [{ code: 'apparent_vs_effective_diversification', values: { positions: 7, effectiveN: 2.5 } }],
        questions: [{ field: 'concentration_intent', subject: 'BTC' }],
        context: { fields: {} } };
      let r = null;
      try { r = sb2.READ(null, {}, null, intel); } catch (e) { badStates.push([lang, st, 'THROW ' + e.message]); return; }
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
      const intel = { now: { state: 'stable', changeCount: 0 }, discoveries: [], questions: [],
        context: { fields: { wealth_coverage: { value: 'partial' } } } };
      const r = sb2.READ(null, {}, null, intel);
      return r.sub.includes(ES.intel_ctx_partial); })());
  ok('O.7 sin motor la lectura NO afirma estabilidad: falla cerrada',
    (() => { sb2.t = k => ES[k]; const r = sb2.READ(null, {}, null, null);
      return r.intelState === 'insufficient_history' && r.title === ES.intel_now_history; })());
  ok('O.8 ningún estado publica urgencia en su clase visual sin venir del motor',
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

// ── Q · CICLO DE VIDA DE PREGUNTAS ─────────────────────────────────────────
group('Q · preguntas · no se repiten, se pueden declinar y se pueden pausar');
{
  const DAY = 864e5, T0 = 2000000000000;
  const ask = (ctxExtra, now) => run(P.concentr, { context: Object.assign(
    { fields: {}, answered: 0, source: 'stored', asked: {}, declined: {}, pausedAt: null },
    ctxExtra || {}), now: Number.isFinite(now) ? now : T0 });
  ok('Q.1 una concentración material dispara la pregunta la primera vez',
    ask().questions.length === 1 && ask().questions[0].field === 'concentration_intent');
  ok('Q.2 recién PREGUNTADA no se repite (ni al recargar ni al día siguiente)',
    ask({ asked: { q_concentration_intent: { at: T0, count: 1 } } }).questions
      .every(q => q.field !== 'concentration_intent')
    && ask({ asked: { q_concentration_intent: { at: T0 - DAY, count: 1 } } }, T0).questions
      .every(q => q.field !== 'concentration_intent'));
  ok('Q.3 …tampoco a la semana justa; vuelve a estar elegible pasado el cooldown',
    ask({ asked: { q_concentration_intent: { at: T0 - 6 * DAY, count: 1 } } }, T0).questions
      .every(q => q.field !== 'concentration_intent')
    && ask({ asked: { q_concentration_intent: { at: T0 - 8 * DAY, count: 1 } } }, T0).questions
      .some(q => q.field === 'concentration_intent'));
  ok('Q.4 en cooldown CEDE EL TURNO a otra útil en vez de callar a todas',
    ask({ asked: { q_concentration_intent: { at: T0, count: 1 } } }).questions.length === 1);
  ok('Q.5 «prefiero no responder» la cierra 90 días, sin guardar ningún valor',
    (() => { const c = ask({ declined: { concentration_intent: T0 - 30 * DAY } }, T0);
      return c.questions.every(q => q.field !== 'concentration_intent')
        && !c.context.fields.concentration_intent; })());
  ok('Q.6 …y a los 90+ días vuelve a ser elegible',
    ask({ declined: { concentration_intent: T0 - 100 * DAY } }, T0).questions
      .some(q => q.field === 'concentration_intent'));
  ok('Q.7 PAUSA: cero preguntas mientras está activa',
    ask({ pausedAt: T0 - DAY }, T0).questions.length === 0);
  ok('Q.8 …y la pausa NO borra respuestas, ni memoria, ni desactiva Intelligence',
    (() => { const r = run(P.concentr, { context: { fields: CTX_DELIB.fields, answered: 1,
        source: 'stored', asked: {}, declined: {}, pausedAt: T0 - DAY }, memory: storedMem, now: T0 });
      return r.context.answered === 1 && r.model.concentration.availability === 'available'
        && r.attention.length > 0 && r.questions.length === 0; })());
  ok('Q.9 la pausa expira sola tras 30 días',
    ask({ pausedAt: T0 - 40 * DAY }, T0).questions.length === 1);
  ok('Q.10 un cambio EXTRAORDINARIAMENTE material la levanta, y es determinista',
    (() => { const prof = { snapshot: snap({ cashPct: 24 }),
        diversification: div({ positions: 5, hhi: 0.49, effectiveN: 2.04, topWeightPct: 68 }),
        core: core([CASHDRIFT(14, 10)]) };
      const memSinLiquidez = { observedAt: 1, dispersion: 26, seen: [{ id: 'ai_concentration_top_position',
        dimension: 'concentration', label: 'dominant_position', firstSeenAt: 1, lastSeenAt: 1,
        observations: 2, resolvedAt: null }] };
      const r = run(prof, { context: { fields: {}, answered: 0, source: 'stored', asked: {},
        declined: {}, pausedAt: T0 - DAY }, memory: memSinLiquidez, now: T0 });
      return r.questionPolicy.materialReopen === true && r.questions.length >= 1; })());
  ok('Q.11 …y un cambio cualquiera NO la levanta',
    ask({ pausedAt: T0 - DAY }, T0).questionPolicy.materialReopen === false);
  ok('Q.12 el contrato de la pregunta ofrece SIEMPRE declinar y pausar',
    ask().questions.every(q => q.canDecline === true && q.canPause === true));
  ok('Q.13 la política se publica, así que la superficie no la reinventa',
    (() => { const p2 = ask().questionPolicy;
      return p2.cooldownMs === 7 * DAY && p2.declinedMs === 90 * DAY && p2.paused === false; })());
  // Persistencia real de las tres mutaciones
  const st = mkStore(), env = { store: st, owner: 'user-A', now: T0 };
  ok('Q.14 marcar PREGUNTADA persiste con su contador y no toca las respuestas',
    (() => { REC('primary_goal', 'grow', env);
      sandbox._aurixIntelMarkAsked('q_concentration_intent', env);
      sandbox._aurixIntelMarkAsked('q_concentration_intent', env);
      const c = CTXREAD(env);
      return c.asked.q_concentration_intent.count === 2 && c.fields.primary_goal.value === 'grow'; })());
  ok('Q.15 declinar persiste el campo y NO escribe valor',
    (() => { sandbox._aurixIntelDecline('concentration_intent', env);
      const c = CTXREAD(env);
      return Number.isFinite(c.declined.concentration_intent)
        && !c.fields.concentration_intent; })());
  ok('Q.16 pausar persiste y CONSERVA lo ya respondido',
    (() => { sandbox._aurixIntelPauseQuestions(env);
      const c = CTXREAD(env);
      return Number.isFinite(c.pausedAt) && c.fields.primary_goal.value === 'grow'; })());
  ok('Q.17 un campo inventado no se puede declinar',
    sandbox._aurixIntelDecline('nope', env) === false);
}

// ── R · SALUD V2 ───────────────────────────────────────────────────────────
group('R · Salud V2 · vuelve a llamarse Salud y sigue sin ser una nota');
{
  const H = sandbox._aurixIntelHealth;
  const m = (prof) => run(prof).model;
  ok('R.1 con reparto medible publica anillo, estado y confianza',
    (() => { const h = H(div({ positions: 9, hhi: 0.12, effectiveN: 8.33 }), snap({ assetCount: 9 }), m(P.diversified), null);
      return h.ring === 92 && h.state === 'weight_spread' && h.confidence === 'sufficient'; })());
  ok('R.2 UNA posición NO es «sin medir»: es el extremo definicional, y se dice',
    (() => { const h = H(div({ positions: 1, hhi: 1, effectiveN: 1, topWeightPct: 100 }),
        snap({ assetCount: 1 }), m(P.one), null);
      return h.state === 'single_position' && h.ring === 0 && h.ringPublishable === true; })());
  ok('R.3 cero posiciones: se dice que todavía no hay nada que analizar',
    H(div({ status: ST.UNAVAILABLE_SOURCE, positions: 0, effectiveN: null }),
      snap({ assetCount: 0, totUSD: 0 }), m(P.empty), null).state === 'no_positions');
  ok('R.4 posición no valorable: NO hay anillo y el estado dice qué lo limita',
    (() => { const h = H(div(), snap({ uncertifiablePositions: 1 }), m(P.partialVal), null);
      return h.ringPublishable === false && h.ring === null
        && h.state === 'coverage_limited' && h.reason === 'uncertifiable_positions'; })());
  ok('R.5 un dato que FALTA baja la confianza y NUNCA sube el anillo',
    (() => { const h = H(div(), snap({ uncertifiablePositions: 1 }), m(P.partialVal), null);
      return h.confidence === 'partial' && h.ring === null; })());
  ok('R.6 el patrimonio declarado PARCIAL también baja la confianza, sin tocar el anillo',
    (() => { const base = H(div({ positions: 9, effectiveN: 8.33 }), snap({ assetCount: 9 }), m(P.diversified), null);
      const partial = H(div({ positions: 9, effectiveN: 8.33 }), snap({ assetCount: 9 }), m(P.diversified),
        ctxOf({ wealth_coverage: { value: 'partial', provenance: 'user_answer', answeredAt: 1,
          purpose: 'scope_qualifier', changes: 'coverage' } }));
      return base.confidence === 'sufficient' && partial.confidence === 'partial'
        && base.ring === partial.ring; })());
  ok('R.7 el CONTEXTO no mueve ni el anillo, ni la confianza, ni los componentes',
    (() => { const base = H(div({ positions: 5, hhi: 0.49, effectiveN: 2.04, topWeightPct: 68 }),
        snap({ assetCount: 5 }), m(P.concentr), null);
      const withCtx2 = H(div({ positions: 5, hhi: 0.49, effectiveN: 2.04, topWeightPct: 68 }),
        snap({ assetCount: 5 }), m(P.concentr), CTX_DELIB);
      return base.ring === withCtx2.ring && base.confidence === withCtx2.confidence
        && JSON.stringify(base.components) === JSON.stringify(withCtx2.components)
        && base.contextNote === null
        && withCtx2.contextNote === 'concentration_declared_deliberate'; })());
  ok('R.8 nadie puede autoconcederse «buena salud» declarando experiencia',
    (() => { const exp = H(div({ positions: 5, hhi: 0.49, effectiveN: 2.04, topWeightPct: 68 }),
        snap({ assetCount: 5 }), m(P.concentr), ctxOf({ experience: { value: 'experienced',
          provenance: 'user_answer', answeredAt: 1, purpose: 'explanation_language', changes: 'language' } }));
      return exp.ring === 26 && exp.state === 'weight_in_few'; })());
  ok('R.9 estado y anillo salen de la MISMA magnitud: no pueden contradecirse',
    (() => { const vals = [[9, 8.33, 'weight_spread'], [5, 2.04, 'weight_in_few'], [4, 2.6, 'weight_uneven']];
      return vals.every(([n, eff, st2]) => H(div({ positions: n, effectiveN: eff }),
        snap({ assetCount: n }), null, null).state === st2); })());
  ok('R.10 los componentes se publican UNO A UNO, con su disponibilidad',
    (() => { const h = H(div({ positions: 9, effectiveN: 8.33 }), snap({ assetCount: 9 }), m(P.diversified), null);
      return h.components.length === 4
        && h.components.every(c => !!c.id && !!c.unit && !!c.availability)
        && h.components.some(c => c.id === 'liquidity'); })());
  ok('R.11 la liquidez se publica como NIVEL y no puntúa en ninguna dirección',
    (() => { const alta = H(div({ positions: 5, effectiveN: 3.5 }), snap({ assetCount: 5, cashPct: 80 }), m(P.cashHeavy), null);
      const baja = H(div({ positions: 5, effectiveN: 3.5 }), snap({ assetCount: 5, cashPct: 0 }), m(P.noCash), null);
      return alta.ring === baja.ring; })());
  ok('R.11b UNA posición con otra sin valorar NO afirma «todo depende de una sola»',
    (() => { const h = H(div({ positions: 1, hhi: 1, effectiveN: 1, topWeightPct: 100 }),
        snap({ assetCount: 2, uncertifiablePositions: 1 }), null, null);
      return h.state === 'coverage_limited' && h.ringPublishable === false
        && h.confidence === 'partial'; })());
  ok('R.12 el marco prohibido viaja con el owner',
    H(div(), snap(), null, null).forbiddenFraming.join(',') === 'grade,quality,advice');
}

// ── S · CROSS-DEVICE ───────────────────────────────────────────────────────
group('S · cross-device · contrato, fail-closed y legacy-safe');
{
  const pullFn = fnSrc('_aurixIntelCtxPull'), pushFn = fnSrc('_aurixIntelCtxPush');
  ok('S.1 la AUTORIDAD es la tabla por usuario, no el navegador',
    /_AURIX_INTEL_CTX_TABLE/.test(pullFn) && /intelligence_context/.test(src));
  ok('S.2 se filtra SIEMPRE por el usuario leído, y se re-verifica tras el await',
    /\.eq\('user_id', uid\)/.test(pullFn) && /_aurixActiveUserId !== uid\) return/.test(pullFn)
    && /user_id: uid/.test(pushFn) && /_aurixActiveUserId !== uid\) return/.test(pushFn));
  // ── CONVERGENCIA REAL, EJECUTANDO EL MERGE ──
  // Aquí estaba el agujero de cobertura que encontró la revisión adversarial: los
  // asserts eran REGEX sobre el fuente, así que habrían pasado en verde sobre un
  // diseño que BORRABA la respuesta del otro dispositivo. Ahora se ejecuta.
  const MG = sandbox.MERGE;
  const ANS = (v, at) => ({ value: v, provenance: 'user_answer', answeredAt: at });
  ok('S.5 EL CRÍTICO: un dispositivo que sólo MIRÓ no puede borrar una respuesta',
    (() => {
      // A abrió la pantalla: sólo tiene `asked`, con `fields` vacío.
      const soloMiro = { fields: {}, asked: { q_primary_goal: { at: 500, count: 1 } }, declined: {}, pausedAt: null };
      // B respondió: la fila del servidor tiene la respuesta.
      const remoto = { fields: { primary_goal: ANS('income', 900) }, asked: {}, declined: {}, pausedAt: null };
      const m = MG(soloMiro, remoto);
      return m.fields.primary_goal && m.fields.primary_goal.value === 'income'
        && m.asked.q_primary_goal.at === 500;
    })());
  ok('S.5b el merge es CONMUTATIVO: da igual quién sincronice primero',
    (() => { const a = { fields: { primary_goal: ANS('grow', 100), horizon: ANS('long', 300) },
        asked: { q1: { at: 10, count: 2 } }, declined: { liquidity_need: 50 }, pausedAt: 70 };
      const b = { fields: { primary_goal: ANS('income', 200) },
        asked: { q1: { at: 40, count: 1 }, q2: { at: 5, count: 1 } }, declined: {}, pausedAt: 20 };
      return JSON.stringify(MG(a, b)) === JSON.stringify(MG(b, a)); })());
  ok('S.5c …e IDEMPOTENTE: sincronizar dos veces no cambia nada',
    (() => { const a = { fields: { horizon: ANS('short', 5) }, asked: {}, declined: {}, pausedAt: null };
      const b = { fields: { primary_goal: ANS('grow', 9) }, asked: {}, declined: {}, pausedAt: null };
      const once = MG(a, b);
      return JSON.stringify(MG(once, b)) === JSON.stringify(once)
        && JSON.stringify(MG(once, a)) === JSON.stringify(once); })());
  ok('S.5d LWW POR CAMPO: gana la respuesta más reciente, campo a campo',
    (() => { const m = MG(
        { fields: { primary_goal: ANS('grow', 100), horizon: ANS('long', 900) }, asked: {}, declined: {}, pausedAt: null },
        { fields: { primary_goal: ANS('income', 500), horizon: ANS('short', 200) }, asked: {}, declined: {}, pausedAt: null });
      return m.fields.primary_goal.value === 'income' && m.fields.horizon.value === 'long'; })());
  ok('S.5e un empate de timestamp resuelve igual en los dos dispositivos',
    (() => { const a = { fields: { primary_goal: ANS('grow', 7) } }, b = { fields: { primary_goal: ANS('income', 7) } };
      return MG(a, b).fields.primary_goal.value === MG(b, a).fields.primary_goal.value; })());
  ok('S.5f `asked` toma el máximo, así que una pregunta no reaparece en el otro dispositivo',
    (() => { const m = MG({ asked: { q1: { at: 10, count: 1 } } }, { asked: { q1: { at: 99, count: 3 } } });
      return m.asked.q1.at === 99 && m.asked.q1.count === 3; })());
  ok('S.5g declinar y pausar también convergen al máximo: no se «des-declinan»',
    (() => { const m = MG({ declined: { concentration_intent: 10 }, pausedAt: 5 },
        { declined: { concentration_intent: 80 }, pausedAt: 2 });
      return m.declined.concentration_intent === 80 && m.pausedAt === 5; })());
  ok('S.5h el merge NUNCA pierde un campo que exista en alguno de los dos lados',
    (() => { const a = { fields: { horizon: ANS('long', 1) } }, b = { fields: { experience: ANS('some', 2) } };
      const m = MG(a, b);
      return !!m.fields.horizon && !!m.fields.experience; })());
  ok('S.5i MOSTRAR una pregunta no vuelve autoritativo al dispositivo',
    !/dirty: true/.test(fnSrc('_aurixIntelMarkAsked')));
  ok('S.5j …y las mutaciones REALES del usuario sí quedan pendientes de subir',
    ['_aurixIntelRecordAnswer', '_aurixIntelDecline', '_aurixIntelPauseQuestions']
      .every(fn => /dirty: true/.test(fnSrc(fn))));
  ok('S.5k la marca de pendiente sólo se limpia si el registro NO mutó en el viaje',
    /Number\(cur\.updatedAt \|\| 0\) !== stamp\) return;/.test(pushFn));
  ok('S.5l el pull FUSIONA y sube el resultado si aporta algo, en vez de elegir un ganador',
    /_aurixIntelCtxMerge\(local, data\.payload\)/.test(pullFn)
    && /differsFromRemote/.test(pullFn));
  ok('S.5m un payload de un esquema FUTURO no se interpreta con las reglas de hoy',
    /Number\(data\.schema_version \|\| 1\) > _AURIX_INTEL_CTX_SCHEMA\) return null/.test(pullFn));
  ok('S.6 sólo viaja contexto de presentación: ni importes ni posiciones ni precios',
    /payload = _aurixIntelCtxMerge\(local, null\)/.test(pushFn)
    && !/totUSD|assetValue|price|amount|holdings/.test(pushFn)
    && (() => { const keys = Object.keys(MG({ fields: { horizon: ANS('long', 1) },
        asked: {}, declined: {}, pausedAt: null, owner: 'u', dirty: true, updatedAt: 9 }, null));
      // El merge define el payload, así que `owner`, `dirty` y `updatedAt` NO pueden
      // viajar al servidor por descuido: no existen en su salida.
      return JSON.stringify(keys.sort()) === JSON.stringify(['asked', 'declined', 'fields', 'pausedAt']); })());
  ok('S.7 el dueño NO lo manda el cliente en el payload',
    !/owner:/.test(pushFn.slice(pushFn.indexOf('const payload'))));
  ok('S.8 un solo tirón por apertura, con suelo: no hay polling',
    /_AURIX_INTEL_CTX_PULL_FLOOR_MS/.test(src)
    && !/setInterval[\s\S]{0,200}_aurixIntelCtxPull/.test(src));
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'intelligence_context_1.sql'), 'utf8');
  ok('S.9 la migración es ADITIVA e idempotente: no borra ni renombra nada',
    /create table if not exists/.test(sql)
    && !/\bdrop table\b(?![^\n]*--)/.test(sql.split('-- ── ROLLBACK')[0])
    && !/\balter table [^\n]*drop\b/.test(sql) && !/\brename\b/.test(sql));
  ok('S.10 RLS activa y una política POR operación, todas ligadas a auth.uid()',
    /enable row level security/.test(sql)
    && (sql.match(/^create policy/gm) || []).length === 3
    && (sql.match(/auth\.uid\(\) = user_id/g) || []).length >= 4);
  ok('S.11 sin política de DELETE: el borrado va por cascade de la cuenta',
    !/for delete/.test(sql) && /on delete cascade/.test(sql));
  ok('S.12 el grant es SÓLO para `authenticated` (ni anon ni service en el cliente)',
    /grant select, insert, update on public\.intelligence_context to authenticated/.test(sql)
    && !/to anon/.test(sql));
  ok('S.13 trae rollback y una verificación que se ejecuta APARTE',
    /-- ── ROLLBACK/.test(sql) && /nunca en la misma transacción/.test(sql));
  ok('S.14 hay cota de tamaño: el contexto no puede volverse un vertedero',
    /pg_column_size\(payload\) < 64 \* 1024/.test(sql));
  ok('S.15b el contexto guardado con el NOMBRE ANTERIOR de la clave se adopta una vez',
    (() => { const st2 = mkStore();
      st2.setItem('aurix_auri_ctx_v1', JSON.stringify({ owner: 'u1', fields: {
        primary_goal: { value: 'preserve', provenance: 'user_answer', answeredAt: 5 } } }));
      const c = CTXREAD({ store: st2, owner: 'u1' });
      return c.fields.primary_goal.value === 'preserve'
        && /primary_goal/.test(st2.getItem('aurix_intel_ctx_v1') || ''); })());
  ok('S.15c …pero NUNCA el de otro usuario: la adopción exige el mismo sello',
    (() => { const st2 = mkStore();
      st2.setItem('aurix_auri_ctx_v1', JSON.stringify({ owner: 'u1', fields: {
        primary_goal: { value: 'preserve', provenance: 'user_answer', answeredAt: 5 } } }));
      return CTXREAD({ store: st2, owner: 'u2' }).answered === 0; })());
  ok('S.15d y las claves antiguas se purgan en un cambio de usuario',
    /'aurix_auri_ctx_v1', 'aurix_auri_mem_v1'/.test(src)
    && src.indexOf("'aurix_auri_ctx_v1'") > src.indexOf('const USER_SCOPED_LOCAL_KEYS'));
  ok('S.15 una cuenta LEGACY sin fila funciona igual (el motor lee local y síncrono)',
    (() => { const r = run(P.concentr, { context: undefined, store: mkStore(), owner: 'legacy-user' });
      return !!r && r.context.answered === 0 && r.model.concentration.availability === 'available'; })());
}

// ── U · SUPERFICIES FINALES ─────────────────────────────────────────────────
// Se EJECUTAN las funciones de superficie con fixtures; nada de regex para
// afirmar comportamiento (la lección ya cuesta tres repeticiones).
group('U · superficies finales · Explora, prioridad, Memoria, cambios, descubrimientos');
{
  const sb3 = { console, Object, Number, Math, Array, Set, Map, JSON, isFinite, window: undefined };
  vm.createContext(sb3);
  // Copy real ES para que el texto emitido sea el de producción.
  const NEED = /^\s*(intv9_[a-z0-9_]+|intel_d_[a-z_]+|intv4_(explore_title|brief_title|memory_title|memory_empty|changed_title|changed_others_none|changed_stable|changed_all_published|changed_empty)):/;
  const byKey = new Map();
  src.split('\n').forEach(l => { const m = l.match(NEED); if (!m) return;
    if (!byKey.has(m[1])) byKey.set(m[1], []); byKey.get(m[1]).push(l.trim().replace(/,$/, '')); });
  const twice = Array.from(byKey.keys()).filter(k => byKey.get(k).length === 2);
  ok('U.0 toda la copy nueva de superficie existe en LOS DOS idiomas',
    twice.length === byKey.size, Array.from(byKey.keys()).filter(k => byKey.get(k).length !== 2));
  // eslint-disable-next-line no-new-func
  const ES = new Function('return ({' + twice.map(k => byKey.get(k)[0]).join(',\n') + '})')();
  sb3.t = k => ES[k];
  sb3._AURIX_CAUSAL_ROOT = sandbox._AURIX_CAUSAL_ROOT || { TOP_POSITION: 'top_position',
    CATEGORY_MIX: 'category_mix', CASH_WEIGHT: 'cash_weight', INVESTABLE_RETURN: 'investable_return',
    EXTERNAL_CAPITAL: 'external_capital', WEALTH_LEVEL: 'wealth_level', DATA_COVERAGE: 'data_coverage' };
  vm.runInContext(block('const _INTV4_BRIEF_MAX = 3;', '});')
    + '\n' + fnSrc('_aurixIntelRootsOf') + '\n' + fnSrc('_intv4T') + '\n' + fnSrc('_intv4Num')
    + '\nconst _AURIX_INTEL_DISC_MAX = 3;'
    + '\n' + fnSrc('_intelDiscoveryText') + '\n' + fnSrc('_intv9DiscoveriesHtml')
    + '\n' + fnSrc('_intv4MemoryDeclared') + '\n' + fnSrc('_intccEsc')
    + '\nglobalThis.DISC = _intv9DiscoveriesHtml; globalThis.DECL = _intv4MemoryDeclared;'
    + '\nglobalThis.ROOTS = _aurixIntelRootsOf; globalThis.BRIEF_MAX = _INTV4_BRIEF_MAX;'
    + '\nglobalThis.EXPLORE_MAX = _INTV4_EXPLORE_MAX;', sb3);

  ok('U.1 «Lo que importa» está acotado a 1–3 y Explora a 4',
    sb3.BRIEF_MAX === 3 && sb3.EXPLORE_MAX === 4);
  ok('U.2 el puente dimensión→raíz cubre las cinco dimensiones publicables',
    (() => { const r = sb3.ROOTS({ attention: [{ dimension: 'concentration' }, { dimension: 'liquidity' },
        { dimension: 'evolution' }, { dimension: 'structure' }, { dimension: 'diversification' }], discoveries: [] });
      return new Set(r).size === 4 && r.length === 5; })());
  // ── DESCUBRIMIENTOS ──
  const D = (code, dim, ev) => ({ code, dimension: dim, evidence: ev || ['effective_holdings'],
    values: { positions: 7, effectiveN: 2.5, topWeightPct: 68, observations: 4, count: 3,
      recordedCapitalNet: 25000 } });
  ok('U.3 sin descubrimientos NO se pinta card: no se rellena por rellenar',
    sb3.DISC({ discoveries: [] }, sb3._intccEsc, []) === '');
  ok('U.4 con descubrimientos se pinta, con su procedencia visible',
    (() => { const h = sb3.DISC({ discoveries: [D('apparent_vs_effective_diversification', 'diversification')] },
        sb3._intccEsc, []);
      return /intv9-disc/.test(h) && /intv9-disc-ev/.test(h)
        && h.includes('7 posiciones') && h.includes(ES.intv9_disc_evidence); })());
  ok('U.5 NO duplica lo que «Lo que importa» ya encabeza (exclusión por raíz)',
    sb3.DISC({ discoveries: [D('apparent_vs_effective_diversification', 'diversification')] },
      sb3._intccEsc, ['top_position']) === '');
  ok('U.5b …ni lo que el HERO ya publica como lectura (exclusión por id)',
    (() => { const d = D('apparent_vs_effective_diversification', 'diversification');
      d.id = 'disc_apparent_vs_effective';
      return sb3.DISC({ discoveries: [d] }, sb3._intccEsc, [], ['disc_apparent_vs_effective']) === ''; })());
  ok('U.5c …y `skipRoots` (la raíz que Factores publica) TAMBIÉN excluye',
    /mattersRoots\.concat\(skipRoots\)/.test(src));
  ok('U.5d un descubrimiento CONTEXTUAL retira su mitad declarativa de la Memoria',
    /discFields\.push\('primary_goal'\)/.test(src) && /discFields\.push\('liquidity_need'\)/.test(src)
    && (() => { const d = sb3.DECL({ context: { fields: { liquidity_need: { value: 'imminent',
        provenance: 'user_answer', answeredAt: 1 } } } }, ['liquidity_need']);
      return d.length === 0; })());
  ok('U.6 tope de 3 descubrimientos activos',
    (() => { const many = ['apparent_vs_effective_diversification', 'level_rose_on_capital_not_return',
        'reading_persists_across_observations', 'several_readings_moved_together']
        .map((c, i) => D(c, ['diversification', 'evolution', 'liquidity', 'structure'][i]));
      const h = sb3.DISC({ discoveries: many }, sb3._intccEsc, []);
      return (h.match(/intv9-disc-item/g) || []).length === 3 && /data-count="3"/.test(h); })());
  ok('U.7 un descubrimiento sin texto soportado no se publica',
    sb3.DISC({ discoveries: [D('codigo_inventado', 'liquidity')] }, sb3._intccEsc, []) === '');
  // ── MEMORIA · contexto declarado ──
  const ctxF = (f) => ({ context: { fields: f } });
  ok('U.8 la Memoria publica lo que el usuario DECLARÓ, y sólo eso',
    (() => { const d = sb3.DECL(ctxF({ concentration_intent: { value: 'deliberate',
        provenance: 'user_answer', answeredAt: 500 } }));
      return d.length === 1 && d[0].field === 'concentration_intent'
        && d[0].txt === ES.intv9_mem_intent_deliberate; })());
  ok('U.9 un valor INFERIDO o por defecto no se presenta como un recuerdo',
    sb3.DECL(ctxF({ primary_goal: { value: 'grow', provenance: 'inferred', answeredAt: 1 } })).length === 0);
  ok('U.10 sin contexto no se fabrica ningún recuerdo',
    sb3.DECL(ctxF({})).length === 0 && sb3.DECL(null).length === 0);
  ok('U.11 lo declarado se ordena por lo más reciente y lleva su fecha',
    (() => { const d = sb3.DECL(ctxF({
        primary_goal: { value: 'grow', provenance: 'user_answer', answeredAt: 100 },
        horizon: { value: 'long', provenance: 'user_answer', answeredAt: 900 } }));
      return d[0].field === 'horizon' && d[1].field === 'primary_goal' && d[0].at === 900; })());
  ok('U.12 los cinco campos recordables tienen copy para TODOS sus valores',
    (() => { const F = sandbox.FIELDS;
      const MAP = { concentration_intent: 'intv9_mem_intent', primary_goal: 'intv9_mem_goal',
        horizon: 'intv9_mem_horizon', liquidity_need: 'intv9_mem_liq', wealth_coverage: 'intv9_mem_coverage' };
      const missing = [];
      Object.keys(MAP).forEach(k => F[k].options.forEach(o => {
        if (!ES[MAP[k] + '_' + o]) missing.push(MAP[k] + '_' + o); }));
      return missing.length === 0 ? true : missing; })() === true);
  // ── QUÉ HA CAMBIADO · compacto ──
  const chgFn = fnSrc('_intv4ChangedHtml');
  ok('U.13 sin filas NO se pinta una card con título: una línea discreta',
    /intv9-changed-quiet/.test(chgFn)
    && chgFn.indexOf('intv9-changed-quiet') < chgFn.indexOf('intcc-card intv4-changed'));
  ok('U.14 …y las cuatro frases distintas del estado vacío se conservan',
    /intv4_changed_empty/.test(chgFn) && /intv4_changed_others_none/.test(chgFn)
    && /intv4_changed_all_published/.test(chgFn) && /intv4_changed_stable/.test(chgFn));
  ok('U.15 con filas SÍ se pinta la card completa',
    /data-state="rows"/.test(chgFn) && /intv4-chg-list/.test(chgFn));
  ok('U.16 la rejilla ya recompone sola cuando la card desaparece',
    /:not\(:has\(\.intv4-changed\)\) \.intv5-structure \{ grid-column: 1 \/ 13/.test(css));
  ok('U.17 la línea compacta vive FUERA de las filas de cards (1–4) y antes del aviso legal',
    /\.intv9-changed-quiet \{ grid-column: 1 \/ 13; grid-row: 6/.test(css)
    && /\.aurix-intv6 \.intcc-disclaimer \{ grid-row: 7; \}/.test(css));
  // ── EXPLORA · deja de ser fija ──
  const expFn = fnSrc('_intv4ExploreHtml');
  ok('U.18 Explora ordena por relevancia AHORA y por lo menos visto, sin azar',
    /hot\.has\(a\.q\.causalRoot\)/.test(expFn) && /shownAt\[a\.q\.id\]/.test(expFn)
    && !/Math\.random/.test(expFn));
  ok('U.19 …y registra lo mostrado con prefijo `x:` para que la próxima visita cambie',
    // `data-intcc-q="` son 14 caracteres. Con 15 se comía el primer carácter del
    // id, nunca coincidía con `q.id` y la señal quedaba MUERTA: FAIL de la revisión.
    /'x:' \+ m\.slice\(14, -1\)/.test(src) && /indexOf\('x:'\) === 0/.test(expFn));
  ok('U.19b el id anotado coincide EXACTAMENTE con el que lee Explora',
    (() => { const m = 'data-intcc-q="top_position_intent"';
      return ('x:' + m.slice(14, -1)).slice(2) === 'top_position_intent'; })());
  ok('U.19c el desempate por «lo menos visto» se agrupa por DÍA, no por render',
    /Math\.floor\(Number\(shownAt\[a\.q\.id\] \|\| 0\) \/ 864e5\)/.test(expFn));
  ok('U.19d las anotaciones se filtran en LAS DOS puertas al Core',
    (src.match(/indexOf\('x:'\) === 0\)\)/g) || []).length >= 2);
  ok('U.20 el desempate final es el id: mismo estado ⇒ mismo orden',
    /a\.q\.id < b\.q\.id \? -1 : 1/.test(expFn));
  // ── PRIORIDAD ──
  const mSel = fnSrc('_intv5MattersStories'), mFn = fnSrc('_intv5MattersHtml');
  ok('U.21 el orden de «Lo que importa» lo pone el motor, con caída al Core',
    /intel && intel\.attention/.test(mSel) && /rank\.size \? 'intelligence' : 'core'/.test(mSel)
    && /b\.priority - a\.priority/.test(mSel));
  ok('U.22 …usando la RELEVANCIA contextual, no sólo la prioridad del Core',
    /Number\.isFinite\(i\.relevance\)/.test(mSel));
  // La selección se corta UNA vez (en el owner). La otra aparición de
  // `_INTV4_BRIEF_MAX` es el límite del Brief legacy de `_intv4ChangedHtml`, que no
  // pinta esta superficie.
  ok('U.22b UNA sola selección alimenta la card, Memoria, Cambios y Descubrimientos',
    /_intv5MattersStories\(core, skipRoots, intel\)/.test(mFn)
    && /const mattersSel = _intv5MattersStories\(core, skipRoots, intel\)\.stories/.test(src)
    && /const mattersRoots = mattersSel\.map/.test(src)
    && /const publishedTexts = mattersSel\.map/.test(src)
    && /const shown = mattersSel\.map/.test(src)
    && /mattersSel\.forEach/.test(src)
    // Cero derivaciones paralelas de `topStories` con el límite del Brief.
    && !/\(core\.topStories \|\| \[\]\)[\s\S]{0,200}slice\(0, _INTV4_BRIEF_MAX\)/.test(
        fnSrc('_renderIntelligenceCommandCenter')));
  ok('U.22c las anotaciones de Explora no llegan a la novedad del Core',
    /indexOf\('x:'\) === 0\) \}\)/.test(src.replace(/\s+/g, ' ').replace(/ \}\)/g, ' })'))
    || /presentationHistory: _intv4ReadShown\(\)\s*\n?\s*\.filter\(e => !\(e && typeof e\.semanticKey === 'string' && e\.semanticKey\.indexOf\('x:'\) === 0\)\)/.test(src));
  ok('U.23 las cuatro superficies reciben el motor desde el renderer',
    (() => { const r = fnSrc('_renderIntelligenceCommandCenter');
      return /_intv4ExploreHtml\(core, esc, intel\)/.test(r)
        && /_intv5MattersHtml\(core, esc, depth, skipRoots, intel\)/.test(r)
        && /_intv4MemoryHtml\(core, esc, publishedKeys, intel, discFields\)/.test(r)
        && /_intv9DiscoveriesHtml\(intel, esc, mattersRoots\.concat\(skipRoots\), heroDiscId\)/.test(r); })());
}

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
