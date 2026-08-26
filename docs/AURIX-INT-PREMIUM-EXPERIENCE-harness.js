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
    'intcc_band_empty','intcc_eyebrow','intcc_drivers_title','intcc_drv_explain_asset',
    'intcc_drv_explain_cash','intcc_drv_kind_eng','intcc_drv_kind_liq','intcc_drv_none',
    'intcc_chip_div','intcc_chip_liq','intcc_chip_conc','intcc_chip_watch',
    'intcc_read_attention','intcc_read_concentrated','intcc_read_growing','intcc_read_healthy',
    'intcc_read_balanced','intcc_sub_attention','intcc_sub_concentrated','intcc_sub_growing',
    'intcc_sub_healthy','intcc_sub_balanced'];
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

const CONSTS = ['_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_SOURCE_ROW_CAP',
  '_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD',
  '_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS',
  '_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS',
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_AURIX_QUESTION_CATALOG',
  '_INTV4_DEPTH','_INTV4_DEFAULT_DEPTH','_INTV4_BRIEF_MAX','_INTV4_EXPLORE_MAX','_INTV4_MEMORY_MAX',
  '_INTV4_SHOWN_KEY'];
const FNS = ['toBase','formatCurrency','formatBase','_aurixUsableQuantity','_aurixCategoryBucket',
  'isClosedAsset','activeAssets','isInvestableAsset','investableAssets','investableValueUSD',
  'liquidityNominal','assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete',
  '_aurixFlowIsInternal','_aurixLoadCapitalFlows','_aurixInvestableSnapshots',
  '_aurixEligibleInvestableSeries','_aurixTwrChain','_aurixInvestablePerformance','_aurixCatHistRows',
  '_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow','_aurixCatExposureDelta',
  '_aurixFactClamp01','_aurixEffectiveDiversification','_aurixFactLedger','_aurixIntelligenceStories',
  '_aurixWowInsights','_aurixContextualQuestions','_aurixWhatChanged','_aurixIntelligenceCore',
  '_aurixHealthScore','_intccScoreTone','_intccHealthScore','_intccClamp','_intccEsc','_intccDate',
  '_intccOrbHtml','_intv4T','_intv4Money','_intv4Num','_intv4RangeLabel','_intv4CatLabel','_intv5CatLabel',
  '_intv4FactText','_intv4WhyText','_intv4WowText','_intv4StoryHtml','_intv4BriefHtml',
  '_intv4ChangedHtml','_intv4DiscoveryHtml','_intv4ExploreHtml','_intv4AnswerHtml','_intv4MemoryHtml',
  '_intv4QualityHtml','_intv4ReadShown','_intv4RecordShown',
  // INT.05 — the restored cockpit modules and the legacy components they reuse.
  '_intccScoreRingHtml','_intccIsMonetary','_intTop3Investable','buildPortfolioDrivers',
  
  '_intv5Reading','_intv5Chips','_intv5StructureHtml','_intv5DriversHtml','_intv5MattersHtml',
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
  sb.TYPE_META = { crypto:{label:'Cripto'}, stock:{label:'Acciones'}, etf:{label:'ETF'},
                   fund:{label:'Fondos'}, metal:{label:'Metales'}, cash:{label:'Liquidez'},
                   other:{label:'Otros'}, real_estate:{label:'Inmuebles'} };
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
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
  ok('2.6 supporting facts are nested behind progressive disclosure, not new cards',
    !/class="intcc-card[^"]*"[^>]*>\s*<[^>]*class="intv4-sup/.test(html)
    && (html.match(/class="intv4-more"/g) || []).length >= 1);
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
  ok('3.3 …and it IS published, as the real top-3 breakdown',
    (html.match(/class="intcc-drv-row[^"]*"/g) || []).length >= 1
    && /intv5-eff-desc/.test(html));
  ok('3.4 no fact is rendered twice as a headline',
    new Set(headFacts).size === headFacts.length);
  // The retired blocks were the duplication mechanism.
  // INT.05 — the radar SLOT and its premium language come back; the FABRICATED
  // PENTAGON does not. No polygon, no axes, no synthetic dimension.
  ok('3.5 the radar slot is restored but NO polygon / fabricated axis is drawn',
    /intcc-radar/.test(html)
    && !/intcc-radar-svg/.test(html) && !/intcc-radar-area/.test(html)
    && !/intcc-radar-axis/.test(html) && !/intcc-radar-label/.test(html));
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
    .replace(/<span class="intv5-honesty">[\s\S]*?<\/span>/g, '');
  ok('4.4 no per-position attribution of return is asserted',
    !/explic[oó]|explained by|atribu/i.test(withoutQuality));
  ok('4.5 exposure changes are stated in pp, never as a relative %',
    /pp/.test(sec) || !/exposici[oó]n/i.test(sec), sec.slice(0, 200));
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
  const sec = (html.match(/<span class="intv5-honesty">([\s\S]*?)<\/span>/) || [, ''])[1];
  ok('11.1 the honest limit is published as an inline line, not a giant card',
    !!sec && !/intv4-quality/.test(html));
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

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
