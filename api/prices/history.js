// GET /api/prices/history?id=<coingecko-id>&days=<1|7|30|365>
// Proxies CoinGecko /coins/{id}/market_chart from the browser. Returns the
// raw `prices` array in CoinGecko's shape: [[ts_ms, usd_price], ...].
//
// This endpoint exists so the browser never talks to CoinGecko directly;
// it preserves the response shape `services/history.js` already consumes.

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
// ASSET-CHARTS-1: 'max' lets the crypto chart's TOTAL range return the
// full available history from genesis — CoinGecko accepts the literal
// string "max" alongside the fixed-day values for /coins/{id}/market_chart.
const ALLOWED_DAYS   = new Set(['1', '7', '30', '90', '180', '365', 'max']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'method_not_allowed' });

  const id   = String(req.query?.id   ?? '').trim().toLowerCase();
  const days = String(req.query?.days ?? '').trim();

  if (!id || !/^[a-z0-9-]{1,64}$/.test(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  if (!ALLOWED_DAYS.has(days)) {
    return res.status(400).json({ error: 'invalid_days' });
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
                `?vs_currency=usd&days=${days}`;
    // SPEC 4.1G — optional CoinGecko Demo API key. When COINGECKO_DEMO_API_KEY is
    // set in the backend env, send it (lifts the keyless rate limit that caused
    // the burst 429s). Absent → identical keyless behaviour as before. No key is
    // ever hardcoded; local/dev without the env var is unaffected.
    const _cgHeaders = { Accept: 'application/json' };
    if (process.env.COINGECKO_DEMO_API_KEY) _cgHeaders['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000), headers: _cgHeaders });
    if (upstream.status === 429) {
      return res.status(429).json({ error: 'rate_limit' });
    }
    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream_${upstream.status}` });
    }
    const data = await upstream.json();
    return res.status(200).json({ prices: Array.isArray(data?.prices) ? data.prices : [] });
  } catch (err) {
    console.error('[API][history] upstream failure:', err?.message);
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
}
