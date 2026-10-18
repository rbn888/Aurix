// AURIX-PREMIUM-ACCESS-V1 · prueba del SQL REAL en un Postgres aislado (PGlite).
// No toca ninguna base de datos: crea una en memoria, carga las migraciones
// reales de derechos (B1, B2, catálogo) y db/premium_access_grants_1.sql, y
// ejercita la concesión contra el resolver de siempre, `aurix_entitlements()`.
//
//   PGLITE_MODULE=/ruta/a/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/aurix-premium-access-sql.mjs
//
// PGlite no es dependencia del repo (package.json sin deps): se instala aparte.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = process.env.PGLITE_MODULE;
if (!mod) { console.error('Falta PGLITE_MODULE'); process.exit(2); }
const { PGlite } = await import(mod);
const db = new PGlite();
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); } };

// ── Lo mínimo de Supabase que las migraciones dan por hecho ────────────────
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(),
                           email_confirmed_at timestamptz, deleted_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
for (const f of ['db/monetization_commercial_truth_1.sql', 'db/monetization_entitlement_resolver_1.sql',
                 'db/workspace_premium_2_plan_features.sql', 'db/monetization_catalog_preview_key_1.sql',
                 'db/intelligence_comparator_key_1.sql', 'db/premium_access_grants_1.sql']) {
  try { await db.exec(read(f)); } catch (e) { console.error(`✗ cargando ${f}: ${e.message}`); process.exit(1); }
}
console.log('migraciones reales cargadas\n');

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const user = async (email, verified = true) => {
  const id = randomUUID();
  await q('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)', [id, email, verified ? new Date() : null]);
  return id;
};
const fp = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const apply = async (userId, operation, days, expected, actionId = randomUUID(), reason = 'prueba interna') => {
  const r = await one(`select public.aurix_premium_access_apply($1, now(), $2, $3, $4, $5, $6, $7) as r`,
    [actionId, userId, operation, days, expected, reason, fp({ userId, operation, days, expected, reason })]);
  return { ...r.r, actionId };
};
const lookup = async (email) => (await one('select public.aurix_premium_access_lookup($1) as r', [email])).r;
// El resolver real, como lo vería esa persona con su sesión.
const ent = async (userId) => {
  await db.exec(`set request.jwt.claim.sub = '${userId}'`);
  const r = await one('select plan, features, feature_sources from public.aurix_entitlements()');
  await db.exec(`reset request.jwt.claim.sub`);
  return r;
};
const premiumKeys = (await q(`select feature_key from public.plan_features where plan = 'premium' and allowed order by 1`)).map(r => r.feature_key);
const hasAllPremium = (e) => premiumKeys.every(k => e.features[k] === true);
const noneTrue = (e) => Object.values(e.features).every(v => v !== true);
const DAY = 86400000;
const near = (iso, ms) => Math.abs(Date.parse(iso) - (Date.now() + ms)) < 60_000;
const counts = async () => one(`select (select count(*) from public.subscriptions)::int as subs,
  (select count(*) from public.plan_features)::int as pf`);
const before = await counts();

console.log('A · Free → 7 días → ampliar a 30 → personalizada → revocar');
const a = await user('Ana@Example.com');
ok('A.0 Free de partida', noneTrue(await ent(a)));
let L = await lookup('  ana@EXAMPLE.com ');
ok('A.1 lookup por correo (sin mayúsculas ni espacios) devuelve el id autoritativo y verificado',
  L.outcome === 'found' && L.user.id === a && L.user.emailVerified === true && L.state.grant === null && L.state.paid.active === false);
let r = await apply(a, 'grant', 7, null);
ok('A.2 conceder 7 días ⇒ aplicado, vence en 7 días', r.outcome === 'applied' && r.state.grant.active && near(r.state.grant.expiresAt, 7 * DAY), JSON.stringify(r));
let e = await ent(a);
ok('A.3 el resolver ve Premium en todas las capacidades del plan, con origen override y plan free',
  hasAllPremium(e) && e.plan === 'free' && premiumKeys.every(k => e.feature_sources[k] === 'override'));
ok('A.4 NO concede las claves reservadas al fundador', e.features['workspace.catalog_preview'] !== true && e.features['intelligence.comparator'] !== true);
const exp7 = r.state.grant.expiresAt;
r = await apply(a, 'extend', 23, exp7);
ok('A.5 ampliar +23 desde el vencimiento ⇒ 30 días desde hoy', r.outcome === 'applied' && near(r.state.grant.expiresAt, 30 * DAY));
const exp30 = r.state.grant.expiresAt;
r = await apply(a, 'replace', 45, exp30);
ok('A.6 sustituir por duración personalizada (45) ⇒ 45 días desde hoy', r.outcome === 'applied' && near(r.state.grant.expiresAt, 45 * DAY));
r = await apply(a, 'revoke', null, r.state.grant.expiresAt);
e = await ent(a);
ok('A.7 revocar ⇒ inmediato: el resolver vuelve a Free', r.outcome === 'applied' && r.state.grant.active === false && noneTrue(e));
r = await apply(a, 'revoke', null, null);
ok('A.8 revocar sin concesión vigente ⇒ rechazado (no_active_grant)', r.outcome === 'rejected' && r.code === 'no_active_grant');

console.log('\nB · caducidad automática (el tiempo pasa: la ventana queda atrás)');
const b = await user('caduca@example.com');
r = await apply(b, 'grant', 7, null);
ok('B.1 concedido', hasAllPremium(await ent(b)));
await q(`update public.entitlement_overrides set starts_at = now() - interval '8 days', expires_at = now() - interval '1 second'
          where user_id = $1`, [b]);
e = await ent(b);
L = await lookup('caduca@example.com');
ok('B.2 vencida ⇒ Free sin cron, y Founder la ve inactiva', noneTrue(e) && L.state.grant.active === false);
r = await apply(b, 'grant', 30, null);
ok('B.3 tras vencer se puede volver a conceder', r.outcome === 'applied' && hasAllPremium(await ent(b)));

console.log('\nC · Premium pagado + concesión');
const c = await user('paga@example.com');
await q(`insert into public.subscriptions (user_id, plan, status, provider, billing_interval, current_period_start, current_period_end, price_amount_cents, price_currency)
         values ($1, 'premium', 'active', 'stripe', 'month', now() - interval '10 days', now() + interval '20 days', 999, 'EUR')`, [c]).catch(async (err) => {
  // Si la forma de B1 pide otras columnas, que el fallo diga cuál.
  throw new Error('subscriptions: ' + err.message);
});
const subBefore = JSON.stringify(await one('select * from public.subscriptions where user_id = $1', [c]));
L = await lookup('paga@example.com');
ok('C.1 Founder ve el Premium pagado', L.state.paid.active === true && L.state.grant === null);
r = await apply(c, 'grant', 30, null);
r = await apply(c, 'revoke', null, r.state.grant.expiresAt);
e = await ent(c);
ok('C.2 revocar la concesión conserva el Premium pagado (origen subscription)',
  r.outcome === 'applied' && e.plan === 'premium' && hasAllPremium(e) && premiumKeys.every(k => e.feature_sources[k] !== 'override'));
ok('C.3 la fila de suscripción queda byte a byte igual',
  JSON.stringify(await one('select * from public.subscriptions where user_id = $1', [c])) === subBefore);

console.log('\nD · usuario inexistente / sin verificar / override ajeno');
ok('D.1 correo inexistente ⇒ not_found', (await lookup('nadie@example.com')).outcome === 'not_found');
ok('D.2 correo mal formado ⇒ invalid', (await lookup('x')).outcome === 'invalid');
r = await apply(randomUUID(), 'grant', 7, null);
ok('D.3 id inexistente ⇒ rechazado (user_not_found)', r.outcome === 'rejected' && r.code === 'user_not_found');
const d = await user('sinverificar@example.com', false);
L = await lookup('sinverificar@example.com');
r = await apply(d, 'grant', 7, null);
ok('D.4 correo sin verificar ⇒ se ve, pero no se concede', L.user.emailVerified === false && r.code === 'email_not_verified' && noneTrue(await ent(d)));
const f = await user('fundador@example.com');
await q(`insert into public.entitlement_overrides (user_id, feature_key, allowed, reason) values ($1, 'workspace.loan', true, 'founder')`, [f]);
r = await apply(f, 'grant', 7, null);
const fRow = await one(`select reason, granted_by, expires_at from public.entitlement_overrides where user_id = $1`, [f]);
ok('D.5 override gestionado a mano ⇒ rechazado (foreign_override) y no se toca',
  r.code === 'foreign_override' && fRow.reason === 'founder' && fRow.expires_at === null);
const borrado = await user('borrado@example.com');
await q('update auth.users set deleted_at = now() where id = $1', [borrado]);
ok('D.6 cuenta borrada ⇒ no se encuentra', (await lookup('borrado@example.com')).outcome === 'not_found');
ok('D.7 duración fuera de 1..365 ⇒ invalid', (await apply(a, 'grant', 366, null)).outcome === 'invalid' && (await apply(a, 'grant', 0, null)).outcome === 'invalid');

console.log('\nE · reintentos e idempotencia');
const g = await user('reintento@example.com');
const id1 = randomUUID();
r = await apply(g, 'grant', 7, null, id1);
const expG = r.state.grant.expiresAt;
const r2 = await apply(g, 'grant', 7, null, id1);
ok('E.1 mismo actionId ⇒ replay con el resultado guardado, sin volver a aplicar',
  r2.outcome === 'replay' && r2.result === 'applied' && r2.state.grant.expiresAt === expG);
const ext = randomUUID();
await apply(g, 'extend', 30, expG, ext);
const again = await apply(g, 'extend', 30, expG, ext);
const afterExt = (await lookup('reintento@example.com')).state.grant.expiresAt;
ok('E.2 reintento de una ampliación ⇒ amplía UNA vez', again.outcome === 'replay' && near(afterExt, 37 * DAY));
const dbl = await apply(g, 'extend', 30, expG);
ok('E.3 doble clic (otro actionId) con la fecha vieja ⇒ stale, sin ampliar',
  dbl.code === 'stale' && (await lookup('reintento@example.com')).state.grant.expiresAt === afterExt);
const conflict = await one(`select public.aurix_premium_access_apply($1, now(), $2, 'grant', 7, null, 'otro', $3) as r`,
  [id1, g, 'f'.repeat(64)]);
ok('E.4 mismo actionId con otro contenido ⇒ conflict', conflict.r.outcome === 'conflict');
ok('E.5 conceder sobre una vigente ⇒ already_active (o stale si la fecha no cuadra)',
  (await apply(g, 'grant', 7, afterExt)).code === 'already_active');
const rows = await q(`select user_id from public.entitlement_overrides where reason = 'comp' and granted_by = 'founder-platform' and user_id = $1`, [g]);
ok('E.6 una sola concesión por usuario: una fila por capacidad, nunca duplicadas', rows.length === premiumKeys.length);

console.log('\nF · trazabilidad, persistencia y aislamiento');
L = await lookup('ana@example.com');
ok('F.1 el historial de la persona trae cada operación con su resultado', L.history.length === 5 &&
  L.history.map(h => h.operation).join(',') === 'revoke,revoke,replace,extend,grant' && L.history[0].outcome === 'rejected');
ok('F.2 el estado es de servidor: un lookup nuevo (otra sesión/dispositivo) ve lo mismo',
  JSON.stringify((await lookup('reintento@example.com')).state) === JSON.stringify((await lookup('reintento@example.com')).state));
const after = await counts();
ok('F.3 cero filas nuevas en subscriptions y catálogo intacto', after.subs === before.subs + 1 && after.pf === before.pf);
const grants = await q(`select p.proname, r.rolname from pg_proc p
  join lateral aclexplode(p.proacl) a on true join pg_roles r on r.oid = a.grantee
  where p.proname like 'aurix_premium_access_%' and a.privilege_type = 'EXECUTE'`);
ok('F.4 sólo service_role ejecuta las funciones', grants.length > 0 && grants.every(g => g.rolname === 'service_role' || g.rolname === 'postgres'),
  JSON.stringify(grants));
const tbl = await q(`select grantee from information_schema.role_table_grants where table_name = 'premium_access_actions' and grantee in ('anon','authenticated')`);
ok('F.5 el historial no es legible ni escribible por clientes', tbl.length === 0);

console.log('\nG · rollback');
await db.exec(read('db/premium_access_grants_1_rollback.sql'));
const left = await one(`select to_regclass('public.premium_access_actions') as t,
  to_regprocedure('public.aurix_premium_access_lookup(text)') as l`);
e = await ent(g);
ok('G.1 el rollback quita tabla y funciones; las concesiones vigentes siguen siendo filas normales del resolver',
  left.t === null && left.l === null && hasAllPremium(e));

console.log(`\n${pass} correctas · ${fail} fallidas`);
process.exit(fail ? 1 : 0);
