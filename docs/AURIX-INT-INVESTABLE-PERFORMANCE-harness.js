'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INT-INVESTABLE-PERFORMANCE-harness — SPEC INT.02
// ════════════════════════════════════════════════════════════════════════════
// Certifies `_aurixInvestablePerformance(range)`: the ONE publishable answer to
// "how have my investments behaved, net of money I put in or took out?".
//
// The invariant, in four separations:
//   MARKET PERFORMANCE ≠ CAPITAL FLOW ≠ REAL-ESTATE REVALUATION ≠ VALUE CHANGE
//
// INT.01 proved `computeAurixTWRSeries` cannot answer it: its input is raw
// `portfolioHistory` = TOTAL net worth INCLUDING real estate, so a manual
// property revaluation read as return. INT.02 fixes the INPUT and reuses the
// FORMULA (`_aurixTwrChain`, chained Modified-Dietz TWR) — there is no second
// formula in the codebase.
//
// WHAT IS REAL HERE (the INT.01 lesson — a gate that stubs the financial
// condition under test is not evidence):
//   · `_aurixInvestableSnapshots` + `_aurixEligibleInvestableSeries` — the real
//     investable construction (total − real_estate), the real epoch filter, the
//     real incomplete-snapshot drop, the real [0.25×, 2.5×] trust band.
//   · `_aurixPointValuationIncomplete` — real.
//   · `_aurixTwrChain` + `_aurixInvestablePerformance` — real.
//   · `_aurixLoadCapitalFlows` — REAL, over a real localStorage shim, so
//     tombstones and the flow epoch are genuinely exercised.
//   · `_aurixFlowIsInternal` / `_WSC_INTERNAL_KINDS` — real classification.
//   · `toBase` / `formatCurrency` — real, and every case is run in BOTH a USD
//     base and a EUR base so a double conversion cannot hide.
// Only genuine INPUTS are provided: the authoritative history rows, the FX rate,
// and `canDisplayCanonicalReturn` (a different subsystem's verdict).
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
const near = (a,b,tol) => Number.isFinite(a) && Math.abs(a-b) <= (tol==null?0.05:tol);

const DAY = 86400000, HOUR = 36e5;
const T0 = 1750000000000;

// ── sandbox ─────────────────────────────────────────────────────────────────
function makeCtx(opts) {
  const o = opts || {};
  const sb = { Math, Number, JSON, Array, String, Object, Set, Date, isFinite, Intl,
    console: { warn(){}, log(){}, debug(){} } };
  sb.window = undefined;
  vm.createContext(sb);
  // Real currency chain. Base is a parameter of every scenario.
  sb.baseCurrency = o.baseCurrency || 'USD';
  sb.usdToEur = (o.usdToEur != null) ? o.usdToEur : 0.92;
  sb.lang = 'es';
  sb._aurixFxRate = o.fxRate || (c => ({ USD: 1, EUR: sb.usdToEur })[String(c).toUpperCase()]);
  ['formatCurrency','toBase'].forEach(n => vm.runInContext(fnSrc(n), sb));
  // Authoritative history rows are an INPUT (the authority-selection subsystem
  // is certified elsewhere); everything computed FROM them is real.
  sb.__rows = o.rows || [];
  sb.categoryHistory = sb.__rows;
  sb._aurixHistorySourceForDisplay = () => sb.__rows;
  sb.__epoch = o.epoch || 0;
  sb._aurixPortfolioEpoch = () => sb.__epoch;
  sb.investableValueBase = () => 0;                       // anchor falls back to last snapshot
  sb.__canDisplay = (o.canDisplay === undefined) ? { ok: true } : o.canDisplay;
  sb.canDisplayCanonicalReturn = () => sb.__canDisplay;
  sb.activeRange = 'all';
  // REAL flow ledger over a real storage shim → tombstones + epoch exercised.
  sb.__store = {};
  sb.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(sb.__store, k) ? sb.__store[k] : null),
    setItem: (k, v) => { sb.__store[k] = String(v); },
    removeItem: k => { delete sb.__store[k]; },
  };
  vm.runInContext(konstSrc('_AURIX_CAPITAL_FLOWS_KEY'), sb);
  vm.runInContext(konstSrc('_WSC_INTERNAL_KINDS'), sb);
  vm.runInContext(konstSrc('_AURIX_WN12_BOUNDED_RANGE_SPAN_GUARD'), sb);
  vm.runInContext(konstSrc('_AURIX_WN12_MIN_SPAN_RETENTION'), sb);
  vm.runInContext(konstSrc('_AURIX_WN12_BOUNDED_RANGES'), sb);
  vm.runInContext(konstSrc('_AURIX_RETURN_MIN_HISTORY_MS'), sb);
  vm.runInContext(konstSrc('_AURIX_RETURN_COMPARABLE_RATIO'), sb);
  vm.runInContext(konstSrc('_AURIX_INVPERF_UNEXPLAINED_JUMP_PCT'), sb);
  vm.runInContext(konstSrc('_AURIX_INVPERF_HIGH_CONFIDENCE_OBS'), sb);
  vm.runInContext(konstSrc('_AURIX_FLOW_MATCH_REL_TOL'), sb);
  // `_aurixFlowCounterpartObserved` es REAL: es el contrato de la sección O y el
  // predicado que Pass B ya usaba. Stubearlo desactivaría justo lo que se certifica.
  ['_aurixPointValuationIncomplete','_aurixFlowIsInternal','_aurixLoadCapitalFlows',
   '_aurixInvestableSnapshots','_aurixEligibleInvestableSeries','_aurixTwrChain',
   '_aurixFlowCounterpartObserved','_aurixInvestablePerformance']
    .forEach(n => vm.runInContext(fnSrc(n), sb));
  (o.extra || []).forEach(src => vm.runInContext(src, sb));
  // The ledger must be written under the REAL key. `_AURIX_CAPITAL_FLOWS_KEY` is a
  // `const` inside the VM context, so it is lexical and NOT a property of the
  // sandbox object — writing `sb.__store[sb._AURIX_CAPITAL_FLOWS_KEY]` from here
  // silently stored it under "undefined" and every flow test ran against an EMPTY
  // ledger. Assign from inside the context so the key is the one the real reader uses.
  if (o.flows) vm.runInContext('__store[_AURIX_CAPITAL_FLOWS_KEY] = ' + JSON.stringify(JSON.stringify(o.flows)), sb);
  return sb;
}
const run = (expr, ctx) => vm.runInContext(expr, ctx);
const perf = (o, range) => { const c = makeCtx(o); return run('_aurixInvestablePerformance(' + JSON.stringify(range || 'all') + ')', c); };

// Authoritative-source row: USD `total` + USD `real_estate`, as the real
// snapshot writer stores them. investable = total − real_estate.
const row = (dayOffset, total, re, extra) =>
  Object.assign({ ts: T0 + dayOffset * DAY, total: total, real_estate: re || 0 }, extra || {});
// Daily investable series with no real estate.
const inv = vals => vals.map((v, i) => row(i, v, 0));

// Run a scenario in BOTH base currencies — a percentage must be scale-invariant,
// so any double conversion of the USD flow ledger shows up as a mismatch.
function bothBases(o, range) {
  const usd = perf(Object.assign({}, o, { baseCurrency: 'USD' }), range);
  const eur = perf(Object.assign({}, o, { baseCurrency: 'EUR' }), range);
  return { usd, eur, agree: (usd.valid === eur.valid) &&
    ((usd.returnPct == null && eur.returnPct == null) || near(usd.returnPct, eur.returnPct, 0.02)) };
}

console.log('AURIX-INT-INVESTABLE-PERFORMANCE — SPEC INT.02 · Investable Performance Truth\n');

// ════════════════════════════════════════════════════════════════════════════
// 0 · ONE FORMULA
// ════════════════════════════════════════════════════════════════════════════
console.log('0 · One formula, one owner:');
{
  ok('0.1 the TWR core is extracted and shared, not duplicated',
    /function _aurixTwrChain\(/.test(app)
    && /_aurixTwrChain\(snaps,/.test(app)          // legacy headless caller
    && /_aurixTwrChain\(pts, flows\)/.test(app));  // investable caller
  const chainCount = (app.match(/Modified-Dietz|Modified-\n\/\/ Dietz/g) || []).length;
  ok('0.2 the owner reads the investable series, never portfolioHistory',
    /_aurixEligibleInvestableSeries\(r\)/.test(fnSrc('_aurixInvestablePerformance'))
    && !/portfolioHistory/.test(fnSrc('_aurixInvestablePerformance')), 'chainDocs=' + chainCount);
  ok('0.3 EVERY recorded flow is neutralised, whatever its kind',
    /for \(const f of inWindow\)/.test(fnSrc('_aurixInvestablePerformance'))
    && !/const external = inWindow\.filter/.test(fnSrc('_aurixInvestablePerformance')));
  ok('0.4 the publication contract exposes the SPEC structure',
    ['valid','returnPct','range','startAt','endAt','observations','flowCount','confidence','fallbackReason']
      .every(k => new RegExp('\\b' + k + '\\b').test(fnSrc('_aurixInvestablePerformance'))));
}

// ════════════════════════════════════════════════════════════════════════════
// A · A DEPOSIT IS NOT RETURN
// ════════════════════════════════════════════════════════════════════════════
console.log('\nA · 10.000 → +10.000 deposit → 20.000, market 0% ⇒ 0%:');
{
  const o = {
    rows: inv([10000, 10000, 10000, 20000, 20000, 20000, 20000]),
    flows: [{ id: 'd1', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'deposit' }],
  };
  const r = perf(o);
  ok('A.1 valid', r.valid === true, r.fallbackReason);
  ok('A.2 return is 0%, not +100%', near(r.returnPct, 0), 'returnPct=' + r.returnPct);
  ok('A.3 the deposit was counted as external capital', r.flowCount === 1, 'flowCount=' + r.flowCount);
  ok('A.4 identical in EUR base (no double conversion)', bothBases(o).agree,
    JSON.stringify([bothBases(o).usd.returnPct, bothBases(o).eur.returnPct]));
}

// ════════════════════════════════════════════════════════════════════════════
// B · PURE MARKET MOVE
// ════════════════════════════════════════════════════════════════════════════
console.log('\nB · 10.000 → market +10% → 11.000 ⇒ +10%:');
{
  const o = { rows: inv([10000, 10200, 10400, 10600, 10800, 10900, 11000]), flows: [] };
  const r = perf(o);
  ok('B.1 valid', r.valid === true, r.fallbackReason);
  ok('B.2 return is +10%', near(r.returnPct, 10, 0.02), 'returnPct=' + r.returnPct);
  ok('B.3 no external flows were needed', r.flowCount === 0);
  ok('B.4 identical in EUR base', bothBases(o).agree);
  ok('B.5 confidence reflects observation density', r.confidence === 'medium' || r.confidence === 'high', r.confidence);
}

// ════════════════════════════════════════════════════════════════════════════
// C · MARKET GAIN THEN A DEPOSIT — the case an additive offset gets wrong
// ════════════════════════════════════════════════════════════════════════════
console.log('\nC · +10% market, then a 5.000 deposit, then flat ⇒ still +10%:');
{
  const o = {
    rows: inv([10000, 11000, 16000, 16000, 16000]),
    flows: [{ id: 'd2', ts: T0 + 1.5 * DAY, amountUSD: 5000, kind: 'deposit' }],
  };
  const r = perf(o);
  ok('C.1 valid', r.valid === true, r.fallbackReason);
  ok('C.2 the return still reflects ONLY the market (+10%)', near(r.returnPct, 10, 0.05), 'returnPct=' + r.returnPct);
  // The value-change reading would be +60%; an additive-offset reading ≈ +6.7%.
  ok('C.3 it is neither the value change (+60%) nor an additive approximation (≈+6.7%)',
    !near(r.returnPct, 60, 1) && !near(r.returnPct, 6.67, 1), 'returnPct=' + r.returnPct);
  ok('C.4 identical in EUR base', bothBases(o).agree);
}

// ════════════════════════════════════════════════════════════════════════════
// D · A WITHDRAWAL IS NOT A LOSS
// ════════════════════════════════════════════════════════════════════════════
console.log('\nD · withdrawal with no market move ⇒ 0%:');
{
  const o = {
    rows: inv([100000, 100000, 100000, 70000, 70000, 70000, 70000]),
    flows: [{ id: 'w1', ts: T0 + 2.5 * DAY, amountUSD: -30000, kind: 'withdrawal' }],
  };
  const r = perf(o);
  ok('D.1 valid', r.valid === true, r.fallbackReason);
  ok('D.2 return is 0%, not −30%', near(r.returnPct, 0), 'returnPct=' + r.returnPct);
  ok('D.3 identical in EUR base', bothBases(o).agree);
}

// ════════════════════════════════════════════════════════════════════════════
// E · AN INTERNAL TRADE IS NOT CAPITAL
// ════════════════════════════════════════════════════════════════════════════
console.log('\nE · a trade is capital, not performance:');
{
  // CORRECTED AFTER REVIEW. The first version of this case fed a FLAT series
  // alongside a 20.000 `asset_add` — a state that cannot exist in Aurix. A
  // non-cash buy raises `qty` with NO cash leg deducted, and a non-cash sell
  // reduces the asset with NO proceeds credited (WN.8 AUDIT note on the sell
  // path), so a trade DOES move investable value. The certified badge contract
  // says so explicitly: "a capital flow (deposit/withdrawal/asset add/remove) is
  // NEVER counted as market return on ANY range".
  const addRows = inv([100000, 100000, 100000, 120000, 120000, 120000, 120000]);
  const add = perf({ rows: addRows, flows: [{ id: 'a1', ts: T0 + 2.5 * DAY, amountUSD: 20000, kind: 'asset_add' }] });
  ok('E.1 a 20.000 BTC add on a flat portfolio yields 0%, not +20%',
    add.valid === true && near(add.returnPct, 0) && add.flowCount === 1,
    JSON.stringify({ v: add.valid, pct: add.returnPct, f: add.flowCount, why: add.fallbackReason }));

  const sellRows = inv([100000, 100000, 100000, 80000, 80000, 80000, 80000]);
  const sell = perf({ rows: sellRows, flows: [{ id: 'r1', ts: T0 + 2.5 * DAY, amountUSD: -20000, kind: 'asset_remove' }] });
  ok('E.2 a 20.000 sell with no cash leg yields 0%, not −20%',
    sell.valid === true && near(sell.returnPct, 0),
    JSON.stringify({ pct: sell.returnPct, why: sell.fallbackReason }));

  // The reviewer's compounding scenario: four ~20% adds, market flat throughout.
  const comp = [row(0, 100000, 0), row(1, 120000, 0), row(2, 144000, 0), row(3, 172800, 0), row(4, 207360, 0)];
  const compFlows = [
    { id: 'c1', ts: T0 + 0.5 * DAY, amountUSD: 20000, kind: 'asset_add' },
    { id: 'c2', ts: T0 + 1.5 * DAY, amountUSD: 24000, kind: 'asset_add' },
    { id: 'c3', ts: T0 + 2.5 * DAY, amountUSD: 28800, kind: 'asset_add' },
    { id: 'c4', ts: T0 + 3.5 * DAY, amountUSD: 34560, kind: 'asset_add' },
  ];
  const compounded = perf({ rows: comp, flows: compFlows });
  ok('E.3 four compounding adds with a flat market yield 0%, not +107%',
    compounded.valid === true && near(compounded.returnPct, 0, 0.2) && compounded.flowCount === 4,
    JSON.stringify({ v: compounded.valid, pct: compounded.returnPct, f: compounded.flowCount }));

  // import_baseline behaves the same way.
  const imp = perf({ rows: inv([100000, 100000, 100000, 130000, 130000, 130000]),
                     flows: [{ id: 'ib', ts: T0 + 2.5 * DAY, amountUSD: 30000, kind: 'import_baseline' }] });
  ok('E.4 an import_baseline is capital, not return',
    imp.valid === true && near(imp.returnPct, 0), JSON.stringify({ pct: imp.returnPct, why: imp.fallbackReason }));

  // An unknown / legacy kind must ALSO be neutralised — fail-safe direction.
  const unknown = perf({ rows: inv([50000, 50000, 50000, 60000, 60000, 60000]),
                         flows: [{ id: 'u1', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'manual_adjustment' }] });
  ok('E.5 an unrecognised kind is neutralised, never counted as market return',
    unknown.valid === true && near(unknown.returnPct, 0) && unknown.flowCount === 1,
    JSON.stringify({ pct: unknown.returnPct, f: unknown.flowCount }));

  // A genuinely value-preserving rebalance nets to ~0 and leaves the market intact.
  const reb = perf({ rows: inv([10000, 10500, 11000, 11000, 11000]),
                     flows: [{ id: 'rs', ts: T0 + 1.5 * DAY, amountUSD: -4000, kind: 'asset_remove' },
                             { id: 'rb', ts: T0 + 1.5 * DAY, amountUSD: 4000,  kind: 'asset_add' }] });
  ok('E.6 a value-preserving rebalance leaves the market return intact (+10%)',
    reb.valid === true && near(reb.returnPct, 10, 0.05), 'returnPct=' + reb.returnPct);

  ok('E.7 the same money recorded as deposit or as asset_add gives the SAME answer',
    near(perf({ rows: addRows, flows: [{ id: 'd', ts: T0 + 2.5 * DAY, amountUSD: 20000, kind: 'deposit' }] }).returnPct,
         add.returnPct, 0.01));
}

// ════════════════════════════════════════════════════════════════════════════
// F/G · REAL ESTATE CANNOT TOUCH INVESTABLE RETURN
// ════════════════════════════════════════════════════════════════════════════
console.log('\nF/G · real-estate revaluation / removal ⇒ investable return INTACT:');
{
  // Investable is a constant 20.000 while the property is revalued 380k → 420k.
  const reval = [row(0, 400000, 380000), row(1, 400000, 380000), row(2, 400000, 380000),
                 row(3, 440000, 420000), row(4, 440000, 420000), row(5, 440000, 420000)];
  const r = perf({ rows: reval, flows: [] });
  ok('F.1 a 380k→420k revaluation yields 0% investable return',
    r.valid === true && near(r.returnPct, 0), JSON.stringify({ pct: r.returnPct, why: r.fallbackReason }));
  ok('F.2 the denominator is investable only (20.000, not 400.000)',
    near(r.startValue, 20000, 1) && near(r.endValue, 20000, 1), JSON.stringify([r.startValue, r.endValue]));

  // Property DELETED mid-series; investable untouched.
  const del = [row(0, 400000, 380000), row(1, 400000, 380000), row(2, 400000, 380000),
               row(3, 20000, 0), row(4, 20000, 0), row(5, 20000, 0)];
  const rd = perf({ rows: del, flows: [] });
  ok('G.1 deleting the property yields 0% investable return',
    rd.valid === true && near(rd.returnPct, 0), JSON.stringify({ pct: rd.returnPct, why: rd.fallbackReason }));

  // Real market move UNDER a moving property: only the market part survives.
  const mixed = [row(0, 400000, 380000), row(1, 401000, 380000), row(2, 402000, 380000),
                 row(3, 442000, 420000), row(4, 421000, 399000), row(5, 422000, 400000)];
  const rm = perf({ rows: mixed, flows: [] });
  ok('G.2 with the property moving, only the investable +10% survives',
    rm.valid === true && near(rm.returnPct, 10, 0.6), JSON.stringify({ pct: rm.returnPct, s: rm.startValue, e: rm.endValue }));
  ok('G.3 real estate is excluded by construction, not by heuristic',
    /total\s*-\s*re|\)\s*-\s*re;/.test(fnSrc('_aurixInvestableSnapshots')));
}

// ════════════════════════════════════════════════════════════════════════════
// H · CURRENCY — one conversion, never two
// ════════════════════════════════════════════════════════════════════════════
console.log('\nH · cash/FX inside investable wealth, no double conversion:');
{
  // Escenario COHERENTE: el depósito de 2.000 tiene su escalón en la serie, como
  // exige la sección O. Con el input anterior (subida de 500) el caso comparaba
  // dos fail-closed y la igualdad entre divisas se cumplía trivialmente.
  const o = { rows: inv([10000, 12500, 13000, 13000]),
              flows: [{ id: 'd3', ts: T0 + 0.5 * DAY, amountUSD: 2000, kind: 'deposit' }] };
  const b = bothBases(o);
  ok('H.1 the percentage is identical in USD base and EUR base', b.agree,
    JSON.stringify([b.usd.returnPct, b.eur.returnPct]));
  ok('H.2 the EUR values really are converted (0,92×), so H.1 is not trivial',
    near(b.eur.startValue, b.usd.startValue * 0.92, 1) && b.eur.startValue !== b.usd.startValue,
    JSON.stringify([b.usd.startValue, b.eur.startValue]));
  ok('H.3 flows are converted exactly once in the owner',
    (fnSrc('_aurixInvestablePerformance').match(/toBase\(/g) || []).length === 1);
  // A third base with a real pivot rate must also agree.
  const gbp = perf(Object.assign({}, o, { baseCurrency: 'GBP', fxRate: c => ({ USD: 1, GBP: 0.79, EUR: 0.92 })[String(c).toUpperCase()] }));
  ok('H.4 a third base currency (GBP, USD pivot) gives the same percentage',
    near(gbp.returnPct, b.usd.returnPct, 0.05), JSON.stringify([b.usd.returnPct, gbp.returnPct]));
}

// ════════════════════════════════════════════════════════════════════════════
// I · UNRECONCILABLE / INCOMPLETE ⇒ FAIL CLOSED
// ════════════════════════════════════════════════════════════════════════════
console.log('\nI · incomplete or unexplained data ⇒ no figure:');
{
  // An unexplained no-flow capital move.
  const jump = perf({ rows: inv([100000, 100000, 100000, 50000, 50000, 50000]), flows: [] });
  ok('I.1 a 50% no-flow move is not published',
    jump.valid === false && jump.returnPct === null && jump.fallbackReason === 'unexplained_capital_event',
    JSON.stringify({ v: jump.valid, why: jump.fallbackReason }));

  // THE INT.01 FINDING, now closed: one small recorded flow beside a large
  // unrecorded capital event. The legacy guard only watched flow-FREE intervals.
  const bypass = perf({ rows: inv([100000, 100000, 100000, 60000, 60000, 60000]),
                        flows: [{ id: 'sm', ts: T0 + 2.5 * DAY, amountUSD: 500, kind: 'deposit' }] });
  ok('I.2 a flow-bearing interval no longer bypasses the coverage guard',
    bypass.valid === false && bypass.returnPct === null && bypass.fallbackReason === 'unexplained_capital_event',
    JSON.stringify({ v: bypass.valid, why: bypass.fallbackReason, pct: bypass.returnPct }));

  // Incomplete snapshots are dropped by the REAL predicate.
  const incomplete = perf({ rows: [row(0, 10000, 0), row(1, 10500, 0, { valuationComplete: false }),
                                   row(2, 11000, 0, { fxPartial: true }), row(3, 11500, 0)], flows: [] });
  ok('I.3 fx-partial / valuation-incomplete snapshots never enter the window',
    incomplete.observations === 2, 'observations=' + incomplete.observations);

  // Broken FX ⇒ nothing publishable (the series filter rejects NaN first).
  const noFx = perf({ rows: inv([10000, 10500, 11000, 11500]), flows: [], baseCurrency: 'GBP', fxRate: () => NaN });
  ok('I.4 unavailable FX yields no figure at all',
    noFx.valid === false && noFx.returnPct === null, JSON.stringify({ v: noFx.valid, why: noFx.fallbackReason }));

  // Display authority not yet confirmed ⇒ Intelligence must not front-run it.
  const pending = perf({ rows: inv([10000, 10200, 10500, 11000]), flows: [], canDisplay: { ok: false, reason: 'x' } });
  ok('I.5 while canonical history is unconfirmed, no figure is published',
    pending.valid === false && pending.fallbackReason === 'awaiting_canonical_history', pending.fallbackReason);

  // A tombstoned flow is not read (REAL ledger behaviour).
  const tomb = perf({ rows: inv([10000, 10000, 10000, 20000, 20000, 20000]),
                      flows: [{ id: 'dz', ts: T0 + 2.5 * DAY, amountUSD: 10000, kind: 'deposit', deletedAt: T0 + 3 * DAY }] });
  ok('I.6 a deleted (tombstoned) flow is not silently used as neutralisation',
    tomb.flowCount === 0 && tomb.valid === false && tomb.fallbackReason === 'unexplained_capital_event',
    JSON.stringify({ ext: tomb.flowCount, v: tomb.valid, why: tomb.fallbackReason }));
}

// ════════════════════════════════════════════════════════════════════════════
// J · EPOCH / REGIME BOUNDARY
// ════════════════════════════════════════════════════════════════════════════
console.log('\nJ · epoch and regime boundaries ⇒ never a false figure:');
{
  // Pre-epoch points must not enter the window.
  const epoch = T0 + 3 * DAY;
  const e = perf({ rows: inv([1000, 2000, 5000, 10000, 10200, 10500, 11000]), epoch });
  ok('J.1 pre-epoch snapshots are excluded from the window',
    e.startAt != null && e.startAt >= epoch, 'startAt=' + (e.startAt ? (e.startAt - T0) / DAY + 'd' : null));

  // A baseline from a different capital regime is rejected, range-aware. Built
  // INTRA-DAY so the points genuinely sit inside the 24 h window (24H admits only
  // the last day, so a daily series would leave just two points in range).
  const hourly = [0, 1, 2, 3].map(h => ({ ts: T0 + h * HOUR, total: 100000 + h * 10000, real_estate: 0 }));
  const wide = perf({ rows: hourly }, '24h');
  ok('J.2 a baseline outside the range\'s plausible market ratio (1,30 > 1,20) is not published',
    wide.valid === false && wide.fallbackReason === 'baseline_not_comparable',
    JSON.stringify({ v: wide.valid, why: wide.fallbackReason }));
  ok('J.3 the same series IS publishable on a range whose ratio allows it (all: 1,30 <= 3,00)',
    perf({ rows: hourly }, 'all').valid === true, JSON.stringify(perf({ rows: hourly }, 'all').fallbackReason));

  // The trust band excludes a mid-series real-estate-polluted outlier.
  const polluted = perf({ rows: [row(0, 20000, 0), row(1, 20500, 0), row(2, 420000, 0),
                                 row(3, 21000, 0), row(4, 21500, 0), row(5, 22000, 0)], flows: [] });
  ok('J.4 an out-of-band polluted snapshot cannot become a baseline or endpoint',
    polluted.valid === true && near(polluted.returnPct, 10, 3) && polluted.observations === 5,
    JSON.stringify({ pct: polluted.returnPct, obs: polluted.observations, why: polluted.fallbackReason }));
}

// ════════════════════════════════════════════════════════════════════════════
// K · GAPS / INSUFFICIENT SERIES
// ════════════════════════════════════════════════════════════════════════════
console.log('\nK · insufficient series ⇒ not certifiable:');
{
  const empty = perf({ rows: [], flows: [] });
  ok('K.1 no history ⇒ insufficient_observations',
    empty.valid === false && empty.returnPct === null && empty.fallbackReason === 'insufficient_observations');
  const one = perf({ rows: inv([10000]), flows: [] });
  ok('K.2 one snapshot ⇒ insufficient_observations',
    one.valid === false && one.fallbackReason === 'insufficient_observations', one.fallbackReason);
  // Two snapshots seconds apart: a window too short to mean anything.
  const brief = perf({ rows: [{ ts: T0, total: 10000, real_estate: 0 }, { ts: T0 + 5000, total: 10400, real_estate: 0 }], flows: [] });
  ok('K.3 a window under the min-history floor ⇒ window_too_short',
    brief.valid === false && brief.fallbackReason === 'window_too_short', brief.fallbackReason);
  // A long gap in the middle is still a real, publishable series (real points only).
  const gap = perf({ rows: [row(0, 10000, 0), row(1, 10200, 0), row(20, 10800, 0), row(21, 11000, 0)], flows: [] });
  ok('K.4 a sparse series with a genuine gap is published from REAL points only',
    gap.valid === true && gap.observations === 4 && near(gap.returnPct, 10, 0.05),
    JSON.stringify({ obs: gap.observations, pct: gap.returnPct }));
  ok('K.5 corrupt rows never produce a figure',
    perf({ rows: [row(0, NaN, 0), row(1, 0, 0), row(2, -5000, 0)], flows: [] }).valid === false);
}

// ════════════════════════════════════════════════════════════════════════════
// L · RANGE COHERENCE
// ════════════════════════════════════════════════════════════════════════════
console.log('\nL · 24H / 7D coherent with their own windows:');
{
  // 30 days of gentle history; the window anchor is the LAST snapshot ts.
  const rows = Array.from({ length: 31 }, (_, i) => row(i, 10000 + i * 20, 0));
  const nowRef = rows[rows.length - 1].ts;
  const r24 = perf({ rows, flows: [] }, '24h');
  const r7  = perf({ rows, flows: [] }, '7d');
  const rAll = perf({ rows, flows: [] }, 'all');
  ok('L.1 24H reads only the last 24 h',
    r24.valid === true && r24.startAt >= nowRef - DAY - 1, 'startAt=-' + ((nowRef - r24.startAt) / HOUR).toFixed(1) + 'h');
  ok('L.2 7D reads only the last 7 days',
    r7.valid === true && r7.startAt >= nowRef - 7 * DAY - 1, 'startAt=-' + ((nowRef - r7.startAt) / DAY).toFixed(1) + 'd');
  ok('L.3 each window ends on the same last observation',
    r24.endAt === r7.endAt && r7.endAt === rAll.endAt && r24.endAt === nowRef);
  ok('L.4 a wider window observes more and returns more',
    rAll.observations > r7.observations && r7.observations > r24.observations
    && rAll.returnPct > r7.returnPct && r7.returnPct > r24.returnPct,
    JSON.stringify({ o: [r24.observations, r7.observations, rAll.observations], p: [r24.returnPct, r7.returnPct, rAll.returnPct] }));
  ok('L.5 the window is anchored on the last SNAPSHOT, not the device clock',
    /nowRef/.test(fnSrc('_aurixInvestableSnapshots')) && r24.endAt === nowRef);
  // A deposit inside the 24H window is neutralised for 24H too.
  const rows2 = rows.slice();
  rows2.push(row(30.5, 10600 + 1000, 0), row(31, 10620 + 1000, 0));
  const d24 = perf({ rows: rows2, flows: [{ id: 'l1', ts: T0 + 30.4 * DAY, amountUSD: 1000, kind: 'deposit' }] }, '24h');
  ok('L.6 a deposit inside the 24H window does not become 24H performance',
    d24.valid === true && d24.flowCount === 1 && Math.abs(d24.returnPct) < 1.5,
    JSON.stringify({ v: d24.valid, pct: d24.returnPct, f: d24.flowCount, why: d24.fallbackReason }));
  ok('L.7 and the +9,6% value change is never what 24H publishes',
    !(d24.valid === true && d24.returnPct > 5), 'pct=' + d24.returnPct);
  // A deposit large enough to shift the capital regime inside 24H fails CLOSED
  // rather than publishing the value change.
  const big = perf({ rows: rows.concat([row(30.5, 10600 + 5000, 0), row(31, 10620 + 5000, 0)]),
                     flows: [{ id: 'l2', ts: T0 + 30.4 * DAY, amountUSD: 5000, kind: 'deposit' }] }, '24h');
  ok('L.8 a regime-shifting deposit inside 24H fails closed, never publishes +47%',
    big.valid === false && big.returnPct === null, JSON.stringify({ v: big.valid, why: big.fallbackReason }));
}

// ════════════════════════════════════════════════════════════════════════════
// M · THE CONSUMER
// ════════════════════════════════════════════════════════════════════════════
console.log('\nM · Intelligence consumes it and defines nothing:');
{
  const g = fnSrc('_intccGrowthPct');
  ok('M.1 Intelligence sources return ONLY from this owner',
    /_aurixInvestablePerformance\('all'\)/.test(g) && !/portfolioHistory/.test(g) && !/computeAurixTWRSeries/.test(g));
  ok('M.2 it publishes only on valid === true', /perf\.valid !== true\) return null/.test(g));
  ok('M.3 it re-derives nothing', !/[-+*/]\s*100|\/\s*first/.test(g.replace(/\/\/[^\n]*/g, '')));
}

// ════════════════════════════════════════════════════════════════════════════
// N · NON-VACUITY
// ════════════════════════════════════════════════════════════════════════════
console.log('\nN · Non-vacuity: each protection is load-bearing:');
{
  const chainSrc = fnSrc('_aurixTwrChain');
  // N.1 — restricting neutralisation to deposit/withdrawal (the pre-review
  // perimeter) DOES publish contributed capital as return.
  {
    const c = makeCtx({ rows: inv([100000, 100000, 100000, 120000, 120000, 120000, 120000]),
                        flows: [{ id: 'a1', ts: T0 + 2.5 * DAY, amountUSD: 20000, kind: 'asset_add' }] });
    vm.runInContext(`function _badExternalOnly(){
      const pts = _aurixEligibleInvestableSeries('all').series;
      const fl = _aurixLoadCapitalFlows()
                  .filter(f => f.kind === 'deposit' || f.kind === 'withdrawal')
                  .filter(f => f.ts > pts[0].ts && f.ts <= pts[pts.length-1].ts)
                  .map(f => ({ ts: f.ts, amount: toBase(f.amountUSD,'USD') }));
      const ch = _aurixTwrChain(pts, fl);
      return ch.values[ch.values.length-1] - 100;
    }`, c);
    const bad = run('_badExternalOnly()', c);
    ok('N.1 a deposit/withdrawal-only perimeter DOES publish a 20.000 add as +' + bad.toFixed(1) + '% (case E is load-bearing)',
      bad > 19, 'bad=' + bad);
  }
  // N.2 — use TOTAL wealth instead of investable ⇒ case F publishes +10%.
  {
    const c = makeCtx({ rows: [row(0, 400000, 380000), row(1, 400000, 380000), row(2, 400000, 380000),
                               row(3, 440000, 420000), row(4, 440000, 420000)], flows: [] });
    vm.runInContext(`function _badTotal(){
      const pts = __rows.map(p => ({ ts: p.ts, value: toBase(p.total,'USD') }));
      const ch = _aurixTwrChain(pts, []);
      return ch.values[ch.values.length-1] - 100;
    }`, c);
    const bad = run('_badTotal()', c);
    ok('N.2 measuring TOTAL wealth DOES publish +' + bad.toFixed(1) + '% for a revaluation (case F is load-bearing)',
      bad > 9, 'bad=' + bad);
  }
  // N.3 — the old no-flow-only coverage guard ⇒ case I.2 slips through.
  {
    const c = makeCtx({ rows: inv([100000, 100000, 100000, 60000, 60000, 60000]),
                        flows: [{ id: 'sm', ts: T0 + 2.5 * DAY, amountUSD: 500, kind: 'deposit' }] });
    vm.runInContext(`function _badGuard(){
      const pts = _aurixEligibleInvestableSeries('all').series;
      const fl = _aurixLoadCapitalFlows().filter(f => f.kind==='deposit'||f.kind==='withdrawal')
                  .filter(f => f.ts > pts[0].ts && f.ts <= pts[pts.length-1].ts)
                  .map(f => ({ ts: f.ts, amount: toBase(f.amountUSD,'USD') }));
      const ch = _aurixTwrChain(pts, fl);
      return { noFlow: ch.maxNoFlowJumpPct, any: ch.maxIntervalJumpPct,
               pct: ch.values[ch.values.length-1] - 100 };
    }`, c);
    const d = run('_badGuard()', c);
    ok('N.3 the no-flow-only guard sees ' + d.noFlow.toFixed(1) + '% and would publish ' + d.pct.toFixed(1) +
       '%, while the all-interval guard sees ' + d.any.toFixed(1) + '% (case I.2 is load-bearing)',
      d.noFlow < 40 && d.any >= 40 && d.pct < -20, JSON.stringify(d));
  }
  // N.4 — the additive-offset method really does disagree on case C.
  {
    const c = makeCtx({ rows: inv([10000, 11000, 16000, 16000, 16000]),
                        flows: [{ id: 'd2', ts: T0 + 1.5 * DAY, amountUSD: 5000, kind: 'deposit' }] });
    vm.runInContext(`function _additive(){
      const pts = _aurixEligibleInvestableSeries('all').series;
      const vals = pts.map(p => p.value);
      const off = new Array(vals.length).fill(0);
      off[2] = 5000;                                  // the deposit step
      let run_ = 0; const cum = vals.map((_, i) => (run_ += off[i]));
      const last = cum[cum.length-1];
      const adj = vals.map((v,i) => v - cum[i] + last);
      return ((adj[adj.length-1] - adj[0]) / adj[0]) * 100;
    }`, c);
    const add = run('_additive()', c);
    ok('N.4 an additive-offset reading gives ' + add.toFixed(2) + '%, not the TWR +10% (case C is load-bearing)',
      add > 4 && add < 9, 'additive=' + add);
  }
  // N.5 — double-converting the ledger breaks base agreement.
  {
    // El depósito DEBE tener su contrapartida en la serie (sección O): un +2.000
    // sobre una serie que sólo sube 500 es un estado que no puede existir, y con él
    // el caso fijaba su conclusión sobre un input imposible.
    const o = { rows: inv([10000, 12500, 13000, 13000]),
                flows: [{ id: 'd3', ts: T0 + 0.5 * DAY, amountUSD: 2000, kind: 'deposit' }] };
    const c = makeCtx(Object.assign({}, o, { baseCurrency: 'EUR' }));
    vm.runInContext(`function _doubleConv(){
      const pts = _aurixEligibleInvestableSeries('all').series;
      const fl = _aurixLoadCapitalFlows().filter(f => f.kind==='deposit')
                  .map(f => ({ ts: f.ts, amount: toBase(toBase(f.amountUSD,'USD'),'USD') }));
      const ch = _aurixTwrChain(pts, fl);
      return ch.values[ch.values.length-1] - 100;
    }`, c);
    const dbl = run('_doubleConv()', c);
    const good = perf(Object.assign({}, o, { baseCurrency: 'EUR' })).returnPct;
    ok('N.5 double-converting the ledger DOES change the answer (' + dbl.toFixed(2) + '% vs ' + good.toFixed(2) + '%) — case H is load-bearing',
      !near(dbl, good, 0.05), JSON.stringify([dbl, good]));
  }
  ok('N.6 the all-interval guard exists in the shared core',
    /maxIntervalJumpPct/.test(chainSrc) && /maxIntervalJumpPct/.test(fnSrc('_aurixInvestablePerformance')));
}

// ════════════════════════════════════════════════════════════════════════════
// O · UNMATCHED FLOW ⇒ FAIL-CLOSED   (AURIX-INT02-UNMATCHED-FLOW-FAIL-CLOSED)
// ════════════════════════════════════════════════════════════════════════════
// Defecto MEDIDO con este mismo owner: el guard de cobertura es de MAGNITUD
// (≥40 %), no de EVIDENCIA, así que por debajo de ese umbral se restaba cualquier
// flujo del ledger sin comprobar que el patrimonio se hubiera movido por él.
// −10.000 sobre una serie plana de 50.000 publicaba +20,00 % con `valid:true` y
// confianza `high`; el espejo, −20,00 %. El badge ya exigía contrapartida (Pass B
// de `_aurixFlowNeutralize`), así que dos consumidores del MISMO ledger
// respondían distinto. Aquí se certifica que ya no.
console.log('\nO · un flujo sin contrapartida observable NO se publica:');
{
  const flat50 = inv(Array.from({ length: 10 }, () => 50000));
  const fl = (dayOffset, amountUSD, kind) => [{ id: (kind || 'k') + ':' + dayOffset, ts: T0 + dayOffset * DAY,
                                                amountUSD: amountUSD, kind: kind || 'asset_remove' }];

  const o1 = perf({ rows: flat50, flows: fl(5, -10000, 'asset_remove') });
  ok('O.1 −10.000 sobre 50.000 planos NO publica +20 %: falla cerrado',
    o1.valid === false && o1.returnPct === null && o1.fallbackReason === 'pending_flow_reconciliation',
    JSON.stringify({ v: o1.valid, pct: o1.returnPct, why: o1.fallbackReason }));
  ok('O.2 +10.000 sin subida correspondiente NO publica −20 %: falla cerrado',
    (() => { const x = perf({ rows: flat50, flows: fl(5, 10000, 'deposit') });
             return x.valid === false && x.returnPct === null && x.fallbackReason === 'pending_flow_reconciliation'; })());
  ok('O.3 −10.000 CON su caída observable ⇒ 0 %, publicable',
    (() => { const x = perf({ rows: inv([50000,50000,50000,50000,50000,40000,40000,40000,40000,40000]),
                              flows: fl(5, -10000, 'asset_remove') });
             return x.valid === true && near(x.returnPct, 0) && x.flowCount === 1 && x.unmatchedFlows === 0; })());
  ok('O.4 +10.000 CON su subida observable ⇒ 0 %, publicable',
    (() => { const x = perf({ rows: inv([50000,50000,50000,50000,50000,60000,60000,60000,60000,60000]),
                              flows: fl(5, 10000, 'deposit') });
             return x.valid === true && near(x.returnPct, 0) && x.unmatchedFlows === 0; })());
  ok('O.5 serie plana sin flujos ⇒ 0 % (el guard no toca lo que no tiene flujos)',
    (() => { const x = perf({ rows: flat50, flows: [] });
             return x.valid === true && x.returnPct === 0 && x.flowCount === 0 && x.unmatchedFlows === 0; })());
  // La razón de fallo es la MISMA que la del badge: es el mismo hecho, no dos.
  ok('O.6 la razón publicada es la que ya usa el gate del badge',
    /pending_flow_reconciliation/.test(fnSrc('_aurixInvestablePerformance')) &&
    /pending_flow_reconciliation/.test(fnSrc('_aurixPerformanceSanityCheck')));
  // UN solo criterio: el predicado es compartido, no duplicado.
  ok('O.7 el predicado de contrapartida es UNO y se comparte con Pass B',
    (app.match(/^function _aurixFlowCounterpartObserved\(/gm) || []).length === 1 &&
    /_aurixFlowCounterpartObserved\(/.test(fnSrc('_aurixFlowNeutralize')) &&
    /_aurixFlowCounterpartObserved\(/.test(fnSrc('_aurixInvestablePerformance')) &&
    (app.match(/_AURIX_FLOW_MATCH_REL_TOL = /g) || []).length === 1);
  // La UNIDAD es el neto por intervalo — lo mismo que resta `_aurixTwrChain`.
  // Sin esto, un rebalanceo que conserva valor (E.6) fallaría cerrado: sus dos
  // flujos de ±4.000 no casan por separado con un escalón de +500.
  ok('O.8 un rebalanceo que conserva valor sigue publicando (el neto por intervalo es 0)',
    (() => { const x = perf({ rows: inv([10000, 10500, 11000, 11000, 11000]),
                              flows: [{ id: 'rs', ts: T0 + 1.5 * DAY, amountUSD: -4000, kind: 'asset_remove' },
                                      { id: 'rb', ts: T0 + 1.5 * DAY, amountUSD:  4000, kind: 'asset_add' }] });
             return x.valid === true && near(x.returnPct, 10, 0.05) && x.unmatchedFlows === 0; })());
  ok('O.9 y el guard de MAGNITUD sigue siendo el que atrapa lo grande (≥40 %)',
    (() => { const x = perf({ rows: flat50, flows: fl(5, -25000, 'asset_remove') });
             return x.valid === false && x.fallbackReason === 'unexplained_capital_event'; })());
  // RESIDUAL REGISTRADO, deliberadamente NO resuelto aquí: si el flujo y el
  // snapshot que observa su efecto caen en intervalos distintos, la cadena
  // conserva error. El entorno ±1 del predicado lo deja pasar a propósito —
  // estrecharlo convertiría cadencia gruesa en fail-closed masivo. Pertenece al
  // cierre de Chart/cadencia.
  ok('O.10 residual de cadencia: flujo y caída en intervalos distintos SIGUE publicando (no se aborda aquí)',
    (() => { const x = perf({ rows: inv([50000,50000,50000,50000,50000,50000,40000,40000,40000,40000]),
                              flows: fl(5, -10000, 'asset_remove') });
             return x.valid === true && near(x.returnPct, -4, 0.01); })(),
    'documentado como residual, no como contrato deseado');
}

// ════════════════════════════════════════════════════════════════════════════
// P · M.03 · C — ÍNDICE FLOW-NEUTRAL PUBLICADO Y MÁXIMO CONSERVADO
// ════════════════════════════════════════════════════════════════════════════
// Dos cosas nuevas y una condición que las une: el owner EXPONE la cadena
// flow-neutral con la que ya calculaba el retorno, y `_aurixPeakRetention` la
// convierte en el eje Estabilidad del radar. La condición es que el índice sólo
// exista cuando el retorno es publicable — si el retorno falla cerrado, el eje no
// puede existir por otra vía.
console.log('\nP · índice flow-neutral + máximo conservado (M.03 C):');
{
  const withRet = (o, range) => {
    const c = makeCtx(Object.assign({}, o, {
      extra: [konstSrc('_AURIX_FACT_STATUS'), fnSrc('_aurixPeakRetention')].concat(o.extra || []),
    }));
    return run('_aurixPeakRetention(' + JSON.stringify(range || 'all') + ')', c);
  };
  // 12 observaciones ⇒ confianza alta (≥ _AURIX_INVPERF_HIGH_CONFIDENCE_OBS).
  const rise   = inv([10000, 10200, 10400, 10600, 10800, 11000, 11200, 11400, 11600, 11800, 12000, 12200]);
  // Sube a 12000 y cae a 9600: máxima caída pico-valle = 20 %.
  const dipped = inv([10000, 10500, 11000, 11500, 12000, 11000, 10000,  9600, 10000, 10400, 10800, 11000]);
  const short  = inv([10000, 11000, 9000]);
  // Mismas fixtures de flujo que la sección O (ámbito de bloque distinto).
  const flat50 = inv(Array.from({ length: 10 }, () => 50000));
  const fl = (dayOffset, amountUSD, kind) => [{ id: (kind || 'k') + ':' + dayOffset, ts: T0 + dayOffset * DAY,
    amountUSD: amountUSD, kind: kind || 'deposit' }];

  ok('P.1 el índice se publica con su BASE declarada, no como una segunda serie de patrimonio',
    (() => { const x = perf({ rows: rise });
      return x.valid === true && !!x.index && x.index.basis === 'flow_neutral_index'
        && x.index.unit === 'index' && x.index.base === 100
        && x.index.values.length === x.observations
        && x.index.intervals === x.observations - 1
        && x.index.values[0] === 100; })());
  ok('P.2 el último punto del índice ES el retorno publicado (una sola cadena, no dos)',
    (() => { const x = perf({ rows: dipped });
      return x.valid === true
        && near(x.index.values[x.index.values.length - 1] - 100, x.returnPct, 0.001); })());
  ok('P.3 si el retorno NO es publicable, el índice NO existe (todas las salidas cerradas)',
    (() => {
      const a = perf({ rows: inv([10000]) });                                   // insufficient_observations
      const b = perf({ rows: flat50, flows: fl(5, -25000, 'asset_remove') });   // unexplained_capital_event
      const c = perf({ rows: flat50, flows: fl(5, -10000, 'deposit') });        // pending_flow_reconciliation
      const d = perf({ rows: rise }, '7d');                                     // ventana nominal
      return [a, b, c].every(x => x.valid === false && x.index === null)
        && (d.valid === false ? d.index === null : true); })(),
    JSON.stringify([perf({ rows: inv([10000]) }), perf({ rows: flat50, flows: fl(5, -25000, 'asset_remove') }),
      perf({ rows: flat50, flows: fl(5, -10000, 'deposit') })].map(x => ({ v: x.valid, r: x.fallbackReason, i: x.index === null }))));
  ok('P.4 ESTABILIDAD = 100 − máxima caída pico-valle del índice (cuota natural, sin escala inventada)',
    (() => { const r = withRet({ rows: dipped });
      return r.status === 'available' && r.quality === 'measured'
        && near(r.maxDrawdownPct, 20, 0.2) && r.retentionPct === 80; })(),
    JSON.stringify(withRet({ rows: dipped })));
  ok('P.5 una serie que sólo sube conserva el 100 % de su máximo',
    (() => { const r = withRet({ rows: rise });
      return r.status === 'available' && r.maxDrawdownPct === 0 && r.retentionPct === 100; })());
  // EL GUARD QUE IMPORTA: el drawdown máximo es monótono en la densidad de
  // muestreo, así que con poca historia un 100 no es calma, es ignorancia.
  ok('P.6 con historia inmadura NO publica número: publica que falta historia',
    (() => { const r = withRet({ rows: short });
      return r.status === 'insufficient_history' && r.reason === 'awaiting_observations'
        && r.quality === 'immature' && r.retentionPct === null; })(),
    JSON.stringify(withRet({ rows: short })));
  ok('P.7 la barra de madurez es la que este código YA usaba, no un umbral nuevo',
    /perf\.confidence !== 'high'/.test(fnSrc('_aurixPeakRetention')) &&
    (app.match(/_AURIX_INVPERF_HIGH_CONFIDENCE_OBS = /g) || []).length === 1);
  ok('P.8 hereda la validez del owner certificado: sin retorno publicable, sin eje',
    (() => { const r = withRet({ rows: flat50, flows: fl(5, -10000, 'deposit') });
      return r.status === 'insufficient_history' && r.reason === 'pending_flow_reconciliation'
        && r.retentionPct === null; })());
  ok('P.9 la caída se mide sobre el ÍNDICE, no sobre el patrimonio: una retirada no la fabrica',
    (() => { // −5.000 con su caída observable: el nivel cae un 10 %, el índice no.
      const rows = inv([50000, 50000, 50000, 50000, 50000, 45000, 45000, 45000, 45000, 45000, 45000, 45000]);
      const r = withRet({ rows, flows: fl(5, -5000, 'withdrawal') });
      return r.status === 'available' && r.retentionPct === 100 && r.maxDrawdownPct === 0; })(),
    JSON.stringify(withRet({ rows: inv([50000,50000,50000,50000,50000,45000,45000,45000,45000,45000,45000,45000]), flows: fl(5, -5000, 'withdrawal') })));
  ok('P.10 no se llama ni se calcula "volatilidad", y no hay constante de escala',
    (() => { const src = fnSrc('_aurixPeakRetention');
      return !/volatil/i.test(src) && !/55\s*\+/.test(src) && !/\*\s*2\.2/.test(src)
        && !/45\s*\+/.test(src); })());
  // NO-VACUIDAD: sin el guard de madurez, la serie corta publicaría un número.
  ok('P.11 NON-VACUITY — sin el guard de madurez la serie corta publicaría 82 (18 % de caída)',
    (() => { const c = makeCtx({ rows: short, extra: [konstSrc('_AURIX_FACT_STATUS'),
        fnSrc('_aurixPeakRetention').replace(/if \(perf\.confidence !== 'high'\) \{[\s\S]*?\n    \}/, '')] });
      const r = run('_aurixPeakRetention("all")', c);
      return r.status === 'available' && r.retentionPct === 82; })(),
    JSON.stringify((() => { const c = makeCtx({ rows: short, extra: [konstSrc('_AURIX_FACT_STATUS'),
        fnSrc('_aurixPeakRetention').replace(/if \(perf\.confidence !== 'high'\) \{[\s\S]*?\n    \}/, '')] });
      return run('_aurixPeakRetention("all")', c); })()));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
