#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PARTNER-ENGINE-V2 · ensayo REAL del SQL en un Postgres desechable (PGlite)
// ════════════════════════════════════════════════════════════════════════════
// El harness de docs/ comprueba la FORMA; esto EJECUTA en Postgres 17 (WASM, en
// memoria, sin red ni Docker) los ficheros reales, en el orden de despliegue:
//   stub auth + B1 + M.04 → las cuatro de AFFILIATES-V1 → billing_payment_breakdown_1
//   → founder_read_affiliates_2 (dos veces cada una) → M.04 reaplicado
// y prueba: primera escritura gana, rechazos sin raise, permisos, las cuatro
// claves nuevas de la lectura, que nada del acceso ni de la evidencia V1
// cambia, y los dos rollbacks (en orden, y negándose fuera de orden).
//
// PGlite NO es dependencia del repo (coste cero, sin package.json nuevo):
//   mkdir -p /tmp/pglite-partners && (cd /tmp/pglite-partners && npm init -y && npm i @electric-sql/pglite@0.5.8)
//   AURIX_PGLITE_DIR=/tmp/pglite-partners node scripts/aurix-partner-breakdown-sql-rehearsal.mjs
// Opcional: AURIX_REHEARSAL_SCHEMA=<fichero.sql> sustituye stub+B1+M.04 por un
// esquema real volcado de producción (sólo lectura), como el ensayo de V1.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PGDIR = process.env.AURIX_PGLITE_DIR || '/tmp/pglite-partners';
const req = createRequire(path.join(PGDIR, 'package.json'));
const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href);
const f = (p) => readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' → ' + info : '')); } };
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const run = async (label, sql) => { try { await db.exec(sql); console.log('  · ' + label); return true; } catch (e) { fail++; console.log('  ✗ APPLY ' + label + ': ' + e.message); await db.exec('rollback').catch(() => {}); return false; } };
const runExpectFail = async (sql) => { try { await db.exec(sql); return 'ok'; } catch (e) { await db.exec('rollback').catch(() => {}); return e.message; } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const V1 = ['db/affiliate_codes_1.sql', 'db/affiliate_attribution_1.sql', 'db/billing_payments_1.sql', 'db/founder_read_affiliates_1.sql'];
const BD = 'db/billing_payment_breakdown_1.sql', BDR = 'db/billing_payment_breakdown_1_rollback.sql';
const R2 = 'db/founder_read_affiliates_2.sql', R2R = 'db/founder_read_affiliates_2_rollback.sql';

console.log('\nBASE');
if (process.env.AURIX_REHEARSAL_SCHEMA) {
  await run('esquema de producción (volcado)', f(process.env.AURIX_REHEARSAL_SCHEMA));
} else {
  await run('stub auth', f('db/m04_rehearsal/00_bootstrap_local_stub.sql'));
  await run('B1', f('db/monetization_commercial_truth_1.sql'));
  await run('M.04', f('db/monetization_m04_billing_stripe_1.sql'));
}
const U = { A: 'aaaaaaaa-0000-4000-8000-000000000001', B: 'aaaaaaaa-0000-4000-8000-000000000002',
  C: 'aaaaaaaa-0000-4000-8000-000000000003' };
await db.exec(`insert into auth.users (id, email, created_at) values
  ('${U.A}', 'a@example.com', now() - interval '1 hour'), ('${U.B}', 'b@example.com', now() - interval '1 hour'),
  ('${U.C}', 'c@example.com', now() - interval '1 hour');
  insert into public.billing_prices (provider, provider_price_id, plan, billing_interval, amount_cents, currency)
    values ('stripe','price_year','premium','year',6999,'EUR'), ('stripe','price_month','premium','month',799,'EUR');
  insert into public.billing_customers (provider, user_id, provider_customer_id) values
    ('stripe','${U.A}','cus_a'), ('stripe','${U.B}','cus_b'), ('stripe','${U.C}','cus_c');`);
await q1(`select public.aurix_billing_apply_event('stripe','evt_sub_c','customer.subscription.created','cus_c','sub_c','price_year','active',
  now() - interval '1 day', now() + interval '1 year', false, null, null, null, now() - interval '1 day') as r`);
await db.exec(`insert into public.entitlement_overrides (user_id, feature_key, allowed, reason, created_at)
  values ('${U.B}', '*', true, 'comp', now() - interval '2 days')`);

console.log('\nAFFILIATES-V1 (ya en producción)');
for (const m of V1) await run(m, f(m));
const touches = (code) => JSON.stringify([{ code, seenAt: new Date(Date.now() - 60e3).toISOString().replace(/\.\d+Z$/, '.000Z') }]);
for (const u of [U.A, U.B]) await db.query(`insert into public.acquisition_attributions (user_id, touches) values ($1, $2::jsonb)`, [u, touches('123456')]);
const REC = `select public.aurix_billing_record_payment_event('stripe',$1,'invoice.paid',now(),true,$2,$3,$4,$5,null,$6,$7,'eur','subscription_create',$8::timestamptz,null,null) as r`;
const t0 = Date.now(); const at = (ms) => new Date(t0 + ms).toISOString();
ok('cobro A (tendrá desglose computed)', (await q1(REC, ['evt_a', 'cus_a', 'in_a', 'sub_a', 'pi_a', 'price_year', 6499, at(0)])).r.outcome === 'recorded');
ok('cobro B (cobro "antiguo": sin desglose)', (await q1(REC, ['evt_b', 'cus_b', 'in_b', 'sub_b', 'pi_b', 'price_year', 6999, at(1000)])).r.outcome === 'recorded');
ok('cobro A2 (renovación: desglose not_computed)', (await q1(REC, ['evt_a2', 'cus_a', 'in_a2', 'sub_a', 'pi_a2', 'price_month', 799, at(2000)])).r.outcome === 'recorded');
await db.exec(`select public.aurix_billing_record_payment_event('stripe','evt_r','charge.refunded',now(),true,null,null,null,'pi_a',null,null,500,'eur',null,null,null,null)`);
const OUT_V1 = (await q1(`select public.founder_read_affiliates() as r`)).r;
const DEF_V1 = (await q1(`select pg_get_functiondef('public.founder_read_affiliates()'::regprocedure) as d`)).d;
const V1_KEYS = Object.keys(OUT_V1.payments[0]).sort();
ok('lectura v1 de partida: 3 cobros, 12 claves por cobro', OUT_V1.payments.length === 3 && V1_KEYS.length === 12, JSON.stringify(V1_KEYS));

const snap = async () => (await q1(`select
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.invoice_id), '[]') from public.billing_payments x) as pay,
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id), '[]') from public.subscriptions x) as subs,
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id, x.feature_key), '[]') from public.entitlement_overrides x) as ovr,
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.event_id), '[]') from public.billing_events x) as ev,
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.payment_intent_id), '[]') from public.billing_refunds x) as ref,
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id), '[]') from public.affiliate_premium_backfill x) as bf`));
const SNAP0 = await snap();

console.log('\nPARTNER-ENGINE-V2 · aplicar (dos veces) + M.04 reaplicado');
for (let i = 0; i < 2; i++) { await run(BD + ' #' + (i + 1), f(BD)); await run(R2 + ' #' + (i + 1), f(R2)); }
if (!process.env.AURIX_REHEARSAL_SCHEMA) await run('M.04 reaplicado (no ve un overload sobrante)', f('db/monetization_m04_billing_stripe_1.sql'));
ok('aplicar no cambia cobros, suscripciones, overrides, ledger, reembolsos ni backfill', eq(await snap(), SNAP0));

console.log('\nESCRITOR DEL DESGLOSE');
const BDW = `select public.aurix_billing_record_payment_breakdown($1,$2,$3,$4,$5,$6,$7,$8) as r`;
const arg = (a, k, d) => (k in a ? a[k] : d);   // `null` explícito se respeta
const w = async (a) => (await q1(BDW, [arg(a, 'prov', 'stripe'), arg(a, 'ev', 'evt_x'), arg(a, 'inv', null), arg(a, 'sub', null),
  arg(a, 'dis', null), arg(a, 'tax', null), arg(a, 'tet', null), arg(a, 'st', null)])).r;
const row = async (inv) => q1(`select subtotal_cents, discount_cents, tax_cents, total_excluding_tax_cents, tax_status, event_id
  from public.billing_payment_breakdowns where provider='stripe' and invoice_id=$1`, [inv]);
ok('A computed ⇒ recorded', (await w({ ev: 'evt_a', inv: 'in_a', sub: 6999, dis: 500, tax: 1128, tet: 5371, st: 'computed' })).outcome === 'recorded');
const ROW_A = await row('in_a');
ok('…fila tal cual', eq(ROW_A, { subtotal_cents: 6999, discount_cents: 500, tax_cents: 1128, total_excluding_tax_cents: 5371, tax_status: 'computed', event_id: 'evt_a' }), JSON.stringify(ROW_A));
const again = await w({ ev: 'evt_a_retry', inv: 'in_a', sub: 1, dis: 0, tax: null, tet: 1, st: 'not_computed' });
ok('PRIMERA ESCRITURA GANA: otra entrega con otras cifras ⇒ duplicate y la fila NO cambia',
  again.outcome === 'duplicate' && again.ok === true && eq(await row('in_a'), ROW_A));
ok('mismo payload repetido ⇒ duplicate', (await w({ ev: 'evt_a', inv: 'in_a', sub: 6999, dis: 500, tax: 1128, tet: 5371, st: 'computed' })).outcome === 'duplicate');
ok('A2 not_computed con tax null ⇒ recorded', (await w({ ev: 'evt_a2', inv: 'in_a2', sub: 799, dis: 0, tax: null, tet: 799, st: 'not_computed' })).outcome === 'recorded');
const bad = [
  [{ inv: 'in_z', st: 'not_computed', tax: 0 }, 'tax_status_mismatch'],
  [{ inv: 'in_z', st: 'computed', tax: null }, 'tax_status_mismatch'],
  [{ inv: 'in_z', st: 'maybe' }, 'bad_tax_status'],
  [{ inv: 'in_z', st: null }, 'bad_tax_status'],
  [{ inv: 'in_z', st: 'not_computed', sub: -1 }, 'negative_amount'],
  [{ inv: 'in_z', st: 'computed', tax: -5 }, 'negative_amount'],
  [{ inv: null, st: 'not_computed' }, 'missing_invoice'],
  [{ inv: 'x', st: 'not_computed' }, 'missing_invoice'],
  [{ inv: 'in_z', st: 'not_computed', ev: null }, 'missing_event'],
  [{ inv: 'in_z', st: 'not_computed', prov: 'paypal' }, 'missing_event'],
];
const outs = [];
for (const [a] of bad) outs.push(await w(a));
ok('entrada mala ⇒ rejected con su motivo, SIN raise (10 casos)',
  outs.every((o, i) => o.ok === false && o.outcome === 'rejected' && o.reason === bad[i][1]), JSON.stringify(outs));
ok('…y ningún rechazo deja fila', (await q1(`select count(*)::int n from public.billing_payment_breakdowns`)).n === 2);
let ck = await runExpectFail(`insert into public.billing_payment_breakdowns (provider, invoice_id, tax_cents, tax_status, event_id) values ('stripe','in_q',0,'not_computed','e')`);
ok('el CHECK impide "not_computed" con 0 incluso al owner', /billing_payment_breakdowns_tax_chk/.test(ck), ck);

async function as(role, sql) {
  await db.exec('begin');
  try { await db.exec(`set local role ${role}`); const x = await q1(sql); await db.exec('commit'); return { ok: true, x }; }
  catch (e) { await db.exec('rollback'); return { ok: false, e: e.message }; }
}
const CALL = `select public.aurix_billing_record_payment_breakdown('stripe','evt_r','in_role',1,0,null,1,'not_computed') as r`;
for (const role of ['anon', 'authenticated']) {
  const r1 = await as(role, CALL), r2 = await as(role, `select count(*) from public.billing_payment_breakdowns`);
  ok(`${role}: no ejecuta el escritor ni lee la tabla`, !r1.ok && /permission denied/.test(r1.e) && !r2.ok && /permission denied/.test(r2.e), r1.e + ' | ' + r2.e);
}
const sr = await as('service_role', CALL);
ok('service_role sí ejecuta el escritor', sr.ok && sr.x.r.outcome === 'recorded');
await db.exec(`delete from public.billing_payment_breakdowns where invoice_id = 'in_role'`);

console.log('\nLECTURA v2');
const OUT_V2 = (await q1(`select public.founder_read_affiliates() as r`)).r;
const P = Object.fromEntries(OUT_V2.payments.map(p => [p.invoiceId, p]));
const NEW = ['discountCents', 'subtotalCents', 'taxCents', 'taxStatus'];
ok('cada cobro = las 12 claves de v1 + las 4 nuevas',
  OUT_V2.payments.every(p => eq(Object.keys(p).sort(), [...V1_KEYS, ...NEW].sort())), JSON.stringify(Object.keys(OUT_V2.payments[0])));
const pick = (p) => ({ subtotalCents: p.subtotalCents, discountCents: p.discountCents, taxCents: p.taxCents, taxStatus: p.taxStatus });
ok('cobro con desglose computed ⇒ cifras de Stripe', eq(pick(P.in_a), { subtotalCents: 6999, discountCents: 500, taxCents: 1128, taxStatus: 'computed' }), JSON.stringify(pick(P.in_a)));
ok('cobro not_computed ⇒ taxCents null (no 0)', eq(pick(P.in_a2), { subtotalCents: 799, discountCents: 0, taxCents: null, taxStatus: 'not_computed' }), JSON.stringify(pick(P.in_a2)));
ok('cobro sin desglose ⇒ las 4 claves PRESENTES y null', NEW.every(k => k in P.in_b && P.in_b[k] === null), JSON.stringify(P.in_b));
const strip = (o) => ({ ...o, payments: o.payments.map(p => { const c = { ...p }; NEW.forEach(k => delete c[k]); return c; }) });
ok('quitando las 4 claves, la salida v2 = la de v1 (attributions, refunds, premiumBefore, registry…)', eq(strip(OUT_V2), OUT_V1));
let rd = await as('authenticated', `select public.founder_read_affiliates() as r`);
ok('authenticated sigue sin poder leer la superficie', !rd.ok && /permission denied/.test(rd.e));
ok('el desglose no tocó cobros, suscripciones, overrides, ledger, reembolsos ni backfill', eq(await snap(), SNAP0));

console.log('\nROLLBACK');
ck = await runExpectFail(f(BDR));
ok('rollback del desglose FUERA DE ORDEN ⇒ se niega y no borra nada',
  /aplicar antes db\/founder_read_affiliates_2_rollback\.sql/.test(ck) && !!(await q1(`select to_regclass('public.billing_payment_breakdowns') as t`)).t, ck);
await run(R2R, f(R2R));
const OUT_RB = (await q1(`select public.founder_read_affiliates() as r`)).r;
ok('read_2_rollback ⇒ la salida vuelve a ser la de v1 (forma y contenido)', eq(OUT_RB, OUT_V1));
ok('…y la definición de la función es la de v1 byte a byte',
  (await q1(`select pg_get_functiondef('public.founder_read_affiliates()'::regprocedure) as d`)).d === DEF_V1);
await run(BDR, f(BDR));
ok('breakdown_1_rollback ⇒ sin tabla ni función',
  !(await q1(`select to_regclass('public.billing_payment_breakdowns') as t`)).t &&
  !(await q1(`select to_regprocedure('public.aurix_billing_record_payment_breakdown(text,text,text,integer,integer,integer,integer,text)') as p`)).p);
ok('tras los rollbacks: cobros, suscripciones, overrides, ledger, reembolsos y backfill intactos', eq(await snap(), SNAP0));
ok('la lectura v1 sigue funcionando sin la tabla', eq((await q1(`select public.founder_read_affiliates() as r`)).r, OUT_V1));

console.log('\nREAPLICAR');
await run('breakdown_1 + read_2 de nuevo', f(BD) + '\n' + f(R2));
ok('reaplicado: cobros sin desglose ⇒ 4 claves null', (await q1(`select public.founder_read_affiliates() as r`)).r.payments.every(p => p.taxStatus === null && 'taxCents' in p));

console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
