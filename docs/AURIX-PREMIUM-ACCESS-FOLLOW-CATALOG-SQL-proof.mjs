// Prueba SQL REAL (PGlite, Postgres en WASM) de una migración preparada y NO aplicada.
// Uso: node docs/AURIX-PREMIUM-ACCESS-FOLLOW-CATALOG-SQL-proof.mjs <ruta-del-repo> <ruta a @electric-sql/pglite/dist/index.js>
// No va en el CI gate (necesita PGlite). Datos ficticios; nunca toca producción.
import { readFileSync } from 'node:fs';
const [REPO, PGLITE] = process.argv.slice(2);
const { PGlite } = await import(PGLITE);
const read = f => readFileSync(`${REPO}/${f}`, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${i ? '  [' + i + ']' : ''}`); };
const U = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function base(withGrants = true) {
  const db = new PGlite();
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create role authenticated; create role anon; create role service_role;`);
  const files = ['db/monetization_commercial_truth_1.sql', 'db/monetization_entitlement_resolver_1.sql'];
  if (withGrants) files.push('db/premium_access_grants_1.sql');
  for (const f of files) { try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); } }
  // Catálogo del código desplegado (Q6 confirmó 26/26 en producción).
  const prem = ['intelligence.full','premium.settings','workspace.compound','workspace.loan','workspace.scenarios','workspace.comparator',
    'workspace.realestate','workspace.budget','workspace.receivables','workspace.goals','workspace.journal'];
  await db.exec(`delete from public.plan_features;`);
  for (const k of [...prem, 'workspace.catalog_preview', 'intelligence.comparator']) {
    await db.query(`insert into public.plan_features(plan,feature_key,allowed) values ('free',$1,false),('premium',$1,$2)`, [k, prem.includes(k)]);
  }
  for (let i = 1; i <= 9; i++) await db.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())`, [U(i), `u${i}@x.test`]);
  return db;
}
let seq = 0;
const apply = (db, user, op, { days = null, permanent = false, expected = null } = {}) => db.query(
  `select public.aurix_premium_access_apply($1::uuid, now(), $2::uuid, $3, $4, $5, $6, 'prueba local', $7) r`,
  [`10000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`, U(user), op, days, permanent, expected, 'a'.repeat(63) + (seq % 10)]).then(x => x.rows[0].r);
async function feature(db, user, key) {
  await db.query(`select set_config('test.uid', $1, false)`, [U(user)]);
  const r = await db.query(`select features from public.aurix_entitlements()`);
  return r.rows[0].features[key] === true;
}
const publish = (db, key) => db.query(`insert into public.plan_features(plan,feature_key,allowed) values ('free',$1,false),('premium',$1,true)`, [key]);
const MIG = read('db/premium_access_follow_catalog_1.sql');
const RB  = read('db/premium_access_follow_catalog_1_rollback.sql');

console.log('── ANTES (sin la migración): reproducción');
{ const db = await base();
  const g = await apply(db, 1, 'grant', { permanent: true });
  ok('concesión permanente aplicada con la función real', g.outcome === 'applied', JSON.stringify(g).slice(0, 120));
  ok('el titular tiene hoy las capacidades Premium publicadas', await feature(db, 1, 'workspace.journal'));
  await publish(db, 'workspace.newcap');
  ok('REPRODUCIDO: una capacidad Premium publicada DESPUÉS queda denegada al titular permanente', (await feature(db, 1, 'workspace.newcap')) === false);
  const ext = await apply(db, 1, 'extend', { days: 30, expected: 'permanent' });
  ok('…y no se puede ampliar para resincronizar (permanent_grant)', ext.code === 'permanent_grant'); }

console.log('── DESPUÉS (con la migración)');
{ const db = await base();
  await apply(db, 1, 'grant', { permanent: true });                          // U1 permanente
  await apply(db, 2, 'grant', { permanent: true });                          // U2 permanente + '*' denegado
  await db.query(`insert into public.entitlement_overrides(user_id,feature_key,allowed,reason,granted_by) values ($1,'*',false,'support','ops')`, [U(2)]);
  await apply(db, 4, 'grant', { permanent: true }); await apply(db, 4, 'revoke', { expected: 'permanent' });   // U4 revocada
  const t5 = await apply(db, 5, 'grant', { days: 90 });                      // U5 temporal
  // U3: titular con una DENEGACIÓN explícita previa para la clave que se va a publicar
  await apply(db, 3, 'grant', { permanent: true });
  await db.query(`insert into public.entitlement_overrides(user_id,feature_key,allowed,reason,granted_by) values ($1,'workspace.newcap',false,'support','ops')`, [U(3)]);
  // Backfill: una clave publicada ANTES de migrar (el hueco ya existente)
  await publish(db, 'workspace.gap');
  ok('previo: el hueco existe antes de migrar (U1 sin workspace.gap)', (await feature(db, 1, 'workspace.gap')) === false);
  await db.exec(MIG);
  ok('backfill: al migrar, U1 recibe la clave ya publicada', await feature(db, 1, 'workspace.gap'));
  await publish(db, 'workspace.newcap');
  ok('U1 (permanente) recibe la capacidad nueva', await feature(db, 1, 'workspace.newcap'));
  ok('U2 con denegación global *: sigue denegado (no se salta)', (await feature(db, 2, 'workspace.newcap')) === false && (await feature(db, 2, 'intelligence.full')) === false);
  ok('U3 con denegación explícita de la clave: se respeta (no se pisa)', (await feature(db, 3, 'workspace.newcap')) === false && (await feature(db, 3, 'workspace.journal')) === true);
  ok('U4 revocada: no recibe nada', (await feature(db, 4, 'workspace.newcap')) === false);
  const w5 = (await db.query(`select expires_at from public.entitlement_overrides where user_id=$1 and feature_key='workspace.newcap'`, [U(5)])).rows[0];
  const w5ref = (await db.query(`select max(expires_at) e from public.entitlement_overrides where user_id=$1 and feature_key='intelligence.full'`, [U(5)])).rows[0];
  ok('U5 temporal: la clave nueva hereda SU vencimiento, no uno nuevo', w5 && +new Date(w5.expires_at) === +new Date(w5ref.e) && (await feature(db, 5, 'workspace.newcap')));
  ok('U6 sin concesión (Free): no recibe nada', (await feature(db, 6, 'workspace.newcap')) === false &&
     (await db.query(`select count(*)::int n from public.entitlement_overrides where user_id=$1`, [U(6)])).rows[0].n === 0);
  await db.query(`insert into public.plan_features(plan,feature_key,allowed) values ('free','workspace.founderonly',false),('premium','workspace.founderonly',false)`);
  ok('una clave NO concedida por el plan premium no se añade a nadie', (await db.query(`select count(*)::int n from public.entitlement_overrides where feature_key='workspace.founderonly'`)).rows[0].n === 0);
  await db.query(`update public.plan_features set allowed=false where plan='premium' and feature_key='workspace.newcap'`);
  ok('despublicar cierra la clave a los titulares (U1 la pierde)', (await feature(db, 1, 'workspace.newcap')) === false);
  ok('…cerrando la ventana, sin borrar la fila (evidencia)', (await db.query(`select count(*)::int n from public.entitlement_overrides where user_id=$1 and feature_key='workspace.newcap'`, [U(1)])).rows[0].n === 1);
  ok('…y sin tocar la denegación explícita de U3', (await db.query(`select allowed, reason from public.entitlement_overrides where user_id=$1 and feature_key='workspace.newcap'`, [U(3)])).rows[0].reason === 'support');
  await db.query(`update public.plan_features set allowed=true where plan='premium' and feature_key='workspace.newcap'`);
  ok('volver a publicar la reabre al titular VIGENTE (U1 la recupera)', (await feature(db, 1, 'workspace.newcap')) === true);
  ok('…pero no a la revocada (U4) ni pisa la denegación explícita (U3)', (await feature(db, 4, 'workspace.newcap')) === false && (await feature(db, 3, 'workspace.newcap')) === false);
  const g7 = await apply(db, 7, 'grant', { permanent: true });
  ok('una concesión NUEVA tras migrar sigue funcionando y cubre el catálogo actual', g7.outcome === 'applied' && await feature(db, 7, 'workspace.gap'));
  await db.exec(MIG);
  ok('reaplicar la migración es idempotente', (await db.query(`select count(*)::int n from pg_trigger where tgname='plan_features_premium_access_follow'`)).rows[0].n === 1);
  await db.exec(RB);
  ok('rollback retira trigger y función', (await db.query(`select count(*)::int n from pg_trigger where tgname='plan_features_premium_access_follow'`)).rows[0].n === 0 &&
     (await db.query(`select count(*)::int n from pg_proc where proname='aurix_premium_access_follow_catalog'`)).rows[0].n === 0);
}
{ const db = await base(false);
  let aborted = false; try { await db.exec(MIG); } catch (e) { aborted = /premium_access_grants_1/.test(e.message); }
  ok('sin premium_access_grants_1 aplicado, la migración aborta sin tocar nada', aborted); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
