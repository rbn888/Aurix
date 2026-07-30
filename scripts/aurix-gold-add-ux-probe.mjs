#!/usr/bin/env node
/**
 * AURIX · GOLD ADD UX PROBE (SPEC GOLD-ADD-UX-POLISH-V1)
 *
 * Opens the real "Add physical gold" modal and MEASURES the three reported problems instead of
 * reasoning about CSS: does the CTA overlap form content, how many scroll containers exist, and
 * which blocks are present in the flow.
 *
 * Runs on the PRODUCTION origin with app.js swapped at the network layer (CDP Fetch), so the
 * price API's CORS allow-list keeps answering and the gold spot line resolves for real.
 *
 *   node --experimental-websocket scripts/aurix-gold-add-ux-probe.mjs [--remote] [--device=...]
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const REMOTE = process.argv.includes('--remote');
const ONLY = (process.argv.find(a => a.startsWith('--device=')) || '').split('=')[1] || null;
const ORIGIN = 'https://app.aurixsystem.io';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9900 + (process.pid % 90);
const profile = mkdtempSync(join(tmpdir(), 'aurix-gold-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (_) {}
    await sleep(250);
  }
  throw new Error('no devtools');
}
let id = 0; const pend = new Map(); const hs = [];
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method) hs.forEach(h => h(m));
});
const send = (a, b = {}, s) => Promise.race([
  new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, ...(s ? { sessionId: s } : {}) })); }),
  sleep(30000).then(() => { throw new Error('cdp timeout ' + a); }),
]);
const src = REMOTE ? await (await fetch(ORIGIN + '/app.js?v=607')).text() : await readFile(join(ROOT, 'app.js'), 'utf8');
const APPJS_B64 = Buffer.from(src
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'), 'utf8').toString('base64');
// styles.css TAMBIÉN se sirve desde el build bajo prueba: este SPEC es CSS-only, así que sin
// interceptarlo la sonda mediría la hoja de producción y no vería ningún cambio.
const CSS_B64 = Buffer.from(
  REMOTE ? await (await fetch(ORIGIN + '/styles.css?v=640')).text() : await readFile(join(ROOT, 'styles.css'), 'utf8'),
  'utf8').toString('base64');

const DEVICES = {
  Desktop: { w: 1280, h: 900, dsf: 1, mobile: false, ua: null },
  Tablet:  { w: 834,  h: 1112, dsf: 2, mobile: true,  ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  iPhone:  { w: 390,  h: 844, dsf: 3, mobile: true,  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  Android: { w: 412,  h: 915, dsf: 2.6, mobile: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' },
};

// Measures the SPEC's three problems on the live DOM.
const MEASURE = `(function(){
  var modal=document.querySelector('#modalOverlay .modal[data-mode="gold"]')||document.querySelector('#modalOverlay .modal[data-mode="asset"]');
  if(!modal) return JSON.stringify({error:'no modal'});
  var cta=modal.querySelector('.modal-cta');
  var btn=document.getElementById('btnSubmitAsset');
  var gold=document.getElementById('goldSection');
  if(!cta||!btn||!gold) return JSON.stringify({error:'no cta/gold'});
  var cr=cta.getBoundingClientRect();
  // ¿El CTA se superpone a algún campo del formulario? Con position:sticky el contenido
  // pasa POR DEBAJO de la barra: eso es exactamente "el botón tapa contenido".
  var fields=[].slice.call(modal.querySelectorAll('#goldSection .gold-field-block, #goldSection .gold-summary-card, #qtyGroup input, #qtyGroup label, #purchasePriceGroup, .wl-loc-field'));
  var overlapped=[];
  fields.forEach(function(f){
    if(!f.offsetParent && getComputedStyle(f).display==='none') return;
    var r=f.getBoundingClientRect();
    if(r.height<=0||r.width<=0) return;
    var ov=Math.min(r.bottom,cr.bottom)-Math.max(r.top,cr.top);
    var hov=Math.min(r.right,cr.right)-Math.max(r.left,cr.left);
    if(ov>2&&hov>2) overlapped.push({el:(f.id||f.className||'').toString().slice(0,42),px:Math.round(ov)});
  });
  // Contenedores con scroll vertical propio dentro del modal.
  var scrollers=[];
  [].slice.call(modal.querySelectorAll('*')).concat([modal]).forEach(function(n){
    var st=getComputedStyle(n);
    if((st.overflowY==='auto'||st.overflowY==='scroll')&&n.scrollHeight>n.clientHeight+4)
      scrollers.push((n.id||n.className||n.tagName).toString().slice(0,42));
  });
  var vis=function(id){var e=document.getElementById(id);if(!e)return 'absent';
    if(e.hidden)return 'hidden';var s=getComputedStyle(e);
    if(s.display==='none'||s.visibility==='hidden')return 'hidden';
    var r=e.getBoundingClientRect();return (r.height>0)?'VISIBLE':'zero';};
  var loc=modal.querySelector('.wl-loc-field');
  var locVis='absent';
  if(loc){var ls=getComputedStyle(loc);var lr=loc.getBoundingClientRect();
    locVis=(ls.display==='none')?'hidden':(lr.height>0?'VISIBLE':'zero');}
  return JSON.stringify({
    ctaPosition:getComputedStyle(cta).position,
    ctaOverlapsContent:overlapped.length>0, overlapped:overlapped.slice(0,6),
    scrollers:scrollers, scrollerCount:scrollers.length,
    adjustSaleScenario:vis('goldBuyerBlock'),
    internationalGoldPriceCard:vis('goldMarketRef'),
    locationCustodian:locVis,
    summaryCard:vis('goldSummaryCard'),
    formPreview:vis('formPreview'),
    purchasePrice:vis('purchasePriceGroup'),
    btnText:(document.getElementById('btnSubmitAsset')||{}).textContent,
    docScrollW:document.documentElement.scrollWidth, docClientW:document.documentElement.clientWidth
  });})()`;

const R = [];
const rec = (dev, k, v) => { R.push({ dev, k, v }); };

try {
  console.log(`\n════ GOLD ADD UX · ${REMOTE ? 'bundle desplegado' : 'build local'} ════`);
  for (const [name, D] of Object.entries(DEVICES)) {
    if (ONLY && ONLY !== name) continue;
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
    await S('Fetch.enable', { patterns: [{ urlPattern: '*app.js*', requestStage: 'Request' }, { urlPattern: '*styles.css*', requestStage: 'Request' }] });
    hs.push(async m => {
      if (m.method !== 'Fetch.requestPaused' || m.sessionId !== sessionId) return;
      const isCss = /styles\.css/.test(m.params.request.url);
      try {
        await S('Fetch.fulfillRequest', {
          requestId: m.params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: isCss ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8' }],
          body: isCss ? CSS_B64 : APPJS_B64,
        });
      } catch (_) {}
    });
    await S('Emulation.setDeviceMetricsOverride', { width: D.w, height: D.h, deviceScaleFactor: D.dsf, mobile: D.mobile });
    if (D.ua) await S('Emulation.setUserAgentOverride', { userAgent: D.ua });
    const ev = async expr => {
      const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result && r.result.value;
    };
    await S('Page.navigate', { url: ORIGIN + '/index.html' });
    for (let i = 0; i < 60; i++) { const o = await ev(`typeof _aurixMetalPick==='function'`).catch(() => false); if (o) break; await sleep(1000); }
    await sleep(2000);
    // Abrir el flujo real de oro y rellenarlo como lo haría el usuario.
    await ev(`(function(){try{openContextualModal('metal');}catch(_){}try{_aurixMetalPick('gold');}catch(_){}})()`);
    await sleep(2500);
    await ev(`(function(){var b=document.querySelector('#goldTypeRow [data-gold-type="bar"]');if(b)b.click();
      var k=document.querySelector('#goldSection [data-gold-karat="24"]')||document.querySelector('#goldSection .gold-karat-chip');if(k)k.click();
      var q=document.getElementById('assetQty');if(q){q.value='100';q.dispatchEvent(new Event('input',{bubbles:true}));}})()`).catch(() => {});
    await sleep(1500);
    const m = JSON.parse(await ev(MEASURE));
    console.log(`\n── ${name} (${D.w}x${D.h})`);
    if (m.error) { console.log('   ERROR ' + m.error); continue; }
    console.log(`   CTA position=${m.ctaPosition}  tapaContenido=${m.ctaOverlapsContent}  ${JSON.stringify(m.overlapped)}`);
    console.log(`   scrollers=${m.scrollerCount} ${JSON.stringify(m.scrollers)}`);
    console.log(`   AdjustSaleScenario=${m.adjustSaleScenario}  IntlGoldPriceCard=${m.internationalGoldPriceCard}  Custodia=${m.locationCustodian}`);
    console.log(`   summaryCard=${m.summaryCard}  formPreview=${m.formPreview}  purchasePrice=${m.purchasePrice}`);
    console.log(`   scrollHorizontal=${m.docScrollW > m.docClientW}  btn="${(m.btnText || '').trim().slice(0, 40)}"`);
    rec(name, 'm', m);

    // ── Valor estimado: debe recalcularse con tipo / pureza / unidad / cantidad ──
    // El recálculo NO es síncrono al click: leer el importe en el mismo turno devuelve
    // siempre el valor anterior y hace parecer que la tarjeta está muerta. Cada paso se
    // ejecuta en su propia evaluación con una espera antes de leer.
    const amt = () => ev(`(function(){var e=document.getElementById('goldSummaryAmount');return e?e.textContent.trim():'';})()`);
    const steps = [
      ['inicial', null],
      ['qty=250', `(function(){var q=document.getElementById('assetQty');if(q){q.value='250';q.dispatchEvent(new Event('input',{bubbles:true}));}})()`],
      ['unidad=oz', `(function(){var b=document.querySelector('#goldUnitRow [data-gold-unit="oz"]');if(b)b.click();})()`],
      ['pureza=18K', `(function(){var b=document.querySelector('#goldSection [data-gold-karat="18"]');if(b)b.click();})()`],
      ['tipo=joyería', `(function(){var b=document.querySelector('#goldTypeRow [data-gold-type="jewelry"]');if(b)b.click();})()`],
    ];
    const seen = [];
    for (const [label, act] of steps) {
      if (act) { await ev(act); await sleep(700); }
      seen.push(label + '=' + (await amt()));
    }
    const distinct = new Set(seen.map(x => x.split('=').slice(1).join('='))).size;
    console.log(`   valorEstimado reactivo: ${distinct > 1 ? 'SI' : 'NO'} (${distinct} valores)  ${JSON.stringify(seen)}`);
    rec(name, 'react', { seen, distinct });

    // ── Hueco muerto al final: distancia entre el fondo del CTA y el fondo del scroll ──
    const gap = await ev(`(function(){var f=document.getElementById('assetForm');
      var c=document.querySelector('.modal[data-mode="gold"] .modal-cta');if(!f||!c)return -1;
      f.scrollTop=f.scrollHeight;
      var fr=f.getBoundingClientRect(),cr=c.getBoundingClientRect();
      return Math.round(fr.bottom-cr.bottom);})()`);
    console.log(`   hueco tras el CTA al final del scroll: ${gap}px`);
    rec(name, 'gap', gap);

    // ── Teclado abierto (móvil): el campo enfocado sigue visible y el CTA no lo tapa ──
    if (D.mobile) {
      const kb = JSON.parse(await ev(`(function(){
        var inp=document.getElementById('assetPurchasePrice')||document.getElementById('assetQty');
        if(!inp)return JSON.stringify({err:'no input'});
        inp.focus(); if(inp.scrollIntoView)inp.scrollIntoView({block:'center'});
        var f=document.getElementById('assetForm');
        var ir=inp.getBoundingClientRect(),fr=f.getBoundingClientRect();
        var c=document.querySelector('.modal[data-mode="gold"] .modal-cta');var cr=c.getBoundingClientRect();
        var ov=Math.min(ir.bottom,cr.bottom)-Math.max(ir.top,cr.top);
        var hov=Math.min(ir.right,cr.right)-Math.max(ir.left,cr.left);
        return JSON.stringify({visible:(ir.top>=fr.top-1&&ir.bottom<=fr.bottom+1),
          coveredByCta:(ov>2&&hov>2), hScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth});})()`));
      console.log(`   teclado: campoVisible=${kb.visible} tapadoPorCTA=${kb.coveredByCta} scrollH=${kb.hScroll}`);
      rec(name, 'kb', kb);
    }

    // ── REGRESIÓN: un activo NO-oro debe quedar exactamente como estaba ──
    const nong = JSON.parse(await ev(`(function(){
      try{ if(typeof closeModal==='function')closeModal(); }catch(_){}
      try{ openContextualModal('stock'); }catch(_){}
      return JSON.stringify({opened:true});})()`));
    await sleep(1200);
    await ev(`(function(){try{selectAsset({ticker:'AAPL',name:'Apple Inc',type:'stock',price:190,currency:'USD'});}catch(_){}})()`).catch(() => {});
    await sleep(1200);
    const reg = JSON.parse(await ev(`(function(){
      var modal=document.querySelector('#modalOverlay .modal[data-mode="asset"]');
      if(!modal)return JSON.stringify({err:'no asset modal'});
      var loc=modal.querySelector('.wl-loc-field');
      var lv=loc?(getComputedStyle(loc).display==='none'?'hidden':(loc.getBoundingClientRect().height>0?'VISIBLE':'zero')):'absent';
      var cta=modal.querySelector('.modal-cta');
      return JSON.stringify({custodiaNoOro:lv,ctaPos:cta?getComputedStyle(cta).position:'-'});})()`));
    console.log(`   NO-oro (regresión): custodia=${reg.custodiaNoOro} ctaPos=${reg.ctaPos}`);
    rec(name, 'reg', reg);

    await send('Target.closeTarget', { targetId });
  }
  console.log('\nJSON ' + JSON.stringify(R));
} catch (e) {
  console.log('PROBE ERROR: ' + (e && e.message));
  process.exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
