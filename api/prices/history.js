// GET /api/prices/history?id=<coingecko-id>&days=<1|7|30|365>
// Proxies CoinGecko /coins/{id}/market_chart from the browser. Returns the
// raw `prices` array in CoinGecko's shape: [[ts_ms, usd_price], ...].
//
// This endpoint exists so the browser never talks to CoinGecko directly;
// it preserves the response shape `services/history.js` already consumes.

import { clientKey, createRateLimiter, createTtlCache } from '../_abuse-guard.js';

// AURIX-APP-DOMAIN-READY-1: allowlist (comma-separated) instead of a single
// origin. M.06 — el host histórico de GitHub Pages (rbn888.github.io) SALIÓ de la
// allowlist: el dominio canónico es app.aurixsystem.io y el antiguo redirige. El futuro
// app.aurixsystem.io app are both accepted during migration. ALLOWED_ORIGINS
// overrides the legacy ALLOWED_ORIGIN env var when present.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || 'https://app.aurixsystem.io')
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

// SECURITY V3 — esta ruta gasta la clave DEMO de CoinGecko (cupo mensual) y no tenía ni caché ni
// límite: un bucle sobre ids válidos la agotaba y los gráficos cripto caían para todos.
//   · caché por (id, days) con TTL según la ventana — la serie no cambia en minutos;
//   · colapso de peticiones simultáneas a la misma clave en UNA llamada al proveedor;
//   · caché negativa de 404 (id inexistente) y del 401 de `max` (exclusivo de Pro, determinista);
//   · cupo por cliente y presupuesto GLOBAL de llamadas al proveedor por instancia.
// Todo es memoria de una instancia: el límite global real es el Firewall de Vercel.
const TTL_BY_DAYS = { '1': 2 * 60_000, '7': 15 * 60_000, '30': 60 * 60_000, '90': 60 * 60_000,
                      '180': 3 * 60 * 60_000, '365': 6 * 60 * 60_000, 'max': 6 * 60 * 60_000 };
const HISTORY_CACHE   = createTtlCache({ max: 500, ttlMs: 60 * 60_000 });
const NEGATIVE_CACHE  = createTtlCache({ max: 1000, ttlMs: 10 * 60_000 });
const INFLIGHT        = new Map();
const perClient       = createRateLimiter({ limit: 60, windowMs: 60_000 });
const upstreamBudget  = createRateLimiter({ limit: 120, windowMs: 60_000 });

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

  const key = id + '|' + days;
  const cached = HISTORY_CACHE.get(key);
  if (cached) return res.status(200).json({ prices: cached });
  const negative = NEGATIVE_CACHE.get(key);
  if (negative) return res.status(502).json({ error: negative });
  if (!perClient.take(clientKey(req))) return res.status(429).json({ error: 'rate_limit' });

  try {
    let inflight = INFLIGHT.get(key);
    if (!inflight) {
      if (!upstreamBudget.take('global')) return res.status(429).json({ error: 'rate_limit' });
      inflight = fetchHistory(id, days).finally(() => INFLIGHT.delete(key));
      INFLIGHT.set(key, inflight);
    }
    const out = await inflight;
    if (out.prices) return res.status(200).json({ prices: out.prices });
    return res.status(out.status).json({ error: out.error });
  } catch (err) {
    console.error('[API][history] upstream failure:', err?.message);
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
}

async function fetchHistory(id, days) {
  const key = id + '|' + days;
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart` +
              `?vs_currency=usd&days=${days}`;
  // SPEC 4.1G — optional CoinGecko Demo API key. When COINGECKO_DEMO_API_KEY is
  // set in the backend env, send it (lifts the keyless rate limit that caused
  // the burst 429s). Absent → identical keyless behaviour as before. No key is
  // ever hardcoded; local/dev without the env var is unaffected.
  const _cgHeaders = { Accept: 'application/json' };
  if (process.env.COINGECKO_DEMO_API_KEY) _cgHeaders['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY;
  const upstream = await fetch(url, { signal: AbortSignal.timeout(10000), headers: _cgHeaders });
  if (upstream.status === 429) return { status: 429, error: 'rate_limit' };
  if (!upstream.ok) {
    const error = `upstream_${upstream.status}`;
    // Deterministas: id inexistente (404) y `max` fuera del tier (401). Un 5xx NO se memoriza.
    if (upstream.status === 404 || upstream.status === 401) NEGATIVE_CACHE.set(key, error);
    return { status: 502, error };
  }
  const data = await upstream.json();
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  HISTORY_CACHE.set(key, prices, TTL_BY_DAYS[days]);
  return { prices };
}
