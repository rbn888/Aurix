/* ─────────────────────────────────────────────────────────────────
   AurixChartAdapters — CHART-3 historical data foundation.

   ONE chart engine, MANY data sources. This module is the data side.

   Public API (attached to window.AurixChartAdapters):

     yahooHistoryAdapter({ symbol, range, signal? })
     cryptoHistoryAdapter({ coinId, range, signal? })
     portfolioHistoryAdapter({ range })

   Every adapter returns the canonical Aurix shape:

     {
       series: [
         { time: epochMs, value, open?, high?, low?, close?, volume? }
       ],
       meta: {
         source: 'yahoo' | 'coingecko' | 'local-snapshot',
         currency: 'USD',
         granularity: '5m'|'15m'|'1h'|'1d'|'1wk',
         isSynthetic: boolean,
         completeness: number,         // 0..1
         asOf: epochMs
       }
     }

   Rules:
   - All adapters emit values in canonical USD. Base-currency conversion
     is the chart layer's job (toBase at render time).
   - Errors NEVER throw — they return an empty series + meta. The chart
     core renders the empty/error state cleanly.
   - No UI surface consumes adapters in CHART-3. This is infrastructure.
   ───────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // AURIX-APP-DOMAIN-READY-1: single source of truth for the API origin
  // (window.AURIX_API_BASE, set in index.html). Default stays the current
  // Vercel project during migration; set to '' for a same-origin /api later.
  const API_BASE = (typeof window !== 'undefined' && typeof window.AURIX_API_BASE === 'string')
    ? window.AURIX_API_BASE
    : 'https://isa-portfolio-ten.vercel.app';

  // ── Range → provider arg maps ─────────────────────────────────
  // Yahoo accepts named ranges + intervals; the backend already owns
  // that mapping. Crypto / CoinGecko uses `days` — a number for fixed
  // windows, or the string 'max' for the full available history.
  // ASSET-CHARTS-1: 'all' must mean *all* available history, not 365
  // days — otherwise BTC TOTAL is indistinguishable from 1Y. CoinGecko
  // accepts days=max and returns the full series from genesis.
  const CRYPTO_DAYS = Object.freeze({
    '24h': 1, '7d': 7, '30d': 30, '3m': 90, '1y': 365, 'all': 'max',
  });

  // Coarse cumulative window in ms, used to bucket "completeness"
  // metrics for adapter responses.
  const RANGE_SPAN_MS = Object.freeze({
    '24h':       24 * 3600e3,
    '7d':    7  * 86400e3,
    '30d':  30  * 86400e3,
    '3m':   90  * 86400e3,
    '1y':  365  * 86400e3,
    'all': 730  * 86400e3,
  });

  // Expected sample count per range (rough — used for the completeness
  // metric on the meta. Never enforced.)
  const RANGE_EXPECTED = Object.freeze({
    '24h':  96,   // 5-min
    '7d':  168,
    '30d': 180,
    '3m':  180,
    '1y':  220,
    'all': 250,
  });

  function _warn(...args) { try { console.warn('[chart-adapters]', ...args); } catch (_) {} }

  // SPEC 4.1G — abort-aware delay for retry backoff. Rejects immediately if the
  // caller's AbortController fires, so retries never outlive a cancelled request.
  function _sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) { reject(new Error('aborted')); return; }
      const id = setTimeout(resolve, ms);
      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', function () { clearTimeout(id); reject(new Error('aborted')); }, { once: true });
      }
    });
  }
  // SPEC 4.1G — per-coin crypto feed diagnostic side-channel (write-only). The
  // founder overlay reads window.__aurixCryptoFeedDiag to distinguish a genuine
  // 'empty-feed-real' from a transient 'rate-limited' / 'upstream-error'. Touches
  // no data/persistence; keyed by lower-cased coinId.
  function _cryptoDiag(coinId, status) {
    try {
      if (typeof window === 'undefined') return;
      const g = (window.__aurixCryptoFeedDiag = window.__aurixCryptoFeedDiag || {});
      g[String(coinId || '').toLowerCase()] = { status: status, at: Date.now() };
    } catch (_) {}
  }
  function _cryptoEmpty(coinId, reason) {
    _cryptoDiag(coinId, reason);
    return {
      series: [],
      meta: { source: 'coingecko', currency: 'USD', granularity: '1h', isSynthetic: false, completeness: 0, asOf: Date.now(), error: reason },
    };
  }

  function _emptyResult(source, currency, granularity) {
    return Object.freeze({
      series: [],
      meta: Object.freeze({
        source,
        currency:    (currency || 'USD').toUpperCase(),
        granularity: granularity || '1d',
        isSynthetic: false,
        completeness: 0,
        asOf: Date.now(),
      }),
    });
  }

  function _validRange(r) {
    return typeof r === 'string' && Object.prototype.hasOwnProperty.call(RANGE_SPAN_MS, r);
  }

  function _completenessFor(seriesLen, range) {
    const expected = RANGE_EXPECTED[range] || 1;
    if (expected <= 0) return 0;
    const ratio = seriesLen / expected;
    return Math.max(0, Math.min(1, +ratio.toFixed(3)));
  }

  // ── 1. Yahoo adapter ──────────────────────────────────────────
  async function yahooHistoryAdapter(args) {
    const a = args || {};
    const symbol = String(a.symbol || '').trim();
    const range  = String(a.range  || '').toLowerCase();
    if (!symbol || !_validRange(range)) {
      return _emptyResult('yahoo', 'USD', '1d');
    }

    let res;
    try {
      res = await fetch(
        `${API_BASE}/api/prices/history-yahoo` +
          `?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
        { signal: a.signal, headers: { Accept: 'application/json' } }
      );
    } catch (err) {
      _warn('yahoo fetch fail', symbol, range, err?.message);
      return _emptyResult('yahoo', 'USD', '1d');
    }
    if (!res.ok) {
      _warn('yahoo http', symbol, range, res.status);
      return _emptyResult('yahoo', 'USD', '1d');
    }

    let body;
    try { body = await res.json(); } catch (_) { body = null; }
    if (!body || body.ok !== true || !Array.isArray(body.points)) {
      return _emptyResult('yahoo', 'USD', '1d');
    }

    const granularity = String(body.granularity || '1d');
    const series = [];
    for (const p of body.points) {
      // The endpoint already filters non-finite close values. Belt-and-
      // braces: filter again here so the adapter contract is hard-typed.
      if (!p || typeof p.time !== 'number' || typeof p.close !== 'number' || !Number.isFinite(p.close)) continue;
      series.push({
        time:   p.time,
        value:  p.close,
        open:   Number.isFinite(p.open)   ? p.open   : null,
        high:   Number.isFinite(p.high)   ? p.high   : null,
        low:    Number.isFinite(p.low)    ? p.low    : null,
        close:  p.close,
        volume: Number.isFinite(p.volume) ? p.volume : null,
      });
    }

    // Yahoo's `meta.currency` is preserved verbatim by the backend (or
    // null if it didn't pass the ISO-4217 guard). For the adapter
    // contract, default to USD when the proxy couldn't confirm a code.
    const currency = (body.currency && /^[A-Z]{3}$/.test(body.currency))
      ? body.currency
      : 'USD';

    return {
      series,
      meta: {
        source:       'yahoo',
        currency:     currency,
        granularity:  granularity,
        isSynthetic:  false,
        completeness: _completenessFor(series.length, range),
        asOf:         Date.now(),
      },
    };
  }

  // ── 2. Crypto adapter (CoinGecko via existing proxy) ─────────
  async function cryptoHistoryAdapter(args) {
    const a = args || {};
    const coinId = String(a.coinId || '').trim().toLowerCase();
    const range  = String(a.range  || '').toLowerCase();
    if (!coinId || !_validRange(range)) {
      return _emptyResult('coingecko', 'USD', '1h');
    }
    const days = CRYPTO_DAYS[range];
    if (!days) {
      return _emptyResult('coingecko', 'USD', '1h');
    }

    const url = `${API_BASE}/api/prices/history` +
      `?id=${encodeURIComponent(coinId)}&days=${encodeURIComponent(days)}`;
    // SPEC 4.1G — transient CoinGecko 429/502/503/504 (rate-limit / upstream)
    // must NOT turn valid crypto into a permanent empty-feed. Retry up to twice
    // with short jittered backoff (immediate → 400-700ms → 900-1400ms), aborting
    // cleanly if the caller cancels. A 200 with no prices is a GENUINE empty
    // (not retried). On final failure we return empty WITH a distinguishable
    // reason so the overlay can show rate-limited / upstream-error vs no-history.
    const BACKOFFS  = [0, 400 + Math.floor(Math.random() * 300), 900 + Math.floor(Math.random() * 500)];
    const RETRYABLE = { 429: 'rate-limited', 502: 'upstream-error', 503: 'upstream-error', 504: 'upstream-error' };
    let lastReason  = 'upstream-error';

    for (let attempt = 0; attempt < BACKOFFS.length; attempt++) {
      if (a.signal && a.signal.aborted) return _cryptoEmpty(coinId, 'aborted');
      if (attempt > 0) {
        try { await _sleep(BACKOFFS[attempt], a.signal); }
        catch (_) { return _cryptoEmpty(coinId, 'aborted'); }
      }

      let res;
      try {
        res = await fetch(url, { signal: a.signal, headers: { Accept: 'application/json' } });
      } catch (err) {
        if (a.signal && a.signal.aborted) return _cryptoEmpty(coinId, 'aborted');
        lastReason = 'upstream-error';
        _warn('crypto fetch fail', coinId, range, err?.message);
        continue;   // network error → retry
      }

      if (res.ok) {
        let body;
        try { body = await res.json(); } catch (_) { body = null; }
        const prices = Array.isArray(body?.prices) ? body.prices : [];
        if (!prices.length) return _cryptoEmpty(coinId, 'empty-feed-real');   // 200 + no data → genuine; don't retry

        // CoinGecko granularity is implicit by `days`: <=1d → 5m, <=90d → 1h, >90d → 1d.
        const granularity = days <= 1 ? '5m' : days <= 90 ? '1h' : '1d';
        const series = [];
        for (const p of prices) {
          if (!Array.isArray(p) || p.length < 2) continue;
          const t = p[0], v = p[1];
          if (typeof t !== 'number' || typeof v !== 'number' || !Number.isFinite(v)) continue;
          series.push({ time: t, value: v });
        }
        _cryptoDiag(coinId, 'ok');
        return {
          series,
          meta: {
            source:       'coingecko',
            currency:     'USD',
            granularity:  granularity,
            isSynthetic:  false,
            completeness: _completenessFor(series.length, range),
            asOf:         Date.now(),
          },
        };
      }

      // Non-2xx: retry on transient codes, stop on the rest (e.g. 400/404).
      lastReason = RETRYABLE[res.status] || 'upstream-error';
      _warn('crypto http', coinId, range, res.status);
      if (!RETRYABLE[res.status]) break;
    }

    return _cryptoEmpty(coinId, lastReason);
  }

  // ── 3. Portfolio adapter (local snapshots) ───────────────────
  // Reads the in-memory `portfolioHistory` populated by app.js's
  // recordSnapshot loop. Each entry is { ts: epochMs, value: USD }.
  // The adapter NEVER mutates the underlying array.
  function portfolioHistoryAdapter(args) {
    const a = args || {};
    const range = String(a.range || '').toLowerCase();
    if (!_validRange(range)) {
      return _emptyResult('local-snapshot', 'USD', '5m');
    }

    const raw = (typeof window !== 'undefined' && Array.isArray(window.portfolioHistory))
      ? window.portfolioHistory
      // app.js declares `portfolioHistory` as a top-level `let`; in
      // browser env it's reachable via `window` only when explicitly
      // attached. Fall back to globalThis lookup so the adapter still
      // sees the data when wired via consumers that pass it in.
      : (typeof globalThis !== 'undefined' && Array.isArray(globalThis.portfolioHistory))
        ? globalThis.portfolioHistory
        : [];

    if (!raw.length) return _emptyResult('local-snapshot', 'USD', '5m');

    const now    = Date.now();
    const cutoff = range === 'all' ? 0 : (now - RANGE_SPAN_MS[range]);
    const filtered = [];
    for (const p of raw) {
      if (!p) continue;
      const t = Number(p.ts);
      const v = Number(p.value);
      if (!Number.isFinite(t) || !Number.isFinite(v) || v <= 0) continue;
      if (t < cutoff) continue;
      filtered.push({ time: t, value: v });
    }
    if (!filtered.length) return _emptyResult('local-snapshot', 'USD', '5m');
    filtered.sort((a, b) => a.time - b.time);

    // Granularity inference from median delta between adjacent points.
    let granularity = '5m';
    if (filtered.length >= 2) {
      const deltas = [];
      for (let i = 1; i < filtered.length; i++) deltas.push(filtered[i].time - filtered[i - 1].time);
      deltas.sort((a, b) => a - b);
      const median = deltas[Math.floor(deltas.length / 2)];
      if      (median <= 6 * 60e3)        granularity = '5m';
      else if (median <= 30 * 60e3)       granularity = '15m';
      else if (median <= 2 * 3600e3)      granularity = '1h';
      else if (median <= 36 * 3600e3)     granularity = '1d';
      else                                granularity = '1wk';
    }

    return {
      series: filtered,
      meta: {
        source:       'local-snapshot',
        currency:     'USD',
        granularity:  granularity,
        isSynthetic:  false,
        completeness: _completenessFor(filtered.length, range),
        asOf:         now,
      },
    };
  }

  // ── Public surface (read-only) ───────────────────────────────
  window.AurixChartAdapters = Object.freeze({
    yahooHistoryAdapter,
    cryptoHistoryAdapter,
    portfolioHistoryAdapter,
    // Diagnostics — useful from console without exposing internals.
    _ranges: Object.keys(RANGE_SPAN_MS),
  });
})();
