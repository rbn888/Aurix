// POST /api/prices
// Body:     { providers: ["coingecko:bitcoin", "twelvedata:AAPL", ...] }
// Response: { prices: { [provider_id]: { price: number, change24h: number|null } } }

import { clientKey, createRateLimiter, createTtlCache } from './_abuse-guard.js';

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
const IS_DEV         = process.env.VERCEL_ENV !== 'production';

function log(...args) {
  if (IS_DEV) console.log('[API]', ...args);
}

function logError(provider, message) {
  console.error(`[API][ERROR][${provider}] ${new Date().toISOString()} ${message}`);
}

// ── Observability ───────────────────────────────────────────
// Lightweight in-memory counters. Per-Vercel-instance (cold start resets).
// Shared with api/prices/snapshot.js and api/debug/health.js via named export.
const OBSERVABILITY = {
  startedAt: Date.now(),
  pricing: {
    providerRequests:  { coingecko: 0, twelvedata: 0, yahoo: 0 },
    providerFailures:  { coingecko: 0, twelvedata: 0, yahoo: 0 },
    providerLatencyMs: {
      coingecko:  { sum: 0, count: 0 },
      twelvedata: { sum: 0, count: 0 },
      yahoo:      { sum: 0, count: 0 },
    },
    cacheHits:        0,
    cacheMisses:      0,
    partialResponses: 0,
    rateLimitHits:    0,
  },
  snapshot: {
    requestCount:     0,
    symbolsRequested: 0,
    resolvedTotal:    0,
    partialResponses: 0,
    latencyMs: { sum: 0, count: 0 },
  },
};

// ── Cache policy ────────────────────────────────────────────
// Single backend cache, keyed by provider_id (e.g. coingecko:bitcoin,
// twelvedata:AAPL). Owner: this module. Shared with api/prices/snapshot.js
// via named export. Each entry stores { value, timestamp, ttl }; reads
// past `ttl` return null (no stale-serve). TTLs are per-asset-class —
// the snapshot picks the right bucket via the symbol registry.
const PRICE_CACHE = new Map();

const TTL = {
  crypto:    30  * 1000,   // 24/7 markets, fast-moving
  stock:     60  * 1000,   // intraday tick
  etf:       60  * 1000,   // intraday tick
  index:     60  * 1000,   // intraday tick
  commodity: 300 * 1000,   // slower-moving (XAU/USD, WTI)
  fund:      6 * 60 * 60 * 1000, // mutual funds: daily NAV, refresh every 6h
  fx:        300 * 1000,   // not used today, reserved
};

function getCached(providerId) {
  const entry = PRICE_CACHE.get(providerId);
  if (!entry) { OBSERVABILITY.pricing.cacheMisses++; return null; }
  if (Date.now() - entry.timestamp > entry.ttl) {
    OBSERVABILITY.pricing.cacheMisses++;
    return null;
  }
  OBSERVABILITY.pricing.cacheHits++;
  return entry.value;
}

// SECURITY V3 — la caché es compartida con snapshot.js y estaba SIN tope: claves arbitrarias
// (`yahoo: AAPL`, `yahoo:AAPL `…) la hacían crecer sin límite. Se acota expulsando la más antigua;
// la forma de cada entrada ({ value, timestamp, ttl }) no cambia porque snapshot.js la lee directa.
const MAX_PRICE_CACHE = 5000;
function setCache(providerId, value, ttl) {
  if (PRICE_CACHE.has(providerId)) PRICE_CACHE.delete(providerId);
  PRICE_CACHE.set(providerId, { value, timestamp: Date.now(), ttl });
  while (PRICE_CACHE.size > MAX_PRICE_CACHE) PRICE_CACHE.delete(PRICE_CACHE.keys().next().value);
}

// ── Rate limit ─────────────────────────────────────────────
// Mismo cupo que antes (10 peticiones / 10 s por cliente), ahora con mapa acotado.
const RATE_LIMIT   = 10;
const RATE_WINDOW  = 10_000; // 10 s
const rateLimiter  = createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW });

// ── Límites de entrada (SECURITY V3) ─────────────────────────
// El cliente real sólo envía `coingecko:<id>` (fetchLivePrices, ids únicos de la cartera) y
// `coingecko:bitcoin` (services/market.js); acciones/ETF/metales van por /api/prices/snapshot.
// Los topes dejan muchísimo margen a ese uso y cortan la amplificación: antes N entradas `yahoo:`
// eran N peticiones paralelas a Yahoo y N símbolos de TwelveData eran N créditos de la clave.
const MAX_PROVIDERS_RAW   = 1000;  // por encima: petición abusiva → 413
const MAX_PROVIDERS       = 200;   // tras deduplicar (mismo techo que snapshot.js)
const MAX_TWELVEDATA      = 25;    // créditos por petición
const MAX_YAHOO           = 25;    // fan-out por petición
const COINGECKO_ID_RE     = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const MARKET_SYMBOL_RE    = /^[A-Za-z0-9.^=\/:-]{1,32}$/;   // AAPL, BRK-B, ^GSPC, GC=F, XAU/USD, 7203.T

// Caché negativa: un id que CoinGecko no conoce (respuesta 200 sin él) no se vuelve a pedir en 60 s.
// Sólo ante una respuesta CORRECTA del proveedor; un fallo de red nunca se memoriza como "no existe".
const NEGATIVE_CACHE = createTtlCache({ max: 2000, ttlMs: 60_000 });

// ── Parsing ────────────────────────────────────────────────

function parseProviders(providers) {
  const coingecko  = [];
  const twelvedata = [];
  const yahoo      = [];

  const seen = new Set();
  for (const p of providers) {
    if (typeof p !== 'string' || p.length > 128) continue;
    if (seen.has(p)) continue;
    const sep = p.indexOf(':');
    if (sep < 1) continue;
    const ns = p.slice(0, sep);
    const id = p.slice(sep + 1).trim();
    if (!id) continue;
    // Forma estricta por proveedor: lo que no encaja no se pide (antes viajaba tal cual).
    if (ns === 'coingecko') {
      if (!COINGECKO_ID_RE.test(id)) continue;
    } else if (ns === 'twelvedata') {
      if (!MARKET_SYMBOL_RE.test(id) || twelvedata.length >= MAX_TWELVEDATA) continue;
    } else if (ns === 'yahoo') {
      if (!MARKET_SYMBOL_RE.test(id) || yahoo.length >= MAX_YAHOO) continue;
    } else continue;
    if (seen.size >= MAX_PROVIDERS) break;
    seen.add(p);
    if (ns === 'coingecko')       coingecko.push({ provider: p, id });
    else if (ns === 'twelvedata') twelvedata.push({ provider: p, symbol: id });
    else                          yahoo.push({ provider: p, symbol: id });
  }

  return { coingecko, twelvedata, yahoo };
}

// ── Fetchers ───────────────────────────────────────────────

async function fetchCoinGecko(items) {
  const ids = items.map(i => encodeURIComponent(i.id)).join(',');
  log('coingecko ids:', ids);
  const t0 = Date.now();
  OBSERVABILITY.pricing.providerRequests.coingecko++;

  const url = `https://api.coingecko.com/api/v3/simple/price` +
              `?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  } catch (err) {
    OBSERVABILITY.pricing.providerFailures.coingecko++;
    throw err;
  }

  const data   = await res.json();
  const result = {};

  for (const { provider, id } of items) {
    const entry = data[id];
    if (entry) {
      result[provider] = {
        price:     entry.usd             ?? null,
        change24h: entry.usd_24h_change  ?? null,
      };
    }
  }

  OBSERVABILITY.pricing.providerLatencyMs.coingecko.sum += Date.now() - t0;
  OBSERVABILITY.pricing.providerLatencyMs.coingecko.count++;
  return result;
}

async function fetchTwelveData(items, apiKey) {
  // SECURITY V3 — cada símbolo se codifica: antes se concatenaban crudos y un símbolo con `&`
  // inyectaba parámetros en la URL que lleva la clave.
  const symbols = items.map(i => encodeURIComponent(i.symbol)).join(',');
  log('twelvedata symbols:', symbols);
  const t0 = Date.now();
  OBSERVABILITY.pricing.providerRequests.twelvedata++;

  const url = `https://api.twelvedata.com/price?symbol=${symbols}&apikey=${encodeURIComponent(apiKey)}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);
  } catch (err) {
    OBSERVABILITY.pricing.providerFailures.twelvedata++;
    throw err;
  }

  const data   = await res.json();

  // ── TwelveData application-level error detection ────────────
  // TwelveData often returns HTTP 200 with an error body shape:
  //   { code: 401|429|400|..., status: "error", message: "..." }
  // Without this guard, parseFloat(undefined) silently returns NaN and
  // the empty result {} masks the real failure (quota exhausted, key
  // revoked, plan limitation). Re-route through the existing handler
  // .catch so logError surfaces the cause and providerFailures counter
  // reflects reality.
  if (data && data.status === 'error') {
    OBSERVABILITY.pricing.providerFailures.twelvedata++;
    throw new Error(
      `TwelveData app-error code=${data.code ?? '?'} ${data.message ?? ''}`.trim()
    );
  }

  const result = {};

  if (items.length === 1) {
    // Single symbol → { price: "210.13" }
    const price = parseFloat(data.price);
    if (!isNaN(price)) result[items[0].provider] = { price, change24h: null };
  } else {
    // Batch → { AAPL: { price: "210.13" }, VOO: { price: "498.00" }, ... }
    for (const { provider, symbol } of items) {
      const entry = data[symbol];
      if (entry?.price) {
        const price = parseFloat(entry.price);
        if (!isNaN(price)) result[provider] = { price, change24h: null };
      }
    }
  }

  OBSERVABILITY.pricing.providerLatencyMs.twelvedata.sum += Date.now() - t0;
  OBSERVABILITY.pricing.providerLatencyMs.twelvedata.count++;
  return result;
}

async function fetchYahoo(items) {
  // Yahoo Finance /v8/finance/chart is single-symbol. Fan out in parallel —
  // free, no API key, covers stocks/ETFs/indices (^GSPC) and commodity
  // futures (GC=F, SI=F, CL=F). One fetchYahoo call counts as one
  // providerRequest for parity with batch fetchers above.
  const symbols = items.map(i => i.symbol).join(',');
  log('yahoo symbols:', symbols);
  const t0 = Date.now();
  OBSERVABILITY.pricing.providerRequests.yahoo++;

  try {
    const settled = await Promise.allSettled(
      items.map(async ({ provider, symbol }) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/` +
                    `${encodeURIComponent(symbol)}?range=1d&interval=1d`;
        const res = await fetch(url, {
          signal:  AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Aurix)', Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
        const data = await res.json();

        // ── Yahoo application-level error detection ─────────────
        // Chart endpoint returns HTTP 200 with `{ chart: { error: {...} } }`
        // on invalid symbols / rate limits. Mirrors the TwelveData guard
        // above so the empty-result path doesn't mask real failures.
        if (data?.chart?.error) {
          throw new Error(
            `Yahoo app-error ${data.chart.error.code || '?'} ${data.chart.error.description || ''}`.trim()
          );
        }

        const meta  = data?.chart?.result?.[0]?.meta;
        let   price = meta?.regularMarketPrice;
        if (!Number.isFinite(price)) throw new Error(`Yahoo no price for ${symbol}`);

        const prev = Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose
                   : Number.isFinite(meta.previousClose)      ? meta.previousClose
                   : null;
        const change24h = (prev && prev > 0) ? ((price - prev) / prev) * 100 : null;

        // MC-6D / AURIX-DATA-001 · F1 — surface Yahoo meta.currency upstream so
        // the snapshot handler can stamp the real quote currency on each
        // PriceObject. London "pence" quotes (GBp / GBX) arrive in PENCE, not
        // pounds: the old code rejected the currency (→ null → 'USD' downstream)
        // while KEEPING the pence price, valuing a £95 holding as $9,500 (the
        // 100× contamination root cause). Normalise pence→pounds (exact ÷100)
        // AND stamp the real ISO currency 'GBP', so the value is correct and
        // downstream FX is honest. change24h is a percentage (scale-invariant),
        // computed above and untouched. Real pounds quotes ("GBP", uppercase)
        // are NOT pence and pass through unchanged.
        let rawCurr = (meta && typeof meta.currency === 'string') ? meta.currency.trim() : '';
        const _isPence = (rawCurr === 'GBp') || (rawCurr.toUpperCase() === 'GBX');
        if (_isPence) { price = price / 100; rawCurr = 'GBP'; }
        const currency = /^[A-Z]{3}$/.test(rawCurr) ? rawCurr : null;

        return { provider, price, change24h, currency };
      })
    );

    const result = {};
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        result[s.value.provider] = {
          price:     s.value.price,
          change24h: s.value.change24h,
          currency:  s.value.currency || null,   // MC-6D
        };
      } else {
        logError('yahoo', s.reason?.message || 'unknown');
      }
    }

    OBSERVABILITY.pricing.providerLatencyMs.yahoo.sum += Date.now() - t0;
    OBSERVABILITY.pricing.providerLatencyMs.yahoo.count++;

    // Parity with batch fetchers: if every symbol failed, surface as a
    // provider failure so the handler's .catch logs it and the per-batch
    // failure counter increments. Partial success returns normally.
    if (Object.keys(result).length === 0 && items.length > 0) {
      const firstErr = settled.find(s => s.status === 'rejected');
      throw new Error(`Yahoo all-failed: ${firstErr?.reason?.message || 'unknown'}`);
    }

    return result;
  } catch (err) {
    OBSERVABILITY.pricing.providerFailures.yahoo++;
    throw err;
  }
}

// ── Handler ────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'method_not_allowed' });

  // ── Rate limit ─────────────────────────────────────────
  if (!rateLimiter.take(clientKey(req))) {
    OBSERVABILITY.pricing.rateLimitHits++;
    return res.status(429).json({ error: 'rate_limit' });
  }

  const { providers } = req.body ?? {};
  if (!Array.isArray(providers) || providers.length === 0) {
    return res.status(400).json({ error: 'providers_required' });
  }
  if (providers.length > MAX_PROVIDERS_RAW) {
    return res.status(413).json({ error: 'too_many_providers' });
  }

  log('request start · providers:', providers.length);

  const { coingecko, twelvedata, yahoo } = parseProviders(providers);
  const prices     = {};
  const TWELVE_KEY = process.env.TWELVE_API_KEY;
  const tasks      = [];

  // ── Serve cached, collect uncached ────────────────────
  const uncachedCG  = [];
  const uncachedTD  = [];
  const uncachedYH  = [];

  for (const item of coingecko) {
    const hit = getCached(item.provider);
    if (hit) prices[item.provider] = hit;
    else if (!NEGATIVE_CACHE.get(item.provider)) uncachedCG.push(item);
  }

  for (const item of twelvedata) {
    const hit = getCached(item.provider);
    if (hit) prices[item.provider] = hit;
    else uncachedTD.push(item);
  }

  for (const item of yahoo) {
    const hit = getCached(item.provider);
    if (hit) prices[item.provider] = hit;
    else uncachedYH.push(item);
  }

  // ── Fetch only what's missing ──────────────────────────
  if (uncachedCG.length > 0) {
    tasks.push(
      fetchCoinGecko(uncachedCG)
        .then(r => {
          for (const [id, val] of Object.entries(r)) {
            setCache(id, val, TTL.crypto);
            prices[id] = val;
          }
          for (const { provider } of uncachedCG) if (!r[provider]) NEGATIVE_CACHE.set(provider, true);
        })
        .catch(err => logError('coingecko', err.message))
    );
  }

  if (uncachedTD.length > 0) {
    if (!TWELVE_KEY) {
      logError('twelvedata', 'TWELVE_API_KEY not configured in env');
    } else {
      tasks.push(
        fetchTwelveData(uncachedTD, TWELVE_KEY)
          .then(r => {
            for (const [id, val] of Object.entries(r)) {
              setCache(id, val, TTL.stock);
              prices[id] = val;
            }
          })
          .catch(err => logError('twelvedata', err.message))
      );
    }
  }

  if (uncachedYH.length > 0) {
    // PR-2A: per-symbol assetType is not known at this handler level —
    // snapshot.js owns the registry. TTL.stock matches the existing
    // TwelveData policy; PR-2B will route via the snapshot registry
    // with per-assetType TTL buckets.
    tasks.push(
      fetchYahoo(uncachedYH)
        .then(r => {
          for (const [id, val] of Object.entries(r)) {
            setCache(id, val, TTL.stock);
            prices[id] = val;
          }
        })
        .catch(err => logError('yahoo', err.message))
    );
  }

  await Promise.all(tasks);

  if (Object.keys(prices).length < providers.length) {
    OBSERVABILITY.pricing.partialResponses++;
  }

  log('success · prices returned:', Object.keys(prices).length);
  return res.status(200).json({ prices });
}

// ── Named exports for reuse by other backend endpoints ─────
// (e.g., api/prices/snapshot.js — does not affect default handler)
export { PRICE_CACHE, TTL, getCached, setCache, fetchCoinGecko, fetchTwelveData, fetchYahoo, OBSERVABILITY };
