'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-CONTINUOUS-SERVER-SNAPSHOTS-harness — SPEC DSH.CHART.CONTINUOUS_SERVER_SNAPSHOTS.36
// ════════════════════════════════════════════════════════════════════════════
// SPEC.35 proved server-side continuity is EXTERNAL to the frontend. The backend owner already exists:
// the Supabase Edge Function supabase/functions/portfolio-snapshot/index.ts (canonical valuation mirror) +
// db/portfolio_snapshots_1.sql (append-only table, unique idempotency index, RLS). SPEC.36 hardens the
// function (bounded/active-only/retry-safe/idempotent) and commits the scheduler as db/portfolio_snapshots_cron_1.sql.
// This harness proves what is provable IN-REPO: (a) the server valuation matches app.js (gold/FX/real-estate,
// no fabrication) by executing the ACTUAL transpiled pure functions; (b) the runtime scheduler guarantees
// (bounded, active-only, retry-safe, idempotent, ordering, service-role-only) by source; (c) the schema +
// cron migration are correct + idempotent; (d) the FRONTEND is byte-unchanged vs v516. It CANNOT prove
// "snapshots written without a browser" — that needs live Supabase deploy (reported as the external step).
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const root = path.join(__dirname, '..');
const TS = fs.readFileSync(path.join(root, 'supabase', 'functions', 'portfolio-snapshot', 'index.ts'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(root, 'db', 'portfolio_snapshots_1.sql'), 'utf8');
const CRON = fs.readFileSync(path.join(root, 'db', 'portfolio_snapshots_cron_1.sql'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// ── transpile the pure valuation functions (real bodies) — slice the whole helper region + literal strips ──
// (per-fn brace-slicing is unsafe here: the Map<{price:number}> object-type in signatures confuses brace matching.)
function strip(s) {
  return s
    .split('function bucketOf(type: string): string {').join('function bucketOf(type) {')
    .split('function goldPurity(k: any): number {').join('function goldPurity(k) {')
    .split('function goldGrams(qty: number, unit: string): number {').join('function goldGrams(qty, unit) {')
    .split('function isUsEquityOpenNow(now: Date): boolean {').join('function isUsEquityOpenNow(now) {')
    .split('async function fetchPrices(symbols: string[]): Promise<Map<string, { price: number; currency: string }>> {').join('async function fetchPrices(symbols) {')
    .split('function fxToUsd(cur: string, prices: Map<string, { price: number; currency: string }>): number {').join('function fxToUsd(cur, prices) {')
    .split('function valueUser(row: any, prices: Map<string, { price: number; currency: string }>, now: Date) {').join('function valueUser(row, prices, now) {')
    .split('const PURITY_TABLE: Record<string, number> = {').join('const PURITY_TABLE = {')
    .split('const map = new Map<string, { price: number; currency: string }>();').join('const map = new Map();')
    .split('const catalog: any[] =').join('const catalog =')
    .split('const holdings: any[] =').join('const holdings =')
    .split('const byId = new Map<any, any>(catalog.map((a: any) =>').join('const byId = new Map(catalog.map((a) =>')
    .split('const categories: Record<string, number> = {};').join('const categories = {};')
    .split('const warnings: string[] = [];').join('const warnings = [];')
    .split('let valueUSD: number = NaN;').join('let valueUSD = NaN;');
}
// contiguous helper region: from `const INVESTABLE_TYPES` (line ~31) to just before the SPEC.36 Deno.serve block.
const regionStart = TS.indexOf('const INVESTABLE_TYPES');
const regionEnd = TS.indexOf('// SPEC.36 — bounded');
const jsBlock = strip(TS.slice(regionStart, regionEnd));
const ctx = { Number, Math, Map, Set, String, Array, isFinite, NaN, Infinity, fetch: () => Promise.resolve({ ok: false }), encodeURIComponent, console: { log() {} } };
vm.createContext(ctx);
let transpileOk = true;
try { vm.runInContext(jsBlock + '\n;this.__v = { valueUser, goldGrams, goldPurity, bucketOf, isUsEquityOpenNow, fxToUsd };', ctx); } catch (e) { transpileOk = false; console.log('  ! transpile failed: ' + e.message); }
const V = ctx.__v || {};

console.log('\nAURIX-CHART-CONTINUOUS-SERVER-SNAPSHOTS — SPEC.36');
ok('transpile: real pure valuation bodies loaded', transpileOk && typeof V.valueUser === 'function');

// ── canonical valuation parity (gold / FX / real-estate / no fabrication) — real function ────────────────
const OZ_TO_G = 31.1034768;
const prices = new Map([
  ['AAPL', { price: 200, currency: 'USD' }],
  ['XAU/USD', { price: 2400, currency: 'USD' }],
  ['EURUSD=X', { price: 1.1, currency: 'USD' }],
]);
const row = {
  assets: [
    { id: 'a1', symbol: 'AAPL', type: 'stock', currentPrice: 190, assetCurrency: 'USD' },
    { id: 'a2', symbol: 'XAU', type: 'metal', karat: '24', goldUnit: 'g', currentPrice: 2300, assetCurrency: 'USD' },
    { id: 'a3', symbol: 'EUR', type: 'cash', assetCurrency: 'EUR', currentPrice: 0 },
    { id: 'a4', symbol: 'HOME', type: 'real_estate', currentPrice: 500000, assetCurrency: 'USD' },
  ],
  holdings: [
    { asset_id: 'a1', quantity: 10 }, { asset_id: 'a2', quantity: 100 },
    { asset_id: 'a3', quantity: 1000 }, { asset_id: 'a4', quantity: 1 },
  ],
};
if (transpileOk) {
  const now = new Date('2026-07-11T15:00:00Z');   // fixed clock (US equity open) — deterministic
  const v = V.valueUser(row, prices, now);
  const goldExpected = 100 * 1.0 * (2400 / OZ_TO_G);
  ok('gold valued grams×purity×(spot/oz) — app.js parity (NOT qty×spotPerOz)', Math.abs(v.categories.metal - goldExpected) < 0.01, 'metal=' + v.categories.metal + ' exp=' + goldExpected.toFixed(2));
  ok('stock uses FRESH price over stale catalog price', Math.abs(v.categories.stock - 2000) < 0.01, 'stock=' + v.categories.stock);
  ok('non-USD cash converted via FX (EURUSD=X)', Math.abs(v.categories.liquidity - 1100) < 0.01, 'liq=' + v.categories.liquidity);
  ok('real_estate tracked separately (investable = total − real_estate)', Math.abs(v.realEstate - 500000) < 0.01 && Math.abs((v.total - v.realEstate) - (2000 + goldExpected + 1100)) < 0.02, 'RE=' + v.realEstate + ' inv=' + (v.total - v.realEstate).toFixed(2));
  ok('total = Σ real positions in USD', Math.abs(v.total - (2000 + goldExpected + 1100 + 500000)) < 0.02, 'total=' + v.total);

  // no fabrication: an unpriced position with no stored price is NOT invented
  const rowUnpriced = { assets: [{ id: 'x', symbol: 'ZZZZ', type: 'stock', assetCurrency: 'USD' }], holdings: [{ asset_id: 'x', quantity: 5 }] };
  const vu = V.valueUser(rowUnpriced, new Map(), now);
  ok('no fabricated value for a truly unpriced asset (skipped, total 0)', vu.total === 0 && vu.unpriced_asset_count >= 1);

  // per-user isolation: valueUser reads ONLY its row (two rows never cross-contaminate)
  const rowA = { assets: [{ id: 'a', symbol: 'AAPL', type: 'stock', assetCurrency: 'USD' }], holdings: [{ asset_id: 'a', quantity: 1 }] };
  const rowB = { assets: [{ id: 'b', symbol: 'AAPL', type: 'stock', assetCurrency: 'USD' }], holdings: [{ asset_id: 'b', quantity: 3 }] };
  const vA = V.valueUser(rowA, prices, now), vB = V.valueUser(rowB, prices, now);
  ok('per-user isolation (valueUser is a pure per-row function)', vA.total === 200 && vB.total === 600);

  // deterministic: same input ⇒ same output
  ok('deterministic valuation (same input ⇒ same total)', V.valueUser(row, prices, now).total === v.total);

  // pure gold helpers
  ok('goldGrams(oz→g) and goldPurity(karat) exact', Math.abs(V.goldGrams(2, 'oz') - 62.2069536) < 1e-6 && V.goldPurity('18') === 0.75 && V.goldPurity('24') === 1);
} else {
  ok('(valuation parity tests skipped — transpile failed)', false);
}

// ── runtime scheduler guarantees (SOURCE — the Deno.serve loop) ──────────────────────────────────────────
ok('bounded execution: paginated read (.range) + MAX_USERS cap, no unbounded scan', /\.range\(from, from \+ PAGE - 1\)/.test(TS) && /MAX_USERS/.test(TS) && !/\.select\('user_id, assets, holdings'\);\s*\n\s*if \(error\) return/.test(TS));
ok('active-only: skips rows with no catalog AND no holdings before valuation', /if \(!hasCatalog && !hasHoldings\) \{ inactive\+\+; continue; \}/.test(TS));
ok('retry-safe: every per-user step wrapped in try/catch (one failure never aborts the run)', /for \(const r of rows\) \{\s*\n\s*try \{/.test(TS) && /\} catch \(e\) \{ errored\+\+;/.test(TS));
ok('idempotent reruns: unique-violation (23505) counted as skip, not error', /'23505'|duplicate key\|unique constraint/.test(TS) && /skipped\+\+/.test(TS));
ok('near-duplicate guard (5min / 0.2%) matches the frontend merge dedup', /NEAR_MS = 5 \* 60_000/.test(TS) && /NEAR_FRAC = 0\.002/.test(TS));
ok('writes only REAL snapshots (skips total <= 0)', /if \(!Number\.isFinite\(v\.total\) \|\| v\.total <= 0\) \{ empty\+\+; continue; \}/.test(TS));
ok('deterministic ordering: read ordered by user_id; ts monotonic (now); index ts desc', /\.order\('user_id'/.test(TS) && /ts: now\.toISOString\(\)/.test(TS));
ok('service-role from ENV only — never hardcoded, never shipped to frontend', /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(TS) && !/service_role.{0,40}ey[A-Za-z0-9]/.test(TS));
ok('single valuation pipeline (no duplicate calc): mirrors app.js convertFromNewToFlat, one valueUser', (TS.match(/function valueUser\(/g) || []).length === 1);
ok('writes ONLY portfolio_snapshots (never writes user_portfolios/category_history)', /from\('portfolio_snapshots'\)\.insert/.test(TS) && !/from\(['"](user_portfolios|category_history)['"]\)\.(insert|update|upsert|delete)/.test(TS));

// ── schema (db/portfolio_snapshots_1.sql) ─────────────────────────────────────────────────────────────────
ok('schema: append-only table with unique idempotency index (user_id, minute-bucket)', /create unique index[^;]*portfolio_snapshots_user_minute_uidx[\s\S]*?\(user_id, public\.aurix_minute_bucket\(ts\)\)/.test(SCHEMA));
ok('schema: minute-bucket is an IMMUTABLE function (index-expression legal; date_trunc on timestamptz is only STABLE)', /create or replace function public\.aurix_minute_bucket\(p_ts timestamptz\)[\s\S]*?language sql immutable/.test(SCHEMA) && !/\(user_id, date_trunc\('minute', ts\)\)/.test(SCHEMA));
ok('schema: per-user time index (user_id, ts desc)', /portfolio_snapshots_user_ts_idx[\s\S]*?\(user_id, ts desc\)/.test(SCHEMA));
ok('schema: RLS on + SELECT own only + NO client insert/update/delete policy', /enable row level security/.test(SCHEMA) && /for select\s*\n?\s*using \(auth\.uid\(\) = user_id\)/.test(SCHEMA) && !/for insert/i.test(SCHEMA) && !/for update/i.test(SCHEMA));
ok('schema: user_id FK to auth.users with on delete cascade (isolation)', /user_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/.test(SCHEMA));

// ── cron migration (db/portfolio_snapshots_cron_1.sql) ────────────────────────────────────────────────────
ok('cron: enables pg_cron + pg_net', /create extension if not exists pg_cron/.test(CRON) && /create extension if not exists pg_net/.test(CRON));
ok('cron: idempotent (unschedules prior job before (re)scheduling)', /cron\.unschedule\('aurix-portfolio-snapshot'\)[\s\S]*?where exists/.test(CRON));
ok('cron: every 15 minutes', /'\*\/15 \* \* \* \*'/.test(CRON));
ok('cron: invokes the Edge Function via net.http_post', /net\.http_post\([\s\S]*?portfolio-snapshot'/.test(CRON) && /cron\.schedule\(\s*'aurix-portfolio-snapshot'/.test(CRON));
ok('cron: invocation key from Vault — NO hardcoded secret in the migration', /vault\.decrypted_secrets where name = 'aurix_snapshot_invoke_key'/.test(CRON) && !/eyJ[A-Za-z0-9_\-]{20,}/.test(CRON));
ok('cron: bounded timeout + nightly retention thinning (bounded table growth)', /timeout_milliseconds := 120000/.test(CRON) && /aurix-portfolio-snapshot-retention/.test(CRON) && /interval '35 days'/.test(CRON));

// ── FRONTEND UNCHANGED vs v516 (SPEC.36 frontend contract) ────────────────────────────────────────────────
(function () {
  let clean = true, detail = '';
  try {
    const out = cp.execSync('git -C ' + JSON.stringify(root) + ' status --porcelain app.js index.html version.json', { encoding: 'utf8' });
    clean = out.trim() === '';
    detail = out.trim();
  } catch (e) { clean = false; detail = 'git error: ' + e.message; }
  ok('frontend byte-unchanged (no app.js / index.html / version.json diff)', clean, detail);
  const ver = fs.readFileSync(path.join(root, 'version.json'), 'utf8');
  ok('version.json still v516 (frontend not bumped)', /v516-chart-durable-cold-start-recovery-35/.test(ver));
})();

// ── frontend already consumes snapshots (SPEC.35 read wired) ──────────────────────────────────────────────
(function () {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  ok('frontend read-only merge is wired (autoload ON; merges backend as gap-filler)', /_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD = true/.test(app) && /_aurixMergeSnapshotSources/.test(app));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.36 CONTINUOUS SERVER-SIDE SNAPSHOTS — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
