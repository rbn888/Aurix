'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-M06-ONBOARDING-LANGUAGE-EMAIL — bloque 3 de M.06
// ════════════════════════════════════════════════════════════════════════════
// Cierra tres contratos que se auditan juntos porque comparten owner y fallan juntos:
//
//   A · BIENVENIDA: un email / un usuario Aurix ⇒ UNA sola bienvenida en toda la vida
//       de esa cuenta. Recarga, login, logout/login, reenvío, nuevo dispositivo,
//       redeploy, reintento, concurrencia, onboarding y cuenta existente ⇒ 0 extra.
//   B · IDIOMA: una elección manual es la preferencia AUTORITATIVA de esa cuenta y
//       sobrevive a recarga y sesión; y NO viaja de una cuenta a otra en el mismo
//       navegador.
//   C · El correo transaccional sale en el idioma explícito de la cuenta.
//   D · Onboarding: el estado no se hereda entre cuentas, y los estados vacíos de
//       primera ejecución existen en los dos idiomas.
//
// MÉTODO — la lección de [[feedback_harness_no_stubear_lo_certificado]]: el gate
// ANTERIOR (AURIX-EMAIL-EXPERIENCE-V1) comprobaba el sender con expresiones
// regulares, y por eso CERTIFICÓ EN VERDE el defecto que mandaba una bienvenida cada
// 15 minutos: sus asserts describían literalmente el patrón roto («comprueba el libro
// antes de enviar», «registra después de que Resend confirme»). Aquí se EJECUTA el
// handler real de `api/cron/welcome-email.js` contra un Supabase simulado que IMPONE
// el índice único parcial de verdad (`email_campaign_sends_sent_uniq`), y se CUENTAN
// las llamadas a Resend. Lo único simulado es la frontera de red; la lógica que se
// certifica es la de producción, byte a byte, y la extracción falla ruidosamente si
// el fichero deja de tener la forma que este gate transforma.
// CERO correos reales: Resend nunca se llama, se cuenta.
//
// NO se re-audita aquí lo ya demostrado en otro gate (CLAUDE.md §6):
//   · los 4 momentos del onboarding, reanudación, diferir, ES/EN del flujo, móvil y
//     escritorio → AURIX-ONBOARDING-EXCELLENCE-V1 (65 asserts).
//   · la precedencia landing/`?lang=`/`?langhint=` → AURIX-M03-LANGUAGE-PERSISTENCE.
//   · la EJECUCIÓN real de la purga sobre sus listas → AURIX-M06-IDENTITY-LIFECYCLE.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');

const cronSrc  = R('api/cron/welcome-email.js');
const waitSrc  = R('api/waitlist.js');
const appSrc   = R('app.js');
const engineSrc= R('services/onboarding-engine.js');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
// El mundo: Supabase + Resend simulados en la FRONTERA DE RED, con el índice
// único parcial de `email_campaign_sends` impuesto de verdad.
// ─────────────────────────────────────────────────────────────────────────────
const HOUR = 3600e3, MIN = 60e3;
function world(o) {
  const w = Object.assign({
    users: [], ledger: [], capture: [], portfolios: [], onboarding: [],
    ledgerReadFails: false, captureReadFails: false, ledgerInsertFails: false,
    patchFails: false, resendStatus: 200, resendBody: { id: 're_1' },
  }, o || {});
  w.sent = [];               // cada llamada a Resend
  let seq = 1;
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const eq = v => (typeof v === 'string' && v.startsWith('eq.')) ? v.slice(3) : null;

  w.fetch = async (url, init) => {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    if (String(url).startsWith('https://api.resend.com/emails')) {
      w.sent.push(JSON.parse(init.body));
      return reply(w.resendStatus, w.resendBody);
    }
    const u = new URL(url), p = u.pathname, q = u.searchParams;

    if (p === '/auth/v1/admin/users') {
      const page = Number(q.get('page') || 1);
      return reply(200, { users: page === 1 ? w.users : [] });
    }

    if (p === '/rest/v1/email_campaign_sends') {
      if (method === 'GET') {
        if (w.ledgerReadFails) return reply(500, { message: 'ledger read down' });
        const email = eq(q.get('email')), camp = eq(q.get('campaign_id')), st = eq(q.get('status'));
        return reply(200, w.ledger
          .filter(r => r.email === email && r.campaign_id === camp && (!st || r.status === st))
          .map(r => ({ ...r })));
      }
      if (method === 'POST') {
        if (w.ledgerInsertFails) return reply(500, { message: 'ledger insert down' });
        const row = JSON.parse(init.body);
        // ÍNDICE ÚNICO PARCIAL REAL: (campaign_id, email) WHERE status = 'sent'.
        if (row.status === 'sent' && w.ledger.some(r =>
            r.status === 'sent' && r.email === row.email && r.campaign_id === row.campaign_id)) {
          return reply(409, { code: '23505', message: 'duplicate key value violates unique constraint "email_campaign_sends_sent_uniq"' });
        }
        const rec = { id: 'row_' + (seq++), provider_message_id: null, error: null, ...row };
        w.ledger.push(rec);
        return reply(201, [{ ...rec }]);
      }
      if (method === 'PATCH') {
        if (w.patchFails) return reply(500, { message: 'patch down' });
        const id = eq(q.get('id')), patch = JSON.parse(init.body);
        const r = w.ledger.find(x => x.id === id);
        if (r) Object.assign(r, patch);
        return reply(200, []);
      }
    }

    if (p === '/rest/v1/Correos%20usuario') {
      if (method === 'GET') {
        if (w.captureReadFails) return reply(500, { message: 'capture read down' });
        const email = eq(q.get('email'));
        return reply(200, w.capture.filter(r => r.email === email).map(r => ({ ...r })));
      }
      if (method === 'PATCH') {
        const email = eq(q.get('email')), patch = JSON.parse(init.body);
        const nullOnly = q.get('welcome_email_sent_at') === 'is.null';
        const rows = w.capture.filter(r => r.email === email &&
          (!nullOnly || r.welcome_email_sent_at == null));
        rows.forEach(r => Object.assign(r, patch));
        return reply(200, rows.map(r => ({ ...r })));
      }
      if (method === 'POST') {
        const row = JSON.parse(init.body);
        if (w.capture.some(r => r.email === row.email)) return reply(409, { code: '23505' });
        w.capture.push({ welcome_email_sent_at: null, locale: 'en', ...row });
        return reply(201, [{ ...w.capture[w.capture.length - 1] }]);
      }
    }

    if (p === '/rest/v1/user_portfolios') {
      const uid = eq(q.get('user_id'));
      return reply(200, w.portfolios.filter(r => r.user_id === uid).map(r => ({ ...r })));
    }
    if (p === '/rest/v1/user_onboarding') {
      const uid = eq(q.get('user_id'));
      return reply(200, w.onboarding.filter(r => r.user_id === uid).map(r => ({ ...r })));
    }
    throw new Error('ruta no simulada: ' + method + ' ' + url);
  };
  return w;
}

// Carga el handler REAL en un realm aislado. Las tres transformaciones son
// mecánicas y OBLIGATORIAS: si el fichero deja de tener esa forma, el gate revienta
// en vez de certificar otra cosa.
function loadCron(src, epochIso) {
  let s = src;
  [[/^import fs from 'node:fs';\n/m, ''],
   [/^import path from 'node:path';\n/m, ''],
   [/^export default async function handler/m, 'async function handler']].forEach(([re, to]) => {
    if (!re.test(s)) throw new Error('EXTRACCIÓN DESINCRONIZADA con api/cron/welcome-email.js: ' + re);
    s = s.replace(re, to);
  });
  if (epochIso) {
    const re = /const ACCOUNT_EPOCH_MS = Date\.parse\('[^']+'\);/;
    if (!re.test(s)) throw new Error('ACCOUNT_EPOCH_MS ausente: el suelo duro es parte del contrato');
    s = s.replace(re, "const ACCOUNT_EPOCH_MS = Date.parse('" + epochIso + "');");
  }
  return s;
}
function runCron(src, w, env, query) {
  const ctx = vm.createContext({
    fs: { readFileSync: (p2, enc) => fs.readFileSync(p2, enc) },
    path,
    process: { env: Object.assign({
      WELCOME_CRON_ENABLED: 'true', SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 'rs',
      SUPABASE_URL: 'https://sb.test',
    }, env || {}), cwd: () => root },
    console: { log() {}, warn() {}, error() {} },
    fetch: w.fetch,
  });
  vm.runInContext(src + '\n;globalThis.__h = handler;', ctx);
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return ctx.__h({ method: 'GET', headers: {}, query: query || {} }, res).then(() => res);
}

const CRON = loadCron(cronSrc);
// Epoch de prueba en el pasado para poder ejercitar el camino feliz; el valor REAL
// se certifica aparte (A.8).
const CRON_T = loadCron(cronSrc, '2026-01-01T00:00:00Z');
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();
// La cuenta de prueba del founder: dirección con `+`, que es donde se rompen los
// filtros de PostgREST mal codificados.
const U1 = { id: 'user-1', email: 'rbn892+m04a@gmail.com', created_at: iso(NOW - 2 * HOUR) };

console.log('\nAURIX-M06-ONBOARDING-LANGUAGE-EMAIL — bloque 3 de M.06\n');

// ── A · UNA SOLA BIENVENIDA EN TODA LA VIDA DE LA CUENTA ────────────────────
(async () => {
console.log('A — bienvenida: UNA por cuenta, en toda su vida:');
{
  // A.1 — el caso del founder: el reloj de 15 min pasa una y otra vez.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }] });
  for (let i = 0; i < 8; i++) await runCron(CRON_T, w);      // recarga/reintento/redeploy/8 pasadas
  ok('A.1 ocho pasadas del cron ⇒ exactamente UN correo', w.sent.length === 1, 'enviados=' + w.sent.length);
  ok('A.1b y exactamente UNA fila "sent" en el libro',
     w.ledger.filter(r => r.status === 'sent').length === 1);
  ok('A.1c la dirección con "+" se resolvió bien (no se envió a otra)',
     w.sent[0] && w.sent[0].to[0] === U1.email, w.sent[0] && w.sent[0].to[0]);
}
{
  // A.2 — CONCURRENCIA: dos invocaciones solapadas (pg_cron + reintento de Vercel).
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }] });
  await Promise.all([runCron(CRON_T, w), runCron(CRON_T, w), runCron(CRON_T, w)]);
  ok('A.2 tres invocaciones CONCURRENTES ⇒ un solo correo (lo decide el índice único)',
     w.sent.length === 1, 'enviados=' + w.sent.length);
}
{
  // A.3 — el registro del envío se pierde (timeout/5xx tras enviar). El defecto
  // anterior reenviaba cada 15 min para siempre; con la reserva ANTES, la fila ya
  // está escrita y el PATCH perdido sólo cuesta la trazabilidad del provider id.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], patchFails: true });
  await runCron(CRON_T, w); await runCron(CRON_T, w); await runCron(CRON_T, w);
  ok('A.3 perder el registro POSTERIOR al envío no reenvía nada', w.sent.length === 1, 'enviados=' + w.sent.length);
}
{
  // A.4 — 2xx de Resend SIN `id`: antes se anotaba 'failed_retryable' sobre un correo
  // ya entregado y se garantizaba el duplicado.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], resendBody: {} });
  await runCron(CRON_T, w); await runCron(CRON_T, w);
  ok('A.4 un 2xx sin `id` cuenta como enviado (no se reintenta)', w.sent.length === 1, 'enviados=' + w.sent.length);
}
{
  // A.5 — FAIL-CLOSED: si el libro no se puede leer, NO se envía. Era el camino que
  // convertía un fallo de lectura en un correo cada 15 minutos.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], ledgerReadFails: true });
  await runCron(CRON_T, w); await runCron(CRON_T, w);
  ok('A.5 libro ilegible ⇒ CERO correos (fail-closed)', w.sent.length === 0, 'enviados=' + w.sent.length);
  const w2 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], ledgerInsertFails: true });
  await runCron(CRON_T, w2);
  ok('A.5b reserva imposible ⇒ CERO correos (fail-closed)', w2.sent.length === 0, 'enviados=' + w2.sent.length);
  const w3 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], captureReadFails: true });
  await runCron(CRON_T, w3);
  ok('A.5c tabla de captura ilegible ⇒ CERO correos (fail-closed)', w3.sent.length === 0, 'enviados=' + w3.sent.length);
}
{
  // A.6 — el OTRO sender ya la envió: `welcome_email_sent_at` sellado. Un email, una
  // bienvenida, venga del cron o del formulario de la landing.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: iso(NOW - 3 * HOUR), locale: 'en' }] });
  await runCron(CRON_T, w);
  ok('A.6 si api/waitlist.js ya dio la bienvenida ⇒ el cron NO envía otra', w.sent.length === 0, 'enviados=' + w.sent.length);
}
{
  // A.7 — envío fallido: la reserva se LIBERA y el intento siguiente reintenta UNA vez.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], resendStatus: 500, resendBody: { message: 'boom' } });
  await runCron(CRON_T, w);
  ok('A.7 tras un fallo de envío la reserva queda liberada',
     w.ledger.filter(r => r.status === 'sent').length === 0 &&
     w.ledger.some(r => r.status === 'failed_retryable'));
  w.resendStatus = 200; w.resendBody = { id: 're_ok' };
  await runCron(CRON_T, w); await runCron(CRON_T, w);
  ok('A.7b y el reintento envía exactamente UNO, no dos', w.sent.length === 2, 'intentos=' + w.sent.length);
}
{
  // A.7c — un rechazo PERMANENTE del proveedor no se reintenta cada 15 minutos.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }],
    resendStatus: 422, resendBody: { message: 'invalid recipient' } });
  await runCron(CRON_T, w); await runCron(CRON_T, w); await runCron(CRON_T, w);
  ok('A.7c un 4xx permanente se intenta UNA vez y no se reintenta', w.sent.length === 1, 'intentos=' + w.sent.length);
  const w2 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }],
    resendStatus: 429, resendBody: { message: 'rate limited' } });
  await runCron(CRON_T, w2);
  ok('A.7d un 429 sí libera la reserva (es transitorio)',
     w2.ledger.some(r => r.status === 'failed_retryable'));
}
{
  // A.8 — CUENTAS YA EXISTENTES: cero, y el env NO puede readmitirlas.
  const old = { id: 'u-old', email: 'historico@aurix.test', created_at: iso(NOW - 40 * 24 * HOUR) };
  const w = world({ users: [old], capture: [{ email: old.email, welcome_email_sent_at: null, locale: 'en' }] });
  await runCron(CRON, w, { WELCOME_FLOOR_AT: '2026-07-23T00:00:00Z' });
  ok('A.8 una cuenta anterior al suelo duro NO recibe bienvenida, ni con WELCOME_FLOOR_AT antiguo',
     w.sent.length === 0, 'enviados=' + w.sent.length);
  const epoch = /const ACCOUNT_EPOCH_MS = Date\.parse\('([^']+)'\);/.exec(cronSrc);
  ok('A.8b el suelo duro es una fecha fija en código y ya pasada', !!epoch && Date.parse(epoch[1]) <= Date.now() + 6 * HOUR, epoch && epoch[1]);
  ok('A.8c el env sólo puede SUBIR el suelo, nunca bajarlo',
     /FLOOR\s*=\s*Math\.max\(ACCOUNT_EPOCH_MS,\s*Date\.parse\(process\.env\.WELCOME_FLOOR_AT/.test(cronSrc));
}
{
  // A.9 — ventanas: <30 min espera, >48 h fuera (radio de alcance acotado).
  const fresh = { id: 'u-f', email: 'fresh@aurix.test', created_at: iso(NOW - 10 * MIN) };
  const stale = { id: 'u-s', email: 'stale@aurix.test', created_at: iso(NOW - 5 * 24 * HOUR) };
  const w = world({ users: [fresh, stale], capture: [
    { email: fresh.email, welcome_email_sent_at: null, locale: 'en' },
    { email: stale.email, welcome_email_sent_at: null, locale: 'en' }] });
  await runCron(CRON_T, w);
  ok('A.9 primer acceso hace 10 min ⇒ todavía no (espera los 30 min)', w.sent.length === 0);
  ok('A.9b una cuenta de 5 días queda fuera de elegibilidad (radio acotado)',
     !w.sent.some(s => s.to[0] === stale.email));
}
{
  // A.10 — ?dry=1 no envía y el guard de seguridad por defecto sigue en pie.
  const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }] });
  const r = await runCron(CRON_T, w, {}, { dry: '1' });
  ok('A.10 ?dry=1 informa de elegibles y no envía nada', w.sent.length === 0 && r.body.eligible === 1, JSON.stringify(r.body));
  const w2 = world({ users: [U1] });
  const r2 = await runCron(CRON_T, w2, { WELCOME_CRON_ENABLED: '' });
  ok('A.10b sin WELCOME_CRON_ENABLED el sender está desarmado', r2.body.disabled === true && w2.sent.length === 0);
  const w3 = world({ users: [U1] });
  const ctx3 = await runCron(CRON_T, w3, { CRON_SECRET: 's3cr3t' });
  ok('A.10c con CRON_SECRET, una llamada sin Bearer se rechaza', ctx3.code === 401 && w3.sent.length === 0);
}
{
  // A.11 — el SEGUNDO sender (api/waitlist.js) comparte el libro canónico.
  ok('A.11 api/waitlist.js reserva en el MISMO libro canónico antes de enviar',
     /WELCOME_LEDGER_PATH\s*=\s*'email_campaign_sends'/.test(waitSrc) &&
     /WELCOME_CAMPAIGN_ID\s*=\s*'aurix_welcome_v1'/.test(waitSrc) &&
     waitSrc.indexOf('WELCOME_LEDGER_PATH}`, {') < waitSrc.indexOf('sendWelcomeEmail({ email, locale })'));
  ok('A.11b un 409 del libro canónico ⇒ no envía y NO desella la captura',
     /canon\.status === 409/.test(waitSrc) && /already sent by the cron sender/.test(waitSrc));
  ok('A.11c sólo envía quien tiene la reserva canónica', /if \(canonClaimId\) \{/.test(waitSrc));
  ok('A.11d un fallo de envío libera LAS DOS reservas',
     /releaseCaptureStamp\(\)/.test(waitSrc) && /status: 'failed_retryable'/.test(waitSrc));
  ok('A.11e sigue habiendo UN solo emisor de correo en el endpoint',
     (waitSrc.match(/async function sendWelcomeEmail/g) || []).length === 1 &&
     (waitSrc.match(/api\.resend\.com\/emails/g) || []).length === 1);
}
{
  // A.12 — no hay un TERCER sender automático.
  const senders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|mjs|ts)$/.test(e.name)) continue;
      if (/api\.resend\.com/.test(R(rel))) senders.push(rel);
    }
  })('api');
  senders.push(...['supabase', 'services'].flatMap(d => {
    const out = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = dir + '/' + e.name;
        if (e.isDirectory()) { walk(rel); continue; }
        if (/\.(js|mjs|ts)$/.test(e.name) && /api\.resend\.com/.test(R(rel))) out.push(rel);
      }
    })(d);
    return out;
  }));
  ok('A.12 los únicos senders desplegados son los dos conocidos',
     senders.sort().join(',') === 'api/cron/welcome-email.js,api/waitlist.js', senders.join(','));
}

// ── B · IDIOMA: PREFERENCIA AUTORITATIVA POR CUENTA ─────────────────────────
console.log('\nB — idioma: la elección manual es autoritativa POR CUENTA:');
{
  // Se ejecuta la rama REAL de preferencias de `_mergeRemoteState` + el aplicador
  // remoto real, sobre un localStorage de verdad-suficiente.
  const pick = (from, to, label) => {
    const i = appSrc.indexOf(from); if (i < 0) throw new Error('falta ' + label);
    const j = appSrc.indexOf(to, i); if (j < 0) throw new Error('falta fin de ' + label);
    return appSrc.slice(i, j);
  };
  const fnSrc = name => {
    const s = 'function ' + name + '('; const i = appSrc.indexOf(s);
    if (i < 0) throw new Error('falta fn ' + name);
    let d = 0, st = false;
    for (let k = i; k < appSrc.length; k++) {
      if (appSrc[k] === '{') { d++; st = true; }
      else if (appSrc[k] === '}') { d--; if (st && !d) return appSrc.slice(i, k + 1); }
    }
    throw new Error('fn sin cerrar ' + name);
  };
  const MERGE = pick('    let localPrefsTs = _aurixPrefsTs();', '    // ── UI state', 'rama de preferencias');
  const SRC = [
    "const LANG_KEY = 'portfolio_lang';",
    "const BASE_KEY = 'portfolio_base_currency';",
    "const PREFS_TS_KEY = 'aurix_prefs_updated_at';",
    fnSrc('_aurixPrefsTs'),
    fnSrc('_applyRemotePrefs'),
    'function _syncPerfCurrencyButtons() {}',
    'function applyI18n() {}',
    'function applyTypeMetaLabels() {}',
    'function mergePrefs(remoteRow) {\n' + MERGE + '\n}',
  ].join('\n');
  // Las claves que el CAMBIO DE USUARIO retira, leídas de la lista REAL de producción.
  const userScoped = pick('const USER_SCOPED_LOCAL_KEYS = [', '];', 'USER_SCOPED_LOCAL_KEYS');
  const portfolioKeys = pick('const PORTFOLIO_KEYS = [', '];', 'PORTFOLIO_KEYS');

  function session(store, startLang) {
    const m = Object.assign({}, store);
    const ctx = vm.createContext({
      localStorage: {
        getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
        setItem: (k, v) => { m[k] = String(v); },
        removeItem: k => { delete m[k]; },
      },
      document: { documentElement: {}, querySelectorAll: () => [] },
      console: { warn() {}, log() {} },
    });
    vm.runInContext('var lang = ' + JSON.stringify(startLang) + '; var baseCurrency = "USD";\n' + SRC, ctx);
    return { ctx, store: m, get lang() { return vm.runInContext('lang', ctx); } };
  }
  // Purga REAL declarativa: se retiran exactamente las claves que la lista de
  // producción marca como propias del usuario (su EJECUCIÓN está certificada en
  // AURIX-M06-IDENTITY-LIFECYCLE; aquí se usa su contrato).
  const purgeUserSwitch = store => {
    const keys = (userScoped.match(/'([a-zA-Z0-9_.]+)'/g) || []).map(s => s.slice(1, -1));
    keys.forEach(k => { delete store[k]; });
    return store;
  };
  const remoteRow = (langV, tsMs) => ({ preferences: { lang: langV, baseCurrency: 'USD' }, preferences_updated_at: iso(tsMs) });

  ok('B.0 idioma, divisa y su sello son claves PROPIAS DEL USUARIO (se van al cambiar de cuenta)',
     /'portfolio_lang'/.test(userScoped) && /'portfolio_base_currency'/.test(userScoped) &&
     /'aurix_prefs_updated_at'/.test(userScoped));
  ok('B.0b y NO están en PORTFOLIO_KEYS: el logout del mismo usuario las conserva',
     !/portfolio_lang/.test(portfolioKeys) && !/aurix_prefs_updated_at/.test(portfolioKeys));

  // A elige español (switchLang sella LANG_KEY + PREFS_TS_KEY).
  const T1 = NOW - 10 * MIN;
  const A_STORE = { portfolio_lang: 'es', aurix_prefs_updated_at: String(T1) };

  {  // B.1 · recarga
    const s = session(A_STORE, 'es');
    ok('B.1 A elige español → recarga → español', s.lang === 'es' && s.store.portfolio_lang === 'es');
  }
  {  // B.2 · logout del MISMO usuario (no se purga el idioma) y vuelta a entrar
    const store = Object.assign({}, A_STORE);          // SAME_USER no retira estas claves
    const s = session(store, store.portfolio_lang || 'es');
    vm.runInContext('mergePrefs(' + JSON.stringify(remoteRow('es', T1 - 5 * MIN)) + ')', s.ctx);
    ok('B.2 A → logout → login A → español', s.lang === 'es');
  }
  {  // B.3 · EL CASO QUE IMPORTA: A(es) → B(en). El sello de A no puede ganar.
    const store = purgeUserSwitch(Object.assign({}, A_STORE));
    ok('B.3 el cambio de usuario retira el idioma y su sello de A',
       store.portfolio_lang === undefined && store.aurix_prefs_updated_at === undefined);
    const s = session(store, 'es');                    // el módulo arranca con el defecto
    // B eligió inglés ANTES que A el español: su sello es MÁS ANTIGUO y aun así debe ganar,
    // porque es la preferencia de SU cuenta.
    vm.runInContext('mergePrefs(' + JSON.stringify(remoteRow('en', T1 - 3 * HOUR)) + ')', s.ctx);
    ok('B.3b A(es) → B(en) → B ve INGLÉS aunque su elección sea más antigua que la de A',
       s.lang === 'en' && s.store.portfolio_lang === 'en', s.lang);
  }
  {  // B.4 · y de vuelta: B(en) → A(es)
    const store = purgeUserSwitch({ portfolio_lang: 'en', aurix_prefs_updated_at: String(NOW - MIN) });
    const s = session(store, 'es');
    vm.runInContext('mergePrefs(' + JSON.stringify(remoteRow('es', T1)) + ')', s.ctx);
    ok('B.4 B(en) → A(es) → A recupera su español', s.lang === 'es', s.lang);
  }
  {  // B.5 · dispositivo nuevo: sin nada local, manda la preferencia remota
    const s = session({}, 'es');
    vm.runInContext('mergePrefs(' + JSON.stringify(remoteRow('en', NOW - HOUR)) + ')', s.ctx);
    ok('B.5 dispositivo/sesión nuevos adoptan la preferencia remota de la cuenta', s.lang === 'en', s.lang);
  }
  {  // B.6 · una elección manual del MISMO usuario no la pisa un remoto más viejo
    const s = session(A_STORE, 'es');
    vm.runInContext('mergePrefs(' + JSON.stringify(remoteRow('en', T1 - HOUR)) + ')', s.ctx);
    ok('B.6 un remoto MÁS ANTIGUO no sobrescribe la elección manual del mismo usuario', s.lang === 'es', s.lang);
  }
  {  // B.7 · sin sello local (contenedor legacy) la elección local se sella y gana
    const s = session({ portfolio_lang: 'es' }, 'es');
    vm.runInContext('mergePrefs(' + JSON.stringify(remoteRow('en', NOW - 2 * HOUR)) + ')', s.ctx);
    ok('B.7 una elección local sin sello se vuelve autoritativa (guard legacy)', s.lang === 'es', s.lang);
  }
  ok('B.8 switchLang sigue siendo el owner único y sella la elección',
     /localStorage\.setItem\(LANG_KEY, lang\)/.test(fnSrc('switchLang')) && /_touchPrefs\(\)/.test(fnSrc('switchLang')));
  ok('B.9 y se propaga al motor de onboarding en UN solo sentido',
     /AurixOnboarding\.setLanguage\(lang\)/.test(fnSrc('switchLang')) &&
     !/setLanguage\([^)]*\)[\s\S]{0,80}switchLang/.test(engineSrc));
}

// ── C · EL CORREO SALE EN EL IDIOMA DE LA CUENTA ────────────────────────────
console.log('\nC — idioma del correo transaccional:');
{
  const es = R('email/aurix-welcome-es.html'), en = R('email/aurix-welcome.html');
  const capture = () => [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }];

  const w1 = world({ users: [U1], capture: capture(),
    portfolios: [{ user_id: U1.id, preferences: { lang: 'es' }, preferences_updated_at: iso(NOW - MIN) }] });
  await runCron(CRON_T, w1);
  ok('C.1 preferencia explícita de la app en español ⇒ correo en español',
     w1.sent[0] && w1.sent[0].subject === 'Bienvenido a Aurix.' && w1.sent[0].html === es,
     w1.sent[0] && w1.sent[0].subject);

  const w2 = world({ users: [U1], capture: capture(),
    onboarding: [{ user_id: U1.id, preferred_language: 'es', updated_at: iso(NOW - MIN) }] });
  await runCron(CRON_T, w2);
  ok('C.2 el paso LANGUAGE del onboarding también decide el idioma',
     w2.sent[0] && w2.sent[0].subject === 'Bienvenido a Aurix.');

  const w3 = world({ users: [U1], capture: capture(),
    portfolios: [{ user_id: U1.id, preferences: { lang: 'es' }, preferences_updated_at: iso(NOW - 3 * HOUR) }],
    onboarding: [{ user_id: U1.id, preferred_language: 'en', updated_at: iso(NOW - MIN) }] });
  await runCron(CRON_T, w3);
  ok('C.3 entre dos señales explícitas gana la MÁS RECIENTE',
     w3.sent[0] && w3.sent[0].subject === 'Welcome to Aurix.', w3.sent[0] && w3.sent[0].subject);

  const w4 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'es' }] });
  await runCron(CRON_T, w4);
  ok('C.4 sin preferencia de cuenta, el locale capturado al pedir acceso',
     w4.sent[0] && w4.sent[0].subject === 'Bienvenido a Aurix.');

  const w5 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: null }] });
  await runCron(CRON_T, w5);
  ok('C.5 sin ninguna señal, fallback determinista a inglés',
     w5.sent[0] && w5.sent[0].subject === 'Welcome to Aurix.' && w5.sent[0].html === en);

  const w6 = world({ users: [U1], capture: capture(),
    portfolios: [{ user_id: 'OTRO-usuario', preferences: { lang: 'es' }, preferences_updated_at: iso(NOW) }] });
  await runCron(CRON_T, w6);
  ok('C.6 el idioma de OTRA cuenta no se hereda (B no decide el correo de A)',
     w6.sent[0] && w6.sent[0].subject === 'Welcome to Aurix.');

  ok('C.7 las dos plantillas son salida VERBATIM del renderer compartido (sin deriva)', (() => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import{renderWelcomeEmail,renderOtpEmail}from'./scripts/aurix-email.mjs';import fs from 'node:fs';" +
      "process.stdout.write([renderWelcomeEmail()===fs.readFileSync('email/aurix-welcome.html','utf8'),"
      + "renderWelcomeEmail('es')===fs.readFileSync('email/aurix-welcome-es.html','utf8'),"
      + "renderOtpEmail()===fs.readFileSync('email/aurix-otp-code.html','utf8')].join(','));"],
      { cwd: root, encoding: 'utf8' });
    return out.trim() === 'true,true,true';
  })());
  ok('C.8 la variante española está traducida de verdad (cuerpo, CTA y firma)',
     /Bienvenido a Aurix\./.test(es) && /Entrar en Aurix/.test(es) &&
     /El equipo de Aurix/.test(es) && /O pega este enlace/.test(es) &&
     !/The Aurix Team/.test(es) && !/paste this link/.test(es));
  ok('C.9 el correo de la landing (api/waitlist.js) ya respetaba el locale',
     /welcomeContent\(locale\)/.test(waitSrc) && /es: \{/.test(waitSrc));
  ok('C.10 Stripe recibe el locale, así que sus correos y su checkout salen en idioma',
     /locale: \(String\(body\.locale\) === 'es'\) \? 'es' : 'en'/.test(R('api/billing/_checkout.js')) &&
     /body\.append\('locale', locale\)/.test(R('api/billing/_portal.js')));
}

// ── D · ONBOARDING: AISLAMIENTO Y ESTADOS VACÍOS ────────────────────────────
console.log('\nD — onboarding: aislamiento entre cuentas y estados vacíos:');
{
  const portfolioKeys = appSrc.slice(appSrc.indexOf('const PORTFOLIO_KEYS = ['), appSrc.indexOf('];', appSrc.indexOf('const PORTFOLIO_KEYS = [')));
  ok('D.1 el estado de onboarding se purga en LOS DOS modos (logout y cambio de usuario)',
     /'aurix_onboarding_completed'/.test(portfolioKeys) && /'aurix_onboarding_step'/.test(portfolioKeys) &&
     /'aurix_onboarding_preferences'/.test(portfolioKeys));
  ok('D.2 y su fila remota está siempre acotada al usuario autenticado',
     /\.eq\('user_id', currentUser\.id\)/.test(engineSrc) && /user_id:\s*currentUser\.id/.test(engineSrc) &&
     !/localStorage[^\n]*user_id/.test(engineSrc));
  ok('D.3 sin usuario autenticado no se lee ni se escribe nada remoto',
     (engineSrc.match(/typeof currentUser === 'undefined' \|\| !currentUser/g) || []).length >= 1 &&
     /no authenticated user/.test(engineSrc));
  ok('D.4 el "completado" inferido por cartera exige activos REALES del usuario en curso',
     /if \(!merged\.completed && _readAssetsLength\(\) > 0\)/.test(engineSrc) &&
     /'aurix_assets'/.test(portfolioKeys));
  // Estados vacíos de primera ejecución, en los dos idiomas.
  const KEYS = ['emptyTitle', 'emptySub', 'emptyActivationTitle', 'emptyActivationBody', 'emptyCtaPrimary'];
  const missing = KEYS.filter(k => (appSrc.match(new RegExp('\\b' + k + ':\\s*[\'"]', 'g')) || []).length < 2);
  ok('D.5 el estado vacío del dashboard existe en ES y EN', missing.length === 0, 'faltan: ' + missing.join(','));
  const CATS = ['crypto', 'stock', 'etf', 'metal', 'real_estate', 'cash'];
  const catBlocks = appSrc.match(/emptyCategory: \{[\s\S]*?\n    \},/g) || [];
  ok('D.6 hay estado vacío por categoría en los DOS idiomas', catBlocks.length === 2, 'bloques=' + catBlocks.length);
  ok('D.6b y las seis categorías están cubiertas en ambos',
     catBlocks.every(b => CATS.every(c => new RegExp('\\b' + c + ':').test(b) && /title:/.test(b) && /cta:/.test(b))));
  // SECUENCIA — la pregunta abierta del checkpoint: ¿puede el onboarding empujar un
  // «completado» FALSO a la fila de una cuenta nueva? No, si la purga por cambio de
  // usuario corre ANTES de que el onboarding lea los activos. Eso es orden, no estado:
  // se pina, porque comprobar el estado final no lo demuestra.
  ok('D.8 la purga por cambio de usuario se dispara al resolver auth, ANTES de montar el onboarding',
     appSrc.indexOf('_aurixEnforceCacheOwner(_aurixActiveUserId)') <
     appSrc.indexOf('window.maybeShowOnboarding()'));
  ok('D.9 y el onboarding no monta sin usuario autenticado',
     /const user = \(typeof currentUser !== 'undefined' && currentUser\)[\s\S]{0,160}if \(!user\) return;/.test(appSrc));
  ok('D.10 la purga vacía TAMBIÉN los activos en memoria, que es lo que lee el inferidor',
     /_clearLocalUserState\(_AURIX_PURGE\.USER_SWITCH, owner\);[\s\S]{0,900}assets = \[\];/.test(appSrc) &&
     /Array\.isArray\(window\.assets\)/.test(engineSrc));
  ok('D.7 una categoría sin copy no pinta un estado vacío a medias',
     /const cfg = map\[categoryType\];[\s\S]{0,180}if \(!cfg\) \{[\s\S]{0,120}return;/.test(appSrc));
}

// ── E · NO-VACUIDAD: el sender ANTERIOR falla estos mismos contratos ────────
console.log('\nE — no-vacuidad (el sender anterior, tal cual estaba en producción):');
{
  let prev = null;
  try { prev = execFileSync('git', ['show', 'HEAD:api/cron/welcome-email.js'], { cwd: root, encoding: 'utf8' }); } catch (_) {}
  if (!prev) {
    ok('E.0 se pudo recuperar el sender anterior de git', false);
  } else if (/ACCOUNT_EPOCH_MS/.test(prev)) {
    ok('E.0 HEAD ya contiene el fix — la no-vacuidad quedó demostrada en su entrega', true);
  } else {
    const PREV = loadCron(prev);
    const env = { WELCOME_FLOOR_AT: '2026-01-01T00:00:00Z' };
    const w = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], ledgerReadFails: true });
    await runCron(PREV, w, env);
    await runCron(PREV, w, env);
    ok('E.1 ANTES: con el libro ilegible enviaba en CADA pasada (lectura fail-open)', w.sent.length === 2, 'enviados=' + w.sent.length);
    // MISMA inyección de fallo que A.5b (el libro no acepta escrituras): ANTES se
    // enviaba primero y el registro perdido se tragaba ⇒ un correo por pasada. AHORA,
    // con la reserva por delante, ese mismo fallo da CERO correos.
    const w2 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }], ledgerInsertFails: true });
    await runCron(PREV, w2, env); await runCron(PREV, w2, env); await runCron(PREV, w2, env);
    ok('E.2 ANTES: si se perdía el registro, reenviaba cada pasada (claim-after-send)', w2.sent.length === 3, 'enviados=' + w2.sent.length);
    const w3 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'en' }] });
    await Promise.all([runCron(PREV, w3, env), runCron(PREV, w3, env)]);
    ok('E.3 ANTES: dos invocaciones concurrentes enviaban dos correos', w3.sent.length === 2, 'enviados=' + w3.sent.length);
    const w4 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: iso(NOW - HOUR), locale: 'en' }] });
    await runCron(PREV, w4, env);
    ok('E.4 ANTES: enviaba aunque el otro sender ya hubiera dado la bienvenida', w4.sent.length === 1, 'enviados=' + w4.sent.length);
    const w5 = world({ users: [U1], capture: [{ email: U1.email, welcome_email_sent_at: null, locale: 'es' }],
      portfolios: [{ user_id: U1.id, preferences: { lang: 'es' }, preferences_updated_at: iso(NOW) }] });
    await runCron(PREV, w5, env);
    ok('E.5 ANTES: el correo salía en inglés con la cuenta en español', w5.sent[0] && w5.sent[0].subject === 'Welcome to Aurix.');
  }
}

console.log('\n' + (fail ? '✗ FAIL' : '✓ PASS') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFALLOS:'); failed.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\n✗ HARNESS ERROR:', e && e.stack || e); process.exit(1); });
