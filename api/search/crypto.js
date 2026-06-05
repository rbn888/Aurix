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
const MAX_RESULTS    = 12;
const MIN_Q          = 2;
const MAX_Q          = 64;

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

    // CoinGecko ranks by relevance + market cap. Cap to MAX_RESULTS and
    // strip down to the four fields the frontend actually consumes.
    const seen    = new Set();
    const results = [];
    for (const c of coins) {
      if (!c || typeof c.id !== 'string' || typeof c.symbol !== 'string') continue;
      const ticker = String(c.symbol).toUpperCase().trim();
      if (!ticker) continue;
      // Dedupe by symbol — CoinGecko occasionally returns multiple chains
      // for the same brand (e.g. USDC on different networks). The first
      // hit is usually the canonical one (highest market cap).
      if (seen.has(ticker)) continue;
      seen.add(ticker);
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
      });
      if (results.length >= MAX_RESULTS) break;
    }
    return res.status(200).json({ results });
  } catch (err) {
    console.error('[API][search-crypto] upstream failure:', err?.message);
    return res.status(502).json({ error: 'upstream_unreachable', results: [] });
  }
}
