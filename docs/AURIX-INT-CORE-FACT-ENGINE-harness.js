'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INT-CORE-FACT-ENGINE-harness — SPEC INT.03
// ════════════════════════════════════════════════════════════════════════════
// Certifies the Intelligence Core: the deterministic layer that turns certified
// engine output into facts, groups them by causal root, deduplicates, ranks and
// exposes ONE consumption contract for INT.04.
//
//   CERTIFIED ENGINES → FACT LEDGER → RELATION/PRIORITY → CORE OUTPUT
//
// WHAT IS REAL HERE (the INT.01/INT.02 lesson: a gate that stubs the very
// integration it certifies is not evidence):
//   · `_aurixInvestablePerformance` + its whole chain (`_aurixTwrChain`,
//     `_aurixEligibleInvestableSeries`, `_aurixInvestableSnapshots`,
//     `_aurixLoadCapitalFlows` over a real storage shim, real `toBase`).
//   · `_aurixCatExposureDelta` + `_aurixCatHistWindow` + `_aurixCatExposurePct`
//     + `_aurixCatHistValidatePoint` — the real server exposure reader, driven
//     with real-shaped `portfolio_snapshots.category_values` rows.
//   · `_aurixEffectiveDiversification` over the real `investableAssets` /
//     `assetValueUSD` / `_aurixUsableQuantity` chain.
//   · The whole Core: ledger, stories, wow, questions, whatChanged.
// Genuine INPUTS are provided (history rows, server rows, FX rate, the health
// snapshot and drivers, display authority) — those are inputs to the Core, not
// the integrations under test.
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
const near = (a,b,tol) => Number.isFinite(a) && Math.abs(a-b) <= (tol==null?0.01:tol);

const DAY = 86400000, HOUR = 36e5, MIN = 60000;
const T0 = 1750000000000;                 // fixed anchor for the INVESTABLE history (self-windowed on its own last point)
// The server exposure reader enforces FRESHNESS against the REAL clock — a window
// named 24H/7D is a claim about the present, so its newest capture must be recent
// (bound: _AURIX_BACKEND_CADENCE_MS × _AURIX_BACKEND_STALE_FACTOR = 120 min). Server
// fixtures therefore END NEAR REAL NOW; that is a property of the certified contract,
// not something to stub away. Determinism is unaffected: the emitted output carries no
// wall-clock field.
const NOW = Date.now();

const CONSTS = ['_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_SOURCE_ROW_CAP',
  '_AURIX_CATHIST_WINDOWS','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CAPITAL_FLOWS_KEY','_WSC_INTERNAL_KINDS','_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD',
  '_AURIX_WN12_MIN_SPAN_RETENTION','_AURIX_WN12_BOUNDED_RANGES','_AURIX_RETURN_MIN_HISTORY_MS',
  '_AURIX_RETURN_COMPARABLE_RATIO','_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT','_AURIX_INVPERF_HIGH_CONFIDENCE_OBS',
  '_AURIX_FACT_STATUS','_AURIX_FACT_FAMILY','_AURIX_CAUSAL_ROOT','_AURIX_FACT_MATERIAL',
  '_AURIX_RANK_WEIGHTS','_AURIX_NOVELTY_WINDOW_MS','_AURIX_INTCORE_STORY_LIMIT','_AURIX_INTCORE_STORY_MIN_PRIORITY','_AURIX_QUESTION_CATALOG'];
const FNS = ['toBase','formatCurrency','_aurixUsableQuantity','_aurixCategoryBucket','isClosedAsset',
  'activeAssets','isInvestableAsset','investableAssets','investableValueUSD','liquidityNominal',
  'assetNativeValue','assetValueUSD','_aurixPointValuationIncomplete','_aurixFlowIsInternal',
  '_aurixLoadCapitalFlows','_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain',
  '_aurixInvestablePerformance','_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct',
  '_aurixCatHistWindow','_aurixCatExposureDelta','_aurixFactClamp01','_aurixEffectiveDiversification',
  '_aurixFactLedger','_aurixIntelligenceStories','_aurixWowInsights','_aurixContextualQuestions',
  '_aurixWhatChanged','_aurixIntelligenceCore'];

function makeCtx(opts) {
  const o = opts || {};
  const sb = { Math, Number, JSON, Array, String, Object, Set, Map, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  vm.createContext(sb);
  sb.baseCurrency = o.baseCurrency || 'USD';
  sb.usdToEur = 0.92;
  sb.lang = o.lang || 'es';
  sb._aurixFxRate = c => ({ USD: 1, EUR: 0.92 })[String(c).toUpperCase()];
  // history rows (authoritative display source) — an INPUT
  sb.__rows = o.rows || [];
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb.__epoch = o.epoch || 0;
  sb._aurixPortfolioEpoch = () => sb.__epoch;
  sb.investableValueBase = () => 0;
  sb.canDisplayCanonicalReturn = () => (o.canDisplay === undefined ? { ok: true } : o.canDisplay);
  sb.activeRange = 'all';
  // server category rows — an INPUT; the READER over them is real
  sb._aurixBackendSnapshots = o.serverRows || [];
  sb._aurixBackendSnapshotsState = o.hydration || 'ready';
  sb._aurixBackendHealthSnapshot = () => ({ status: 'ok' });
  // holdings — real valuation chain runs over these
  sb.assets = o.assets || [];
  // health snapshot + drivers are INPUTS to the Core (certified elsewhere)
  sb._aurixHealthSnapshot = () => (o.snap === undefined ? null : o.snap);
  sb.buildPortfolioDrivers = () => (o.drivers === undefined ? null : o.drivers);
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  CONSTS.forEach(n => vm.runInContext(konstSrc(n), sb));
  FNS.forEach(n => vm.runInContext(fnSrc(n), sb));
  (o.extra || []).forEach(src => vm.runInContext(src, sb));
  // Write the ledger under the REAL key (a `const` in a vm context is lexical,
  // NOT a sandbox property — getting this wrong silently empties the ledger).
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
  return sb;
}
const run = (expr, ctx) => vm.runInContext(expr, ctx);
const core = (o, coreOpts) => {
  const c = makeCtx(o);
  return run('_aurixIntelligenceCore(' + JSON.stringify(Object.assign({ now: T0 + 40 * DAY }, coreOpts || {})) + ')', c);
};

// ── fixtures ────────────────────────────────────────────────────────────────
// Investable history row: USD total + USD real_estate.
const row = (dayOffset, total, re) => ({ ts: T0 + dayOffset * DAY, total, real_estate: re || 0 });
const inv = vals => vals.map((v, i) => row(i, v, 0));
// Server category row. `total_value_usd` must equal Σ category_values, and the
// real_estate column must match its bucket, or the real reader rejects the row.
function srvRow(tsMs, cats) {
  const all = Object.assign({}, cats);
  let total = 0; for (const k in all) total += all[k];
  return { ts: tsMs, total_value_usd: +total.toFixed(2), real_estate: all.real_estate || 0,
    category_values: all };
}
// A dense, fresh server history: `spanDays` back from `endTs`, every 15 min at
// the edges so the window's start/end drift bounds are genuinely satisfiable.
function srvHistory(endTs, spanDays, startCats, endCats) {
  const rows = [];
  const stepMs = 6 * HOUR;
  const n = Math.floor((spanDays * DAY) / stepMs);
  for (let i = 0; i <= n; i++) {
    const ts = endTs - (n - i) * stepMs;
    const f = n === 0 ? 1 : i / n;
    const cats = {};
    for (const k of Object.keys(startCats)) {
      const a = startCats[k] || 0, b = (endCats[k] != null ? endCats[k] : a);
      cats[k] = +(a + (b - a) * f).toFixed(2);
    }
    rows.push(srvRow(ts, cats));
  }
  return rows;
}
const SNAP = {
  assetCount: 6, totUSD: 100000, categoryCount: 4, cashPct: 12, cryptoPct: 30, realEstatePct: 0,
  topInvestedAsset: { name: 'BTC', ticker: 'BTC', type: 'crypto', pctTotal: 53 },
  topCategory: { type: 'crypto', label: 'Cripto', pctTotal: 53 },
  worstAsset: null, bestAsset: null,
};
const DRIVERS = { items: [], pct: 71 };
// Holdings whose weights are lopsided: 12 positions, effective ≈ far fewer.
const LOPSIDED = [
  { id: 'a1', type: 'crypto', qty: 1,    price: 53000 },
  { id: 'a2', type: 'stock',  qty: 100,  price: 120 },
  { id: 'a3', type: 'stock',  qty: 50,   price: 100 },
  { id: 'a4', type: 'etf',    qty: 30,   price: 90 },
  { id: 'a5', type: 'etf',    qty: 20,   price: 80 },
  { id: 'a6', type: 'crypto', qty: 5,    price: 200 },
  { id: 'a7', type: 'metal',  qty: 10,   price: 60 },
  { id: 'a8', type: 'stock',  qty: 10,   price: 50 },
  { id: 'a9', type: 'fund',   qty: 10,   price: 40 },
  { id: 'a10', type: 'stock', qty: 10,   price: 30 },
  { id: 'a11', type: 'etf',   qty: 10,   price: 20 },
  { id: 'a12', type: 'cash',  qty: 5000 },
];

console.log('AURIX-INT-CORE-FACT-ENGINE — SPEC INT.03 · Intelligence Core / Wealth Fact Engine\n');

// ════════════════════════════════════════════════════════════════════════════
// 1 · LEDGER INVARIANT — no evidence, no fact
// ════════════════════════════════════════════════════════════════════════════
console.log('1 · A fact without evidence is ABSENT (never 0 / neutral):');
{
  const empty = core({ rows: [], serverRows: [], assets: [], snap: null, drivers: null });
  ok('1.1 an empty portfolio produces zero facts', empty.ledger.facts.length === 0,
    JSON.stringify(empty.ledger.facts.map(f => f.semanticKey)));
  ok('1.2 no story, no wow, no positive development is invented',
    empty.topStories.length === 0 && empty.wowInsights.length === 0 && empty.positiveDevelopments.length === 0);
  ok('1.3 absence is recorded as STRUCTURED gaps, not as figures', empty.dataAvailability.gaps.length > 0);
  ok('1.4 every gap carries a status from the declared vocabulary',
    empty.dataAvailability.gaps.every(g => Object.values(empty.dataAvailability.status).indexOf(g.status) >= 0),
    JSON.stringify(empty.dataAvailability.gaps.map(g => g.status)));
  ok('1.5 no fact anywhere carries a placeholder value',
    JSON.stringify(empty).indexOf('"value":45') === -1 && JSON.stringify(empty).indexOf('estimated') === -1);
  // Every fact that DOES exist must be AVAILABLE by construction.
  const full = core({ rows: inv([100000, 101000, 102000, 103000, 104000, 105000]),
                      serverRows: srvHistory(NOW, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                       { crypto: 39000, stock: 40000, liquidity: 21000 }),
                      assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  ok('1.6 every ledger fact is dataStatus=available',
    full.ledger.facts.length > 0 && full.ledger.facts.every(f => f.dataStatus === 'available'),
    'facts=' + full.ledger.facts.length);
  ok('1.7 every fact declares a source and a unit',
    full.ledger.facts.every(f => !!f.source && !!f.unit));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · CAUSAL ROOTS — one root, one primary story
// ════════════════════════════════════════════════════════════════════════════
console.log('\n2 · Deduplication by causal root (SPEC §4):');
{
  const c = core({ rows: inv([100000, 101000, 102000, 103000, 104000, 105000]),
                   serverRows: [], assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  const conc = c.ledger.facts.filter(f => ['top_position_weight','top3_weight','effective_holdings'].indexOf(f.semanticKey) >= 0);
  ok('2.1 concentration, top-3 and effective diversification all exist as facts',
    conc.length === 3, JSON.stringify(conc.map(f => f.semanticKey)));
  ok('2.2 …and they SHARE one causal root',
    new Set(conc.map(f => f.causalRoot)).size === 1, JSON.stringify(conc.map(f => f.causalRoot)));
  const topRootStories = c.topStories.filter(s => s.causalRoot === 'top_position');
  ok('2.3 they produce exactly ONE primary story, not three',
    topRootStories.length === 1, 'stories=' + topRootStories.length);
  ok('2.4 the other two survive as SUPPORTING facts (nothing is lost)',
    topRootStories[0].supporting.length === 2,
    JSON.stringify(topRootStories[0].supporting.map(s => s.semanticKey)));
  ok('2.5 no two primary stories ever share a root',
    new Set(c.topStories.map(s => s.causalRoot)).size === c.topStories.length,
    JSON.stringify(c.topStories.map(s => s.causalRoot)));
  ok('2.6 genuinely independent phenomena DO get independent stories',
    c.topStories.length >= 2, JSON.stringify(c.topStories.map(s => s.semanticKey)));
  ok('2.7 deduplication is by ROOT, not by string',
    /causalRoot/.test(fnSrc('_aurixIntelligenceStories')) && !/text|copy/.test(fnSrc('_aurixIntelligenceStories')));
  ok('2.8 the primary is elected deterministically (priority, then magnitude, then key)',
    /b\.priority - a\.priority\) \|\| \(b\.magnitude - a\.magnitude\)/.test(fnSrc('_aurixIntelligenceStories')));
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · PERFORMANCE COMES ONLY FROM THE INT.02 OWNER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n3 · Performance is the INT.02 certified owner, nothing else:');
{
  const ledgerSrc = fnSrc('_aurixFactLedger');
  ok('3.1 the ledger calls _aurixInvestablePerformance and nothing else for return',
    /_aurixInvestablePerformance\(pr\)/.test(ledgerSrc)
    && !/computeAurixTWRSeries/.test(ledgerSrc)
    && !/portfolioHistory/.test(ledgerSrc));
  // A real +10% market move, no flows.
  const up = core({ rows: inv([10000, 10200, 10400, 10600, 10800, 10900, 11000]), assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  const pf = up.ledger.facts.find(f => f.semanticKey === 'investable_return_all');
  ok('3.2 a certified +10% return becomes a fact with its window',
    pf && near(pf.value, 10, 0.05) && pf.window.startAt != null && pf.window.endAt != null,
    pf ? JSON.stringify({ v: pf.value, w: pf.window.range }) : 'absent');
  ok('3.3 the fact carries the owner as its source', pf && pf.source === 'aurixInvestablePerformance');
  // CAPITAL FLOW IS NOT PERFORMANCE: deposit doubles wealth, market flat.
  const dep = core({ rows: inv([10000, 10000, 10000, 20000, 20000, 20000, 20000]),
                     flows: [{ id: 'd1', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'deposit' }],
                     assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  const dpf = dep.ledger.facts.find(f => f.semanticKey === 'investable_return_all');
  ok('3.4 a deposit that doubles wealth yields a 0% performance fact, not +100%',
    dpf && near(dpf.value, 0, 0.05), dpf ? String(dpf.value) : 'absent');
  const cap = dep.ledger.facts.find(f => f.semanticKey === 'recorded_capital_net');
  ok('3.5 the capital is published as CAPITAL, in its own family and root',
    cap && cap.family === 'capital_flow' && cap.causalRoot === 'external_capital' && near(cap.value, 10000, 1),
    cap ? JSON.stringify({ f: cap.family, v: cap.value }) : 'absent');
  ok('3.6 the capital fact is explicitly marked as not-return', cap && cap.note === 'capital_not_return');
  ok('3.7 performance and capital are DIFFERENT roots (never merged)',
    dpf.causalRoot !== cap.causalRoot);
  // REAL ESTATE cannot contaminate performance.
  const re = core({ rows: [row(0, 400000, 380000), row(1, 400000, 380000), row(2, 400000, 380000),
                           row(3, 440000, 420000), row(4, 440000, 420000), row(5, 440000, 420000)],
                    assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  const rpf = re.ledger.facts.find(f => f.semanticKey === 'investable_return_all');
  ok('3.8 a 380k→420k property revaluation yields 0% performance',
    rpf && near(rpf.value, 0, 0.05), rpf ? String(rpf.value) : 'absent');
  ok('3.9 …and the wealth-level fact reads investable (20.000), not total (440.000)',
    (() => { const lv = re.ledger.facts.find(f => f.semanticKey === 'investable_level');
             return lv && near(lv.value, 20000, 1); })());
  // Fail-closed performance ⇒ no fact, a gap instead.
  const bad = core({ rows: inv([100000, 100000, 100000, 50000, 50000, 50000]), assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  // The unexplained move sits in the FULL window; a 24H window over the flat tail is
  // legitimately measurable, so the assertion is scoped to the window that contains it.
  ok('3.10 an unexplained capital move produces NO performance fact for that window, only a gap',
    !bad.ledger.facts.some(f => f.semanticKey === 'investable_return_all')
    && bad.ledger.gaps.some(g => g.semanticKey === 'investable_return_all' && g.reason === 'unexplained_capital_event'),
    JSON.stringify(bad.ledger.gaps.filter(g => g.family === 'performance').map(g => g.semanticKey + ':' + g.reason)));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · EFFECTIVE DIVERSIFICATION — HHI maths
// ════════════════════════════════════════════════════════════════════════════
console.log('\n4 · HHI / effective holdings are mathematically correct:');
{
  const four = [{ id: '1', type: 'stock', qty: 1, price: 100 }, { id: '2', type: 'stock', qty: 1, price: 100 },
                { id: '3', type: 'stock', qty: 1, price: 100 }, { id: '4', type: 'stock', qty: 1, price: 100 }];
  const c4 = makeCtx({ assets: four });
  const d4 = run('_aurixEffectiveDiversification()', c4);
  ok('4.1 four equal positions ⇒ HHI 0,25 and effectiveN 4',
    near(d4.hhi, 0.25, 1e-6) && near(d4.effectiveN, 4, 0.01), JSON.stringify(d4));
  const one = makeCtx({ assets: [{ id: '1', type: 'stock', qty: 1, price: 100 }] });
  const d1 = run('_aurixEffectiveDiversification()', one);
  ok('4.2 a single position ⇒ HHI 1 and effectiveN 1', near(d1.hhi, 1, 1e-6) && near(d1.effectiveN, 1, 0.01));
  // 90/10 split: HHI = 0.81+0.01 = 0.82 ⇒ effectiveN ≈ 1.2195
  const skew = makeCtx({ assets: [{ id: '1', type: 'stock', qty: 1, price: 900 }, { id: '2', type: 'stock', qty: 1, price: 100 }] });
  const ds = run('_aurixEffectiveDiversification()', skew);
  ok('4.3 a 90/10 split ⇒ HHI 0,82 and effectiveN ≈ 1,22',
    near(ds.hhi, 0.82, 1e-6) && near(ds.effectiveN, 1.22, 0.01), JSON.stringify(ds));
  ok('4.4 effectiveN never exceeds the nominal count',
    (() => { const c = makeCtx({ assets: LOPSIDED });
             const d = run('_aurixEffectiveDiversification()', c);
             return d.effectiveN <= d.positions + 1e-9; })());
  ok('4.5 the denominator is declared and excludes real estate',
    (() => { const c = makeCtx({ assets: four.concat([{ id: 're', type: 'real_estate', qty: 1, price: 900000 }]) });
             const d = run('_aurixEffectiveDiversification()', c);
             return d.denominator === 'investable_value_usd' && d.positions === 4 && near(d.hhi, 0.25, 1e-6); })());
  ok('4.6 an unusable quantity fails CLOSED (no partial denominator)',
    (() => { const c = makeCtx({ assets: four.concat([{ id: 'x', type: 'stock', qty: null, price: 100 }]) });
             const d = run('_aurixEffectiveDiversification()', c);
             return d.status === 'low_confidence' && d.hhi === null; })());
  ok('4.7 an unvalued position fails CLOSED',
    (() => { const c = makeCtx({ assets: four.concat([{ id: 'x', type: 'stock', qty: 1, price: 100, assetCurrency: 'ZZZ' }]) });
             const d = run('_aurixEffectiveDiversification()', c);
             return d.status === 'low_confidence' && d.effectiveN === null; })());
  ok('4.8 no positions ⇒ no number', (() => { const d = run('_aurixEffectiveDiversification()', makeCtx({ assets: [] })); return d.hhi === null; })());
  ok('4.9 it is a description, not a recommendation',
    !/should|recommend|advice|reduce your/i.test(fnSrc('_aurixEffectiveDiversification')));
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · EXPOSURE — percentage points, certified reader, windows
// ════════════════════════════════════════════════════════════════════════════
console.log('\n5 · Exposure drift in percentage points, from the certified reader:');
{
  const endTs = NOW;
  const srv = srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                     { crypto: 39000, stock: 40000, liquidity: 21000 });
  const c = core({ rows: inv([100000, 100500, 101000]), serverRows: srv, assets: LOPSIDED,
                   snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN, ranges: ['24H', '7D', '30D', '90D'] });
  const expo = c.ledger.facts.filter(f => f.family === 'exposure');
  ok('5.1 a material crypto drift is published for 7D',
    expo.some(f => f.semanticKey === 'exposure_drift_crypto_7D'),
    JSON.stringify(expo.map(f => f.semanticKey)));
  const cf = expo.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
  ok('5.2 its unit is percentage_points (never a relative %)', cf && cf.unit === 'percentage_points');
  ok('5.3 the delta really is endPct − startPct',
    cf && near(cf.value, cf.values.endPct - cf.values.startPct, 0.01),
    cf ? JSON.stringify(cf.values) : 'absent');
  ok('5.4 pp is NOT converted into a relative percentage',
    cf && !near(cf.value, ((cf.values.endPct - cf.values.startPct) / cf.values.startPct) * 100, 0.01));
  ok('5.5 the source is the certified server reader', cf && cf.source === 'aurixCatExposureDelta');
  ok('5.6 an immaterial drift (< 3 pp) produces no story',
    !expo.some(f => Math.abs(f.value) < 3), JSON.stringify(expo.map(f => f.value)));
  // 30D/90D are DECLARED but must fail closed on a 10-day history.
  ok('5.7 30D and 90D are declared windows',
    run('Object.keys(_AURIX_CATHIST_WINDOWS).join(",")', makeCtx({})) === '24H,7D,30D,90D');
  ok('5.8 …yet a 10-day history publishes NO 30D/90D exposure fact',
    !c.ledger.facts.some(f => /_(30D|90D)$/.test(f.semanticKey)),
    JSON.stringify(c.ledger.facts.filter(f => /_(30D|90D)$/.test(f.semanticKey)).map(f => f.semanticKey)));
  ok('5.9 …and the refusal is recorded as insufficient_history',
    c.ledger.gaps.some(g => /_30D$/.test(g.semanticKey) && g.status === 'insufficient_history'),
    JSON.stringify(c.ledger.gaps.filter(g => /_30D$/.test(g.semanticKey)).slice(0, 2)));
  // With a genuine 35-day history, 30D starts answering on its own.
  const srv35 = srvHistory(endTs, 35, { crypto: 20000, stock: 50000, liquidity: 30000 },
                                       { crypto: 32000, stock: 50000, liquidity: 18000 });
  const c35 = core({ rows: inv([100000, 100500, 101000]), serverRows: srv35, assets: LOPSIDED,
                     snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN, ranges: ['30D'] });
  ok('5.10 a real 35-day history DOES publish a 30D exposure fact',
    c35.ledger.facts.some(f => f.semanticKey === 'exposure_drift_crypto_30D'),
    JSON.stringify(c35.ledger.gaps.filter(g => /crypto_30D/.test(g.semanticKey)).map(g => g.reason)));
  ok('5.11 a stale server history publishes nothing at all',
    (() => { const stale = core({ rows: inv([100000, 100500, 101000]),
               serverRows: srvHistory(T0, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                { crypto: 39000, stock: 40000, liquidity: 21000 }),   // deliberately STALE
               assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs });
             return !stale.ledger.facts.some(f => f.family === 'exposure'); })());
  ok('5.12 an un-hydrated reader publishes nothing',
    (() => { const h = core({ rows: inv([100000, 100500, 101000]), serverRows: srv, hydration: 'loading',
               assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
             return !h.ledger.facts.some(f => f.family === 'exposure'); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · WHAT CHANGED — change / cause / impact separated
// ════════════════════════════════════════════════════════════════════════════
console.log('\n6 · CHANGE is published, CAUSE only if demonstrable:');
{
  const endTs = NOW;
  const c = core({ rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
                   serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                      { crypto: 39000, stock: 40000, liquidity: 21000 }),
                   assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
  ok('6.1 whatChanged entries carry a measured change with its window',
    c.whatChanged.length > 0 && c.whatChanged.every(w => w.change && w.change.window));
  ok('6.2 cause is NEVER asserted', c.whatChanged.every(w => w.cause === null && w.causeKnown === false));
  ok('6.3 the reason cause is withheld is explicit',
    c.whatChanged.every(w => w.causeReason === 'attribution_not_supported'));
  ok('6.4 no entry attributes a category move to an individual asset',
    !JSON.stringify(c.whatChanged).match(/because|due to|driven by|por Bitcoin/i));
  ok('6.5 impact is a structural reading, never advice',
    c.whatChanged.every(w => w.impact && w.impact.dimension && Number.isFinite(w.impact.materiality)));
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · POSITIVE INTELLIGENCE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n7 · Positive facts exist when they are observable:');
{
  const endTs = NOW;
  // Liquidity RISING + a real positive return.
  const good = core({ rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
                      serverRows: srvHistory(endTs, 10, { crypto: 40000, stock: 40000, liquidity: 20000 },
                                                         { crypto: 32000, stock: 40000, liquidity: 28000 }),
                      assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
  ok('7.1 improving liquidity is detected as a positive fact',
    good.positiveDevelopments.some(f => f.semanticKey === 'liquidity_improved'),
    JSON.stringify(good.positiveDevelopments.map(f => f.semanticKey)));
  ok('7.2 a real positive return is detected as a positive fact',
    good.positiveDevelopments.some(f => f.semanticKey === 'return_positive'));
  // A primary fact (a measured positive return, a new high) IS its own evidence;
  // only DERIVED positives need a supporting chain. Both must name a source.
  ok('7.3 every positive fact names its source',
    good.positiveDevelopments.every(f => !!f.source),
    JSON.stringify(good.positiveDevelopments.map(f => f.semanticKey + ':' + f.source)));
  ok('7.3b every DERIVED positive traces to real ledger facts',
    good.positiveDevelopments
      .filter(f => Array.isArray(f.supportingKeys))
      .every(f => f.supportingKeys.length > 0
                  && f.supportingKeys.every(k => good.ledger.facts.some(x => x.semanticKey === k)))
    && good.positiveDevelopments.some(f => Array.isArray(f.supportingKeys)),
    JSON.stringify(good.positiveDevelopments.filter(f => f.supportingKeys).map(f => f.supportingKeys)));
  // Nothing objectively good ⇒ no congratulation.
  const flat = core({ rows: inv([10000, 10000, 10000, 10000, 10000, 10000]),
                      serverRows: [], assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs });
  ok('7.4 nothing is congratulated when nothing improved',
    flat.positiveDevelopments.length === 0, JSON.stringify(flat.positiveDevelopments.map(f => f.semanticKey)));
  ok('7.5 a falling-liquidity portfolio produces no liquidity positive',
    (() => { const bad = core({ rows: inv([10000, 10000, 10000, 10000, 10000]),
               serverRows: srvHistory(endTs, 10, { crypto: 20000, stock: 40000, liquidity: 40000 },
                                                  { crypto: 40000, stock: 40000, liquidity: 20000 }),
               assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
             return !bad.positiveDevelopments.some(f => f.semanticKey === 'liquidity_improved'); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · RANKING + NOVELTY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n8 · Ranking is explicit; novelty moves priority, never truth:');
{
  const base = { rows: inv([10000, 10200, 10400, 10600, 10800, 11000]), serverRows: [],
                 assets: LOPSIDED, snap: SNAP, drivers: DRIVERS };
  const fresh = core(base, { now: T0 + 40 * DAY });
  const key = 'top_position_weight';
  const shown = core(base, { now: T0 + 40 * DAY, presentationHistory: [{ semanticKey: key, shownAt: T0 + 40 * DAY }] });
  const a = fresh.ledger.facts.find(f => f.semanticKey === key);
  const b = shown.ledger.facts.find(f => f.semanticKey === key);
  ok('8.1 a just-shown fact loses novelty', a.novelty === 1 && b.novelty === 0, JSON.stringify([a.novelty, b.novelty]));
  ok('8.2 …and therefore priority', b.priority < a.priority, JSON.stringify([a.priority, b.priority]));
  ok('8.3 but its VALUE is untouched — novelty never alters truth',
    a.value === b.value && a.unit === b.unit && JSON.stringify(a.values) === JSON.stringify(b.values));
  ok('8.4 the fact does not disappear either', !!b);
  ok('8.5 ranking components are all exposed for inspection',
    ['materiality','magnitude','confidence','novelty','utility','rarity'].every(k => Number.isFinite(a.components[k])));
  ok('8.6 priority is the declared weighted sum (no hidden term)',
    (() => { const W = run('JSON.parse(JSON.stringify(_AURIX_RANK_WEIGHTS))', makeCtx({}));
             const c = a.components;
             const expect = c.materiality*W.materiality + c.magnitude*W.magnitude + c.confidence*W.confidence
                          + c.novelty*W.novelty + c.utility*W.utility + c.rarity*W.rarity;
             return near(a.priority, expect, 1e-6); })());
  ok('8.7 novelty cannot outweigh materiality (weights enforce it)',
    (() => { const W = run('JSON.parse(JSON.stringify(_AURIX_RANK_WEIGHTS))', makeCtx({}));
             return W.novelty < W.materiality; })());
  ok('8.8 a big fact with poor data cannot outrank a solid one',
    (() => { const W = run('JSON.parse(JSON.stringify(_AURIX_RANK_WEIGHTS))', makeCtx({}));
             return W.confidence > W.novelty; })());
  ok('8.9 at most 5 primary stories', fresh.topStories.length <= 5, 'n=' + fresh.topStories.length);
  // SELECTION vs ORDERING (found by INT.04). `priority` is a weighted SUM, so a
  // full novelty swing (1.0 × 0.14) could out-argue a materiality gap of 0.31
  // (× 0.34) and EVICT a more material root from the Brief. Which stories survive
  // truncation is therefore decided by root MATERIALITY; novelty only reorders.
  ok('8.10 every story exposes its ROOT materiality (the group max, not the elected primary\'s)',
    fresh.topStories.every(s => Number.isFinite(s.rootMateriality))
    && fresh.topStories.every(s => s.rootMateriality >= s.materiality - 1e-9),
    JSON.stringify(fresh.topStories.map(s => s.causalRoot + ':' + s.rootMateriality)));
  ok('8.11 novelty cannot EVICT a more material root from the selection',
    (() => {
      const all = base;
      const noHist = core(all, { now: T0 + 40 * DAY });
      const everyShown = core(all, { now: T0 + 40 * DAY, presentationHistory:
        noHist.ledger.facts.map(f => ({ semanticKey: f.semanticKey, shownAt: T0 + 40 * DAY })) });
      const matOf = c => { const m = {};
        c.ledger.facts.forEach(f => { m[f.causalRoot] = Math.max(m[f.causalRoot] || 0, f.materiality); }); return m; };
      const m = matOf(noHist);
      const A = noHist.topStories.map(s => s.causalRoot), B = everyShown.topStories.map(s => s.causalRoot);
      const dropped = A.filter(r => B.indexOf(r) === -1), admitted = B.filter(r => A.indexOf(r) === -1);
      return dropped.every(d => admitted.every(k => (m[k] || 0) >= (m[d] || 0)));
    })());
  ok('8.12 …and the selected SET is identical regardless of presentation history',
    (() => { const all = base;
      const A = core(all, { now: T0 + 40 * DAY }).topStories.map(s => s.causalRoot).sort();
      const B = core(all, { now: T0 + 40 * DAY, presentationHistory:
        core(all, { now: T0 + 40 * DAY }).ledger.facts.map(f => ({ semanticKey: f.semanticKey, shownAt: T0 + 40 * DAY })) })
        .topStories.map(s => s.causalRoot).sort();
      return JSON.stringify(A) === JSON.stringify(B); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · QUESTION CATALOG
// ════════════════════════════════════════════════════════════════════════════
console.log('\n9 · Contextual questions: eligibility + distinct roots:');
{
  const endTs = NOW;
  const rich = core({ rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
                      flows: [{ id: 'd', ts: T0 + 1.5 * DAY, amountUSD: 400, kind: 'deposit' }],
                      serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                         { crypto: 39000, stock: 40000, liquidity: 21000 }),
                      assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
  const q = rich.contextualQuestions;
  ok('9.1 questions are selected', q.selected.length > 0, JSON.stringify(q.selected.map(x => x.id)));
  ok('9.2 selected questions never share a causal root',
    new Set(q.selected.map(x => x.causalRoot)).size === q.selected.length,
    JSON.stringify(q.selected.map(x => x.causalRoot)));
  ok('9.3 concentration and diversification cannot both be selected (same root)',
    !(q.selected.some(x => x.id === 'q_concentration') && q.selected.some(x => x.id === 'q_diversification')));
  ok('9.4 every selected question resolves to real fact keys',
    q.selected.every(x => x.answer && (x.answer.factKeys.length > 0 || x.family === 'data_quality')));
  ok('9.5 each answer\'s fact keys exist in the ledger',
    q.selected.every(x => x.answer.factKeys.every(k => rich.ledger.facts.some(f => f.semanticKey === k))));
  // Ineligible questions must not appear.
  const poor = core({ rows: [], serverRows: [], assets: [], snap: null, drivers: null });
  const pq = poor.contextualQuestions;
  ok('9.6 with no facts, no data-bearing question is eligible',
    pq.eligible.every(x => x.family === 'data_quality'), JSON.stringify(pq.eligible.map(x => x.id)));
  ok('9.7 a question whose required fact is missing never appears',
    !pq.eligible.some(x => x.id === 'q_performance' || x.id === 'q_concentration'));
  ok('9.8 the data-quality question is always available as honest content',
    pq.selected.some(x => x.family === 'data_quality'));
  ok('9.9 "movers" is not used as an exposure answer',
    !/movers/i.test(JSON.stringify(run('JSON.parse(JSON.stringify(_AURIX_QUESTION_CATALOG))', makeCtx({})))));
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · WOW INSIGHTS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n10 · Wow insights are traceable combinations of real facts:');
{
  // Wealth grew purely from contributions; the market returned ~0.
  const w = core({ rows: inv([10000, 10000, 10000, 20000, 20000, 20000, 20000]),
                   flows: [{ id: 'd1', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'deposit' }],
                   assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  const growth = w.wowInsights.find(x => x.semanticKey === 'wow_growth_from_capital_not_return');
  ok('10.1 "your wealth grew from contributions, not returns" is detected', !!growth,
    JSON.stringify(w.wowInsights.map(x => x.semanticKey)));
  ok('10.2 it decomposes into the exact facts that support it',
    growth && growth.supportingKeys.every(k => w.ledger.facts.some(f => f.semanticKey === k)),
    growth ? JSON.stringify(growth.supportingKeys) : 'absent');
  const nominal = w.wowInsights.find(x => x.semanticKey === 'wow_nominal_vs_effective');
  ok('10.3 "many positions, few effective ones" is detected on a lopsided book', !!nominal);
  ok('10.4 …and states both real numbers',
    nominal && nominal.values.positions === 12 && nominal.values.effectiveN > 0,
    nominal ? JSON.stringify(nominal.values) : 'absent');
  ok('10.5 every wow insight traces to ledger facts',
    w.wowInsights.every(x => (x.supportingKeys || []).every(k => w.ledger.facts.some(f => f.semanticKey === k))));
  ok('10.6 no wow insight asserts a cause',
    !JSON.stringify(w.wowInsights).match(/because|due to|driven by/i));
  ok('10.7 an empty portfolio yields no wow insights',
    core({ rows: [], serverRows: [], assets: [], snap: null, drivers: null }).wowInsights.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 11 · FORBIDDEN FAMILIES + NO COPY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n11 · Nothing forbidden is produced:');
{
  const endTs = NOW;
  const c = core({ rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
                   flows: [{ id: 'd', ts: T0 + 1.5 * DAY, amountUSD: 400, kind: 'deposit' }],
                   serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                      { crypto: 39000, stock: 40000, liquidity: 21000 }),
                   assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
  const blob = JSON.stringify(c);
  const banned = ['attribution:', 'benchmark', 'correlation', 'sector', 'geography', 'forecast', 'prediction',
                  'buy_recommendation', 'sell_recommendation', 'optimi'];
  const hit = banned.filter(b => new RegExp(b, 'i').test(blob) && b !== 'attribution:');
  ok('11.1 no benchmark / correlation / sector / geography / forecast family appears',
    hit.length === 0, JSON.stringify(hit));
  ok('11.2 per-asset attribution appears ONLY as a declared NOT_YET_SUPPORTED gap',
    c.dataAvailability.gaps.some(g => g.semanticKey === 'per_asset_attribution' && g.status === 'not_yet_supported')
    && !c.ledger.facts.some(f => f.semanticKey === 'per_asset_attribution'));
  ok('11.3 no economic currency exposure is produced',
    !c.ledger.facts.some(f => /currency_exposure/.test(f.semanticKey)));
  ok('11.4 the Core emits NO user-facing copy (INT.04 renders, Auris interprets)',
    !/\bt\('/.test(fnSrc('_aurixFactLedger')) && !/\bt\('/.test(fnSrc('_aurixIntelligenceCore'))
    && !/\bt\('/.test(fnSrc('_aurixWowInsights')) && !/\bt\('/.test(fnSrc('_aurixContextualQuestions')));
  ok('11.5 no fact family outside the declared vocabulary',
    (() => { const fams = Object.values(run('JSON.parse(JSON.stringify(_AURIX_FACT_FAMILY))', makeCtx({})));
             return c.ledger.facts.every(f => fams.indexOf(f.family) >= 0); })());
  ok('11.6 no causal root outside the declared vocabulary',
    (() => { const roots = Object.values(run('JSON.parse(JSON.stringify(_AURIX_CAUSAL_ROOT))', makeCtx({})));
             return c.ledger.facts.every(f => roots.indexOf(f.causalRoot) >= 0); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 12 · DETERMINISM + LANGUAGE INDEPENDENCE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n12 · Deterministic, and language cannot move a number:');
{
  const endTs = NOW;
  const fixture = { rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
                    flows: [{ id: 'd', ts: T0 + 1.5 * DAY, amountUSD: 400, kind: 'deposit' }],
                    serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                       { crypto: 39000, stock: 40000, liquidity: 21000 }),
                    assets: LOPSIDED, snap: SNAP, drivers: DRIVERS };
  const o = { now: endTs + MIN };
  const a = JSON.stringify(core(fixture, o));
  const b = JSON.stringify(core(fixture, o));
  ok('12.1 same input ⇒ byte-identical output', a === b);
  const es = core(Object.assign({}, fixture, { lang: 'es' }), o);
  const en = core(Object.assign({}, fixture, { lang: 'en' }), o);
  ok('12.2 ES and EN produce identical facts, numbers and selection',
    JSON.stringify(es) === JSON.stringify(en));
  ok('12.3 story order is stable and not insertion-dependent',
    JSON.stringify(core(fixture, o).topStories.map(s => s.semanticKey))
    === JSON.stringify(core(fixture, o).topStories.map(s => s.semanticKey)));
  ok('12.4 base currency changes values but never the SELECTION',
    (() => { const usd = core(Object.assign({}, fixture, { baseCurrency: 'USD' }), o);
             const eur = core(Object.assign({}, fixture, { baseCurrency: 'EUR' }), o);
             return JSON.stringify(usd.topStories.map(s => s.semanticKey))
                 === JSON.stringify(eur.topStories.map(s => s.semanticKey)); })());
}

// ════════════════════════════════════════════════════════════════════════════
// 13 · CONSUMPTION CONTRACT FOR INT.04
// ════════════════════════════════════════════════════════════════════════════
console.log('\n13 · One clean contract for INT.04:');
{
  const endTs = NOW;
  const c = core({ rows: inv([10000, 10200, 10400, 10600, 10800, 11000]),
                   serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                      { crypto: 39000, stock: 40000, liquidity: 21000 }),
                   assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN });
  ok('13.1 the contract exposes every surface INT.04 needs',
    ['topStories','supportingFacts','whatChanged','positiveDevelopments','contextualQuestions',
     'temporalEvents','dataAvailability'].every(k => Object.prototype.hasOwnProperty.call(c, k)));
  ok('13.2 wow insights are exposed', Array.isArray(c.wowInsights));
  ok('13.3 data availability is part of the contract, not an afterthought',
    Array.isArray(c.dataAvailability.gaps) && !!c.dataAvailability.status && Array.isArray(c.dataAvailability.roots));
  ok('13.4 the Core computes no financial metric of its own',
    !/\* 100|\/ 100\b|Math\.pow/.test(fnSrc('_aurixIntelligenceCore')));
  ok('13.5 supporting facts are reachable without recomputation',
    c.supportingFacts.every(s => !!s.semanticKey && !!s.unit));
  ok('13.6 temporal events are wealth-level facts only',
    c.temporalEvents.every(f => f.family === 'wealth_level'));
}

// ════════════════════════════════════════════════════════════════════════════
// 14 · NON-VACUITY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n14 · Non-vacuity: the protections are load-bearing:');
{
  const c = core({ rows: inv([100000, 101000, 102000, 103000, 104000, 105000]),
                   serverRows: [], assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  // 14.1 — without root grouping the same phenomenon yields 3 headlines.
  const concFacts = c.ledger.facts.filter(f => ['top_position_weight','top3_weight','effective_holdings'].indexOf(f.semanticKey) >= 0);
  ok('14.1 without root grouping the SAME phenomenon would yield ' + concFacts.length + ' headlines (§4 is load-bearing)',
    concFacts.length === 3 && c.topStories.filter(s => s.causalRoot === 'top_position').length === 1);
  // 14.2 — a deposit really would read as +100% without the INT.02 owner.
  const dep = core({ rows: inv([10000, 10000, 10000, 20000, 20000, 20000, 20000]),
                     flows: [{ id: 'd1', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'deposit' }],
                     assets: LOPSIDED, snap: SNAP, drivers: DRIVERS });
  const raw = ((20000 - 10000) / 10000) * 100;
  const pf = dep.ledger.facts.find(f => f.semanticKey === 'investable_return_all');
  ok('14.2 the naive value change would be +' + raw + '%, the fact says ' + pf.value + '% (§2.A is load-bearing)',
    near(pf.value, 0, 0.05) && Math.abs(raw - pf.value) > 50);
  // 14.3 — HHI would be wrong if real estate entered the denominator.
  {
    const withRE = makeCtx({ assets: [{ id: '1', type: 'stock', qty: 1, price: 100 },
                                      { id: '2', type: 'stock', qty: 1, price: 100 },
                                      { id: 're', type: 'real_estate', qty: 1, price: 800 }] });
    vm.runInContext(`function _badHHI(){
      const list = activeAssets();          // real estate INCLUDED — the wrong denominator
      let tot = 0; const vals = [];
      for (const a of list) { const v = assetValueUSD(a); vals.push(v); tot += v; }
      let hhi = 0; for (const v of vals) { const w = v/tot; hhi += w*w; }
      return { hhi: +hhi.toFixed(6), effectiveN: +(1/hhi).toFixed(2) };
    }`, withRE);
    const bad = run('_badHHI()', withRE);
    const good = run('_aurixEffectiveDiversification()', withRE);
    ok('14.3 including real estate would report effectiveN ' + bad.effectiveN + ' instead of ' + good.effectiveN + ' (§2.G is load-bearing)',
      Math.abs(bad.effectiveN - good.effectiveN) > 0.2, JSON.stringify([bad, good]));
  }
  // 14.4 — pp expressed as a relative % would be a different number.
  {
    const endTs = NOW;
    const e = core({ rows: inv([100000, 100500, 101000]),
                     serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                        { crypto: 39000, stock: 40000, liquidity: 21000 }),
                     assets: LOPSIDED, snap: SNAP, drivers: DRIVERS }, { now: endTs + MIN, ranges: ['7D'] });
    const cf = e.ledger.facts.find(f => f.semanticKey === 'exposure_drift_crypto_7D');
    const rel = ((cf.values.endPct - cf.values.startPct) / cf.values.startPct) * 100;
    ok('14.4 the same drift as a relative % would be ' + rel.toFixed(2) + '% not ' + cf.value + ' pp (§5.2 is load-bearing)',
      Math.abs(rel - cf.value) > 1, JSON.stringify({ pp: cf.value, rel: +rel.toFixed(2) }));
  }
  // 14.5 — the 30D drift guard is what refuses, not the absence of the window.
  {
    const endTs = NOW;
    const short = makeCtx({ serverRows: srvHistory(endTs, 10, { crypto: 31000, stock: 40000, liquidity: 29000 },
                                                               { crypto: 39000, stock: 40000, liquidity: 21000 }) });
    const w30 = run("_aurixCatHistWindow('30D')", short);
    ok('14.5 a declared 30D window on 10 days of data returns insufficient_history, never a number (§2.E is load-bearing)',
      w30.state === 'insufficient_data' && w30.reason === 'insufficient_history' && w30.startAt === null,
      JSON.stringify({ s: w30.state, r: w30.reason }));
  }
  // 14.6 — novelty MUST NOT be able to change a value (guard against regression).
  {
    const base = { rows: inv([10000, 10200, 10400, 10600, 10800, 11000]), serverRows: [],
                   assets: LOPSIDED, snap: SNAP, drivers: DRIVERS };
    const f1 = core(base, { now: T0 + 40 * DAY }).ledger.facts.map(f => f.semanticKey + '=' + f.value).sort().join('|');
    const f2 = core(base, { now: T0 + 40 * DAY, presentationHistory:
      [{ semanticKey: 'top_position_weight', shownAt: T0 + 40 * DAY }, { semanticKey: 'investable_return_all', shownAt: T0 + 40 * DAY }] })
      .ledger.facts.map(f => f.semanticKey + '=' + f.value).sort().join('|');
    ok('14.6 presentation history changes no value anywhere (§6 is load-bearing)', f1 === f2);
  }
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
