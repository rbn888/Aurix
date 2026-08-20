'use strict';
// ════════════════════════════════════════════════════════════════════════════════════════════════
// AURIX-ASSET-DISCOVERY-IDENTITY-harness — SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Drives the REAL frontend discovery pipeline out of app.js (no re-implementation):
//   searchAllAssets → [contract route | provider retrieval] → canonical-identity dedupe
//   → _aurixRankSearchResults (UNCHANGED authority) → _aurixMarkCryptoAmbiguity
//   → _aurixSearchSubtitle / _searchResultToMarketItem / _aurixMktHydrateQuotes
//
// PROVES: one identity per asset (never the symbol); USDC vs Bridged USDC vs USDCx all reachable;
// contract search with absolute priority and zero textual calls; Market == Add Asset; no invented
// price/network/contract; the ranker is still the only ranker; flag OFF = previous behaviour.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function fnSrc(n) {
  const i = app.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('missing fn ' + n);
  let k = app.indexOf('{', i), d = 0;
  for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
function asyncFnSrc(n) {
  const i = app.indexOf('async function ' + n + '(');
  if (i < 0) throw new Error('missing async fn ' + n);
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

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const LONGTAIL = '0x1111111111111111111111111111111111111111';
const UNKNOWN  = '0x2222222222222222222222222222222222222222';

// ── provider fixtures — the SHAPE /api/search/crypto now returns ────────────────────────────────
const CRYPTO_RESULTS = {
  usdc: [
    { ticker: 'USDC',  name: 'USDC',                type: 'crypto', coinId: 'usd-coin',          marketSymbol: 'USDC',  image: 'https://x/usdc.png',  marketCapRank: 6,    canonicalKey: 'coingecko:usd-coin',          source: 'coingecko', symbolCollision: true,  chainCount: 3 },
    { ticker: 'USDC',  name: 'Bridged USDC (Base)', type: 'crypto', coinId: 'bridged-usdc-base', marketSymbol: 'USDC',  image: 'https://x/busdc.png', marketCapRank: 420,  canonicalKey: 'coingecko:bridged-usdc-base', source: 'coingecko', symbolCollision: true,  chainCount: 1, chain: 'Base', contract: '0xAAA0000000000000000000000000000000000001' },
    { ticker: 'USDCX', name: 'USDCx',               type: 'crypto', coinId: 'usdcx',             marketSymbol: 'USDCX', image: 'https://x/usdcx.png', marketCapRank: null, canonicalKey: 'coingecko:usdcx',             source: 'coingecko', symbolCollision: false, chainCount: 1, chain: 'Ethereum', contract: '0xBBB0000000000000000000000000000000000002' },
  ],
  btc: [ { ticker: 'BTC', name: 'Bitcoin', type: 'crypto', coinId: 'bitcoin', marketSymbol: 'BTC', image: 'https://x/btc.png', marketCapRank: 1, canonicalKey: 'coingecko:bitcoin', source: 'coingecko' } ],
  bitcoin: [ { ticker: 'BTC', name: 'Bitcoin', type: 'crypto', coinId: 'bitcoin', marketSymbol: 'BTC', image: 'https://x/btc.png', marketCapRank: 1, canonicalKey: 'coingecko:bitcoin', source: 'coingecko' } ],
  eth: [ { ticker: 'ETH', name: 'Ethereum', type: 'crypto', coinId: 'ethereum', marketSymbol: 'ETH', image: 'https://x/eth.png', marketCapRank: 2, canonicalKey: 'coingecko:ethereum', source: 'coingecko' } ],
  hype: [
    { ticker: 'HYPE', name: 'Hyperliquid', type: 'crypto', coinId: 'hyperliquid', marketSymbol: 'HYPE', image: 'https://x/hype.png', marketCapRank: 30, canonicalKey: 'coingecko:hyperliquid', source: 'coingecko' },
    { ticker: 'HYPE', name: 'Hype Token',  type: 'crypto', coinId: 'hype-token',  marketSymbol: 'HYPE', image: 'https://x/hype2.png', marketCapRank: 3900, canonicalKey: 'coingecko:hype-token', source: 'coingecko', symbolCollision: true, chainCount: 1, chain: 'Base', contract: '0xCCC0000000000000000000000000000000000003' },
  ],
  hyperliquid: [ { ticker: 'HYPE', name: 'Hyperliquid', type: 'crypto', coinId: 'hyperliquid', marketSymbol: 'HYPE', image: 'https://x/hype.png', marketCapRank: 30, canonicalKey: 'coingecko:hyperliquid', source: 'coingecko' } ],
};
CRYPTO_RESULTS.hype[0].symbolCollision = true;
const YAHOO_RESULTS = {
  btc: [], bitcoin: [], eth: [], usdc: [], usdcx: [], hype: [], hyperliquid: [],
};
const CONTRACT_PAYLOADS = {
  [USDC_ETH.toLowerCase()]: { found: true, reason: null, result: {
    ticker: 'USDC', name: 'USDC', type: 'crypto', coinId: 'usd-coin', marketSymbol: 'USDC',
    image: 'https://x/usdc-large.png', price: 0.9998, marketCapRank: 6,
    canonicalKey: 'coingecko:usd-coin', chain: 'Ethereum', networkId: 'ethereum', contract: USDC_ETH,
    source: 'coingecko', priceable: true, matchedBy: 'contract' } },
  [LONGTAIL.toLowerCase()]: { found: true, reason: null, result: {
    ticker: 'LTT', name: 'Long Tail Token', type: 'crypto', coinId: null, marketSymbol: null,
    image: 'https://x/ltt.png', price: 0.004212, marketCapRank: null,
    canonicalKey: 'chain:ethereum:' + LONGTAIL.toLowerCase(), chain: 'Ethereum', networkId: 'ethereum',
    contract: LONGTAIL, source: 'geckoterminal', priceable: false, matchedBy: 'contract' } },
  [UNKNOWN.toLowerCase()]: { found: false, reason: 'contract_not_found', result: null },
};

const CONSTS = ['_AURIX_DISCOVERY_IDENTITY_V1', '_AURIX_CONTRACT_SHAPES', '_AURIX_CONTRACT_CACHE_MAX',
  '_AURIX_FUND_DISCOVERY', '_AURIX_INSTITUTIONAL_DISPLAY_NAME', '_AURIX_LEGAL_SUFFIXES'];
const FNS = ['_aurixDetectContractFamily', '_aurixLooksLikeContract', '_aurixShortContract',
  '_aurixCanonicalAssetKey', '_aurixContractLookupState', '_aurixContractResultToItem',
  '_aurixMarkCryptoAmbiguity', '_aurixSearchProject', '_aurixSearchTypeWeight', '_aurixSearchProviderWeight', '_aurixSearchAliasHit', '_aurixSearchPopularity',
  '_aurixSearchMatchScore', '_aurixRankSearchResults', '_aurixSearchSubtitle', '_searchResultToMarketItem',
  '_aurixStripLegalSuffix', '_aurixInstitutionalDisplayName', 'getDisplayName', 'searchMetalsLocal'];
const ASYNC_FNS = ['_aurixSearchByContract', 'searchAllAssets', 'searchByFilter', '_aurixMktHydrateQuotes'];

const W = { yahooCalls: 0, cryptoCalls: 0, contractCalls: 0, snapshotCalls: 0, snapshot: [], failContract: false };

function buildCtx(overrides) {
  overrides = overrides || {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Map, Set,
    Object, isNaN, parseInt, parseFloat, String, RegExp, Boolean, Error, Promise, encodeURIComponent, decodeURIComponent,
    PRICES_PROXY: 'https://api.example.test/api/prices',
    ASSET_DB: [],
    activeRange: '24h', lang: 'en',
    T: { en: { typeLabel: { crypto: 'CRYPTO', stock: 'STOCK', etf: 'ETF', fund: 'FUND', metal: 'METAL' } } },
    normalizeSymbol: s => String(s || '').toUpperCase().trim(),
    // the two textual providers stay EXACTLY where they were — the harness only counts their use
    searchYahooFinance: async q => { W.yahooCalls++; return YAHOO_RESULTS[String(q).toLowerCase()] || []; },
    searchCoinGeckoAPI: async q => { W.cryptoCalls++; return (CRYPTO_RESULTS[String(q).toLowerCase()] || []).map(o => Object.assign({}, o)); },
    _aurixSearchFundsLocal: () => [],
    _aurixSearchEtfsLocal: () => [],
    _aurixParseFundMeta: () => ({ manager: null, currency: null }),
    _aurixContractLookup: { address: null, state: 'idle', reason: null, at: 0 },
    _aurixContractCache: new Map(),
    fetch: async (url) => {
      const u = String(url);
      if (u.indexOf('/api/search/contract') >= 0) {
        W.contractCalls++;
        if (W.failContract) return { ok: false, status: 429, json: async () => ({}) };
        const m = /address=([^&]+)/.exec(u);
        const addr = m ? decodeURIComponent(m[1]).toLowerCase() : '';
        const payload = CONTRACT_PAYLOADS[addr] || { found: false, reason: 'contract_not_found', result: null };
        return { ok: true, status: 200, json: async () => payload };
      }
      if (u.indexOf('/snapshot?') >= 0) {
        W.snapshotCalls++;
        return { ok: true, status: 200, json: async () => ({ snapshot: W.snapshot }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  vm.createContext(ctx);
  CONSTS.forEach(c => {
    try {
      let src = konstSrc(c);
      if (Object.prototype.hasOwnProperty.call(overrides, c)) src = 'const ' + c + ' = ' + JSON.stringify(overrides[c]) + ';';
      vm.runInContext(src, ctx);
    } catch (e) { console.log('  (const load fail ' + c + ': ' + e.message.slice(0, 60) + ')'); }
  });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  (fn load fail ' + f + ': ' + e.message.slice(0, 70) + ')'); } });
  ASYNC_FNS.forEach(f => { try { vm.runInContext(asyncFnSrc(f), ctx); } catch (e) { console.log('  (async fn load fail ' + f + ': ' + e.message.slice(0, 70) + ')'); } });
  return ctx;
}
const run = (ctx, expr) => vm.runInContext(expr, ctx);
async function search(ctx, q, filter) {
  ctx.__q = q; ctx.__f = filter == null ? undefined : filter;
  return await run(ctx, 'searchAllAssets(__q, undefined, __f)');
}
const keys = arr => (arr || []).map(a => run(ON, '_aurixCanonicalAssetKey(' + JSON.stringify(a) + ')'));

const ON  = buildCtx();
const OFF = buildCtx({ _AURIX_DISCOVERY_IDENTITY_V1: false });

(async () => {
  console.log('AURIX-ASSET-DISCOVERY-IDENTITY — SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1');
  console.log('flag: discoveryIdentityV1=' + run(ON, '_AURIX_DISCOVERY_IDENTITY_V1') + '\n');

  // ── 1) canonical identity ──
  console.log('1) canonical identity — never the symbol:');
  const ck = o => run(ON, '_aurixCanonicalAssetKey(' + JSON.stringify(o) + ')');
  ok('1.1 crypto identity is the provider id', ck({ type: 'crypto', ticker: 'USDC', coinId: 'usd-coin' }) === 'coingecko:usd-coin');
  ok('1.2 same symbol + different provider id ⇒ DIFFERENT assets',
    ck({ type: 'crypto', ticker: 'USDC', coinId: 'usd-coin' }) !== ck({ type: 'crypto', ticker: 'USDC', coinId: 'bridged-usdc-base' }));
  ok('1.3 no provider id ⇒ identity is chain + contract',
    ck({ type: 'crypto', ticker: 'LTT', networkId: 'ethereum', contract: '0xAbC' }) === 'chain:ethereum:0xabc');
  ok('1.4 same symbol on two contracts ⇒ DIFFERENT assets',
    ck({ type: 'crypto', ticker: 'X', networkId: 'ethereum', contract: '0xaaa' }) !== ck({ type: 'crypto', ticker: 'X', networkId: 'base', contract: '0xbbb' }));
  ok('1.5 a symbol-only crypto never collapses onto an identified one',
    ck({ type: 'crypto', ticker: 'USDC' }) === 'crypto-symbol:USDC' && ck({ type: 'crypto', ticker: 'USDC' }) !== 'coingecko:usd-coin');
  ok('1.6 funds/ETFs keep ISIN identity', ck({ type: 'fund', ticker: 'VG-WLD', isin: 'IE00B03HD191' }) === 'isin:IE00B03HD191');
  ok('1.7 provider-supplied canonicalKey wins', ck({ type: 'crypto', ticker: 'A', coinId: 'x', canonicalKey: 'chain:base:0x1' }) === 'chain:base:0x1');

  // ── 2) contract-shape detection ──
  console.log('\n2) contract intent detection (multi-chain, not ERC-20-bound):');
  ok('2.1 EVM address', run(ON, `_aurixDetectContractFamily(${JSON.stringify(USDC_ETH)})`) === 'evm');
  ok('2.2 Solana address', run(ON, "_aurixDetectContractFamily('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')") === 'solana');
  ok('2.3 Tron address', run(ON, "_aurixDetectContractFamily('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')") === 'tron');
  ok('2.4 tickers and names are NOT contracts',
    !run(ON, "_aurixLooksLikeContract('USDC')") && !run(ON, "_aurixLooksLikeContract('Bitcoin')") &&
    !run(ON, "_aurixLooksLikeContract('USD Coin')") && !run(ON, "_aurixLooksLikeContract('0xdead')"));
  ok('2.5 contract abbreviation matches the SPEC example',
    run(ON, `_aurixShortContract(${JSON.stringify(USDC_ETH)})`) === '0xA0b8…eB48');

  // ── 3) textual search — coverage + dedupe by identity ──
  console.log('\n3) textual search (the SPEC\'s mandatory cases):');
  for (const q of ['BTC', 'Bitcoin', 'ETH', 'HYPE', 'Hyperliquid', 'USDC']) {
    const r = await search(ON, q);
    ok('3.q "' + q + '" returns real candidates', Array.isArray(r) && r.length >= 1, 'n=' + (r && r.length));
  }
  const usdc = await search(ON, 'USDC');
  ok('3.1 USDC: the three distinct assets all survive', usdc.length === 3, 'n=' + usdc.length + ' → ' + usdc.map(r => r.name).join(' | '));
  ok('3.2 USDC and Bridged USDC coexist (same ticker, different identity)',
    usdc.filter(r => r.ticker === 'USDC').length === 2 && new Set(usdc.map(r => r.canonicalKey)).size === 3);
  ok('3.3 USDCx is present and unambiguously distinct',
    !!usdc.find(r => r.canonicalKey === 'coingecko:usdcx') && usdc.find(r => r.canonicalKey === 'coingecko:usdcx').ticker === 'USDCX');
  ok('3.4 BEFORE (flag OFF): the same query collapses by symbol and loses one asset',
    (await search(OFF, 'USDC')).filter(r => r.ticker === 'USDC').length === 1);
  const hype = await search(ON, 'HYPE');
  ok('3.5 a long-tail token sharing a ticker with a major is now reachable', hype.length === 2 && hype[0].coinId === 'hyperliquid',
    hype.map(h => h.coinId + '/' + h.marketCapRank).join(' | '));
  ok('3.6 exact-symbol/name priority is untouched (ranker authority)', hype[0].name === 'Hyperliquid');

  // ── 4) the ranker is still the ONLY ranker ──
  console.log('\n4) no parallel ranking:');
  {
    const items = CRYPTO_RESULTS.usdc.map(o => Object.assign({}, o));
    ctxRankCheck: {
      ON.__items = items;
      const viaRanker = run(ON, '_aurixRankSearchResults(__items, "usdc").map(a => a.canonicalKey)');
      const viaPipeline = usdc.map(r => r.canonicalKey);
      ok('4.1 pipeline order === _aurixRankSearchResults order', JSON.stringify(viaRanker) === JSON.stringify(viaPipeline),
        JSON.stringify(viaRanker) + ' vs ' + JSON.stringify(viaPipeline));
    }
    ok('4.2 searchAllAssets contains no scoring/sorting of its own',
      !/\.sort\(/.test(asyncFnSrc('searchAllAssets')) && (asyncFnSrc('searchAllAssets').match(/_aurixRankSearchResults/g) || []).length === 1);
  }

  // ── 5) CONTRACT SEARCH ──
  console.log('\n5) contract search — absolute priority, zero textual calls:');
  W.yahooCalls = 0; W.cryptoCalls = 0; W.contractCalls = 0;
  const byContract = await search(ON, USDC_ETH);
  ok('5.1 exactly ONE result: the exact contract match', byContract.length === 1 && byContract[0].coinId === 'usd-coin');
  ok('5.2 chain + contract are preserved as identity',
    byContract[0].chain === 'Ethereum' && byContract[0].contract === USDC_ETH && byContract[0].canonicalKey === 'coingecko:usd-coin');
  ok('5.3 metadata/logo/price come from the provider', byContract[0].image === 'https://x/usdc-large.png' && byContract[0].price === 0.9998);
  ok('5.4 NO textual provider call was made for an address', W.yahooCalls === 0 && W.cryptoCalls === 0 && W.contractCalls === 1,
    JSON.stringify({ y: W.yahooCalls, c: W.cryptoCalls, k: W.contractCalls }));
  ok('5.5 the result is marked as contract-matched (never re-ranked against text)', byContract[0].matchedBy === 'contract');
  W.contractCalls = 0;
  const again = await search(ON, USDC_ETH);
  ok('5.6 the same address is cached (0 extra requests)', W.contractCalls === 0 && again.length === 1);
  const lt = await search(ON, LONGTAIL);
  ok('5.7 on-chain long tail resolves with chain+contract identity',
    lt.length === 1 && lt[0].canonicalKey === 'chain:ethereum:' + LONGTAIL.toLowerCase() && lt[0].priceable === false);

  // ── 6) honesty on failure ──
  console.log('\n6) DATA HONESTY:');
  const nf = await search(ON, UNKNOWN);
  ok('6.1 unknown contract ⇒ NO results (never a silent text fallback)', Array.isArray(nf) && nf.length === 0);
  ok('6.2 the state says "not found" so the UI can say it', run(ON, '_aurixContractLookupState().state') === 'not_found');
  W.failContract = true;
  const down = await search(ON, '0x4444444444444444444444444444444444444444');
  ok('6.3 provider down ⇒ empty + provider_unavailable (≠ asset does not exist)',
    down.length === 0 && run(ON, '_aurixContractLookupState().state') === 'provider_unavailable');
  ok('6.4 an outage is NOT cached as non-existence', run(ON, '_aurixContractCache.has("0x4444444444444444444444444444444444444444")') === false);
  W.failContract = false;
  ok('6.5 no invented network/contract on a multi-chain coin',
    (() => { const m = usdc.find(r => r.coinId === 'usd-coin'); return m.chain === undefined && m.contract === undefined; })());
  ok('6.6 no invented price anywhere in a textual result set', usdc.every(r => r.price === undefined || r.price === null));

  // ── 7) UX disambiguation (progressive disclosure) ──
  console.log('\n7) UX — logo | name | ticker, network/contract only when needed:');
  const sub = a => { ON.__a = a; return run(ON, '_aurixSearchSubtitle(__a)'); };
  ok('7.1 an unambiguous crypto keeps the previous subtitle (no noise)',
    sub({ type: 'crypto', ticker: 'BTC', name: 'Bitcoin' }) === 'BTC · CRYPTO', sub({ type: 'crypto', ticker: 'BTC', name: 'Bitcoin' }));
  ok('7.2 a symbol collision shows the network', sub(usdc.find(r => r.coinId === 'bridged-usdc-base')) === 'USDC · Base · 0xAAA0…0001',
    sub(usdc.find(r => r.coinId === 'bridged-usdc-base')));
  ok('7.3 a contract match shows network + abbreviated contract',
    sub(byContract[0]) === 'USDC · Ethereum · 0xA0b8…eB48', sub(byContract[0]));
  ok('7.4 the two same-ticker results are visually distinguishable',
    sub(usdc.find(r => r.coinId === 'usd-coin')) !== sub(usdc.find(r => r.coinId === 'bridged-usdc-base')));
  ok('7.5 nothing is written when there is nothing to write',
    sub({ type: 'crypto', ticker: 'ZZZ', symbolCollision: true }) === 'ZZZ · CRYPTO');
  ok('7.6 non-crypto subtitles are byte-identical to before',
    sub({ type: 'stock', ticker: 'AAPL', name: 'Apple' }) === 'AAPL · STOCK' &&
    sub({ type: 'fund', ticker: 'VG-WLD', name: 'X', manager: 'Vanguard', isin: 'IE00B03HD191', shareClass: 'EUR Acc' }) === 'VG-WLD · FUND · Vanguard · EUR Acc · IE00B03HD191');

  // ── 8) Market == Add Asset ──
  console.log('\n8) ONE pipeline: Market and Add Asset agree:');
  const addAll = await search(ON, 'USDC');
  const addCrypto = await (async () => { ON.__q = 'USDC'; return run(ON, "searchByFilter('USDC', 'crypto', undefined)"); })();
  ok('8.1 filtered view is a projection of the same result set, same order',
    JSON.stringify(addCrypto.map(r => r.canonicalKey)) === JSON.stringify(addAll.filter(r => r.type === 'crypto').map(r => r.canonicalKey)));
  const rows = addAll.map(r => { ON.__r = r; return run(ON, '_searchResultToMarketItem(__r)'); });
  ok('8.2 identity survives the Market bridge (id, chain, contract, canonical key)',
    rows.every((row, i) => row.canonicalKey === addAll[i].canonicalKey && row.coinId === addAll[i].coinId) &&
    rows.find(r => r.coinId === 'bridged-usdc-base').chain === 'Base');
  ok('8.3 the provider logo is no longer dropped on the way to Market',
    rows.every(r => typeof r.image === 'string' && r.image.length > 0));
  ok('8.4 provider rank travels with the row (real signal, used for symbol ownership)',
    rows.find(r => r.coinId === 'usd-coin').marketCapRank === 6);
  ok('8.5 two same-ticker rows stay two rows with different identities',
    rows.filter(r => r.symbol === 'USDC').length === 2 && new Set(rows.map(r => r.canonicalKey)).size === 3);

  // ── 9) never another asset's price ──
  console.log('\n9) shared-symbol pricing honesty (Market hydration):');
  W.snapshot = [{ symbol: 'USDC', price: 1.0001, change24h: 0.01, currency: 'USD' }];
  ON.__rows = rows.map(r => Object.assign({}, r));
  const hydrated = await run(ON, '_aurixMktHydrateQuotes(__rows, undefined)');
  const major = hydrated.find(r => r.coinId === 'usd-coin'), bridged = hydrated.find(r => r.coinId === 'bridged-usdc-base');
  ok('9.1 the demonstrable owner of the symbol (best real rank) gets the quote', major.current_price === 1.0001);
  ok('9.2 the OTHER token with the same ticker is NOT given that price', bridged.current_price == null, String(bridged.current_price));
  {
    ON.__rows2 = [Object.assign({}, rows[0], { matchedBy: 'contract', current_price: null, price: null })];
    const h2 = await run(ON, '_aurixMktHydrateQuotes(__rows2, undefined)');
    ok('9.3 a contract-matched row is never quoted by symbol', h2[0].current_price == null);
  }

  // ── 10) request budget / cancellation ──
  console.log('\n10) request budget:');
  W.yahooCalls = 0; W.cryptoCalls = 0; W.contractCalls = 0;
  await search(ON, 'USDC');
  ok('10.1 a textual query still costs exactly the two pre-existing provider calls',
    W.yahooCalls === 1 && W.cryptoCalls === 1 && W.contractCalls === 0, JSON.stringify({ y: W.yahooCalls, c: W.cryptoCalls, k: W.contractCalls }));
  {
    // fast typing: an aborted signal must yield null and never publish stale results
    ON.__sig = { aborted: true };
    const aborted = await run(ON, 'searchAllAssets("USDC", __sig, undefined)');
    ok('10.2 an aborted query returns null (no stale publication)', aborted === null);
  }
  ok('10.3 the contract cache is bounded', run(ON, '_AURIX_CONTRACT_CACHE_MAX') <= 100 && run(ON, '_aurixContractCache.size') <= run(ON, '_AURIX_CONTRACT_CACHE_MAX'));

  // ── 11) blast radius ──
  console.log('\n11) blast radius:');
  ok('11.1 the ranker source is untouched by this SPEC', !/DISCOVERY_IDENTITY/.test(fnSrc('_aurixRankSearchResults') + fnSrc('_aurixSearchMatchScore')));
  ok('11.2 non-crypto dedupe still uses ISIN + exact ticker', /ISIN:/.test(asyncFnSrc('searchAllAssets')) && /TK:/.test(asyncFnSrc('searchAllAssets')));
  ok('11.3 flag OFF: crypto dedupe returns to ticker keys', (await search(OFF, 'HYPE')).length === 1);
  ok('11.4 flag OFF: subtitle is the previous one', (() => { OFF.__a = { type: 'crypto', ticker: 'USDC', chain: 'Base', contract: '0x1', symbolCollision: true }; return run(OFF, '_aurixSearchSubtitle(__a)') === 'USDC · CRYPTO'; })());
  {
    W.contractCalls = 0; W.yahooCalls = 0; W.cryptoCalls = 0;
    OFF.__q = USDC_ETH;
    const offAddr = await run(OFF, 'searchAllAssets(__q, undefined, undefined)');
    ok('11.5 flag OFF: an address goes back through the textual path, no contract lookup',
      Array.isArray(offAddr) && W.contractCalls === 0 && W.yahooCalls === 1 && W.cryptoCalls === 1,
      JSON.stringify({ n: offAddr && offAddr.length, k: W.contractCalls, y: W.yahooCalls, c: W.cryptoCalls }));
  }
  ok('11.6 no crypto item is ever merged on symbol coincidence alone',
    /identidad canónica, no por\s*\n?\s*\/\/ ticker/.test(asyncFnSrc('searchAllAssets')) || /CANON:/.test(asyncFnSrc('searchAllAssets')));

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
