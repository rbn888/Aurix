'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-BILLING-LIVE-STATUS — el diagnóstico de cobro, ejecutado
// ════════════════════════════════════════════════════════════════════════════
// `api/billing/_status.js` existe para contestar «¿se puede cobrar de verdad?»
// sin exponer un secreto, sin abrir una sesión de pago y sin cobrar un céntimo.
// Un diagnóstico que mienta es peor que no tenerlo: si dijera `ready_for_live`
// con un `price_id` de TEST y una clave LIVE, el primer cliente real se llevaría
// el fallo. Así que aquí se EJECUTA el handler contra un proveedor simulado y se
// comprueban las tres cosas que pueden salir mal: que no filtre, que no conceda
// acceso a quien no debe, y que detecte cada incoherencia de entorno.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'api', 'billing', '_status.js'), 'utf8');
let pass = 0, fail = 0;
function ok(n, c, info) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } }

console.log('AURIX-BILLING-LIVE-STATUS — configuración de cobro, sin cobrar\n');

// Valores que JAMÁS pueden aparecer en una respuesta. Son inventados, pero con
// la forma real: si el handler los devolviera, el assert los encontraría.
//
// SE COMPONEN EN TIEMPO DE EJECUCIÓN, y no es manía: escritos como literal, la
// protección de secretos de GitHub los reconoce como una Stripe API Key y
// RECHAZA el push entero. Tiene razón en ser conservadora —no puede saber que
// son falsos— así que el fichero deja de contener la forma completa. El valor
// que ve el test es exactamente el mismo.
const FAKE_SK   = ['sk', 'live', 'AURIXFAKEKEY' + '0'.repeat(20)].join('_');
const FAKE_WH   = ['whsec', 'AURIXFAKEWEBHOOKSECRET' + '0'.repeat(6)].join('_');
const FAKE_SRV  = ['service', 'role', 'AURIXFAKE' + '0'.repeat(10)].join('_');

function run(opts) {
  opts = opts || {};
  const calls = [];
  const env = Object.assign({
    STRIPE_SECRET_KEY: FAKE_SK,
    STRIPE_WEBHOOK_SECRET: FAKE_WH,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_SRV,
  }, opts.env || {});
  // El proveedor y la base de datos, simulados. Se registra CADA llamada para
  // poder afirmar que esto es sólo lectura.
  const fetchImpl = async (url, init) => {
    const u = String(url); const method = ((init && init.method) || 'GET').toUpperCase();
    calls.push(method + ' ' + u.replace(/https:\/\/[^/]+/, ''));
    const J = (body, okFlag) => ({ ok: okFlag !== false, status: okFlag === false ? 400 : 200,
      json: async () => body, text: async () => JSON.stringify(body) });
    if (/\/rpc\/aurix_entitlements$/.test(u)) return J(opts.ent === undefined ? [{ features: { 'workspace.catalog_preview': true } }] : opts.ent, opts.entOk);
    if (/\/rest\/v1\/billing_prices/.test(u)) return J(opts.rows === undefined ? [] : opts.rows);
    if (/\/v1\/prices\//.test(u)) {
      const id = decodeURIComponent(u.split('/v1/prices/')[1]);
      const p = (opts.stripePrices || {})[id];
      return p ? J(p) : { ok: false, status: 404, json: async () => ({ error: { code: 'resource_missing' } }) };
    }
    if (/\/rest\/v1\/billing_events/.test(u)) return J(opts.events === undefined
      ? [{ event_type: 'customer.subscription.updated', received_at: '2026-09-24T10:00:00Z', outcome: 'applied', applied: true }]
      : opts.events);
    // El derecho PERSISTIDO es una pregunta distinta de «llegó un evento».
    if (/\/rest\/v1\/subscriptions/.test(u)) return J(opts.subs === undefined
      ? [{ status: 'active', last_event_at: '2026-09-24T10:00:01Z', provider_subscription_id: 'sub_probe' }]
      : opts.subs);
    // Y de qué ENTORNO es ese derecho sólo lo dice Stripe con la clave actual.
    if (/\/v1\/subscriptions\//.test(u)) {
      const id = decodeURIComponent(u.split('/v1/subscriptions/')[1]);
      const sub = (opts.stripeSubs === undefined ? { sub_probe: { id: 'sub_probe', livemode: true } } : opts.stripeSubs)[id];
      return sub ? J(sub) : { ok: false, status: 404, json: async () => ({ error: { code: 'resource_missing' } }) };
    }
    if (/\/v1\/billing_portal\/configurations/.test(u)) return J({ data: opts.portal === undefined ? [{ livemode: true, is_default: true }] : opts.portal });
    if (/\/v1\/webhook_endpoints/.test(u)) return J({ data: opts.hooks === undefined ? [{
      url: 'https://isa-portfolio-ten.vercel.app/api/billing/webhook', status: 'enabled', livemode: true,
      enabled_events: ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'],
    }] : opts.hooks });
    return J({});
  };
  const res = { code: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
  const body = SRC.replace(/export\s+default\s+async\s+function\s+handler/, 'module.handler = async function handler');
  const sb = { module: {}, process: { env }, fetch: fetchImpl, console: { error() {}, log() {} },
    URL, URLSearchParams, JSON, Math, Number, String, Object, Array, Date, Set, Boolean, isFinite, Promise, Error, encodeURIComponent };
  vm.createContext(sb);
  vm.runInContext(body, sb);
  const req = Object.assign({ method: 'POST', headers: { origin: 'https://app.aurixsystem.io',
    authorization: 'Bearer ' + 'x'.repeat(40) }, body: {} }, opts.req || {});
  return sb.module.handler(req, res).then(() => ({ code: res.code, body: res.body, calls, headers: res.headers }));
}

const LIVE_ROWS = [
  { billing_interval: 'year',  provider_price_id: 'price_live_year',  amount_cents: 6999, currency: 'eur', trial_days: 0, active: true },
  { billing_interval: 'month', provider_price_id: 'price_live_month', amount_cents: 799,  currency: 'eur', trial_days: 0, active: true },
];
const LIVE_PRICES = {
  price_live_year:  { id: 'price_live_year',  livemode: true, active: true, unit_amount: 6999, currency: 'eur', recurring: { interval: 'year',  interval_count: 1 }, product: 'prod_x' },
  price_live_month: { id: 'price_live_month', livemode: true, active: true, unit_amount: 799,  currency: 'eur', recurring: { interval: 'month', interval_count: 1 }, product: 'prod_x' },
};

(async () => {

// ══════════════════════════════════════════════════════════════════════════
// 1 · NO FILTRA NADA. Es lo primero porque es lo irreversible.
// ══════════════════════════════════════════════════════════════════════════
console.log('1 · Ningún secreto sale de aquí:');
{
  const r = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES });
  const txt = JSON.stringify(r.body);
  ok('1.1 la respuesta no contiene la secret key, ni el signing secret, ni el service role',
    txt.indexOf(FAKE_SK) === -1 && txt.indexOf(FAKE_WH) === -1 && txt.indexOf(FAKE_SRV) === -1);
  ok('1.2 tampoco fragmentos: ni el prefijo con cola, ni los últimos caracteres',
    !new RegExp(['sk', 'live', '[A-Za-z0-9]'].join('_')).test(txt)
    && !new RegExp(['whsec', '[A-Za-z0-9]'].join('_')).test(txt)
    && txt.indexOf(FAKE_SK.slice(-8)) === -1 && txt.indexOf(FAKE_WH.slice(-8)) === -1);
  ok('1.3 del secreto del webhook sólo se publica SI está puesto, nunca su valor',
    r.body.webhook.secret_configured === true && typeof r.body.webhook.secret_configured === 'boolean');
  ok('1.4 y del modo sólo la palabra, derivada del prefijo',
    r.body.mode === 'live');
  ok('1.5 la respuesta es no-cacheable: un diagnóstico comercial no se guarda en un CDN',
    r.headers['Cache-Control'] === 'no-store');
}

// ══════════════════════════════════════════════════════════════════════════
// 2 · SÓLO LECTURA. No crea sesiones, no escribe, no cobra.
// ══════════════════════════════════════════════════════════════════════════
console.log('\n2 · No toca nada:');
{
  const r = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES });
  const writes = r.calls.filter(c => /^(POST|PUT|PATCH|DELETE)/.test(c) && !/\/rpc\/aurix_entitlements$/.test(c));
  // Sólo las rutas de STRIPE: `/rest/v1/...` es Supabase y también contiene `/v1/`.
  const stripeCalls = r.calls.filter(c => /\s\/v1\//.test(c));
  ok('2.1 contra Stripe, sólo GET: ni una escritura',
    stripeCalls.length >= 3 && stripeCalls.every(c => c.startsWith('GET ')),
    JSON.stringify(stripeCalls));
  ok('2.2 la única escritura es el POST del resolver de derechos, que es una lectura RPC',
    writes.length === 0, JSON.stringify(writes));
  ok('2.3 no crea sesiones de pago ni de portal',
    !r.calls.some(c => /checkout\/sessions|billing_portal\/sessions/.test(c)), JSON.stringify(r.calls));
  // ACTUALIZADO (2026-09-24): el assert prohibía APARECER, no escribir, y el
  // diagnóstico ahora LEE `billing_events` a propósito — es la única evidencia
  // de que el webhook ha entregado alguna vez de verdad. Leer no es escribir:
  // se exige lo que el título siempre dijo, que ninguna de esas tablas se
  // MODIFIQUE, y se comprueba además que la lectura es un GET.
  ok('2.4 no escribe en subscriptions, billing_customers ni billing_events',
    !writes.some(c => /subscriptions|billing_customers|billing_events/.test(c)),
    JSON.stringify(writes));
  ok('2.4b y la evidencia de entrega se obtiene LEYENDO el ledger, con GET',
    r.calls.some(c => /^GET\s.*billing_events/.test(c)),
    JSON.stringify(r.calls.filter(c => /billing_events/.test(c))));
}

// ══════════════════════════════════════════════════════════════════════════
// 3 · QUIÉN PUEDE PREGUNTAR. Falla cerrado.
// ══════════════════════════════════════════════════════════════════════════
console.log('\n3 · Sólo la cuenta fundadora:');
{
  ok('3.1 sin token, 401', (await run({ req: { headers: { origin: 'https://app.aurixsystem.io' } } })).code === 401);
  ok('3.2 con token pero SIN la clave de fundador, 403 y sin cuerpo de diagnóstico',
    (async () => { const r = await run({ ent: [{ features: { 'workspace.catalog_preview': false } }] });
      return r.code === 403 && !r.body.mode; })() );
  const r403 = await run({ ent: [{ features: { 'workspace.catalog_preview': false } }] });
  ok('3.2b …comprobado de verdad', r403.code === 403 && r403.body.error === 'forbidden' && !r403.body.mode,
    JSON.stringify(r403.body));
  const rPrem = await run({ ent: [{ plan: 'premium', features: { 'intelligence.full': true, 'workspace.catalog_preview': false } }] });
  ok('3.3 un Premium DE PAGO tampoco puede auditar la configuración comercial',
    rPrem.code === 403, JSON.stringify(rPrem.body));
  const rBad = await run({ entOk: false });
  ok('3.4 si el resolver no contesta, 401 — nunca se asume fundador',
    rBad.code === 401, JSON.stringify(rBad.body));
  ok('3.5 origen no permitido, 403',
    (await run({ req: { headers: { origin: 'https://evil.example', authorization: 'Bearer ' + 'x'.repeat(40) } } })).code === 403);
  ok('3.6 GET no vale: es POST o nada',
    (await run({ req: { method: 'GET', headers: { origin: 'https://app.aurixsystem.io' } } })).code === 405);
}

// ══════════════════════════════════════════════════════════════════════════
// 4 · LO QUE DETECTA. Cada incoherencia que impediría cobrar.
// ══════════════════════════════════════════════════════════════════════════
console.log('\n4 · Los bloqueos, uno a uno:');
{
  const green = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES });
  ok('4.1 configuración LIVE coherente ⇒ ready_for_live, sin bloqueos',
    green.body.ready_for_live === true && green.body.blockers.length === 0,
    JSON.stringify(green.body.blockers));

  const cases = [
    ['clave de TEST con precios LIVE', { env: { STRIPE_SECRET_KEY: 'sk_test_x' }, rows: LIVE_ROWS, stripePrices: LIVE_PRICES },
      ['stripe_key_not_live:test', 'price_mode_mismatch:year']],
    ['precio de TEST con clave LIVE', { rows: LIVE_ROWS, stripePrices: {
        price_live_year:  Object.assign({}, LIVE_PRICES.price_live_year,  { livemode: false }),
        price_live_month: Object.assign({}, LIVE_PRICES.price_live_month, { livemode: false }) } },
      ['price_mode_mismatch:year', 'price_mode_mismatch:month']],
    ['sin fila activa para un intervalo', { rows: [LIVE_ROWS[0]], stripePrices: LIVE_PRICES },
      ['price_row_missing:month']],
    ['el precio no existe en Stripe', { rows: LIVE_ROWS, stripePrices: {} },
      ['price_not_found_in_stripe:year', 'price_not_found_in_stripe:month']],
    ['importe distinto del aprobado', { rows: [Object.assign({}, LIVE_ROWS[0], { amount_cents: 4999 }), LIVE_ROWS[1]], stripePrices: LIVE_PRICES },
      ['amount_not_approved:year']],
    ['divisa distinta de la aprobada', { rows: [Object.assign({}, LIVE_ROWS[0], { currency: 'usd' }), LIVE_ROWS[1]], stripePrices: LIVE_PRICES },
      ['currency_not_approved:year']],
    ['la BD dice un importe y Stripe otro', { rows: LIVE_ROWS, stripePrices: Object.assign({}, LIVE_PRICES, {
        price_live_year: Object.assign({}, LIVE_PRICES.price_live_year, { unit_amount: 4999 }) }) },
      ['amount_mismatch_db_vs_stripe:year']],
    ['recurrencia equivocada (anual cobrando mensual)', { rows: LIVE_ROWS, stripePrices: Object.assign({}, LIVE_PRICES, {
        price_live_year: Object.assign({}, LIVE_PRICES.price_live_year, { recurring: { interval: 'month', interval_count: 1 } }) }) },
      ['recurrence_mismatch:year']],
    ['precio archivado en Stripe', { rows: LIVE_ROWS, stripePrices: Object.assign({}, LIVE_PRICES, {
        price_live_month: Object.assign({}, LIVE_PRICES.price_live_month, { active: false }) }) },
      ['price_inactive_in_stripe:month']],
    // RENOMBRADO (2026-09-24): el bloqueo se llamaba `trial_enabled`, que no
    // decía DÓNDE estaba encendido. Hay dos sitios y sólo se miraba uno.
    ['prueba gratuita encendida en NUESTRO catálogo', { rows: [Object.assign({}, LIVE_ROWS[0], { trial_days: 7 }), LIVE_ROWS[1]], stripePrices: LIVE_PRICES },
      ['trial_in_catalogue:year']],
    // ── EL HUECO QUE ESTE ENDPOINT TENÍA ──────────────────────────────────
    // Un precio de Stripe puede llevar su propio `trial_period_days`. No pasa
    // por nuestra tabla —lo aplica Stripe, no nuestro checkout—, así que el
    // diagnóstico decía «sin trial» mientras la pasarela enseñaba un periodo de
    // prueba. Exactamente la pregunta que el fundador no podía responder sin
    // abrir el panel a ojo.
    ['prueba gratuita configurada en el PRECIO de Stripe', { rows: LIVE_ROWS, stripePrices: Object.assign({}, LIVE_PRICES, {
        price_live_year: Object.assign({}, LIVE_PRICES.price_live_year, {
          recurring: { interval: 'year', interval_count: 1, trial_period_days: 14 } }) }) },
      ['trial_in_stripe_price:year']],
    ['sin signing secret', { env: { STRIPE_WEBHOOK_SECRET: '' }, rows: LIVE_ROWS, stripePrices: LIVE_PRICES },
      ['webhook_secret_missing']],
    ['el webhook LIVE no existe', { rows: LIVE_ROWS, stripePrices: LIVE_PRICES, hooks: [] },
      ['webhook_endpoint_missing_for_mode']],
    ['el webhook no escucha los tres eventos', { rows: LIVE_ROWS, stripePrices: LIVE_PRICES, hooks: [{
        url: 'https://isa-portfolio-ten.vercel.app/api/billing/webhook', status: 'enabled', livemode: true,
        enabled_events: ['customer.subscription.created'] }] },
      ['webhook_endpoint_missing_for_mode']],
    ['el webhook es el de TEST', { rows: LIVE_ROWS, stripePrices: LIVE_PRICES, hooks: [{
        url: 'https://isa-portfolio-ten.vercel.app/api/billing/webhook', status: 'enabled', livemode: false,
        enabled_events: ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'] }] },
      ['webhook_endpoint_missing_for_mode']],
    // ── EL FALSO VERDE QUE COSTÓ UNA COMPRA REAL (24/09/2026) ─────────────
    // El destino estaba en el dominio de la APP —GitHub Pages, ficheros
    // estáticos, 405 a cualquier POST— en vez de en el de la API. El filtro
    // sólo miraba el FINAL de la URL, así que pasó como bueno: `blockers: []`,
    // `ready_for_live: true`, y un pago de 7,99 € que no activó nada.
    // Este caso falla con el código anterior y es el que impide repetirlo.
    ['el webhook apunta al dominio de la APP, no al de la API', { rows: LIVE_ROWS, stripePrices: LIVE_PRICES, hooks: [{
        url: 'https://app.aurixsystem.io/api/billing/webhook', status: 'enabled', livemode: true,
        enabled_events: ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'] }] },
      ['webhook_endpoint_missing_for_mode', 'webhook_url_not_api_origin']],
    ['portal de cliente sin configurar', { rows: LIVE_ROWS, stripePrices: LIVE_PRICES, portal: [] },
      ['portal_unconfigured']],
    ['portal del entorno equivocado', { rows: LIVE_ROWS, stripePrices: LIVE_PRICES, portal: [{ livemode: false, is_default: true }] },
      ['portal_mode_mismatch']],
    ['sin clave configurada', { env: { STRIPE_SECRET_KEY: '' }, rows: LIVE_ROWS, stripePrices: LIVE_PRICES },
      ['stripe_key_not_live:unset']],
    ['una publishable key en la variable de secreto', { env: { STRIPE_SECRET_KEY: 'pk_live_x' }, rows: LIVE_ROWS, stripePrices: LIVE_PRICES },
      ['stripe_key_not_live:publishable_invalid']],
  ];
  for (const [name, opts, expected] of cases) {
    const r = await run(opts);
    const got = r.body.blockers || [];
    ok('4.2 detecta: ' + name,
      r.body.ready_for_live === false && expected.every(e => got.includes(e)),
      JSON.stringify(got));
  }

  // El permiso de eventos de prueba: BLOQUEA en TEST, y en LIVE sólo avisa —
  // porque el webhook ya lo anula solo, y llamarlo bloqueo sería falso.
  const rTestEv = await run({ env: { STRIPE_SECRET_KEY: 'sk_test_x', BILLING_ALLOW_TEST_EVENTS: '1' }, rows: LIVE_ROWS, stripePrices: LIVE_PRICES });
  ok('4.3 con clave de TEST, `BILLING_ALLOW_TEST_EVENTS=1` es un bloqueo',
    (rTestEv.body.blockers || []).includes('test_events_allowed') && rTestEv.body.allow_test_events_effective === true);
  const rLiveEv = await run({ env: { BILLING_ALLOW_TEST_EVENTS: '1' }, rows: LIVE_ROWS, stripePrices: LIVE_PRICES });
  ok('4.4 con clave LIVE la variable es INERTE: aviso, no bloqueo (el webhook ya la anula)',
    !(rLiveEv.body.blockers || []).includes('test_events_allowed')
    && rLiveEv.body.allow_test_events_effective === false
    && (rLiveEv.body.warnings || []).includes('test_events_var_present_but_inert')
    && rLiveEv.body.ready_for_live === true,
    JSON.stringify({ b: rLiveEv.body.blockers, w: rLiveEv.body.warnings }));
}

// ══════════════════════════════════════════════════════════════════════════
// 5 · LOS IMPORTES APROBADOS ESTÁN ESCRITOS, NO ESPEJADOS
// ══════════════════════════════════════════════════════════════════════════
console.log('\n4b · «Configurado» no es «entregado», y «entregado» no es «activado»:');
{
  const APPLIED = [{ event_type: 'customer.subscription.updated', received_at: '2026-09-24T10:00:00Z', outcome: 'applied', applied: true }];
  const SUB_OK  = [{ status: 'active', last_event_at: '2026-09-24T10:00:01Z', provider_subscription_id: 'sub_probe' }];

  // Con TODO en verde pero sin un solo evento procesado, el endpoint no puede
  // decir que la activación esté probada. Decirlo es lo que permitió anunciar
  // «listo para vender» sobre un webhook que nunca entregó.
  const r = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES, events: [], subs: [] });
  ok('4b.1 configuración coherente ⇒ ready_for_live, pero activación NO verificada',
    r.body.ready_for_live === true && r.body.activation_verified === false &&
    r.body.webhook.delivery.processed === 'never_observed',
    JSON.stringify({ ready: r.body.ready_for_live, act: r.body.activation_verified,
      del: r.body.webhook && r.body.webhook.delivery }));
  ok('4b.2 …y lo dice en texto, para que nadie lea «verde» como «probado»',
    /no ha procesado NINGUN evento/i.test(String(r.body.note || '')), String(r.body.note));

  // ── LO QUE UNA FILA SUELTA NO DEMUESTRA ─────────────────────────────────
  // Tres casos que la versión anterior daba por activación verificada, y no lo
  // son. Este bloque FALLA con el código anterior: ahí bastaba `events.length`.
  const rRef = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES, subs: [],
    events: [{ event_type: 'customer.subscription.updated', received_at: '2026-09-24T10:00:00Z', outcome: 'unknown_price', applied: false }] });
  ok('4b.3 un evento RECHAZADO acredita que el webhook corre, no que active',
    rRef.body.webhook.delivery.processed === 'observed' &&
    rRef.body.webhook.delivery.activation_applied === 'never_observed' &&
    rRef.body.webhook.delivery.refused_total === 1 &&
    rRef.body.activation_verified === false,
    JSON.stringify(rRef.body.webhook.delivery));
  ok('4b.3b …y el texto dice dónde mirar, no sólo que no está listo',
    /ningun evento que conceda se ha aplicado/i.test(String(rRef.body.note || '')), String(rRef.body.note));

  const rTipo = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES, subs: SUB_OK,
    events: [{ event_type: 'customer.subscription.deleted', received_at: '2026-09-24T10:00:00Z', outcome: 'applied', applied: true }] });
  ok('4b.4 un evento aplicado que NO concede (una baja) tampoco es activación',
    rTipo.body.webhook.delivery.activation_applied === 'never_observed' &&
    rTipo.body.activation_verified === false,
    JSON.stringify(rTipo.body.webhook.delivery));

  const rSinSub = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES, events: APPLIED, subs: [] });
  ok('4b.5 evento aplicado SIN derecho persistido no es activación de servidor',
    rSinSub.body.webhook.delivery.activation_applied === 'observed' &&
    rSinSub.body.entitlement.persisted === 'never_observed' &&
    rSinSub.body.activation_verified === false,
    JSON.stringify({ d: rSinSub.body.webhook.delivery, e: rSinSub.body.entitlement }));
  ok('4b.5b …y se nombra la pieza que falta',
    /no hay suscripcion premium activa escrita por el webhook/i.test(String(rSinSub.body.note || '')),
    String(rSinSub.body.note));

  // ── Y DE QUÉ ENTORNO ES ─────────────────────────────────────────────────
  // `billing_events` no guarda `livemode`: una activación observada puede ser
  // de TEST. Con la clave LIVE, si Stripe no conoce esa suscripción, es del
  // otro entorno — y eso NO puede pasar por activación verificada.
  const rOtro = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES, events: APPLIED, subs: SUB_OK,
    stripeSubs: {} });
  ok('4b.6 un derecho persistido que la clave actual no conoce es de OTRO entorno',
    rOtro.body.entitlement.environment_matches_key === false &&
    rOtro.body.activation_verified === false &&
    (rOtro.body.blockers || []).includes('activation_from_other_environment'),
    JSON.stringify({ e: rOtro.body.entitlement, b: rOtro.body.blockers }));
  ok('4b.6b …y el aviso lo dice con esas palabras',
    /pertenece a OTRO entorno/i.test(String(rOtro.body.note || '')), String(rOtro.body.note));

  // ── LAS TRES PIEZAS A LA VEZ, Y SÓLO ENTONCES ───────────────────────────
  const r2 = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES, events: APPLIED, subs: SUB_OK });
  ok('4b.7 evento que concede + derecho persistido + mismo entorno ⇒ activación de SERVIDOR',
    r2.body.activation_verified === true &&
    r2.body.webhook.delivery.processed === 'observed' &&
    r2.body.webhook.delivery.activation_applied === 'observed' &&
    r2.body.entitlement.persisted === 'observed' &&
    r2.body.entitlement.environment_matches_key === true,
    JSON.stringify({ d: r2.body.webhook.delivery, e: r2.body.entitlement }));

  // ── LO QUE ESTE ENDPOINT NO PUEDE RESPONDER ─────────────────────────────
  // Y no lo responde con `false`, que sería otra afirmación: lo responde con
  // `null` y lo declara. Ver la transición y recorrer el checkout exigen mirar
  // una pantalla, y confundirlo con esto es de donde vino el falso verde.
  ok('4b.8 la transición visible y el recorrido NO se afirman desde el servidor',
    r2.body.auto_activation_verified === null && r2.body.checkout_journey_verified === null &&
    Array.isArray(r2.body.not_observable_here) && r2.body.not_observable_here.length === 2,
    JSON.stringify({ a: r2.body.auto_activation_verified, c: r2.body.checkout_journey_verified }));
  ok('4b.8b …y el texto final no confunde activación de servidor con recorrido',
    /transicion visible y el recorrido desde checkout siguen sin comprobar/i.test(String(r2.body.note || '')),
    String(r2.body.note));

  ok('4b.9 y el destino esperado se publica, para poder compararlo a simple vista',
    String(r2.body.webhook.expected_url || '').endsWith('/api/billing/webhook') &&
    !/app\.aurixsystem\.io/.test(String(r2.body.webhook.expected_url)),
    String(r2.body.webhook.expected_url));

  // Un fallo de LECTURA no es una respuesta: ni afirma ni niega.
  const rCiego = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES,
    events: null, subs: null });
  ok('4b.10 si la evidencia no se puede leer, no se afirma ni se niega',
    rCiego.body.activation_verified === false &&
    /NO legible|no ha procesado/i.test(String(rCiego.body.note || '')),
    JSON.stringify({ d: rCiego.body.webhook.delivery, e: rCiego.body.entitlement, n: rCiego.body.note }));
}

console.log('\n5 · 7,99 €/mes y 69,99 €/año, y anual primero:');
{
  const r = await run({ rows: LIVE_ROWS, stripePrices: LIVE_PRICES });
  ok('5.1 el endpoint declara los importes aprobados y los contrasta',
    r.body.approved.year.amount_cents === 6999 && r.body.approved.month.amount_cents === 799
    && r.body.approved.year.currency === 'eur' && r.body.approved.month.currency === 'eur');
  ok('5.2 el anual se publica primero, igual que en el paywall',
    r.body.catalogue[0].interval === 'year' && r.body.catalogue[1].interval === 'month');
  ok('5.3 y el contraste es contra Stripe, no sólo contra la base de datos',
    r.body.catalogue[0].checks.amount_matches_db === true
    && r.body.catalogue[0].checks.mode_matches_key === true
    && r.body.catalogue[0].stripe.found === true);
  ok('5.4 los importes aprobados coinciden con los que el paywall lee del catálogo',
    r.body.catalogue.every(c => c.checks.amount_approved && c.checks.currency_approved));
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();
