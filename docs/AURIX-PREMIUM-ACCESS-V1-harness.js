'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-ACCESS-V1 — accesos Premium gratuitos desde Founder Platform
// ════════════════════════════════════════════════════════════════════════════
// Ejecuta el handler REAL (`api/_premium-control.mjs`) a través del router único
// con `fetch` falso, y comprueba la FORMA del SQL. El comportamiento del SQL se
// demuestra contra un Postgres aislado en scripts/aurix-premium-access-sql.mjs.
//
//   P · control: credencial, método, validación entera, idempotencia, privacidad
//   Q · ruta sin función nueva (12 + 1)
//   R · SQL: sólo filas gestionadas, nunca subscriptions ni '*', service_role
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info ? '  →  ' + info : '')); }
}

(async () => {
console.log('\nP · control · accesos Premium');
{
  const READ = 'aurix-founder-read-token-de-pruebas-largo-123456';
  const AFF = 'aurix-affiliate-control-token-de-pruebas-0123456789';
  const CTRL = 'aurix-premium-control-token-de-pruebas-0123456789ab';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-pruebas-suficientemente-largo-0000';
  process.env.AURIX_FOUNDER_READ_TOKEN = READ;
  process.env.AURIX_AFFILIATE_CONTROL_TOKEN = AFF;
  process.env.AURIX_PREMIUM_CONTROL_TOKEN = CTRL;
  const C = await import(path.join(root, 'api/_premium-control.mjs'));
  const R = await import(path.join(root, 'api/read/[surface].mjs'));
  const fakeRes = () => ({ statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } });
  const post = async (b, headers, method) => { const r = fakeRes();
    await R.default({ method: method || 'POST', headers: Object.assign({ authorization: `Bearer ${CTRL}` }, headers || {}),
      query: { surface: 'control-premium-access' }, body: b }, r); return r; };
  const STATE = { paid: { active: false, until: null }, grant: { active: true, startsAt: '2026-10-18T10:00:00.000Z',
    expiresAt: '2026-10-25T10:00:00.000Z' }, foreignOverride: false };
  const UID = '3f1c2a90-1b2c-4d5e-8f90-0123456789ab';
  const lookup = { contract: 'aurix.premium-control.v1', action: 'user.lookup',
    actionId: '7f1c2a90-1b2c-4d5e-8f90-0123456789ab', issuedAt: '2026-10-18T10:00:00.000Z', email: ' Ana@Example.com ' };
  const apply = { contract: 'aurix.premium-control.v1', action: 'access.apply',
    actionId: '8f1c2a90-1b2c-4d5e-8f90-0123456789ab', issuedAt: '2026-10-18T10:00:00.000Z',
    userId: UID, operation: 'grant', days: 7, permanent: false, expectedExpiresAt: null, reason: 'Prueba de cortesía' };

  let calls = [];
  const db = (out, status) => { globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(out), { status: status || 200 }); }; };

  db({ outcome: 'found', user: { id: UID, email: 'ana@example.com', registeredAt: '2026-10-01T00:00:00.000Z', emailVerified: true },
       state: STATE, history: [] });
  let r = await post(lookup);
  ok('P.1 lookup ⇒ 200 con id autoritativo, verificación, estado e historial',
    r.statusCode === 200 && r.body.found === true && r.body.user.id === UID && r.body.user.emailVerified === true &&
    r.body.state.grant.active === true && r.body.actionId === lookup.actionId, JSON.stringify(r.body));
  ok('P.2 el correo viaja normalizado y SÓLO como criterio de búsqueda, por la RPC de lookup',
    /\/rpc\/aurix_premium_access_lookup$/.test(calls[0].url) && calls[0].body.p_email === 'ana@example.com' &&
    Object.keys(calls[0].body).length === 1);
  ok('P.3 sin CORS, no-store, noindex', !('access-control-allow-origin' in r.headers) &&
    r.headers['cache-control'] === 'no-store' && /noindex/.test(r.headers['x-robots-tag']));
  db({ outcome: 'not_found' });
  r = await post(lookup);
  ok('P.4 correo inexistente ⇒ found:false, sin más datos', r.statusCode === 200 && r.body.found === false && !('user' in r.body));

  calls = [];
  db({ outcome: 'applied', code: null, at: '2026-10-18T10:00:01.000Z', state: STATE });
  r = await post(apply);
  ok('P.5 apply ⇒ 200 result=applied con el estado que quedó', r.statusCode === 200 && r.body.result === 'applied' &&
    r.body.replay === false && r.body.code === null && r.body.state.grant.expiresAt === STATE.grant.expiresAt);
  ok('P.6 la BD recibe actionId, operación, días, fecha esperada, motivo y la huella',
    /\/rpc\/aurix_premium_access_apply$/.test(calls[0].url) && calls[0].body.p_action_id === apply.actionId &&
    calls[0].body.p_operation === 'grant' && calls[0].body.p_days === 7 && calls[0].body.p_permanent === false && calls[0].body.p_expected === null &&
    calls[0].body.p_fingerprint === C.applyFingerprint(apply) && /^[0-9a-f]{64}$/.test(calls[0].body.p_fingerprint));
  ok('P.7 la huella cambia si cambia cualquier campo de la operación',
    C.applyFingerprint(apply) !== C.applyFingerprint({ ...apply, days: 8 }) &&
    C.applyFingerprint({ ...apply, days: null, permanent: true }) !== C.applyFingerprint({ ...apply, days: null, permanent: false }) &&
    C.applyFingerprint(apply) !== C.applyFingerprint({ ...apply, userId: '4f1c2a90-1b2c-4d5e-8f90-0123456789ab' }));
  db({ outcome: 'rejected', code: 'email_not_verified', at: '2026-10-18T10:00:01.000Z', state: STATE });
  r = await post(apply);
  ok('P.8 rechazo de la regla ⇒ 200 result=rejected con su código', r.statusCode === 200 && r.body.result === 'rejected' && r.body.code === 'email_not_verified');
  db({ outcome: 'replay', result: 'applied', code: null, at: '2026-10-18T10:00:01.000Z', state: STATE });
  r = await post(apply);
  ok('P.9 reintento ⇒ replay=true con el resultado original', r.statusCode === 200 && r.body.replay === true && r.body.result === 'applied');
  db({ outcome: 'conflict' });
  ok('P.10 mismo actionId con otro contenido ⇒ 409', (await post(apply)).statusCode === 409);
  db({}, 404);
  ok('P.11 migración sin aplicar ⇒ 503 NOT_APPLIED', (await post(apply)).body.error.code === 'NOT_APPLIED');
  db({ outcome: 'applied', state: { nope: 1 } });
  ok('P.12 respuesta de BD sin forma ⇒ 502', (await post(apply)).statusCode === 502);

  db({ outcome: 'applied', code: null, at: '2026-10-18T10:00:01.000Z', state: STATE });
  ok('P.13 la credencial de LECTURA no controla ⇒ 401', (await post(apply, { authorization: `Bearer ${READ}` })).statusCode === 401);
  ok('P.14 la de AFILIACIÓN tampoco ⇒ 401', (await post(apply, { authorization: `Bearer ${AFF}` })).statusCode === 401);
  ok('P.15 sin credencial ⇒ 401', (await post(apply, { authorization: '' })).statusCode === 401);
  ok('P.16 GET ⇒ 405', (await post(apply, {}, 'GET')).statusCode === 405);
  process.env.AURIX_PREMIUM_CONTROL_TOKEN = AFF;
  ok('P.17 token igual a otro secreto ⇒ deshabilitado', !C.premiumControlConfigured());
  process.env.AURIX_PREMIUM_CONTROL_TOKEN = 'corto';
  ok('P.18 token < 32 ⇒ deshabilitado', !C.premiumControlConfigured());
  process.env.AURIX_PREMIUM_CONTROL_TOKEN = CTRL;

  calls = [];
  const bad = (base, mut) => { const b = JSON.parse(JSON.stringify(base)); mut(b); return b; };
  const cases = [
    ['acción desconocida', bad(apply, b => { b.action = 'access.delete'; })],
    ['operación desconocida', bad(apply, b => { b.operation = 'lifetime'; })],
    ['días 0', bad(apply, b => { b.days = 0; })],
    ['días 366', bad(apply, b => { b.days = 366; })],
    ['días decimales', bad(apply, b => { b.days = 7.5; })],
    ['días como texto', bad(apply, b => { b.days = '7'; })],
    ['revoke con días', bad(apply, b => { b.operation = 'revoke'; })],
    ['permanente con días', bad(apply, b => { b.permanent = true; })],
    ['ampliar a permanente', bad(apply, b => { b.operation = 'extend'; b.days = null; b.permanent = true; })],
    ['revocar como permanente', bad(apply, b => { b.operation = 'revoke'; b.days = null; b.permanent = true; })],
    ['sin permanent', bad(apply, b => { delete b.permanent; })],
    ['permanent como texto', bad(apply, b => { b.permanent = 'true'; })],
    ['fecha esperada inventada', bad(apply, b => { b.expectedExpiresAt = 'forever'; })],
    ['userId no uuid', bad(apply, b => { b.userId = 'ana@example.com'; })],
    ['fecha esperada no ISO', bad(apply, b => { b.expectedExpiresAt = '2026-10-25'; })],
    ['motivo vacío', bad(apply, b => { b.reason = '  '; })],
    ['motivo > 200', bad(apply, b => { b.reason = 'x'.repeat(201); })],
    ['motivo con control', bad(apply, b => { b.reason = 'hola\u0000mundo'; })],
    ['clave sobrante (plan)', bad(apply, b => { b.plan = 'premium'; })],
    ['clave sobrante (feature)', bad(apply, b => { b.featureKey = '*'; })],
    ['contrato distinto', bad(apply, b => { b.contract = 'aurix.premium-control.v2'; })],
    ['actionId no uuid', bad(apply, b => { b.actionId = 'abc'; })],
    ['correo sin @', bad(lookup, b => { b.email = 'ana.example.com'; })],
    ['correo con userId', bad(lookup, b => { b.userId = UID; })],
  ];
  const bads = [];
  for (const [n, b] of cases) { const x = await post(b); if (x.statusCode !== 400) bads.push(n + '→' + x.statusCode); }
  calls = [];
  db({ outcome: 'applied', code: null, at: '2026-10-18T10:00:01.000Z',
       state: { ...STATE, grant: { active: true, permanent: true, startsAt: STATE.grant.startsAt, expiresAt: null } } });
  r = await post({ ...apply, actionId: '9f1c2a90-1b2c-4d5e-8f90-0123456789ab', days: null, permanent: true });
  ok('P.19 sin caducidad ⇒ viaja como permanent=true y días null, sin fecha inventada',
    r.statusCode === 200 && r.body.state.grant.permanent === true && r.body.state.grant.expiresAt === null &&
    calls[0].body.p_permanent === true && calls[0].body.p_days === null, JSON.stringify(calls[0] && calls[0].body));
  calls = [];
  db({ outcome: 'applied', code: null, at: '2026-10-18T10:00:01.000Z', state: STATE });
  r = await post({ ...apply, actionId: 'af1c2a90-1b2c-4d5e-8f90-0123456789ab', operation: 'revoke', days: null, expectedExpiresAt: 'permanent' });
  ok('P.19b revocar un permanente declara lo visto como "permanent"', r.statusCode === 200 && calls[0].body.p_expected === 'permanent');
  calls = [];
  ok('P.20 cualquier entrada inválida ⇒ 400 entero, sin tocar la BD', bads.length === 0 && calls.length === 0, bads.join(' | '));
  ok('P.21 cuerpo > 8 KB ⇒ 413', (await post('x'.repeat(9 * 1024))).statusCode === 413);
  const src = read('api/_premium-control.mjs');
  ok('P.22 el handler no escribe en logs (ni el correo)', !/console\./.test(src));
}

console.log('\nQ · ruta sin función nueva');
{
  const vj = JSON.parse(read('vercel.json'));
  ok('Q.1 /api/control/premium-access es una REWRITE a la función única',
    vj.rewrites.some(r => r.source === '/api/control/premium-access' && r.destination === '/api/read/control-premium-access') &&
    !fs.existsSync(path.join(root, 'api/control')));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.name.startsWith('_') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const entries = walk(path.join(root, 'api')).filter(f => /\.(js|mjs|ts)$/.test(f));
  const edge = entries.filter(f => /export const config = \{ runtime: 'edge' \}/.test(fs.readFileSync(f, 'utf8')));
  ok(`Q.2 siguen siendo 12 Serverless + 1 Edge (hay ${entries.length - edge.length} + ${edge.length})`,
    entries.length - edge.length === 12 && edge.length === 1);
  ok('Q.3 la lectura rechaza compartir valor con el control Premium',
    /'AURIX_PREMIUM_CONTROL_TOKEN'/.test(read('api/_founder-read-token.mjs')));
}

console.log('\nR · SQL · forma de las garantías');
{
  const SQL = read('db/premium_access_grants_1.sql');
  const RB = read('db/premium_access_grants_1_rollback.sql');
  const body = SQL.replace(/--[^\n]*/g, '');
  ok('R.1 no escribe en subscriptions ni en tablas de cobro/afiliación',
    !/(insert\s+into|update|delete\s+from)\s+public\.(subscriptions|billing_|affiliate|payment)/i.test(body));
  ok('R.2 nunca concede \'*\' y escribe sólo filas comp/founder-platform',
    !/'\*'/.test(body) && /'comp', 'founder-platform'/.test(body) &&
    (body.match(/update public\.entitlement_overrides o[\s\S]*?where o\.user_id = p_user_id and o\.reason = 'comp' and o\.granted_by = 'founder-platform'/g) || []).length === 2);
  ok('R.3 las capacidades salen del plan premium (plan_features), no de una lista escrita aquí',
    /from public\.plan_features pf\s+where pf\.plan = 'premium' and pf\.allowed/.test(body));
  ok('R.4 idempotencia: actionId + huella, replay/conflict y fecha esperada (stale)',
    /'replay'/.test(body) && /'conflict'/.test(body) && /'stale'/.test(body) && /pg_advisory_xact_lock/.test(body));
  ok('R.5 exige correo verificado para conceder', /email_not_verified/.test(body) && /email_confirmed_at is not null/.test(body));
  ok('R.6 las tres funciones: sólo service_role; el historial sin privilegios de cliente',
    (body.match(/revoke all\s+on function public\.aurix_premium_access_\w+\([^)]*\) from public, anon, authenticated;/g) || []).length === 3 &&
    (body.match(/grant\s+execute on function public\.aurix_premium_access_\w+\([^)]*\) to service_role;/g) || []).length === 3 &&
    /revoke all on public\.premium_access_actions from anon, authenticated/.test(body));
  ok('R.7 marcada NO APLICADA y con rollback que no toca entitlement_overrides',
    /NO APLICADO/.test(SQL) && /drop table\s+if exists public\.premium_access_actions/.test(RB) &&
    !/^\s*(update|delete)/im.test(RB.replace(/--[^\n]*/g, '')));
}

console.log(`\n${pass} correctas · ${fail} fallidas`);
if (fail) { console.log('FALLAN: ' + failed.join(' · ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
