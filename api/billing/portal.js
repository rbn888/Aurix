// POST /api/billing/portal
// ============================================================================
// AURIX-MONETIZATION-M04 · where a paying customer manages or CANCELS.
// ----------------------------------------------------------------------------
// Opens Stripe's own billing portal for the authenticated user's customer. This
// endpoint exists because a subscription a user cannot cancel by themselves is
// not an acceptable product, and because cancellation must travel the SAME road
// as everything else: the portal changes the subscription at Stripe, Stripe
// calls the webhook, the webhook writes `subscriptions`, and `aurix_entitlements`
// converges. Nothing here writes commercial state.
//
// It refuses when the user has no customer mapping — there is nothing to manage,
// and creating one here would let a Free user open a portal for a subscription
// that does not exist.
//
// Required env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || 'sb_publishable_wlZsjnPGXay9jsRqcXA08Q_bVhmI7sU';
const APP_ORIGIN   = 'https://app.aurixsystem.io';
const ALLOWED_ORIGINS = (process.env.BILLING_ALLOWED_ORIGINS ||
  [APP_ORIGIN, 'https://rbn888.github.io'].join(','))
  .split(',').map(s => s.trim()).filter(Boolean);
const PROVIDER = 'stripe';

function isAllowedOrigin(o) {
  return !!o && (ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o));
}

export default async function handler(req, res) {
  const origin = (req.headers && req.headers.origin) || '';
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!isAllowedOrigin(origin)) return res.status(403).json({ ok: false, error: 'forbidden_origin' });

  const STRIPE_KEY  = process.env.STRIPE_SECRET_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!STRIPE_KEY || !SERVICE_KEY) return res.status(503).json({ ok: false, error: 'billing_unconfigured' });

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

  // The customer is resolved from OUR mapping for THIS user. A body cannot name
  // a customer, so a user cannot open someone else's billing portal.
  let customerId = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/billing_customers` +
      `?provider=eq.${PROVIDER}&user_id=eq.${user.id}&select=provider_customer_id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (r.ok) { const rows = await r.json().catch(() => []); customerId = (rows[0] || {}).provider_customer_id || null; }
  } catch (_) { customerId = null; }
  if (!customerId) return res.status(404).json({ ok: false, error: 'no_customer' });

  try {
    const body = new URLSearchParams();
    body.append('customer', customerId);
    body.append('return_url', `${APP_ORIGIN}/`);
    const locale = ((req.body && String(req.body.locale)) === 'es') ? 'es' : 'en';
    body.append('locale', locale);
    const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const s = await r.json().catch(() => null);
    if (!r.ok || !s || !s.url) {
      console.error('[billing/portal] session failed', r.status, (s && s.error && s.error.code) || '');
      return res.status(502).json({ ok: false, error: 'provider_error' });
    }
    return res.status(200).json({ ok: true, url: s.url });
  } catch (e) {
    console.error('[billing/portal] error', (e && e.message) || e);
    return res.status(502).json({ ok: false, error: 'provider_error' });
  }
}
