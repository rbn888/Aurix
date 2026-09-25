#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE INT.04 · VISUAL QA (móvil / tablet / escritorio, URL PÚBLICA)
 *
 * Mide la GEOMETRÍA REAL de la superficie Intelligence premium sobre el bundle
 * PÚBLICO desplegado (app.aurixsystem.io), en los tres viewports, y guarda
 * capturas. No juzga estética: mide los defectos que el SPEC INT.04 §11 prohíbe.
 *
 * POR QUÉ SE INYECTA EL MARKUP
 *   La pestaña Intelligence está tras `hasAurixPremiumAccess`, así que una sonda
 *   sin sesión vería el PREVIEW, no la superficie nueva. Para medir la superficie
 *   real sin falsear una sesión, el markup se genera con las funciones del
 *   MISMO app.js desplegado (verificado byte a byte contra el servido) y se
 *   inyecta en la página PÚBLICA, de modo que lo aplica el styles.css PÚBLICO.
 *   Esto certifica CSS + markup + layout reales en los tres viewports.
 *   NO sustituye la QA autenticada con los datos reales del founder.
 *
 * Qué mide
 *   overflowX          la página o una sección desborda a lo ancho     (prohibido)
 *   clipped            texto recortado sin elipsis
 *   tapSmall           objetivos táctiles < 44 px de alto (móvil)
 *   hiddenFacts        algún elemento con un HECHO quedó invisible     (prohibido)
 *   order              jerarquía: Brief → Changed → Discovery → Explore → Memory
 *   scoreCount         el score canónico aparece exactamente una vez
 *   dupPercents        el mismo porcentaje repetido por la pantalla
 *   fontMin            tamaños de fuente por debajo del mínimo legible
 *
 *   node --experimental-websocket scripts/aurix-int04-visual-qa.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from "node:os";
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC = process.env.AURIX_QA_URL || 'https://app.aurixsystem.io/';
const OUT = join(ROOT, 'docs', 'int04-visual-qa');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const app = readFileSync(join(ROOT, 'app.js'), 'utf8');

// ── 1 · Generate the REAL INT.04 markup from the deployed functions ──────────
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
function keyOcc(k){ const out=[], n='    '+k+':'; let i=app.indexOf(n); while(i>=0){ out.push(i); i=app.indexOf(n,i+1);} return out; }
function dict(langIdx){
  const start = keyOcc('intv4_brief_title')[langIdx];
  // The slice must reach the INT.05 keys too, and the restored cockpit renders a
  // set of LEGACY keys that live outside the block — those come in as extras.
  const end = app.indexOf('\n', keyOcc('intv5_cat_other')[langIdx]);
  const extras = ['intcc_health_title','intcc_health_suffix','intcc_disclaimer','intcc_empty_title',
    'intcc_empty_body','healthScoreSolid','healthScoreModerate','healthScoreElevated','healthScoreHigh',
    'healthScoreEmpty','healthScoreExplainSolid','healthScoreExplainModerate','healthScoreExplainElevated',
    'healthScoreExplainHigh','intcc_band_empty','intcc_eyebrow','intcc_radar_title','intcc_drivers_title',
    'intcc_drv_explain_asset','intcc_drv_explain_cash','intcc_drv_kind_eng','intcc_drv_kind_liq',
    'intcc_drv_none','intcc_chip_div','intcc_chip_liq','intcc_chip_conc','intcc_chip_watch',
    // CIERRE DEFINITIVO — el limitador de Salud, el disclosure por naturaleza
    // del comparador y la copy de su selector y su tooltip.
    'intcc_chip_limit_spread','intcc_chip_nodata',
    'cmp_title','cmp_with','cmp_none','cmp_clear','cmp_mine','cmp_a11y','cmp_insufficient',
    'cmp_no_return','cmp_available_from','cmp_ends','cmp_range_aria','cmp_provider_error','cmp_loading',
    'cmp_range_24h','cmp_range_7d','cmp_range_30d','cmp_range_90d','cmp_range_1y','cmp_range_all',
    'cmp_b_sp500','cmp_b_ndx100','cmp_b_btc','cmp_b_gold','cmp_diff_more','cmp_diff_less','cmp_diff_flat',
    'cmp_disc_index','cmp_disc_equity','cmp_disc_price','cmp_pick_none','cmp_pick_search','cmp_pick_close',
    'cmp_pick_empty','cmp_pick_recent','cmp_pick_title','cmp_g_index','cmp_g_etf','cmp_g_stock',
    'cmp_g_crypto','cmp_g_metal','cmp_kind_index','cmp_kind_etf','cmp_kind_stock','cmp_kind_crypto',
    'cmp_kind_metal','cmp_tip_mine','cmp_tip_diff','cmp_tip_pp',
    'intcc_read_attention','intcc_read_concentrated','intcc_read_growing','intcc_read_healthy',
    'intcc_read_balanced','intcc_sub_attention','intcc_sub_concentrated','intcc_sub_growing',
    'intcc_sub_healthy','intcc_sub_balanced',
    // INT.07 — the semantic pentagon's labels and its "no data" state live outside
    // the intv4/intv5 slice, so they must come in as extras or an axis renders blank.
    'intcc_dim_div','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab','intcc_dim_growth',
    // A2 — el eje de DIVERSIFICACIÓN publica amplitud de categorías REGISTRADAS, y
    // su clave vive fuera del corte: sin ella la etiqueta salía vacía en la sonda
    // (no en producción) y el informe acusaba un defecto que no existía.
    'intcc_dim_breadth',
    // Cierre de QA: la bandeja de atención del hero y la marca de revisado.
    'intel_now_novelty','intel_sub_review','intel_now_reviewed','intel_sub_reviewed',
    'intel_now_no_news','intel_sub_no_news','intel_ack_done','intel_ack','intel_ack_aria',
    'intel_see_changes','intel_now_material','intel_now_discovery','intel_now_changed',
    'intv7_axis_unavailable','intv7_radar_legend','intv7_radar_pending']
    .map(k => { const i = keyOcc(k)[langIdx]; return i == null ? null : app.slice(i, app.indexOf('\n', i)).trim().replace(/,$/, ''); })
    .filter(Boolean).join(',\n');
  return new Function('return ({' + app.slice(start, end).replace(/,\s*$/, '') + ',\n' + extras + '})')();
}
const DICT = { es: dict(0), en: dict(1) };

const DAY = 864e5, HOUR = 36e5, T0 = 1750000000000, NOW = Date.now();
const CONSTS = ['_AURIX_OBS_CLASS','_AURIX_EV_GAP','_AURIX_CATBREADTH_TAXONOMY','_AURIX_FLOW_INTENT','_AURIX_FLOW_INTENT_EXTERNAL','_AURIX_BUCKET_MAP_KEY','_AURIX_LINEAGE_KEY','_AURIX_LINEAGE_MAX','_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL',
  '_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR','_AURIX_CAPITAL_FLOWS_KEY',
  '_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD','_AURIX_WN12_MIN_SPAN_RETENTION',
  '_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS','_AURIX_RETURN_COMPARABLE_RATIO',
  '_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FACT_STATUS',
  '_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_REGISTERED_OP_KINDS','_AURIX_REGISTERED_OP_BATCH_MIN','_AURIX_RANK_WEIGHTS',
  '_AURIX_NOVELTY_WINDOW_MS','_AURIX_FACT_CONTRACT_VERSION','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_INTV7_RADAR_DIMS','TYPE_META','_AURIX_QUESTION_CATALOG','_INTV4_DEPTH',
  '_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX','_INTV4_MEMORY_WINDOW_ORDER','_INTV4_SHOWN_KEY','_AURIX_INTEL_HEALTH_POSITIVE','_AURIX_INTEL_DIM_ROOT','_AURIX_AI_EVOLUTION_RANGES','_AURIX_INTEL_DISC_MAX','_INTV4_EXPLORE_PERIOD_WEEKS','_INTV4_PERIMETER','_AURIX_CMP_FLAG_KEY','_AURIX_CMP_FLAT_PP','_AURIX_CMP_NOMINAL_MS','_AURIX_CMP_COVERAGE_MIN','_AURIX_CMP_MIN_POINTS','_AURIX_CMP_INTRADAY','_AURIX_CMP_DISCLOSURE','ASSET_DB','_AURIX_CMP_KIND_OF','_AURIX_CMP_US_ETFS','_AURIX_CMP_USD_INDICES','_AURIX_CMP_GROUPS','_AURIX_CMP_RECENT_KEY','_AURIX_CMP_RECENT_MAX','_AURIX_CMP_CATALOG','_AURIX_CMP_FX_PAIR','_AURIX_CMP_STATE','_AURIX_CMP_PROVIDER_REASONS','_AURIX_CMP_PROVIDER_RANGE','_AURIX_CMP_RANGES','_AURIX_CMP_STATE_KEY','_AURIX_AI_COVERAGE','_AURIX_AI_AVAIL','_AURIX_AI_LABEL','_AURIX_INTEL_HEALTH_BANDS','_INTCC_HEALTH_DIM_LABEL','_INTV5_TIER','_AURIX_TODAY_MAX_AGE_MS','_AURIX_TODAY_STALE_MS','_AURIX_GAP_SURFACE','_AURIX_ROOT_READABLE'];
const FNS = ['_intv4ExploreRotation','_intv4ExploreSeed','_intv4Perimeter','_intv4ActiveReviewFindings','_aurixNow','_aurixTodayDatedAt','_aurixTodayFresh','_aurixTodayDataStale','_intv5RecencyTier','_intelCoherentState','_intelDiscoveryText','_intelQuestionText','_intv4MemoryEvents','_intv4MemoryClaims','_intv4MemoryDeclared','_aurixIntelRootsOf','_aurixLoadCapitalFlowsRaw','_aurixLoadCapitalFlowsLive','_aurixFlowIsDerived','_aurixFlowDupKey','_aurixFlowDuplicateIds','_aurixFlowUnpairableDerived','_aurixFlowDuplicateReport','_aurixFlowIntentOf','_aurixEvidence','_aurixCashLedgerAuthority','_aurixRegisteredOperations','_aurixStrictInvestableBucket','_aurixRegisteredCategoryBreadth','_aurixEventIdentity','_aurixCanonicalFindings','_aurixLineageRead','_aurixClassificationValidity','_aurixAssetBucketById','_intv4FindingRows','toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
  'activeAssets','isInvestableAsset','investableAssets','investableValueUSD','liquidityNominal','assetNativeValue',
  'assetValueUSD','_aurixPointValuationIncomplete','_aurixFlowIsInternal','_aurixLoadCapitalFlows',
  '_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixInvestablePerformance',
  '_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow',
  '_aurixCatExposureDelta','_aurixFactClamp01','_aurixEffectiveDiversification','_aurixIntelDispersion','_aurixIntelHealth','_aurixFactLedger',
  '_aurixIntelligenceStories','_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged',
  '_aurixFactPeriodNamedAs','_aurixFactPeriodDegraded','_aurixFactEnvelope','_aurixIntelligenceCore','_aurixHealthScore','_intccScoreTone','_intccHealthLimiters','_intccHealthScore','_intccClamp','_intccEsc',
  '_intccDate','_intccDateTime','_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4WindowLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml','_intv4ChangedRef','_intv4ChangedHtml',
  '_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml','_intv4MemoryHtml','_intv4QualityHtml',
  '_intv4ReadShown','_intv4RecordShown',
  // INT.05 — restored cockpit modules and the legacy components they reuse.
  '_intccScoreRingHtml','_intccIsMonetary','_intTop3Investable','buildPortfolioDrivers',
  
  '_intv5Reading','_intv5Chips','_intv5StructureHtml','_aurixGapsBySurface','_intv5DriversHtml','_intv5MattersHtml','_aurixPctNum','_aurixPctLabel','_intccPctLabel','_aurixPeakRetention','_intccHydrationPending','_aurixIntelContext','_aurixIntelCtxRecord','_aurixIntelReadOwned','_aurixIntelWriteOwned','_aurixIntelOwner','_aurixIntelStore','_aurixIntelMarkAsked','_aurixEpisodeOf','_aurixIntelResolveCertified','_aurixIntelAcknowledge','_aurixLossImpactShare','_aurixLossSeverityTier','_aurixFlowCounterpartObserved','_aurixFlowRowFromLocal','_aurixCmpEnabled','_aurixCmpResolvableUSD','_aurixCmpFromRegistry','_aurixCmpProviderRange','_aurixCmpLabel','_aurixCmpRecent','_aurixCmpPushRecent','_aurixCmpFxFor','_aurixCmpBenchmark','_aurixCmpMedianStep','_aurixCmpBucketize','_aurixCmpAlign','_aurixComparisonSync','_intv14CmpState','_intv14CmpSetState','_intv14CmpAxisHtml','_intv14CmpSvg','_intv14ComparatorHtml','_intv7RadarAxes','_intv7RadarHtml','_intccRadarSvg','getInvestableDistribution','_aurixDisplayCategory',
  '_renderIntelligenceCommandCenter','_intv7PendingReasonKey','_intv5MattersStories','_intv9DiscoveriesHtml','_intv4MemoryDiversify','_intv4MemoryRows'];

function srvRow(ts, cats){ let tot=0; for(const k in cats) tot+=cats[k];
  return { ts, total_value_usd:+tot.toFixed(2), real_estate: cats.real_estate||0, category_values: Object.assign({},cats) }; }
function srvHistory(endTs, spanDays, a, b){ const rows=[], step=6*HOUR, n=Math.floor((spanDays*DAY)/step);
  for(let i=0;i<=n;i++){ const f=n===0?1:i/n, c={};
    for(const k of Object.keys(a)) c[k]=+((a[k]||0)+((b[k]!=null?b[k]:a[k])-(a[k]||0))*f).toFixed(2);
    rows.push(srvRow(endTs-(n-i)*step, c)); } return rows; }

function buildHtml(lang) {
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  vm.createContext(sb);
  sb.baseCurrency = 'EUR'; sb.usdToEur = 0.92; sb.lang = lang;
  sb._aurixFxRate = c => ({ USD: 1, EUR: 0.92 })[String(c).toUpperCase()];
  sb.t = k => DICT[lang][k];
  sb._escapeWorkspaceText = s => String(s == null ? '' : s);
  sb.reducedMotion = true;
  // A realistic MATURE portfolio: 12 lopsided positions, real market move, a
  // real deposit, a real certified exposure drift.
  sb.__rows = [10000,10200,10400,10600,10800,11000].map((v,i)=>({ ts:T0+i*DAY, total:v, real_estate:0 }));
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb._aurixPortfolioEpoch = () => 0;
  sb.investableValueBase = () => 0;
  sb.canDisplayCanonicalReturn = () => ({ ok: true });
  sb.activeRange = 'all';
  sb._aurixBackendSnapshots = srvHistory(NOW, 10, { crypto:31000, stock:40000, liquidity:29000 },
                                                  { crypto:39000, stock:40000, liquidity:21000 });
  sb._aurixBackendSnapshotsState = 'ready';
  sb._aurixBackendHealthSnapshot = () => ({ status: 'ok' });
  // THE FOUNDER'S REAL PORTFOLIO SHAPE: three positions, but only TWO asset
  // classes (BTC + ETH collapse into `crypto`). The previous 6-class fixture is
  // precisely why the empty radar column was never caught before it shipped.
  sb.assets = [
    { id:'btc', name:'Bitcoin',  ticker:'BTC', type:'crypto', qty:1,     price:52000 },
    { id:'eth', name:'Ethereum', ticker:'ETH', type:'crypto', qty:10,    price:3300  },
    { id:'eur', name:'Euros',    ticker:'EUR', type:'cash',   qty:15000 },
  ];
  sb._aurixHealthSnapshot = () => ({ assetCount:12, totUSD:100000, categoryCount:5, cashPct:12, cryptoPct:39,
    realEstatePct:0, topInvestedAsset:{ name:'BTC', ticker:'BTC', type:'crypto', pctTotal:53 },
    topCategory:{ type:'crypto', label:'Cripto', pctTotal:53 }, worstAsset:null, bestAsset:null });
  sb.buildPortfolioDrivers = () => ({ items: [], pct: 71 });
  sb.__store = {};
  sb.localStorage = { getItem:k=>(Object.prototype.hasOwnProperty.call(sb.__store,k)?sb.__store[k]:null),
    setItem:(k,v)=>{ sb.__store[k]=String(v); }, removeItem:k=>{ delete sb.__store[k]; } };
  sb._aurixCapitalFlowsComplete = () => true;
  vm.runInContext('var _aurixLineageColumnSeen = true;', sb);
  // LAS FUNCIONES PRIMERO: `_AURIX_CMP_CATALOG` se DERIVA del registro de
  // Market llamando a `_aurixCmpFromRegistry()` en su propia definición, así
  // que declarar las constantes antes reventaba con «is not defined».
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  // EL PRESENTE DE LA FIXTURE. «Lo que importa hoy» mide la actualidad contra
  // un reloj (checkpoint F), y esta sonda ancla sus filas a una constante: sin
  // fijarlo, sus hechos serían de hace más de un año y la card saldría vacía.
  // Va DESPUÉS de inyectar las funciones, o la definición real lo pisaría.
  vm.runInContext('_aurixNow = function () { return '
    + (sb.__rows[sb.__rows.length - 1].ts + 3600e3) + '; };', sb);
  vm.runInContext("__store[_AURIX_CAPITAL_FLOWS_KEY] = " + JSON.stringify(JSON.stringify(
    [{ id:'d1', ts:T0+1.5*DAY, amountUSD:400, kind:'deposit', source:'user' }])), sb);
  vm.runInContext("__store[_AURIX_LINEAGE_KEY] = " + JSON.stringify(JSON.stringify(
    { since: 0, entries: [] })), sb);
  return vm.runInContext('_renderIntelligenceCommandCenter()', sb);
}
const HTML = { es: buildHtml('es'), en: buildHtml('en') };
mkdirSync(OUT, { recursive: true });

// ── EL MARKUP, REUTILIZABLE ────────────────────────────────────────────────
// Generarlo cuesta 180 líneas de fixture y es exactamente el mismo markup que
// necesita cualquier otra medida sobre esta superficie. Con `AURIX_INT04_DUMP=1`
// se vuelca y se sale: la alternativa era una segunda copia de la fixture, que
// es como dos sondas acaban midiendo cosas distintas y llamándolas igual.
// La parte de geometría de ESTA sonda pide Node ≥ 22 (WebSocket global + CDP);
// el volcado no, así que sigue sirviendo donde la otra mitad no puede correr.
if (process.env.AURIX_INT04_DUMP === '1') {
  for (const l of ['es', 'en']) writeFileSync(join(OUT, 'markup-' + l + '.html'), HTML[l]);
  console.log('markup volcado en ' + OUT + ' (es, en) — ' + HTML.es.length + ' / ' + HTML.en.length + ' bytes');
  process.exit(0);
}

// ── 2 · Chrome + CDP ────────────────────────────────────────────────────────
const PORT = 9820 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-int04-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
async function wsUrl(){ for(let i=0;i<80;i++){ try{ const j=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if(j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }catch(_){} await sleep(250);} throw new Error('no devtools'); }
function mkClient(ws){ let id=0; const pend=new Map();
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id); m.error?rej(new Error(m.error.message)):res(m.result);} });
  return { send:(a,b={},s)=>Promise.race([ new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method:a,params:b,...(s?{sessionId:s}:{})})); }), sleep(30000).then(()=>{throw new Error('cdp timeout: '+a);}) ]) }; }
// `WebSocket` es global desde Node 22 (el proyecto declara `engines: node 24.x`).
// En un Node anterior este probe NO puede correr, y decirlo explícitamente vale
// más que un ReferenceError crudo: el markup ya se generó y se validó arriba, lo
// único que falta es la MEDIDA en el navegador.
if (typeof WebSocket === 'undefined') {
  console.error('\n[visual-qa] Node ' + process.versions.node + ' no trae WebSocket global (hace falta Node >= 22).');
  console.error('[visual-qa] El markup ES/EN se generó correctamente; la geometría requiere el navegador.');
  process.exit(2);
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
const cdp = mkClient(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const ev = async expression => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 300) };
  return r.result && r.result.value;
};
// Neutralise the unauthenticated redirect BEFORE the bundle runs, so we keep the
// real page (and its real CSS) instead of being bounced to login.
await S('Page.addScriptToEvaluateOnNewDocument', { source:
  `(function(){ try { var r = location.replace.bind(location), a = location.assign.bind(location);
     location.replace = function(u){ if (/login|reset/.test(String(u))) return; return r(u); };
     location.assign  = function(u){ if (/login|reset/.test(String(u))) return; return a(u); };
   } catch(_){} })();` });

// The restored cockpit uses the legacy grid on desktop/tablet and the legacy
// prioritised order on phones, so the expected reading order differs by viewport
// BY DESIGN. Both are asserted from real vertical position.
// INT.06 cognitive order: orientación → comprensión → diagnóstico → exploración
// → qué importa → evolución → profundidad. One column on mobile/tablet, the
// 12-column grid on desktop; both must read in the SAME order.
// ESTRUCTURA salió de la presentación por decisión de producto: republicaba lo
// que ya dicen Salud, Radar y Factores. Su owner y sus datos siguen intactos para
// el motor y los gates, así que esto es una retirada de superficie, no de dominio.
// ── SUPREME CLOSURE · EL ORDEN APROBADO POR EL FOUNDER ────────────────────
// Este probe fijaba «Radar antes que Factores» en los TRES viewports, y en móvil
// y tablet eso lleva fallando desde que el founder aprobó el orden contrario:
// Inteligencia → Salud → Pregunta → Factores → Explora → Radar → Lo que importa
// → Tu evolución → Qué ha cambiado. El SPEC lo declara literalmente en su
// apartado «BASE QUE DEBE PRESERVARSE», así que lo que estaba mal era la
// expectativa, no la superficie. En ESCRITORIO el orden aprobado SÍ es
// Radar → Factores → Explora, y ahí el probe ya medía lo correcto.
// TABLET queda FIJADO con la jerarquía de móvil, que es la que la hoja de
// estilos le aplica hoy (`≤1023px`) y la que el SPEC pide «fijar sin alterar».
const MOBILE_HIERARCHY = ['intcc-m-hero','intcc-m-health','intv12-qcard','intcc-drivers','intcc-explore','intcc-radar','intv14-cmp','intcc-watch','intcc-timeline','intv4-changed','intv4-discovery'];
const EXPECTED_ORDER = {
  mobile:  MOBILE_HIERARCHY,
  tablet:  ['intcc-hero','intv12-qcard'].concat(MOBILE_HIERARCHY.slice(3)),
  desktop: ['intcc-hero','intv12-qcard','intcc-radar','intcc-drivers','intcc-explore','intv14-cmp','intcc-watch','intcc-timeline','intv4-changed','intv4-discovery'],
};
// INT.07 §14 — a row must behave like a ROW: every card in it shares one bottom
// baseline. The founder photographed the opposite (a broken mosaic with black
// holes), so this is measured per row on the desktop grid.
const DESKTOP_ROWS = [
  ['intcc-radar', 'intcc-drivers', 'intcc-explore'],
  ['intcc-watch', 'intcc-timeline'],
  ['intv5-structure', 'intv4-changed'],
];
const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844,  dsf: 3, mobile: true  },   // iPhone 14/15
  { name: 'tablet',  width: 834,  height: 1112, dsf: 2, mobile: true  },   // iPad Air portrait
  { name: 'desktop', width: 1440, height: 900,  dsf: 2, mobile: false },
];

const MEASURE = `(function(){
  var host = document.getElementById('__int04qa');
  if (!host) return { error: 'no host' };
  var doc = document.documentElement;
  var out = { vw: innerWidth, docOverflowX: Math.max(0, host.scrollWidth - host.clientWidth) };
  // Must consider ANCESTORS too: an element inside a hidden parent has its own
  // computed style intact and a valid box, which is exactly how the first run
  // "passed" while nothing was painted. checkVisibility walks the chain.
  var vis = function(el){
    if (typeof el.checkVisibility === 'function'
        && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    var s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.01
        && r.width > 0 && r.height > 0;
  };
  // sections in DOM order
  // Ordered by real vertical POSITION on screen, so a CSS reorder (grid, order,
  // flex-direction) cannot pass a DOM-order check.
  out.order = Array.prototype.slice.call(host.querySelectorAll('section'))
    .filter(vis)
    .map(function(s){ return { k: (s.className.match(/intcc-m-hero|intcc-m-health|intv12-qcard|intv14-cmp|intcc-hero|intcc-radar|intcc-drivers|intcc-explore|intcc-watch|intcc-timeline|intv5-structure|intv4-changed|intv4-discovery/) || ['?'])[0],
                               y: Math.round(s.getBoundingClientRect().top + host.scrollTop) }; })
    .sort(function(a,b){ return a.y - b.y; })
    .map(function(o){ return o.k; });
  // any section wider than the host
  // A section that CLIPS its own overflow cannot leak anything to the page, and a
  // decorative absolutely-positioned halo (.intcc-orb-glow uses inset:-28%) legibly
  // extends past the content box by a few px. What matters is measured elsewhere:
  // the page must not scroll horizontally and no TEXT may be clipped. So only
  // NON-clipped sections are checked here.
  var over = Array.prototype.slice.call(host.querySelectorAll('section'))
    .filter(function(s){ var ox = getComputedStyle(s).overflowX;
      return ox !== 'hidden' && ox !== 'clip' && s.scrollWidth - s.clientWidth > 1; });
  out.sectionOverflow = over.length;
  out.overflowWho = over.map(function(s){ return (s.className||'') + ':' + (s.scrollWidth - s.clientWidth) + 'px'; });
  out.overflowKids = over.length ? Array.prototype.slice.call(over[0].children).map(function(c){
    var cs = getComputedStyle(c), r = c.getBoundingClientRect();
    return (c.className||c.tagName) + ' w=' + Math.round(r.width) + ' sw=' + c.scrollWidth
      + ' mw=' + cs.minWidth + ' fb=' + cs.flexBasis; }) : [];
  // fact-bearing elements must be visible AND not clipped without ellipsis
  // Elements that must be visible WITHOUT any interaction. The supporting-fact
  // items are deliberately excluded: they live inside a closed details element
  // (progressive disclosure), and the open-and-check below proves they appear.
  var FACT = ['.intv4-story-head','.intv4-story-why','.intv4-chg-text','.intv4-wow-text',
              '.intv4-mem-what','.intv4-quality-line','.intv4-head-val','.intcc-health-badge','.intcc-x-label'];
  var hidden = [], clipped = [], fontMin = 99, tiny = [];
  // The health badge is emitted twice (desktop hero + mobile card) and CSS shows
  // one: requiring EVERY instance to be visible would contradict the restored
  // responsive pattern, so for it we require AT LEAST one visible.
  var PER_VIEWPORT = { '.intcc-health-badge': 1 };
  FACT.forEach(function(sel){
    var els = Array.prototype.slice.call(host.querySelectorAll(sel));
    if (PER_VIEWPORT[sel]) {
      if (els.filter(vis).length < PER_VIEWPORT[sel]) hidden.push(sel);
    }
    els.forEach(function(el){
      if (!vis(el)) { if (!PER_VIEWPORT[sel]) hidden.push(sel); return; }
      var cs = getComputedStyle(el);
      var fs = parseFloat(cs.fontSize); if (fs < fontMin) fontMin = fs;
      // The legacy health badge is 10.5px by long-standing premium design.
      if (fs < 11 && sel !== '.intcc-health-badge') tiny.push(sel + ':' + fs);
      // horizontal clipping without ellipsis. NOTE: a non-replaced INLINE element
      // reports clientWidth 0, so comparing against it produced false positives;
      // measure against the layout box and skip inline elements.
      var isInline = cs.display === 'inline';
      if (!isInline && el.scrollWidth - Math.round(el.getBoundingClientRect().width) > 1
          && cs.textOverflow !== 'ellipsis' && cs.overflow === 'visible')
        clipped.push(sel + '|' + (el.textContent||'').slice(0,30));
      // vertical clipping (text taller than its box with hidden overflow)
      if (el.scrollHeight - el.clientHeight > 2 && cs.overflowY === 'hidden')
        clipped.push('vert:' + sel);
    });
  });
  out.hiddenFacts = hidden; out.clipped = clipped; out.fontMin = fontMin; out.tinyFonts = tiny;
  // tap targets: the explore buttons and the disclosure summaries
  var taps = [];
  Array.prototype.slice.call(host.querySelectorAll('.intcc-x-q, .intv4-more-sum')).forEach(function(b){
    var r = b.getBoundingClientRect(); if (r.height < 44) taps.push(Math.round(r.height));
  });
  out.tapSmall = taps;
  // the canonical score must appear exactly once
  // The canonical score must be VISIBLE exactly once: the restored pattern emits a
  // desktop hero and a mobile card, and CSS shows one of them.
  out.scoreCount = Array.prototype.slice.call(host.querySelectorAll('.intcc-health-badge')).filter(vis).length;
  out.badgeCount = out.scoreCount;
  out.radarPolygons = host.querySelectorAll('.intcc-radar-svg, .intcc-radar-area, .intcc-radar-axis').length;
  // the same percentage must not be splattered across the screen
  // Only what is actually VISIBLE counts: a collapsed answer popover is not
  // "the same percentage all over the screen". innerText is layout-aware, so it
  // already excludes hidden subtrees (a hand-rolled walker got this wrong).
  // innerText excludes display:none and visibility:hidden but NOT opacity:0, so a
  // CLOSED answer popover was being counted as "on screen". Measure on a clone
  // with every closed popover and closed disclosure stripped out.
  var clone = host.cloneNode(true);
  Array.prototype.slice.call(clone.querySelectorAll('.intcc-x-answer')).forEach(function(n){
    if (!n.classList.contains('is-open')) n.remove(); });
  Array.prototype.slice.call(clone.querySelectorAll('details')).forEach(function(n){
    if (!n.open) n.remove(); });
  // CHART value labels are excluded: the rule is "do not splatter the same
  // percentage across the screen as a repeated CLAIM". A composition radar can
  // legitimately have two asset classes at the same weight, and a bar chart can
  // have two positions at the same weight — those are data points, not claims.
  Array.prototype.slice.call(clone.querySelectorAll('.intcc-radar-val, .intcc-drv-pct')).forEach(function(n){ n.remove(); });
  document.body.appendChild(clone); clone.style.position = 'absolute'; clone.style.left = '-99999px';
  var pct = ((clone.innerText || '').match(/\\d+[.,]?\\d*\\s?%/g) || []).map(function(s){ return s.replace(/\\s/g,''); });
  clone.remove();
  var seen = {}, dup = [];
  pct.forEach(function(p){ seen[p] = (seen[p]||0)+1; });
  Object.keys(seen).forEach(function(p){ if (seen[p] > 2) dup.push(p + '×' + seen[p]); });
  out.percents = pct; out.dupPercents = dup;
  out.labelGeom = Array.prototype.slice.call(host.querySelectorAll('.intcc-x-label')).map(function(el){
    var cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { w: Math.round(r.width), sw: el.scrollWidth, cw: el.clientWidth, d: cs.display, ws: cs.whiteSpace, ov: cs.overflow };
  });
  var wowEl = host.querySelector('.intv4-wow-text');
  var headTexts = Array.prototype.slice.call(host.querySelectorAll('.intv4-story-head'))
    .map(function(e){ return (e.textContent||'').trim(); });
  out.wowText = wowEl ? (wowEl.textContent||'').trim() : null;
  out.wowRepeatsHead = !!(out.wowText && headTexts.some(function(h){
    var a = h.toLowerCase().replace(/[^a-z0-9]/g,''), b = out.wowText.toLowerCase().replace(/[^a-z0-9]/g,'');
    return a.indexOf(b) === 0 || b.indexOf(a) === 0; }));
  out.stories = host.querySelectorAll('.intv4-story').length;
  out.questions = host.querySelectorAll('.intcc-x-q').length;
  // leading conclusion must be the largest text in the Brief
  var head = host.querySelector('.intv4-story-head'), why = host.querySelector('.intv4-story-why');
  out.headFs = head ? parseFloat(getComputedStyle(head).fontSize) : null;
  out.whyFs  = why  ? parseFloat(getComputedStyle(why).fontSize)  : null;
  // Progressive disclosure must actually work: open every <details> and confirm
  // the supporting facts become visible and stay inside the layout.
  var det = Array.prototype.slice.call(host.querySelectorAll('details.intv4-more'));
  det.forEach(function(d){ d.open = true; });
  var supTotal = host.querySelectorAll('.intv4-sup').length;
  var supVisible = Array.prototype.slice.call(host.querySelectorAll('.intv4-sup')).filter(vis).length;
  out.disclosures = det.length; out.supTotal = supTotal; out.supVisible = supVisible;
  out.supOverflow = Array.prototype.slice.call(host.querySelectorAll('.intv4-sup'))
    .filter(function(el){ return el.scrollWidth - Math.round(el.getBoundingClientRect().width) > 1; }).length;
  det.forEach(function(d){ d.open = false; });
  // SPEC §9/§15 — dead space: how much of a card's height is unused by content.
  out.deadSpace = Array.prototype.slice.call(host.querySelectorAll('section.intcc-card')).map(function(sec){
    var kids = Array.prototype.slice.call(sec.children).filter(vis);
    if (!kids.length) return null;
    var last = kids[kids.length - 1].getBoundingClientRect().bottom;
    var box = sec.getBoundingClientRect();
    var cs = getComputedStyle(sec);
    var slack = Math.round(box.bottom - parseFloat(cs.paddingBottom) - last);
    return { k: (sec.className.match(/intcc-radar|intcc-drivers|intcc-explore|intcc-watch|intcc-timeline|intv5-structure|intv4-changed|intv4-discovery/)||['?'])[0], slack: slack };
  }).filter(Boolean);
  // SPEC §3 — hero optical alignment: the two eyebrow labels must start level.
  var hl = host.querySelector('.intcc-hero-health-label'), eb = host.querySelector('.intcc-hero-body .intcc-eyebrow');
  out.heroAlign = (hl && eb && vis(hl) && vis(eb))
    ? Math.round(Math.abs(hl.getBoundingClientRect().top - eb.getBoundingClientRect().top)) : null;
  out.radarAxes = host.querySelectorAll('.intcc-radar-axis').length;
  var compCard = host.querySelector('.intcc-radar');
  out.compState = compCard ? (compCard.getAttribute('data-state') || '?') : 'absent';
  // INT.07 — an axis value is EITHER a percentage OR the word "sin datos". Read the
  // raw text: coercing it to a number is exactly the lie the contract forbids.
  out.radarVals = Array.prototype.slice.call(host.querySelectorAll('.intcc-radar-val'))
    .map(function(e){ return (e.textContent||'').trim(); });
  out.radarMeasured = out.radarVals.filter(function(v){ return /^\\d+%$/.test(v); }).length;
  out.radarPending  = out.radarVals.filter(function(v){ return !/^\\d+%$/.test(v); });
  // SUPREME CLOSURE §5 — la atenuación se retira de la GEOMETRÍA y vive en el
  // TEXTO. Se mide donde ahora está (etiqueta y valor) y, además, que ninguna
  // radial conserve estado: «mismo grosor y terminaciones en todas las líneas».
  out.radarDimmed = host.querySelectorAll('.intcc-radar-label.is-unavailable').length;
  out.radarDimmedVals = host.querySelectorAll('.intcc-radar-val.is-unavailable').length;
  out.radarDimmedAxes = host.querySelectorAll('.intcc-radar-axis.is-unavailable').length;
  // LOS CINCO MARCADORES, MEDIDOS DE VERDAD. No se comprueba una clase: se lee el
  // estilo COMPUTADO de cada uno y se exige que los cinco coincidan en forma,
  // diámetro, relleno, borde, opacidad y brillo. Una clase puede desaparecer y el
  // hueco volver por otra vía; esto no.
  out.radarDotStyles = (function(){
    var seen = {}, n = 0;
    Array.prototype.forEach.call(host.querySelectorAll('.intcc-radar-dot'), function(d){
      var cs = getComputedStyle(d), b = d.getBoundingClientRect();
      var key = [cs.fill, cs.stroke, cs.strokeWidth, cs.opacity, cs.filter,
                 Math.round(b.width * 10), Math.round(b.height * 10)].join('|');
      seen[key] = (seen[key] || 0) + 1; n++;
    });
    return { total: n, distinct: Object.keys(seen).length,
             sample: Object.keys(seen)[0] || null };
  })();
  out.radarEdgeStyles = (function(){
    var seen = {}, n = 0;
    Array.prototype.forEach.call(host.querySelectorAll('.intcc-radar-edge'), function(e){
      var cs = getComputedStyle(e);
      var key = [cs.stroke, cs.strokeWidth, cs.strokeDasharray, cs.strokeLinecap,
                 cs.opacity, cs.filter].join('|');
      seen[key] = (seen[key] || 0) + 1; n++;
    });
    return { total: n, distinct: Object.keys(seen).length,
             dashed: Object.keys(seen).some(function(k){ return /\d/.test(k.split('|')[2] || ''); }) };
  })();
  out.radarA11y = (function(){ var svg = host.querySelector('.intcc-radar-svg');
    if (!svg) return null; var a = svg.getAttribute('aria-label') || '';
    return { axes: svg.getAttribute('data-svg-a11y-axes'),
             noData: (a.match(/sin datos|no data/gi) || []).length,
             len: a.length }; })();
  out.radarUnknownAvail = host.querySelectorAll('.intcc-radar-dot[data-availability="unknown"]').length;
  out.radarMeasuredAvail = host.querySelectorAll('.intcc-radar-dot[data-availability="measured"]').length;
  // Un eje certificado publica CIFRA (porcentaje o conteo); uno sin certificar
  // publica la palabra. Se cuentan por separado porque son claims distintos.
  out.radarFigures = out.radarVals.filter(function(v){
    return /^\\d+%$/.test(v) || /^\\d+(?:[.,]\\d+)?\\s*\\/\\s*\\d+$/.test(v); }).length;
  out.radarNoData = out.radarVals.filter(function(v){ return /sin datos|no data/i.test(v); }).length;
  out.radarDots   = host.querySelectorAll('.intcc-radar-dot').length;
  out.radarUnknownDots   = host.querySelectorAll('.intcc-radar-dot.is-unknown').length;
  out.radarUnknownSpokes = host.querySelectorAll('.intcc-radar-spoke.is-unknown').length;
  out.radarArea   = host.querySelectorAll('.intcc-radar-area').length;
  out.radarAreaPts = (function(){ var a = host.querySelector('.intcc-radar-area');
    if (!a) return 0; var p = (a.getAttribute('points')||'').trim();
    return p ? p.split(/\\s+/).length : 0; })();
  // SPEC ADVANCED INTELLIGENCE · §8 — la figura ABIERTA y sus dos márgenes.
  out.radarEdges = host.querySelectorAll('.intcc-radar-edge').length;
  out.radarOpen  = (function(){ var svg = host.querySelector('.intcc-radar-svg');
    return svg ? svg.getAttribute('data-svg-open') : null; })();
  out.radarRadii = (function(){
    var svg = host.querySelector('.intcc-radar-svg'); if (!svg) return null;
    var cx = 110, cy = 106, R = 76;
    var r = function(el){ return Math.hypot(+el.getAttribute('cx') - cx, +el.getAttribute('cy') - cy); };
    var filled = [].map.call(svg.querySelectorAll('.intcc-radar-dot[data-availability="measured"]'), r);
    var hollow = [].map.call(svg.querySelectorAll('.intcc-radar-dot[data-availability="unknown"]'), r);
    return { filled: filled, hollow: hollow, R: R,
      // ningún marcador en el centro ni en el vértice, y disponibilidad SIEMPRE
      // más lejos que cualquier valor certificado
      noneAtCentre: filled.concat(hollow).every(function(v){ return v > 4; }),
      noneAtVertex: filled.concat(hollow).every(function(v){ return v < R - 0.5; }),
      hollowOutside: !filled.length || !hollow.length
        || Math.min.apply(null, hollow) > Math.max.apply(null, filled) + 2 };
  })();
  // A HOLE detector: on the wide grid, the leftmost module of row 2 must start at
  // the container's content edge. A fail-closed module used to leave 1/3 of the
  // row blank, which is exactly what the founder photographed.
  (function(){
    // A HOLE detector anchored on the HERO, which spans the full grid width, so
    // its left edge IS the grid's content edge. The leftmost module of row 2 must
    // start there; a fail-closed module used to leave a third of the row blank,
    // which is exactly what the founder photographed.
    var hero = host.querySelector('.intcc-hero');
    var first = host.querySelector('.intcc-radar') || host.querySelector('.intcc-drivers');
    if (!hero || !first || !vis(hero) || innerWidth < 1024) { out.emptyGridGap = false; out.gapPx = 0; return; }
    var gap = Math.round(first.getBoundingClientRect().left - hero.getBoundingClientRect().left);
    out.gapPx = gap;
    out.emptyGridGap = Math.abs(gap) > 4;
  })();
  out.radarLabels = Array.prototype.slice.call(host.querySelectorAll('.intcc-radar-label')).map(function(e){ return (e.textContent||'').trim(); });
  // ROW SYMMETRY: bottom edges of the cards in each desktop row must coincide.
  out.rowSymmetry = [];
  if (innerWidth >= 1024) {
    var ROWS = ${JSON.stringify(DESKTOP_ROWS)};
    ROWS.forEach(function(row){
      var boxes = row.map(function(cls){ var el = host.querySelector('.' + cls);
        return (el && vis(el)) ? el.getBoundingClientRect() : null; }).filter(Boolean);
      if (boxes.length < 2) return;
      var tops = boxes.map(function(b){ return Math.round(b.top); });
      var bots = boxes.map(function(b){ return Math.round(b.bottom); });
      out.rowSymmetry.push({ row: row.join('|'),
        topSpread: Math.max.apply(null, tops) - Math.min.apply(null, tops),
        botSpread: Math.max.apply(null, bots) - Math.min.apply(null, bots) });
    });
  }
  var bodyBg = getComputedStyle(document.body).backgroundColor;
  out.bodyBg = bodyBg;
  return out;
})()`;

let fails = 0; const rows = [];
function check(vp, name, cond, info) {
  if (cond) console.log(`   ✓ ${name}`);
  else { fails++; console.log(`   ✗ ${name}${info ? '  [' + info + ']' : ''}`); }
}

console.log('AURIX INTELLIGENCE INT.04 · VISUAL QA — URL PÚBLICA ' + PUBLIC + '\n');
for (const vp of VIEWPORTS) {
  await S('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height,
    deviceScaleFactor: vp.dsf, mobile: vp.mobile });
  await S('Page.navigate', { url: PUBLIC });
  // WAIT for the real stylesheet: measuring before it lands yields unstyled
  // defaults (the first run reported css=false and bogus font/tap numbers).
  let cssReady = false;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    const r = await ev(`(function(){ try { return !!Array.prototype.slice.call(document.styleSheets)
      .find(function(s){ try { return /styles\\.css/.test(s.href||'') && s.cssRules && s.cssRules.length > 50; } catch(e){ return false; } }); } catch(e){ return false; } })()`);
    if (r === true) { cssReady = true; break; }
  }
  if (!cssReady) { fails++; console.log('   ✗ styles.css never loaded — measurements would be meaningless'); }
  await sleep(600);
  // Inject the REAL deployed markup into the REAL deployed page.
  const inj = await ev(`(function(){
    document.querySelectorAll('#__int04qa').forEach(function(n){ n.remove(); });
    // Tear down the boot splash / overlays: otherwise the surface has layout but
    // is never painted, and every geometry check silently measures nothing.
    ['#splash','#aurix-splash','.aurix-splash','#boot','.boot-splash','#loadingScreen','.splash']
      .forEach(function(sel){ document.querySelectorAll(sel).forEach(function(n){ n.remove(); }); });
    Array.prototype.slice.call(document.body.children).forEach(function(n){
      if (n.id !== '__int04qa') { try { n.style.display = 'none'; } catch(e){} }
    });
    var host = document.createElement('div');
    host.id = '__int04qa';
    host.style.cssText = 'position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;z-index:2147483647;'
      + 'padding:16px;background:#0b1020;color:#e8eefc;'
      + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    host.innerHTML = ${JSON.stringify(HTML.es)};
    document.body.appendChild(host);
    // The surface starts at opacity 0 (.aurix-intcc > * reveal-on-mount stagger)
    // and the app adds .is-revealed after mounting. Do the same, or every element
    // is legitimately invisible and every geometry check measures nothing.
    var wrap = host.querySelector('.aurix-intcc');
    if (wrap) wrap.classList.add('is-revealed');
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    var css = Array.prototype.slice.call(document.styleSheets)
      .find(function(s){ try { return /styles\\.css/.test(s.href || ''); } catch(e) { return false; } });
    return { ok: true, textLen: (host.innerText || '').length,
      visible: (typeof host.checkVisibility === 'function') ? host.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
      cssLoaded: !!css };
  })()`);
  if (!inj || inj.__err) { fails++; console.log('   ✗ injection failed', JSON.stringify(inj)); continue; }
  // NON-VACUITY: if the surface is not really painted, every check below would
  // pass by measuring nothing. Refuse to report a green run in that case.
  if (inj.visible === false) { fails++; console.log('   ✗ the surface is not actually visible — measurements would be vacuous'); continue; }
  if (!(inj.textLen > 400)) { fails++; console.log(`   ✗ the surface rendered almost no text (len=${inj.textLen}) — measurements would be vacuous`); continue; }
  const m = await ev(MEASURE);
  console.log(`── ${vp.name.toUpperCase()} ${vp.width}×${vp.height} @${vp.dsf}x  (css=${inj && inj.cssLoaded})`);
  if (!m || m.error || m.__err) { fails++; console.log('   ✗ measurement failed', JSON.stringify(m)); continue; }
  check(vp, 'no horizontal overflow', m.docOverflowX === 0, 'overflowX=' + m.docOverflowX);
  check(vp, 'no section overflows its width', m.sectionOverflow === 0, JSON.stringify(m.overflowWho));
  check(vp, 'no fact-bearing element is invisible', m.hiddenFacts.length === 0, JSON.stringify(m.hiddenFacts));
  check(vp, 'no text clipped without ellipsis', m.clipped.length === 0, JSON.stringify(m.clipped.slice(0, 4)));
  check(vp, 'the canonical score appears exactly once', m.scoreCount === 1 && m.badgeCount === 1,
    'val=' + m.scoreCount + ' badge=' + m.badgeCount);
  // FOUNDER CONTRACT (INT.07): the pentagon is the conceptual STRUCTURE and always
  // renders with its five semantic axes; a value exists only where Aurix can
  // certify it, and "no data" is never drawn as 0.
  check(vp, 'the pentagon renders with its five fixed semantic axes',
    m.compState === 'radar' && m.radarAxes === 5 && m.radarLabels.length === 5,
    'state=' + m.compState + ' axes=' + m.radarAxes + ' ' + JSON.stringify(m.radarLabels));
  // El primer eje dejó de llamarse «Diversificación» por corrección del founder:
  // ese nombre afirmaba un conocimiento económico que Aurix no posee. Publica
  // AMPLITUD DE CATEGORÍAS REGISTRADAS, y su valor es un CONTEO con su taxonomía.
  check(vp, 'the five axes are the semantic dimensions, not asset classes',
    JSON.stringify(m.radarLabels) === JSON.stringify(
      ['Amplitud de categorías','Estabilidad','Liquidez','Crecimiento','Concentración']),
    JSON.stringify(m.radarLabels));
  // Un eje certificado lleva CIFRA: un porcentaje o un conteo («1,3 / 7»). Sólo
  // los no certificados dicen «sin datos», y son exactamente los atenuados.
  // SUPREME CLOSURE §5 — la limitación se declara en el TEXTO, no en la figura.
  check(vp, 'the uncertified axes say "sin datos", attenuated IN THEIR LABEL',
    m.radarVals.length === 5 && m.radarFigures === 3
    && m.radarNoData === 2 && m.radarDimmed === 2 && m.radarDimmedVals === 2
    && m.radarDimmedAxes === 0,
    JSON.stringify({ vals: m.radarVals, figures: m.radarFigures,
      labels: m.radarDimmed, vals2: m.radarDimmedVals, axes: m.radarDimmedAxes }));
  check(vp, 'the five axes are enumerated in the accessible description',
    !!m.radarA11y && m.radarA11y.axes === '5' && m.radarA11y.noData === 2 && m.radarA11y.len > 40,
    JSON.stringify(m.radarA11y));
  // ── RE-DECIDIDO · SPEC ADVANCED INTELLIGENCE · §8 ─────────────────────────
  // Esta comprobación exigía `radarArea === 1 && radarAreaPts === 3`, es decir un
  // POLÍGONO CERRADO sobre los tres ejes medidos. Con `stability` y `growth` sin
  // certificar —y están intercalados— los lados de esa figura ATRAVIESAN los ejes
  // desconocidos, que es lo que §8 prohíbe por su nombre. Fosilizaba una limitación
  // como contrato; se sustituye por los invariantes que §8 sí pide.
  // ── SUPREME CLOSURE §5 · LA FIGURA ES UNIFORME, MEDIDA EN PÍXELES ────────
  // §8/§11 metieron el estado dentro de la figura (marcador hueco, tramo
  // neutral) y este probe lo fosilizó exigiendo `hollow === 2`. La QA del
  // founder sobre la pantalla real leyó ese hueco como un defecto de pintado, y
  // el §5 retira las dos señales gráficas. Lo que NO se retira —y es lo que este
  // probe ahora mide— es el invariante financiero: sin los cinco certificados no
  // hay ÁREA, la figura se declara abierta y sólo puntúan los medidos.
  check(vp, 'five markers, five segments, zero area (unknown never a value)',
    m.radarArea === 0 && m.radarDots === 5 && m.radarEdges === 5
    && m.radarOpen === '1'
    && m.radarUnknownAvail === 2 && m.radarMeasuredAvail === 3,
    JSON.stringify({ area: m.radarArea, open: m.radarOpen, edges: m.radarEdges,
      dots: m.radarDots, unknown: m.radarUnknownAvail, measured: m.radarMeasuredAvail }));
  check(vp, 'the five markers are pixel-identical (shape, size, fill, border, opacity, glow)',
    !!m.radarDotStyles && m.radarDotStyles.total === 5 && m.radarDotStyles.distinct === 1
    && !/none/.test(String(m.radarDotStyles.sample || '').split('|')[0]),
    JSON.stringify(m.radarDotStyles));
  check(vp, 'the five segments are pixel-identical, and none is dashed',
    !!m.radarEdgeStyles && m.radarEdgeStyles.total === 5
    && m.radarEdgeStyles.distinct === 1 && m.radarEdgeStyles.dashed === false,
    JSON.stringify(m.radarEdgeStyles));
  check(vp, 'no marker sits at the centre or on the outer vertex (uniform graphic margin)',
    !!m.radarRadii && m.radarRadii.noneAtCentre === true && m.radarRadii.noneAtVertex === true,
    JSON.stringify(m.radarRadii));
  // §11 ya había bajado el marcador desconocido al límite INTERIOR de referencia
  // (pegado al marco se leía como «máximo»), así que «fuera de la banda» dejó de
  // ser el contrato. Lo que se mide ahora es lo que el §5 autoriza: una posición
  // interior NEUTRAL, DETERMINISTA y compartida por todos los desconocidos, que
  // sólo existe para cerrar la figura.
  check(vp, 'the unknown marker sits at the shared, deterministic interior reference',
    !!m.radarRadii && m.radarRadii.hollow.length === 2
    && Math.abs(m.radarRadii.hollow[0] - m.radarRadii.hollow[1]) < 0.5
    && m.radarRadii.hollow.every(function(v){ return v < Math.max.apply(null, m.radarRadii.filled) + 0.5; }),
    JSON.stringify(m.radarRadii && { filled: m.radarRadii.filled, hollow: m.radarRadii.hollow }));
  check(vp, 'no reserved column is left empty where a module fail-closed',
    m.emptyGridGap === false, 'gapPx=' + m.gapPx);
  if (!vp.mobile || vp.name === 'tablet') {
    // the hero is only rendered on tablet/desktop (phones use the two cards)
    check(vp, 'hero eyebrows are optically aligned (<=2px)', m.heroAlign !== null && m.heroAlign <= 2, 'delta=' + m.heroAlign + 'px');
  }
  if (!vp.mobile) {
    check(vp, 'every desktop row shares one bottom baseline (no broken mosaic)',
      m.rowSymmetry.length >= 2 && m.rowSymmetry.every(function(r){ return r.botSpread <= 2 && r.topSpread <= 2; }),
      JSON.stringify(m.rowSymmetry));
  }
  check(vp, 'no card wastes more than 120px of dead space',
    m.deadSpace.every(function(d){ return d.slack <= 120; }),
    JSON.stringify(m.deadSpace.filter(function(d){ return d.slack > 120; })));
  check(vp, 'no percentage repeated more than twice', m.dupPercents.length === 0, JSON.stringify(m.dupPercents));
  check(vp, 'the leading conclusion is larger than its explanation',
    m.headFs != null && m.whyFs != null && m.headFs > m.whyFs, m.headFs + ' vs ' + m.whyFs);
  // CARDS CONDICIONALES POR CONTRATO. La de pregunta no se pinta sin pregunta, y
  // el comparador se publicó APAGADO POR DEFECTO, así que su ausencia es el
  // estado correcto de todos los usuarios. Lo que esta comprobación mide es el
  // ORDEN RELATIVO de lo que sí está: exigir la presencia de una card opcional
  // convertía el estado correcto en un rojo permanente en la propia herramienta
  // de QA del founder — un gate fosilizando como contrato una condición que no
  // lo es, otra vez.
  const OPTIONAL_CARDS = ['intv12-qcard', 'intv14-cmp'];
  const expectedHere = EXPECTED_ORDER[vp.name].filter(function(k){
    return OPTIONAL_CARDS.indexOf(k) === -1 || (m.order || []).indexOf(k) !== -1;
  });
  check(vp, 'cockpit hierarchy: ' + expectedHere.join(' → '),
    JSON.stringify(m.order) === JSON.stringify(expectedHere),
    JSON.stringify(m.order));
  check(vp, 'no font below 11px', m.tinyFonts.length === 0, JSON.stringify(m.tinyFonts));
  if (vp.mobile) check(vp, 'tap targets ≥ 44px', m.tapSmall.length === 0, JSON.stringify(m.tapSmall));
  check(vp, 'the percentage check is non-vacuous (real figures on screen)', m.percents.length >= 3,
    'n=' + m.percents.length);
  check(vp, 'the discovery does not repeat a Brief conclusion', m.wowRepeatsHead === false,
    JSON.stringify(m.wowText));
  // «Hechos que lo sostienen» y todo desplegable salieron de la superficie: el
  // hecho certificado lo publica «Qué ha cambiado» con su cifra y esta card
  // explica el significado. Lo que se mide ahora es la AUSENCIA del disclosure y
  // que no quede ningún apoyo invisible tras él.
  check(vp, 'no disclosure left in the surface, and no fact hidden behind one',
    m.disclosures === 0 && m.supTotal === 0,
    `det=${m.disclosures} sup=${m.supVisible}/${m.supTotal}`);
  console.log(`   · stories=${m.stories} questions=${m.questions} fontMin=${m.fontMin}px textLen=${inj.textLen} percents=${JSON.stringify(m.percents)}`);
  rows.push({ vp: vp.name, ...m });
  const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, `int04-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`   · captura → docs/int04-visual-qa/int04-${vp.name}.png`);
}

// Cross-viewport: the financial MEANING must be identical everywhere.
console.log('\n── CROSS-VIEWPORT');
const sig = r => JSON.stringify({ stories: r.stories, questions: r.questions, percents: r.percents.slice().sort() });
const same = rows.length === 3 && sig(rows[0]) === sig(rows[1]) && sig(rows[1]) === sig(rows[2]);
if (same) console.log('   ✓ los tres viewports publican los mismos hechos y las mismas cifras');
else { fails++; console.log('   ✗ divergencia de significado entre viewports', JSON.stringify(rows.map(sig))); }

writeFileSync(join(OUT, 'measurements.json'), JSON.stringify({ url: PUBLIC, at: new Date().toISOString(), rows }, null, 2));
console.log('\n' + (fails ? '✗ FAIL' : '✓ PASS') + `  ${fails} problema(s)`);
try { chrome.kill(); } catch (_) {}
try { ws.close(); } catch (_) {}
try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
process.exit(fails ? 1 : 0);
