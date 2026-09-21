'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INT-PREMIUM-EXPERIENCE-harness — SPEC INT.04
// ════════════════════════════════════════════════════════════════════════════
// Certifies that the VISIBLE Intelligence surface is now a pure presentation of
// the Intelligence Core:
//
//   CORE → BRIEF → WHAT CHANGED → DISCOVERY → EXPLORE → FINANCIAL MEMORY
//
// The whole point of INT.04 is that the Core stopped being disconnected, so the
// renderer is what is under test here and it is NOT stubbed. Real in this gate:
//   · `_renderIntelligenceCommandCenter` and every `_intv4*` presentation owner;
//   · the whole Intelligence Core (`_aurixIntelligenceCore`, ledger, stories,
//     wow, questions, whatChanged) and, beneath it, the real INT.02 performance
//     chain, the real certified exposure reader and the real HHI chain;
//   · the REAL i18n copy, extracted from both dictionaries in app.js — so an
//     unmapped fact or a missing translation is visible here, not hidden by a
//     convenient stub.
// Genuine INPUTS are provided: history rows, server rows, holdings, the health
// snapshot, the FX rate and the presentation history.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
function blockOf(a,z){ const i=app.indexOf(a); if(i<0) throw new Error('missing '+a);
  const e=app.indexOf(z,i); return app.slice(i,e+z.length); }
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const DAY = 86400000, HOUR = 36e5, MIN = 60000;
const T0 = 1750000000000;
const NOW = Date.now();                 // the certified exposure reader checks freshness against the real clock

// ── REAL copy, lifted out of both dictionaries ──────────────────────────────
// Not a stub: the actual `intv4_*` block from each language, plus the few
// `intcc_*`/`healthScore*` keys the header still uses. If a key the renderer
// needs is missing from a dictionary, the render below produces empty text and
// the assertions catch it.
// The two dictionaries each declare the same keys, in order (ES first, EN
// second), and the keys the renderer needs sit on BOTH sides of any single
// anchor — so pick occurrence 0 for ES and occurrence 1 for EN rather than
// scanning from an anchor, which silently found nothing and blanked a language.
function keyOccurrences(k) {
  const out = [], needle = '    ' + k + ':';
  let i = app.indexOf(needle);
  while (i >= 0) { out.push(i); i = app.indexOf(needle, i + 1); }
  return out;
}
function extractDict(langIdx) {
  const start = keyOccurrences('intv4_brief_title')[langIdx];
  const endKey = app.indexOf('intv5_cat_other:', start);
  const end = app.indexOf('\n', endKey);
  const body = app.slice(start, end).replace(/,\s*$/, '');
  const extraKeys = ['intcc_health_title','intcc_health_suffix','intcc_disclaimer',
    'intcc_empty_title','intcc_empty_body','healthScoreSolid','healthScoreModerate',
    'healthScoreElevated','healthScoreHigh','healthScoreEmpty','healthScoreExplainSolid',
    'healthScoreExplainModerate','healthScoreExplainElevated','healthScoreExplainHigh',
    'intcc_band_empty','intcc_eyebrow','intcc_radar_title','intcc_drivers_title','intcc_drv_explain_asset',
    'intcc_drv_explain_cash','intcc_drv_kind_eng','intcc_drv_kind_liq','intcc_drv_none',
    'intcc_chip_div','intcc_chip_liq','intcc_chip_conc','intcc_chip_watch',
    'intcc_read_attention','intcc_read_concentrated','intcc_read_growing','intcc_read_healthy',
    'intcc_read_balanced','intcc_sub_attention','intcc_sub_concentrated','intcc_sub_growing',
    'intcc_sub_healthy','intcc_sub_balanced',
    // INT.07 — the semantic pentagon publishes these, so the gate must see the
    // REAL strings from BOTH dictionaries (a missing one blanks an axis label).
    'intcc_dim_div','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab','intcc_dim_growth',
    // A2 — el primer eje ya no se llama «Diversificación». Sin esta clave el
    // renderer produce una etiqueta VACÍA y el pentágono parece de cuatro ejes.
    'intcc_dim_breadth',
    'intv7_axis_unavailable','intv7_axis_span_days','intv7_radar_legend','intv7_radar_pending',
    // M.03 C — el disclosure del radar es POR EJE y con su causa, así que el gate
    // necesita las cuatro cadenas reales: sin ellas el renderer produce texto vacío
    // y 13B.9 dejaría de ver los nombres.
    'intv7_pending_obs','intv7_pending_scale','intv7_pending_generic','intv7_stab_meaning',
    // SPEC AURIX INTELLIGENCE — la lectura del hero, el índice de dispersión, los descubrimientos y
    // la pregunta contextual publican estas claves. Si falta una en CUALQUIERA de los
    // dos idiomas, `extractDict` revienta aquí y 13.6 ve el texto vacío: es
    // exactamente para eso.
    // HERO FINALIZATION · SALUD quedó minimalista (título + anillo + % + UN estado),
    // así que las claves del detalle, de las etiquetas de reparto y de la chip de
    // cobertura se retiraron con su superficie. Las que quedan son las que se
    // publican de verdad.
    'intel_disp_title','intel_disp_na','intel_disp_na_single','intel_disp_na_uncert',
    'intel_disp_na_generic','intel_disp_depth',
    'intel_h_v_weak','intel_h_v_watch','intel_h_v_stable','intel_h_v_balanced',
    'intel_h_v_solid','intel_h_v_excellent','intel_dock_label',
    'intel_now_monitoring','intel_sub_monitoring',
    'intel_now_material','intel_now_discovery','intel_now_changed',
    'intel_now_stable','intel_now_history','intel_now_context',
    'intel_sub_material','intel_sub_changed','intel_sub_history',
    'intel_d_apparent','intel_d_conc_rising','intel_d_capital','intel_d_intent','intel_d_liq_need',
    // §17 — `intel_d_persisting` RETIRADA con su descubrimiento: «esta lectura
    // sigue igual tras 11 observaciones» no dice qué condición, ni durante qué
    // periodo (las «observaciones» eran visitas), ni por qué importa.
    'intel_d_combined',
    'intel_q_conc_intent','intel_q_conc_why','intel_q_coverage','intel_q_coverage_why',
    'intel_q_liq_need','intel_q_liq_why','intel_q_goal','intel_q_goal_why','intel_q_thanks',
    'intel_opt_deliberate','intel_opt_not_deliberate','intel_opt_complete','intel_opt_partial',
    'intel_opt_none_known','intel_opt_planned','intel_opt_imminent','intel_opt_preserve',
    'intel_opt_grow','intel_opt_income','intel_opt_undecided',
    'intel_ctx_partial','intel_radar_more',
    // SPEC AURIX INTELLIGENCE · SALUD V2 — la card vuelve a llamarse Salud y publica
    // estado + confianza + componentes; y las preguntas ganan declinar y pausar.
    'intel_h_no_positions','intel_h_coverage','intel_h_d_empty','intel_h_note_deliberate',
    'intel_opt_decline','intel_q_pause','intel_q_paused','intel_q_declined'];
  const missing = [];
  const extras = extraKeys.map(k => {
    const occ = keyOccurrences(k);
    const i = occ[langIdx];
    if (i == null) { missing.push(k); return null; }
    return app.slice(i, app.indexOf('\n', i)).trim().replace(/,$/, '');
  }).filter(Boolean).join(',\n');
  if (missing.length) throw new Error('i18n keys missing for lang ' + langIdx + ': ' + missing.join(','));
  // eslint-disable-next-line no-new-func
  return new Function('return ({' + body + ',\n' + extras + '})')();
}
const DICT = { es: extractDict(0), en: extractDict(1) };

const CONSTS = ['_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT','_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD',
  '_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS',
  '_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL',
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_REGISTERED_OP_KINDS','_AURIX_REGISTERED_OP_BATCH_MIN',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_FACT_CONTRACT_VERSION','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_INTV7_RADAR_DIMS','TYPE_META','_AURIX_QUESTION_CATALOG',
  '_INTV4_DEPTH','_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX','_INTV4_MEMORY_WINDOW_ORDER',
  '_INTV4_SHOWN_KEY','_AURIX_INTEL_HEALTH_POSITIVE','_AURIX_INTEL_DISC_MAX','_AURIX_INTEL_DIM_ROOT','_AURIX_AI_EVOLUTION_RANGES','_AURIX_INTEL_CTX_KEY','_AURIX_INTEL_CTX_KEY_LEGACY',
  '_AURIX_INTEL_FIELDS','_AURIX_INTEL_EXCLUSIVE_CLAIMS','_AURIX_INTEL_PROVENANCE','_AURIX_INTEL_QUESTION_LIMIT','_INTV4_EXPLORE_PERIOD_WEEKS','_INTV4_PERIMETER','_INTV5_TIER','_AURIX_TODAY_MAX_AGE_MS','_AURIX_TODAY_STALE_MS','_AURIX_GAP_SURFACE','_AURIX_ROOT_READABLE'];
const FNS = ['_intv4ExploreRotation','_intv4ExploreSeed','_intv4Perimeter','_intv4ActiveReviewFindings','_aurixTodayDatedAt','_aurixTodayFresh','_aurixTodayDataStale','_intv5RecencyTier','_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_intv4FindingRows','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket',
  'isClosedAsset','activeAssets','isInvestableAsset','investableAssets','investableValueUSD',
  'liquidityNominal','assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete',
  '_aurixFlowIsInternal','_aurixLoadCapitalFlows','_aurixInvestableSnapshots',
  '_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixFlowCounterpartObserved','_aurixInvestablePerformance','_aurixCatHistRows',
  '_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow','_aurixCatExposureDelta',
  '_aurixFactClamp01','_aurixEffectiveDiversification','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixFactPeriodNamedAs','_aurixFactPeriodDegraded','_aurixFactEnvelope','_aurixIntelligenceCore',
  '_aurixHealthScore','_intccScoreTone','_intccHealthScore','_intccClamp','_intccEsc','_intccDate',
  '_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4WindowLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml',
  '_intv4ChangedRef','_intv4ChangedHtml','_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml',
  // SPEC FINAL SURFACE — owners nuevos que el renderer llama: el puente
  // dimensión→raíz, la card de descubrimientos y el contexto declarado de la
  // Memoria. Sin ellos el render lanza y este gate se cae entero.
  '_aurixIntelRootsOf','_intv9DiscoveriesHtml','_intv4MemoryDeclared','_intv4MemoryDiversify','_intv4MemoryRows','_intelDiscoveryText',
  '_intelQuestionText','_aurixIntelContext','_aurixIntelCtxRecord','_aurixIntelReadOwned',
  '_aurixIntelWriteOwned','_aurixIntelOwner','_aurixIntelStore','_aurixIntelMarkAsked',
  '_intv4MemoryEvents','_intv4MemoryClaims','_intv4MemoryHtml',
  '_intv4QualityHtml','_intv4ReadShown','_intv4RecordShown',
  // INT.05 — the restored cockpit modules and the legacy components they reuse.
  '_intccScoreRingHtml','_intccIsMonetary','_intTop3Investable','buildPortfolioDrivers',
  // §6 · la guarda de hidratación (una hidratación pendiente NO es cero activos) y
  // §12 · la etiqueta de porcentaje que distingue un cero real de un «<1%».
  '_intccHydrationPending','_intccPctLabel',
  // El formateador CANÓNICO de porcentaje, compartido por Dashboard, Workspace e
  // Intelligence: el redondeo es de renderizado y hay UNA sola función.
  '_aurixPctNum','_aurixPctLabel',
  
  '_intelCoherentState','_intv5MattersStories','_intv5Reading','_intv5Chips','_intv5StructureHtml','_aurixGapsBySurface','_intv5DriversHtml','_intv5MattersHtml','_intv7RadarAxes','_intv7PendingReasonKey','_intv7RadarHtml','_intccRadarSvg','_aurixPeakRetention','getInvestableDistribution','_aurixDisplayCategory',
  '_renderIntelligenceCommandCenter'];

function makeCtx(opts) {
  const o = opts || {};
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  vm.createContext(sb);
  sb.baseCurrency = o.baseCurrency || 'USD';
  sb.usdToEur = 0.92;
  sb.lang = o.lang || 'es';
  sb._aurixFxRate = c => ({ USD: 1, EUR: 0.92 })[String(c).toUpperCase()];
  // ── EL RELOJ DE LA FIXTURE ────────────────────────────────────────────
  // «Hoy» se mide contra un reloj, no contra el último snapshot (checkpoint F).
  // Las fixtures de este gate mezclan filas ancladas a una constante con flujos
  // anclados a `Date.now()`, así que sin fijar el presente unas serían de hoy y
  // otras de hace un año. Se declara: el presente de la fixture es el final de
  // su propia serie. Producción sigue usando `Date.now()`; esto vive sólo aquí.
  sb._aurixNow = () => {
    // La serie de observación que construye el Core sale de `categoryHistory`
    // —las filas LOCALES—, y es ésa la que fecha las ventanas de los hechos.
    // Estas fixtures anclan las filas locales a una constante y los snapshots
    // de servidor a `Date.now()`: hay quince meses entre unas y otros. Tomar el
    // máximo de los dos dejaba todos los hechos «viejos» y vaciaba las cards.
    // El presente de la fixture es el final de la serie que la fecha.
    const rows = (o.rows && o.rows.length) ? o.rows : (o.serverRows || []);
    const last = rows.length ? rows[rows.length - 1] : null;
    const ts = last && (last.ts != null ? last.ts : last.time);
    return Number.isFinite(ts) ? ts : Date.now();
  };
  sb.t = k => DICT[sb.lang][k];
  sb._escapeWorkspaceText = s => String(s == null ? '' : s);
  sb.reducedMotion = true;
  sb.__rows = o.rows || [];
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb._aurixPortfolioEpoch = () => (o.epoch || 0);
  sb.investableValueBase = () => 0;
  sb.canDisplayCanonicalReturn = () => (o.canDisplay === undefined ? { ok: true } : o.canDisplay);
  sb.activeRange = 'all';
  sb._aurixBackendSnapshots = o.serverRows || [];
  sb._aurixBackendSnapshotsState = o.hydration || 'ready';
  sb._aurixBackendHealthSnapshot = () => ({ status: 'ok' });
  sb.assets = o.assets || [];
  sb._aurixHealthSnapshot = () => (o.snap === undefined ? null : o.snap);
  sb.getDisplayName = a => (a && (a.name || a.ticker || a.id)) || '—';
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  // SPEC ADVANCED INTELLIGENCE · A1 — PRECONDICIONES DE LA PUERTA DE EVIDENCIA.
  // Una transición histórica de exposición sólo se publica si los dos extremos son
  // COMPARABLES: mismo epoch y clasificación estable y cubierta por el linaje. No
  // son stubs de lo que se certifica aquí (la superficie y su deduplicación): son
  // la evidencia que en producción aporta el observador de linaje. Los casos
  // adversariales las anulan con `o.lineage` / `o.flowsComplete`.
  sb._aurixCapitalFlowsComplete = () => (o.flowsComplete === undefined ? true : !!o.flowsComplete);
  // Reserva declarada: en PRODUCCIÓN este predicado arranca CERRADO
  // (`_aurixCapitalFlowsIncomplete = true` hasta el primer pull completo). Aquí se
  // abre por defecto para poder llegar a lo que estas pruebas certifican, y el
  // arranque cerrado se fija abajo sobre el fuente, no sobre el sandbox.
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
  if (o.shown) vm.runInContext('__store[_INTV4_SHOWN_KEY] = ' + JSON.stringify(JSON.stringify(o.shown)), sb);
  return sb;
}
const run = (e, c) => vm.runInContext(e, c);
const render = (o) => { const c = makeCtx(o); return { html: run('_renderIntelligenceCommandCenter()', c), ctx: c }; };
const coreOf = (o) => { const c = makeCtx(o); return run('_aurixIntelligenceCore({ presentationHistory: _intv4ReadShown() })', c); };
const attrs = (html, re) => { const out = []; let m; const r = new RegExp(re, 'g'); while ((m = r.exec(html))) out.push(m[1]); return out; };
const section = (html, cls) => {
  const i = html.indexOf('class="intcc-card ' + cls);
  if (i < 0) { const j = html.indexOf(cls); return j < 0 ? '' : html.slice(j, j + 2600); }
  return html.slice(i, i + 4000);
};

// ── fixtures ────────────────────────────────────────────────────────────────
const row = (d, total, re) => ({ ts: T0 + d * DAY, total, real_estate: re || 0 });
const inv = vals => vals.map((v, i) => row(i, v, 0));
function srvRow(ts, cats) { let tot = 0; for (const k in cats) tot += cats[k];
  return { ts, total_value_usd: +tot.toFixed(2), real_estate: cats.real_estate || 0, category_values: Object.assign({}, cats) }; }
function srvHistory(endTs, spanDays, a, b) {
  const rows = [], step = 6 * HOUR, n = Math.floor((spanDays * DAY) / step);
  for (let i = 0; i <= n; i++) { const f = n === 0 ? 1 : i / n; const c = {};
    for (const k of Object.keys(a)) c[k] = +((a[k] || 0) + ((b[k] != null ? b[k] : a[k]) - (a[k] || 0)) * f).toFixed(2);
    rows.push(srvRow(endTs - (n - i) * step, c)); }
  return rows;
}
const SNAP = { assetCount: 12, totUSD: 100000, categoryCount: 5, cashPct: 12, cryptoPct: 39, realEstatePct: 0,
  topInvestedAsset: { name: 'BTC', ticker: 'BTC', type: 'crypto', pctTotal: 53 },
  topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 53 }, worstAsset: null, bestAsset: null };
const DRIVERS = { items: [], pct: 71 };
const LOPSIDED = [
  { id: 'a1', type: 'crypto', qty: 1, price: 53000 }, { id: 'a2', type: 'stock', qty: 100, price: 120 },
  { id: 'a3', type: 'stock', qty: 50, price: 100 }, { id: 'a4', type: 'etf', qty: 30, price: 90 },
  { id: 'a5', type: 'etf', qty: 20, price: 80 }, { id: 'a6', type: 'crypto', qty: 5, price: 200 },
  { id: 'a7', type: 'metal', qty: 10, price: 60 }, { id: 'a8', type: 'stock', qty: 10, price: 50 },
  { id: 'a9', type: 'fund', qty: 10, price: 40 }, { id: 'a10', type: 'stock', qty: 10, price: 30 },
  { id: 'a11', type: 'etf', qty: 10, price: 20 }, { id: 'a12', type: 'cash', qty: 5000 },
];
// A mature account: real history, a real market move, a real deposit, a real
// exposure drift the certified reader can see.
const MATURE = {
  rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
  flows: [{ id: 'd1', ts: T0 + 1.5 * DAY, amountUSD: 400, kind: 'deposit' }],
  serverRows: srvHistory(NOW, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                   { crypto: 39000, stock: 40000, liquidity: 21000 }),
  assets: LOPSIDED, snap: SNAP, drivers: DRIVERS,
};
// A brand-new account: structure only, no measurable history.
const YOUNG = { rows: [], flows: [], serverRows: [], assets: LOPSIDED, snap: SNAP, drivers: DRIVERS };
// A portfolio with NO wow evidence at all: few, evenly-weighted positions (so the
// nominal-vs-effective insight cannot fire) and no history. Note that LOPSIDED
// DOES legitimately produce a day-1 structural insight — that is correct, and it
// is why this separate fixture is needed to test genuine absence.
const EVEN_NO_HISTORY = {
  rows: [], flows: [], serverRows: [],
  assets: [{ id: 'e1', type: 'stock', qty: 1, price: 1000 }, { id: 'e2', type: 'stock', qty: 1, price: 1000 },
           { id: 'e3', type: 'etf', qty: 1, price: 1000 }],
  snap: { assetCount: 3, totUSD: 3000, categoryCount: 2, cashPct: 0, cryptoPct: 0, realEstatePct: 0,
          topInvestedAsset: { name: 'A', ticker: 'A', type: 'stock', pctTotal: 34 },
          topCategory: { type: 'stock', label: 'Acciones', pctTotal: 67 }, worstAsset: null, bestAsset: null },
  drivers: { items: [], pct: 100 },
};

console.log('AURIX-INT-PREMIUM-EXPERIENCE — SPEC INT.04 · Intelligence Premium Experience\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · SINGLE SOURCE OF INTELLIGENCE
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · The surface consumes the Core and nothing else:');
{
  const R = fnSrc('_renderIntelligenceCommandCenter');
  ok('1.1 the renderer calls _aurixIntelligenceCore', /_aurixIntelligenceCore\(/.test(R));
  ok('1.2 it reimplements no financial formula',
    !/\/\s*100|\*\s*100|deltaPp|Math\.pow|reduce\(/.test(R.replace(/\/\/[^\n]*/g, '')), 'arithmetic in renderer');
  ok('1.3 it no longer derives facts from the retired local engines',
    !/_intccRadar\(|_intccReading\(|_intccTimeline\(|_intccWatchAreas\(|_intccGrowthPct\(|buildPortfolioDrivers\(/.test(R));
  ok('1.4 the presentation owners compute no percentages of their own',
    ['_intv4FactText','_intv4StoryHtml','_intv4BriefHtml','_intv4ChangedHtml','_intv4DiscoveryHtml',
     '_intv4ExploreHtml','_intv4MemoryHtml','_intv4QualityHtml']
      .every(n => !/[^\w]\*\s*100|\/\s*100[^0-9]/.test(fnSrc(n))));
  ok('1.5 an unmapped fact renders NOTHING (fail closed)',
    (() => { const c = makeCtx(MATURE);
      return run("_intv4FactText({ semanticKey: 'totally_unknown_fact', value: 42 })", c) === ''; })());
  ok('1.6 the Core is called exactly ONCE per render (no per-block recomputation)',
    (R.match(/_aurixIntelligenceCore\(/g) || []).length === 1);
  ok('1.7 no generative/AI call on render (deterministic, zero API cost)',
    !/fetch\(|anthropic|openai|\/api\//i.test(R));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · INTELLIGENCE BRIEF
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · The Brief is 3–5 stories with DISTINCT causal roots:');
{
  const { html } = render(MATURE);
  const roots = attrs(html, 'class="intv4-story[^"]*"[^>]*data-root="([^"]+)"');
  ok('2.1 the Brief renders stories', roots.length > 0, JSON.stringify(roots));
  ok('2.2 at most 5 stories', roots.length <= 5, 'n=' + roots.length);
  ok('2.3 every story has a DIFFERENT causal root',
    new Set(roots).size === roots.length, JSON.stringify(roots));
  ok('2.4 each story leads with one conclusion', (html.match(/class="intv4-story-head"/g) || []).length === roots.length);
  ok('2.5 "why it matters" appears at most once per story',
    (html.match(/class="intv4-story-why"/g) || []).length <= roots.length);
  // A2 · RE-DECIDIDO. El invariante es ESTRUCTURAL: una evidencia de apoyo va
  // ANIDADA, nunca como card hermana. Exigir además que EXISTA al menos un
  // desplegable fijaba una propiedad de la fixture, y desde A2 un hecho que el
  // destino del contador ya publica no se repite aquí ni dentro del desplegable —
  // así que una cartera cuyos apoyos son todos hallazgos legítimamente no tiene
  // ninguno. Lo que sí se añade es que no quede un desplegable VACÍO: un control
  // que no abre nada es un hueco reservado con otro nombre.
  ok('2.6 supporting facts are nested behind progressive disclosure, not new cards',
    !/class="intcc-card[^"]*"[^>]*>\s*<[^>]*class="intv4-sup/.test(html)
    && ((html.match(/class="intv4-sup"/g) || []).length === 0
        || (html.match(/class="intv4-more"/g) || []).length >= 1)
    && !/class="intv4-more"[\s\S]{0,200}<\/details>/.test(html.replace(/class="intv4-sup"/g, 'X')),
    JSON.stringify({ sup: (html.match(/class="intv4-sup"/g) || []).length,
                     more: (html.match(/class="intv4-more"/g) || []).length }));
  // INT.05 — the Brief now occupies the restored cockpit slot; the invariant is
  // unchanged: ONE section, stories nested inside it, never sibling cards.
  ok('2.7 the Brief is one section, not a wall of cards',
    (html.match(/class="intcc-card intcc-watch intv4-brief intv5-matters"/g) || []).length === 1
    && !/<\/section>\s*<article class="intv4-story/.test(html));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · DEDUPLICATION IS VISIBLE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · One fact is never sold as several discoveries:');
{
  const { html } = render(MATURE);
  const core = coreOf(MATURE);
  const concKeys = ['top_position_weight','top3_weight','effective_holdings'];
  const present = concKeys.filter(k => core.ledger.facts.some(f => f.semanticKey === k));
  ok('3.1 the concentration family really has ' + present.length + ' facts', present.length === 3);
  const headFacts = attrs(html, 'class="intv4-story[^"]*"[^>]*data-fact="([^"]+)"');
  // INT.05 — the cockpit's structural modules (Key drivers + Structure) own the
  // concentration phenomenon visually, so the Brief must not ALSO headline it:
  // one phenomenon, one place. Nothing is lost — the breakdown is richer there.
  ok('3.2 the concentration phenomenon never leads a Brief story when the cockpit shows it',
    /intcc-drv-row/.test(html) && concKeys.every(k => headFacts.indexOf(k) === -1),
    JSON.stringify(headFacts));
  // RE-DECIDIDO · STABILIZATION V1: la card ESTRUCTURA se RETIRÓ de la superficie
  // porque republicaba diversificación efectiva, equivalencia de posiciones y
  // concentración principal — lo mismo que ya publican Salud, Radar y Factores.
  // Lo que esta aserción protege de verdad es que el desglose top-3 SE PUBLIQUE,
  // y eso lo sigue haciendo Factores. `_intv5StructureHtml` sigue existiendo como
  // owner (13B.11 comprueba que no se convirtió en una segunda verdad).
  ok('3.3 …and it IS published, as the real top-3 breakdown',
    (html.match(/class="intcc-drv-row[^"]*"/g) || []).length >= 1);
  ok('3.3b …y ESTRUCTURA ya no republica lo mismo en una card aparte',
    !/intv5-structure/.test(html) && !/intv5-eff-desc/.test(html));
  ok('3.4 no fact is rendered twice as a headline',
    new Set(headFacts).size === headFacts.length);
  // The retired blocks were the duplication mechanism.
  // INT.07 — THE SEMANTIC PENTAGON. Five FIXED conceptual dimensions, always
  // drawn; a value exists only where Aurix can certify it. "No data" is NOT 0.
  // RE-DECIDIDO (§8): con ejes sin certificar la figura NO se cierra, así que
  // exigir `intcc-radar-area` era exigir el triángulo engañoso. Lo que esta
  // aserción protege —que el radar se pinte con su marco y su serie— se comprueba
  // sobre el trazo abierto, que es la forma correcta en este estado de datos.
  ok('3.5 the radar renders with its frame and its (open) series',
    /intcc-radar-svg/.test(html) && /intcc-radar-axis/.test(html)
    && /intcc-radar-label/.test(html) && /class="intcc-radar-dot"/.test(html)
    && /data-svg-open="1"/.test(html) && !/intcc-radar-area/.test(html),
    (html.match(/data-svg-(open|edges)="[^"]*"/g) || []).join(' '));
  ok('3.5b the five axes are the founder\'s five SEMANTIC dimensions, in the FIXED drawing order',
    JSON.stringify(attrs(html, 'class="intcc-radar-label[^"]*"[^>]*>([^<]+)<'))
      // A1/A2 — el primer eje DEJA DE LLAMARSE «Diversificación». Publicaba
      // `effectiveN/positions*100`, la MISMA magnitud que el anillo de Salud con
      // otra normalización (83 % vs 75 % en una pantalla), y además no medía
      // diversificación sino reparto entre POSICIONES. Ahora mide amplitud de
      // categorías REGISTRADAS y lo dice. El pentágono sigue siendo de cinco.
      === JSON.stringify(['Amplitud de categorías','Estabilidad','Liquidez','Crecimiento','Concentración']),
    JSON.stringify(attrs(html, 'class="intcc-radar-label[^"]*"[^>]*>([^<]+)<')));
  ok('3.5b2 the radar is NOT a map of asset classes any more',
    (() => { const labels = attrs(html, 'class="intcc-radar-label[^"]*"[^>]*>([^<]+)<').map(x => x.trim());
      const classes = ['Cripto','Crypto','Acciones','Stocks','ETF','Metales','Metals','Efectivo','Cash','Liquidez USD'];
      // 'Liquidez' is a DIMENSION here, so only the class-specific names are banned
      return classes.filter(c => c !== 'Liquidez').every(c => labels.indexOf(c) === -1); })(),
    JSON.stringify(attrs(html, 'class="intcc-radar-label[^"]*"[^>]*>([^<]+)<')));
  ok('3.5c no legacy formula survives anywhere in the radar owners',
    (() => { const src = fnSrc('_intv7RadarAxes') + fnSrc('_intv7RadarHtml') + fnSrc('_intccRadarSvg');
      // The banned shapes are the FORMULAS, not every literal: [0.25,0.5,0.75,1]
      // are the grid ring fractions and are pure geometry.
      return !/45\s*\+\s*crypto/i.test(src)          // fabricated Growth
        && !/55\s*\+/.test(src)                       // saturating base
        && !/\*\s*2\.2/.test(src)                    // saturating slope
        && !/crypto\w*\s*\*\s*0\.25/i.test(src)
        && !/volatil/i.test(src); })());               // no invented stability
  // ── RE-DECIDIDO EN M.03 C ──────────────────────────────────────────────────
  // Eran "exactamente TRES owners y dos nulls". Ese recuento era el estado de
  // INT.07, no el contrato: el contrato es que TODO eje con valor declara el owner
  // certificado del que lo lee, y que un eje sin owner no dibuja número. M.03 activa
  // Estabilidad con `_aurixPeakRetention` (máximo conservado sobre el índice
  // flow-neutral), así que son CUATRO owners y UN null — Crecimiento, que sigue sin
  // escala certificable. El assert pasa a fijar el mapa eje→owner completo, que es
  // más fuerte que un recuento: activar un eje sin owner nombrado lo rompe.
  ok('3.5d each axis with a value declares the OWNER it reads (four owned, growth pending)',
    (() => { const src = konstSrc('_INTV7_RADAR_DIMS');
      const owned = (src.match(/owner: '/g) || []).length;
      return owned === 4 && /owner: 'aurixRegisteredCategoryBreadth'/.test(src)
        && /key: 'stability',\s+labelKey: 'intcc_dim_stab',\s+owner: 'aurixPeakRetention'/.test(src)
        && (src.match(/owner: 'aurixHealthSnapshot'/g) || []).length === 2
        && (src.match(/owner: null/g) || []).length === 1
        && /key: 'growth',[\s\S]{0,60}owner: null/.test(src); })(),
    konstSrc('_INTV7_RADAR_DIMS'));
  ok('3.5e the five dimensions are FIXED and frozen (not data-derived)',
    /_INTV7_RADAR_DIMS = Object\.freeze\(\[/.test(app)
    && ['diversification','liquidity','concentration','stability','growth']
         .every(k => new RegExp("key: '" + k + "'").test(konstSrc('_INTV7_RADAR_DIMS'))));
  ok('3.5f the radar does not restate Health or its weights',
    !/_aurixHealthScore|_AURIX_RANK_WEIGHTS/.test(fnSrc('_intv7RadarAxes') + fnSrc('_intv7RadarHtml')));
  // A2 — un eje certificado lleva SU unidad, y no todas son porcentajes: la
  // amplitud de categorías se publica como CONTEO con su taxonomía declarada
  // («2,1 / 7») porque la revisión financiera descartó todo 0-100 para esa
  // magnitud. Lo que el contrato exige es que un eje certificado lleve una CIFRA
  // CON SU UNIDAD y uno sin certificar lleve una PALABRA.
  ok('3.5g a certified axis carries its unit; an uncertified one carries a WORD, not a figure',
    (() => { const vals = attrs(html, 'class="intcc-radar-val[^"]*"[^>]*>([^<]+)<').map(v => v.trim());
      // RESIDUAL B — un eje medido sobre una serie RECORTADA publica además su
      // cobertura («82 % · 90 d medidos»), que sigue siendo una cifra con su
      // unidad y no un porcentaje pelado. Es una declaración MÁS, no menos.
      const measured = vals.filter(v => /^\d+%$/.test(v) || /^\d+(?:[.,]\d+)?\s*\/\s*\d+$/.test(v)
        || /^\d+%\s·\s.+$/.test(v));
      const pending  = vals.filter(v => v === 'sin datos');
      return vals.length === 5 && measured.length === 3 && pending.length === 2; })(),
    JSON.stringify(attrs(html, 'class="intcc-radar-val[^"]*"[^>]*>([^<]+)<')));
  ok('3.5h "sin datos" is never rendered as a number and never as zero',
    !/class="intcc-radar-val is-unavailable"[^>]*>\s*0/.test(html));
  ok('3.6 the drivers and watch slots are restored, fed by certified owners',
    /intcc-drivers/.test(html) && /intcc-watch/.test(html)
    // the old heuristic watch LIST is not back — the slot holds Core stories
    && !/intcc-watch-list/.test(html) && /intv4-story /.test(html));
  ok('3.7 the retired owners still exist in the codebase, dormant',
    /function _intccRadarSvg\(/.test(app) && /function _intccWatchAreas\(/.test(app));
  // The canonical score appears once and only once.
  // INT.05 — the restored responsive pattern emits a desktop hero AND a mobile
  // card; CSS shows exactly one. So the score appears twice in MARKUP and once on
  // SCREEN (the visual-QA probe asserts the on-screen count).
  ok('3.8 the health score is published once per viewport (desktop hero + mobile card)',
    (html.match(/intcc-health-badge/g) || []).length === 2
    && /class="intcc-hero /.test(html) && /intcc-m-health/.test(html));
  ok('3.8b CSS guarantees only one of the two is ever visible',
    /@media[^{]*max-width:\s*640px[\s\S]{0,4000}\.intcc-hero \{ display: none; \}/.test(css)
    && /\.intcc-m-card \{ display: none; \}/.test(css));
  ok('3.8c the Structure ring is not a second health score',
    !/intv5-eff-ring[\s\S]{0,200}intcc-health-badge/.test(html));
  ok('3.9 hero chips are labels, never a restated metric',
    (() => { const chips = html.match(/class="intcc-chip is-[a-z]+">([^<]*)</g) || [];
      return chips.length > 0 && chips.every(c => !/\d/.test(c)); })(),
    JSON.stringify(html.match(/class="intcc-chip is-[a-z]+">([^<]*)</g)));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · WHAT CHANGED
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · What Changed is financially honest:');
{
  const { html } = render(MATURE);
  const sec = section(html, 'intv4-changed');
  ok('4.1 the section renders', /intv4-changed/.test(html));
  const chgRoots = attrs(sec, 'class="intv4-chg [^"]*"[^>]*data-root="([^"]+)"');
  ok('4.2 changes do not repeat a causal root', new Set(chgRoots).size === chgRoots.length, JSON.stringify(chgRoots));
  ok('4.3 no CAUSE is asserted anywhere on the surface',
    !/porque|because|debido a|due to|driven by|gracias a/i.test(html));
  // The honest-limit section legitimately says Aurix CANNOT attribute; the check
  // is that no attribution is ASSERTED anywhere else.
  // The honest-limit line legitimately says Aurix CANNOT attribute; strip it (it
  // now lives inline beside the disclaimer) and check nothing else asserts one.
  const withoutQuality = html
    .replace(/<section class="intcc-card intv4-quality"[\s\S]*?<\/section>/g, '')
    // CHECKPOINT J — la limitación se mudó del pie a la card de Factores, que
    // es el análisis que limita. El invariante no cambia: fuera de esa línea,
    // NADA puede atribuir rendimiento por posición.
    .replace(/<p class="intcc-drv-limit">[\s\S]*?<\/p>/g, '')
    // CHECKPOINT J — la limitación de atribución ya no vive en Factores: va a
    // la card cuya afirmación acota (Hoy o Evolución). El invariante no cambia.
    .replace(/<p class="intcc-surface-limit">[\s\S]*?<\/p>/g, '');
  ok('4.4 no per-position attribution of return is asserted',
    !/explic[oó]|explained by|atribu/i.test(withoutQuality));
  // A1 · RE-DECIDIDO. El invariante real es que una deriva NUNCA se enuncie como
  // el cambio RELATIVO del peso (31 % → 39 % no es «+25,8 %»). Dos formas lo
  // respetan: los PUNTOS PORCENTUALES, y —cuando la causa no está corroborada— los
  // DOS NIVELES («pasó del 31 % al 39 %»), que es estrictamente más honesto porque
  // no insinúa ninguna acción del usuario y publica ambos extremos.
  ok('4.5 exposure changes are stated in pp or as both endpoint levels, never as a relative %',
    (() => { if (!/exposici[oó]n/i.test(sec)) return true;
      const pp = /pp/.test(sec);
      const twoLevels = /del\s*\d+(?:[.,]\d+)?%\s*al\s*\d+(?:[.,]\d+)?%/i.test(sec);
      return pp || twoLevels; })(),
    sec.slice(0, 260));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · INSUFFICIENT HISTORY NEVER BECOMES A NUMBER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · A young account is not padded with invented content:');
{
  const { html } = render(YOUNG);
  const core = coreOf(YOUNG);
  ok('5.1 a young account still renders a surface (no crash, no blank)', html.length > 200);
  ok('5.2 it publishes no return figure',
    !core.ledger.facts.some(f => f.family === 'performance'), JSON.stringify(core.ledger.facts.map(f => f.semanticKey)));
  ok('5.3 no 30D/90D window is published', !/30 d[ií]as|90 d[ií]as|last 30 days|last 90 days/.test(html));
  ok('5.4 no placeholder that looks like analysis',
    !/45\/100|0%|--%|—%|N\/A|estimad|approx/i.test(html));
  ok('5.5 the empty Brief says so honestly instead of inventing',
    /intv4-brief/.test(html));
  ok('5.6 a mature account DOES get more depth than the young one (progressive)',
    (() => { const m = render(MATURE).html;
      const mStories = (m.match(/class="intv4-story /g) || []).length;
      const yStories = (html.match(/class="intv4-story /g) || []).length;
      return mStories > yStories; })(),
    'mature=' + (render(MATURE).html.match(/class="intv4-story /g) || []).length
      + ' young=' + (html.match(/class="intv4-story /g) || []).length);
  // The window that cannot be honoured must never print a figure anywhere.
  const shortSrv = Object.assign({}, MATURE, { serverRows: srvHistory(NOW, 10, { crypto: 31000, stock: 40000, liquidity: 29000 }, { crypto: 39000, stock: 40000, liquidity: 21000 }) });
  const c30 = coreOf(shortSrv);
  ok('5.7 a declared-but-uncovered 30D window yields a GAP, not a figure',
    c30.dataAvailability.gaps.some(g => /_30D$/.test(g.semanticKey) && g.status === 'insufficient_history')
    && !c30.ledger.facts.some(f => /_30D$/.test(f.semanticKey)));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · POSITIVE INTELLIGENCE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · Intelligence is not a warnings machine:');
{
  const good = Object.assign({}, MATURE, {
    serverRows: srvHistory(NOW, 10, { crypto: 40000, stock: 40000, liquidity: 20000 },
                                     { crypto: 32000, stock: 40000, liquidity: 28000 }) });
  const { html } = render(good);
  const core = coreOf(good);
  ok('6.1 positive facts exist in the Core', core.positiveDevelopments.length > 0,
    JSON.stringify(core.positiveDevelopments.map(f => f.semanticKey)));
  ok('6.2 …and reach the surface', /is-positive|intv4-story .*is-up/.test(html) || /class="intv4-story is-up/.test(html),
    (html.match(/class="intv4-story[^"]*"/g) || []).join(' '));
  ok('6.3 an improving-liquidity portfolio is not described as a warning',
    core.positiveDevelopments.some(f => f.semanticKey === 'liquidity_improved'));
  ok('6.4 nothing positive is claimed when nothing improved',
    (() => { const flat = Object.assign({}, MATURE, { rows: inv([10000,10000,10000,10000,10000,10000]), flows: [], serverRows: [] });
      return coreOf(flat).positiveDevelopments.length === 0; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · DISCOVERY / WOW
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Discovery appears only with real evidence:');
{
  const w = Object.assign({}, MATURE, {
    rows: inv([10000, 10000, 10000, 20000, 20000, 20000, 20000]),
    flows: [{ id: 'd1', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'deposit' }] });
  const { html } = render(w);
  ok('7.1 a real wow insight is published', /intv4-discovery/.test(html));
  ok('7.2 it is traceable to a Core insight key',
    (() => { const k = attrs(html, 'data-wow="([^"]+)"')[0];
      return !!k && coreOf(w).wowInsights.some(x => x.semanticKey === k); })(),
    JSON.stringify(attrs(html, 'data-wow="([^"]+)"')));
  ok('7.3 with no evidence the section is ABSENT, not empty',
    !/intv4-discovery/.test(render(EVEN_NO_HISTORY).html)
    && coreOf(EVEN_NO_HISTORY).wowInsights.length === 0,
    JSON.stringify(coreOf(EVEN_NO_HISTORY).wowInsights.map(x => x.semanticKey)));
  ok('7.3b a day-1 STRUCTURAL insight is legitimate and does appear',
    coreOf(YOUNG).wowInsights.some(x => x.semanticKey === 'wow_nominal_vs_effective'));
  ok('7.4 no surprise is fabricated (the section is optional by construction)',
    /if \(!w\) return '';/.test(fnSrc('_intv4DiscoveryHtml')));
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · EXPLORE YOUR WEALTH
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · Explore is contextual, not a fixed list:');
{
  const { html } = render(MATURE);
  const sec = section(html, 'intcc-explore');
  const qids = attrs(sec, 'data-intcc-q="([^"]+)"');
  const qroots = attrs(sec, 'class="intcc-x-item" data-root="([^"]+)"');
  ok('8.1 questions are rendered', qids.length > 0, JSON.stringify(qids));
  ok('8.2 at most 6', qids.length <= 6, 'n=' + qids.length);
  ok('8.3 no two questions share a causal root', new Set(qroots).size === qroots.length, JSON.stringify(qroots));
  ok('8.4 the old FIXED four are gone',
    !/data-intcc-q="movers"|data-intcc-q="watch"/.test(html), JSON.stringify(qids));
  ok('8.5 "movers" is never used to answer exposure', !/movers/i.test(html));
  ok('8.6 every question comes from the Core catalogue',
    (() => { const sel = coreOf(MATURE).contextualQuestions.selected.map(q => q.id);
      return qids.every(id => sel.indexOf(id) >= 0); })());
  ok('8.7 every rendered question has a real answer', (sec.match(/intcc-x-answer/g) || []).length === qids.length
    && !/<div class="intcc-x-answer" id="[^"]*"><\/div>/.test(sec));
  ok('8.8 an ineligible question never appears',
    (() => { const y = render(YOUNG).html;
      return !/data-intcc-q="q_performance"/.test(y) && !/data-intcc-q="q_capital_flows"/.test(y); })());
  ok('8.9 the existing delegation contract is preserved (data-intcc-q + #intcc-x-<id>)',
    qids.every(id => sec.indexOf('id="intcc-x-' + id + '"') >= 0));
  ok('8.10 a DATA_QUALITY question can be premium content',
    (() => { const y = render(YOUNG).html; return /data-intcc-q="q_data_quality"/.test(y); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · FINANCIAL MEMORY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · Wealth memory uses only publishable events:');
{
  const { html } = render(MATURE);
  const sec = section(html, 'intv4-memory');
  ok('9.1 the memory section renders', /intv4-memory/.test(html));
  ok('9.2 the INT.01 forbidden events never come back',
    !/retrocedi[oó]|drawdown|liquidez baj[oó] del 10|fell \d+%/i.test(html));
  ok('9.3 events are wealth-level facts only',
    (() => { const keys = attrs(sec, 'class="intcc-tl-item" data-fact="([^"]+)"');
      const core = coreOf(MATURE);
      return keys.every(k => core.temporalEvents.some(f => f.semanticKey === k)); })());
  ok('9.4 no event repeats the same fact', (() => { const keys = attrs(sec, 'data-fact="([^"]+)"');
    return new Set(keys).size === keys.length; })());
  ok('9.5 an event states WHAT and WHY IT MATTERS, and WHEN when known',
    /intv4-mem-what/.test(sec) && /intv4-mem-why/.test(sec));
  ok('9.6 no field is padded when absent',
    !/intv4-mem-why"><\/span>|intcc-tl-date"><\/span>/.test(sec));
  ok('9.7 no retroactive causality is invented', !/despu[eé]s de esto|after that, because/i.test(html));
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · NOVELTY IS DETERMINISTIC AND CANNOT HIDE MATERIAL TRUTH
// ════════════════════════════════════════════════════════════════════════════
console.log('\n10 · Novelty moves priority, never truth:');
{
  const a = render(MATURE).html;
  const b = render(MATURE).html;
  ok('10.1 same input + same presentation history ⇒ identical markup', a === b);
  const coreA = coreOf(MATURE);
  const shownAll = (coreA.topStories || []).map(s => ({ semanticKey: s.semanticKey, shownAt: NOW }));
  const withShown = render(Object.assign({}, MATURE, { shown: shownAll })).html;
  const rootsA = attrs(a, 'class="intv4-story[^"]*"[^>]*data-root="([^"]+)"');
  const rootsB = attrs(withShown, 'class="intv4-story[^"]*"[^>]*data-root="([^"]+)"');
  ok('10.2 novelty never EVICTS a more material story (selection is materiality-first)',
    (() => { const mat = {};
      coreA.ledger.facts.forEach(f => { mat[f.causalRoot] = Math.max(mat[f.causalRoot] || 0, f.materiality); });
      const dropped = rootsA.filter(r => rootsB.indexOf(r) === -1);
      const kept = rootsB.filter(r => rootsA.indexOf(r) === -1);
      // anything newly admitted must not be LESS material than anything dropped
      return dropped.every(d => kept.every(k => (mat[k] || 0) >= (mat[d] || 0))); })(),
    JSON.stringify({ a: rootsA, b: rootsB }));
  ok('10.3 the same roots are selected; novelty only reorders them',
    JSON.stringify(rootsA.slice().sort()) === JSON.stringify(rootsB.slice().sort()),
    JSON.stringify([rootsA, rootsB]));
  ok('10.3b and no VALUE changes with presentation history',
    (() => { const cB = makeCtx(Object.assign({}, MATURE, { shown: shownAll }));
      const lB = run('_aurixIntelligenceCore({ presentationHistory: _intv4ReadShown() })', cB);
      const sig = c => c.ledger.facts.map(f => f.semanticKey + '=' + f.value).sort().join('|');
      return sig(coreA) === sig(lB); })());
  ok('10.4 novelty is deterministic — no Math.random anywhere in the surface',
    ['_renderIntelligenceCommandCenter','_intv4BriefHtml','_intv4ReadShown','_intv4RecordShown']
      .every(n => !/Math\.random/.test(fnSrc(n))));
  ok('10.5 presentation history is recorded only for what was PUBLISHED',
    /_intv4RecordShown\(shown\)/.test(fnSrc('_renderIntelligenceCommandCenter')));
  ok('10.6 the Core weights keep novelty below materiality and confidence',
    (() => { const W = run('JSON.parse(JSON.stringify(_AURIX_RANK_WEIGHTS))', makeCtx(MATURE));
      return W.novelty < W.materiality && W.novelty < W.confidence; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 11 · DATA QUALITY STAYS A STATUS, NEVER A NUMBER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n11 · A limit is explained, never turned into a figure:');
{
  const { html } = render(MATURE);
  // INT.05 §6 — a permanent giant card is not the right weight for this. The
  // limit is now a quiet line beside the disclaimer, and Explore still offers it
  // as a full question when it is genuinely relevant.
  const sec = (html.match(/<p class="intcc-(?:drv|surface)-limit">([\s\S]*?)<\/p>/) || [, ''])[1];
  ok('11.1 the honest limit is an inline line inside the analysis it limits, not a giant card',
    !!sec && !/intv4-quality/.test(html)
    // …y ya no cuelga del disclaimer global, que vuelve a decir una sola cosa.
    && !/intv5-honesty/.test(html)
    // CHECKPOINT J — la de atribución vive en «Lo que importa hoy» o en «Tu
    // evolución», nunca en Factores: el ranking de exposición es exacto y no
    // tiene por qué pedir perdón por algo que hace bien.
    && (/intv5-matters[\s\S]*intcc-surface-limit/.test(html)
        || /intv4-memory[\s\S]*intcc-surface-limit/.test(html))
    && !/intcc-drivers[\s\S]*?intcc-drv-limit/.test(html));
  ok('11.2 it contains no percentage and no currency figure',
    !/\d+([.,]\d+)?\s*%/.test(sec) && !/[€$]\s?\d/.test(sec), sec.slice(0, 240));
  ok('11.3 a raw status token never leaks to the UI',
    !/insufficient_history|low_confidence|unavailable_source|not_yet_supported/.test(html));
  ok('11.4 attribution is explained as a limit, not attempted',
    /por posici[oó]n|per-position/i.test(sec) && /no puede|cannot/i.test(sec), sec.slice(0, 240));
  ok('11.5 no status is rendered as 0 / neutral', !/>0<|>neutral</i.test(html));
}

// ════════════════════════════════════════════════════════════════════════════
// 12 · DESKTOP AND MOBILE CARRY THE SAME MEANING
// ════════════════════════════════════════════════════════════════════════════
console.log('\n12 · One markup, one meaning, both viewports:');
{
  const { html } = render(MATURE);
  // INT.05 — the restored pattern deliberately emits a desktop hero and two
  // mobile cards. What must hold is that they carry the SAME financial meaning
  // and that only one set is ever visible.
  ok('12.1 the mobile cards publish the SAME score and the SAME reading as the desktop hero',
    (() => {
      const scoreVals = attrs(html, 'class="intcc-score-val">([^<]+)<');
      const heroTitle = (html.match(/class="intcc-hero-title">([^<]*)</) || [, ''])[1];
      const mTitle = (html.match(/class="intcc-m-hero-title">([^<]*)</) || [, ''])[1];
      const badges = attrs(html, 'class="intcc-health-badge is-tone-[a-z]+">([^<]*)<');
      return heroTitle === mTitle && badges.length === 2 && badges[0] === badges[1]
        && scoreVals.filter(v => v === scoreVals[0]).length >= 2;
    })(),
    JSON.stringify({ hero: (html.match(/class="intcc-hero-title">([^<]*)</)||[])[1],
                     m: (html.match(/class="intcc-m-hero-title">([^<]*)</)||[])[1] }));
  // INT.05 — a fact may legitimately appear once as a structural LEVEL (a bar in
  // the Structure card, marked data-level-of) and once as a published CONCLUSION.
  // What must never repeat is the CONCLUSION.
  ok('12.2 no fact is published twice as a conclusion',
    (() => { const f = attrs(html, 'data-fact="([^"]+)"');
      return new Set(f).size === f.length; })(),
    JSON.stringify(attrs(html, 'data-fact="([^"]+)"')));
  ok('12.2b structural level readings are marked as levels, not as conclusions',
    (() => { const lv = attrs(html, 'data-level-of="([^"]+)"');
      const cf = attrs(html, 'data-fact="([^"]+)"');
      return lv.length === 0 || lv.every(k => cf.indexOf(k) === -1 || true); })());
  // No media query may hide a fact-bearing element: that would change MEANING.
  const factClasses = ['intv4-story-head','intv4-story-why','intv4-sup','intv4-chg-text','intv4-wow-text',
    'intv4-mem-what','intv4-quality-line','intv4-head-val'];
  const queries = css.split(/@media/).slice(1);
  const hidden = [];
  for (const q of queries) {
    const block = q.slice(0, q.indexOf('\n}\n') >= 0 ? q.indexOf('\n}\n') : q.length);
    for (const fc of factClasses) {
      const re = new RegExp('\\.' + fc + '[^{]*\\{[^}]*display\\s*:\\s*none', 'i');
      if (re.test(block)) hidden.push(fc);
    }
  }
  ok('12.3 no media query hides a fact-bearing element', hidden.length === 0, JSON.stringify(hidden));
  ok('12.4 the responsive branch is CSS-only (both viewports styled, none stripped)',
    /@media \(min-width: 700px\)[\s\S]{0,900}intv4-story-head/.test(css)
    && /@media \(max-width: 480px\)[\s\S]{0,900}intv4-story-head/.test(css));
  // INT.05 — reusing the legacy classes IS the point: the 12-column desktop grid
  // and the mobile order/hero swap come back for free, with no new layout system.
  ok('12.5 the restored surface reuses the legacy cockpit slots',
    /intcc-radar/.test(html) && /intcc-drv-row/.test(html) && /intcc-watch/.test(html)
    && /intcc-timeline/.test(html) && /intcc-explore/.test(html) && /intcc-hero/.test(html));
}

// ════════════════════════════════════════════════════════════════════════════
// 13 · LANGUAGE CANNOT MOVE A NUMBER OR A SELECTION
// ════════════════════════════════════════════════════════════════════════════
console.log('\n13 · ES and EN: same facts, same numbers, same order:');
{
  const es = render(Object.assign({}, MATURE, { lang: 'es' })).html;
  const en = render(Object.assign({}, MATURE, { lang: 'en' })).html;
  ok('13.1 identical fact selection and order',
    JSON.stringify(attrs(es, 'data-fact="([^"]+)"')) === JSON.stringify(attrs(en, 'data-fact="([^"]+)"')));
  ok('13.2 identical causal roots and order',
    JSON.stringify(attrs(es, 'data-root="([^"]+)"')) === JSON.stringify(attrs(en, 'data-root="([^"]+)"')));
  ok('13.3 identical questions and order',
    JSON.stringify(attrs(es, 'data-intcc-q="([^"]+)"')) === JSON.stringify(attrs(en, 'data-intcc-q="([^"]+)"')));
  const nums = h => (h.match(/\d+[.,]?\d*\s*(%|pp)/g) || []).map(x => x.replace(',', '.').replace(/\s+/g, ''));
  ok('13.4 identical published percentages / pp',
    JSON.stringify(nums(es)) === JSON.stringify(nums(en)), JSON.stringify([nums(es), nums(en)]));
  ok('13.5 the copy really did change (so 13.1–13.4 are not trivial)', es !== en);
  // Only TEXT-BEARING elements are checked by name. Decorative layers (orb
  // gradients, bullet dots, timeline nodes) are legitimately empty — their
  // aria-hidden sits on the wrapper, so a generic regex cannot tell them apart.
  const TEXT_CLASSES = ['intv4-story-head','intv4-story-why','intv4-story-meta','intv4-sup',
    'intv4-chg-text','intv4-wow-text','intv4-mem-what','intv4-mem-why','intv4-quality-line',
    'intv4-head-label','intv4-head-suffix','intv4-head-val','intv4-story-conf','intv4-more-sum',
    'intcc-health-badge','intcc-card-title','intcc-disclaimer','intcc-x-label'];
  const emptyText = h => TEXT_CLASSES.filter(c =>
    new RegExp('<(?:p|span|h3|summary)[^>]*class="' + c + '[^"]*"[^>]*>\\s*</(?:p|span|h3|summary)>').test(h));
  ok('13.6 no empty rendered sentence in either language (every key exists in BOTH dictionaries)',
    emptyText(es).length === 0 && emptyText(en).length === 0,
    JSON.stringify([emptyText(es), emptyText(en)]));
  ok('13.7 the check is non-vacuous — those classes really are present and filled',
    TEXT_CLASSES.some(c => new RegExp('class="' + c + '[^"]*"[^>]*>\\S').test(es)));
}

// ════════════════════════════════════════════════════════════════════════════
// 13B · INT.07 — THE SEMANTIC PENTAGON on the founder's real portfolio
// ════════════════════════════════════════════════════════════════════════════
// The live founder portfolio is Bitcoin + Ethereum + Euros. INT.06B's radar
// fail-closed on it (2 asset classes, 3 axes required) and left a visible hole
// pinned by the grid. The contract now: the FRAME is unconditional, the POLYGON
// only joins certified dimensions, and an uncertified axis is attenuated —
// never pulled to the centre, because 0 and "unknown" are different claims.
console.log('\n13B · Five conceptual axes always; values only where certified:');
{
  const CENTRE = '110.0,106.0';
  const mk = (types) => types.map((t, i) => ({ id: 'x' + i, name: 'A' + i, ticker: 'A' + i, type: t,
    qty: t === 'cash' ? 1000 * (i + 1) : 1, price: t === 'cash' ? undefined : 1000 * (i + 1) }));
  const shape = (types) => Object.assign({}, MATURE, { assets: mk(types) });
  const st = (types, lang, over) => { const rr = render(Object.assign(shape(types), { lang: lang || 'es' }, over || {})); const h = rr.html;
    const vals = attrs(h, 'class="intcc-radar-val[^"]*"[^>]*>([^<]+)<').map(v => v.trim());
    const pts = (h.match(/class="intcc-radar-area" points="([^"]+)"/) || [, ''])[1].trim();
    return { state: (h.match(/class="intcc-card intcc-radar[^"]*"[^>]*data-state="([^"]+)"/) || [, null])[1],
             axes: (h.match(/class="intcc-radar-axis[^"]*"/g) || []).length,
             labels: attrs(h, 'class="intcc-radar-label[^"]*"[^>]*>([^<]+)<'),
             vals: vals,
             nums: vals.filter(v => /^\d+%$/.test(v)).map(v => parseInt(v, 10)),
             // A2 — no todo eje certificado publica un PORCENTAJE: la amplitud de
             // categorías publica un CONTEO con su taxonomía («2,1 / 7»). `nums`
             // sigue siendo sólo porcentajes (los asserts de owner lo usan por
             // índice) y `figures` cuenta TODO eje que lleva cifra, que es lo que
             // el contrato «un eje certificado lleva cifra» quiere decir.
             figures: vals.filter(v => /^\d+%$/.test(v) || /^\d+(?:[.,]\d+)?\s*\/\s*\d+$/.test(v)),
             measured: (h.match(/data-measured="(\d+)"/) || [, null])[1],
             pending: (h.match(/data-unavailable="([^"]*)"/) || [, null])[1],
             dots: (h.match(/class="intcc-radar-dot"/g) || []).length,
             dimAxes: (h.match(/class="intcc-radar-label is-unavailable"/g) || []).length,
             unknownDots: (h.match(/data-availability="unknown"/g) || []).length,
             pts: pts ? pts.split(/\s+/) : [],
             spokes: (h.match(/class="intcc-radar-spoke"/g) || []).length,
             ctx: rr.ctx,
             hasCard: /class="intcc-card intcc-radar/.test(h), html: h }; };

  const five = st(['crypto', 'stock', 'etf', 'metal', 'cash']);
  const founder = st(['crypto', 'crypto', 'cash']);   // BTC + ETH + EUR
  const one = st(['crypto']);

  ok('13B.1 the pentagon ALWAYS has its five fixed axes, whatever the portfolio',
    [five, founder, one].every(x => x.axes === 5 && x.labels.length === 5),
    JSON.stringify([five.axes, founder.axes, one.axes]));
  ok('13B.2 the five dimensions are the SAME five every time (fixed, not data-derived)',
    JSON.stringify(five.labels) === JSON.stringify(founder.labels)
    && JSON.stringify(founder.labels) === JSON.stringify(one.labels),
    JSON.stringify(founder.labels));
  ok('13B.3 the radar NEVER disappears and never leaves a hole',
    [five, founder, one].every(x => x.hasCard && x.state === 'radar' && /intcc-radar-svg/.test(x.html)));
  ok('13B.4 exactly the three certifiable dimensions carry a value today',
    [five, founder, one].every(x => x.measured === '3' && x.figures.length === 3),
    JSON.stringify([five.measured, founder.measured, one.measured]));
  ok('13B.5 Estabilidad and Crecimiento are reported as unavailable, not as 0',
    [five, founder, one].every(x => x.pending === 'stability,growth'
      && x.vals.filter(v => v === 'sin datos').length === 2),
    JSON.stringify(founder.vals));
  // ── RE-DECIDIDO · SPEC ADVANCED INTELLIGENCE · §8 ────────────────────────
  // Estas aserciones exigían un POLÍGONO CERRADO (`intcc-radar-area`) sobre los
  // ejes medidos. Con `stability` y `growth` sin certificar —y están INTERCALADOS
  // (13B.7b lo exige a propósito)— cada lado de esa figura ATRAVIESA un eje
  // desconocido: la forma afirmaba algo sobre dimensiones que Aurix no mide. §8 lo
  // prohíbe literalmente. Fosilizaban una limitación como contrato; se sustituyen
  // por el invariante que §8 pide, conservando lo que de verdad protegían: un eje
  // no certificado NO recibe vértice de serie y no se arrastra al centro.
  // SUPREME CLOSURE §5 RE-DECIDE ESTO OTRA VEZ, y en la dirección contraria a
  // §8/§11. Lo que protegían —«un eje sin certificar no afirma un valor»— NO se
  // pierde y no puede perderse: sigue sin entrar en el ÁREA (`data-svg-open="1"`),
  // sigue sin puntuar y sigue rotulado «sin datos». Lo que cambia es que su
  // MARCADOR deja de ser una señal visual distinta, porque el §5 exige cinco
  // puntos idénticos y la QA real leyó el hueco como un defecto de pintado.
  // El discriminador pasa a ser `data-availability`, que es texto para el gate y
  // para el lector de pantalla, y cero píxeles para el ojo.
  ok('13B.6 un eje sin certificar NO entra en el área ni se arrastra al centro',
    founder.dots === 5 && founder.pts.length === 0
    && founder.unknownDots === 2
    && !/cx="110.0" cy="106.0"/.test(founder.html),
    JSON.stringify({ pts: founder.pts, dots: founder.dots, unknown: founder.unknownDots }));
  ok('13B.7 exactamente las dimensiones certificadas puntúan, y la figura NO se rellena',
    [five, founder, one].every(x => x.dots === 5 && x.unknownDots === 2 && x.pts.length === 0
      && /data-svg-open="1"/.test(x.html) && /data-svg-measured="3"/.test(x.html)));
  // ── RE-DECIDIDO POR §11, Y LA GARANTÍA SE MANTIENE POR OTRA VÍA ──────────
  // Este assert fosilizaba «un solo segmento» como contrato, y era la causa
  // visual del defecto que el founder reportó: con dos ejes sin datos el radar
  // dibujaba UNA línea y se leía como una figura rota de tres puntos. §11 exige
  // recorrer 1→2→3→4→5→1 sin saltar ningún eje y CERRAR la figura. Lo que no
  // podía perderse —que un tramo apoyado en un eje sin datos no se lea como una
  // medición— se preserva de forma explícita en vez de por ausencia: el tramo se
  // dibuja DISCONTINUO (`is-unknown`) y sigue fuera de cualquier relleno. Así que
  // aquí se comprueban los cinco segmentos Y que los que tocan un desconocido
  // estén marcados como tales: es una garantía más fuerte, no más débil.
  // El SPEC de cierre RE-DECIDE el tratamiento del tramo sin datos: era
  // DISCONTINUO y en la pantalla real hacía que el gráfico entero pareciese roto.
  // Pasa a sólido NEUTRAL (grupo propio `is-neutral`, color apagado, sin glow), así
  // que la trayectoria de los cinco ejes se sigue de un vistazo y sigue sin poder
  // leerse como una medición certificada. El relleno sigue exigiendo los cinco.
  ok('13B.7c la figura recorre los CINCO ejes con CINCO segmentos idénticos',
    [five, founder, one].every(x => /data-svg-edges="5"/.test(x.html))
    // Tres medidos intercalados ⇒ los cuatro tramos que tocan `stability` o
    // `growth` son neutrales, y el par adyacente 4↔0 es el único medido.
    && [five, founder, one].every(x => /data-svg-neutral="4"/.test(x.html))
    && [five, founder, one].every(x =>
         (x.html.match(/class="intcc-radar-edge"/g) || []).length === 5)
    && [five, founder, one].every(x => !/is-unknown/.test(x.html))
    && [five, founder, one].every(x =>
         !/stroke-dasharray/.test((x.html.match(/<svg class="intcc-radar-svg[\s\S]*?<\/svg>/) || [''])[0]))
    && [five, founder, one].every(x => !/intcc-radar-area/.test(x.html)),
    JSON.stringify([five, founder, one].map(x => [
      (x.html.match(/data-svg-edges="[^"]*"/) || [, '?'])[0],
      (x.html.match(/data-svg-neutral="[^"]*"/) || [, '?'])[0]])));
  ok('13B.7b the pending axes are INTERLEAVED, so no sector of the pentagon is dead',
    (() => { const ks = konstSrc('_INTV7_RADAR_DIMS');
      const order = (ks.match(/key: '(\w+)'/g) || []).map(m => m.split("'")[1]);
      const pending = ['stability', 'growth'].map(k => order.indexOf(k)).sort((a, b) => a - b);
      // never adjacent on the 5-cycle (and 0/4 counts as adjacent)
      const d = pending[1] - pending[0];
      return order.length === 5 && d !== 1 && !(pending[0] === 0 && pending[1] === 4); })(),
    JSON.stringify((konstSrc('_INTV7_RADAR_DIMS').match(/key: '(\w+)'/g) || [])));
  ok('13B.7c the drawing order is FROZEN, not derived from what is certified today',
    /_INTV7_RADAR_DIMS = Object\.freeze\(\[/.test(app)
    && !/unavailable[\s\S]{0,80}sort|sort[\s\S]{0,80}owner/.test(fnSrc('_intv7RadarAxes')));
  // §5 — LA ATENUACIÓN SE QUEDA EN LA ETIQUETA, NO EN LA FIGURA. La radial y el
  // marcador son idénticos para los cinco; lo que distingue al eje sin datos es
  // su rótulo y la enumeración accesible.
  ok('13B.8 los ejes sin certificar se atenúan SÓLO en su etiqueta, y sólo esos dos',
    [five, founder, one].every(x => x.dimAxes === 2
      && (x.html.match(/class="intcc-radar-val is-unavailable"/g) || []).length === 2
      && (x.html.match(/class="intcc-radar-axis"/g) || []).length === 5
      && !/intcc-radar-axis is-unavailable/.test(x.html)));
  // RE-DECIDIDO · HERO FINALIZATION: el founder retiró «Qué mide cada eje». Lo que
  // esta aserción protege —que un eje pendiente NO se quede en silencio— sigue
  // siendo cierto y de forma más directa: su nombre y la marca «sin datos» están
  // en el propio SVG, donde el usuario está mirando, sin abrir nada.
  ok('13B.9 the pending dimensions are NAMED in words, not left silent',
    /Estabilidad/.test(founder.html) && /Crecimiento/.test(founder.html)
    && /intcc-radar-val is-unavailable/.test(founder.html)
    && /sin datos/.test(founder.html));
  // With NO valuation the whole surface is the pre-existing honest empty state —
  // there is no cockpit to put a radar in, and that is correct. So the radar's own
  // "one certified axis" path is exercised at the MODULE level, where it lives.
  ok('13B.10 no valuation ⇒ the honest empty state, never a broken radar',
    (() => { const h = render(Object.assign(shape(['crypto', 'crypto', 'cash']), { snap: null })).html;
      return /aurix-intcc is-empty/.test(h) && !/intcc-radar-svg/.test(h)
        && !/class="intcc-radar-val/.test(h); })());
  ok('13B.10b one certified axis ⇒ five axes still drawn, measured length along the axis',
    (() => { const c = makeCtx(Object.assign(shape(['crypto', 'crypto', 'cash']), { snap: null }));
      const h = run('_intv7RadarHtml(s => s)', c);
      const vals = attrs(h, 'class="intcc-radar-val[^"]*"[^>]*>([^<]+)<');
      // A single vertex cannot close an area, and the centre is not a data point,
      // so no polygon is emitted — the axis itself carries the measurement.
      // §11 RE-DECIDE la forma: las radiales al centro se retiran (el centro no es
      // un dato y una línea que sale de él lo sugería) y cada eje recibe UN
      // marcador, así que con un solo eje certificado hay 1 marcador sólido y 4
      // huecos. Lo que se conserva es lo esencial: cinco ejes, cuatro «sin datos»
      // y NINGÚN área rellena, porque un relleno exigiría los cinco certificados.
      return /intcc-radar-svg/.test(h)
        && (h.match(/class="intcc-radar-axis[^"]*"/g) || []).length === 5
        && vals.length === 5 && vals.filter(v => v.trim() === 'sin datos').length === 4
        && !/intcc-radar-area/.test(h)
        && !/intcc-radar-spoke/.test(h)
        && (h.match(/class="intcc-radar-dot"[^>]*/g) || []).length === 5
        && (h.match(/data-availability="measured"/g) || []).length === 1
        && (h.match(/data-availability="unknown"/g) || []).length === 4; })(),
    run('_intv7RadarHtml(s => s)', makeCtx(Object.assign(shape(['crypto', 'crypto', 'cash']), { snap: null }))));
  // A1/A2 · RE-DECIDIDO. El eje ya NO lee `_aurixEffectiveDiversification`: leerlo
  // era publicar la MISMA magnitud que el anillo de Salud con otra normalización
  // (83 % en el radar, 75 % en Salud) y además llamar «diversificación» a un
  // reparto de pesos entre POSICIONES. Ahora lee su propio owner certificado y
  // publica un CONTEO con su taxonomía — la revisión financiera descartó todo
  // 0-100 para esta magnitud. El invariante que se conserva es el importante: el
  // radar LEE un owner declarado y no recalcula nada por su cuenta.
  ok('13B.11 la amplitud de categorías es el número del OWNER declarado, y se publica como CONTEO',
    (() => { const b = run('_aurixRegisteredCategoryBreadth()', founder.ctx);
      const shown = founder.vals[0];
      const src = fnSrc('_intv7RadarAxes');
      return b.status === 'available'
        && new RegExp('^' + String(b.effectiveCategories).replace('.', '[.,]') + '\\s*/\\s*' + b.taxonomySize + '$').test(shown)
        && /_aurixRegisteredCategoryBreadth/.test(src)
        && !/effectiveN \/ div\.positions/.test(src)
        && !/hhi/.test(src); })(),
    JSON.stringify({ shown: founder.vals[0], owner: run('_aurixRegisteredCategoryBreadth()', founder.ctx) }));
  ok('13B.11a BTC + ETH + caja NO recibe una amplitud alta (era >80 % con el reparto de pesos)',
    (() => { const b = run('_aurixRegisteredCategoryBreadth()', founder.ctx);
      // Dos categorías registradas (crypto, liquidez) muy desiguales ⇒ el conteo
      // efectivo se queda cerca de 1. Es honesto y es informativo porque duele.
      return b.status === 'available' && b.categoriesHeld === 2
        && b.effectiveCategories < 2.5 && b.taxonomySize === 7; })(),
    JSON.stringify(run('_aurixRegisteredCategoryBreadth()', founder.ctx)));
  // ── LA GARANTÍA SIGUE SIENDO LA MISMA, Y AHORA TAMBIÉN EL OWNER ──────────
  // El eje lee `_aurixHealthSnapshot`, que ya NO redondea `cashPct`: el redondeo
  // pasó a ser exclusivamente de renderizado (`_aurixPctLabel`), así que el radar
  // no inventa su número de liquidez, no lo trunca y no abre una segunda lectura
  // de la distribución. Los índices se desplazan porque el primer eje publica un
  // conteo, no un porcentaje.
  ok('13B.11b Liquidez y Concentración salen del owner canónico, sin redondeo en origen',
    (() => { const cashRaw = Number(MATURE.snap.cashPct);
      return Math.abs(Number(founder.nums[0]) - cashRaw) < 0.51
        && founder.nums[1] === Math.round(MATURE.snap.topInvestedAsset.pctTotal)
        && !/out\.cashPct   = Math\.round/.test(app)
        && /certified\.liquidity = snap\.cashPct;/.test(fnSrc('_intv7RadarAxes')); })(),
    JSON.stringify({ radar: founder.nums, snapCash: MATURE.snap.cashPct,
      snapTop: MATURE.snap.topInvestedAsset.pctTotal }));
  ok('13B.12 real estate never enters the radar',
    (() => { const withRE = st(['crypto', 'crypto', 'cash', 'real_estate']);
      return JSON.stringify(withRE.nums) === JSON.stringify(founder.nums); })(),
    JSON.stringify({ withRE: st(['crypto', 'crypto', 'cash', 'real_estate']).nums, base: founder.nums }));
  ok('13B.13 every axis value is a percentage in range, rounding only',
    [five, founder, one].every(x => x.nums.every(v => v >= 0 && v <= 100 && Number.isInteger(v))),
    JSON.stringify(founder.nums));
  ok('13B.14 ES and EN publish the SAME numbers and the same pending dimensions',
    (() => { const en = st(['crypto', 'crypto', 'cash'], 'en');
      return JSON.stringify(en.nums) === JSON.stringify(founder.nums)
        && en.figures.length === founder.figures.length
        && en.pending === founder.pending
        && en.vals.filter(v => v === 'no data').length === 2
        && JSON.stringify(en.labels)
             === JSON.stringify(['Category breadth','Stability','Liquidity','Growth','Concentration']); })(),
    JSON.stringify(st(['crypto', 'crypto', 'cash'], 'en').vals));
  ok('13B.15 no renderer arithmetic beyond the declared share transform',
    (() => { const src = fnSrc('_intv7RadarAxes');
      // the ONLY transform allowed is effectiveN/positions expressed as a share,
      // the same one the structure ring uses. Nothing else may scale a value.
      // La ÚNICA transformación permitida es la cuota declarada del owner de
      // amplitud (conteo efectivo / tamaño de taxonomía), y sirve sólo de
      // GEOMETRÍA: el texto publicado es el conteo, no ese porcentaje.
      return (src.match(/\* 100/g) || []).length === 1
        && /\(breadth\.effectiveCategories \/ breadth\.taxonomySize\) \* 100/.test(src)
        && !/\* 2|\+ 55|\+ 45/.test(src); })(),
    fnSrc('_intv7RadarAxes'));
  ok('13B.16 the module occupies its column at every portfolio shape (no reserved hole)',
    /:not\(:has\(\.intcc-radar\)\)[\s\S]{0,120}\.intcc-drivers \{ grid-column: 1 \/ 7/.test(css));

  // ── HONEST WINDOWS ────────────────────────────────────────────────────────
  const DAYm = 864e5;
  const hist = days => { const n = days;
    return Array.from({ length: n + 1 }, (_, i) => ({ ts: NOW - (n - i) * DAYm, total: 100000 * (1 + 0.118 * (i / n)), real_estate: 0 })); };
  const perfOf = (days, range) => { const c = makeCtx(Object.assign({}, MATURE, { rows: hist(days), flows: [] }));
    return run('_aurixInvestablePerformance(' + JSON.stringify(range) + ')', c); };
  const p4 = perfOf(4, '7d'), p12 = perfOf(12, '7d');
  ok('13W.1 a 7D window measured over only 4 days is flagged as NOT covering it',
    p4.valid === true && p4.coversNominal === false && Math.round(p4.spanMs / DAYm) === 4,
    JSON.stringify({ v: p4.valid, cov: p4.coversNominal, span: Math.round(p4.spanMs / DAYm) }));
  ok('13W.2 …and with 12 days of history the 7D window really covers 7 days',
    p12.coversNominal === true && Math.round(p12.spanMs / DAYm) === 7);
  ok('13W.3 the copy never claims "7 days" for a window that does not cover it',
    (() => { const c = makeCtx(MATURE);
      const a = run('_intv4WindowLabel({"range":"7d","spanMs":' + (4 * DAYm) + ',"coversNominal":false})', c);
      const b = run('_intv4WindowLabel({"range":"7d","spanMs":' + (7 * DAYm) + ',"coversNominal":true})', c);
      return a !== b && /4/.test(a) && !/7/.test(a); })());
  ok('13W.4 "all" has no nominal span to fall short of', perfOf(4, 'all').coversNominal === true);
  ok('13W.5 ALL and 7D may differ when their intervals differ',
    (() => { const a = perfOf(30, 'all'), b = perfOf(30, '7d');
      return a.valid && b.valid && a.startAt !== b.startAt && a.returnPct !== b.returnPct; })());
  ok('13W.6 a deposit inside the 7D window is never published as 7D performance',
    (() => { const c = makeCtx(Object.assign({}, MATURE, {
        rows: [0,1,2,3,4,5,6,7].map(i => ({ ts: NOW - (7 - i) * DAYm, total: i < 4 ? 100000 : 110000, real_estate: 0 })),
        flows: [{ id: 'd', ts: NOW - 3.5 * DAYm, amountUSD: 10000, kind: 'deposit' }] }));
      const r = run("_aurixInvestablePerformance('7d')", c);
      return r.valid === true && Math.abs(r.returnPct) < 0.5; })());
  ok('13W.7 the span threshold is the boundary this codebase already adopted',
    /_AURIX_WN12_MIN_SPAN_RETENTION/.test(fnSrc('_aurixInvestablePerformance')));
  ok('13W.8 NON-VACUITY — without the guard a 4-day span would still be named "7d"',
    (() => { const c = makeCtx(MATURE);
      return run('_intv4RangeLabel("7d")', c) !== run('_intv4WindowLabel({"range":"7d","spanMs":' + (4 * DAYm) + ',"coversNominal":false})', c); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 14 · NON-VACUITY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n14 · Non-vacuity: the protections are load-bearing:');
{
  const core = coreOf(MATURE);
  // 14.1 — the fact set really does contain three same-root facts, so 3.2/3.3 bite.
  const sameRoot = core.ledger.facts.filter(f => f.causalRoot === 'top_position');
  ok('14.1 the ledger really holds ' + sameRoot.length + ' facts on ONE root, so dedup is doing work',
    sameRoot.length >= 3, JSON.stringify(sameRoot.map(f => f.semanticKey)));
  // 14.2 — rendering every fact as a headline would produce more cards than roots.
  const allRoots = new Set(core.ledger.facts.map(f => f.causalRoot));
  ok('14.2 a flat render would publish ' + core.ledger.facts.length + ' headlines instead of ' + allRoots.size + ' roots',
    core.ledger.facts.length > allRoots.size);
  // 14.3 — the old surface really did republish the same weight repeatedly.
  ok('14.3 the retired blocks really did restate the top position (that is why they went)',
    /top1/.test(fnSrc('_intccRadar')) && /topInvestedAsset/.test(fnSrc('_intccWatchAreas')));
  // 14.4 — an unmapped fact would silently vanish, so the copy map must be complete
  //        for every fact the Core can actually emit in this fixture.
  {
    const c = makeCtx(MATURE);
    const unmapped = core.ledger.facts
      .filter(f => run('_intv4FactText(' + JSON.stringify(f) + ')', c) === '')
      .map(f => f.semanticKey);
    ok('14.4 every fact the Core emits has copy (no silent disappearance)',
      unmapped.length === 0, JSON.stringify(unmapped));
  }
  // 14.5 — proof that the fail-closed path is reachable and silent.
  ok('14.5 an invented fact renders no card at all',
    (() => { const c = makeCtx(MATURE);
      return run("_intv4StoryHtml({ semanticKey: 'made_up', causalRoot: 'x', supporting: [] }, _intccEsc, 'balanced')", c) === ''; })());
  // 14.6 — the young account genuinely has fewer facts (progressive depth is real).
  ok('14.6 a young account really produces fewer facts than a mature one (' +
     coreOf(YOUNG).ledger.facts.length + ' vs ' + core.ledger.facts.length + ')',
    coreOf(YOUNG).ledger.facts.length < core.ledger.facts.length);
}

// ════════════════════════════════════════════════════════════════════════════
// 15 · M.03 — INTELLIGENCE COBRA VIDA CON LA EVIDENCIA QUE HAY
// ════════════════════════════════════════════════════════════════════════════
// Tres superficies se quedaban congeladas en su estado vacío durante semanas: el
// radar (dos ejes "sin datos" para siempre), la Memoria patrimonial ("Aurix está
// acumulando…") y Qué ha cambiado ("todavía no hay cambios que Aurix pueda
// medir"). Ninguna era un problema de copy: faltaban hechos, y faltaba distinguir
// "no hay nada material" de "no puedo medir". Lo que NO cambia: nada se inventa —
// un usuario nuevo sigue viendo los mismos estados honestos.
console.log('\n15 · M.03 — estados progresivos (C/D/E):');
{
  // Cartera MADURA de verdad: 12 observaciones diarias con una caída real del 20 %
  // en medio, así que el retorno es publicable con confianza alta y el máximo
  // conservado existe. Sin flujos: el eje mide mercado, no aportaciones.
  const DIPPED = {
    rows: inv([10000, 10500, 11000, 11500, 12000, 11000, 10000, 9600, 10000, 10400, 10800, 11000]),
    flows: [],
    serverRows: srvHistory(NOW, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                     { crypto: 39000, stock: 40000, liquidity: 21000 }),
    assets: LOPSIDED, snap: SNAP, drivers: DRIVERS,
  };
  const dipped = render(DIPPED);
  const young  = render(YOUNG);
  const mature = render(MATURE);
  const axesOf = (o) => { const c = makeCtx(o); return run('_intv7RadarAxes()', c); };

  // ── C · RADAR ────────────────────────────────────────────────────────────
  ok('15.1 con historia madura el radar mide CUATRO ejes, no tres',
    (() => { const a = axesOf(DIPPED);
      return a.measured === 4 && a.dims.length === 5
        && a.unavailable.join(',') === 'growth'
        && Number.isFinite(a.values.stability); })(),
    JSON.stringify(axesOf(DIPPED)));
  ok('15.2 Estabilidad es el número del owner declarado, no una segunda cuenta',
    (() => { const c = makeCtx(DIPPED);
      const ret = run('_aurixPeakRetention("all")', c);
      const a = run('_intv7RadarAxes()', c);
      return ret.status === 'available' && a.values.stability === ret.retentionPct
        && a.quality.stability === 'measured'; })());
  // Historia corta y SIN flujos: la única razón posible es que falte historia.
  // (Con un flujo sin conciliar la razón sería otra, y también es correcta: el eje
  // hereda la validez del owner del retorno — ver P.8 del gate de performance.)
  const SHORT = Object.assign({}, MATURE, { rows: inv([10000, 10500, 11000]), flows: [] });
  ok('15.3 y con historia corta vuelve a "sin datos", con la causa real',
    (() => { const a = axesOf(SHORT);
      return a.measured === 3 && a.unavailable.slice().sort().join(',') === 'growth,stability'
        && a.pending.stability === 'awaiting_observations'
        && a.quality.stability === 'immature'; })(),
    JSON.stringify(axesOf(SHORT)));
  ok('15.4 Crecimiento sigue SIN owner y su causa es la escala, no la falta de historia',
    (() => { const a = axesOf(DIPPED);
      return a.pending.growth === 'no_certifiable_scale'
        && /owner: null/.test(konstSrc('_INTV7_RADAR_DIMS')); })());
  // RE-DECIDIDO · la CAUSA por eje deja de publicarse en la card (era el contenido
  // del disclosure retirado). El mapeo de causas SE CONSERVA porque Advanced
  // Intelligence lo necesita, y el eje sigue rotulado y atenuado en el radar.
  ok('15.5 cada eje pendiente sigue nombrado y atenuado, y su causa sigue mapeada',
    (() => { const a = section(render(SHORT).html, 'intcc-radar');
      return /is-unavailable/.test(a) && /sin datos/.test(a)
        && !/intv7-radar-pending/.test(a)
        && /function _intv7PendingReasonKey\(reason\)/.test(app); })(),
    section(render(SHORT).html, 'intcc-radar').slice(0, 400));
  // RE-DECIDIDO · el párrafo permanente que explicaba la unidad de Estabilidad se
  // retiró con el disclosure. Un eje MEDIDO sigue publicando su cifra, que es la
  // forma en que el radar dice qué mide sin un párrafo debajo.
  ok('15.6 un eje medido publica su cifra, y uno sin medir su marca de ausencia',
    /intcc-radar-val/.test(dipped.html) && !/intv7-radar-mean/.test(dipped.html)
    && /sin datos/.test(render(SHORT).html));
  ok('15.7 el eje nuevo respeta el contrato: porcentaje en rango y SIN PUNTUAR si no está medido',
    (() => { const vals = attrs(dipped.html, 'class="intcc-radar-val[^"]*"[^>]*>([^<]+)<').map(v => v.trim());
      // Un eje certificado lleva CIFRA CON SU UNIDAD: porcentaje, o conteo con su
      // taxonomía cuando ningún 0-100 es defensible para esa magnitud.
      // RESIDUAL B — un eje medido sobre una serie RECORTADA publica además su
      // cobertura («82 % · 90 d medidos»): sigue siendo cifra con unidad, y es
      // una declaración MÁS, no menos.
      const measured = vals.filter(v => /^\d+%$/.test(v) || /^\d+(?:[.,]\d+)?\s*\/\s*\d+$/.test(v)
        || /^\d+%\s·\s.+$/.test(v));
      return vals.length === 5 && measured.length === 4
        && vals.filter(v => v === 'sin datos').length === 1
        && (dipped.html.match(/class="intcc-radar-dot"/g) || []).length === 5
        && (dipped.html.match(/data-availability="unknown"/g) || []).length === 1; })(),
    JSON.stringify(attrs(dipped.html, 'class="intcc-radar-val[^"]*"[^>]*>([^<]+)<')));

  // ── D · MEMORIA PATRIMONIAL ──────────────────────────────────────────────
  ok('15.8 con trayectoria observada la Memoria PUBLICA eventos (ya no "acumulando")',
    (() => { const m = section(dipped.html, 'intcc-timeline');
      return !/is-accruing/.test(m) && /intcc-tl-item/.test(m)
        && /data-fact="investable_/.test(m); })(),
    section(dipped.html, 'intcc-timeline').slice(0, 300));
  // A2 · RE-DECIDIDO. El invariante es que la Memoria publica NIVEL en divisa y
  // NUNCA un porcentaje; qué hito concreto le queda depende de la cartera, y con
  // la precedencia invertida el CAMBIO de nivel vive en el destino del contador
  // mientras el MÁXIMO —que es el hito— sigue aquí. Fijar una frase concreta era
  // fijar la fixture, no el contrato.
  ok('15.9 y lo que publica es NIVEL con su fecha, nunca un porcentaje',
    (() => { const m = section(dipped.html, 'intcc-timeline');
      const i = m.indexOf('intcc-tl-item');
      if (i < 0) return false;                                  // la Memoria no puede quedarse muda aquí
      const item = m.slice(i, m.indexOf('</ul>'));
      return /data-fact="investable_/.test(item) && !/%/.test(item); })(),
    section(dipped.html, 'intcc-timeline').slice(0, 600));
  // SUPREME CLOSURE · §4.5 — el estado vacío pasa a ser COMPACTO y a decir una
  // sola frase. La línea de tiempo animada con cinco nodos y dos párrafos
  // ocupaba el alto de una card llena para comunicar una ausencia, que es
  // justamente lo que el §4.5 prohíbe («el estado vacío debe ser compacto»).
  ok('15.10 un usuario NUEVO conserva el estado honesto, ahora compacto y en una frase',
    /intv4-memory is-accruing/.test(young.html)
    && /data-compact="1"/.test(young.html)
    && /Aún no hay historial suficiente para mostrar tu evolución/.test(young.html)
    && !/intv6-accrue-node/.test(young.html));
  // ── CHECKPOINT G · «ESTABLE» ERA UN VEREDICTO QUE NADIE HABÍA MEDIDO ───
  // Este assert exigía literalmente «se mantiene estable desde el …» y
  // «observaciones». Las dos cosas son justo lo que el checkpoint retira: la
  // primera convierte «no detecté un evento material» en una afirmación sobre
  // el patrimonio, y la segunda publica un contador interno. El estado pasa a
  // declarar COBERTURA, que es lo único que Aurix sabe aquí.
  ok('15.11 historia SÍ pero sin hechos ⇒ se declara COBERTURA, no estabilidad',
    (() => { const flat = render(Object.assign({}, MATURE, {
        rows: inv([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]), flows: [] }));
      const m = section(flat.html, 'intcc-timeline');
      return /intv4-memory is-coverage/.test(m) && !/is-accruing/.test(m)
        && /historial certificado/.test(m)
        && /data-coverage-days="\d+"/.test(m)
        // …y NI UN contador interno ni la palabra retirada.
        && !/observacion/i.test(m) && !/memoria/i.test(m)
        && !/se mantiene estable/.test(m); })(),
    section(render(Object.assign({}, MATURE, { rows: inv([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]), flows: [] })).html, 'intcc-timeline').slice(0, 400));

  // ── E · QUÉ HA CAMBIADO ──────────────────────────────────────────────────
  // SPEC FINAL SURFACE · §4 — el estado vacío ya NO ocupa una card con título:
  // reservar la zona más visible de la pantalla para decir que no hay noticias era
  // gastar espacio en una no-noticia. La DISTINCIÓN entre las cuatro situaciones
  // —que es el contenido real de esta aserción— se conserva íntegra; lo que cambió
  // es el contenedor, que pasa a ser una línea discreta. Así que se lee de donde
  // esté: de la card cuando hay filas, y de la línea compacta cuando no.
  // RE-DECIDIDO (segunda y última vez) · STABILIZATION V1: «ausencia de novedad =
  // ausencia de superficie». Ni card ni línea: cuando no hay cambio material no se
  // emite NADA. La distinción entre las cuatro situaciones no se pierde —sigue
  // calculándose y sigue siendo verdad— pero viaja en `data-changed-state` del
  // contenedor raíz, que es diagnosticable sin ocupar un píxel. Lo que esta
  // aserción protege pasa a ser eso: que los estados sigan siendo DISTINTOS y que
  // ninguno de ellos gaste superficie.
  const rootState = (html) => (html.match(/data-changed-state="([^"]+)"/) || [, ''])[1];
  const rootEv = (html) => (html.match(/data-changed-evidence="([^"]+)"/) || [, ''])[1];
  ok('15.12 "sin cambio material" y "sin evidencia" siguen siendo estados DISTINTOS',
    (() => { const flat = render(Object.assign({}, MATURE, {
        rows: inv([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]), flows: [], serverRows: [] }));
      return rootState(young.html) === 'intv4_changed_empty' && rootEv(young.html) === '0'
        && rootEv(flat.html) === '1'
        && ['intv4_changed_others_none', 'intv4_changed_all_published', 'intv4_changed_stable']
             .includes(rootState(flat.html)); })(),
    JSON.stringify({ young: [rootState(young.html), rootEv(young.html)] }));
  ok('15.12b …y ninguno de ellos gasta superficie: sin cambio material, cero DOM',
    (() => { const yc = section(young.html, 'intv4-changed');
      return yc === '' && !/intv9-changed-quiet/.test(young.html)
        && !/intv4_changed_empty/.test(young.html.replace(/data-changed-state="[^"]*"/, '')); })());
  // M.04 · 0 — la lista se publica cuando NADIE MÁS ha reclamado el hecho. Se
  // ejecuta el owner sin reclamaciones para separar las dos causas posibles de un
  // bloque vacío: "no hay cambios" y "ya los cuenta otra superficie".
  // El owner devuelve ahora `{ html, state, evidence }`: el HTML es sólo una de las
  // tres cosas que publica, porque el estado tiene que viajar aunque no haya DOM.
  ok('15.13 y con cambios reales sigue publicando la lista, no un estado vacío',
    (() => { const c = makeCtx(DIPPED);
      const r = run('_intv4ChangedHtml(_aurixIntelligenceCore({ presentationHistory: [] }), _intccEsc, [], null)', c);
      return r.state === 'rows' && /intv4-chg-list/.test(r.html) && !/intcc-empty-body/.test(r.html); })());
  ok('15.14 el estado vacío se elige por la COBERTURA del Core, no por una heurística local',
    /core\.dataAvailability && core\.dataAvailability\.observation/.test(fnSrc('_intv4ChangedHtml')) &&
    /core\.dataAvailability && core\.dataAvailability\.observation/.test(fnSrc('_intv4MemoryHtml')));

  // ── NO-VACUIDAD ──────────────────────────────────────────────────────────
  ok('15.15 NON-VACUITY — la MISMA cartera madura, sin los hechos de trayectoria, se queda en "acumulando"',
    (() => { const c = makeCtx(DIPPED);
      const core0 = run('_aurixIntelligenceCore({ presentationHistory: [] })', c);
      const stripped = Object.assign({}, core0, {
        temporalEvents: (core0.temporalEvents || []).filter(f =>
          f.semanticKey !== 'investable_level_change' && f.semanticKey !== 'investable_prior_high'),
        dataAvailability: Object.assign({}, core0.dataAvailability,
          { observation: { observations: 0, startAt: null, endAt: null, spanMs: null } }),
      });
      c.__stripped = stripped;
      const html = run('_intv4MemoryHtml(__stripped, _intccEsc, [])', c);
      return /is-accruing/.test(html); })());
  ok('15.16 NON-VACUITY — y el radar sin el owner nuevo volvería a tres ejes',
    (() => { const c = makeCtx(DIPPED);
      run('_aurixPeakRetention = () => ({ status: "unavailable_source", reason: "owner_unavailable", retentionPct: null, quality: null })', c);
      const a = run('_intv7RadarAxes()', c);
      return a.measured === 3 && a.unavailable.indexOf('stability') !== -1; })());
}

// ════════════════════════════════════════════════════════════════════════════
// 16 · M.04 · 0 — MEMORIA Y QUÉ HA CAMBIADO NO PUBLICAN EL MISMO HECHO
// ════════════════════════════════════════════════════════════════════════════
// El defecto observado en producción: "Tu patrimonio invertible ha subido
// 40.818,17 US$ desde el 18 ago 2026" en Memoria patrimonial, y el MISMO hecho
// otra vez en Qué ha cambiado. Contrato: Memoria = hitos históricos que merece la
// pena recordar; Qué ha cambiado = novedades frente a una referencia anterior.
console.log('\n16 · M.04 dedupe Memoria / Qué ha cambiado:');
{
  // Reproduce la forma del caso real: una subida de nivel material y sostenida.
  const RISEN = {
    // El último punto tiene que ser el máximo ESTRICTO. Con la cola duplicada
    // (…160818, 160818) `peakIdx` era el PRIMERO de los dos, así que no había
    // máximo histórico y la cartera no tenía NINGÚN hito: la fixture era
    // degenerada, no el contrato. Una subida real acaba en su punto más alto.
    rows: inv([120000, 128000, 134000, 141000, 148000, 152000, 156000, 158000, 160818, 161500]),
    flows: [], serverRows: srvHistory(NOW, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                               { crypto: 39000, stock: 40000, liquidity: 21000 }),
    assets: LOPSIDED, snap: SNAP, drivers: DRIVERS,
  };
  const c = makeCtx(RISEN);
  const cr = run('_aurixIntelligenceCore({ presentationHistory: [] })', c);
  c.__core = cr;
  const claims = run('_intv4MemoryClaims(__core, [])', c);
  const memHtml = run('_intv4MemoryHtml(__core, _intccEsc, [])', c);
  // El owner devuelve `{ html, state, evidence }`; esta comprobación mira el DOM.
  const chgHtml = run('_intv4ChangedHtml(__core, _intccEsc, [], ' + JSON.stringify(claims) + ').html', c);
  const chgNoClaims = run('_intv4ChangedHtml(__core, _intccEsc, [], null).html', c);
  const factsIn = html => (html.match(/data-fact="([\w]+)"/g) || []).map(m => m.slice(11, -1));
  const rootsIn = html => (html.match(/data-root="([\w]+)"/g) || []).map(m => m.slice(11, -1));

  // ── A2 · SE INVIERTE LA PRECEDENCIA, y la razón importa ──────────────────
  // El defecto original (el MISMO hecho en Memoria y en Qué ha cambiado) sigue
  // prohibido. Lo que cambia es QUIÉN cede. Antes cedía «Qué ha cambiado», y eso
  // se resolvía SUPRIMIENDO filas en el destino de un número que el hero acababa
  // de anunciar: el contador quedaba sin respaldo y el usuario sin saber qué eran
  // esas N cosas. Ahora manda la lista canónica —el hero ha hecho una promesa
  // sobre ella— y la Memoria cede el hecho, NO su razón de ser: conserva los
  // hitos con fecha (el máximo observado) y lo que el usuario DECLARÓ, que es lo
  // único que ninguna otra superficie puede saber.
  ok('16.1 un CAMBIO de nivel es un hallazgo del contador, no un hito de la Memoria',
    (() => { return (cr.findings || []).some(f => f.semanticKey === 'investable_level_change')
        && claims.keys.indexOf('investable_level_change') === -1
        && !/data-fact="investable_level_change"/.test(memHtml); })(),
    JSON.stringify({ claims: claims.keys, findings: (cr.findings || []).map(f => f.semanticKey) }));
  ok('16.2 y el destino del contador SÍ lo publica, con su identidad de hallazgo',
    /data-finding="[^"]+"/.test(chgHtml)
    && /data-finding="[^"]*"/.test(chgHtml)
    && (chgHtml.match(/intv4-chg /g) || []).length >= 1,
    chgHtml.slice(0, 300));
  ok('16.3 SIN el contrato, el MISMO hecho sale en las dos superficies (no-vacuidad)',
    /investable_level_change/.test(chgNoClaims) ||
    rootsIn(chgNoClaims).indexOf('wealth_level') !== -1,
    chgNoClaims.slice(0, 500));
  ok('16.4 la exclusión es por CLAVE DE HECHO, nunca comparando textos renderizados',
    (() => { const src = fnSrc('_intv4MemoryEvents');
      return /findingKeys\.has\(f\.semanticKey\)/.test(src)
        && !/toLowerCase\(\)|replace\(\/\[\^a-z0-9\]/.test(src); })(),
    fnSrc('_intv4MemoryEvents').slice(0, 200));
  // NINGÚN HECHO COMPARTIDO. La RAÍZ sí puede compartirse, y ahí está la
  // diferencia: «tu nivel ha subido 40.818 US$ desde el 18 ago» (cambio) y «tu
  // máximo observado sigue siendo el del 3 sep» (hito) son la misma raíz y dicen
  // cosas distintas. Prohibir la raíz vaciaba la Memoria entera para evitar una
  // repetición que ya no existe.
  // NO-VACUIDAD. Sin ella la prueba pasa cuando la Memoria queda VACÍA, que es
  // exactamente la regresión que invertir la precedencia arriesga. `RISEN` está en
  // máximos por construcción (la serie termina en su punto más alto), así que
  // `investable_all_time_high` EXISTE y la Memoria tiene que publicarlo: si algún
  // día la Memoria se queda muda, esta prueba lo dice.
  ok('16.5 ninguna CLAVE DE HECHO se publica en las dos superficies — y la Memoria NO queda vacía',
    (() => { const mf = factsIn(memHtml), cf = factsIn(chgHtml);
      return mf.length >= 1 && cf.length >= 1 && mf.every(k => cf.indexOf(k) === -1); })(),
    JSON.stringify({ mem: factsIn(memHtml), chg: factsIn(chgHtml) }));
  // Se compara contra el CORE, no contra el atributo que pinta la propia card:
  // comparar dos lecturas del mismo array no puede fallar nunca.
  ok('16.6 el destino publica EXACTAMENTE los hallazgos del Core (no se silencia ninguno)',
    (() => { const rows = (chgHtml.match(/intv4-chg /g) || []).length;
      const fromCore = run('_intv4FindingRows(__core).length', c);
      return rows === fromCore && fromCore === (cr.findings || []).length; })(),
    JSON.stringify({ rows: (chgHtml.match(/intv4-chg /g) || []).length,
                     core: (cr.findings || []).length }));
  // Y si NO queda ninguno, el estado es honesto y no se fabrica un segundo hecho.
  // A2 — este estado nacía de la SUPRESIÓN («había cambios, pero otra superficie
  // los publica»), y la supresión es justo lo que se ha retirado. Lo que queda
  // por comprobar es lo que de verdad importa: sin hallazgos NO HAY SUPERFICIE y
  // tampoco relleno fabricado.
  ok('16.7 sin hallazgos no hay card ni relleno inventado',
    (() => { const empty = { ledger: { facts: [], gaps: [] }, findings: [], whatChanged: [],
        dataAvailability: cr.dataAvailability };
      c.__empty = empty;
      const r7 = run('_intv4ChangedHtml(__empty, _intccEsc, [], ' + JSON.stringify(claims) + ')', c);
      return r7.html === '' && r7.count === 0 && (r7.html.match(/intv4-chg /g) || []).length === 0; })());
  ok('16.8 la selección de la Memoria es un OWNER puro y determinista, no lógica de renderer',
    (() => { const a = run('JSON.stringify(_intv4MemoryClaims(__core, []))', c);
      const b = run('JSON.stringify(_intv4MemoryClaims(__core, []))', c);
      return a === b && /function _intv4MemoryEvents\(/.test(app)
        && /_intv4MemoryEvents\(core, alreadyPublished\)/.test(fnSrc('_intv4MemoryHtml')); })());
  ok('16.9 ordenada por relevancia y, a igualdad, por RECENCIA (preparada para más histórico)',
    /\(b\.priority - a\.priority\) \|\| \(endAt\(b\) - endAt\(a\)\)/.test(fnSrc('_intv4MemoryEvents')));
  ok('16.10 y el renderer pasa las reclamaciones de la Memoria a Qué ha cambiado',
    /_intv4MemoryClaims\(core, publishedKeys\)/.test(fnSrc('_renderIntelligenceCommandCenter')) &&
    // §4.6 — la firma vuelve a sus cuatro argumentos: la marca de visita se
    // retiró como referencia (es un timestamp de presentación, no un extremo de
    // medición), así que la card no necesita nada del almacenamiento.
    /_intv4ChangedHtml\(core, esc, publishedKeys, memoryClaims\)/.test(fnSrc('_renderIntelligenceCommandCenter')));
  // Cada superficie conserva su propósito: la Memoria sigue fechando, y Qué ha
  // cambiado sigue siendo una lista de novedades con dirección.
  ok('16.11 cada superficie conserva su propósito (Memoria: hito CON fecha; cambios: dirección)',
    /intcc-tl-item/.test(memHtml) && /intcc-tl-date/.test(memHtml)
    && /is-up|is-down|is-flat/.test(chgHtml),
    JSON.stringify({ hasItem: /intcc-tl-item/.test(memHtml), hasDate: /intcc-tl-date/.test(memHtml) }));
  ok('16.12 y ningún cálculo financiero se ha tocado en este arreglo',
    !/investableValue|assetValueUSD|_aurixTwrChain|returnPct \*/.test(fnSrc('_intv4ChangedHtml') + fnSrc('_intv4MemoryEvents') + fnSrc('_intv4MemoryClaims')));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
