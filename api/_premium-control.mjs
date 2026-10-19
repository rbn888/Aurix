// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-ACCESS-V1 · CONTROL: POST /api/control/premium-access
// Contrato `aurix.premium-control.v1` (espejo de founder-core/contracts/
// aurix-premium-control.ts en Founder Platform).
// ════════════════════════════════════════════════════════════════════════════
// Accesos Premium GRATUITOS concedidos por el fundador. Dos acciones:
//   · `user.lookup`  — por correo (sólo criterio de búsqueda) devuelve el id
//     autoritativo, si el correo está verificado, el estado Premium y su origen,
//     y el historial de la persona. Sin efectos.
//   · `access.apply` — grant | extend | replace | revoke sobre el id, con
//     `permanent: true` para un acceso SIN caducidad (solo grant y replace). La regla
//     vive en la BD (`aurix_premium_access_apply`, db/premium_access_grants_1.sql):
//     escribe SÓLO filas gestionadas de `entitlement_overrides`, que el resolver
//     de siempre suma con OR al plan pagado. Nunca toca subscriptions ni Stripe.
//
// Credencial PROPIA (`AURIX_PREMIUM_CONTROL_TOKEN`, ≥ 32, distinta de cualquier
// otro secreto), sin CORS, sin cookies, no-store, cuerpo ≤ 8 KB. Lo que no
// valida se rechaza ENTERO (400). Nada de esto escribe en logs: ni el correo.
//
// RUTA SIN FUNCIÓN NUEVA: vercel.json reescribe /api/control/premium-access a
// `api/read/[surface].mjs` (superficie `control-premium-access`).
// ════════════════════════════════════════════════════════════════════════════

import { createHash, timingSafeEqual } from 'node:crypto';

export const PREMIUM_CONTROL_CONTRACT = 'aurix.premium-control.v1';
const MIN_LENGTH = 32;
const MAX_BODY = 8 * 1024;
const TIMEOUT_MS = 8_000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
export const OPERATIONS = ['grant', 'extend', 'replace', 'revoke'];

// Compartir valor con cualquiera de estos deshabilita el control.
const FOREIGN_SECRET_ENVS = [
  'AURIX_FOUNDER_READ_TOKEN',
  'AURIX_AFFILIATE_CONTROL_TOKEN',
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
  const token = process.env.AURIX_PREMIUM_CONTROL_TOKEN;
  if (!token || token.length < MIN_LENGTH) return null;
  const shared = FOREIGN_SECRET_ENVS.some((n) => {
    const v = process.env[n];
    return typeof v === 'string' && v.length > 0 && v === token;
  });
  return shared ? null : token;
}

export function premiumControlConfigured() { return secret() !== null; }

export function verifyPremiumControlToken(provided) {
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

// Huella de la operación: mismo actionId con otra huella ⇒ 409.
export function applyFingerprint(v) {
  return createHash('sha256').update(JSON.stringify({
    userId: v.userId, operation: v.operation, days: v.days, permanent: v.permanent,
    expectedExpiresAt: v.expectedExpiresAt, reason: v.reason,
  }), 'utf8').digest('hex');
}

// ── Validación estricta ─────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{1,63}$/;
const isIso = (v) => typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString() === v;
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const head = (b) => b.contract === PREMIUM_CONTROL_CONTRACT
  && typeof b.actionId === 'string' && UUID.test(b.actionId) && isIso(b.issuedAt);

/** Devuelve el cuerpo normalizado o null. No hay validación parcial. */
export function validatePremiumBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.action === 'user.lookup') {
    if (!exactKeys(body, ['contract', 'action', 'actionId', 'issuedAt', 'email']) || !head(body)) return null;
    if (typeof body.email !== 'string') return null;
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) return null;
    return { ...body, email };
  }
  if (body.action === 'access.apply') {
    if (!exactKeys(body, ['contract', 'action', 'actionId', 'issuedAt', 'userId', 'operation', 'days',
      'permanent', 'expectedExpiresAt', 'reason']) || !head(body)) return null;
    if (typeof body.userId !== 'string' || !UUID.test(body.userId)) return null;
    if (!OPERATIONS.includes(body.operation)) return null;
    if (typeof body.permanent !== 'boolean') return null;
    // Sin caducidad: solo al conceder o sustituir, y sin días.
    if (body.permanent && !(body.operation === 'grant' || body.operation === 'replace')) return null;
    if (body.operation === 'revoke' || body.permanent ? body.days !== null
      : !(Number.isInteger(body.days) && body.days >= 1 && body.days <= 365)) return null;
    // Lo que el fundador tenía delante: nada, un permanente o una fecha.
    if (body.expectedExpiresAt !== null && body.expectedExpiresAt !== 'permanent' && !isIso(body.expectedExpiresAt)) return null;
    if (typeof body.reason !== 'string') return null;
    const reason = body.reason.trim();
    if (reason.length < 3 || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason)) return null;
    return { ...body, userId: body.userId.toLowerCase(), reason };
  }
  return null;
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

async function rpc(key, fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) return { status: r.status === 404 ? 503 : 502, code: r.status === 404 ? 'NOT_APPLIED' : 'SOURCE_ERROR' };
  return { out: await r.json() };
}

const isState = (s) => s && typeof s === 'object' && s.paid && typeof s.paid.active === 'boolean'
  && typeof s.foreignOverride === 'boolean';

export async function premiumAccessControlHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED');
  if (!verifyPremiumControlToken(bearer(req.headers && req.headers.authorization))) {
    return fail(res, 401, 'UNAUTHORIZED');
  }
  const { body, tooLarge } = readBody(req);
  if (tooLarge) return fail(res, 413, 'PAYLOAD_TOO_LARGE');
  const v = validatePremiumBody(body);
  if (!v) return fail(res, 400, 'INVALID_REQUEST');

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return fail(res, 503, 'NOT_CONFIGURED');

  const base = { contract: PREMIUM_CONTROL_CONTRACT, actionId: v.actionId, action: v.action };
  let r;
  try {
    r = v.action === 'user.lookup'
      ? await rpc(key, 'aurix_premium_access_lookup', { p_email: v.email })
      : await rpc(key, 'aurix_premium_access_apply', {
          p_action_id: v.actionId, p_issued_at: v.issuedAt, p_user_id: v.userId,
          p_operation: v.operation, p_days: v.days, p_permanent: v.permanent, p_expected: v.expectedExpiresAt,
          p_reason: v.reason, p_fingerprint: applyFingerprint(v) });
  } catch {
    return fail(res, 502, 'SOURCE_ERROR');
  }
  if (r.status) return fail(res, r.status, r.code);
  const out = r.out;
  if (!out || typeof out !== 'object') return fail(res, 502, 'SOURCE_ERROR');
  if (out.outcome === 'invalid') return fail(res, 400, 'INVALID_REQUEST');
  if (out.outcome === 'conflict') return fail(res, 409, 'ACTION_ID_REUSED');

  if (v.action === 'user.lookup') {
    if (out.outcome === 'not_found') return res.status(200).json({ ...base, found: false });
    const u = out.user;
    if (out.outcome !== 'found' || !u || !UUID.test(String(u.id)) || typeof u.emailVerified !== 'boolean'
        || !isState(out.state) || !Array.isArray(out.history)) return fail(res, 502, 'SOURCE_ERROR');
    return res.status(200).json({
      ...base, found: true,
      user: { id: u.id, email: u.email, registeredAt: u.registeredAt, emailVerified: u.emailVerified },
      state: out.state, history: out.history,
    });
  }

  const replay = out.outcome === 'replay';
  const result = replay ? out.result : out.outcome;
  if ((result !== 'applied' && result !== 'rejected') || !isState(out.state)) return fail(res, 502, 'SOURCE_ERROR');
  return res.status(200).json({
    ...base, result, code: out.code ?? null, replay,
    at: new Date(out.at || Date.now()).toISOString(), state: out.state,
  });
}
