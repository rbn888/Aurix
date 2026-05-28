// POST /api/client-log
// Accepts a sanitized client-side error report (≤ 4KB JSON body).
// Logs the payload to stderr with a [CLIENT] tag so it shows up in
// the Vercel function logs alongside the rest of the API.
//
// Strict input contract — only the whitelisted string fields below
// are forwarded to the log, and each is hard-capped. Anything else
// in the body is dropped. No portfolio data, holdings, emails, auth
// tokens or Supabase session objects are accepted.
//
// Returns 204 No Content. Origin-validated. JSON-only. The endpoint
// is intentionally tiny so it can be deleted in one file when the
// observability layer is no longer needed.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://rbn888.github.io';
const MAX_BYTES      = 4096;

const CAP = { build: 100, kind: 32, msg: 500, stack: 1500, path: 200, ua: 300, endpoint: 200 };

function pickString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed' });

  const origin = req.headers.origin || '';
  if (origin !== ALLOWED_ORIGIN) return res.status(403).json({ error: 'forbidden_origin' });

  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.startsWith('application/json')) return res.status(415).json({ error: 'unsupported_media' });

  const lenHeader = parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(lenHeader) && lenHeader > MAX_BYTES) {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  // Defense in depth — if the platform skipped the content-length check
  // (e.g. chunked uploads, sendBeacon paths), re-measure post-parse.
  let bodyBytes = 0;
  try { bodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8'); } catch (_) {}
  if (bodyBytes > MAX_BYTES) return res.status(413).json({ error: 'payload_too_large' });

  const safe = {
    build:    pickString(body.build,    CAP.build),
    ts:       typeof body.ts === 'number' && Number.isFinite(body.ts) ? body.ts : Date.now(),
    kind:     pickString(body.kind,     CAP.kind) || 'unknown',
    msg:      pickString(body.msg,      CAP.msg),
    stack:    pickString(body.stack,    CAP.stack),
    path:     pickString(body.path,     CAP.path),
    ua:       pickString(body.ua,       CAP.ua),
  };
  if (typeof body.endpoint === 'string') {
    safe.endpoint = pickString(body.endpoint, CAP.endpoint);
  }

  console.error('[CLIENT]', JSON.stringify(safe));

  return res.status(204).end();
}
