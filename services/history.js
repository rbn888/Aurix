// services/history.js
// ─────────────────────────────────────────────────────────────────────────────
// Real portfolio history using CoinGecko market_chart API.
//
// Replaces the simulated/sparse local snapshot data with actual historical
// prices × held quantities, keyed by the existing range IDs (24h / 7d /
// 30d / 1y) that the chart system already understands.
//
// Integration: sets window._liveHistory[range] = [{ts, value}] in USD.
// getChartData() in app.js checks this map first; when it is populated the
// chart renders real data.  When it is absent (range not yet fetched, or
// non-crypto portfolio) getChartData() falls back to local snapshots exactly
// as before — no behaviour change for existing users.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// Shared cross-script cache exposed on window so getChartData() can read it.
window._liveHistory = window._liveHistory || {};

// ── Range → CoinGecko "days" parameter ───────────────────────────────────
// 'all' is intentionally absent — it uses cost-basis comparison, not a
// time-boxed chart, so falling back to local history is correct.
const RANGE_DAYS = {
  '24h': 1,
  '7d':  7,
  '30d': 30,
  '1y':  365,
};

// ── Fetch raw price history for a single coin ─────────────────────────────
// Returns the CoinGecko `prices` array: [[timestamp_ms, price_usd], ...]
async function fetchHistory(id, days) {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`,
    { headers: { Accept: 'application/json' } }
  );
  if (res.status === 429) throw new Error('rate_limit');
  if (!res.ok)            throw new Error(`http_${res.status}`);
  const data = await res.json();
  return data.prices; // [[ts_ms, usd_price], ...]
}

// ── Merge per-coin value timelines into a single portfolio timeline ────────
// CoinGecko uses a consistent time grid per request so timestamps align
// across coins.  Simple additive merge by exact timestamp is reliable.
function mergeHistories(histories) {
  const merged = {};
  histories.forEach(h => {
    h.forEach(({ time, value }) => {
      merged[time] = (merged[time] || 0) + value;
    });
  });
  return Object.entries(merged)
    .map(([time, value]) => ({ ts: Number(time), value: +value.toFixed(2) }))
    .sort((a, b) => a.ts - b.ts);
}

// ── Compute absolute and % PnL over a data series ─────────────────────────
function calculatePnL(data) {
  if (!data || data.length < 2) return null;
  const first = data[0].value;
  const last  = data[data.length - 1].value;
  if (first <= 0) return null;
  return {
    absolute:   +(last - first).toFixed(2),
    percentage: +((last - first) / first * 100).toFixed(2),
  };
}

// ── Fetch and merge historical portfolio value for a given range ───────────
// Returns [{ts, value}] in USD, or null if no crypto assets / fetch fails.
async function fetchPortfolioHistory(range) {
  const days = RANGE_DAYS[range];
  if (!days) return null;

  if (typeof assets === 'undefined') return null;
  const cryptos = assets.filter(a => a.type === 'crypto' && a.coinId && a.qty > 0);
  if (!cryptos.length) return null;

  const results = await Promise.allSettled(
    cryptos.map(async a => {
      const prices = await fetchHistory(a.coinId, days);
      return prices.map(([time, price]) => ({ time, value: price * a.qty }));
    })
  );

  const fulfilled = results
    .filter(r => r.status === 'fulfilled' && r.value.length > 0)
    .map(r => r.value);

  if (!fulfilled.length) return null;
  return mergeHistories(fulfilled);
}

// ── Load history for a range, cache it, and refresh the chart ─────────────
async function loadHistoryForRange(range) {
  if (!RANGE_DAYS[range]) return; // 'all' — no CoinGecko equivalent

  // Serve from cache on subsequent clicks (no re-fetch needed)
  if (window._liveHistory[range]) {
    if (typeof updateChart     === 'function') updateChart(true);
    if (typeof updatePerformance === 'function') updatePerformance();
    return;
  }

  try {
    const data = await fetchPortfolioHistory(range);
    if (data && data.length >= 2) {
      window._liveHistory[range] = data;
      if (typeof updateChart     === 'function') updateChart(true);
      if (typeof updatePerformance === 'function') updatePerformance();
    }
  } catch {
    // Silently fall back to local history on network / rate-limit errors.
  }
}

// ── Hook into range buttons ───────────────────────────────────────────────
// Adds a second listener alongside the existing one in app.js.  Both fire
// on each click; the existing listener updates activeRange and renders local
// data immediately, then this one updates the chart again once CoinGecko
// data arrives (or instantly if already cached).
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => loadHistoryForRange(btn.dataset.range));
});

// ── Bootstrap: fetch the initial active range on page load ────────────────
// app.js has already executed by this point, so all globals are available.
if (typeof activeRange !== 'undefined') {
  loadHistoryForRange(activeRange);
}
