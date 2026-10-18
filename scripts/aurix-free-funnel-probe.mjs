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
    cards: cards.map(function(c){ var cb=R(c), cta=c.querySelector('.pgw-cta'), t=c.querySelector('.pgw-t'), tier=c.querySelector('.pgw-tier');
      return { box: cb, titleDy: Math.round(R(t).t-cb.t), ctaFromBottom: Math.round(cb.b-R(cta).b), ctaH: Math.round(R(cta).h), ctaW: Math.round(R(cta).w),
        tier: tier ? tier.textContent.trim() : '', dest: cta.getAttribute('data-dsc-go'),
        real: [].map.call(c.querySelectorAll('.pgw-row.is-real .pgw-row-t'), function(e){ return e.textContent.trim(); }),
        locked: [].map.call(c.querySelectorAll('.pgw-row.is-locked'), function(e){ return e.textContent.trim(); }),
        tiles: c.querySelectorAll('.pgw-tile').length, verbs: [].map.call(c.querySelectorAll('.pgw-row:not(.is-real):not(.is-locked) .pgw-row-t'), function(e){ return e.textContent.trim(); }),
        anim: getComputedStyle(c).animationName, dur: getComputedStyle(c).animationDuration, iter: getComputedStyle(c).animationIterationCount,
        orbAnim: c.querySelector('.pgw-orb') ? getComputedStyle(c.querySelector('.pgw-orb')).animationName : null,
        inView: cb.l >= -0.5 && cb.r <= innerWidth + 0.5 }; }),
    facts: facts ? { state: facts.state, first: facts.visible && facts.visible[0] ? facts.visible[0].text : null } : null,
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
    anim: getComputedStyle(c).animationName, dur: getComputedStyle(c).animationDuration }); })()`;
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
  ok(`${T} etiqueta Premium discreta en las dos`, ci.tier === 'Premium' && cw.tier === 'Premium');
  ok(`${T} CTA primario táctil (≥44 px) y dentro de la tarjeta`, ci.ctaH >= 44 && cw.ctaH >= 44 && ci.inView && cw.inView);
  ok(`${T} Intelligence: la ÚNICA lectura es el primer hecho certificado de su portada`, d.facts && d.facts.state === 'ok' && ci.real.length === 1 && ci.real[0] === d.facts.first, JSON.stringify([ci.real, d.facts]));
  ok(`${T} Intelligence: dos capas bloqueadas inequívocas, sin cifras`, ci.locked.length === 2 && ci.locked.every(x => !/\d/.test(x) && /Premium/.test(x)), JSON.stringify(ci.locked));
  ok(`${T} Workspace: la caja son las capacidades PUBLICADAS y los verbos usan sus nombres`, cw.tiles === Math.min(9, d.pub.length) && cw.verbs.length === 3 && cw.verbs.every(v => d.pub.some(n => v.endsWith(n))), JSON.stringify([cw.tiles, cw.verbs]));
  ok(`${T} Workspace: «calcula, organiza y planifica»`, en ? /^Calculate .*Organise .*Plan /.test(cw.verbs.join(' ')) : /^Calcula .*Organiza .*Planifica /.test(cw.verbs.join(' ')), cw.verbs.join(' | '));
  ok(`${T} entrada única de 180–220 ms, sin bucle`, [ci, cw].every(c => (c.anim === 'none' || c.anim === 'pgwIn') && c.iter !== 'infinite' && (c.anim === 'none' || (parseFloat(c.dur) >= 0.18 && parseFloat(c.dur) <= 0.22))), JSON.stringify([ci.anim, ci.dur, ci.iter]));
  ok(`${T} Resumen sin desbordamiento horizontal`, !d.overX);
  // Un repintado (precio nuevo, vuelta de categoría) no repite la entrada.
  const settled = await P.ev(`(function(){ updateDashboardDiscover(); return document.getElementById('dashDiscoverSection').classList.contains('pgw-settled'); })()`);
  ok(`${T} un repintado no vuelve a animar la entrada`, settled === true);
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
    ok(`${ENG}.${w} incompleta: el Gateway no afirma ninguna lectura`, d.n === 2 && d.facts.state !== 'ok' && d.cards[0].real.length === 0 && d.cards[0].locked.length === 2, JSON.stringify([d.facts, d.cards[0] && d.cards[0].real]));
    ok(`${ENG}.${w} incompleta: tarjetas iguales igualmente`, Math.abs(d.cards[0].box.h - d.cards[1].box.h) <= 1 && Math.abs(d.cards[0].titleDy - d.cards[1].titleDy) <= 1);
    await P.ev(`switchTab('intelligence')`); await P.p.waitForTimeout(700);
    const c = JSON.parse(await P.ev(COVER));
    ok(`${ENG}.${w} incompleta: la portada dice qué falta, sin hechos ni capas inventadas`, !c.none && c.visibleFacts.length === 0 && c.locked.length === 0 && c.ctaVisible, JSON.stringify(c));
    ok(`${ENG}.${w} incompleta: sin errores`, !P.errs.length, P.errs.join(' | '));
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
    ok(`${ENG}.${w} reduced-motion: Gateway sin animación`, d.cards.every(x => x.anim === 'none' && (x.orbAnim === null || x.orbAnim === 'none')), JSON.stringify(d.cards.map(x => [x.anim, x.orbAnim])));
    await P.ev(`switchTab('workspace')`); await P.p.waitForTimeout(500);
    const rc = JSON.parse(await P.ev(COVER));
    ok(`${ENG}.${w} reduced-motion: portada sin animación`, rc.anim === 'none', rc.anim);
    await P.ctx.close();
    // Teclado: una parada de foco por tarjeta, foco visible, Enter navega.
    P = await page(browser, P_URL, { w, h: H(w) });
    await P.ev(`(function(){ var b=document.querySelector('.pgw-card.is-ws .pgw-cta'); b.focus(); })()`); await P.p.waitForTimeout(500);
    const kf = JSON.parse(await P.ev(`(function(){ var b=document.activeElement; var cs=getComputedStyle(b); var card=b.closest('.pgw-card'); return JSON.stringify({ is: b.classList.contains('pgw-cta'), outline: cs.outlineStyle, ring: cs.outlineWidth, lift: getComputedStyle(card).transform, name: (b.textContent||'').trim(), desc: b.getAttribute('aria-describedby') }); })()`));
    // WebKit, como Safari en macOS, no lleva Tab a los botones por defecto (preferencia del
    // sistema): ahí se comprueba el orden de tabulación declarado, no el recorrido real.
    const FOC = `(function(){ return JSON.stringify([].map.call(document.querySelectorAll('.pgw-card'), function(c){ return [].filter.call(c.querySelectorAll('a,button,input,select,textarea,[tabindex]'), function(e){ return e.tabIndex >= 0; }).map(function(e){ return e.className; }); })); })()`;
    const foc = JSON.parse(await P.ev(FOC));
    let prev = 'n/a';
    if (ENG === 'CR') { await P.p.keyboard.press('Shift+Tab'); await P.p.waitForTimeout(100);
      prev = await P.ev(`(function(){ var a=document.activeElement; return a && a.classList.contains('pgw-cta') ? a.getAttribute('data-dsc-go') : (a && a.closest && a.closest('.pgw-card') ? 'otro-dentro' : 'fuera'); })()`); }
    ok(`${ENG}.${w} teclado: el CTA es la única parada de foco de cada tarjeta`, foc.length === 2 && foc.every(l => l.length === 1 && l[0] === 'pgw-cta') && (ENG !== 'CR' || prev === 'intelligence'), JSON.stringify([foc, prev]));
    await P.ev(`document.querySelector('.pgw-card.is-ws .pgw-cta').focus()`);
    ok(`${ENG}.${w} teclado: foco visible y la tarjeta se eleva (≤3 px)`, kf.is && kf.outline !== 'none' && (function(m){ return !!m && -m[1] >= 2 && -m[1] <= 3; })(/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/.exec(kf.lift)), JSON.stringify(kf));
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
