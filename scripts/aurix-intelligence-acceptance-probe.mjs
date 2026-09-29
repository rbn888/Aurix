#!/usr/bin/env node
/**
 * AURIX INTELLIGENCE · LAS DOS PERSONAS DE LAS CAPTURAS DE PRODUCCIÓN
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE. Las sondas anteriores estaban verdes y producción seguía
 * enseñando un radar roto: certificaban un estado que la cuenta real no tiene.
 * La diferencia no era el código, era la FIXTURE — 43 puntos diarios limpios
 * frente a una cuenta con 43 días de EDAD y muy pocas observaciones utilizables.
 * Aquí se reproducen los dos estados observados, con sus pesos reales, y se
 * exige lo que el encargo pide para cada uno.
 *
 * LAS DOS PERSONAS, con las cifras de las capturas:
 *   A · Microsoft 31 %, Bitcoin 25 %, Apple 20 % · amplitud 2,3/7 · liquidez 7 %
 *   B · Bitcoin 49 %, Ethereum 24 %, Ondo 5 %    · amplitud 1,3/7 · liquidez 4 %
 * La amplitud es 1/HHI sobre las siete categorías, así que los pesos por
 * CATEGORÍA están elegidos para que el motor produzca esas cifras solo — no se
 * inyecta ningún 2,3 ni ningún 1,3.
 *
 * Y CADA UNA EN DOS ESTADOS DE HISTORIA, que es lo que distingue un radar
 * completo de uno que no puede estarlo:
 *   · `sparse` — 43 días de EDAD y pocas observaciones. Es lo que las capturas
 *     muestran. Aquí el encargo PROHÍBE la figura cuantitativa parcial.
 *   · `dense`  — 43 días con observación diaria. Aquí el encargo EXIGE cinco
 *     ejes, cinco marcadores y una sola línea cerrada.
 *
 * Se alimentan los MISMOS almacenes que consume producción y no se stubea
 * ningún motor: lo que se certifica es lo que los motores concluyen.
 *
 *   node scripts/aurix-intelligence-acceptance-probe.mjs
 *   AURIX_INTEL_VP=390x844 node scripts/aurix-intelligence-acceptance-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'intelligence-acceptance');
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
catch (e) { console.error('\n✗ SIN MOTORES\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const DAY = 864e5;
// Pesos por CATEGORÍA elegidos para que 1/HHI dé la amplitud observada.
//   A: stock .60 · crypto .25 · etf .08 · liquidez .07  → 1/ΣW² = 2,30
//   B: crypto .87 · etf .09 · liquidez .04              → 1/ΣW² = 1,30
const PERSONAS = {
  A: { breadth: 2.3, top1: 31, cash: 7, label: 'founder/escritorio',
       assets: [
         { id: 'A1', ticker: 'MSFT', name: 'Microsoft', type: 'stock',  qty: 31, price: 100, assetCurrency: 'USD' },
         { id: 'A2', ticker: 'BTC',  name: 'Bitcoin',   type: 'crypto', qty: 25, price: 100, assetCurrency: 'USD' },
         { id: 'A3', ticker: 'AAPL', name: 'Apple',     type: 'stock',  qty: 20, price: 100, assetCurrency: 'USD' },
         { id: 'A4', ticker: 'NVDA', name: 'Nvidia',    type: 'stock',  qty:  9, price: 100, assetCurrency: 'USD' },
         { id: 'A5', ticker: 'VWCE', name: 'Vanguard FTSE All-World', type: 'etf', qty: 8, price: 100, assetCurrency: 'USD' },
         { id: 'A6', ticker: 'USD',  name: 'Efectivo',  type: 'cash',   qty: 700, price: 1,  assetCurrency: 'USD' },
       ],
       cats: { stock: 0.60, crypto: 0.25, etf: 0.08, liquidity: 0.07 } },
  B: { breadth: 1.3, top1: 49, cash: 4, label: 'móvil',
       assets: [
         { id: 'B1', ticker: 'BTC',  name: 'Bitcoin',  type: 'crypto', qty: 49, price: 100, assetCurrency: 'USD' },
         { id: 'B2', ticker: 'ETH',  name: 'Ethereum', type: 'crypto', qty: 24, price: 100, assetCurrency: 'USD' },
         { id: 'B3', ticker: 'SOL',  name: 'Solana',   type: 'crypto', qty:  9, price: 100, assetCurrency: 'USD' },
         { id: 'B4', ticker: 'ONDO', name: 'Ondo',     type: 'crypto', qty:  5, price: 100, assetCurrency: 'USD' },
         { id: 'B5', ticker: 'VWCE', name: 'Vanguard FTSE All-World', type: 'etf', qty: 9, price: 100, assetCurrency: 'USD' },
         { id: 'B6', ticker: 'USD',  name: 'Efectivo', type: 'cash',   qty: 400, price: 1,  assetCurrency: 'USD' },
       ],
       cats: { crypto: 0.87, etf: 0.09, liquidity: 0.04 } },
};
// `sparse` reproduce la captura: 43 días de EDAD con pocas observaciones.
// `dense` es la misma cuenta con observación diaria: evidencia suficiente.
function history(kind, cats, days = 43) {
  const now = Date.now(), hist = [], catRows = [];
  const n = (kind === 'dense') ? days + 1 : 4;
  for (let i = 0; i < n; i++) {
    const frac = (n === 1) ? 1 : i / (n - 1);
    const ts = now - (days - frac * days) * DAY;
    const drift = 1 + 0.05 * frac + Math.sin(frac * Math.PI) * -0.04;
    const total = 100000 * drift;
    hist.push({ ts: Math.round(ts), value: +total.toFixed(2) });
    const row = { ts: Math.round(ts), total: +total.toFixed(2), crypto: 0, stock: 0, etf: 0,
                  fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
    Object.keys(cats).forEach(k => { row[k] = +(total * cats[k]).toFixed(2); });
    catRows.push(row);
  }
  return { hist, catRows };
}
const OWNER = 'probe-acceptance';
const persona = (owner) => `(function(){
  var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
  var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
  var fe=Object.create(null);
  _AURIX_ENT_CANON.forEach(function(k){ fe[k]=(k!=='workspace.catalog_preview'); });
  _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',
             source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
  try { _aurixActiveUserId = ${JSON.stringify(owner)}; _aurixStampCacheOwner(); } catch(_) {}
  return true; })()`;

async function mount(page, who, kind, lng) {
  const P = PERSONAS[who];
  const h = history(kind, P.cats);
  await page.addInitScript(`try{
    localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(P.assets))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(h.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(h.catRows))});
  }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(persona(OWNER));
  await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
  await page.waitForTimeout(1400);
}

const read = page => page.evaluate(`(function(){
  var vis=function(e){ if(!e) return false; var b=e.getBoundingClientRect(); var cs=getComputedStyle(e);
    return b.width>0 && b.height>0 && cs.display!=='none' && cs.visibility!=='hidden'; };
  var pick=function(s){ return [].slice.call(document.querySelectorAll(s)).filter(vis)[0]||null; };
  var R=function(e){ if(!e) return null; var r=e.getBoundingClientRect();
    return { t:Math.round(r.top+(window.scrollY||0)), l:Math.round(r.left), w:Math.round(r.width),
             h:Math.round(r.height), b:Math.round(r.bottom+(window.scrollY||0)), r:Math.round(r.right) }; };
  var axes=null; try { axes=_intv7RadarAxes(); } catch(e){ axes={error:String(e).slice(0,120)}; }
  var svg=document.querySelector('.intv7-radar .intcc-radar-svg');
  var card=pick('.intv7-radar');
  var health=pick('.intcc-m-health, .intv17-health');
  var hb=health?health.getBoundingClientRect():null;
  var hkids=health?[].slice.call(health.children):[];
  var htop=hkids.length?Math.min.apply(null,hkids.map(function(k){return k.getBoundingClientRect().top;})):0;
  var hbot=hkids.length?Math.max.apply(null,hkids.map(function(k){return k.getBoundingClientRect().bottom;})):0;
  var txtOf=function(s){ var e=pick(s); return e?(e.textContent||'').replace(/\\\\s+/g,' ').trim():''; };
  var today=txtOf('.intv5-matters, .intv4-brief');
  var changed=txtOf('.intv4-changed');
  var evo=txtOf('.intv4-memory, .intv15-evolution');
  return JSON.stringify({
    axes: { measured: axes.measured, unavailable: axes.unavailable, values: axes.values,
            display: axes.display, error: axes.error||null },
    svgDots: svg?svg.querySelectorAll('.intcc-radar-dot').length:null,
    svgVerts: svg?(function(){ var a=svg.querySelector('.intcc-radar-area');
      if(!a) return 0; var p=(a.getAttribute('points')||'').trim();
      return p?p.split(/\\s+/).filter(Boolean).length:0; })():null,
    svgFill: svg?(function(){ var a=svg.querySelector('.intcc-radar-area');
      return a?getComputedStyle(a).fill:null; })():null,
    // Los cinco rótulos: mismo color y mismo peso, sin cifras, sin partir.
    labelStyle: (function(){
      var ls=[].slice.call(document.querySelectorAll('.intcc-radar-vlabel .intcc-radar-label'));
      return ls.map(function(e){ var cs=getComputedStyle(e); var b=e.getBoundingClientRect();
        var lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.25;
        return { txt:(e.textContent||'').trim(), color:cs.color, weight:cs.fontWeight,
                 size:cs.fontSize, wrap:cs.overflowWrap, brk:cs.wordBreak,
                 lines:Math.max(1,Math.round(b.height/lh)),
                 over:e.scrollWidth>e.clientWidth+1,
                 w:Math.round(b.width), l:Math.round(b.left), r:Math.round(b.right),
                 t:Math.round(b.top), b:Math.round(b.bottom) }; });
    })(),
    // ¿Sobra algo bajo la figura? Sólo puede haber título y envoltorio.
    radarKids: (function(){ var c=pick('.intv7-radar'); if(!c) return null;
      return [].slice.call(c.children).map(function(e){ return e.className||e.tagName; }); })(),
    svgEdges: svg?Number(svg.getAttribute('data-svg-edges')):null,
    svgArea: svg?!!svg.querySelector('.intcc-radar-area'):null,
    vlabels: document.querySelectorAll('.intcc-radar-vlabel').length,
    valuesShown: document.querySelectorAll('.intcc-radar-vlabel .intcc-radar-val').length,
    radarCard: R(card),
    pendingLine: (document.querySelector('.intv7-radar-pending')||{}).textContent||null,
    radarText: card?(card.textContent||'').replace(/\\\\s+/g,' ').trim():'',
    health: hb?{ h:Math.round(hb.height), content:Math.round(hbot-htop),
                 dead:Math.round(hb.height-(hbot-htop)), w:Math.round(hb.width),
                 text:(health.textContent||'').replace(/\\\\s+/g,' ').trim() }:null,
    today: today, changed: changed, evo: evo,
    heroChips: [].slice.call(document.querySelectorAll('.intcc-chip')).map(function(e){
      return (e.textContent||'').trim(); }),
  });})()`).then(JSON.parse);

const VP = process.env.AURIX_INTEL_VP ? process.env.AURIX_INTEL_VP.split('x').map(Number) : [1440, 900];
console.log('AURIX INTELLIGENCE · aceptación sobre las personas de producción — ' + VP.join('×') + '\n');

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  for (const lng of ['es', 'en']) {
    const browser = await launcher.launch();
    for (const who of ['A', 'B']) {
      for (const kind of ['sparse', 'dense']) {
        const ctx = await browser.newContext({ viewport: { width: VP[0], height: VP[1] },
          deviceScaleFactor: VP[0] < 700 ? 2 : 1, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await mount(page, who, kind, lng);
        const r = await read(page);
        const P = PERSONAS[who];
        const tag = `${ENG}.${VP[0]} ${lng.toUpperCase()} ${who}/${kind}`;

        // ── LA PERSONA ES LA DE LA CAPTURA ───────────────────────────────
        ok(`${tag} concentración ≈ ${P.top1}%`,
          Math.abs((r.axes.values || {}).concentration - P.top1) <= 1,
          JSON.stringify(r.axes.values));
        ok(`${tag} liquidez ≈ ${P.cash}%`,
          Math.abs((r.axes.values || {}).liquidity - P.cash) <= 1,
          JSON.stringify(r.axes.values));
        ok(`${tag} amplitud ≈ ${P.breadth}/7`,
          !!(r.axes.display && r.axes.display.diversification
             && Math.abs(parseFloat(String(r.axes.display.diversification).replace(',', '.')) - P.breadth) <= 0.15),
          JSON.stringify(r.axes.display));

        // ══ GATES QUIRÚRGICOS DEL RADAR ══════════════════════════════════
        // El contrato es el MISMO en los cuatro casos: con evidencia o sin ella,
        // la figura está completa. Lo que cambia es de dónde salen los radios.
        ok(`${tag} exactamente CINCO categorías`, r.vlabels === 5, String(r.vlabels));
        ok(`${tag} exactamente CINCO puntos`, r.svgDots === 5, String(r.svgDots));
        ok(`${tag} el trazado contiene los CINCO vértices`, r.svgVerts === 5, String(r.svgVerts));
        ok(`${tag} el polígono CIERRA (cinco aristas)`, r.svgEdges === 5, String(r.svgEdges));
        ok(`${tag} hay relleno interior`,
          r.svgArea === true && !!r.svgFill && r.svgFill !== 'none',
          JSON.stringify({ area: r.svgArea, fill: r.svgFill }));
        ok(`${tag} NINGUNA cifra ni porcentaje junto a una categoría`,
          (r.labelStyle || []).length === 5
          && (r.labelStyle || []).every(x => !/\d/.test(x.txt))
          // …y tampoco en el marcado: la clase de la cifra no puede reaparecer.
          && r.valuesShown === 0,
          JSON.stringify((r.labelStyle || []).map(x => x.txt)));
        ok(`${tag} las cinco categorías comparten color, peso y tamaño`,
          (() => { const L = r.labelStyle || []; if (L.length !== 5) return false;
            return new Set(L.map(x => x.color)).size === 1
              && new Set(L.map(x => x.weight)).size === 1
              && new Set(L.map(x => x.size)).size === 1; })(),
          JSON.stringify((r.labelStyle || []).map(x => [x.color, x.weight, x.size])));
        ok(`${tag} ninguna palabra se parte ni desborda`,
          (r.labelStyle || []).every(x => x.wrap !== 'anywhere' && x.wrap !== 'break-word'
            && x.brk !== 'break-all' && !x.over && x.lines <= 3),
          JSON.stringify((r.labelStyle || []).filter(x => x.over || x.lines > 3)));
        ok(`${tag} bajo la figura NO hay nada más que el título y el envoltorio`,
          (() => { const k = r.radarKids || []; return k.length === 2
            && /intcc-card-title/.test(String(k[0])) && /intcc-radar-wrap/.test(String(k[1])); })(),
          JSON.stringify(r.radarKids));
        ok(`${tag} ninguna explicación técnica bajo la figura`,
          !r.pendingLine && !/escala de 0 a 100|scale of 0 to 100|referencia con la que/i.test(r.radarText || ''),
          (r.pendingLine || r.radarText || '').slice(0, 140));
        ok(`${tag} ninguna frase «todavía no puede medirla»`,
          !/todav[íi]a no puede medir|cannot measure it yet/i.test(r.radarText || ''),
          (r.radarText || '').slice(0, 120));

        if (kind === 'dense') {
          // Con evidencia, los cinco radios son medidos: el auxiliar no se usa.
          ok(`${tag} con evidencia, los CINCO ejes están certificados`,
            r.axes.measured === 5,
            JSON.stringify({ measured: r.axes.measured, unavailable: r.axes.unavailable }));
        } else {
          // Sin evidencia la figura es idéntica, y el auxiliar NO SALE del SVG:
          // `_intv7RadarAxes()` sigue publicando sólo lo certificado, que es de
          // donde beben Explora, Salud y el resto.
          ok(`${tag} el auxiliar visual NO contamina el owner certificado`,
            (r.axes.measured || 0) < 5
            && (r.axes.unavailable || []).length === 5 - (r.axes.measured || 0)
            && Object.keys(r.axes.values || {}).length === (r.axes.measured || 0),
            JSON.stringify({ measured: r.axes.measured, values: r.axes.values }));
        }

        // ── SALUD ────────────────────────────────────────────────────────
        if (r.health) {
          ok(`${tag} Salud no deja media tarjeta vacía`, r.health.dead <= 40,
            JSON.stringify(r.health));
          ok(`${tag} Salud explica qué mide y por qué`,
            (r.health.text || '').length >= 40, (r.health.text || '').slice(0, 100));
        }

        // ── HOY / QUÉ HA CAMBIADO: NI UN ACONTECIMIENTO EN DOS SITIOS ────
        {
          const nums = (s) => (String(s || '').match(/[-−+]?\d+[.,]\d+\s*%/g) || []);
          const inBoth = nums(r.today).filter(x => nums(r.changed).indexOf(x) !== -1);
          ok(`${tag} ninguna cifra de rendimiento aparece en Hoy Y en Qué ha cambiado`,
            inBoth.length === 0,
            JSON.stringify({ repetidas: inBoth, hoy: (r.today || '').slice(0, 90) }));
        }

        // ── EVOLUCIÓN ────────────────────────────────────────────────────
        ok(`${tag} Evolución no afirma que no puede comparar NINGUNA dimensión`,
          !/no puede comparar ninguna|cannot compare any/i.test(r.evo || ''),
          (r.evo || '').slice(0, 140));

        // ── JUICIOS NO SUSTENTADOS ───────────────────────────────────────
        ok(`${tag} ninguna etiqueta afirma suficiencia o control sin contexto`,
          !(r.heroChips || []).some(c => /liquidez suficiente|sufficient liquidity|concentraci[óo]n controlada|concentration under control/i.test(c)),
          JSON.stringify(r.heroChips));

        await page.screenshot({ path: join(OUT, `acc-${who}-${kind}-${lng}-${VP[0]}x${VP[1]}-${ENG}.png`), fullPage: true });
        // LA CAPTURA QUE DE VERDAD SE REVISA. La de página completa mide 780×4866
        // en teléfono: a esa escala el radar es un sello y la revisión visual se
        // vuelve una formalidad —que es exactamente cómo se aprobaron las dos
        // versiones anteriores de esta figura—. Se añade el RECORTE de la card,
        // que es lo que el SPEC pide mirar.
        try {
          const card = await page.$('.intv7-radar');
          if (card) await card.screenshot({ path: join(OUT, `radar-${who}-${kind}-${lng}-${VP[0]}x${VP[1]}-${ENG}.png`) });
        } catch (_) { /* el recorte es evidencia adicional, nunca un gate */ }
        await ctx.close();
      }
    }
    await browser.close();
  }
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/intelligence-acceptance/');
process.exit(0);
