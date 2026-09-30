/**
 * AURIX · PULIDO GEOMÉTRICO DEL RADAR — sonda focal
 * Mide, en navegador real y sobre la app servida en local (mismo montaje que
 * `aurix-intelligence-acceptance-probe.mjs`): orden de los ejes, tipografía
 * única, holgura texto↔pentágono, contención en la card, ausencia de solapes y
 * equidistancia de la malla. Viewports 390 y 1440; ES obligatorio, EN sólo
 * contención.
 *   AURIX_RADAR_BASELINE=out.json  → escribe la línea base (card + radio por eje)
 *   AURIX_RADAR_COMPARE=out.json   → exige card y radios idénticos a la base
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
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
let chromium;
try { ({ chromium } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTOR\nRESULT: NO EJECUTADO (entorno, no candidato)'); process.exit(2); }
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const DAY = 864e5;
const ASSETS = [
  { id: 'A1', ticker: 'MSFT', name: 'Microsoft', type: 'stock',  qty: 31, price: 100, assetCurrency: 'USD' },
  { id: 'A2', ticker: 'BTC',  name: 'Bitcoin',   type: 'crypto', qty: 25, price: 100, assetCurrency: 'USD' },
  { id: 'A3', ticker: 'AAPL', name: 'Apple',     type: 'stock',  qty: 20, price: 100, assetCurrency: 'USD' },
  { id: 'A4', ticker: 'NVDA', name: 'Nvidia',    type: 'stock',  qty:  9, price: 100, assetCurrency: 'USD' },
  { id: 'A5', ticker: 'VWCE', name: 'Vanguard FTSE All-World', type: 'etf', qty: 8, price: 100, assetCurrency: 'USD' },
  { id: 'A6', ticker: 'USD',  name: 'Efectivo',  type: 'cash',   qty: 700, price: 1,  assetCurrency: 'USD' },
];
const CATS = { stock: 0.60, crypto: 0.25, etf: 0.08, liquidity: 0.07 };
function history(days = 43) {
  const now = Date.now(), hist = [], catRows = [];
  for (let i = 0; i <= days; i++) {
    const frac = i / days, ts = Math.round(now - (days - frac * days) * DAY);
    const total = 100000 * (1 + 0.05 * frac + Math.sin(frac * Math.PI) * -0.04);
    hist.push({ ts, value: +total.toFixed(2) });
    const row = { ts, total: +total.toFixed(2), crypto: 0, stock: 0, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
    Object.keys(CATS).forEach(k => { row[k] = +(total * CATS[k]).toFixed(2); });
    catRows.push(row);
  }
  return { hist, catRows };
}
const persona = `(function(){
  var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
  var ar=document.getElementById('appRoot'); if(ar) ar.style.opacity='1';
  var fe=Object.create(null);
  _AURIX_ENT_CANON.forEach(function(k){ fe[k]=(k!=='workspace.catalog_preview'); });
  _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',
             source:'default',validUntil:null,features:fe,sources:Object.create(null),fetchedAt:Date.now()};
  try { _aurixActiveUserId = 'probe-radar'; _aurixStampCacheOwner(); } catch(_) {}
  return true; })()`;

const MEASURE = `(function(){
  var card=[].slice.call(document.querySelectorAll('.intv7-radar')).filter(function(e){return e.getBoundingClientRect().width>0;})[0];
  if(!card) return JSON.stringify({error:'no card'});
  var svg=card.querySelector('.intcc-radar-svg'); var m=svg.getScreenCTM();
  var P=function(x,y){ return {x:m.a*x+m.c*y+m.e, y:m.b*x+m.d*y+m.f}; };
  var ptsOf=function(el){ return (el.getAttribute('points')||'').trim().split(/\\s+/).map(function(q){ var a=q.split(',').map(Number); return P(a[0],a[1]); }); };
  var frame=ptsOf(card.querySelector('.intcc-radar-ring.is-frame'));
  var rings=[].slice.call(card.querySelectorAll('.intcc-radar-ring')).map(function(r){ return (r.getAttribute('points')||'').trim().split(/\\s+/)[0].split(',').map(Number); });
  var cb=card.getBoundingClientRect();
  var dist=function(p,a,b){ var dx=b.x-a.x, dy=b.y-a.y, t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy); t=Math.max(0,Math.min(1,t));
    var qx=a.x+t*dx-p.x, qy=a.y+t*dy-p.y; return Math.sqrt(qx*qx+qy*qy); };
  var inside=function(p,poly){ var c=false; for(var i=0,j=poly.length-1;i<poly.length;j=i++){ var a=poly[i],b=poly[j];
    if(((a.y>p.y)!==(b.y>p.y)) && (p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)) c=!c; } return c; };
  // Holgura = distancia mínima entre el RECTÁNGULO del texto y el contorno del
  // pentágono exterior (muestreando el borde del rectángulo cada 0,5 px).
  var clear=function(r){ var best=1e9, hit=false; var S=[];
    for(var x=r.left;x<=r.right;x+=0.5){ S.push({x:x,y:r.top}); S.push({x:x,y:r.bottom}); }
    for(var y=r.top;y<=r.bottom;y+=0.5){ S.push({x:r.left,y:y}); S.push({x:r.right,y:y}); }
    S.forEach(function(p){ if(inside(p,frame)) hit=true;
      for(var i=0;i<frame.length;i++){ var d=dist(p,frame[i],frame[(i+1)%frame.length]); if(d<best) best=d; } });
    return hit?-1:best; };
  var c=P(110,106);
  var labels=[].slice.call(card.querySelectorAll('.intcc-radar-vlabel')).map(function(v){
    var e=v.querySelector('.intcc-radar-label'); var r=e.getBoundingClientRect(); var cs=getComputedStyle(e);
    var mid={x:(r.left+r.right)/2,y:(r.top+r.bottom)/2};
    return { axis:v.getAttribute('data-axis'), txt:(e.textContent||'').trim(),
      font:[cs.fontFamily,cs.fontSize,cs.fontWeight,cs.lineHeight,cs.letterSpacing,cs.color,cs.opacity,cs.textTransform,cs.fontStyle].join('|'),
      vopacity:getComputedStyle(v).opacity, wrap:cs.overflowWrap, lines:Math.round(r.height/parseFloat(cs.lineHeight)),
      l:r.left,r:r.right,t:r.top,b:r.bottom, clear:clear(r),
      quad:(mid.y<c.y-4?'top':(mid.y>c.y+4?'bottom':'mid'))+'-'+(mid.x<c.x-4?'left':(mid.x>c.x+4?'right':'center')),
      inCard: r.left>=cb.left && r.right<=cb.right && r.top>=cb.top && r.bottom<=cb.bottom };
  });
  var dots={}; [].slice.call(card.querySelectorAll('.intcc-radar-dot')).forEach(function(d){
    var x=+d.getAttribute('cx')-110, y=+d.getAttribute('cy')-106; dots[d.getAttribute('data-axis')]=+Math.sqrt(x*x+y*y).toFixed(1); });
  var rr=rings.map(function(p){ var x=p[0]-110,y=p[1]-106; return +Math.sqrt(x*x+y*y).toFixed(2); }).sort(function(a,b){return a-b;});
  var cs=function(s){ var e=card.querySelector(s); if(!e) return null; var k=getComputedStyle(e); return [k.stroke,k.strokeWidth,k.fill].join('|'); };
  return JSON.stringify({ card:{w:Math.round(cb.width),h:Math.round(cb.height)}, labels:labels, dots:dots, rings:rr,
    ringStroke:getComputedStyle(card.querySelector('.intcc-radar-ring')).stroke,
    series:{ area:cs('.intcc-radar-area'), edge:cs('.intcc-radar-edge'), dot:cs('.intcc-radar-dot') } });
})()`;

const BASE = process.env.AURIX_RADAR_BASELINE, CMP = process.env.AURIX_RADAR_COMPARE;
const baseline = {};
const prior = CMP && existsSync(CMP) ? JSON.parse(readFileSync(CMP, 'utf8')) : null;
const VPS = [[390, 844], [1440, 900]];
const H = history();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const lng of ['es', 'en']) for (const VP of VPS) {
  const tag = `[${lng} ${VP[0]}]`;
  console.log('\n' + tag);
  const ctx = await browser.newContext({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(`try{
    localStorage.setItem('portfolio_lang', ${JSON.stringify(lng)});
    localStorage.setItem('portfolio_assets', ${JSON.stringify(JSON.stringify(ASSETS))});
    localStorage.setItem('portfolio_history', ${JSON.stringify(JSON.stringify(H.hist))});
    localStorage.setItem('category_history', ${JSON.stringify(JSON.stringify(H.catRows))});
  }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`typeof switchTab === 'function' && typeof _renderIntelligenceCommandCenter === 'function'`, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(persona);
  await page.evaluate(`(function(){ switchTab('intelligence'); return true; })()`);
  await page.waitForTimeout(1400);
  const r = JSON.parse(await page.evaluate(MEASURE));
  if (r.error) { ok(tag + ' card del radar presente', false, r.error); await ctx.close(); continue; }
  const key = lng + VP[0];
  baseline[key] = { card: r.card, dots: r.dots, series: r.series };
  const L = r.labels, by = k => L.find(x => x.axis === k) || {};
  console.log('    holguras: ' + L.map(x => x.axis + '=' + x.clear.toFixed(1)).join(' · ') + '   anillos: ' + r.rings.join(','));
  ok(`${tag} cinco rótulos, una línea cada uno, sin cifras`,
    L.length === 5 && L.every(x => x.lines === 1 && !/\d/.test(x.txt)), JSON.stringify(L.map(x => [x.txt, x.lines])));
  ok(`${tag} ninguno sale de la card`, L.every(x => x.inCard), JSON.stringify(L.filter(x => !x.inCard).map(x => x.axis)));
  ok(`${tag} ningún rótulo se solapa con otro`, L.every((a, i) => L.every((b, j) => i === j
    || a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t)));
  if (lng === 'es') {
    ok(`${tag} orden: Amplitud arriba · Estabilidad sup-dcha · Liquidez inf-dcha · Concentración inf-izda · Crecimiento sup-izda`,
      by('diversification').quad.endsWith('center') && by('diversification').t < by('stability').t
      && by('stability').quad === 'top-right' && by('liquidity').quad === 'bottom-right'
      && by('concentration').quad === 'bottom-left' && by('growth').quad === 'top-left',
      JSON.stringify(L.map(x => x.axis + ':' + x.quad)));
    ok(`${tag} tipografía idéntica en los cinco (familia, tamaño, peso, interlineado, tracking, color, opacidad)`,
      L.every(x => x.font === L[0].font && x.vopacity === L[0].vopacity) && L.every(x => x.wrap !== 'anywhere'),
      JSON.stringify([...new Set(L.map(x => x.font))]));
    const cl = L.map(x => x.clear), lo = VP[0] < 768 ? 12 : 10, hi = VP[0] < 768 ? 16 : 14;
    ok(`${tag} holgura malla↔texto en [${lo}, ${hi}] px y homogénea (≤ 2 px de dispersión)`,
      cl.every(v => v >= lo && v <= hi) && Math.max(...cl) - Math.min(...cl) <= 2, cl.map(v => v.toFixed(1)).join(','));
    const gaps = r.rings.slice(1).map((v, i) => +(v - r.rings[i]).toFixed(2));
    ok(`${tag} malla: cinco pentágonos equidistantes`, r.rings.length === 5
      && Math.max(...gaps) - Math.min(...gaps) <= 0.2, JSON.stringify(gaps));
    if (prior && prior[key]) {
      ok(`${tag} card del mismo tamaño que antes`, JSON.stringify(prior[key].card) === JSON.stringify(r.card),
        JSON.stringify([prior[key].card, r.card]));
      ok(`${tag} cada eje conserva su radio (valor) y la serie su estilo`,
        Object.keys(prior[key].dots).every(k => prior[key].dots[k] === r.dots[k])
        && JSON.stringify(prior[key].series) === JSON.stringify(r.series),
        JSON.stringify([prior[key].series, r.series]));
    }
  }
  const card = await page.$('.intv7-radar');
  if (card) await card.screenshot({ path: join(OUT, `radar-polish-${lng}-${VP[0]}.png`) });
  await ctx.close();
}
await browser.close();
server.close();
if (BASE) await writeFile(BASE, JSON.stringify(baseline, null, 1));
console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — capturas en docs/intelligence-acceptance/radar-polish-*.png');
process.exit(0);
