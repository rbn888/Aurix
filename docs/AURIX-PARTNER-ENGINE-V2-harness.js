'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PARTNER-ENGINE-V2 — desglose del cobro (base de una comisión por %)
// ════════════════════════════════════════════════════════════════════════════
// Aurix REGISTRA lo que Stripe dice de cada factura pagada —subtotal,
// descuentos, impuesto, total sin impuesto y si Stripe CALCULÓ el impuesto— y
// lo publica en /api/read/affiliates. Founder decide si la base es certificable.
// Este gate EJECUTA la extracción real del webhook (la función pura entre sus
// marcadores, y el handler entero en un sandbox con firma HMAC de verdad y
// `fetch` falso) y comprueba la FORMA del SQL. La ejecución del SQL la hace
// scripts/aurix-partner-breakdown-sql-rehearsal.mjs (PGlite).
//
//   A · extracción pura: forma antigua, forma basil, sin impuesto, automatic_tax,
//       descuentos sumados, basura
//   B · webhook: sólo invoice.paid llama al desglose, duplicado inocuo, fallo ⇒
//       500, rechazo ⇒ 200, nada cambia en firma / modo TEST / suscripciones
//   C · SQL del desglose: inmutable, cerrado, sólo service_role, sin acceso
//   D · lectura v2: v1 + cuatro claves por LEFT JOIN, sin resembrar; rollback = v1
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const WH      = read('api/billing/webhook.mjs');
const SQL_BD  = read('db/billing_payment_breakdown_1.sql');
const SQL_BDR = read('db/billing_payment_breakdown_1_rollback.sql');
const SQL_R1  = read('db/founder_read_affiliates_1.sql');
const SQL_R2  = read('db/founder_read_affiliates_2.sql');
const SQL_R2R = read('db/founder_read_affiliates_2_rollback.sql');

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

(async () => {
console.log('\nAURIX-PARTNER-ENGINE-V2 — desglose del cobro\n');

// ══ A · EXTRACCIÓN PURA ═════════════════════════════════════════════════════
console.log('A · extracción del desglose (función pura del webhook)');
const BD_SRC = between(WH, '// AURIX-BREAKDOWN:BEGIN', '// AURIX-BREAKDOWN:END');
const sbx = { Number, Array, JSON };
vm.createContext(sbx); vm.runInContext(BD_SRC, sbx);
const bdOf = (o) => JSON.parse(vm.runInContext(`JSON.stringify(paymentBreakdownOf(${JSON.stringify(o)}))`, sbx));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
{
  ok('A.0 la función es pura: ni red, ni env, ni Stripe', !/fetch|process\.env|await|api\.stripe/.test(BD_SRC));
  // Forma ANTIGUA, sin impuesto automático (lo que hoy emite el checkout).
  const legacyNoTax = { subtotal: 6999, total_excluding_tax: 6999, tax: null, total_tax_amounts: [],
    total_discount_amounts: [], automatic_tax: { enabled: false, status: null } };
  ok('A.1 forma antigua sin impuesto ⇒ not_computed, tax null (NO 0), descuento 0',
    eq(bdOf(legacyNoTax), { subtotal: 6999, discount: 0, tax: null, totalExcludingTax: 6999, taxStatus: 'not_computed' }),
    JSON.stringify(bdOf(legacyNoTax)));
  const legacyTax = { subtotal: 6999, total_excluding_tax: 5784, tax: 1215,
    total_tax_amounts: [{ amount: 1215, inclusive: true, tax_rate: 'txr_1' }],
    total_discount_amounts: [], automatic_tax: { enabled: false } };
  ok('A.2 forma antigua con línea de impuesto ⇒ computed y la suma de total_tax_amounts',
    eq(bdOf(legacyTax), { subtotal: 6999, discount: 0, tax: 1215, totalExcludingTax: 5784, taxStatus: 'computed' }),
    JSON.stringify(bdOf(legacyTax)));
  const basil = { subtotal: 6999, total_excluding_tax: 5784,
    total_taxes: [{ amount: 1000, tax_behavior: 'inclusive' }, { amount: 215, tax_behavior: 'inclusive' }],
    total_discount_amounts: [{ amount: 500, discount: 'di_1' }, { amount: 200, discount: 'di_2' }],
    automatic_tax: { enabled: true, status: 'complete' } };
  ok('A.3 forma basil: total_taxes sumado y descuentos sumados',
    eq(bdOf(basil), { subtotal: 6999, discount: 700, tax: 1215, totalExcludingTax: 5784, taxStatus: 'computed' }),
    JSON.stringify(bdOf(basil)));
  const autoZero = { subtotal: 799, total_excluding_tax: 799, total_taxes: [],
    total_discount_amounts: [], automatic_tax: { enabled: true, status: 'complete' } };
  ok('A.4 automatic_tax complete con 0 € de impuesto ⇒ computed y tax 0 (exento de verdad)',
    eq(bdOf(autoZero), { subtotal: 799, discount: 0, tax: 0, totalExcludingTax: 799, taxStatus: 'computed' }));
  const autoPending = { subtotal: 799, total_taxes: [], automatic_tax: { enabled: true, status: 'requires_location_inputs' } };
  ok('A.5 automatic_tax habilitado pero NO complete ⇒ not_computed',
    bdOf(autoPending).taxStatus === 'not_computed' && bdOf(autoPending).tax === null);
  const basilNoTax = { subtotal: 799, total_excluding_tax: 799, total_taxes: [], total_discount_amounts: [] };
  ok('A.6 forma basil sin impuesto ⇒ not_computed, tax null', bdOf(basilNoTax).taxStatus === 'not_computed' && bdOf(basilNoTax).tax === null);
  const autoNoFigure = { subtotal: 799, automatic_tax: { enabled: true, status: 'complete' } };
  ok('A.7 "calculado" sin cifra en ninguna forma ⇒ not_computed (no se inventa un 0)',
    eq(bdOf(autoNoFigure), { subtotal: 799, discount: null, tax: null, totalExcludingTax: null, taxStatus: 'not_computed' }));
  ok('A.8 sin campos de desglose ⇒ todo null y not_computed',
    eq(bdOf({}), { subtotal: null, discount: null, tax: null, totalExcludingTax: null, taxStatus: 'not_computed' }));
  ok('A.9 un importe ilegible no produce una suma parcial (null), ni negativos ni decimales',
    bdOf({ total_discount_amounts: [{ amount: 100 }, { amount: -5 }] }).discount === null &&
    bdOf({ total_discount_amounts: [{ amount: 1.5 }] }).discount === null &&
    bdOf({ subtotal: -1 }).subtotal === null && bdOf({ subtotal: '799' }).subtotal === null &&
    bdOf({ total_taxes: [{ amount: 'x' }], automatic_tax: { enabled: true, status: 'complete' } }).taxStatus === 'not_computed');
  ok('A.10 fuera de int4 ⇒ null (nunca un error de la base que haga reintentar para siempre)',
    bdOf({ subtotal: 2147483648 }).subtotal === null &&
    bdOf({ total_discount_amounts: [{ amount: 2147483647 }, { amount: 1 }] }).discount === null);
  ok('A.11 `total_taxes` (basil) manda sobre `total_tax_amounts` y sobre `tax`',
    bdOf({ total_taxes: [{ amount: 10 }], total_tax_amounts: [{ amount: 99 }], tax: 77 }).tax === 10 &&
    bdOf({ total_tax_amounts: [{ amount: 99 }], tax: 77 }).tax === 99);
  ok('A.12 sólo `tax` entero (sin listas ni automatic_tax) ⇒ not_computed: no hay prueba de cálculo',
    bdOf({ tax: 0 }).taxStatus === 'not_computed' && bdOf({ tax: 0 }).tax === null);
}

// ══ B · WEBHOOK ═════════════════════════════════════════════════════════════
console.log('\nB · webhook · el desglose viaja con invoice.paid');
const SECRET = 'whsec_test_partner_engine_v2';
function loadHandler(src, sandbox) {
  const body = src
    .replace(/export\s+const\s+config\s*=/, 'module.config =')
    .replace(/export\s+default\s+async\s+function\s+handler/, 'module.handler = async function handler');
  const errors = [];
  const sb = Object.assign({
    module: {}, console: { log() {}, warn() {}, error(...a) { errors.push(a.join(' ')); } },
    URL, URLSearchParams, TextEncoder, TextDecoder, crypto, Response, Request,
    JSON, Math, Number, String, Object, Array, Date, Set, Map, isFinite, Boolean,
    setTimeout, Promise, Error, encodeURIComponent,
  }, sandbox || {});
  vm.createContext(sb); vm.runInContext(body, sb);
  return { handler: sb.module.handler, errors };
}
async function sign(secret, ts, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// o.recordOutcome: lo que contesta aurix_billing_record_payment_event.
// o.recordFail / o.bdFail: non-2xx de cada RPC. o.bdOutcome: lo que contesta el desglose.
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
      return { ok: true, status: 200, json: async () => ({ data: [
        { status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_from_api' } }] }) };
    }
    const b = JSON.parse((init && init.body) || '{}');
    rpc.push({ url, body: b });
    const isBd = /record_payment_breakdown$/.test(url);
    if ((isBd && o.bdFail) || (!isBd && o.recordFail)) {
      return { ok: false, status: 503, text: async () => 'boom DETAIL: Failing row contains (in_secret)', json: async () => null };
    }
    const outcome = isBd ? (o.bdOutcome || 'recorded')
      : /record_payment_event$/.test(url) ? (o.recordOutcome || 'recorded') : 'applied';
    return { ok: true, status: 200, json: async () => ({ ok: outcome !== 'rejected', outcome }), text: async () => '' };
  };
  const { handler, errors } = loadHandler(WH, { process: { env }, fetch: fakeFetch });
  const v1 = o.badSig ? 'deadbeef'.repeat(8) : await sign(SECRET, ts, raw);
  const req = new Request('https://app.test/api/billing/webhook',
    { method: 'POST', headers: { 'stripe-signature': `t=${ts},v1=${v1}` }, body: raw });
  const res = await handler(req);
  return { status: res.status, json: await res.json().catch(() => null), rpc, stripe, errors };
}
const EV = (type, object, extra) => Object.assign({ id: 'evt_' + type.replace(/\W/g, '_'), type,
  created: Math.floor(Date.now() / 1000), livemode: true, data: { object } }, extra || {});
const INV_OLD = { id: 'in_old', object: 'invoice', customer: 'cus_1', subscription: 'sub_1',
  payment_intent: 'pi_old', amount_paid: 6999, currency: 'eur', billing_reason: 'subscription_create',
  status_transitions: { paid_at: 1760000000 }, subtotal: 6999, total_excluding_tax: 6999, tax: null,
  total_tax_amounts: [], total_discount_amounts: [], automatic_tax: { enabled: false, status: null },
  lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_year' } }] } };
const INV_BASIL = { id: 'in_new', object: 'invoice', customer: 'cus_1', amount_paid: 6499, currency: 'eur',
  billing_reason: 'subscription_create', status_transitions: { paid_at: 1760000000 },
  subtotal: 6999, total_excluding_tax: 5371,
  total_taxes: [{ amount: 1128, tax_behavior: 'inclusive' }],
  total_discount_amounts: [{ amount: 500, discount: 'di_1' }],
  automatic_tax: { enabled: true, status: 'complete' },
  parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_2' } },
  lines: { data: [{ proration: false, parent: { type: 'subscription_item_details' }, pricing: { price_details: { price: 'price_year' } } }] } };
{
  const a = await callWebhook(EV('invoice.paid', INV_OLD));
  const bd = a.rpc[1] && a.rpc[1].body;
  ok('B.1 invoice.paid (antigua): primero el cobro, DESPUÉS el desglose, y 200',
    a.status === 200 && a.json.outcome === 'recorded' && a.rpc.length === 2 &&
    /\/rpc\/aurix_billing_record_payment_event$/.test(a.rpc[0].url) &&
    /\/rpc\/aurix_billing_record_payment_breakdown$/.test(a.rpc[1].url), JSON.stringify(a.rpc.map(r => r.url)));
  ok('B.2 …con exactamente los argumentos del escritor SQL y not_computed / tax null',
    bd && eq(Object.keys(bd).sort(), ['p_discount', 'p_event_id', 'p_invoice_id', 'p_provider', 'p_subtotal',
      'p_tax', 'p_tax_status', 'p_total_excluding_tax']) &&
    bd.p_provider === 'stripe' && bd.p_event_id === 'evt_invoice_paid' && bd.p_invoice_id === 'in_old' &&
    bd.p_subtotal === 6999 && bd.p_discount === 0 && bd.p_tax === null && bd.p_total_excluding_tax === 6999 &&
    bd.p_tax_status === 'not_computed', JSON.stringify(bd));
  const n = await callWebhook(EV('invoice.paid', INV_BASIL));
  const nb = n.rpc[1] && n.rpc[1].body;
  ok('B.3 invoice.paid (basil, automatic_tax complete): computed, impuesto y descuento de Stripe',
    n.status === 200 && nb && nb.p_tax_status === 'computed' && nb.p_tax === 1128 && nb.p_discount === 500 &&
    nb.p_subtotal === 6999 && nb.p_total_excluding_tax === 5371 && nb.p_invoice_id === 'in_new', JSON.stringify(nb));
  ok('B.4 el cobro que va al escritor V1 no cambia de forma (17 argumentos, mismo importe)',
    Object.keys(n.rpc[0].body).length === 17 && n.rpc[0].body.p_amount === 6499 && n.rpc[0].body.p_payment_intent_id === 'pi_from_api');
  const dup = await callWebhook(EV('invoice.paid', INV_OLD), { recordOutcome: 'duplicate', bdOutcome: 'duplicate' });
  ok('B.5 entrega DUPLICADA: se vuelve a llamar al desglose (inocuo, primera escritura gana) y 200 duplicate',
    dup.status === 200 && dup.json.outcome === 'duplicate' && dup.rpc.length === 2 &&
    /record_payment_breakdown$/.test(dup.rpc[1].url));
  const bf = await callWebhook(EV('invoice.paid', INV_OLD), { bdFail: true });
  ok('B.6 el desglose falla (non-2xx) ⇒ 500 para que Stripe reintente',
    bf.status === 500 && bf.json.error === 'breakdown_failed' && bf.rpc.length === 2);
  ok('B.7 …y el log no lleva identificadores (safeDetail corta DETAIL/Failing row)',
    bf.errors.length === 1 && /breakdown failed 503/.test(bf.errors[0]) && !/in_secret|in_old|evt_/.test(bf.errors.join(' ')),
    JSON.stringify(bf.errors));
  const rj = await callWebhook(EV('invoice.paid', INV_OLD), { bdOutcome: 'rejected' });
  ok('B.8 desglose `rejected` (dato malo) es definitivo ⇒ 200 con el resultado del cobro',
    rj.status === 200 && rj.json.outcome === 'recorded');
  const ml = await callWebhook(EV('invoice.paid', Object.assign({}, INV_BASIL, { id: 'in_ml' })), { recordOutcome: 'missing_link' });
  ok('B.9 cobro `missing_link` ⇒ 500 SIN desglose (lo completa el reintento)',
    ml.status === 500 && ml.rpc.length === 1);
  const iv = await callWebhook(EV('invoice.paid', INV_OLD), { recordOutcome: 'invalid_payload' });
  ok('B.10 cobro `invalid_payload` ⇒ sin desglose', iv.rpc.length === 1 && iv.status === 200);
  const rf = await callWebhook(EV('invoice.paid', INV_OLD), { recordFail: true });
  ok('B.11 si el cobro falla, ni se intenta el desglose (500)', rf.status === 500 && rf.rpc.length === 1);
  const others = [
    EV('charge.refunded', { id: 'ch_1', payment_intent: 'pi_old', amount_refunded: 100, currency: 'eur', subtotal: 1, total_taxes: [{ amount: 1 }] }),
    EV('charge.dispute.created', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_old', amount: 6999, currency: 'eur', status: 'needs_response' }),
    EV('charge.dispute.closed', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_old', amount: 6999, currency: 'eur', status: 'lost' }),
    EV('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active',
      current_period_start: 1750000000, current_period_end: 1780000000, items: { data: [{ price: { id: 'price_year' } }] } }),
    EV('invoice.payment_failed', INV_OLD),
    EV('checkout.session.completed', { id: 'cs_1', customer: 'cus_1' }),
  ];
  const rs = [];
  for (const e of others) rs.push(await callWebhook(e));
  ok('B.12 ningún otro evento llama al desglose (reembolso, disputas, suscripción, no manejados)',
    rs.every(r => r.status === 200 && r.rpc.length === 1 && !r.rpc.some(x => /breakdown/.test(x.url))),
    JSON.stringify(rs.map(r => [r.status, r.rpc.map(x => x.url)])));
  const bad = await callWebhook(EV('invoice.paid', INV_OLD), { badSig: true });
  ok('B.13 firma mala ⇒ 400 y cero llamadas (verificación intacta)', bad.status === 400 && bad.rpc.length === 0);
  const tm = await callWebhook(EV('invoice.paid', INV_OLD, { livemode: false }));
  ok('B.14 la puerta de modo TEST sigue cerrando antes del cobro y del desglose',
    tm.status === 200 && tm.json.outcome === 'ignored_testmode' && tm.rpc.length === 0);
  const tmOk = await callWebhook(EV('invoice.paid', INV_OLD, { livemode: false }),
    { env: { BILLING_ALLOW_TEST_EVENTS: '1', STRIPE_SECRET_KEY: 'sk_test_x' } });
  ok('B.15 en un deployment de TEST con permiso, el desglose también se registra',
    tmOk.status === 200 && tmOk.rpc.length === 2 && /breakdown$/.test(tmOk.rpc[1].url));
  ok('B.16 el webhook no calcula impuestos, porcentajes ni comisiones',
    !/commission|comision|percent|vat_rate|\* 0\.\d|\/ 1\.\d/i.test(BD_SRC) && !/'premium'/.test(WH));
}

// ══ C · SQL DEL DESGLOSE ════════════════════════════════════════════════════
console.log('\nC · SQL · billing_payment_breakdowns');
{
  const bd = sqlCode(SQL_BD), fn = sqlFn(SQL_BD, 'aurix_billing_record_payment_breakdown');
  const tbl = between(bd, 'create table if not exists public.billing_payment_breakdowns', '\n);');
  ok('C.1 atómica y verificada antes del commit; rollback emparejado',
    /^begin;/m.test(bd) && /do \$\$[\s\S]*APPLY VERIFIED[\s\S]*end \$\$;\s*\n\s*commit;/.test(bd) &&
    /^begin;/m.test(SQL_BDR) && /^commit;/m.test(SQL_BDR));
  ok('C.2 tabla: PK (provider, invoice_id), columnas pedidas, importes no negativos',
    /primary key \(provider, invoice_id\)/.test(tbl) &&
    ['subtotal_cents', 'discount_cents', 'tax_cents', 'total_excluding_tax_cents'].every(c => new RegExp(c + '\\s+integer,').test(tbl)) &&
    /tax_status\s+text\s+not null/.test(tbl) && /event_id\s+text\s+not null/.test(tbl) &&
    /recorded_at\s+timestamptz not null default now\(\)/.test(tbl) &&
    /check \(tax_status in \('computed','not_computed'\)\)/.test(tbl) &&
    /coalesce\(subtotal_cents, 0\) >= 0[\s\S]*coalesce\(total_excluding_tax_cents, 0\) >= 0/.test(tbl));
  ok('C.3 "no calculado" nunca es 0: computed ⇔ tax_cents no nulo (CHECK)',
    /\(tax_status = 'computed'\) = \(tax_cents is not null\)/.test(tbl));
  ok('C.4 RLS deny restrictivo + revoke al cliente',
    /alter table public\.billing_payment_breakdowns enable row level security;/.test(bd) &&
    /create policy billing_payment_breakdowns_no_client[\s\S]{0,140}as restrictive for all to anon, authenticated using \(false\) with check \(false\)/.test(bd) &&
    /revoke all on public\.billing_payment_breakdowns from anon, authenticated;/.test(bd));
  ok('C.5 escritor: security definer, search_path fijo, sólo service_role',
    /security definer\s+set search_path = public, pg_temp/.test(fn) &&
    /revoke all\s+on function public\.aurix_billing_record_payment_breakdown\([\s\S]{0,120}\) from public, anon, authenticated;/.test(bd) &&
    /grant\s+execute on function public\.aurix_billing_record_payment_breakdown\([\s\S]{0,120}\) to service_role;/.test(bd));
  ok('C.6 primera escritura gana: on conflict do nothing ⇒ duplicate; sin camino de UPDATE',
    /on conflict \(provider, invoice_id\) do nothing;\s+if not found then\s+return jsonb_build_object\('ok', true, 'outcome', 'duplicate'\)/.test(fn) &&
    !/do update|update\s+public\./i.test(fn));
  ok('C.7 entrada mala ⇒ rejected SIN raise (como invalid_payload del escritor V1)',
    ['missing_event', 'missing_invoice', 'bad_tax_status', 'negative_amount', 'tax_status_mismatch']
      .every(r => new RegExp("'outcome', 'rejected', 'reason', '" + r + "'").test(fn)) && !/raise/.test(sqlCode(fn)));
  ok('C.8 no toca acceso ni el resto de la evidencia',
    !/public\.subscriptions|entitlement_overrides|aurix_billing_apply_event|billing_events|insert into public\.billing_payments\b|update public\.billing_payments/.test(sqlCode(SQL_BD)));
  ok('C.9 el rollback se niega si la lectura v2 sigue viva, y borra función y tabla',
    /position\('billing_payment_breakdowns' in\s+pg_get_functiondef/.test(SQL_BDR) &&
    /drop function if exists public\.aurix_billing_record_payment_breakdown\(/.test(SQL_BDR) &&
    /drop table if exists public\.billing_payment_breakdowns;/.test(SQL_BDR) &&
    !/billing_payments;|billing_events/.test(sqlCode(SQL_BDR).replace(/to_regclass\('public\.billing_payments'\)/g, '')));
  ok('C.10 M.04 reaplicado no lo toma por overload sobrante',
    /p\.proname not in \('aurix_billing_record_payment_event',\s+'aurix_billing_record_payment_breakdown'\)/.test(read('db/monetization_m04_billing_stripe_1.sql')));
}

// ══ D · LECTURA v2 ══════════════════════════════════════════════════════════
console.log('\nD · lectura Founder v2');
{
  const f1 = sqlFn(SQL_R1, 'founder_read_affiliates'), f2 = sqlFn(SQL_R2, 'founder_read_affiliates');
  const fr = sqlFn(SQL_R2R, 'founder_read_affiliates');
  ok('D.1 cada cobro gana EXACTAMENTE cuatro claves del desglose',
    /'subtotalCents',\s+pay\.bd_subtotal_cents/.test(f2) && /'discountCents',\s+pay\.bd_discount_cents/.test(f2) &&
    /'taxCents',\s+pay\.bd_tax_cents/.test(f2) && /'taxStatus',\s+pay\.bd_tax_status/.test(f2) &&
    !/totalExcludingTax/.test(f2));
  ok('D.2 por LEFT JOIN (un cobro sin desglose sigue saliendo, con null)',
    /left join public\.billing_payment_breakdowns bd\s+on bd\.provider = p\.provider and bd\.invoice_id = p\.invoice_id/.test(f2));
  // Quitando lo añadido, v2 es v1 byte a byte.
  const stripped = f2
    .replace(/\n\s+'paidBefore',\s+pay\.paid_before,/, '')
    .replace(/,\n\s+-- V2:[\s\S]*?bd\.tax_status\s+as bd_tax_status\n/, '\n')
    .replace(/\n\s+left join public\.billing_payment_breakdowns bd\n\s+on bd\.provider = p\.provider and bd\.invoice_id = p\.invoice_id/, '')
    .replace(/,\n\s+'subtotalCents'[\s\S]*?'taxStatus',\s+pay\.bd_tax_status/, '');
  ok('D.1b paidBefore = premiumBefore SIN el Premium gratuito (entitlement_overrides): solo pagos anteriores y el histórico sembrado',
    /'paidBefore',\s+pay\.paid_before/.test(f2) &&
    /\(\s*exists \(select 1 from public\.billing_payments e[\s\S]*?or exists \(select 1 from public\.affiliate_premium_backfill b[\s\S]*?\) as paid_before/.test(f2) &&
    !/entitlement_overrides[^;]*?\) as paid_before/.test(f2.slice(f2.indexOf('as premium_before'))));
  ok('D.3 todo lo demás es v1 byte a byte (filtros, premiumBefore, topes, registry)', stripped === f1);
  ok('D.4 NO se vuelve a sembrar el backfill (ni tabla ni insert)',
    !/affiliate_premium_backfill \(user_id\)|create table/.test(sqlCode(SQL_R2)) &&
    !/create table|insert into/.test(sqlCode(SQL_R2R)));
  ok('D.5 mismos grants y verificación ejecutando la función; exige la tabla del desglose',
    /revoke all\s+on function public\.founder_read_affiliates\(\) from public, anon, authenticated;/.test(SQL_R2) &&
    /grant\s+execute on function public\.founder_read_affiliates\(\) to service_role;/.test(SQL_R2) &&
    /perform public\.founder_read_affiliates\(\);/.test(SQL_R2) &&
    /to_regclass\('public\.billing_payment_breakdowns'\) is null/.test(SQL_R2) &&
    /do \$\$[\s\S]*APPLY VERIFIED[\s\S]*end \$\$;\s*\n\s*commit;/.test(sqlCode(SQL_R2)));
  ok('D.6 el rollback restaura el cuerpo de v1 EXACTO, con sus grants', fr === f1 &&
    /grant\s+execute on function public\.founder_read_affiliates\(\) to service_role;/.test(SQL_R2R) &&
    /ROLLBACK VERIFIED/.test(SQL_R2R));
  ok('D.7 la lectura sigue sin escribir nada', !/\b(insert into|update\s+public\.|delete from)\b/i.test(f2));
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL harness crashed: ' + (e && e.stack || e)); process.exit(1); });
