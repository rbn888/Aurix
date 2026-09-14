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
    'intel_see_changes',
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
    'intel_d_persisting','intel_d_combined',
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
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_INTV7_RADAR_DIMS','TYPE_META','_AURIX_QUESTION_CATALOG',
  '_INTV4_DEPTH','_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX',
  '_INTV4_SHOWN_KEY','_AURIX_INTEL_HEALTH_POSITIVE','_AURIX_INTEL_DISC_MAX','_AURIX_INTEL_DIM_ROOT','_AURIX_INTEL_CTX_KEY','_AURIX_INTEL_CTX_KEY_LEGACY',
  '_AURIX_INTEL_FIELDS','_AURIX_INTEL_PROVENANCE','_AURIX_INTEL_QUESTION_LIMIT'];
const FNS = ['_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowUnpairableDerived','_aurixFlowDuplicateIds','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_intv4FindingRows','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket',
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
  ok('1.2 hero N === filas del destino === cardinalidad declarada',
    Number(heroN) === rows && Number(destN) === rows && rows > 0,
    JSON.stringify({ heroN: heroN, destN: destN, rows: rows }));
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
  ok('5.2 un eje certificado BAJO conserva radio mínimo visible, así que un 0 real es una MARCA',
    /const RMIN = 0\.06;/.test(fnSrc('_intccRadarSvg'))
    && /Math\.max\(RMIN,/.test(fnSrc('_intccRadarSvg')));
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

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
