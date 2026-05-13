// POST /api/assets/resolve-isin
// Body:     { isin: "US0378331005" }
// Response: { data: [{ ticker, name, exchCode, securityType, securityType2, ... }, ...] }
//
// Proxies OpenFIGI /v3/mapping. Browser never talks to OpenFIGI directly.
// Returns the raw `data` array OpenFIGI emits for a single ISIN query, so
// the frontend caller (getAssetFromISIN) can keep its existing parser:
// exch suffix mapping, asset type inference, US-preferred ticker selection.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://rbn888.github.io';
const ISIN_REGEX     = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed' });

  const isin = String(req.body?.isin ?? '').trim().toUpperCase();
  if (!ISIN_REGEX.test(isin)) return res.status(400).json({ error: 'invalid_isin' });

  try {
    const upstream = await fetch('https://api.openfigi.com/v3/mapping', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
      signal:  AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream_${upstream.status}`, data: [] });
    }
    const json = await upstream.json();
    const data = Array.isArray(json?.[0]?.data) ? json[0].data : [];
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[API][isin] upstream failure:', err?.message);
    return res.status(502).json({ error: 'upstream_unreachable', data: [] });
  }
}
