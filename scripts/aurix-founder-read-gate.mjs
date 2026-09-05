#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX Founder read gate — SPEC AURIX-FOUNDER-READ-1 (fail-closed)
// ════════════════════════════════════════════════════════════════════════════
// Protege la frontera `/api/read/*` que Aurix publica para Founder Platform.
// In-process, sin red y sin base de datos: la fuente se sustituye por un doble
// para poder afirmar cosas sobre la RESPUESTA, no sobre el entorno.
//
//   A) credencial: propia, ≥32, sin fallback, sin compartir, tiempo constante
//   B) método y superficie: solo GET, sin CORS, sin cookies
//   C) contrato: versión presente y grupos declarados
//   D) privacidad: ni PII ni secretos ni datos financieros por usuario
//   E) subsistema ausente ⇒ available:false explícito, NUNCA cero
//   F) SQL: agregados, revokes, y ninguna columna sensible leída
//
//   node scripts/aurix-founder-read-gate.mjs
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── Dobles de req/res ──────────────────────────────────────────────────────
function fakeRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}
const fakeReq = (method = 'GET', headers = {}) => ({ method, headers });

const ADMIN = 'service-role-de-pruebas-suficientemente-largo-0000';
const READ = 'aurix-founder-read-token-de-pruebas-largo-123456';

const { overviewHandler: overview, healthHandler: health } =
  await import('../api/_founder-read-handlers.mjs');
const tok = await import('../api/_founder-read-token.mjs');

/** Sustituye la fuente: `callAggregate` habla por fetch, así que se dobla fetch. */
function stubSource(payload, status = 200) {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status, headers: { 'content-type': 'application/json' },
  });
}

const OVERVIEW_DATA = {
  users: { available: true, registered: 6, newLast7d: 0, newLast30d: 1, activePortfolios: 6, accountsWithState: 7 },
  funnel: { available: true, leadsTotal: 42, waitlist: 30, invited: 8, joined: 4, archived: 0, welcomeEmailsSent: 40 },
  health: { available: true, status: 'HEALTHY', lagMinutes: 9.6, staleActivePortfolios: 0, incidentOpen: false },
};
const HEALTH_DATA = {
  watchdog: { available: true, status: 'HEALTHY', lagMinutes: 9.6, consecutiveStaleChecks: 0, incidentOpen: false },
  integrity: { available: true, snapshotsTotal: 6643, nonPositiveOrNullTotals: 0, maxDuplicatesPerUserMinute: 1 },
  continuity: { available: true, accountsObserved: 6, byOutcome: { INSERTED: 5, INACTIVE: 1, EMPTY: 0, INCOMPLETE: 0, SKIPPED: 0, ERROR: 0 }, accountsDarkOver24h: 0 },
};

console.log('\nAURIX FOUNDER READ GATE\n');

// ── A) Credencial ──────────────────────────────────────────────────────────
console.log('A · Credencial de lectura');
process.env.SUPABASE_SERVICE_ROLE_KEY = ADMIN;

delete process.env.AURIX_FOUNDER_READ_TOKEN;
check('sin variable: deshabilitada', tok.readTokenConfigured() === false);
process.env.AURIX_FOUNDER_READ_TOKEN = 'corto';
check('token < 32: deshabilitada', tok.readTokenConfigured() === false);
process.env.AURIX_FOUNDER_READ_TOKEN = ADMIN;
check('compartida con la service-role: deshabilitada',
  tok.readTokenConfigured() === false && tok.readTokenSharesAnotherSecret());
process.env.AURIX_FOUNDER_READ_TOKEN = READ;
check('token propio: habilitada', tok.readTokenConfigured() === true);
check('token correcto valida', tok.verifyReadToken(READ) === true);
check('token incorrecto no valida', tok.verifyReadToken(READ + 'x') === false);
check('la service-role no vale aquí', tok.verifyReadToken(ADMIN) === false);
check('Bearer correcto autoriza', tok.readTokenAuthorized(fakeReq('GET', { authorization: `Bearer ${READ}` })));
check('bearer minúsculas autoriza', tok.readTokenAuthorized(fakeReq('GET', { authorization: `bearer ${READ}` })));
check('otro esquema no autoriza', tok.readTokenAuthorized(fakeReq('GET', { authorization: `Basic ${READ}` })) === false);
check('cookie no autoriza', tok.readTokenAuthorized(fakeReq('GET', { cookie: `t=${READ}` })) === false);
check('query string no autoriza (no se lee la URL)',
  tok.readTokenAuthorized(fakeReq('GET', {})) === false);

stubSource(OVERVIEW_DATA);
for (const [label, handler] of [['overview', overview], ['health', health]]) {
  let r = fakeRes(); await handler(fakeReq('GET', {}), r);
  check(`${label}: sin credencial → 401 genérico`,
    r.statusCode === 401 && r.body?.error?.code === 'UNAUTHORIZED', String(r.statusCode));
  r = fakeRes(); await handler(fakeReq('GET', { authorization: 'Bearer no-es-el-token-correcto-pero-largo-x' }), r);
  check(`${label}: credencial errónea → 401`, r.statusCode === 401);
  r = fakeRes(); await handler(fakeReq('POST', { authorization: `Bearer ${READ}` }), r);
  check(`${label}: POST → 405`, r.statusCode === 405);
  r = fakeRes(); await handler(fakeReq('OPTIONS', { authorization: `Bearer ${READ}` }), r);
  check(`${label}: OPTIONS → 405 (no es API de navegador)`, r.statusCode === 405);
}

// ── B) Superficie ──────────────────────────────────────────────────────────
console.log('\nB · Superficie server-to-server');
stubSource(OVERVIEW_DATA);
const ok = fakeRes(); await overview(fakeReq('GET', { authorization: `Bearer ${READ}` }), ok);
check('200 con credencial válida', ok.statusCode === 200);
check('sin Access-Control-Allow-Origin', !('access-control-allow-origin' in ok.headers), JSON.stringify(Object.keys(ok.headers)));
check('Cache-Control: no-store', ok.headers['cache-control'] === 'no-store');
check('X-Robots-Tag noindex', String(ok.headers['x-robots-tag']).includes('noindex'));
check('no emite set-cookie', !('set-cookie' in ok.headers));
// La ruta ÚNICA solo elige superficie: nada de lógica propia que el gate no
// ejecute. Es un segmento dinámico porque `api/` está en el tope del plan
// (ver sección G) y dos ficheros de ruta rechazarían el deployment entero.
const ROUTE = 'api/read/[surface].js';
const routeSrc = read(ROUTE).replace(/\/\/.*$/gm, '').trim();
check(`${ROUTE}: importa los dos handlers`,
  /import \{ overviewHandler, healthHandler \} from '\.\.\/_founder-read-handlers\.mjs';/.test(routeSrc));
check(`${ROUTE}: mapea overview y health, y nada más`,
  /const SURFACES = \{ overview: overviewHandler, health: healthHandler \};/.test(routeSrc));
check(`${ROUTE}: superficie desconocida → 404, sin ruta por defecto`,
  /hasOwnProperty\.call\(SURFACES, surface\)/.test(routeSrc) &&
  /status\(404\)/.test(routeSrc) && !/status\(200\)/.test(routeSrc));
check(`${ROUTE}: la superficie se lee del router, no de la URL`,
  /req\.query && req\.query\.surface/.test(routeSrc) && !/req\.url/.test(routeSrc));
// Sin credencial, sin contrato y sin cabeceras propias: todo eso lo decide el
// guard dentro de los handlers, que es lo que este gate ejecuta de verdad.
check(`${ROUTE}: no decide credencial ni contrato`,
  !/AURIX_FOUNDER_READ_TOKEN|authorization|contract|Access-Control/i.test(routeSrc));
check(`${ROUTE}: las dos superficies del contrato Founder están servidas`,
  ['overview', 'health'].every((k) => new RegExp(`\\b${k}:`).test(routeSrc)));
// Los ficheros de ruta antiguos NO deben volver: reintroducirlos sube el cupo
// a 14 y el deployment se rechaza entero.
for (const gone of ['api/read/overview.js', 'api/read/health.js']) {
  check(`${gone}: no existe (subiría el cupo a 14)`, !existsSync(path.join(ROOT, gone)));
}
const handlers = read('api/_founder-read-handlers.mjs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('handlers: ambos exigen el guard',
  (handlers.match(/guardFounderRead\(req, res\)/g) ?? []).length === 2);
check('handlers: no mencionan CORS', !/Access-Control/i.test(handlers));
check('handlers: declaran el contrato', (handlers.match(/contract: CONTRACT/g) ?? []).length === 2);
check('handlers: sin verbo de escritura',
  !/\b(insert|update|delete|patch|post)\b/i.test(handlers.replace(/method/g, '')));

// ── C) Contrato ────────────────────────────────────────────────────────────
console.log('\nC · Contrato aurix.read.v1');
check('overview: versión de contrato', ok.body.contract === 'aurix.read.v1');
check('overview: grupos declarados',
  ['contract', 'generatedAt', 'platform', 'users', 'funnel', 'health'].every((k) => k in ok.body),
  Object.keys(ok.body).join(','));
stubSource(HEALTH_DATA);
const okH = fakeRes(); await health(fakeReq('GET', { authorization: `Bearer ${READ}` }), okH);
check('health: versión de contrato', okH.body.contract === 'aurix.read.v1');
check('health: grupos declarados',
  ['contract', 'generatedAt', 'platform', 'watchdog', 'integrity', 'continuity', 'providers'].every((k) => k in okH.body),
  Object.keys(okH.body).join(','));
check('health: proveedores marcados como no durables',
  okH.body.providers.available === false && okH.body.providers.reason === 'per_instance_counters_not_durable');
check('health: continuidad solo agregada por resultado',
  JSON.stringify(Object.keys(okH.body.continuity.byOutcome).sort()) ===
  JSON.stringify(['EMPTY', 'ERROR', 'INACTIVE', 'INCOMPLETE', 'INSERTED', 'SKIPPED']));

// ── D) Privacidad ──────────────────────────────────────────────────────────
console.log('\nD · Privacidad y secretos');
const serialized = JSON.stringify(ok.body) + JSON.stringify(okH.body);
// Ninguna dirección de correo puede viajar: se comprueba el VALOR, no la palabra
// (`welcomeEmailsSent` es un contador y es legítimo).
check('ningún valor con forma de email', !/@/.test(serialized));
const keys = new Set();
(function walk(v) {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
})([ok.body, okH.body]);
for (const forbidden of ['email', 'emails', 'user_id', 'userId', 'userIds', 'name', 'displayName',
                         'holdings', 'symbol', 'symbols', 'warnings', 'total_value_usd', 'totalValueUsd',
                         'aum', 'subscription', 'tier', 'capitalFlows']) {
  check(`ninguna clave \`${forbidden}\``, !keys.has(forbidden));
}
check('sin claves de importe o cantidad',
  ![...keys].some((k) => /(^|[^a-z])(usd|amount|value|balance|quantity|price)([^a-z]|$)/i.test(k)),
  [...keys].filter((k) => /(usd|amount|value|balance|quantity|price)/i.test(k)).join(','));
check('la respuesta no contiene ningún secreto', !serialized.includes(ADMIN) && !serialized.includes(READ));
check('la service-role no se serializa nunca',
  !/service_role|SERVICE_ROLE/i.test(serialized));
const srcSource = read('api/_founder-read-source.mjs');
check('la service-role solo viaja en cabeceras',
  (srcSource.match(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/g) ?? []).length === 1 &&
  /apikey: key/.test(srcSource) && /authorization: `Bearer \$\{key\}`/.test(srcSource));
check('la fuente acota el tiempo de espera', srcSource.includes('AbortSignal.timeout'));
check('la monetización no se lee en ningún handler',
  !/subscription|tier|premium|founderEligible|\bmrr\b|\barr\b/i.test(handlers));

// ── E) Subsistema ausente ⇒ explícito, no cero ─────────────────────────────
console.log('\nE · Ausencia explícita, nunca cero');
globalThis.fetch = async () => new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 });
const na = fakeRes(); await overview(fakeReq('GET', { authorization: `Bearer ${READ}` }), na);
check('agregado sin aplicar → 200 con available:false',
  na.statusCode === 200 && na.body.users.available === false && na.body.users.reason === 'not_applied');
check('…y ningún contador inventado',
  !('registered' in na.body.users) && !('leadsTotal' in na.body.funnel));
globalThis.fetch = async () => { throw new Error('network down'); };
const dn = fakeRes(); await health(fakeReq('GET', { authorization: `Bearer ${READ}` }), dn);
check('fuente inalcanzable → available:false unreachable',
  dn.body.watchdog.available === false && dn.body.watchdog.reason === 'unreachable');
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const nc = fakeRes(); await overview(fakeReq('GET', { authorization: `Bearer ${READ}` }), nc);
check('sin service-role → not_configured explícito', nc.body.users.reason === 'not_configured');
process.env.SUPABASE_SERVICE_ROLE_KEY = ADMIN;
check('platform: version.json real o available:false',
  typeof nc.body.platform.available === 'boolean' &&
  (nc.body.platform.available ? typeof nc.body.platform.build === 'string' : nc.body.platform.build === null));

// ── F) SQL de agregación ───────────────────────────────────────────────────
console.log('\nF · SQL de agregación');
const sql = read('db/founder_read_aggregates_1.sql');
const sqlCode = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
check('define las dos funciones',
  /create or replace function public\.founder_read_overview\(\)/.test(sqlCode) &&
  /create or replace function public\.founder_read_health\(\)/.test(sqlCode));
check('ambas son stable + security definer',
  (sqlCode.match(/\bstable\b/g) ?? []).length >= 2 && (sqlCode.match(/security definer/g) ?? []).length >= 2);
check('search_path fijado', (sqlCode.match(/set search_path/g) ?? []).length >= 2);
check('EXECUTE revocado a anon/authenticated',
  /revoke all on function public\.founder_read_overview\(\) from public, anon, authenticated/.test(sqlCode) &&
  /revoke all on function public\.founder_read_health\(\)\s+from public, anon, authenticated/.test(sqlCode));
check('EXECUTE concedido solo a service_role',
  (sqlCode.match(/grant execute on function[^;]+to service_role/g) ?? []).length === 2);
check('no escribe: ni insert, ni update, ni delete',
  !/\b(insert into|update\s+public\.|delete from|truncate|alter table|drop table)\b/i.test(sqlCode));
// Las cadenas de `comment on` son documentación: se retiran antes de juzgar el código.
const sqlExec = sqlCode.replace(/comment on[\s\S]*?;/gi, '');
const sqlLines = (m) => sqlExec.split('\n').filter((l) => m.test(l));
check('no selecciona direcciones de correo',
  sqlLines(/\bemail\b/i).every((l) => /welcome_email_sent_at|email_campaign_sends/.test(l)),
  sqlLines(/\bemail\b/i).filter((l) => !/welcome_email_sent_at|email_campaign_sends/.test(l)).join(' | '));
check('no lee el texto de warnings', !/\bwarnings\b/i.test(sqlExec));
check('holdings solo por longitud de array (regla ACTIVE-ONLY)',
  sqlLines(/holdings/i).every((l) => /jsonb_array_length\(up\.holdings\)|jsonb_typeof\(up\.holdings\)/.test(l)),
  sqlLines(/holdings/i).join(' | '));
check('total_value_usd solo como predicado de integridad, nunca como valor',
  sqlLines(/total_value_usd/i).every((l) => /total_value_usd is null or total_value_usd <= 0/.test(l)),
  sqlLines(/total_value_usd/i).join(' | '));
check('no lee la suscripción declarada', !/subscription/i.test(sqlExec));
check('no lee capital_flows', !/capital_flows/i.test(sqlExec));
check('no devuelve user_id ni el texto de warnings',
  !/'user_id'|user_id\s*,\s*'/.test(sqlCode) && !/'warnings'/.test(sqlCode));
check('el uso del watchdog es robusto a columnas (to_jsonb)', /to_jsonb\(x\)/.test(sqlCode));

// ── G) Cupo de funciones del plan (invariante de DEPLOYMENT) ───────────────
// El fallo de M.04 no fue de código: fue el CUPO. Vercel Hobby admite 12
// Serverless Functions y el rechazo llega DESPUÉS de un build en verde, con
// todas las rutas en 404. Bajo `api/`, todo fichero cuyo nombre no empiece por
// `_` es una función; una Edge Function no cuenta contra ese cupo.
console.log('\nG · Cupo de funciones del plan');
const HOBBY_SERVERLESS_LIMIT = 12;
function apiEntries(dir = 'api', out = []) {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) apiEntries(rel, out);
    else if (/\.(js|mjs|ts)$/.test(e.name) && !e.name.startsWith('_')) out.push(rel);
  }
  return out;
}
const routed = apiEntries();
const edge = routed.filter((f) => /export const config = \{ runtime: 'edge' \}/.test(read(f)));
const serverless = routed.filter((f) => !edge.includes(f));
check(`Serverless ≤ ${HOBBY_SERVERLESS_LIMIT} (hay ${serverless.length}, + ${edge.length} Edge)`,
  serverless.length <= HOBBY_SERVERLESS_LIMIT, serverless.join(', '));
check('la lectura Founder ocupa UNA sola función',
  serverless.filter((f) => f.startsWith('api/read/')).length === 1);
check('los módulos de la frontera no son funciones',
  ['api/_founder-read-token.mjs', 'api/_founder-read-source.mjs', 'api/_founder-read-handlers.mjs']
    .every((f) => existsSync(path.join(ROOT, f)) && !routed.includes(f)));

console.log(`\n${failures === 0 ? 'GATE OK' : `GATE FAIL — ${failures} comprobación(es)`}\n`);
process.exit(failures === 0 ? 0 : 1);
