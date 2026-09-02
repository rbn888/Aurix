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
const CO   = read('api/billing/checkout.js');
const PO   = read('api/billing/portal.js');

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
  const testAllowed = await callWebhook(Object.assign(SUB_EVENT({ id: 'evt_test2' }), { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1' } });
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
          : [{ provider_price_id: 'price_annual_real', amount_cents: 5999, currency: 'EUR',
               trial_days: 0, billing_interval: 'year' }]) };
      }
      if (u.includes('/billing_customers')) {
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
        return { ok: true, status: 200, json: async () => ({ id: 'cus_new' }) };
      }
      if (u.includes('rpc/aurix_billing_link_customer')) {
        return { ok: opts.linkFails ? false : true, status: opts.linkFails ? 409 : 200, json: async () => 'cus_new' };
      }
      if (u.includes('checkout/sessions')) {
        return { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/s/1' }) };
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
  ok('D.11 la creación de cliente es idempotente por usuario (doble click ⇒ un cliente)',
    (() => { const c = okCall.calls.find(x => x.url.includes('api.stripe.com/v1/customers'));
      return !!c && (c.init.headers['Idempotency-Key'] || '').includes('user-1'); })());
  const existing = await callCheckout({ customers: [{ provider_customer_id: 'cus_old' }] });
  ok('D.12 con cliente ya mapeado NO se crea otro',
    !existing.calls.some(c => c.url.includes('api.stripe.com/v1/customers')) &&
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
    amount_cents: 5999, currency: 'EUR', trial_days: 14, billing_interval: 'year' }] });
  ok('D.16 …y con 14 días en el catálogo, el trial viaja al proveedor',
    decodeBody(withTrial.calls.find(c => c.url.includes('checkout/sessions')).init.body)
      .includes('subscription_data[trial_period_days]=14'));
  // PORTAL — la ruta de cancelación.
  ok('D.17 el portal resuelve el cliente del USUARIO autenticado, no de un body',
    /billing_customers[\s\S]{0,120}user_id=eq\.\$\{user\.id\}/.test(PO) &&
    /if \(!customerId\) return res\.status\(404\)/.test(PO) &&
    !/req\.body[\s\S]{0,40}customer/.test(PO));
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
  ok('E.17 el importe canónico es el del producto (7,99 / 59,99) y en céntimos',
    /799, 'EUR'/.test(SQL) && /5999, 'EUR'/.test(SQL));
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
    (() => { const keys = ['pw_b_intel', 'pw_b_loan', 'pw_b_plan', 'pw_b_future'];
      const block = app.slice(app.indexOf("const PREM_B ="), app.indexOf("const FREE_B ="));
      return keys.every(k => block.includes(k))
        && !/ap_p_reports|ap_p_goals|ap_p_timeline|ap_p_risk/.test(block); })());
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
  const REAL = "[{billing_interval:'year',amount_cents:5999,currency:'EUR',trial_days:0}," +
               "{billing_interval:'month',amount_cents:799,currency:'EUR',trial_days:0}]";

  const empty = run('_buildHtml()');
  ok('F2.1 sin catálogo: se dice que no se puede comprar y NO hay botón de compra',
    /La compra todav[íi]a no est[áa] disponible/.test(empty) &&
    !/data-premium-buy/.test(empty) && /is-empty/.test(empty));

  run('_aurixBillingPrices = { loaded: true, rows: ' + REAL + ' };');
  const full = run('_buildHtml()');
  const amounts = [...full.matchAll(/price-amount">([^<]+)</g)].map(m => nb(m[1]));
  const order   = [...full.matchAll(/data-premium-buy="(\w+)"/g)].map(m => m[1]);
  ok('F2.2 los importes que se muestran son 7,99 € y 59,99 €, en EUR y sin convertir',
    amounts.length === 2 && amounts.includes('59,99 €') && amounts.includes('7,99 €'),
    JSON.stringify(amounts));
  ok('F2.3 ANUAL PRIMERO en el DOM y destacada',
    order.join(',') === 'year,month' && /is-featured[\s\S]{0,400}59,99/.test(full),
    order.join(','));
  ok('F2.4 el ahorro anual es el REAL (59,99 vs 12×7,99 = 37 %), no un porcentaje inventado',
    /Equivale a 5,00 € al mes · ahorras un 37%/.test(nb(full)),
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
  ok('G.6 el catálogo de Workspace no cambia con este bloque (Free/Premium/Internal intactos)',
    (() => { const cat = noComments(app.slice(app.indexOf('const _WS_CATALOG = Object.freeze(['),
                                   app.indexOf('function _wsCatalogEntry')));
      return /id: 'compound_growth',[^}]*featureKey: null/.test(cat)
        && /id: 'loan_simulation',[^}]*featureKey: 'workspace\.loan'/.test(cat)
        && /id: 'tpl_realestate',[^}]*published: true[^}]*commercialTier: 'free'/.test(cat)
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
// El primer deployment de M.04 falló entero. `package.json` no declara
// `"type": "module"`, así que Vercel trata un `.js` de `api/` como CommonJS y lo
// transpila desde ESM — y ese transform se aplica también a una función Edge, que
// sólo puede ejecutar ESM. Salía una EdgeFunction en CommonJS: artefacto inválido,
// Build Failed a los ~6 s y sin mensaje. Reproducido con el builder real:
//   webhook.js  → EdgeFunction + "Compiling webhook.js from ESM to CommonJS…"
//   webhook.mjs → EdgeFunction, sin transform.
console.log('\nJ · desplegabilidad en Vercel');
{
  const dir = path.join(root, 'api', 'billing');
  ok('J.1 el webhook Edge es `.mjs`: ESM sin ambigüedad, sin transpilar a CommonJS',
    fs.existsSync(path.join(dir, 'webhook.mjs')) &&
    !fs.existsSync(path.join(dir, 'webhook.js')));
  ok('J.2 …y su motivo queda escrito en el propio fichero (para que nadie lo renombre)',
    /WHY THIS FILE IS `\.mjs`/.test(WH) && /Build Failed/.test(WH));
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
  ok('J.4 las otras dos funciones de billing son Node normales (mismo formato que las 14 que ya despliegan)',
    ['checkout.js', 'portal.js'].every(f => fs.existsSync(path.join(dir, f))) &&
    !/runtime:\s*'edge'/.test(CO) && !/runtime:\s*'edge'/.test(PO));
  ok('J.5 la ruta pública NO cambia con la extensión',
    /\/api\/billing\/webhook/.test(read('docs/AURIX-MONETIZATION-M04-BILLING.md')) &&
    /_aurixBillingApi\('checkout'\)/.test(app) &&
    /AURIX_API_ORIGIN \+ '\/api\/billing\/'/.test(app));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
})();
