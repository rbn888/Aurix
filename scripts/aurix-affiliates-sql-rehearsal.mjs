#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX-AFFILIATES-V1 · ensayo REAL del SQL en un Postgres desechable (PGlite)
// ════════════════════════════════════════════════════════════════════════════
// El harness de docs/ comprueba la FORMA del SQL; esto lo EJECUTA en Postgres 17
// (WASM, en memoria, sin red ni Docker): stub de auth + B1 + M.04 + las cuatro
// migraciones (dos veces), captura, visitas, registro, evidencia de cobro,
// premiumBefore, lectura Founder y rollbacks.
//
// PGlite NO es dependencia del repo (coste cero, sin package.json nuevo):
//   mkdir -p /tmp/aff-pglite && (cd /tmp/aff-pglite && npm i @electric-sql/pglite@0.5.8)
//   AURIX_PGLITE_DIR=/tmp/aff-pglite node scripts/aurix-affiliates-sql-rehearsal.mjs
// Opcional: AURIX_REHEARSAL_SCHEMA=<fichero.sql> sustituye stub+B1+M.04 por un
// esquema real volcado de producción (sólo lectura) — ver el runbook de despliegue.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PGDIR = process.env.AURIX_PGLITE_DIR || '/tmp/aff-pglite';
const req = createRequire(path.join(PGDIR, 'package.json'));
const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href);
const { registryHash } = await import(pathToFileURL(path.join(ROOT, 'api/_affiliate-control.mjs')).href);
const f = (p) => readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' → ' + info : '')); } };
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const run = async (label, sql) => { try { await db.exec(sql); console.log('  · ' + label); return true; } catch (e) { fail++; console.log('  ✗ APPLY ' + label + ': ' + e.message); return false; } };
const MIG = ['db/affiliate_codes_1.sql', 'db/affiliate_attribution_1.sql', 'db/billing_payments_1.sql', 'db/founder_read_affiliates_1.sql'];
const RB = ['db/founder_read_affiliates_1_rollback.sql', 'db/billing_payments_1_rollback.sql', 'db/affiliate_attribution_1_rollback.sql', 'db/affiliate_codes_1_rollback.sql'];

console.log('\nBASE');
if (process.env.AURIX_REHEARSAL_SCHEMA) {
  await run('esquema de producción (volcado)', f(process.env.AURIX_REHEARSAL_SCHEMA));
} else {
  await run('stub auth', f('db/m04_rehearsal/00_bootstrap_local_stub.sql'));
  await run('B1', f('db/monetization_commercial_truth_1.sql'));
  await run('M.04', f('db/monetization_m04_billing_stripe_1.sql'));
}
const U = { NEW: '11111111-1111-1111-1111-111111111111', OLD: '22222222-2222-2222-2222-222222222222',
  NEW2: '33333333-3333-3333-3333-333333333333', FAIL: '44444444-4444-4444-4444-444444444444',
  MON: '55555555-5555-5555-5555-555555555555', HIST: '66666666-6666-6666-6666-666666666666' };
await db.exec(`insert into auth.users (id, email, created_at) values
  ('${U.NEW}', '  Ana@Example.com ', now() - interval '1 hour'), ('${U.OLD}', 'old@example.com', now() - interval '2 days'),
  ('${U.NEW2}', null, now() - interval '5 minutes'), ('${U.FAIL}', 'f@example.com', now() - interval '3 hours'),
  ('${U.MON}', 'm@example.com', now() - interval '3 hours'), ('${U.HIST}', 'h@example.com', now() - interval '2 hours');
  insert into public.billing_prices (provider, provider_price_id, plan, billing_interval, amount_cents, currency)
    values ('stripe','price_year','premium','year',6999,'EUR'), ('stripe','price_month','premium','month',799,'EUR');
  insert into public.billing_customers (provider, user_id, provider_customer_id) values
    ('stripe','${U.NEW}','cus_new'), ('stripe','${U.NEW2}','cus_new2'), ('stripe','${U.FAIL}','cus_fail'),
    ('stripe','${U.MON}','cus_mon'), ('stripe','${U.HIST}','cus_hist');`);
// Premium HISTÓRICO antes de la migración (lo sembrará el backfill) y un primer pago FALLIDO (incomplete).
const APPLY = `select public.aurix_billing_apply_event('stripe',$1,$2,$3,$4,'price_year',$5, now() - interval '1 day', now() + interval '1 year', false, null, null, null, now() - interval '1 day') as r`;
ok('apply_event: premium histórico', (await q1(APPLY, ['evt_h', 'customer.subscription.created', 'cus_hist', 'sub_h', 'active'])).r.plan === 'premium');
ok('apply_event: primer pago fallido (incomplete ⇒ free)', (await q1(APPLY, ['evt_f', 'customer.subscription.created', 'cus_fail', 'sub_f', 'incomplete'])).r.plan === 'free');

console.log('\nMIGRACIONES (dos veces) + M.04 reaplicado');
for (let i = 0; i < 2; i++) for (const m of MIG) await run(m + ' #' + (i + 1), f(m));
if (!process.env.AURIX_REHEARSAL_SCHEMA) await run('M.04 reaplicado', f('db/monetization_m04_billing_stripe_1.sql'));
ok('backfill: sólo el premium histórico', JSON.stringify((await db.query('select user_id from public.affiliate_premium_backfill')).rows.map(r => r.user_id)) === JSON.stringify([U.HIST]));

console.log('\nREGISTRO');
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const D = 864e5;
const codes = [
  { code: '123456', campaignId: 'c1', startsAt: iso(-60 * D), endsAt: iso(60 * D), status: 'activa', activeIntervals: [{ from: iso(-60 * D), to: null }] },
  { code: '654321', campaignId: 'c1', startsAt: iso(-60 * D), endsAt: iso(60 * D), status: 'activa', activeIntervals: [{ from: iso(-60 * D), to: null }] },
  { code: '777777', campaignId: 'c2', startsAt: iso(-60 * D), endsAt: iso(60 * D), status: 'activa', activeIntervals: [{ from: iso(-60 * D), to: null }] },
  { code: '222222', campaignId: 'c2', startsAt: iso(-60 * D), endsAt: iso(60 * D), status: 'pausada', activeIntervals: [{ from: iso(-60 * D), to: iso(-10 * D) }] },
  { code: '333333', campaignId: 'c3', startsAt: iso(-60 * D), endsAt: iso(60 * D), status: 'bloqueada', activeIntervals: [{ from: iso(-60 * D), to: null }] },
  { code: '444444', campaignId: 'c4', startsAt: iso(-60 * D), endsAt: iso(-30 * D), status: 'activa', activeIntervals: [{ from: iso(-60 * D), to: null }] },
  { code: '555555', campaignId: 'c5', startsAt: iso(-60 * D), endsAt: iso(60 * D), status: 'activa', activeIntervals: [{ from: iso(-60 * D), to: null }] },
];
const REPL = `select public.aurix_affiliate_codes_replace($1::uuid, now(), $2, $3::jsonb) as r`;
const A1 = '7f1c2a90-1b2c-4d5e-8f90-000000000001', A2 = '7f1c2a90-1b2c-4d5e-8f90-000000000002', A3 = '7f1c2a90-1b2c-4d5e-8f90-000000000003';
let r = (await q1(REPL, [A1, registryHash(codes), JSON.stringify(codes)])).r;
ok('push 1 ⇒ stored, applied, 7 filas', r.outcome === 'stored' && r.applied === true && r.rows.length === 7);
ok('huella de lo GUARDADO = huella enviada (fechas y claves byte a byte)', registryHash(r.rows) === registryHash(codes));
r = (await q1(REPL, [A1, registryHash(codes), JSON.stringify(codes)])).r;
ok('replay del mismo actionId ⇒ applied=false', r.outcome === 'replay' && r.applied === false && registryHash(r.rows) === registryHash(codes));
ok('mismo actionId con otro contenido ⇒ conflict', (await q1(REPL, [A1, 'f'.repeat(64), JSON.stringify(codes.slice(1))])).r.outcome === 'conflict');
r = (await q1(REPL, [A2, registryHash(codes), JSON.stringify(codes)])).r;
ok('foto idéntica con actionId nuevo ⇒ applied=false (no-op)', r.outcome === 'stored' && r.applied === false);
const without = codes.filter(c => c.code !== '555555');
r = (await q1(REPL, [A3, registryHash(without), JSON.stringify(without)])).r;
const ret = await q1(`select status, active_intervals from public.affiliate_codes where code='555555'`);
ok('código ausente ⇒ retirado sin intervalos, NO borrado; huella = la de los 6 vigentes',
  r.applied === true && ret.status === 'retirado' && ret.active_intervals.length === 0 && r.rows.length === 6 && registryHash(r.rows) === registryHash(without));
ok('entrada inválida ⇒ invalid sin cambios', (await q1(REPL, ['7f1c2a90-1b2c-4d5e-8f90-000000000009', 'a'.repeat(64), JSON.stringify([{ code: '012345' }])])).r.outcome === 'invalid'
  && (await q1(`select count(*)::int n from public.affiliate_code_pushes`)).n === 3);

async function as(role, uid, sql, params) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    if (uid) await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role })]);
    const x = await q1(sql, params); await db.exec('commit'); return x.r;
  } catch (e) { await db.exec('rollback'); return { outcome: 'ERR:' + e.message }; }
}
const cap = async (uid, t) => (await as('authenticated', uid, `select public.aurix_attribution_capture($1::jsonb) as r`, [JSON.stringify(t)])).outcome;
const click = async (code) => as('anon', null, `select public.aurix_affiliate_click($1) as r`, [code]);

console.log('\nCAPTURA');
const T = (code, ms) => ({ code, seenAt: iso(-ms) });
ok('sin sesión ⇒ unauthenticated', (await cap(null, [T('123456', 1000)])) === 'unauthenticated');
ok('7 dígitos ⇒ invalid', (await cap(U.NEW, [T('1234567', 1000)])) === 'invalid');
ok('duplicados ⇒ invalid', (await cap(U.NEW, [T('123456', 1000), T('123456', 2000)])) === 'invalid');
ok('6 toques ⇒ invalid', (await cap(U.NEW, [1, 2, 3, 4, 5, 6].map(i => T('10000' + i, i * 1000)))) === 'invalid');
ok("seenAt 'now' ⇒ invalid", (await cap(U.NEW, [{ code: '123456', seenAt: 'now' }])) === 'invalid');
ok('seenAt de hace 40 días ⇒ invalid', (await cap(U.NEW, [T('123456', 40 * D)])) === 'invalid');
ok('cuenta de 2 días ⇒ too_late', (await cap(U.OLD, [T('123456', 1000)])) === 'too_late');
ok('sólo códigos fuera del registro / parados / bloqueados / fuera de campaña ⇒ no_valid_code y nada guardado',
  (await cap(U.NEW, [T('999999', 1000), T('222222', 1000), T('333333', 1000), T('444444', 1000), T('555555', 1000)])) === 'no_valid_code' &&
  !(await q1(`select 1 x from public.acquisition_attributions where user_id='${U.NEW}'`)));
ok('usuario nuevo ⇒ captured', (await cap(U.NEW, [T('654321', 60e3), T('999999', 2000), T('222222', 20 * D), T('123456', 3 * D)])) === 'captured');
const row = await q1(`select touches from public.acquisition_attributions where user_id='${U.NEW}'`);
ok('guarda sólo los vivos al verse (222222 visto en su intervalo cuenta; 999999 no), normalizados y en orden',
  JSON.stringify(row.touches.map(t => t.code)) === JSON.stringify(['222222', '123456', '654321']) && /Z$/.test(row.touches[0].seenAt), JSON.stringify(row.touches));
ok('segunda vez ⇒ already_captured', (await cap(U.NEW, [T('777777', 1000)])) === 'already_captured');
let e = 'ok'; try { await db.exec(`update public.acquisition_attributions set captured_at = now() where user_id='${U.NEW}'`); } catch (x) { e = x.message; }
ok('UPDATE incluso como superusuario ⇒ rechazado', /inmutable/.test(e), e);
for (const u of [U.NEW2, U.FAIL, U.MON, U.HIST]) await cap(u, [T('777777', 1000)]);

console.log('\nVISITAS');
ok('código activo ⇒ {valid:true, counted}', (await click('123456')).valid === true);
const inval = [await click('999999'), await click('222222'), await click('333333'), await click('444444'), await click('555555'), await click('12345')];
ok('desconocido / pausado / bloqueado / fuera de campaña / retirado / mal formado ⇒ valid:false', inval.every(x => x.valid === false), JSON.stringify(inval));
ok('…y no dejan ni una fila', (await q1(`select count(*)::int n from public.affiliate_clicks where code <> '123456'`)).n === 0);
await db.exec(`update public.affiliate_clicks set clicks = 99999 where code='123456'`); await click('123456'); await click('123456');
ok('tope por fila 100000', (await q1(`select clicks from public.affiliate_clicks where code='123456'`)).clicks === 100000);
let ck = 'ok'; try { await db.exec('begin; set local role anon; select * from public.affiliate_codes;'); } catch (x) { ck = x.message; } await db.exec('rollback').catch(() => {});
ok('anon no puede leer el registro', /permission denied/.test(ck), ck);

console.log('\nEVIDENCIA DE COBRO');
const REC = `select public.aurix_billing_record_payment_event($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz,$16,$17) as r`;
const rec = async (a) => (await q1(REC, ['stripe', a.ev, a.type, a.at || new Date().toISOString(), true, a.cus ?? null, a.inv ?? null, a.sub ?? null, a.pi ?? null, a.ch ?? null, a.price ?? null, a.amount ?? null, a.cur ?? 'eur', a.reason ?? null, a.paid ?? null, a.dp ?? null, a.status ?? null])).r.outcome;
const t0 = Date.now(); const at = (ms) => new Date(t0 + ms).toISOString();
const p1 = { ev: 'evt_p1', type: 'invoice.paid', cus: 'cus_new', inv: 'in_1', sub: 'sub_1', pi: 'pi_1', price: 'price_year', amount: 6999, paid: at(0) };
ok('invoice.paid ⇒ recorded', (await rec(p1)) === 'recorded');
ok('el MISMO evento ⇒ duplicate', (await rec(p1)) === 'duplicate');
const p2 = { ev: 'evt_p2', type: 'invoice.paid', cus: 'cus_new', inv: 'in_2', price: 'price_year', amount: 6999, paid: at(3600e3) };
ok('cobro > 0 sin PI ⇒ missing_link (fila guardada, no aplicado)', (await rec(p2)) === 'missing_link' && (await q1(`select applied from public.billing_events where event_id='evt_p2'`)).applied === false);
ok('reintento con PI ⇒ recorded y enlace rellenado', (await rec({ ...p2, pi: 'pi_2' })) === 'recorded' && (await q1(`select payment_intent_id p from public.billing_payments where invoice_id='in_2'`)).p === 'pi_2');
ok('reembolso 1000 y luego uno viejo de 500 ⇒ queda 1000', (await rec({ ev: 'evt_r2', type: 'charge.refunded', pi: 'pi_1', amount: 1000, at: at(7200e3) })) === 'recorded'
  && (await rec({ ev: 'evt_r1', type: 'charge.refunded', pi: 'pi_1', amount: 500, at: at(3600e3) })) === 'recorded'
  && (await q1(`select amount_refunded_cents a from public.billing_refunds where payment_intent_id='pi_1'`)).a === 1000);
ok('disputa cerrada y luego un update atrasado ⇒ stale, sigue lost', (await rec({ ev: 'evt_d2', type: 'charge.dispute.closed', dp: 'dp_1', pi: 'pi_1', amount: 6999, status: 'lost', at: at(9000e3) })) === 'recorded'
  && (await rec({ ev: 'evt_d1', type: 'charge.dispute.updated', dp: 'dp_1', pi: 'pi_1', amount: 6999, status: 'under_review', at: at(8000e3) })) === 'stale'
  && (await q1(`select status from public.billing_disputes where dispute_id='dp_1'`)).status === 'lost');
let ex = 'ok'; try { await db.exec(`begin; set local role authenticated; select public.aurix_billing_record_payment_event('stripe','x','invoice.paid',now(),true,null,'in_z',null,null,null,null,1,'eur',null,now(),null,null);`); } catch (x) { ex = x.message; } await db.exec('rollback').catch(() => {});
ok('authenticated no puede ejecutar el escritor', /permission denied/.test(ex), ex);
// premiumBefore
await rec({ ev: 'evt_f2', type: 'invoice.paid', cus: 'cus_fail', inv: 'in_fail_annual', pi: 'pi_fa', price: 'price_year', amount: 6999, paid: at(0) });
await rec({ ev: 'evt_m1', type: 'invoice.paid', cus: 'cus_mon', inv: 'in_mon', pi: 'pi_m1', price: 'price_month', amount: 799, paid: at(-30 * D) });
await rec({ ev: 'evt_m2', type: 'invoice.paid', cus: 'cus_mon', inv: 'in_mon_annual', pi: 'pi_m2', price: 'price_year', amount: 6999, paid: at(0) });
await db.exec(`insert into public.entitlement_overrides (user_id, feature_key, allowed, reason, created_at) values ('${U.NEW2}', '*', true, 'comp', now() - interval '1 day')`);
await rec({ ev: 'evt_o', type: 'invoice.paid', cus: 'cus_new2', inv: 'in_ovr', pi: 'pi_o', price: 'price_year', amount: 6999, paid: at(0) });
await rec({ ev: 'evt_hh', type: 'invoice.paid', cus: 'cus_hist', inv: 'in_hist', pi: 'pi_h', price: 'price_year', amount: 6999, paid: at(60e3) });

console.log('\nLECTURA FOUNDER');
const out = (await q1(`select public.founder_read_affiliates() as r`)).r;
const pb = Object.fromEntries(out.payments.map(p => [p.invoiceId, p.premiumBefore]));
ok('premiumBefore: primer pago FALLIDO y luego anual ⇒ false', pb.in_fail_annual === false, JSON.stringify(pb));
ok('premiumBefore: mensual pagado antes ⇒ true (y el mensual mismo false)', pb.in_mon_annual === true && pb.in_mon === false);
ok('premiumBefore: override previo ⇒ true', pb.in_ovr === true);
ok('premiumBefore: premium histórico (backfill) ⇒ true', pb.in_hist === true);
ok('premiumBefore: primer cobro real false, renovación true', pb.in_1 === false && pb.in_2 === true);
ok('forma: 8 claves con registry', JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['attributions', 'available', 'clicks', 'disputes', 'payments', 'refunds', 'registry', 'truncated']));
ok('registry: filas vigentes cuya huella = la del último push', registryHash(out.registry.codes) === registryHash(without) && !!out.registry.updatedAt);
const a1 = out.attributions.find(a => a.userId === U.NEW);
ok('emailHash = sha256(lower(trim(email)))', a1.emailHash === createHash('sha256').update('ana@example.com').digest('hex'));
ok('sólo atribuidos; reembolsos/disputas por PI', !out.attributions.some(a => a.userId === U.OLD) && out.refunds.length === 1 && out.disputes.length === 1);
let rd = 'ok'; try { await db.exec('begin; set local role authenticated; select public.founder_read_affiliates();'); } catch (x) { rd = x.message; } await db.exec('rollback').catch(() => {});
ok('authenticated no puede leer la superficie', /permission denied/.test(rd), rd);

console.log('\nROLLBACK');
for (const m of RB) await run(m, f(m));
ok('ledger sin resultados nuevos tras el rollback', (await q1(`select count(*)::int n from public.billing_events where outcome in ('recorded','missing_link')`)).n === 0);
await run('reaplicar todo', MIG.map(f).join('\n'));
console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
