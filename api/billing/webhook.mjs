// POST /api/billing/webhook   ·  Stripe → Aurix  (server authority)
// ============================================================================
// AURIX-MONETIZATION-M04 · the ONLY path by which Premium can be granted.
// ----------------------------------------------------------------------------
// This endpoint verifies that a request really came from Stripe, EXTRACTS the
// facts of the event, and hands them to `public.aurix_billing_apply_event()`.
// It decides nothing: not the user, not the plan, not the price, not the
// currency, not whether the event is new. Every one of those is decided in SQL,
// from Aurix's own tables, inside one transaction. This function's whole job is
// authenticity + extraction, which is why it can be read in one sitting.
//
// ── POR QUÉ FALLÓ EL PRIMER DEPLOYMENT DE M.04 (y no fue esto) ───────────────
// La causa real, confirmada en el Deploy Log: el CUPO DE FUNCIONES del plan. Vercel
// admite 12 Serverless Functions por deployment en Hobby. `api/` tenía EXACTAMENTE
// 12; M.04 añadió checkout y portal → 14, y el deployment se rechazó entero. Ese
// límite se valida en SERVIDOR: `vercel build` en local pasa con "status: ok", así
// que el fallo es invisible en una reproducción local y el warning de ESM→CommonJS
// del log no tiene nada que ver (aparece igual en los deployments que sí están
// READY). Cómo se cerró: la directiva del proyecto es MANTENER HOBBY / coste cero,
// así que no se sube de plan — se baja el conteo. `api/debug/health.js` (diagnóstico
// puro, cero consumidores) pasa a `_health.js`, y `checkout` + `portal` comparten
// una sola función, `api/billing/[op].js`, conservando sus dos rutas públicas.
// Cuenta final: 12 Serverless + 1 Edge (este fichero).
// CONSECUENCIA VIVA: `api/` está EN el tope. Añadir un fichero que no empiece por
// `_` rompe el deployment ENTERO, no sólo esa ruta. Fijado por gate (J.6).
//
// ── POR QUÉ ESTE FICHERO ES `.mjs` Y NO `.js` ────────────────────────────────
// Se mantiene, pero por su propio motivo, no por el deployment de arriba.
// `package.json` no declara `"type": "module"`, así que Vercel trata cualquier `.js`
// de `api/` como CommonJS: detecta la sintaxis ESM y lo transpila con Babel
// ("Warning: Node.js functions are compiled from ESM to CommonJS"). Ese transform se
// aplica TAMBIÉN a una función Edge —`babelCompileEnabled = !isEdgeFunction ||
// VERCEL_EDGE_NO_BABEL !== '1'`, o sea true por defecto—, y el runtime Edge sólo
// ejecuta ESM: no existen `exports` ni `require`. Con `.js` la build emite una
// EdgeFunction transpilada a CommonJS; con `.mjs` no hay ambigüedad ni transform:
//   webhook.js  → EdgeFunction + "Compiling webhook.js from ESM to CommonJS…"
//   webhook.mjs → EdgeFunction, sin transform, un solo fichero ESM de salida
// La ruta pública NO cambia: sigue siendo /api/billing/webhook. La alternativa
// —añadir `"type": "module"`— arregla lo mismo pero convierte de golpe las otras 16
// funciones del proyecto: más radio de impacto por el mismo beneficio.
//
// NO LO RENOMBRES A `.js`. Hay un assert que lo fija (gate de billing, sección J).
//
// ── WHY THE EDGE RUNTIME ─────────────────────────────────────────────────────
// Stripe signs the EXACT RAW BYTES of the body. The Node runtime here parses
// JSON before the handler runs, and re-serialising a parsed object produces
// different bytes (key order, spacing, unicode escapes), so the signature would
// fail — or, far worse, someone would "fix" it by skipping verification. The Edge
// runtime hands over the untouched body via `await request.text()`, and its Web
// Crypto gives HMAC-SHA256 without a dependency. That is the entire reason this
// one function is Edge while the rest of api/ is Node.
//
// ── WHAT IS NOT TRUSTED ──────────────────────────────────────────────────────
// The success URL, any query param, the client, the customer's email, the
// `subscription_data.metadata.aurix_user_id` we ourselves attached (it is
// forensics for the dashboard, not authorisation), and the payload's own idea of
// what the plan or amount is. Ownership is resolved from `billing_customers`;
// plan/interval/amount/currency from `billing_prices`.
//
// Required env (Vercel):  STRIPE_WEBHOOK_SECRET, SUPABASE_URL,
//                         SUPABASE_SERVICE_ROLE_KEY
// Used if present:        STRIPE_SECRET_KEY (test-mode gate; and, for
//                         `invoice.paid` in the basil shape, a read-only lookup
//                         of the invoice's payment intent)
//
// Stripe treats a non-2xx as "retry later", which is what we want for a
// transient failure and NOT what we want for an event we have deliberately
// refused: a refusal is final and is answered 200 with its outcome recorded in
// `billing_events`, so Stripe stops retrying something that will never apply.

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
const PROVIDER = 'stripe';
// Stripe's own recommendation. Beyond this a captured request is a replay, and a
// captured request IS a valid signature — the timestamp is the only thing that
// makes it stale.
const TOLERANCE_SEC = 300;
// Only these change commercial state (plus the payment EVIDENCE set below, which
// changes none). Everything else is recorded and ignored:
// `checkout.session.completed` in particular grants NOTHING here — it can arrive
// without period bounds, and B1's premium_bound constraint exists precisely
// because such a row is byte-identical to a lifetime purchase.
const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);
// AURIX-AFFILIATES-V1 · EVIDENCIA DE COBRO. Estos cinco NO cambian el acceso: van
// a OTRO escritor (`aurix_billing_record_payment_event`, db/billing_payments_1.sql)
// que sólo REGISTRA lo cobrado, reembolsado o disputado para que Founder Platform
// calcule comisiones sobre dinero real. Misma firma, misma puerta de modo TEST y
// mismo ledger de idempotencia que las suscripciones.
const PAYMENT_EVENTS = new Set([
  'invoice.paid',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
]);
const HANDLED = new Set([...SUBSCRIPTION_EVENTS, ...PAYMENT_EVENTS]);

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function hex(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
// Constant-time compare. A length-sensitive early return on a signature is a
// (small, real) oracle; this is cheap enough to just do properly.
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function hmacHex(secret, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}
// `t=...,v1=...,v1=...` — several v1 values are legal during a secret rotation,
// so ALL of them are compared and any match is enough.
function parseSigHeader(h) {
  const out = { t: null, v1: [] };
  String(h || '').split(',').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') out.t = parseInt(v, 10);
    else if (k === 'v1') out.v1.push(v);
  });
  return out;
}
const iso = (sec) => (Number.isFinite(sec) && sec > 0) ? new Date(sec * 1000).toISOString() : null;
// ── DÓNDE VIVE EL PERIODO, y por qué se leen DOS SITIOS ─────────────────────
// Hasta la versión de API `2025-04-30.basil` el periodo vigente estaba en el
// objeto `subscription` (`current_period_start/end`). A partir de ahí Stripe lo
// movió a CADA ITEM (`items.data[].current_period_*`) y lo quitó del objeto. La
// versión que gobierna el payload de un webhook la fija el ENDPOINT en el
// dashboard, no una cabecera que podamos enviar desde aquí, así que no se puede
// asumir ninguna de las dos formas: se lee la del objeto y, si no está, la del
// primer item. Si faltara en las dos, el escritor lo rechaza con
// `missing_period` y queda REINTENTABLE — no se escribe un premium sin fecha de
// fin, que es el fail-open que el CHECK de B1 existe para impedir.
function periodOf(o, item, key) {
  const direct = o ? o[key] : null;
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromItem = item ? item[key] : null;
  return (Number.isFinite(fromItem) && fromItem > 0) ? fromItem : null;
}
// Un error de PostgREST puede traer `DETAIL: Failing row contains (…)` con el
// user_id y los identificadores del proveedor, que B1 declara que NUNCA salen al
// exterior. Los logs de Vercel son "exterior" a efectos de esa clasificación.
function safeDetail(txt) {
  return String(txt || '').split(/DETAIL|CONTEXT|Failing row/i)[0].slice(0, 200);
}

// ── EVIDENCIA DE COBRO: extracción de las DOS formas del payload ────────────
// La versión de API del endpoint no la controlamos (ver "DÓNDE VIVE EL
// PERIODO"). Desde `2025-03-31.basil` Stripe QUITÓ `invoice.payment_intent`,
// `invoice.charge` y `charge.invoice`; movió la suscripción de la factura a
// `parent.subscription_details.subscription` y el precio de cada línea a
// `lines.data[].pricing.price_details.price`. Se leen las dos formas.
const idOf = (v) => (typeof v === 'string' && v) ? v
  : (v && typeof v === 'object' && typeof v.id === 'string' && v.id) ? v.id : null;
const intOf = (v) => (Number.isInteger(v) && v >= 0) ? v : null;

function invoiceLinePrice(inv) {
  const lines = (inv && inv.lines && Array.isArray(inv.lines.data)) ? inv.lines.data : [];
  const priceOf = (l) => idOf(l && l.price)
    || idOf(l && l.pricing && l.pricing.price_details && l.pricing.price_details.price);
  // La línea de la suscripción (no un prorrateo) es la que dice QUÉ se compró.
  const isSub = (l) => l && (l.type === 'subscription'
    || (l.parent && l.parent.type === 'subscription_item_details'));
  const pick = lines.find(l => isSub(l) && !l.proration && priceOf(l))
    || lines.find(l => isSub(l) && priceOf(l))
    || lines.find(l => priceOf(l));
  return pick ? priceOf(pick) : null;
}

// Forma `basil`: la factura ya no trae su payment intent. Se pide a Stripe
// (`GET /v1/invoice_payments?invoice=…`, sólo lectura, sin SDK) y se toma el del
// pago `paid`. Sin clave o sin respuesta ⇒ null, y el escritor lo registra como
// `missing_link` (el webhook contesta 500 y Stripe reintenta): perder el enlace
// en silencio dejaría un reembolso futuro imposible de descontar.
async function paymentIntentFromInvoicePayments(invoiceId, stripeKey) {
  if (!invoiceId || !stripeKey) return null;
  try {
    const r = await fetch('https://api.stripe.com/v1/invoice_payments?invoice='
      + encodeURIComponent(invoiceId) + '&limit=10', {
      method: 'GET',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2025-03-31.basil' },
    });
    if (!r || !r.ok) return null;
    const body = await r.json().catch(() => null);
    const list = (body && Array.isArray(body.data)) ? body.data : [];
    const paid = list.find(p => p && p.status === 'paid' && p.payment && idOf(p.payment.payment_intent));
    return paid ? idOf(paid.payment.payment_intent) : null;
  } catch (_) {
    return null;
  }
}

async function recordPaymentEvent(event, rpc, stripeKey) {
  const o = (event.data && event.data.object) || {};
  const base = {
    p_provider: PROVIDER,
    p_event_id: String(event.id),
    p_event_type: String(event.type).slice(0, 120),
    p_event_at: iso(event.created) || new Date().toISOString(),
    p_livemode: event.livemode === true,
    p_customer_id: idOf(o.customer),
    p_invoice_id: null, p_subscription_id: null, p_payment_intent_id: null,
    p_charge_id: null, p_price_id: null, p_amount: null,
    p_currency: (typeof o.currency === 'string') ? o.currency : null,
    p_billing_reason: null, p_paid_at: null, p_dispute_id: null, p_status: null,
  };

  if (event.type === 'invoice.paid') {
    const paid = intOf(o.amount_paid);
    let pi = idOf(o.payment_intent);                                   // forma antigua
    if (!pi && paid > 0) pi = await paymentIntentFromInvoicePayments(idOf(o.id), stripeKey);
    Object.assign(base, {
      p_invoice_id: idOf(o.id),
      p_subscription_id: idOf(o.subscription)                          // forma antigua
        || idOf(o.parent && o.parent.subscription_details
                && o.parent.subscription_details.subscription),      // forma basil
      p_payment_intent_id: pi,
      p_price_id: invoiceLinePrice(o),
      p_amount: paid,
      p_billing_reason: (typeof o.billing_reason === 'string') ? o.billing_reason.slice(0, 60) : null,
      p_paid_at: iso(o.status_transitions && o.status_transitions.paid_at),
    });
  } else if (event.type === 'charge.refunded') {
    // `amount_refunded` es ACUMULADO: el escritor se queda con el máximo.
    Object.assign(base, {
      p_payment_intent_id: idOf(o.payment_intent),
      p_charge_id: idOf(o.id),
      p_amount: intOf(o.amount_refunded),
    });
  } else {
    // charge.dispute.*: el objeto es la disputa.
    Object.assign(base, {
      p_dispute_id: idOf(o.id),
      p_payment_intent_id: idOf(o.payment_intent),
      p_charge_id: idOf(o.charge),
      p_amount: intOf(o.amount),
      p_status: (typeof o.status === 'string') ? o.status.slice(0, 60) : null,
    });
  }

  try {
    const r = await rpc('aurix_billing_record_payment_event', base);
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[billing/webhook] record failed', r.status, safeDetail(detail));
      return json({ ok: false, error: 'record_failed' }, 500);
    }
    const out = await r.json().catch(() => null);
    const outcome = (out && out.outcome) || 'recorded';
    // Cobro sin payment intent: la fila está guardada, el enlace no. 500 a
    // propósito para que Stripe reintente y el reintento lo complete.
    if (outcome === 'missing_link') return json({ ok: false, outcome }, 500);
    return json({ ok: true, outcome });
  } catch (e) {
    console.error('[billing/webhook] record error', (e && e.message) || e);
    return json({ ok: false, error: 'record_failed' }, 500);
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  // `.trim()` NO es cosmético aquí: el secreto es la CLAVE del HMAC, así que un
  // espacio o un salto de línea arrastrado al pegarlo en el panel produce una
  // firma distinta y TODAS las entregas de Stripe caen en `bad_signature` — un
  // 400 indistinguible de un secreto equivocado, que es el modo de fallo más
  // caro de diagnosticar que tiene este endpoint.
  const SECRET      = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Unconfigured ⇒ 503, never "accepted". An endpoint that answers 200 without
  // verifying anything is an open grant path.
  if (!SECRET || !SERVICE_KEY) return json({ ok: false, error: 'billing_unconfigured' }, 503);

  const raw = await request.text();
  if (!raw || raw.length > 512 * 1024) return json({ ok: false, error: 'invalid_payload' }, 400);

  // ── 1 · AUTHENTICITY ──────────────────────────────────────────────────────
  const sig = parseSigHeader(request.headers.get('stripe-signature'));
  if (!sig.t || !sig.v1.length) return json({ ok: false, error: 'bad_signature' }, 400);

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - sig.t) > TOLERANCE_SEC) {
    // Replay of a genuinely signed request. 400, and deliberately no ledger row:
    // an unauthenticated caller must not be able to write into our tables.
    return json({ ok: false, error: 'stale_signature' }, 400);
  }
  let expected = '';
  try { expected = await hmacHex(SECRET, `${sig.t}.${raw}`); }
  catch (_) { return json({ ok: false, error: 'verify_failed' }, 500); }
  if (!sig.v1.some(v => safeEqual(v, expected))) {
    return json({ ok: false, error: 'bad_signature' }, 400);
  }

  // ── 2 · EXTRACTION (no decisions) ─────────────────────────────────────────
  let event = null;
  try { event = JSON.parse(raw); } catch (_) { event = null; }
  if (!event || typeof event !== 'object' || !event.id || !event.type) {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }

  const rpc = (fn, payload) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!HANDLED.has(event.type)) {
    // Recorded, not applied. `apply_event` itself keeps the ledger row so the
    // idempotency key is written exactly once, by one writer.
    try {
      await rpc('aurix_billing_apply_event', {
        p_provider: PROVIDER, p_event_id: event.id, p_event_type: String(event.type).slice(0, 120),
        p_customer_id: null, p_subscription_id: null, p_price_id: null,
        p_status: 'ignored', p_current_period_start: null, p_current_period_end: null,
        p_cancel_at_period_end: false, p_trial_start: null, p_trial_end: null,
        p_canceled_at: null, p_event_at: iso(event.created) || new Date().toISOString(),
      });
    } catch (_) {}
    return json({ ok: true, outcome: 'ignored_type' });
  }

  // ── MODO. Un evento de TEST no concede Premium real ─────────────────────
  // La firma sólo prueba autenticidad, no modo: si el endpoint de test apuntara a
  // esta URL (o el secreto de test conviviera con la clave live), una suscripción
  // de prueba entitlearía una cuenta real. Se permite explícitamente durante la
  // compra de prueba del founder con `BILLING_ALLOW_TEST_EVENTS=1`, y se quita.
  // Misma normalización que el secreto, y por la misma razón: este valor también
  // se teclea en el panel de la plataforma, y un ' 1' silencioso convertiría toda
  // la certificación TEST en `ignored_testmode` sin dejar rastro en la BD.
  //
  // Y la autorización SÓLO vale en un deployment de TEST. La variable es temporal
  // por diseño, pero "temporal" dependía de que alguien se acordara de borrarla
  // antes del cutover; si no, un evento de prueba concedería Premium real. Ahora
  // el permiso se ANULA en cuanto la clave de Stripe configurada es de LIVE, así
  // que olvidarla deja de ser un agujero: pasa a no tener efecto. Sin clave
  // configurada también se anula — fail-closed.
  const _stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const _testDeployment = /^(sk|rk)_test_/.test(_stripeKey);
  const _allowTestEvents = _testDeployment &&
    String(process.env.BILLING_ALLOW_TEST_EVENTS || '').trim() === '1';
  if (event.livemode === false && !_allowTestEvents) {
    return json({ ok: true, outcome: 'ignored_testmode' });
  }

  if (PAYMENT_EVENTS.has(event.type)) {
    return recordPaymentEvent(event, rpc, _stripeKey);
  }

  const o = (event.data && event.data.object) || {};
  const item = (o.items && Array.isArray(o.items.data) && o.items.data[0]) || null;
  const priceId = (item && item.price && item.price.id) || null;
  const customerId = (typeof o.customer === 'string') ? o.customer
    : (o.customer && o.customer.id) || null;
  // A deletion is a cancellation whatever the object says.
  const status = (event.type === 'customer.subscription.deleted') ? 'canceled' : (o.status || null);

  const payload = {
    p_provider: PROVIDER,
    p_event_id: String(event.id),
    p_event_type: String(event.type).slice(0, 120),
    p_customer_id: customerId,
    p_subscription_id: (typeof o.id === 'string') ? o.id : null,
    p_price_id: priceId,
    p_status: status,
    p_current_period_start: iso(periodOf(o, item, 'current_period_start')),
    p_current_period_end: iso(periodOf(o, item, 'current_period_end')),
    p_cancel_at_period_end: !!o.cancel_at_period_end,
    p_trial_start: iso(o.trial_start),
    p_trial_end: iso(o.trial_end),
    p_canceled_at: iso(o.canceled_at),
    p_event_at: iso(event.created) || new Date().toISOString(),
  };

  // ── 3 · APPLY (the database decides) ─────────────────────────────────────
  try {
    const r = await rpc('aurix_billing_apply_event', payload);
    if (!r.ok) {
      // Transient/DB failure ⇒ 500 so Stripe retries. The ledger row was rolled
      // back with the transaction, so the retry is not a duplicate.
      const detail = await r.text().catch(() => '');
      console.error('[billing/webhook] apply failed', r.status, safeDetail(detail));
      return json({ ok: false, error: 'apply_failed' }, 500);
    }
    const out = await r.json().catch(() => null);
    const outcome = (out && out.outcome) || 'applied';
    // A REFUSAL is final: 200, so Stripe stops retrying an event that can never
    // apply (an unmapped price, an unknown customer). The reason is in the ledger.
    return json({ ok: true, outcome });
  } catch (e) {
    console.error('[billing/webhook] apply error', (e && e.message) || e);
    return json({ ok: false, error: 'apply_failed' }, 500);
  }
}
