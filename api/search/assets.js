// GET /api/search/assets?q=<query>
// Server-side proxy for Yahoo Finance search. No CORS concerns from the
// backend, so the browser never needs corsproxy.io / allorigins fallbacks.
//
// Response shape matches what the frontend caller already expects:
//   { results: [{ ticker, name, type, marketSymbol }, ...] }
// where type is 'stock' | 'etf' | 'index' | 'fund'.
//
// MC-2B: indices (^GSPC, ^GDAXI, ^IBEX, ^N225, ^FTSE, …) are surfaced with
// type:'index' so search returns "S&P 500", "DAX", "IBEX 35", "Nikkei",
// "FTSE 100", etc. Pricing for indices outside the snapshot REGISTRY
// (^GSPC / ^IXIC / ^DJI today) is out of scope for this change.
//
// MC-6: mutual funds (Yahoo quoteType 'MUTUALFUND') are surfaced with
// type:'fund'. Yahoo serves the NAV under opaque Morningstar codes
// (0P*) — the symbol is passed through verbatim; the snapshot router
// recognises the 0P* shape and routes to Yahoo with daily-NAV TTL.

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
const MAX_RESULTS    = 7;

// ── MARKET-EXCELLENCE · BRK.B SEARCH ALIAS ──────────────────────────────────
// La consulta se enviaba VERBATIM a Yahoo y Yahoo indexa las clases de acción
// estadounidenses con GUION (`BRK-B`), no con punto. Medido contra el endpoint real:
//   "BRK-B"     → BRK-B ✓        "Berkshire" → BRK-B ✓
//   "BRK.B"     → BRKC (basura)  "BRK.A"     → BRK.AQ / BRK.AX (basura)
//   "BF.B"      → 0 resultados   "BF-B"      → BF-B ✓
// Es decir: la convención que el usuario escribe (la de prensa/Bloomberg) no
// encontraba el instrumento, mientras el nombre sí. Aquí sólo se traduce la
// CONSULTA; la respuesta conserva el símbolo de Yahoo tal cual, así que la
// identidad canónica y el enrutado de precio/histórico no cambian (comprobado:
// el snapshot resuelve BRK.B y BRK-B al mismo precio).
//
// NORMALIZACIÓN DELIBERADAMENTE ESTRECHA. Sólo `TICKER.A` / `TICKER.B`:
//   · `.A` y `.B` NO son sufijos de mercado de Yahoo, así que no hay colisión
//     posible con listados internacionales (`.L`, `.DE`, `.AS`, `.MC`, `.SW`,
//     `.PA`, `.MI`, `.T`, `.F`, `.V`…), que quedan intactos;
//   · el prefijo se limita a 1–4 letras, así que los códigos numéricos con
//     sufijo (7203.T) tampoco entran.
// La forma COMPACTA no puede resolverse con patrón: `NVDA` → `NVD-A` rompería
// tickers reales. Por eso es un mapa explícito y sólo con formas verificadas como
// inexistentes por sí mismas (ni `BRKB` ni `BRKA` devuelven hoy un instrumento
// canónico), de modo que no puede ensombrecer a ningún activo real.
const CLASS_SHARE_DOT = /^([A-Z]{1,4})\.([AB])$/;
const COMPACT_ALIASES = Object.freeze({ BRKB: 'BRK-B', BRKA: 'BRK-A' });
function aliasQuery(raw) {
  const q = String(raw || '').trim();
  const up = q.toUpperCase();
  if (COMPACT_ALIASES[up]) return COMPACT_ALIASES[up];
  const m = CLASS_SHARE_DOT.exec(up);
  if (m) return `${m[1]}-${m[2]}`;
  return q;                                   // todo lo demás viaja intacto
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'method_not_allowed' });

  const q = String(req.query?.q ?? '').trim();
  if (!q || q.length > 64) return res.status(400).json({ error: 'invalid_query' });

  try {
    // Sólo la consulta se traduce (clases de acción US). Una sola petición, como antes.
    const url = `https://query1.finance.yahoo.com/v1/finance/search` +
                `?q=${encodeURIComponent(aliasQuery(q))}&quotesCount=8&newsCount=0&listsCount=0`;
    const upstream = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Aurix)' },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream_${upstream.status}`, results: [] });
    }
    const json    = await upstream.json();
    const quotes  = Array.isArray(json?.quotes) ? json.quotes : [];
    const results = quotes
      .filter(qt => qt.quoteType === 'EQUITY' || qt.quoteType === 'ETF'
                 || qt.quoteType === 'INDEX'  || qt.quoteType === 'MUTUALFUND')
      .slice(0, MAX_RESULTS)
      .map(qt => {
        const type = qt.quoteType === 'ETF'        ? 'etf'
                   : qt.quoteType === 'INDEX'      ? 'index'
                   : qt.quoteType === 'MUTUALFUND' ? 'fund'
                                                   : 'stock';
        // SEARCH-V2.1 — pass through two ranking signals Yahoo ALREADY returns in this same
        // response and that were being discarded: `score` (Yahoo's own relevance/popularity
        // weight, which tracks how much a symbol is actually looked up) and the exchange.
        // No new provider, no extra request, no pricing/financial data. Both are optional —
        // the ranker treats a missing value as neutral. Yahoo does NOT expose market cap or
        // volume on the search endpoint, so those two ranking signals stay unavailable for
        // equities/ETFs by design rather than being invented.
        return {
          ticker:       qt.symbol,
          name:         qt.longname || qt.shortname || qt.symbol,
          type,
          marketSymbol: qt.symbol,
          providerScore: Number.isFinite(qt.score) ? qt.score : null,
          exchange:      (typeof qt.exchDisp === 'string' && qt.exchDisp) ? qt.exchDisp
                       : (typeof qt.exchange === 'string' && qt.exchange) ? qt.exchange : null,
        };
      });
    return res.status(200).json({ results });
  } catch (err) {
    console.error('[API][search] upstream failure:', err?.message);
    return res.status(502).json({ error: 'upstream_unreachable', results: [] });
  }
}
