// ════════════════════════════════════════════════════════════════════════════
// AURIX-AFFILIATES-V1 · CONTROL: POST /api/control/affiliate-codes
// Contrato `aurix.affiliate-control.v1` (espejo de founder-core/contracts/
// aurix-affiliate-control.ts en Founder Platform).
// ════════════════════════════════════════════════════════════════════════════
// La PRIMERA escritura de Founder en Aurix, y por eso estrecha: una sola acción
// (`codes.replace`, el registro COMPLETO de códigos), credencial PROPIA
// (`AURIX_AFFILIATE_CONTROL_TOKEN`, distinta de la de lectura y de cualquier
// otro secreto), sin CORS, sin cookies, no-store, cuerpo ≤ 256 KB y ≤ 1000
// códigos. Lo que no valida se rechaza ENTERO (400). La BD hace el reemplazo en
// UNA transacción (`aurix_affiliate_codes_replace`, db/affiliate_codes_1.sql).
//
// RUTA SIN FUNCIÓN NUEVA: `api/` está en el tope de 12 Serverless. vercel.json
// reescribe /api/control/affiliate-codes a la ruta única `api/read/[surface].mjs`
// (superficie `control-affiliate-codes`). Este handler sólo acepta POST con la
// credencial de control; las superficies de lectura siguen siendo sólo GET.
//
// `.mjs` + prefijo `_`: ESM sin ambigüedad y fuera del enrutado, para que el
// harness ejecute este mismo código.
// ════════════════════════════════════════════════════════════════════════════

import { createHash, timingSafeEqual } from 'node:crypto';

export const CONTROL_CONTRACT = 'aurix.affiliate-control.v1';
const ACTION = 'codes.replace';
const MIN_LENGTH = 32;
const MAX_BODY = 256 * 1024;
const MAX_CODES = 1000;
const TIMEOUT_MS = 8_000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';

// Compartir valor con cualquiera de estos deshabilita el control.
const FOREIGN_SECRET_ENVS = [
  'AURIX_FOUNDER_READ_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_KEY',
  'RESEND_API_KEY',
  'TWELVE_API_KEY',
  'COINGECKO_DEMO_API_KEY',
  'CRON_SECRET',
  'PIN_HASH',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

function secret() {
  const token = process.env.AURIX_AFFILIATE_CONTROL_TOKEN;
  if (!token || token.length < MIN_LENGTH) return null;
  const shared = FOREIGN_SECRET_ENVS.some((n) => {
    const v = process.env[n];
    return typeof v === 'string' && v.length > 0 && v === token;
  });
  return shared ? null : token;
}

export function controlTokenConfigured() { return secret() !== null; }

export function verifyControlToken(provided) {
  const token = secret();
  if (!token || typeof provided !== 'string') return false;
  const a = Buffer.from(token), b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearer(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = header.trim().split(/\s+/);
  if ((parts[0] || '').toLowerCase() !== 'bearer') return null;
  const v = parts.slice(1).join(' ');
  return v.length ? v : null;
}

// ── canonicalRegistry: PORTADA LITERAL del contrato de Founder ─────────────
// SHA-256 (hex) de `JSON.stringify` de los códigos ordenados por código, con las
// claves en este orden exacto. Si esto cambia, las huellas dejan de coincidir.
export function canonicalRegistry(codes) {
  return JSON.stringify(
    [...codes]
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
      .map((c) => ({
        code: c.code,
        campaignId: c.campaignId,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        status: c.status,
        activeIntervals: c.activeIntervals.map((i) => ({ from: i.from, to: i.to })),
      })),
  );
}

export function registryHash(codes) {
  return createHash('sha256').update(canonicalRegistry(codes), 'utf8').digest('hex');
}

// ── Validación estricta ─────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['pendiente', 'activa', 'pausada', 'bloqueada'];
const isIso = (v) => typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString() === v;
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));

/** Devuelve el cuerpo normalizado o null. No hay validación parcial. */
export function validateControlBody(body) {
  if (!exactKeys(body, ['contract', 'action', 'actionId', 'issuedAt', 'codes'])) return null;
  if (body.contract !== CONTROL_CONTRACT || body.action !== ACTION) return null;
  if (typeof body.actionId !== 'string' || !UUID.test(body.actionId)) return null;
  if (!isIso(body.issuedAt)) return null;
  if (!Array.isArray(body.codes) || body.codes.length > MAX_CODES) return null;
  const seen = new Set();
  for (const c of body.codes) {
    if (!exactKeys(c, ['code', 'campaignId', 'startsAt', 'endsAt', 'status', 'activeIntervals'])) return null;
    if (typeof c.code !== 'string' || !/^[1-9][0-9]{5}$/.test(c.code) || seen.has(c.code)) return null;
    seen.add(c.code);
    if (typeof c.campaignId !== 'string' || c.campaignId.length < 1 || c.campaignId.length > 120) return null;
    if (!isIso(c.startsAt) || !isIso(c.endsAt) || c.startsAt > c.endsAt) return null;
    if (!STATUSES.includes(c.status)) return null;
    if (!Array.isArray(c.activeIntervals) || c.activeIntervals.length > 200) return null;
    for (const i of c.activeIntervals) {
      if (!exactKeys(i, ['from', 'to']) || !isIso(i.from)) return null;
      if (i.to !== null && (!isIso(i.to) || i.to < i.from)) return null;
    }
  }
  return body;
}

function readBody(req) {
  const len = Number((req.headers && req.headers['content-length']) || 0);
  if (len > MAX_BODY) return { tooLarge: true };
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    if (Buffer.byteLength(b, 'utf8') > MAX_BODY) return { tooLarge: true };
    try { b = JSON.parse(b); } catch { return { body: null }; }
  } else if (b && typeof b === 'object') {
    if (Buffer.byteLength(JSON.stringify(b), 'utf8') > MAX_BODY) return { tooLarge: true };
  } else {
    b = null;
  }
  return { body: b };
}

const fail = (res, status, code) => res.status(status).json({ error: { code } });

export async function affiliateCodesControlHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED');
  if (!verifyControlToken(bearer(req.headers && req.headers.authorization))) {
    return fail(res, 401, 'UNAUTHORIZED');            // genérico, como la lectura
  }

  const { body, tooLarge } = readBody(req);
  if (tooLarge) return fail(res, 413, 'PAYLOAD_TOO_LARGE');
  const v = validateControlBody(body);
  if (!v) return fail(res, 400, 'INVALID_REQUEST');

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return fail(res, 503, 'NOT_CONFIGURED');

  const sentHash = registryHash(v.codes);
  let out;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/aurix_affiliate_codes_replace`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_action_id: v.actionId, p_issued_at: v.issuedAt,
                             p_registry_hash: sentHash, p_codes: v.codes }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return fail(res, r.status === 404 ? 503 : 502, r.status === 404 ? 'NOT_APPLIED' : 'SOURCE_ERROR');
    out = await r.json();
  } catch {
    return fail(res, 502, 'SOURCE_ERROR');
  }
  if (!out || typeof out !== 'object') return fail(res, 502, 'SOURCE_ERROR');
  if (out.outcome === 'invalid') return fail(res, 400, 'INVALID_REQUEST');
  if (out.outcome === 'conflict') return fail(res, 409, 'ACTION_ID_REUSED');
  if (!Array.isArray(out.rows)) return fail(res, 502, 'SOURCE_ERROR');

  // La huella se calcula sobre lo GUARDADO (lo que devuelve la BD), no sobre lo
  // recibido: si difiere de la de Founder, el enlace no está listo.
  return res.status(200).json({
    contract: CONTROL_CONTRACT,
    actionId: v.actionId,
    action: ACTION,
    applied: out.applied === true,
    at: new Date(out.at || Date.now()).toISOString(),
    registryHash: registryHash(out.rows),
    count: out.rows.length,
  });
}
