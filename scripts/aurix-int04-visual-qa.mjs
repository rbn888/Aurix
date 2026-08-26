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
    'intcc_read_attention','intcc_read_concentrated','intcc_read_growing','intcc_read_healthy',
    'intcc_read_balanced','intcc_sub_attention','intcc_sub_concentrated','intcc_sub_growing',
    'intcc_sub_healthy','intcc_sub_balanced',
    // INT.07 — the semantic pentagon's labels and its "no data" state live outside
    // the intv4/intv5 slice, so they must come in as extras or an axis renders blank.
    'intcc_dim_div','intcc_dim_liq','intcc_dim_conc','intcc_dim_stab','intcc_dim_growth',
    'intv7_axis_unavailable','intv7_radar_legend','intv7_radar_pending']
    .map(k => { const i = keyOcc(k)[langIdx]; return i == null ? null : app.slice(i, app.indexOf('\n', i)).trim().replace(/,$/, ''); })
    .filter(Boolean).join(',\n');
  return new Function('return ({' + app.slice(start, end).replace(/,\s*$/, '') + ',\n' + extras + '})')();
}
const DICT = { es: dict(0), en: dict(1) };

const DAY = 864e5, HOUR = 36e5, T0 = 1750000000000, NOW = Date.now();
const CONSTS = ['_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_SOURCE_ROW_CAP',
  '_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR','_AURIX_CAPITAL_FLOWS_KEY',
  '_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD','_AURIX_WN12_MIN_SPAN_RETENTION',
  '_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS','_AURIX_RETURN_COMPARABLE_RATIO',
  '_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS','_AURIX_FACT_STATUS',
  '_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL','_AURIX_RANK_WEIGHTS',
  '_AURIX_NOVELTY_WINDOW_MS','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_INTV7_RADAR_DIMS','TYPE_META','_AURIX_QUESTION_CATALOG','_INTV4_DEPTH',
  '_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX','_INTV4_SHOWN_KEY'];
const FNS = ['toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
  'activeAssets','isInvestableAsset','investableAssets','investableValueUSD','liquidityNominal','assetNativeValue',
  'assetValueUSD','_aurixPointValuationIncomplete','_aurixFlowIsInternal','_aurixLoadCapitalFlows',
  '_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixInvestablePerformance',
  '_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow',
  '_aurixCatExposureDelta','_aurixFactClamp01','_aurixEffectiveDiversification','_aurixFactLedger',
  '_aurixIntelligenceStories','_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged',
  '_aurixIntelligenceCore','_aurixHealthScore','_intccScoreTone','_intccHealthScore','_intccClamp','_intccEsc',
  '_intccDate','_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4WindowLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml','_intv4ChangedHtml',
  '_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml','_intv4MemoryHtml','_intv4QualityHtml',
  '_intv4ReadShown','_intv4RecordShown',
  // INT.05 — restored cockpit modules and the legacy components they reuse.
  '_intccScoreRingHtml','_intccIsMonetary','_intTop3Investable','buildPortfolioDrivers',
  
  '_intv5Reading','_intv5Chips','_intv5StructureHtml','_intv5DriversHtml','_intv5MattersHtml','_intv7RadarAxes','_intv7RadarHtml','_intccRadarSvg','getInvestableDistribution','_aurixDisplayCategory',
  '_renderIntelligenceCommandCenter'];

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
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  vm.runInContext("__store[_AURIX_CAPITAL_FLOWS_KEY] = " + JSON.stringify(JSON.stringify(
    [{ id:'d1', ts:T0+1.5*DAY, amountUSD:400, kind:'deposit' }])), sb);
  return vm.runInContext('_renderIntelligenceCommandCenter()', sb);
}
const HTML = { es: buildHtml('es'), en: buildHtml('en') };
mkdirSync(OUT, { recursive: true });

// ── 2 · Chrome + CDP ────────────────────────────────────────────────────────
const PORT = 9820 + (process.pid % 120);
const profile = mkdtempSync(join(tmpdir(), 'aurix-int04-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
async function wsUrl(){ for(let i=0;i<80;i++){ try{ const j=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if(j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }catch(_){} await sleep(250);} throw new Error('no devtools'); }
function mkClient(ws){ let id=0; const pend=new Map();
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id); m.error?rej(new Error(m.error.message)):res(m.result);} });
  return { send:(a,b={},s)=>Promise.race([ new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method:a,params:b,...(s?{sessionId:s}:{})})); }), sleep(30000).then(()=>{throw new Error('cdp timeout: '+a);}) ]) }; }
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
const EXPECTED_ORDER = {
  mobile:  ['intcc-m-hero','intcc-m-health','intcc-radar','intcc-drivers','intcc-explore','intcc-watch','intcc-timeline','intv5-structure','intv4-changed','intv4-discovery'],
  tablet:  ['intcc-hero','intcc-radar','intcc-drivers','intcc-explore','intcc-watch','intcc-timeline','intv5-structure','intv4-changed','intv4-discovery'],
  desktop: ['intcc-hero','intcc-radar','intcc-drivers','intcc-explore','intcc-watch','intcc-timeline','intv5-structure','intv4-changed','intv4-discovery'],
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
    .map(function(s){ return { k: (s.className.match(/intcc-m-hero|intcc-m-health|intcc-hero|intcc-radar|intcc-drivers|intcc-explore|intcc-watch|intcc-timeline|intv5-structure|intv4-changed|intv4-discovery/) || ['?'])[0],
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
  out.radarDimmed = host.querySelectorAll('.intcc-radar-axis.is-unavailable').length;
  out.radarDots   = host.querySelectorAll('.intcc-radar-dot').length;
  out.radarArea   = host.querySelectorAll('.intcc-radar-area').length;
  out.radarAreaPts = (function(){ var a = host.querySelector('.intcc-radar-area');
    if (!a) return 0; var p = (a.getAttribute('points')||'').trim();
    return p ? p.split(/\\s+/).length : 0; })();
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
  check(vp, 'the five axes are the semantic dimensions, not asset classes',
    JSON.stringify(m.radarLabels) === JSON.stringify(
      ['Diversificación','Estabilidad','Liquidez','Crecimiento','Concentración']),
    JSON.stringify(m.radarLabels));
  check(vp, 'the uncertified axes say "sin datos" and are visibly attenuated',
    m.radarVals.length === 5 && m.radarMeasured === 3
    && m.radarPending.length === 2 && m.radarPending.every(function(v){ return v === 'sin datos'; })
    && m.radarDimmed === 2,
    JSON.stringify({ vals: m.radarVals, dimmed: m.radarDimmed }));
  check(vp, 'no uncertified axis is drawn as a value (polygon joins only certified ones)',
    m.radarArea === 1 && m.radarAreaPts === 3 && m.radarDots === 3,
    JSON.stringify({ area: m.radarArea, pts: m.radarAreaPts, dots: m.radarDots }));
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
  check(vp, 'cockpit hierarchy: ' + EXPECTED_ORDER[vp.name].join(' → '),
    JSON.stringify(m.order) === JSON.stringify(EXPECTED_ORDER[vp.name]),
    JSON.stringify(m.order));
  check(vp, 'no font below 11px', m.tinyFonts.length === 0, JSON.stringify(m.tinyFonts));
  if (vp.mobile) check(vp, 'tap targets ≥ 44px', m.tapSmall.length === 0, JSON.stringify(m.tapSmall));
  check(vp, 'the percentage check is non-vacuous (real figures on screen)', m.percents.length >= 3,
    'n=' + m.percents.length);
  check(vp, 'the discovery does not repeat a Brief conclusion', m.wowRepeatsHead === false,
    JSON.stringify(m.wowText));
  check(vp, 'supporting facts are hidden until opened, then all become visible',
    m.disclosures > 0 && m.supTotal > 0 && m.supVisible === m.supTotal && m.supOverflow === 0,
    `det=${m.disclosures} sup=${m.supVisible}/${m.supTotal} overflow=${m.supOverflow}`);
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
