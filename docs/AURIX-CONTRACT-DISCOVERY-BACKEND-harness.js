'use strict';
// ════════════════════════════════════════════════════════════════════════════════════════════════
// AURIX-CONTRACT-DISCOVERY-BACKEND-harness — SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Drives the REAL route (api/search/crypto.js — textual mode AND contract mode) plus the shared
// modules it bundles (_cg-catalog.js, _contract-discovery.js) with a stubbed upstream `fetch`. No
// re-implementation: the handler is imported and invoked exactly as Vercel invokes it. Contract
// discovery is a MODE of this route, not a second function: the deployment is at the plan's
// 12-Serverless-Function ceiling, which is why the shared modules stay underscore-prefixed.
//
// WHAT IT PROVES
//   • crypto search dedupes by PROVIDER ID, never by symbol (USDC / Bridged USDC / USDCx coexist)
//   • chain + contract are attached ONLY from the cached catalog, ONLY when unambiguous (one chain),
//     and are ABSENT — never guessed — while the catalog is cold
//   • contract → canonical identity resolution, exact, multi-chain, bounded in upstream calls
//   • "not found" ≠ "provider unavailable"; an outage is never cached as non-existence
//   • no provider key is ever echoed to the client
const path = require('path');
const root = path.join(__dirname, '..');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

function mkRes() {
  const r = { code: null, body: null, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = o => { r.body = o; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}
const req = (query, method) => ({ method: method || 'GET', query: query || {}, headers: { origin: 'https://app.aurixsystem.io' } });

// ── upstream fixtures (real provider shapes) ────────────────────────────────────────────────────
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_BASE = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
const LONGTAIL = '0x1111111111111111111111111111111111111111';
const UNKNOWN  = '0x2222222222222222222222222222222222222222';
const SOL_ADDR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const CATALOG = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', platforms: { '': '' } },                       // native: no contract
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', platforms: { ethereum: '' } },               // listed, no contract
  { id: 'usd-coin', symbol: 'usdc', name: 'USDC', platforms: { ethereum: USDC_ETH, solana: SOL_ADDR, base: USDC_BASE } },
  { id: 'bridged-usdc-base', symbol: 'usdc', name: 'Bridged USDC (Base)', platforms: { base: '0xAAA0000000000000000000000000000000000001' } },
  { id: 'usdcx', symbol: 'usdcx', name: 'USDCx', platforms: { ethereum: '0xBBB0000000000000000000000000000000000002' } },
  { id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', platforms: {} },
];
const CG_SEARCH_USDC = { coins: [
  { id: 'usd-coin',          symbol: 'usdc',  name: 'USDC',                 market_cap_rank: 6,    large: 'https://x/usdc.png' },
  { id: 'bridged-usdc-base', symbol: 'usdc',  name: 'Bridged USDC (Base)',  market_cap_rank: 420,  large: 'https://x/busdc.png' },
  { id: 'usdcx',             symbol: 'usdcx', name: 'USDCx',                market_cap_rank: null, large: 'https://x/usdcx.png' },
] };
const CG_CONTRACT_USDC = {
  id: 'usd-coin', symbol: 'usdc', name: 'USDC', market_cap_rank: 6,
  image: { large: 'https://x/usdc-large.png' },
  detail_platforms: { ethereum: { contract_address: USDC_ETH } },
  platforms: { ethereum: USDC_ETH },
  market_data: { current_price: { usd: 0.9998 } },
};
const GT_LONGTAIL = { data: { attributes: {
  address: LONGTAIL, name: 'Long Tail Token', symbol: 'LTT', image_url: 'https://x/ltt.png',
  price_usd: '0.004212', coingecko_coin_id: null,
} } };

// ── fetch stub ──────────────────────────────────────────────────────────────────────────────────
const calls = [];
let plan = {};   // { catalog, cgSearch, cgContract:{[platform]: 'hit'|'404'|'429'}, gt:{[net]: 'hit'|'404'|'429'} }
function resp(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  calls.push({ url: u, headers: (opts && opts.headers) || {} });
  if (u.includes('/coins/list')) {
    if (plan.catalog === '429') return resp(429, {});
    if (plan.catalog === 'malformed') return resp(200, { nope: true });
    return resp(200, CATALOG);
  }
  if (u.includes('/api/v3/search?')) {
    if (plan.cgSearch === '429') return resp(429, {});
    return resp(200, CG_SEARCH_USDC);
  }
  const cgc = u.match(/\/api\/v3\/coins\/([^/]+)\/contract\/(.+)$/);
  if (cgc) {
    const platform = cgc[1], addr = decodeURIComponent(cgc[2]);
    const mode = (plan.cgContract && plan.cgContract[platform]) || plan.cgContractDefault || '404';
    if (mode === '429') return resp(429, {});
    if (mode === 'hit' && addr.toLowerCase() === USDC_ETH.toLowerCase()) return resp(200, CG_CONTRACT_USDC);
    return resp(404, {});
  }
  const gt = u.match(/geckoterminal\.com\/api\/v2\/networks\/([^/]+)\/tokens\/(.+)$/);
  if (gt) {
    const net = gt[1], addr = decodeURIComponent(gt[2]);
    const mode = (plan.gt && plan.gt[net]) || plan.gtDefault || '404';
    if (mode === '429') return resp(429, {});
    if (mode === 'hit' && addr.toLowerCase() === LONGTAIL.toLowerCase()) return resp(200, GT_LONGTAIL);
    return resp(404, {});
  }
  return resp(404, {});
};

// The api/ handlers are ES modules served by Vercel, but package.json has no "type":"module" (so
// production keeps its current convention). To import the REAL source unmodified, each file is
// mirrored to a temp .mjs with only its relative specifiers re-pointed — same bytes otherwise.
const os = require('os');
const MIRROR = path.join(os.tmpdir(), 'aurix-discovery-harness-mirror');
function mirror(name) {
  const src = fs.readFileSync(path.join(root, 'api/search', name + '.js'), 'utf8')
    .replace(/from '\.\/_cg-catalog\.js'/g, "from './_cg-catalog.mjs'")
    .replace(/from '\.\/_contract-discovery\.js'/g, "from './_contract-discovery.mjs'");
  const out = path.join(MIRROR, name + '.mjs');
  fs.writeFileSync(out, src);
  return out;
}
(async () => {
  fs.rmSync(MIRROR, { recursive: true, force: true });
  fs.mkdirSync(MIRROR, { recursive: true });
  const cgPath = mirror('_cg-catalog'); mirror('_contract-discovery');
  const cryptoPath = mirror('crypto');
  const catalog  = await import('file://' + cgPath);
  const crypto   = (await import('file://' + cryptoPath)).default;
  // contract discovery is reached through the SAME route, with ?address= instead of ?q=
  const contract = crypto;

  function resetCatalog() {
    const st = catalog.__testing.state;
    st.status = 'idle'; st.at = 0; st.error = null; st.coins = 0; st.contracts = 0;
    st.byContract = new Map(); st.byId = new Map(); st.inflight = null;
  }

  console.log('AURIX-CONTRACT-DISCOVERY-BACKEND — SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1\n');

  // ── 1) address shape → chain family (multi-chain by construction) ──
  console.log('1) address shape → chain family:');
  ok('1.1 EVM address detected', catalog.detectAddressFamily(USDC_ETH) === 'evm');
  ok('1.2 Solana address detected', catalog.detectAddressFamily(SOL_ADDR) === 'solana');
  ok('1.3 Tron address detected', catalog.detectAddressFamily('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') === 'tron');
  ok('1.4 plain text is NOT a contract', !catalog.looksLikeContractAddress('USDC') && !catalog.looksLikeContractAddress('Bitcoin') && !catalog.looksLikeContractAddress('0x1234'));
  ok('1.5 family table is not EVM-only', catalog.networksForFamily('evm').length >= 5 && catalog.networksForFamily('solana').length === 1);

  // ── 2) the identity catalog ──
  console.log('\n2) identity catalog (one upstream call, contract⇄id index):');
  resetCatalog(); plan = {}; calls.length = 0;
  const ready = await catalog.ensure(5000);
  ok('2.1 catalog becomes ready from ONE upstream call', ready === true && calls.filter(c => c.url.includes('/coins/list')).length === 1, 'calls=' + calls.length);
  ok('2.2 contract → {coinId, network} exact reverse lookup', (() => {
    const h = catalog.lookupContract(USDC_ETH.toLowerCase());
    return h && h.coinId === 'usd-coin' && h.network === 'Ethereum';
  })());
  ok('2.3 a NATIVE coin (no contract) is not indexed as a token', catalog.chainsFor('bitcoin') && catalog.chainsFor('bitcoin').chainCount === 0);
  ok('2.4 multi-chain coin ⇒ NO primary chain is invented', (() => {
    const c = catalog.chainsFor('usd-coin');
    return c.chainCount === 3 && c.primaryChain === null && c.contract === null;
  })(), JSON.stringify(catalog.chainsFor('usd-coin')));
  ok('2.5 single-chain coin ⇒ chain + contract are known', (() => {
    const c = catalog.chainsFor('bridged-usdc-base');
    return c.chainCount === 1 && c.primaryChain === 'Base' && /^0xAAA0/.test(c.contract);
  })());
  ok('2.6 an empty platform address is never turned into a contract', catalog.lookupContract('') === null && catalog.chainsFor('ethereum').chainCount === 0);

  // ── 3) crypto search: identity, not symbol ──
  console.log('\n3) /api/search/crypto — dedupe by provider id:');
  const r3 = mkRes(); await crypto(req({ q: 'usdc' }), r3);
  const res3 = r3.body.results;
  ok('3.1 three DISTINCT assets survive (before: symbol dedupe kept ONE)', res3.length === 3, 'n=' + res3.length);
  ok('3.2 USD Coin and Bridged USDC coexist with the SAME ticker', res3.filter(r => r.ticker === 'USDC').length === 2);
  ok('3.3 every result carries a canonical key derived from the provider id',
    res3.every(r => r.canonicalKey === 'coingecko:' + r.coinId));
  ok('3.4 same-symbol results are flagged for disambiguation',
    res3.filter(r => r.ticker === 'USDC').every(r => r.symbolCollision === true) && res3.find(r => r.ticker === 'USDCX').symbolCollision === false);
  ok('3.5 USDCx is an unambiguously different asset', (() => {
    const x = res3.find(r => r.coinId === 'usdcx');
    return x && x.ticker === 'USDCX' && x.canonicalKey === 'coingecko:usdcx';
  })());
  ok('3.6 multi-chain coin exposes chainCount and NO single chain/contract', (() => {
    const m = res3.find(r => r.coinId === 'usd-coin');
    return m.chainCount === 3 && m.chain === undefined && m.contract === undefined;
  })(), JSON.stringify(res3.find(r => r.coinId === 'usd-coin')));
  ok('3.7 single-chain coin carries its real network + contract', (() => {
    const b = res3.find(r => r.coinId === 'bridged-usdc-base');
    return b.chain === 'Base' && /^0xAAA0/.test(b.contract);
  })());
  ok('3.8 provider rank + logo preserved (real signals only)',
    res3.find(r => r.coinId === 'usd-coin').marketCapRank === 6 && res3.find(r => r.coinId === 'usd-coin').image === 'https://x/usdc.png');
  {
    calls.length = 0; await crypto(req({ q: 'usdc' }), mkRes());
    ok('3.9 search costs ONE upstream call (catalog warmed out of band, never awaited)',
      calls.filter(c => c.url.includes('/api/v3/search')).length === 1 && calls.filter(c => c.url.includes('/coins/list')).length === 0,
      'calls=' + calls.map(c => c.url.slice(30, 70)).join('|'));
  }
  {
    calls.length = 0; const rr = mkRes(); await crypto(req({ q: 'hype' }), rr);
    ok('3.10 one search = one provider call (no fan-out per query)', calls.length === 1, 'calls=' + calls.map(c => c.url.slice(0, 60)).join('|'));
  }

  // ── 4) cold catalog: absence is reported, never guessed ──
  console.log('\n4) cold / failed catalog — no invented chain:');
  resetCatalog(); plan = { catalog: '429' };
  const r4 = mkRes(); await crypto(req({ q: 'usdc' }), r4);
  ok('4.1 results still ship (search never depends on the catalog)', r4.body.results.length === 3);
  ok('4.2 NO chain/contract/chainCount is invented while the catalog is unavailable',
    r4.body.results.every(r => r.chain === undefined && r.contract === undefined && r.chainCount === undefined));
  ok('4.3 the response states the catalog state (unknown ≠ none)',
    r4.body.meta && ['idle', 'loading', 'error'].includes(r4.body.meta.catalogState), JSON.stringify(r4.body.meta));

  // ── 5) contract discovery ──
  console.log('\n5) /api/search/contract — exact identity from a contract:');
  resetCatalog(); plan = { cgContract: { ethereum: 'hit' } }; calls.length = 0;
  const r5 = mkRes(); await contract(req({ address: USDC_ETH }), r5);
  const hit5 = r5.body.result;
  ok('5.1 found', r5.body.found === true && !!hit5, JSON.stringify(r5.body).slice(0, 160));
  ok('5.2 the RIGHT asset (identity, not a text guess)', hit5.coinId === 'usd-coin' && hit5.canonicalKey === 'coingecko:usd-coin');
  ok('5.3 chain + contract ARE the identity and are preserved', hit5.chain === 'Ethereum' && hit5.contract.toLowerCase() === USDC_ETH.toLowerCase() && hit5.networkId === 'ethereum');
  ok('5.4 metadata + real price only (0.9998 came from the provider)', hit5.image === 'https://x/usdc-large.png' && hit5.price === 0.9998);
  ok('5.5 matchedBy=contract ⇒ absolute priority downstream', hit5.matchedBy === 'contract' && hit5.source === 'coingecko');
  ok('5.6 the catalog made it ONE contract call, no network fan-out',
    calls.filter(c => c.url.includes('/contract/')).length === 1, 'probes=' + JSON.stringify(r5.body.meta.probes));
  ok('5.7 no provider key is echoed to the client', JSON.stringify(r5.body).indexOf('x-cg-demo-api-key') < 0 && JSON.stringify(r5.body).toLowerCase().indexOf('api_key') < 0);

  // second identical lookup → served from cache, zero upstream calls
  calls.length = 0;
  const r5b = mkRes(); await contract(req({ address: USDC_ETH }), r5b);
  ok('5.8 repeated lookup is cached (0 upstream calls)', calls.length === 0 && r5b.body.found === true && r5b.body.meta.cached === true);

  // ── 6) long tail via GeckoTerminal ──
  console.log('\n6) on-chain long tail (GeckoTerminal fallback):');
  plan = { cgContractDefault: '404', gt: { eth: 'hit' } }; calls.length = 0;
  const r6 = mkRes(); await contract(req({ address: LONGTAIL }), r6);
  ok('6.1 resolved by the on-chain provider', r6.body.found === true && r6.body.result.source === 'geckoterminal', JSON.stringify(r6.body).slice(0, 200));
  ok('6.2 identity is chain+contract (no provider coin id exists)',
    r6.body.result.canonicalKey === 'chain:ethereum:' + LONGTAIL.toLowerCase() && r6.body.result.coinId === null);
  ok('6.3 flagged NOT priceable by the Price Engine (honest, no fake feed)',
    r6.body.result.priceable === false && r6.body.result.marketSymbol === null && r6.body.result.price === 0.004212);
  ok('6.4 upstream probes stay bounded', calls.length <= 6, 'calls=' + calls.length);

  // ── 7) honesty: not found ≠ provider down ──
  console.log('\n7) DATA HONESTY — not found ≠ provider unavailable:');
  plan = { cgContractDefault: '404', gtDefault: '404' }; calls.length = 0;
  const r7 = mkRes(); await contract(req({ address: UNKNOWN }), r7);
  ok('7.1 unknown contract ⇒ found:false + contract_not_found', r7.body.found === false && r7.body.reason === 'contract_not_found');
  ok('7.2 the probe budget is bounded (no unbounded chain sweep)', calls.length <= 6, 'calls=' + calls.length);
  plan = { cgContractDefault: '429', gtDefault: '429' };
  const r7b = mkRes(); await contract(req({ address: '0x3333333333333333333333333333333333333333' }), r7b);
  ok('7.3 rate-limited providers ⇒ provider_unavailable (NOT "does not exist")',
    r7b.body.found === false && r7b.body.reason === 'provider_unavailable');
  plan = { cgContractDefault: '404', gtDefault: '404' };
  const r7c = mkRes(); await contract(req({ address: '0x3333333333333333333333333333333333333333' }), r7c);
  ok('7.4 an outage is never cached as non-existence (re-probed on the next call)',
    r7c.body.reason === 'contract_not_found' && r7c.body.meta.cached !== true);
  const r7d = mkRes(); await contract(req({ address: 'not-an-address' }), r7d);
  ok('7.5 unsupported shape is rejected explicitly, never text-searched',
    r7d.code === 400 && r7d.body.reason === 'unsupported_address_shape');
  // catalog knows the contract but CoinGecko metadata is down → identity survives, price does not
  resetCatalog(); plan = { cgContractDefault: '429' };
  await catalog.ensure(5000);
  const r7e = mkRes(); await contract(req({ address: USDC_BASE }), r7e);
  ok('7.6 known identity + degraded metadata ⇒ identity returned, price/logo NULL (never invented)',
    r7e.body.found === true && r7e.body.reason === 'metadata_unavailable' &&
    r7e.body.result.coinId === 'usd-coin' && r7e.body.result.price === null && r7e.body.result.image === null,
    JSON.stringify(r7e.body).slice(0, 200));

  // ── 8) rollback flag ──
  console.log('\n8) rollback (AURIX_DISCOVERY_IDENTITY_V1=off) reproduces the previous response:');
  {
    process.env.AURIX_DISCOVERY_IDENTITY_V1 = 'off';
    const mod = await import('file://' + cryptoPath + '?off=1');
    const r8 = mkRes(); await mod.default(req({ q: 'usdc' }), r8);
    ok('8.1 OFF: symbol dedupe is back (one USDC only)', r8.body.results.filter(r => r.ticker === 'USDC').length === 1, 'n=' + r8.body.results.length);
    ok('8.2 OFF: no identity fields, legacy shape', r8.body.results.every(r => r.canonicalKey === undefined) && r8.body.meta === undefined);
    delete process.env.AURIX_DISCOVERY_IDENTITY_V1;
  }

  // ── 9) source discipline ──
  console.log('\n9) source discipline:');
  const cSrc = fs.readFileSync(path.join(root, 'api/search/_contract-discovery.js'), 'utf8');
  const catSrc = fs.readFileSync(path.join(root, 'api/search/_cg-catalog.js'), 'utf8');
  ok('9.1 no hardcoded provider key anywhere', !/x-cg-demo-api-key['"]\s*\]?\s*=\s*['"][A-Za-z0-9-]{8,}/.test(cSrc + catSrc) &&
    (cSrc + catSrc).indexOf('CG-') < 0);
  ok('9.2 the demo key is read from the environment only',
    /process\.env\.COINGECKO_DEMO_API_KEY/.test(cSrc) && /process\.env\.COINGECKO_DEMO_API_KEY/.test(catSrc));
  ok('9.3 no paid provider dependency was added', !/coinmarketcap|pro-api|dexscreener/i.test(cSrc + catSrc));
  {
    // Producción demostró que un warm fire-and-forget no sobrevive al congelado de la instancia y que
    // su fallo bloqueaba (cooldown) a quien SÍ espera el catálogo. Contrato actual: la ruta textual no
    // lo espera NI lo dispara; sólo el modo contrato lo construye.
    const crySrc = fs.readFileSync(path.join(root, 'api/search/crypto.js'), 'utf8');
    ok('9.4 the textual path neither awaits nor kicks off the catalog', !/\bwarm\(\)/.test(crySrc) && /chainsFor/.test(crySrc));
    ok('9.5 only the contract resolver builds the catalog (bounded, awaited once)',
      /await ensure\(CATALOG_WAIT_MS\)/.test(fs.readFileSync(path.join(root, 'api/search/_contract-discovery.js'), 'utf8')));
  }
  {
    resetCatalog(); plan = {}; calls.length = 0;
    const rr = mkRes(); await crypto(req({ q: 'usdc' }), rr);
    ok('9.6 a textual search makes ZERO catalog requests', calls.filter(c => c.url.includes('/coins/list')).length === 0, 'calls=' + calls.length);
    ok('9.7 with a cold catalog no chain field is emitted', rr.body.results.every(r => r.chain === undefined && r.chainCount === undefined));
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
