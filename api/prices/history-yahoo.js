// GET /api/prices/history-yahoo?symbol=<sym>&range=<range>&interval=<interval?>
//
// CHART-3 infrastructure. Server-side proxy for Yahoo Finance historical
// chart data. Normalizes OHLC time-series into the Aurix canonical shape
// so the frontend never talks to Yahoo directly and provider swaps stay
// local to this file.
//
// Supported normalized ranges: 24h | 7d | 30d | 3m | 1y | all
// Optional `interval` override accepted only from a whitelisted set.
//
// Response (success):
//   {
//     ok: true,
//     symbol: "AAPL",
//     source: "yahoo",
//     currency: "USD",
//     granularity: "1d",
//     points: [
//       { time: epochMs, open, high, low, close, volume }, ...
//     ]
//   }
//
// Response (error):
//   { ok: false, error: "message" }
//
// No production chart consumes this yet — frontend adapter layer in
// services/chart-adapters.js owns calls. Cache is in-memory per
// serverless instance (best-effort) to mute provider rate pressure.

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
const IS_DEV         = process.env.VERCEL_ENV !== 'production';

// ── Range → Yahoo (range, interval) mapping ───────────────────────
// Centralized so the adapter layer doesn't reinvent it. Intervals are
// the smallest realistic granularity that fits the window without
// exceeding Yahoo's per-range point cap.
const RANGE_MAP = Object.freeze({
  '24h': { range: '1d',  interval: '5m'  },
  '7d':  { range: '5d',  interval: '15m' },
  '30d': { range: '1mo', interval: '1d'  },
  '3m':  { range: '3mo', interval: '1d'  },
  '1y':  { range: '1y',  interval: '1d'  },
  'all': { range: 'max', interval: '1wk' },
});

// Server-side cache TTL per range. Lower-latency on 24h since it's the
// most-watched window; longer for historical depth where data is stable.
const TTL_MS = Object.freeze({
  '24h':   60 * 1000,
  '7d':   5 * 60 * 1000,
  '30d': 30 * 60 * 1000,
  '3m':  60 * 60 * 1000,
  '1y':   6 * 60 * 60 * 1000,
  'all': 24 * 60 * 60 * 1000,
});

// In-memory cache. Survives across requests on the same serverless
// container; cold starts re-fetch. Stampede guard: in-flight promises
// stored by key so concurrent requests hit the upstream once.
const HISTORY_CACHE   = new Map(); // key → { value, expiresAt }
const HISTORY_INFLIGHT = new Map(); // key → Promise<value>

const VALID_INTERVAL = new Set(['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo']);
const SYMBOL_RE      = /^[A-Z0-9._^=/\-]{1,16}$/i;

function _log(...args) { if (IS_DEV) console.log('[history-yahoo]', ...args); }
function _warn(...args) { console.warn('[history-yahoo]', ...args); }

function _cacheKey(symbol, range, interval) {
  return `yahoo|${symbol.toUpperCase()}|${range}|${interval}`;
}

function _now() { return Date.now(); }

function _readCache(key) {
  const hit = HISTORY_CACHE.get(key);
  if (!hit) return null;
  if (hit.expiresAt < _now()) {
    HISTORY_CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function _writeCache(key, value, ttlMs) {
  HISTORY_CACHE.set(key, { value, expiresAt: _now() + ttlMs });
}

// ── Normalization ─────────────────────────────────────────────────
function _normalizeYahooChart(symbol, range, interval, raw) {
  // Application-level error guard. Yahoo returns HTTP 200 with
  // chart.error on invalid symbols / rate limits.
  if (raw?.chart?.error) {
    throw new Error(`yahoo_app_error_${raw.chart.error.code || 'unknown'}`);
  }
  const result   = raw?.chart?.result?.[0];
  if (!result) throw new Error('yahoo_no_result');

  const meta     = result.meta || {};
  const tsArr    = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote    = result.indicators?.quote?.[0] || {};
  const open     = Array.isArray(quote.open)   ? quote.open   : [];
  const high     = Array.isArray(quote.high)   ? quote.high   : [];
  const low      = Array.isArray(quote.low)    ? quote.low    : [];
  const close    = Array.isArray(quote.close)  ? quote.close  : [];
  const volume   = Array.isArray(quote.volume) ? quote.volume : [];

  // AURIX-DATA-001 · F1 — London "pence" quotes (GBp / GBX) arrive in PENCE.
  // Normalise OHLC pence→pounds (exact ÷100) and stamp the real ISO currency
  // 'GBP' so the historical series shares the same honest scale as the realtime
  // proxy, instead of rejecting the currency while keeping pence prices (the
  // 100× contamination). Volume is a share count → never scaled. Real pounds
  // quotes ("GBP", uppercase) are NOT pence and pass through unchanged.
  let rawCurr  = (typeof meta.currency === 'string') ? meta.currency.trim() : '';
  const _isPence = (rawCurr === 'GBp') || (rawCurr.toUpperCase() === 'GBX');
  if (_isPence) rawCurr = 'GBP';
  const currency = /^[A-Z]{3}$/.test(rawCurr) ? rawCurr : null;
  const _scale = _isPence ? 0.01 : 1;

  const points = [];
  for (let i = 0; i < tsArr.length; i++) {
    const ts = tsArr[i];
    const c  = close[i];
    if (typeof ts !== 'number' || !Number.isFinite(c)) continue;
    points.push({
      time:   ts * 1000,
      open:   Number.isFinite(open[i])   ? open[i]   * _scale : null,
      high:   Number.isFinite(high[i])   ? high[i]   * _scale : null,
      low:    Number.isFinite(low[i])    ? low[i]    * _scale : null,
      close:  c * _scale,
      volume: Number.isFinite(volume[i]) ? volume[i] : null,
    });
  }

  return {
    ok:          true,
    symbol:      symbol.toUpperCase(),
    source:      'yahoo',
    currency:    currency,
    granularity: interval,
    points,
  };
}

async function _fetchYahoo(symbol, range, interval, signal) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/` +
              `${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}` +
              `&interval=${encodeURIComponent(interval)}`;
  _log('fetch', symbol, range, interval);
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (Aurix)', Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`yahoo_http_${res.status}`);
  }
  const raw = await res.json();
  return _normalizeYahooChart(symbol, range, interval, raw);
}

async function _getOrFetch(symbol, range, interval, signal) {
  const key = _cacheKey(symbol, range, interval);
  const cached = _readCache(key);
  if (cached) return cached;

  // Stampede guard — collapse concurrent requests onto one upstream call.
  let inflight = HISTORY_INFLIGHT.get(key);
  if (!inflight) {
    inflight = _fetchYahoo(symbol, range, interval, signal)
      .then(value => {
        _writeCache(key, value, TTL_MS[
          // Reverse-lookup the normalized range from the Yahoo range arg.
          Object.keys(RANGE_MAP).find(k => RANGE_MAP[k].range === range) || '30d'
        ]);
        return value;
      })
      .finally(() => { HISTORY_INFLIGHT.delete(key); });
    HISTORY_INFLIGHT.set(key, inflight);
  }
  return inflight;
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const symbol         = String(req.query?.symbol   ?? '').trim();
  const rangeRaw       = String(req.query?.range    ?? '').trim().toLowerCase();
  const intervalRaw    = String(req.query?.interval ?? '').trim().toLowerCase();

  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return res.status(400).json({ ok: false, error: 'invalid_symbol' });
  }
  const rangeCfg = RANGE_MAP[rangeRaw];
  if (!rangeCfg) {
    return res.status(400).json({ ok: false, error: 'invalid_range' });
  }
  const interval = (intervalRaw && VALID_INTERVAL.has(intervalRaw))
    ? intervalRaw
    : rangeCfg.interval;

  try {
    const value = await _getOrFetch(symbol, rangeCfg.range, interval,
      AbortSignal.timeout(10000));
    // Successful upstream — always 200; downstream may interpret an empty
    // `points` array as "no history available" without forcing an error UI.
    return res.status(200).json(value);
  } catch (err) {
    const msg = err?.message || 'unknown';
    _warn('upstream', symbol, msg);
    // 502 only on genuine upstream failures so the client can choose to
    // render an error state. Empty data is NOT an error.
    return res.status(502).json({ ok: false, error: msg });
  }
}
