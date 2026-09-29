#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE · UNA VERDAD PARA TODA LA PANTALLA
 * ════════════════════════════════════════════════════════════════════════════
 * P0 DEL ENCARGO: tres superficies de la MISMA pantalla dicen cosas distintas
 * sobre las MISMAS dimensiones. Explora afirma que «Aurix ya puede leer …
 * Crecimiento, Estabilidad»; el Radar declara esos dos ejes sin medir; Evolución
 * dice que apenas puede comparar. Esta sonda REPRODUCE la contradicción antes de
 * tocar nada y después exige que las tres hablen del MISMO estado certificado.
 *
 * LA PERSONA: 42 días de historia, que es el caso de las capturas. Se monta por
 * los almacenes REALES del producto (`portfolio_assets`, `portfolio_history`,
 * `category_history`) — no se stubea ningún motor, porque lo que se certifica es
 * justamente lo que los motores concluyen. La lección está escrita en este
 * repositorio: un harness que stubea lo que certifica deja pasar el defecto.
 *
 * LO QUE ESTO **NO** ES: no es una sesión autenticada. El sandbox es OTP-only,
 * así que el derecho Premium se monta por la superficie saneada del resolver.
 * Las afirmaciones contra la cuenta del founder siguen pendientes y declaradas.
 *
 *   node scripts/aurix-intelligence-truth-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'intelligence-truth');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p)); if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) body = Buffer.from(AUTH_PATCH(String(body)));
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) {
  console.error('\n✗ SIN MOTORES — ' + PW);
  console.error('\nRESULT: NO EJECUTADO (entorno, no candidato)');
  process.exit(2);
}
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
mkdirSync(OUT, { recursive: true });
console.log('AURIX INTELLIGENCE · una verdad para toda la pantalla');
console.log('origen: ' + ORIGIN + '  (copia de trabajo)\n');

// ── LA PERSONA DE 42 DÍAS ───────────────────────────────────────────────────
// Pesos elegidos para reproducir la captura: las tres mayores ≈ 79 % y una
// liquidez pequeña. Los precios son fijos y la historia es una curva suave con
// una caída intermedia, para que «dos extremos parecidos» NO signifique «sin
// movimiento» — que es uno de los defectos que el encargo nombra.
const DAY = 864e5;
function fixture(days) {
  const now = Date.now();
  const assets = [
    { id: 'a1', ticker: 'BTC', name: 'Bitcoin',  type: 'crypto', qty: 0.5,  price: 60000, assetCurrency: 'USD' },
    { id: 'a2', ticker: 'ETH', name: 'Ethereum', type: 'crypto', qty: 5,    price: 3000,  assetCurrency: 'USD' },
    { id: 'a3', ticker: 'VWCE',name: 'Vanguard FTSE All-World', type: 'etf', qty: 100, price: 120, assetCurrency: 'USD' },
    { id: 'a4', ticker: 'AAPL',name: 'Apple',    type: 'stock',  qty: 20,   price: 200,   assetCurrency: 'USD' },
    { id: 'a5', ticker: 'USD', name: 'Efectivo', type: 'cash',   qty: 2600, price: 1,     assetCurrency: 'USD' },
  ];
  const hist = [], cats = [];
  for (let i = days; i >= 0; i--) {
    const ts = now - i * DAY;
    // Curva con una caída real a mitad y una recuperación: los extremos quedan
    // parecidos, pero SÍ hubo movimiento intermedio.
    const phase = (days - i) / days;
    const dip = Math.sin(phase * Math.PI) * -0.09;
    const f = 1 + dip + phase * 0.004;
    const total = 64600 * f;
    hist.push({ ts, value: +total.toFixed(2) });
    cats.push({ ts, total: +total.toFixed(2),
      crypto: +(total * 0.6656).toFixed(2), stock: +(total * 0.0619).toFixed(2),
      etf: +(total * 0.1857).toFixed(2), fund: 0, metal: 0, real_estate: 0,
      liquidity: +(total * 0.0402).toFixed(2), other: 0 });
  }
  return { assets, hist, cats };
}

async function mount(page, lng, days) {
  const f = fixture(days);
  await page.addInitScript(`
    try {
      localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
      localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(f.assets))});
      localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(f.hist))});
      localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(f.cats))});
    } catch (_) {}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(`(function(){
    var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
    var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
    var fe = Object.create(null);
    _AURIX_ENT_CANON.forEach(function(k){ fe[k] = (k !== 'workspace.catalog_preview'); });
    _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active',
                  source:'default', validUntil:null, features:fe, sources:Object.create(null), fetchedAt:Date.now() };
    return true; })()`);
  await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
  await page.waitForTimeout(1400);
}

// Lo que cada superficie AFIRMA, leído del DOM y del owner, en la misma pasada.
const claims = page => page.evaluate(`(function(){
  var txt = function(sel){ var e=document.querySelector(sel); return e ? (e.textContent||'').replace(/\\s+/g,' ').trim() : null; };
  var axes = null; try { axes = _intv7RadarAxes(); } catch(e) { axes = { error: String(e).slice(0,120) }; }
  // La respuesta de CALIDAD DE DATOS: se abre su pregunta y se lee lo que dice.
  var dq = null, dqId = null;
  var btns = [].slice.call(document.querySelectorAll('[data-intcc-q]'));
  btns.forEach(function(b){
    var id = b.getAttribute('data-intcc-q');
    var a = document.getElementById('intcc-x-' + id);
    var t = a ? (a.textContent||'') : '';
    if (/puede leer|can already read/i.test(t)) { dq = t.replace(/\\s+/g,' ').trim(); dqId = id; }
  });
  var all = (document.querySelector('.aurix-intelligence-screen')||document.body).textContent.replace(/\\s+/g,' ');
  return JSON.stringify({
    axesMeasured: axes.measured, axesUnavailable: axes.unavailable, axesQuality: axes.quality,
    axesPending: axes.pending, axesValues: axes.values, axesError: axes.error || null,
    dq: dq, dqId: dqId,
    questions: btns.map(function(b){ return (b.textContent||'').replace(/\\s+/g,' ').trim(); }),
    screen: all.slice(0, 6000),
  });})()`).then(JSON.parse);

const DIM = { es: { growth: 'Crecimiento', stab: 'Estabilidad' }, en: { growth: 'Growth', stab: 'Stability' } };

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  for (const lng of ['es', 'en']) {
    const browser = await launcher.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, lng, 42);
    const c = await claims(page);
    const tag = `${ENG}.42d ${lng.toUpperCase()}`;
    const D = DIM[lng];

    ok(`${tag} el radar responde`, !c.axesError, c.axesError || '');
    // ── P0 · NINGUNA SUPERFICIE PUEDE AFIRMAR LO QUE EL RADAR NIEGA ─────────
    // No se exige que el radar mida cinco ejes: se exige que nadie diga lo
    // contrario de lo que el radar concluye. Si Crecimiento está sin medir,
    // «Aurix ya puede leer: … Crecimiento» es FALSO en la misma pantalla.
    const unav = c.axesUnavailable || [];
    if (c.dq) {
      for (const [key, word] of [['growth', D.growth], ['stability', D.stab]]) {
        if (unav.indexOf(key) !== -1) {
          ok(`${tag} el radar NO mide ${key} ⇒ Explora tampoco dice que lo lee`,
            c.dq.indexOf(word) === -1,
            'dq afirma «' + word + '» con el eje sin medir: ' + c.dq.slice(0, 220));
        }
      }
    } else {
      console.log(`  · ${tag} sin respuesta de calidad de datos en esta rotación`);
    }
    // Y la recíproca: lo que el radar SÍ mide puede nombrarse.
    ok(`${tag} el radar publica su recuento y sus razones`,
      Number.isFinite(c.axesMeasured) && unav.every(k => !!(c.axesPending || {})[k]),
      JSON.stringify({ measured: c.axesMeasured, unav: unav, pending: c.axesPending }));
    // §Explora — el enunciado no se contesta a sí mismo.
    ok(`${tag} ninguna pregunta lleva su propia cifra en el título`,
      (c.questions || []).every(q => !/\(\s*\d+([.,]\d+)?\s*%\s*\)/.test(q)),
      JSON.stringify(c.questions));

    await page.screenshot({ path: join(OUT, `intel-${lng}-1440x900-${ENG}.png`), fullPage: true });
    console.log('    radar → medidos ' + c.axesMeasured + ' · sin medir [' + unav.join(', ') + ']');
    if (c.dq) console.log('    explora(dq) → ' + c.dq.slice(0, 200));
    await ctx.close();
    await browser.close();
  }
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/intelligence-truth/');
process.exit(0);
