// GET /api/market/commodities
// Response: { data: [{ symbol, name, price, change24h, image }] }
//
// Uses TwelveData /quote (not /price like stocks.js) so percent_change is
// captured at the source — required by the response contract field change24h
// without fabricating values.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://rbn888.github.io';

// Provider symbol → canonical Aurix symbol + display metadata.
// XAU/USD and XAG/USD are TwelveData spot pairs (already used by the
// frontend's direct calls). WTI/USD is the canonical TwelveData symbol for
// WTI Crude Oil; if the provider rejects it the per-symbol handler logs
// and the endpoint still returns the symbols that did resolve.
const COMMODITIES = [
  { provider: 'XAU/USD', symbol: 'XAUUSD', name: 'Gold',          image: null },
  { provider: 'XAG/USD', symbol: 'XAGUSD', name: 'Silver',        image: null },
  { provider: 'WTI/USD', symbol: 'WTI',    name: 'WTI Crude Oil', image: null },
];

function parseEntry(entry) {
  if (!entry || entry.status === 'error' || entry.code) return null;
  const price = parseFloat(entry.close ?? entry.price);
  if (!isFinite(price) || price <= 0) return null;
  const pct  = parseFloat(entry.percent_change);
  return { price, change24h: isFinite(pct) ? pct : null };
}

async function fetchCommoditiesBatch(apiKey) {
  const providers = COMMODITIES.map(c => c.provider).join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(providers)}&apikey=${apiKey}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`TwelveData HTTP ${r.status}`);
  const json = await r.json();
  if (json.status === 'error' || json.code) {
    throw new Error(`TwelveData: ${json.message || json.code}`);
  }
  return json;
}

export default async function handler(req, res) {
  console.log('[commodities] API_KEY exists:', !!process.env.TWELVE_API_KEY);
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'method_not_allowed' });

  const API_KEY = process.env.TWELVE_API_KEY;
  if (!API_KEY) {
    console.error('[API][commodities] TWELVE_API_KEY not configured');
    return res.status(200).json({ data: [] });
  }

  let payload;
  try {
    payload = await fetchCommoditiesBatch(API_KEY);
  } catch (e) {
    console.error('[API][commodities] provider failure:', e.message);
    return res.status(200).json({ data: [] });
  }

  const data = [];
  for (const c of COMMODITIES) {
    const entry  = COMMODITIES.length === 1 ? payload : payload[c.provider];
    const parsed = parseEntry(entry);
    if (parsed) {
      data.push({
        symbol:    c.symbol,
        name:      c.name,
        price:     parsed.price,
        change24h: parsed.change24h,
        image:     c.image,
      });
    } else {
      console.error(`[API][commodities] ${c.provider} invalid or missing in response`);
    }
  }

  return res.status(200).json({ data });
}
