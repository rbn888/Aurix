// Prueba SQL REAL (PGlite, Postgres en WASM) de una migración preparada y NO aplicada.
// Uso: node docs/AURIX-BILLING-OTHER-SUBSCRIPTION-VIGENTE-SQL-proof.mjs <ruta-del-repo> <ruta a @electric-sql/pglite/dist/index.js>
// No va en el CI gate (necesita PGlite). Datos ficticios; nunca toca producción.
// Prueba REAL de las migraciones SQL en PGlite: carga las migraciones del repo, aplica la nueva,
// ejecuta aurix_billing_apply_event con datos ficticios y comprueba huellas y rollback.
import { readFileSync } from 'node:fs';
const [REPO, PGLITE] = process.argv.slice(2);
const { PGlite } = await import(PGLITE);
const read = f => readFileSync(`${REPO}/${f}`, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${i ? '  [' + i + ']' : ''}`); };

async function base() {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    create function auth.role() returns text language sql stable as 'select null::text';
    create role authenticated; create role anon; create role service_role;`);
  for (const f of ['db/monetization_commercial_truth_1.sql', 'db/monetization_m04_billing_stripe_1.sql']) {
    try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
  return db;
}
const md5 = async db => (await db.query(`select md5(p.prosrc) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='aurix_billing_apply_event'`)).rows[0].h;
const U1 = '00000000-0000-0000-0000-000000000001';
async function seedUser(db, { periodEnd, status = 'active', interval = 'year' }) {
  await db.exec(`insert into auth.users(id) values ('${U1}');
    insert into public.billing_prices(provider,provider_price_id,plan,billing_interval,amount_cents,currency,active)
      values ('stripe','price_LIVE_Y','premium','year',6999,'EUR',true);
    insert into public.billing_customers(provider,user_id,provider_customer_id) values ('stripe','${U1}','cus_live');`);
  // Fila "TEST" antigua que ya no recibe eventos: premium/active, otra suscripción.
  await db.query(`insert into public.subscriptions(user_id,plan,status,provider,billing_interval,current_period_start,current_period_end,
      price_amount_cents,price_currency,provider_customer_id,provider_subscription_id,last_event_id,last_event_at)
    values ($1,'premium',$2,'stripe',$3,$4::timestamptz - interval '365 days',$4,5999,'EUR','cus_test','sub_TEST','evt_old','2026-08-01')`,
    [U1, status, interval, periodEnd]);
}
const liveEvent = (db, id = 'evt_live_1') => db.query(`select public.aurix_billing_apply_event(
    'stripe',$1,'customer.subscription.created','cus_live','sub_LIVE','price_LIVE_Y','active',
    now(), now() + interval '365 days', false, null, null, null, now()) r`, [id]).then(x => x.rows[0].r);
const sub = db => db.query(`select plan,status,provider_subscription_id from public.subscriptions where user_id=$1`, [U1]).then(x => x.rows[0]);

const MIG = read('db/billing_other_subscription_vigente_1.sql');
const RB  = read('db/billing_other_subscription_vigente_1_rollback.sql');
const H = s => s.match(/md5\(prosrc\) destino = ([0-9a-f]{32})/)[1];

console.log('── HUELLAS');
{
  const db = await base();
  const h0 = await md5(db);
  ok('la función cargada desde M.04 tiene la huella ORIGEN declarada en la migración', MIG.includes(`origen  = ${h0}`), h0);
  await db.exec(MIG);
  ok('tras aplicar: huella DESTINO', (await md5(db)) === H(MIG));
  await db.exec(MIG);
  ok('reaplicar es idempotente (no aborta, misma huella)', (await md5(db)) === H(MIG));
  await db.exec(RB);
  ok('rollback devuelve la huella original exacta', (await md5(db)) === h0);
  { const m04 = read('db/monetization_m04_billing_stripe_1.sql');
    const a = m04.indexOf('create or replace function public.aurix_billing_apply_event(');
    const b = m04.indexOf('\n$$;', a) + 4;
    await db.exec(m04.slice(a, b).replace('begin\n  -- ORDEN', 'begin\n  -- hotfix no versionado\n  -- ORDEN')); }
  let aborted = false; try { await db.exec(MIG); } catch (e) { aborted = /versión desconocida/.test(e.message); }
  ok('sobre una versión DESCONOCIDA la migración aborta sin tocar nada', aborted);
}

console.log('── COMPORTAMIENTO (antes = M.04 tal cual · después = con la migración)');
for (const phase of ['antes', 'después']) {
  // A: fila TEST caducada (active, periodo vencido) + compra LIVE nueva
  { const db = await base(); if (phase === 'después') await db.exec(MIG);
    await seedUser(db, { periodEnd: '2026-09-01' });
    const r = await liveEvent(db); const s = await sub(db);
    if (phase === 'antes') ok('ANTES · REPRODUCIDO: fila caducada bloquea la compra LIVE (other_subscription, no concede)',
      r.outcome === 'other_subscription' && s.provider_subscription_id === 'sub_TEST', JSON.stringify(r));
    else ok('DESPUÉS · la compra LIVE se aplica y gobierna la fila', r.outcome === 'applied' && s.provider_subscription_id === 'sub_LIVE' && s.plan === 'premium', JSON.stringify(r)); }
  // B: fila vigente de otra suscripción (duplicada real) → sigue protegida
  { const db = await base(); if (phase === 'después') await db.exec(MIG);
    await seedUser(db, { periodEnd: '2027-09-01' });
    const r = await liveEvent(db);
    ok(`${phase.toUpperCase()} · fila VIGENTE de otra suscripción: el evento ajeno sigue ignorado (other_subscription)`, r.outcome === 'other_subscription', JSON.stringify(r)); }
  // C: lifetime sin periodo sigue gobernando
  { const db = await base(); if (phase === 'después') await db.exec(MIG);
    await seedUser(db, { periodEnd: '2026-09-01', interval: 'lifetime' });
    const r = await liveEvent(db);
    ok(`${phase.toUpperCase()} · lifetime sigue gobernando (other_subscription)`, r.outcome === 'other_subscription', JSON.stringify(r)); }
  // D: idempotencia del evento aplicado
  { const db = await base(); if (phase === 'después') await db.exec(MIG);
    await seedUser(db, { periodEnd: '2026-09-01' });
    await liveEvent(db, 'evt_dup'); const r2 = await liveEvent(db, 'evt_dup');
    if (phase === 'después') ok('DESPUÉS · reenviar el mismo evento es duplicate (idempotencia intacta)', r2.outcome === 'duplicate', JSON.stringify(r2)); }
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
