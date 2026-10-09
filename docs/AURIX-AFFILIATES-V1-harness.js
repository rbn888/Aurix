'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AFFILIATES-V1 — atribución de primera parte + evidencia de cobro
// ════════════════════════════════════════════════════════════════════════════
// Aurix guarda EVIDENCIA; Founder Platform calcula comisiones. Este gate EJECUTA
// el código real donde se puede (las funciones puras de la landing y del acceso,
// el webhook en un sandbox con firma HMAC de verdad y `fetch` falso, y los
// handlers de lectura Founder importados tal cual) y comprueba la FORMA del SQL,
// que no puede ejecutarse aquí (residual: se demuestra al aplicarlo).
//
//   A · landing: `?ref=` (6 dígitos), ≤5 distintos, poda de 30 días, nada en
//       disco sin consentimiento, una visita por carga, enlace a la app
//   B · acceso: decodifica los toques, sessionStorage sólo con consentimiento,
//       captura tras la sesión confirmada y sin bloquear
//   C · webhook: los cinco eventos nuevos, las DOS formas de la API de Stripe,
//       la puerta de modo TEST y la idempotencia
//   D · lectura Founder `affiliates`: forma, guard y ausencia explícita
//   E · cupo de funciones del plan (12 + 1)
//   F · SQL: inmutabilidad, grants, idempotencia en la misma función, lectura
//   G · privacidad publicada (ES y EN)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const LAND     = read('landing/app.js');
const LAND_IDX = read('landing/index.html');
const LOGIN    = read('login.html');
const WH       = read('api/billing/webhook.mjs');
const PRIV     = read('privacy.html');
const SQL_ATT  = read('db/affiliate_attribution_1.sql');
const SQL_PAY  = read('db/billing_payments_1.sql');
const SQL_READ = read('db/founder_read_affiliates_1.sql');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}
function between(src, a, b) {
  const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a);
  const j = src.indexOf(b, i + a.length); if (j < 0) throw new Error('missing ' + b);
  return src.slice(i, j + b.length);
}
function sqlFn(src, name) {
  const i = src.indexOf('create or replace function public.' + name);
  if (i < 0) throw new Error('missing sql fn ' + name);
  const j = src.indexOf('\n$$;', i);
  return src.slice(i, j > 0 ? j : src.length);
}
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
function store(init) {
  const m = Object.assign({}, init || {}); let writes = 0;
  return { _m: m, get writes() { return writes; },
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { writes++; m[k] = String(v); },
    removeItem: k => { writes++; delete m[k]; } };
}
const DAY = 864e5;

(async () => {
console.log('\nAURIX-AFFILIATES-V1 — atribución + evidencia de cobro\n');

// ══ A · LANDING ═════════════════════════════════════════════════════════════
console.log('A · landing · captura del código');
{
  const REF = between(LAND, '/* AURIX-REF:BEGIN */', '/* AURIX-REF:END */');
  const sb = { Date, JSON, Math, isFinite, Array };
  vm.createContext(sb); vm.runInContext(REF, sb);
  const now = Date.parse('2026-10-09T12:00:00.000Z');
  const parse = (q) => vm.runInContext(`refFromSearch(${JSON.stringify(q)})`, sb);
  ok('A.1 `?ref=` de exactamente 6 dígitos se acepta',
    parse('?ref=123456') === '123456' && parse('?lang=en&ref=000001') === '000001');
  ok('A.2 cualquier otra forma se ignora (5, 7, letras, vacío, signo, espacios)',
    ['?ref=12345', '?ref=1234567', '?ref=12a456', '?ref=', '?ref=+12345', '?ref=%20123456', '?xref=123456', ''].every(q => parse(q) === null));
  sb.now = now;
  const merge = (list, code, n) => JSON.parse(vm.runInContext(
    `JSON.stringify(refMerge(${JSON.stringify(list)}, ${JSON.stringify(code)}, ${n || now}))`, sb));
  let L = [];
  for (const c of ['111111', '222222', '111111', '333333']) L = merge(L, c);
  ok('A.3 códigos DISTINTOS: repetir uno no añade un toque ni cambia su fecha',
    L.length === 3 && L.map(t => t.code).join() === '111111,222222,333333');
  const old = [{ code: '999999', seenAt: new Date(now - 31 * DAY).toISOString() },
               { code: '888888', seenAt: new Date(now - 29 * DAY).toISOString() }];
  const pruned = merge(old, null);
  ok('A.4 se podan los toques de más de 30 días', pruned.length === 1 && pruned[0].code === '888888');
  let six = [];
  ['100001', '100002', '100003', '100004', '100005', '100006'].forEach((c, i) => { six = merge(six, c, now + i * 1000); });
  ok('A.5 nunca más de 5; al sexto distinto se descarta el más antiguo, en orden de primera vista',
    six.length === 5 && six[0].code === '100002' && six[4].code === '100006');
  const junk = merge([{ code: '12', seenAt: 'x' }, { code: '123456', seenAt: 'no-date' }, null,
                      { code: '654321', seenAt: new Date(now + DAY).toISOString() }], null);
  ok('A.6 basura y fechas futuras imposibles se descartan', junk.length === 0, JSON.stringify(junk));
  const enc = vm.runInContext(`refEncode(${JSON.stringify(L)})`, sb);
  ok('A.7 el parámetro hacia la app es compacto y seguro en URL',
    /^([0-9]{6}-[0-9a-z]+)(\.[0-9]{6}-[0-9a-z]+){2}$/.test(enc), enc);

  // Ciclo real: initReferral + appUrlWithRef con almacenamiento y fetch falsos.
  const STATE = between(LAND, 'var REF_URL_CODE = null;', 'function showReferralNotice() {')
    .replace(/function showReferralNotice\(\) \{$/, '');
  const LANGSRC = between(LAND, 'function appUrlForLang()', '}');
  function landing(search, init) {
    const ls = store(init); const calls = []; let notices = 0;
    const ctx = { Date, JSON, Math, isFinite, Array, String, localStorage: ls,
      location: { search }, lang: 'es', langExplicit: false, APP_URL: 'https://app.aurixsystem.io/',
      fetch: (url, opts) => { calls.push({ url, opts }); return Promise.resolve({}); },
      showReferralNotice: () => { notices++; } };
    vm.createContext(ctx);
    vm.runInContext(REF + '\n' + LANGSRC + '\n' + STATE, ctx);
    vm.runInContext('initReferral()', ctx);
    return { ctx, ls, calls, notices: () => notices, url: () => vm.runInContext('appUrlWithRef()', ctx) };
  }
  const v1 = landing('?ref=123456', {});
  ok('A.8 SIN consentimiento: ni una escritura en localStorage', v1.ls.writes === 0 && Object.keys(v1.ls._m).length === 0);
  ok('A.9 …pero el código viaja en el enlace a la app (atribución en la misma visita), sin `aconsent`',
    /^https:\/\/app\.aurixsystem\.io\/login\.html\?langhint=es&aref=123456-[0-9a-z]+$/.test(v1.url()), v1.url());
  ok('A.10 con `ref` y sin consentimiento se muestra el aviso', v1.notices() === 1);
  ok('A.11 una visita por carga, anónima, por PostgREST al contador (no una función de api/)',
    v1.calls.length === 1 && /\/rest\/v1\/rpc\/aurix_affiliate_click$/.test(v1.calls[0].url) &&
    JSON.parse(v1.calls[0].opts.body).p_code === '123456' && v1.calls[0].opts.credentials === 'omit');
  const v2 = landing('', {});
  ok('A.12 visitante normal: sin aviso, sin visita, sin almacenamiento y el enlace de siempre',
    v2.notices() === 0 && v2.calls.length === 0 && v2.ls.writes === 0 &&
    v2.url() === 'https://app.aurixsystem.io/?langhint=es');
  const v3 = landing('?ref=12345x', {});
  ok('A.13 un `ref` inválido es como no tenerlo', v3.notices() === 0 && v3.calls.length === 0 && v3.url().indexOf('aref') < 0);
  const seen = new Date(Date.now() - 2 * DAY).toISOString();
  const v4 = landing('?ref=654321', { aurix_ref_consent: '1',
    aurix_ref_touches: JSON.stringify([{ code: '111111', seenAt: seen }]) });
  const saved = JSON.parse(v4.ls._m.aurix_ref_touches);
  ok('A.14 CON consentimiento: se guarda la lista fusionada y el enlace lleva `aconsent=1`',
    saved.length === 2 && saved[0].code === '111111' && saved[1].code === '654321' &&
    /&aconsent=1$/.test(v4.url()) && v4.notices() === 0);
  const v5 = landing('', { aurix_ref_touches: JSON.stringify([{ code: '111111', seenAt: seen }]) });
  ok('A.15 sin la marca de consentimiento, lo que hubiera en disco NO se lee',
    v5.url().indexOf('aref') < 0);
  ok('A.16 el aviso es bilingüe (es/en) por el i18n de la landing',
    ['ref.title', 'ref.body', 'ref.accept', 'ref.decline'].every(k =>
      new RegExp("Object\\.assign\\(I18N\\.es, \\{[\\s\\S]*?'" + k.replace('.', '\\.') + "'").test(LAND) &&
      new RegExp("Object\\.assign\\(I18N\\.en, \\{[\\s\\S]*?'" + k.replace('.', '\\.') + "'").test(LAND)));
  const notice = between(LAND, 'function showReferralNotice() {', "document.body.appendChild(box);");
  ok('A.17 aviso accesible: región etiquetada, botones reales, y rechazar no escribe nada',
    /setAttribute\('role', 'region'\)/.test(notice) && /aria-labelledby/.test(notice) &&
    /<button type="button"/.test(notice) &&
    /data-ref-consent'\) === '1'\) \{[\s\S]*?localStorage\.setItem\(REF_CONSENT_KEY, '1'\)/.test(notice) &&
    (notice.match(/localStorage\.setItem/g) || []).length === 1);
  ok('A.18 la CSP de la landing permite el contador y sólo ese origen nuevo',
    /connect-src 'self' https:\/\/isa-portfolio-ten\.vercel\.app https:\/\/ozcasyufbknnuemllwso\.supabase\.co"/.test(LAND_IDX));
  const cfgKey = (/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/.exec(read('config.js')) || [])[1];
  const landKey = (/AURIX_SUPABASE_PUBLISHABLE_KEY = '([^']+)'/.exec(LAND) || [])[1];
  ok('A.19 la landing usa la MISMA clave publicable que la app (nunca una de servicio)',
    !!cfgKey && cfgKey === landKey && /^sb_publishable_/.test(landKey));
  ok('A.20 los CTA pasan por el owner de siempre (`updateAppLinks`) y el idioma no cambia de forma',
    /links\[i\]\.setAttribute\('href', appUrlWithRef\(\)\)/.test(LAND) &&
    /return APP_URL \+ '\?' \+ \(langExplicit \? 'lang=' : 'langhint='\) \+ v;/.test(LAND) &&
    /initReferral\(\);[^\n]*\n\s*applyLang\(detectLang\(\)\);/.test(LAND));
}

// ══ B · ACCESO (login.html) ═════════════════════════════════════════════════
console.log('\nB · acceso · los toques sobreviven al OTP y se capturan una vez');
{
  const DEC = between(LOGIN, '/* AURIX-AREF:BEGIN */', '/* AURIX-AREF:END */');
  const sb = { Date, JSON, Math, isFinite, String, parseInt };
  vm.createContext(sb); vm.runInContext(DEC, sb);
  const now = Date.now();
  const enc = (c, ms) => c + '-' + Math.floor(ms / 1000).toString(36);
  const dec = (raw) => JSON.parse(vm.runInContext(`JSON.stringify(_affDecode(${JSON.stringify(raw)}, ${now}))`, sb));
  const two = dec(enc('123456', now - DAY) + '.' + enc('654321', now - 1000));
  ok('B.1 decodifica lo que codifica la landing (código y fecha)',
    two && two.length === 2 && two[0].code === '123456' &&
    Math.abs(Date.parse(two[0].seenAt) - (now - DAY)) < 1000);
  ok('B.2 rechaza códigos inválidos, duplicados, fechas viejas o futuras, y nunca más de 5',
    dec('12345-abc') === null && dec(enc('123456', now - 40 * DAY)) === null &&
    dec(enc('123456', now + DAY)) === null &&
    dec([1, 2, 3, 4, 5, 6, 7].map(i => enc('10000' + i, now - i * 1000)).join('.')).length === 5 &&
    dec(enc('123456', now) + '.' + enc('123456', now)).length === 1);
  const ctl = between(LOGIN, "const _AFF_SS_KEY = 'aurix_ref_touches';", 'const LOGIN_I18N = {');
  ok('B.3 sessionStorage SÓLO si la landing trajo `aconsent=1`',
    (ctl.match(/sessionStorage\.setItem/g) || []).length === 1 &&
    /if \(q\.get\('aconsent'\) === '1'\) \{ try \{ sessionStorage\.setItem\(_AFF_SS_KEY/.test(ctl));
  ok('B.4 la captura es UNA llamada al RPC, acotada en tiempo y sin propagar errores',
    /_affCaptureDone = true;/.test(ctl) && /client\.rpc\('aurix_attribution_capture', \{ p_touches: touches \}\)/.test(ctl) &&
    /setTimeout\(r, 1500\)/.test(ctl) && /\.then\(function \(\) \{\}, function \(\) \{\}\)/.test(ctl));
  ok('B.5 se llama DESPUÉS de confirmar la sesión y ANTES de la única navegación',
    /localStorage\.removeItem\('aurix_otp_email'\);[\s\S]{0,800}try \{ await _affCapture\(\); \} catch \(_\) \{\}[^\n]*\n\s*window\.location\.replace\(target\);/.test(LOGIN));
  ok('B.6 el OTP es un CÓDIGO en la página: no hay enlace mágico que pierda el parámetro',
    !/emailRedirectTo\s*:/.test(LOGIN) && /verifyOtp\(/.test(LOGIN) &&
    /\{\{ \.Token \}\}/.test(read('email/aurix-otp-code.html')) &&
    !/ConfirmationURL/.test(read('email/aurix-otp-code.html')));
}

// ══ C · WEBHOOK ═════════════════════════════════════════════════════════════
console.log('\nC · webhook · evidencia de cobro');
const SECRET = 'whsec_test_affiliates_v1';
function loadHandler(src, sandbox) {
  const body = src
    .replace(/export\s+const\s+config\s*=/, 'module.config =')
    .replace(/export\s+default\s+async\s+function\s+handler/, 'module.handler = async function handler');
  const sb = Object.assign({
    module: {}, console: { log() {}, warn() {}, error() {} },
    URL, URLSearchParams, TextEncoder, TextDecoder, crypto, Response, Request,
    JSON, Math, Number, String, Object, Array, Date, Set, Map, isFinite, Boolean,
    setTimeout, Promise, Error, encodeURIComponent,
  }, sandbox || {});
  vm.createContext(sb); vm.runInContext(body, sb);
  return sb.module.handler;
}
async function sign(secret, ts, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function callWebhook(event, o) {
  o = o || {};
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const rpc = [], stripe = [];
  const env = Object.assign({ STRIPE_WEBHOOK_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_URL: 'https://db.test', STRIPE_SECRET_KEY: 'sk_live_x' }, o.env || {});
  const fakeFetch = async (url, init) => {
    url = String(url);
    if (url.startsWith('https://api.stripe.com/')) {
      stripe.push({ url, init });
      if (o.stripeFail) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: [
        { status: 'open', payment: { type: 'payment_intent', payment_intent: 'pi_wrong' } },
        { status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_from_api' } }] }) };
    }
    rpc.push({ url, body: JSON.parse((init && init.body) || '{}') });
    if (o.rpcFail) return { ok: false, status: 500, text: async () => 'boom', json: async () => null };
    const b = JSON.parse((init && init.body) || '{}');
    const outcome = o.rpcOutcome || (/record_payment_event/.test(url)
      ? (b.p_event_type === 'invoice.paid' && !b.p_payment_intent_id && b.p_amount > 0 ? 'missing_link' : 'recorded')
      : 'applied');
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome }), text: async () => '' };
  };
  const handler = loadHandler(WH, { process: { env }, fetch: fakeFetch });
  const v1 = o.badSig ? 'deadbeef'.repeat(8) : await sign(SECRET, ts, raw);
  const req = new Request('https://app.test/api/billing/webhook',
    { method: 'POST', headers: { 'stripe-signature': `t=${ts},v1=${v1}` }, body: raw });
  const res = await handler(req);
  return { status: res.status, json: await res.json().catch(() => null), rpc, stripe };
}
const EV = (type, object, extra) => Object.assign({ id: 'evt_' + type.replace(/\W/g, '_'), type,
  created: Math.floor(Date.now() / 1000), livemode: true, data: { object } }, extra || {});
const INV_OLD = { id: 'in_old', object: 'invoice', customer: 'cus_1', subscription: 'sub_1',
  payment_intent: 'pi_old', amount_paid: 6999, currency: 'eur', billing_reason: 'subscription_create',
  status_transitions: { paid_at: 1760000000 },
  lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_year' } }] } };
const INV_BASIL = { id: 'in_new', object: 'invoice', customer: 'cus_1', amount_paid: 799, currency: 'eur',
  billing_reason: 'subscription_cycle', status_transitions: { paid_at: 1760000000 },
  parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_2' } },
  lines: { data: [
    { proration: true, parent: { type: 'subscription_item_details' }, pricing: { price_details: { price: 'price_proration' } } },
    { proration: false, parent: { type: 'subscription_item_details' }, pricing: { price_details: { price: 'price_month' } } }] } };
{
  const a = await callWebhook(EV('invoice.paid', INV_OLD));
  const b = a.rpc[0] && a.rpc[0].body;
  ok('C.1 invoice.paid (forma ANTIGUA) va al escritor NUEVO con PI, suscripción y precio',
    a.status === 200 && a.json.outcome === 'recorded' && a.rpc.length === 1 &&
    /\/rpc\/aurix_billing_record_payment_event$/.test(a.rpc[0].url) &&
    b.p_payment_intent_id === 'pi_old' && b.p_subscription_id === 'sub_1' && b.p_price_id === 'price_year' &&
    b.p_amount === 6999 && b.p_invoice_id === 'in_old' && b.p_customer_id === 'cus_1' &&
    b.p_paid_at === new Date(1760000000 * 1000).toISOString() && b.p_livemode === true && a.stripe.length === 0,
    JSON.stringify(a));
  ok('C.2 el webhook no decide plan, intervalo ni usuario (eso lo resuelve SQL)',
    !Object.keys(b).some(k => /plan|interval|user/.test(k)));
  const n = await callWebhook(EV('invoice.paid', INV_BASIL));
  const nb = n.rpc[0] && n.rpc[0].body;
  ok('C.3 invoice.paid (forma BASIL): suscripción de `parent`, precio de `pricing` y no del prorrateo',
    nb && nb.p_subscription_id === 'sub_2' && nb.p_price_id === 'price_month', JSON.stringify(nb));
  ok('C.4 …y el PI se obtiene de /v1/invoice_payments (sólo lectura, con la clave, el pagado)',
    n.stripe.length === 1 && /\/v1\/invoice_payments\?invoice=in_new/.test(n.stripe[0].url) &&
    n.stripe[0].init.method === 'GET' && /^Bearer sk_live_x$/.test(n.stripe[0].init.headers.Authorization) &&
    nb.p_payment_intent_id === 'pi_from_api' && n.status === 200);
  const f = await callWebhook(EV('invoice.paid', INV_BASIL), { stripeFail: true });
  ok('C.5 si el PI no se puede obtener: se registra con null y se contesta 500 para que Stripe reintente',
    f.rpc.length === 1 && f.rpc[0].body.p_payment_intent_id === null && f.status === 500 &&
    f.json.outcome === 'missing_link');
  const z = await callWebhook(EV('invoice.paid', Object.assign({}, INV_BASIL, { id: 'in_zero', amount_paid: 0 })));
  ok('C.6 una factura de 0 no tiene cobro: no se consulta Stripe y se registra',
    z.stripe.length === 0 && z.status === 200 && z.rpc[0].body.p_amount === 0);
  const r = await callWebhook(EV('charge.refunded', { id: 'ch_1', object: 'charge', customer: 'cus_1',
    payment_intent: 'pi_old', amount_refunded: 3000, currency: 'eur' }));
  ok('C.7 charge.refunded: PI del cargo e importe reembolsado ACUMULADO',
    r.status === 200 && r.rpc[0].body.p_payment_intent_id === 'pi_old' && r.rpc[0].body.p_amount === 3000 &&
    r.rpc[0].body.p_charge_id === 'ch_1' && r.rpc[0].body.p_event_type === 'charge.refunded');
  const kinds = ['charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'];
  const ds = [];
  for (const k of kinds) ds.push(await callWebhook(EV(k, { id: 'dp_1', object: 'dispute', charge: 'ch_1',
    payment_intent: 'pi_old', amount: 6999, currency: 'eur', status: k.endsWith('closed') ? 'lost' : 'needs_response' })));
  ok('C.8 las tres de disputa: id, PI, cargo, estado e importe, al escritor nuevo',
    ds.every((d, i) => d.status === 200 && d.rpc.length === 1 && /record_payment_event$/.test(d.rpc[0].url) &&
      d.rpc[0].body.p_dispute_id === 'dp_1' && d.rpc[0].body.p_payment_intent_id === 'pi_old' &&
      d.rpc[0].body.p_charge_id === 'ch_1' && d.rpc[0].body.p_amount === 6999 &&
      d.rpc[0].body.p_event_type === kinds[i]) && ds[2].rpc[0].body.p_status === 'lost');
  const dup = await callWebhook(EV('invoice.paid', INV_OLD), { rpcOutcome: 'duplicate' });
  ok('C.9 un evento repetido devuelve 200 `duplicate` (no se reintenta eternamente)',
    dup.status === 200 && dup.json.outcome === 'duplicate');
  const down = await callWebhook(EV('charge.refunded', { id: 'ch_1', payment_intent: 'pi_old', amount_refunded: 1, currency: 'eur' }), { rpcFail: true });
  ok('C.10 un fallo transitorio del escritor ⇒ 500', down.status === 500);
  const bad = await callWebhook(EV('invoice.paid', INV_OLD), { badSig: true });
  ok('C.11 la misma verificación de firma: firma mala ⇒ 400 y cero llamadas',
    bad.status === 400 && bad.rpc.length === 0 && bad.stripe.length === 0);
  const tm = await callWebhook(EV('invoice.paid', INV_BASIL, { livemode: false }));
  ok('C.12 la MISMA puerta de modo TEST: un cobro de prueba no se registra (ni se consulta Stripe)',
    tm.status === 200 && tm.json.outcome === 'ignored_testmode' && tm.rpc.length === 0 && tm.stripe.length === 0);
  const tmLive = await callWebhook(EV('charge.refunded', { id: 'ch_t', payment_intent: 'pi_t', amount_refunded: 1, currency: 'eur' }, { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1', STRIPE_SECRET_KEY: 'sk_live_x' } });
  ok('C.13 …y con clave LIVE el permiso de TEST no tiene efecto',
    tmLive.json.outcome === 'ignored_testmode' && tmLive.rpc.length === 0);
  const tmOk = await callWebhook(EV('invoice.paid', INV_OLD, { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1', STRIPE_SECRET_KEY: 'sk_test_x' } });
  ok('C.14 en un deployment de TEST con permiso, sí se registra y queda marcado livemode=false',
    tmOk.status === 200 && tmOk.json.outcome === 'recorded' && tmOk.rpc[0].body.p_livemode === false);
  const sub = await callWebhook(EV('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active',
    current_period_start: 1750000000, current_period_end: 1780000000, items: { data: [{ price: { id: 'price_year' } }] } }));
  ok('C.15 las suscripciones siguen yendo a `aurix_billing_apply_event`, sin cambios',
    sub.status === 200 && /\/rpc\/aurix_billing_apply_event$/.test(sub.rpc[0].url) &&
    Object.keys(sub.rpc[0].body).length === 14 && sub.rpc[0].body.p_price_id === 'price_year');
  const other = await callWebhook(EV('invoice.payment_failed', INV_OLD));
  ok('C.16 un tipo no manejado sigue registrándose como `ignored_type` por el escritor de M.04',
    other.json.outcome === 'ignored_type' && /apply_event$/.test(other.rpc[0].url) &&
    other.rpc[0].body.p_status === 'ignored');
  ok('C.17 el webhook sigue sin mapa de precios ni plan, y la consulta a Stripe es sólo GET',
    !/'premium'/.test(WH) && !/amount_cents/.test(WH) &&
    /invoice_payments\?invoice=/.test(WH) && !/method: 'POST'[^\n]*api\.stripe/.test(WH));
}

// ══ D · LECTURA FOUNDER ═════════════════════════════════════════════════════
console.log('\nD · lectura Founder · /api/read/affiliates');
{
  const READ = 'aurix-founder-read-token-de-pruebas-largo-123456';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-pruebas-suficientemente-largo-0000';
  process.env.AURIX_FOUNDER_READ_TOKEN = READ;
  const H = await import(path.join(root, 'api/_founder-read-handlers.mjs'));
  const R = await import(path.join(root, 'api/read/[surface].mjs'));
  const fakeRes = () => ({ statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } });
  const DATA = { available: true,
    attributions: [{ userId: 'u1', registeredAt: '2026-10-01T00:00:00+00:00', capturedAt: '2026-10-01T00:01:00+00:00',
      emailHash: 'a'.repeat(64), touches: [{ code: '123456', seenAt: '2026-09-30T10:00:00.000Z' }] }],
    payments: [{ invoiceId: 'in_1', userId: 'u1', subscriptionId: 'sub_1', paymentIntentId: 'pi_1', amountCents: 6999,
      currency: 'EUR', plan: 'premium', interval: 'year', billingReason: 'subscription_create',
      paidAt: '2026-10-01T00:05:00+00:00', livemode: true, premiumBefore: false }],
    refunds: [{ paymentIntentId: 'pi_1', amountRefundedCents: 0, currency: 'EUR', at: '2026-10-02T00:00:00+00:00', livemode: true }],
    disputes: [{ disputeId: 'dp_1', paymentIntentId: 'pi_1', status: 'won', amountCents: 6999, currency: 'EUR', at: '2026-10-03T00:00:00+00:00', livemode: true }],
    clicks: [{ code: '123456', day: '2026-09-30', clicks: 3 }],
    truncated: false };
  let lastRpc = null;
  globalThis.fetch = async (url) => { lastRpc = String(url); return new Response(JSON.stringify(DATA), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const okR = fakeRes();
  await R.default({ method: 'GET', headers: { authorization: `Bearer ${READ}` }, query: { surface: 'affiliates' } }, okR);
  const a = okR.body && okR.body.affiliates;
  ok('D.1 la superficie `affiliates` se sirve desde la ruta ÚNICA con el contrato aurix.read.v1',
    okR.statusCode === 200 && okR.body.contract === 'aurix.read.v1' && /\/rpc\/founder_read_affiliates$/.test(lastRpc) &&
    ['contract', 'generatedAt', 'platform', 'affiliates'].every(k => k in okR.body));
  ok('D.2 forma exacta: available, attributions, payments, refunds, disputes, clicks, truncated',
    a && JSON.stringify(Object.keys(a).sort()) ===
      JSON.stringify(['attributions', 'available', 'clicks', 'disputes', 'payments', 'refunds', 'truncated']));
  ok('D.3 claves camelCase de cada lista, como las publica SQL',
    JSON.stringify(Object.keys(a.payments[0]).sort()) === JSON.stringify(['amountCents', 'billingReason', 'currency',
      'interval', 'invoiceId', 'livemode', 'paidAt', 'paymentIntentId', 'plan', 'premiumBefore', 'subscriptionId', 'userId']) &&
    JSON.stringify(Object.keys(a.attributions[0]).sort()) === JSON.stringify(['capturedAt', 'emailHash', 'registeredAt', 'touches', 'userId']) &&
    JSON.stringify(Object.keys(a.clicks[0]).sort()) === JSON.stringify(['clicks', 'code', 'day']));
  ok('D.4 ningún correo viaja: sólo su hash', !/@/.test(JSON.stringify(okR.body)));
  const no = fakeRes();
  await R.default({ method: 'GET', headers: {}, query: { surface: 'affiliates' } }, no);
  ok('D.5 sin credencial ⇒ 401 (el mismo guard)', no.statusCode === 401 && !no.body.affiliates);
  const post = fakeRes();
  await H.affiliatesHandler({ method: 'POST', headers: { authorization: `Bearer ${READ}` } }, post);
  ok('D.6 sólo GET', post.statusCode === 405);
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 });
  const na = fakeRes();
  await H.affiliatesHandler({ method: 'GET', headers: { authorization: `Bearer ${READ}` } }, na);
  ok('D.7 sin aplicar ⇒ `affiliates: {available:false, reason:"not_applied"}`, nunca listas vacías inventadas',
    na.statusCode === 200 && na.body.affiliates.available === false && na.body.affiliates.reason === 'not_applied' &&
    !('payments' in na.body.affiliates));
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const nc = fakeRes();
  await H.affiliatesHandler({ method: 'GET', headers: { authorization: `Bearer ${READ}` } }, nc);
  ok('D.8 sin configurar ⇒ `not_configured`', nc.body.affiliates.reason === 'not_configured');
  const unk = fakeRes();
  await R.default({ method: 'GET', headers: { authorization: `Bearer ${READ}` }, query: { surface: 'affiliate' } }, unk);
  ok('D.9 una superficie desconocida sigue siendo 404', unk.statusCode === 404);
}

// ══ E · CUPO DE FUNCIONES ═══════════════════════════════════════════════════
console.log('\nE · cupo de funciones del plan');
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.name.startsWith('_') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const entries = walk(path.join(root, 'api')).filter(f => /\.(js|mjs|ts)$/.test(f));
  const edge = entries.filter(f => /export const config = \{ runtime: 'edge' \}/.test(fs.readFileSync(f, 'utf8')));
  ok(`E.1 siguen siendo 12 Serverless + 1 Edge (hay ${entries.length - edge.length} + ${edge.length})`,
    entries.length - edge.length === 12 && edge.length === 1);
  ok('E.2 no hay fichero nuevo de ruta para afiliados',
    !fs.existsSync(path.join(root, 'api/read/affiliates.js')) && !fs.existsSync(path.join(root, 'api/read/affiliates.mjs')) &&
    !entries.some(f => /affiliat|attribution|click/i.test(path.basename(f))));
}

// ══ F · SQL ═════════════════════════════════════════════════════════════════
console.log('\nF · SQL · forma de las garantías');
{
  const att = sqlCode(SQL_ATT), pay = sqlCode(SQL_PAY), rd = sqlCode(SQL_READ);
  const cap = sqlFn(SQL_ATT, 'aurix_attribution_capture');
  ok('F.1 cada migración es atómica y se verifica antes del commit',
    [att, pay, rd].every(s => /^begin;/m.test(s) && /^commit;/m.test(s) && /do \$\$[\s\S]*APPLY VERIFIED[\s\S]*end \$\$;\s*\n\s*commit;/.test(s)));
  ok('F.2 tienen su rollback emparejado',
    ['db/affiliate_attribution_1_rollback.sql', 'db/billing_payments_1_rollback.sql', 'db/founder_read_affiliates_1_rollback.sql']
      .every(f => fs.existsSync(path.join(root, f))));
  ok('F.3 la atribución NO tiene camino de UPDATE: ni sentencia, ni upsert, ni grant',
    !/update\s+public\.acquisition_attributions/i.test(att) && !/do update/i.test(cap) &&
    /on conflict \(user_id\) do nothing/.test(cap) && !/grant[^;]*on public\.acquisition_attributions/i.test(att));
  ok('F.4 …y un trigger la rechaza incluso para el owner',
    /create trigger acquisition_attributions_no_update\s+before update on public\.acquisition_attributions/.test(att) &&
    /raise exception 'acquisition_attributions es inmutable/.test(att));
  ok('F.5 tabla de atribución: FK a auth.users con cascade, RLS deny y revoke al cliente',
    /user_id\s+uuid\s+primary key references auth\.users \(id\) on delete cascade/.test(att) &&
    /create policy acquisition_attributions_no_client[\s\S]{0,160}as restrictive[\s\S]{0,120}using\s+\(false\)/.test(att) &&
    /revoke all on public\.acquisition_attributions from anon, authenticated;/.test(att) &&
    /check \(public\.aurix_attribution_touches_ok\(touches\)\)/.test(att));
  ok('F.6 capture: el usuario es auth.uid(), y sólo `authenticated` puede llamarla',
    /v_uid\s+uuid := auth\.uid\(\);/.test(cap) && !/p_user/.test(cap) &&
    /security definer\s+set search_path = public, pg_temp/.test(cap) &&
    /revoke all\s+on function public\.aurix_attribution_capture\(jsonb\) from public, anon, authenticated;/.test(att) &&
    /grant\s+execute on function public\.aurix_attribution_capture\(jsonb\) to\s+authenticated;/.test(att));
  ok('F.7 capture valida 1..5, 6 dígitos, distintos y la ventana [-31 días, +5 min]',
    /v_n < 1 or v_n > 5/.test(cap) && /!~ '\^\[0-9\]\{6\}\$'/.test(cap) &&
    /count\(distinct e ->> 'code'\)/.test(cap) && /interval '31 days'/.test(cap) && /interval '5 minutes'/.test(cap));
  ok('F.8 capture: la atribución se fija AL REGISTRARSE (24 h) o es `too_late`',
    /v_created < now\(\) - interval '24 hours'[\s\S]{0,80}'too_late'/.test(cap));
  const clk = sqlFn(SQL_ATT, 'aurix_affiliate_click');
  ok('F.9 visitas: anon puede contar, con tope por fila y por día, por día de Madrid',
    /grant\s+execute on function public\.aurix_affiliate_click\(text\) to\s+anon, authenticated;/.test(att) &&
    /least\(c\.clicks \+ 1, 100000\)/.test(clk) && />= 10000/.test(clk) && /'Europe\/Madrid'/.test(clk) &&
    /revoke all on public\.affiliate_clicks from anon, authenticated;/.test(att));
  const clkTable = between(att, 'create table if not exists public.affiliate_clicks', ');');
  ok('F.10 visitas: sin IP, sin cookie, sin agente — sólo (código, día, número)',
    !/\bip\b|inet|cookie|agent|user_id|email/i.test(clkTable));
  ok('F.11 el indicador anónimo queda documentado como NO evidencia de dinero',
    /INFLABLE/.test(SQL_ATT) && /NUNCA para calcular dinero/.test(SQL_ATT) && /NUNCA como evidencia de dinero/.test(SQL_READ));
  const rec = sqlFn(SQL_PAY, 'aurix_billing_record_payment_event');
  ok('F.12 idempotencia: la fila del ledger se inserta EN LA MISMA función, y un aplicado repetido es `duplicate`',
    /insert into public\.billing_events \(provider, event_id, event_type, outcome, applied\)[\s\S]{0,200}on conflict \(provider, event_id\) do nothing;[\s\S]{0,200}if not found then[\s\S]{0,300}for update;[\s\S]{0,80}if v_ev\.applied then[\s\S]{0,80}'duplicate'/.test(rec) &&
    rec.indexOf('insert into public.billing_events') < rec.indexOf('insert into public.billing_payments') &&
    /set outcome = 'recorded', applied = true/.test(rec));
  ok('F.13 el ledger admite los dos resultados nuevos, con el MISMO nombre de CHECK',
    /add constraint billing_events_outcome_chk[\s\S]{0,400}'recorded','missing_link'/.test(pay));
  ok('F.14 usuario por billing_customers; plan e intervalo por billing_prices (no del payload)',
    /from public\.billing_customers bc[\s\S]{0,120}bc\.provider_customer_id = p_customer_id/.test(rec) &&
    /from public\.billing_prices bp[\s\S]{0,120}bp\.provider_price_id = p_price_id/.test(rec) &&
    /v_price\.plan, v_price\.billing_interval/.test(rec) && !/p_plan|p_interval|p_user/.test(rec));
  ok('F.15 cobro: una fila por factura y un repetido sólo RELLENA huecos',
    /primary key \(provider, invoice_id\)/.test(pay) &&
    /on conflict \(provider, invoice_id\) do update set\s+payment_intent_id = coalesce\(bp\.payment_intent_id, excluded\.payment_intent_id\)/.test(rec) &&
    !/amount_paid_cents\s*=\s*excluded/.test(rec));
  ok('F.16 cobro > 0 sin PI ⇒ `missing_link`, NO aplicado (reintentable)',
    /p_payment_intent_id is null and p_amount > 0[\s\S]{0,120}outcome = 'missing_link', applied = false/.test(rec));
  ok('F.17 reembolso: se queda el MÁXIMO acumulado y la fecha más nueva',
    /greatest\(r\.amount_refunded_cents, excluded\.amount_refunded_cents\)/.test(rec) &&
    /greatest\(r\.last_event_at, excluded\.last_event_at\)/.test(rec));
  ok('F.18 disputa: sólo escribe un evento MÁS NUEVO (desorden inocuo) y si no, `stale`',
    /where excluded\.last_event_at > d\.last_event_at/.test(rec) && /v_rows = 0[\s\S]{0,120}'stale'/.test(rec));
  ok('F.19 el escritor es SÓLO service_role; las tablas, cerradas al cliente',
    /revoke all\s+on function public\.aurix_billing_record_payment_event\([\s\S]{0,200}from public, anon, authenticated;/.test(pay) &&
    /grant\s+execute on function public\.aurix_billing_record_payment_event\([\s\S]{0,200}to service_role;/.test(pay) &&
    ['billing_payments', 'billing_refunds', 'billing_disputes'].every(t =>
      new RegExp('revoke all on public\\.' + t + '\\s+from anon, authenticated;').test(pay) &&
      new RegExp('create policy ' + t + '_no_client[\\s\\S]{0,120}as restrictive').test(pay)));
  ok('F.20 la evidencia de cobro no toca el acceso: ni subscriptions ni el escritor de M.04',
    !/public\.subscriptions|aurix_billing_apply_event|entitlement_overrides/.test(pay));
  ok('F.21 M.04 sigue verificándose si se reaplica (el escritor nuevo no es un overload sobrante)',
    /and p\.proname <> 'aurix_billing_record_payment_event'/.test(read('db/monetization_m04_billing_stripe_1.sql')));
  const fr = sqlFn(SQL_READ, 'founder_read_affiliates');
  ok('F.22 lectura: stable + security definer + search_path, sólo service_role',
    /stable\s+security definer\s+set search_path = public, auth, pg_catalog/.test(fr) &&
    /revoke all\s+on function public\.founder_read_affiliates\(\) from public, anon, authenticated;/.test(rd) &&
    /grant\s+execute on function public\.founder_read_affiliates\(\) to service_role;/.test(rd) &&
    !/\b(insert into|update\s+public\.|delete from)\b/i.test(fr));
  ok('F.23 lectura: sólo usuarios con atribución y sólo cobros Premium; reembolsos/disputas por PI',
    /p\.plan = 'premium'[\s\S]{0,120}p\.user_id in \(select user_id from public\.acquisition_attributions\)/.test(fr) &&
    /join pis on pis\.provider = r\.provider and pis\.payment_intent_id = r\.payment_intent_id/.test(fr) &&
    /join pis on pis\.provider = d\.provider and pis\.payment_intent_id = d\.payment_intent_id/.test(fr));
  ok('F.24 lectura: el correo sale como sha256 de lower(trim()), y null si no hay',
    /encode\(sha256\(convert_to\(lower\(trim\(att\.email\)\), 'UTF8'\)\), 'hex'\)/.test(fr) &&
    /nullif\(trim\(att\.email\), ''\) is null then null/.test(fr) && !/'email'\s*,/.test(fr));
  ok('F.25 lectura: premiumBefore = cobro previo > 0 · evento aplicado > 10 min antes · override previo',
    /e\.amount_paid_cents > 0 and e\.paid_at < p\.paid_at/.test(fr) &&
    /be\.received_at < p\.paid_at - interval '10 minutes'/.test(fr) &&
    /o\.allowed\s+and o\.created_at < p\.paid_at/.test(fr) && /'premiumBefore',\s+pay\.premium_before/.test(fr));
  ok('F.26 lectura: tope de 5000 por lista con `truncated`, y visitas de los últimos 400 días',
    /select 5000 as n/.test(fr) && /'truncated'/.test(fr) && /- 400/.test(fr) &&
    /'day',\s+to_char\(clk\.day, 'YYYY-MM-DD'\)/.test(fr));
  const keys = ['userId', 'registeredAt', 'capturedAt', 'emailHash', 'touches', 'invoiceId', 'subscriptionId',
    'paymentIntentId', 'amountCents', 'currency', 'plan', 'interval', 'billingReason', 'paidAt', 'livemode',
    'premiumBefore', 'amountRefundedCents', 'at', 'disputeId', 'status', 'code', 'day', 'clicks',
    'attributions', 'payments', 'refunds', 'disputes', 'truncated', 'available'];
  ok('F.27 lectura: publica exactamente las claves del contrato', keys.every(k => fr.includes(`'${k}'`)),
    keys.filter(k => !fr.includes(`'${k}'`)).join(','));
}

// ══ G · PRIVACIDAD ══════════════════════════════════════════════════════════
console.log('\nG · privacidad publicada');
{
  const es = between(PRIV, '<div data-lang-block="es">', '<!-- ══ ENGLISH');
  const en = PRIV.slice(PRIV.indexOf('<!-- ══ ENGLISH'));
  ok('G.1 ES: código en localStorage, hasta 30 días, sólo con permiso, qué y para qué',
    /localStorage/.test(es) && /30 días/.test(es) && /Sólo si aceptas/.test(es) && /comisión/.test(es) && /hasta cinco/.test(es));
  ok('G.2 EN: lo mismo',
    /localStorage/.test(en) && /30 days/.test(en) && /Only if you accept/.test(en) && /commission/.test(en) && /up to five/.test(en));
  ok('G.3 se declara que las visitas no guardan IP ni cookies (ES y EN)',
    /No guarda tu dirección IP/.test(es) && /does not store your IP address/.test(en));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL harness crashed: ' + (e && e.stack || e)); process.exit(1); });
