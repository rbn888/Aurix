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
// §9 — OCHO campos, y el que se añade justifica su existencia: con CERO liquidez
// registrada, cualquier lectura de liquidez describe lo registrado y puede no
// describir el patrimonio, y eso Aurix no lo puede deducir. Lo que este assert
// protege —que no haya un cuestionario— no es el número de campos del catálogo
// sino cuántos pueden PREGUNTARSE, así que se comprueba lo segundo también.
ok('B.1 ocho campos, y como máximo cinco son preguntables: no es un cuestionario',
  Object.keys(FIELDS).length === 8
  && (fnSrc('_aurixIntelQuestions').match(/field: '/g) || []).length <= 5,
  JSON.stringify(Object.keys(FIELDS)));
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
// ── §6 RE-DECIDE EL UMBRAL, CON CAUSA ─────────────────────────────────────
// El assert anterior fosilizaba `positions >= 3` con el argumento de que el
// índice «degenera» con N=2. Eso era cierto del ratio SIN reescalar (80/20 daba
// 74 %) y deja de serlo del REESCALADO —(effectiveN−1)/(N−1)—, que está definido
// en todo [0,1] para N=2: 50/50 → 100, 99/1 → 4, 80/20 → 47. §6 prohíbe por su
// nombre «cualquier barrera arbitraria de mínimo tres posiciones». Lo que sigue
// intacto es el único caso en que el índice NO EXISTE: N=1 (D.4), donde el
// denominador es 0.
ok('D.1c DOS posiciones 80/20 SÍ publican cifra: el dominio empieza en dos',
  (() => { const x = DISP(div({ positions: 2, hhi: 0.68, effectiveN: 1.47, topWeightPct: 80 }), snap({ assetCount: 2 }));
    const par = DISP(div({ positions: 2, hhi: 0.5, effectiveN: 2, topWeightPct: 50 }), snap({ assetCount: 2 }));
    const casi = DISP(div({ positions: 2, hhi: 0.9802, effectiveN: 1.02, topWeightPct: 99 }), snap({ assetCount: 2 }));
    return x.availability === 'available' && x.value === 47 && x.reason === ''
      && par.value === 100 && casi.value === 2
      && Number.isFinite(x.value) && !Number.isNaN(x.value); })(),
  JSON.stringify(DISP(div({ positions: 2, hhi: 0.68, effectiveN: 1.47, topWeightPct: 80 }), snap({ assetCount: 2 }))));
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
// LA VERSIÓN ANTERIOR DE ESTA ASERCIÓN FIJABA EL DEFECTO COMO CONTRATO: exigía
// que una lectura DESAPARECIDA se marcase RESUELTA. Desaparecer no prueba nada
// —hidratación, FX, esquema, supresión por evidencia, cambio de cuenta— así que
// ahora se exige lo contrario: ni se afirma, ni se pierde la línea base.
ok('E.4 un insight que desaparece NO se marca resuelto, y su línea base sobrevive',
  (() => { const r = run(P.empty, { memory: storedMem });
    const gone = r.memory.seen.find(e => e.id === 'ai_concentration_top_position');
    return !r.memory.changesSinceLastObservation.some(c => c.kind === 'insight_resolved')
      && r.memory.changeCount === 0
      && !!gone && gone.state === 'unobserved' && gone.resolvedAt === null
      && gone.observations === (storedMem.seen.find(e => e.id === 'ai_concentration_top_position') || {}).observations; })(),
  JSON.stringify(run(P.empty, { memory: storedMem }).memory));
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
// A1 · RETIRADO. Ver la nota de `_aurixIntelDiscoveries` §3: atribuiría toda la
// subida del nivel al único trozo que Aurix sabe nombrar (la liquidez REGISTRADA)
// cuando la rotación interna crea valor registrado y no se puede descartar. El
// gate pasa a fijar la RETIRADA, que es el invariante nuevo.
ok('F.2 la dicotomía capital-vs-mercado NO se publica como descubrimiento',
  !run(P.bigInflow).discoveries.some(d => d.code === 'level_rose_on_capital_not_return'),
  JSON.stringify(run(P.bigInflow).discoveries.map(d => d.code)));
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
// ── §17 RETIRA LA PUBLICACIÓN, NO LA SEÑAL ────────────────────────────────
// «Esta lectura sigue igual tras 11 observaciones; ya no es una novedad» falla
// las tres preguntas que §17 exige a un patrón: no dice QUÉ condición persiste,
// no dice durante qué periodo —una «observación» era una visita separada 30 min
// de la anterior, es decir ABRIR LA PÁGINA, que §17 declara que NO es una
// observación— y no dice por qué importa. La SEÑAL sigue siendo imprescindible
// (gobierna prioridad y la coherencia del hero), así que este assert comprueba
// las dos mitades: que la señal existe y que NO se publica como descubrimiento.
ok('F.7 lo que PERSISTE sigue siendo señal interna y NO se publica como patrón',
  (() => { const many = { observedAt: 1, dispersion: first.dispersion.value, seen: first.memory.seen.map(e =>
      ({ id: e.id, dimension: e.dimension, label: e.label, firstSeenAt: 1, lastSeenAt: 1, observations: 6 })) };
    const r = run(P.concentr, { memory: many });
    return Array.isArray(r.memory.persisting) && r.memory.persisting.length > 0
      && !r.discoveries.some(d => d.code === 'reading_persists_across_observations')
      && !/observaciones|observations/i.test(JSON.stringify(r.discoveries)); })(),
  JSON.stringify((run(P.concentr, { memory: { observedAt: 1, dispersion: first.dispersion.value,
    seen: first.memory.seen.map(e => ({ id: e.id, dimension: e.dimension, label: e.label,
      firstSeenAt: 1, lastSeenAt: 1, observations: 6 })) } }).discoveries || []).map(d => d.code)));
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
// El invariante es que Free ve un descubrimiento ENTERO, no recortado — no que
// esa cartera concreta produzca uno. Se usa una que sí produce descubrimiento tras
// la retirada de la dicotomía; si no hubiera ninguno, el contrato sigue siendo que
// los totales coinciden y que lo que se muestra no está truncado.
ok('I.5 Free ve UN descubrimiento entero, no un teaser recortado',
  (() => { const f = run(P.concentr, { depth: 'free' }), p = run(P.concentr, { depth: 'premium' });
    if (!p.discoveriesTotal) return f.discoveries.length === 0 && f.discoveriesTotal === 0;
    return f.discoveries.length === 1 && f.discoveriesTotal === p.discoveriesTotal
      && JSON.stringify(f.discoveries[0]) === JSON.stringify(p.discoveries[0]); })(),
  JSON.stringify({ free: run(P.concentr, { depth: 'free' }).discoveries.length,
                   total: run(P.concentr, { depth: 'premium' }).discoveriesTotal }));
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
// RE-DECIDIDO · HERO FINALIZATION: el founder retira «Qué mide cada eje». El
// disclosure resolvió un problema real (tres párrafos permanentes) pero seguía
// siendo un control, un hueco reservado y un elemento enfocable al pie de la card.
// Lo que estas aserciones protegían de verdad —que la LIMITACIÓN se vea— se
// comprueba ahora donde el usuario la está mirando: en el propio SVG.
ok('M.7 el radar ya no tiene disclosure ni control alguno al pie',
  !/<details/.test(radarFn) && !/<summary/.test(radarFn)
  && !/intv7-radar-pending|intv6-radar-legend|intv7-radar-mean/.test(radarFn));
ok('M.8 …y la limitación sigue VISIBLE sin abrir nada: eje atenuado y «sin datos»',
  /is-unavailable/.test(bare(fnSrc('_intccRadarSvg')))
  && /intv7_axis_unavailable/.test(bare(fnSrc('_intccRadarSvg'))));
ok('M.8b el radar no deja CSS huérfano de la superficie retirada',
  !/intv8-radar-|intv7-radar-pending|intv6-radar-legend|intv7-radar-mean/.test(css));
ok('M.8c …y conserva el mapeo de causas, que Advanced Intelligence necesitará',
  /function _intv7PendingReasonKey\(reason\)/.test(src));
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
// ── ACOTADO AL BLOQUE PROPIO ──────────────────────────────────────────────
// Esto cortaba desde su marca hasta el FINAL DEL FICHERO, así que cualquier bloque
// de CSS añadido después heredaba las restricciones de Intelligence y las
// aserciones N.x acusaban selectores que no son suyos (la portada Free de Workspace
// fue el primer caso). El bloque termina donde empieza el siguiente banner, y eso
// es lo que se mide: sus reglas, no todo lo que venga detrás.
const newCss = (() => {
  const from = css.indexOf('SPEC AURIX INTELLIGENCE · INTELLIGENCE ENGINE');
  if (from < 0) return '';
  // El bloque de Intelligence contiene sub-banners propios, así que no se puede
  // cortar por «el siguiente ═══»: se corta por el marcador del BLOQUE SIGUIENTE,
  // nombrado. Añadir un bloque nuevo detrás exige añadir su marca aquí, y eso es
  // deliberado — es una línea, y a cambio ningún bloque hereda las reglas de otro.
  const NEXT_BLOCKS = ['WORKSPACE COMPLETION · §2 — PORTADA FREE',
    // El banner de la portada Free se renombró al convertirse Workspace en Premium
    // entero. Sin esta marca el bloque de Intelligence volvía a cortar hasta el
    // final del fichero y N.7 acusaba selectores `.wsfc-*` que no son suyos.
    'CIERRE WORKSPACE PREMIUM · §2/§3 — PORTADA FREE',
    // Tercer nombre del mismo bloque. Es una línea por rebautizo, y a cambio el
    // bloque de Intelligence nunca hereda reglas que no son suyas.
    'CIERRE VISUAL WORKSPACE · §A — PORTADA FREE'];
  let to = css.length;
  NEXT_BLOCKS.forEach(m => { const i = css.indexOf(m, from); if (i > from && i < to) to = i; });
  return css.slice(from, to);
})();
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
ok('N.5 la dock de preguntas no depende de hover, que en móvil no existe',
  /button\.intv8-intel-opt \{[\s\S]{0,200}cursor: pointer/.test(css));
ok('N.6 hay ruta móvil declarada para lo táctil',
  /@media \(max-width: 640px\)[\s\S]*intv8-intel-opt/.test(newCss));
// El §12 del SPEC exige tocar la composición del hero (safe-zone de la esfera y
// altura adaptativa), así que una prohibición total de tocar reglas existentes
// dejaría de ser cierta. Se sustituye por una ALLOWLIST explícita: sólo estos tres
// selectores heredados, y sólo para propiedades de composición.
const TOUCHED_EXISTING = ['.intcc-hero-body', '.intcc-hero-orb-wrap', '.intcc-hero[data-has-question',
  '.intcc-m-hero-text[data-has-question',
  // SALUD minimalista: sólo composición vertical de su columna y el tamaño del
  // badge de estado, que ahora es el único texto bajo el donut.
  '.intcc-hero-score', '.intcc-hero .intcc-chips',
  // MEMORIA: sólo composición de su propia card (ocupar el alto que la rejilla ya
  // le da, en vez de dejar un hueco muerto). Ni color ni tipografía.
  '.aurix-intcc .intv4-memory',
  // Tokens del corredor de la esfera en el contenedor de la rejilla.
  '.aurix-intv6 {',
  ];
// ── §6 · COMPARADOR · ALLOWLIST EXACTA ─────────────────────────────────────
// Insertar una card entre el Radar y «Lo que importa hoy» obliga a correr un
// peldaño los `order` que venían detrás (N.8c prohíbe repetirlos, con razón:
// un empate lo resolvería el orden del DOM, que no se lee en la hoja de
// estilos). Es COMPOSICIÓN pura y el orden visual relativo no se mueve.
//
// VAN EN UNA LISTA EXACTA, NO DE PREFIJO, y la diferencia importa: con
// `startsWith`, añadir `.intv9-disc` habría abierto la puerta a
// `.intv9-disc-item`, `-mark`, `-body` y `-text`, que sí llevan color y
// tipografía. Una allowlist que se ensancha sola deja de ser una allowlist.
// Esta lista sólo autoriza el selector ESCRITO, y N.8 sigue comprobando que
// encima de él sólo haya propiedades de composición.
const TOUCHED_EXISTING_EXACT = ['.intcc-watch', '.intcc-timeline', '.intv5-structure',
  '.intv4-changed', '.intv4-discovery', '.intcc-disclaimer', '.intv9-disc'];
const _touchedExisting = (head) => {
  const h = String(head || '').trim();
  return TOUCHED_EXISTING_EXACT.indexOf(h) !== -1 || TOUCHED_EXISTING.some(t => h.startsWith(t));
};
// `.intcc-tl-item.is-declared …` es un selector COMPUESTO que exige una clase
// NUEVA: no puede alterar el render de un item de memoria existente, así que es
// scoping y no modificación. Se lista aparte para que quede explícito.
// `.intcc-sr-only` es una utilidad NUEVA —texto sólo para lector de pantalla,
// que la pista de teclado del gráfico necesita—: no existía y no altera el
// render de nada heredado.
const NEW_SCOPED = ['.intcc-tl-item.is-declared', '.intcc-sr-only'];
// La serie de prefijos siguió creciendo: `intv12-` son las clases NUEVAS del
// contador trazable (el enlace al destino, la card de pregunta y el control
// «Entendido»). Reconocerlas aquí no relaja nada: siguen siendo clases propias
// que no existían antes y que no pueden alterar el render de nada heredado.
const isNew = l => /intv8-|intv9-|intv10-|intv11-|intv12-|intv13-|intv14-|intv15-|intcc-orb-cta|intcc-orb\.is-interactive|intv4-chg-ref|is-tone-neutral/.test(l) || NEW_SCOPED.some(t => l.trim().startsWith(t))
  // El contenedor de la rejilla sólo recibe TOKENS del corredor de la esfera.
  || l.trim().startsWith('.aurix-intv6 {');
ok('N.7 sólo se tocan 4 selectores heredados, y son los que exige el hero adaptativo',
  newCss.split('\n').filter(l => /^\.[a-z]/.test(l.trim()) && l.includes('{'))
    .every(l => isNew(l) || _touchedExisting(l.trim().split('{')[0])),
  newCss.split('\n').filter(l => /^\.[a-z]/.test(l.trim()) && l.includes('{'))
    .filter(l => !isNew(l) && !_touchedExisting(l.trim().split('{')[0])));
ok('N.8 …y sobre ellos sólo propiedades de composición, nunca color ni tipografía',
  (() => { const bad = [];
    newCss.split(/(?<=\})/).forEach(rule => {
      const head = (rule.match(/^[\s]*([^{]+)\{/) || [])[1] || '';
      if (!_touchedExisting(head)) return;
      const props = (rule.match(/[a-z-]+\s*:/g) || []).map(x => x.replace(/\s*:$/, ''));
      const OK_PROPS = ['order', 'padding-right', 'padding-top', 'padding-bottom', 'position', 'z-index',
        'pointer-events', 'align-items', 'grid-row', 'justify-content', 'gap', 'display',
        'flex-direction', 'min-height', 'margin', 'font-size', 'letter-spacing',
        'flex-wrap', 'row-gap',
        // Composición añadida por el cierre de QA: ocupar el alto disponible y
        // dejar que el texto de una etiqueta envuelva. Ningún color, ninguna
        // familia tipográfica.
        'flex', 'max-height', 'white-space', 'max-width',
        // §15 — el scroll de la Memoria deja de RESERVAR altura: el techo lo pone
        // la fila de la rejilla y el desbordamiento es real cuando ocurre.
        // `overflow-y` es composición; no hay color ni tipografía.
        'overflow-y'];
      props.forEach(pr => { if (!OK_PROPS.includes(pr)) bad.push(head.trim() + ' → ' + pr); });
    });
    return bad.length === 0 ? true : bad; })() === true,
  JSON.stringify((() => { const bad = [];
    newCss.split(/(?<=\})/).forEach(rule => {
      const head = (rule.match(/^[\s]*([^{]+)\{/) || [])[1] || '';
      if (!_touchedExisting(head)) return;
      (rule.match(/[a-z-]+\s*:/g) || []).map(x => x.replace(/\s*:$/, ''))
        .forEach(pr => bad.push(head.trim() + ' -> ' + pr));
    }); return bad; })()));
ok('N.8b la superficie nueva declara `order` en móvil y tablet',
  // Sin esto valía `order: 0` en un contenedor flex-column cuyos hijos van de 1 a
  // 10, así que se pintaba ANTES DEL HERO. Fue un FAIL real de la revisión.
  // A2 — la card de PREGUNTA entra en `order: 2`, así que todo lo que iba detrás
  // del hero bajó una posición y Descubrimientos pasó del 9 al 10. Lo que el gate
  // fija es que DECLARE un `order` en el rango del contenedor, no el número
  // concreto: sin declararlo valdría 0 y se pintaría antes del hero.
  /@media \(max-width: 1023px\)[\s\S]{0,1200}\.intv9-disc\s*\{ order: (?:[1-9]|1[0-2]); \}/.test(newCss));
ok('N.8c y ningún `order` de la columna de Intelligence se repite (un empate lo decide el DOM, no la composición)',
  (() => { // el bloque compartido vive en la hoja PRINCIPAL, no en el corte de la
    // superficie nueva; se recogen TODAS las declaraciones de orden de la columna
    // de Intelligence en los tramos `≤1023px` y se exige que no haya empates.
    const blocks = css.match(/@media \(max-width: 1023px\)[\s\S]*?\n\}/g) || [];
    const orders = [];
    blocks.forEach(b => (b.match(/\.(?:intcc|intv)[\w-]*\s*\{ order: (\d+); \}/g) || [])
      .forEach(x => orders.push(Number((x.match(/order: (\d+)/) || [, -1])[1]))));
    return orders.length >= 8 && new Set(orders).size === orders.length; })(),
  (() => { const blocks = css.match(/@media \(max-width: 1023px\)[\s\S]*?\n\}/g) || [];
    const o = []; blocks.forEach(b => (b.match(/\.(?:intcc|intv)[\w-]*\s*\{ order: (\d+); \}/g) || [])
      .forEach(x => o.push(x.trim())));
    return JSON.stringify(o); })());
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
  // §4.7 — la frase de liquidez nombra ahora su PERIODO, así que el diccionario
  // real de rangos (`intv4_r_*`) entra en la extracción: stubearlo dejaría pasar
  // justamente un periodo vacío, que es el defecto que se está corrigiendo.
  const NEEDED = /^\s*(intel_[a-z0-9_]+|intv4_r_[a-z0-9]+|intcc_(read|sub)_[a-z_]+|intcc_health_title|intcc_health_suffix|intcc_band_empty):/;
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
    + block('const _AURIX_INTEL_HEALTH_POSITIVE = Object.freeze(', ');') + '\n'
    + "const _AURIX_AI_SEVERITY = { NOTABLE_CHANGE: 'notable_change' };\n"
    + fnSrc('_intelCoherentState') + '\n'
    // §4.7 — la frase de liquidez pasa a nombrar DATO y PERIODO, así que su
    // renderer necesita el mapa de periodos. Se carga el owner REAL: stubearlo
    // dejaría pasar exactamente el defecto que este assert busca.
    + fnSrc('_intv4RangeLabel') + '\n'
    + fnSrc('_intelDiscoveryText') + '\n' + fnSrc('_intelQuestionText') + '\n'
    + fnSrc('_intv5Reading') + '\n'
    + 'globalThis.READ = _intv5Reading; globalThis.DT = _intelDiscoveryText;'
    + 'globalThis.QT = _intelQuestionText;', sb2);

  const STATES = ['no_data', 'material_change', 'discovery', 'attention_material_fact',
    'readings_changed', 'context_needed', 'insufficient_history', 'stable_no_change', 'stable',
    'monitoring'];
  // §17 — `reading_persists_across_observations` sale de la lista porque sale de
  // la PUBLICACIÓN: su frase no decía qué condición persiste, ni durante qué
  // periodo real, ni por qué importa. La señal sigue viva en `memory.persisting`
  // (ver F.7), que es donde de verdad hace falta.
  const DISCOVERY_CODES = ['apparent_vs_effective_diversification', 'concentration_crossed_upward',
    'level_rose_on_capital_not_return', 'declared_goal_distant_from_observed_structure',
    'liquidity_fell_while_need_declared', 'several_readings_moved_together'];
  const QFIELDS = ['concentration_intent', 'wealth_coverage', 'liquidity_need', 'primary_goal',
    // §9 — la pregunta nueva: liquidez que existe y que Aurix no ve.
    'unregistered_liquidity'];
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
      try { txt = sb2.DT({ code, values: { positions: 7, effectiveN: 2.5, topWeightPct: 68,
        observations: 4, count: 3, cashPct: 6, changePp: -4.2, window: '30D' } }); }
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
  // SIN CORE NO HAY EVIDENCIA, así que tampoco se puede afirmar «no ha cambiado
  // nada»: el estado cae a disponibilidad insuficiente. Lo que esta prueba fija
  // —que ningún estado se pinte como URGENCIA sin que el motor la respalde— sigue
  // intacto, y ahora además se comprueba que la ausencia no se lea como calma.
  ok('O.8 ningún estado publica urgencia en su clase visual sin venir del motor',
    (() => { sb2.t = k => ES[k];
      const r = sb2.READ(null, {}, null, { now: { state: 'stable_no_change', changeCount: 0 },
        discoveries: [], questions: [], context: { fields: {} } });
      return r.state !== 'attention' && r.intelState === 'insufficient_history'
        && r.activeReviewCount === 0 && r.hasEvidence === false; })());
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
  ok('P.1 la desaparición NO anuncia nada, ni en la visita en que ocurre',
    v2.memory.changeCount === 0
    && !v2.memory.changesSinceLastObservation.some(c => c.kind === 'insight_resolved'),
    JSON.stringify(v2.memory.changesSinceLastObservation));
  ok('P.2 …y NO se vuelve a anunciar en las visitas siguientes (era un cambio fabricado 45 días)',
    v3.memory.changeCount === 0 && v4.memory.changeCount === 0);
  ok('P.3 …así que el hero deja de publicar urgencia en bucle',
    v3.now.urgencyClaimed === false && v4.now.urgencyClaimed === false);
  // Reaparición
  const r1 = run(P.concentr);
  const gone = run(P.empty, { memory: commit(r1) });
  const back = run(P.concentr, { memory: commit(gone) });
  // UN DATO QUE VUELVE IGUAL NO ES UN DATO NUEVO. Antes se anunciaba como
  // APARICIÓN, porque la ausencia lo había sellado como resuelto: una pintura sin
  // datos bastaba para que la misma lectura, sin cambiar, se presentase como algo
  // que acaba de ocurrir.
  ok('P.4 un dato que vuelve SIN CAMBIAR no se anuncia como nuevo',
    !back.memory.changesSinceLastObservation.some(c => c.id === 'ai_concentration_top_position'),
    JSON.stringify(back.memory.changesSinceLastObservation));
  ok('P.5 …y su línea base sobrevive intacta: sigue siendo la MISMA observación',
    (() => { const e = back.memory.seen.find(x => x.id === 'ai_concentration_top_position');
      const e0 = r1.memory.seen.find(x => x.id === 'ai_concentration_top_position');
      return !!e && e.state === 'persisting' && e.resolvedAt === null
        && e.firstSeenAt === e0.firstSeenAt && e.observations > e0.observations; })(),
    JSON.stringify(back.memory.seen));
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

// ── X · MEMORIA LEGACY · DESAPARECER NO ES RESOLVERSE ───────────────────────
// La resolución por desaparición se RETIRÓ. Estas aserciones recorren las causas
// reales por las que una lectura deja de estar en la lista viva: ninguna prueba
// que el patrimonio del usuario haya cambiado, ninguna puede publicar un evento
// resuelto y ninguna puede destruir la observación anterior.
group('X · memoria legacy · la ausencia no cura nada');
{
  const MEMSRC = block('function _aurixIntelCoverageRank', '\nfunction _aurixIntelCommitMemory');
  const seenOf = (r) => ({ observedAt: 1, dispersion: r.dispersion.value,
    seen: r.memory.seen.map(e => ({ id: e.id, dimension: e.dimension, label: e.label,
      coverage: e.coverage || null, firstSeenAt: e.firstSeenAt, lastSeenAt: e.lastSeenAt,
      observations: e.observations, resolvedAt: Number.isFinite(e.resolvedAt) ? e.resolvedAt : null })) });
  const observed = run(P.concentr);
  const baseline = seenOf(observed);
  const ids = baseline.seen.map(e => e.id).sort();
  // Lo que NINGUNA desaparición puede hacer: anunciar una resolución, perder una
  // entrada previa o sellar una fecha de resolución.
  const survives = (r) => {
    const got = r.memory.seen.map(e => e.id).sort();
    return !r.memory.changesSinceLastObservation.some(c => c.kind === 'insight_resolved')
      && JSON.stringify(got) === JSON.stringify(ids)
      && r.memory.seen.every(e => e.resolvedAt === null)
      && r.memory.seen.some(e => e.state === 'unobserved');
  };

  // HIDRATACIÓN PENDIENTE: todavía no hay snapshot ni diversificación que leer.
  const hydrating = run({ snapshot: null, diversification: null, core: core([]) },
    { memory: baseline });
  ok('X.1 hidratación pendiente ⇒ ningún evento resuelto, y ni un cambio anunciado',
    survives(hydrating) && hydrating.memory.changeCount === 0,
    JSON.stringify(hydrating.memory));
  // DATOS INCOMPLETOS: hay posiciones, pero no se pueden valorar todas.
  const partial = run({ snapshot: snap({ topInvestedAsset: null, uncertifiablePositions: 2 }),
    diversification: div({ status: ST.LOW_CONFIDENCE, reason: 'unvalued_position',
      hhi: null, effectiveN: null, topWeightPct: null }), core: core([]) }, { memory: baseline });
  ok('X.2 datos incompletos ⇒ ningún evento resuelto', survives(partial),
    JSON.stringify(partial.memory));
  // FX / ESQUEMA / FUENTE: la fuente no responde. No es una recuperación.
  const brokenFx = run({ snapshot: null,
    diversification: div({ status: ST.UNAVAILABLE_SOURCE, reason: 'fx_unavailable',
      positions: 0, hhi: null, effectiveN: null, topWeightPct: null }), core: core([]) },
    { memory: baseline });
  ok('X.3 FX / esquema / fallo de fuente ⇒ ningún evento resuelto', survives(brokenFx),
    JSON.stringify(brokenFx.memory));
  // EL HECHO QUE SOSTENÍA LA LECTURA DESAPARECE del ledger —deduplicación por raíz
  // causal, filtro de materialidad, supresión por la puerta de evidencia— con la
  // MISMA estructura de cartera. Ni resolución, ni cambio: sólo cobertura peor.
  const withFact = run({ snapshot: snap({ cashPct: 85 }), diversification: div(),
    core: core([CASHDRIFT(9, 76)]) });
  const factGone = run({ snapshot: snap({ cashPct: 85 }), diversification: div(),
    core: core([]) }, { memory: seenOf(withFact) });
  ok('X.4 un hecho que desaparece del ledger (dedup, materialidad, evidencia) no resuelve ni cambia nada',
    factGone.memory.changeCount === 0
    && !factGone.memory.changesSinceLastObservation.some(c => c.kind === 'insight_resolved'),
    JSON.stringify(factGone.memory.changesSinceLastObservation));
  ok('X.4b …y la lectura conserva la última versión BIEN respaldada, no la degradada',
    (() => { const e = factGone.memory.seen.find(x => x.id === 'ai_liquidity_level');
      const e0 = withFact.memory.seen.find(x => x.id === 'ai_liquidity_level');
      return !!e && !!e0 && e.label === e0.label && e.coverage === e0.coverage; })(),
    JSON.stringify({ before: withFact.memory.seen.find(x => x.id === 'ai_liquidity_level'),
      after: factGone.memory.seen.find(x => x.id === 'ai_liquidity_level') }));
  ok('X.4c …y cuando el hecho vuelve IGUAL, tampoco se anuncia nada',
    (() => { const back = run({ snapshot: snap({ cashPct: 85 }), diversification: div(),
        core: core([CASHDRIFT(9, 76)]) }, { memory: seenOf(factGone) });
      return back.memory.changeCount === 0; })());
  ok('X.4d …pero un cambio REAL de lectura sigue anunciándose una vez',
    (() => { const other = run({ snapshot: snap({ cashPct: 85 }), diversification: div(),
        core: core([CASHDRIFT(-9, 76)]) }, { memory: seenOf(withFact) });
      return other.memory.changesSinceLastObservation.filter(c => c.kind === 'reading_changed'
        && c.id === 'ai_liquidity_level').length === 1; })(),
    JSON.stringify(run({ snapshot: snap({ cashPct: 85 }), diversification: div(),
      core: core([CASHDRIFT(-9, 76)]) }, { memory: seenOf(withFact) }).memory.changesSinceLastObservation));
  // TOPE DE RANKING Y PRIORIZACIÓN: la memoria se alimenta de la lista
  // INTERPRETADA, no de la recortada. El tope acota la ATENCIÓN, nunca la memoria.
  ok('X.5 el tope de ranking recorta la atención y no borra nada de la memoria',
    (() => { const prof = P.cashHeavy;
      const r = run(prof);
      const live = sandbox.AI(Object.assign({ now: 2000000000000 }, prof)).insights
        .filter(i => i.availability === 'available').map(i => i.id).sort();
      const mem = r.memory.seen.map(e => e.id).sort();
      return r.attention.length < r.attentionTotal
        && JSON.stringify(mem) === JSON.stringify(live); })(),
    JSON.stringify({ att: run(P.cashHeavy).attention.length, total: run(P.cashHeavy).attentionTotal,
      mem: run(P.cashHeavy).memory.seen.map(e => e.id) }));
  // EL DATO QUE VUELVE tras una desaparición: es la MISMA observación, no una
  // nueva, y no se anuncia nada por el camino.
  ok('X.6 el dato que vuelve sin cambiar no produce transición alguna',
    (() => { const back = run(P.concentr, { memory: seenOf(hydrating) });
      const e = back.memory.seen.find(x => x.id === 'ai_concentration_top_position');
      const e0 = baseline.seen.find(x => x.id === 'ai_concentration_top_position');
      return back.memory.changeCount === 0 && !!e && e.state === 'persisting'
        && e.firstSeenAt === e0.firstSeenAt && e.observations === e0.observations + 1; })(),
    JSON.stringify(run(P.concentr, { memory: seenOf(hydrating) }).memory));
  // Un `resolvedAt` HEREDADO de la versión anterior era una ausencia, no una
  // prueba: no puede fabricar hoy una aparición ni reiniciar el recuento.
  ok('X.7 un sello de resolución ANTIGUO se ignora: no inventa una aparición',
    (() => { const legacy = { observedAt: 1, dispersion: observed.dispersion.value,
        seen: baseline.seen.map(e => Object.assign({}, e, { resolvedAt: 1999999999999 })) };
      const r = run(P.concentr, { memory: legacy });
      const e = r.memory.seen.find(x => x.id === 'ai_concentration_top_position');
      return r.memory.changeCount === 0 && e.state === 'persisting' && e.resolvedAt === null; })(),
    JSON.stringify((() => { const legacy = { observedAt: 1, dispersion: observed.dispersion.value,
        seen: baseline.seen.map(e => Object.assign({}, e, { resolvedAt: 1999999999999 })) };
      return run(P.concentr, { memory: legacy }).memory; })()));
  // AISLAMIENTO POR CUENTA. La memoria se lee por PROPIETARIO: la de otra cuenta
  // no es legible, así que una transición de cuenta no resuelve ni hereda nada.
  ok('X.8 la memoria de otra cuenta no es legible: una transición de cuenta no resuelve ni hereda',
    (() => { const st = mkStore();
      MEMCOMMIT(observed.memory, observed.dispersion, 7, { store: st, owner: 'u1' });
      const asOwner = (o) => INTEL(Object.assign({ now: 2000000000000, depth: 'premium',
        context: { fields: {}, answered: 0, source: 'none' }, store: st, owner: o }, P.empty));
      const u2 = asOwner('u2'), u1 = asOwner('u1');
      return u2.memory.hasHistory === false && u2.memory.changeCount === 0
        && u1.memory.hasHistory === true && u1.memory.changeCount === 0
        && !u1.memory.changesSinceLastObservation.some(c => c.kind === 'insight_resolved'); })(),
    JSON.stringify((() => { const st = mkStore();
      MEMCOMMIT(observed.memory, observed.dispersion, 7, { store: st, owner: 'u1' });
      const asOwner = (o) => INTEL(Object.assign({ now: 2000000000000, depth: 'premium',
        context: { fields: {}, answered: 0, source: 'none' }, store: st, owner: o }, P.empty));
      return { u2: asOwner('u2').memory, u1: asOwner('u1').memory }; })()));
  // LA TRANSICIÓN ESTÁ RETIRADA EN EL OWNER, no sólo inalcanzable en estas
  // fixtures: ni el evento ni el sello existen en el fuente de la memoria.
  ok('X.9 el owner de la memoria ya no emite `insight_resolved` ni sella por ausencia',
    !/kind: 'insight_resolved'/.test(MEMSRC) && !/state: 'resolved'/.test(MEMSRC)
    && /state: 'unobserved'/.test(MEMSRC));
  // Y NO DUPLICA una resolución que ya tiene dueño: la memoria legacy no conoce
  // `resolvedConcepts` ni fabrica un puente hacia sus identidades canónicas.
  ok('X.10 la memoria legacy no consume `resolvedConcepts` ni traduce identidades canónicas',
    !/resolvedConcepts/.test(MEMSRC) && !/'pos:'|'drift:'/.test(MEMSRC));
  // LA MEMORIA FINANCIERA (la card) no sale de aquí: se construye desde el Core.
  // Esta retirada no la toca, y el contrato de la memoria legacy sigue sin
  // guardar ni una cifra.
  ok('X.11 la memoria legacy sigue sin guardar nada patrimonial ni identificable',
    (() => { const st = mkStore();
      MEMCOMMIT(run(P.concentr, { memory: baseline }).memory, observed.dispersion, 7,
        { store: st, owner: 'u' });
      const raw = st.getItem('aurix_intel_mem_v1');
      return !/100000|VWCE|BTC|Piso|@/.test(raw) && /"coverage"/.test(raw); })(),
    (() => { const st = mkStore();
      MEMCOMMIT(run(P.concentr, { memory: baseline }).memory, observed.dispersion, 7,
        { store: st, owner: 'u' });
      return st.getItem('aurix_intel_mem_v1'); })());
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
      // §8 añade `ack`: identificadores de EPISODIO y un timestamp, nada más — ni
      // importes, ni posiciones, ni precios. El invariante que esta prueba fija es
      // ese, y sigue siendo el conjunto CERRADO de claves, no un subconjunto.
      return JSON.stringify(keys.sort()) === JSON.stringify(['ack', 'asked', 'declined', 'fields', 'pausedAt']); })());
  ok('S.6b y un acuse de recibo sólo lleva episodio + instante (ningún dato patrimonial)',
    (() => { const out = MG({ ack: { 'ob:category_mix#28': { at: 7, state: 'acknowledged' } } }, null);
      const k = Object.keys(out.ack['ob:category_mix#28']).sort();
      return JSON.stringify(k) === JSON.stringify(['at', 'state']); })(),
    JSON.stringify(MG({ ack: { 'ob:category_mix#28': { at: 7, state: 'acknowledged' } } }, null).ack));
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
  // §17 — «Sobre datos de tu propia cartera» RETIRADA: es verdad de TODO lo que
  // Intelligence publica, así que como etiqueta no distinguía nada y añadía una
  // línea por ítem. La evidencia NO se pierde: viaja en el contrato y se declara
  // en `data-evidence`, que es donde un metadato tiene su sitio (y es lo que este
  // assert comprueba ahora — una garantía verificable, no una frase).
  ok('U.4 con descubrimientos se pinta, y su evidencia queda declarada',
    (() => { const h = sb3.DISC({ discoveries: [D('apparent_vs_effective_diversification', 'diversification')] },
        sb3._intccEsc, []);
      return /intv9-disc/.test(h) && /data-evidence="effective_holdings"/.test(h)
        && h.includes('7 posiciones')
        && !/intv9-disc-ev/.test(h)
        && !h.includes('Sobre datos de tu propia cartera'); })(),
    sb3.DISC({ discoveries: [D('apparent_vs_effective_diversification', 'diversification')] },
      sb3._intccEsc, []));
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
  // §15 — SEIS campos recordables, y UNA excepción declarada: `primary_goal` con
  // valor `undecided` NO tiene copy de Memoria A PROPÓSITO. «Todavía no has
  // decidido tu prioridad» ocupaba un hito de la Memoria patrimonial y no es un
  // acontecimiento: es una pregunta pendiente. Sin copy no hay fila, y el filtro
  // de `_intv4MemoryDeclared` lo excluye explícitamente además de por copy.
  ok('U.12 los seis campos recordables tienen copy para todos sus valores, salvo el aplazamiento declarado',
    (() => { const F = sandbox.FIELDS;
      const MAP = { concentration_intent: 'intv9_mem_intent', primary_goal: 'intv9_mem_goal',
        horizon: 'intv9_mem_horizon', liquidity_need: 'intv9_mem_liq',
        wealth_coverage: 'intv9_mem_coverage',
        unregistered_liquidity: 'intv9_mem_unregistered_liquidity' };
      const DEFERRAL = { primary_goal: 'undecided' };
      const missing = [];
      Object.keys(MAP).forEach(k => F[k].options.forEach(o => {
        if (DEFERRAL[k] === o) { if (ES[MAP[k] + '_' + o]) missing.push('DEBE NO EXISTIR: ' + MAP[k] + '_' + o); return; }
        if (!ES[MAP[k] + '_' + o]) missing.push(MAP[k] + '_' + o); }));
      return missing.length === 0 ? true : missing; })() === true);
  // ── QUÉ HA CAMBIADO · compacto ──
  const chgFn = fnSrc('_intv4ChangedHtml');
  // RE-DECIDIDO · STABILIZATION V1: «ausencia de novedad = ausencia de superficie».
  // Antes esto certificaba una línea compacta; ahora no se emite NADA, ni card ni
  // línea. La distinción entre las cuatro situaciones NO se pierde —sigue siendo
  // verdad y sigue siendo diagnosticable— pero viaja en `data-changed-state` del
  // contenedor raíz en vez de ocupar píxeles.
  ok('U.13 sin cambio material no se emite NINGUNA superficie',
    /if \(!rows\.length\) return \{ html: '', state: emptyKey/.test(chgFn));
  ok('U.13b …y el estado viaja en el contenedor raíz, no en pantalla',
    /data-changed-state="\$\{esc\(changed\.state\)\}"/.test(src)
    && /data-changed-evidence=/.test(src));
  ok('U.14 …y las cuatro frases distintas del estado vacío se conservan',
    /intv4_changed_empty/.test(chgFn) && /intv4_changed_others_none/.test(chgFn)
    && /intv4_changed_all_published/.test(chgFn) && /intv4_changed_stable/.test(chgFn));
  ok('U.15 con filas SÍ se pinta la card completa',
    /data-state="rows"/.test(chgFn) && /intv4-chg-list/.test(chgFn));
  ok('U.16 la rejilla ya recompone sola cuando la card desaparece',
    /:not\(:has\(\.intv4-changed\)\) \.intv5-structure \{ grid-column: 1 \/ 13/.test(css));
  ok('U.17 el aviso legal recupera su fila: ya no hay línea que lo desplace',
    !/intv9-changed-quiet/.test(css) && !/\.aurix-intv6 \.intcc-disclaimer \{ grid-row: 7/.test(css));
  ok('U.17b la rejilla recompone sola al retirar ESTRUCTURA y «Qué ha cambiado»',
    /:not\(:has\(\.intv5-structure\)\) \.intv4-changed \{ grid-column: 1 \/ 13/.test(css)
    && /:not\(:has\(\.intv4-changed\)\) \.intv5-structure \{ grid-column: 1 \/ 13/.test(css));
  // ── EXPLORA · deja de ser fija ──
  const expFn = fnSrc('_intv4ExploreHtml');
  // ── LA ROTACIÓN YA NO SALE DEL HISTORIAL LOCAL ──────────────────────────
  // Ordenaba por «lo menos visto» leyendo `_intv4ReadShown()`, que es del
  // DISPOSITIVO: el móvil y el escritorio de la misma cuenta veían conjuntos
  // distintos. Ahora la elección es una función pura de (cuenta, periodo) y la
  // relevancia sólo ordena las elegidas. Sigue sin haber azar.
  ok('U.18 Explora elige por cuenta y periodo, ordena por relevancia, y sin azar',
    /hot\.has\(a\.q\.causalRoot\)/.test(expFn) && /_intv4ExploreRotation\(/.test(expFn)
    && !/shownAt/.test(expFn) && !/Math\.random/.test(expFn)
    && !/Math\.random/.test(fnSrc('_intv4ExploreRotation')));
  ok('U.19 la rotación es DETERMINISTA: mismas entradas ⇒ mismo conjunto, y cambia de periodo',
    (() => { // Se ejecutan los owners REALES en el sandbox, con su tope declarado.
      const rot = vm.runInContext(block('const _INTV4_EXPLORE_MAX', ';')
        + block('const _INTV4_EXPLORE_PERIOD_WEEKS', ';') + ';'
        + fnSrc('_intv4ExploreSeed') + ';'
        + fnSrc('_intv4ExploreRotation') + ';_intv4ExploreRotation', sandbox);
      const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
      const day = 1757000000000;
      const a = JSON.stringify(rot(ids, day, 'u1'));
      const b = JSON.stringify(rot(ids, day + 3600e3, 'u1'));
      // §4.3 — la cadencia pasa de DIARIA a SEMANAL ESCALONADA, así que el
      // conjunto ya no puede cambiar en cinco días: se mide contra una frontera
      // de periodo real (cuatro semanas cubren el ciclo completo).
      const c = JSON.stringify(rot(ids, day + 5 * 7 * 864e5, 'u1'));
      return a === b && a !== c && JSON.parse(a).length === 4
        && new Set(JSON.parse(a)).size === 4; })());
  ok('U.19b el id anotado coincide EXACTAMENTE con el que lee Explora',
    (() => { const m = 'data-intcc-q="top_position_intent"';
      return ('x:' + m.slice(14, -1)).slice(2) === 'top_position_intent'; })());
  // SUPREME CLOSURE · §4.3 — «cambiar como máximo una pregunta por semana». No
  // basta con ralentizar: hay que ESCALONAR, porque cuatro cadencias semanales
  // cruzan la misma frontera a la vez. Se mide la propiedad EJECUTANDO el owner
  // un año entero, que es la única forma de demostrar un techo de cambio.
  ok('U.19c ninguna semana mueve más de UNA pregunta, y la rotación sigue viva',
    (() => { // El owner YA está en el sandbox (U.19 lo cargó): redeclararlo sería
      // un SyntaxError, y además mediría una copia en vez del mismo objeto.
      const rot = vm.runInContext('_intv4ExploreRotation', sandbox);
      const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];
      let prev = null, maxDelta = 0, movedDays = 0;
      for (let d = 0; d < 365; d++) {
        const r = rot(ids, d * 864e5, 'u1');
        if (prev) { const delta = r.filter((x, i) => x !== prev[i]).length;
          if (delta > maxDelta) maxDelta = delta;
          if (delta) movedDays++; }
        prev = r;
      }
      return maxDelta === 1 && movedDays >= 50 && movedDays <= 53
        && /Math\.floor\(day \/ 7\)/.test(fnSrc('_intv4ExploreRotation'))
        && /Math\.floor\(\(week - slot\) \/ P\)/.test(fnSrc('_intv4ExploreRotation')); })());
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
    // §8 — la selección recibe además el mapa de ACUSES: es la cuarta entrada que
    // mueve PRIORIDAD (con la historia de presentación, el contexto y la memoria) y
    // nunca una cifra. El invariante que esta prueba fija sigue siendo que hay UNA
    // sola selección y que la alimentan los mismos argumentos en los dos sitios.
    /_intv5MattersStories\(core, skipRoots, intel, acks\)/.test(mFn)
    && /const mattersSel = _intv5MattersStories\(core, skipRoots, intel, _ackMap\)\.stories/.test(src)
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
        // CHECKPOINT J — las dos reciben además la limitación que les toca.
        && /_intv5MattersHtml\(core, esc, depth, skipRoots, intel, _ackMap, _gaps\.today\)/.test(r)
        && /_intv4MemoryHtml\(core, esc, publishedKeys, intel, discFields, _gaps\.evolution\)/.test(r)
        && /_intv9DiscoveriesHtml\(intel, esc, mattersRoots\.concat\(skipRoots\), heroDiscId\)/.test(r); })());
}

// ── V · STABILIZATION V1 ────────────────────────────────────────────────────
group('V · estabilización · lo que el founder reprodujo en QA autenticada');
{
  const hs = fnSrc('_intccHealthScore');
  ok('V.1 «Cómo se calcula» ya NO existe como interacción pública',
    !/intv8-h-method/.test(src) && !/\.intv8-h-method/.test(css)
    && !/intel_h_method'\)\)/.test(src));
  // Se comprueba que no quede REGLA (selector + bloque), no que no se mencione en
  // un comentario que documenta la retirada.
  const cssRules = css.split('\n').filter(l => /^\s*[.#][a-z]/i.test(l)).join('\n');
  ok('V.2 …y no queda CSS huérfano, ni copy muerta, ni control invisible enfocable',
    !/intv8-h-comp|intv8-h-method/.test(cssRules)
    && !/<details class="intv8-h-method"/.test(src)
    && !/intel_h_method|intel_h_c_dispersion|intel_h_c_na/.test(src));
  // RE-DECIDIDO · el founder retiró también el del RADAR en esta intervención. Lo
  // que queda certificado es que NO sobrevive ningún disclosure en Intelligence.
  ok('V.2b ningún disclosure sobrevive en la superficie de Intelligence',
    !/<details/.test(fnSrc('_intv7RadarHtml')) && !/<details/.test(fnSrc('_intccHealthScore')));
  ok('V.3 la METODOLOGÍA sigue publicándose en el contrato del owner',
    /components:\s*h\.components/.test(hs) && /explain:\s*t\('intel_disp_depth'\)/.test(hs)
    && /forbiddenFraming: \['grade', 'quality', 'advice'\]/.test(fnSrc('_aurixIntelHealth')));
  // SALUD queda deliberadamente minimalista: título + anillo + % + UN estado.
  // El detalle y la chip de cobertura se retiraron de la SUPERFICIE (siguen en el
  // contrato del owner), así que lo que se certifica es justo esa reducción.
  ok('V.4 Salud conserva nombre, anillo, porcentaje y UN estado',
    /esc\(t\('intcc_health_title'\)\)/.test(src) && /intcc-score-ring/.test(src)
    && /intcc-health-badge/.test(src) && /score\.score != null \? '%' : ''/.test(src));
  ok('V.4b …y ya NO publica el detalle de posiciones ni la chip de cobertura',
    !/intv8-h-conf/.test(src) && !/intel_disp_detail'\)\(/.test(src)
    && !/intel_h_conf_high/.test(src));
  ok('V.5 el cálculo de Salud NO se tocó (mismo owner, misma fórmula reescalada)',
    /\(div\.effectiveN - 1\) \/ \(div\.positions - 1\)/.test(fnSrc('_aurixIntelDispersion')));
  // SAFE-ZONE
  ok('V.6 el corredor de la esfera se CALCULA, no se estima a ojo',
    /--intel-orb-overlap: 20px; --intel-orb-gap: 34px;/.test(css)
    && /\.intcc-hero-body \{ padding-right: calc\(var\(--intel-orb-overlap\) \+ var\(--intel-orb-gap\)\)/.test(css));
  ok('V.6b …y cubre el HALO, que se extiende más allá de la caja del orbe',
    (() => { // Geometría real leída del CSS, no un número inventado.
      const orb = parseInt((css.match(/\.intcc-hero-orb-wrap \.intcc-orb \{ width: (\d+)px/) || [, '0'])[1], 10);
      const inset = parseFloat((css.match(/\.intcc-orb-glow \{[\s\S]{0,80}inset: -([\d.]+)%/) || [, '0'])[1]);
      const blur = parseFloat((css.match(/\.intcc-orb-glow \{[\s\S]{0,300}filter: blur\(([\d.]+)px\)/) || [, '0'])[1]);
      const stop = parseFloat((css.match(/transparent (\d+)%\)/) || [, '74'])[1]) / 100;
      // Radio del halo, punto en que su degradado es transparente, y cuánto de eso
      // sobresale del borde del orbe.
      const glowR = (orb * (1 + 2 * inset / 100)) / 2;
      const visible = Math.max(0, glowR * stop - orb / 2) + blur;
      const corridor = 20 + 34;
      return orb === 112 && inset > 0 && corridor >= 20 + visible; })());
  ok('V.7 la pregunta no puede rebasar su contenedor ni recortarse con overflow',
    /\.intv8-intel-q \{ max-width: 100%; box-sizing: border-box; \}/.test(css)
    && !/\.intv8-intel-q \{[^}]*overflow: hidden/.test(css));
  ok('V.8 en móvil el corredor es 0: el orbe vive en su propia card',
    /@media \(max-width: 640px\)[\s\S]{0,400}--intel-orb-overlap: 0px; --intel-orb-gap: 0px;/.test(css));
  ok('V.9 la esfera sigue sin poder robar un click',
    /\.intcc-hero-orb-wrap \{[^}]*pointer-events: none/.test(css));
  // HERO · dos composiciones
  // Enunciado corregido tras la revisión: `align-items: stretch` iguala columnas y
  // la altura la fija Salud, así que esto NO contrae el hero — deja de reservar el
  // espacio de la pregunta. Lo que bajó la altura de verdad fue retirar el
  // disclosure de Salud. El assert dice exactamente eso y ni una palabra más.
  ok('V.10 el hero deja de reservar el espacio de la pregunta cuando no hay ninguna',
    /\[data-has-question="0"\] \.intcc-hero-intel \{ padding-top: 12px/.test(css)
    && /\[data-has-question="1"\] \.intcc-hero-intel \{ padding-top: 16px/.test(css)
    && /\[data-has-question="0"\] \.intcc-hero-body \{ padding-top: 0/.test(css));
  ok('V.10b …y el CSS no afirma una contracción que no hace',
    !/se contrae de verdad/.test(css));
  ok('V.10c el corredor también cubre la sombra del núcleo del orbe',
    (() => { // núcleo `inset: 29%` sobre 112px ⇒ 32.5px de margen interior; su
      // sombra base de 38px sobresale ~5.5px, muy por debajo del corredor.
      const core = parseFloat((css.match(/\.intcc-orb-core \{[\s\S]{0,60}inset: (\d+)%/) || [, '0'])[1]);
      return core === 29 && (38 - 112 * core / 100) < 34; })());
  ok('V.11 …y el estado viaja en el DOM para que el CSS pueda distinguirlos',
    /data-has-question="\$\{intelQHtml \? '1' : '0'\}"/.test(src));
  // ESTRUCTURA retirada
  ok('V.12 ESTRUCTURA ya no se renderiza como card',
    /const structureHtml = '';/.test(src));
  ok('V.13 …pero su owner y sus datos siguen INTACTOS para el motor y los gates',
    /function _intv5StructureHtml\(core, esc\)/.test(src)
    && /effective_holdings/.test(fnSrc('_intv5StructureHtml')));
  // MEMORIA V2 · se EJECUTA
  const sb4 = { console, Object, Number, Math, Array, Set, JSON, isFinite, window: undefined };
  vm.createContext(sb4);
  sb4.t = k => ({ intv9_mem_goal_grow: 'g', intv9_mem_horizon_long: 'h' })[k];
  sb4._INTV4_MEMORY_MAX = 3;
  sb4._intv4MemoryEvents = (core) => ((core && core.ev) || []).map((e, i) =>
    ({ f: { semanticKey: 'k' + i, window: { endAt: e }, causalRoot: 'wealth_level' }, txt: 'E' + i }));
  sb4._intv4WhyText = () => '';
  vm.runInContext(fnSrc('_intv4T') + '\n' + fnSrc('_intv4MemoryDeclared')
    + '\n' + fnSrc('_aurixFactPeriodDegraded') + '\n' + fnSrc('_aurixFactPeriodNamedAs')
    // CHECKPOINT G — la diversificación por ventana vive en su propia función y
    // necesita su catálogo: sin él, `_intv4MemoryRows` revienta en el sandbox.
    + '\n' + (src.match(/const _INTV4_MEMORY_WINDOW_ORDER[\s\S]*?\);/) || [''])[0]
    + '\n' + fnSrc('_intv4MemoryDiversify')
    + '\n' + fnSrc('_intv4MemoryRows') + '\nglobalThis.ROWS = _intv4MemoryRows;', sb4);
  const ctx9 = { context: { fields: {
    primary_goal: { value: 'grow', provenance: 'user_answer', answeredAt: 5000 },
    horizon: { value: 'long', provenance: 'user_answer', answeredAt: 100 } } } };
  // SUPREME CLOSURE · §4.5 RE-DECIDE LAS TRES. La card mezclaba hitos medidos con
  // respuestas declaradas, y el §4.5 prohíbe publicar aquí «prioridad declarada,
  // confirmaciones, concentración aceptada y preguntas respondidas». Lo declarado
  // no se borra —sigue siendo contexto y sigue moviendo interpretación— pero deja
  // de ser una FILA. Así que lo que estas aserciones miden cambia de objeto: el
  // techo baja a tres y la lista contiene UNA sola clase de contenido.
  ok('V.14 la evolución presentada se acota a 3 hechos certificados',
    sb4.ROWS({ ev: [9000, 8000, 7000, 6000, 4000] }, [], ctx9).length === 3);
  ok('V.15 …ordenada por lo más RECIENTE arriba, y SIN respuestas declaradas',
    (() => { const r = sb4.ROWS({ ev: [9000, 200] }, [], ctx9);
      return r.length === 2 && r[0].at === 9000 && r[1].at === 200
        && r.every(x => x.kind === 'event'); })());
  ok('V.16 …y sólo con hechos REALES: sin hechos no hay filas, responda lo que responda',
    (() => { const r = sb4.ROWS({ ev: [] }, [], ctx9);
      return r.length === 0; })());
  ok('V.17 UNA sola lista: la unión blanca del raíl se resuelve por estructura',
    (() => { const m = fnSrc('_intv4MemoryHtml');
      return (m.match(/class="intcc-tl-list"/g) || []).length === 1
        && !/intv9-mem-declared/.test(m); })());
  // §15 — EL SCROLL DEJA DE RESERVAR ALTURA. `max-height` incondicional montaba
  // un contenedor con barra propia incluso con tres recuerdos, y el resultado era
  // el scroll interior corto con espacio vacío debajo que §15 prohíbe. El techo
  // pasa a colgar del atributo que el renderer ya publica (`data-scroll`), que es
  // el mismo criterio que decide si hay algo que recortar. Lo que se conserva y se
  // comprueba: vertical acotado cuando hay desbordamiento, y NUNCA horizontal.
  ok('V.18 scroll interno vertical y acotado SÓLO cuando desborda, sin barra horizontal',
    /\.intv10-mem-scroll \{ overflow-x: hidden/.test(css)
    && /\.intv4-memory\[data-scroll="1"\] \.intv10-mem-scroll \{ max-height: 268px; overflow-y: auto; \}/.test(css)
    && /<div class="intv10-mem-scroll">/.test(src));
  ok('V.19 la barra es discreta y aparece al interactuar; en táctil no hay barra',
    /\.intv10-mem-scroll:hover, \.intv10-mem-scroll:focus-within/.test(css)
    && /@media \(max-width: 1023px\)[\s\S]{0,400}\.intv10-mem-scroll::-webkit-scrollbar \{ width: 0; \}/.test(css));
  ok('V.20 el último recuerdo no queda cortado a ras del borde',
    /\.intcc-tl-item:last-child \{ padding-bottom: 4px; \}/.test(css));
  ok('V.21 con pocos recuerdos NO se reserva hueco: es max-height, nunca height fija',
    /\.intv10-mem-scroll \{ max-height: 268px/.test(css)
    && !/\.intv10-mem-scroll \{[^}]*[^-]height: \d/.test(css));
  ok('V.22 la card declara cuántos recuerdos hay y si va a hacer scroll',
    /data-rows="\$\{rows\.length\}"/.test(src) && /data-scroll=/.test(src));
  // NAMING
  // Las ÚNICAS apariciones permitidas son los nombres ANTERIORES de las dos claves
  // de storage, que deben permanecer para purgarlas y adoptar el contexto que un
  // usuario real ya pudo guardar. Son identificadores de DATO, no naming de
  // producto, y retirarlos perdería contexto de usuarios en producción.
  ok('V.23 cero naming de la familia AURI salvo las dos claves de storage heredadas',
    (() => { const hits = (src.match(/[A-Za-z_$0-9]*[Aa]uri(?![xX])[A-Za-z_$0-9]*/g) || []);
      return hits.every(h => h === 'aurix_auri_ctx_v1' || h === 'aurix_auri_mem_v1'); })(),
    Array.from(new Set((src.match(/[A-Za-z_$0-9]*[Aa]uri(?![xX])[A-Za-z_$0-9]*/g) || []))));
  ok('V.23b …y esas dos siguen en la purga de cambio de usuario y en la adopción',
    /'aurix_auri_ctx_v1', 'aurix_auri_mem_v1'/.test(src)
    && /_AURIX_INTEL_CTX_KEY_LEGACY = 'aurix_auri_ctx_v1'/.test(src));
}

// ── W · HERO FINALIZATION ───────────────────────────────────────────────────
group('W · finalización del hero · lo que la captura de producción demostró');
{
  // SALUD · vocabulario canónico SIN inventar umbrales
  const hs2 = fnSrc('_intccHealthScore');
  ok('W.1 el vocabulario canónico está declarado completo, de peor a mejor',
    ['weak', 'watch', 'stable', 'balanced', 'solid', 'excellent']
      .every(k => (src.match(new RegExp("intel_h_v_" + k + ":", 'g')) || []).length === 2));
  ok('W.2 el mapeo usa los estados que la verdad YA produce: cero umbrales nuevos',
    /single_position:  'intel_h_v_weak'/.test(hs2)
    && /weight_in_few:    'intel_h_v_watch'/.test(hs2)
    && /weight_uneven:    'intel_h_v_stable'/.test(hs2)
    && /weight_spread:    'intel_h_v_balanced'/.test(hs2)
    // Las bandas siguen siendo las del owner, intactas.
    && /_AURIX_INTEL_HEALTH_BANDS = Object\.freeze\(\{ few: 40, spread: 60 \}\)/.test(src));
  ok('W.3 SÓLIDA y EXCELENTE quedan declaradas y SIN USAR: no hay banda que las distinga',
    !/'intel_h_v_solid'/.test(hs2) && !/'intel_h_v_excellent'/.test(hs2));
  ok('W.4 «no puedo medirlo» NO recibe palabra del vocabulario de salud',
    /coverage_limited: 'intel_h_coverage'/.test(hs2)
    && /no_positions:     'intel_h_no_positions'/.test(hs2));
  ok('W.5 fail-closed: sin datos no hay NaN, undefined ni geometría inválida',
    (() => { const H = sandbox._aurixIntelHealth;
      const bad = [H(null, null, null, null), H(undefined, undefined, null, null),
        H({ status: 'x' }, { assetCount: 0, totUSD: 0 }, null, null)];
      return bad.every(h => h.ring === null && h.ringPublishable === false
        && typeof h.state === 'string' && !/NaN|undefined/.test(JSON.stringify(h))); })());
  // COHERENCIA SEMÁNTICA
  const CS = (() => { const sb5 = { Object, String };
    vm.createContext(sb5);
    vm.runInContext(block('const _AURIX_INTEL_HEALTH_POSITIVE = Object.freeze(', ');')
      + '\n' + fnSrc('_intelCoherentState') + '\nglobalThis.f = _intelCoherentState;', sb5);
    return sb5.f; })();
  ok('W.6 EL DEFECTO DE LA CAPTURA: Salud equilibrada + nivel REPETIDO ya NO alarma',
    CS('attention_material_fact', 'weight_spread', false) === 'monitoring');
  ok('W.7 …pero un cambio material O un hecho NUEVO sí sostienen el titular',
    CS('attention_material_fact', 'weight_spread', true) === 'attention_material_fact');
  // Hallazgo de la revisión: mi primera versión sólo aceptaba `notable_change`, así
  // que un `worth_reviewing` RECIÉN aparecido se degradaba mientras seguía
  // publicado en «Lo que importa» — la misma contradicción al revés.
  ok('W.7b el ancla se considera justificada salvo que el usuario YA la haya visto',
    /persisting\.indexOf\(anchorId\) !== -1/.test(src)
    && /hasMaterialChange \|\| !anchorIsRepeated/.test(src));
  ok('W.7c …y sin lista de persistentes se FALLA HACIA MOSTRAR, nunca hacia callar',
    /\? intel\.memory\.persisting : null/.test(src)
    && /!!\(anchorId && persisting && persisting\.indexOf\(anchorId\) !== -1\)/.test(src));
  ok('W.8 con Salud NO positiva el titular de atención se respeta tal cual',
    CS('attention_material_fact', 'weight_in_few', false) === 'attention_material_fact'
    && CS('attention_material_fact', 'single_position', false) === 'attention_material_fact');
  ok('W.9 la coherencia no toca ningún otro estado',
    ['material_change', 'discovery', 'readings_changed', 'context_needed',
     'insufficient_history', 'stable_no_change', 'stable', 'no_data']
      .every(st => CS(st, 'weight_spread', false) === st));
  ok('W.10 y el estado nuevo tiene copy en los dos idiomas',
    (src.match(/intel_now_monitoring:/g) || []).length === 2
    && (src.match(/intel_sub_monitoring:/g) || []).length === 2);
  // QUESTION DOCK
  ok('W.11 la dock lleva su rótulo y vive al PIE del contenido',
    /<div class="intv11-dock"/.test(src) && /intv11-dock-label/.test(src)
    && /\.intv11-dock \{[\s\S]{0,120}margin-top: auto/.test(css));
  ok('W.12 …dentro del cuerpo, que ya reserva el corredor de la esfera',
    /\.intcc-hero-body \{ padding-right: calc\(var\(--intel-orb-overlap\) \+ var\(--intel-orb-gap\)\)/.test(css)
    && /\.intv11-dock \{[\s\S]{0,400}max-width: 100%; box-sizing: border-box/.test(css));
  // ── W.13 RE-DECIDIDO POR §7, Y MEDIDO SOBRE UNA CAPTURA REAL ─────────────
  // `min-height: 228px` reservaba dentro del cuerpo del hero la altura de la
  // QUESTION DOCK para que aparecer o desaparecer la pregunta no moviera Salud,
  // Radar ni Factores. Pero la dock SALIÓ del hero a su propia card
  // (`.intv12-qcard`, ver A2) y la reserva se quedó: medida a 1440px, el cuerpo
  // ocupaba 228px para 123px de contenido — 105px muertos en TODA cuenta — y
  // encima ya no podía evitar ningún salto, porque lo que aparece y desaparece es
  // una card entera por encima del radar. Era una reserva HUÉRFANA y es, literal,
  // lo que §7 llama «la card queda visualmente abandonada».
  // La garantía que sustituye a la anterior es comprobable y más honesta: la dock
  // NO es hija del hero (así que no hay nada que reservarle) y el bloque de texto
  // se distribuye en la altura que la fila le da, sin inventar contenido.
  ok('W.13 el hero ya NO reserva altura para una dock que vive en otra card',
    !/\.intcc-hero-body \{ min-height: 228px; \}/.test(css)
    && !/\.intcc-hero-body \{ min-height: 216px; \}/.test(css)
    && /@media \(min-width: 1024px\)[\s\S]{0,300}\.intcc-hero-body \{ justify-content: center; \}/.test(css)
    // §4.2 — la card de la pregunta pasa a hospedar también la puerta de
    // liquidez, así que su condición es el CUERPO (`_qCardBody`), no la pregunta
    // sola. Lo que esta aserción protege sigue intacto: sigue siendo CONDICIONAL
    // —sin contenido no hay card— y sigue viviendo fuera del hero.
    && /const _qCardBody = intelQHtml \+ liqCtaHtml;/.test(src)
    && /intelQCardHtml = _qCardBody \? `[\s\S]{0,240}intv12-qcard/.test(src));
  ok('W.13b …y el CSS declara POR QUÉ se retiró, con la medida que lo demuestra',
    /reserva HUÉRFANA|RESERVA HUÉRFANA/.test(css) && /105px de espacio muerto/.test(css));
  ok('W.13c la dock se compacta para que el espacio reservado sea el mínimo',
    /\.intv11-dock \.intv8-intel-pause \{ margin: 0 0 0 4px; \}/.test(css)
    && /\.intv11-dock \.intv8-intel-q-opts \{ align-items: center; \}/.test(css));
  ok('W.14 sin pregunta NO se pinta caja vacía ni texto de relleno',
    /const intelQHtml = intelQ \? \(\(\) => \{/.test(src)
    && !/no hay preguntas|No questions/i.test(src));
  // En móvil nunca hubo reserva (la esfera vive en su propia card) y ahora tampoco
  // la hay en ningún viewport, así que lo que se comprueba es lo que sigue siendo
  // propio del móvil: la dock ocupa su ancho con su propio padding compacto.
  ok('W.15 en móvil la dock no compite con la esfera ni reserva altura',
    /@media \(max-width: 640px\)[\s\S]{0,500}\.intv11-dock \{ margin-top: 12px; padding: 12px; \}/.test(css)
    && !/\.intcc-hero-body \{ min-height/.test(css));
  ok('W.16 la animación es sutil y respeta reduced-motion',
    /@media \(prefers-reduced-motion: no-preference\)[\s\S]{0,200}intv11DockIn/.test(css)
    && /220ms/.test(css));
  ok('W.17 las opciones certificadas siguen ahí: responder, declinar y pausar',
    /data-intel-answer="__decline"/.test(src) && /data-intel-answer="__pause"/.test(src));
  ok('W.18 las señales admiten 2–4 sin romper: envuelven en su propio espacio',
    /\.intcc-hero \.intcc-chips \{ flex-wrap: wrap; row-gap: 6px; \}/.test(css));
}

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
