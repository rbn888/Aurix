'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M04-BILLING-STRIPE — SPEC M.04 · real monetization (web / Stripe)
// ════════════════════════════════════════════════════════════════════════════
// Este gate no comprueba que exista código de billing: EJECUTA el webhook y el
// endpoint de checkout reales, extraídos de `api/billing/*`, con `fetch`, la
// hora y las variables de entorno inyectadas. Las firmas son firmas de verdad
// (HMAC-SHA256 con Web Crypto), así que "firma inválida", "replay" y "rotación
// de secreto" se prueban produciendo esos casos, no describiéndolos.
//
// Lo que NO se puede ejecutar aquí es Postgres. La lógica que decide QUIÉN, QUÉ
// y SI YA SE APLICÓ vive a propósito en SQL (una transacción, un escritor), así
// que sobre `db/monetization_m04_billing_stripe_1.sql` se comprueba la FORMA de
// esas garantías —el fichero es el artefacto que se aplica— y se declara como
// residual que su ejecución real ocurre al aplicarlo en Supabase.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app  = read('app.js');
const css  = read('styles.css');
const idx  = read('index.html');
const SQL  = read('db/monetization_m04_billing_stripe_1.sql');
const WH   = read('api/billing/webhook.mjs');
const CO   = read('api/billing/_checkout.js');
const PO   = read('api/billing/_portal.js');
const DISP = read('api/billing/[op].js');
const ST   = read('api/billing/_status.js');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}
const noComments = (x) => String(x).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// El cuerpo que Stripe recibe va form-encoded: se decodifica antes de mirarlo,
// porque `line_items[0][price]` viaja como `line_items%5B0%5D%5Bprice%5D`.
const decodeBody = (b) => decodeURIComponent(String(b || '')).replace(/\+/g, ' ');
// La FUNCIÓN de SQL, no el fichero: los comentarios de cabecera nombran tablas y
// argumentos que la función no usa, y buscar en ellos es una aserción vacua.
function sqlFn(src, name) {
  const i = src.indexOf('create or replace function public.' + name);
  if (i < 0) throw new Error('missing sql fn ' + name);
  const j = src.indexOf('\n$$;', i);
  return src.slice(i, j > 0 ? j : src.length);
}
function fnSrc(src, name) {
  const s = 'function ' + name + '('; const i = src.indexOf(s);
  if (i < 0) throw new Error('missing fn ' + name);
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}

// ── carga de un handler ESM de api/ en un sandbox ──────────────────────────
// `export default` / `export const` se reescriben a asignaciones sobre un objeto
// de módulo. El CUERPO no se toca: es el código que Vercel ejecuta.
function loadHandler(src, sandbox) {
  const body = src
    .replace(/export\s+const\s+config\s*=/, 'module.config =')
    .replace(/export\s+default\s+async\s+function\s+handler/, 'module.handler = async function handler')
    .replace(/export\s+default\s+function\s+handler/, 'module.handler = function handler');
  const sb = Object.assign({
    module: {}, console: { log() {}, warn() {}, error() {} },
    URL, URLSearchParams, TextEncoder, TextDecoder, crypto, Response, Request,
    JSON, Math, Number, String, Object, Array, Date, Set, Map, isFinite, Boolean,
    setTimeout, Promise, Error,
  }, sandbox || {});
  vm.createContext(sb);
  vm.runInContext(body, sb);
  return { handler: sb.module.handler, config: sb.module.config, sb };
}

const SECRET = 'whsec_test_m04_aurix_secret';
async function sign(secret, ts, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Una llamada al webhook con el entorno y el `fetch` bajo control. Devuelve la
// respuesta Y las llamadas RPC que el handler intentó, que es donde se ve si
// decidió algo que no le corresponde.
async function callWebhook(event, opts) {
  const o = opts || {};
  const rawBody = (o.raw != null) ? o.raw : JSON.stringify(event);
  const ts = o.ts || Math.floor(Date.now() / 1000);
  const calls = [];
  const env = Object.assign({
    STRIPE_WEBHOOK_SECRET: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_URL: 'https://db.test',
  }, o.env || {});
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse((init && init.body) || '{}'),
                 auth: (init && init.headers && init.headers.Authorization) || '' });
    const outcome = o.rpcOutcome || 'applied';
    if (o.rpcFail) return { ok: false, status: 500, text: async () => 'boom', json: async () => null };
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome }), text: async () => '' };
  };
  const { handler } = loadHandler(WH, { process: { env }, fetch: fakeFetch });
  let sigHeader = o.sigHeader;
  if (sigHeader === undefined) {
    const v1 = (o.badSig ? 'deadbeef'.repeat(8) : await sign(o.secret || SECRET, ts, rawBody));
    sigHeader = `t=${ts},v1=${v1}`;
  }
  const method = o.method || 'POST';
  const req = new Request('https://app.test/api/billing/webhook', Object.assign({
    method,
    headers: sigHeader === null ? {} : { 'stripe-signature': sigHeader },
  }, (method === 'GET' || method === 'HEAD') ? {} : { body: rawBody }));
  const res = await handler(req);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, calls };
}

const SUB_EVENT = (over) => ({
  id: (over && over.id) || 'evt_1',
  type: (over && over.type) || 'customer.subscription.updated',
  created: (over && over.created) || Math.floor(Date.now() / 1000),
  data: { object: Object.assign({
    id: 'sub_123', customer: 'cus_123', status: 'active',
    current_period_start: 1750000000, current_period_end: 1780000000,
    cancel_at_period_end: false, trial_start: null, trial_end: null, canceled_at: null,
    items: { data: [{ price: { id: 'price_annual_real' } }] },
  }, (over && over.object) || {}) },
});

(async () => {
console.log('\nAURIX-M04-BILLING-STRIPE — SPEC M.04 · cobro real (web)\n');

// ══ A · AUTORIDAD: EL CLIENTE NO PUEDE AUTOCONCEDERSE PREMIUM ═════════════
console.log('A · el cliente no concede');
{
  ok('A.1 el ÚNICO gate de acceso sigue siendo features[key] === true',
    /return _aurixEnt\.features\[featureKey\] === true;/.test(fnSrc(app, 'hasFeature')) &&
    !/billing|stripe|checkout/i.test(fnSrc(app, 'hasFeature')));
  ok('A.2 ninguna función del cliente escribe plan/estado comercial',
    (() => {
      const client = fnSrc(app, '_aurixBillingCheckout') + fnSrc(app, '_aurixBillingPortal') +
                     fnSrc(app, '_aurixBillingReturnFlow') + fnSrc(app, '_aurixBillingPricesLoad');
      return !/_aurixEnt\s*=|\.features\s*\[[^\]]+\]\s*=|plan\s*=\s*'premium'/.test(client); })());
  ok('A.3 `?billing=success` NO concede: sólo fuerza una revalidación',
    (() => { const src = fnSrc(app, '_aurixBillingReturnFlow');
      return /_aurixEntitlementsLoad\(\{ force: true \}\)/.test(src)
        && /st\.plan === 'premium'/.test(src)
        && !/features\[/.test(src) && !/hasFeature\s*=/.test(src); })());
  ok('A.4 …y el parámetro se borra de la URL antes de cualquier otra cosa',
    /searchParams\.delete\('billing'\)[\s\S]{0,200}history\.replaceState/.test(fnSrc(app, '_aurixBillingReturnFlow')));
  ok('A.5 el checkout devuelve SIEMPRE false (su retorno no puede leerse como acceso)',
    (() => { const src = fnSrc(app, '_aurixBillingCheckout');
      return /return false;/.test(src) && !/return true/.test(src); })());
  ok('A.6 el navegador nunca ve una clave secreta',
    !/sk_live|sk_test|whsec_|STRIPE_SECRET_KEY|SERVICE_ROLE/.test(app) &&
    !/sk_live|sk_test|whsec_/.test(idx));
  ok('A.7 el endpoint sólo devuelve la URL de redirección, nada más',
    (() => { const tail = CO.slice(CO.indexOf('return res.status(200)'));
      return /res\.status\(200\)\.json\(\{ ok: true, url: s\.url \}\)/.test(tail)
        && !/customer:|price_|amount/.test(tail.split('\n')[0]); })());
}

// ══ B · WEBHOOK: AUTENTICIDAD ══════════════════════════════════════════════
console.log('\nB · webhook · autenticidad');
{
  const good = await callWebhook(SUB_EVENT());
  ok('B.1 un evento firmado correctamente se aplica',
    good.status === 200 && good.json && good.json.outcome === 'applied' && good.calls.length === 1,
    JSON.stringify(good.json));
  const bad = await callWebhook(SUB_EVENT(), { badSig: true });
  ok('B.2 firma inválida ⇒ 400 y CERO escrituras',
    bad.status === 400 && bad.json.error === 'bad_signature' && bad.calls.length === 0);
  const nosig = await callWebhook(SUB_EVENT(), { sigHeader: null });
  ok('B.3 sin cabecera de firma ⇒ 400 y cero escrituras',
    nosig.status === 400 && nosig.calls.length === 0);
  const other = await callWebhook(SUB_EVENT(), { secret: 'whsec_otro_proyecto' });
  ok('B.4 firmado con OTRO secreto (otro proyecto/atacante) ⇒ 400',
    other.status === 400 && other.calls.length === 0);
  // REPLAY: la firma es válida, la petición es vieja.
  const old = await callWebhook(SUB_EVENT(), { ts: Math.floor(Date.now() / 1000) - 3600 });
  ok('B.5 REPLAY de una petición legítima capturada ⇒ 400 por antigüedad',
    old.status === 400 && old.json.error === 'stale_signature' && old.calls.length === 0);
  // El cuerpo se firma BYTE A BYTE: alterarlo tras firmar invalida la firma.
  const tampered = await (async () => {
    const ev = SUB_EVENT();
    const rawGood = JSON.stringify(ev);
    const ts = Math.floor(Date.now() / 1000);
    const v1 = await sign(SECRET, ts, rawGood);
    const rawEvil = rawGood.replace('"status":"active"', '"status":"active" ');
    return callWebhook(null, { raw: rawEvil, sigHeader: `t=${ts},v1=${v1}` });
  })();
  ok('B.6 el cuerpo alterado DESPUÉS de firmar ⇒ 400 (se firma el byte, no el objeto)',
    tampered.status === 400 && tampered.calls.length === 0);
  // Rotación de secreto: Stripe envía varias v1 y basta una válida.
  const rotated = await (async () => {
    const ev = SUB_EVENT(); const raw = JSON.stringify(ev);
    const ts = Math.floor(Date.now() / 1000);
    const good2 = await sign(SECRET, ts, raw);
    return callWebhook(null, { raw, sigHeader: `t=${ts},v1=${'0'.repeat(64)},v1=${good2}` });
  })();
  ok('B.7 durante una rotación, varias firmas v1 y basta que UNA sea válida',
    rotated.status === 200 && rotated.json.outcome === 'applied');
  ok('B.8 la comparación de firmas es de tiempo constante',
    /let diff = 0;[\s\S]{0,200}diff \|=/.test(WH) && /function safeEqual/.test(WH));
  ok('B.9 se usa el runtime Edge para tener el cuerpo CRUDO (y se explica por qué)',
    /export const config = \{ runtime: 'edge' \}/.test(WH) &&
    /await request\.text\(\)/.test(WH) && /RAW BYTES/.test(WH));
  const unconf = await callWebhook(SUB_EVENT(), { env: { STRIPE_WEBHOOK_SECRET: '' } });
  ok('B.10 sin secreto configurado ⇒ 503, nunca un 200 sin verificar',
    unconf.status === 503 && unconf.calls.length === 0);
  const wrongMethod = await callWebhook(SUB_EVENT(), { method: 'GET' });
  ok('B.11 GET no es un webhook', wrongMethod.status === 405);
}

// ══ C · WEBHOOK: NO DECIDE NADA ════════════════════════════════════════════
console.log('\nC · webhook · extrae, no decide');
{
  const r = await callWebhook(SUB_EVENT());
  const call = r.calls[0];
  ok('C.1 llama al ÚNICO escritor, por RPC, con la clave de servicio',
    /\/rest\/v1\/rpc\/aurix_billing_apply_event$/.test(call.url) &&
    /Bearer service-key/.test(call.auth));
  ok('C.2 pasa los HECHOS del proveedor y ni plan ni importe ni divisa',
    (() => { const b = call.body;
      const keys = Object.keys(b).sort().join(',');
      return b.p_event_id === 'evt_1' && b.p_customer_id === 'cus_123'
        && b.p_price_id === 'price_annual_real' && b.p_status === 'active'
        && b.p_current_period_end === new Date(1780000000 * 1000).toISOString()
        && !/plan|amount|currency|price_cents/.test(keys); })(),
    JSON.stringify(call.body));
  ok('C.3 el código del webhook no contiene un mapa de precios ni un plan',
    !/'premium'/.test(WH) && !/799|5999|amount_cents/.test(WH));
  // Adjuntamos `metadata.aurix_user_id` al crear la sesión, y aquí NO se lee: si
  // se leyera, un usuario que consiguiera manipular esa metadata elegiría a quién
  // se le concede. La propiedad se comprueba sobre el CÓDIGO, sin comentarios.
  ok('C.4 no confía en la metadata que nosotros mismos adjuntamos',
    !/aurix_user_id/.test(noComments(WH)) &&
    !/metadata/.test(noComments(WH).slice(noComments(WH).indexOf('const payload'))));
  const del = await callWebhook(SUB_EVENT({ id: 'evt_del', type: 'customer.subscription.deleted',
    object: { status: 'active' } }));
  ok('C.5 una eliminación se transmite como CANCELADA, diga lo que diga el objeto',
    del.calls[0].body.p_status === 'canceled');
  const ignored = await callWebhook(SUB_EVENT({ id: 'evt_ck', type: 'checkout.session.completed' }));
  ok('C.6 `checkout.session.completed` NO concede: se registra y se ignora',
    ignored.status === 200 && ignored.json.outcome === 'ignored_type' &&
    ignored.calls[0].body.p_status === 'ignored' &&
    ignored.calls[0].body.p_price_id === null);
  const invoice = await callWebhook(SUB_EVENT({ id: 'evt_inv', type: 'invoice.payment_failed' }));
  ok('C.7 cualquier otro tipo también queda registrado y sin aplicar',
    invoice.json.outcome === 'ignored_type');
  const dup = await callWebhook(SUB_EVENT(), { rpcOutcome: 'duplicate' });
  ok('C.8 un evento DUPLICADO devuelve 200 con su resultado (no se reintenta eternamente)',
    dup.status === 200 && dup.json.outcome === 'duplicate');
  const unknownPrice = await callWebhook(SUB_EVENT(), { rpcOutcome: 'unknown_price' });
  ok('C.9 un precio desconocido es un RECHAZO final: 200, y no concede',
    unknownPrice.status === 200 && unknownPrice.json.outcome === 'unknown_price');
  const broken = await callWebhook(SUB_EVENT(), { rpcFail: true });
  ok('C.10 un fallo transitorio del escritor ⇒ 500 para que Stripe reintente',
    broken.status === 500);
  // ── LA FORMA DEL PAYLOAD ─────────────────────────────────────────────────
  // Desde `2025-04-30.basil` el periodo vive en los ITEMS, no en el objeto, y la
  // versión del payload la fija el ENDPOINT en el dashboard: no se puede asumir
  // ninguna de las dos. Leer sólo la vieja significaba `current_period_end` nulo
  // en una cuenta nueva ⇒ CHECK de B1 ⇒ excepción ⇒ 500 ⇒ reintento infinito con
  // el mismo payload: cobrado, sin Premium y sin rastro en el ledger.
  const newShape = await callWebhook(SUB_EVENT({ id: 'evt_new_shape', object: {
    current_period_start: undefined, current_period_end: undefined,
    items: { data: [{ price: { id: 'price_annual_real' },
                      current_period_start: 1750000000, current_period_end: 1780000000 }] },
  } }));
  ok('C.12 el periodo se lee del ITEM cuando el objeto ya no lo trae (API nueva)',
    newShape.calls[0].body.p_current_period_end === new Date(1780000000 * 1000).toISOString() &&
    newShape.calls[0].body.p_current_period_start === new Date(1750000000 * 1000).toISOString(),
    JSON.stringify(newShape.calls[0].body));
  const oldShape = await callWebhook(SUB_EVENT({ id: 'evt_old_shape' }));
  ok('C.12b y de la forma ANTIGUA cuando sí lo trae (las dos, no una)',
    oldShape.calls[0].body.p_current_period_end === new Date(1780000000 * 1000).toISOString());
  const noPeriod = await callWebhook(SUB_EVENT({ id: 'evt_noper', object: {
    current_period_start: undefined, current_period_end: undefined,
    items: { data: [{ price: { id: 'price_annual_real' } }] } } }), { rpcOutcome: 'missing_period' });
  ok('C.12c sin periodo en ninguna de las dos, el escritor lo RECHAZA con causa (y es reintentable)',
    noPeriod.calls[0].body.p_current_period_end === null &&
    noPeriod.status === 200 && noPeriod.json.outcome === 'missing_period');
  const testMode = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_test' }), { livemode: false }));
  ok('C.13 un evento de TEST no concede Premium real (salvo permiso explícito)',
    testMode.status === 200 && testMode.json.outcome === 'ignored_testmode' &&
    testMode.calls.length === 0);
  // El permiso exige además un deployment de TEST (clave `sk_test`/`rk_test`): en
  // LIVE la variable no tiene efecto. Lo afirma K2.3.
  const testAllowed = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_test2' }), { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1', STRIPE_SECRET_KEY: 'sk_test_x' } });
  ok('C.13b …y con el permiso puesto (compra de prueba del founder) sí se aplica',
    testAllowed.status === 200 && testAllowed.json.outcome === 'applied');
  ok('C.14 el log de un fallo del escritor no arrastra identificadores del proveedor',
    /function safeDetail/.test(WH) && /split\(\/DETAIL\|CONTEXT\|Failing row\/i\)/.test(WH) &&
    /safeDetail\(detail\)/.test(WH));
  const junk = await (async () => {
    const raw = '{"nope":true}'; const ts = Math.floor(Date.now() / 1000);
    return callWebhook(null, { raw, sigHeader: `t=${ts},v1=${await sign(SECRET, ts, raw)}` });
  })();
  ok('C.11 un payload firmado pero sin forma de evento ⇒ 400', junk.status === 400);
}

// ══ D · CHECKOUT: IDENTIDAD Y PRECIO ══════════════════════════════════════
console.log('\nD · checkout · identidad y precio de record');
{
  const mkRes = () => { const r = { code: 0, payload: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.code = c; return r; };
    r.json = (p) => { r.payload = p; return r; };
    r.end = () => r;
    return r; };
  async function callCheckout(o) {
    const opts = o || {};
    const calls = [];
    const env = Object.assign({
      STRIPE_SECRET_KEY: 'sk_test_x', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      SUPABASE_URL: 'https://db.test',
    }, opts.env || {});
    const fakeFetch = async (url, init) => {
      const u = String(url); calls.push({ url: u, init });
      if (u.includes('/auth/v1/user')) {
        return opts.user === null
          ? { ok: false, status: 401, json: async () => null }
          : { ok: true, status: 200, json: async () => (opts.user || { id: 'user-1', email: 'a@b.c' }) };
      }
      if (u.includes('/billing_prices')) {
        return { ok: true, status: 200, json: async () => (opts.prices !== undefined ? opts.prices
          : [{ provider_price_id: 'price_annual_real', amount_cents: 6999, currency: 'EUR',
               trial_days: 0, billing_interval: 'year' }]) };
      }
      // ── EL PRECIO EN EL PROVEEDOR (2b) ──────────────────────────────────
      // El checkout lee el precio en Stripe antes de abrir sesión, así que el
      // doble del proveedor tiene que servirlo. Por defecto coincide con el
      // catálogo; cada caso de desajuste lo altera a propósito.
      if (/api\.stripe\.com\/v1\/prices\//.test(u)) {
        if (opts.stripePrice === null) return { ok: false, status: 404, json: async () => ({ error: { code: 'resource_missing' } }) };
        if (opts.stripePrice === 'throw') throw new Error('network');
        // El doble coherente se DERIVA de la fila del catálogo que este mismo
        // fixture acaba de servir: así el caso normal no puede quedar verde por
        // una coincidencia de constantes, y el desajuste hay que pedirlo.
        const row = (opts.prices !== undefined ? opts.prices : [{ provider_price_id: 'price_annual_real',
          amount_cents: 6999, currency: 'EUR', trial_days: 0, billing_interval: 'year' }])[0] || {};
        return { ok: true, status: 200, json: async () => Object.assign({
          id: row.provider_price_id, active: true, livemode: false,
          unit_amount: Number(row.amount_cents), currency: String(row.currency || '').toLowerCase(),
          recurring: { interval: row.billing_interval, interval_count: 1 },
        }, opts.stripePrice || {}) };
      }
      if (u.includes('/billing_customers')) {
        // El DESENLACE de un mapeo obsoleto es un DELETE acotado por usuario.
        if (((init && init.method) || 'GET').toUpperCase() === 'DELETE') {
          return { ok: !opts.unlinkFails, status: opts.unlinkFails ? 403 : 204, json: async () => null };
        }
        return { ok: true, status: 200, json: async () => (opts.customers || []) };
      }
      // Fila propia de `subscriptions` (vía PostgREST).
      if (u.includes('/rest/v1/subscriptions')) {
        return { ok: true, status: 200, json: async () => (opts.ownSub || []) };
      }
      // Suscripciones vivas EN EL PROVEEDOR (la carrera del doble cargo).
      if (u.includes('api.stripe.com/v1/subscriptions')) {
        return opts.providerSubsFail
          ? { ok: false, status: 503, json: async () => null }
          : { ok: true, status: 200, json: async () => ({ data: opts.providerSubs || [] }) };
      }
      if (u.includes('api.stripe.com/v1/customers')) {
        // La LECTURA de un cliente concreto (3a) y la CREACIÓN son dos cosas
        // distintas, y el defecto del cutover sólo aparece en la primera.
        const isLookup = ((init && init.method) || 'GET').toUpperCase() === 'GET';
        if (isLookup) {
          const mode = opts.customerLookup || 'found';
          if (mode === 'missing') return { ok: false, status: 404, json: async () => ({ error: { code: 'resource_missing' } }) };
          if (mode === 'deleted') return { ok: true, status: 200, json: async () => ({ id: 'cus_old', deleted: true }) };
          if (mode === 'error')   return { ok: false, status: 500, json: async () => null };
          if (mode === 'throw')   throw new Error('network');
          return { ok: true, status: 200, json: async () => ({ id: 'cus_old' }) };
        }
        return { ok: true, status: 200, json: async () => ({ id: 'cus_new' }) };
      }
      if (u.includes('rpc/aurix_billing_link_customer')) {
        return { ok: opts.linkFails ? false : true, status: opts.linkFails ? 409 : 200, json: async () => 'cus_new' };
      }
      if (u.includes('checkout/sessions')) {
        return opts.sessionFails
          ? { ok: false, status: 400, json: async () => ({ error: { type: 'invalid_request_error',
              code: 'resource_missing',
              message: 'No such price: price_annual_real; a similar object exists in test mode, key sk_test_x' } }) }
          : { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/s/1' }) };
      }
      return { ok: false, status: 404, json: async () => null };
    };
    const { handler } = loadHandler(CO, { process: { env }, fetch: fakeFetch });
    const req = { method: opts.method || 'POST',
      headers: Object.assign({ origin: opts.origin || 'https://app.aurixsystem.io',
        authorization: opts.token === null ? '' : ('Bearer ' + (opts.token || 'x'.repeat(40))) }, opts.headers || {}),
      body: opts.body || { interval: 'year' } };
    const res = mkRes();
    await handler(req, res);
    return { res, calls };
  }

  const okCall = await callCheckout({});
  ok('D.1 un usuario autenticado obtiene una URL de checkout',
    okCall.res.code === 200 && okCall.res.payload.ok === true &&
    /checkout\.stripe\.com/.test(okCall.res.payload.url));
  ok('D.2 el precio enviado a Stripe es el del CATÁLOGO, no el del body',
    (() => { const sess = okCall.calls.find(c => c.url.includes('checkout/sessions'));
      const b = decodeBody(sess.init.body);
      return b.includes('line_items[0][price]=price_annual_real')
        && !/unit_amount|amount_cents|\bcurrency\b/.test(b); })(),
    String((okCall.calls.find(c => c.url.includes('checkout/sessions')) || {}).init.body).slice(0, 300));
  const forged = await callCheckout({ body: { interval: 'year', price: 'price_evil',
    amount_cents: 1, currency: 'XXX', user_id: 'otro', plan: 'premium' } });
  ok('D.3 un body que intenta nombrar precio, importe, divisa o USUARIO se ignora por completo',
    (() => { const sess = forged.calls.find(c => c.url.includes('checkout/sessions'));
      const b = decodeBody(sess.init.body);
      return forged.res.code === 200 && b.includes('price_annual_real')
        && !b.includes('price_evil') && !b.includes('XXX')
        && b.includes('client_reference_id=user-1') && !b.includes('otro'); })());
  const noTok = await callCheckout({ token: null });
  ok('D.4 sin token ⇒ 401 y no se habla con el proveedor',
    noTok.res.code === 401 && !noTok.calls.some(c => c.url.includes('api.stripe.com')));
  const badTok = await callCheckout({ user: null });
  ok('D.5 un token que Supabase no reconoce ⇒ 401',
    badTok.res.code === 401 && !badTok.calls.some(c => c.url.includes('api.stripe.com')));
  const badOrigin = await callCheckout({ origin: 'https://evil.example' });
  ok('D.6 origen no permitido ⇒ 403', badOrigin.res.code === 403);
  const unconf = await callCheckout({ env: { STRIPE_SECRET_KEY: '' } });
  ok('D.7 sin secreto ⇒ 503 `billing_unconfigured` (y el paywall lo dice honestamente)',
    unconf.res.code === 503 && unconf.res.payload.error === 'billing_unconfigured');
  const noPrice = await callCheckout({ prices: [] });
  ok('D.8 sin precio en el catálogo ⇒ 503 y CERO sesiones creadas',
    noPrice.res.code === 503 && noPrice.res.payload.error === 'price_unavailable' &&
    !noPrice.calls.some(c => c.url.includes('checkout/sessions')));
  const monthly = await callCheckout({ body: { interval: 'month' },
    prices: [{ provider_price_id: 'price_monthly_real', amount_cents: 799, currency: 'EUR',
               trial_days: 0, billing_interval: 'month' }] });
  ok('D.9 mensual y anual son dos precios del catálogo, no dos ramas de código',
    monthly.res.code === 200 &&
    decodeBody(monthly.calls.find(c => c.url.includes('checkout/sessions')).init.body)
      .includes('price_monthly_real') &&
    monthly.calls.some(c => c.url.includes('billing_interval=eq.month')));
  const junkInterval = await callCheckout({ body: { interval: 'decade' } });
  ok('D.10 un intervalo inventado cae al anual, no a un precio arbitrario',
    junkInterval.calls.some(c => c.url.includes('billing_interval=eq.year')));
  // ── EL DEFECTO DEL CUTOVER A LIVE, Y SU ARREGLO ─────────────────────────
  // Un `cus_…` creado en TEST no existe para una clave LIVE. Antes, quien lo
  // descubría era el guard anti-doble-cargo, que falla CERRADO: toda cuenta con
  // mapeo de TEST —las de QA y la del founder, que son las que harán la primera
  // compra real— quedaba sin poder comprar, con un 503 que además parece un
  // problema de pago. Un cliente que no existe no tiene suscripciones, así que
  // ahí no hay doble cargo que proteger: el mapeo se retira y se crea uno nuevo.
  {
    const MAPPED = [{ provider_customer_id: 'cus_old' }];
    const stale = await callCheckout({ customers: MAPPED, customerLookup: 'missing' });
    ok('D.21 un mapeo de cliente que NO existe en este modo no bloquea la compra',
      stale.res.code === 200 && stale.res.payload.ok === true,
      JSON.stringify(stale.res.payload));
    ok('D.21b …se retira el mapeo obsoleto, acotado a ESE usuario, y se crea uno nuevo',
      (() => { const del = stale.calls.find(c => c.url.includes('/billing_customers') &&
                 ((c.init && c.init.method) || '').toUpperCase() === 'DELETE');
        return !!del && del.url.includes('user_id=eq.user-1') && del.url.includes('provider=eq.stripe')
          && stale.calls.some(c => c.url.includes('rpc/aurix_billing_link_customer')); })(),
      JSON.stringify(stale.calls.filter(c => c.url.includes('billing_customers')).map(c => ((c.init&&c.init.method)||'GET') + ' ' + c.url)));
    ok('D.21c …y la sesión se abre para el cliente NUEVO, nunca para el obsoleto',
      (() => { const sess = stale.calls.find(c => c.url.includes('checkout/sessions'));
        const b = decodeBody(sess.init.body);
        return b.includes('customer=cus_new') && !b.includes('cus_old'); })());
    const deleted = await callCheckout({ customers: MAPPED, customerLookup: 'deleted' });
    ok('D.21d un cliente BORRADO en el proveedor cuenta igual que uno inexistente',
      deleted.res.code === 200 && deleted.calls.some(c => c.url.includes('/billing_customers') &&
        ((c.init && c.init.method) || '').toUpperCase() === 'DELETE'));
    // Y la distinción que hace segura la reparación: un fallo de TRANSPORTE no
    // invalida un mapeo. Borrarlo ahí sería crear un cliente nuevo por cada
    // hipo de red, y con él la posibilidad de una segunda suscripción.
    const netErr = await callCheckout({ customers: MAPPED, customerLookup: 'error' });
    ok('D.22 un error transitorio del proveedor NO retira el mapeo',
      !netErr.calls.some(c => c.url.includes('/billing_customers') &&
        ((c.init && c.init.method) || '').toUpperCase() === 'DELETE'),
      String(netErr.res.code));
    const thrown = await callCheckout({ customers: MAPPED, customerLookup: 'throw' });
    ok('D.22b tampoco lo retira una excepción de red',
      !thrown.calls.some(c => c.url.includes('/billing_customers') &&
        ((c.init && c.init.method) || '').toUpperCase() === 'DELETE'));
    // Si el desenlace no se puede escribir, se para: crear un cliente nuevo con
    // el mapeo viejo intacto dejaría dos clientes para un usuario.
    const cantUnlink = await callCheckout({ customers: MAPPED, customerLookup: 'missing', unlinkFails: true });
    ok('D.23 si el mapeo obsoleto no se puede retirar, NO se crea un segundo cliente',
      cantUnlink.res.code === 503 && !cantUnlink.calls.some(c => c.url.includes('checkout/sessions'))
      && !cantUnlink.calls.some(c => c.url.includes('api.stripe.com/v1/customers') &&
           ((c.init && c.init.method) || 'GET').toUpperCase() === 'POST'),
      JSON.stringify(cantUnlink.res.payload));
    // Y el camino normal no cambia: un mapeo VÁLIDO se reutiliza sin tocar nada.
    const fine = await callCheckout({ customers: MAPPED, customerLookup: 'found' });
    ok('D.24 un mapeo válido se reutiliza: ni se borra, ni se crea otro cliente',
      fine.res.code === 200
      && !fine.calls.some(c => c.url.includes('/billing_customers') && ((c.init && c.init.method) || '').toUpperCase() === 'DELETE')
      && !fine.calls.some(c => c.url.includes('api.stripe.com/v1/customers') && ((c.init && c.init.method) || 'GET').toUpperCase() === 'POST')
      && decodeBody(fine.calls.find(c => c.url.includes('checkout/sessions')).init.body).includes('customer=cus_old'));
  }

  ok('D.11 la creación de cliente es idempotente por usuario (doble click ⇒ un cliente)',
    (() => { const c = okCall.calls.find(x => x.url.includes('api.stripe.com/v1/customers'));
      return !!c && (c.init.headers['Idempotency-Key'] || '').includes('user-1'); })());
  const existing = await callCheckout({ customers: [{ provider_customer_id: 'cus_old' }] });
  // Ahora SÍ hay una llamada a `/v1/customers` con un mapeo presente: es la
  // LECTURA de 3a, que comprueba que el cliente existe en este modo. Lo que D.12
  // protege —y sigue protegiendo— es que no se CREE un segundo cliente.
  ok('D.12 con cliente ya mapeado NO se crea otro (la lectura de 3a no cuenta)',
    !existing.calls.some(c => c.url.includes('api.stripe.com/v1/customers') &&
      ((c.init && c.init.method) || 'GET').toUpperCase() === 'POST') &&
    decodeBody(existing.calls.find(c => c.url.includes('checkout/sessions')).init.body).includes('customer=cus_old'));
  // ── EL DOBLE CARGO ────────────────────────────────────────────────────────
  const dupOwn = await callCheckout({ ownSub: [{ plan: 'premium', status: 'active' }] });
  ok('D.18 con una suscripción ya vigente NO se abre otra sesión (409)',
    dupOwn.res.code === 409 && dupOwn.res.payload.error === 'already_subscribed' &&
    !dupOwn.calls.some(c => c.url.includes('checkout/sessions')));
  const dupRace = await callCheckout({ ownSub: [], providerSubs: [{ status: 'active' }] });
  ok('D.19 …y también si la suscripción existe en el PROVEEDOR y el webhook aún no ha llegado',
    dupRace.res.code === 409 && !dupRace.calls.some(c => c.url.includes('checkout/sessions')));
  // Y la excepción, que es lo contrario de lo que parece: un `incomplete` es una
  // suscripción creada cuyo primer pago NUNCA se cobró (3DS abandonado). Bloquear
  // ahí no evita un doble cargo y deja al usuario sin ruta ninguna —el paywall le
  // ofrece comprar, el checkout responde 409 y el portal no aplica porque su fila
  // queda en plan free— hasta que Stripe lo expira, ~23 h después.
  const dupIncomplete = await callCheckout({ providerSubs: [{ status: 'incomplete' }] });
  ok('D.20 un 3DS fallido (incomplete) NO bloquea reintentar: nunca hubo cargo',
    dupIncomplete.res.code === 200 &&
    dupIncomplete.calls.some(c => c.url.includes('checkout/sessions')));
  const dupUnpaid = await callCheckout({ providerSubs: [{ status: 'unpaid' }] });
  ok('D.20b …pero un `unpaid` sí bloquea: ahí hay una suscripción que cobrar o cancelar',
    dupUnpaid.res.code === 409);
  const checkFail = await callCheckout({ providerSubsFail: true });
  ok('D.21 si NO se puede comprobar, se falla CERRADO: mejor reintentar que cobrar dos veces',
    checkFail.res.code === 503 && checkFail.res.payload.error === 'check_failed' &&
    !checkFail.calls.some(c => c.url.includes('checkout/sessions')));
  ok('D.21b y el cliente distingue "no se pudo comprobar" de "todavía no se puede comprar"',
    (() => { const src = fnSrc(app, '_aurixBillingCheckout');
      return src.indexOf("j.error === 'check_failed'") < src.indexOf("r.status === 503"); })());
  ok('D.22 la versión de API de nuestras llamadas está FIJADA',
    (() => { const c = okCall.calls.find(x => x.url.includes('checkout/sessions'));
      return !!(c.init.headers['Stripe-Version'] || '').match(/^\d{4}-\d{2}-\d{2}/); })());
  const conflict = await callCheckout({ linkFails: true });
  ok('D.13 si el cliente ya pertenece a OTRO usuario, se aborta (no se re-apunta)',
    conflict.res.code === 409 &&
    !conflict.calls.some(c => c.url.includes('checkout/sessions')));
  ok('D.14 sin cupones ni códigos promocionales: no hay precio fuera del catálogo',
    (() => { const b = decodeBody(okCall.calls.find(c => c.url.includes('checkout/sessions')).init.body);
      return b.includes('allow_promotion_codes=false'); })());
  ok('D.15 el trial sale del catálogo (0 ⇒ no se envía), nunca de una constante del código',
    (() => { const b = decodeBody(okCall.calls.find(c => c.url.includes('checkout/sessions')).init.body);
      return !b.includes('trial_period_days') && /Number\(price\.trial_days\)/.test(CO)
        && !/trial_period_days: 14|trial_days = 14/.test(CO); })());
  const withTrial = await callCheckout({ prices: [{ provider_price_id: 'price_annual_real',
    amount_cents: 6999, currency: 'EUR', trial_days: 14, billing_interval: 'year' }] });
  ok('D.16 …y con 14 días en el catálogo, el trial viaja al proveedor',
    decodeBody(withTrial.calls.find(c => c.url.includes('checkout/sessions')).init.body)
      .includes('subscription_data[trial_period_days]=14'));
  // ══ LO QUE SE MUESTRA ES LO QUE SE COBRA, O NO SE COBRA ════════════════
  // El catálogo decide DOS cosas que hasta ahora nadie contrastaba entre sí: el
  // importe que el paywall PINTA y el precio que Stripe COBRA. Son dos columnas
  // de la misma fila y basta con que una se actualice sin la otra —justo lo que
  // pasa al cambiar de precio, porque los dos valores viajan por caminos
  // distintos— para que la pantalla anuncie un importe y el cargo sea otro.
  // Estos asserts fijan que ningún desajuste llega a cobrar.
  const badAmount = await callCheckout({ stripePrice: { unit_amount: 5999 } });
  ok('D.25 si Stripe cobraría OTRO importe, no se abre sesión (409, y cero sesiones)',
    badAmount.res.code === 409 && badAmount.res.payload.error === 'price_mismatch' &&
    badAmount.res.payload.fields.includes('amount') &&
    !badAmount.calls.some(c => c.url.includes('checkout/sessions')),
    JSON.stringify(badAmount.res.payload));
  const badCur = await callCheckout({ stripePrice: { currency: 'usd' } });
  ok('D.26 una divisa distinta de la anunciada tampoco se cobra',
    badCur.res.code === 409 && badCur.res.payload.fields.includes('currency') &&
    !badCur.calls.some(c => c.url.includes('checkout/sessions')));
  const badRec = await callCheckout({ stripePrice: { recurring: { interval: 'month', interval_count: 1 } } });
  ok('D.27 un precio ANUAL que en Stripe es mensual se rechaza (o se cobraría 12 veces)',
    badRec.res.code === 409 && badRec.res.payload.fields.includes('recurrence'));
  const inactive = await callCheckout({ stripePrice: { active: false } });
  ok('D.28 un precio archivado en Stripe no se vende',
    inactive.res.code === 409 && inactive.res.payload.fields.includes('inactive'));
  // El desajuste de ENTORNO es el que este cutover tiene que impedir: un precio
  // de TEST con una clave LIVE no falla al configurarlo, falla al cobrar.
  const badMode = await callCheckout({ env: { STRIPE_SECRET_KEY: 'sk_live_x' },
    stripePrice: { livemode: false } });
  ok('D.29 un precio de TEST con una clave LIVE es un desajuste de entorno, no un detalle',
    badMode.res.code === 409 && badMode.res.payload.fields.includes('mode'));
  const unreadable = await callCheckout({ stripePrice: null });
  ok('D.30 no poder comprobar el precio NO es poder cobrarlo: 503 y cero sesiones',
    unreadable.res.code === 503 &&
    unreadable.res.payload.error === 'price_verification_unavailable' &&
    !unreadable.calls.some(c => c.url.includes('checkout/sessions')));
  const throwing = await callCheckout({ stripePrice: 'throw' });
  ok('D.31 …y un fallo de red en esa comprobación se trata igual, no se ignora',
    throwing.res.code === 503 && throwing.res.payload.error === 'price_verification_unavailable');
  // Y se comprueba ANTES de crear cliente: un desajuste no debe dejar rastro en
  // el proveedor ni en nuestro mapeo.
  ok('D.32 el desajuste se detecta antes de crear cliente: no se escribe nada en el proveedor',
    !badAmount.calls.some(c => c.url.includes('api.stripe.com/v1/customers') &&
      ((c.init && c.init.method) || 'GET').toUpperCase() === 'POST') &&
    !badAmount.calls.some(c => c.url.includes('rpc/aurix_billing_link_customer')));
  // El importe aprobado que el diagnóstico contrasta es el VIGENTE, y el anterior
  // no sobrevive en ninguna ruta activa.
  ok('D.33 el precio anual aprobado es 69,99 € y 59,99 € no queda en ninguna ruta activa',
    /amount_cents: 6999/.test(ST) && !/5999/.test(ST) && !/5999/.test(CO),
    (ST.match(/amount_cents: \d+/g) || []).join(' '));

  // Un rechazo del proveedor era OPACO: mismo cuerpo para "falló crear el
  // customer" y "falló crear la sesión", así que la causa sólo vivía en los logs
  // de la plataforma. Ahora se publica DÓNDE falló y el código PÚBLICO de Stripe,
  // y nada más: ni la clave, ni el mensaje (que puede citarla), ni el objeto.
  const sessFail = await callCheckout({ sessionFails: true });
  ok('D.19 un rechazo de Stripe publica dónde falló y su código público, y NADA más',
    sessFail.res.code === 502 && sessFail.res.payload &&
    sessFail.res.payload.error === 'provider_error' &&
    sessFail.res.payload.at === 'session' &&
    sessFail.res.payload.stripe_status === 400 &&
    sessFail.res.payload.stripe_code === 'resource_missing' &&
    !/sk_test|No such price/.test(JSON.stringify(sessFail.res.payload)),
    JSON.stringify(sessFail.res.payload));
  // Y la configuración que produjo ese 403 en producción: una PUBLISHABLE key en
  // `STRIPE_SECRET_KEY`. Se declara inválida ANTES de llamar al proveedor.
  const pubKey = await callCheckout({ env: { STRIPE_SECRET_KEY: 'pk_test_x' } });
  ok('D.20 una publishable key es configuración inválida y NO se llama a Stripe',
    pubKey.res.code === 503 && pubKey.res.payload &&
    pubKey.res.payload.error === 'billing_unconfigured' &&
    !pubKey.calls.some(c => c.url.includes('api.stripe.com')),
    JSON.stringify(pubKey.res.payload));
  // Una restringida `rk_` SÍ es secret-side, y los espacios de un copiar-pegar no
  // pueden convertirse en un rechazo del proveedor.
  const rkKey = await callCheckout({ env: { STRIPE_SECRET_KEY: '  rk_test_x\n' } });
  ok('D.22 una `rk_` con espacios es válida y la clave viaja recortada',
    rkKey.res.code === 200 &&
    (rkKey.calls.find(c => c.url.includes('api.stripe.com/v1/customers')) || { init: { headers: {} } })
      .init.headers.Authorization === 'Bearer rk_test_x',
    String(rkKey.res.code));
  // PORTAL — la ruta de cancelación.
  ok('D.17 el portal resuelve el cliente del USUARIO autenticado, no de un body',
    /billing_customers[\s\S]{0,120}user_id=eq\.\$\{user\.id\}/.test(PO) &&
    /if \(!customerId\) return res\.status\(404\)/.test(PO) &&
    !/req\.body[\s\S]{0,40}customer/.test(PO));
}

// ══ P · EL PORTAL: CAMBIAR DE PLAN, CANCELAR Y LOS CAMBIOS DIFERIDOS ══════
// El portal de Stripe es una superficie que NO controlamos y que puede cambiar
// la suscripción por su cuenta: mensual↔anual, cancelar a fin de periodo y
// —si está configurado así— programar el cambio para más adelante con un
// `subscription_schedule`. La pregunta que hay que responder con pruebas no es
// «¿funciona el portal?» sino «¿qué hace Aurix cuando el portal ya ha actuado?».
console.log('\nP · portal · cambio de plan, cancelación y cambios diferidos');
{
  // 1 · CAMBIO DE PLAN. Llega como `customer.subscription.updated` con OTRO
  // precio; lo que el webhook manda a la base es el precio NUEVO, no el de la
  // compra original. Si mandara el viejo, un usuario que pasa a anual seguiría
  // figurando como mensual y su periodo de validez sería el equivocado.
  const swap = await callWebhook(SUB_EVENT({ id: 'evt_swap', object: {
    items: { data: [{ price: { id: 'price_monthly_real' } }] },
    current_period_end: 1790000000 } }));
  const swapBody = (swap.calls[0] || {}).body || {};
  ok('P.1 un cambio de plan en el portal viaja con el precio NUEVO y su nuevo periodo',
    swap.status === 200 && swapBody.p_price_id === 'price_monthly_real' &&
    swapBody.p_event_type === 'customer.subscription.updated' &&
    /1790000000|2026|2027/.test(String(swapBody.p_current_period_end)),
    JSON.stringify({ price: swapBody.p_price_id, end: swapBody.p_current_period_end }));

  // 2 · CANCELACIÓN A FIN DE PERIODO. Es lo que el portal hace por defecto, y es
  // la promesa comercial: «cancelas y conservas hasta que acabe lo pagado».
  const cancelAtEnd = await callWebhook(SUB_EVENT({ id: 'evt_cae', object: {
    status: 'active', cancel_at_period_end: true } }));
  const caeBody = (cancelAtEnd.calls[0] || {}).body || {};
  ok('P.2 cancelar a fin de periodo se transmite como tal, con el estado AÚN activo',
    cancelAtEnd.status === 200 && caeBody.p_cancel_at_period_end === true &&
    caeBody.p_status === 'active', JSON.stringify(caeBody.p_status + '/' + caeBody.p_cancel_at_period_end));
  // Y el escritor no lo usa para degradar: la bandera se GUARDA, pero el plan lo
  // decide el `status`. Si `cancel_at_period_end` degradara, cancelar el día 2 de
  // un anual quitaría Premium once meses antes de tiempo.
  ok('P.3 …y el escritor no degrada por esa bandera: el plan lo decide el estado',
    /cancel_at_period_end\s*=\s*excluded\.cancel_at_period_end/.test(SQL) &&
    !/if\s+.{0,40}p_cancel_at_period_end[\s\S]{0,200}v_plan\s*:=\s*'free'/.test(SQL));
  // La baja EFECTIVA sí degrada, y llega por su propio evento.
  const deleted = await callWebhook(SUB_EVENT({ id: 'evt_del', type: 'customer.subscription.deleted' }));
  ok('P.4 la baja efectiva llega por `deleted` y se transmite como cancelada',
    deleted.status === 200 && ((deleted.calls[0] || {}).body || {}).p_status === 'canceled');

  // 3 · CAMBIOS DIFERIDOS (subscription schedules). Aurix NO escucha
  // `subscription_schedule.*` — y no debe empezar a hacerlo a ciegas: un cambio
  // PROGRAMADO todavía no ha ocurrido, así que aplicarlo al recibirlo sería
  // ADELANTAR el plan. Lo que importa es que el evento se ignore de forma
  // REGISTRADA (no silenciosa) y que el cambio llegue cuando de verdad ocurre,
  // por el `customer.subscription.updated` de la transición.
  const sched = await callWebhook(SUB_EVENT({ id: 'evt_sched', type: 'subscription_schedule.updated' }));
  ok('P.5 un cambio PROGRAMADO no se aplica al anunciarse: se ignora y queda registrado',
    sched.status === 200 && sched.json && sched.json.outcome === 'ignored_type' &&
    sched.calls.length === 1 && /aurix_billing_record_ignored|p_status.*ignored|ignored/.test(JSON.stringify(sched.calls[0].body)),
    JSON.stringify({ outcome: sched.json && sched.json.outcome, calls: sched.calls.length }));

  // 4 · AURIX NO PISA LO QUE EL PORTAL CREA. La única forma de sobrescribir un
  // schedule del portal sería que Aurix escribiera suscripciones o schedules en
  // el proveedor. No lo hace por ninguna ruta: sólo crea sesiones de checkout,
  // sesiones de portal y clientes. Esto es estructural, así que se fija leyendo
  // TODO el código de billing en vez de probar un caso.
  const BILLING_SRC = CO + PO + ST;
  ok('P.6 Aurix nunca escribe suscripciones ni schedules en el proveedor (no puede pisar al portal)',
    !/method:\s*'POST'[\s\S]{0,400}\/v1\/subscriptions|stripe\('\/subscriptions/.test(BILLING_SRC) &&
    !/subscription_schedules/.test(BILLING_SRC) &&
    !/\/v1\/subscriptions\/[^'"`]*['"`],\s*\{/.test(BILLING_SRC),
    'rutas de escritura encontradas en el código de billing');
  // Lo único que Aurix LEE de suscripciones es la comprobación anti-doble-cargo.
  ok('P.7 …y lo único que lee de suscripciones es el guard anti-doble-cargo, con GET',
    (() => { const m = CO.match(/stripeGet\(`?\/subscriptions[^)]*\)/g) || [];
      return m.length >= 1 && !/\bstripe\(`?'?\/subscriptions/.test(CO); })(),
    (CO.match(/stripeGet\(`?\/subscriptions[^)]*\)/g) || []).join(' '));
  // El portal es de SÓLO IDA: abre la sesión y nada más. No escribe estado.
  // Se mira el CÓDIGO, no los comentarios: la cabecera de `_portal.js` explica
  // precisamente que el webhook es quien escribe `subscriptions`, y una búsqueda
  // ingenua confundiría esa frase con una escritura.
  const PO_CODE = noComments(PO);
  ok('P.8 abrir el portal no escribe estado comercial en ningún sitio',
    !/billing_prices|rest\/v1\/subscriptions|aurix_billing_apply_event|entitlement/i.test(PO_CODE) &&
    /billing_portal\/sessions/.test(PO_CODE));
}

// ══ E · SQL: EL ESCRITOR ÚNICO ════════════════════════════════════════════
console.log('\nE · SQL · escritor único, idempotente y cerrado');
{
  ok('E.1 la idempotencia es la INSERCIÓN en el ledger, en la misma transacción',
    /insert into public\.billing_events[\s\S]{0,400}on conflict \(provider, event_id\) do nothing;[\s\S]{0,400}if not found then/.test(SQL));
  // La idempotencia es sobre lo APLICADO. Un rechazo recuperable (customer sin
  // mapear, precio que faltaba) debe poder REINTENTARSE con el mismo event id, o
  // una compra cobrada se pierde para siempre.
  ok('E.1b sólo un evento APLICADO es definitivo; un rechazo se puede reintentar',
    /for update;[\s\S]{0,120}if v_ev\.applied then[\s\S]{0,120}'duplicate'/.test(SQL) &&
    /'received', false\)/.test(SQL));
  ok('E.1c y dos reintentos concurrentes se serializan sobre la fila del ledger',
    /select \* into v_ev from public\.billing_events be[\s\S]{0,200}for update;/.test(SQL));
  ok('E.2 el USUARIO se resuelve del mapeo de cliente, nunca de un argumento de usuario',
    /from public\.billing_customers bc[\s\S]{0,160}bc\.provider_customer_id = p_customer_id/.test(SQL) &&
    !/p_user_id/.test(sqlFn(SQL, 'aurix_billing_apply_event')));
  ok('E.3 cliente desconocido ⇒ no se escribe suscripción',
    /'unknown_customer'/.test(SQL) &&
    SQL.indexOf("'unknown_customer'") < SQL.indexOf('insert into public.subscriptions'));
  ok('E.4 plan, intervalo, importe y divisa salen de billing_prices',
    /from public\.billing_prices bp[\s\S]{0,200}bp\.provider_price_id = p_price_id/.test(SQL) &&
    /v_plan := v_price\.plan;/.test(SQL) &&
    /v_price\.billing_interval/.test(SQL) && /v_price\.amount_cents/.test(SQL) &&
    /upper\(v_price\.currency\)/.test(SQL));
  ok('E.5 precio desconocido con estado vivo ⇒ RECHAZO, no un premium sin precio',
    /v_price\.provider_price_id is null[\s\S]{0,200}'unknown_price'/.test(SQL));
  // Un status desconocido DEGRADA en vez de congelar: rechazar y salir dejaba la
  // fila premium intacta, así que un `paused` conservaba acceso hasta fin de
  // periodo. Fail-open por congelación.
  ok('E.6 un estado desconocido degrada a Free y queda dicho; no congela el acceso',
    /v_status not in \('active','trialing','past_due','canceled','expired','incomplete'\)[\s\S]{0,240}v_outcome := 'unknown_status';[\s\S]{0,80}v_plan    := 'free';/.test(SQL) &&
    /v_status = ''[\s\S]{0,200}'invalid_payload'/.test(SQL));
  ok('E.6b un premium vivo SIN fecha de fin se rechaza con causa, no revienta el CHECK',
    /p_current_period_end is null[\s\S]{0,260}'missing_period'/.test(SQL) &&
    /v_status = 'trialing' and p_trial_end is null[\s\S]{0,200}'missing_period'/.test(SQL));
  ok('E.6c un empate de segundo se desempata por el ciclo de vida del evento',
    /v_rank := case p_event_type[\s\S]{0,260}'customer\.subscription\.deleted' then 3/.test(SQL) &&
    /v_at = v_prev\.last_event_at and v_prev_rank is not null[\s\S]{0,60}v_rank < v_prev_rank/.test(SQL));
  ok('E.6d la cancelación de OTRA suscripción no apaga la que está vigente',
    /p_subscription_id <> v_prev\.provider_subscription_id[\s\S]{0,200}'other_subscription'/.test(SQL));
  ok('E.6e el guard del upsert compara TAMBIÉN el provider (M.04B no puede saltarse la escritura)',
    /s\.provider is distinct from excluded\.provider/.test(SQL));
  ok('E.6f los tipos ignorados se registran como tales, no como un incidente de mapeo',
    (() => { const f = sqlFn(SQL, 'aurix_billing_apply_event');
      return /if p_status = 'ignored' then[\s\S]{0,200}'ignored_type'/.test(f)
        && f.indexOf("'ignored_type'") < f.indexOf("'unknown_customer'"); })());
  ok('E.7 `incomplete` (primer pago sin liquidar) NO concede',
    /if v_status = 'incomplete' then[\s\S]{0,120}v_plan\s*:= 'free'/.test(SQL));
  ok('E.8 entrega desordenada: un evento más viejo que el último aplicado se rechaza',
    /v_at < v_prev\.last_event_at[\s\S]{0,200}'stale'/.test(SQL));
  ok('E.9 el escritor es SÓLO service_role',
    /grant\s+execute on function public\.aurix_billing_apply_event\([\s\S]{0,200}to\s+service_role;/.test(SQL) &&
    /revoke all\s+on function public\.aurix_billing_apply_event\([\s\S]{0,200}from public, anon, authenticated;/.test(SQL));
  ok('E.10 las tablas sensibles niegan al cliente por privilegios Y por política',
    ['billing_customers', 'billing_events'].every(tbl =>
      new RegExp('revoke all on public\\.' + tbl + ' from anon, authenticated;').test(SQL) &&
      new RegExp('create policy ' + tbl + '_no_client[\\s\\S]{0,200}as restrictive[\\s\\S]{0,120}using\\s+\\(false\\)').test(SQL)));
  ok('E.11 el catálogo de precios es legible pero NO escribible por el cliente',
    /grant\s+select on public\.billing_prices to\s+authenticated;/.test(SQL) &&
    /revoke all\s+on public\.billing_prices from anon, authenticated;/.test(SQL) &&
    !/grant (insert|update|all) on public\.billing_prices to\s+(anon|authenticated)/.test(SQL));
  ok('E.12 un cliente de proveedor no puede pertenecer a dos usuarios',
    /create unique index if not exists billing_customers_handle_uidx[\s\S]{0,160}\(provider, provider_customer_id\)/.test(SQL) &&
    /already linked to another user/.test(SQL));
  ok('E.13 un precio de 0 no es vendible (un comp no se lava como una venta)',
    /billing_prices_amount_chk[\s\S]{0,80}amount_cents > 0/.test(SQL));
  ok('E.14 sólo se puede vender un plan que el catálogo de features conoce',
    /billing_prices_plan_chk[\s\S]{0,80}plan in \('premium'\)/.test(SQL));
  ok('E.15 un solo precio ACTIVO por plan e intervalo (sin ambigüedad de catálogo)',
    /create unique index if not exists billing_prices_active_uidx[\s\S]{0,160}where active/.test(SQL));
  ok('E.16 no se modifica B1/B2: ni el resolver ni las tablas de verdad comercial',
    !/create or replace function public\.aurix_entitlements/.test(SQL) &&
    !/alter table public\.subscriptions/.test(SQL) &&
    !/drop (table|function) if exists public\.(subscriptions|plan_features|entitlement_overrides|aurix_entitlements)/.test(SQL));
  // RE-DECIDIDO (2026-09-23): el anual pasa de 59,99 € a 69,99 €. Lo que el assert
  // protege no es la cifra por la cifra, sino que el importe canónico viva EN
  // CÉNTIMOS y EN EUR dentro del SQL que siembra el catálogo — la alternativa
  // (leerlo de Stripe) es justo la que permite que la pantalla y el cargo no
  // coincidan. Se mueve el importe, no el contrato.
  ok('E.17 el importe canónico es el del producto (7,99 / 69,99) y en céntimos',
    /799, 'EUR'/.test(SQL) && /6999, 'EUR'/.test(SQL));
  ok('E.18 y no aparece ningún precio legacy en el bloque comercial',
    !/1499|3900|5900\b/.test(SQL));
}

// ══ F · PRECIOS Y PAYWALL ═════════════════════════════════════════════════
console.log('\nF · precios canónicos y paywall');
{
  ok('F.1 el cliente NO lleva precios: los lee del catálogo del servidor',
    /\.from\('billing_prices'\)/.test(fnSrc(app, '_aurixBillingPricesLoad')) &&
    !/7[.,]99|59[.,]99|amount_cents: ?\d/.test(fnSrc(app, '_aurixBillingPricesLoad')));
  ok('F.2 sin catálogo no se ofrece comprar (y se dice, no se adivina)',
    /pw_unavailable/.test(app) &&
    /rows: \[\]/.test(fnSrc(app, '_aurixBillingPricesLoad')));
  ok('F.3 el importe se muestra en la divisa QUE SE COBRA, sin convertir',
    (() => { const src = fnSrc(app, '_aurixBillingMoney');
      return /style: 'currency', currency: cur/.test(src)
        && !/toBase|baseCurrency|usdToEur|formatBase/.test(src); })());
  ok('F.4 ANUAL PRIMERO: es el destacado y el primero del DOM',
    /\$\{year \? _planCard\(year, true\) : ''\}[\s\S]{0,120}\$\{month \? _planCard\(month, !year\) : ''\}/.test(app));
  ok('F.5 el ahorro anual es aritmética sobre los DOS importes reales, no un descuento inventado',
    (() => { const src = fnSrc(app, '_aurixBillingAnnualSaving');
      return /Number\(m\.amount_cents\) \* 12/.test(src) && /paid >= full\) return null/.test(src)
        && !/0\.\d+\s*\*|hardcode/.test(src); })());
  ok('F.6 SIN falsa escasez: se retiran las plazas Founder y su barra de progreso',
    !/founderSlots|ap_scarcity|aurix-premium-scarcity/.test(app) &&
    !/data-premium-cta="founder"/.test(app));
  ok('F.7 y sin los precios legacy en ninguna superficie',
    !/aurix-premium-price-amount">39€|aurix-premium-price-amount">59€/.test(app) &&
    !/>39€<|>59€</.test(app));
  ok('F.8 el CTA del paywall abre el checkout real (ya no "te avisaremos pronto")',
    /data-premium-buy=/.test(app) && /_aurixBillingCheckout\(iv/.test(app) &&
    !/Te avisaremos pronto|We'll notify you soon/.test(app));
  ok('F.9 el paywall promete SÓLO lo que Premium concede hoy',
    (() => { const keys = ['pw_b_intel', 'pw_b_workspace', 'pw_b_plan', 'pw_b_future'];
      const block = app.slice(app.indexOf("const PREM_B ="), app.indexOf("const FREE_B ="));
      return keys.every(k => block.includes(k))
        && !/ap_p_reports|ap_p_goals|ap_p_timeline|ap_p_risk/.test(block); })());
  // ── Y LA OTRA MITAD, QUE NADIE MIRABA ───────────────────────────────────
  // DEFECTO REAL (2026-09-24): la lista «Ya incluido en Free» prometía la
  // calculadora de interés compuesto y la plantilla de portfolio inmobiliario.
  // Las dos son Premium desde v739 y `plan_features` las declara `false` para
  // Free, así que la pantalla de venta invitaba a usar lo que el gate deniega.
  // El assert no repite una lista escrita a mano: CONTRASTA con `_WS_CATALOG`,
  // que es la fuente única de qué se publica y con qué derecho.
  ok('F.9b lo que se anuncia como GRATIS no puede ser una capacidad Premium del catálogo',
    (() => {
      const free = app.slice(app.indexOf("const FREE_B ="), app.indexOf("const FREE_B =") + 240);
      // Las capacidades de Workspace publicadas, todas con featureKey ⇒ ninguna
      // puede aparecer en la lista de Free. Se detecta por su raíz semántica.
      const forbidden = ['compound', 'realestate', 'budget', 'journal', 'receivables',
                         'goals', 'scenario', 'loan'];
      return !forbidden.some(w => new RegExp('pw_fb_[a-z_]*' + w).test(free));
    })(),
    app.slice(app.indexOf("const FREE_B ="), app.indexOf("const FREE_B =") + 140));
  ok('F.9c …y el catálogo confirma que NINGUNA capacidad de Workspace es gratuita',
    (() => {
      // El catálogo lleva comentarios largos entre entradas, así que se recorta
      // por su CIERRE real y no por un número de caracteres: con una ventana
      // fija el assert leía cinco entradas de dieciocho y habría dado por bueno
      // un catálogo a medias.
      const _c0 = app.indexOf('const _WS_CATALOG');
      const cat = app.slice(_c0, app.indexOf(']);', _c0));
      const pub = [...cat.matchAll(/\{ id: '([a-z_]+)',[^}]*published: true,[^}]*commercialTier: '(\w+)'/g)];
      return pub.length >= 8 && pub.every(m => m[2] === 'premium');
    })(), 'publicadas que no son premium');
  ok('F.10 y las claves nuevas existen en ES y EN',
    ['pw_title', 'pw_cta', 'pw_annual', 'pw_monthly', 'pw_manage', 'pw_unavailable',
     'pw_b_intel', 'pw_trust', 'pw_active', 'pw_pending', 'pw_cancelled']
      .every(k => (app.match(new RegExp('\\n\\s+' + k + ':', 'g')) || []).length === 2));
  ok('F.11 un cliente ve GESTIONAR PLAN (la ruta de cancelación), no comprar otra vez',
    /const managed = \(\(typeof hasFeature === 'function'\) && hasFeature\('premium\.settings'\)\) \|\|[\s\S]{0,160}_aurixBillingIsCustomer\(\)/.test(app) &&
    /data-premium-portal/.test(app));
  // El cliente que más necesita el portal es el que ya NO tiene acceso: con la
  // tarjeta caducada Stripe pone `past_due`, el entitlement cae a Free y con el
  // gate anterior desaparecía el botón — sin forma de pagar ni de cancelar.
  ok('F.11b un `past_due` conserva la ruta de pago y cancelación',
    /st !== 'none' && st !== 'unrecognized'/.test(fnSrc(app, '_aurixBillingIsCustomer')) &&
    /!_aurixBillingIsCustomer\(\) && !hasFeature\('premium\.settings'\)/.test(fnSrc(app, '_aurixBillingPortal')) &&
    /pw_past_due_note/.test(app));
  ok('F.11c y el paywall se lo dice en vez de ofrecerle comprar otra vez',
    /problem === 'past_due' \? t\('pw_past_due_note'\)/.test(app) &&
    /pw_err_already/.test(app));
  ok('F.12 el punto de conversión de M.02 sigue siendo el que lleva al paywall',
    /upgradePaywallBtn/.test(idx) && /upgradePaywallBtn/.test(app) &&
    /openAurixPremiumModal\(\{ source: 'upgrade-intent'/.test(app));
  ok('F.13 el CSS del paywall no usa alfa BLANCO para el énfasis',
    /\.aurix-premium-plan\.is-featured\{[^}]*rgba\(77,141,255/.test(css) &&
    !/\.aurix-premium-plan\.is-featured\{[^}]*rgba\(255,\s*255,\s*255/.test(css));
}

// ══ F2 · EL PAYWALL, EJECUTADO ════════════════════════════════════════════
// Las aserciones de arriba leen el código; éstas RENDERIZAN la superficie de
// cobro con el diccionario REAL y los importes reales, y comprueban lo que
// acabaría viendo un usuario en los cinco estados posibles. Es la superficie que
// mueve dinero: una excepción o un importe mal formateado aquí no lo caza ningún
// regex.
console.log('\nF2 · el paywall renderizado (cinco estados)');
{
  const inner = (name) => { const i = app.indexOf('  function ' + name + '(');
    if (i < 0) throw new Error('missing inner ' + name);
    let d = 0, st = false;
    for (let k = i; k < app.length; k++) {
      if (app[k] === '{') { d++; st = true; }
      else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name); };
  // Diccionario ES REAL, recortado del bundle (no una copia escrita a mano).
  const dStart = app.indexOf('    pw_eyebrow:');
  const dEnd   = app.indexOf('    ap_eyebrow:', dStart);
  const sb = { console: { log() {}, warn() {} }, Intl, Math, Number, JSON, Object, Array, String, Boolean, isFinite };
  vm.createContext(sb);
  vm.runInContext('const DICT = ({' + app.slice(dStart, dEnd) + " ap_close:'Cerrar'});", sb);
  vm.runInContext(`
    let lang = 'es';
    const t = (k) => DICT[k];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let _aurixEnt = { loaded: true, status: 'none', features: {} };
    let _aurixBillingPrices = { loaded: true, rows: [] };
    const _AURIX_BILLING_INTERVALS = ['year', 'month'];
    ${fnSrc(app, '_aurixBillingPriceFor')}
    ${fnSrc(app, '_aurixBillingMoney')}
    ${fnSrc(app, '_aurixBillingAnnualSaving')}
    ${fnSrc(app, '_aurixBillingIsCustomer')}
    let __feat = {};
    function hasFeature(k) { return __feat[k] === true; }
    const PREM_B = ['pw_b_intel', 'pw_b_loan', 'pw_b_plan', 'pw_b_future'];
    const FREE_B = ['pw_fb_dash', 'pw_fb_market', 'pw_fb_compound', 'pw_fb_re', 'pw_fb_preview'];
    const li = (keys, cls) => keys.map(k => '<li class="' + cls + '">' + esc(t(k)) + '</li>').join('');
    ${inner('_planCard')}
    ${inner('_buildHtml')}
  `, sb);
  const run = (e) => vm.runInContext(e, sb);
  const nb = (x) => String(x).replace(/\u00a0|\u202f/g, ' ');
  // 2026-09-23 · el anual es 69,99 € (6999). El fixture usa el importe VIGENTE
  // para que el paywall se pruebe con el precio que se va a cobrar.
  const REAL = "[{billing_interval:'year',amount_cents:6999,currency:'EUR',trial_days:0}," +
               "{billing_interval:'month',amount_cents:799,currency:'EUR',trial_days:0}]";

  const empty = run('_buildHtml()');
  ok('F2.1 sin catálogo: se dice que no se puede comprar y NO hay botón de compra',
    /La compra todav[íi]a no est[áa] disponible/.test(empty) &&
    !/data-premium-buy/.test(empty) && /is-empty/.test(empty));

  run('_aurixBillingPrices = { loaded: true, rows: ' + REAL + ' };');
  const full = run('_buildHtml()');
  const amounts = [...full.matchAll(/price-amount">([^<]+)</g)].map(m => nb(m[1]));
  const order   = [...full.matchAll(/data-premium-buy="(\w+)"/g)].map(m => m[1]);
  ok('F2.2 los importes que se muestran son 7,99 € y 69,99 €, en EUR y sin convertir',
    amounts.length === 2 && amounts.includes('69,99 €') && amounts.includes('7,99 €'),
    JSON.stringify(amounts));
  ok('F2.3 ANUAL PRIMERO en el DOM y destacada',
    order.join(',') === 'year,month' && /is-featured[\s\S]{0,400}69,99/.test(full),
    order.join(','));
  // El porcentaje se DERIVA de los dos importes del catálogo, así que cambiar el
  // precio lo cambia solo: 69,99 frente a 12×7,99 = 95,88 son 27 %, y 5,83 €/mes.
  // Si esto se hubiera escrito a mano en el copy, el paywall estaría anunciando
  // hoy un 37 % que ya no existe.
  ok('F2.4 el ahorro anual es el REAL (69,99 vs 12×7,99 = 27 %), no un porcentaje inventado',
    /Equivale a 5,83 € al mes · ahorras un 27%/.test(nb(full)),
    (full.match(/Equivale a [^<]+/) || ['(sin nota)'])[0]);
  ok('F2.5 sin trial en el catálogo, el paywall no promete prueba',
    !/d[íi]as de prueba/.test(full));
  run('_aurixBillingPrices.rows[0].trial_days = 14;');
  ok('F2.6 …y con 14 días en el catálogo, lo dice',
    /Incluye 14 d[íi]as de prueba/.test(run('_buildHtml()')));

  run("__feat = { 'premium.settings': true };");
  const managed = run('_buildHtml()');
  ok('F2.7 un cliente ve GESTIONAR PLAN y ni un botón de compra',
    /data-premium-portal/.test(managed) && !/data-premium-buy/.test(managed) &&
    /Gestionar mi plan/.test(managed));

  run("__feat = {}; _aurixEnt = { loaded: true, status: 'past_due', features: {} };");
  const pastDue = run('_buildHtml()');
  ok('F2.8 un `past_due` conserva el portal y se le explica el problema (no se le vende otra vez)',
    /data-premium-portal/.test(pastDue) && !/data-premium-buy/.test(pastDue) &&
    /No hemos podido cobrar tu [úu]ltimo pago/.test(pastDue));
  ok('F2.9 ninguna de las cinco renderizaciones contiene `undefined` (claves i18n completas)',
    [empty, full, managed, pastDue].every(h => !/undefined/.test(h)));
  ok('F2.10 y ninguna promete producto interno ni escasez',
    [full, managed, pastDue].every(h =>
      !/plaza|slot|quedan|remaining|Founder|Informes|Objetivos/i.test(h)));
}

// ══ G · CONVERGENCIA Y SEPARACIÓN ═════════════════════════════════════════
console.log('\nG · convergencia, founder e INTERNAL');
{
  ok('G.1 past_due NO concede, y la política es la del resolver (B2), no del cliente',
    (() => { const res = read('db/monetization_entitlement_resolver_1.sql');
      return /v_status in \('active','trialing'\)/.test(res) &&
        !/past_due/.test(fnSrc(app, 'hasFeature')) &&
        !/past_due/.test(fnSrc(app, '_aurixBillingReturnFlow')); })());
  ok('G.2 cancel_at_period_end conserva acceso: el corte es current_period_end',
    (() => { const res = read('db/monetization_entitlement_resolver_1.sql');
      return /current_period_end is not null and v_sub\.current_period_end > now\(\)/.test(res) &&
        !/cancel_at_period_end/.test(res.slice(res.indexOf('v_plan    := \'premium\'') - 900,
                                                res.indexOf('v_plan    := \'premium\''))); })());
  ok('G.3 el estado comercial se revalida contra el servidor (multi-dispositivo)',
    /_aurixEntRevalidate\('visible'\)/.test(app) && /_aurixEntRevalidate\('token-refreshed'\)/.test(app));
  ok('G.4 el founder NO se escribe en subscriptions: sigue siendo un override',
    /entitlement_overrides/.test(read('db/monetization_commercial_truth_1.sql')) &&
    !/entitlement_overrides/.test(sqlFn(SQL, 'aurix_billing_apply_event')) &&
    /return _aurixEnt\.plan === 'premium' \? 'premium' : 'free';/.test(fnSrc(app, '_aurixMenuTier')));
  ok('G.5 pagar NO abre el catálogo interno (`workspace.catalog_preview` no la vende ningún plan)',
    /free\._WS_CATALOG|_WS_CATALOG/.test(app) &&
    !/catalog_preview/.test(SQL) &&
    /e\.featureKey !== 'workspace\.catalog_preview'/.test(read('docs/AURIX-MONETIZATION-PRODUCT-ENTITLEMENT-harness.js')));
  // Lo que G.6 vigila es que BILLING no se acople al catálogo, no que el catálogo
  // sea inmutable: la frontera Free/Premium es una decisión de producto y se movió
  // en el CIERRE WORKSPACE PREMIUM (las ocho capacidades pasan a Premium). Lo que
  // se conserva —y es lo único que este bloque puede romper— es que cada entrada
  // publicada declare su derecho y que aquí no entren ids ni importes de Stripe.
  ok('G.6 el catálogo de Workspace sigue sin acoplarse a billing, y cada entrada declara su derecho',
    (() => { const cat = noComments(app.slice(app.indexOf('const _WS_CATALOG = Object.freeze(['),
                                   app.indexOf('function _wsCatalogEntry')));
      return /id: 'compound_growth',[^}]*featureKey: 'workspace\.compound'/.test(cat)
        && /id: 'loan_simulation',[^}]*featureKey: 'workspace\.loan'/.test(cat)
        && /id: 'tpl_realestate',[^}]*published: true[^}]*commercialTier: 'premium'/.test(cat)
        // El catálogo de Workspace no adquiere acoplamiento con billing: los ids
        // de proveedor y los importes viven en `billing_prices`, no aquí.
        && !/stripe|amount_cents|provider_price/.test(cat); })());
}

// ══ H · §8 LEGACY ═════════════════════════════════════════════════════════
console.log('\nH · legacy billing retirado');
{
  ok('H.1 el cliente ya NO escribe `user_portfolios.subscription`',
    !/subscription:\s+_collectSubscription\(\)/.test(app) &&
    /subscription: <retirado en M\.04/.test(app));
  ok('H.2 y ya no ADOPTA un plan remoto en localStorage',
    (() => { const src = fnSrc(app, '_applyRemoteSubscription');
      return !/setItem\('aurix_plan'/.test(src) && /return;/.test(src); })());
  ok('H.3 la tarjeta de plan de Ajustes lee el ENTITLEMENT, no `aurix_plan`',
    (() => { const src = noComments(fnSrc(app, '_settingsPopulate'));
      return /_aurixMenuTier\(\)/.test(src) && !/getPlan\(\)/.test(src); })());
  ok('H.4 `aurix_plan` no concede nada en ninguna ruta de acceso',
    !/aurix_plan/.test(fnSrc(app, 'hasFeature')) &&
    !/getPlan\(|isPremiumTier\(/.test(fnSrc(app, 'hasFeature') + fnSrc(app, '_aurixEntIsCatalogPreview')));
}

// ══ J · DESPLEGABILIDAD (la extensión es contrato, no estilo) ═════════════
// El primer deployment de M.04 falló entero, pero NO por esto: la causa real fue el
// cupo de 12 Serverless Functions por deployment del plan Hobby (api/ tenía justo
// 12 y M.04 subió a 14), y se cerró pasando el proyecto a Pro. Se comprueba aquí
// que esa causa quede escrita, porque `vercel build` en local PASA y el fallo sólo
// existe en servidor: sin la nota, el siguiente diagnóstico vuelve a errar.
// Lo que sí sigue siendo contrato de la extensión: `package.json` no declara
// `"type": "module"`, así que Vercel trata un `.js` de `api/` como CommonJS y lo
// transpila desde ESM — y ese transform se aplica también a una función Edge, que
// sólo puede ejecutar ESM. Reproducido con el builder real:
//   webhook.js  → EdgeFunction + "Compiling webhook.js from ESM to CommonJS…"
//   webhook.mjs → EdgeFunction, sin transform.
console.log('\nJ · desplegabilidad en Vercel');
{
  const dir = path.join(root, 'api', 'billing');
  ok('J.1 el webhook Edge es `.mjs`: ESM sin ambigüedad, sin transpilar a CommonJS',
    fs.existsSync(path.join(dir, 'webhook.mjs')) &&
    !fs.existsSync(path.join(dir, 'webhook.js')));
  ok('J.2 …y su motivo queda escrito en el propio fichero (para que nadie lo renombre)',
    /POR QUÉ ESTE FICHERO ES `\.mjs` Y NO `\.js`/.test(WH) &&
    /NO LO RENOMBRES A `\.js`/.test(WH));
  // La causa REAL del primer deployment fallido no es deducible del código ni
  // reproducible en local: si no vive escrita, se vuelve a diagnosticar mal.
  ok('J.2b la causa real del deployment fallido (cupo de funciones del plan) queda escrita',
    /12 Serverless Functions por deployment en Hobby/.test(WH) &&
    /se valida en SERVIDOR/.test(WH));
  // Si algún día se añade `"type": "module"`, el `.js` volvería a ser válido; hasta
  // entonces, la única función Edge del proyecto NO puede llevar extensión `.js`.
  ok('J.3 mientras package.json no declare `type: module`, ninguna función Edge usa `.js`',
    (() => {
      const pkg = JSON.parse(read('package.json'));
      if (pkg.type === 'module') return true;
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
      return walk(path.join(root, 'api'))
        .filter(f => f.endsWith('.js'))
        .every(f => !/runtime:\s*'edge'/.test(fs.readFileSync(f, 'utf8')));
    })());
  ok('J.4 checkout y portal son Node normales y NINGUNO es ya un entrypoint propio',
    ['_checkout.js', '_portal.js'].every(f => fs.existsSync(path.join(dir, f))) &&
    ['checkout.js', 'portal.js'].every(f => !fs.existsSync(path.join(dir, f))) &&
    !/runtime:\s*'edge'/.test(CO) && !/runtime:\s*'edge'/.test(PO));
  ok('J.5 la ruta pública NO cambia',
    /\/api\/billing\/webhook/.test(read('docs/AURIX-MONETIZATION-M04-BILLING.md')) &&
    /_aurixBillingApi\('checkout'\)/.test(app) &&
    /AURIX_API_ORIGIN \+ '\/api\/billing\/'/.test(app));

  // ── J.6 · EL PRESUPUESTO DE FUNCIONES ES UN INVARIANTE DE DESPLIEGUE ──────
  // Vercel Hobby admite 12 Serverless Functions por deployment. `api/` está EN
  // el tope: un fichero nuevo que no empiece por `_` rompe el deployment ENTERO
  // (build correcto y rechazo posterior, en `Deploying outputs...`, con las tres
  // rutas de billing en 404). Se cuenta como cuenta Vercel: entrypoints de
  // `api/` sin prefijo `_`, descontando las Edge, que van a otro cupo.
  const apiEntrypoints = (() => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.name.startsWith('_') ? []
        : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    return walk(path.join(root, 'api')).filter(f => /\.(js|mjs)$/.test(f));
  })();
  const edgeCount = apiEntrypoints.filter(f => /runtime:\s*'edge'/.test(fs.readFileSync(f, 'utf8'))).length;
  const serverless = apiEntrypoints.length - edgeCount;
  ok(`J.6 el proyecto no pasa de 12 Serverless Functions (hay ${serverless} + ${edgeCount} Edge)`,
    serverless <= 12, `serverless=${serverless}`);

  // ── J.7 · EL DISPATCHER SÓLO ELIGE OWNER (ejecutado, no descrito) ─────────
  // Las dos operaciones comparten una función, así que el reparto es ahora una
  // pieza con la que se puede fallar: si `op` resolviera a algo distinto de su
  // owner, /api/billing/portal ejecutaría checkout. Se ejecuta el fichero real
  // con los dos owners sustituidos por espías.
  {
    const calls = [];
    const spy = (name) => (req, res) => { calls.push(name); return res.status(200).json({ ok: true, who: name }); };
    const mkRes = () => { const r = { code: 0, body: null, setHeader() {},
      status(n) { r.code = n; return r; }, json(o) { r.body = o; return r; }, end() { return r; } }; return r; };
    const load = () => loadHandler(DISP.replace(/^import .*$/gm, ''),
      { checkout: spy('checkout'), portal: spy('portal'), status: spy('status') });

    const hit = async (op) => {
      calls.length = 0;
      const { handler } = load();
      const res = mkRes();
      await handler({ query: op === undefined ? {} : { op }, method: 'POST', headers: {} }, res);
      return { code: res.code, body: res.body, calls: calls.slice() };
    };

    const rCheckout = await hit('checkout');
    const rPortal   = await hit('portal');
    const rStatus   = await hit('status');
    ok('J.7 cada `op` ejecuta SU owner y ninguno el del vecino',
      rCheckout.calls.join() === 'checkout' && rPortal.calls.join() === 'portal'
      && rStatus.calls.join() === 'status',
      `checkout→${rCheckout.calls.join()||'nada'} portal→${rPortal.calls.join()||'nada'} status→${rStatus.calls.join()||'nada'}`);

    const bad = [];
    for (const op of [undefined, '', 'webhook', 'Checkout', 'constructor', '__proto__', 'toString']) {
      const r = await hit(op);
      if (r.code !== 404 || r.calls.length) bad.push(`${String(op)}→${r.code}/${r.calls.join()||'-'}`);
    }
    ok('J.8 cualquier otro `op` es 404 y NO ejecuta owner (incluido constructor/__proto__)',
      bad.length === 0, bad.join(' '));
  }
}

// ── K1 · EL SECRETO ES LA CLAVE DEL HMAC ───────────────────────────────────
// Un espacio o un salto de línea pegado con el secreto en el panel de la
// plataforma cambia la clave y tira TODAS las entregas con `bad_signature`.
console.log('\nK1 · webhook · el secreto se normaliza antes de firmar');
{
  const padded = await callWebhook(SUB_EVENT({ id: 'evt_padded' }),
    { env: { STRIPE_WEBHOOK_SECRET: '  ' + SECRET + '\n' } });
  ok('K1.1 un secreto con espacios/salto de línea verifica una firma legítima',
    padded.status === 200 && padded.json && padded.json.ok === true &&
    padded.calls.some(c => String(c.url).includes('aurix_billing_apply_event')),
    JSON.stringify(padded.json));
  const wrong = await callWebhook(SUB_EVENT({ id: 'evt_wrong' }),
    { env: { STRIPE_WEBHOOK_SECRET: 'whsec_otro_endpoint' } });
  ok('K1.2 …y un secreto de OTRO endpoint sigue siendo 400 sin escribir nada',
    wrong.status === 400 && wrong.json && wrong.json.error === 'bad_signature' &&
    !wrong.calls.some(c => String(c.url).includes('aurix_billing_apply_event')),
    JSON.stringify(wrong.json));
}

// ── K2 · LA PUERTA DE LOS EVENTOS DE TEST ──────────────────────────────────
console.log('\nK2 · webhook · la autorización de eventos TEST se normaliza');
{
  const padded = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_tm_ok' }), { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: ' 1 ', STRIPE_SECRET_KEY: 'sk_test_x' } });
  ok('K2.1 `BILLING_ALLOW_TEST_EVENTS=" 1 "` autoriza igual que "1"',
    padded.status === 200 && padded.json && padded.json.outcome !== 'ignored_testmode' &&
    padded.calls.some(c => String(c.url).includes('aurix_billing_apply_event')),
    JSON.stringify(padded.json));
  const off = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_tm_off' }), { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '' } });
  // El permiso es TEMPORAL por diseño, y ahora también por construcción: en un
  // deployment LIVE la variable no tiene efecto, así que olvidarla en el cutover
  // deja de poder conceder Premium real con un evento de prueba.
  const live = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_tm_live' }), { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1', STRIPE_SECRET_KEY: 'sk_live_x' } });
  ok('K2.3 con clave LIVE la variable NO autoriza eventos de TEST (bloqueo estructural)',
    live.status === 200 && live.json && live.json.outcome === 'ignored_testmode' &&
    !live.calls.some(c => String(c.url).includes('aurix_billing_apply_event')),
    JSON.stringify(live.json));
  const nokey = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_tm_nokey' }), { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1', STRIPE_SECRET_KEY: '' } });
  ok('K2.4 …y sin clave configurada también se anula (fail-closed)',
    nokey.status === 200 && nokey.json && nokey.json.outcome === 'ignored_testmode');
  ok('K2.2 …y sin esa variable un evento de TEST sigue ignorado y sin escribir nada',
    off.status === 200 && off.json && off.json.outcome === 'ignored_testmode' &&
    !off.calls.some(c => String(c.url).includes('aurix_billing_apply_event')),
    JSON.stringify(off.json));
}

// ── K3 · LO QUE LA CERTIFICACIÓN TEST DEJA ABIERTO ─────────────────────────
// La guarda de MODO del webhook es TEMPORAL y su retirada no la puede afirmar
// ningún test (es una variable de entorno). Lo que sí se puede afirmar es que el
// requisito está ESCRITO donde alguien lo va a leer antes del cutover.
console.log('\nK3 · pre-LIVE · los requisitos temporales quedan documentados');
{
  let doc = ''; try { doc = read('docs/AURIX-M04-PRE-LIVE-CHECKLIST.md'); } catch (_) { doc = ''; }
  ok('K3.1 existe checklist pre-LIVE y nombra la retirada de BILLING_ALLOW_TEST_EVENTS',
    /BILLING_ALLOW_TEST_EVENTS/.test(doc) && /RETIRAR|retirar|borrarla/.test(doc));
  ok('K3.2 …y la rotación de los dos secretos de Stripe',
    /ROTAR|rotar/.test(doc) && /STRIPE_SECRET_KEY/.test(doc) && /STRIPE_WEBHOOK_SECRET/.test(doc));
  ok('K3.3 …y que TEST y LIVE no pueden coexistir activos para el mismo intervalo',
    /billing_prices_active_uidx/.test(doc) && /active = false|active=false/.test(doc));
}

// ── K4 · RUTA VISIBLE AL PLAN Y AL PORTAL ──────────────────────────────────
// Un cliente que paga tiene que poder llegar a su plan. ACCOUNT-CENTER-V1 publicó
// seis destinos de menú y dejó fuera `plan`: la sección Membresía existía pero
// ninguna entrada la abría, así que la cadena menú → Membresía → modal →
// "Gestionar mi plan" → /api/billing/portal estaba cortada en el primer eslabón.
console.log('\nK4 · producto · el plan y el portal son ALCANZABLES');
{
  ok('K4.1 el menú tiene un destino que abre la sección Membresía',
    /data-account-section="plan"/.test(idx) && /data-settings-pane="plan"/.test(idx));
  ok('K4.2 la tarjeta de membresía ya no promete "Próximamente" (hay compra real)',
    !/settingsFounderSoon/.test(idx));
  ok('K4.3 para un cliente el CTA de esa tarjeta es GESTIONAR, y lo decide el entitlement',
    /planOfferDesc/.test(idx) &&
    /_offerPrem = isPremiumTier\(plan\.tier\)/.test(app) &&
    /_offerPrem \? 'pw_manage' : 'settingsFounderCta'/.test(app));
  ok('K4.1b …y esa sección es VISIBLE: el owner único de la UI de Membresía está on',
    /AURIX_PREMIUM_UI_ENABLED = true/.test(app) &&
    /html\[data-aurix-premium-ui="off"\][^{]*data-settings-pane="plan"/.test(css));
  // M.06 — el rango se amplía porque el fallback a la página legacy («si no existe el
  // modal canónico, abre Aurix Founder») se retiró con su precio obsoleto: ahora entre
  // el selector y la llamada hay un comentario que explica por qué NO hay fallback.
  ok('K4.4 …y ese CTA abre el modal canónico, que es el único dueño del portal',
    /#planFounderCta[\s\S]{0,400}openAurixPremiumModal/.test(app) &&
    /data-premium-portal/.test(app) && /_aurixBillingPortal/.test(app));
  ok('K4.5 y sin fallback a una página de precio retirada',
    !/openFounderPage\(\)/.test(app));
}

// ── M5 · CONVERSIÓN · SUPERFICIES FREE, UNA SOLA PUERTA ────────────────────
// M.05 no añade producto: conecta el que ya está certificado. Lo que se afirma aquí
// es que cada superficie de conversión lleva al MISMO paywall, con su origen medido,
// y que a un cliente no se le vende lo que ya paga.
console.log('\nM5 · conversión · superficies Free y medición del embudo');
{
  const prev = fnSrc(app, '_aurixIntelligencePreviewHTML');
  // RE-DECIDIDO · SPEC DE CIERRE §D: «Un único CTA: Ver el análisis completo. Elimina
  // Volver al Dashboard.» Este assert exigía que convivieran los dos, y el
  // secundario competía con la única acción de la superficie justo en el momento de
  // máxima intención —el usuario acaba de leer hechos ciertos sobre su patrimonio—.
  // Lo que M5.1 protege de verdad es que el CTA vaya al paywall CANÓNICO con su
  // featureKey y su origen, y eso se refuerza: ahora es el ÚNICO.
  ok('M5.1 el preview de Intelligence ofrece VER EL ANÁLISIS por el paywall canónico, y es su Único CTA',
    /data-premium-cta="intelligence\.full"/.test(prev) &&
    /data-premium-source="intelligence-preview"/.test(prev) &&
    /intprev_cta_full/.test(prev) &&
    (prev.match(/class="intprev-cta"/g) || []).length === 1 &&
    !/switchTab/.test(prev));
  ok('M5.2 …y no publica ningún precio: los precios viven en el catálogo',
    !/7[.,]99|59[.,]99|amount_cents/.test(prev));
  const ident = fnSrc(app, '_aurixRenderMenuIdentity');
  ok('M5.3 el badge es accionable SÓLO para Free; para un cliente vuelve a ser estado',
    /tier === 'free'/.test(ident) &&
    /setAttribute\('data-premium-cta', 'menu\.badge'\)/.test(ident) &&
    /removeAttribute\('data-premium-cta'\)/.test(ident) &&
    /setAttribute\('role', 'button'\)/.test(ident) && /removeAttribute\('tabindex'\)/.test(ident));
  ok('M5.4 UNA sola puerta: toda superficie marcada abre el paywall canónico',
    /\[data-premium-cta\]/.test(app) &&
    /_pcta[\s\S]{0,900}openAurixPremiumModal\(\{ source: src \}\)/.test(app) &&
    /e\.key !== 'Enter'[\s\S]{0,300}data-premium-cta/.test(app));
  ok('M5.5 el embudo se registra en el owner único, sin PII y sin salir del dispositivo',
    /function _aurixRecordUpgradeIntent\(featureKey, source\)/.test(app) &&
    /_aurixRecordUpgradeIntent\('paywall:open', _lastSource\)/.test(app) &&
    /_aurixRecordUpgradeIntent\('checkout:' \+ iv/.test(app) &&
    /_AURIX_UPGRADE_INTENT_KEY \+ \(_aurixActiveUserId/.test(app) &&
    !/fetch\([^)]*upgrade_intent/.test(app));
  // Sólo la tarjeta de PLAN: "Acceso anticipado" sigue siendo legítimo en la página
  // Founder, que es otra superficie y otra promesa.
  ok('M5.6 no queda copy comercial obsoleto en la superficie de plan',
    !/settingsFounderDesc:\s*'[^']*(Acceso anticipado|Early access)/.test(app) &&
    /settingsFounderDesc:\s*'[^']*(Intelligence)/.test(app) &&
    !/settingsFounderSoon/.test(idx));
}

// ── K0 · EL HUECO ENTRE STRIPE Y EL WEBHOOK ────────────────────────────────
// Stripe tiene la suscripción antes de que el webhook la escriba. En ese hueco el
// 409 del proveedor NO convierte al usuario en cliente gestionable: si se le
// anuncia "ya tienes una suscripción, gestiónala", contradice al menú, que sigue
// diciendo Free con razón. El mensaje lo decide el entitlement del servidor.
{
  const branch = (app.match(/if \(r\.status === 409[\s\S]{0,1200}?\n    \}/) || [''])[0];
  ok('K0.1 ante un 409, el mensaje lo decide el ENTITLEMENT, no el proveedor',
    /_aurixEntitlementsLoad\(\{ force: true \}\)/.test(branch) &&
    /st\.plan === 'premium'/.test(branch) &&
    /premium \? 'pw_err_already' : 'pw_pending'/.test(branch), branch.slice(0, 80));
  ok('K0.2 …y sin entitlement premium NO se ofrece gestionar el plan ni se concede nada',
    /if \(premium && window\.openAurixPremiumModal\)/.test(branch) &&
    !/aurix_plan|localStorage/.test(branch), branch.slice(0, 80));
}

// ── K · PAYWALL · los dos CTA alineados y encabezado sin cancelación ────────
// La alineación NO es cosmética: `.aurix-premium-cta` ya empuja el botón al fondo
// de la tarjeta (`margin-top:auto`) y las dos tarjetas son celdas de grid de la
// misma altura, así que basta con que `.is-monthly` no reintroduzca un margen
// fijo — que es lo que desalineaba el CTA mensual respecto al anual.
{
  const ctaBase = /\.aurix-premium-cta\{[^}]*margin-top:\s*auto/.test(css);
  const monthly = (css.match(/\.aurix-premium-cta\.is-monthly\{[^}]*\}/) || [''])[0];
  ok('K.1 los dos CTA del paywall se alinean por estructura (`is-monthly` sin margen fijo)',
    ctaBase && /margin-top:\s*auto/.test(monthly) && !/margin-top:\s*\d/.test(monthly), monthly.slice(0, 90));
  const subs = app.match(/pw_sub:\s*'([^']*)'/g) || [];
  ok('K.2 el encabezado del paywall no menciona la cancelación (ES y EN)',
    subs.length === 2 && !/cancel/i.test(subs.join(' ')), subs.join(' | '));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
})();
