'use strict';
// ════════════════════════════════════════════════════════════════════════════════════════════════
// AURIX-CATALOG-RETRIEVAL-harness — SPEC MKT-EXCELLENCE.CATALOG-RETRIEVAL
// ════════════════════════════════════════════════════════════════════════════════════════════════
// CoinGecko's /search is a RELEVANCE FEED, not a catalog: measured in production, "USD Coin" did not
// return the canonical USDC (`usd-coin`) at all, so the asset was unreachable by its own commercial
// name. This adds the identity catalog we ALREADY hold as a SECOND candidate source, and teaches the
// EXISTING match scorer that a provider slug is an identifier (like an ISIN) — no parallel ranking.
//
// Drives the real route (api/search/crypto.js), the real catalog (api/search/_cg-catalog.js) and the
// real ranker (app.js _aurixRankSearchResults + _aurixSearchMatchScore). No re-implementation.
const fs = require('fs'), vm = require('vm'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

function fnSrc(n) {
  const i = app.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('missing fn ' + n);
  let k = app.indexOf('{', i), d = 0;
  for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
function konstSrc(n) {
  const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + n);
  const eq = m.index + m[0].length, f = app[eq];
  if (f === '{' || f === '[') {
    let d = 0, k = eq;
    for (; k < app.length; k++) { const c = app[k]; if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) { k++; break; } } }
    const s = app.indexOf(';', k); return app.slice(m.index, s + 1);
  }
  const s = app.indexOf(';', eq); return app.slice(m.index, s + 1);
}

// ── fixtures: the REAL provider shapes measured in production ────────────────────────────────────
// CoinGecko renamed "USD Coin" to "USDC" but its id is still `usd-coin`; /search for "usd coin"
// returns look-alikes whose NAME contains the query and not the canonical coin. That is the defect.
const CATALOG = [
  { id: 'bitcoin',            symbol: 'btc',   name: 'Bitcoin',              platforms: {} },
  { id: 'ethereum',           symbol: 'eth',   name: 'Ethereum',             platforms: { ethereum: '' } },
  { id: 'usd-coin',           symbol: 'usdc',  name: 'USDC',                 platforms: { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', base: '0xd9aA' } },
  { id: 'bridged-usdc-base',  symbol: 'usdc',  name: 'Bridged USDC (Base)',  platforms: { base: '0xAAA1' } },
  { id: 'usd-coinvertible',   symbol: 'usdcv', name: 'USD CoinVertible',     platforms: { ethereum: '0xBBB2' } },
  { id: 'hyperliquid',        symbol: 'hype',  name: 'Hyperliquid',          platforms: { hyperliquid: '0xCCC3' } },
  { id: 'usdcx',              symbol: 'usdcx', name: 'USDCx',                platforms: {} },
];
const SEARCH_FEED = {
  // what /search really returns for "usd coin": no canonical USDC anywhere
  'usd coin': [
    { id: 'usd-coinvertible',  symbol: 'usdcv',   name: 'USD CoinVertible',  market_cap_rank: 1200, large: 'https://x/usdcv.png' },
    { id: 'ionic-usd-coin',    symbol: 'ionusdc', name: 'Ionic USD Coin',    market_cap_rank: null, large: 'https://x/ion.png' },
    { id: 'unagii-usd-coin',   symbol: 'uusdc',   name: 'Unagii USD Coin',   market_cap_rank: null, large: 'https://x/uu.png' },
  ],
  usdc: [
    { id: 'usd-coin',          symbol: 'usdc',  name: 'USDC',                market_cap_rank: 6,    large: 'https://x/usdc.png' },
    { id: 'bridged-usdc-base', symbol: 'usdc',  name: 'Bridged USDC (Base)', market_cap_rank: 420,  large: 'https://x/b.png' },
  ],
  bitcoin: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1, large: 'https://x/btc.png' }],
  btc:     [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1, large: 'https://x/btc.png' }],
  hype:    [{ id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', market_cap_rank: 30, large: 'https://x/h.png' }],
  hyperliquid: [{ id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', market_cap_rank: 30, large: 'https://x/h.png' }],
};

const calls = [];
let plan = {};
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  if (u.includes('/coins/list')) {
    if (plan.catalog === '429') return resp(429, {});
    if (plan.catalogSlow) { await new Promise(r => setTimeout(r, plan.catalogSlow)); }
    return resp(200, CATALOG);
  }
  const m = /\/api\/v3\/search\?query=(.+)$/.exec(u);
  if (m) {
    const q = decodeURIComponent(m[1]).toLowerCase();
    return resp(200, { coins: SEARCH_FEED[q] || [] });
  }
  return resp(404, {});
};

function mkRes() {
  const r = { code: null, body: null };
  r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = o => { r.body = o; return r; }; r.end = () => r;
  return r;
}
const req = q => ({ method: 'GET', query: { q }, headers: { origin: 'https://app.aurixsystem.io' } });

// mirror the ESM handlers (package.json has no "type":"module"; production keeps its convention)
const MIRROR = path.join(os.tmpdir(), 'aurix-catalog-retrieval-mirror');
function mirror(name) {
  const src = fs.readFileSync(path.join(root, 'api/search', name + '.js'), 'utf8')
    .replace(/from '\.\/_cg-catalog\.js'/g, "from './_cg-catalog.mjs'")
    .replace(/from '\.\/_contract-discovery\.js'/g, "from './_contract-discovery.mjs'");
  const out = path.join(MIRROR, name + '.mjs');
  fs.writeFileSync(out, src);
  return out;
}

// the REAL ranker, in a sandbox
function buildRanker() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Object, String, Number, isFinite, RegExp, Set, Map };
  vm.createContext(ctx);
  ['_AURIX_FUND_DB', '_AURIX_SEARCH_PROVIDER_SLUG_MATCH'].forEach(c => vm.runInContext(konstSrc(c), ctx));
  ['_aurixSearchIdentifierKey', '_aurixSearchAliasHit', '_aurixSearchPopularity', '_aurixSearchTypeWeight',
   '_aurixSearchProviderWeight', '_aurixSearchMatchScore', '_aurixRankSearchResults']
    .forEach(f => vm.runInContext(fnSrc(f), ctx));
  return ctx;
}
const R = buildRanker();
function rank(items, q) { R.__i = items; R.__q = q; return vm.runInContext('_aurixRankSearchResults(__i, __q).map(a => a.coinId)', R); }

(async () => {
  fs.rmSync(MIRROR, { recursive: true, force: true });
  fs.mkdirSync(MIRROR, { recursive: true });
  const cgPath = mirror('_cg-catalog'); mirror('_contract-discovery');
  const catalog = await import('file://' + mirror('crypto').replace('crypto.mjs', '_cg-catalog.mjs'));
  const crypto = (await import('file://' + path.join(MIRROR, 'crypto.mjs'))).default;
  const cat = await import('file://' + cgPath);
  function resetCatalog() {
    const st = cat.__testing.state;
    st.status = 'idle'; st.at = 0; st.error = null; st.coins = 0; st.contracts = 0;
    st.byContract = new Map(); st.byId = new Map(); st.bySymbol = new Map(); st.byNameKey = new Map();
    st.nameKeys = []; st.inflight = null;
  }
  const search = async q => { const r = mkRes(); await crypto(req(q), r); return r.body; };

  console.log('AURIX-CATALOG-RETRIEVAL — SPEC MKT-EXCELLENCE.CATALOG-RETRIEVAL\n');

  // ── 1) the retrieval indexes ──
  console.log('1) catalog text indexes (same single pass, no extra request):');
  resetCatalog(); plan = {}; calls.length = 0;
  ok('1.0 catalog ready from ONE upstream call', (await cat.ensure(5000)) === true && calls.filter(c => c.includes('/coins/list')).length === 1);
  ok('1.1 exact ticker → every coin sharing it', (() => {
    const ids = cat.lookupByText('USDC', 8).map(c => c.coinId);
    return ids.includes('usd-coin') && ids.includes('bridged-usdc-base');
  })(), JSON.stringify(cat.lookupByText('USDC', 8)));
  ok('1.2 exact PROVIDER SLUG → the canonical coin ("USD Coin" → usd-coin)',
    cat.lookupByText('USD Coin', 4).some(c => c.coinId === 'usd-coin'), JSON.stringify(cat.lookupByText('USD Coin', 4)));
  ok('1.3 punctuation/space-insensitive ("usd-coin" == "usdcoin" == "USD Coin")',
    ['usd-coin', 'usdcoin', 'USD COIN'].every(q => cat.lookupByText(q, 4).some(c => c.coinId === 'usd-coin')));
  ok('1.4 exact name still works (natives included: no contract ≠ not findable)',
    cat.lookupByText('Bitcoin', 4).some(c => c.coinId === 'bitcoin') && cat.lookupByText('Hyperliquid', 4).some(c => c.coinId === 'hyperliquid'));
  ok('1.5 priority order: exact ticker before name/prefix', cat.lookupByText('USDC', 4)[0].matchedBy === 'symbol');
  ok('1.6 bounded prefix pass only from 3 chars', cat.lookupByText('us', 4).every(c => c.matchedBy !== 'prefix'));
  ok('1.7 the limit is respected', cat.lookupByText('usd', 2).length <= 2);
  ok('1.8 nothing invented: every candidate is a real catalog coin',
    cat.lookupByText('usd', 8).every(c => CATALOG.some(k => k.id === c.coinId && k.symbol.toUpperCase() === c.symbol)));
  ok('1.9 unknown text ⇒ no candidates', cat.lookupByText('zzzznotacoin', 4).length === 0);
  ok('1.10 chainsFor is unchanged for natives (chainCount 0, no invented contract)',
    cat.chainsFor('bitcoin').chainCount === 0 && cat.chainsFor('bitcoin').contract === null);
  ok('1.11 contract reverse index still exact (contract discovery untouched)',
    (cat.lookupContract('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') || {}).coinId === 'usd-coin');

  // ── 2) THE FOCAL CASE ──
  console.log('\n2) "USD Coin" — before/after:');
  const before = SEARCH_FEED['usd coin'].map(c => c.id);
  ok('2.1 BEFORE: the provider feed alone does NOT contain the canonical USDC', !before.includes('usd-coin'), JSON.stringify(before));
  const after = await search('usd coin');
  const afterIds = after.results.map(r => r.coinId);
  ok('2.2 AFTER: the canonical USDC is a candidate', afterIds.includes('usd-coin'), JSON.stringify(afterIds));
  ok('2.3 the provider results are all preserved', before.every(id => afterIds.includes(id)));
  ok('2.4 the catalog contribution is reported', after.meta.catalogCandidates >= 1);
  ok('2.5 the RANKER (untouched) puts it first', rank(after.results, 'usd coin')[0] === 'usd-coin', JSON.stringify(rank(after.results, 'usd coin')));
  ok('2.6 the catalog candidate carries NO logo and NO rank (nothing invented)', (() => {
    const c = after.results.find(r => r.coinId === 'usd-coin');
    return c.image === null && c.marketCapRank === null && c.ticker === 'USDC';
  })());

  // ── 3) no regression on the queries that already worked ──
  console.log('\n3) no regression:');
  for (const [q, expect] of [['usdc', 'usd-coin'], ['bitcoin', 'bitcoin'], ['btc', 'bitcoin'], ['hype', 'hyperliquid'], ['hyperliquid', 'hyperliquid']]) {
    const body = await search(q);
    const ranked = rank(body.results, q);
    ok('3.' + q + ' "' + q + '" → ' + expect + ' stays first', ranked[0] === expect, JSON.stringify(ranked));
  }
  {
    const body = await search('usdc');
    // the /search hit carries the real rank, the catalog twin does not ⇒ the ranked one must win
    ok('3.dup a shared ticker keeps SEPARATE identities', new Set(body.results.map(r => r.coinId)).size === body.results.length &&
      body.results.filter(r => r.ticker === 'USDC').length >= 2);
    ok('3.dup2 the coin with a real provider rank leads its own ticker',
      rank(body.results, 'usdc')[0] === 'usd-coin' && body.results.find(r => r.coinId === 'usd-coin').marketCapRank === 6);
  }

  // ── 4) dedupe by identity, never by symbol ──
  console.log('\n4) dedupe by canonical identity:');
  {
    const body = await search('usdc');
    ok('4.1 the catalog never duplicates a coin the feed already returned',
      body.results.filter(r => r.coinId === 'usd-coin').length === 1 && body.results.filter(r => r.coinId === 'bridged-usdc-base').length === 1);
    ok('4.2 every result still carries its canonical key', body.results.every(r => r.canonicalKey === 'coingecko:' + r.coinId));
    ok('4.3 same-ticker results are still flagged for disambiguation',
      body.results.filter(r => r.ticker === 'USDC').every(r => r.symbolCollision === true));
  }

  // ── 5) degradation: cold / failed catalog ──
  console.log('\n5) catalog unavailable ⇒ exactly the previous behaviour:');
  resetCatalog(); plan = { catalog: '429' }; calls.length = 0;
  const cold = await search('usd coin');
  ok('5.1 the search still answers', Array.isArray(cold.results) && cold.results.length === 3);
  ok('5.2 it is byte-identical to the provider feed', JSON.stringify(cold.results.map(r => r.coinId)) === JSON.stringify(before));
  ok('5.3 zero catalog candidates, and the state says why', cold.meta.catalogCandidates === 0 && cold.meta.catalogState !== 'ready');
  ok('5.4 no chain/contract invented', cold.results.every(r => r.chain === undefined && r.chainCount === undefined));
  {
    // a catalog slower than its budget must NOT delay the answer
    resetCatalog(); plan = { catalogSlow: 1200 };
    const t0 = Date.now();
    const slow = await search('usd coin');
    const dt = Date.now() - t0;
    ok('5.5 a slow catalog is skipped, not waited for (budget-bounded)', dt < 900 && slow.meta.catalogCandidates === 0, 'dt=' + dt + 'ms');
  }

  // ── 6) request budget ──
  console.log('\n6) request budget:');
  resetCatalog(); plan = {}; await cat.ensure(5000);
  calls.length = 0;
  await search('usd coin');
  ok('6.1 a warm catalog adds ZERO upstream calls', calls.length === 1 && calls[0].includes('/api/v3/search'), JSON.stringify(calls));
  ok('6.2 the catalog is fetched once, not per query', calls.filter(c => c.includes('/coins/list')).length === 0);

  // ── 7) ranking authority + rollback ──
  console.log('\n7) one ranker, and rollback:');
  const crySrc = fs.readFileSync(path.join(root, 'api/search/crypto.js'), 'utf8');
  ok('7.1 the route does not sort or score candidates', !/\.sort\(/.test(crySrc) && !/score/i.test(crySrc));
  ok('7.2 the slug match lives INSIDE the existing scorer (no parallel ranker)',
    /_aurixSearchIdentifierKey\(a\.coinId\)/.test(fnSrc('_aurixSearchMatchScore')) &&
    (app.match(/function _aurixRankSearchResults/g) || []).length === 1);
  {
    const OFF = (() => {
      const ctx = { console: { log() {} }, Math, JSON, Array, Object, String, Number, isFinite, RegExp, Set, Map };
      vm.createContext(ctx);
      vm.runInContext(konstSrc('_AURIX_FUND_DB'), ctx);
      vm.runInContext('const _AURIX_SEARCH_PROVIDER_SLUG_MATCH = false;', ctx);
      ['_aurixSearchIdentifierKey', '_aurixSearchAliasHit', '_aurixSearchPopularity', '_aurixSearchTypeWeight',
       '_aurixSearchProviderWeight', '_aurixSearchMatchScore', '_aurixRankSearchResults'].forEach(f => vm.runInContext(fnSrc(f), ctx));
      return ctx;
    })();
    const body = await search('usd coin');
    OFF.__i = body.results; OFF.__q = 'usd coin';
    const offOrder = vm.runInContext('_aurixRankSearchResults(__i, __q).map(a => a.coinId)', OFF);
    ok('7.3 slug-match OFF ⇒ the previous scoring (canonical coin no longer promoted)', offOrder[0] !== 'usd-coin', JSON.stringify(offOrder));
    ok('7.4 slug-match OFF does not change queries that matched by name/ticker', (() => {
      OFF.__i = body.results; OFF.__q = 'usd coinvertible';
      const a = vm.runInContext('_aurixRankSearchResults(__i, __q).map(a => a.coinId)', OFF);
      const b = rank(body.results, 'usd coinvertible');
      return JSON.stringify(a) === JSON.stringify(b);
    })());
  }
  {
    process.env.AURIX_CATALOG_RETRIEVAL = 'off';
    const mod = (await import('file://' + path.join(MIRROR, 'crypto.mjs') + '?off=1')).default;
    const r = mkRes(); await mod(req('usd coin'), r);
    ok('7.5 AURIX_CATALOG_RETRIEVAL=off ⇒ provider feed only', JSON.stringify(r.body.results.map(x => x.coinId)) === JSON.stringify(before) && r.body.meta.catalogCandidates === 0);
    delete process.env.AURIX_CATALOG_RETRIEVAL;
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
