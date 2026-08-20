// GET /api/search/crypto?q=<query>
// Server-side proxy for CoinGecko /api/v3/search. Browser never talks to
// CoinGecko directly. Returns normalized crypto candidates compatible
// with the existing frontend asset-search/add flow (selectAsset reads
// {ticker, name, type, coinId, marketSymbol}).
//
// Response shape:
//   { results: [{ ticker, name, type:'crypto', coinId, marketSymbol, image }, ...] }
//
// CoinGecko upstream notes:
//   - free tier: ~30 req/min per IP. Upstream 429 → we return 502 + [].
//   - the `coins` array carries { id, name, symbol, market_cap_rank, ... }.
//     We surface only the fields the frontend uses, so the raw response
//     never reaches the browser.

// AURIX-APP-DOMAIN-READY-1: allowlist (comma-separated) instead of a single
// origin, so the GitHub Pages app (rbn888.github.io) and the future
// app.aurixsystem.io app are both accepted during migration. ALLOWED_ORIGINS
// overrides the legacy ALLOWED_ORIGIN env var when present.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || 'https://rbn888.github.io,https://app.aurixsystem.io')
  .split(',').map(s => s.trim()).filter(Boolean);
// Reflect the request Origin only when it is allow-listed (never wildcard '*');
// localhost (any port) is accepted for local dev. Unknown origins fall back to
// the first configured origin so existing behaviour is preserved.
function corsOrigin(req) {
  const o = (req && req.headers && req.headers.origin) || '';
  if (o && (ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o))) return o;
  return ALLOWED_ORIGINS[0];
}
import { warm, chainsFor, catalogState } from './_cg-catalog.js';

const MAX_RESULTS    = 12;
const MIN_Q          = 2;
const MAX_Q          = 64;
// SPEC MKT-EXCELLENCE.ASSET-DISCOVERY-IDENTITY.V1 — canonical identity, flag-guarded.
// OFF ⇒ the previous response byte-for-byte (symbol dedupe, no identity fields).
const IDENTITY_V1 = process.env.AURIX_DISCOVERY_IDENTITY_V1 !== 'off';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'method_not_allowed' });

  const q = String(req.query?.q ?? '').trim();
  if (!q || q.length < MIN_Q || q.length > MAX_Q) {
    return res.status(400).json({ error: 'invalid_query', results: [] });
  }

  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
    const upstream = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Aurix)' },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream_${upstream.status}`, results: [] });
    }
    const json  = await upstream.json();
    const coins = Array.isArray(json?.coins) ? json.coins : [];

    // SPEC ASSET-DISCOVERY-IDENTITY.V1 — the catalog is warmed OUT OF BAND (never awaited here), so a
    // search request costs exactly ONE upstream call, as before.
    if (IDENTITY_V1) { try { warm(); } catch (_) {} }

    // CoinGecko ranks by relevance + market cap. Cap to MAX_RESULTS and
    // strip down to the four fields the frontend actually consumes.
    const seen    = new Set();
    const results = [];
    for (const c of coins) {
      if (!c || typeof c.id !== 'string' || typeof c.symbol !== 'string') continue;
      const ticker = String(c.symbol).toUpperCase().trim();
      if (!ticker) continue;
      // SPEC ASSET-DISCOVERY-IDENTITY.V1 — dedupe by the PROVIDER ID, never by symbol.
      // The old rule ("first hit per symbol wins") silently deleted every token that shares a ticker
      // with a bigger one: USD Coin vs Bridged USDC, and any long-tail token whose symbol collides with
      // a major. Two tokens with the same symbol are NOT the same asset; only the same provider id is.
      const key = IDENTITY_V1 ? c.id : ticker;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        ticker,
        name:         (typeof c.name === 'string' && c.name) ? c.name : ticker,
        type:         'crypto',
        coinId:       c.id,
        marketSymbol: ticker,
        // AURIX-ASSET-ICON-1: surface the provider's own logo (CoinGecko returns
        // `large`/`thumb` per coin) so assets like HYPE/Hyperliquid that are not
        // on the static icon CDNs still render their correct icon. The frontend
        // prefers this when present and falls back to the CDN chain otherwise.
        image:        (typeof c.large === 'string' && c.large) ? c.large
                    : (typeof c.thumb === 'string' && c.thumb) ? c.thumb
                    : null,
        // SEARCH-V2.1 — CoinGecko already returns market_cap_rank on this same response and
        // it was being discarded. It is the one REAL capitalisation/popularity signal any of
        // our providers gives on a search endpoint (1 = largest), so the unified ranker uses
        // it to put BTC/ETH above look-alike derivatives. No new provider, no extra request.
        marketCapRank: Number.isFinite(c.market_cap_rank) ? c.market_cap_rank : null,
      });
      if (results.length >= MAX_RESULTS) break;
    }
    if (!IDENTITY_V1) return res.status(200).json({ results });

    // ── canonical identity + chain evidence ────────────────────────────────────────────────────
    // canonicalKey is the identity the whole app dedupes on. It is NEVER derived from the symbol.
    // Chain/contract are attached ONLY from the cached catalog and ONLY when the coin lives on exactly
    // one chain (a multi-chain coin gets chainCount and no invented network). Cold catalog ⇒ the fields
    // are absent and `meta.catalogState` says so, so the client can tell "unknown" from "none".
    const counts = new Map();
    for (const r of results) counts.set(r.ticker, (counts.get(r.ticker) || 0) + 1);
    for (const r of results) {
      r.canonicalKey = 'coingecko:' + r.coinId;
      r.source = 'coingecko';
      // Same-symbol results in ONE result set: the UI must disambiguate these (progressive disclosure).
      r.symbolCollision = (counts.get(r.ticker) || 0) > 1;
      let chain = null;
      try { chain = chainsFor(r.coinId); } catch (_) { chain = null; }
      if (chain) {
        r.chainCount = chain.chainCount;
        if (chain.primaryChain) { r.chain = chain.primaryChain; r.contract = chain.contract; }
        if (chain.chains.length) r.chains = chain.chains.slice(0, 4).map(c => c.network);
      }
    }
    return res.status(200).json({ results, meta: { catalogState: catalogState().status, identityV1: true } });
  } catch (err) {
    console.error('[API][search-crypto] upstream failure:', err?.message);
    return res.status(502).json({ error: 'upstream_unreachable', results: [] });
  }
}
