'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX · SECURITY HARDENING V3 — gate de las correcciones de las auditorías V1/V2 (17-10-2026)
// ════════════════════════════════════════════════════════════════════════════
// Ejecuta el código REAL de cada ruta (api/*), no lo describe: los módulos ESM se copian a un
// directorio temporal con `"type": "module"` y se importan con un `fetch` falso que cuenta las
// llamadas a cada proveedor. Ninguna prueba sale a la red, toca Supabase, Stripe ni Resend.
// Cada corrección lleva prueba positiva, negativa, de límite y de regresión.
//
// LÍMITES DECLARADOS: el SQL (cuotas de Workspace, puerta Premium, consentimiento) no se puede
// ejecutar sin Postgres; de él se comprueba la FORMA de cada garantía. Su ejecución real ocurre
// al aplicarlo en Supabase, con la comprobación previa que trae cada fichero.
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0, fail = 0; const failed = [];
function ok(n, c, info) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; failed.push(n); console.log('  ✗ ' + n + (info !== undefined ? '  →  ' + info : '')); }
}

// ── módulos api/ ejecutables en este proceso ─────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurix-sec-v3-'));
fs.cpSync(path.join(root, 'api'), path.join(tmp, 'api'), { recursive: true });
fs.cpSync(path.join(root, 'scripts'), path.join(tmp, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
let bust = 0;
const load = rel => import(pathToFileURL(path.join(tmp, rel)).href + '?v=' + (++bust));

// fetch falso: responde según `route(url, init)` y registra cada llamada.
let calls = [];
function installFetch(route) {
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const r = await route(String(url), init || {});
    if (r instanceof Error) throw r;
    const status = r.status || 200;
    return { ok: status >= 200 && status < 300, status,
      json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
}
function mkRes() {
  return { statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}
const req = (o) => Object.assign({ method: 'GET', headers: { 'x-real-ip': '203.0.113.7' }, query: {}, body: undefined }, o);
const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log;
  console.error = console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; console.log = l; } };

(async () => {
console.log('\nAURIX · SECURITY HARDENING V3\n');

// ═══ 1 · Helper de defensas locales ═══════════════════════════════════════════
console.log('— 1 · _abuse-guard');
{
  const g = await load('api/_abuse-guard.js');
  const lim = g.createRateLimiter({ limit: 3, windowMs: 1000, maxKeys: 4 });
  const t = 1_000_000;
  ok('limitador: permite hasta el cupo', lim.take('a', t) && lim.take('a', t) && lim.take('a', t));
  ok('limitador: niega por encima del cupo', lim.take('a', t) === false);
  ok('limitador: la ventana se reinicia', lim.take('a', t + 1000) === true);
  for (let i = 0; i < 50; i++) lim.take('ip' + i, t + 1000);
  ok('limitador: el mapa de claves está acotado', lim.size() <= 4, lim.size());
  const c = g.createTtlCache({ max: 3, ttlMs: 100 });
  c.set('x', 1, 100, t);
  ok('caché: devuelve dentro del TTL', c.get('x', t + 50) === 1);
  ok('caché: caduca', c.get('x', t + 100) === undefined);
  for (let i = 0; i < 10; i++) c.set('k' + i, i, 100, t);
  ok('caché: tamaño acotado (expulsa la más antigua)', c.size() === 3 && c.get('k9', t) === 9 && c.get('k0', t) === undefined);
  ok('error seguro: código conocido pasa', g.safeErrorCode(new Error('yahoo_http_429'), 'yahoo_') === 'yahoo_http_429');
  ok('error seguro: texto libre del proveedor NO pasa',
    g.safeErrorCode(new Error('fetch failed https://x?apikey=SECRET'), 'yahoo_') === 'upstream_error');
  const te = new Error('The operation was aborted due to timeout'); te.name = 'TimeoutError';
  ok('error seguro: timeout → upstream_timeout', g.safeErrorCode(te, 'yahoo_') === 'upstream_timeout');
  ok('clave de cliente: x-real-ip primero', g.clientKey({ headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } }) === '1.1.1.1');
}

// ═══ 2 · /api/prices ═══════════════════════════════════════════════════════════
console.log('— 2 · /api/prices');
{
  const cg = (url) => {
    const ids = decodeURIComponent((url.match(/ids=([^&]*)/) || [])[1] || '').split(',');
    const body = {}; for (const id of ids) if (id && id !== 'no-such-coin') body[id] = { usd: 100, usd_24h_change: 1.5 };
    return { body };
  };
  const route = (url) => {
    if (url.includes('api.coingecko.com')) return cg(url);
    if (url.includes('api.twelvedata.com')) return { body: { price: '210.13' } };
    if (url.includes('finance.yahoo.com')) return { body: { chart: { result: [{ meta: { regularMarketPrice: 50, chartPreviousClose: 49, currency: 'USD' } }] } } };
    return { status: 404, body: {} };
  };
  installFetch(route);
  let m = await load('api/prices.js');
  const call = async (providers, ip) => { const res = mkRes(); await quiet(() => m.default(req({ method: 'POST', headers: { 'x-real-ip': ip || '198.51.100.1' }, body: { providers } }), res)); return res; };

  let r = await call(['coingecko:bitcoin']);
  ok('positivo: cotización cripto intacta (precio y cambio 24h del proveedor)',
    r.statusCode === 200 && r.body.prices['coingecko:bitcoin'].price === 100 && r.body.prices['coingecko:bitcoin'].change24h === 1.5, JSON.stringify(r.body));

  process.env.TWELVE_API_KEY = 'k&x=1';
  m = await load('api/prices.js'); installFetch(route);
  r = await call(['twelvedata:XAU/USD']);
  const tdUrl = (calls.find(c => c.url.includes('twelvedata')) || {}).url || '';
  ok('regresión: metales vía TwelveData siguen cotizando', r.body.prices['twelvedata:XAU/USD'] && r.body.prices['twelvedata:XAU/USD'].price === 210.13);
  ok('codificación: el símbolo viaja codificado (XAU%2FUSD)', /symbol=XAU%2FUSD&/.test(tdUrl), tdUrl.replace(/apikey=[^&]*/, 'apikey=…'));
  ok('codificación: la clave no puede inyectar parámetros', /apikey=k%26x%3D1$/.test(tdUrl));
  installFetch(route);
  r = await call(['twelvedata:AAPL&apikey=attacker', 'yahoo:AAPL?x=1', 'coingecko:../../admin']);
  ok('negativo: símbolos con caracteres de control NO llegan a ningún proveedor', calls.length === 0, calls.map(c => c.url).join(' | '));
  ok('negativo: respuesta vacía, sin error del servidor', r.statusCode === 200 && Object.keys(r.body.prices).length === 0);

  installFetch(route);
  r = await call(new Array(1001).fill('coingecko:bitcoin'));
  ok('límite: más de 1000 entradas → 413 sin tocar proveedores', r.statusCode === 413 && calls.length === 0);
  m = await load('api/prices.js'); installFetch(route);
  const many = Array.from({ length: 300 }, (_, i) => 'coingecko:coin-' + i);
  r = await call(many);
  const idsSent = decodeURIComponent((calls[0].url.match(/ids=([^&]*)/) || [])[1]).split(',').length;
  ok('límite: como mucho 200 ids por petición', idsSent === 200, idsSent);
  m = await load('api/prices.js'); installFetch(route);
  await call(Array.from({ length: 80 }, (_, i) => 'yahoo:SYM' + i));
  ok('límite: fan-out a Yahoo acotado a 25', calls.filter(c => c.url.includes('yahoo')).length === 25, calls.length);
  m = await load('api/prices.js'); installFetch(route);
  await call(['coingecko:bitcoin', 'coingecko:bitcoin', 'coingecko:bitcoin']);
  ok('dedupe: entradas repetidas = un id', decodeURIComponent(calls[0].url.match(/ids=([^&]*)/)[1]) === 'bitcoin');

  m = await load('api/prices.js'); installFetch(route);
  await call(['coingecko:no-such-coin']); const first = calls.length;
  await call(['coingecko:no-such-coin']);
  ok('caché negativa: id inexistente no se vuelve a pedir', first === 1 && calls.length === 1, calls.length);
  m = await load('api/prices.js');
  installFetch(() => new Error('network down'));
  await call(['coingecko:ethereum']);
  installFetch(route);
  r = await call(['coingecko:ethereum']);
  ok('caché negativa: un fallo de red NO se memoriza como "no existe"', r.body.prices['coingecko:ethereum'] && r.body.prices['coingecko:ethereum'].price === 100);

  m = await load('api/prices.js'); installFetch(route);
  const codes = []; for (let i = 0; i < 11; i++) codes.push((await call(['coingecko:bitcoin'], '192.0.2.50')).statusCode);
  ok('regresión: cupo por cliente igual que antes (10 / 10 s, la 11.ª → 429)', codes.slice(0, 10).every(c => c === 200) && codes[10] === 429, codes.join(','));
  ok('cupo por cliente: otro cliente no se ve afectado', (await call(['coingecko:bitcoin'], '192.0.2.51')).statusCode === 200);

  for (let i = 0; i < 6000; i++) m.setCache('coingecko:x' + i, { price: 1 }, 30000);
  ok('caché de precios acotada (≤ 5000) y con la forma que lee snapshot.js',
    m.PRICE_CACHE.size <= 5000 && typeof m.PRICE_CACHE.get('coingecko:x5999').timestamp === 'number', m.PRICE_CACHE.size);
}

// ═══ 3 · /api/prices/history (CoinGecko, clave DEMO) ═══════════════════════════
console.log('— 3 · /api/prices/history');
{
  let mode = 'ok';
  const route = () => mode === 'ok' ? { body: { prices: [[1, 2], [3, 4]] } }
                    : mode === '404' ? { status: 404, body: {} }
                    : mode === '500' ? { status: 500, body: {} } : { status: 429, body: {} };
  installFetch(route);
  const m = await load('api/prices/history.js');
  const call = async (q, ip) => { const res = mkRes(); await quiet(() => m.default(req({ query: q, headers: { 'x-real-ip': ip || '198.51.100.9' } }), res)); return res; };
  let r = await call({ id: 'bitcoin', days: '30' });
  ok('positivo: serie del proveedor intacta', r.statusCode === 200 && JSON.stringify(r.body.prices) === '[[1,2],[3,4]]');
  await call({ id: 'bitcoin', days: '30' });
  ok('caché: la segunda petición no gasta la clave', calls.length === 1, calls.length);
  installFetch(route);
  await Promise.all([call({ id: 'ethereum', days: '7' }), call({ id: 'ethereum', days: '7' }), call({ id: 'ethereum', days: '7' })]);
  ok('colapso: peticiones simultáneas = una llamada al proveedor', calls.length === 1, calls.length);
  mode = '404'; installFetch(route);
  r = await call({ id: 'no-such', days: '30' }); await call({ id: 'no-such', days: '30' });
  ok('caché negativa: 404 determinista no se repite', r.statusCode === 502 && r.body.error === 'upstream_404' && calls.length === 1);
  mode = '500'; installFetch(route);
  await call({ id: 'solana', days: '30' }); mode = 'ok'; r = await call({ id: 'solana', days: '30' });
  ok('caché negativa: un 5xx NO se memoriza', r.statusCode === 200 && calls.length === 2);
  r = await call({ id: 'Bad Id!', days: '30' });
  ok('negativo: id inválido → 400', r.statusCode === 400);
  const codes = []; for (let i = 0; i < 61; i++) codes.push((await call({ id: 'coin-' + i, days: '1' }, '192.0.2.99')).statusCode);
  ok('límite: cupo por cliente (60/min) → 429', codes[59] === 200 && codes[60] === 429, codes.slice(58).join(','));
}

// ═══ 4 · /api/prices/history-yahoo (mini gráficos de Market) ═══════════════════
console.log('— 4 · /api/prices/history-yahoo');
{
  let mode = 'ok';
  const okBody = { chart: { result: [{ meta: { currency: 'USD' }, timestamp: [1700000000], indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [10] }] } }] } };
  const route = () => mode === 'ok' ? { body: okBody }
                    : mode === 'notfound' ? { body: { chart: { error: { code: 'Not Found', description: 'No data found' } } } }
                    : mode === 'throttle' ? { status: 429, body: {} }
                    : new Error('getaddrinfo ENOTFOUND query1.finance.yahoo.com?apikey=SECRET');
  installFetch(route);
  const m = await load('api/prices/history-yahoo.js');
  const call = async (q) => { const res = mkRes(); await quiet(() => m.default(req({ query: q }), res)); return res; };
  let r = await call({ symbol: 'AAPL', range: '30d' });
  ok('positivo: serie OHLC intacta', r.statusCode === 200 && r.body.points.length === 1 && r.body.points[0].close === 1.5);
  ok('regresión: sin cupo por cliente (Market pide ~1.000 series por carga)', !/createRateLimiter/.test(read('api/prices/history-yahoo.js')));
  mode = 'notfound'; installFetch(route);
  r = await call({ symbol: 'ZZZZ', range: '30d' }); await call({ symbol: 'ZZZZ', range: '30d' });
  ok('caché negativa: símbolo inexistente no se repite', calls.length === 1 && r.body.error === 'yahoo_app_error', JSON.stringify(r.body));
  mode = 'throttle'; installFetch(route);
  await call({ symbol: 'MSFT', range: '30d' }); mode = 'ok'; r = await call({ symbol: 'MSFT', range: '30d' });
  ok('caché negativa: un 429 NO se memoriza', r.statusCode === 200 && calls.length === 2);
  mode = 'neterr'; installFetch(route);
  r = await call({ symbol: 'NVDA', range: '7d' });
  ok('error seguro: el mensaje interno del fallo no llega al cliente', r.statusCode === 502 && r.body.error === 'upstream_error', JSON.stringify(r.body));
  ok('negativo: símbolo inválido → 400', (await call({ symbol: 'A B<script>', range: '30d' })).statusCode === 400);
}

// ═══ 5 · Búsquedas y resolve-isin ══════════════════════════════════════════════
console.log('— 5 · /api/search/* · /api/assets/resolve-isin');
{
  installFetch(() => ({ body: { quotes: [{ symbol: 'AAPL', longname: 'Apple Inc.', quoteType: 'EQUITY', score: 1, exchDisp: 'NASDAQ' }] } }));
  const sa = await load('api/search/assets.js');
  const callA = async (q, ip) => { const res = mkRes(); await quiet(() => sa.default(req({ query: { q }, headers: { 'x-real-ip': ip || '198.51.100.20' } }), res)); return res; };
  let r = await callA('apple');
  ok('positivo: búsqueda de acciones intacta', r.statusCode === 200 && r.body.results[0].ticker === 'AAPL');
  await callA('Apple');
  ok('caché: la misma consulta no repite la llamada a Yahoo', calls.length === 1);
  const codes = []; for (let i = 0; i < 61; i++) codes.push((await callA('q' + i, '192.0.2.70')).statusCode);
  ok('límite: cupo por cliente (60/min) → 429 con results vacío', codes[59] === 200 && codes[60] === 429);

  installFetch(() => ({ status: 404, body: {} }));
  const sc = await load('api/search/crypto.js');
  const callC = async (query, ip) => { const res = mkRes(); await quiet(() => sc.default(req({ query, headers: { 'x-real-ip': ip || '198.51.100.30' } }), res)); return res; };
  const addr = i => '0x' + String(i).padStart(40, 'a');
  const cc = []; for (let i = 0; i < 11; i++) cc.push(await callC({ address: addr(i) }, '192.0.2.80'));
  ok('modo contrato: cupo por cliente (10/min) → 429 provider_unavailable',
    cc[9].statusCode !== 429 && cc[10].statusCode === 429 && cc[10].body.reason === 'provider_unavailable', cc.map(x => x.statusCode).join(','));
  ok('modo contrato: dirección desmesurada → 400 sin llamadas',
    (await callC({ address: '0x' + 'a'.repeat(500) }, '192.0.2.81')).statusCode === 400);
  let budgetHit = false;
  for (let i = 0; i < 40 && !budgetHit; i++) { const x = await callC({ address: addr(100 + i) }, '192.0.2.' + (100 + i)); if (x.statusCode === 429) budgetHit = true; }
  ok('modo contrato: presupuesto GLOBAL por instancia (no depende de la IP)', budgetHit);

  installFetch(() => ({ body: [{ data: [{ ticker: 'AAPL', exchCode: 'US' }] }] }));
  const ri = await load('api/assets/resolve-isin.js');
  const callI = async (isin, ip) => { const res = mkRes(); await quiet(() => ri.default(req({ method: 'POST', body: { isin }, headers: { 'x-real-ip': ip || '198.51.100.40' } }), res)); return res; };
  r = await callI('US0378331005'); await callI('US0378331005');
  ok('resolve-isin: positivo + caché de 24 h', r.statusCode === 200 && r.body.data[0].ticker === 'AAPL' && calls.length === 1);
  ok('resolve-isin: ISIN inválido → 400', (await callI('NOTANISIN')).statusCode === 400);
}

// ═══ 6 · Cron fail-closed ═══════════════════════════════════════════════════════
console.log('— 6 · /api/cron/welcome-email');
{
  installFetch(() => ({ status: 500, body: {} }));
  const m = await load('api/cron/welcome-email.js');
  // La función no se exporta (otros harnesses evalúan este fichero como script): se extrae su fuente real.
  const cronSrc = read('api/cron/welcome-email.js');
  const fStart = cronSrc.indexOf('function cronAuthorized(');
  let depth = 0, fEnd = -1;
  for (let k = fStart; k < cronSrc.length; k++) { if (cronSrc[k] === '{') depth++; else if (cronSrc[k] === '}') { depth--; if (depth === 0) { fEnd = k + 1; break; } } }
  const A = vm.runInNewContext('(' + cronSrc.slice(fStart, fEnd) + ')');
  ok('sin import nuevo ni export (compatible con los harnesses que lo evalúan)', !/node:crypto/.test(cronSrc) && !/export function cronAuthorized/.test(cronSrc));
  ok('sin CRON_SECRET → denegado', A('Bearer x', undefined) === false && A('Bearer ', '') === false);
  ok('CRON_SECRET en blanco → denegado', A('Bearer    ', '   ') === false);
  ok('token incorrecto → denegado', A('Bearer wrong-secret-0', 'right-secret-0') === false);
  ok('longitud distinta → denegado sin excepción', A('Bearer s', 'a-much-longer-secret') === false);
  ok('sin cabecera → denegado', A(undefined, 'right-secret-0') === false);
  ok('token correcto → permitido', A('Bearer right-secret-0', 'right-secret-0') === true);
  const run = async (env, auth) => {
    const prev = { ...process.env }; Object.assign(process.env, env);
    if (env.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    const res = mkRes(); await quiet(() => m.default(req({ headers: auth ? { authorization: auth } : {} }), res));
    process.env = prev; return res;
  };
  let r = await run({ CRON_SECRET: undefined }, 'Bearer anything');
  ok('handler: sin secreto configurado → 401 (antes: ABIERTO)', r.statusCode === 401 && calls.length === 0);
  r = await run({ CRON_SECRET: 'cron-secret-ok' }, 'Bearer cron-secret-ok');
  ok('handler: secreto correcto → pasa la autenticación (desarmado → 200 disabled)', r.statusCode === 200 && r.body.disabled === true, JSON.stringify(r.body));
}

// ═══ 7 · Campañas: verificación + consentimiento ═══════════════════════════════
console.log('— 7 · scripts/aurix-send-campaign.mjs');
{
  const m = await load('scripts/aurix-send-campaign.mjs');
  const E = m.campaignEligibility;
  const confirmed = new Set(['ana@mail.com', 'bea@mail.com']);
  ok('email inválido → excluido', E({ email: 'nope' }, { confirmed, consentColumn: true }) === 'invalid');
  ok('baja / supresión → excluido (se respeta)', E({ email: 'ana@mail.com', status: 'unsubscribed', marketing_consent_at: '2026-01-01' }, { confirmed, consentColumn: true }) === 'suppressed');
  ok('email sin cuenta confirmada (p. ej. metido por persist_access_email) → excluido',
    E({ email: 'victima@mail.com', marketing_consent_at: '2026-01-01' }, { confirmed, consentColumn: true }) === 'unverified');
  ok('sin columna de consentimiento → excluido (no se inventa)', E({ email: 'ana@mail.com' }, { confirmed, consentColumn: false }) === 'no_consent');
  ok('consentimiento nulo → excluido', E({ email: 'ana@mail.com', marketing_consent_at: null }, { confirmed, consentColumn: true }) === 'no_consent');
  ok('confirmado + consentimiento registrado → elegible', E({ email: 'Ana@Mail.com ', marketing_consent_at: '2026-01-01' }, { confirmed, consentColumn: true }) === 'eligible');
  const src = read('scripts/aurix-send-campaign.mjs');
  ok('--send sin columna de consentimiento → bloqueado antes de enviar', /MODE === 'send' && !consentColumn[\s\S]{0,300}process\.exit\(3\)/.test(src) &&
    src.indexOf("MODE === 'send' && !consentColumn") < src.indexOf('// ── controlled send ──'));
  ok('importar el script no lo ejecuta (sin red, sin envío)', calls.length === 0 || calls.every(c => !c.url.includes('resend')));
}

// ═══ 8 · Workspace: cuota en el cliente y SQL preparado ═════════════════════════
console.log('— 8 · Workspace');
{
  const app = read('app.js');
  const fnSrc = (name) => { const s = (name.startsWith('async ') ? '' : '') + 'function ' + name + '('; let i = app.indexOf('async function ' + name + '(');
    if (i < 0) i = app.indexOf('function ' + name + '('); let d = 0, st = false;
    for (let k = i; k < app.length; k++) { if (app[k] === '{') { d++; st = true; } else if (app[k] === '}') { d--; if (st && !d) return app.slice(i, k + 1); } } };
  const mk = (rows) => {
    const st = { states: [], upserts: [] };
    const sb = { TextEncoder, JSON, Infinity, st, _wsDocTableState: 'yes', _WS_DOC_TABLE: 'workspace_documents',
      _wsDocsSession: () => 'user-1', _wsCanPersist: () => true, _wsDocRows: () => rows,
      _wsDocSyncSet: (k, s) => st.states.push(s), _wsDocErrPermanent: () => false,
      supabaseClient: { from: () => ({ upsert: async (r) => { st.upserts.push(r); return { error: null }; } }) } };
    vm.createContext(sb);
    vm.runInContext(fnSrc('_wsDocsPush') + '\nthis.push=_wsDocsPush;', sb);
    return sb;
  };
  const small = { doc_id: 'a', body: { rows: [1, 2, 3] }, deleted_at: null };
  const big = { doc_id: 'b', body: { blob: 'x'.repeat(600 * 1024) }, deleted_at: null };
  const bigTomb = { doc_id: 'c', body: { blob: 'x'.repeat(600 * 1024) }, deleted_at: '2026-10-17T00:00:00Z' };
  let s = mk([small]); let out = await s.push('k');
  ok('positivo: documento normal se sube y queda «saved»', out === true && s.st.upserts.length === 1 && s.st.states.at(-1) === 'saved');
  s = mk([big]); out = await s.push('k');
  ok('negativo: documento > límite NO se sube y queda guardado en el dispositivo', out === false && s.st.upserts.length === 0 && s.st.states.at(-1) === 'local_only');
  s = mk([bigTomb]); await s.push('k');
  ok('borrar siempre está permitido: un tombstone se sube mida lo que mida', s.st.upserts.length === 1);
  s = mk([small, big]); await s.push('k');
  ok('mixto: sólo se sube lo que cabe', s.st.upserts.length === 1 && s.st.upserts[0].length === 1 && s.st.upserts[0][0].doc_id === 'a');
  s = mk([]); out = await s.push('k');
  ok('regresión: sin filas no cambia el estado (comportamiento previo)', out === false && s.st.states.length === 0);
  ok('límite del cliente por debajo del servidor (460 KB < 512 KB)', /const MAX_BODY_BYTES = 460 \* 1024;/.test(fnSrc('_wsDocsPush')) && 460 * 1024 < 524288);
  s = mk([{ doc_id: 'edge', body: { blob: 'x'.repeat(460 * 1024 - 11) }, deleted_at: null }]); await s.push('k');
  ok('límite exacto: un cuerpo de 460 KB justos se sube', s.st.upserts.length === 1);
  s = mk([{ doc_id: 'edge2', body: { blob: 'x'.repeat(460 * 1024 - 10) }, deleted_at: null }]); await s.push('k');
  ok('límite exacto: un byte por encima ya no se sube', s.st.upserts.length === 0);

  const Q = read('db/workspace_documents_quota_1.sql'), QR = read('db/workspace_documents_quota_1_rollback.sql');
  ok('SQL cuota: NO APLICADO desde el repo y transaccional', /NO APLICADO/.test(Q) && /^begin;/m.test(Q) && /^commit;/m.test(Q));
  ok('SQL cuota: CHECK NOT VALID (no toca datos existentes) y exime tombstones',
    /check \(deleted_at is not null or octet_length\(body::text\) <= 524288\) not valid/.test(Q));
  ok('SQL cuota: el upsert de un documento existente no cuenta como nuevo', /d\.doc_id <> new\.doc_id/.test(Q) && /d\.deleted_at is null/.test(Q));
  ok('SQL cuota: borrar exento en el trigger', /if new\.deleted_at is not null then\s+return new;/.test(Q));
  ok('SQL cuota: función no invocable por clientes', /revoke all on function public\.aurix_workspace_documents_quota\(\) from public, anon, authenticated/.test(Q));
  ok('SQL cuota: comprobación previa de solo lectura incluida', /COMPROBACIÓN PREVIA[\s\S]*max\(n\)/.test(Q));
  ok('SQL cuota: rollback retira trigger, función y CHECK', /drop trigger/.test(QR) && /drop function/.test(QR) && /drop constraint/.test(QR));
  const P = read('db/workspace_documents_premium_gate_1.sql');
  ok('SQL puerta Premium: marcada como decisión comercial, no activada', /DECISIÓN COMERCIAL[\s\S]{0,80}NO ACTIVADO/.test(P));
  ok('SQL puerta Premium: sólo documentos NUEVOS (reescribir/borrar lo propio nunca se bloquea)',
    /new\.deleted_at is not null/.test(P) && /if exists \(select 1 from public\.workspace_documents d\s+where d\.user_id = new\.user_id and d\.doc_id = new\.doc_id\)/.test(P) && /before insert on/.test(P));
  ok('SQL puerta Premium: mismo derecho que el cliente (intelligence.full)', /'intelligence\.full'/.test(P) && /hasAurixPremiumAccess\(\) \{\s*return hasFeature\('intelligence\.full'\)/.test(app.replace(/\r/g, '')) || /hasFeature\('intelligence\.full'\)/.test(app));
}

// ═══ 9 · Stripe: reembolsos, disputas, duplicados, orden ═══════════════════════
console.log('— 9 · Stripe (webhook real, fetch simulado)');
{
  const WH = read('api/billing/webhook.mjs');
  const body = WH.replace(/export\s+const\s+config\s*=/, 'module.config =')
    .replace(/export\s+default\s+async\s+function\s+handler/, 'module.handler = async function handler');
  const SECRET = 'whsec_test_v3_harness_secret';
  const LIVE_KEY = ['sk', 'live', 'harness000000000000000000000'].join('_');   // compuesto: nunca la forma literal
  async function sign(ts, payload) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function hook(event, opt) {
    const rpc = [];
    const sb = { module: {}, console: { log() {}, warn() {}, error() {} }, URL, URLSearchParams, TextEncoder, TextDecoder, crypto, Response, Request,
      JSON, Math, Number, String, Object, Array, Date, Set, Map, isFinite, Boolean, setTimeout, Promise, Error,
      process: { env: { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: LIVE_KEY, SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_URL: 'https://db.test' } },
      fetch: async (url, init) => { rpc.push({ url: String(url), body: JSON.parse((init && init.body) || '{}') });
        return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'recorded', data: [] }), text: async () => '' }; } };
    vm.createContext(sb); vm.runInContext(body, sb);
    const raw = JSON.stringify(event); const ts = Math.floor(Date.now() / 1000);
    const sig = (opt && opt.badSig) ? 'deadbeef'.repeat(8) : await sign(ts, raw);
    const res = await sb.module.handler(new Request('https://app.test/api/billing/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${ts},v1=${sig}` }, body: raw }));
    return { status: res.status, json: await res.json().catch(() => null), rpc };
  }
  const ev = (type, object, id, created) => ({ id: id || 'evt_' + type, type, livemode: true, created: created || Math.floor(Date.now() / 1000), data: { object } });
  const onlyRecord = (r) => r.rpc.length === 1 && /aurix_billing_record_payment_event/.test(r.rpc[0].url) && !r.rpc.some(c => /apply_event/.test(c.url));

  let r = await hook(ev('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', amount: 7999, amount_refunded: 2000, currency: 'eur' }));
  ok('reembolso PARCIAL: se registra en el ledger con el importe acumulado', onlyRecord(r) && r.rpc[0].body.p_amount === 2000 && r.rpc[0].body.p_charge_id === 'ch_1', JSON.stringify(r.rpc.map(c => c.body.p_amount)));
  r = await hook(ev('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', amount: 7999, amount_refunded: 7999, currency: 'eur' }, 'evt_refund_full'));
  ok('reembolso TOTAL: se registra; NO cancela la suscripción (sin regla comercial aprobada)', onlyRecord(r) && r.rpc[0].body.p_amount === 7999);
  r = await hook(ev('charge.dispute.created', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1', amount: 7999, status: 'needs_response' }));
  ok('disputa abierta: se registra con su estado; Premium no se toca automáticamente', onlyRecord(r) && r.rpc[0].body.p_dispute_id === 'dp_1' && r.rpc[0].body.p_status === 'needs_response');
  r = await hook(ev('charge.dispute.closed', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1', amount: 7999, status: 'lost' }));
  ok('disputa PERDIDA: queda registrada como lost (insumo del runbook manual)', onlyRecord(r) && r.rpc[0].body.p_status === 'lost');
  const dupA = await hook(ev('charge.refunded', { id: 'ch_2', payment_intent: 'pi_2', amount_refunded: 100 }, 'evt_dup'));
  const dupB = await hook(ev('charge.refunded', { id: 'ch_2', payment_intent: 'pi_2', amount_refunded: 100 }, 'evt_dup'));
  ok('duplicado: el mismo event.id llega idéntico al escritor (que deduplica en SQL)', dupA.rpc[0].body.p_event_id === 'evt_dup' && dupB.rpc[0].body.p_event_id === 'evt_dup');
  const PAY = read('db/billing_payments_1.sql');
  ok('duplicado: el escritor usa la inserción en billing_events como cerrojo idempotente',
    /insert into public\.billing_events \(provider, event_id, event_type, outcome, applied\)[\s\S]{0,120}on conflict \(provider, event_id\) do nothing/.test(PAY) && /'outcome', 'duplicate'/.test(PAY));
  const sub = (id, created, status) => ev('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status, current_period_start: 1, current_period_end: 2,
    cancel_at_period_end: false, items: { data: [{ price: { id: 'price_x' } }] } }, id, created);
  const newer = await hook(sub('evt_new', 2000000000, 'active'));
  const older = await hook(sub('evt_old', 1900000000, 'past_due'));
  ok('fuera de orden: cada evento viaja con SU instante (event.created), no con el de llegada',
    newer.rpc[0].body.p_event_at === new Date(2000000000 * 1000).toISOString() && older.rpc[0].body.p_event_at === new Date(1900000000 * 1000).toISOString(),
    newer.rpc[0].body.p_event_at + ' / ' + older.rpc[0].body.p_event_at);
  const SQL = read('db/monetization_m04_billing_stripe_1.sql');
  ok('fuera de orden: el escritor rechaza un evento anterior al último aplicado (guarda stale)',
    /last_event_at/.test(SQL) && /'stale'/.test(SQL) && /v_at = v_prev\.last_event_at and v_prev_rank is not null[\s\S]{0,60}v_rank < v_prev_rank/.test(SQL));
  r = await hook(ev('charge.refunded', { id: 'ch_3', amount_refunded: 1 }), { badSig: true });
  ok('firma inválida: 400 y ni una escritura', r.status === 400 && r.rpc.length === 0);
  ok('runbook de disputas y reembolsos documentado', /DISPUTAS Y REEMBOLSOS/.test(read('docs/AURIX-SECURITY-V3-RUNBOOK.md')));
}

// ═══ 10 · Frontend: librerías propias, CSP, publicación ═════════════════════════
console.log('— 10 · Frontend y publicación');
{
  const crypto_ = require('crypto');
  const sri = f => 'sha384-' + crypto_.createHash('sha384').update(fs.readFileSync(path.join(root, f))).digest('base64');
  const VENDOR = ['vendor/chart.js-4.5.1/chart.umd.min.js', 'vendor/lightweight-charts-4.2.0/lightweight-charts.standalone.production.js', 'vendor/supabase-js-2.108.0/supabase.js'];
  for (const page of ['index.html', 'login.html', 'reset.html']) {
    const h = read(page);
    ok(page + ': ningún <script> de jsDelivr', !/<script[^>]+src="https:\/\/cdn\.jsdelivr\.net/.test(h));
    const csp = (h.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
    ok(page + ': script-src sin jsDelivr (sigue sin unsafe-eval)', /script-src 'self' 'unsafe-inline';/.test(csp) && !/unsafe-eval/.test(csp), csp.slice(0, 120));
    for (const v of VENDOR) {
      if (!h.includes(v)) continue;
      ok(page + ': ' + path.basename(v) + ' con integridad que coincide con el fichero', h.includes(`src="${v}" integrity="${sri(v)}"`));
    }
  }
  const idx = read('index.html');
  ok('index.html: las tres librerías, mismas versiones que antes', VENDOR.every(v => idx.includes(v)));
  ok('login/reset: supabase-js 2.108.0 propio', read('login.html').includes(VENDOR[2]) && read('reset.html').includes(VENDOR[2]));
  ok('versiones intactas (cabeceras de los ficheros)', /Chart\.js v4\.5\.1/.test(read(VENDOR[0]).slice(0, 400)) && /4\.2\.0/.test(read(VENDOR[1]).slice(0, 400)));
  const BS = read('scripts/aurix-build-site.mjs');
  ok('Pages publica vendor/ y nunca Markdown', /'vendor'\]/.test(BS) && /filter: SKIP_IN_DIRS/.test(BS) && /walkMd/.test(BS));
  // Los iconos cripto son <img> de jsDelivr: quitarlo de script-src no puede tocar img-src.
  const idxCsp = (idx.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  const imgSrc = (idxCsp.match(/img-src([^;]*)/) || [])[1] || '';
  const prodIdx = require('child_process').execFileSync('git', ['show', '50dce0d:index.html'], { cwd: root, encoding: 'utf8' });
  const prodImg = ((prodIdx.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '').match(/img-src([^;]*)/)[1];
  ok('regresión: img-src idéntico al de producción (iconos cripto intactos)', imgSrc === prodImg, imgSrc);
}

// ═══ 11 · CI y secretos ═════════════════════════════════════════════════════════
console.log('— 11 · CI y secretos');
{
  const Y = read('.github/workflows/pages.yml');
  const top = Y.split(/\njobs:\n/)[0].split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  ok('workflow: a nivel global sólo contents: read', /permissions:\n  contents: read\n/.test(top) && !/pages: write/.test(top) && !/id-token/.test(top));
  const gate = Y.slice(Y.indexOf('  gate:'), Y.indexOf('  deploy:')), deploy = Y.slice(Y.indexOf('  deploy:'));
  ok('job gate: sin permisos de publicación', /permissions:\n      contents: read\n/.test(gate) && !/pages: write/.test(gate));
  ok('job deploy: pages + id-token sólo aquí', /pages: write/.test(deploy) && /id-token: write/.test(deploy));
  ok('acciones fijadas por SHA', (Y.match(/uses: [^\n]+/g) || []).every(u => /@[0-9a-f]{40}\b/.test(u)));
  ok('gate: escaneo de secretos ANTES de la certificación', Y.indexOf('aurix-secret-scan.mjs') > 0 && Y.indexOf('aurix-secret-scan.mjs') < Y.indexOf('aurix-ci-gate.mjs'));
  const ss = await load('scripts/aurix-secret-scan.mjs');
  const fake = { stripe: ['sk', 'live', 'Z'.repeat(24)].join('_'), whsec: 'whsec_' + 'A1'.repeat(16),
    ghp: 'ghp_' + 'a'.repeat(36), assign: "const TWELVE_API_KEY = '" + 'f0'.repeat(16) + "';" };
  const jwt = (role) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'c2lnbmF0dXJlc2ln'].join('.');
  const hits = ss.scanText([fake.stripe, fake.whsec, fake.ghp, fake.assign, jwt('service_role')].join('\n'), 'x');
  ok('escáner: detecta Stripe, webhook, GitHub, clave asignada y JWT service_role',
    ['stripe_secret_key', 'stripe_webhook_secret', 'github_token', 'hardcoded_api_key', 'supabase_service_role_jwt'].every(k => hits.some(h => h.kind === k)), hits.map(h => h.kind).join(','));
  ok('escáner: nunca devuelve el secreto (sólo 4 caracteres)', hits.every(h => h.preview.length <= 5));
  const clean = ss.scanText(['whsec_test_m04_aurix_secret', "SUPABASE_SERVICE_ROLE_KEY: 'service-key'", jwt('anon'), "const SUPABASE_ANON_KEY = 'sb_publishable_x';"].join('\n'), 'y');
  ok('escáner: fixtures de harness, JWT anon y clave publicable NO son hallazgos', clean.length === 0, clean.map(h => h.kind).join(','));
  const R = read('docs/AURIX-SECURITY-V3-RUNBOOK.md');
  ok('runbook: rotación manual de Twelve Data documentada sin mostrar claves', /TWELVE DATA/.test(R) && !/[0-9a-f]{32}/.test(R));
}

// ═══ 12 · Funciones de Vercel: el techo no se mueve ═════════════════════════════
console.log('— 12 · Vercel');
{
  const fns = [];
  (function walk(d) { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const rel = d + '/' + e.name;
    if (e.isDirectory()) { if (!e.name.startsWith('_')) walk(rel); }
    else if (/\.(js|mjs|ts)$/.test(e.name) && !e.name.startsWith('_')) fns.push(rel); } })('api');
  ok('api/: siguen siendo 13 funciones (12 + 1 Edge); el helper nuevo lleva prefijo _', fns.length === 13 && fs.existsSync(path.join(root, 'api/_abuse-guard.js')), fns.length);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FALLARON: ' + failed.join(' · ')); process.exit(1); }
})().catch(e => { console.error('HARNESS CRASH', e); process.exit(1); });
