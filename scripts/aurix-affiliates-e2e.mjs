#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AFFILIATES-V1 · E2E REAL en modo TEST, en local (no se despliega)
// ════════════════════════════════════════════════════════════════════════════
// Sirve los handlers REALES (webhook Edge, billing/[op], read/[surface] y la ruta
// de control) con `node:http` en localhost, contra Stripe TEST y aurix-staging.
// Los webhooks llegan con la Stripe CLI (`stripe listen --forward-to`): sin URL
// pública y sin tocar producción.
//
//   node scripts/aurix-affiliates-e2e.mjs --dry-run   # todo lo que no necesita Stripe
//   node scripts/aurix-affiliates-e2e.mjs             # el ciclo completo (modo TEST: sin dinero real)
//
// Config en `.env.e2e.local` (git-ignored): STRIPE_SECRET_KEY (sk_test_/rk_test_),
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY de aurix-staging.
// FAIL-CLOSED: se niega a correr con una clave que no sea de TEST o contra la BD
// de producción.
//
// Camino de pago: el handler real `_checkout` crea el customer, el mapeo y la
// Checkout Session (prueba origen, JWT, precio verificado contra Stripe). La
// página alojada de Checkout no se automatiza; el pago se completa en servidor
// creando la suscripción para ESE customer con `pm_card_visa`. Stripe emite los
// mismos eventos (subscription.created/updated, invoice.paid) que tras Checkout.
// ════════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const PROD_REF = 'ozcasyufbknnuemllwso';
const PORT = Number(process.env.AURIX_E2E_PORT || 8787);
const BASE = `http://localhost:${PORT}`;
const log = (...a) => console.log('·', ...a);
const die = (m) => { console.error('✗ ' + m); process.exit(1); };

// ── 1 · Entorno, fail-closed ────────────────────────────────────────────────
let fileEnv = {};
try {
  for (const line of readFileSync(path.join(ROOT, '.env.e2e.local'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) fileEnv[m[1]] = m[2];
  }
} catch { die('falta .env.e2e.local (git-ignored) con las claves de TEST/staging'); }
const STRIPE_KEY = String(fileEnv.STRIPE_SECRET_KEY || '').trim();
const SB_URL = String(fileEnv.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SB_ANON = String(fileEnv.SUPABASE_ANON_KEY || '').trim();
const SB_SVC = String(fileEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SB_URL)) die('SUPABASE_URL no tiene forma de proyecto Supabase');
if (SB_URL.includes(PROD_REF)) die('SUPABASE_URL es PRODUCCIÓN: abortado');
if (!SB_ANON || !SB_SVC) die('faltan las claves de staging');
if (!DRY && !/^(sk|rk)_test_/.test(STRIPE_KEY)) die('STRIPE_SECRET_KEY no es de TEST (sk_test_/rk_test_): abortado');
if (/^(sk|rk)_live_/.test(STRIPE_KEY)) die('clave LIVE: abortado');

const READ_TOKEN = 'e2e-read-' + randomBytes(24).toString('hex');
const CONTROL_TOKEN = 'e2e-control-' + randomBytes(24).toString('hex');
Object.assign(process.env, {
  SUPABASE_URL: SB_URL, SUPABASE_ANON_KEY: SB_ANON, SUPABASE_SERVICE_ROLE_KEY: SB_SVC,
  STRIPE_SECRET_KEY: STRIPE_KEY || 'sk_test_dry_run_placeholder',
  BILLING_ALLOW_TEST_EVENTS: '1',
  AURIX_FOUNDER_READ_TOKEN: READ_TOKEN, AURIX_AFFILIATE_CONTROL_TOKEN: CONTROL_TOKEN,
});

// ── 2 · La Stripe CLI da el secreto de firma del `listen` ───────────────────
let listener = null;
if (!DRY) {
  try { execFileSync('stripe', ['version'], { stdio: 'ignore' }); } catch { die('falta la Stripe CLI (brew install stripe/stripe-cli/stripe)'); }
  const secret = execFileSync('stripe', ['listen', '--api-key', STRIPE_KEY, '--print-secret'], { encoding: 'utf8' }).trim();
  if (!/^whsec_/.test(secret)) die('stripe listen no devolvió un secreto de firma');
  process.env.STRIPE_WEBHOOK_SECRET = secret;
} else {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dry_run_placeholder';
}

// Los módulos leen el entorno al cargarse: se importan DESPUÉS.
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const webhook = (await imp('api/billing/webhook.mjs')).default;
// api/billing/*.js es ESM dentro de un paquete sin "type": "module" (Vercel lo
// transpila). En local se cargan copias `.mjs` IDÉNTICAS (sólo cambia la
// extensión de sus imports), sin tocar el código.
const billing = await (async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aurix-e2e-billing-'));
  for (const f of ['[op].js', '_checkout.js', '_portal.js', '_status.js']) {
    const src = readFileSync(path.join(ROOT, 'api/billing', f), 'utf8').replace(/from '\.\/(_[a-z]+)\.js'/g, "from './$1.mjs'");
    writeFileSync(path.join(dir, f.replace(/\.js$/, '.mjs')), src);
  }
  return (await import(pathToFileURL(path.join(dir, '[op].mjs')).href)).default;
})();
const surface = (await imp('api/read/[surface].mjs')).default;

// ── 3 · Servidor local con la forma de Vercel ───────────────────────────────
function vercelRes(nodeRes) {
  return {
    setHeader: (k, v) => nodeRes.setHeader(k, v),
    status(c) { nodeRes.statusCode = c; return this; },
    json(o) { if (!nodeRes.getHeader('content-type')) nodeRes.setHeader('content-type', 'application/json'); nodeRes.end(JSON.stringify(o)); return this; },
    end(b) { nodeRes.end(b); return this; },
  };
}
const server = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/api/billing/webhook') {
      const r = await webhook(new Request(BASE + url.pathname, { method: req.method, headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw }));
      res.statusCode = r.status; res.setHeader('content-type', 'application/json');
      const text = await r.text(); res.end(text);
      if (r.status !== 200 || /record_failed|apply_failed/.test(text)) console.log('  webhook ←', r.status, text);
      return;
    }
    let body = raw;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { /* queda texto */ }
    const vreq = { method: req.method, headers: req.headers, body, query: {} };
    let m;
    if ((m = /^\/api\/billing\/([^/]+)$/.exec(url.pathname))) { vreq.query.op = m[1]; return billing(vreq, vercelRes(res)); }
    if (url.pathname === '/api/control/affiliate-codes') { vreq.query.surface = 'control-affiliate-codes'; return surface(vreq, vercelRes(res)); }  // = rewrite de vercel.json
    if ((m = /^\/api\/read\/([^/]+)$/.exec(url.pathname))) { vreq.query.surface = m[1]; return surface(vreq, vercelRes(res)); }
    res.statusCode = 404; res.end('{}');
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e && e.message) })); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
log('servidor local', BASE, DRY ? '(dry-run)' : '(TEST)');

const finish = (code) => { try { listener && listener.kill(); } catch {} server.close(); process.exit(code); };
const check = (name, cond, info) => { if (cond) log('✓', name); else { console.error('✗', name, info === undefined ? '' : JSON.stringify(info)); finish(1); } };

// ── 4 · Utilidades ──────────────────────────────────────────────────────────
const sb = (p, opts = {}, key = SB_SVC) => fetch(SB_URL + p, { ...opts,
  headers: { apikey: SB_ANON, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
const sbJson = async (p, opts, key) => { const r = await sb(p, opts, key); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, j, t }; };
const form = (o, pre) => Object.entries(o).flatMap(([k, v]) => {
  const key = pre ? `${pre}[${k}]` : k;
  return (v && typeof v === 'object') ? [form(v, key)] : [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
}).join('&');
const stripe = async (p, payload, method) => {
  const r = await fetch('https://api.stripe.com/v1' + p, { method: method || (payload ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload ? form(payload) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`stripe ${p} ${r.status} ${j && j.error && (j.error.code || j.error.message)}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(name, fn, ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(2000); }
  check(name + ' (timeout)', false); return null;
}
const iso = (ms) => new Date(Date.now() + ms).toISOString();

// ── 5 · Usuario de staging + sesión real (sin correo) ───────────────────────
const email = `aurix-e2e+${Date.now()}@example.com`;
const created = await sbJson('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true }) });
check('usuario de staging creado (admin API)', created.ok && created.j && created.j.id, created.t);
const userId = created.j.id;
const link = await sbJson('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
const tokenHash = link.j && (link.j.hashed_token || (link.j.properties && link.j.properties.hashed_token));
check('enlace de acceso generado (admin)', link.ok && tokenHash, link.status);
const ver = await sbJson('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }) }, SB_ANON);
const jwt = ver.j && ver.j.access_token;
check('sesión del usuario (JWT real de staging)', !!jwt, ver.status);

// ── 6 · Registro de códigos: Founder lo empuja por la ruta de control ───────
const CODE = String(100000 + Math.floor(Math.random() * 899999));
const registry = [{ code: CODE, campaignId: 'e2e', startsAt: iso(-86400e3), endsAt: iso(30 * 86400e3), status: 'activa',
  activeIntervals: [{ from: iso(-86400e3), to: null }] }];
const push = await fetch(BASE + '/api/control/affiliate-codes', { method: 'POST',
  headers: { authorization: `Bearer ${CONTROL_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({ contract: 'aurix.affiliate-control.v1', action: 'codes.replace', actionId: randomUUID(),
    issuedAt: new Date().toISOString(), codes: registry }) });
const pushJ = await push.json();
const { registryHash } = await imp('api/_affiliate-control.mjs');
check('push del registro ⇒ 200 y huella = la de Founder', push.status === 200 && pushJ.registryHash === registryHash(registry), pushJ);

// ── 7 · Landing (visita) y acceso (captura) ─────────────────────────────────
const click = await sbJson('/rest/v1/rpc/aurix_affiliate_click', { method: 'POST', body: JSON.stringify({ p_code: CODE }) }, SB_ANON);
check('la landing pregunta: código válido y visita contada', click.ok && click.j && click.j.valid === true, click.t);
const bogus = await sbJson('/rest/v1/rpc/aurix_affiliate_click', { method: 'POST', body: JSON.stringify({ p_code: '999998' }) }, SB_ANON);
check('un código inventado no vale', bogus.ok && bogus.j && bogus.j.valid === false, bogus.t);
const capture = await sbJson('/rest/v1/rpc/aurix_attribution_capture', { method: 'POST',
  body: JSON.stringify({ p_touches: [{ code: CODE, seenAt: iso(-60e3) }] }) }, jwt);
check('captura como el usuario ⇒ captured', capture.ok && capture.j && capture.j.outcome === 'captured', capture.t);

const readAffiliates = async () => {
  const r = await fetch(BASE + '/api/read/affiliates', { headers: { authorization: `Bearer ${READ_TOKEN}` } });
  return r.json();
};
if (DRY) {
  const a = (await readAffiliates()).affiliates;
  check('lectura affiliates: atribución y registro visibles',
    a && a.available === true && a.attributions.some((x) => x.userId === userId) && a.registry.hash === pushJ.registryHash, a);
  log('DRY-RUN OK — se para aquí: lo siguiente necesita STRIPE_SECRET_KEY de TEST en .env.e2e.local');
  finish(0);
}

// ── 8 · Stripe TEST: producto y precios, y el catálogo de staging ───────────
async function ensurePrice(lookup, amount, interval, product) {
  const found = await stripe(`/prices?lookup_keys[]=${lookup}&active=true&limit=1`);
  if (found.data && found.data[0]) return found.data[0].id;
  return (await stripe('/prices', { product, unit_amount: amount, currency: 'eur', lookup_key: lookup,
    recurring: { interval } })).id;
}
const prods = await stripe('/products/search?query=' + encodeURIComponent("metadata['aurix_e2e']:'1'"));
const product = (prods.data && prods.data[0] && prods.data[0].id)
  || (await stripe('/products', { name: 'Aurix Premium (E2E TEST)', metadata: { aurix_e2e: '1' } })).id;
const pYear = await ensurePrice('aurix_e2e_year', 6999, 'year', product);
const pMonth = await ensurePrice('aurix_e2e_month', 799, 'month', product);
log('precios TEST', pYear, pMonth);
await sb('/rest/v1/billing_prices?provider=eq.stripe&plan=eq.premium&active=is.true&provider_price_id=not.in.(' + pYear + ',' + pMonth + ')',
  { method: 'PATCH', body: JSON.stringify({ active: false }) });
const seed = await sb('/rest/v1/billing_prices?on_conflict=provider,provider_price_id', { method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify([
    { provider: 'stripe', provider_price_id: pYear, plan: 'premium', billing_interval: 'year', amount_cents: 6999, currency: 'EUR', trial_days: 0, active: true },
    { provider: 'stripe', provider_price_id: pMonth, plan: 'premium', billing_interval: 'month', amount_cents: 799, currency: 'EUR', trial_days: 0, active: true }]) });
check('catálogo de staging sembrado con los precios TEST', seed.ok, seed.status);

// ── 9 · Webhooks: la Stripe CLI reenvía a este servidor ─────────────────────
listener = spawn('stripe', ['listen', '--api-key', STRIPE_KEY, '--forward-to', `${BASE}/api/billing/webhook`, '--events',
  'customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,charge.refunded,charge.dispute.created,charge.dispute.updated,charge.dispute.closed'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => { const on = (b) => { if (/Ready!/.test(String(b))) r(); }; listener.stderr.on('data', on); listener.stdout.on('data', on); setTimeout(r, 15000); });
log('stripe listen activo');

// ── 10 · Checkout por el handler REAL, pago completado en servidor ──────────
const co = await fetch(BASE + '/api/billing/checkout', { method: 'POST',
  headers: { origin: BASE, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
  body: JSON.stringify({ interval: 'year', locale: 'es' }) });
const coJ = await co.json();
check('checkout real ⇒ sesión de Checkout creada', co.status === 200 && coJ.ok && /checkout\.stripe\.com/.test(coJ.url || ''), coJ);
const map = await sbJson(`/rest/v1/billing_customers?user_id=eq.${userId}&select=provider_customer_id`);
const customer = map.j && map.j[0] && map.j[0].provider_customer_id;
check('customer mapeado al usuario por el checkout', !!customer, map.t);
const pm = await stripe('/payment_methods/pm_card_visa/attach', { customer });
const sub = await stripe('/subscriptions', { customer, items: { 0: { price: pYear } }, default_payment_method: pm.id,
  payment_behavior: 'error_if_incomplete' });
log('suscripción TEST', sub.id, sub.status);

const pay = await waitFor('invoice.paid llega a billing_payments', async () => {
  const r = await sbJson(`/rest/v1/billing_payments?user_id=eq.${userId}&select=*`);
  return r.j && r.j[0] && r.j[0].payment_intent_id ? r.j[0] : null;
});
check('cobro registrado: Premium anual 6999 EUR con payment intent, livemode=false',
  pay.plan === 'premium' && pay.billing_interval === 'year' && pay.amount_paid_cents === 6999 && pay.currency === 'EUR' && pay.livemode === false, pay);
await waitFor('subscription.* concede Premium (M.04)', async () => {
  const r = await sbJson(`/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status`);
  return r.j && r.j[0] && r.j[0].plan === 'premium';
});

// Lo que Founder vería ANTES del reembolso, para que su propio e2e lo procese
// (`npm run affiliates:e2e` en Founder Platform). Fuera del repo y sin secretos.
const OUT_DIR = process.env.E2E_OUT_DIR || '/tmp/aurix-affiliates-e2e';
(await import('node:fs')).mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'affiliates-before-refund.json'), JSON.stringify({ code: CODE, read: await readAffiliates() }));

// ── 11 · Reembolso ──────────────────────────────────────────────────────────
await stripe('/refunds', { payment_intent: pay.payment_intent_id, amount: 1000 });
const ref = await waitFor('charge.refunded llega a billing_refunds', async () => {
  const r = await sbJson(`/rest/v1/billing_refunds?payment_intent_id=eq.${pay.payment_intent_id}&select=*`);
  return r.j && r.j[0] ? r.j[0] : null;
});
check('reembolso registrado (acumulado 1000)', ref.amount_refunded_cents === 1000, ref);

// ── 12 · Lo que ve Founder ──────────────────────────────────────────────────
const out = await readAffiliates();
const a = out.affiliates;
check('lectura affiliates: atribución, cobro (premiumBefore=false) y reembolso enlazados',
  a.available && a.attributions.some((x) => x.userId === userId) &&
  a.payments.some((p) => p.userId === userId && p.premiumBefore === false && p.paymentIntentId === pay.payment_intent_id) &&
  a.refunds.some((r) => r.paymentIntentId === pay.payment_intent_id && r.amountRefundedCents === 1000), a);
console.log(JSON.stringify(out, null, 2));
writeFileSync(path.join(OUT_DIR, 'affiliates-after-refund.json'), JSON.stringify({ code: CODE, read: out }));

await stripe('/subscriptions/' + sub.id, null, 'DELETE').catch(() => {});   // sin renovaciones en TEST
log('E2E OK');
finish(0);
