// SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1 — CONTRACT DISCOVERY (resolver, not a route)
// Served by GET /api/search/crypto?address=<contract>&network=<optional cg platform id>.
// It is NOT its own Serverless Function on purpose: this deployment sits at the plan's 12-function
// ceiling, so contract discovery is a MODE of the existing crypto-search route and this module stays
// underscore-prefixed (bundled through the import graph, never routed).
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Resolves a raw contract address to a CANONICAL asset identity:
//     contract → network/token → canonical identity → metadata/logo → price when it exists
// Multi-chain by construction: the address SHAPE selects a chain family (EVM / Solana / Tron today,
// table-extensible) and the family selects candidate networks. Nothing here is ERC-20 specific.
//
// RESOLUTION ORDER (cheapest and most authoritative first):
//   1. cached CoinGecko identity catalog → EXACT contract→{coinId, network}. Zero upstream calls.
//   2. CoinGecko /coins/{platform}/contract/{address} → authoritative metadata + price.
//   3. GeckoTerminal /networks/{net}/tokens/{address} → on-chain long tail (keyless), display-only price.
// Probes are BOUNDED (never a fan-out per keystroke: this endpoint only fires when the input IS an
// address) and results are cached in-instance.
//
// DATA HONESTY: "not found" and "provider unavailable" are DIFFERENT answers and are returned as such.
// Price/logo/network/contract are echoed only when a provider actually returned them. A token that
// only exists on-chain is returned with priceable:false rather than being dressed up as a CG coin.
import {
  detectAddressFamily, networksForFamily, networkByCg, networkLabel,
  ensure, lookupContract, catalogState,
} from './_cg-catalog.js';

const CATALOG_WAIT_MS = 3000;      // one cold wait; afterwards the catalog is in-instance
const MAX_CG_PROBES   = 3;         // bounded: hint first, then the family's largest networks
const MAX_GT_PROBES   = 3;
const FETCH_TIMEOUT   = 7000;
const CACHE_TTL_MS    = 60 * 60 * 1000;
const CACHE_MAX       = 500;
const cache = new Map();           // 'family:address:hint' → { at, payload }

function cacheGet(k) {
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(k); return null; }
  return hit.payload;
}
function cachePut(k, payload) {
  cache.set(k, { at: Date.now(), payload });
  if (cache.size > CACHE_MAX) { try { cache.delete(cache.keys().next().value); } catch (_) {} }
}

function cgHeaders() {
  const h = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Aurix)' };
  if (process.env.COINGECKO_DEMO_API_KEY) h['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY;
  return h;
}

// CoinGecko contract endpoint. Returns { hit } | { missing:true } | { degraded:true }.
async function cgContract(cgPlatform, address) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(cgPlatform)}/contract/${encodeURIComponent(address)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: cgHeaders() });
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { degraded: true, status: res.status };
    const j = await res.json();
    if (!j || typeof j.id !== 'string') return { missing: true };
    const img = (j.image && (j.image.large || j.image.small || j.image.thumb)) || null;
    const price = (j.market_data && j.market_data.current_price && Number(j.market_data.current_price.usd));
    // The contract the user asked for is the identity; the platform echo confirms the chain.
    const addrOnChain = (j.detail_platforms && j.detail_platforms[cgPlatform] && j.detail_platforms[cgPlatform].contract_address)
      || (j.platforms && j.platforms[cgPlatform]) || address;
    return { hit: {
      coinId: j.id,
      symbol: typeof j.symbol === 'string' ? j.symbol.toUpperCase() : null,
      name: typeof j.name === 'string' ? j.name : null,
      image: typeof img === 'string' && /^https?:\/\//.test(img) ? img : null,
      price: Number.isFinite(price) && price > 0 ? price : null,
      marketCapRank: Number.isFinite(j.market_cap_rank) ? j.market_cap_rank : null,
      networkId: cgPlatform,
      network: networkLabel(cgPlatform),
      contract: addrOnChain,
      source: 'coingecko',
      priceable: true,
    } };
  } catch (err) {
    return { degraded: true, error: String(err && err.message || err) };
  }
}

// GeckoTerminal (on-chain, keyless) — the long tail CoinGecko has not listed.
async function gtToken(gtNetwork, address) {
  const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(gtNetwork)}/tokens/${encodeURIComponent(address)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { Accept: 'application/json;version=20230302', 'User-Agent': 'Mozilla/5.0 (Aurix)' } });
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { degraded: true, status: res.status };
    const j = await res.json();
    const a = j && j.data && j.data.attributes;
    if (!a || typeof a.address !== 'string') return { missing: true };
    const price = Number(a.price_usd);
    const net = (typeof gtNetwork === 'string') ? gtNetwork : null;
    const known = networksForFamily('evm').concat(networksForFamily('solana'), networksForFamily('tron')).find(n => n.gt === net);
    return { hit: {
      coinId: (a.coingecko_coin_id && typeof a.coingecko_coin_id === 'string') ? a.coingecko_coin_id : null,
      symbol: typeof a.symbol === 'string' ? a.symbol.toUpperCase() : null,
      name: typeof a.name === 'string' ? a.name : null,
      image: typeof a.image_url === 'string' && /^https?:\/\//.test(a.image_url) ? a.image_url : null,
      price: Number.isFinite(price) && price > 0 ? price : null,
      marketCapRank: null,
      networkId: known ? known.cg : net,
      network: known ? known.label : networkLabel(net),
      contract: a.address,
      source: 'geckoterminal',
      // On-chain-only token: the Aurix Price Engine has no feed for it (no CoinGecko id) ⇒ say so
      // instead of implying it can be priced like a listed coin.
      priceable: !!(a.coingecko_coin_id),
    } };
  } catch (err) {
    return { degraded: true, error: String(err && err.message || err) };
  }
}

function toResult(hit, address) {
  const contract = hit.contract || address;
  return {
    // search-item shape the existing frontend pipeline already consumes …
    ticker: hit.symbol || (contract ? contract.slice(0, 6).toUpperCase() : null),
    name: hit.name || hit.symbol || null,
    type: 'crypto',
    coinId: hit.coinId || null,
    marketSymbol: hit.coinId ? (hit.symbol || null) : null,
    image: hit.image || null,
    price: hit.price,
    marketCapRank: hit.marketCapRank,
    // … plus the canonical identity. Symbol is NEVER the identity.
    canonicalKey: hit.coinId ? ('coingecko:' + hit.coinId) : ('chain:' + (hit.networkId || 'unknown') + ':' + String(contract).toLowerCase()),
    chain: hit.network || null,
    networkId: hit.networkId || null,
    contract,
    source: hit.source,
    priceable: !!hit.priceable,
    matchedBy: 'contract',
  };
}

// Pure resolver: returns { status, payload }. The route owns CORS/method handling.
export async function resolveContract(rawAddress, rawHint) {
  const address = String(rawAddress ?? '').trim();
  const hint = String(rawHint ?? '').trim().toLowerCase();
  const family = detectAddressFamily(address);
  if (!family) {
    return { status: 400, payload: { found: false, reason: 'unsupported_address_shape', result: null,
      meta: { family: null, note: 'no supported chain family matches this address shape' } } };
  }

  const ck = family + ':' + address.toLowerCase() + ':' + hint;
  const cached = cacheGet(ck);
  if (cached) return { status: 200, payload: Object.assign({}, cached, { meta: Object.assign({}, cached.meta, { cached: true }) }) };

  const probes = [];
  let degraded = false;

  // 1 — cached identity catalog: exact reverse lookup, zero upstream calls, every chain CoinGecko knows.
  let catalogReady = false;
  try { catalogReady = await ensure(CATALOG_WAIT_MS); } catch (_) { catalogReady = false; }
  const fromCatalog = catalogReady ? lookupContract(address) : null;
  probes.push('catalog:' + (catalogReady ? (fromCatalog ? 'hit' : 'miss') : 'cold'));

  // Candidate networks: the catalog's answer wins; otherwise the hint, then the family's networks.
  const famNets = networksForFamily(family);
  const hinted = hint ? (networkByCg(hint) || famNets.find(n => n.gt === hint) || null) : null;
  let cgCandidates;
  if (fromCatalog) cgCandidates = [networkByCg(fromCatalog.cg) || { cg: fromCatalog.cg, gt: null, label: networkLabel(fromCatalog.cg) }];
  else cgCandidates = (hinted ? [hinted].concat(famNets.filter(n => n.cg !== hinted.cg)) : famNets).slice(0, MAX_CG_PROBES);

  // 2 — CoinGecko contract endpoint (authoritative metadata + price).
  for (const net of cgCandidates) {
    const r = await cgContract(net.cg, address);
    probes.push('cg:' + net.cg + ':' + (r.hit ? 'hit' : r.missing ? 'miss' : 'degraded'));
    if (r.degraded) { degraded = true; continue; }
    if (r.hit) {
      const payload = { found: true, result: toResult(r.hit, address), reason: null,
        meta: { family, probes, catalogState: catalogState().status, resolvedBy: fromCatalog ? 'catalog+coingecko' : 'coingecko' } };
      cachePut(ck, payload);
      return { status: 200, payload };
    }
  }

  // If the catalog KNEW this contract but CoinGecko's contract endpoint could not be reached, the asset
  // still exists and its identity is known — return it without inventing price/logo.
  if (fromCatalog && degraded) {
    const payload = { found: true, reason: 'metadata_unavailable',
      result: toResult({ coinId: fromCatalog.coinId, symbol: fromCatalog.symbol, name: fromCatalog.name, image: null,
        price: null, marketCapRank: null, networkId: fromCatalog.cg, network: fromCatalog.network, contract: address,
        source: 'coingecko-catalog', priceable: true }, address),
      meta: { family, probes, catalogState: catalogState().status, resolvedBy: 'catalog' } };
    cachePut(ck, payload);
    return { status: 200, payload };
  }

  // 3 — on-chain long tail.
  const gtCandidates = (hinted ? [hinted].concat(famNets.filter(n => n.cg !== hinted.cg)) : famNets).filter(n => n.gt).slice(0, MAX_GT_PROBES);
  for (const net of gtCandidates) {
    const r = await gtToken(net.gt, address);
    probes.push('gt:' + net.gt + ':' + (r.hit ? 'hit' : r.missing ? 'miss' : 'degraded'));
    if (r.degraded) { degraded = true; continue; }
    if (r.hit) {
      const payload = { found: true, result: toResult(r.hit, address), reason: null,
        meta: { family, probes, catalogState: catalogState().status, resolvedBy: 'geckoterminal' } };
      cachePut(ck, payload);
      return { status: 200, payload };
    }
  }

  // Nothing found. A degraded provider is NOT an absent asset — the two answers stay distinguishable.
  const payload = { found: false, result: null,
    reason: degraded ? 'provider_unavailable' : 'contract_not_found',
    meta: { family, probes, catalogState: catalogState().status } };
  if (!degraded) cachePut(ck, payload);          // never cache a provider outage as "does not exist"
  return { status: 200, payload };
}
