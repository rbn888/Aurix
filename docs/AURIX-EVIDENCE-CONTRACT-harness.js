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

const DAY = 864e5, MIN = 60000;
const NOW = Date.now();
const T0 = NOW - 60 * DAY;

const CONSTS = ['_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS',
  '_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR','_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS',
  '_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD','_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES',
  '_AURIX_RETURN_MIN_HISTORY_MS','_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT',
  '_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL','_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY',
  '_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS',
  '_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_AURIX_QUESTION_CATALOG',
  '_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT',
  '_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX'];
const FNS = ['toBase','formatCurrency','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
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
    /currentUser && currentUser\.id\)\)\s*return true;/.test(fnSrc('_aurixCapitalFlowsComplete')));
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

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
