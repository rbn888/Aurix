// POST /api/billing/status
// ============================================================================
// AURIX-BILLING-LIVE · el único modo de comprobar la configuración de cobro
// SIN secretos, SIN abrir una sesión de pago y SIN cobrar un céntimo.
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Antes de este endpoint, responder «¿está Stripe en LIVE?» sólo
// se podía hacer mirando dos paneles a ojo, y la pregunta que de verdad importa
// no es «¿hay clave?» sino «¿la clave, los precios, el webhook y el portal son
// del MISMO entorno, y los importes son los aprobados?». Un `price_id` de TEST
// con una clave LIVE no falla al configurarlo: falla cuando un cliente pulsa
// comprar. Esto lo dice antes.
//
// LO QUE JAMÁS SALE DE AQUÍ: la secret key, el signing secret, cualquier valor
// de entorno. Sólo se publica su MODO (derivado del prefijo `sk_test_`/`sk_live_`)
// y booleanos de presencia. No hay ninguna ruta por la que un secreto llegue al
// cuerpo de la respuesta.
//
// LO QUE ESTE ENDPOINT NO HACE: no escribe en Stripe, no escribe en la base de
// datos, no crea sesiones, no concede ni retira un derecho. Son cuatro GET de
// sólo lectura contra el proveedor y una lectura del catálogo propio.
//
// QUIÉN PUEDE LLAMARLO. Sólo una cuenta con `workspace.catalog_preview`, que es
// la clave que NINGÚN plan concede —sólo llega por override explícito— y que el
// producto ya usa como marca de «cuenta del fundador». Se resuelve con el MISMO
// resolver server-side que gobierna el resto (`aurix_entitlements`, ejecutado con
// el token del usuario), no con una allowlist de email compilada en el bundle.
//
// SIN FUNCIÓN NUEVA. El prefijo `_` impide que Vercel le cree función propia:
// entra por `api/billing/[op].js`, que ya existe. `api/` está EN el tope de Hobby
// (12 Serverless + 1 Edge) y un fichero sin `_` rompe el deployment entero.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ozcasyufbknnuemllwso.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || 'sb_publishable_wlZsjnPGXay9jsRqcXA08Q_bVhmI7sU';
const APP_ORIGIN   = 'https://app.aurixsystem.io';
const ALLOWED_ORIGINS = (process.env.BILLING_ALLOWED_ORIGINS || APP_ORIGIN)
  .split(',').map(s => s.trim()).filter(Boolean);

const PROVIDER = 'stripe';
const PLAN     = 'premium';
// ── DÓNDE VIVE DE VERDAD EL WEBHOOK ────────────────────────────────────────
// `APP_ORIGIN` es el dominio de la APP (GitHub Pages: ficheros estáticos). El
// webhook es una FUNCIÓN, y las funciones las sirve Vercel. Son dos orígenes
// distintos y confundirlos costó una compra real: Stripe entregaba en
// `app.aurixsystem.io/api/billing/webhook`, que responde 405 porque allí no hay
// función ninguna, y el usuario pagó y se quedó en Free.
const API_ORIGIN = String(process.env.BILLING_API_ORIGIN || 'https://isa-portfolio-ten.vercel.app')
  .trim().replace(/\/+$/, '');
const EXPECTED_WEBHOOK_URL = API_ORIGIN + '/api/billing/webhook';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2024-06-20';

// ── LOS PRECIOS APROBADOS, ESCRITOS AQUÍ A PROPÓSITO ────────────────────────
// Si este endpoint se limitara a repetir lo que dice la base de datos, no sería
// una comprobación: sería un espejo. La decisión comercial del founder es 7,99 €
// al mes y 69,99 € al año, así que se declara y se CONTRASTA. Cambiar el precio
// exige cambiar esta línea, que es justo la fricción que debe tener.
// PRECIO ANUAL ACTUALIZADO (2026-09-23): 59,99 € → 69,99 €. Mientras la BD siga
// con el importe anterior, este endpoint devolverá `amount_not_approved:year` y
// `ready_for_live:false` — que es exactamente lo que debe hacer hasta que el
// corte LIVE se ejecute.
const APPROVED = Object.freeze({
  year:  { amount_cents: 6999, currency: 'eur' },
  month: { amount_cents: 799,  currency: 'eur' },
});
// Anual primero, igual que el paywall.
const INTERVALS = ['year', 'month'];
// La clave que marca la cuenta del fundador. Ningún plan la concede.
const FOUNDER_KEY = 'workspace.catalog_preview';

// El texto que resume lo anterior en una frase, sin adornarlo. Cada rama dice
// exactamente qué falta, porque «no listo» sin causa obliga a volver a mirar.
function activationNote(blockers, delivery, entitlement) {
  if (entitlement.environment_matches_key === false)
    return 'hay una activacion persistida, pero pertenece a OTRO entorno que el de la clave actual';
  if (delivery.processed === 'never_observed')
    return 'el webhook no ha procesado NINGUN evento todavia: entrega no observada';
  if (delivery.activation_applied === 'never_observed')
    return 'el webhook corre, pero ningun evento que conceda se ha aplicado (mirar outcome de los rechazados)';
  if (entitlement.persisted === 'never_observed')
    return 'se aplico un evento que concede, pero no hay suscripcion premium activa escrita por el webhook';
  if (delivery.processed === 'unknown' || entitlement.persisted === 'unknown')
    return 'evidencia de activacion NO legible (fallo de lectura), no se afirma ni se niega';
  if (blockers.length) return 'activacion de servidor observada, pero la configuracion tiene bloqueos';
  return 'activacion de SERVIDOR observada en este entorno; la transicion visible y el recorrido desde checkout siguen sin comprobar';
}
function isAllowedOrigin(o) {
  return !!o && (ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o));
}
function corsOrigin(req) {
  const o = (req && req.headers && req.headers.origin) || '';
  return isAllowedOrigin(o) ? o : ALLOWED_ORIGINS[0];
}
// El MODO, del prefijo y de nada más. Nunca la clave.
function keyMode(k) {
  if (!k) return 'unset';
  if (/^(sk|rk)_live_/.test(k)) return 'live';
  if (/^(sk|rk)_test_/.test(k)) return 'test';
  if (/^pk_/.test(k)) return 'publishable_invalid';
  return 'unknown';
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

  const STRIPE_KEY  = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(503).json({ ok: false, error: 'billing_unconfigured' });

  // ── 1 · QUIÉN. El token decide, y además tiene que ser la cuenta fundadora ─
  const auth = (req.headers && req.headers.authorization) || '';
  const token = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token || token.length < 20) return res.status(401).json({ ok: false, error: 'unauthenticated' });

  let ent = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/aurix_entitlements`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (r.ok) { const rows = await r.json().catch(() => null); ent = Array.isArray(rows) ? rows[0] : rows; }
  } catch (_) { ent = null; }
  if (!ent || typeof ent !== 'object') return res.status(401).json({ ok: false, error: 'unauthenticated' });
  // FALLA CERRADO: sin la clave del fundador, 403. Un usuario normal no tiene
  // por qué poder auditar la configuración comercial.
  if (!ent.features || ent.features[FOUNDER_KEY] !== true) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const mode = keyMode(STRIPE_KEY);
  const webhookSecret = !!String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  // El permiso de eventos de prueba, EFECTIVO: la variable sólo tiene efecto en
  // un deployment de TEST (lo anula el propio webhook). Se publica lo que de
  // verdad aplica, no lo que está escrito.
  const allowTestEventsVar = String(process.env.BILLING_ALLOW_TEST_EVENTS || '').trim() === '1';
  const allowTestEvents = allowTestEventsVar && mode === 'test';

  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const stripeGet = (path) => fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Stripe-Version': STRIPE_API_VERSION },
  });

  // ── 2 · EL CATÁLOGO PROPIO ────────────────────────────────────────────────
  let rows = [];
  try {
    const r = await sb(`/billing_prices?provider=eq.${PROVIDER}&plan=eq.${PLAN}` +
      `&select=billing_interval,provider_price_id,amount_cents,currency,trial_days,active`);
    if (r.ok) rows = await r.json().catch(() => []);
  } catch (_) { rows = []; }
  if (!Array.isArray(rows)) rows = [];

  const blockers = [];
  if (mode !== 'live') blockers.push('stripe_key_not_live:' + mode);
  if (!webhookSecret) blockers.push('webhook_secret_missing');
  if (allowTestEvents) blockers.push('test_events_allowed');
  // La variable escrita pero inerte no bloquea: se informa para que se limpie.
  const warnings = [];
  if (allowTestEventsVar && !allowTestEvents) warnings.push('test_events_var_present_but_inert');

  // ── 3 · CADA INTERVALO, CONTRA STRIPE Y CONTRA LO APROBADO ────────────────
  const catalogue = [];
  for (const interval of INTERVALS) {
    const active = rows.filter(r => r && r.billing_interval === interval && r.active === true);
    const inactive = rows.filter(r => r && r.billing_interval === interval && r.active !== true).length;
    const row = active[0] || null;
    const entry = {
      interval,
      active_rows: active.length,
      inactive_rows: inactive,
      db: row ? {
        provider_price_id: row.provider_price_id || null,
        amount_cents: Number(row.amount_cents) || 0,
        currency: String(row.currency || '').toLowerCase(),
        trial_days: Number(row.trial_days) || 0,
      } : null,
      stripe: null,
      checks: {},
    };
    if (active.length === 0) { blockers.push('price_row_missing:' + interval); catalogue.push(entry); continue; }
    // El índice único lo impide, pero si alguna vez cayera, dos filas activas
    // significan que el paywall no tiene forma de elegir. Se dice.
    if (active.length > 1) blockers.push('price_rows_duplicated:' + interval);

    const ap = APPROVED[interval];
    entry.checks.amount_approved = entry.db.amount_cents === ap.amount_cents;
    entry.checks.currency_approved = entry.db.currency === ap.currency;
    if (!entry.checks.amount_approved) blockers.push('amount_not_approved:' + interval);
    if (!entry.checks.currency_approved) blockers.push('currency_not_approved:' + interval);
    // §2 — «no añadir pruebas gratuitas». Un trial se enciende desde la BD sin
    // desplegar, así que se comprueba aquí.
    entry.checks.no_trial = entry.db.trial_days === 0;
    if (!entry.checks.no_trial) blockers.push('trial_in_catalogue:' + interval);

    if (mode === 'unset' || mode === 'publishable_invalid') { catalogue.push(entry); continue; }
    // ── EL PRECIO, EN EL PROVEEDOR. Sólo lectura. ───────────────────────────
    try {
      const r = await stripeGet('/prices/' + encodeURIComponent(entry.db.provider_price_id));
      const p = await r.json().catch(() => null);
      if (!r.ok || !p || !p.id) {
        entry.stripe = { found: false, http: r.status,
          code: String((p && p.error && (p.error.code || p.error.type)) || '').slice(0, 64) };
        blockers.push('price_not_found_in_stripe:' + interval);
      } else {
        const rec = p.recurring || {};
        entry.stripe = {
          found: true, livemode: p.livemode === true, active: p.active === true,
          unit_amount: Number(p.unit_amount) || 0,
          currency: String(p.currency || '').toLowerCase(),
          interval: rec.interval || null, interval_count: Number(rec.interval_count) || 0,
          product: typeof p.product === 'string' ? p.product : null,
          // ── EL TRIAL DEL PROVEEDOR, QUE ANTES NO SE MIRABA ──────────────
          // Este endpoint comprobaba `trial_days` de NUESTRO catálogo y daba el
          // asunto por cerrado. Pero un precio de Stripe puede llevar su propio
          // periodo de prueba (`recurring.trial_period_days`), y ése no pasa por
          // nuestra tabla: el checkout no lo envía, lo aplica Stripe. Así que
          // alguien podía ver «período de prueba» en la pasarela con el
          // diagnóstico diciendo que no hay trial, y la única forma de saberlo
          // era abrir el panel de Stripe a ojo — exactamente lo que este
          // endpoint existe para evitar.
          trial_period_days: Number(rec.trial_period_days) || 0,
        };
        entry.checks.mode_matches_key = (mode === 'live') === (p.livemode === true);
        entry.checks.price_active = p.active === true;
        entry.checks.amount_matches_db = entry.stripe.unit_amount === entry.db.amount_cents;
        entry.checks.currency_matches_db = entry.stripe.currency === entry.db.currency;
        entry.checks.recurrence_matches = rec.interval === interval && (Number(rec.interval_count) || 1) === 1;
        if (!entry.checks.mode_matches_key) blockers.push('price_mode_mismatch:' + interval);
        if (!entry.checks.price_active) blockers.push('price_inactive_in_stripe:' + interval);
        if (!entry.checks.amount_matches_db) blockers.push('amount_mismatch_db_vs_stripe:' + interval);
        if (!entry.checks.currency_matches_db) blockers.push('currency_mismatch_db_vs_stripe:' + interval);
        if (!entry.checks.recurrence_matches) blockers.push('recurrence_mismatch:' + interval);
        // «Sin prueba gratuita» es una decisión de producto, y hay DOS sitios
        // donde puede encenderse. Se comprueban los dos y se distinguen por
        // nombre: saber cuál de los dos lo enciende es la mitad del arreglo.
        entry.checks.no_trial_in_stripe = entry.stripe.trial_period_days === 0;
        if (!entry.checks.no_trial_in_stripe) blockers.push('trial_in_stripe_price:' + interval);
      }
    } catch (e) {
      entry.stripe = { found: false, error: 'request_failed' };
      blockers.push('price_check_failed:' + interval);
    }
    catalogue.push(entry);
  }

  // ── 4 · EL PORTAL DE CLIENTE ──────────────────────────────────────────────
  // Forma parte del producto (cancelar es una promesa comercial), así que su
  // ausencia en el entorno LIVE es un bloqueo, no un detalle.
  let portal = { configured: false };
  if (mode === 'live' || mode === 'test') {
    try {
      const r = await stripeGet('/billing_portal/configurations?limit=1&active=true');
      const j = await r.json().catch(() => null);
      if (r.ok && j && Array.isArray(j.data)) {
        const c = j.data[0] || null;
        portal = { configured: !!c, livemode: c ? c.livemode === true : null,
                   is_default: c ? c.is_default === true : null };
        if (!c) blockers.push('portal_unconfigured');
        else if ((mode === 'live') !== (c.livemode === true)) blockers.push('portal_mode_mismatch');
      } else {
        portal = { configured: false, http: r.status };
        blockers.push('portal_check_failed');
      }
    } catch (_) { portal = { configured: false, error: 'request_failed' }; blockers.push('portal_check_failed'); }
  }

  // ── 5 · EL WEBHOOK, LO QUE SE PUEDE SABER DESDE AQUÍ ──────────────────────
  // Que el endpoint LIVE exista y escuche los tres eventos se comprueba con la
  // API de `webhook_endpoints`; el SECRETO no se puede leer desde la API (Stripe
  // sólo lo muestra al crearlo), así que de él sólo se afirma si está puesto.
  let webhook = { secret_configured: webhookSecret, endpoints: null };
  if (mode === 'live' || mode === 'test') {
    try {
      const r = await stripeGet('/webhook_endpoints?limit=20');
      const j = await r.json().catch(() => null);
      if (r.ok && j && Array.isArray(j.data)) {
        const want = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
        // ── LA URL ENTERA, NO LA RUTA ───────────────────────────────────────
        // Este filtro era `/\/api\/billing\/webhook$/`, que sólo mira el FINAL
        // de la URL: cualquier host valía. Así fue como un destino apuntando al
        // dominio de la app —donde no hay función y todo POST responde 405—
        // pasó como bueno, `ready_for_live` dijo `true`, y una compra real se
        // quedó sin activar. Ahora se compara la URL COMPLETA con la esperada.
        const norm = u => String(u || '').trim().replace(/\/+$/, '');
        const all = j.data
          .filter(e => e && typeof e.url === 'string' && /\/api\/billing\/webhook\/?$/.test(e.url))
          .map(e => ({
            url: e.url, status: e.status, livemode: e.livemode === true,
            url_matches_api: norm(e.url) === EXPECTED_WEBHOOK_URL,
            covers_all: want.every(w => Array.isArray(e.enabled_events) &&
              (e.enabled_events.includes(w) || e.enabled_events.includes('*'))),
            api_version: e.api_version || null,
          }));
        webhook.expected_url = EXPECTED_WEBHOOK_URL;
        webhook.endpoints = all;
        const good = all.filter(e => e.status === 'enabled' && e.covers_all
          && e.livemode === (mode === 'live') && e.url_matches_api);
        if (!good.length) {
          blockers.push('webhook_endpoint_missing_for_mode');
          // Y si lo que falla es SÓLO el host, se dice por su nombre: es el
          // error que se comete y el que no se ve en el panel de un vistazo.
          const wrongHost = all.filter(e => !e.url_matches_api && e.status === 'enabled'
            && e.livemode === (mode === 'live'));
          if (wrongHost.length) blockers.push('webhook_url_not_api_origin');
        }
      } else { blockers.push('webhook_check_failed'); }
    } catch (_) { blockers.push('webhook_check_failed'); }
  }

  // ── 6 · CUATRO PREGUNTAS DISTINTAS, Y NO SE RESPONDEN CON LA MISMA FILA ──
  // La versión anterior daba `activation_verified: true` con que hubiera UNA
  // fila cualquiera en `billing_events`. Eso es falso por tres motivos a la vez:
  // una fila puede ser un evento RECHAZADO (`unknown_price`, `unknown_customer`,
  // `ignored_type`…), puede ser de un tipo que no activa nada, y puede venir de
  // TEST. «El webhook corrió» y «el derecho quedó concedido» son afirmaciones
  // distintas, y ninguna de las dos es «el usuario vio su plan cambiar».
  // Aquí se separan las cuatro, cada una con su evidencia y su limitación:
  //
  //   1. webhook_processed     — hay filas en `billing_events`: la función corre.
  //   2. activation_applied    — una de esas filas es de un tipo que CONCEDE y
  //                              se aplicó (`applied = true`).
  //   3. entitlement_persisted — hay una fila en `subscriptions` premium/activa
  //                              escrita por el webhook (`last_event_at`).
  //   4. environment           — esa suscripción EXISTE para la clave actual.
  //                              Es lo único que distingue LIVE de TEST, porque
  //                              `billing_events` no guarda `livemode`.
  //
  // Lo que NO se puede afirmar desde aquí, y por eso se devuelve `null` en vez
  // de `false`: si la interfaz reflejó el cambio sola, y si el recorrido salió
  // de un checkout. Las dos exigen mirar una pantalla.
  const ACTIVATING_TYPES = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
  ];
  const delivery = {
    processed: 'unknown',            // 'observed' | 'never_observed' | 'unknown'
    events_total: null,
    last_received_at: null,
    last_type: null,
    last_outcome: null,
    // Un evento que CONCEDE y que además se aplicó. Rechazados aparte: son la
    // pista de por qué un pago "no funcionó", no ruido que se pueda esconder.
    activation_applied: 'unknown',   // 'observed' | 'never_observed' | 'unknown'
    activation_applied_at: null,
    refused_total: null,
  };
  try {
    const r = await sb(`/billing_events?provider=eq.${PROVIDER}` +
      `&select=event_type,received_at,outcome,applied&order=received_at.desc&limit=200`);
    if (r.ok) {
      const evs = await r.json().catch(() => []);
      const rows = Array.isArray(evs) ? evs : [];
      delivery.events_total = rows.length;
      if (rows.length) {
        delivery.processed = 'observed';
        delivery.last_received_at = rows[0].received_at || null;
        delivery.last_type = rows[0].event_type || null;
        delivery.last_outcome = rows[0].outcome || null;
        delivery.refused_total = rows.filter(e => e && e.applied !== true).length;
        const act = rows.filter(e => e && e.applied === true && ACTIVATING_TYPES.includes(e.event_type));
        delivery.activation_applied = act.length ? 'observed' : 'never_observed';
        delivery.activation_applied_at = act.length ? (act[0].received_at || null) : null;
      } else {
        // Ni un evento procesado NUNCA. Con el modo en LIVE y el catálogo listo,
        // esto es lo que hay que mirar antes de anunciar que se puede vender.
        delivery.processed = 'never_observed';
        delivery.activation_applied = 'never_observed';
        delivery.refused_total = 0;
      }
    }
  } catch (_) { /* queda en 'unknown': un fallo de lectura no es una respuesta */ }
  webhook.delivery = delivery;

  // ── EL DERECHO, PERSISTIDO ────────────────────────────────────────────────
  // Que un evento se aplicara y que haya una suscripción viva son dos cosas:
  // un `customer.subscription.updated` de una cancelación también se "aplica".
  // Lo que acredita activación de servidor es una fila premium y activa que el
  // webhook escribió — `last_event_at` lo demuestra: nadie más escribe ahí.
  const entitlement = {
    persisted: 'unknown',            // 'observed' | 'never_observed' | 'unknown'
    active_rows: null,
    last_event_at: null,
    // El identificador NO se publica: se usa sólo para preguntarle a Stripe.
    environment_matches_key: 'unknown',  // true | false | 'unknown'
  };
  let probeSubId = null;
  try {
    const r = await sb(`/subscriptions?provider=eq.${PROVIDER}&plan=eq.${PLAN}` +
      `&status=in.(active,trialing)&provider_subscription_id=not.is.null` +
      `&select=status,last_event_at,provider_subscription_id&order=last_event_at.desc.nullslast&limit=50`);
    if (r.ok) {
      const subs = await r.json().catch(() => []);
      const rows = Array.isArray(subs) ? subs : [];
      entitlement.active_rows = rows.length;
      const written = rows.filter(x => x && x.last_event_at);
      if (written.length) {
        entitlement.persisted = 'observed';
        entitlement.last_event_at = written[0].last_event_at || null;
        probeSubId = written[0].provider_subscription_id || null;
      } else {
        entitlement.persisted = 'never_observed';
      }
    }
  } catch (_) { /* 'unknown' */ }

  // ── ¿Y ES DE ESTE ENTORNO? ────────────────────────────────────────────────
  // `billing_events` no guarda `livemode`, así que una activación observada
  // puede ser perfectamente de TEST. La única forma honesta de saberlo es
  // preguntarle a Stripe por esa suscripción CON LA CLAVE ACTUAL: si existe,
  // pertenece al mismo entorno; si devuelve 404, es del otro. Sólo lectura.
  if (probeSubId && (mode === 'live' || mode === 'test')) {
    try {
      const r = await stripeGet(`/subscriptions/${encodeURIComponent(probeSubId)}`);
      if (r.ok) {
        const sub = await r.json().catch(() => null);
        entitlement.environment_matches_key =
          sub && typeof sub.livemode === 'boolean' ? (sub.livemode === (mode === 'live')) : true;
      } else if (r.status === 404) {
        entitlement.environment_matches_key = false;
      }
    } catch (_) { /* 'unknown' */ }
  }
  if (entitlement.environment_matches_key === false) blockers.push('activation_from_other_environment');

  const uniq = Array.from(new Set(blockers));
  return res.status(200).json({
    ok: true,
    checked_at: new Date().toISOString(),
    mode,                       // 'live' | 'test' | 'unset' | 'unknown' | 'publishable_invalid'
    approved: APPROVED,
    catalogue,
    portal,
    webhook,
    allow_test_events_effective: allowTestEvents,
    warnings,
    blockers: uniq,
    // `ready_for_live` significa «la CONFIGURACIÓN es coherente», nunca «ya se
    // ha entregado y activado una compra». Se nombran las dos por separado
    // porque confundirlas es lo que dejó pasar el webhook mal apuntado.
    ready_for_live: uniq.length === 0,
    entitlement,
    // ── LAS CUATRO AFIRMACIONES, POR SEPARADO ───────────────────────────
    // `activation_verified` significa AHORA, y sólo, «el servidor concedió el
    // derecho y lo hizo en este entorno». Ni una fila suelta lo demuestra.
    activation_verified:
      delivery.activation_applied === 'observed' &&
      entitlement.persisted === 'observed' &&
      entitlement.environment_matches_key === true,
    // Y estas dos NO son observables desde el servidor. `null` no es «no»: es
    // «esto no se responde desde aquí». Confundirlas es lo que dejó declarar
    // funcionando un webhook que no podía entregar.
    auto_activation_verified: null,
    checkout_journey_verified: null,
    not_observable_here: [
      'auto_activation_verified: exige VER la transicion Free->Premium en la interfaz sin recargar ni pulsar',
      'checkout_journey_verified: exige una cuenta inicialmente Free que pase por checkout y vuelva',
    ],
    note: activationNote(uniq, delivery, entitlement),
  });
}
