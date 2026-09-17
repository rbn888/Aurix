'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INTEL-TRACEABILITY-harness — SPEC ADVANCED INTELLIGENCE · A2
// ════════════════════════════════════════════════════════════════════════════
// Certifica el contrato que faltaba entre lo que Intelligence AFIRMA y lo que
// PUEDE MOSTRAR, y el de la pregunta:
//
//   · SI EL HERO DICE N, EL DESTINO CONTIENE EXACTAMENTE ESOS N. Antes el hero
//     contaba transiciones de insights y la card listaba hechos del ledger —dos
//     universos sin relación— y en el peor caso la card devolvía '' mientras el
//     hero seguía anunciando N. El usuario se quedaba preguntándose qué eran
//     esas N cosas, que es la forma más rápida de perder la confianza en una
//     superficie cuyo único producto es interpretación.
//   · UNA RAÍZ, UNA LECTURA PRIMARIA, con trabajos distintos por superficie.
//   · UNA SOLA PREGUNTA, UN SOLO NODO EN EL DOM, y el orden móvil que pidió el
//     founder: Hero → Salud → Pregunta → Radar, sin hueco reservado.
//   · BAJO ≠ DESCONOCIDO en el radar.
//
// El renderer es REAL. Se ejecuta `_renderIntelligenceCommandCenter` completo
// sobre carteras deterministas y se leen sus `data-*` y su HTML: es la única
// forma de que esto sea evidencia y no una afirmación sobre el código.
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
    // A2 — el enlace de trazabilidad del hero. Sin la clave el renderer emite un
    // enlace VACÍO, que es peor que no tenerlo.
    'intel_see_changes','intel_now_novelty','intel_sub_review','intel_now_reviewed','intel_sub_reviewed','intel_now_no_news','intel_sub_no_news','intel_ack_done','intel_ack','intel_ack_aria',
    'intv7_axis_unavailable','intv7_radar_legend','intv7_radar_pending',
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
    'intel_now_material','intel_now_discovery','intel_now_changed','intel_now_stable_nc',
    'intel_now_stable','intel_now_history','intel_now_context',
    'intel_sub_material','intel_sub_changed','intel_sub_stable_nc','intel_sub_history',
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

const CONSTS = ['_AURIX_INTEL_MEM_MAX_ENTRIES','_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT','_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD',
  '_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS',
  '_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FLOW_MATCH_REL_TOL',
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_REGISTERED_OP_KINDS','_AURIX_REGISTERED_OP_BATCH_MIN',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_INTV7_RADAR_DIMS','TYPE_META','_AURIX_QUESTION_CATALOG',
  '_INTV4_DEPTH','_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX',
  '_INTV4_SHOWN_KEY','_AURIX_INTEL_HEALTH_POSITIVE','_AURIX_INTEL_DISC_MAX','_AURIX_INTEL_DIM_ROOT','_AURIX_INTEL_CTX_KEY','_AURIX_INTEL_CTX_KEY_LEGACY',
  '_AURIX_INTEL_FIELDS','_AURIX_INTEL_PROVENANCE','_AURIX_INTEL_QUESTION_LIMIT','_AURIX_LOSS_TIER','_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE','_INTV4_EXPLORE_CADENCE','_INTV4_PERIMETER','_INTV5_TIER'];
const FNS = ['_intv4ExploreRotation','_intv4ExploreSeed','_intv4Perimeter','_intv4ActiveReviewFindings','_intv5RecencyTier','_aurixLossImpactShare','_aurixLossSeverityTier','_aurixEpisodeOf','_aurixIntelResolveCertified','_aurixIntelAcknowledge','_aurixIntelCtxRecord','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelStore','_aurixIntelOwner','_aurixIntelCtxMerge','_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_intv4FindingRows','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket',
  'isClosedAsset','activeAssets','isInvestableAsset','investableAssets','investableValueUSD',
  'liquidityNominal','assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete',
  '_aurixFlowIsInternal','_aurixLoadCapitalFlows','_aurixInvestableSnapshots',
  '_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixFlowCounterpartObserved','_aurixInvestablePerformance','_aurixCatHistRows',
  '_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow','_aurixCatExposureDelta',
  '_aurixFactClamp01','_aurixEffectiveDiversification','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixIntelligenceCore',
  '_aurixHealthScore','_intccScoreTone','_intccHealthScore','_intccClamp','_intccEsc','_intccDate',
  '_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4WindowLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml',
  '_intv4ChangedHtml','_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml',
  // SPEC FINAL SURFACE — owners nuevos que el renderer llama: el puente
  // dimensión→raíz, la card de descubrimientos y el contexto declarado de la
  // Memoria. Sin ellos el render lanza y este gate se cae entero.
  '_aurixIntelRootsOf','_intv9DiscoveriesHtml','_intv4MemoryDeclared','_intv4MemoryRows','_intelDiscoveryText',
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
  
  '_intelCoherentState','_intv5MattersStories','_intv5Reading','_intv5Chips','_intv5StructureHtml','_intv5DriversHtml','_intv5MattersHtml','_intv7RadarAxes','_intv7PendingReasonKey','_intv7RadarHtml','_intccRadarSvg','_aurixPeakRetention','getInvestableDistribution','_aurixDisplayCategory',
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

console.log('AURIX-INTEL-TRACEABILITY — SPEC ADVANCED INTELLIGENCE · A2\n');

const NOWTS = Date.now();
const movedServer = srvHistory(NOWTS, 30, { crypto: 55000, stock: 20000, liquidity: 25000 },
                                           { crypto: 85000, stock: 10000, liquidity: 5000 });
const MOVED = Object.assign({}, MATURE, { serverRows: movedServer });
const QUIET = Object.assign({}, MATURE, { serverRows: [], rows: inv([100000, 100000, 100000, 100000]) });

const num = (h, re) => { const m = h.match(re); return m ? m[1] : null; };
const count = (h, re) => (h.match(re) || []).length;

// ════════════════════════════════════════════════════════════════════════════
console.log('1 · Si el hero dice N, el destino contiene exactamente esos N:');
{
  const r = render(MOVED);
  const h = r.html;
  const heroN = num(h, /data-intel-see-changes="desktop"\s+data-count="(\d+)"/);
  const destN = num(h, /class="intcc-card intv4-changed"[^>]*data-findings="(\d+)"/);
  const rows = count(h, /class="intv4-chg /g);
  ok('1.1 el hero publica su contador y el destino publica su cardinalidad',
    heroN !== null && destN !== null, JSON.stringify({ heroN: heroN, destN: destN }));
  // EL CONTADOR CUENTA LO PENDIENTE. Desde que acusar deja la fila en el
  // historial, el destino puede tener MÁS filas que el contador: la igualdad es
  // contra las filas NO revisadas, que son las que el hero promete.
  const pendingRows = count(h, /class="intv4-chg [^"]*"\s+data-root="[^"]*"\s+data-finding="[^"]*"\s+data-fact="[^"]*"\s+data-reviewed="0"/g);
  ok('1.2 hero N === filas PENDIENTES del destino === cardinalidad declarada',
    Number(heroN) === pendingRows && Number(destN) === pendingRows && pendingRows > 0
    && rows >= pendingRows,
    JSON.stringify({ heroN: heroN, destN: destN, rows: rows, pending: pendingRows }));
  ok('1.3 el destino es DIRECCIONABLE (el enlace del hero apunta a un id que existe)',
    /href="#aurix-intel-changes"/.test(h) && /id="aurix-intel-changes"/.test(h));
  ok('1.3b el enlace existe en las DOS composiciones y las dos declaran el MISMO número',
    (() => { const d = num(h, /data-intel-see-changes="desktop"\s+data-count="(\d+)"/);
      const m = num(h, /data-intel-see-changes="mobile"\s+data-count="(\d+)"/);
      const all = (h.match(/data-intel-see-changes="/g) || []).length;
      return d === m && all === 2; })(),
    JSON.stringify({ desktop: num(h, /data-intel-see-changes="desktop"\s+data-count="(\d+)"/),
                     mobile: num(h, /data-intel-see-changes="mobile"\s+data-count="(\d+)"/) }));
  ok('1.4 y su encabezado es ENFOCABLE, para que el salto mueva el foco y no sólo el scroll',
    /id="aurix-intel-changes-title"[^>]*tabindex="-1"/.test(h));
  ok('1.5 cada fila del destino declara su hallazgo, su raíz y si la causa está corroborada',
    (() => { const ids = attrs(h, 'class="intv4-chg [^"]*"[^>]*data-finding="([^"]+)"');
      const causes = attrs(h, 'class="intv4-chg [^"]*"[^>]*data-cause="([^"]+)"');
      return ids.length === rows && causes.length === rows
        && causes.every(c => c === 'user' || c === 'unknown'); })(),
    JSON.stringify(attrs(h, 'data-cause="([^"]+)"')));
  ok('1.6 ninguna raíz causal se repite en el destino',
    (() => { const roots = attrs(h, 'class="intv4-chg [^"]*"[^>]*data-root="([^"]+)"');
      return new Set(roots).size === roots.length; })(),
    JSON.stringify(attrs(h, 'class="intv4-chg [^"]*"[^>]*data-root="([^"]+)"')));
}

console.log('\n2 · Sin nada que mostrar, el hero NO puede afirmar un número:');
{
  const h = render(QUIET).html;
  ok('2.1 sin hallazgos no se pinta el enlace «Ver cambios»', !/data-intel-see-changes/.test(h));
  ok('2.2 ni el destino (ausencia de novedad = ausencia de superficie)',
    !/class="intcc-card intv4-changed"/.test(h));
  ok('2.3 y el titular no pronuncia ninguna cifra de cambios',
    (() => { const hero = section(h, 'intcc-hero') || h;
      return !/lecturas han cambiado|lectura ha cambiado/.test(hero); })(),
    (section(h, 'intcc-hero') || '').slice(0, 200));
  ok('2.4 el estado sigue siendo diagnosticable en `data-changed-state`',
    /data-changed-state="[a-z_0-9]+"/.test(h), num(h, /data-changed-state="([^"]+)"/));
}

console.log('\n3 · Una sola pregunta, un solo nodo, y en su sitio:');
{
  const withQ = render(MOVED);
  const h = withQ.html;
  const qNodes = count(h, /data-intel-q="/g);
  ok('3.1 la pregunta aparece UNA sola vez en el DOM (antes se emitía dos veces, hero de escritorio y de móvil)',
    qNodes <= 1, String(qNodes));
  if (qNodes === 1) {
    ok('3.2 vive en su propia card condicional, no dentro del hero',
      /class="intcc-card intv12-qcard"/.test(h)
      && !/class="intcc-hero[^"]*"[\s\S]{0,4000}?data-intel-q=/.test(section(h, 'intcc-hero') || ''));
    ok('3.3 la card declara su `order` en ≤1023px (sin él se pinta ANTES del hero)',
      /\.intv12-qcard\s*\{\s*order:\s*2;\s*\}/.test(css));
    ok('3.4 y en ≤640px se recoloca detrás de Salud: Hero → Salud → Pregunta → Radar',
      (() => { const m = css.match(/@media \(max-width: 640px\)[\s\S]*?\.intcc-m-health \{ order: 1; \}[\s\S]{0,700}?\.intv12-qcard\s*\{ order: 2; \}/);
        return !!m; })());
    ok('3.5 conserva declinar y pausar (una pregunta sin salida es un interrogatorio)',
      /data-intel-answer="__decline"/.test(h) && /data-intel-answer="__pause"/.test(h));
    ok('3.6 el orden DOM la deja tras la card de Salud móvil y antes del radar',
      (() => { const iH = h.indexOf('intcc-m-health'), iQ = h.indexOf('intv12-qcard'), iR = h.indexOf('intcc-radar');
        return iH > -1 && iQ > iH && iR > iQ; })(),
      JSON.stringify({ health: h.indexOf('intcc-m-health'), q: h.indexOf('intv12-qcard'), radar: h.indexOf('intcc-radar') }));
  } else {
    ok('3.2 sin pregunta activa no hay card (ni hueco reservado)', !/intv12-qcard/.test(h));
    ok('3.3 la card declara su `order` en ≤1023px', /\.intv12-qcard\s*\{\s*order:\s*2;\s*\}/.test(css));
    ok('3.4 y en ≤640px se recoloca detrás de Salud',
      /@media \(max-width: 640px\)[\s\S]*?\.intv12-qcard\s*\{ order: 2; \}/.test(css));
    ok('3.5 la dock conserva declinar y pausar en su plantilla',
      /data-intel-answer="__decline"/.test(app) && /data-intel-answer="__pause"/.test(app));
    ok('3.6 la card se emite entre Salud y Radar en el renderer',
      /\$\{mHealthHtml\}\s*\n\s*\$\{intelQCardHtml\}\s*\n\s*\$\{radarHtml\}/.test(app));
  }
  ok('3.7 sin pregunta, la rejilla de escritorio es EXACTAMENTE la de hoy (el cambio va condicionado con `:has`)',
    /\.aurix-intcc:has\(\.intv12-qcard\) \.intv12-qcard\s*\{ grid-column: 1 \/ 13; grid-row: 2; \}/.test(css));
  ok('3.8 se marca por IMPRESIÓN y no por pintura (antes escribía contexto y empujaba a red en cada repintado)',
    /_intelMarkedQuestionId/.test(app)
    && /_qid !== _intelMarkedQuestionId/.test(app));
  ok('3.9 una sola pregunta a la vez sigue siendo el contrato del motor',
    /_AURIX_INTEL_QUESTION_LIMIT = 1/.test(app));
}

console.log('\n4 · Una raíz, una lectura primaria — con trabajos distintos por superficie:');
{
  const h = render(MOVED).html;
  const chg = attrs(h, 'class="intv4-chg [^"]*"[^>]*data-root="([^"]+)"');
  const disc = attrs(h, 'class="intv9-disc-item"[^>]*data-dim="([^"]+)"');
  ok('4.1 el destino publica HECHOS y no repite raíz', new Set(chg).size === chg.length);
  ok('4.2 Descubrimientos no republica la dimensión que ya encabeza «Lo que importa»',
    (() => { const watch = section(h, 'intcc-watch');
      const watchRoots = attrs(watch, 'data-root="([^"]+)"');
      const map = { concentration: 'top_position', diversification: 'top_position',
                    liquidity: 'cash_weight', evolution: 'investable_return', structure: 'category_mix' };
      return disc.every(d => watchRoots.indexOf(map[d]) === -1); })(),
    JSON.stringify({ disc: disc, watch: attrs(section(h, 'intcc-watch'), 'data-root="([^"]+)"') }));
  ok('4.3 ninguna superficie afirma una CAUSA que Aurix no pueda demostrar',
    !/porque|because|due to|driven by|gracias a/i.test(h));
  ok('4.4 y una transición sin causa corroborada se enuncia en forma NEUTRAL',
    (() => { const sec = section(h, 'intv4-changed');
      if (!/exposici[oó]n/i.test(sec)) return true;
      const unknown = attrs(sec, 'data-cause="(unknown)"').length > 0;
      return !unknown || /pas[oó] del/i.test(sec); })(),
    (section(h, 'intv4-changed') || '').slice(0, 300));
}

console.log('\n5 · Radar: BAJO no es DESCONOCIDO:');
{
  const h = render(MOVED).html;
  ok('5.1 un eje sin dato NO tiene vértice (desconocido no puede parecer cero)',
    (() => { const unavail = (num(h, /data-unavailable="([^"]*)"/) || '').split(',').filter(Boolean);
      const dots = count(h, /class="intcc-radar-dot"/g);
      const measured = Number(num(h, /data-measured="(\d+)"/));
      return dots === measured && unavail.length === 5 - measured; })(),
    JSON.stringify({ measured: num(h, /data-measured="(\d+)"/), dots: count(h, /class="intcc-radar-dot"/g) }));
  // RE-DECIDIDO (§8): el margen ya no es sólo inferior. La banda de la serie tiene
  // margen a los DOS extremos —antes un 100 certificado caía exactamente en el
  // vértice, el mismo píxel del marcador de «sin datos»— y el marcador de
  // disponibilidad vive fuera de esa banda. Se comprueba la propiedad, no la
  // constante: el valor concreto es geometría y puede afinarse.
  // ── §11 RE-DECIDE DÓNDE VIVE EL MARCADOR DE «SIN DATOS» ──────────────────
  // A2 lo puso FUERA de la banda y por encima de ella (R_UNK > RMAX) para que no
  // pudiera confundirse con un valor. En la pantalla real eso lo pegaba al marco
  // —donde el ojo lee «máximo»— mientras los ejes certificados se apelotonaban en
  // el centro con RMIN = 0,10. §11 sube el suelo de la banda a 0,22 y fija el
  // límite INTERIOR de referencia para el desconocido. La garantía que se
  // conserva, y que este assert comprueba: la banda tiene margen a los DOS
  // extremos (ningún valor en el centro, ninguno en el vértice) y el suelo es lo
  // bastante alto para que un 0 real sea una MARCA separada del centro.
  ok('5.2 la banda de la serie tiene margen a los dos extremos, y el 0 real es una MARCA',
    (() => { const src = fnSrc('_intccRadarSvg');
      const m = src.match(/const RMIN = ([\d.]+), RMAX = ([\d.]+);/);
      if (!m) return false;
      const rmin = Number(m[1]), rmax = Number(m[2]);
      return rmin >= 0.2 && rmax < 1 && rmax > rmin
        && /R_UNK = R \* RMIN/.test(src)
        && /RMIN \+ \(RMAX - RMIN\)/.test(src); })(),
    (fnSrc('_intccRadarSvg').match(/const RMIN = [^;]+;/) || [, '?'])[0]);
  ok('5.3 el radio mínimo es GEOMETRÍA: no altera la cifra publicada',
    (() => { const src = fnSrc('_intccRadarSvg');
      // el texto sale de `display` o de `radar[key]+suffix`, nunca de `rOf`
      return /d\.display != null \? String\(d\.display\) : \(radar\[d\.key\] \+ \(d\.suffix \|\| ''\)\)/.test(src)
        && !/rOf\([^)]*\)[^;]*radar-val/.test(src); })());
  ok('5.4 los cinco ejes se dibujan siempre, cualquiera que sea la cartera',
    // El grupo contenedor `intcc-radar-labels` también empieza por ese prefijo, así
    // que el corte tiene que cerrar la clase para contar sólo las etiquetas.
    count(h, /class="intcc-radar-axis[" ]/g) === 5 && count(h, /class="intcc-radar-label[" ]/g) === 5,
    JSON.stringify({ axes: count(h, /class="intcc-radar-axis[" ]/g), labels: count(h, /class="intcc-radar-label[" ]/g) }));
  ok('5.5 y la disponibilidad de ejes sale de UNA sola autoridad (misma para escritorio y móvil)',
    // Se cuentan LLAMADAS, no la declaración: dos autoridades de disponibilidad
    // serían dos radares que pueden desmentirse entre breakpoints.
    (app.match(/(?<!function )_intv7RadarAxes\(\)/g) || []).length === 1,
    String((app.match(/(?<!function )_intv7RadarAxes\(\)/g) || []).length));
}

console.log('\n6 · ES y EN publican la misma verdad:');
{
  const es = render(MOVED).html;
  const en = render(Object.assign({}, MOVED, { lang: 'en' })).html;
  ok('6.1 el contador es el mismo en los dos idiomas',
    num(es, /data-intel-see-changes="desktop"\s+data-count="(\d+)"/)
      === num(en, /data-intel-see-changes="desktop"\s+data-count="(\d+)"/));
  ok('6.2 y el destino tiene la misma cardinalidad',
    num(es, /data-findings="(\d+)"/) === num(en, /data-findings="(\d+)"/));
  ok('6.3 el enlace lleva texto en los dos idiomas (ninguna clave vacía)',
    (() => { const a = (es.match(/class="intv12-see-changes"[^>]*>([^<]+)</) || [, ''])[1].trim();
      const b = (en.match(/class="intv12-see-changes"[^>]*>([^<]+)</) || [, ''])[1].trim();
      return a.length > 5 && b.length > 5 && a !== b; })());
  ok('6.4 la copy de capital retirada no reaparece en ninguno de los dos',
    !/de capital nuevo|of new capital/.test(es + en));
}

console.log('\n7 · Episodios pasivos, acuse de recibo y profundidad:');
{
  const h = render(MOVED).html;
  // Las tres escapaban por `length === 0 ||`, así que pasaban aunque la fixture no
  // pintara ninguna fila: no podían fallar. Ahora se exige que HAYA filas.
  const chgRows = (h.match(/class="intv4-chg /g) || []).length;
  ok('7.0 la fixture pinta filas de verdad (si no, las tres siguientes no probarían nada)',
    chgRows > 0, String(chgRows));
  ok('7.1 la identidad de una deriva pasiva lleva su BANDA y su DIRECCIÓN, no sólo la raíz',
    (() => { const ids = attrs(h, 'class="intv4-chg [^"]*"[^>]*data-finding="(ob:[^"]+)"');
      const drift = ids.filter(x => /category_mix|cash_weight/.test(x));
      return drift.length > 0 && drift.every(x => /#\d+:(up|down)$/.test(x)); })(),
    JSON.stringify(attrs(h, 'data-finding="([^"]+)"')));
  ok('7.2 cada fila ofrece «Entendido», y acusa el EPISODIO (no la raíz)',
    (() => { const acks = attrs(h, 'data-intel-ack="([^"]+)"');
      return chgRows > 0 && acks.length === chgRows && acks.every(a => a.length > 3); })(),
    JSON.stringify(attrs(h, 'data-intel-ack="([^"]+)"')));
  ok('7.3 el control es un botón real con etiqueta accesible (no un span clicable)',
    (h.match(/class="intv12-ack"/g) || []).length === chgRows
    && /<button type="button" class="intv12-ack"[^>]*aria-label="[^"]+"/.test(h));
  ok('7.4 «Entendido» lo resuelve la MISMA delegación única, sin listeners por nodo',
    /closest\('\[data-intel-ack\]'\)/.test(fnSrc('_initIntelSeeChanges'))
    && (app.match(/data-intel-ack\]/g) || []).length <= 2);
  ok('7.5 y no borra memoria financiera: el acuse sólo entra como ENTRADA del Core',
    /acknowledged: _ackMap/.test(app)
    && /includeAcknowledged/.test(fnSrc('_aurixCanonicalFindings')));
  // ── LOS DOS OWNERS DEL ACUSE, EJECUTADOS ─────────────────────────────────
  // Estaban comprobados con regex sobre el fuente, que es la lección ya registrada
  // dos veces: «los asserts de sincronización eran regex, no comportamiento».
  ok('7.5b `_aurixIntelAcknowledge` se EJECUTA: sella, es idempotente y queda acotado',
    (() => { const c = makeCtx(MATURE);
      const store = {};
      c.__ackStore = store;
      const env = 'var __env = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__ackStore, k) ? __ackStore[k] : null),'
        + ' setItem: (k, v) => { __ackStore[k] = String(v); }, removeItem: k => { delete __ackStore[k]; } }, owner: "u1", now: 1000 };';
      run(env, c);
      const first = run('_aurixIntelAcknowledge("ob:category_mix#28:up", __env)', c);
      const again = run('_aurixIntelAcknowledge("ob:category_mix#28:up", Object.assign({}, __env, { now: 9999 }))', c);
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __env)', c);
      return first === true && again === true
        && rec && rec.ack && rec.ack['ob:category_mix#28:up'].at === 1000; })());
  ok('7.5c y el acuse de OTRO dueño no se lee (aislamiento por cuenta, fail-closed)',
    (() => { const c = makeCtx(MATURE);
      const store = {}; c.__ackStore = store;
      run('var __a = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__ackStore, k) ? __ackStore[k] : null),'
        + ' setItem: (k, v) => { __ackStore[k] = String(v); }, removeItem: k => {} }, owner: "u1", now: 1 };', c);
      run('var __b = Object.assign({}, __a, { owner: "u2" });', c);
      run('_aurixIntelAcknowledge("ob:x#1:up", __a)', c);
      const asB = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __b)', c);
      return asB === null; })());
  ok('7.5d el merge de DOS dispositivos conserva los dos acuses y no duplica ninguno',
    (() => { const c = makeCtx(MATURE);
      const out = run('_aurixIntelCtxMerge({ ack: { a: { at: 5, state: "acknowledged" } } },'
        + ' { ack: { a: { at: 9, state: "acknowledged" }, b: { at: 2, state: "acknowledged" } } })', c);
      const rev = run('_aurixIntelCtxMerge({ ack: { a: { at: 9, state: "acknowledged" }, b: { at: 2, state: "acknowledged" } } },'
        + ' { ack: { a: { at: 5, state: "acknowledged" } } })', c);
      return Object.keys(out.ack).length === 2 && out.ack.a.at === 9
        && JSON.stringify(out.ack) === JSON.stringify(rev.ack); })());
  ok('7.6 la profundidad se resuelve UNA vez por pintura, desde el contexto declarado',
    /_intv4SetFactDepth\(\(intel && intel\.experience && intel\.experience\.resolved\)/.test(app));
  ok('7.7 …y sólo cambia CUÁNTO se enseña: el importe absoluto es lo único que gatea',
    (() => { const src = fnSrc('_intv4FactText');
      return /_intv4FactDepth === _INTV4_DEPTH\.ADVANCED/.test(src)
        && !/_intv4FactDepth[\s\S]{0,80}returnPct/.test(src); })());
  // Se comprueba sobre el marcador de DILUCIÓN, no sobre la presencia del hecho:
  // en esta fixture la liquidez bajó de verdad (25.000 → 5.000), así que «bajó» es
  // la palabra correcta. Lo que no puede pasar es decirlo cuando NO bajó.
  ok('7.8 una dilución NUNCA se redacta como «bajó»',
    (() => { const sec = section(h, 'intv4-changed');
      const rows = sec.split('<li class="intv4-chg');
      return rows.every(r => !/data-diluted="(pure|mixed)"/.test(r) || !/bajó|fell/i.test(r)); })(),
    JSON.stringify(attrs(section(h, 'intv4-changed'), 'data-diluted="([^"]*)"')));
  // La anterior se satisfacía con `/pasó del/`, que es la forma NEUTRAL: no podía
  // distinguir «bajó» de la neutra. Ahora se mira la fila concreta y su marcador.
  ok('7.9 …y una fila NO diluida no puede llevar la frase de dilución',
    (() => { const sec = section(h, 'intv4-changed');
      const rows = sec.split('<li class="intv4-chg').slice(1);
      return rows.length > 0 && rows.every(r =>
        /data-diluted="(pure|mixed)"/.test(r) || !/no ha bajado|has not fallen/i.test(r)); })(),
    JSON.stringify(attrs(section(h, 'intv4-changed'), 'data-diluted="([^"]*)"')));
}

console.log('\n8 · Política de reapertura y retención del acuse:');
{
  const h = render(MOVED).html;
  // Un hecho que publica CONCEPTO lleva además su FIRMA; uno legacy que no lo
  // publica se identifica por su propia identidad de evento y su firma va vacía —
  // y entonces el acuse se compara por episodio, que es el criterio anterior.
  ok('8.1 el control acusa el CONCEPTO, y todo concepto declarado lleva su FIRMA',
    (() => { const ids = attrs(h, 'data-intel-ack="([^"]+)"');
      const sigs = attrs(h, 'data-intel-sig="([^"]*)"');
      if (!(ids.length > 0 && ids.length === sigs.length)) return false;
      return ids.every((x, i) => /^(drift|pos|ob|st|tx):/.test(x)
        && (/^(drift|pos):/.test(x) ? sigs[i].length > 0 : true)); })(),
    JSON.stringify({ ids: attrs(h, 'data-intel-ack="([^"]+)"'), sigs: attrs(h, 'data-intel-sig="([^"]*)"') }));
  ok('8.1b y acusar un hecho SIN firma sigue funcionando (el concepto ES el episodio)',
    (() => { const c = makeCtx(MATURE);
      const st = {}; c.__sl = st;
      run('var __el = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__sl, k) ? __sl[k] : null),'
        + ' setItem: (k, v) => { __sl[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      run('_aurixIntelAcknowledge("ob:investable_return", Object.assign({}, __el, { now: 3 }))', c);
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __el)', c);
      const legacy = { semanticKey: 'investable_return_24h', family: 'performance', value: 5,
        causalRoot: 'investable_return', window: { range: '24h', startAt: 1, endAt: 2 },
        eventId: 'ob:investable_return', materiality: 1, novelty: 1, confidence: 1, values: {} };
      c.__lg = { facts: [legacy], gaps: [] };
      const hidden = run('_aurixCanonicalFindings(__lg, { acknowledged: '
        + JSON.stringify(rec.ack) + ' })', c);
      return rec.ack['ob:investable_return'].episodeId === 'ob:investable_return'
        && hidden.length === 0; })());
  // LA SEVERIDAD SE DECIDE CON IMPORTES. La versión anterior recibía
  // `(returnPct, weight)` y multiplicaba: con un −25 % en una posición del 45 %
  // daba 11,25 % cuando la pérdida real era el 15 % del patrimonio, porque el peso
  // se mide sobre el valor que QUEDA y no sobre el coste. Ahora entran los dos
  // importes certificados y la cuota es una división, no una aproximación.
  ok('8.2 el nivel de severidad se decide con la cuota MONETARIA de la pérdida',
    (() => { const c = makeCtx(MATURE);
      const minor = run('_aurixLossSeverityTier(500, 100000)', c);      // 0,5 % del patrimonio
      const mat   = run('_aurixLossSeverityTier(15000, 100000)', c);    // 15 % · el caso del founder
      const str   = run('_aurixLossSeverityTier(27000, 100000)', c);    // 27 %
      const edgeL = run('_aurixLossSeverityTier(2000, 100000)', c);     // 2,00 % · frontera
      const edgeS = run('_aurixLossSeverityTier(25000, 100000)', c);    // 25,00 % · frontera
      const none  = run('_aurixLossSeverityTier(15000, 0)', c);         // sin denominador
      return minor === 'minor' && mat === 'material' && str === 'structural'
        && edgeL === 'material' && edgeS === 'structural' && none === 'unavailable'; })(),
    JSON.stringify(['minor', 'material', 'structural', 'unavailable'].map((_, i) => i)));
  ok('8.3 …y sus dos fronteras están DECLARADAS: el 2 % del patrimonio y una política de producto explícita',
    (() => { const c = makeCtx(MATURE);
      const src = fnSrc('_aurixLossSeverityTier');
      return run('_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE', c) === 0.25
        && /_AURIX_LOSS_IMPACT_STRUCTURAL_SHARE/.test(src)
        && /_AURIX_FACT_MATERIAL\.flowShareOfValue/.test(src)
        // ni la reutilización del umbral de CONCENTRACIÓN —que habla de exposición,
        // no de impacto de pérdida— ni ningún número suelto en el owner.
        && !/concentrationPct/.test(src)
        && !/0\.(?:0[1-9]|[1-9])/.test(src); })());
  ok('8.4 el acuse NO se guarda por banda de precio: un concepto, un registro',
    /ack\[key\] = \{/.test(fnSrc('_aurixIntelAcknowledge'))
    && /const key = String\(conceptId\);/.test(fnSrc('_aurixIntelAcknowledge')));
  ok('8.5 la retención NO usa tiempo transcurrido ni cupo numérico',
    (() => { const src = fnSrc('_aurixIntelAcknowledge') + fnSrc('_aurixIntelResolveCertified');
      return !/_AURIX_INTEL_MEM_MAX_ENTRIES|_AURIX_INTEL_STALE_MS|864e5/.test(src); })());
  ok('8.6 un dispositivo MÁS ANTIGUO no puede sobreescribir un acuse más nuevo',
    (() => { const c = makeCtx(MATURE);
      const a = { ack: { 'pos:btc': { at: 900, state: 'acknowledged', signature: 'material:0' } } };
      const b = { ack: { 'pos:btc': { at: 100, state: 'acknowledged', signature: 'minor:0' } } };
      const ab = run('_aurixIntelCtxMerge(' + JSON.stringify(a) + ', ' + JSON.stringify(b) + ')', c);
      const ba = run('_aurixIntelCtxMerge(' + JSON.stringify(b) + ', ' + JSON.stringify(a) + ')', c);
      return ab.ack['pos:btc'].at === 900 && ba.ack['pos:btc'].at === 900
        && ab.ack['pos:btc'].signature === 'material:0'
        && JSON.stringify(ab.ack) === JSON.stringify(ba.ack); })());
  ok('8.7 y un dispositivo nuevo hereda la línea base autoritativa, no una lista de episodios',
    (() => { const c = makeCtx(MATURE);
      const merged = run('_aurixIntelCtxMerge({ ack: { "pos:btc":'
        + ' { at: 500, state: "acknowledged", signature: "structural:2", episodeId: "pos:btc#structural:2" } } }, null)', c);
      const r = merged.ack['pos:btc'];
      return Object.keys(merged.ack).length === 1 && r.signature === 'structural:2'
        && r.episodeId === 'pos:btc#structural:2'; })());
  ok('8.8 el acuse no viaja con nada patrimonial: sólo identidad, firma, nivel e instante',
    (() => { const c = makeCtx(MATURE);
      const st = {}; c.__s8 = st;
      run('var __e8 = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s8, k) ? __s8[k] : null),'
        + ' setItem: (k, v) => { __s8[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e8, { now: 7, signature: "material:0", tier: "material" }))', c);
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e8)', c);
      const keys = Object.keys(rec.ack['pos:btc']).sort();
      return JSON.stringify(keys) === JSON.stringify(['at', 'episodeId', 'signature', 'state', 'tier', 'v']); })(),
    JSON.stringify((() => { const c = makeCtx(MATURE);
      const st = {}; c.__s8 = st;
      run('var __e8 = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s8, k) ? __s8[k] : null),'
        + ' setItem: (k, v) => { __s8[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __e8, { now: 7, signature: "material:0", tier: "material" }))', c);
      return Object.keys(run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __e8)', c).ack['pos:btc']).sort(); })()));
  ok('8.9 el acuse no puede cruzar de usuario: sin sello propio no se lee',
    (() => { const c = makeCtx(MATURE);
      const st = {}; c.__s9 = st;
      run('var __u1 = { store: { getItem: k => (Object.prototype.hasOwnProperty.call(__s9, k) ? __s9[k] : null),'
        + ' setItem: (k, v) => { __s9[k] = String(v); }, removeItem: k => {} }, owner: "u1" };', c);
      run('var __u2 = Object.assign({}, __u1, { owner: "u2" });', c);
      run('_aurixIntelAcknowledge("pos:btc", Object.assign({}, __u1, { now: 1, signature: "material:0" }))', c);
      return run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, __u2)', c) === null; })());
  ok('8.10 el hecho y la memoria financiera siguen intactos tras el acuse',
    (() => { const c = makeCtx(MATURE);
      const mk = (sig) => ({ semanticKey: 'position_below_cost_btc', family: 'performance',
        causalRoot: 'position_result', unit: 'percent_of_cost', value: -30, changeFact: true,
        window: { range: 'observed', startAt: 1, endAt: 2 }, conceptId: 'pos:btc',
        episodeSignature: sig, eventId: 'pos:btc#' + sig, materiality: 0.4, novelty: 1,
        confidence: 1, values: {} });
      c.__l8 = { facts: [mk('material:0')], gaps: [] };
      const acked = run('_aurixCanonicalFindings(__l8, { acknowledged: { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "material:0" } }, includeAcknowledged: true })', c);
      const hidden = run('_aurixCanonicalFindings(__l8, { acknowledged: { "pos:btc":'
        + ' { at: 1, state: "acknowledged", signature: "material:0" } } })', c);
      const ledgerIntact = run('__l8.facts.length', c);
      return hidden.length === 0 && acked.length === 1
        && acked[0].presentationState === 'acknowledged' && ledgerIntact === 1; })());
  ok('8.11 el contador del hero y las filas siguen siendo la MISMA lista',
    (() => { const rows = (h.match(/class="intv4-chg /g) || []).length;
      const declared = Number((h.match(/data-findings="(\d+)"/) || [, '0'])[1]);
      const heroN = Number(num(h, /data-intel-see-changes="desktop"\s+data-count="(\d+)"/) || 0);
      return rows === declared && rows === heroN; })(),
    JSON.stringify({ rows: (h.match(/class="intv4-chg /g) || []).length,
                     declared: num(h, /data-findings="(\d+)"/), hero: num(h, /data-count="(\d+)"/) }));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · La ausencia no cura nada: sólo una medición resuelve un concepto:');
{
  // Deriva MEDIDA y por debajo de su umbral: 25.000 → 24.000 sobre 100.000 es
  // −1 pp, y el umbral declarado son 3 pp. Eso es evidencia positiva de que la
  // deriva dejó de ser material — no una ausencia.
  const settled = Object.assign({}, MATURE, {
    serverRows: srvHistory(Date.now(), 30, { crypto: 50000, stock: 25000, liquidity: 25000 },
                                            { crypto: 51000, stock: 25000, liquidity: 24000 }) });
  const rSettled = coreOf(settled);
  ok('9.1 una deriva medida por debajo de su umbral RESUELVE, con su motivo',
    (rSettled.resolvedConcepts || []).some(x => /^drift:/.test(x.conceptId)
      && x.reason === 'drift_below_materiality'),
    JSON.stringify(rSettled.resolvedConcepts));
  ok('9.2 …y ninguna entrada resuelta viaja sin motivo auditable',
    (rSettled.resolvedConcepts || []).every(x => x && x.conceptId && x.reason));
  // SIN HISTORIA DE SERVIDOR la ventana no responde: no hay nada medido, así que
  // no se resuelve ninguna deriva. Esto es el defecto que se viene a cerrar: antes
  // «no aparece» bastaba, y una cuenta sin hidratar curaba todos los avisos.
  const rQuiet = coreOf(QUIET);
  ok('9.3 sin ventana medible no se resuelve ninguna deriva: eso es DESCONOCIDO',
    !(rQuiet.resolvedConcepts || []).some(x => /^drift:/.test(x.conceptId)),
    JSON.stringify(rQuiet.resolvedConcepts));
  // Y una deriva que SIGUE siendo material no se resuelve por medirse también en
  // otra ventana donde todavía no llega al umbral.
  const rMoved = coreOf(MOVED);
  ok('9.4 lo que sigue vivo no se resuelve, aunque otra ventana lo mida pequeño',
    (() => { const live = new Set((rMoved.ledger.facts || []).map(f => f.conceptId).filter(Boolean));
      return !(rMoved.resolvedConcepts || []).some(x => live.has(x.conceptId)); })(),
    JSON.stringify({ live: Array.from(new Set((rMoved.ledger.facts || []).map(f => f.conceptId).filter(Boolean))),
      resolved: rMoved.resolvedConcepts }));
  // EL DATO QUE VUELVE IGUAL NO VUELVE A HABLAR. Mismo hecho, mismo concepto,
  // misma firma, y el acuse sigue cubriéndolo: nadie tuvo que resolverlo ni
  // re-acusarlo por el camino.
  ok('9.5 un dato que regresa SIN CAMBIAR sigue acusado: no reabre',
    (() => { const c = makeCtx(MATURE);
      const f = { semanticKey: 'position_below_cost_btc', family: 'performance',
        causalRoot: 'position_result', unit: 'percent_of_cost', value: -30, changeFact: true,
        window: { range: 'observed', startAt: 1, endAt: 2 },
        conceptId: 'pos:btc', episodeSignature: 'structural:', eventId: 'pos:btc#structural:',
        materiality: 0.5, novelty: 1, confidence: 1, values: {} };
      c.__l9 = { facts: [f], gaps: [] };
      const ack = '{ "pos:btc": { at: 1, state: "acknowledged", signature: "structural:" } }';
      const first  = run('_aurixCanonicalFindings(__l9, { acknowledged: ' + ack + ' })', c);
      const second = run('_aurixCanonicalFindings(__l9, { acknowledged: ' + ack + ' })', c);
      return first.length === 0 && second.length === 0; })());
  ok('9.6 y el owner de la resolución no conoce la lista de conceptos vivos: no puede resolver por ausencia',
    !/liveConceptIds|live\b/.test(fnSrc('_aurixIntelResolveCertified')));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n10 · Cierre de QA del founder: una bandeja, un historial, cinco ejes:');
{
  // ── LA CUENTA DEL FOUNDER, REPRODUCIDA ──────────────────────────────────
  // Registra 100 acciones de Apple: la exposición a acciones se mueve de verdad,
  // el ledger lo corrobora con su `asset_add`, y eso produce un hallazgo
  // PENDIENTE. Es el caso exacto en el que el hero decía «1 cambio que merece
  // revisión» y «Sin cambios materiales» a la vez.
  const APPLE_FLOWS = [{ id: 'aapl1', ts: NOWTS - 2 * DAY, amountUSD: 22000, kind: 'asset_add',
    source: 'user', intent: 'INTERNAL_BUY', assetId: 'a2', revision: 1 }];
  const APPLE = Object.assign({}, MATURE, {
    serverRows: srvHistory(NOWTS, 30, { crypto: 55000, stock: 20000, liquidity: 25000 },
                                       { crypto: 55000, stock: 42000, liquidity: 25000 }),
    flows: APPLE_FLOWS,
  });
  const heroPending = (h) => num(h, /class="intcc-hero[^"]*"[^>]*data-review-pending="(\d+)"/);
  const heroState   = (h) => (h.match(/class="intcc-hero[^"]*"[^>]*data-intel-state="([^"]+)"/) || [, null])[1];
  const mobPending  = (h) => num(h, /class="intcc-card intcc-m-card intcc-m-hero[^"]*"[\s\S]{0,120}?data-review-pending="(\d+)"/);
  const heroTitle   = (h) => (h.match(/class="intcc-hero-title">([^<]*)</) || [, ''])[1];
  const heroSub     = (h) => (h.match(/class="intcc-hero-sub">([^<]*)</) || [, ''])[1];

  const a0 = render(APPLE);
  ok('10.1 Apple supera materialidad y deja un hallazgo PENDIENTE',
    Number(heroPending(a0.html)) > 0
    && /data-reviewed="0"/.test(a0.html)
    && heroState(a0.html) === 'review_pending',
    JSON.stringify({ pending: heroPending(a0.html), state: heroState(a0.html) }));
  ok('10.2 …y el hero NO puede decir «sin novedades» ni «sin cambios» con algo pendiente',
    !/Sin novedades/i.test(heroTitle(a0.html)) && !/Sin cambios/i.test(heroTitle(a0.html))
    && /merece|merecen/.test(heroSub(a0.html)),
    JSON.stringify({ title: heroTitle(a0.html), sub: heroSub(a0.html) }));
  ok('10.3 escritorio y móvil publican la MISMA bandeja',
    Number(heroPending(a0.html)) === Number(mobPending(a0.html)),
    JSON.stringify({ desktop: heroPending(a0.html), mobile: mobPending(a0.html) }));
  // REFRESCAR NO RECONOCE NADA. Segundo render, contexto nuevo, mismo estado.
  ok('10.4 el hallazgo sigue PENDIENTE tras refrescar (la atención no se olvida)',
    (() => { const a1 = render(APPLE);
      return Number(heroPending(a1.html)) === Number(heroPending(a0.html))
        && heroState(a1.html) === 'review_pending'; })(),
    JSON.stringify({ first: heroPending(a0.html), second: heroPending(render(APPLE).html) }));
  // «La superficie ya no se contradice»: ningún render puede publicar pendientes
  // y a la vez el texto de ausencia de novedades.
  ok('10.5 pendientes > 0 nunca convive con el copy de «sin novedades»',
    (() => { const h = a0.html;
      const p = Number(heroPending(h));
      const noNews = /Sin novedades significativas/.test(h) || /No significant news/.test(h);
      return p > 0 ? !noNews : true; })());

  // ── «ENTENDIDO» · COMPORTAMIENTO REAL, NO REGEX ─────────────────────────
  // Se ejecuta el flujo entero con los owners de producción: se acusa el concepto
  // que la fila publica, se vuelve a pintar en el MISMO contexto (mismo
  // almacenamiento) y se mide qué cambió. Sin DOM falso: lo que se certifica es
  // acuse → recomputación → hero/historial → persistencia.
  const ackOf = (h) => (h.match(/data-intel-ack="([^"]+)"/) || [, null])[1];
  const sigOf = (h) => (h.match(/data-intel-ack="[^"]+"\s*\n?\s*data-intel-sig="([^"]*)"/) || [, ''])[1];
  // El acuse se guarda por PROPIETARIO (`_aurixIntelWriteOwned` se niega sin uno,
  // que es el fail-closed correcto), así que el caso se ejercita con una cuenta
  // real igual que en producción.
  const c1 = makeCtx(APPLE);
  c1._aurixActiveUserId = 'founder-qa';
  const h1 = run('_renderIntelligenceCommandCenter()', c1);
  const id1 = ackOf(h1), sg1 = sigOf(h1);
  ok('10.6 la fila pendiente ofrece un control con identidad acusable',
    !!id1 && /class="intv12-ack"/.test(h1), JSON.stringify({ id: id1, sig: sg1 }));
  run('_aurixIntelAcknowledge(' + JSON.stringify(id1) + ', { signature: '
    + (sg1 === '' ? 'null' : JSON.stringify(sg1)) + ' })', c1);
  const h2 = run('_renderIntelligenceCommandCenter()', c1);
  ok('10.7 al acusar, la fila SIGUE en «Qué ha cambiado» y pasa a revisada',
    /data-reviewed="1"/.test(h2) && /class="intv12-ack is-done"/.test(h2)
    && count(h2, /class="intv4-chg /g) === count(h1, /class="intv4-chg /g),
    JSON.stringify({ before: count(h1, /class="intv4-chg /g), after: count(h2, /class="intv4-chg /g) }));
  ok('10.8 …y deja de ser interactiva: ya no hay botón para esa fila',
    !new RegExp('data-intel-ack="' + id1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(h2));
  ok('10.9 …el contador del hero baja y el CTA desaparece si era el último',
    Number(heroPending(h2)) === Number(heroPending(h1)) - 1
    && (Number(heroPending(h2)) > 0 || !/intv12-see-changes/.test(h2)),
    JSON.stringify({ before: heroPending(h1), after: heroPending(h2) }));
  ok('10.10 …y sin pendientes el hero dice «Todo revisado», no «sin novedades»',
    Number(heroPending(h2)) > 0 || (heroState(h2) === 'all_reviewed'
      && /Todo revisado/.test(heroTitle(h2))),
    JSON.stringify({ pending: heroPending(h2), state: heroState(h2), title: heroTitle(h2) }));
  ok('10.11 el ledger, el Core y la Memoria financiera quedan INTACTOS',
    (() => { const coreBefore = run('_aurixIntelligenceCore({}).ledger.facts.length', c1);
      return coreBefore > 0 && /class="intcc-card intcc-timeline/.test(h2)
        && count(h2, /class="intcc-tl-item/g) === count(h1, /class="intcc-tl-item/g); })(),
    JSON.stringify({ mem_before: count(h1, /class="intcc-tl-item/g),
      mem_after: count(h2, /class="intcc-tl-item/g) }));
  ok('10.12 PERSISTE tras refrescar: un contexto nuevo con el mismo almacenamiento lo lee revisado',
    (() => { const c2 = makeCtx(APPLE);
      c2._aurixActiveUserId = 'founder-qa';
      c2.__store = JSON.parse(JSON.stringify(c1.__store));
      const h3 = run('_renderIntelligenceCommandCenter()', c2);
      return /data-reviewed="1"/.test(h3) && Number(heroPending(h3)) === Number(heroPending(h2)); })());
  ok('10.13 es IDEMPOTENTE: acusar dos veces no crea un episodio ni cambia el contador',
    (() => { const before = JSON.stringify(run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, {})', c1).ack);
      run('_aurixIntelAcknowledge(' + JSON.stringify(id1) + ', { signature: '
        + (sg1 === '' ? 'null' : JSON.stringify(sg1)) + ' })', c1);
      const after = JSON.stringify(run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, {})', c1).ack);
      const h4 = run('_renderIntelligenceCommandCenter()', c1);
      return Object.keys(JSON.parse(before)).length === Object.keys(JSON.parse(after)).length
        && Number(heroPending(h4)) === Number(heroPending(h2)); })());
  ok('10.14 CROSS-DEVICE: el acuse viaja por el merge y el otro dispositivo lo lee revisado',
    (() => { const mine = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, {})', c1);
      const other = makeCtx(APPLE);
      other._aurixActiveUserId = 'founder-qa';
      const merged = run('_aurixIntelCtxMerge(' + JSON.stringify(mine) + ', null)', other);
      run('_aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, ' + JSON.stringify(merged) + ', {})', other);
      const h5 = run('_renderIntelligenceCommandCenter()', other);
      return /data-reviewed="1"/.test(h5); })());
  // EVIDENCIA NUEVA REABRE, Y UNA SOLA VEZ. Se usa el hallazgo CON FIRMA —la
  // deriva de exposición—, que es el caso del ciclo de vida: acusado con su firma
  // queda cubierto, y una firma distinta (un episodio materialmente nuevo) vuelve
  // a hablar. Un hallazgo SIN firma se identifica por concepto y no reabre por
  // cambiarle la firma: eso es correcto y lo cubre 10.12.
  ok('10.15 SÓLO evidencia nueva reabre, y una sola vez (firma distinta ⇒ episodio nuevo)',
    (() => { const signed = h1.match(/data-intel-ack="([^"]+)"\s*\n\s*data-intel-sig="([^"]+)"/);
      if (!signed) return false;
      const c3 = makeCtx(APPLE);
      c3._aurixActiveUserId = 'founder-qa';
      const base = Number(heroPending(run('_renderIntelligenceCommandCenter()', c3)));
      run('_aurixIntelAcknowledge(' + JSON.stringify(signed[1]) + ', { signature: '
        + JSON.stringify(signed[2]) + ' })', c3);
      const covered = Number(heroPending(run('_renderIntelligenceCommandCenter()', c3)));
      const rec = run('_aurixIntelReadOwned(_AURIX_INTEL_CTX_KEY, {})', c3);
      rec.ack[signed[1]].signature = String(signed[2]) + ':moved';
      run('_aurixIntelWriteOwned(_AURIX_INTEL_CTX_KEY, ' + JSON.stringify(rec) + ', {})', c3);
      const reopened = Number(heroPending(run('_renderIntelligenceCommandCenter()', c3)));
      return covered === base - 1 && reopened === base; })(),
    JSON.stringify(h1.match(/data-intel-ack="([^"]+)"\s*\n\s*data-intel-sig="([^"]+)"/) || null));
  // EL DEFECTO DEL BOTÓN ERA EL REPINTADO. `renderIntelligence()` no existe en
  // ninguna parte del fichero; el owner es `renderIntelligenceTab()`. Esto no es
  // un regex decorativo: es el único punto del flujo que no se puede ejercitar
  // sin DOM, y era exactamente donde estaba el fallo.
  ok('10.16 el handler repinta con el owner que EXISTE',
    /renderIntelligenceTab\(\)/.test(fnSrc('_initIntelSeeChanges'))
    && !/renderIntelligence\(\)\s*;/.test(app),
    JSON.stringify({ tab: /renderIntelligenceTab\(\)/.test(fnSrc('_initIntelSeeChanges')),
      ghost: /renderIntelligence\(\)\s*;/.test(app) }));
  ok('10.17 …y mueve el foco a la fila revisada, no al principio del documento',
    /data-finding/.test(fnSrc('_initIntelSeeChanges'))
    && /focus\(\{ preventScroll: true \}\)/.test(fnSrc('_initIntelSeeChanges')));

  // ── UNA PREGUNTA SÓLO POR NECESIDAD ─────────────────────────────────────
  ok('10.18 un hallazgo nuevo NO abre pregunta por sí mismo: sólo `questionNeed`',
    (() => { // Todos los campos declarados ⇒ no hay necesidad que preguntar.
      const answered = { fields: {
        concentration_intent: { value: 'deliberate', provenance: 'declared', answeredAt: 1 },
        wealth_coverage: { value: 'all', provenance: 'declared', answeredAt: 1 },
        liquidity_need: { value: 'none_known', provenance: 'declared', answeredAt: 1 },
        primary_goal: { value: 'grow', provenance: 'declared', answeredAt: 1 },
      }, answered: 4, source: 'stored', asked: {}, declined: {}, pausedAt: null };
      const r = render(Object.assign({}, APPLE, { context: answered }));
      return Number(heroPending(r.html)) > 0 && !/intv12-qcard/.test(r.html); })());

  // ── RADAR · CINCO MARCADORES, TRES VALORES ──────────────────────────────
  const rr = render(APPLE).html;
  const svg = (re) => (rr.match(re) || [, null])[1];
  ok('10.19 cinco ejes, cinco etiquetas y cinco marcadores de disponibilidad',
    svg(/data-svg-axes="(\d+)"/) === '5'
    && count(rr, /class="intcc-radar-label[ "]/g) === 5
    && (count(rr, /class="intcc-radar-dot"/g) + count(rr, /class="intcc-radar-dot is-unknown"/g)) === 5,
    JSON.stringify({ axes: svg(/data-svg-axes="(\d+)"/),
      labels: count(rr, /class="intcc-radar-label[ "]/g),
      filled: count(rr, /class="intcc-radar-dot"/g),
      hollow: count(rr, /class="intcc-radar-dot is-unknown"/g) }));
  // RE-DECIDIDO (§8): «no entran en el polígono» se medía contra un polígono
  // CERRADO que §8 prohíbe cuando hay huecos. El invariante financiero es el
  // mismo y se mide sobre el trazo abierto: los desconocidos no participan, no
  // puntúan y no se interpolan.
  ok('10.20 tres certificados y dos DESCONOCIDOS, y los desconocidos no entran en la serie',
    (() => { const measured = Number(svg(/data-svg-measured="(\d+)"/));
      const unknown = Number(svg(/data-svg-unknown="(\d+)"/));
      const unkXY = (rr.match(/class="intcc-radar-dot is-unknown" cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g) || [])
        .map(m => (m.match(/cx="(-?[\d.]+)" cy="(-?[\d.]+)"/) || []).slice(1).join(','));
      const edges = rr.match(/class="intcc-radar-edge"[^>]*>/g) || [];
      return measured === 3 && unknown === 2
        && !/intcc-radar-area/.test(rr) && svg(/data-svg-open="(\d)"/) === '1'
        && count(rr, /class="intcc-radar-dot"/g) === 3
        && count(rr, /class="intcc-radar-dot is-unknown"/g) === 2
        // ninguna coordenada de un marcador desconocido aparece en un segmento
        && unkXY.every(xy => edges.every(e => e.indexOf(xy.split(',')[0]) === -1
                                           || e.indexOf(xy.split(',')[1]) === -1)); })(),
    JSON.stringify({ measured: svg(/data-svg-measured="(\d+)"/), unknown: svg(/data-svg-unknown="(\d+)"/) }));
  // Las tres señales que distinguen «no medido» de «medido en cero», y ninguna es
  // la coordenada: marcador HUECO (`fill: none`), su tramo de trayectoria en tono
  // NEUTRAL —sólido, no partido: el SPEC de cierre re-decidió la discontinua
  // porque hacía parecer roto el gráfico entero— y la palabra «sin datos» bajo la
  // etiqueta (10.22). La radial al centro se retiró: el centro no es un dato.
  ok('10.21 un eje DESCONOCIDO se distingue por relleno, tono y texto, no por su radio',
    /class="intcc-radar-dot is-unknown"[^>]*data-availability="unknown"/.test(rr)
    && /class="intcc-radar-edge is-unknown"/.test(rr)
    && !/intcc-radar-spoke/.test(rr)
    // El ámbito es el SVG DEL RADAR: `rr` es la pintura completa y el anillo de
    // Salud emite su propio `stroke-dasharray` como atributo.
    && !/stroke-dasharray/.test((rr.match(/<svg class="intcc-radar-svg[\s\S]*?<\/svg>/) || [''])[0])
    && /\.intcc-radar-dot\.is-unknown\s*\{[^}]*fill:\s*none/.test(css)
    && /\.intcc-radar-edge\.is-unknown\s*\{[^}]*stroke:\s*rgba\(138,166,214/.test(css),
    JSON.stringify((rr.match(/class="intcc-radar-dot is-unknown"[^>]*/g) || []).slice(0, 1)));
  ok('10.22 …dice «sin datos» y su etiqueta está atenuada',
    count(rr, /class="intcc-radar-val is-unavailable"/g) === 2
    && count(rr, /class="intcc-radar-label is-unavailable"/g) === 2
    && /sin datos/.test(rr));
  ok('10.23 CRECIMIENTO sigue siendo no computable: ningún owner puede puntuarlo',
    (() => { const dims = run('JSON.stringify(_INTV7_RADAR_DIMS)', makeCtx(APPLE));
      const g = JSON.parse(dims).find(d => d.key === 'growth');
      return !!g && g.owner === null && g.pending === 'no_certifiable_scale'
        && /data-svg-unknown="2"/.test(rr); })());
  ok('10.24 la transición del radar respeta `prefers-reduced-motion`',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}\.intcc-radar-dot[^}]*transition: none/.test(css));

  // ── COPY DE PERÍMETRO ───────────────────────────────────────────────────
  ok('10.25 la superficie ya no repite «invertible» y no miente sobre el denominador · ES',
    (() => { const h = render(APPLE).html;
      const text = h.replace(/<[^>]*>/g, ' ');
      return !/invertible/i.test(text) && /(inversiones|cartera financiera)/i.test(text); })(),
    (render(APPLE).html.replace(/<[^>]*>/g, ' ').match(/[^.]*invertible[^.]*/i) || [''])[0]);
  ok('10.26 …y lo mismo en EN',
    (() => { const h = render(Object.assign({}, APPLE, { lang: 'en' })).html;
      const text = h.replace(/<[^>]*>/g, ' ');
      return !/investable/i.test(text) && /(investments|financial portfolio)/i.test(text); })(),
    (render(Object.assign({}, APPLE, { lang: 'en' })).html.replace(/<[^>]*>/g, ' ')
      .match(/[^.]*investable[^.]*/i) || [''])[0]);
  ok('10.27 el helper de perímetro es UNO y no toca ninguna cifra',
    (() => { const c = makeCtx(APPLE);
      const before = 'Tu patrimonio invertible es de 12.345,67 US$';
      const after = run('_intv4Perimeter(' + JSON.stringify(before) + ')', c);
      const digits = t0 => (String(t0).match(/[\d.,]+/g) || []).join('|');
      return after.indexOf('invertible') === -1 && digits(after) === digits(before)
        && /Tus inversiones suman/.test(after); })(),
    JSON.stringify(run('_intv4Perimeter("Tu patrimonio invertible es de 12.345,67 US$")', makeCtx(APPLE))));
  ok('10.28 …y el vocabulario ya no dice «material» en pantalla (ES y EN)',
    (() => { const es = render(APPLE).html.replace(/<[^>]*>/g, ' ');
      const en = render(Object.assign({}, APPLE, { lang: 'en' })).html.replace(/<[^>]*>/g, ' ');
      return !/material(es)?\b/i.test(es) && !/\bmaterial(ly)?\b/i.test(en); })(),
    (render(APPLE).html.replace(/<[^>]*>/g, ' ').match(/[^.]*material[^.]*/i) || [''])[0]);
  ok('10.29 el rendimiento NO se atribuye a un activo ni a una categoría',
    (() => { const h = render(APPLE).html;
      const m = h.match(/class="intv4-chg-text">([^<]*rendimiento[^<]*)</i);
      if (!m) return true;                       // sin frase de rendimiento no hay riesgo
      const names = ['Bitcoin', 'BTC', 'Cripto', 'cripto', 'A1', 'A2'];
      return names.every(n => m[1].indexOf(n) === -1); })());

  // ── EXPLORA · ROTACIÓN DETERMINISTA ─────────────────────────────────────
  ok('10.30 la rotación es estable dentro del periodo e independiente del dispositivo',
    (() => { const c = makeCtx(APPLE);
      const ids = ['q_a', 'q_b', 'q_c', 'q_d', 'q_e', 'q_f'];
      const at = (now, owner) => JSON.stringify(run('_intv4ExploreRotation('
        + JSON.stringify(ids) + ', ' + now + ', ' + JSON.stringify(owner) + ')', c));
      const day0 = 1757000000000;
      return at(day0, 'u1') === at(day0 + 3600e3, 'u1')     // misma jornada ⇒ mismo conjunto
        && at(day0, 'u1') !== at(day0 + 4 * 864e5, 'u1')    // otro día ⇒ rota la posición diaria
        && at(day0, 'u1') !== at(day0, 'u2'); })());        // otra cuenta ⇒ otro conjunto
  ok('10.31 …nunca repite concepto y respeta el tope de cuatro',
    (() => { const c = makeCtx(APPLE);
      const ids = ['q_a', 'q_b', 'q_c', 'q_d', 'q_e', 'q_f'];
      for (let d = 0; d < 40; d++) {
        const got = run('_intv4ExploreRotation(' + JSON.stringify(ids) + ', '
          + (1757000000000 + d * 864e5) + ', "u1")', c);
        if (got.length !== 4) return false;
        if (new Set(got).size !== got.length) return false;
      }
      return true; })());
  ok('10.32 …y con catálogo corto no inventa nada: devuelve lo que hay',
    (() => { const c = makeCtx(APPLE);
      const got = run('_intv4ExploreRotation(["q_a","q_b"], 1757000000000, "u1")', c);
      return got.length === 2; })());
  ok('10.33 Explora no depende del historial local de presentación',
    !/_intv4ReadShown/.test(fnSrc('_intv4ExploreHtml')));

  // ── LO QUE IMPORTA · SIN DESPLEGABLE, TRES COMO MÁXIMO ──────────────────
  ok('10.34 no queda ningún desplegable en la superficie, ni «Hechos que lo sostienen»',
    !/<details/.test(rr) && !/intv4-more/.test(rr) && !/Hechos que lo sostienen/.test(rr));
  ok('10.35 «Lo que importa» publica 3 lecturas como máximo, y declara sus apoyos sin abrirlos',
    (() => { const items = num(rr, /class="intcc-card intcc-watch[^"]*"[^>]*data-items="(\d+)"/);
      return items !== null && Number(items) <= 3 && /data-support="\d+"/.test(rr); })(),
    JSON.stringify({ items: num(rr, /data-items="(\d+)"/) }));
  ok('10.36 …y la escalera de actualidad ordena: 24H antes que un estado',
    (() => { const c = makeCtx(APPLE);
      const tier = (st) => run('_intv5RecencyTier(' + JSON.stringify(st) + ')', c);
      return tier({ window: { range: '24H' } }) < tier({ window: { range: '7D' } })
        && tier({ window: { range: '7D' } }) < tier({ values: { causeKnown: true } })
        && tier({ values: { causeKnown: true } }) < tier({ window: { range: '30D' } })
        && tier({ window: { range: '30D' } }) < tier({ window: { range: 'observed' } }); })());
  ok('10.37 un hecho ya publicado abajo no se repite literalmente arriba',
    (() => { const facts = (rr.match(/class="intv4-chg-text">([^<]+)</g) || [])
        .map(x => x.replace(/.*>/, '').trim());
      const heads = (rr.match(/class="intv4-story-head">([^<]+)</g) || [])
        .map(x => x.replace(/.*>/, '').trim());
      return heads.every(hd => facts.indexOf(hd) === -1); })(),
    JSON.stringify({ heads: (rr.match(/class="intv4-story-head">([^<]+)</g) || []).length }));

  // ── MEMORIA · HASTA 8 Y SCROLL CONDICIONAL ──────────────────────────────
  ok('10.38 la Memoria publica hasta 8 entradas reales y declara si va a hacer scroll',
    (() => { const n = count(rr, /class="intcc-tl-item/g);
      const declared = num(rr, /class="intcc-card intcc-timeline[^"]*"[^>]*data-rows="(\d+)"/);
      return n <= 8 && (declared === null || Number(declared) === n); })(),
    JSON.stringify({ rows: count(rr, /class="intcc-tl-item/g) }));
  ok('10.39 …y en la rejilla ancha la lista OCUPA la card en vez de dejar hueco muerto',
    /@media \(min-width: 1024px\)[\s\S]{0,400}\.intv4-memory > \.intv10-mem-scroll\s*\{[^}]*flex: 1 1 auto/.test(css)
    && /\.intv4-memory > \.intv10-mem-scroll\s*\{[^}]*max-height: none/.test(css));

  // ── RESPONSIVE ESTRUCTURAL ──────────────────────────────────────────────
  ok('10.40 móvil: Hero → Salud → Pregunta → Radar, y ninguna card antes del hero',
    (() => { const orderOf = (sel) => { const m = css.match(new RegExp('\\' + sel + '\\s*\\{\\s*order:\\s*(\\d+)')); return m ? Number(m[1]) : null; };
      return orderOf('.intcc-m-hero') === 0 && orderOf('.intcc-m-health') === 1
        && orderOf('.intv12-qcard') === 2; })());
  ok('10.41 escritorio: el CTA va separado de las etiquetas, y las etiquetas envuelven',
    /\.intcc-hero \.intcc-chips\s*\{[^}]*margin-top: 18px/.test(css)
    && /\.intcc-hero \.intcc-chips \.intcc-chip\s*\{[^}]*white-space: normal/.test(css)
    && /\.intcc-hero \.intv12-see-changes\s*\{[^}]*margin-top: 16px/.test(css));
  ok('10.42 sin pregunta no se reserva hueco: la card no existe',
    (() => { const answered = { fields: {
        concentration_intent: { value: 'deliberate', provenance: 'declared', answeredAt: 1 },
        wealth_coverage: { value: 'all', provenance: 'declared', answeredAt: 1 },
        liquidity_need: { value: 'none_known', provenance: 'declared', answeredAt: 1 },
        primary_goal: { value: 'grow', provenance: 'declared', answeredAt: 1 },
      }, answered: 4, source: 'stored', asked: {}, declined: {}, pausedAt: null };
      const h = render(Object.assign({}, APPLE, { context: answered })).html;
      return !/intv12-qcard/.test(h) && /data-has-question="0"/.test(h); })());
  ok('10.43 el objetivo táctil del control «Entendido» es de 44px en móvil',
    /@media \(max-width: 640px\)[\s\S]{0,300}\.intv12-ack\s*\{[^}]*min-height: 44px/.test(css));
}

// ════════════════════════════════════════════════════════════════════════════
// ADV · SPEC ADVANCED INTELLIGENCE §1/§4/§5 — EL REGISTRO DE HOY SE PINTA
// ════════════════════════════════════════════════════════════════════════════
// El fallo del founder no era que el hecho estuviese mal redactado: era que NO
// LLEGABA A LA PANTALLA. Este bloque mide la pintura real de la superficie
// (`_renderIntelligenceCommandCenter`), no el ledger, porque el ledger ya estaba
// certificado y la superficie seguía muda.
console.log('\nADV · Una operación registrada HOY llega a la pantalla:');
{
  const MSFT_TODAY = [
    // El movimiento de liquidez ANTIGUO que se quedó destacado en producción.
    { id: 'oldcash', ts: NOWTS - 40 * DAY, amountUSD: 10869.57, kind: 'deposit',
      source: 'user', revision: 1, recordedAt: NOWTS - 40 * DAY },
    // Y la incorporación de HOY, con su procedencia.
    { id: 'msfttoday', ts: NOWTS - 2 * HOUR, amountUSD: 22000, kind: 'asset_add',
      source: 'user', intent: 'INTERNAL_BUY', assetId: 'a2', revision: 1,
      recordedAt: NOWTS - 2 * HOUR },
  ];
  const CASE = Object.assign({}, MATURE, {
    serverRows: srvHistory(NOWTS, 30, { crypto: 55000, stock: 20000, liquidity: 25000 },
                                       { crypto: 55000, stock: 42000, liquidity: 25000 }),
    flows: MSFT_TODAY,
  });
  const r = render(CASE);
  const h = r.html;
  const brief = section(h, 'intv5-matters');
  ok('ADV.1 la superficie pinta la operación registrada hoy',
    /Hoy has (registrado|comprado)/.test(h), (h.match(/Hoy has [^<]{0,60}/) || [, ''])[0] || 'ausente');
  // A2 — arriba el SIGNIFICADO, abajo la cifra. Cuando «Qué ha cambiado» ya
  // publica el hecho como fila, «Lo que importa hoy» lo encabeza por su peso
  // estructural (§4) y no repite el importe. Se mide por `data-fact`, no por
  // texto: comparar cadenas renderizadas en dos idiomas es frágil.
  ok('ADV.2 «Lo que importa hoy» encabeza con la operación registrada',
    /data-root="recorded_operation"/.test(brief)
    && /data-fact="operation_registered_a2"/.test(brief), brief.slice(0, 300));
  // §14/§20 — «Es un registro tuyo, no un resultado» se RETIRA del inicio: era una
  // defensa del motor y no información para el lector. El titular sigue siendo el
  // SIGNIFICADO (el peso estructural medido), que es lo que este assert protege.
  // La revisión financiera pidió que volviese la única aclaración que evita una
  // lectura engañosa del porcentaje: su numerador es el COSTE registrado, no la
  // valoración. Vuelve como información («Por su coste registrado…»), no como la
  // coletilla defensiva que §14 retiró («Es un registro tuyo, no un resultado»).
  ok('ADV.2b y su titular es el SIGNIFICADO, con el peso estructural medido y su base',
    /intv4-story-head">Por su coste registrado, esta operación representa el [\d,.]+% de tu cartera financiera/.test(brief)
    && !/no un resultado/.test(brief),
    (brief.match(/intv4-story-head">([^<]*)/) || [, ''])[1]);
  ok('ADV.3 ocupa la PRIMERA posición de esa card',
    (() => { const i = brief.indexOf('data-root="recorded_operation"');
      const j = brief.indexOf('data-root="external_capital"');
      return i >= 0 && (j === -1 || i < j); })(),
    JSON.stringify(attrs(brief, 'data-root="([^"]+)"')));
  ok('ADV.3b y el importe del registro vive en «Qué ha cambiado», no duplicado arriba',
    /Hoy has (registrado|comprado)/.test(section(h, 'intv4-changed'))
    && !/Hoy has (registrado|comprado)/.test(brief),
    (section(h, 'intv4-changed').match(/Hoy has [^<]{0,60}/) || [, ''])[0]);
  ok('ADV.4 el hero cuenta el registro como algo pendiente de revisar',
    Number(num(h, /class="intcc-hero[^"]*"[^>]*data-review-pending="(\d+)"/)) > 0,
    String(num(h, /class="intcc-hero[^"]*"[^>]*data-review-pending="(\d+)"/)));
  ok('ADV.5 la frase NO se repite literalmente en dos superficies',
    (h.match(/Hoy has (registrado|comprado)/g) || []).length === 1,
    String((h.match(/Hoy has (registrado|comprado)/g) || []).length));
  ok('ADV.6 y NO se publica ninguna subida de valor: el nivel cambió por registro',
    !/han subido/.test(h) && !/ha subido \d/.test(h),
    (h.match(/ha[n]? subido[^<]{0,50}/) || [, ''])[0] || 'ninguna');
  // SIN ACTIVIDAD: la misma superficie, sin operaciones de hoy, no inventa nada.
  const quiet = render(Object.assign({}, CASE, { flows: [MSFT_TODAY[0]] }));
  ok('ADV.7 sin operación de hoy la superficie no afirma ningún registro',
    !/Hoy has (registrado|comprado)/.test(quiet.html));
  ok('ADV.8 …y sigue pintándose sin hueco ni error',
    /intcc-radar-svg/.test(quiet.html) && /intv5-matters/.test(quiet.html));
  // EN: la misma operación, el otro idioma.
  const en = render(Object.assign({}, CASE, { lang: 'en' }));
  ok('ADV.9 en inglés se publica igual y sin decir «up»',
    /Today you (recorded|bought)/.test(en.html) && !/\bis up\b/.test(en.html),
    (en.html.match(/Today you [^<]{0,60}/) || [, ''])[0] || 'ausente');
}

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
