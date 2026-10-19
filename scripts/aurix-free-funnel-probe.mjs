// AURIX — CIERRE PREMIUM DEL EMBUDO FREE · sonda focal única.
// Premium Gateway del Resumen + plantilla compartida de portadas Free (`.cvr-*`) + embudo
// Resumen → portada → CTA → paywall → volver. Bytes del repo en local, personas simuladas
// (`_aurixEnt`) y carteras SINTÉTICAS (nunca datos reales).
// Matriz: Chromium + WebKit · 360/390/768/1024/1440 · ES/EN · Free con datos, Free con valoración
// incompleta, Free vacía, Premium · teclado y movimiento reducido.
//   node scripts/aurix-free-funnel-probe.mjs            (SHOTS=1 guarda capturas en docs/free-funnel/)
import { serve, chromium, webkit, page, PORTFOLIO } from './_ffn-lib.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './_ffn-lib.mjs';

const OUT = join(ROOT, 'docs', 'free-funnel', 'probe'); if (process.env.SHOTS) mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d === undefined ? '' : '  ' + String(d).slice(0, 300))); console.log('  ✗', n, d === undefined ? '' : String(d).slice(0, 300)); } };
// Una posición sin precio: la valoración NO es completa y Intelligence no puede afirmar nada.
const INCOMPLETE = PORTFOLIO.concat([{ id: 'a_nop', type: 'stock', ticker: 'ZZZQ', marketSymbol: 'ZZZQ', name: 'Sin precio', qty: 5, price: null, costBasis: 100, assetCurrency: 'USD', transactions: [] }]);
const H = w => (w <= 360 ? 740 : w < 768 ? 844 : w < 1100 ? (w === 768 ? 1024 : 768) : 900);

const DASH = `(function(){
  var sec=document.getElementById('dashDiscoverSection'); var cards=[].slice.call(document.querySelectorAll('#dashDiscoverSection .pgw-card'));
  var R=function(e){ var b=e.getBoundingClientRect(); return { t:b.top, b:b.bottom, l:b.left, r:b.right, w:b.width, h:b.height }; };
  var facts=null; try{ facts=_aurixIntelligencePreviewFacts(); }catch(_){}
  var pub=[]; try{ pub=_wsfcPublishedCaps(); }catch(_){}
  return JSON.stringify({ shown: !!sec && sec.style.display!=='none', n: cards.length,
    cls: sec ? sec.className : '',
    cards: cards.map(function(c){ var cb=R(c), cta=c.querySelector('.pgw-cta'), t=c.querySelector('.pgw-t'), tier=c.querySelector('.pgw-tier,.cvr-tier');
      var vz=R(c.querySelector('.pgw-viz')), orb=c.querySelector('.pgw-orb'), inV=function(r,m){ return r.l>=vz.l-0.5+m && r.r<=vz.r+0.5-m && r.t>=vz.t-0.5+m && r.b<=vz.b+0.5-m; };
      var orbIn=true; if(orb){ var ob=R(orb), hw=parseFloat(getComputedStyle(orb,'::after').width)||0, cx=(ob.l+ob.r)/2, cy=(ob.t+ob.b)/2; orbIn=inV({l:cx-hw/2,r:cx+hw/2,t:cy-hw/2,b:cy+hw/2},0); }
      var tilesIn=[].every.call(c.querySelectorAll('.pgw-tile'), function(e){ return inV(R(e), 6); });   // v848: la luz de la tesela es interior; 6 px de aire mínimo
      return { box: cb, titleDy: Math.round(R(t).t-cb.t), ctaFromBottom: Math.round(cb.b-R(cta).b), ctaH: Math.round(R(cta).h), ctaW: Math.round(R(cta).w),
        tier: tier ? tier.textContent.trim() : '', dest: cta.getAttribute('data-dsc-go'), txt: c.textContent, body: c.querySelector('.pgw-b').textContent.trim(),
        orbIn: orbIn, tilesIn: tilesIn, border: getComputedStyle(c).borderTopColor, lift: getComputedStyle(c).transform,
        real: [].map.call(c.querySelectorAll('.pgw-row.is-real .pgw-row-t'), function(e){ return e.textContent.trim(); }),
        locked: [].map.call(c.querySelectorAll('.pgw-row.is-locked'), function(e){ return e.textContent.trim(); }),
        tiles: c.querySelectorAll('.pgw-tile').length, verbs: [].map.call(c.querySelectorAll('.pgw-row:not(.is-real):not(.is-locked) .pgw-row-t'), function(e){ return e.textContent.trim(); }),
        anim: getComputedStyle(c).animationName, dur: getComputedStyle(c).animationDuration, iter: getComputedStyle(c).animationIterationCount,
        orbAnim: c.querySelector('.pgw-orb') ? getComputedStyle(c.querySelector('.pgw-orb')).animationName : null,
        tileAnim: c.querySelector('.pgw-tile') ? getComputedStyle(c.querySelector('.pgw-tile'),'::after').animationName : null,
        inView: cb.l >= -0.5 && cb.r <= innerWidth + 0.5 }; }),
    facts: facts ? { state: facts.state, first: facts.visible && facts.visible[0] ? _aurixIntPreviewFactText(facts.visible[0]) : null } : null,
    pub: pub.map(function(c){ return t(c.nameKey); }),
    overX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }); })()`;
const COVER = `(function(){
  var st=document.querySelector('.cvr-stage'), c=document.querySelector('.cvr-card'); if(!st||!c) return JSON.stringify({ none:true });
  var R=function(e){ var b=e.getBoundingClientRect(); return { t:Math.round(b.top), b:Math.round(b.bottom), l:Math.round(b.left), w:Math.round(b.width), h:Math.round(b.height) }; };
  var cta=c.querySelector('.cvr-cta'), nav=document.querySelector('.bottom-nav'); var nb=nav && getComputedStyle(nav).display!=='none' ? nav.getBoundingClientRect().top : innerHeight;
  var slot=function(sel){ var e=c.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top - c.getBoundingClientRect().top) : null; };
  return JSON.stringify({ stage: R(st), card: R(c), cta: R(cta), ctaVisible: cta.getBoundingClientRect().bottom <= nb + 0.5 && cta.getBoundingClientRect().top >= 0,
    slots: { label: slot('.cvr-label'), title: slot('.cvr-title'), desc: slot('.cvr-desc') },
    pill: (c.querySelector('.cvr-pill')||{}).textContent || '', tier: !!c.querySelector('.cvr-tier'),
    locked: [].map.call(c.querySelectorAll('.intprev-fact.is-locked'), function(e){ return e.textContent.replace(/\\s+/g,' ').trim(); }),
    redact: !!c.querySelector('.intprev-redact'), lockIcon: c.querySelectorAll('.intprev-fact.is-locked .intprev-lock svg').length,
    visibleFacts: [].map.call(c.querySelectorAll('.intprev-fact:not(.is-locked) .intprev-fact-text'), function(e){ return e.textContent.trim(); }),
    caps: c.querySelectorAll('.wsfc-cap').length, cardInStage: c.getBoundingClientRect().bottom <= st.getBoundingClientRect().bottom + 0.5,
    stageScroll: st.scrollHeight > st.clientHeight + 1,
    overX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    anim: getComputedStyle(c).animationName, dur: getComputedStyle(c).animationDuration, stageBg: getComputedStyle(st).backgroundColor + '|' + getComputedStyle(st).backgroundImage }); })()`;
// v848 · luz AMBIENTAL: estado de las animaciones de la esfera y de las herramientas.
const AMB = `(function(){ var o=document.querySelector('.pgw-orb'), t=document.querySelector('.pgw-tile:nth-child(5)'); var A=function(e,ps){ if(!e) return null; var c=getComputedStyle(e,ps); return { n:c.animationName, d:parseFloat(c.animationDuration), i:c.animationIterationCount, ps:c.animationPlayState }; };
  return JSON.stringify({ on: /\\bpgw-on\\b/.test(document.getElementById('dashDiscoverSection').className), light: A(o,'::before'), halo: A(o,'::after'), tile: A(t,'::after') }); })()`;
const WSCOMP = `(function(){ var c=document.querySelector('.pgw-card.is-ws'), v=c.querySelector('.pgw-viz').getBoundingClientRect(), g=c.querySelector('.pgw-mosaic').getBoundingClientRect(), r=c.querySelector('.pgw-rows').getBoundingClientRect(), t=c.querySelector('.pgw-tile').getBoundingClientRect();
  var cs=getComputedStyle(c.querySelector('.pgw-viz')), inner=v.width-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-2;
  var i=document.querySelector('.pgw-card.is-int'), o=i.querySelector('.pgw-orb').getBoundingClientRect(), iv=i.querySelector('.pgw-viz').getBoundingClientRect(), ir=i.querySelector('.pgw-rows').getBoundingClientRect(), hw=parseFloat(getComputedStyle(i.querySelector('.pgw-orb'),'::after').width)*1.02, cx=(o.left+o.right)/2, cy=(o.top+o.bottom)/2;
  return JSON.stringify({ tile: Math.round(t.width), pct: Math.round((r.right-g.left)/inner*100), dl: Math.round(g.left-v.left), dr: Math.round(v.right-r.right), dt: Math.round(g.top-v.top), db: Math.round(v.bottom-g.bottom), gh: Math.round(g.height), rh: Math.round(r.height),
    haloEdge: Math.round(Math.min(cx-hw/2-iv.left, iv.right-(cx+hw/2), cy-hw/2-iv.top, iv.bottom-(cy+hw/2))), haloText: Math.round(ir.left-(cx+hw/2)) }); })()`;
const toCards = P => P.ev(`(function(){ var e=document.getElementById('dashDiscoverSection'); if(e && e.firstChild) e.scrollIntoView({block:'center'}); })()`);
const pwOpen = P => P.ev(`!!document.querySelector('.aurix-premium-overlay.is-open')`);

async function run(ENG, browser, w, lang) {
  const T = `${ENG}.${w}.${lang}`, en = lang === 'en';
  const P = await page(browser, P_URL, { w, h: H(w), lang });
  // CLS a lo largo de todo el recorrido (sólo Chromium expone layout-shift).
  await P.ev(`(function(){ window.__cls=0; try{ new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ if(!e.hadRecentInput) window.__cls+=e.value; }); }).observe({type:'layout-shift', buffered:false}); }catch(_){ window.__cls=-1; } })()`);
  await toCards(P); await P.p.waitForTimeout(400);
  const d = JSON.parse(await P.ev(DASH));
  const [ci, cw] = d.cards;
  ok(`${T} Gateway: dos tarjetas Free, Intelligence y Workspace`, d.shown && d.n === 2 && ci.dest === 'intelligence' && cw.dest === 'workspace', JSON.stringify([d.shown, d.n]));
  if (d.n !== 2) { await P.ctx.close(); return; }
  ok(`${T} misma altura, título y CTA a la misma altura en las dos`, Math.abs(ci.box.h - cw.box.h) <= 1 && Math.abs(ci.titleDy - cw.titleDy) <= 1 && Math.abs(ci.ctaFromBottom - cw.ctaFromBottom) <= 1, JSON.stringify([ci.box.h, cw.box.h, ci.titleDy, cw.titleDy, ci.ctaFromBottom, cw.ctaFromBottom]));
  const twoCols = Math.abs(ci.box.t - cw.box.t) <= 1 && ci.box.r <= cw.box.l;
  ok(`${T} ${w > 700 ? 'dos columnas' : 'una columna'}`, w > 700 ? twoCols : (cw.box.t >= ci.box.b), JSON.stringify([ci.box, cw.box]));
  // v847 SE RE-DECIDE: las tarjetas ya no llevan etiqueta de plan ni dicen «Premium» en ningún sitio.
  ok(`${T} sin etiqueta ni palabra «Premium» en las tarjetas`, !ci.tier && !cw.tier && !/premium/i.test(ci.txt + cw.txt), JSON.stringify([ci.tier, cw.tier]));
  ok(`${T} CTA primario táctil (≥44 px) y dentro de la tarjeta`, ci.ctaH >= 44 && cw.ctaH >= 44 && ci.inView && cw.inView);
  ok(`${T} Intelligence: la ÚNICA lectura es el primer hecho certificado de su portada`, d.facts && d.facts.state === 'ok' && ci.real.length === 1 && ci.real[0] === d.facts.first, JSON.stringify([ci.real, d.facts]));
  ok(`${T} Intelligence: dos capas bloqueadas inequívocas, sin cifras`, ci.locked.length === 2 && ci.locked.every(x => !/\d/.test(x) && (en ? /locked/ : /bloqueado/).test(x)), JSON.stringify(ci.locked));
  // v847 SE RE-DECIDE: a la izquierda los nueve iconos, a la derecha SÓLO los tres verbos (los nombres de
  // herramienta ya no se repiten), y el texto inferior deja de enumerar capacidades.
  ok(`${T} Workspace: los nueve iconos publicados, 3×3`, cw.tiles === Math.min(9, d.pub.length) && cw.tiles === 9, String(cw.tiles));
  ok(`${T} Workspace: a la derecha sólo «calcula, organiza y planifica»`, JSON.stringify(cw.verbs) === JSON.stringify(en ? ['Calculate', 'Organise', 'Plan'] : ['Calcula', 'Organiza', 'Planifica']), cw.verbs.join(' | '));
  ok(`${T} Workspace: copy inferior nuevo y sin repetir herramientas`, cw.body === (en ? 'Work on your finances in one place and continue whenever you want.' : 'Trabaja tus finanzas en un solo espacio y continúa cuando quieras.') && !d.pub.some(n => cw.txt.indexOf(n) !== -1), cw.body);
  ok(`${T} esfera (con su halo) e iconos dentro de su pozo`, ci.orbIn && cw.tilesIn, JSON.stringify([ci.orbIn, cw.tilesIn]));
  // v848 SE RE-DECIDE (SPEC AJUSTE VISUAL FINAL): la entrada única se sustituye por una luz AMBIENTAL lenta
  // que sólo corre mientras se ve. La tarjeta en sí sigue sin animar opacidad ni geometría.
  ok(`${T} la tarjeta no anima ni se desplaza`, [ci, cw].every(c => c.anim === 'none' && c.lift === 'none'), JSON.stringify([ci.anim, ci.lift]));
  const am = JSON.parse(await P.ev(AMB));
  ok(`${T} esfera viva mientras se ve: luz interior y halo, 5–7 s, en marcha`, am.on && am.light.n === 'pgwOrbLight' && am.halo.n === 'pgwHalo' && [am.light, am.halo].every(x => x.d >= 5 && x.d <= 7 && x.ps === 'running'), JSON.stringify(am));
  ok(`${T} herramientas: ciclo secuencial lento (7–9 s) en marcha`, am.tile.n === 'pgwCycle' && am.tile.d >= 7 && am.tile.d <= 9 && am.tile.ps === 'running', JSON.stringify(am.tile));
  const wc = JSON.parse(await P.ev(WSCOMP));
  ok(`${T} Workspace: una composición centrada, verbos a la altura de la rejilla`, Math.abs(wc.dl - wc.dr) <= 2 && Math.abs(wc.dt - wc.db) <= 2 && Math.abs(wc.gh - wc.rh) <= 1, JSON.stringify(wc));
  if (w >= 1024) ok(`${T} Workspace: la composición ocupa ~60–70 % del ancho útil`, wc.pct >= 57 && wc.pct <= 72, JSON.stringify(wc));
  if (w >= 1280) ok(`${T} Workspace escritorio: teselas ~46–52 px`, wc.tile >= 46 && wc.tile <= 52, JSON.stringify(wc));
  ok(`${T} Workspace: aire alrededor de la composición (sin tocar el pozo)`, Math.min(wc.dl, wc.dr, wc.dt, wc.db) >= 6, JSON.stringify(wc));
  ok(`${T} Intelligence: el halo (con su respiración) no toca el borde del pozo ni el texto`, wc.haloEdge >= 6 && wc.haloText >= 4, JSON.stringify(wc));
  ok(`${T} Resumen sin desbordamiento horizontal`, !d.overX);
  // Un repintado (precio nuevo, vuelta de categoría) no repite la entrada.
  // Un repintado (precio nuevo, vuelta de categoría) no apaga ni reinicia la luz: el estado vive en la sección.
  await P.ev(`(function(){ var s=document.getElementById('dashDiscoverSection'); s._pgwHtml=''; updateDashboardDiscover(); })()`);
  const am2 = JSON.parse(await P.ev(AMB));
  ok(`${T} un repintado mantiene la luz ambiental en marcha`, am2.on && am2.light.ps === 'running' && am2.tile.ps === 'running', JSON.stringify(am2));
  if (process.env.SHOTS && (w === 390 || w === 1440)) await P.p.screenshot({ path: join(OUT, `dash-${ENG}-${w}-${lang}.png`) });

  // ── EMBUDO: tarjeta entera → portada → CTA → paywall → cerrar → Atrás
  const covers = {};
  for (const [kind, sel, dest] of [['int', '.pgw-card.is-int', 'intelligence'], ['ws', '.pgw-card.is-ws', 'workspace']]) {
    await P.ev(`switchTab('home')`); await P.p.waitForTimeout(500);
    await P.ev(`document.querySelector('${sel}').scrollIntoView({ block: 'center' })`); await P.p.waitForTimeout(300);
    const y0 = await P.ev('Math.round(scrollY)');
    // Clic en la zona visual (no en el botón): la tarjeta entera es interactiva.
    const vz = JSON.parse(await P.ev(`(function(){ var r=document.querySelector('${sel} .pgw-viz').getBoundingClientRect(); return JSON.stringify({ x: r.left + 30, y: r.top + 20 }); })()`));
    await P.p.mouse.click(vz.x, vz.y); await P.p.waitForTimeout(700);
    const st = await P.ev(`JSON.stringify({ tab: currentTab, pw: !!document.querySelector('.aurix-premium-overlay.is-open'), cover: !!document.querySelector('${dest === 'intelligence' ? '[data-aurix-preview="intelligence"]' : '[data-wsh-view="free_cover"]'}') })`);
    const s0 = JSON.parse(st);
    ok(`${T} ${kind}: la tarjeta lleva a SU portada Free, no al paywall ni al checkout`, s0.tab === dest && s0.cover && !s0.pw, st);
    covers[kind] = JSON.parse(await P.ev(COVER));
    if (process.env.SHOTS && (w === 390 || w === 1440)) await P.p.screenshot({ path: join(OUT, `cover-${kind}-${ENG}-${w}-${lang}.png`) });
    await P.p.click('.cvr-cta'); await P.p.waitForTimeout(600);
    ok(`${T} ${kind}: el CTA de la portada abre el paywall existente`, await pwOpen(P) && /index\.html/.test(P.p.url()), P.p.url());
    await P.ev(`window.closeAurixPremiumModal()`); await P.p.waitForTimeout(350);
    ok(`${T} ${kind}: cerrar el paywall deja la portada`, !(await pwOpen(P)) && (await P.ev('currentTab')) === dest);
    await P.p.goBack(); await P.p.waitForTimeout(800);
    const back = JSON.parse(await P.ev(`JSON.stringify({ tab: currentTab, y: Math.round(scrollY) })`));
    ok(`${T} ${kind}: Atrás vuelve al Resumen y a la misma altura`, back.tab === 'home' && Math.abs(back.y - y0) <= 2, JSON.stringify({ y0, back }));
  }
  // ── PLANTILLA COMPARTIDA: mismas medidas, mismas posiciones, CTA en la misma zona
  const a = covers.int, b = covers.ws;
  ok(`${T} portadas: mismo escenario (origen, ancho y alto)`, a.stage.t === b.stage.t && a.stage.w === b.stage.w && Math.abs(a.stage.h - b.stage.h) <= 1, JSON.stringify([a.stage, b.stage]));
  ok(`${T} portadas: misma tarjeta (origen, ancho y alto)`, a.card.t === b.card.t && a.card.l === b.card.l && a.card.w === b.card.w && Math.abs(a.card.h - b.card.h) <= 1, JSON.stringify([a.card, b.card]));
  ok(`${T} portadas: etiqueta, título y descripción en la misma posición`, a.slots.label === b.slots.label && a.slots.title === b.slots.title, JSON.stringify([a.slots, b.slots]));
  ok(`${T} portadas: CTA en la misma zona`, Math.abs(a.cta.t - b.cta.t) <= 1 && Math.abs(a.cta.l - b.cta.l) <= 1, JSON.stringify([a.cta, b.cta]));
  ok(`${T} portadas: CTA visible sin scroll, dentro del área útil y ≥44 px`, a.ctaVisible && b.ctaVisible && a.cta.h >= 44 && b.cta.h >= 44 && !a.stageScroll && !b.stageScroll, JSON.stringify([a.cta, b.cta, a.stageScroll, b.stageScroll]));
  ok(`${T} portadas: la tarjeta cabe en su escenario y sin desbordamiento horizontal`, a.cardInStage && b.cardInStage && !a.overX && !b.overX);
  ok(`${T} portadas: no nombran el plan (sin distintivo Premium)`, !a.tier && !b.tier);
  ok(`${T} portadas: el escenario se funde con el negro global (sin superficie propia)`, [a, b].every(x => /^rgba\(0, 0, 0, 0\)\|none$/.test(x.stageBg)), JSON.stringify([a.stageBg, b.stageBg]));
  // v847 · copy de la exposición cripto en la portada: «Cripto representa…» (nunca «La cripto…»); EN intacto.
  ok(`${T} Intelligence: copy de cripto correcto`, a.visibleFacts.some(x => en ? /^Crypto is around \d+% of your financial portfolio\.$/.test(x) : /^Cripto representa cerca del \d+% de tu cartera financiera\.$/.test(x)) && !a.visibleFacts.some(x => /La cripto/.test(x)), JSON.stringify(a.visibleFacts));
  ok(`${T} Intelligence: los hechos visibles se conservan`, a.visibleFacts.length >= 1 && a.visibleFacts[0] === ci.real[0], JSON.stringify(a.visibleFacts));
  ok(`${T} Intelligence: la capa bloqueada tiene candado y rótulo, sin barras de skeleton`, !a.redact && a.locked.length >= 1 && a.lockIcon === a.locked.length && a.locked.every(x => x.replace(/\s+/g, '') === (en ? 'Locked analysisUnlocks with your full analysis' : 'Análisis bloqueadoSe desbloquea con tu análisis completo').replace(/\s+/g, '')), JSON.stringify(a.locked));
  ok(`${T} Workspace: conserva sus capacidades reales`, b.caps === d.pub.length, String(b.caps));
  const cls = await P.ev('window.__cls');
  if (cls !== -1) ok(`${T} sin desplazamiento de maquetación en todo el recorrido (CLS ≤ 0,01)`, cls <= 0.01, String(cls));
  ok(`${T} sin errores de página ni de consola`, !P.errs.length, P.errs.join(' | '));
  await P.ctx.close();
}

async function personas(ENG, browser) {
  for (const w of [390, 1440]) {
    // Free con valoración INCOMPLETA: ninguna lectura en el Gateway, estado de espera en la portada.
    let P = await page(browser, P_URL, { w, h: H(w), assets: INCOMPLETE });
    let d = JSON.parse(await P.ev(DASH));
    // Pausa fuera del viewport y con la pestaña oculta; vuelve al verse.
    if (w < 768) {
      const pz = await P.ev(`(async function(){ var s=document.getElementById('dashDiscoverSection'), w8=function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
        var st=function(){ var c=getComputedStyle(document.querySelector('.pgw-tile:nth-child(5)'),'::after').animationPlayState, l=getComputedStyle(document.querySelector('.pgw-orb'),'::before').animationPlayState; return (s.classList.contains('pgw-on')?'on':'off')+'/'+l+'/'+c; };
        s.scrollIntoView({block:'center'}); await w8(500); var a=st();
        window.scrollTo(0,0); await w8(500); var b=st();
        s.scrollIntoView({block:'center'}); await w8(500); var c=st();
        Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true;}}); document.dispatchEvent(new Event('visibilitychange')); await w8(100); var h=st();
        delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); await w8(100); var v=st();
        return JSON.stringify([a,b,c,h,v]); })()`);
      ok(`${ENG}.${w} luz ambiental: corre al verse, pausa fuera del viewport y con la pestaña oculta`, pz === JSON.stringify(['on/running/running', 'off/paused/paused', 'on/running/running', 'off/paused/paused', 'on/running/running']), pz);
    }
    ok(`${ENG}.${w} incompleta: el Gateway no afirma ninguna lectura`, d.n === 2 && d.facts.state !== 'ok' && d.cards[0].real.length === 0 && d.cards[0].locked.length === 2, JSON.stringify([d.facts, d.cards[0] && d.cards[0].real]));
    ok(`${ENG}.${w} incompleta: tarjetas iguales igualmente`, Math.abs(d.cards[0].box.h - d.cards[1].box.h) <= 1 && Math.abs(d.cards[0].titleDy - d.cards[1].titleDy) <= 1);
    await P.ev(`switchTab('intelligence')`); await P.p.waitForTimeout(700);
    const c = JSON.parse(await P.ev(COVER));
    ok(`${ENG}.${w} incompleta: la portada dice qué falta, sin hechos ni capas inventadas`, !c.none && c.visibleFacts.length === 0 && c.locked.length === 0 && c.ctaVisible, JSON.stringify(c));
    ok(`${ENG}.${w} incompleta: sin errores`, !P.errs.length, P.errs.join(' | '));
    // Táctil: un toque en la zona visual de la tarjeta lleva a su portada, sin depender del hover.
    if (w < 768) {
      await P.ev(`switchTab('home')`); await P.p.waitForTimeout(500);
      await P.ev(`document.querySelector('.pgw-card.is-ws').scrollIntoView({ block: 'center' })`); await P.p.waitForTimeout(300);
      const tp = JSON.parse(await P.ev(`(function(){ var r=document.querySelector('.pgw-card.is-ws .pgw-viz').getBoundingClientRect(); return JSON.stringify({ x: r.left + 40, y: r.top + 30 }); })()`));
      await P.p.touchscreen.tap(tp.x, tp.y); await P.p.waitForTimeout(700);
      ok(`${ENG}.${w} táctil: tocar la tarjeta lleva a la portada`, (await P.ev('currentTab')) === 'workspace');
    }
    await P.ctx.close();
    // Premium: ni promos ni portadas Free, desde el primer frame observado.
    P = await page(browser, P_URL, { w, h: H(w), premium: true });
    await P.ev(`(function(){ window.__promo=0; var s=document.getElementById('dashDiscoverSection'); new MutationObserver(function(){ if(s.firstChild && s.style.display!=='none') window.__promo++; }).observe(s,{childList:true,attributes:true}); })()`);
    await P.ev(`switchTab('intelligence')`); await P.p.waitForTimeout(700);
    const ip = await P.ev(`!!document.querySelector('[data-aurix-preview="intelligence"]')`);
    await P.ev(`switchTab('workspace')`); await P.p.waitForTimeout(700);
    const wp = await P.ev(`!!document.querySelector('[data-wsh-view="free_cover"]')`);
    await P.ev(`switchTab('home')`); await P.p.waitForTimeout(700);
    d = JSON.parse(await P.ev(DASH));
    ok(`${ENG}.${w} Premium: sin promociones Free ni flash en el Resumen`, !d.shown && d.n === 0 && (await P.ev('window.__promo')) === 0, JSON.stringify([d.shown, d.n]));
    ok(`${ENG}.${w} Premium: sin portada Free en Intelligence ni en Workspace`, !ip && !wp, JSON.stringify([ip, wp]));
    await P.ctx.close();
    // Movimiento reducido: nada decorativo se anima.
    P = await page(browser, P_URL, { w, h: H(w), reduced: true });
    d = JSON.parse(await P.ev(DASH));
    await P.ev(`document.getElementById('dashDiscoverSection').scrollIntoView({block:'center'})`); await P.p.waitForTimeout(150);
    d = JSON.parse(await P.ev(DASH));
    const rm = JSON.parse(await P.ev(AMB));
    ok(`${ENG}.${w} reduced-motion: esfera y herramientas estáticas, sin ciclo`, d.cards.every(x => x.anim === 'none') && rm.light.n === 'none' && rm.halo.n === 'none' && rm.tile.n === 'none', JSON.stringify(rm));
    await P.ev(`switchTab('workspace')`); await P.p.waitForTimeout(500);
    const rc = JSON.parse(await P.ev(COVER));
    ok(`${ENG}.${w} reduced-motion: portada sin animación`, rc.anim === 'none', rc.anim);
    await P.ctx.close();
    // Teclado: una parada de foco por tarjeta, foco visible, Enter navega.
    P = await page(browser, P_URL, { w, h: H(w) });
    await P.p.bringToFront();   // :focus/:focus-within sólo aplican en la página con el foco de la ventana
    await P.ev(`(function(){ var b=document.querySelector('.pgw-card.is-ws .pgw-cta'); b.focus(); })()`); await P.p.waitForTimeout(500);
    const kf = JSON.parse(await P.ev(`(function(){ var b=document.activeElement; var cs=getComputedStyle(b); var card=b.closest('.pgw-card'); return JSON.stringify({ is: b.classList.contains('pgw-cta'), outline: cs.outlineStyle, ring: cs.outlineWidth, lift: getComputedStyle(card).transform, border: getComputedStyle(card).borderTopColor, name: (b.textContent||'').trim(), desc: b.getAttribute('aria-describedby') }); })()`));
    // WebKit, como Safari en macOS, no lleva Tab a los botones por defecto (preferencia del
    // sistema): ahí se comprueba el orden de tabulación declarado, no el recorrido real.
    const FOC = `(function(){ return JSON.stringify([].map.call(document.querySelectorAll('.pgw-card'), function(c){ return [].filter.call(c.querySelectorAll('a,button,input,select,textarea,[tabindex]'), function(e){ return e.tabIndex >= 0; }).map(function(e){ return e.className; }); })); })()`;
    const foc = JSON.parse(await P.ev(FOC));
    let prev = 'n/a';
    if (ENG === 'CR') { await P.p.keyboard.press('Shift+Tab'); await P.p.waitForTimeout(100);
      prev = await P.ev(`(function(){ var a=document.activeElement; return a && a.classList.contains('pgw-cta') ? a.getAttribute('data-dsc-go') : (a && a.closest && a.closest('.pgw-card') ? 'otro-dentro' : 'fuera'); })()`); }
    ok(`${ENG}.${w} teclado: el CTA es la única parada de foco de cada tarjeta`, foc.length === 2 && foc.every(l => l.length === 1 && l[0] === 'pgw-cta') && (ENG !== 'CR' || prev === 'intelligence'), JSON.stringify([foc, prev]));
    await P.ev(`document.querySelector('.pgw-card.is-ws .pgw-cta').focus()`);
    // v847 SE RE-DECIDE: el foco/hover enciende el borde azul y NO desplaza la tarjeta.
    // Reposo medido en la MISMA tarjeta, sin foco y con el puntero fuera (el hover también la enciende).
    await P.ev(`document.activeElement && document.activeElement.blur()`); await P.p.mouse.move(1, 1); await P.p.waitForTimeout(400);
    const rest = await P.ev(`getComputedStyle(document.querySelector('.pgw-card.is-ws')).borderTopColor`);
    await P.ev(`document.querySelector('.pgw-card.is-ws .pgw-cta').focus()`);
    ok(`${ENG}.${w} teclado: foco visible, borde encendido y sin desplazar la tarjeta`, kf.is && kf.outline !== 'none' && kf.lift === 'none' && kf.border !== rest, JSON.stringify([kf, rest]));
    ok(`${ENG}.${w} teclado: nombre y descripción accesibles`, /Workspace/.test(kf.name) && /pgw-ws-t/.test(kf.desc || ''));
    await P.p.keyboard.press('Enter'); await P.p.waitForTimeout(700);
    ok(`${ENG}.${w} teclado: Enter lleva a la portada`, (await P.ev('currentTab')) === 'workspace');
    await P.ctx.close();
  }
  // Cartera vacía: el Resumen no promociona; primero hay que crear patrimonio (contrato existente).
  const E = await page(browser, P_URL, { w: 390, assets: [] });
  ok(`${ENG} vacía: sin Gateway`, !JSON.parse(await E.ev(DASH)).shown);
  await E.ctx.close();
}

const { s, url: P_URL } = await serve();
for (const [ENG, L] of [['CR', chromium], ['WK', webkit]]) {
  const b = await L.launch();
  for (const w of [360, 390, 768, 1024, 1440]) for (const lang of ['es', 'en']) await run(ENG, b, w, lang);
  await personas(ENG, b);
  await b.close();
}
s.close();
console.log(`\nFREE-FUNNEL: ${pass}/${pass + fail} PASS` + (fail ? `\n  FALLOS:\n  - ${fails.join('\n  - ')}` : ''));
process.exit(fail ? 1 : 0);
