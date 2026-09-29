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
  // DETERMINISTA, sin depender de la rotación: se le pregunta AL OWNER qué
  // dimensiones dice que se leen, y se contrasta con lo que el radar certifica.
  // La pregunta de calidad de datos sólo sale cuatro de cada N veces; el defecto
  // que se persigue vive en el owner, así que se mide ahí.
  // ── GEOMETRÍA: lo que el encargo manda medir ────────────────────────────
  var R = function(e){ if(!e) return null; var r=e.getBoundingClientRect();
    return { t:Math.round(r.top), l:Math.round(r.left), w:Math.round(r.width),
             h:Math.round(r.height), b:Math.round(r.bottom), r:Math.round(r.right) }; };
  var scr = document.querySelector('.aurix-intelligence-screen') || document.body;
  // 1 · RÓTULOS DEL RADAR: ninguno puede partirse letra a letra. Se detecta por
  //     ANCHO DE LÍNEA: si la caja es tan estrecha que cabe ~un carácter, el
  //     navegador está partiendo la palabra. Y se mide el desbordamiento real.
  var labs = [].slice.call(document.querySelectorAll('.intcc-radar-vlabel .intcc-radar-label'));
  var labInfo = labs.map(function(e){
    var cs = getComputedStyle(e); var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    var b = e.getBoundingClientRect();
    return { txt:(e.textContent||'').trim(), w:Math.round(b.width), h:Math.round(b.height),
             lines: Math.max(1, Math.round(b.height / lh)), fs: parseFloat(cs.fontSize),
             overflow: e.scrollWidth > e.clientWidth + 1,
             wrap: cs.overflowWrap || cs.wordWrap };
  });
  // 2 · ¿SE SALE ALGÚN RÓTULO DE LA TARJETA DEL RADAR?
  var radarCard = document.querySelector('.intv7-radar');
  var rc = R(radarCard);
  var labOut = rc ? labs.some(function(e){ var b=e.getBoundingClientRect();
    return b.left < rc.l - 1 || b.right > rc.r + 1 || b.top < rc.t - 1 || b.bottom > rc.b + 1; }) : null;
  // 3 · ORDEN DE SECCIONES, por su posición real en el documento.
  var SEL = [['hero','.intcc-m-hero, .intv4-hero, .intcc-hero'],['health','.intcc-m-health, .intv17-health'],
             ['drivers','.intv5-drivers, .intcc-drivers'],['explore','.intcc-explore'],
             ['radar','.intv7-radar'],['today','.intv5-matters, .intv4-brief'],
             ['evolution','.intv4-memory, .intv15-evolution'],['changed','.intv4-changed'],
             ['comparator','.intcc-cmp, .intv4-cmp']];
  // SOLO LO QUE SE VE. Un nodo con display:none devuelve una caja de ceros y se
  // colaba como «la primera sección de la pantalla»: a 768 px la card de Salud
  // de móvil está oculta —Salud vive dentro del hero— y el orden salía invertido
  // por un elemento que nadie ve. Medir lo invisible es medir otra pantalla.
  var vis = function(e){ if(!e) return false; var b=e.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    var cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  var order = SEL.map(function(p){
    var cand = [].slice.call(document.querySelectorAll(p[1])).filter(vis);
    var e = cand[0];
    return e ? { k:p[0], t:Math.round(e.getBoundingClientRect().top + (window.scrollY||0)), box:R(e) } : null;
  }).filter(Boolean).sort(function(a,b){ return a.t - b.t; });
  // 4 · DESBORDE HORIZONTAL DE PÁGINA y recortes.
  var doc = document.documentElement;
  var hscroll = doc.scrollWidth > doc.clientWidth + 1;
  // 5 · «HOY» vs «EVOLUCIÓN»: altura muerta. Se compara la altura de la tarjeta
  //     con la de su CONTENIDO real; una card muy alta con poco dentro es el
  //     defecto que el encargo nombra.
  var fill = function(sel){ var c=document.querySelector(sel); if(!c) return null;
    var kids=[].slice.call(c.children); if(!kids.length) return null;
    var top=Math.min.apply(null,kids.map(function(k){return k.getBoundingClientRect().top;}));
    var bot=Math.max.apply(null,kids.map(function(k){return k.getBoundingClientRect().bottom;}));
    var cb=c.getBoundingClientRect();
    return { h:Math.round(cb.height), content:Math.round(bot-top), dead:Math.round(cb.height-(bot-top)) }; };
  var readable = null;
  try { readable = _intv16ReadableDims(); } catch(e) { readable = { error: String(e).slice(0,120) }; }
  var labels = {};
  try { axes.dims.forEach(function(d){ labels[d.key] = d.label; }); } catch(_) {}
  return JSON.stringify({
    axesMeasured: axes.measured, axesUnavailable: axes.unavailable, axesQuality: axes.quality,
    axesPending: axes.pending, axesValues: axes.values, axesError: axes.error || null,
    readable: readable, labels: labels,
    labInfo: labInfo, labOut: labOut, radarCard: rc,
    order: order.map(function(o){ return o.k; }), orderBoxes: order,
    hscroll: hscroll,
    today: fill('.intv5-matters, .intv4-brief'), evolution: fill('.intv4-memory, .intv15-evolution'),
    pendingLine: (document.querySelector('.intv7-radar-pending')||{}).textContent || null,
    heroSub: (document.querySelector('.intcc-hero-sub, .intv4-hero-sub, .intcc-m-hero-sub')||{}).textContent || '',
    todayEmpty: (document.querySelector('.intv5-matters .intcc-empty-body, .intv4-brief .intcc-empty-body')||{}).textContent || '',
    todayEmptyKey: (document.querySelector('.intv5-matters, .intv4-brief')||{}).getAttribute
      ? (document.querySelector('.intv5-matters, .intv4-brief')||{}).getAttribute('data-empty-state') : null,
    heroChips: [].slice.call(document.querySelectorAll('.intcc-chip')).map(function(e){ return (e.textContent||'').trim(); }),
    dq: dq, dqId: dqId,
    questions: btns.map(function(b){ return (b.textContent||'').replace(/\\s+/g,' ').trim(); }),
    screen: all.slice(0, 6000),
  });})()`).then(JSON.parse);

const DIM = { es: { growth: 'Crecimiento', stab: 'Estabilidad' }, en: { growth: 'Growth', stab: 'Stability' } };

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  for (const lng of ['es', 'en']) {
    const browser = await launcher.launch();
    const VP = process.env.AURIX_INTEL_VP ? process.env.AURIX_INTEL_VP.split('x').map(Number) : [1440, 900];
    const ctx = await browser.newContext({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: VP[0] < 700 ? 2 : 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await mount(page, lng, 42);
    const c = await claims(page);
    const tag = `${ENG}.42d ${lng.toUpperCase()}`;
    const D = DIM[lng];

    ok(`${tag} el radar responde`, !c.axesError, c.axesError || '');
    // ── P0 · EL OWNER, MEDIDO SIEMPRE ──────────────────────────────────────
    // Lo que Explora dice que Aurix «ya puede leer» tiene que ser EXACTAMENTE
    // lo que el radar certifica. Ni más (afirmaría lo que no mide) ni menos
    // (se callaría lo que sí).
    const measuredLabels = Object.keys(c.labels || {})
      .filter(k => (c.axesUnavailable || []).indexOf(k) === -1)
      .map(k => c.labels[k]).sort();
    const readableSorted = Array.isArray(c.readable) ? c.readable.slice().sort() : null;
    ok(`${tag} «Aurix ya puede leer» = exactamente los ejes que el radar certifica`,
      readableSorted !== null &&
      JSON.stringify(readableSorted) === JSON.stringify(measuredLabels),
      JSON.stringify({ readable: readableSorted, medidos: measuredLabels }));
    // Y la comprobación que nombra el defecto original, por si alguien
    // reintrodujera un mapa paralelo: ningún eje SIN MEDIR puede aparecer.
    const unavailLabels = (c.axesUnavailable || []).map(k => (c.labels || {})[k]).filter(Boolean);
    ok(`${tag} ningún eje sin medir se anuncia como legible`,
      Array.isArray(c.readable) && unavailLabels.every(l => c.readable.indexOf(l) === -1),
      JSON.stringify({ readable: c.readable, sinMedir: unavailLabels }));
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

    // ── §RADAR · LOS NOMBRES NO SE PARTEN ──────────────────────────────────
    // El defecto de la captura era «Ampl / itud / de / cate / goría / s». Se mide
    // por ANCHO y por número de líneas: una caja de rótulo tan estrecha que el
    // nombre ocupa más de tres líneas está partiendo la palabra.
    ok(`${tag} los cinco ejes se rotulan junto a su vértice`,
      (c.labInfo || []).length === 5, JSON.stringify((c.labInfo || []).map(x => x.txt)));
    // El defecto es PARTIR UNA PALABRA, no «ser estrecho»: «Growth» cabe en 39 px
    // en una línea y eso es correcto. Con `overflow-wrap: normal` el navegador no
    // puede partir dentro de una palabra —si no cabe, DESBORDA—, así que el
    // detector honesto es desbordamiento + número de líneas, no un ancho mínimo.
    ok(`${tag} ningún rótulo del radar se parte letra a letra`,
      (c.labInfo || []).every(x => x.lines <= 3 && !x.overflow),
      JSON.stringify((c.labInfo || []).filter(x => !(x.lines <= 3 && !x.overflow))));
    ok(`${tag} ningún rótulo usa una regla que autorice partir palabra`,
      (c.labInfo || []).every(x => x.wrap !== 'anywhere' && x.wrap !== 'break-word'),
      JSON.stringify((c.labInfo || []).map(x => x.wrap)));
    ok(`${tag} y ninguno se sale de la tarjeta del radar`,
      c.labOut === false, JSON.stringify({ card: c.radarCard }));
    ok(`${tag} los rótulos respetan el suelo de 11 px`,
      (c.labInfo || []).every(x => x.fs >= 11), JSON.stringify((c.labInfo || []).map(x => x.fs)));
    // ── §P0 · EL HERO Y «HOY» NO PUEDEN DESMENTIRSE ────────────────────────
    // Si el hero anuncia que N cambios merecen revisión, «Lo que importa hoy» no
    // puede decir que no hay ninguno. Puede estar VACÍA —lo relevante vive en
    // «Qué ha cambiado»— pero entonces lo dice, no lo niega.
    {
      const heroClaimsChange = /\d/.test(c.heroSub || '') && !/^\s*0\b/.test(c.heroSub || '');
      const todayDenies = /no hay ning[úu]n cambio|nothing in your wealth worth/i.test(c.todayEmpty || '');
      ok(`${tag} si el hero cuenta un cambio, «Hoy» no lo niega`,
        !(heroClaimsChange && todayDenies),
        JSON.stringify({ hero: (c.heroSub || '').trim().slice(0, 80),
                         hoy: (c.todayEmpty || '').trim().slice(0, 80), key: c.todayEmptyKey }));
    }
    // ── §DISEÑO · ORDEN Y DESBORDE ─────────────────────────────────────────
    ok(`${tag} sin desborde horizontal de página`, c.hscroll === false);
    // El orden que el encargo fija para móvil. En escritorio la rejilla reordena
    // por filas, así que sólo se exige en una columna.
    if (VP[0] < 1024) {
      const want = ['hero', 'health', 'drivers', 'explore', 'radar', 'today', 'evolution', 'changed'];
      // DOS SECCIONES EN LA MISMA FILA NO TIENEN ORDEN VERTICAL. A 768 px el hero
      // ya coloca Salud e Inteligencia lado a lado —que es la composición que el
      // encargo pide para escritorio— y ordenarlas por `top` daba un falso
      // positivo: sus cajas se solapan casi por completo. Se comparan sólo las
      // que están REALMENTE una debajo de otra.
      const boxes = (c.orderBoxes || []).filter(o => want.indexOf(o.k) !== -1);
      const sameRow = (a, b) => {
        const ov = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
        return ov > 0.5 * Math.min(a.box.h, b.box.h);
      };
      const bad = [];
      for (let i = 0; i < boxes.length - 1; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (sameRow(boxes[i], boxes[j])) continue;
          const oi = want.indexOf(boxes[i].k), oj = want.indexOf(boxes[j].k);
          const above = boxes[i].box.t <= boxes[j].box.t;
          if (above !== (oi < oj)) bad.push(boxes[i].k + ' vs ' + boxes[j].k);
        }
      }
      ok(`${tag} orden: ${want.join(' → ')}`, bad.length === 0,
        JSON.stringify({ bad, got: (c.order || []) }));
    }
    // ── §DISEÑO · ALTURA SEGÚN CONTENIDO ───────────────────────────────────
    // «Hoy» no puede ser una card alta medio vacía. Se mide el hueco muerto: la
    // diferencia entre la caja y lo que hay dentro.
    if (c.today) {
      ok(`${tag} «Hoy» no reserva altura muerta`, c.today.dead <= 48,
        JSON.stringify(c.today));
    }
    await page.screenshot({ path: join(OUT, `intel-${lng}-${VP[0]}x${VP[1]}-${ENG}.png`), fullPage: true });
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
