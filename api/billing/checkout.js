// POST /api/billing/checkout
// ============================================================================
// AURIX-MONETIZATION-M04 · the ONLY way a browser can start a real purchase.
// ----------------------------------------------------------------------------
// What this endpoint may do:  create/reuse the provider customer for the
//                             AUTHENTICATED user and open a Checkout Session.
// What it may never do:       state the outcome of a purchase. It writes nothing
//                             into `subscriptions` and it grants no entitlement.
//                             Premium appears only after Stripe calls the
//                             webhook, which is the only writer.
//
// Everything commercial is read from the DATABASE, never from the request:
//   · the USER comes from the Supabase access token, verified against
//     /auth/v1/user. The body cannot name a user.
//   · the PRICE comes from public.billing_prices for the requested interval.
//     The body cannot name a price, an amount or a currency — the worst a
//     tampered request can do is ask for 'month' instead of 'year'.
//   · the TRIAL comes from billing_prices.trial_days (0 = off). A trial is a
//     commercial decision and turning it on must not need a deploy.
//
// Zero dependencies, like every other function here: plain fetch against the
// Stripe REST API (form-encoded) and the Supabase REST API.
//
// Required env (Vercel):  STRIPE_SECRET_KEY, SUPABASE_URL,
//                         SUPABASE_SERVICE_ROLE_KEY
// Optional env:           SUPABASE_ANON_KEY, BILLING_ALLOWED_ORIGINS,
//                         BILLING_SUCCESS_URL, BILLING_CANCEL_URL
// Until STRIPE_SECRET_KEY exists this endpoint answers 503 `billing_unconfigured`
// and the paywall stays honest instead of half-working.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || 'sb_publishable_wlZsjnPGXay9jsRqcXA08Q_bVhmI7sU';
const APP_ORIGIN   = 'https://app.aurixsystem.io';

const ALLOWED_ORIGINS = (process.env.BILLING_ALLOWED_ORIGINS ||
  [APP_ORIGIN, 'https://rbn888.github.io'].join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

const PROVIDER = 'stripe';
const PLAN     = 'premium';
// Se fija la versión de API de NUESTRAS llamadas. La del payload del webhook la
// fija el endpoint en el dashboard y no se puede imponer desde aquí, por eso el
// webhook lee el periodo de las dos formas posibles (ver su cabecera).
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2024-06-20';
const INTERVALS = ['month', 'year'];

function isAllowedOrigin(o) {
  return !!o && (ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o));
}
function corsOrigin(req) {
  const o = (req && req.headers && req.headers.origin) || '';
  return isAllowedOrigin(o) ? o : ALLOWED_ORIGINS[0];
}
// Stripe's API is form-encoded, including nested keys (a[b][c]=v).
function form(obj, prefix, out) {
  const p = new URLSearchParams(out || '');
  const walk = (o, pre) => {
    Object.keys(o).forEach(k => {
      const v = o[k];
      if (v === undefined || v === null) return;
      const key = pre ? `${pre}[${k}]` : k;
      if (typeof v === 'object' && !Array.isArray(v)) walk(v, key);
      else if (Array.isArray(v)) v.forEach((it, i) => {
        if (typeof it === 'object') walk(it, `${key}[${i}]`);
        else p.append(`${key}[${i}]`, String(it));
      });
      else p.append(key, String(v));
    });
  };
  walk(obj, prefix || '');
  return p.toString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const origin = (req.headers && req.headers.origin) || '';
  if (!isAllowedOrigin(origin)) return res.status(403).json({ ok: false, error: 'forbidden_origin' });

  const STRIPE_KEY  = process.env.STRIPE_SECRET_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // FAIL CLOSED AND SAY SO. A missing secret must not degrade into a broken
  // checkout that looks like a payment problem.
  if (!STRIPE_KEY || !SERVICE_KEY) {
    return res.status(503).json({ ok: false, error: 'billing_unconfigured' });
  }

  // ── 1 · WHO. The token decides; the body never does. ──────────────────────
  const auth = (req.headers && req.headers.authorization) || '';
  const token = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token || token.length < 20) return res.status(401).json({ ok: false, error: 'unauthenticated' });

  let user = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) user = await r.json().catch(() => null);
  } catch (_) { user = null; }
  if (!user || !user.id) return res.status(401).json({ ok: false, error: 'unauthenticated' });

  const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};
  const interval = INTERVALS.includes(String(body.interval)) ? String(body.interval) : 'year';

  const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(opts.headers || {}),
    },
  });

  // ── 2 · WHAT. The price of record, from the catalogue. ────────────────────
  let price = null;
  try {
    const r = await sb(`/billing_prices?provider=eq.${PROVIDER}&plan=eq.${PLAN}` +
      `&billing_interval=eq.${interval}&active=is.true` +
      `&select=provider_price_id,amount_cents,currency,trial_days,billing_interval`);
    if (r.ok) { const rows = await r.json().catch(() => []); price = Array.isArray(rows) ? rows[0] : null; }
  } catch (_) { price = null; }
  // No mapped price ⇒ nothing to sell. This is the state before the founder
  // creates the Stripe products, and it must not become a broken session.
  if (!price || !price.provider_price_id) {
    return res.status(503).json({ ok: false, error: 'price_unavailable' });
  }

  const stripe = (path, payload, idem) => fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Versión FIJADA: la forma de las respuestas que consumimos no puede cambiar
      // bajo nuestros pies cuando Stripe actualice el default de la cuenta.
      'Stripe-Version': STRIPE_API_VERSION,
      ...(idem ? { 'Idempotency-Key': idem } : {}),
    },
    body: form(payload),
  });
  const stripeGet = (path) => fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Stripe-Version': STRIPE_API_VERSION },
  });

  // ── 3 · CUSTOMER. Reuse before create, and link server-side. ─────────────
  let customerId = null;
  try {
    const r = await sb(`/billing_customers?provider=eq.${PROVIDER}&user_id=eq.${user.id}` +
      `&select=provider_customer_id`);
    if (r.ok) { const rows = await r.json().catch(() => []); customerId = (rows[0] || {}).provider_customer_id || null; }
  } catch (_) { customerId = null; }

  if (!customerId) {
    try {
      // The idempotency key is derived from the user, so a double click cannot
      // create two customers (and therefore cannot create two subscriptions).
      const r = await stripe('/customers', {
        email: user.email || undefined,
        metadata: { aurix_user_id: user.id },
      }, `aurix_cust_${user.id}`);
      const c = await r.json().catch(() => null);
      if (!r.ok || !c || !c.id) {
        console.error('[billing/checkout] customer create failed', r.status);
        return res.status(502).json({ ok: false, error: 'provider_error' });
      }
      customerId = c.id;
    } catch (e) {
      console.error('[billing/checkout] customer error', (e && e.message) || e);
      return res.status(502).json({ ok: false, error: 'provider_error' });
    }
    // Linking is a DB decision: it refuses to re-point a customer that already
    // belongs to another user instead of silently overwriting the mapping.
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/aurix_billing_link_customer`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: user.id, p_provider: PROVIDER, p_customer_id: customerId }),
      });
      if (!r.ok) {
        console.error('[billing/checkout] link failed', r.status);
        return res.status(409).json({ ok: false, error: 'customer_conflict' });
      }
    } catch (e) {
      console.error('[billing/checkout] link error', (e && e.message) || e);
      return res.status(502).json({ ok: false, error: 'link_failed' });
    }
  }

  // ── 3b · UNA SUSCRIPCIÓN, NO DOS. El guard contra el doble cargo. ────────
  // Un customer de Stripe admite N suscripciones, y `subscriptions` es UNA FILA
  // POR USUARIO: si el usuario acaba con dos vivas, la segunda no "gana", sino que
  // el estado depende de qué evento llegó último. El caso real es incómodo y
  // probable: paga, el webhook tarda unos segundos, la app todavía dice Free, el
  // usuario vuelve al paywall y paga OTRA VEZ. Y después, al cancelar la
  // duplicada, el `deleted` de esa le quitaba el acceso que sí está pagando.
  //
  // Se comprueban las DOS fuentes, y en este orden:
  //   · nuestra propia fila (rápido, y ya cubre el caso normal);
  //   · el proveedor (imprescindible: es la que ve la suscripción que acaba de
  //     crearse y cuyo webhook aún no ha llegado — exactamente la carrera).
  // Si ya hay una viva se responde 409 `already_subscribed`, y el cliente manda al
  // portal en vez de crear otra sesión.
  // `incomplete` NO entra en esta lista, y es una exclusión deliberada: significa
  // que la suscripción se creó pero el primer pago NUNCA se cobró (típicamente un
  // 3DS abandonado o fallido, el modo de fallo más común de un checkout en EUR).
  // Bloquear ahí no evita ningún doble cargo —no hubo cargo— y en cambio dejaba al
  // usuario en un callejón sin salida: el paywall le ofrecía comprar, el checkout
  // le respondía 409, y el portal tampoco estaba disponible porque su fila queda en
  // plan free. Hasta que Stripe expira el `incomplete` (~23 h). Reintentar es
  // exactamente lo que debe poder hacer.
  const liveStatuses = ['active', 'trialing', 'past_due', 'unpaid'];
  try {
    const r = await sb(`/subscriptions?user_id=eq.${user.id}&select=plan,status`);
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.plan === 'premium' && ['active', 'trialing'].includes(row.status)) {
        return res.status(409).json({ ok: false, error: 'already_subscribed' });
      }
    }
  } catch (_) { /* la comprobación del proveedor, abajo, es la que manda */ }
  try {
    const r = await stripeGet(`/subscriptions?customer=${encodeURIComponent(customerId)}&limit=10`);
    const j = await r.json().catch(() => null);
    if (r.ok && j && Array.isArray(j.data) &&
        j.data.some(su => su && liveStatuses.includes(String(su.status)))) {
      return res.status(409).json({ ok: false, error: 'already_subscribed' });
    }
    if (!r.ok) {
      // FAIL CLOSED: si no se puede comprobar, no se abre una segunda sesión de
      // pago. Es preferible un "inténtalo de nuevo" a un doble cargo.
      console.error('[billing/checkout] subscription check failed', r.status);
      return res.status(503).json({ ok: false, error: 'check_failed' });
    }
  } catch (e) {
    console.error('[billing/checkout] subscription check error', (e && e.message) || e);
    return res.status(503).json({ ok: false, error: 'check_failed' });
  }

  // ── 4 · SESSION. The success URL proves nothing and is treated as such. ──
  const successUrl = (process.env.BILLING_SUCCESS_URL || `${APP_ORIGIN}/?billing=success`);
  const cancelUrl  = (process.env.BILLING_CANCEL_URL  || `${APP_ORIGIN}/?billing=cancelled`);
  const trialDays  = Number(price.trial_days) > 0 ? Math.floor(Number(price.trial_days)) : 0;

  try {
    const payload = {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: price.provider_price_id, quantity: 1 }],
      // The webhook resolves the user from the customer mapping; this metadata is
      // for human forensics in the Stripe dashboard, not for authorisation.
      subscription_data: Object.assign(
        { metadata: { aurix_user_id: user.id } },
        trialDays ? { trial_period_days: trialDays } : {}
      ),
      // No coupons, no promotion codes: there is no discount product, and an open
      // promo field is a way to be charged an amount this catalogue never declared.
      allow_promotion_codes: false,
      locale: (String(body.locale) === 'es') ? 'es' : 'en',
    };
    const r = await stripe('/checkout/sessions', payload);
    const s = await r.json().catch(() => null);
    if (!r.ok || !s || !s.url) {
      console.error('[billing/checkout] session failed', r.status, (s && s.error && s.error.code) || '');
      return res.status(502).json({ ok: false, error: 'provider_error' });
    }
    // Only the redirect URL leaves this function. No keys, no customer id, no
    // price object: the client has no use for them and every one of them is a leak.
    return res.status(200).json({ ok: true, url: s.url });
  } catch (e) {
    console.error('[billing/checkout] session error', (e && e.message) || e);
    return res.status(502).json({ ok: false, error: 'provider_error' });
  }
}
