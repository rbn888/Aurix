'use strict';

// Market System — fetches BTC data and returns structured signals.
// Isolated: no UI, no DOM, no portfolio logic.

async function getMarketSignals() {
  const url =
    'https://api.coingecko.com/api/v3/simple/price' +
    '?ids=bitcoin&vs_currencies=usd&include_24hr_change=true';

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error('Market fetch failed: ' + err.message);
  }

  if (!res.ok) {
    throw new Error('Market API error: ' + res.status);
  }

  const data = await res.json();
  const change = data?.bitcoin?.usd_24h_change;

  if (change == null) {
    throw new Error('Market data invalid: missing btc change');
  }

  const abs = Math.abs(change);

  const trend =
    change > 2  ? 'up'   :
    change < -2 ? 'down' :
                  'neutral';

  const volatility =
    abs > 5 ? 'high'   :
    abs > 2 ? 'medium' :
              'low';

  const momentum = abs > 4 ? 'strong' : 'weak';

  return { trend, volatility, momentum };
}
