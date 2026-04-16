// services/prices.js
// ─────────────────────────────────────────────────────────────────────────────
// Live crypto price polling — 15 s interval.
//
// This file supplements the 60 s full-refresh in app.js (which also handles
// stocks, ETFs, metals, and gold).  Only crypto assets are updated here so
// that Yahoo Finance / gold API rate limits are not impacted.
//
// All globals (assets, save, render, lastRefreshAt, setUpdateStatus,
// onPortfolioChange) are defined in app.js, which is loaded first.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Symbol → CoinGecko ID map ─────────────────────────────────────────────
// Covers commonly held coins.  For any coin added via the search UI, app.js
// already stores the resolved CoinGecko ID in asset.coinId at add-time, so
// this map is supplemental — it is NOT the primary ID source.
const COINGECKO_IDS = {
  BTC:   'bitcoin',
  ETH:   'ethereum',
  USDC:  'usd-coin',
  USDT:  'tether',
  PEPE:  'pepe',
  ONDO:  'ondo-finance',
  BNB:   'binancecoin',
  SOL:   'solana',
  ADA:   'cardano',
  XRP:   'ripple',
  DOGE:  'dogecoin',
  DOT:   'polkadot',
  MATIC: 'matic-network',
  LINK:  'chainlink',
  AVAX:  'avalanche-2',
  LTC:   'litecoin',
};

// ── Fetch USD prices + 24 h change from CoinGecko ────────────────────────
// ids: array of CoinGecko coin IDs (e.g. ['bitcoin', 'ethereum'])
// Returns: { [id]: { usd: number, usd_24h_change: number } }
async function fetchCryptoPrices(ids) {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`,
    { headers: { Accept: 'application/json' } }
  );
  if (res.status === 429) throw new Error('rate_limit');
  if (!res.ok)            throw new Error(`http_${res.status}`);
  return res.json();
}

// ── Apply a CoinGecko response object to the global assets array ──────────
// Mirrors the update pattern in refreshPrices() (app.js lines 1660–1667).
// Returns true if any price actually changed, so the caller can skip an
// unnecessary render() + save() when nothing moved.
function _applyCryptoPrices(priceData) {
  let changed = false;
  assets.forEach(a => {
    if (a.type !== 'crypto' || !a.coinId) return;
    const d = priceData[a.coinId];
    if (!d) return;
    if (d.usd !== a.price) {
      a.prevPrice = a.price;
      a.price     = d.usd;
      changed     = true;
    }
    a.change24h = d.usd_24h_change ?? null;
  });
  return changed;
}

// ── 15 s crypto-only polling loop ─────────────────────────────────────────
(function startCryptoPoll() {
  async function poll() {
    // Guard: wait until app.js has finished initialising its globals.
    if (typeof assets === 'undefined' || typeof render === 'undefined') return;

    const cryptos = assets.filter(a => a.type === 'crypto' && a.coinId);
    if (!cryptos.length) return;

    const ids = [...new Set(cryptos.map(a => a.coinId))];

    try {
      setUpdateStatus('refreshing');
      const data    = await fetchCryptoPrices(ids);
      const changed = _applyCryptoPrices(data);
      if (changed) {
        save();
        lastRefreshAt = Date.now();
        render();
        onPortfolioChange();
      }
      setUpdateStatus('ok');
    } catch (err) {
      setUpdateStatus(err.message === 'rate_limit' ? 'rate_limit' : 'error');
    }
  }

  setInterval(poll, 15_000);
})();
