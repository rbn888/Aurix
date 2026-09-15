'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INTEL-RECORDED-OPERATION-harness — SPEC ADVANCED INTELLIGENCE · FINAL
// ════════════════════════════════════════════════════════════════════════════
// EL FALLO QUE ESTE GATE REPRODUCE, con la evidencia del founder:
//
//   Registró 100 acciones de Microsoft. «Factores principales» la publicó como
//   primera exposición (~32 %). «Lo que importa hoy» y «Qué ha cambiado» NO
//   dijeron nada, durante minutos. Y siguió destacado un movimiento de liquidez
//   histórico de 10.869,57 US$.
//
// LA CAUSA, y no es caché ni filtros ni snapshots: el fact ledger no tenía NINGÚN
// hecho para una operación registrada. Su único hecho derivado del ledger de
// flujos (`recorded_capital_net`) filtra por contrato `kind ∈ {deposit,
// withdrawal}` (C1, `_aurixCashLedgerAuthority`), así que el `asset_add` que
// `_ledgerTrade` SÍ persiste se quedaba fuera del universo de hechos: sin hecho
// no hay hallazgo, sin hallazgo no hay selección y sin selección no hay pintura.
// «Factores principales» funcionaba porque lee POSICIONES vivas, no el ledger.
//
// Y el segundo defecto, financiero: `investable_level_change` mide desde el PRIMER
// punto de la serie —que en una cuenta nueva ES el registro inicial— y su copy
// decía «Tus inversiones han subido X». Sobre el caso del founder eso publicó una
// subida de 75.432,67 US$ que después pasó a 106.868,37 US$ al registrar
// Microsoft. Cero ganancia: dos registros.
//
// LO QUE ES REAL AQUÍ: el fact ledger completo, el Core completo, el ledger de
// flujos sobre un almacenamiento real, `toBase`, la cadena de valoración y la
// superficie de prioridad (`_intv5MattersStories` + `_intv5RecencyTier`).
// Los INPUTS (historia, filas de servidor, snapshot de salud, drivers, FX) se
// proveen: son entradas al Core, no la integración bajo prueba.
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

const DAY = 86400000, HOUR = 36e5;
const T0 = 1750000000000;
const NOW = Date.now();

const CONSTS = ['_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT','_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD',
  '_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS',
  '_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL',
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_AURIX_QUESTION_CATALOG',
  '_AURIX_REGISTERED_OP_KINDS','_AURIX_REGISTERED_OP_BATCH_MIN','_AURIX_INTEL_DIM_ROOT','_INTV4_BRIEF_MAX','_INTV5_TIER'];
const FNS = ['_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','toBase','formatCurrency','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
  'activeAssets','isInvestableAsset','investableAssets','investableValueUSD','liquidityNominal',
  'assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete','_aurixFlowIsInternal',
  '_aurixLoadCapitalFlows','_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain',
  '_aurixFlowCounterpartObserved','_aurixInvestablePerformance','_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct',
  '_aurixCatHistWindow','_aurixCatExposureDelta','_aurixFactClamp01','_aurixEffectiveDiversification',
  '_aurixFactLedger','_aurixIntelligenceStories','_aurixWowInsights','_aurixContextualQuestions',
  '_aurixWhatChanged','_aurixIntelligenceCore','_intv5RecencyTier','_intv5MattersStories'];

function makeCtx(opts) {
  const o = opts || {};
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  vm.createContext(sb);
  sb.baseCurrency = o.baseCurrency || 'USD';
  sb.usdToEur = 0.92;
  sb.lang = o.lang || 'es';
  sb._aurixFxRate = c => ({ USD: 1, EUR: 0.92 })[String(c).toUpperCase()];
  sb.__rows = o.rows || [];
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb.__epoch = o.epoch || 0;
  sb._aurixPortfolioEpoch = () => sb.__epoch;
  sb.investableValueBase = () => 0;
  sb.canDisplayCanonicalReturn = () => (o.canDisplay === undefined ? { ok: true } : o.canDisplay);
  sb.activeRange = 'all';
  sb._aurixBackendSnapshots = o.serverRows || [];
  sb._aurixBackendSnapshotsState = o.hydration || 'ready';
  sb._aurixBackendHealthSnapshot = () => ({ status: 'ok' });
  sb.assets = o.assets || [];
  sb._aurixHealthSnapshot = () => (o.snap === undefined ? null : o.snap);
  sb.buildPortfolioDrivers = () => (o.drivers === undefined ? null : o.drivers);
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  sb._aurixCapitalFlowsComplete = () => (o.flowsComplete === undefined ? true : !!o.flowsComplete);
  sb.__lineage = (o.lineage === undefined) ? { since: 0, entries: [] } : o.lineage;
  vm.runInContext('var _aurixLineageColumnSeen = ' + ((o.lineageAccountWide === false) ? 'false' : 'true') + ';', sb);
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  (o.extra || []).forEach(src => vm.runInContext(src, sb));
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
  if (sb.__lineage) vm.runInContext('__store[_AURIX_LINEAGE_KEY] = ' + JSON.stringify(JSON.stringify(sb.__lineage)), sb);
  return sb;
}
const run = (expr, ctx) => vm.runInContext(expr, ctx);

// ── FIXTURES ────────────────────────────────────────────────────────────────
// Los importes son de FIXTURE. Los de las capturas del founder se usan sólo donde
// reproducen SU caso; no son expectativas universales.
const row = (dayOffset, total, re) => ({ ts: T0 + dayOffset * DAY, total, real_estate: re || 0 });
const inv = vals => vals.map((v, i) => row(i, v, 0));
function srvRow(tsMs, cats) {
  const all = Object.assign({}, cats);
  let total = 0; for (const k in all) total += all[k];
  return { ts: tsMs, total_value_usd: +total.toFixed(2), real_estate: all.real_estate || 0, category_values: all };
}
function srvHistory(endTs, spanDays, startCats, endCats) {
  const rows = []; const stepMs = 6 * HOUR;
  const n = Math.floor((spanDays * DAY) / stepMs);
  for (let i = 0; i <= n; i++) {
    const ts = endTs - (n - i) * stepMs; const f = n === 0 ? 1 : i / n; const cats = {};
    for (const k of Object.keys(startCats)) {
      const a = startCats[k] || 0, b = (endCats[k] != null ? endCats[k] : a);
      cats[k] = +(a + (b - a) * f).toFixed(2);
    }
    rows.push(srvRow(ts, cats));
  }
  return rows;
}
const SNAP = {
  assetCount: 6, totUSD: 106868.37, categoryCount: 3, cashPct: 10, cryptoPct: 20, realEstatePct: 0,
  topInvestedAsset: { name: 'Microsoft', ticker: 'MSFT', type: 'stock', pctTotal: 32 },
  topCategory: { type: 'stock', label: 'Acciones', pctTotal: 62 },
  worstAsset: null, bestAsset: null,
};
const DRIVERS = { items: [], pct: 62 };
// La cartera del caso: MSFT es la primera exposición (~32 %), como en la captura.
const HOLDINGS = [
  { id: 'msft', ticker: 'MSFT', name: 'Microsoft', type: 'stock', qty: 100, price: 342.35 },
  { id: 'a2', ticker: 'VWCE', type: 'etf',  qty: 200, price: 110 },
  { id: 'a3', ticker: 'BTC',  type: 'crypto', qty: 0.4, price: 53000 },
  { id: 'a4', ticker: 'AAPL', type: 'stock', qty: 60, price: 180 },
  { id: 'a5', ticker: 'GLD',  type: 'metal', qty: 20, price: 190 },
  { id: 'a6', type: 'cash', qty: 10000 },
];
// El ledger del caso: un movimiento de liquidez ANTIGUO (el que se quedó
// destacado) y el `asset_add` de Microsoft REGISTRADO HOY.
const MSFT_COST = 31435.70;
const OLD_DEPOSIT = 10869.57;
function flowsCase(nowTs, o) {
  const p = o || {};
  const out = [
    { id: 'deposit:cash:' + (nowTs - 40 * DAY) + ':10870', ts: nowTs - 40 * DAY,
      amountUSD: OLD_DEPOSIT, kind: 'deposit', source: 'user', revision: 1,
      recordedAt: nowTs - 40 * DAY },
  ];
  if (p.msft !== false) out.push({
    id: 'asset_add:msft:' + (p.effectiveAt != null ? p.effectiveAt : nowTs - HOUR) + ':31436',
    ts: (p.effectiveAt != null ? p.effectiveAt : nowTs - HOUR),
    amountUSD: MSFT_COST, kind: 'asset_add', assetId: 'msft', source: 'user', revision: 1,
    intent: 'INTERNAL_BUY',
    recordedAt: (p.recordedAt !== undefined ? p.recordedAt : nowTs - HOUR),
  });
  (p.push || []).forEach(f => out.push(f));
  return out;
}
// Serie de nivel: la cuenta arranca REGISTRANDO ~75k y hoy vale ~106,9k porque
// se ha incorporado Microsoft. Ni un dólar de eso es rendimiento.
const LEVEL_ROWS_REGISTRATION = inv([75432.67, 75432.67, 75500, 75480, 75510, 106868.37]);

function caseCore(nowTs, o, coreOpts) {
  const opts = Object.assign({
    rows: LEVEL_ROWS_REGISTRATION,
    serverRows: srvHistory(NOW, 10, { stock: 45000, etf: 22000, crypto: 21200, liquidity: 10000 },
                                    { stock: 66000, etf: 22000, crypto: 21200, liquidity: 10000 }),
    assets: HOLDINGS, snap: SNAP, drivers: DRIVERS,
    flows: flowsCase(nowTs, o || {}),
  }, (o && o.ctx) || {});
  const c = makeCtx(opts);
  const res = run('_aurixIntelligenceCore(' + JSON.stringify(Object.assign({ now: nowTs }, coreOpts || {})) + ')', c);
  return { core: res, ctx: c };
}

console.log('AURIX-INTEL-RECORDED-OPERATION — SPEC ADVANCED INTELLIGENCE · registro ≠ resultado\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL FALLO MICROSOFT — la operación registrada SE RECONOCE
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Registrar 100 acciones de Microsoft produce un HECHO:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  const { core: k } = caseCore(nowTs);
  const keys = k.ledger.facts.map(f => f.semanticKey);
  const regs = k.ledger.facts.filter(f => /^operation_registered/.test(f.semanticKey));
  ok('1.1 el ledger publica un hecho de operación registrada', regs.length === 1, JSON.stringify(keys));
  ok('1.2 el hecho identifica el activo registrado',
    regs.length === 1 && String((regs[0].values || {}).assetId) === 'msft',
    regs.length ? JSON.stringify(regs[0].values) : 'no fact');
  ok('1.3 su importe es el COSTE REGISTRADO de la operación, identificado como tal',
    regs.length === 1 && Math.abs(Number(regs[0].value) - MSFT_COST) < 0.01
      && (regs[0].values || {}).amountKind === 'recorded_cost',
    regs.length ? JSON.stringify({ v: regs[0].value, kind: (regs[0].values||{}).amountKind }) : 'no fact');
  // El recorrido completo: hecho → hallazgo canónico → «Qué ha cambiado».
  ok('1.4 entra en el conjunto canónico de hallazgos (el contador del hero)',
    (k.findings || []).some(f => /^operation_registered/.test(f.semanticKey)),
    JSON.stringify((k.findings || []).map(f => f.semanticKey)));
  ok('1.5 entra en «Qué ha cambiado»',
    (k.whatChanged || []).some(f => /^operation_registered/.test(f.semanticKey)),
    JSON.stringify((k.whatChanged || []).map(f => f.semanticKey)));
  ok('1.6 produce una historia propia, con su RAÍZ CAUSAL propia',
    (k.topStories || []).some(s => /^operation_registered/.test(s.semanticKey)
      && s.causalRoot === run('_AURIX_CAUSAL_ROOT.RECORDED_OPERATION', makeCtx({}))),
    JSON.stringify((k.topStories || []).map(s => s.semanticKey + '@' + s.causalRoot)));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · PRIORIDAD — Microsoft desplaza la liquidez histórica
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Lo de HOY por encima de un movimiento de liquidez histórico:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  const { core: k, ctx } = caseCore(nowTs);
  ctx.__c = k;
  const sel = run('_intv5MattersStories(__c, [], null, {})', ctx);
  const first = (sel.stories || [])[0];
  ok('2.1 la primera entrada de «Lo que importa hoy» es la operación de hoy',
    !!first && /^operation_registered/.test(first.semanticKey),
    JSON.stringify((sel.stories || []).map(s => s.semanticKey)));
  const idx = (sel.stories || []).findIndex(s => s.semanticKey === 'recorded_capital_net');
  const ridx = (sel.stories || []).findIndex(s => /^operation_registered/.test(s.semanticKey));
  ok('2.2 el movimiento de liquidez histórico queda por DEBAJO (o fuera)',
    ridx >= 0 && (idx === -1 || ridx < idx), JSON.stringify({ ridx, idx }));
  // La escalera es determinista y sale del propio hecho.
  const reg = k.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ctx.__f = reg;
  ok('2.3 el hecho de hoy ocupa el peldaño más alto de la escalera de actualidad',
    reg && run('_intv5RecencyTier(__f) === _INTV5_TIER.TODAY', ctx),
    reg ? String(run('_intv5RecencyTier(__f)', ctx)) : 'no fact');
  ok('2.4 TODAY es estrictamente más alto que 24H, y la escalera conserva su orden',
    run('_INTV5_TIER.TODAY < _INTV5_TIER.D1 && _INTV5_TIER.D1 < _INTV5_TIER.D7'
      + ' && _INTV5_TIER.D7 < _INTV5_TIER.ACTION && _INTV5_TIER.ACTION < _INTV5_TIER.DRIFT'
      + ' && _INTV5_TIER.DRIFT < _INTV5_TIER.STATE', ctx));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · REGISTRO vs EVENTO ECONÓMICO (§3)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · «Hoy has registrado» ≠ «hoy has comprado»:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  // C · compra ANTIGUA registrada HOY: fecha económica de hace dos años.
  const oldBuy = caseCore(nowTs, { effectiveAt: nowTs - 700 * DAY, recordedAt: nowTs - HOUR }).core;
  const f1 = oldBuy.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('3.1 una compra antigua registrada hoy es un REGISTRO de hoy',
    !!f1 && (f1.values || {}).recordedToday === true, f1 ? JSON.stringify(f1.values) : 'no fact');
  ok('3.2 y NO se afirma como operación económica de hoy',
    !!f1 && (f1.values || {}).effectiveToday === false, f1 ? JSON.stringify(f1.values) : 'no fact');
  ok('3.3 conserva su fecha económica real, sin reinventarla',
    !!f1 && Number((f1.values || {}).effectiveAt) === nowTs - 700 * DAY);
  // B · compra documentada con fecha económica de hoy.
  const todayBuy = caseCore(nowTs, { effectiveAt: nowTs - HOUR, recordedAt: nowTs - HOUR }).core;
  const f2 = todayBuy.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('3.4 una compra con fecha económica de hoy sí se afirma como tal',
    !!f2 && (f2.values || {}).effectiveToday === true && (f2.values || {}).recordedToday === true);
  // LEGACY sin procedencia: no se puede reconstruir «lo hiciste hoy».
  const legacy = caseCore(nowTs, { effectiveAt: nowTs - 700 * DAY, recordedAt: undefined,
    ctx: {}, }).core;
  const legacyFlows = flowsCase(nowTs, { effectiveAt: nowTs - 700 * DAY });
  delete legacyFlows[1].recordedAt;
  const lc = caseCore(nowTs, { push: [], effectiveAt: nowTs - 700 * DAY, ctx: { flows: legacyFlows } }).core;
  const f3 = lc.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('3.5 una fila legacy sin procedencia NO se publica como registro de hoy',
    !f3 || (f3.values || {}).recordedToday !== true,
    f3 ? JSON.stringify(f3.values) : 'no fact (aceptable)');
  ok('3.6 y su límite se DECLARA como hueco, no se calla',
    (lc.dataAvailability.gaps || []).some(g => /recorded_operation|provenance/.test(String(g.semanticKey) + String(g.reason))),
    JSON.stringify((lc.dataAvailability.gaps || []).map(g => g.semanticKey + ':' + g.reason)));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · VERDAD FINANCIERA — ningún registro se convierte en ganancia (§2)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Ningún registro se convierte en ganancia:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  const { core: k } = caseCore(nowTs);
  const lvl = k.ledger.facts.find(f => f.semanticKey === 'investable_level_change');
  ok('4.1 con incorporaciones en la ventana NO se publica una subida de nivel',
    !lvl, lvl ? JSON.stringify({ v: lvl.value, w: lvl.window }) : 'ausente');
  ok('4.2 y el motivo se declara como hueco NOMBRADO',
    (k.dataAvailability.gaps || []).some(g => g.semanticKey === 'investable_level_change'
      && /incorporation|registro|recorded_operation/.test(String(g.reason))),
    JSON.stringify((k.dataAvailability.gaps || []).filter(g => g.semanticKey === 'investable_level_change').map(g => g.reason)));
  // Ninguna superficie puede publicar 75.432,67 ni 106.868,37 como una subida.
  const blob = JSON.stringify(k);
  ok('4.3 el importe del registro inicial no aparece como cambio de nivel',
    blob.indexOf('75432.67') === -1 || !lvl);
  // A · registro inicial de 75k: el NIVEL es correcto y no hay ganancia.
  const only = caseCore(nowTs, { msft: false, ctx: { rows: inv([75432.67, 75432.67, 75432.67, 75432.67]) } }).core;
  const lv = only.ledger.facts.find(f => f.semanticKey === 'investable_level');
  ok('4.4 el nivel registrado se publica como NIVEL, con su importe correcto',
    !!lv && Math.abs(Number(lv.value) - 75432.67) < 0.01, lv ? String(lv.value) : 'ausente');
  ok('4.5 y NO existe ningún hecho que lo llame ganancia, aportación ni rentabilidad',
    !only.ledger.facts.some(f => f.semanticKey === 'investable_level_change')
    && !only.ledger.facts.some(f => f.family === 'performance' && Number(f.value) !== 0),
    JSON.stringify(only.ledger.facts.map(f => f.semanticKey)));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · INCORPORACIÓN MASIVA — una lectura de registro, no una alarma por posición
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Una importación inicial no genera una alarma por posición:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  const batch = [];
  for (let i = 0; i < 6; i++) batch.push({
    id: 'asset_add:b' + i + ':' + (nowTs - HOUR + i) + ':5000', ts: nowTs - HOUR + i,
    amountUSD: 5000 + i, kind: 'asset_add', assetId: 'b' + i, source: 'user', revision: 1,
    intent: 'INTERNAL_BUY', recordedAt: nowTs - HOUR + i,
  });
  const { core: k } = caseCore(nowTs, { msft: false, push: batch });
  const regs = k.ledger.facts.filter(f => /^operation_registered|^positions_registered/.test(f.semanticKey));
  ok('5.1 seis incorporaciones producen UN hecho agrupado, no seis',
    regs.length === 1 && /^positions_registered/.test(regs[0].semanticKey),
    JSON.stringify(regs.map(f => f.semanticKey)));
  ok('5.2 el hecho agrupado declara cuántas posiciones cubre',
    regs.length === 1 && Number((regs[0].values || {}).operations) === 6,
    regs.length ? JSON.stringify(regs[0].values) : 'no fact');
  ok('5.3 y no genera seis hallazgos en el contador del hero',
    (k.findings || []).filter(f => /registered/.test(f.semanticKey)).length === 1,
    JSON.stringify((k.findings || []).map(f => f.semanticKey)));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · DEDUP E IDENTIDAD — un render no crea otra operación (§3)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Ni un refresco ni un cambio de precio crean otra operación:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  // El `id` del flujo se fija en la CAPTURA, así que se fija también aquí: medir
  // la estabilidad de la identidad con una fixture que regenera el id en cada
  // llamada mediría la fixture, no el contrato.
  const fixed = flowsCase(nowTs, { effectiveAt: nowTs - HOUR, recordedAt: nowTs - HOUR });
  const a = caseCore(nowTs, { ctx: { flows: fixed } }).core;
  const b = caseCore(nowTs + 3 * HOUR, { ctx: { flows: fixed } }).core;
  const ida = (a.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey)) || {}).eventId;
  const idb = (b.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey)) || {}).eventId;
  ok('6.1 la identidad del evento es estable entre pinturas', !!ida && ida === idb, JSON.stringify({ ida, idb }));
  // Un duplicado del MISMO flujo no puede convertirse en dos operaciones.
  const dup = flowsCase(nowTs);
  const { core: k } = caseCore(nowTs, { ctx: { flows: dup.concat([Object.assign({}, dup[1])]) } });
  ok('6.2 un flujo repetido no produce dos hechos de registro',
    k.ledger.facts.filter(f => /^operation_registered/.test(f.semanticKey)).length === 1,
    JSON.stringify(k.ledger.facts.map(f => f.semanticKey)));
  // Una venta registrada no es una compra.
  const sell = caseCore(nowTs, { ctx: { flows: [
    { id: 'asset_remove:msft:' + (nowTs - HOUR) + ':31436', ts: nowTs - HOUR, amountUSD: -MSFT_COST,
      kind: 'asset_remove', assetId: 'msft', source: 'user', revision: 1, intent: 'INTERNAL_SELL',
      recordedAt: nowTs - HOUR },
  ] } }).core;
  const sf = sell.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('6.3 una baja registrada se publica como retirada de posición, no como compra',
    !!sf && (sf.values || {}).side === 'out', sf ? JSON.stringify(sf.values) : 'no fact');
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · PRUDENCIA — sin FX, sin ledger completo, sin epoch: nada se inventa (§9 F)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Sin datos suficientes no hay novedad ni cero falso:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  // Ledger remoto sin completitud demostrable: el registro es LOCAL y cierto, así
  // que se publica, pero no puede afirmarse que sea todo lo que hay.
  const inc = caseCore(nowTs, { ctx: { flowsComplete: false } }).core;
  const rf = inc.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('7.1 sin completitud remota el registro SÍ se publica (es un hecho local cierto)', !!rf,
    JSON.stringify(inc.ledger.facts.map(f => f.semanticKey)));
  ok('7.2 pero su incompletitud viaja declarada, no silenciada',
    !!rf && (rf.values || {}).ledgerComplete === false, rf ? JSON.stringify(rf.values) : 'no fact');
  // Sin ninguna operación: no se fabrica actividad.
  const none = caseCore(nowTs, { msft: false }).core;
  ok('7.3 sin operaciones no se inventa ningún hecho de registro',
    !none.ledger.facts.some(f => /registered/.test(f.semanticKey)),
    JSON.stringify(none.ledger.facts.map(f => f.semanticKey)));
  ok('7.4 y la ausencia se declara como hueco, no como cero',
    (none.dataAvailability.gaps || []).some(g => String(g.semanticKey) === 'recorded_operations'
      && String(g.reason) === 'no_operations_today'),
    JSON.stringify((none.dataAvailability.gaps || []).map(g => g.semanticKey)));
  // Una operación de ANTEAYER no es de hoy.
  const oldOp = caseCore(nowTs, { effectiveAt: nowTs - 3 * DAY, recordedAt: nowTs - 3 * DAY }).core;
  const of = oldOp.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('7.5 una operación de hace tres días no ocupa la prioridad de hoy',
    !of || (of.values || {}).recordedToday === false, of ? JSON.stringify(of.values) : 'ausente');
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · ATENCIÓN Y ACUSE (§7 / §9 G)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · «Entendido» conserva la historia y el refresco no reconoce nada:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  const fixed = flowsCase(nowTs, { effectiveAt: nowTs - HOUR, recordedAt: nowTs - HOUR });
  const base = caseCore(nowTs, { ctx: { flows: fixed } }).core;
  const fd = (base.findings || []).find(f => /^operation_registered/.test(f.semanticKey));
  ok('8.1 el registro de hoy entra en la bandeja de revisión', !!fd,
    JSON.stringify((base.findings || []).map(f => f.semanticKey)));
  const fact = base.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  // El refresco NO reconoce nada: mismas entradas, sin acuses ⇒ sigue pendiente.
  const again = caseCore(nowTs + 2 * HOUR, { ctx: { flows: fixed } }).core;
  ok('8.2 repintar no reconoce el episodio',
    (again.findings || []).some(f => /^operation_registered/.test(f.semanticKey)));
  // Acuse por CONCEPTO + FIRMA, igual que el resto del ciclo de vida.
  const acks = {}; acks[fact.conceptId] = { state: 'acknowledged', signature: fact.episodeSignature };
  const ackd = caseCore(nowTs, { ctx: { flows: fixed } }, { acknowledged: acks }).core;
  ok('8.3 tras «Entendido» deja de ocupar la bandeja de atención',
    !(ackd.findings || []).some(f => /^operation_registered/.test(f.semanticKey)),
    JSON.stringify((ackd.findings || []).map(f => f.semanticKey)));
  ok('8.4 «Todo revisado» coexiste con la actividad de HOY: el hecho sigue intacto',
    !!ackd.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey)),
    'el hecho financiero no se destruye al acusarlo');
  ok('8.5 y su fila histórica se conserva en el conjunto completo',
    (ackd.findingsAll || []).some(f => /^operation_registered/.test(f.semanticKey)),
    JSON.stringify((ackd.findingsAll || []).map(f => f.semanticKey)));
  // Un acuse de OTRO concepto no puede cubrir este registro.
  const other = {}; other['pos:btc'] = { state: 'acknowledged', signature: 'x' };
  const k2 = caseCore(nowTs, { ctx: { flows: fixed } }, { acknowledged: other }).core;
  ok('8.6 el acuse de otro episodio no silencia el registro',
    (k2.findings || []).some(f => /^operation_registered/.test(f.semanticKey)));
  // Ausencia de datos NO resuelve: sin el flujo, el hecho desaparece pero eso no
  // es una resolución certificada, y no puede publicarse como tal.
  const gone = caseCore(nowTs, { msft: false }).core;
  ok('8.7 que el hecho deje de verse NO se publica como resolución',
    !(gone.resolvedConcepts || []).some(r => /rec:|operation_registered/.test(JSON.stringify(r))),
    JSON.stringify(gone.resolvedConcepts || []));
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · TEMPORALIDAD (§9 H) — «hoy» es UNA referencia, y la misma en dos husos
// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · «Hoy» no depende del huso del dispositivo:');
{
  // El día se ancla en UTC, así que dos dispositivos que comparten `now`
  // clasifican idénticamente el mismo ledger sea cual sea su zona.
  const nowTs = Date.UTC(2026, 8, 15, 14, 0, 0);
  const dayStart = Date.UTC(2026, 8, 15);
  const justAfterMidnight = dayStart + 60000;
  const justBeforeMidnight = dayStart - 60000;
  const mk = ts => [{ id: 'asset_add:msft:' + ts + ':31436', ts: ts, amountUSD: MSFT_COST,
    kind: 'asset_add', assetId: 'msft', source: 'user', revision: 1, intent: 'INTERNAL_BUY',
    recordedAt: ts }];
  const after = caseCore(nowTs, { ctx: { flows: mk(justAfterMidnight) } }).core;
  const before = caseCore(nowTs, { ctx: { flows: mk(justBeforeMidnight) } }).core;
  const fa = after.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  const fb = before.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('9.1 un minuto DESPUÉS de medianoche es hoy', !!fa && (fa.values || {}).recordedToday === true);
  ok('9.2 un minuto ANTES de medianoche no es hoy', !fb || (fb.values || {}).recordedToday === false,
    fb ? JSON.stringify(fb.values) : 'ausente');
  ok('9.3 el corte que publica el hecho es el mismo instante declarado',
    !!fa && Number((fa.values || {}).dayStart) === dayStart);
  ok('9.4 y la ventana del hecho lo nombra como ventana «today»',
    !!fa && fa.window && fa.window.range === 'today'
    && Number(fa.window.startAt) === Number((fa.values || {}).windowStart));
  // LA VENTANA DE SELECCIÓN ES MÁS ANCHA QUE EL DÍA, a propósito: un huso al oeste
  // no puede silenciar una operación de esta mañana (la revisión financiera lo
  // ejecutó). Pero la AFIRMACIÓN de día la sigue decidiendo el calendario.
  ok('9.5 la selección cubre al menos 24 h, aunque el día UTC sea más corto',
    !!fa && Number((fa.values || {}).windowStart) <= nowTs - 864e5,
    JSON.stringify({ windowStart: (fa.values || {}).windowStart, dayStart: (fa.values || {}).dayStart }));
  {
    // Usuario en UTC−7: registra a las 09:00 locales (16:00 UTC del día 14) y abre
    // Aurix a las 18:00 locales (01:00 UTC del día 15). Antes: silencio total.
    const openAt = Date.UTC(2026, 8, 15, 1, 0, 0);
    const opAt   = Date.UTC(2026, 8, 14, 16, 0, 0);
    const west = caseCore(openAt, { ctx: { flows: mk(opAt) } }).core;
    const wf = west.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
    ok('9.6 una operación de esta mañana NO desaparece por el huso',
      !!wf, JSON.stringify((west.dataAvailability.gaps || [])
        .filter(g => g.semanticKey === 'recorded_operations').map(g => g.reason)));
    ok('9.7 …y no se afirma como «hoy» si el día UTC ya cambió: se dice reciente',
      !!wf && (wf.values || {}).recordedToday === false && (wf.values || {}).recordedRecent === true,
      wf ? JSON.stringify(wf.values) : 'ausente');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · LOS SIETE HALLAZGOS DE LA REVISIÓN FINANCIERA, COMO REGRESIÓN
// ════════════════════════════════════════════════════════════════════════════
// Ninguno lo cubría el gate: la primera versión probaba 1 operación y 6, nunca 2;
// y no probaba ni una fila reconstruida ni un metal. El verde no los contradecía.
console.log('\n10 · Regresión de la revisión financiera:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  // ── [crítico] El backfill derivado re-sella la procedencia en cada arranque ──
  // `_aurixPurgeDerivedFlows` + backfill reconstruyen las filas `tx-backfill` en
  // CADA boot con `_aurixCaptureFlow`, así que sellar `recordedAt` allí publicaba
  // «Hoy has registrado N posiciones» sobre compras de 2023, una vez por recarga.
  const derived = [
    { id: 'bk1', ts: nowTs - 700 * DAY, amountUSD: 20000, kind: 'asset_add', assetId: 'msft',
      source: 'tx-backfill', revision: 1, recordedAt: nowTs - HOUR },
    { id: 'bk2', ts: nowTs - 500 * DAY, amountUSD: 14000, kind: 'asset_add', assetId: 'a2',
      source: 'tx-backfill', revision: 1, recordedAt: nowTs - HOUR },
    { id: 'bk3', ts: nowTs - 300 * DAY, amountUSD: 10000, kind: 'asset_add', assetId: 'a4',
      source: 'tx-backfill', revision: 1, recordedAt: nowTs - HOUR },
  ];
  const dv = caseCore(nowTs, { msft: false, ctx: { flows: derived } }).core;
  ok('10.1 una fila RECONSTRUIDA no se publica como operación registrada hoy',
    !dv.ledger.facts.some(f => /registered/.test(f.semanticKey)),
    JSON.stringify(dv.ledger.facts.map(f => f.semanticKey)));
  ok('10.2 y el escritor no sella procedencia en una fila derivada',
    /_aurixFlowIsDerived\(flow\)\)\) flow\.recordedAt = Date\.now\(\)/.test(
      require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8')));

  // ── [crítico] EXACTAMENTE DOS operaciones ────────────────────────────────
  // Antes: camino de «una sola» (nombraba un activo) con la SUMA de las dos.
  const twoMixed = [
    { id: 'buy-msft', ts: nowTs - 2 * HOUR, amountUSD: MSFT_COST, kind: 'asset_add',
      assetId: 'msft', source: 'user', revision: 1, intent: 'INTERNAL_BUY', recordedAt: nowTs - 2 * HOUR },
    { id: 'sell-tsla', ts: nowTs - HOUR, amountUSD: -10000, kind: 'asset_remove',
      assetId: 'a4', source: 'user', revision: 1, intent: 'INTERNAL_SELL', recordedAt: nowTs - HOUR },
  ];
  const two = caseCore(nowTs, { msft: false, ctx: { flows: twoMixed } }).core;
  const tf = two.ledger.facts.find(f => /registered/.test(f.semanticKey));
  ok('10.3 dos operaciones producen el hecho del CONJUNTO, no el de un activo',
    !!tf && tf.semanticKey === 'positions_registered_today',
    tf ? tf.semanticKey : 'ausente');
  ok('10.4 …y no atribuyen la suma a un solo activo',
    !!tf && (tf.values || {}).assetId === null && Number((tf.values || {}).operations) === 2,
    tf ? JSON.stringify(tf.values) : 'ausente');
  ok('10.5 una tanda que MEZCLA compra y venta no publica un importe',
    !!tf && (tf.values || {}).grossUSD === null
    && (tf.values || {}).side === 'mixed' && (tf.values || {}).amountKind === null,
    tf ? JSON.stringify(tf.values) : 'ausente');

  // ── [alto] Metales: `qty × price` NO es el coste ──────────────────────────
  // 100 g de 18K a 3.500 US$/oz: coste ≈ 8.436, `qty × price` = 350.000.
  const GOLD = HOLDINGS.concat([{ id: 'au', ticker: 'XAU', name: 'Gold 18K', type: 'metal',
    qty: 100, price: 3500, karat: 18, goldUnit: 'g' }]);
  const goldFlow = [{ id: 'au1', ts: nowTs - HOUR, amountUSD: 350000, kind: 'asset_add',
    assetId: 'au', source: 'user', revision: 1, intent: 'INTERNAL_BUY', recordedAt: nowTs - HOUR }];
  const g = caseCore(nowTs, { msft: false, ctx: { flows: goldFlow, assets: GOLD } }).core;
  const gf = g.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('10.6 un metal se publica como ACTO, nunca con un coste no certificable',
    !!gf && (gf.values || {}).grossUSD === null && (gf.values || {}).amountKind === null,
    gf ? JSON.stringify(gf.values) : 'ausente');
  ok('10.7 y sin importe certificado no se afirma ningún peso estructural',
    !!gf && (gf.values || {}).shareOfValue === null && (gf.values || {}).significant === false,
    gf ? JSON.stringify({ s: (gf.values||{}).shareOfValue, m: gf.materiality }) : 'ausente');
  ok('10.8 …así que no puede encabezar por una cifra inflada',
    !!gf && gf.materiality < 0.5, gf ? String(gf.materiality) : 'ausente');

  // ── [alto] El lado `out` no tiene coste registrado ───────────────────────
  const sellOnly = [{ id: 'sell1', ts: nowTs - HOUR, amountUSD: -40000, kind: 'asset_remove',
    assetId: 'msft', source: 'user', revision: 1, intent: 'INTERNAL_SELL', recordedAt: nowTs - HOUR }];
  const so = caseCore(nowTs, { msft: false, ctx: { flows: sellOnly } }).core;
  const sf = so.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('10.9 una baja registrada no publica importe ni lo llama coste registrado',
    !!sf && (sf.values || {}).grossUSD === null && (sf.values || {}).amountKind === null
    && (sf.values || {}).side === 'out',
    sf ? JSON.stringify(sf.values) : 'ausente');

  // ── [medio] El tono no lo decide el importe ni el sentido ────────────────
  const inFact = caseCore(nowTs, { ctx: { flows: flowsCase(nowTs, { effectiveAt: nowTs - HOUR, recordedAt: nowTs - HOUR }) } })
    .core.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('10.10 un registro es NEUTRO: ni `is-up` verde ni `is-down` ámbar',
    !!inFact && inFact.direction === 'flat' && inFact.positive === null
    && !!sf && sf.direction === 'flat',
    JSON.stringify({ in: inFact && inFact.direction, out: sf && sf.direction }));
  ok('10.11 …pero el SENTIDO no se pierde: viaja en `values.side`',
    !!inFact && (inFact.values || {}).side === 'in' && (sf.values || {}).side === 'out');

  // ── [medio] La tanda respeta la procedencia ──────────────────────────────
  // Dispositivo B, sin la columna remota: tres filas de hoy SIN `recordedAt`.
  const noProv = [0, 1, 2].map(i => ({ id: 'np' + i, ts: nowTs - HOUR + i, amountUSD: 5000,
    kind: 'asset_add', assetId: 'b' + i, source: 'user', revision: 1, intent: 'INTERNAL_BUY' }));
  const np = caseCore(nowTs, { msft: false, ctx: { flows: noProv } }).core;
  const npf = np.ledger.facts.find(f => /registered/.test(f.semanticKey));
  ok('10.12 una tanda sin procedencia no afirma que se registró hoy',
    !!npf && (npf.values || {}).provenanceKnown === false && (npf.values || {}).recordedToday === false,
    npf ? JSON.stringify(npf.values) : 'ausente');

  // ── [medio] El denominador contiene la operación ─────────────────────────
  const dn = caseCore(nowTs, { ctx: { flows: flowsCase(nowTs, { effectiveAt: nowTs - HOUR, recordedAt: nowTs - HOUR }) } }).core;
  const dnf = dn.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  // El valor invertible vivo de HOLDINGS ≈ 106.868, no el último snapshot (75.510).
  ok('10.13 el peso se mide contra el patrimonio VIVO, que ya contiene la posición',
    !!dnf && Math.abs(Number((dnf.values || {}).shareOfValue) - MSFT_COST / 106868.37) < 0.02,
    dnf ? JSON.stringify({ share: (dnf.values || {}).shareOfValue,
      vsLive: +(MSFT_COST / 106868.37).toFixed(4), vsSnapshot: +(MSFT_COST / 75510).toFixed(4) }) : 'ausente');
}

// ════════════════════════════════════════════════════════════════════════════
// 11 · LOS TRES DEFECTOS QUE INTRODUJO LA PROPIA CORRECCIÓN
// ════════════════════════════════════════════════════════════════════════════
// Los encontró la segunda pasada de la revisión financiera. Ninguno existía antes
// de corregir los siete primeros: bajar el umbral de tanda a dos y abrir la
// ventana a 24 h hicieron alcanzables caminos que nadie había probado.
console.log('\n11 · Regresión de la segunda pasada de revisión:');
{
  const nowTs = T0 + 5 * DAY + 12 * HOUR;
  const mkOp = (id, ts, amt, kind, asset, rec) => ({ id, ts, amountUSD: amt, kind: kind,
    assetId: asset, source: 'user', revision: 1,
    intent: kind === 'asset_remove' ? 'INTERNAL_SELL' : 'INTERNAL_BUY',
    recordedAt: rec != null ? rec : ts });

  // ── [alto] Una tanda de BAJAS no es un alta de posiciones ────────────────
  const twoOut = [
    mkOp('s1', nowTs - 3 * HOUR, -12000, 'asset_remove', 'a4'),
    mkOp('s2', nowTs - 2 * HOUR, -8000,  'asset_remove', 'a5'),
  ];
  const so = caseCore(nowTs, { msft: false, ctx: { flows: twoOut } }).core;
  const sf = so.ledger.facts.find(f => /registered/.test(f.semanticKey));
  ok('11.1 dos bajas registradas se etiquetan como `out`, nunca como `mixed`',
    !!sf && (sf.values || {}).side === 'out', sf ? JSON.stringify(sf.values) : 'ausente');
  ok('11.2 …y una tanda de bajas no publica importe',
    !!sf && (sf.values || {}).grossUSD === null && (sf.values || {}).amountKind === null);

  // Y la mixta sí es mixta.
  const mixed = [
    mkOp('m1', nowTs - 3 * HOUR, 20000,  'asset_add',    'msft'),
    mkOp('m2', nowTs - 2 * HOUR, -8000,  'asset_remove', 'a5'),
  ];
  const mf = caseCore(nowTs, { msft: false, ctx: { flows: mixed } }).core
    .ledger.facts.find(f => /registered/.test(f.semanticKey));
  ok('11.3 una tanda con los dos lados sí es `mixed`',
    !!mf && (mf.values || {}).side === 'mixed', mf ? JSON.stringify(mf.values) : 'ausente');

  // ── [medio] «Hoy» exige que TODAS sean de hoy ────────────────────────────
  // Ventana abierta a 24 h: una compra de ayer 20:00 UTC y otra de hoy 09:00 UTC.
  const openAt = Date.UTC(2026, 8, 15, 10, 0, 0);
  const straddle = [
    mkOp('y1', Date.UTC(2026, 8, 14, 20, 0, 0), 15000, 'asset_add', 'a2'),
    mkOp('t1', Date.UTC(2026, 8, 15,  9, 0, 0), 20000, 'asset_add', 'msft'),
  ];
  const st = caseCore(openAt, { msft: false, ctx: { flows: straddle } }).core;
  const stf = st.ledger.facts.find(f => /registered/.test(f.semanticKey));
  ok('11.4 una tanda que desborda el día NO se afirma como «hoy»',
    !!stf && Number((stf.values || {}).operations) === 2
    && (stf.values || {}).recordedToday === false
    && (stf.values || {}).recordedRecent === true,
    stf ? JSON.stringify(stf.values) : 'ausente');
  // Y cuando TODAS son de hoy, sí.
  const bothToday = [
    mkOp('t2', Date.UTC(2026, 8, 15, 8, 0, 0), 15000, 'asset_add', 'a2'),
    mkOp('t3', Date.UTC(2026, 8, 15, 9, 0, 0), 20000, 'asset_add', 'msft'),
  ];
  const btf = caseCore(openAt, { msft: false, ctx: { flows: bothToday } }).core
    .ledger.facts.find(f => /registered/.test(f.semanticKey));
  ok('11.5 …y sí se afirma cuando todas lo son',
    !!btf && (btf.values || {}).recordedToday === true);

  // ── [medio] El peso exige la misma época ─────────────────────────────────
  // Compra de 2021 registrada HOY: el coste es de entonces, el patrimonio de ahora.
  const oldBuy = [mkOp('o1', nowTs - 1500 * DAY, 5000, 'asset_add', 'msft', nowTs - HOUR)];
  const ob = caseCore(nowTs, { msft: false, ctx: { flows: oldBuy } }).core;
  const obf = ob.ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('11.6 un coste histórico no se divide por el patrimonio de hoy',
    !!obf && (obf.values || {}).shareOfValue === null
    && (obf.values || {}).significant === false,
    obf ? JSON.stringify(obf.values) : 'ausente');
  ok('11.7 …pero el ACTO se publica igual, con materialidad informativa',
    !!obf && (obf.values || {}).recordedToday === true
    && (obf.values || {}).effectiveToday === false && obf.materiality < 0.5,
    obf ? JSON.stringify({ m: obf.materiality }) : 'ausente');
  ok('11.8 y aun informativo sigue mereciendo su sitio en la superficie',
    (ob.topStories || []).some(s => /^operation_registered/.test(s.semanticKey)),
    JSON.stringify((ob.topStories || []).map(s => s.semanticKey)));
  // Con fecha económica de hoy el peso sí se publica.
  const todayBuy = [mkOp('n1', nowTs - HOUR, MSFT_COST, 'asset_add', 'msft')];
  const tbf = caseCore(nowTs, { msft: false, ctx: { flows: todayBuy } }).core
    .ledger.facts.find(f => /^operation_registered/.test(f.semanticKey));
  ok('11.9 con la operación y la valoración en la misma época sí hay peso',
    !!tbf && Number.isFinite(Number((tbf.values || {}).shareOfValue))
    && (tbf.values || {}).shareOfValue > 0,
    tbf ? JSON.stringify((tbf.values || {}).shareOfValue) : 'ausente');
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
