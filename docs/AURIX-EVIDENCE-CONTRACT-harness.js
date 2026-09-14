'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-EVIDENCE-CONTRACT-harness — SPEC ADVANCED INTELLIGENCE · A1
// ════════════════════════════════════════════════════════════════════════════
// Certifica la PUERTA DE EVIDENCIA FINANCIERA: lo que faltaba cuando dos
// afirmaciones reales llegaron a la pantalla de un usuario y ninguna era
// defendible, aunque las dos salían de owners certificados.
//
//   «Tu exposición a los ETF bajó 16,8 pp en los últimos 30 días, hasta el 0 %»
//   «Has aportado 159.381,97 US$ de capital nuevo»   (cartera de ~75k)
//
// La primera comparaba dos extremos que podían no ser comparables (epoch del
// DISPOSITIVO ⇒ cartera pre-reset; bucket histórico congelado ⇒ reclasificación).
// La segunda sumaba MECANISMOS bajo una palabra que significa INTENCIÓN.
//
// QUÉ ES REAL AQUÍ (la lección de INT.01/INT.02: un gate que stubea la
// integración que certifica no es evidencia):
//   · el lector de exposición completo (`_aurixCatExposureDelta` →
//     `_aurixCatHistWindow` → `_aurixCatHistValidatePoint`) sobre filas con la
//     forma real de `portfolio_snapshots.category_values`;
//   · el ledger de flujos real (`_aurixLoadCapitalFlowsLive`, la detección de
//     duplicados, la lectura canónica, la captura, la purga);
//   · la puerta (`_aurixEvidence`), la autoridad de liquidez
//     (`_aurixCashLedgerAuthority`), la amplitud de categorías, la identidad de
//     evento y el conjunto canónico de hallazgos;
//   · el ledger de hechos y el contrato del Core enteros.
// Son INPUTS (no integraciones bajo prueba): filas de historia, filas de
// servidor, tipo de cambio, el snapshot de salud, los drivers y la cobertura de
// linaje — exactamente lo que en producción aportan otros owners certificados.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

// ── COPY REAL, LOS DOS IDIOMAS ──────────────────────────────────────────────
// Se extraen las cadenas de producción de las claves del ciclo de vida, en ES y
// en EN, y se evalúan. Así una clave ausente o una redacción que cambie de
// significado se ve aquí, no en la pantalla de un usuario.
const LIFECYCLE_KEYS = ['intv4_f_expo_move','intv4_f_expo_diluted','intv4_f_expo_diluted_nc',
  'intv4_f_expo_diluted_mixed','intv4_why_dilution','intv4_why_dilution_nc',
  'intv4_f_pos_below_cost','intv4_f_pos_below_cost_amt','intv4_f_pos_below_cost_top',
  'intv4_f_pos_below_cost_top_amt','intv4_why_position_result',
  'intv4_gap_position_below_cost','intv4_gap_position_period_decline',
  'intv4_gap_position_drawdown_from_peak','intv4_gap_position_fx_attribution',
  'intel_ack','intel_ack_aria','intv4_f_expo_up','intv4_f_expo_down'];
function keyOccurrences(key) {
  const out = []; let i = 0;
  for (;;) { const j = app.indexOf('\n    ' + key + ':', i); if (j < 0) break; out.push(j + 5); i = j + 1; }
  return out;
}
function extractLifecycleDict(langIdx) {
  const d = {};
  LIFECYCLE_KEYS.forEach(k => {
    const occ = keyOccurrences(k);
    if (occ.length <= langIdx) return;
    const start = occ[langIdx];
    // hasta el final de la línea lógica: la coma de cierre al final de línea
    let end = app.indexOf('\n', start);
    const body = app.slice(start, end).replace(/,\s*$/, '');
    try { d[k] = (new Function('return ({ ' + body + ' });'))()[k]; } catch (_) {}
  });
  return d;
}
const DICT = { es: extractLifecycleDict(0), en: extractLifecycleDict(1) };
const DAY = 864e5, MIN = 60000;
const NOW = Date.now();
const T0 = NOW - 60 * DAY;

const CONSTS = ['_AURIX_CATHIST_CANONICAL','_AURIX_INTEL_MEM_MAX_ENTRIES','_AURIX_INTEL_CTX_KEY','_AURIX_INTEL_CTX_KEY_LEGACY','_AURIX_INTEL_PROVENANCE','_AURIX_INTEL_FIELDS','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS',
  '_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR','_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS',
  '_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD','_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES',
  '_AURIX_RETURN_MIN_HISTORY_MS','_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT',
  '_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL','_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY',
  '_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS',
  '_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_AURIX_QUESTION_CATALOG',
  '_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT',
  '_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_INTEL_DIM_ROOT','_INTV4_BRIEF_MAX','_AURIX_LOSS_TIER','_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE'];
const FNS = ['_intv4FindingRows','_aurixLossImpactShare','_aurixLossSeverityTier','_aurixEpisodeOf','_aurixIntelResolveCertified','toBase','_intv5MattersStories','_aurixIntelAcknowledge','_aurixIntelCtxRecord','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner','_aurixIntelCtxMerge','_nativeToUSD','_intv4T','_intv4Num','_intv4Money','_intv4CatLabel','_intv5CatLabel','_intv4RangeLabel','_intv4WindowLabel','_intv4FactText','_intv4WhyText','_aurixAdoptRemoteClassificationLineage','_aurixLineageWrite','_aurixLineageMerge','_aurixLineageForBackend','_aurixDisplayCategory','_aurixPositionFromAsset','computePositionPerformance','getDisplayName','formatCurrency','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
  'activeAssets','isInvestableAsset','investableAssets','investableValueUSD','liquidityNominal',
  'assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete','_aurixFlowIsInternal','_aurixFlowIntentOf',
  '_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey',
  '_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixLoadCapitalFlows','_aurixSaveCapitalFlows',
  '_aurixNewFlowId','_aurixCaptureFlow','_aurixPurgeDerivedFlows',
  '_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixFlowCounterpartObserved',
  '_aurixInvestablePerformance','_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct',
  '_aurixCatHistWindow','_aurixCatExposureDelta','_aurixFactClamp01','_aurixEffectiveDiversification',
  '_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','_aurixEvidence',
  '_aurixCashLedgerAuthority','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth',
  '_aurixEventIdentity','_aurixCanonicalFindings','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixIntelligenceCore'];

function makeCtx(opts) {
  const o = opts || {};
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  vm.createContext(sb);
  sb.baseCurrency = o.baseCurrency || 'USD';
  sb.usdToEur = 0.92;
  sb.lang = 'es';
  sb._aurixFxRate = c => ({ USD: 1, EUR: 0.92 })[String(c).toUpperCase()];
  sb.__rows = o.rows || [];
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb.__epoch = o.epoch || 0;
  sb._aurixPortfolioEpoch = () => sb.__epoch;
  sb.investableValueBase = () => 0;
  sb.canDisplayCanonicalReturn = () => ({ ok: true });
  sb.activeRange = 'all';
  sb._aurixBackendSnapshots = o.serverRows || [];
  sb._aurixBackendSnapshotsState = o.hydration || 'ready';
  sb._aurixBackendHealthSnapshot = () => ({ status: 'ok' });
  sb.assets = o.assets || [];
  sb._aurixHealthSnapshot = () => (o.snap === undefined ? null : o.snap);
  sb.buildPortfolioDrivers = () => (o.drivers === undefined ? null : o.drivers);
  sb.IS_DEV = false;
  // COPY REAL, los dos idiomas. Las frases nuevas del ciclo de vida se comprueban
  // con las cadenas de producción, no con un sustituto: una clave ausente en EN
  // renderizaría texto vacío y el gate lo vería verde.
  sb.lang = o.lang || 'es';
  sb.formatBase = v => String(Math.round(Number(v) || 0));
  sb.t = k => { try { return DICT[sb.lang][k]; } catch (_) { return undefined; } };
  sb._intccDate = () => '';
  sb._INTV4_DEPTH = { GUIDED: 'guided', BALANCED: 'balanced', ADVANCED: 'advanced' };
  sb._intv4FactDepth = o.depth || 'balanced';
  sb._aurixCapitalFlowsPush = () => true;
  // Autoridad del ledger remoto: arranca DEMOSTRADA salvo que el caso la niegue.
  sb._aurixCapitalFlowsComplete = () => (o.flowsComplete === undefined ? true : !!o.flowsComplete);
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  // Cobertura de linaje: por defecto CUBRE toda la historia y sin cambios, que es
  // el estado de una cuenta cuyo linaje se observa desde antes de la ventana.
  sb.__lineage = (o.lineage === undefined) ? { since: 0, entries: [] } : o.lineage;
  // A1 — la cobertura de linaje es de la CUENTA, no del dispositivo: sin la
  // columna remota leída, la validez de clasificación es DESCONOCIDA y la
  // transición se suprime. Aquí se declara vista salvo que el caso la niegue,
  // que es la precondición equivalente a tener el SQL aplicado en producción.
  vm.runInContext('var _aurixLineageColumnSeen = ' + ((o.lineageAccountWide === false) ? 'false' : 'true') + ';', sb);
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
  if (sb.__lineage) vm.runInContext('__store[_AURIX_LINEAGE_KEY] = ' + JSON.stringify(JSON.stringify(sb.__lineage)), sb);
  return sb;
}
const run = (expr, ctx) => vm.runInContext(expr, ctx);
const core = (o, coreOpts) => run('_aurixIntelligenceCore(' +
  JSON.stringify(Object.assign({ now: NOW }, coreOpts || {})) + ')', makeCtx(o));

// ── fixtures ────────────────────────────────────────────────────────────────
const row = (dayOffset, total, re) => ({ ts: T0 + dayOffset * DAY, total, real_estate: re || 0 });
const inv = vals => vals.map((v, i) => row(i, v, 0));
function srvRow(tsMs, cats) {
  const all = Object.assign({}, cats);
  let total = 0; for (const k in all) total += all[k];
  return { ts: tsMs, total_value_usd: +total.toFixed(2), real_estate: all.real_estate || 0, category_values: all };
}
// Historia de servidor densa y FRESCA: el contrato exige que el punto más nuevo
// represente el presente, así que las fixtures terminan cerca del ahora real.
function srvHistory(endTs, spanDays, startCats, endCats) {
  const rows = [];
  const startTs = endTs - spanDays * DAY;
  for (let i = 0; i < 6; i++) rows.push(srvRow(startTs + i * 15 * MIN, startCats));
  // Un punto real a 7 días del final, para que la ventana 7D tenga un inicio
  // GENUINO cuando la fixture abarca 30 días. Sin él sólo 30D podría responder y
  // el caso «la misma deriva por dos ventanas» no se estaría ejercitando.
  if (spanDays > 8) for (let i = 0; i < 4; i++) rows.push(srvRow(endTs - 7 * DAY + i * 15 * MIN, startCats));
  const mid = startTs + (spanDays * DAY) / 2;
  for (let i = 0; i < 4; i++) rows.push(srvRow(mid + i * 15 * MIN, startCats));
  for (let i = 5; i >= 0; i--) rows.push(srvRow(endTs - i * 15 * MIN, endCats));
  return rows;
}
const A = (id, type, qty, price, cur) => ({ id, type, qty, price, assetCurrency: cur || 'USD', ticker: id });
const SNAP = { assetCount: 3, totUSD: 100000, cashPct: 12, uncertifiablePositions: 0,
  topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 53 }, topCategory: { label: 'Cripto', pctTotal: 62 } };
const DRIVERS = { items: [], pct: 71 };
const BTC_ETH_CASH = [A('btc', 'crypto', 1, 60000), A('eth', 'crypto', 5, 3000), A('eur', 'cash', 12000, 1)];

// ════════════════════════════════════════════════════════════════════════════
console.log('AURIX-EVIDENCE-CONTRACT — SPEC ADVANCED INTELLIGENCE · A1\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · P0 EXPOSICIÓN — VERDAD DE LA TRANSICIÓN vs ATRIBUCIÓN DE CAUSA
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Una transición histórica sólo se publica si sus dos extremos son comparables:');
{
  const endTs = NOW;
  // El caso exacto de la captura: ETF con peso ANTES y 0 AHORA.
  const etfGone = { serverRows: srvHistory(endTs, 7, { etf: 16800, crypto: 60000, liquidity: 23200 },
                                                     { crypto: 77000, liquidity: 23000 }),
                    rows: inv([100000, 100000, 100000, 100000]), assets: BTC_ETH_CASH,
                    snap: SNAP, drivers: DRIVERS };
  const base = core(etfGone, { ranges: ['7D'] });
  const f = base.ledger.facts.find(x => x.semanticKey === 'exposure_drift_etf_7D');
  ok('1.1 con epoch y clasificación comparables, la transición SÍ se publica (no se calla un hecho medido)',
    !!f && f.evidence && f.evidence.ok === true, JSON.stringify(f && f.values));
  ok('1.2 sin evento del usuario que la corrobore, la CAUSA queda declarada DESCONOCIDA',
    !!f && f.values.causeKnown === false && f.values.cause === null && f.eventClass === 'market_driven',
    JSON.stringify(f && { c: f.values.causeKnown, k: f.eventClass }));
  ok('1.3 la evidencia declara su clase de observación y sus dos extremos',
    !!f && f.evidence.observationClass === 'observed'
    && Number.isFinite(f.evidence.baseline.at) && Number.isFinite(f.evidence.comparison.at)
    && f.evidence.source === 'aurixCatExposureDelta');

  // EPOCH — el extremo inicial pertenece a otra cartera. No es «poco fiable»:
  // no es comparable, y ninguna confianza arregla comparar dos carteras.
  const crossed = core(Object.assign({}, etfGone, { epoch: endTs - 3 * DAY }), { ranges: ['7D'] });
  const cf = crossed.ledger.facts.find(x => x.semanticKey === 'exposure_drift_etf_7D');
  const cg = crossed.ledger.gaps.find(g => g.semanticKey === 'exposure_drift_etf_7D');
  ok('1.4 EPOCH CRUZADO ⇒ la transición se SUPRIME (cartera pre-reset vista por un dispositivo sin reset)',
    !cf && !!cg && /epoch_boundary_crossed/.test(String(cg.reason)), JSON.stringify(cg));

  // CLASIFICACIÓN — sin cobertura de linaje no se puede descartar que el bucket
  // se haya renombrado por debajo. Falla CERRADO.
  const noLineage = core(Object.assign({}, etfGone, { lineage: { since: null, entries: [] } }), { ranges: ['7D'] });
  const ng = noLineage.ledger.gaps.find(g => g.semanticKey === 'exposure_drift_etf_7D');
  ok('1.5 SIN cobertura de linaje ⇒ suprimida con `classification_validity_unknown`',
    !noLineage.ledger.facts.some(x => x.semanticKey === 'exposure_drift_etf_7D')
    && !!ng && /classification_validity_unknown/.test(String(ng.reason)), JSON.stringify(ng));

  // Y el caso que la revisión destapó: cobertura de DISPOSITIVO presentada como
  // cobertura de CUENTA. Sin la columna remota el linaje nunca sincroniza, así que
  // un portátil con meses de observación propia no sabe nada de la reclasificación
  // que hizo OTRO dispositivo. Falla cerrado.
  const deviceOnly = core(Object.assign({}, etfGone, { lineageAccountWide: false,
      lineage: { since: 0, entries: [] } }), { ranges: ['7D'] });
  const dg = deviceOnly.ledger.gaps.find(g => g.semanticKey === 'exposure_drift_etf_7D');
  ok('1.5b cobertura sólo DE ESTE DISPOSITIVO ⇒ validez desconocida y transición suprimida',
    !deviceOnly.ledger.facts.some(x => x.semanticKey === 'exposure_drift_etf_7D')
    && !!dg && /classification_validity_unknown/.test(String(dg.reason)), JSON.stringify(dg));
  // ── LA RUTA DE ADOPCIÓN, EJERCITADA DE VERDAD ────────────────────────────
  // La revisión encontró que nadie la ejecutaba: los casos inyectaban el registro
  // y encendían la columna a mano, así que se certificaba el LECTOR y se stubeaba
  // la PUERTA. Es la lección de `feedback_harness_no_stubear_lo_certificado`, y
  // aquí destapó un defecto real — la marca de «primera adopción» era un flag en
  // memoria, así que se re-sellaba en CADA carga y la cobertura no podía envejecer.
  {
    const c = makeCtx({});                                   // sin registro previo
    run('_aurixAdoptRemoteClassificationLineage([])', c);
    const first = run('_aurixLineageRead()', c);
    ok('1.5d la PRIMERA adopción sella `adoptedAt` y recorta la cobertura a ese instante',
      Number.isFinite(first.adoptedAt) && first.since === first.adoptedAt,
      JSON.stringify(first));
    // Segunda «carga de página»: el flag en memoria valdría false otra vez, pero el
    // sello vive en el REGISTRO, así que la cobertura no puede volver a recortarse.
    run('_aurixAdoptRemoteClassificationLineage([])', c);
    const again = run('_aurixLineageRead()', c);
    ok('1.5e una adopción POSTERIOR no vuelve a recortarla (el sello es del registro, no de la sesión)',
      again.adoptedAt === first.adoptedAt && again.since === first.since,
      JSON.stringify({ first: first.adoptedAt, again: again.adoptedAt }));
    // Y un dispositivo NUEVO hereda la adopción de la cuenta por el push/pull.
    const fresh = makeCtx({});
    const payload = run('_aurixLineageForBackend()', c);
    run('_aurixAdoptRemoteClassificationLineage(' + JSON.stringify(payload) + ')', fresh);
    const inherited = run('_aurixLineageRead()', fresh);
    ok('1.5f un dispositivo NUEVO hereda la adopción de la cuenta en vez de recortar a su propio arranque',
      inherited.adoptedAt === first.adoptedAt,
      JSON.stringify({ account: first.adoptedAt, device: inherited.adoptedAt }));
    ok('1.5g …y con cobertura heredada una ventana POSTERIOR a la adopción sí queda licenciada',
      (() => { const v = run('_aurixClassificationValidity("etf", ' +
          (Number(first.adoptedAt) + 1000) + ', ' + (Number(first.adoptedAt) + 2000) + ')', fresh);
        return v.validity === 'no_reclassification_recorded'; })(),
      JSON.stringify(run('_aurixClassificationValidity("etf", ' +
        (Number(first.adoptedAt) + 1000) + ', ' + (Number(first.adoptedAt) + 2000) + ')', fresh)));
    ok('1.5h …y una ANTERIOR a la adopción sigue suprimida (lo vio un navegador, no la cuenta)',
      (() => { const v = run('_aurixClassificationValidity("etf", ' +
          (Number(first.adoptedAt) - 20 * DAY) + ', ' + (Number(first.adoptedAt) - 1000) + ')', fresh);
        return v.validity === 'unknown' && v.reason === 'coverage_starts_after_window'; })());
    ok('1.5i el escenario de la revisión: linaje local de meses, reclasificación hecha en OTRO dispositivo',
      (() => { const laptop = makeCtx({});
        // el portátil lleva 90 días observando SU propio linaje, sin entradas
        run('_aurixLineageWrite({ since: ' + (NOW - 90 * DAY) + ', adoptedAt: null, entries: [] })', laptop);
        run('_aurixAdoptRemoteClassificationLineage([])', laptop);
        const v = run('_aurixClassificationValidity("etf", ' + (NOW - 30 * DAY) + ', ' + NOW + ')', laptop);
        return v.validity === 'unknown'; })());
  }
  ok('1.5c y el desalojo por tope encoge la cobertura declarada (no se afirma sobre evidencia tirada)',
    /out\.length > kept\.length/.test(fnSrc('_aurixLineageMerge'))
    && /since = Math\.max\(Number\(since\) \|\| 0, Number\(kept\[0\]\.at\)\)/.test(fnSrc('_aurixLineageMerge')));
  const lateLineage = core(Object.assign({}, etfGone, { lineage: { since: endTs - 2 * DAY, entries: [] } }), { ranges: ['7D'] });
  ok('1.6 cobertura que EMPIEZA DENTRO de la ventana no cubre su inicio ⇒ igualmente suprimida',
    !lateLineage.ledger.facts.some(x => x.semanticKey === 'exposure_drift_etf_7D'));

  // RECLASIFICACIÓN REAL dentro de la ventana.
  const reclass = core(Object.assign({}, etfGone, { lineage: { since: 0,
      entries: [{ a: 'fondo1', f: 'etf', t: 'fund', at: endTs - 3 * DAY }] } }), { ranges: ['7D'] });
  const rg = reclass.ledger.gaps.find(g => g.semanticKey === 'exposure_drift_etf_7D');
  ok('1.7 una RECLASIFICACIÓN del bucket dentro de la ventana suprime la transición, con su causa nombrada',
    !reclass.ledger.facts.some(x => x.semanticKey === 'exposure_drift_etf_7D')
    && !!rg && /classification_changed_in_window/.test(String(rg.reason)), JSON.stringify(rg));
  ok('1.8 la reclasificación de OTRO bucket no contamina a este',
    (() => { const r2 = core(Object.assign({}, etfGone, { lineage: { since: 0,
        entries: [{ a: 'x', f: 'metal', t: 'other', at: endTs - 3 * DAY }] } }), { ranges: ['7D'] });
      return r2.ledger.facts.some(x => x.semanticKey === 'exposure_drift_etf_7D'); })());

  // CLASE NUNCA POSEÍDA — no hay peso en ninguno de los dos extremos, así que no
  // hay transición que emitir: el umbral de materialidad ni se alcanza.
  const never = core({ serverRows: srvHistory(endTs, 7, { crypto: 60000, liquidity: 40000 },
                                                        { crypto: 77000, liquidity: 23000 }),
                       rows: inv([100000, 100000, 100000, 100000]), assets: BTC_ETH_CASH,
                       snap: SNAP, drivers: DRIVERS }, { ranges: ['7D'] });
  ok('1.9 una clase NUNCA poseída no produce ninguna afirmación (ni hecho ni cifra)',
    !never.ledger.facts.some(x => /exposure_drift_etf/.test(x.semanticKey))
    && !never.ledger.facts.some(x => /exposure_drift_metal/.test(x.semanticKey)));

  // RETIRADA GENUINA, corroborada por el evento del usuario.
  const removal = core(Object.assign({}, etfGone, {
      assets: BTC_ETH_CASH.concat([A('etf1', 'etf', 0, 100)]),
      flows: [{ id: 'rm:etf1', ts: endTs - 3 * DAY, amountUSD: -16800, kind: 'asset_remove',
                source: 'user', intent: 'INTERNAL_SELL', assetId: 'etf1', revision: 1 }] }), { ranges: ['7D'] });
  const rf = removal.ledger.facts.find(x => x.semanticKey === 'exposure_drift_etf_7D');
  ok('1.10 una RETIRADA GENUINA sí corrobora la causa: `causeKnown` y clase user_driven',
    !!rf && rf.values.causeKnown === true && rf.values.cause === 'asset_remove'
    && rf.eventClass === 'user_driven', JSON.stringify(rf && rf.values));
  ok('1.11 y su identidad de evento es la de la TRANSACCIÓN, no una de observación',
    !!rf && /^tx:/.test(String(rf.eventId)), String(rf && rf.eventId));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · P0 CAPITAL — D-1 / D-2 Y LA AUTORIDAD DEL LEDGER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · El mismo hecho económico no puede contarse dos veces:');
{
  const tsDep = T0 + 2 * DAY;
  // D-1 exacto: el owner de liquidez emite `deposit` y escribe una transacción;
  // el backfill DERIVA `asset_add` de esa misma transacción ⇒ dos filas.
  const dupLedger = [
    { id: 'flw_abc', ts: tsDep, amountUSD: 50000, kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 },
    { id: 'asset_add:eur:' + tsDep + ':50000', ts: tsDep, originalTs: tsDep, amountUSD: 50000,
      kind: 'asset_add', source: 'tx-backfill', assetId: 'eur', revision: 1 },
  ];
  const c = makeCtx({ flows: dupLedger });
  const live = run('_aurixLoadCapitalFlowsLive()', c);
  const canon = run('_aurixLoadCapitalFlows()', c);
  const rep = run('_aurixFlowDuplicateReport()', c);
  ok('2.1 D-1 · la lectura VIVA ve las dos filas (no se destruye historia financiera)', live.length === 2);
  ok('2.2 D-1 · la lectura CANÓNICA excluye del consumo la fila DERIVADA, no la de usuario',
    canon.length === 1 && canon[0].kind === 'deposit' && canon[0].source === 'user',
    JSON.stringify(canon.map(f => f.kind + '/' + f.source)));
  // C11 · LO QUE ESTA FIXTURE DEMUESTRA Y LO QUE NO. Demuestra que la lectura
  // canónica retira EXACTAMENTE el importe de la gemela. NO demuestra que las
  // cuentas reales ya contaminadas queden curadas: eso depende de si sus filas
  // derivadas cumplen el predicado, y sólo se puede medir en la cuenta real.
  ok('2.3 D-1 · el flujo consumido cae EXACTAMENTE el importe de la gemela (100000 → 50000)',
    live.reduce((s, f) => s + f.amountUSD, 0) - canon.reduce((s, f) => s + f.amountUSD, 0) === 50000);
  ok('2.4 D-1 · el duplicado queda AUDITADO, no silenciado', rep.excluded === 1 && rep.total === 2);
  // Los tres casos que el join ANTERIOR dejaba escapar, porque incluía el importe
  // redondeado en la clave. Cada uno acababa con el MISMO depósito neutralizado
  // dos veces en el paso 4 de `_aurixInvestablePerformance`.
  ok('2.4a FX · la gemela convertida con otro tipo de cambio SÍ se empareja (el importe sale de la clave)',
    (() => { const c = makeCtx({ flows: [
        { id: 'flw_eur', ts: tsDep, amountUSD: 21740.55, kind: 'deposit', source: 'user',
          assetId: 'eur', amount: 20000, currency: 'EUR', revision: 1 },
        { id: 'asset_add:eur:' + tsDep + ':21619', ts: tsDep, originalTs: tsDep, amountUSD: 21618.90,
          kind: 'asset_add', source: 'tx-backfill', assetId: 'eur', revision: 1 } ] });
      const canon = run('_aurixLoadCapitalFlows()', c);
      return canon.length === 1 && canon[0].source === 'user'; })());
  ok('2.4b EDICIÓN · la gemela que conserva el importe viejo también se empareja',
    (() => { const c = makeCtx({ flows: [
        { id: 'flw_ed', ts: tsDep, amountUSD: 70000, kind: 'deposit', source: 'user',
          assetId: 'eur', revision: 2 },
        { id: 'asset_add:eur:' + tsDep + ':50000', ts: tsDep, originalTs: tsDep, amountUSD: 50000,
          kind: 'asset_add', source: 'tx-backfill', assetId: 'eur', revision: 1 } ] });
      return run('_aurixLoadCapitalFlows()', c).length === 1; })());
  ok('2.4c LEGACY · una derivada SIN `originalTs` no se puede emparejar: no se excluye, pero BLOQUEA el importe',
    (() => { const c = makeCtx({ flows: [
        { id: 'flw_l', ts: tsDep, amountUSD: 30000, kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 },
        { id: 'legacy', ts: tsDep + 3 * MIN, amountUSD: 30000, kind: 'asset_add',
          source: 'tx-backfill', assetId: 'eur', revision: 1 } ] });
      const canon = run('_aurixLoadCapitalFlows()', c);
      const rep = run('_aurixFlowDuplicateReport()', c);
      const auth = run('_aurixCashLedgerAuthority(' + (tsDep - DAY) + ',' + (tsDep + DAY) + ')', c);
      return canon.length === 2 && rep.unpairableDerived === 1
        && auth.amountPublishable === false
        && auth.gaps.indexOf('duplicate_flow_identity') !== -1; })());
  ok('2.5 la coincidencia exige `originalTs` EXACTO: un importe igual en otro instante NO es duplicado',
    (() => { const c2 = makeCtx({ flows: [dupLedger[0],
        Object.assign({}, dupLedger[1], { originalTs: tsDep + 5 * MIN, id: 'other' })] });
      return run('_aurixLoadCapitalFlows()', c2).length === 2; })());
  ok('2.6 dos filas de USUARIO con el mismo importe NUNCA se excluyen entre sí (sólo cae lo derivado)',
    (() => { const c3 = makeCtx({ flows: [dupLedger[0],
        Object.assign({}, dupLedger[0], { id: 'flw_def' })] });
      return run('_aurixLoadCapitalFlows()', c3).length === 2; })());

  // D-2 — el asiento de cuadre no es un flujo.
  ok('2.7 D-2 · el backfill de transacciones EXCLUYE la liquidez y los asientos `opening`',
    (() => { const src = fnSrc('_aurixBackfillFlowsFromTransactions');
      return /=== 'cash'\) continue/.test(src) && /tx\.opening === true\) continue/.test(src); })());
  ok('2.8 D-2 · el flag `opening` tiene ahora un consumidor real (antes no tenía ninguno)',
    (app.match(/tx\.opening === true/g) || []).length >= 1);

  // Purga — conserva lápidas y marcadores pre-epoch.
  ok('2.9 la purga de lo DERIVADO conserva lápidas y filas pre-epoch (antes las destruía)',
    (() => { const c4 = makeCtx({ epoch: T0 + 10 * DAY, flows: [
        { id: 'a', ts: T0 + 1 * DAY, amountUSD: 100, kind: 'deposit', source: 'user', revision: 1 },
        { id: 'b', ts: T0 + 20 * DAY, amountUSD: 200, kind: 'deposit', source: 'user', revision: 1, deletedAt: T0 + 21 * DAY },
        { id: 'c', ts: T0 + 20 * DAY, amountUSD: 300, kind: 'asset_add', source: 'tx-backfill', revision: 1 } ] });
      const removed = run('_aurixPurgeDerivedFlows()', c4);
      const kept = JSON.parse(run('localStorage.getItem(_AURIX_CAPITAL_FLOWS_KEY)', c4));
      return removed === 1 && kept.length === 2
        && kept.some(f => f.id === 'a') && kept.some(f => f.id === 'b' && !!f.deletedAt); })());
}

console.log('\n3 · «Has aportado X de capital nuevo» sólo puede decirse si X es capital externo certificado:');
{
  const t0 = T0, t1 = T0 + 5 * DAY;
  const mk = (flows, extra) => makeCtx(Object.assign({ flows: flows }, extra || {}));
  const auth = (flows, extra) => run('_aurixCashLedgerAuthority(' + t0 + ',' + (t1 + DAY) + ')', mk(flows, extra));

  const buys = [{ id: 'x1', ts: t0 + DAY, amountUSD: 40000, kind: 'asset_add', source: 'user',
                  intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 },
                { id: 'x2', ts: t0 + 2 * DAY, amountUSD: 35000, kind: 'asset_add', source: 'user',
                  intent: 'INTERNAL_BUY', assetId: 'eth', revision: 1 }];
  const a1 = auth(buys);
  ok('3.1 las COMPRAS INTERNAS no son movimientos de liquidez: no entran en la cifra',
    a1.events === 0 && a1.inUSD === 0 && a1.netUSD === 0, JSON.stringify(a1));

  const cash = [{ id: 'd1', ts: t0 + DAY, amountUSD: 20000, kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 },
                { id: 'w1', ts: t0 + 2 * DAY, amountUSD: -5000, kind: 'withdrawal', source: 'user', assetId: 'eur', revision: 1 }];
  const a2 = auth(cash);
  ok('3.2 entradas y salidas REGISTRADAS se publican por separado y su neto es su suma',
    a2.events === 2 && a2.inUSD === 20000 && a2.outUSD === -5000 && a2.netUSD === 15000
    && a2.amountPublishable === true, JSON.stringify(a2));
  ok('3.3 pero NUNCA como capital externo certificado: sin intención declarada, `externalCertified` es falso',
    a2.externalCertified === false && a2.intentKnown === 0
    && a2.gaps.indexOf('flow_intent_unknown') !== -1, JSON.stringify(a2.gaps));

  const a3 = auth(cash, { flowsComplete: false });
  ok('3.4 C4 · sin completitud remota DEMOSTRABLE el importe no es publicable (queda el recuento)',
    a3.amountPublishable === false && a3.events === 2
    && a3.gaps.indexOf('capital_flow_authority_incomplete') !== -1, JSON.stringify(a3.gaps));

  const a4 = auth(cash.concat([{ id: 'i1', ts: t0 + 3 * DAY, amountUSD: 9000,
                                 kind: 'import_baseline', source: 'inferred', revision: 1 }]));
  ok('3.5 C2 · una fila HEURÍSTICA en la ventana bloquea el importe (la inferencia no es capital)',
    a4.amountPublishable === false && a4.gaps.indexOf('inferred_flow_in_window') !== -1,
    JSON.stringify(a4.gaps));
  ok('3.6 y esa fila heurística tampoco suma: el neto sigue siendo el de la liquidez registrada',
    a4.netUSD === 15000, JSON.stringify(a4.netUSD));

  const dupTs = t0 + DAY;
  const a5 = auth([{ id: 'd9', ts: dupTs, amountUSD: 20000, kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 },
                   { id: 'asset_add:eur:' + dupTs + ':20000', ts: dupTs, originalTs: dupTs, amountUSD: 20000,
                     kind: 'asset_add', source: 'tx-backfill', assetId: 'eur', revision: 1 }]);
  ok('3.7 C3 · con duplicados de identidad vivos en la ventana el importe no se publica',
    a5.amountPublishable === false && a5.gaps.indexOf('duplicate_flow_identity') !== -1,
    JSON.stringify(a5.gaps));

  ok('3.7b el predicado de completitud arranca CERRADO para una sesión autenticada',
    /let _aurixCapitalFlowsIncomplete = true;/.test(app)
    && /return !_aurixCapitalFlowsIncomplete;/.test(fnSrc('_aurixCapitalFlowsComplete')));
  ok('3.7c …y exime a la sesión ANÓNIMA, como su hermano `_aurixSourceSetComplete`',
    /return _known \? false : true;/.test(fnSrc('_aurixCapitalFlowsComplete')));
  ok('3.7d …pero NO durante el arranque: con sesión conocida y `currentUser` sin resolver, cerrado',
    /_aurixActiveUserId/.test(fnSrc('_aurixCapitalFlowsComplete')));
  ok('3.8 la intención LEGACY (sin campo) se lee como UNKNOWN_LEGACY y jamás como externa',
    (() => { const c = makeCtx({});
      return run("_aurixFlowIntentOf({ kind: 'deposit' })", c) === 'UNKNOWN_LEGACY'
        && run("_aurixFlowIntentOf({ kind: 'deposit', intent: 'INVENTADA' })", c) === 'UNKNOWN_LEGACY'; })());
  ok('3.9 una intención declinada por el usuario NO cuenta como externa (nunca el valor favorable por defecto)',
    (() => { const withDeclined = [{ id: 'd1', ts: t0 + DAY, amountUSD: 20000, kind: 'deposit',
        source: 'user', intent: 'UNKNOWN_DECLINED', assetId: 'eur', revision: 1 }];
      const a = auth(withDeclined);
      return a.externalCertified === false && a.intentKnown === 0; })());
  ok('3.10 con intención EXTERNA declarada en todos los eventos sí se certifica (el camino existe)',
    (() => { const declared = [
        { id: 'd1', ts: t0 + DAY, amountUSD: 20000, kind: 'deposit', source: 'user',
          intent: 'EXTERNAL_CASH_CONTRIBUTION', assetId: 'eur', revision: 1 },
        { id: 'w1', ts: t0 + 2 * DAY, amountUSD: -5000, kind: 'withdrawal', source: 'user',
          intent: 'EXTERNAL_CASH_WITHDRAWAL', assetId: 'eur', revision: 1 }];
      const a = auth(declared);
      return a.externalCertified === true && a.intentKnown === 2 && a.gaps.length === 0; })());
  // Se inspeccionan las CADENAS de i18n, no los comentarios que explican por qué
  // la frase se retiró: un comentario no llega a la pantalla de nadie.
  ok('3.11 la frase retirada no existe en ninguna clave de copy',
    (() => { const noComments = app.replace(/^\s*\/\/.*$/gm, '');
      return !/Has aportado \$\{/.test(noComments)
        && !/`[^`]*de capital nuevo[^`]*`/.test(noComments)
        && !/`[^`]*of new capital[^`]*`/.test(noComments); })(),
    (app.replace(/^\s*\/\/.*$/gm, '').match(/de capital nuevo|of new capital/g) || []).join(','));
  ok('3.12 el vocabulario de intención del cliente es EXACTAMENTE el del CHECK del SQL',
    (() => { const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'advanced_intelligence_u1_1.sql'), 'utf8');
      const c = makeCtx({});
      const client = Object.keys(run('_AURIX_FLOW_INTENT', c)).filter(k => k !== 'UNKNOWN_DECLINED');
      return client.every(k => sql.indexOf("'" + k + "'") !== -1); })());
  ok('3.13 la transferencia de activo externa se declara NO SOPORTADA en vez de inferirse',
    (() => { const e = core({ rows: inv([100000, 101000, 102000, 103000]), assets: BTC_ETH_CASH,
        snap: SNAP, drivers: DRIVERS,
        flows: [{ id: 'd1', ts: T0 + DAY, amountUSD: 20000, kind: 'deposit', source: 'user', revision: 1 }] });
      const g = e.ledger.gaps.find(x => x.semanticKey === 'external_asset_transfer');
      return !!g && g.status === 'not_yet_supported'
        && g.reason === 'external_transfer_not_capturable'; })());
  ok('3.14 y la identidad de dinero completa se declara NO COMPUTABLE con su causa (no se finge un gate)',
    (() => { const e = core({ rows: inv([100000, 101000, 102000, 103000]), assets: BTC_ETH_CASH,
        snap: SNAP, drivers: DRIVERS,
        flows: [{ id: 'd1', ts: T0 + DAY, amountUSD: 20000, kind: 'deposit', source: 'user', revision: 1 }] });
      const g = e.ledger.gaps.find(x => x.semanticKey === 'money_identity_reconciliation');
      return !!g && g.reason === 'money_identity_not_conservative'; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · AMPLITUD DE CATEGORÍAS REGISTRADAS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · La amplitud de categorías se llama por lo que mide y se publica como conteo:');
{
  const breadth = (assets) => run('_aurixRegisteredCategoryBreadth()', makeCtx({ assets: assets }));
  const b1 = breadth(BTC_ETH_CASH);
  ok('4.1 BTC + ETH + caja son DOS categorías registradas, no una cartera amplia',
    b1.status === 'available' && b1.categoriesHeld === 2 && b1.effectiveCategories < 2,
    JSON.stringify(b1));
  ok('4.2 publica su taxonomía declarada (7 buckets invertibles certificados)', b1.taxonomySize === 7);
  ok('4.3 una cartera realmente repartida obtiene un conteo efectivo mayor',
    (() => { const b = breadth([A('btc','crypto',1,25000), A('aapl','stock',100,250),
        A('vwce','etf',200,125), A('au','metal',10,2500), A('eur','cash',25000,1)]);
      return b.status === 'available' && b.effectiveCategories > 4; })());
  ok('4.4 A4 · un tipo DESCONOCIDO falla cerrado y nunca se pliega a «Otros»',
    (() => { const b = breadth([A('x','nft',1,1000), A('eur','cash',1000,1)]);
      return b.status !== 'available' && b.reason === 'unclassifiable_type'; })());
  ok('4.5 A3 · si «Otros» es el bucket de MAYOR peso no se publica nada',
    (() => { const b = breadth([A('x','other',1,90000), A('eur','cash',1000,1)]);
      return b.status !== 'available' && b.reason === 'unclassified_dominates'; })());
  ok('4.6 A5 · una posición no valorable impide el número (denominador parcial prohibido)',
    (() => { const b = breadth([A('btc','crypto',1,NaN), A('eur','cash',1000,1)]);
      return b.status !== 'available'; })());
  ok('4.7 el inmueble nunca entra en la amplitud (no es patrimonio invertible)',
    (() => { const a = breadth(BTC_ETH_CASH);
      const b = breadth(BTC_ETH_CASH.concat([A('casa','real_estate',1,380000)]));
      return a.effectiveCategories === b.effectiveCategories; })());
  ok('4.8 A8 · el owner declara explícitamente el encuadre PROHIBIDO',
    (() => { const b = breadth(BTC_ETH_CASH);
      return ['diversification','economic_exposure','sector','geography','correlation','currency','risk']
        .every(k => b.forbiddenFraming.indexOf(k) !== -1); })());
  ok('4.9 el radar ya NO publica `effectiveN/positions` como diversificación',
    !/effectiveN \/ div\.positions/.test(fnSrc('_intv7RadarAxes')));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · IDENTIDAD DE EVENTO Y CONJUNTO CANÓNICO DE HALLAZGOS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Si el hero dice N, hay exactamente esos N hallazgos:');
{
  const endTs = NOW;
  const c = makeCtx({});
  ok('5.1 la identidad de una transacción es su `flowId` estable, NUNCA su ts re-anclado',
    (() => { const a = run("_aurixEventIdentity('transaction', { flowId: 'flw_1', ts: 100 })", c);
      const b = run("_aurixEventIdentity('transaction', { flowId: 'flw_1', ts: 999999 })", c);
      return a === b && a === 'tx:flw_1'; })());
  ok('5.2 una transacción legacy usa su identidad determinista ORIGINAL, no la re-anclada',
    (() => { const a = run("_aurixEventIdentity('transaction', { kind: 'asset_add', assetId: 'btc', originalTs: 7 })", c);
      return a === 'tx:asset_add:btc:7'; })());
  ok('5.3 un cruce de banda identifica la TRANSICIÓN, y volver a cruzar es otro evento',
    (() => { const up = run("_aurixEventIdentity('band', { causalRoot: 'top_position', fromBand: 'a', toBand: 'b' })", c);
      const down = run("_aurixEventIdentity('band', { causalRoot: 'top_position', fromBand: 'b', toBand: 'a' })", c);
      return up !== down; })());
  ok('5.4 la deriva pasiva NO lleva el punto base en su identidad (por eso 7D y 30D son UN evento)',
    (() => { const a = run("_aurixEventIdentity('observation', { causalRoot: 'category_mix', baselinePointId: 1 })", c);
      const b = run("_aurixEventIdentity('observation', { causalRoot: 'category_mix', baselinePointId: 2 })", c);
      return a === b && a === 'ob:category_mix'; })());

  const drift = { serverRows: srvHistory(endTs, 30, { crypto: 55000, liquidity: 45000 },
                                                    { crypto: 85000, liquidity: 15000 }),
                  rows: inv([100000, 100000, 100000, 100000, 100000, 100000]),
                  assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS };
  const both = core(drift, { ranges: ['7D', '30D'] });
  const cryptoFacts = both.ledger.facts.filter(f => /^exposure_drift_crypto_/.test(f.semanticKey));
  const cryptoFindings = both.findings.filter(f => f.rootCause === 'category_mix');
  ok('5.5 la MISMA deriva medida por 7D y 30D produce varios hechos pero UN SOLO hallazgo',
    cryptoFacts.length >= 2 && cryptoFindings.length === 1,
    JSON.stringify({ facts: cryptoFacts.length, findings: cryptoFindings.length }));
  ok('5.6 y el hallazgo conserva LAS DOS ventanas como dato, no como dos hallazgos',
    cryptoFindings.length === 1 && cryptoFindings[0].windows.length >= 2,
    JSON.stringify(cryptoFindings[0] && cryptoFindings[0].windows.map(w => w.range)));
  ok('5.7 UNA RAÍZ CAUSAL ⇒ UN hallazgo: ninguna raíz aparece dos veces',
    (() => { const roots = both.findings.map(f => f.rootCause);
      return new Set(roots).size === roots.length; })(), JSON.stringify(both.findings.map(f => f.rootCause)));
  ok('5.8 cada hallazgo lleva identidad, clase de evento, evidencia y procedencia',
    both.findings.length > 0 && both.findings.every(f => !!f.findingId && !!f.eventClass
      && !!f.provenance && Object.prototype.hasOwnProperty.call(f, 'evidence')));
  ok('5.9 un hecho cuya evidencia NO pasa la puerta no puede entrar en el conjunto canónico',
    (() => { // epoch DENTRO de las dos ventanas: ninguna puede comparar extremos
      const blocked = core(Object.assign({}, drift, { epoch: endTs - 3 * DAY }), { ranges: ['7D', '30D'] });
      return !blocked.findings.some(f => f.rootCause === 'category_mix'); })());
  ok('5.9b un epoch que sólo invalida la ventana LARGA no silencia a la corta (la puerta es por ventana)',
    (() => { const partial = core(Object.assign({}, drift, { epoch: endTs - 10 * DAY }), { ranges: ['7D', '30D'] });
      const keys = partial.ledger.facts.filter(f => /^exposure_drift_crypto_/.test(f.semanticKey))
        .map(f => f.window.range);
      return keys.indexOf('7D') !== -1 && keys.indexOf('30D') === -1; })());
  ok('5.10 sin nada material, el conjunto está VACÍO — y un contador no puede afirmar un número',
    (() => { const quiet = core({ rows: inv([100000, 100000, 100000]), assets: BTC_ETH_CASH,
        snap: SNAP, drivers: DRIVERS, serverRows: [] });
      return Array.isArray(quiet.findings) && quiet.findings.length === 0; })());
  ok('5.11 los estados (nivel, máximo) NO son hallazgos de cambio',
    both.findings.every(f => f.semanticKey !== 'investable_level' && f.semanticKey !== 'investable_all_time_high'));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · AISLAMIENTO, EPOCH SERVER-AUTHORITATIVE Y FORMA DEL DESPLIEGUE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · El epoch es de la CUENTA, y nada de esto puede filtrarse entre cuentas:');
{
  ok('6.1 el epoch efectivo es `max(server, local)`: un epoch local NUNCA retrocede',
    /Math\.max\(local > 0 \? local : 0, remote > 0 \? remote : 0\)/.test(fnSrc('_aurixPortfolioEpoch')));
  ok('6.2 sin columna en el servidor el remoto vale 0 ⇒ comportamiento IDÉNTICO al de hoy',
    /let _aurixRemotePortfolioEpochMs = 0;/.test(app));
  ok('6.3 la columna nueva sólo se ESCRIBE si una lectura demostró que existe (o el upsert entero falla)',
    /_aurixEpochColumnSeen\) \{/.test(app) && /hasOwnProperty\.call\(remoteRow, 'portfolio_epoch_ms'\)/.test(app));
  ok('6.4 y entra en el desnudado defensivo del upsert, con el núcleo financiero a salvo',
    /portfolio_epoch_ms, portfolio_epoch_updated_at,[\s\S]{0,120}\.\.\.core \} = payload/.test(app));
  ok('6.4b el epoch REMOTO se reinicia al cambiar de cuenta (vive a nivel de módulo y sobrevivía a la purga)',
    (() => { const src = fnSrc('_aurixEnforceCacheOwner');
      return /_aurixRemotePortfolioEpochMs = 0;/.test(src)
        && /_aurixEpochColumnSeen = false;/.test(src)
        && /_aurixLineageColumnSeen = false;/.test(src); })(),
    fnSrc('_aurixEnforceCacheOwner').slice(-400));
  ok('6.4c un epoch FUTURO no es autoridad: se ignora (un reloj adelantado ocultaría toda la historia)',
    /_re <= _nowMs \+ 6 \* 3600000/.test(app));
  ok('6.5 el mapa de buckets y la bitácora de linaje son claves POR USUARIO (se purgan al cambiar de cuenta)',
    /'aurix_asset_bucket_map_v1', 'aurix_asset_lineage_v1'/.test(app));
  ok('6.6 el observador de linaje corre en la entrada UNIVERSAL de persistencia, una sola vez',
    (() => { const src = fnSrc('save');
      return /_aurixObserveClassificationLineage/.test(src)
        && (app.match(/_aurixObserveClassificationLineage\(\)/g) || []).length <= 3; })());
  ok('6.7 la PRIMERA observación sella cobertura y NO emite ningún cambio (no fabrica reclasificaciones)',
    (() => { const c = makeCtx({});
      // sin mapa previo, la primera pasada no puede producir diferencias
      return /if \(!prev \|\| typeof prev !== 'object'\)/.test(fnSrc('_aurixObserveClassificationLineage')); })());
  ok('6.8 el SQL de U1 es ADITIVO: ni DROP de tabla/columna, ni DELETE, ni política de borrado',
    (() => { const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'advanced_intelligence_u1_1.sql'), 'utf8');
      const stripped = sql.replace(/^\s*--.*$/gm, '');
      return !/drop\s+table/i.test(stripped) && !/drop\s+column/i.test(stripped)
        && !/\bdelete\s+from\b/i.test(stripped) && !/for\s+delete/i.test(stripped)
        && /add column if not exists/i.test(stripped); })());
  ok('6.9 U1 no crea NINGUNA tabla nueva (así el riesgo de privilegios por defecto de `anon` no existe)',
    (() => { const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'advanced_intelligence_u1_1.sql'), 'utf8');
      return !/create\s+table/i.test(sql.replace(/^\s*--.*$/gm, '')); })());
  ok('6.10 y no toca el histórico de snapshots ni reinterpreta ninguna fila legacy',
    (() => { const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'advanced_intelligence_u1_1.sql'), 'utf8');
      const stripped = sql.replace(/^\s*--.*$/gm, '');
      return !/portfolio_snapshots/i.test(stripped) && !/update\s+public\./i.test(stripped); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · FORMAS DE CARTERA — la puerta no puede romper lo que ya funcionaba
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Las formas de cartera del contrato siguen respondiendo:');
{
  const base = { snap: SNAP, drivers: DRIVERS };
  const shapes = {
    'cuenta nueva': Object.assign({}, base, { rows: [], assets: [], snap: null, serverRows: [] }),
    'una posición': Object.assign({}, base, { rows: inv([10000, 10000]), assets: [A('btc','crypto',1,10000)], serverRows: [] }),
    'BTC + ETH': Object.assign({}, base, { rows: inv([90000, 90000, 90000]),
      assets: [A('btc','crypto',1,60000), A('eth','crypto',10,3000)], serverRows: [] }),
    'BTC + ETH + liquidez': Object.assign({}, base, { rows: inv([100000, 100000, 100000]), assets: BTC_ETH_CASH, serverRows: [] }),
    'multiactivo': Object.assign({}, base, { rows: inv([100000, 101000, 102000]),
      assets: [A('btc','crypto',1,25000), A('aapl','stock',100,250), A('vwce','etf',200,125),
               A('au','metal',10,2500), A('eur','cash',25000,1)], serverRows: [] }),
    'concentrada': Object.assign({}, base, { rows: inv([100000, 100000, 100000]),
      assets: [A('btc','crypto',1,95000), A('eur','cash',5000,1)], serverRows: [] }),
    'liquidez cero': Object.assign({}, base, { rows: inv([100000, 100000, 100000]),
      assets: [A('btc','crypto',1,100000)], serverRows: [] }),
    'historia corta': Object.assign({}, base, { rows: inv([100000]), assets: BTC_ETH_CASH, serverRows: [] }),
  };
  Object.keys(shapes).forEach(name => {
    let out = null, threw = null;
    try { out = core(shapes[name]); } catch (e) { threw = e && e.message; }
    ok('7 · «' + name + '» produce un contrato válido sin lanzar',
      !threw && !!out && Array.isArray(out.ledger.facts) && Array.isArray(out.findings), threw || '');
  });
  ok('7.9 ningún hallazgo aparece con evidencia fallida en ninguna de las formas',
    Object.keys(shapes).every(n => core(shapes[n]).findings.every(f => !f.evidence || f.evidence.ok === true)));
  ok('7.10 y FX: una cartera en EUR no cambia la estructura del contrato',
    (() => { const eur = core(Object.assign({}, shapes['multiactivo'], { baseCurrency: 'EUR' }));
      return Array.isArray(eur.findings) && eur.ledger.facts.length > 0; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · SPEC LIFECYCLE · DERIVA ESTRUCTURAL DE MERCADO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · Cuando la cripto sube, la liquidez no ha bajado:');
{
  const endTs = NOW;
  // El caso canónico: liquidez 10.000 QUIETA, cripto 30.000 → 60.000, cero flujos.
  const drift = (flows) => core({
    serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                     { crypto: 60000, liquidity: 10000 }),
    rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS,
    flows: flows || [] }, { ranges: ['7D'] });
  const base = drift();
  const cash = base.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
  const cry  = base.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
  ok('8.1 el importe absoluto de la liquidez NO se movió, y el hecho lo publica',
    !!cash && cash.values.startValue === 10000 && cash.values.endValue === 10000
    && cash.values.absoluteDirection === 'flat', JSON.stringify(cash && cash.values));
  ok('8.2 su PESO sí cayó, del 25 % al 14 % (dos hechos distintos, no uno)',
    !!cash && Math.round(cash.values.startPct) === 25 && Math.round(cash.values.endPct) === 14,
    JSON.stringify(cash && { s: cash.values.startPct, e: cash.values.endPct }));
  ok('8.3 se marca como DILUCIÓN PURA por el bucket que creció',
    !!cash && cash.values.dilutedBy === 'crypto' && cash.values.dilutionKind === 'pure');
  ok('8.4 y deja de ser un cambio «suyo»: la causa no se le atribuye al usuario',
    !!cash && cash.values.causeKnown === false && cash.values.cause === null);
  ok('8.5 la concentración sube: la cripto pasa del 75 % al 85 %',
    !!cry && Math.round(cry.values.startPct) === 75 && Math.round(cry.values.endPct) === 86,
    JSON.stringify(cry && { s: cry.values.startPct, e: cry.values.endPct }));
  ok('8.6 UNA CAUSA, UNA LECTURA PRIMARIA: el hecho diluido adopta la raíz del motor',
    !!cash && !!cry && cash.causalRoot === cry.causalRoot);
  ok('8.7 …y por tanto UN SOLO hallazgo, no tres avisos de lo mismo',
    base.findings.filter(f => f.rootCause === (cry && cry.causalRoot)).length === 1,
    JSON.stringify(base.findings.map(f => f.rootCause)));
  ok('8.8 sin ningún evento del usuario en la ventana, la atribución a MERCADO se certifica',
    !!cry && cry.values.marketAttributed === true && cry.eventClass === 'market_driven');
  // ── RE-DECIDIDO TRAS REVISIÓN ────────────────────────────────────────────
  // La regla anterior («cualquier flujo borra la atribución de mercado») era a la
  // vez demasiado gruesa y mal dirigida: un depósito de liquidez anulaba «el
  // importe de la cripto pasó de 30.000 a 60.000», que son dos extremos observados
  // directamente, y NO gateaba la única frase que de verdad afirma causalidad.
  // Ahora la atribución es POR BUCKET y la licencia de CAUSA ÚNICA es aparte.
  ok('8.9 un depósito de liquidez NO borra la atribución de mercado del bucket que creció',
    (() => { const d2 = drift([{ id: 'd1', ts: endTs - 3 * DAY, amountUSD: 5000,
        kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 }]);
      const c2 = d2.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      return !!c2 && c2.values.marketAttributed === true; })(),
    JSON.stringify((() => { const d2 = drift([{ id: 'd1', ts: endTs - 3 * DAY, amountUSD: 5000,
        kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 }]);
      const c2 = d2.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      return c2 && c2.values; })()));
  ok('8.9b …pero SÍ retira la licencia de causa única: mover capital entre categorías es indescartable',
    (() => { const d2 = drift([{ id: 'd1', ts: endTs - 3 * DAY, amountUSD: 5000,
        kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 }]);
      const cash2 = d2.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return !!cash2 && cash2.values.causeLicensed === false; })());
  ok('8.9c un flujo que SÍ toca el bucket motor desmiente su atribución a mercado',
    (() => { const d3 = drift([{ id: 'b1', ts: endTs - 3 * DAY, amountUSD: 20000,
        kind: 'asset_add', source: 'user', intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 }]);
      const c3 = d3.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      return !!c3 && c3.values.marketAttributed === false && c3.eventClass === 'cause_unknown'; })());
  ok('8.9d un flujo INMATERIAL frente al crecimiento del denominador no desmiente nada',
    (() => { const d4 = drift([{ id: 'd2', ts: endTs - 3 * DAY, amountUSD: 200,
        kind: 'deposit', source: 'user', assetId: 'eur', revision: 1 }]);
      const c4 = d4.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      const cash4 = d4.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return !!c4 && c4.values.marketAttributed === true && !!cash4 && cash4.values.causeLicensed === true; })());
  ok('8.9e sin completitud DEMOSTRABLE del ledger no se atribuye nada a mercado',
    (() => { const d5 = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                         { crypto: 60000, liquidity: 10000 }),
        rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS,
        flows: [], flowsComplete: false }, { ranges: ['7D'] });
      const c5 = d5.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      const cash5 = d5.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return !!c5 && c5.values.marketAttributed === false
        && !!cash5 && cash5.values.causeLicensed === false; })());
  // 8.10 anterior era VACÍA: en esta fixture la ventana siempre es `ok`, así que
  // `absoluteDirection === null` no ocurría nunca y la aserción era `undefined ||
  // …` ⇒ siempre verdadera. Se sustituye por el invariante que sí se puede fallar:
  // sin los importes no puede existir la marca de dilución EN NINGÚN hecho.
  ok('8.10 la marca de dilución sólo existe donde hay importes en los dos extremos',
    base.ledger.facts.filter(x => /drift/.test(x.semanticKey))
      .every(x => x.values.dilutedBy === undefined || x.values.absoluteDirection !== null));
  // ── EL MOTOR SE ELIGE POR IMPORTE, NO POR PESO ───────────────────────────
  // El selector anterior tomaba `max(deltaPp)` entre los que SUBIERON DE PESO, y
  // eso excluye por construcción al mayor contribuyente absoluto cuando su propio
  // peso cae. Aquí las acciones aportan +45.000 con el peso BAJANDO del 50 % al
  // 47,5 %, y la cripto +30.000 con +10 pp: la vieja regla decía «porque la cripto
  // ha crecido» cuando la mayor parte del crecimiento fue de acciones.
  ok('8.11 el motor es el del mayor IMPORTE aportado, aunque su propio peso caiga',
    (() => { const d = core({
        serverRows: srvHistory(endTs, 7, { stock: 50000, crypto: 10000, liquidity: 10000 },
                                         { stock: 95000, crypto: 40000, liquidity: 10000 }),
        rows: inv([70000, 90000, 120000, 145000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'] });
      const cash = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return !!cash && cash.values.dilutedBy === 'stock'; })(),
    JSON.stringify((() => { const d = core({
        serverRows: srvHistory(endTs, 7, { stock: 50000, crypto: 10000, liquidity: 10000 },
                                         { stock: 95000, crypto: 40000, liquidity: 10000 }),
        rows: inv([70000, 90000, 120000, 145000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'] });
      const c = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return c && { dilutedBy: c.values.dilutedBy, licensed: c.values.causeLicensed }; })()));
  ok('8.12 con dos motores indistinguibles no se nombra ninguno (no hay causa única)',
    (() => { const d = core({
        serverRows: srvHistory(endTs, 7, { stock: 20000, crypto: 20000, liquidity: 10000 },
                                         { stock: 35000, crypto: 35000, liquidity: 10000 }),
        rows: inv([50000, 60000, 70000, 80000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'] });
      const cash = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      const drv = d.ledger.facts.find(f => Number.isFinite(Number(f.values && f.values.driverUnique))
        || (f.values && f.values.driverUnique !== undefined));
      return !!cash && cash.values.causeLicensed === false
        && (!drv || drv.values.driverUnique === false); })(),
    JSON.stringify((() => { const d = core({
        serverRows: srvHistory(endTs, 7, { stock: 20000, crypto: 20000, liquidity: 10000 },
                                         { stock: 35000, crypto: 35000, liquidity: 10000 }),
        rows: inv([50000, 60000, 70000, 80000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'] });
      const c = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return c && c.values; })()));
  ok('8.12b un segundo motor con CUOTA material rompe la causa única (48,8 % del crecimiento)',
    (() => { const d = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, stock: 30000, liquidity: 10000 },
                                         { crypto: 45350, stock: 44650, liquidity: 10000 }),
        rows: inv([70000, 80000, 90000, 100000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'] });
      const cash = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      // La diferencia entre los dos motores es 700 sobre un crecimiento de 30.000
      // (tolerancia 600), así que la regla ANTERIOR —por diferencia— habría dado
      // causa única. Por CUOTA no: el segundo aportó el 48,8 %.
      return !!cash && cash.values.causeLicensed === false; })(),
    JSON.stringify((() => { const d = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, stock: 30000, liquidity: 10000 },
                                         { crypto: 45350, stock: 44650, liquidity: 10000 }),
        rows: inv([70000, 80000, 90000, 100000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'] });
      const c = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return c && { dilutedBy: c.values.dilutedBy, licensed: c.values.causeLicensed }; })()));
  ok('8.13 y la copy NO nombra causa cuando no hay licencia (ni dice que no fue tu decisión)',
    (() => { const d = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                         { crypto: 60000, liquidity: 10000 }),
        rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS,
        flows: [{ id: 'd1', ts: endTs - 3 * DAY, amountUSD: 5000, kind: 'deposit',
                  source: 'user', assetId: 'eur', revision: 1 }] }, { ranges: ['7D'] });
      const cash = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      const txt = run('_intv4FactText(' + JSON.stringify(cash) + ')', makeCtx({}));
      const why = run('_intv4WhyText(' + JSON.stringify(cash) + ')', makeCtx({}));
      return !/porque/i.test(txt) && !/decisi[oó]n tuya/i.test(why)
        && /no ha bajado/i.test(txt); })(),
    JSON.stringify((() => { const d = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                         { crypto: 60000, liquidity: 10000 }),
        rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS,
        flows: [{ id: 'd1', ts: endTs - 3 * DAY, amountUSD: 5000, kind: 'deposit',
                  source: 'user', assetId: 'eur', revision: 1 }] }, { ranges: ['7D'] });
      const cash = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      return run('_intv4FactText(' + JSON.stringify(cash) + ')', makeCtx({})); })()));
  ok('8.14 con licencia SÍ se nombra, y la frase de reparto vuelve a ser publicable',
    (() => { const cash = base.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
      const txt = run('_intv4FactText(' + JSON.stringify(cash) + ')', makeCtx({}));
      return cash.values.causeLicensed === true && /porque/i.test(txt); })(),
    JSON.stringify(run('_intv4FactText(' + JSON.stringify(
      base.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D')) + ')', makeCtx({}))));
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · SPEC LIFECYCLE · PÉRDIDA CONTRA COSTE — Y LAS TRES QUE NO SON ELLA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · «He perdido un 30 %» son cuatro cosas distintas:');
{
  const POS = (id, type, qty, price, cost) => {
    const a = A(id, type, qty, price); if (cost != null) a.costBasis = cost; return a;
  };
  const lossCtx = (assets, snapOver) => core({ rows: inv([100000, 100000, 100000]),
    assets: assets, snap: Object.assign({}, SNAP, snapOver || {}), drivers: DRIVERS, serverRows: [] });
  // Posición dominante: 45.000 de 100.000, un 50 % por debajo de coste.
  const dominant = [POS('btc', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)];
  const r1 = lossCtx(dominant, { totUSD: 100000 });
  const f1 = r1.ledger.facts.find(f => /^position_below_cost_btc$/.test(f.semanticKey));
  ok('9.1 con coste certificado se publica la pérdida CONTRA COSTE, con su peso',
    !!f1 && Math.round(f1.value) === -50 && Math.round(f1.values.weightPct) === 45,
    JSON.stringify(f1 && f1.values));
  ok('9.2 y declara contra QUÉ se mide, para que no se lea como la caída de un periodo',
    !!f1 && f1.values.basis === 'user_recorded_acquisition_cost'
    && f1.note === 'loss_vs_certified_cost_not_period_decline'
    && f1.causalRoot === 'position_result');
  ok('9.3 dice explícitamente lo que NO sabe: duración y divisa',
    !!f1 && f1.values.durationKnown === false && f1.values.fxAttributed === false);
  ok('9.4 SIN coste registrado no hay afirmación de pérdida, hay HUECO',
    (() => { const r = lossCtx([A('btc', 'crypto', 1, 45000), POS('eur', 'cash', 55000, 1, 55000)],
        { totUSD: 100000 });
      return !r.ledger.facts.some(f => /^position_below_cost_/.test(f.semanticKey))
        && r.ledger.gaps.some(g => g.semanticKey === 'position_below_cost'
             && g.reason === 'missing_cost_basis'); })());
  ok('9.5 la caída de un PERIODO por posición se declara no soportada (no hay historia por activo)',
    r1.ledger.gaps.some(g => g.semanticKey === 'position_period_decline'
      && g.status === 'not_yet_supported'));
  ok('9.6 el DRAWDOWN desde máximo se declara de CARTERA, no de posición',
    r1.ledger.gaps.some(g => g.semanticKey === 'position_drawdown_from_peak'
      && g.reason === 'peak_is_portfolio_level_only'));
  ok('9.7 la parte de DIVISA se declara no soportada (no se guarda el cambio del día de compra)',
    r1.ledger.gaps.some(g => g.semanticKey === 'position_fx_attribution'
      && g.reason === 'purchase_date_fx_rate_not_stored'));
  ok('9.8 la pérdida REALIZADA se declara, y no se agrega sin owner certificado',
    (() => { const a = POS('btc', 'crypto', 1, 45000, 90000); a.realizedPnL = -1200;
      const r = lossCtx([a, POS('eur', 'cash', 55000, 1, 55000)], { totUSD: 100000 });
      return r.ledger.gaps.some(g => g.semanticKey === 'position_realised_loss'
        && g.status === 'not_yet_supported'); })());
  // EL ORDEN QUE PEDÍA EL CONTRATO: un −50 % en el 1 % no puede dominar.
  ok('9.9 un −50 % en una posición del 1 % NO se publica (por debajo del suelo de participación)',
    (() => { const r = lossCtx([POS('x', 'stock', 1, 1000, 2000), POS('eur', 'cash', 99000, 1, 99000)],
        { totUSD: 100000 });
      return !r.ledger.facts.some(f => /^position_below_cost_x$/.test(f.semanticKey)); })());
  // Toleraba que el comparando NO existiera, y comparaba `materiality` en vez de la
  // `priority` compuesta que es la que ordena la superficie. Ahora exige los DOS
  // hechos y compara lo que de verdad decide el orden.
  ok('9.10 …y un −25 % en una del 45 % gana en PRIORIDAD a un −50 % en una pequeña',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 45000, 60000),
        POS('y', 'stock', 1, 2500, 5000), POS('eur', 'cash', 52500, 1, 52500)], { totUSD: 100000 });
      const big = r.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      const small = r.ledger.facts.find(f => f.semanticKey === 'position_below_cost_y');
      return !!big && !!small && big.priority > small.priority
        && big.materiality > small.materiality && small.magnitude > big.magnitude; })(),
    JSON.stringify((() => { const r = lossCtx([POS('btc', 'crypto', 1, 45000, 60000),
        POS('y', 'stock', 1, 2500, 5000), POS('eur', 'cash', 52500, 1, 52500)], { totUSD: 100000 });
      return r.ledger.facts.filter(f => /^position_below_cost_/.test(f.semanticKey))
        .map(f => f.semanticKey + ':p=' + f.priority + ',m=' + f.materiality); })()));
  ok('9.11 un movimiento por debajo del suelo de rendimiento declarado no es noticia',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 49700, 50000),
        POS('eur', 'cash', 50300, 1, 50300)], { totUSD: 100000 });
      return !r.ledger.facts.some(f => /^position_below_cost_/.test(f.semanticKey)); })());
  // ── DECISIÓN DE PRODUCTO DEL FOUNDER · RE-DECIDIDO ──────────────────────
  // La identidad de episodio era un CUBO DE 1 pp, y con eso una pérdida que se
  // mueve despacio —−25 % → −26 % → −27 %— reaparecía en cada paso después de que
  // el usuario la hubiera dado por vista. Medir con la unidad correcta y REABRIR
  // con ella son dos cosas distintas. El episodio pasa a ser un NIVEL DE
  // SEVERIDAD sobre la parte del patrimonio que la pérdida representa, con las dos
  // fronteras ya declaradas (`flowShareOfValue` 2 %, `concentrationPct` 25 %).
  ok('9.12 −52 % y −53 % son el MISMO episodio (mismo nivel de severidad)',
    (() => { const a = lossCtx([POS('btc', 'crypto', 1, 48000, 100000), POS('eur', 'cash', 52000, 1, 52000)], { totUSD: 100000 });
      const b = lossCtx([POS('btc', 'crypto', 1, 47500, 100000), POS('eur', 'cash', 52500, 1, 52500)], { totUSD: 100000 });
      const fa = a.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      const fb = b.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      return !!fa && !!fb && fa.eventId === fb.eventId
        && fa.values.severityTier === fb.values.severityTier; })());
  ok('9.13 …y un NIVEL DE SEVERIDAD materialmente nuevo sí es un episodio nuevo',
    (() => { // 10 % del patrimonio (material) → 30 % (estructural), con el IMPORTE real
      const a = lossCtx([POS('btc', 'crypto', 1, 45000, 55000), POS('eur', 'cash', 55000, 1, 55000)], { totUSD: 100000 });
      const b = lossCtx([POS('btc', 'crypto', 1, 45000, 75000), POS('eur', 'cash', 55000, 1, 55000)], { totUSD: 100000 });
      const fa = a.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      const fb = b.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      return !!fa && !!fb && fa.values.severityTier === 'material'
        && fa.values.recordedLossBase === 10000 && fa.values.lossShareOfWealthPct === 10
        && fb.values.severityTier === 'structural'
        && fb.values.recordedLossBase === 30000 && fb.values.lossShareOfWealthPct === 30
        && fa.eventId !== fb.eventId; })(),
    JSON.stringify([
      (lossCtx([POS('btc', 'crypto', 1, 45000, 55000), POS('eur', 'cash', 55000, 1, 55000)], { totUSD: 100000 })
        .ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc') || {}).values,
      (lossCtx([POS('btc', 'crypto', 1, 45000, 75000), POS('eur', 'cash', 55000, 1, 55000)], { totUSD: 100000 })
        .ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc') || {}).values]));
  ok('9.13b y un deterioro CONTINUADO dentro del mismo nivel NO crea episodio (−25 → −26 → −27)',
    (() => { const at = (px) => { const r = lossCtx([POS('btc', 'crypto', 1, px, Math.round(px / 0.75)),
        POS('eur', 'cash', 100000 - px, 1, 100000 - px)], { totUSD: 100000 });
      return r.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc'); };
      const a = at(45000), b = at(44550), c = at(44100);   // ≈ −25 %, −26 %, −27 %
      return !!a && !!b && !!c && a.eventId === b.eventId && b.eventId === c.eventId; })(),
    JSON.stringify([45000, 44550, 44100].map(px => { const r = lossCtx([POS('btc', 'crypto', 1, px, Math.round(px / 0.75)),
        POS('eur', 'cash', 100000 - px, 1, 100000 - px)], { totUSD: 100000 });
      const f = r.ledger.facts.find(x => x.semanticKey === 'position_below_cost_btc');
      return f && f.eventId; })));
  ok('9.13c una acción MATERIAL del usuario sobre la posición sí es un estado nuevo (reabre una vez)',
    (() => { const base = lossCtx([POS('btc', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)], { totUSD: 100000 });
      const acted = core({ rows: inv([100000, 100000, 100000]),
        assets: [POS('btc', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)],
        snap: Object.assign({}, SNAP, { totUSD: 100000 }), drivers: DRIVERS, serverRows: [],
        flows: [{ id: 'b1', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add', source: 'user',
                  intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 }] });
      const fa = base.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      const fb = acted.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
      return !!fa && !!fb && fa.values.lastMaterialAction === null
        && fb.values.lastMaterialAction === 'b1'
        && fa.eventId !== fb.eventId; })());
  ok('9.14 una RECUPERACIÓN completa retira la afirmación (no queda un aviso huérfano)',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 120000, 90000), POS('eur', 'cash', 10000, 1, 10000)],
        { totUSD: 130000 });
      return !r.ledger.facts.some(f => /^position_below_cost_/.test(f.semanticKey)); })());
  ok('9.15 comprar más durante la caída no fabrica una pérdida distinta: sigue siendo coste vs valor',
    (() => { const a = POS('btc', 'crypto', 2, 45000, 180000);   // promedió comprando más
      const r = lossCtx([a, POS('eur', 'cash', 10000, 1, 10000)], { totUSD: 100000 });
      const f = r.ledger.facts.find(x => x.semanticKey === 'position_below_cost_btc');
      return !!f && f.values.basis === 'user_recorded_acquisition_cost'; })());
  // La anterior era VACÍA: `_aurixEvidence` escribe `epoch` SIEMPRE, así que
  // `hasOwnProperty` no podía fallar y no afirmaba nada sobre aislamiento. Lo que
  // sí se puede fallar es que la puerta pueda CERRARSE en este hecho — que era el
  // otro defecto: sin extremos, `ok` era true por construcción.
  // Era un regex sobre el fuente —el patrón que venía a retirar—. Se ejecuta la
  // puerta: sin extremos NO pasa, que es el invariante que hacía falta.
  ok('9.16 la puerta de este hecho PUEDE cerrarse: sin extremos no autoriza',
    (() => { const c = makeCtx({});
      const okEv = run('_aurixEvidence({ source: "computePositionPerformance",'
        + ' observationClass: "declared", baseline: { at: null, value: 100 },'
        + ' comparison: { at: null, value: 50 }, requireEndpoints: true })', c);
      const noEv = run('_aurixEvidence({ source: "computePositionPerformance",'
        + ' observationClass: "declared", requireEndpoints: true })', c);
      const gapped = run('_aurixEvidence({ source: "computePositionPerformance",'
        + ' observationClass: "declared", baseline: { at: null, value: 100 },'
        + ' comparison: { at: null, value: 50 }, requireEndpoints: true,'
        + ' extraGaps: [_AURIX_EV_GAP.DENOMINATOR_PARTIAL] })', c);
      return okEv.ok === true && noEv.ok === false && gapped.ok === false
        && gapped.gaps.indexOf('investable_denominator_partial') !== -1; })());
  ok('9.16b y su clase de observación es DECLARED, no DERIVED: el coste lo escribió el usuario',
    !!f1 && f1.evidence.observationClass === 'declared'
    && f1.values.basis === 'user_recorded_acquisition_cost',
    JSON.stringify(f1 && { c: f1.evidence.observationClass, b: f1.values.basis }));
  // Ni juicio, ni orden, ni inferencia sobre la persona.
  // El alcance es la COPY DE INTELLIGENCE, no el fichero entero: «Principiante»
  // existe en Ajustes y en el onboarding porque el usuario lo DECLARA de sí mismo,
  // y eso es legítimo. Lo prohibido es que Aurix lo AFIRME — inferir novato a
  // partir de una pérdida— y que ordene, juzgue o avergüence.
  ok('9.17 ninguna copy de Intelligence ordena vender, juzga la inversión ni infiere al inversor',
    (() => { const noComments = app.replace(/^\s*\/\/.*$/gm, '');
      const lines = noComments.split('\n')
        .filter(l => /^\s*(intel_|intv[0-9]*_|intcc_)[a-z0-9_]*\s*:/.test(l));
      const copy = lines.join('\n');
      return lines.length > 50
        && !/(?:deberías|deberías|debes|should)\s+(?:vender|sell|salir|reducir|reduce)/i.test(copy)
        && !/mala inversión|bad investment|novato|novice|principiante|beginner/i.test(copy)
        && !/\bvende\b|\bsell now\b|\bpivota\b/i.test(copy); })(),
    String(app.replace(/^\s*\/\/.*$/gm, '').split('\n')
      .filter(l => /^\s*(intel_|intv[0-9]*_|intcc_)[a-z0-9_]*\s*:/.test(l)).length) + ' claves revisadas');
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · SPEC LIFECYCLE · DECAIMIENTO Y SEGURIDAD EMOCIONAL
// ════════════════════════════════════════════════════════════════════════════
console.log('\n10 · Un aviso material no puede volverse un reproche permanente:');
{
  const endTs = NOW;
  const shape = (acks) => core({
    serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                     { crypto: 60000, liquidity: 10000 }),
    rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
    { ranges: ['7D'], acknowledged: acks || {} });
  const before = shape();
  ok('10.1 un hallazgo nuevo nace NEW', before.findings.length > 0
    && before.findings.every(f => f.presentationState === 'new'),
    JSON.stringify(before.findings.map(f => f.presentationState)));
  const id = before.findings[0] && before.findings[0].episodeId;
  const after = shape({ [id]: { at: endTs, state: 'acknowledged' } });
  ok('10.2 dado por visto, DEJA de ocupar superficie (y por tanto de contar)',
    after.findings.length === before.findings.length - 1
    && !after.findings.some(f => f.episodeId === id),
    JSON.stringify({ before: before.findings.length, after: after.findings.length }));
  ok('10.3 pero el HECHO sigue intacto en el ledger: no se borra memoria financiera',
    after.ledger.facts.length === before.ledger.facts.length);
  ok('10.4 …y el conjunto completo lo sigue publicando, marcado como acusado',
    (after.findingsAll || []).some(f => f.episodeId === id
      && f.presentationState === 'acknowledged' && Number.isFinite(f.acknowledgedAt)));
  ok('10.5 REABRIR la app no lo reabre: mismos hechos ⇒ mismo episodio ⇒ sigue acusado',
    shape({ [id]: { at: endTs, state: 'acknowledged' } }).findings
      .every(f => f.episodeId !== id));
  ok('10.6 el paso del TIEMPO por sí solo tampoco',
    (() => { const later = run('_aurixIntelligenceCore(' + JSON.stringify({ now: NOW + 40 * DAY,
        ranges: ['7D'], acknowledged: { [id]: { at: endTs, state: 'acknowledged' } } }) + ')',
        makeCtx({ serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                                   { crypto: 60000, liquidity: 10000 }),
          rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS }));
      return later.findings.every(f => f.episodeId !== id); })());
  ok('10.7 el RUIDO dentro de la misma banda tampoco lo reabre',
    (() => { const noisy = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                         { crypto: 60600, liquidity: 10000 }),
        rows: inv([40000, 45000, 55000, 70600]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'], acknowledged: { [id]: { at: endTs, state: 'acknowledged' } } });
      return noisy.findings.every(f => f.episodeId !== id); })());
  ok('10.8 una EVIDENCIA materialmente nueva sí lo reabre, y como episodio NUEVO',
    (() => { const worse = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                         { crypto: 140000, liquidity: 10000 }),
        rows: inv([40000, 60000, 100000, 150000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'], acknowledged: { [id]: { at: endTs, state: 'acknowledged' } } });
      const same = worse.findings.filter(f => f.episodeId === id);
      const fresh = worse.findings.filter(f => f.rootCause === 'category_mix' && f.presentationState === 'new');
      return same.length === 0 && fresh.length === 1; })());
  ok('10.9 la PAUSA se refleja en el estado de presentación, sin tocar el hecho',
    (() => { const paused = core({
        serverRows: srvHistory(endTs, 7, { crypto: 30000, liquidity: 10000 },
                                         { crypto: 60000, liquidity: 10000 }),
        rows: inv([40000, 45000, 55000, 70000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'], pausedAt: endTs });
      return paused.findings.length > 0 && paused.findings.every(f => f.presentationState === 'paused'); })());
  ok('10.10 el acuse es IDEMPOTENTE para el MISMO episodio, y se EJECUTA para probarlo',
    (() => { const c = makeCtx({});
      const st = {}; c.__s10 = st;
      run('var __e10 = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s10, k) ? __s10[k] : null),'
        + ' setItem: (k, v) => { __s10[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e10, { now: 100, signature: "material:0" }))', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e10, { now: 999, signature: "material:0" }))', c);
      const r1 = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e10)', c);
      // Mismo episodio ⇒ no se re-sella. Episodio NUEVO ⇒ sustituye el registro.
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e10, { now: 1500, signature: "structural:0" }))', c);
      const r2 = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e10)', c);
      return r1.ack['pos:btc'].at === 100 && Object.keys(r1.ack).length === 1
        && r2.ack['pos:btc'].at === 1500 && r2.ack['pos:btc'].signature === 'structural:0'
        && Object.keys(r2.ack).length === 1; })());
  ok('10.11 y viaja entre dispositivos por el merge que ya existía, sin memoria nueva',
    /out\.ack\[k\] = \(x >= y\) \? ka\[k\] : kb\[k\];/.test(fnSrc('_aurixIntelCtxMerge')));
}

// ════════════════════════════════════════════════════════════════════════════
// 11 · La cartera plana EN SU MÁXIMO — cobertura que la revisión echó en falta
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// 12 · FRONTERAS, DIVISA, DENOMINADOR Y REVERSIÓN — lo que la revisión echó en falta
// ════════════════════════════════════════════════════════════════════════════
console.log('\n12 · Fronteras exactas y los casos que no estaban cubiertos:');
{
  const POS = (id, type, qty, price, cost, cur) => {
    const a = A(id, type, qty, price, cur); if (cost != null) a.costBasis = cost; return a;
  };
  const lossCtx = (assets, tot) => core({ rows: inv([100000, 100000, 100000]),
    assets: assets, snap: Object.assign({}, SNAP, { totUSD: tot }), drivers: DRIVERS, serverRows: [] });
  const has = (r, id) => r.ledger.facts.some(f => f.semanticKey === 'position_below_cost_' + id);

  // ── SUELO DE RENDIMIENTO: 0,99 / 1,00 / 1,01 ────────────────────────────
  const atPct = (pct) => { const cost = 100000, val = Math.round(cost * (1 - pct / 100));
    return lossCtx([POS('p', 'crypto', 1, val, cost), POS('eur', 'cash', 100000 - val, 1, 100000 - val)], 100000); };
  ok('12.1 justo por DEBAJO del suelo de rendimiento declarado: no es noticia', !has(atPct(0.99), 'p'));
  ok('12.2 justo EN el suelo: sí lo es', has(atPct(1.0), 'p'));
  ok('12.3 justo por ENCIMA: sí lo es', has(atPct(1.01), 'p'));

  // ── SUELO DE PARTICIPACIÓN: 1,99 % / 2,00 % / 2,01 % ────────────────────
  const atWeight = (w) => { const tot = 1000000, val = Math.round(tot * w);
    return lossCtx([POS('p', 'crypto', 1, val, val * 2), POS('eur', 'cash', tot - val, 1, tot - val)], tot); };
  ok('12.4 justo por DEBAJO del suelo de participación: una posición diminuta no domina', !has(atWeight(0.0199), 'p'));
  ok('12.5 justo EN el suelo: se publica', has(atWeight(0.0200), 'p'));
  ok('12.6 justo por ENCIMA: se publica', has(atWeight(0.0201), 'p'));

  // ── F1 · IMPORTE EN DIVISA NO-USD ───────────────────────────────────────
  // `costBasis`/`absolutePnL` viven en la divisa NATIVA del activo. Se convertían
  // como si fueran USD, así que una acción en EUR publicaba su pérdida con la tasa
  // equivocada. Aquí 1 acción a 14.000 EUR con coste 20.000 EUR ⇒ −6.000 EUR, que
  // en USD son −6.000/0,92 ≈ −6.521,74.
  ok('12.7 el importe pasa por el conversor NATIVO antes de la divisa base',
    (() => { const r = lossCtx([POS('gb', 'stock', 1, 14000, 20000, 'EUR'),
        POS('usd', 'cash', 50000, 1, 50000)], 65217.39);
      const f = r.ledger.facts.find(x => x.semanticKey === 'position_below_cost_gb');
      return !!f && Math.abs(Math.abs(Number(f.values.absoluteBase)) - 6521.74) < 5; })(),
    JSON.stringify((() => { const r = lossCtx([POS('gb', 'stock', 1, 14000, 20000, 'EUR'),
        POS('usd', 'cash', 50000, 1, 50000)], 65217.39);
      const f = r.ledger.facts.find(x => x.semanticKey === 'position_below_cost_gb');
      return f && f.values.absoluteBase; })()));

  // ── F2 · DENOMINADOR PARCIAL ⇒ PESO NO PUBLICABLE ───────────────────────
  ok('12.8 una posición sin valorar deja el denominador PARCIAL y suprime el hecho',
    (() => { const bad = A('x', 'stock', 1, NaN);
      const r = lossCtx([POS('p', 'crypto', 1, 45000, 90000), bad], 45000);
      return !has(r, 'p'); })());
  // Las dos ramas eran siempre verdaderas. Lo que se exige es el hueco CONCRETO:
  // la supresión era MUDA, y una supresión que no se declara es indistinguible de
  // «aquí no había nada».
  ok('12.9 …y lo DECLARA: el denominador parcial emite su propio hueco',
    (() => { const bad = A('x', 'stock', 1, NaN);
      const r = lossCtx([POS('p', 'crypto', 1, 45000, 90000), bad], 45000);
      return r.ledger.gaps.some(g => g.semanticKey === 'position_below_cost'
        && g.reason === 'investable_denominator_partial'); })(),
    JSON.stringify((() => { const bad = A('x', 'stock', 1, NaN);
      const r = lossCtx([POS('p', 'crypto', 1, 45000, 90000), bad], 45000);
      return r.ledger.gaps.filter(g => /position/.test(g.semanticKey)).map(g => g.semanticKey + ':' + g.reason); })()));
  ok('12.9b y la frescura de precio por activo se declara NO certificada en vez de suponerse',
    (() => { const r = lossCtx([POS('p', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)], 100000);
      return r.ledger.gaps.some(g => g.semanticKey === 'position_price_freshness'
        && g.status === 'not_yet_supported'); })());
  ok('12.10 `uncertifiablePositions > 0` también cierra la puerta',
    (() => { const r = core({ rows: inv([100000, 100000, 100000]),
        assets: [POS('p', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)],
        snap: Object.assign({}, SNAP, { totUSD: 100000, uncertifiablePositions: 1 }),
        drivers: DRIVERS, serverRows: [] });
      return !has(r, 'p'); })());

  // ── un estado NO es un cambio ───────────────────────────────────────────
  ok('12.11 la pérdida contra coste NO entra en el contador de cambios (es un estado)',
    (() => { const r = lossCtx([POS('p', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)], 100000);
      return has(r, 'p') && !r.findings.some(f => /^position_below_cost_/.test(f.semanticKey)); })());

  // ── F12 · REVERSIÓN DE DIRECCIÓN ────────────────────────────────────────
  // La banda es el NIVEL. Sin la dirección en el id, una CAÍDA material hasta la
  // misma banda heredaba el acuse de una SUBIDA anterior y no se mostraba nunca.
  const endTs = NOW;
  const at = (a, b) => core({ serverRows: srvHistory(endTs, 7, a, b),
    rows: inv([100000, 100000, 100000, 100000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
    { ranges: ['7D'] });
  ok('12.12 una subida y una caída al MISMO nivel son episodios distintos',
    (() => { const up = at({ crypto: 55000, liquidity: 45000 }, { crypto: 85000, liquidity: 15000 });
      const down = at({ crypto: 95000, liquidity: 5000 }, { crypto: 85000, liquidity: 15000 });
      const fu = up.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      const fd = down.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
      return !!fu && !!fd && fu.eventId !== fd.eventId
        && /:up$/.test(fu.eventId) && /:down$/.test(fd.eventId); })(),
    JSON.stringify([
      (at({ crypto: 55000, liquidity: 45000 }, { crypto: 85000, liquidity: 15000 })
        .ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D') || {}).eventId,
      (at({ crypto: 95000, liquidity: 5000 }, { crypto: 85000, liquidity: 15000 })
        .ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D') || {}).eventId]));
  ok('12.13 …así que acusar la subida NO silencia la caída posterior',
    (() => { const up = at({ crypto: 55000, liquidity: 45000 }, { crypto: 85000, liquidity: 15000 });
      const upId = (up.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D') || {}).eventId;
      const down = core({ serverRows: srvHistory(endTs, 7, { crypto: 95000, liquidity: 5000 },
                                                            { crypto: 85000, liquidity: 15000 }),
        rows: inv([100000, 100000, 100000, 100000]), assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS },
        { ranges: ['7D'], acknowledged: { [upId]: { at: endTs, state: 'acknowledged' } } });
      return down.findings.some(f => f.rootCause === 'category_mix'); })());

  // ── F13 · ACUSAR UNA RAÍZ NO PUEDE SILENCIAR A UN HERMANO NO VISTO ──────
  // Estaba MUERTA: `findingsAll` también colapsa por raíz, así que `ids` tenía
  // siempre longitud 1 y el escape se disparaba SIEMPRE. Se toma la identidad de
  // los HECHOS, que es donde los dos episodios existen de verdad, y se ejecuta el
  // conjunto canónico directamente sobre el ledger — que es el owner del fix.
  ok('12.14 acusar un episodio no elimina otro episodio DISTINTO de la misma raíz',
    (() => { const c = makeCtx({});
      const mk = (id, band) => ({ semanticKey: 'position_below_cost_' + id,
        family: 'performance', causalRoot: 'position_result', unit: 'percent_of_cost',
        value: -10 * band, changeFact: true,
        window: { range: 'observed', startAt: NOW - DAY, endAt: NOW },
        eventId: 'st:position_result:' + id + '>' + band,
        materiality: band === 1 ? 0.45 : 0.20, novelty: 1, confidence: 1, values: {} });
      const ledger = { facts: [mk('btc', 1), mk('eth', 2)], gaps: [] };
      c.__l = ledger;
      const all = run('_aurixCanonicalFindings(__l, {})', c);
      if (all.length !== 1) return false;               // la raíz colapsa: uno primario
      const ackFirst = run('_aurixCanonicalFindings(__l, { acknowledged: { "'
        + all[0].episodeId + '": { at: 1, state: "acknowledged" } } })', c);
      // Con el primario acusado tiene que emerger el HERMANO, no el silencio.
      return ackFirst.length === 1 && ackFirst[0].episodeId !== all[0].episodeId; })(),
    JSON.stringify((() => { const c = makeCtx({});
      const mk = (id, band) => ({ semanticKey: 'position_below_cost_' + id,
        family: 'performance', causalRoot: 'position_result', unit: 'percent_of_cost',
        value: -10 * band, changeFact: true,
        window: { range: 'observed', startAt: NOW - DAY, endAt: NOW },
        eventId: 'st:position_result:' + id + '>' + band,
        materiality: band === 1 ? 0.45 : 0.20, novelty: 1, confidence: 1, values: {} });
      c.__l = { facts: [mk('btc', 1), mk('eth', 2)], gaps: [] };
      const a = run('_aurixCanonicalFindings(__l, {})', c);
      const b = run('_aurixCanonicalFindings(__l, { acknowledged: { "' + a[0].episodeId
        + '": { at: 1, state: "acknowledged" } } })', c);
      return { first: a.map(x => x.episodeId), afterAck: b.map(x => x.episodeId) }; })()));
  ok('12.15 …y el orden es el que lo consigue: filtrar acusados y LUEGO deduplicar',
    /const visible = out\.filter\(fd => o\.includeAcknowledged === true/.test(fnSrc('_aurixCanonicalFindings')));

  // ── F14/F15 · EJECUTADOS, no comprobados con regex ─────────────────────
  // ── RE-DECIDIDO · EL CUPO NUMÉRICO SE RETIRA ────────────────────────────
  // El tope desalojaba por antigüedad, así que el primero en volver a hablar era
  // justo el que el usuario llevaba más tiempo habiendo dado por visto. Y con
  // cubos de 1 pp el almacén crecía con cada movimiento de precio. Ahora hay UN
  // registro por CONCEPTO: el almacén está acotado por el número de posiciones y
  // raíces, no por el de movimientos, así que no hace falta cupo — y un acuse
  // VIGENTE no se puede perder por haber llegado a un número.
  ok('12.16 un CONCEPTO guarda un solo acuse, así que 100 episodios no hacen crecer el almacén',
    (() => { const c = makeCtx({});
      const store = {}; c.__s = store;
      run('var __e = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s, k) ? __s[k] : null),'
        + ' setItem: (k, v) => { __s[k] = String(v); }, removeItem: k => { delete __s[k]; } }, owner: "u1" };', c);
      // Cien episodios del MISMO concepto — lo que antes eran cien claves.
      for (let i = 0; i < 100; i++) {
        run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e, { now: ' + (1000 + i)
          + ', signature: "material:' + i + '" }))', c);
      }
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e)', c);
      return Object.keys(rec.ack).length === 1
        && rec.ack['pos:btc'].signature === 'material:99'
        && rec.ack['pos:btc'].at === 1099; })(),
    JSON.stringify((() => { const c = makeCtx({});
      const store = {}; c.__s = store;
      run('var __e = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s, k) ? __s[k] : null),'
        + ' setItem: (k, v) => { __s[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      for (let i = 0; i < 100; i++) run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e, { now: '
        + (1000 + i) + ', signature: "material:' + i + '" }))', c);
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e)', c);
      return { keys: Object.keys(rec.ack).length, sig: rec.ack['pos:btc'].signature }; })()));
  ok('12.16b y NINGÚN acuse vigente se desaloja por cupo (el tope numérico ya no existe)',
    !/_AURIX_INTEL_MEM_MAX_ENTRIES/.test(fnSrc('_aurixIntelAcknowledge')));
  ok('12.16c la RESOLUCIÓN sólo alcanza a lo que llega CERTIFICADO, y la lista vacía no resuelve nada',
    (() => { const c = makeCtx({});
      const store = {}; c.__s3 = store;
      run('var __e3 = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s3, k) ? __s3[k] : null),'
        + ' setItem: (k, v) => { __s3[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e3, { now: 10, signature: "material:0" }))', c);
      // LA LISTA VACÍA ES EL CASO PELIGROSO: antes significaba «nada apareció, así
      // que todo se resolvió», y una hidratación lenta borraba la línea base.
      const n0 = run('_aurixIntelResolveCertified([], Object.assign({}, __e3, { now: 20 }))', c);
      const rec0 = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e3)', c);
      // Con la prueba positiva del ledger sí se resuelve, y sólo ese concepto.
      run('_aurixIntelAcknowledge("pos:eth", Object.assign({}, __e3, { now: 30, signature: "material:0" }))', c);
      const n = run('_aurixIntelResolveCertified(["pos:btc"], Object.assign({}, __e3, { now: 40 }))', c);
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e3)', c);
      return n0 === 0 && rec0.ack['pos:btc'].state === 'acknowledged'
        && n === 1 && rec.ack['pos:btc'].state === 'resolved'
        && Number.isFinite(rec.ack['pos:btc'].resolvedAt)
        && rec.ack['pos:eth'].state === 'acknowledged'; })());
  ok('12.16d un registro RESUELTO deja de cubrir, así que el deterioro posterior habla',
    (() => { const c = makeCtx({});
      const mk = (sig) => ({ semanticKey: 'position_below_cost_btc', family: 'performance',
        causalRoot: 'position_result', unit: 'percent_of_cost', value: -30, changeFact: true,
        window: { range: 'observed', startAt: NOW - DAY, endAt: NOW },
        conceptId: 'pos:btc', episodeSignature: sig, eventId: 'pos:btc#' + sig,
        materiality: 0.45, novelty: 1, confidence: 1, values: {} });
      c.__l4 = { facts: [mk('material:0')], gaps: [] };
      const silent = run('_aurixCanonicalFindings(__l4, { acknowledged: { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "material:0" } } })', c);
      const afterResolve = run('_aurixCanonicalFindings(__l4, { acknowledged: { "pos:btc":'
        + ' { at: 1, state: "resolved", signature: "material:0" } } })', c);
      return silent.length === 0 && afterResolve.length === 1; })());
  // La versión anterior inyectaba `store`, y con `store` propio el push ya está
  // excluido por contrato (`!o.store`): `pushes === 0` se cumplía sin que la guarda
  // interviniera, así que quitarla no habría hecho fallar el test. Se ejercita SIN
  // `store` —sólo `owner`— y con las DOS ramas del estado remoto.
  ok('12.17 sin el tirón remoto resuelto NO se empuja, y el acuse queda pendiente',
    (() => { const c = makeCtx({});
      let pushes = 0;
      c.__count = () => { pushes++; };
      run('var _aurixIntelCtxPush = function () { __count(); };', c);
      run('var _aurixIntelCtxRemoteReady = function () { return false; };', c);
      const okw = run('_aurixIntelAcknowledge("ep:x", { owner: "u1", now: 5 })', c);
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, { owner: "u1" })', c);
      return okw === true && pushes === 0 && !!rec.ack['ep:x'] && rec.dirty === true; })(),
    'pushes con ready=false');
  ok('12.17b …y con el tirón resuelto SÍ se empuja exactamente una vez',
    (() => { const c = makeCtx({});
      let pushes = 0;
      c.__count = () => { pushes++; };
      run('var _aurixIntelCtxPush = function () { __count(); };', c);
      run('var _aurixIntelCtxRemoteReady = function () { return true; };', c);
      run('_aurixIntelAcknowledge("ep:y", { owner: "u1", now: 6 })', c);
      return pushes === 1; })());

  // ── la copy, en los DOS idiomas, con las cadenas de producción ──────────
  ok('12.18 las claves nuevas del ciclo de vida existen en ES y EN, sin texto vacío',
    (() => { const missing = LIFECYCLE_KEYS.filter(k => DICT.es[k] === undefined || DICT.en[k] === undefined);
      return missing.length === 0; })(),
    JSON.stringify(LIFECYCLE_KEYS.filter(k => DICT.es[k] === undefined || DICT.en[k] === undefined)));
  ok('12.19 la dilución se redacta SIN «bajó» en los dos idiomas',
    (() => { const f = { semanticKey: 'cash_drift_liquidity_7D', value: -10,
        values: { startPct: 25, endPct: 14, category: 'liquidity', dilutedBy: 'crypto',
                  dilutionKind: 'pure', causeLicensed: true }, window: { range: '7D' } };
      const es = run('_intv4FactText(' + JSON.stringify(f) + ')', makeCtx({ lang: 'es' }));
      const en = run('_intv4FactText(' + JSON.stringify(f) + ')', makeCtx({ lang: 'en' }));
      return es.length > 20 && en.length > 20 && !/bajó/i.test(es) && !/fallen:/.test(en.split('not')[0])
        && /no ha bajado/i.test(es) && /has not fallen/i.test(en); })(),
    JSON.stringify([run('_intv4FactText(' + JSON.stringify({ semanticKey: 'cash_drift_liquidity_7D', value: -10,
        values: { startPct: 25, endPct: 14, category: 'liquidity', dilutedBy: 'crypto',
                  dilutionKind: 'pure', causeLicensed: true }, window: { range: '7D' } }) + ')', makeCtx({ lang: 'en' }))]));
  ok('12.20 el importe de la pérdida lleva ETIQUETA y no se lee como el coste, en los dos idiomas',
    (() => { const pair = ['es', 'en'].map(L => String(DICT[L].intv4_f_pos_below_cost_amt('X', '50', '45', '1.000 €')));
      return pair.every(t => /diferencia de|difference of/i.test(t))
        && pair.every(t => !/coste de adquisición \(|acquisition cost \(/i.test(t)); })(),
    JSON.stringify(['es', 'en'].map(L => String(DICT[L].intv4_f_pos_below_cost_amt('X', '50', '45', '1.000 €')))));
  // Las claves de HUECO sí pueden nombrar «pérdida»: su trabajo es explicar la
  // distinción entre la caída de un periodo y la pérdida desde la compra. Lo que
  // no puede hacerlo es una AFIRMACIÓN, que es donde la palabra sería un salto.
  ok('12.21 ninguna AFIRMACIÓN nueva dice «pérdida» (los huecos sí pueden explicar la distinción)',
    (() => { const claims = LIFECYCLE_KEYS.filter(k => !/^intv4_gap_/.test(k));
      const all = claims.map(k => [DICT.es[k], DICT.en[k]]).flat().filter(v => typeof v === 'string');
      return !/\bp[eé]rdida\b/i.test(all.join(' ')) && !/\byou (?:have )?lost\b/i.test(all.join(' ')); })(),
    JSON.stringify(LIFECYCLE_KEYS.filter(k => !/^intv4_gap_/.test(k)
      && typeof DICT.es[k] === 'string' && /p[eé]rdida/i.test(DICT.es[k]))));
}

// ════════════════════════════════════════════════════════════════════════════
// 13 · PERÍMETRO DEL DOMINANTE Y RE-ELECCIÓN TRAS EL ACUSE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n13 · Las dos cosas que la revisión final encontró:');
{
  const POS = (id, type, qty, price, cost) => {
    const a = A(id, type, qty, price); if (cost != null) a.costBasis = cost; return a;
  };
  // ── EL DOMINANTE EXCLUYE LA LIQUIDEZ, como `topInvestedAsset` ───────────
  // Con la caja como fila MAYOR, el «dominante» calculado sin excluirla era el
  // efectivo ⇒ la pérdida de BTC volvía a llevar su cláusula de peso mientras
  // `top_position_weight` publicaba el mismo 45 %: la misma cifra dos veces.
  const cashHeavy = core({ rows: inv([100000, 100000, 100000]),
    assets: [POS('btc', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)],
    snap: Object.assign({}, SNAP, { totUSD: 100000,
      topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 45 } }),
    drivers: DRIVERS, serverRows: [] });
  const btcLoss = cashHeavy.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
  ok('13.1 con la CAJA como fila mayor, el dominante sigue siendo la posición invertible',
    !!btcLoss && btcLoss.values.isTopPosition === true,
    JSON.stringify(btcLoss && { isTop: btcLoss.values.isTopPosition, w: btcLoss.values.weightPct }));
  ok('13.2 …así que su frase NO repite el peso que publica la superficie de concentración',
    (() => { const txt = run('_intv4FactText(' + JSON.stringify(btcLoss) + ')', makeCtx({}));
      return txt.length > 10 && !/45\s*%/.test(txt) && /coste que registraste/.test(txt); })(),
    JSON.stringify(run('_intv4FactText(' + JSON.stringify(btcLoss) + ')', makeCtx({}))));

  // ── EL GEMELO POR DEBAJO DEL UMBRAL DE CONCENTRACIÓN ────────────────────
  // §13.2 inyecta `pctTotal: 45`, así que «no repite el peso» es correcto PORQUE
  // 45 ≥ 25. Sin este gemelo la aserción fosilizaría como contrato una limitación
  // de la fixture: con la mayor posición no-efectivo al 20 %, la superficie de
  // concentración NO publica nada y suprimir la cláusula haría desaparecer el peso
  // de todas las superficies — el peso, que es la materialidad de este hecho.
  const midBand = core({ rows: inv([100000, 100000, 100000]),
    assets: [POS('btc', 'crypto', 1, 20000, 28600), POS('eur', 'cash', 80000, 1, 80000)],
    snap: Object.assign({}, SNAP, { totUSD: 100000,
      topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 20 } }),
    drivers: DRIVERS, serverRows: [] });
  const midLoss = midBand.ledger.facts.find(f => f.semanticKey === 'position_below_cost_btc');
  ok('13.2b por debajo del umbral de concentración el peso SÍ se dice (nadie más lo publica)',
    !!midLoss && midLoss.values.isTopPosition === false
    && !midBand.ledger.facts.some(f => f.semanticKey === 'top_position_weight'),
    JSON.stringify(midLoss && { isTop: midLoss.values.isTopPosition, w: midLoss.values.weightPct }));
  ok('13.2c …y su frase lleva el peso, que es la razón por la que el hecho se publica',
    (() => { const txt = run('_intv4FactText(' + JSON.stringify(midLoss) + ')', makeCtx({}));
      return /20\s*%/.test(txt) && /coste que registraste/.test(txt); })(),
    JSON.stringify(run('_intv4FactText(' + JSON.stringify(midLoss) + ')', makeCtx({}))));
  ok('13.2d la confianza y el signo viajan con el apoyo (una promoción no hereda los del acusado)',
    /confidence: f\.confidence, positive: f\.positive/.test(fnSrc('_aurixIntelligenceStories')));

  // ── ACUSAR EL PRIMARIO NO SILENCIA A SU HERMANO, en la capa de HISTORIAS ─
  ok('13.3 acusar la historia primaria PROMUEVE a su hermano vivo en vez de borrar la raíz',
    (() => { const c = makeCtx({});
      const mk = (id, mat, band) => ({ semanticKey: 'position_below_cost_' + id,
        family: 'performance', causalRoot: 'position_result', unit: 'percent_of_cost',
        value: -10 * band, materiality: mat, magnitude: 0.5, confidence: 1, novelty: 1,
        priority: mat, direction: 'down', values: { name: id, weightPct: mat * 100 },
        window: { range: 'since_cost' }, conceptId: 'pos:' + id,
        episodeSignature: (band === 1 ? 'structural' : 'material') + ':0',
        eventId: 'pos:' + id + '#' + (band === 1 ? 'structural' : 'material') + ':0' });
      const core2 = { topStories: [Object.assign({}, mk('btc', 0.45, 1), {
        rootMateriality: 0.45, supporting: [mk('eth', 0.20, 2)] })], findings: [] };
      c.__c2 = core2;
      const withAck = run('_intv5MattersStories(__c2, [], null, { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "structural:0" } })', c);
      const without = run('_intv5MattersStories(__c2, [], null, {})', c);
      return without.stories.length === 1 && without.stories[0].semanticKey === 'position_below_cost_btc'
        && withAck.stories.length === 1
        && withAck.stories[0].semanticKey === 'position_below_cost_eth'
        && withAck.stories[0].causalRoot === 'position_result'
        && withAck.stories[0].promotedFrom === 'position_below_cost_btc'; })(),
    JSON.stringify((() => { const c = makeCtx({});
      const mk = (id, mat, band) => ({ semanticKey: 'position_below_cost_' + id,
        family: 'performance', causalRoot: 'position_result', unit: 'percent_of_cost',
        value: -10 * band, materiality: mat, magnitude: 0.5, confidence: 1, novelty: 1,
        priority: mat, direction: 'down', values: { name: id, weightPct: mat * 100 },
        window: { range: 'since_cost' }, eventId: 'st:position_result:' + id + '>' + band });
      c.__c2 = { topStories: [Object.assign({}, mk('btc', 0.45, 1), {
        rootMateriality: 0.45, supporting: [mk('eth', 0.20, 2)] })], findings: [] };
      const r = run('_intv5MattersStories(__c2, [], null, { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "structural:0" } })', c);
      return r.stories.map(x => x.semanticKey); })()));
  ok('13.4 …y si NO queda ningún hermano vivo, la raíz sí desaparece (el acuse se respeta)',
    (() => { const c = makeCtx({});
      const only = { topStories: [{ semanticKey: 'position_below_cost_btc', causalRoot: 'position_result',
        materiality: 0.45, priority: 0.45, rootMateriality: 0.45, values: {},
        window: { range: 'since_cost' }, conceptId: 'pos:btc', episodeSignature: 'structural:0',
        eventId: 'pos:btc#structural:0', supporting: [] }], findings: [] };
      c.__c3 = only;
      const r = run('_intv5MattersStories(__c3, [], null, { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "structural:0" } })', c);
      return r.stories.length === 0; })());
  ok('13.5 los apoyos llevan su IDENTIDAD, sin la cual no se podría promover ninguno',
    /eventId: f\.eventId \|\| null/.test(fnSrc('_aurixIntelligenceStories')));
}

console.log('\n11 · Empate en el máximo: silencio honesto, no un hito inventado:');
{
  // Serie que termina con DOS puntos iguales en su valor más alto. `>` estricto
  // deja `peakIdx` en el PRIMERO, así que no hay máximo histórico — y el suelo de
  // materialidad tampoco deja emitir «máximo anterior». La Memoria se queda sin
  // hito, y eso es fail-closed: preferible a fabricar uno.
  const tie = core({ rows: inv([120000, 128000, 134000, 141000, 160818, 160818]),
    assets: BTC_ETH_CASH, snap: SNAP, drivers: DRIVERS, serverRows: [] });
  ok('11.1 con empate en el máximo no se publica ni máximo histórico ni máximo anterior',
    !tie.ledger.facts.some(f => f.semanticKey === 'investable_all_time_high')
    && !tie.ledger.facts.some(f => f.semanticKey === 'investable_prior_high'),
    JSON.stringify(tie.ledger.facts.map(f => f.semanticKey)));
  ok('11.2 y el contrato sigue siendo válido (silencio, no excepción)',
    Array.isArray(tie.findings) && Array.isArray(tie.ledger.gaps));
}

// ════════════════════════════════════════════════════════════════════════════
// 14 · CORRECCIÓN FINANCIERA FINAL — CUOTA DE PÉRDIDA, ACCIÓN MATERIAL
//      Y RESOLUCIÓN CERTIFICADA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n14 · La cuota de pérdida se calcula con importes, no con una aproximación:');
{
  const POS = (id, type, qty, price, cost, cur) => {
    const a = A(id, type, qty, price, cur); if (cost != null) a.costBasis = cost; return a;
  };
  const lossCtx = (assets, tot, extra) => core(Object.assign({ rows: inv([100000, 100000, 100000]),
    assets: assets, snap: Object.assign({}, SNAP, { totUSD: tot }), drivers: DRIVERS, serverRows: [] },
    extra || {}));
  const lossOf = (r, id) => r.ledger.facts.find(f => f.semanticKey === 'position_below_cost_' + id);

  // ── 14.1 · LA ARITMÉTICA EXACTA ────────────────────────────────────────
  ok('14.1 la cuota es importe perdido / patrimonio certificado, sin intermediarios',
    (() => { const c = makeCtx({});
      return run('_aurixLossImpactShare(15000, 100000)', c) === 0.15
        && run('_aurixLossImpactShare(0, 100000)', c) === 0
        && run('_aurixLossImpactShare(-8000, 100000)', c) === 0        // nunca negativa
        && run('_aurixLossImpactShare(50000, 100000)', c) === 0.5; })());
  // EL EJEMPLO DEL FOUNDER. Coste 60.000, valor 45.000, patrimonio 100.000:
  // la pérdida es 15.000, o sea el 15 % del patrimonio. La aproximación anterior
  // —|retorno| × peso actual— daba 25 % × 45 % = 11,25 %, casi un tercio menos, y
  // no es un redondeo: el peso se calcula sobre el valor que QUEDA, no sobre el
  // coste, así que el error crece con la pérdida.
  ok('14.2 el caso −25 %: la cuota real es 15 %, no el 11,25 % de multiplicar por el peso',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 45000, 60000),
        POS('eur', 'cash', 55000, 1, 55000)], 100000);
      const f = lossOf(r, 'btc');
      return !!f && f.values.recordedLossBase === 15000
        && f.values.lossShareOfWealthPct === 15
        && f.values.severityTier === 'material'
        && Math.round(f.values.weightPct) === 45; })(),
    JSON.stringify((lossOf(lossCtx([POS('btc', 'crypto', 1, 45000, 60000),
      POS('eur', 'cash', 55000, 1, 55000)], 100000), 'btc') || {}).values));
  ok('14.3 …y la aproximación por peso ya no existe en el ledger',
    !/returnPct\s*\)\s*\*\s*.*weight|Math\.abs\(perf\.returnPct\)\s*\*\s*weight/.test(fnSrc('_aurixFactLedger')));
  ok('14.4 el caso −50 %: 45.000 perdidos sobre 100.000 es estructural',
    (() => { const f = lossOf(lossCtx([POS('btc', 'crypto', 1, 45000, 90000),
        POS('eur', 'cash', 55000, 1, 55000)], 100000), 'btc');
      return !!f && f.values.recordedLossBase === 45000
        && f.values.lossShareOfWealthPct === 45 && f.values.severityTier === 'structural'; })());
  // VALOR ACTUAL CERO. El peso es 0 y el suelo de participación lo suprimía: la
  // posición barrida a cero era exactamente la que no podía hablar, y es donde el
  // usuario más necesita leerlo.
  ok('14.5 una posición cuyo valor actual es CERO se publica con toda su pérdida',
    (() => { const f = lossOf(lossCtx([POS('btc', 'crypto', 0, 45000, 40000),
        POS('eur', 'cash', 60000, 1, 60000)], 60000), 'btc');
      return !!f && f.values.recordedLossBase === 40000 && f.values.weightPct === 0
        && f.values.lossShareOfWealthPct > 25 && f.values.severityTier === 'structural'; })(),
    JSON.stringify((lossOf(lossCtx([POS('btc', 'crypto', 0, 45000, 40000),
      POS('eur', 'cash', 60000, 1, 60000)], 60000), 'btc') || {}).values));
  ok('14.5b …y con el peso por los suelos manda la PÉRDIDA: 39.999 sobre 60.001 es noticia',
    (() => { const f = lossOf(lossCtx([POS('btc', 'crypto', 1, 1, 40000),
        POS('eur', 'cash', 60000, 1, 60000)], 60001), 'btc');
      return !!f && f.values.weightPct === 0 && f.values.recordedLossBase === 39999
        && f.values.severityTier === 'structural'; })());
  // Y el otro lado del límite: un PRECIO de cero no es un valor de cero. El owner
  // certificado responde `missing_price` —cero e «ilocalizable» son el mismo dato
  // en esa entrada— y el ledger declara el hueco en vez de inventar un −100 %.
  ok('14.5c un PRECIO ausente no se lee como valor cero: se declara, no se publica',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 0, 40000),
        POS('eur', 'cash', 60000, 1, 60000)], 60000);
      return !lossOf(r, 'btc')
        && r.ledger.gaps.some(g => g.semanticKey === 'position_below_cost'
             && g.reason === 'missing_cost_basis'); })());
  ok('14.6 con el denominador de patrimonio INCOMPLETO no se publica ninguna cuota',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 45000, 90000),
        POS('eur', 'cash', 55000, 1, 55000)], 100000,
        { snap: Object.assign({}, SNAP, { totUSD: 100000, uncertifiablePositions: 1 }) });
      return !lossOf(r, 'btc')
        && r.ledger.gaps.some(g => g.semanticKey === 'position_below_cost'
             && g.reason === 'investable_denominator_partial'); })(),
    JSON.stringify(lossCtx([POS('btc', 'crypto', 1, 45000, 90000), POS('eur', 'cash', 55000, 1, 55000)],
      100000, { snap: Object.assign({}, SNAP, { totUSD: 100000, uncertifiablePositions: 1 }) })
      .ledger.gaps.filter(g => g.semanticKey === 'position_below_cost')));
  ok('14.6b y si el IMPORTE no se puede convertir, el hecho se declara y no se publica (guarda cerrada)',
    /_AURIX_LOSS_TIER\.UNAVAILABLE\) \{\s*\n\s*gap\(_AURIX_FACT_FAMILY\.PERFORMANCE, 'position_below_cost',\s*\n\s*_AURIX_FACT_STATUS\.LOW_CONFIDENCE, 'loss_impact_not_computable'/
      .test(fnSrc('_aurixFactLedger')));
  ok('14.7 sin importe computable (nivel NO DISPONIBLE) el hecho no existe: no hay tier por defecto',
    (() => { const c = makeCtx({});
      return run('_aurixLossSeverityTier(NaN, 100000)', c) === 'unavailable'
        && run('_aurixLossSeverityTier(15000, 0)', c) === 'unavailable'
        && run('_aurixLossSeverityTier(15000, NaN)', c) === 'unavailable'
        && run('_aurixLossImpactShare(NaN, 100000)', c) === null; })());
  ok('14.8 la frontera estructural es una decisión de producto DECLARADA, no la de concentración',
    (() => { const c = makeCtx({});
      const v = run('_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE', c);
      const src = fnSrc('_aurixLossSeverityTier');
      return v === 0.25
        && /_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE/.test(src)
        && !/concentrationPct/.test(src); })());

  // ── ACCIÓN DEL USUARIO: MATERIAL, DEDUPLICADA Y NO INFERIDA ────────────
  const withFlows = (flows) => lossCtx([POS('btc', 'crypto', 1, 45000, 90000),
    POS('eur', 'cash', 55000, 1, 55000)], 100000, { flows: flows });
  const sigOf = (r) => { const f = lossOf(r, 'btc'); return f ? f.eventId : null; };
  const baseSig = sigOf(withFlows([]));
  ok('14.9 una acción DIMINUTA no reabre nada (por debajo del 2 % del patrimonio)',
    (() => { const r = withFlows([{ id: 'tiny', ts: NOW - DAY, amountUSD: 500, kind: 'asset_add',
        source: 'user', intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 }]);
      const f = lossOf(r, 'btc');
      return !!f && f.values.lastMaterialAction === null && f.eventId === baseSig; })(),
    JSON.stringify([baseSig, sigOf(withFlows([{ id: 'tiny', ts: NOW - DAY, amountUSD: 500,
      kind: 'asset_add', source: 'user', intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 }]))]));
  ok('14.10 una acción MATERIAL reabre UNA vez, y repetir la pintura no vuelve a reabrir',
    (() => { const flows = [{ id: 'big', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add',
        source: 'user', intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 }];
      const a = withFlows(flows), b = withFlows(flows);
      const fa = lossOf(a, 'btc'), fb = lossOf(b, 'btc');
      return !!fa && fa.values.lastMaterialAction === 'big' && fa.eventId !== baseSig
        && fb.eventId === fa.eventId; })());
  ok('14.11 una fila DERIVADA o inferida no es una decisión de nadie: no reabre',
    (() => { const r = withFlows([{ id: 'd1', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add',
        source: 'tx-backfill', originalTs: NOW - DAY, assetId: 'btc', revision: 1 }]);
      const f = lossOf(r, 'btc');
      return !!f && f.values.lastMaterialAction === null && f.eventId === baseSig; })(),
    JSON.stringify((lossOf(withFlows([{ id: 'd1', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add',
      source: 'tx-backfill', originalTs: NOW - DAY, assetId: 'btc', revision: 1 }]), 'btc') || {}).values));
  ok('14.12 y una acción DUPLICADA en el ledger no cuenta dos veces: la identidad es la última, no el recuento',
    (() => { const one = withFlows([{ id: 'big', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add',
        source: 'user', intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 }]);
      const dup = withFlows([{ id: 'big', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add',
        source: 'user', intent: 'INTERNAL_BUY', assetId: 'btc', revision: 1 },
        { id: 'big-d', ts: NOW - DAY, amountUSD: 5000, kind: 'asset_add', source: 'tx-backfill',
          originalTs: NOW - DAY, assetId: 'btc', revision: 1 }]);
      return sigOf(one) === sigOf(dup); })());

  // ── RESOLUCIÓN CERTIFICADA ────────────────────────────────────────────
  ok('14.13 una RECUPERACIÓN medida contra el mismo coste resuelve el concepto',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 95000, 90000),
        POS('eur', 'cash', 5000, 1, 5000)], 100000);
      return (r.resolvedConcepts || []).some(x => x.conceptId === 'pos:btc'
        && x.reason === 'recovered_to_cost_basis'); })(),
    JSON.stringify(lossCtx([POS('btc', 'crypto', 1, 95000, 90000), POS('eur', 'cash', 5000, 1, 5000)], 100000)
      .resolvedConcepts));
  ok('14.14 un CIERRE autoritativo resuelve, y no publica ninguna pérdida realizada',
    (() => { const closed = POS('btc', 'crypto', 0, 45000, 90000);
      closed.lifecycleStatus = 'closed'; closed.realizedPnL = -45000;
      const r = lossCtx([closed, POS('eur', 'cash', 55000, 1, 55000)], 55000);
      return (r.resolvedConcepts || []).some(x => x.conceptId === 'pos:btc' && x.reason === 'position_closed')
        && !r.ledger.facts.some(f => /realis|realiz/i.test(f.semanticKey))
        && r.ledger.gaps.some(g => g.semanticKey === 'position_realised_loss'
             && g.status === 'not_yet_supported'); })(),
    JSON.stringify((() => { const closed = POS('btc', 'crypto', 0, 45000, 90000);
      closed.lifecycleStatus = 'closed'; closed.realizedPnL = -45000;
      return lossCtx([closed, POS('eur', 'cash', 55000, 1, 55000)], 55000).resolvedConcepts; })()));
  ok('14.15 un hecho que NO se puede medir no resuelve: sin coste registrado nadie se cura',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 45000, null),
        POS('eur', 'cash', 55000, 1, 55000)], 100000);
      return !(r.resolvedConcepts || []).some(x => x.conceptId === 'pos:btc')
        && r.ledger.gaps.some(g => g.semanticKey === 'position_below_cost'
             && g.reason === 'missing_cost_basis'); })(),
    JSON.stringify(lossCtx([POS('btc', 'crypto', 1, 45000, null), POS('eur', 'cash', 55000, 1, 55000)], 100000)
      .resolvedConcepts));
  ok('14.16 una cartera SIN HIDRATAR no resuelve nada: la ausencia no es una medición',
    (() => { const r = core({ rows: inv([100000, 100000, 100000]), assets: [],
        snap: Object.assign({}, SNAP, { totUSD: 0 }), drivers: DRIVERS, serverRows: [] });
      return (r.resolvedConcepts || []).length === 0; })(),
    JSON.stringify(core({ rows: inv([100000, 100000, 100000]), assets: [],
      snap: Object.assign({}, SNAP, { totUSD: 0 }), drivers: DRIVERS, serverRows: [] }).resolvedConcepts));
  ok('14.17 con el patrimonio no certificable tampoco: eso es DESCONOCIDO, no recuperado',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 45000, 90000),
        POS('eur', 'cash', 55000, 1, 55000)], 100000,
        { snap: Object.assign({}, SNAP, { totUSD: 100000, uncertifiablePositions: 1 }) });
      return !(r.resolvedConcepts || []).some(x => x.conceptId === 'pos:btc'); })());
  ok('14.18 lo que sigue VIVO no se resuelve aunque otra ventana lo mida por debajo del umbral',
    (() => { const src = fnSrc('_aurixFactLedger');
      return /_liveConceptSet\.has\(r\.conceptId\)/.test(src)
        && /new Set\(facts\.map\(f => f && f\.conceptId\)/.test(src); })());
  ok('14.19 y el consumidor sólo resuelve lo que llega en la lista: no puede resolver por ausencia',
    (() => { const src = fnSrc('_aurixIntelResolveCertified');
      return /if \(!resolved\.size\) return 0;/.test(src)
        && /if \(!resolved\.has\(k\)\) return;/.test(src)
        && !/live/.test(src); })());
  // Y el PUNTO DE LLAMADA: el renderer tiene que pasar la lista certificada del
  // ledger, no los conceptos vivos. Un consumidor correcto con la entrada
  // equivocada habría reintroducido el defecto entero.
  ok('14.20 el renderer alimenta la resolución con `resolvedConcepts`, nunca con los conceptos vivos',
    (() => { const i = app.indexOf('_aurixIntelResolveCertified(_resolved');
      if (i < 0) return false;
      const around = app.slice(Math.max(0, i - 900), i);
      return /core\.ledger && core\.ledger\.resolvedConcepts/.test(around)
        && !/\.map\(f => f\.conceptId\)/.test(around)
        && app.indexOf('_aurixIntelResolveAbsent') === -1; })());
  // DETERIORO POSTERIOR A UNA RECUPERACIÓN CERTIFICADA. El registro resuelto deja
  // de cubrir, así que la pérdida nueva habla una vez — y sólo una.
  ok('14.21 tras una recuperación certificada, un deterioro nuevo vuelve a hablar UNA vez',
    (() => { const c = makeCtx({});
      const mk = (sig) => ({ semanticKey: 'position_below_cost_btc', family: 'performance',
        causalRoot: 'position_result', unit: 'percent_of_cost', value: -30, changeFact: true,
        window: { range: 'observed', startAt: NOW - DAY, endAt: NOW },
        conceptId: 'pos:btc', episodeSignature: sig, eventId: 'pos:btc#' + sig,
        materiality: 0.45, novelty: 1, confidence: 1, values: {} });
      c.__l14 = { facts: [mk('structural:')], gaps: [] };
      const covered = run('_aurixCanonicalFindings(__l14, { acknowledged: { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "structural:" } } })', c);
      const afterRecovery = run('_aurixCanonicalFindings(__l14, { acknowledged: { "pos:btc":'
        + ' { at: 1, state: "resolved", signature: "structural:", resolvedAt: 2 } } })', c);
      return covered.length === 0 && afterRecovery.length === 1; })());
  // AISLAMIENTO. La resolución escribe en el registro del PROPIETARIO, así que
  // recuperarse en una cuenta no puede curar el aviso de otra.
  ok('14.22 resolver en nombre de otra cuenta no lee ni muta el registro ajeno',
    (() => { const c = makeCtx({});
      const store = {}; c.__s14 = store;
      run('var __mk = (o) => ({ store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s14, k)'
        + ' ? __s14[k] : null), setItem: (k, v) => { __s14[k] = String(v); }, removeItem: k => {} }, owner: o });', c);
      // El dispositivo guarda el contexto de UN propietario: al entrar u2, el
      // registro de u1 deja de ser legible (`_aurixIntelReadOwned` compara owner).
      run('_aurixIntelAcknowledge("pos:btc", Object.assign(__mk("u1"), { now: 10, signature: "structural:" }))', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign(__mk("u2"), { now: 11, signature: "structural:" }))', c);
      const n = run('_aurixIntelResolveCertified(["pos:btc"], Object.assign(__mk("u1"), { now: 20 }))', c);
      const r1 = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __mk("u1"))', c);
      const r2 = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __mk("u2"))', c);
      return n === 0 && r1 === null
        && r2.ack['pos:btc'].state === 'acknowledged' && r2.ack['pos:btc'].at === 11; })());
  // Y el contador del hero sigue siendo el MISMO conjunto que el destino pinta,
  // con la aritmética nueva y con el suelo de materialidad movido.
  ok('14.23 el contador del hero sigue coincidiendo con las filas publicadas',
    (() => { const r = lossCtx([POS('btc', 'crypto', 1, 0, 40000),
        POS('eth', 'crypto', 1, 45000, 60000), POS('eur', 'cash', 15000, 1, 15000)], 60000);
      const rows = run('_intv4FindingRows(' + JSON.stringify({ findings: r.findings }) + ')', makeCtx({}));
      return rows.length === r.findings.length; })());
}

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
