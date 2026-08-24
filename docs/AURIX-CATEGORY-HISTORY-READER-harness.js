'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CATEGORY-HISTORY-READER-harness — SPEC AURIX FASE 2.6
// ════════════════════════════════════════════════════════════════════════════
// Aurix persists per-category history server-side (portfolio_snapshots.category_values,
// */15) but could not consume it: the only existing reader of those rows,
// `_aurixNormalizeBackendSnapshot`, projects them onto the chart point shape and
// DROPS category_values. This certifies the read layer that closes that gap and
// certifies just as hard what it must NOT do:
//   · the ONLY history source is the server row; never categoryHistory
//     (AURIX-DATA-001), never the merged display source, never localStorage,
//     never a price provider, never an interpolation;
//   · the denominator is INVESTABLE wealth = total_value_usd − real_estate, so
//     real estate can neither be an exposure nor contaminate one;
//   · an absent category becomes 0 ONLY when the row reconciles to its total —
//     an unreconciled row cannot distinguish "no value" from "not valued", so it
//     is INVALID and never enters a temporal calculation;
//   · the delta unit is PERCENTAGE POINTS, not a relative percentage;
//   · only 24H and 7D exist. 30D/1A/TOTAL are absent by decision;
//   · missing coverage returns insufficient_data, never a degraded number;
//   · NO causality, NO attribution, NO insight, NO materiality rule, NO copy;
//   · Chart, Performance and Intelligence Preview V1 are byte-identical.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const BASELINE = 'e9535ff';

function fnSrcIn(src, name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=src.indexOf('(',i), pd=0; for(;p<src.length;p++){ if(src[p]==='(')pd++; else if(src[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=src.indexOf('{',p), d=0; for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){k++;break;}}}
  return src.slice(i,k); }
function fnSrc(name){ return fnSrcIn(app, name); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }

let pass=0, fail=0, skipped=0;
function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }
// A skip is LOUD and counted: a check that did not run must never read as a check that passed.
function skip(n,why){ skipped++; console.log('  ⊘ SKIP '+n+'  ['+why+']'); }

// The reader block, isolated by its own banner, for the "what it must not contain" assertions.
const BLOCK_START = 'SPEC CATEGORY-HISTORY-READER — the canonical read layer for category_values';
const READER_BLOCK = (function(){
  const i = app.indexOf(BLOCK_START); if (i < 0) throw new Error('reader block not found');
  const j = app.indexOf('── P0-FINAL-PERFORMANCE-KILL-SWITCH-AND-SERVER-CANONICAL', i);
  if (j < 0) throw new Error('reader block end not found');
  return app.slice(i, j);
})();
// Executable surface only (comments carry the rationale and legitimately NAME the
// sources being avoided, so the "never reads X" assertions must look at code).
const READER_CODE = READER_BLOCK.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ── sandbox ──────────────────────────────────────────────────────────────────
let NOW = Date.parse('2026-08-24T12:00:00.000Z');
const sb = { Math, Number, JSON, Array, String, Object, isFinite,
  Date: { now: () => NOW, parse: Date.parse },
  console:{warn:()=>{},log:()=>{},debug:()=>{}}, window:{} };
vm.createContext(sb);
sb._AURIX_BACKEND_SNAPSHOTS_ENABLED = true;
sb._aurixBackendSnapshots = [];
sb._aurixBackendSnapshotsState = 'ready';
sb._aurixBackendAuthClientReady = () => true;
[ '_AURIX_BACKEND_HEALTH','_AURIX_BACKEND_CADENCE_MS','_AURIX_BACKEND_LATE_FACTOR','_AURIX_BACKEND_STALE_FACTOR',
  '_AURIX_CATHIST_CANONICAL','_AURIX_CATHIST_REAL_ESTATE_KEY','_AURIX_CATHIST_INVESTABLE',
  '_AURIX_CATHIST_RECON_ABS_TOL','_AURIX_CATHIST_RECON_REL_TOL','_AURIX_CATHIST_SOURCE_ROW_CAP',
  '_AURIX_CATHIST_WINDOWS' ].forEach(n => vm.runInContext(konstSrc(n), sb));
[ '_aurixBackendHealth','_aurixBackendHealthSnapshot',
  '_aurixCatHistRows','_aurixCatHistValidatePoint','_aurixCatExposurePct','_aurixCatHistWindow','_aurixCatExposureDelta' ]
  .forEach(n => vm.runInContext(fnSrc(n), sb));
// The public read-only surface, exactly as app.js installs it.
vm.runInContext(READER_BLOCK.slice(READER_BLOCK.indexOf("try {\n  if (typeof window !== 'undefined') {")), sb);

const MIN = 60000, H = 3600000, D = 864e5;
// A real capture: the writer sums each valued position into BOTH total and its bucket,
// so a complete row satisfies Σ category_values === total_value_usd, and the
// real_estate column equals the real_estate bucket.
function row(tsOffsetMs, cats, extra){
  const c = Object.assign({}, cats);
  let total = 0; Object.keys(c).forEach(k => { total += c[k]; });
  return Object.assign({ ts: NOW + tsOffsetMs, total_value_usd: +total.toFixed(2), real_estate: +(c.real_estate || 0).toFixed(2),
    category_values: c, source: 'backend_snapshot', confidence: 'scheduled', market_state: 'crypto_24_7', price_staleness: 'live' }, extra || {});
}
// */15 cadence over `days`, linearly interpolating each bucket from `from` to `to`.
function series(days, from, to){
  const out = [], n = Math.floor(days * D / (15 * MIN));
  const keys = Object.keys(Object.assign({}, from, to));
  for (let i = 0; i <= n; i++){
    const f = i / n, cats = {};
    keys.forEach(k => { const a = Number(from[k] || 0), b = Number(to[k] || 0); const v = a + (b - a) * f; if (v > 0) cats[k] = +v.toFixed(2); });
    out.push(row(-(n - i) * 15 * MIN, cats));
  }
  return out;
}
const setRows = r => { sb._aurixBackendSnapshots = r; };
const win   = r => vm.runInContext('_aurixCatHistWindow(' + JSON.stringify(r) + ')', sb);
const delta = (r, c) => vm.runInContext('_aurixCatExposureDelta(' + JSON.stringify(r) + ',' + JSON.stringify(c) + ')', sb);
const validate = r => { sb.__row = r; return vm.runInContext('_aurixCatHistValidatePoint(__row)', sb); };
const expo = (p, c) => { sb.__p = p; return vm.runInContext('_aurixCatExposurePct(__p,' + JSON.stringify(c) + ')', sb); };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

console.log('\n════ AURIX-CATEGORY-HISTORY-READER ════\n');

// ── 1 · The canonical source is the server row ────────────────────────────────
console.log('1 · Source of truth — server-side category_values:');
{
  ok('1.1 the reader reads the RAW server rows (_aurixBackendSnapshots)',
    /_aurixBackendSnapshots/.test(READER_CODE));
  ok('1.2 it consumes the category_values column, which the chart normalizer drops',
    /category_values/.test(READER_CODE) && !/category_values/.test(fnSrc('_aurixNormalizeBackendSnapshot')));
  setRows(series(8, { crypto: 8200, liquidity: 800, fund: 1000 }, { crypto: 8970, liquidity: 300, fund: 730 }));
  const w = win('24H');
  ok('1.3 the exposures come from the row values, not from the current portfolio',
    w.state === 'ok' && near(w.end.categories.crypto, 8970, 1) && near(w.end.investableValue, 10000, 2),
    JSON.stringify({ s: w.state, r: w.reason }));
}

// ── 2 · The contaminated origin is not reachable ──────────────────────────────
console.log('\n2 · AURIX-DATA-001 — the defective origin is not used:');
{
  ok('2.1 never reads categoryHistory / _aurixCanonicalCatHistory',
    !/\bcategoryHistory\b/.test(READER_CODE) && !/_aurixCanonicalCatHistory/.test(READER_CODE));
  ok('2.2 never reads the MERGED display source (a display contract, not a history one)',
    !/_aurixHistorySourceForDisplay/.test(READER_CODE) && !/_aurixMergeSnapshotSources/.test(READER_CODE));
  ok('2.3 never routes through the normalizer that drops category_values',
    !/_aurixNormalizeBackendSnapshot/.test(READER_CODE));
  ok('2.4 no localStorage, no sessionStorage, no device state as history',
    !/localStorage|sessionStorage|indexedDB/.test(READER_CODE));
  ok('2.5 no price provider, no fetch, no interpolation, no synthetic point',
    !/fetch\(|supabaseClient|interpolat|synthe/i.test(READER_CODE));
  ok('2.6 no second query — the reader is a projection over the already-hydrated array',
    !/\.from\(|\.select\(|await /.test(READER_CODE));
}

// ── 3 · 24H ──────────────────────────────────────────────────────────────────
console.log('\n3 · 24H window over real coverage:');
{
  setRows(series(8, { crypto: 8200, liquidity: 800, fund: 1000 }, { crypto: 8970, liquidity: 300, fund: 730 }));
  const w = win('24H');
  ok('3.1 state ok', w.state === 'ok', w.reason);
  ok('3.2 both extremes are REAL captured instants present in the source',
    !!w.start && !!w.end && sb._aurixBackendSnapshots.some(r => r.ts === w.startAt) && sb._aurixBackendSnapshots.some(r => r.ts === w.endAt));
  ok('3.3 the extremes are distinct (one point is a snapshot, not a change)', w.startAt < w.endAt);
  ok('3.4 the span is a real ~24h, and the drift is reported not hidden',
    Math.abs(w.coverage.windowSpanMs - D) <= 15 * MIN && Number.isFinite(w.coverage.startDriftMs),
    String(w.coverage.windowSpanMs) + '/' + String(w.coverage.startDriftMs));
  ok('3.5 end is anchored on DATA time (newest capture), not on the local clock',
    w.endAt === Math.max.apply(null, sb._aurixBackendSnapshots.map(r => r.ts)));
}

// ── 4 · 7D ───────────────────────────────────────────────────────────────────
console.log('\n4 · 7D window over real coverage:');
{
  const w = win('7D');
  ok('4.1 state ok', w.state === 'ok', w.reason);
  ok('4.2 the span is a real ~7d', Math.abs(w.coverage.windowSpanMs - 7 * D) <= 15 * MIN, String(w.coverage.windowSpanMs));
  ok('4.3 24H and 7D over the same history give DIFFERENT starts (real windows, not aliases)',
    win('24H').startAt !== w.startAt);
}

// ── 5 · Windows are only the two Financial declared defensible ────────────────
console.log('\n5 · Declared windows:');
{
  const ranges = vm.runInContext('Object.keys(_AURIX_CATHIST_WINDOWS)', sb);
  ok('5.1 exactly 24H + 7D', JSON.stringify(ranges) === '["24H","7D"]', JSON.stringify(ranges));
  ok('5.2 30D / 1A / TOTAL are rejected, not silently approximated',
    ['30D','1A','TOTAL','ALL','1Y','MAX'].every(r => { const w = win(r); return w.state === 'unsupported_range' && w.start === null && w.end === null; }));
}

// ── 6 · insufficient_data ────────────────────────────────────────────────────
console.log('\n6 · Missing coverage never degrades into a number:');
{
  const cases = [
    ['no rows at all',            [],                                                          'no_rows'],
    ['a single capture',          [row(-H, { crypto: 100 })],                                  'single_point'],
    ['history shorter than 24H',  series(0.4, { crypto: 100 }, { crypto: 110 }),               'insufficient_history'],
  ];
  cases.forEach(([label, rows, reason]) => {
    setRows(rows); const w = win('24H');
    ok('6.1 ' + label + ' ⇒ insufficient_data (' + reason + ')',
      w.state === 'insufficient_data' && w.reason === reason && w.start === null && w.end === null,
      w.state + '/' + w.reason);
  });
  setRows(series(8, { crypto: 100 }, { crypto: 110 }));
  ['loading','idle','failed'].forEach(st => {
    sb._aurixBackendSnapshotsState = st; const w = win('24H');
    ok('6.2 hydration "' + st + '" ⇒ not_hydrated (a history still loading is not an empty one)',
      w.state === 'insufficient_data' && w.reason === 'not_hydrated', w.reason);
  });
  sb._aurixBackendSnapshotsState = 'ready';
  // A 7D window over a 3-day history: the nearest real capture is 4 days newer than
  // the ideal start — far past the drift bound, so the window is refused.
  setRows(series(3, { crypto: 100 }, { crypto: 110 }));
  const w7 = win('7D');
  ok('6.3 7D over a 3-day history is refused, not silently relabelled',
    w7.state === 'insufficient_data' && w7.reason === 'insufficient_history', w7.reason);
  ok('6.4 …and 24H over the SAME history still works (each window judged on its own coverage)',
    win('24H').state === 'ok');
  ok('6.5 every insufficient_data payload still reports coverage, so the hold is diagnosable',
    Number.isFinite(w7.coverage.validPoints) && Number.isFinite(w7.coverage.historySpanMs));
}

// ── 7 · The denominator ──────────────────────────────────────────────────────
console.log('\n7 · Denominator = investable wealth (total − real_estate):');
{
  const r = row(0, { crypto: 6000, liquidity: 1000, real_estate: 3000 });
  const v = validate(r);
  ok('7.1 the row is valid', v.valid === true, v.reason);
  ok('7.2 investableValue === total_value_usd − real_estate',
    near(v.point.investableValue, 10000 - 3000, 0.01) && near(v.point.totalValue, 10000, 0.01),
    String(v.point.investableValue));
  ok('7.3 the denominator is NOT total_value_usd', v.point.investableValue !== v.point.totalValue);
  ok('7.4 the contract states the denominator explicitly in code',
    /total\s*-\s*realEstate/.test(READER_CODE));
  ok('7.5 never Σ asset_values as a stand-in for investable wealth',
    !/asset_values|assetValues/.test(READER_CODE));
}

// ── 8 · Real estate cannot contaminate ───────────────────────────────────────
console.log('\n8 · Real estate contaminates nothing:');
{
  const r = row(0, { crypto: 6000, liquidity: 1000, real_estate: 3000 });
  const v = validate(r);
  ok('8.1 real_estate is absent from the exposure categories',
    !Object.prototype.hasOwnProperty.call(v.point.categories, 'real_estate'), JSON.stringify(Object.keys(v.point.categories)));
  ok('8.2 real_estate exposure is null, never a number (it is not an investable exposure)',
    expo(v.point, 'real_estate') === null);
  ok('8.3 crypto exposure is measured over investable, not total (85.7%, not 60%)',
    near(expo(v.point, 'crypto'), 6000 / 7000 * 100, 1e-9), String(expo(v.point, 'crypto')));
  ok('8.4 the investable exposures sum to 100%',
    near(['crypto','liquidity'].reduce((s, k) => s + expo(v.point, k), 0), 100, 1e-6));
  // The same investable structure with and without a house must give identical exposures.
  const a = validate(row(0, { crypto: 6000, liquidity: 1000 })).point;
  const b = validate(row(0, { crypto: 6000, liquidity: 1000, real_estate: 900000 })).point;
  ok('8.5 adding a house does not move a single exposure',
    near(expo(a, 'crypto'), expo(b, 'crypto'), 1e-9) && near(expo(a, 'liquidity'), expo(b, 'liquidity'), 1e-9));
  ok('8.6 the canonical investable set excludes real_estate and invents no category',
    JSON.stringify(vm.runInContext('_AURIX_CATHIST_INVESTABLE', sb)) === JSON.stringify(['stock','etf','fund','crypto','metal','liquidity','other']));
}

// ── 9 · Exposure and delta ───────────────────────────────────────────────────
console.log('\n9 · Exposure and delta semantics:');
{
  // 82.4% → 89.7% over exactly 7 days: Δ +7.3 pp, NOT +8.9%.
  setRows(series(7, { crypto: 8240, liquidity: 1760 }, { crypto: 8970, liquidity: 1030 }));
  const d = delta('7D', 'crypto');
  ok('9.1 exposure = category_value / investable_value', d.state === 'ok' && near(d.endPct, 89.7, 0.3), JSON.stringify(d));
  ok('9.2 delta = endExposure − startExposure', near(d.deltaPp, d.endPct - d.startPct, 1e-9));
  ok('9.3 the unit is PERCENTAGE POINTS (+7.3 pp), and it is declared in the payload',
    d.unit === 'percentage_points' && near(d.deltaPp, 7.3, 0.4), String(d.deltaPp));
  const relative = (d.endPct - d.startPct) / d.startPct * 100;   // the +8.9% trap
  ok('9.4 the delta is NOT the relative change of the weight (+8.9%)',
    Math.abs(d.deltaPp - relative) > 1, String(d.deltaPp) + ' vs ' + String(relative));
  ok('9.5 a falling exposure yields a negative pp delta', delta('7D','liquidity').deltaPp < 0);
  ok('9.6 the delta carries its own extremes, so a consumer cannot mismatch them',
    d.startAt === win('7D').startAt && d.endAt === win('7D').endAt);
  ok('9.7 no derived value is stored — the delta is recomputed from the window',
    !/_aurixCatHistCache|cachedDelta|_cache\s*=/.test(READER_CODE));
  ok('9.8 an unsupported range propagates as unsupported_range with null figures',
    (function(){ const x = delta('30D','crypto'); return x.state === 'unsupported_range' && x.deltaPp === null && x.startPct === null; })());
}

// ── 10 · Absence: real 0 vs unknown ──────────────────────────────────────────
console.log('\n10 · An absent category is 0 ONLY when the row proves it:');
{
  // Reconciled row ⇒ every valued position is accounted for ⇒ a missing bucket holds nothing.
  const complete = validate(row(0, { crypto: 10000 })).point;
  ok('10.1 absent bucket on a RECONCILED row ⇒ 0 (a proven real zero)', expo(complete, 'fund') === 0);
  // Unreconciled row: Σ buckets ≠ total. "No value" and "not valued" are indistinguishable here.
  const partial = { ts: NOW, total_value_usd: 10000, real_estate: 0,
    category_values: { crypto: 6000 }, confidence: 'scheduled' };
  const pv = validate(partial);
  ok('10.2 a row whose buckets do not reconcile to its total is INVALID',
    pv.valid === false && pv.reason === 'category_sum_mismatch', pv.reason);
  ok('10.3 …so the unknown is never converted to 0 for convenience', pv.point === null);
  ok('10.4 a point without the completeness licence yields null, never 0',
    expo({ investableValue: 10000, categories: { crypto: 10000 } }, 'fund') === null);
  ok('10.5 the licence is an explicit flag, not an assumption',
    complete.categoriesComplete === true && /categoriesComplete\s*!==\s*true/.test(READER_CODE));
  ok('10.6 an empty category map is a hold, never a portfolio of zeros',
    validate({ ts: NOW, total_value_usd: 10000, real_estate: 0, category_values: {} }).reason === 'empty_category_map');
  ok('10.7 an unrecognised bucket fails closed instead of losing its weight',
    validate({ ts: NOW, total_value_usd: 100, real_estate: 0, category_values: { crypto: 100, nft_moonbags: 0 } }).valid === false);
}

// ── 11 · No invalid point enters a calculation silently ──────────────────────
console.log('\n11 · Invalid / partial captures are excluded AND visible:');
{
  const bad = [
    { label: 'sum mismatch',      r: { ts: NOW - D, total_value_usd: 10000, real_estate: 0, category_values: { crypto: 6000 } } },
    { label: 'negative bucket',   r: { ts: NOW - D, total_value_usd: 100,   real_estate: 0, category_values: { crypto: 150, fund: -50 } } },
    { label: 'non-finite total',  r: { ts: NOW - D, total_value_usd: null,  real_estate: 0, category_values: { crypto: 100 } } },
    { label: 'no category map',   r: { ts: NOW - D, total_value_usd: 100,   real_estate: 0, category_values: null } },
    { label: 're column vs bucket', r: { ts: NOW - D, total_value_usd: 100, real_estate: 40, category_values: { crypto: 100 } } },
    { label: 'investable = 0',    r: { ts: NOW - D, total_value_usd: 100,   real_estate: 100, category_values: { real_estate: 100 } } },
    { label: 'bad ts',            r: { ts: NaN, total_value_usd: 100, real_estate: 0, category_values: { crypto: 100 } } },
  ];
  bad.forEach(b => ok('11.1 ' + b.label + ' ⇒ INVALID', validate(b.r).valid === false, validate(b.r).reason));
  const good = series(8, { crypto: 8000, liquidity: 2000 }, { crypto: 9000, liquidity: 1000 });
  setRows(good.concat(bad.map(b => b.r)));
  const w = win('24H');
  ok('11.2 the window still resolves from the valid points only',
    w.state === 'ok' && w.coverage.validPoints === good.length, JSON.stringify({ v: w.coverage.validPoints, i: w.coverage.invalidPoints }));
  ok('11.3 the exclusions are TALLIED, not silent', w.coverage.invalidPoints === bad.length && Object.keys(w.coverage.invalidReasons).length > 0,
    JSON.stringify(w.coverage.invalidReasons));
  ok('11.4 no invalid point can be an extreme',
    good.some(r => r.ts === w.startAt) && good.some(r => r.ts === w.endAt));
  // The server already refuses to WRITE a partial valuation (capturer guard LB-1);
  // this layer re-derives the same guarantee instead of defining "valid" a second time.
  const capturer = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts'), 'utf8');
  ok('11.5 the reader mirrors the capturer guard rather than inventing a second definition',
    /dropped_asset_count\)\s*>\s*0/.test(capturer) && /dropped_asset_count/.test(READER_BLOCK));
  ok('11.6 freshness reuses the EXISTING backend health contract, not a new threshold',
    /_aurixBackendHealthSnapshot|_AURIX_BACKEND_CADENCE_MS|_AURIX_BACKEND_STALE_FACTOR/.test(READER_CODE));
}

// ── 12–14 · The layer answers BEFORE → NOW → DELTA and nothing more ──────────
console.log('\n12–14 · No causality, no attribution, no product copy:');
{
  ok('12.1 no causal vocabulary anywhere in the layer',
    !/\bbecause\b|\bcaused\b|porque|provoc|debido a|explain|explic/i.test(READER_CODE));
  ok('12.2 no market-vs-flow separation, no driver, no cause field',
    !/driver|cause|reason_market|market_move|withdraw|retirada|contribution/i.test(READER_CODE));
  ok('13.1 no attribution: nothing claims a share of a movement',
    !/attribut|explained_by|contrib_pct|share_of_move/i.test(READER_CODE));
  ok('13.2 no per-asset series is read (attribution belongs to the next contract)',
    !/asset_values|capital_flows/.test(READER_CODE));
  ok('14.1 no user-facing copy and no i18n call', !/\bt\(['"]/.test(READER_CODE) && !/innerHTML|textContent/.test(READER_CODE));
  ok('14.2 no Premium / pricing / upgrade surface', !/premium|pricing|checkout|upgrade|founder/i.test(READER_CODE));
  ok('14.3 no health score is produced or read', !/healthScore|_aurixHealthSnapshot|score/i.test(READER_CODE));
  ok('14.4 no materiality rule is hard-coded (that is the next engine\'s decision with Financial)',
    !/\bmaterial/i.test(READER_CODE) && !/>=\s*5\b|>\s*5\s*\/\*/.test(READER_CODE));
  ok('14.5 no insight/threshold verdict is emitted — only figures and coverage',
    !/insight|verdict|isMaterial|alert|warningLevel/i.test(READER_CODE));
}

// ── 15 · Device independence ─────────────────────────────────────────────────
console.log('\n15 · Same server history ⇒ same answer on any device:');
{
  const rows = series(8, { crypto: 8240, liquidity: 1760 }, { crypto: 8970, liquidity: 1030 });
  setRows(rows);
  const a = JSON.stringify(delta('7D','crypto'));
  setRows(rows.slice().reverse());                    // a different arrival order is not a different history
  const b = JSON.stringify(delta('7D','crypto'));
  ok('15.1 row order does not change the result', a === b);
  ok('15.2 no device/browser state is consulted',
    !/navigator|screen|innerWidth|matchMedia|userAgent|timeZone/.test(READER_CODE));
  ok('15.3 the local clock is REPORTED (endAgeMs) but never selects an extreme',
    /endAgeMs/.test(READER_CODE) && (function(){
      const w1 = win('24H'); NOW += 5 * D; const w2 = win('24H'); NOW -= 5 * D;
      return w1.startAt === w2.startAt && w1.endAt === w2.endAt && w2.coverage.endAgeMs > w1.coverage.endAgeMs;
    })());
  ok('15.4 a stale end point is flagged, so a dead cron cannot pass as a fresh reading',
    (function(){ NOW += 5 * D; const w = win('24H'); NOW -= 5 * D;
      return w.state === 'ok' && w.warnings.indexOf('end_point_stale') !== -1; })());
}

// ── 16 · Older snapshots still read ──────────────────────────────────────────
console.log('\n16 · Backward compatibility with the existing history:');
{
  // Pre-asset_values rows: no asset_values, no schema_version, null market_state /
  // price_staleness. category_values has meant the same thing since day one.
  const legacy = series(8, { crypto: 8000, liquidity: 2000 }, { crypto: 9000, liquidity: 1000 })
    .map(r => ({ ts: r.ts, total_value_usd: r.total_value_usd, real_estate: r.real_estate,
      category_values: r.category_values, source: 'backend_snapshot', confidence: 'scheduled',
      market_state: null, price_staleness: null }));
  setRows(legacy);
  const w = win('7D');
  ok('16.1 legacy rows (no asset_values / no schema_version) read normally', w.state === 'ok', w.reason);
  ok('16.2 a null market_state / price_staleness is metadata, not a disqualifier',
    w.end.marketState === null && w.end.priceStaleness === null && expo(w.end, 'crypto') > 0);
  ok('16.3 a mixed legacy + current history is one series, not two',
    (function(){ setRows(legacy.slice(0, 200).concat(series(3, { crypto: 9000, liquidity: 1000 }, { crypto: 9500, liquidity: 500 })));
      return win('24H').state === 'ok'; })());
  ok('16.4 the loader row cap is surfaced, so a truncated tail cannot pass as "now"',
    (function(){ const cap = vm.runInContext('_AURIX_CATHIST_SOURCE_ROW_CAP', sb);
      setRows(series(8, { crypto: 8000, liquidity: 2000 }, { crypto: 9000, liquidity: 1000 }));
      const small = win('24H');
      const many = []; while (many.length < cap) many.push.apply(many, series(8, { crypto: 8000, liquidity: 2000 }, { crypto: 9000, liquidity: 1000 }));
      setRows(many.slice(0, cap));
      const big = win('24H');
      return small.coverage.truncated === false && big.coverage.truncated === true && big.warnings.indexOf('source_row_cap_reached') !== -1; })());
}

// ── 17–18 · Nothing else moved ───────────────────────────────────────────────
console.log('\n17–18 · Chart, Performance and Preview V1 are byte-identical:');
{
  // PERMANENT invariants first — no git history required, so they block in CI forever.
  // The risk these actually guard is someone WIRING the reader into an owner that must
  // not depend on it; that is visible in the current file and needs no baseline.
  const untouched = ['_aurixNormalizeBackendSnapshot','_aurixMergeSnapshotSources','_aurixHistorySourceForDisplay',
    '_aurixFetchBackendSnapshots','_aurixBackendHealth','_aurixBackendHealthSnapshot',
    '_aurixIntelligencePreviewFacts','_aurixIntelligencePreviewHTML','hasAurixPremiumAccess'];
  const READER_SYMBOLS = /_aurixCatHist|_aurixCatExposure|_AURIX_CATHIST|aurixCategoryHistory|aurixCategoryExposure/;
  ok('17.1 no Chart / Performance / Preview / entitlement owner references the reader',
    untouched.every(n => !READER_SYMBOLS.test(fnSrc(n))),
    untouched.filter(n => READER_SYMBOLS.test(fnSrc(n))).join(','));
  ok('17.2 each of those owners still exists exactly once (none was replaced or duplicated)',
    untouched.every(n => (app.match(new RegExp('^(?:async )?function ' + n + '\\(', 'gm')) || []).length === 1),
    untouched.filter(n => (app.match(new RegExp('^(?:async )?function ' + n + '\\(', 'gm')) || []).length !== 1).join(','));
  // REVIEW-TIME comparison against the SPEC baseline. Deliberately NOT a permanent
  // assertion: pinning a CI gate to one historical commit would fail the day someone
  // legitimately edits `_aurixIntelligencePreviewHTML`, which is not this gate's business.
  // It runs wherever the baseline is reachable (a full clone) and reports an explicit,
  // counted SKIP where it is not (CI checks out at depth 1) — never a silent pass.
  let base = null;
  try { base = cp.execSync('git show ' + BASELINE + ':app.js', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] }).toString('utf8'); }
  catch (e) { base = null; }
  if (base === null) {
    skip('17.3 byte-identity vs ' + BASELINE + ' (9 owners)', BASELINE + ' not in this clone (shallow checkout)');
    skip('18.1 additive-diff vs ' + BASELINE, BASELINE + ' not in this clone (shallow checkout)');
  } else {
    untouched.forEach(n => ok('17.3 ' + n + ' byte-identical to ' + BASELINE, fnSrcIn(base, n) === fnSrc(n)));
    // Purely additive, enumerated rather than assumed: the ONLY line app.js loses versus
    // the baseline is its own build self-version, which the cache-bust contract requires
    // to move whenever the bundle changes. Not one line of logic is removed or edited.
    ok('18.1 the change is ADDITIVE — the only removed line is the build self-version',
      (function(){
        let diff = null;
        try { diff = cp.execSync('git diff ' + BASELINE + ' -- app.js', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] }).toString('utf8'); } catch (e) { return false; }
        const removed = diff.split('\n').filter(l => /^-/.test(l) && !/^---/.test(l));
        return removed.length === 1 && /__AURIX_APPJS_VERSION__/.test(removed[0]);
      })());
  }
  ok('18.2 the reader is not wired into any renderer, tab or Preview path',
    !/switchTab|renderWealthCurve|buildProductionPortfolioChart|_aurixIntelligencePreview|tabPlaceholder/.test(READER_CODE));
  ok('18.3 nothing outside the reader block calls it yet (a read layer, not a feature)',
    (function(){ const rest = app.slice(0, app.indexOf(BLOCK_START)) + app.slice(app.indexOf(BLOCK_START) + READER_BLOCK.length);
      return !/_aurixCatHistWindow\(|_aurixCatExposureDelta\(|_aurixCatExposurePct\(/.test(rest); })());
}

// ── 19 · Runtime hygiene ─────────────────────────────────────────────────────
console.log('\n19 · Runtime hygiene:');
{
  ok('19.1 app.js parses', (function(){ try { cp.execSync('node --check app.js', { cwd: ROOT }); return true; } catch (e) { return false; } })());
  ok('19.2 the reader never throws — a malformed source degrades to insufficient_data',
    (function(){ const junk = [null, undefined, 7, 'x', {}, { ts: 'nope' }, { ts: NOW, category_values: 5 }];
      setRows(junk); const w = win('24H');
      return w.state === 'insufficient_data' && w.start === null; })());
  ok('19.3 a non-array source is survivable', (function(){ setRows(null); return win('24H').state === 'insufficient_data'; })());
  ok('19.4 the public contract is frozen and self-describing',
    (function(){ const c = sb.window.AURIX_CATEGORY_HISTORY_CONTRACT;
      return !!c && c.denominator === 'total_value_usd - real_estate' && c.deltaUnit === 'percentage_points'
        && JSON.stringify(c.ranges) === '["24H","7D"]' && /portfolio_snapshots\.category_values/.test(c.source); })());
  ok('19.5 the read-only entry points are exposed for verification',
    typeof sb.window.aurixCategoryHistoryWindow === 'function' && typeof sb.window.aurixCategoryExposureDelta === 'function');
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + '  ' + pass + ' passed, ' + fail + ' failed'
  + (skipped ? ', ' + skipped + ' skipped (baseline not reachable — run in a full clone to certify byte-identity)' : '') + '\n');
process.exit(fail ? 1 : 0);
