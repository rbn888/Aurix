'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INTEL-COHERENCE-LANGUAGE-harness — CIERRE QUIRÚRGICO · COHERENCIA Y LENGUAJE
// ════════════════════════════════════════════════════════════════════════════
// El caso de la captura: en la misma pantalla «Tu liquidez bajó 3 pp mientras tu
// posición principal ya pesa el 30 %» y «Tu liquidez subió 39,9 pp en los últimos
// 30 días». Las dos cifras eran CIERTAS: el descubrimiento tomaba la peor caída
// de liquidez entre 24H/7D/30D/90D (aquí la de 7D) y la publicaba SIN su ventana.
// Este gate ejecuta el ledger, el Core, los descubrimientos y la copy REALES (los
// dos idiomas) con el cargador de AURIX-EVIDENCE-CONTRACT, que es el harness que
// ya certifica la evidencia de deriva; sólo cambia lo que se comprueba.
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
  'intel_ack','intel_ack_aria','intv4_f_expo_up','intv4_f_expo_down',
  // Las claves de ESTE cierre. Las retiradas se piden también: si volvieran a
  // existir en un diccionario, el caso «sin pp» lo vería.
  'intv4_f_cash_move','intv4_w_liqconc','intv4_w_liqconc_ctx','intv4_f_cash_up','intv4_f_cash_down','intv4_f_liq_better',
  'intv4_r_24h','intv4_r_7d','intv4_r_30d','intv4_r_90d','intv4_r_all','intv4_r_now','intv6_r_effective_days',
  'intv4_cat_liquidity','intv4_cat_crypto','intv5_cat_crypto','intv4_discovery_title',
  'intv21_log_title','intv21_log_state_reviewed','intv21_log_state_recorded','intv21_fam_liquidity','intv21_fam_other',
  // ÚLTIMO AJUSTE DE CIERRE
  'intv4_f_asof','intv4_f_level','intv4_f_level_asof','intv4_f_cash','intel_d_liq_need','intv4_w_multi',
  'intv21_today_driver_up','intv21_today_driver_down','intprev_f_conc','intprev_f_liq',
  'intv19_evo_conc_up','intv19_evo_conc_down','intv21_xa_conc_up','intv21_xa_conc_down','intv9_xa_lead_new','intv9_xa_lead_both',
  // SPEC ADVANCED INTELLIGENCE · §2/§3 — la copy de nivel y de registro se extrae
  // de app.js en los DOS idiomas, no se declara aquí: un diccionario propio
  // certificaría el harness en vez del producto (la lección de `formatBase`).
  'intv4_f_level','intv4_f_level_up','intv4_f_level_down',
  'intv4_f_op_recorded','intv4_f_op_bought','intv4_f_op_removed','intv4_f_op_holding',
  'intv4_f_ops_batch','intv4_why_recorded_operation','intv4_why_recorded_operation_share',
  'intv4_f_op_recorded_na','intv4_f_op_bought_na','intv4_f_op_recent','intv4_f_op_recent_out',
  'intv4_f_ops_batch_na','intv4_f_ops_batch_recent','intv4_f_ops_batch_holding',
  'intv4_f_ops_batch_out','intv4_f_ops_batch_out_recent','intv4_f_ops_batch_mixed',
  'intv4_f_ops_batch_mixed_recent','intv4_why_recorded_operations_share',
  'intv4_f_op_removed_nd','intv4_f_ops_batch_out_nd','intv4_f_ops_batch_mixed_nd'];
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
// Las etiquetas de ventana comparten línea (`intv4_r_24h: …, intv4_r_7d: …`): se
// leen las dos líneas enteras de cada idioma, verbatim.
['intv4_r_24h', 'intv4_r_90d', 'intv4_r_all', 'intv4_when_today'].forEach(k => [0, 1].forEach(li => {
  const occ = keyOccurrences(k); const st = occ[li]; const body = app.slice(st, app.indexOf('\n', st)).replace(/,\s*$/, '');
  Object.assign(DICT[li ? 'en' : 'es'], (new Function('return ({ ' + body + ' });'))());
}));
const DAY = 864e5, MIN = 60000;
const NOW = Date.now();
const T0 = NOW - 60 * DAY;

const CONSTS = ['_AURIX_CATHIST_CANONICAL','_AURIX_INTEL_MEM_MAX_ENTRIES','_AURIX_INTEL_CTX_KEY','_AURIX_INTEL_CTX_KEY_LEGACY','_AURIX_INTEL_PROVENANCE','_AURIX_INTEL_FIELDS','_AURIX_INTEL_EXCLUSIVE_CLAIMS','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS',
  '_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR','_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS',
  '_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD','_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES',
  '_AURIX_RETURN_MIN_HISTORY_MS','_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT',
  '_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL','_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY',
  '_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_REGISTERED_OP_KINDS','_AURIX_REGISTERED_OP_BATCH_MIN','_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_FACT_CONTRACT_VERSION',
  '_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_AURIX_QUESTION_CATALOG',
  '_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT',
  '_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_INTEL_DIM_ROOT','_AURIX_AI_EVOLUTION_RANGES','_INTV4_BRIEF_MAX','_AURIX_LOSS_TIER','_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE','_INTV4_EXPLORE_PERIOD_WEEKS','_INTV4_PERIMETER','_AURIX_TODAY_HISTORICAL_RANGES','_INTV5_TIER'];
const FNS = ['_intv4ExploreRotation','_intv4ExploreSeed','_intv4Perimeter','_intv4ActiveReviewFindings','_aurixNow','_aurixTodayEventAt','_aurixTodayIsRecentClaim','_aurixTodayDatedAt','_aurixTodayFresh','_aurixTodayDataStale','_intv5RecencyTier','_intv4FindingRows','_aurixLossImpactShare','_aurixLossSeverityTier','_aurixEpisodeOf','_aurixIntelResolveCertified','toBase','_intv5MattersStories','_aurixIntelAcknowledge','_aurixIntelCtxReadPolicy','_aurixIntelCtxRecord','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner','_aurixIntelCtxMerge','_nativeToUSD','_intv4T','_intv4Num','_intv4Money','_intv4CatLabel','_intv5CatLabel','_intv4RangeLabel','_intv4WindowLabel','_intv4FactText','_intv4WhyText','_aurixAdoptRemoteClassificationLineage','_aurixLineageWrite','_aurixLineageMerge','_aurixLineageForBackend','_aurixDisplayCategory','_aurixPositionFromAsset','computePositionPerformance','getDisplayName','formatCurrency','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
  'activeAssets','isInvestableAsset','investableAssets','investableValueUSD','liquidityNominal',
  'assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete','_aurixFlowIsInternal','_aurixFlowIntentOf',
  '_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey',
  '_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixLoadCapitalFlows','_aurixSaveCapitalFlows',
  '_aurixNewFlowId','_aurixCaptureFlow','_aurixPurgeDerivedFlows',
  '_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixFlowCounterpartObserved',
  '_aurixInvestablePerformance','_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct',
  '_aurixCatHistWindow','_aurixCatExposureDelta','_aurixFactClamp01','_aurixEffectiveDiversification',
  '_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','_aurixEvidence',
  '_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth',
  '_aurixEventIdentity','_aurixCanonicalFindings','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixFactPeriodNamedAs','_aurixFactPeriodDegraded','_aurixFactEnvelope','_aurixIntelligenceCore',
  // Lo que este cierre toca o consume, ejecutado tal cual:
  '_intccDate','_intv21Fixed','_intv21Pct','_intv4PctPair','_aurixDriftClaimCoherent','_aurixDriftConflicts',
  '_intv4WowText','_intv4DiscoveryHtml','_intccEsc','_intv17EvId','_intv17IsHoyEvent','_intv21LogItems','_intv21LogHtml',
  '_intccDateTime','_aurixPctNum','_intv4AsOf','_intv4IsCurrent','_intv4AsOfStale','_intv4TopIsLiquidity','_intccIsMonetary','_intv4When','_intv4Tone','_intelDiscoveryText','_aurixAiLiquidity','_aurixAiNum'];

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
  ['_AURIX_AI_AVAIL','_AURIX_AI_COVERAGE','_AURIX_AI_LABEL','_AURIX_AI_DIM'].forEach(n => { try { vm.runInContext(konstSrc(n), sb); } catch (_) {} });
  sb._intv21Now = () => NOW;
  sb._INTV21_DAY = DAY;
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
  if (sb.__lineage) vm.runInContext('__store[_AURIX_LINEAGE_KEY] = ' + JSON.stringify(JSON.stringify(sb.__lineage)), sb);
  return sb;
}
const run = (expr, ctx) => vm.runInContext(expr, ctx);
const core = (o, coreOpts) => run('_aurixIntelligenceCore(' +
  JSON.stringify(Object.assign({ now: NOW }, coreOpts || {})) + ')', makeCtx(o));

// ── fixtures ────────────────────────────────────────────────────────────────
function srvRow(tsMs, cats) {
  const all = Object.assign({}, cats);
  let total = 0; for (const k in all) total += all[k];
  return { ts: tsMs, total_value_usd: +total.toFixed(2), real_estate: all.real_estate || 0, category_values: all };
}
// Tres tramos REALES: hace 30 días, hace 7 días y ahora. Cuatro capturas por
// tramo, cada 15 minutos, y la última fresca (el lector exige un presente).
function phases(endTs, a30, a7, now) {
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push(srvRow(endTs - 30 * DAY + i * 15 * MIN, a30));
  for (let i = 0; i < 4; i++) rows.push(srvRow(endTs - 7 * DAY + i * 15 * MIN, a7));
  for (let i = 3; i >= 0; i--) rows.push(srvRow(endTs - i * 15 * MIN, now));
  return rows;
}
const A = (id, type, qty, price, cur) => ({ id, type, qty, price, assetCurrency: cur || 'USD', ticker: id });
const SNAP = { assetCount: 3, totUSD: 100000, cashPct: 30, uncertifiablePositions: 0,
  topInvestedAsset: { name: 'BTC', type: 'crypto', pctTotal: 30 }, topCategory: { label: 'Cripto', pctTotal: 70 } };
const DRIVERS = { items: [], pct: 71 };
const ASSETS = [A('btc', 'crypto', 1, 30000), A('eth', 'crypto', 10, 4000), A('eur', 'cash', 30000, 1)];
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const esc = 's => String(s == null ? "" : s)';
const wowOf = (d) => (d.wowInsights || []).find(w => w.semanticKey === 'wow_liquidity_down_while_concentrated') || null;
const txtIn = (expr, lang, o) => run(expr, makeCtx(Object.assign({}, o || {}, { lang })));
const factTxt = (f, lang) => txtIn('_intv4FactText(' + JSON.stringify(f) + ')', lang);
const wowTxt  = (w, lang) => txtIn('_intv4WowText(' + JSON.stringify(w) + ')', lang);
const NO_JARGON = t => !/\bpp\b|puntos porcentuales|percentage points/.test(t);
const NO_CAUSAL = t => !/mientras|\bya\b|porque|while|already|because/i.test(t);

console.log('AURIX-INTEL-COHERENCE-LANGUAGE — cierre quirúrgico\n');

// ════════════════════════════════════════════════════════════════════════════
// 0 · EL CASO DE LA CAPTURA, REPRODUCIDO CON EL LEDGER REAL
// ════════════════════════════════════════════════════════════════════════════
console.log('0 · La captura: 7D baja y 30D sube en la misma cartera:');
const endTs = NOW;
const CAPTURE = { serverRows: phases(endTs, { crypto: 97000, liquidity: 3000 },
                                            { crypto: 67000, liquidity: 33000 },
                                            { crypto: 70000, liquidity: 30000 }),
                  rows: [], assets: ASSETS, snap: SNAP, drivers: DRIVERS };
const cap = core(CAPTURE, { ranges: ['7D', '30D'] });
const f7 = cap.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
const f30 = cap.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_30D');
const w = wowOf(cap);
ok('0.1 las DOS lecturas son ciertas: 7D −3 pp (33 → 30) y 30D +27 pp (3 → 30)',
  !!f7 && !!f30 && f7.value === -3 && f30.value === 27
  && f7.values.startPct === 33 && f30.values.startPct === 3 && f7.values.endPct === 30,
  JSON.stringify({ f7: f7 && f7.values, f30: f30 && f30.values }));
ok('0.2 el descubrimiento existe y se apoya en la de 7D (la caída), con SU ventana',
  !!w && w.values.window && w.values.window.range === '7D' && w.values.startPct === 33 && w.values.endPct === 30,
  JSON.stringify(w && w.values));
const wEs = w ? wowTxt(w, 'es') : '', wEn = w ? wowTxt(w, 'en') : '';
ok('0.3 la frase DECLARA el periodo y los dos extremos, y no usa «pp»',
  /En los últimos 7 días/.test(wEs) && /del 33,0\s?% al 30,0\s?%/.test(wEs) && NO_JARGON(wEs), wEs);
ok('0.4 …y da la otra ventana con sus extremos: nada queda como contradicción aparente',
  /en los últimos 30 días, del 3,0\s?% al 30,0\s?%/.test(wEs), wEs);
ok('0.5 sin «mientras», «ya» ni «porque»: la concentración es un hecho SEPARADO',
  NO_CAUSAL(wEs) && /\. Tu mayor posición pesa el 30\s?%/.test(wEs), wEs);
ok('0.6 EN equivalente', /Over the last 7 days, cash went from 33\.0\s?% to 30\.0\s?%/.test(wEn)
  && /over the last 30 days, from 3\.0\s?% to 30\.0\s?%/.test(wEn) && NO_JARGON(wEn) && NO_CAUSAL(wEn), wEn);
const t30 = factTxt(f30, 'es'), t7 = factTxt(f7, 'es');
ok('0.7 el hecho de 30D: «En los últimos 30 días, la liquidez pasó del 3,0 % al 30,0 % de tu cartera financiera» (el perímetro lo nombra `_intv4Perimeter`)',
  /^En los últimos 30 días, la liquidez pasó del 3,0\s?% al 30,0\s?% de tu cartera financiera$/.test(t30), t30);
ok('0.8 el de 7D, con la misma forma: direcciones opuestas, ventanas explícitas',
  /^En los últimos 7 días, la liquidez pasó del 33,0\s?% al 30,0\s?%/.test(t7), t7);
ok('0.9 EN de los hechos', /^Over the last 30 days, cash went from 3\.0\s?% to 30\.0\s?% of your financial portfolio$/.test(factTxt(f30, 'en')),
  factTxt(f30, 'en'));
ok('0.10 ninguna clave de copy con «pp» sobrevive para estos hechos (retiradas en los dos idiomas)',
  ['es', 'en'].every(l => DICT[l].intv4_f_cash_up === undefined && DICT[l].intv4_f_cash_down === undefined
    && DICT[l].intv4_f_liq_better === undefined));
const disc = run('_intv4DiscoveryHtml(' + JSON.stringify(cap) + ', ' + esc + ', [], [])', makeCtx({ lang: 'es' }));
ok('0.11 la superficie «Puede que no hayas visto esto» publica la frase nueva',
  /data-wow="wow_liquidity_down_while_concentrated"/.test(disc) && strip(disc).indexOf(wEs) >= 0, strip(disc));

// ════════════════════════════════════════════════════════════════════════════
// 1 · MISMO PERIODO, DIRECCIONES CONTRADICTORIAS ⇒ NO SE PUBLICA EL DERIVADO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n1 · Coherencia: mismas métrica, universo y periodo deben coincidir:');
{
  const facts = JSON.parse(JSON.stringify(cap.ledger.facts));
  const bad = JSON.parse(JSON.stringify(f7));
  bad.semanticKey = 'cash_drift_liquidity_7D_dup'; bad.value = 3; bad.values.deltaPp = 3;
  bad.values.startPct = 27; bad.values.endPct = 30;           // MISMA ventana, dirección opuesta
  const ctx = makeCtx({});
  const conf = run('Array.from(_aurixDriftConflicts(' + JSON.stringify(facts.concat([bad])) + '))', ctx);
  ok('1.1 la contradicción se DETECTA (las dos claves quedan marcadas)',
    conf.indexOf('cash_drift_liquidity_7D') >= 0 && conf.indexOf('cash_drift_liquidity_7D_dup') >= 0, JSON.stringify(conf));
  const wow = run('_aurixWowInsights({ facts: ' + JSON.stringify(facts.concat([bad])) + ' })', ctx);
  ok('1.2 …y el descubrimiento derivado NO se publica mientras no se resuelva',
    !wow.some(x => x.semanticKey === 'wow_liquidity_down_while_concentrated'), JSON.stringify(wow.map(x => x.semanticKey)));
  const self = JSON.parse(JSON.stringify(f7)); self.values.startPct = 25;   // delta −3 con extremos que dicen +5
  ok('1.3 un hecho cuyos extremos desmienten su propio delta no es coherente',
    run('_aurixDriftClaimCoherent(' + JSON.stringify(self) + ')', ctx) === false
    && run('_aurixDriftClaimCoherent(' + JSON.stringify(f7) + ')', ctx) === true);
  ok('1.4 …y su frase no se publica (no se reconstruye nada desde el delta)', factTxt(self, 'es') === '', factTxt(self, 'es'));
  const wow2 = run('_aurixWowInsights({ facts: ' + JSON.stringify(facts.filter(f => f.semanticKey !== 'cash_drift_liquidity_7D').concat([self])) + ' })', ctx);
  ok('1.5 …ni el descubrimiento que se apoyaría en él',
    !wow2.some(x => x.semanticKey === 'wow_liquidity_down_while_concentrated'));
  ok('1.6 periodos DISTINTOS con direcciones opuestas NO son contradicción (el caso de la captura sigue publicándose)',
    run('_aurixDriftConflicts(' + JSON.stringify(facts) + ').size', ctx) === 0 && !!w);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · PESO, NO DINERO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · El peso de la liquidez baja con el saldo constante:');
{
  const d = core({ serverRows: phases(endTs, { crypto: 30000, liquidity: 10000 }, { crypto: 30000, liquidity: 10000 },
                                               { crypto: 60000, liquidity: 10000 }),
                   rows: [], assets: ASSETS, snap: SNAP, drivers: DRIVERS }, { ranges: ['7D'] });
  const c = d.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_7D');
  const es = c ? factTxt(c, 'es') : '', en = c ? factTxt(c, 'en') : '';
  ok('2.1 se publica como DILUCIÓN, con su periodo, sin «bajó» ni «pp»',
    !!c && c.values.dilutedBy && /no ha bajado/.test(es) && /en los últimos 7 días/.test(es) && NO_JARGON(es), es);
  ok('2.2 …ni retirada, salida o pérdida, en ningún idioma',
    !/retir|sali[óo]|pérdida|perdi/i.test(es) && !/withdr|outflow|loss|lost/i.test(en) && /over the last 7 days/.test(en), en);
  const wd = wowOf(d);
  ok('2.3 el descubrimiento no lo convierte en «tu liquidez bajó»',
    !wd || (NO_JARGON(wowTxt(wd, 'es')) && !/bajó/.test(wowTxt(wd, 'es'))), wd && wowTxt(wd, 'es'));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · PRECISIÓN: EXTREMOS, DELTA Y CONCLUSIÓN COMPATIBLES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Precisión adaptativa compartida con «Tu evolución»:');
{
  const ctx = makeCtx({});
  const P = (a, b) => run('_intv4PctPair(' + a + ',' + b + ')', ctx);
  const p1 = P(30.01, 30.04);
  ok('3.1 extremos que a 1 decimal se leen iguales pasan a 2 (nunca «30,0 % → 30,0 %» con un cambio)',
    !!p1 && p1.a === '30,01%' && p1.b === '30,04%', JSON.stringify(p1));
  ok('3.2 sin diferencia publicable (ni a 2 decimales) ⇒ no hay comparación', P(30.001, 30.003) === null);
  ok('3.3 extremos no finitos ⇒ no hay comparación (no se inventan cifras)', P('null', 30) === null && P(30, 'NaN') === null);
  const ff = JSON.parse(JSON.stringify(f7)); ff.values.startPct = 30.01; ff.values.endPct = 30.04; ff.value = 0.03; ff.values.deltaPp = 0.03;
  ok('3.4 la frase usa esos mismos extremos', /del 30,01\s?% al 30,04\s?%/.test(factTxt(ff, 'es')), factTxt(ff, 'es'));
  const fe = JSON.parse(JSON.stringify(f7)); delete fe.values.startPct; delete fe.values.endPct;
  ok('3.5 un hecho SIN extremos no se reconstruye desde el delta redondeado', factTxt(fe, 'es') === '' && factTxt(fe, 'en') === '');
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · DATOS ANTIGUOS, COBERTURA PARCIAL, FUENTE FALLIDA Y LLEGADA TARDÍA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · Vigencia y cobertura:');
{
  const stale = core(Object.assign({}, CAPTURE, { serverRows: phases(endTs - 3 * DAY, { crypto: 97000, liquidity: 3000 },
      { crypto: 67000, liquidity: 33000 }, { crypto: 70000, liquidity: 30000 }) }), { ranges: ['7D', '30D'] });
  ok('4.1 DATO ANTIGUO (último hace 3 días): ninguna deriva ni descubrimiento se llama «últimos N días»',
    !stale.ledger.facts.some(f => /^cash_drift_/.test(f.semanticKey)) && !wowOf(stale));
  const partial = core(Object.assign({}, CAPTURE, { serverRows: CAPTURE.serverRows.filter(r => r.ts > endTs - 10 * DAY) }),
    { ranges: ['7D', '30D'] });
  ok('4.2 COBERTURA PARCIAL (10 días de historia): 30D no se publica; 7D sí, con su nombre',
    !partial.ledger.facts.some(f => f.semanticKey === 'cash_drift_liquidity_30D')
    && partial.ledger.facts.some(f => f.semanticKey === 'cash_drift_liquidity_7D'));
  const pw = wowOf(partial);
  ok('4.3 …y el descubrimiento sólo nombra la ventana que existe (sin «30 días»)',
    !!pw && !pw.values.context && !/30 días/.test(wowTxt(pw, 'es')), pw && wowTxt(pw, 'es'));
  const failed = core(Object.assign({}, CAPTURE, { hydration: 'error' }), { ranges: ['7D', '30D'] });
  ok('4.4 FUENTE FALLIDA: ni derivas ni descubrimiento, sin cifra inventada',
    !failed.ledger.facts.some(f => /^cash_drift_/.test(f.semanticKey)) && !wowOf(failed));
  // LLEGADA TARDÍA: primero sólo 10 días, después la historia completa. Texto y
  // evidencia salen de la MISMA lectura, así que cambian juntos.
  const ctx = makeCtx(Object.assign({}, CAPTURE, { serverRows: CAPTURE.serverRows.filter(r => r.ts > endTs - 10 * DAY) }));
  const before = run('_aurixIntelligenceCore(' + JSON.stringify({ now: NOW, ranges: ['7D', '30D'] }) + ')', ctx);
  vm.runInContext('_aurixBackendSnapshots = ' + JSON.stringify(CAPTURE.serverRows), ctx);
  ctx._aurixBackendSnapshots = CAPTURE.serverRows;
  const after = run('_aurixIntelligenceCore(' + JSON.stringify({ now: NOW, ranges: ['7D', '30D'] }) + ')', ctx);
  const wb = wowOf(before), wa = wowOf(after);
  const ta = wa ? run('_intv4WowText(' + JSON.stringify(wa) + ')', ctx) : '';
  ok('4.5 LLEGADA TARDÍA: el texto incorpora la ventana nueva a la vez que su evidencia',
    !!wb && !wb.values.context && !!wa && !!wa.values.context && wa.values.context.window.range === '30D'
    && /30 días, del 3,0\s?% al 30,0\s?%/.test(ta), ta);
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · CUENTA, MONEDA Y RESET
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Sin evidencia reutilizada entre cuentas, monedas o resets:');
{
  const reset = core(Object.assign({}, CAPTURE, { epoch: endTs - 3 * DAY }), { ranges: ['7D', '30D'] });
  ok('5.1 RESET dentro de la ventana: ni derivas ni descubrimiento (dos carteras no se comparan)',
    !reset.ledger.facts.some(f => /^cash_drift_/.test(f.semanticKey)) && !wowOf(reset));
  const eur = core(Object.assign({}, CAPTURE, { baseCurrency: 'EUR' }), { ranges: ['7D', '30D'] });
  const we = wowOf(eur);
  ok('5.2 MONEDA: un peso no depende de la moneda base — mismos extremos en EUR que en USD',
    !!we && we.values.startPct === w.values.startPct && we.values.endPct === w.values.endPct
    && wowTxt(we, 'es') === wEs);
  // CUENTA: el Core se recalcula por pintura desde la historia de la cuenta
  // activa; el descubrimiento de otra cuenta no viaja a la siguiente.
  const other = core(Object.assign({}, CAPTURE, { serverRows: phases(endTs, { crypto: 50000, liquidity: 50000 },
      { crypto: 50000, liquidity: 50000 }, { crypto: 50000, liquidity: 50000 }) }), { ranges: ['7D', '30D'] });
  ok('5.3 CAMBIO DE CUENTA: la cuenta sin derivas no hereda la frase de la anterior',
    !wowOf(other) && !other.ledger.facts.some(f => /^cash_drift_/.test(f.semanticKey)));
  ok('5.4 la puerta de evidencia de la deriva lleva cuenta y epoch (contrato existente, no re-derivado)',
    /accountId: \(typeof _aurixActiveUserId/.test(app) && !!f7 && f7.evidence && f7.evidence.ok === true);
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · REGISTRO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Registro: fecha de la lectura ≠ periodo descrito; nada reconstruido:');
{
  const ctx = makeCtx({ lang: 'es' });
  const mk = (f) => ({ ledger: { facts: [f] }, findings: [],
    findingsAll: [{ semanticKey: f.semanticKey, findingId: 'fd-' + f.semanticKey }] });
  const items = run('_intv21LogItems(' + JSON.stringify(mk(f30)) + ', [])', ctx);
  ok('6.1 una lectura revisada lleva el PERIODO dentro de la frase y la fecha de su extremo en la cabecera',
    items.length === 1 && /^En los últimos 30 días, la liquidez pasó del 3,0\s?% al 30,0\s?%/.test(items[0].txt)
    && items[0].at === f30.window.endAt && items[0].state === 'reviewed', JSON.stringify(items));
  const old = JSON.parse(JSON.stringify(f30)); delete old.values.startPct; delete old.values.endPct;
  const oldItems = run('_intv21LogItems(' + JSON.stringify(mk(old)) + ', [])', ctx);
  ok('6.2 una entrada antigua SIN extremos no se completa por inferencia: no hay fila', oldItems.length === 0, JSON.stringify(oldItems));
  const html = run('_intv21LogHtml(' + JSON.stringify(items) + ', ' + esc + ')', ctx);
  ok('6.3 «Revisado» se conserva', /data-state="reviewed"/.test(html) && /Revisado/.test(html));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · EXPOSICIÓN: MISMA FORMA, SIN «pp»
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Las demás derivas de peso hablan igual:');
{
  const fx = { semanticKey: 'exposure_drift_crypto_30D', causalRoot: 'category_mix', family: 'exposure', value: -12.5,
    unit: 'percentage_points', window: { range: '30D', startAt: endTs - 30 * DAY, endAt: endTs },
    values: { startPct: 62.5, endPct: 50, deltaPp: -12.5, category: 'crypto', causeKnown: true } };
  const es = factTxt(fx, 'es'), en = factTxt(fx, 'en');
  ok('7.1 con causa corroborada: periodo + extremos, sin «pp» (ES)',
    /^En los últimos 30 días, tu exposición a .+ bajó del 62,5\s?% al 50,0\s?%$/.test(es) && NO_JARGON(es), es);
  ok('7.2 EN', /^Over the last 30 days, your exposure to .+ fell from 62\.5\s?% to 50\.0\s?%$/.test(en) && NO_JARGON(en), en);
  const nw = JSON.parse(JSON.stringify(fx)); nw.window = { startAt: endTs - DAY, endAt: endTs };
  ok('7.3 sin periodo nombrable no hay comparación', factTxt(nw, 'es') === '', factTxt(nw, 'es'));
}


// ════════════════════════════════════════════════════════════════════════════
// 8 · ÚLTIMO AJUSTE · LA LIQUIDEZ ES INFORMATIVA, NO UNA MEJORA
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · Liquidez neutral (sube o baja) y agregado de mejoras correcto:');
{
  const li = cap.ledger.facts.find(f => f.semanticKey === 'liquidity_improved');
  ok('8.1 la subida de liquidez SIGUE en el ledger con su evidencia y su materialidad (no se pierde el hallazgo)',
    !!li && li.value === f30.value && li.materiality === f30.materiality
    && JSON.stringify(li.window) === JSON.stringify(f30.window) && li.supportingKeys[0] === 'cash_drift_liquidity_30D');
  ok('8.2 …pero no es una MEJORA: ni `positive`, ni en positiveDevelopments', li.positive !== true
    && !cap.positiveDevelopments.some(f => f.semanticKey === 'liquidity_improved'));
  ok('8.3 su frase es la neutra de la deriva (sin «mejorado»)', factTxt(li, 'es') === t30 && !/mejor/i.test(factTxt(li, 'es')));
  const ctx = makeCtx({});
  const tone = f => run('_intv4Tone(' + JSON.stringify(f) + ')', ctx);
  ok('8.4 el tono de la liquidez es NEUTRO subiendo y bajando (ni verde de éxito ni naranja de alerta)',
    tone(f30) === 'flat' && tone(f7) === 'flat' && tone(li) === 'flat');
  const ex = cap.ledger.facts.find(f => /^exposure_drift_crypto_/.test(f.semanticKey));
  ok('8.5 …y las demás familias conservan su dirección', !!ex && tone(ex) === ex.direction);
  // Agregado: dos raíces positivas reales ⇒ «Han mejorado 2»; con la liquidez como
  // única compañía de un rendimiento positivo, ya no hay «varias dimensiones».
  const posRet = { semanticKey: 'return_positive', causalRoot: 'investable_return', family: 'performance', positive: true,
    value: 3, unit: 'percent', confidence: 1, priority: 0.5, values: {}, window: { range: '30D', startAt: endTs - 30 * DAY, endAt: endTs } };
  const ath = { semanticKey: 'investable_all_time_high', causalRoot: 'wealth_level', family: 'wealth_level', positive: true,
    value: 1, unit: 'base_currency', confidence: 1, priority: 0.4, values: {}, window: { range: 'all', startAt: endTs - 90 * DAY, endAt: endTs } };
  const multiOf = facts => run('_aurixWowInsights({ facts: ' + JSON.stringify(facts) + ' })', ctx)
    .find(w => w.semanticKey === 'wow_multi_dimension_improvement') || null;
  ok('8.6 rendimiento positivo + subida de liquidez ⇒ NO «Han mejorado 2 dimensiones»',
    !multiOf(cap.ledger.facts.concat([posRet])));
  const m2 = multiOf(cap.ledger.facts.concat([posRet, ath]));
  ok('8.7 dos mejoras publicables reales ⇒ la cifra es 2 y no cuenta la liquidez',
    !!m2 && m2.values.roots.length === 2 && m2.values.roots.indexOf('cash_weight') < 0
    && /Han mejorado 2 /.test(wowTxt(m2, 'es')), JSON.stringify(m2 && m2.values));
  const down = cap.ledger.facts.filter(f => f.semanticKey === 'cash_drift_liquidity_7D')[0];
  ok('8.8 la BAJADA de liquidez no se convierte en alerta: tono neutro y sin `positive:false` inventado',
    tone(down) === 'flat' && down.positive === null);
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · ÚLTIMO AJUSTE · HISTÓRICO FRENTE A VIVO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · El extremo histórico se fecha cuando no coincide con el dato vivo:');
{
  // Mismo historial que la captura, con el snapshot vivo en 29 % (el histórico acaba en 30 %).
  const live29 = core(Object.assign({}, CAPTURE, { snap: Object.assign({}, SNAP, { cashPct: 29.2 }) }), { ranges: ['7D', '30D'] });
  const c30 = live29.ledger.facts.find(f => f.semanticKey === 'cash_drift_liquidity_30D');
  const es = factTxt(c30, 'es'), en = factTxt(c30, 'en');
  ok('9.1 el extremo histórico NO se sustituye por el vivo (sigue «al 30,0 %»)', /al 30,0\s?%/.test(es) && c30.values.endPct === 30, es);
  ok('9.2 …y se fecha discretamente: «según el dato del …» con día y hora', /, según el dato del \d+ \S+,? \d\d:\d\d$/.test(es), es);
  ok('9.3 EN equivalente', /, as of \S+ \d+, \d\d?:\d\d\s?[AP]M$/.test(en), en);
  ok('9.4 el vivo publicado es el MISMO que lee «Tu liquidez es el X %» (misma lectura, sin mezclar)',
    c30.values.livePct === 29.2 && live29.ledger.facts.find(f => f.semanticKey === 'cash_weight').value === 29.2);
  ok('9.5 cuando coinciden a la precisión publicada (30 % y 30,0 %) no se añade nada', !/según el dato/.test(t30), t30);
  const w29 = wowOf(live29);
  ok('9.6 el descubrimiento fecha también su extremo, antes del hecho de concentración',
    !!w29 && /30,0\s?%, según el dato del [^.]+\. Tu mayor posición/.test(wowTxt(w29, 'es')), w29 && wowTxt(w29, 'es'));
  // Nivel: «actualmente» sólo con un último punto vigente.
  const lvl = (at) => ({ semanticKey: 'investable_level', value: 125000, unit: 'base_currency', values: { value: 125000 },
    window: { range: 'now', startAt: at, endAt: at } });
  ok('9.7 nivel con dato vigente ⇒ «actualmente»', /actualmente/.test(factTxt(lvl(NOW - 10 * MIN), 'es')));
  const oldLvl = factTxt(lvl(NOW - 3 * DAY), 'es');
  ok('9.8 nivel con dato de hace 3 días ⇒ sin «actualmente», con su fecha', !/actualmente/.test(oldLvl) && /^Según el dato del /.test(oldLvl), oldLvl);
  ok('9.8b nivel SIN fecha ⇒ ni «actualmente» ni cifra (falla cerrado)',
    factTxt({ semanticKey: 'investable_level', value: 125000, unit: 'base_currency', values: { value: 125000 }, window: { range: 'now' } }, 'es') === '');
  const ctx = makeCtx({ lang: 'es' });
  ok('9.8c concentración: un extremo de hace 6 h (mismo día) se FECHA; uno de hace 10 min, no',
    /^, según el dato del /.test(run('_intv4AsOfStale(' + (NOW - 6 * 3600e3) + ')', ctx))
    && run('_intv4AsOfStale(' + (NOW - 10 * MIN) + ')', ctx) === '');
  vm.runInContext('assets = ' + JSON.stringify(ASSETS), ctx);
  ok('9.8d «tu mayor posición» nunca es una cuenta de liquidez (ni una identidad desconocida)',
    run('_intv4TopIsLiquidity("eur")', ctx) === true && run('_intv4TopIsLiquidity("btc")', ctx) === false
    && run('_intv4TopIsLiquidity("nope")', ctx) === true
    && /_intv4TopIsLiquidity\(c\.assetId\)/.test(app.slice(app.indexOf("'ctx_conc_' + span") - 600, app.indexOf("'ctx_conc_' + span"))));
  ok('9.9 «hoy» sólo si el dato es de hoy; si no, su fecha',
    run('_intv4When(' + (NOW - 5 * MIN) + ')', ctx) === 'hoy' && /^en el dato del /.test(run('_intv4When(' + (NOW - 2 * DAY) + ')', ctx)));
  // Descubrimiento «liquidez frente a una necesidad declarada»: antes unía un delta
  // HISTÓRICO con el `cashPct` VIVO («ha bajado 3 puntos, hasta el 29 %»).
  const disc = (vals) => run('_intelDiscoveryText(' + JSON.stringify({ code: 'liquidity_fell_while_need_declared', values: vals }) + ')', ctx);
  const dn = disc({ cashPct: 29, changePp: -3, window: '7D', startPct: 33, endPct: 30, endAt: endTs });
  ok('9.10 necesidad declarada: los DOS extremos de la misma deriva, sin «puntos», y fecha si el vivo difiere',
    /^Dijiste que vas a necesitar liquidez\. En los últimos 7 días, tu liquidez pasó del 33,0\s?% al 30,0\s?% de tu cartera financiera, según el dato del /.test(dn)
    && !/puntos|\bpp\b/.test(dn), dn);
  ok('9.11 …sin extremos no hay comparación (no se mezcla el delta con el vivo)',
    disc({ cashPct: 29, changePp: -3, window: '7D' }) === '');
  const liqDim = run('_aurixAiLiquidity({ assetCount: 3, totUSD: 100000, cashPct: 29 }, ' + JSON.stringify(cap.ledger.facts) + ')', ctx);
  ok('9.12 la dimensión de liquidez transporta los extremos de SU deriva (los de la mayor |Δ|)',
    liqDim.previousPct === 3 && liqDim.driftEndPct === 30 && liqDim.driftEndAt === f30.window.endAt && liqDim.cashPct === 29,
    JSON.stringify(liqDim));
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · ÚLTIMO AJUSTE · LENGUAJE Y UNIVERSO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n10 · Sin «pp/puntos» narrativos y con el universo correcto:');
{
  ['es', 'en'].forEach(l => {
    const D = DICT[l];
    ok('10.1 ' + l + ' · Hoy: el motor de 24 h se nombra sin «pp»',
      !/\bpp\b|puntos|points/.test(D.intv21_today_driver_up('Bitcoin') + D.intv21_today_driver_down('Bitcoin')));
    ok('10.2 ' + l + ' · concentración en Evolución y Explora: extremos, no «puntos»',
      !/puntos|points/.test(D.intv19_evo_conc_up('1 sept', '35,0%', '30,0%', '') + D.intv21_xa_conc_up('35,0%', '30,0%', '1 sept', ''))
      && /35,0%.*30,0%/.test(D.intv19_evo_conc_up('1 sept', '35,0%', '30,0%', '')));
    ok('10.3 ' + l + ' · portada Free: el porcentaje se dice sobre la cartera financiera (su denominador real)',
      /cartera financiera|financial portfolio/.test(D.intprev_f_conc(40, 'BTC')) && /cartera financiera|financial portfolio/.test(D.intprev_f_liq(12)));
  });
  ok('10.4 los avisos que la portada Free puede publicar nombran la cartera financiera (su denominador es el invertible)',
    ['es', 'en'].every(l => { const d = {}; ['intcc_w_dep_b', 'intcc_w_crypto_b'].forEach(k => {
      const st = keyOccurrences(k)[l === 'en' ? 1 : 0]; const body = app.slice(st, app.indexOf('\n', st)).replace(/,\s*$/, '');
      Object.assign(d, (new Function('return ({ ' + body + ' });'))()); });
      return /cartera financiera|financial portfolio/.test(d.intcc_w_dep_b('BTC')) && /cartera financiera|financial portfolio/.test(d.intcc_w_crypto_b(40))
        && !/invertible|investable/.test(d.intcc_w_dep_b('BTC') + d.intcc_w_crypto_b(40)); }));
  const ctx = makeCtx({ lang: 'es' }), ctxEn = makeCtx({ lang: 'en' });
  const all = [t30, t7, wEs, factTxt(f30, 'en'), wEn];
  ok('10.5 ninguna frase publicada de liquidez dice «patrimonio invertible» (el perímetro la nombra «cartera financiera»)',
    all.every(x => !/patrimonio invertible|investable wealth/.test(x)));
  ok('10.6 «hoy» de Explora se resuelve por la fecha del dato, en los dos idiomas',
    run('_intv4When(' + (NOW - 2 * DAY) + ')', ctxEn).indexOf('as of ') === 0);
}

// Volcado opcional para la sonda visual (scripts/aurix-intel-coherence-render-probe.mjs):
// el HTML que pintan las superficies afectadas, generado aquí por el código real.
if (process.env.AURIX_COHERENCE_DUMP) {
  const mk = (f) => ({ ledger: { facts: [f] }, findings: [], findingsAll: [{ semanticKey: f.semanticKey, findingId: 'fd' }] });
  const dump = {};
  ['es', 'en'].forEach(l => { const c = makeCtx({ lang: l });
    dump[l] = { disc: run('_intv4DiscoveryHtml(' + JSON.stringify(cap) + ', _intccEsc, [], [])', c),
      log: run('_intv21LogHtml(_intv21LogItems(' + JSON.stringify(mk(f30)) + ', []), _intccEsc)', c),
      need: run('_intelDiscoveryText(' + JSON.stringify({ code: 'liquidity_fell_while_need_declared',
        values: { cashPct: 29, changePp: -3, window: '7D', startPct: 33, endPct: 30, endAt: NOW } }) + ')', c),
      dated: (() => { const d = core(Object.assign({}, CAPTURE, { lang: l, snap: Object.assign({}, SNAP, { cashPct: 29.2 }) }), { ranges: ['7D', '30D'] });
        return run('_intv4WowText(' + JSON.stringify(wowOf(d)) + ')', c); })() }; });
  fs.writeFileSync(process.env.AURIX_COHERENCE_DUMP, JSON.stringify(dump));
}
console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
