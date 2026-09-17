#!/usr/bin/env node
/**
 * AURIX · SPEC P0 «PORTADAS FREE + GUARD WORKSPACE + INPUTS NUMÉRICOS + MI ESPACIO»
 * SONDA EN NAVEGADOR REAL (Chrome/CDP) SOBRE LOS BYTES DEL CANDIDATO.
 *
 * POR QUÉ EXISTE, y esto es el hallazgo del bloque de investigación del gate:
 *   `docs/AURIX-WORKSPACE-NUMERIC-TRUTH-harness.js` daba VERDE al contrato de
 *   edición numérica llamando a `_wsNum` DIRECTAMENTE en un sandbox de `vm`. Nunca
 *   despachó un evento, nunca tocó un `<input>` y nunca leyó el estado después de
 *   una pulsación: no podía detectar «no me deja borrar» ni en un sentido ni en el
 *   otro. Su verde no era falso, era IRRELEVANTE para lo que afirmaba cubrir.
 *   Esta sonda recorre el camino que la SPEC exige —DOM → evento → handler →
 *   estado → render— con eventos de TECLADO REALES de CDP (`Input.dispatchKeyEvent`
 *   y `Input.insertText`), no con `new Event('input')` sintético.
 *
 * SIRVE EL LOCAL: un servidor estático sobre la copia de trabajo, con el ÚNICO
 * parche de la navegación de auth (misma receta que las sondas de Market y de Add
 * Asset), así que el resto del bundle es el candidato tal cual.
 *
 * LAS TRES PERSONAS se montan escribiendo `_aurixEnt` —la superficie SANEADA que
 * el resolver del servidor deja— y nada más: no se stubea `hasFeature`, ni el
 * guard, ni el render. Es la única palanca honesta que existe en el cliente.
 *
 *   node --experimental-websocket scripts/aurix-p0-free-boundary-probe.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(ROOT, 'docs', 'p0-free-boundary');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const abs = normalize(join(ROOT, p));
    if (!abs.startsWith(ROOT)) return res.writeHead(403).end();
    let body = await readFile(abs);
    if (abs.endsWith('app.js')) {
      body = Buffer.from(String(body)
        .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
        .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0'));
    }
    res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const PORT = 9500 + (process.pid % 400);
const profile = mkdtempSync(join(tmpdir(), 'aurix-p0-'));
spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
let wsu = null;
for (let i = 0; i < 100; i++) {
  try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) { wsu = j.webSocketDebuggerUrl; break; } } catch (_) {}
  await sleep(250);
}
if (!wsu) { console.error('FAIL — no devtools'); process.exit(1); }
const ws = new WebSocket(wsu);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let _id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (a, b = {}, s) => Promise.race([
  new Promise((res, rej) => { const i = ++_id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, ...(s ? { sessionId: s } : {}) })); }),
  // 90 s, y no por generosidad: algunas superficies recomputan su motor en cada
  // tecla, y un campo de PLAZO con una cifra de miles («250.000» años) hace que el
  // repintado tarde de verdad. Es un coste real del producto, no de la sonda.
  sleep(90000).then(() => { throw new Error('cdp timeout: ' + a); }),
]);
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const ev = async expression => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300));
  return r.result && r.result.value;
};
const J = async expr => JSON.parse(await ev(expr));

// Se puede ejecutar una sección sola (`AURIX_P0_ONLY=AB`) para reverificar un
// arreglo puntual sin pagar la matriz numérica entera. Sin la variable, todo.
const ONLY = String(process.env.AURIX_P0_ONLY || '').toUpperCase();
const run = sec => !ONLY || ONLY.indexOf(sec) !== -1;
let pass = 0; const fails = [];
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n + (info ? '  [' + info + ']' : '')); } else { fails.push(n + (info ? '  [' + info + ']' : '')); console.log('  ✗ ' + n + (info ? '  [' + info + ']' : '')); } };

// ── teclado REAL ───────────────────────────────────────────────────────────
const CODE = { '0': ['Digit0', 48], '1': ['Digit1', 49], '2': ['Digit2', 50], '3': ['Digit3', 51], '4': ['Digit4', 52], '5': ['Digit5', 53], '6': ['Digit6', 54], '7': ['Digit7', 55], '8': ['Digit8', 56], '9': ['Digit9', 57], '.': ['Period', 190], ',': ['Comma', 188], '-': ['Minus', 189] };
async function typeStr(str) {
  for (const ch of str) {
    const c = CODE[ch] || ['Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0)];
    await S('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: c[0], windowsVirtualKeyCode: c[1], nativeVirtualKeyCode: c[1], text: ch, unmodifiedText: ch });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: c[0], windowsVirtualKeyCode: c[1], nativeVirtualKeyCode: c[1] });
  }
}
async function backspace(n = 1) {
  for (let i = 0; i < n; i++) {
    await S('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  }
}
// PEGAR DE VERDAD. Un `ClipboardEvent` sintético NO es de confianza y Chrome no
// inserta nada: la primera versión de esta sonda lo usó y marcó «pegar» en rojo
// para los 14 campos. `Input.insertText` es la inserción del navegador.
const paste = txt => S('Input.insertText', { text: txt });

async function load(w, h, mobile) {
  await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, mobile });
  // `reducedMotion` es un `const` capturado al cargar el bundle, así que no se
  // puede forzar desde la consola: se emula la MEDIA FEATURE antes de navegar.
  // Además de hacer la medición estable, es la ruta que `switchTab` usa para
  // intercambiar secciones al instante en vez de con dos fases de opacidad.
  try { await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); } catch (_) {}
  await S('Page.navigate', { url: ORIGIN + '/index.html' });
  for (let i = 0; i < 160; i++) {
    const r = await ev(`typeof renderWorkspaceHome==='function' && typeof _wsRenderTool==='function' && typeof _aurixIntelligencePreviewHTML==='function'`).catch(() => false);
    if (r) break;
    await sleep(250);
  }
  await sleep(600);
}
// Monta la persona escribiendo la superficie saneada del resolver. Nada más.
const PERSONA = {
  pending: `_aurixEnt={loaded:false,loading:false,error:null,plan:'free',status:'none',source:'default',validUntil:null,features:Object.create(null),sources:Object.create(null),fetchedAt:0};`,
  free:    `_aurixEnt={loaded:true,loading:false,error:null,plan:'free',status:'none',source:'default',validUntil:null,features:Object.create(null),sources:Object.create(null),fetchedAt:Date.now()};`,
  premium: `(function(){var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});_aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'plan',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};})();`,
  founder: `(function(){var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=true;});_aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'override',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};})();`,
};
const persona = p => ev(PERSONA[p] + 'true');
const wsView = () => ev(`(function(){var r=document.querySelector('#aurixWorkspace .aurix-wsh');return r?r.getAttribute('data-wsh-view'):'none';})()`);
const showWs = () => ev(`(function(){var c=document.getElementById('aurixWorkspace');c.style.display='block';return true;})()`);
// El despachador es idempotente A PROPÓSITO: con Home ya pintado, un tick de precio
// sólo refresca métricas. Para observar un repintado tras CAMBIAR de persona hay
// que pedirlo por el owner que fuerza el repaint —y que pasa por el guard—, igual
// que hace el producto al cambiar de pestaña interna.
const repaintWs = () => ev(`(function(){ _wshRepaintHome(); return true; })()`);

console.log('AURIX · P0 FREE BOUNDARY — sonda en navegador real\n');
await load(390, 844, true);
ok('0.1 el bundle del candidato arranca sin errores de boot',
  (await J(`JSON.stringify((window.__AURIX_BOOT&&window.__AURIX_BOOT.errors)||[])`)).length === 0);

// ══════════════════════════════════════════════════════════════════════════
if (run('A')) {
console.log('\nA · INTELLIGENCE FREE');
// ══════════════════════════════════════════════════════════════════════════
await persona('free');
// El motor real con una cartera que SÍ produce tres hechos. Se sustituye sólo la
// fuente de hechos (los datos de cartera), nunca el renderizador ni el reparto.
const INT = async n => J(`(function(){
  var facts=[{kind:'concentration',text:t('intprev_f_conc')(47,'Bitcoin')},
             {kind:'liquidity',text:t('intprev_f_liq')(12)},
             {kind:'watch:crypto',title:'Exposición alta a cripto',text:'x'}].slice(0,${n});
  var real=_aurixIntelligencePreviewFacts;
  _aurixIntelligencePreviewFacts=function(){var o={facts:facts,state:'ok',reason:''};o.visible=facts.slice(0,1);o.locked=facts.slice(1,3);return o;};
  var host=document.getElementById('tabPlaceholder')||document.body;
  host.innerHTML=renderIntelligenceTab();
  _aurixIntelligencePreviewFacts=real;
  var st=host.querySelector('.intprev-stage');
  var vis=host.querySelectorAll('.intprev-fact:not(.is-locked)');
  var lok=host.querySelectorAll('.intprev-fact.is-locked');
  var txt=(st?st.innerText:'')||'';
  return JSON.stringify({
    stage:!!st, visible:vis.length, locked:lok.length,
    visibleText:[].map.call(vis,function(x){return x.innerText.trim();}),
    lockedText:[].map.call(lok,function(x){return (x.innerText||'').trim()+'|'+(x.textContent||'').trim();}),
    lockedAria:[].map.call(lok,function(x){return x.getAttribute('aria-label');}),
    ctas:host.querySelectorAll('.intprev-cta').length,
    ctaLabel:(host.querySelector('.intprev-cta')||{}).innerText,
    ctaFeature:(host.querySelector('.intprev-cta')||{}).getAttribute?host.querySelector('.intprev-cta').getAttribute('data-premium-cta'):null,
    premiumWord:/premium/i.test(txt), invertibleWord:/invertible/i.test(txt),
    note:(host.querySelector('.intprev-locked-n')||{}).innerText||'',
    lockedAttr:st?st.getAttribute('data-preview-locked'):null
  });
})()`);
let a = await INT(3);
ok('A.1 exactamente UN análisis visible', a.visible === 1, 'visible=' + a.visible);
ok('A.2 exactamente DOS análisis bloqueados', a.locked === 2, 'locked=' + a.locked);
ok('A.3 el análisis visible es el del caso observado',
  /El 47% de tu patrimonio depende de Bitcoin\./.test(a.visibleText.join(' ')), a.visibleText.join(' | '));
ok('A.4 la palabra «invertible» no aparece en la portada', a.invertibleWord === false);
ok('A.5 CERO texto filtrado por los bloqueados (ni innerText ni textContent)',
  a.lockedText.every(x => x === '|'), JSON.stringify(a.lockedText));
ok('A.6 la etiqueta accesible del bloqueado no revela categoría ni juicio',
  a.lockedAria.every(x => x && !/concentraci|liquidez|cripto|bitcoin|47/i.test(x)), JSON.stringify(a.lockedAria));
ok('A.7 CERO menciones a «Premium» antes del clic', a.premiumWord === false);
ok('A.8 UN solo CTA, y es «Ver el análisis completo»',
  a.ctas === 1 && /Ver el análisis completo/.test(a.ctaLabel || ''), a.ctas + ' / ' + a.ctaLabel);
ok('A.9 el CTA declara la feature del owner canónico', a.ctaFeature === 'intelligence.full', String(a.ctaFeature));
ok('A.10 la anticipación dice CUÁNTOS hay y nada más', /2 análisis más/.test(a.note), a.note);
// No se inventa un tercero: con dos hechos reales sólo se bloquea uno.
let a2 = await INT(2);
ok('A.11 con dos hechos reales se bloquea UNO (no se inventa)', a2.visible === 1 && a2.locked === 1,
  a2.visible + '/' + a2.locked);
// El CTA abre el paywall CANÓNICO, no un overlay intermedio. Se repinta la portada
// de tres hechos primero: A.11 la dejó con dos, y comprobar «intacta» sobre otro
// render sería comprobar otra cosa.
a = await INT(3);
ok('A.12 pulsar el CTA abre el paywall canónico, sin paso intermedio', await ev(`(function(){
  var b=document.querySelector('.intprev-cta'); if(!b) return false;
  b.click();
  var pay=document.querySelector('.aurix-premium-overlay.is-open')||document.querySelector('.aurix-premium-overlay');
  var mid=document.getElementById('upgradeOverlay');
  return !!(pay && pay.style.display==='flex') && !(mid && mid.classList.contains('open'));
})()`));
ok('A.13 cerrar el pago devuelve a la portada, intacta', await ev(`(function(){
  if (window.closeAurixPremiumModal) window.closeAurixPremiumModal();
  var st=document.querySelector('.intprev-stage');
  return !!st && st.querySelectorAll('.intprev-fact').length===3;
})()`));
// Premium NO ve la portada.
await persona('premium');
ok('A.14 Premium no ve la portada: entra en Intelligence', await ev(`(function(){
  var host=document.getElementById('tabPlaceholder')||document.body;
  host.innerHTML=renderIntelligenceTab();
  return host.querySelectorAll('.intprev-stage').length===0;
})()`));

// ══════════════════════════════════════════════════════════════════════════
}

if (run('B')) {
console.log('\nB · WORKSPACE FREE — LA PORTADA NO SE PUEDE SALTAR');
// ══════════════════════════════════════════════════════════════════════════
await showWs();
await persona('free');
const PATHS = [
  ['navegación inferior',        `switchTab('workspace');`],
  ['Market → Workspace',         `switchTab('market'); switchTab('workspace');`],
  ['Dashboard → Workspace',      `switchTab('home'); switchTab('workspace');`],
  ['Intelligence → Workspace',   `switchTab('intelligence'); switchTab('workspace');`],
  ['atrás (estado SPA previo)',  `_wshView='home'; _wsTab='space'; renderWorkspaceHome();`],
  ['adelante (vista interior)',  `_wshView='workspace'; renderWorkspaceHome();`],
  ['ruta profunda a Objetivos',  `_wshView='goals'; renderWorkspaceHome();`],
  ['ruta profunda a Escenarios', `_wshView='scenario'; renderWorkspaceHome();`],
  ['ruta profunda a Proyección', `_wshView='planning'; renderWorkspaceHome();`],
  // El idioma es un owner único (`switchLang`) que repinta la sección activa: si el
  // guard viviera en el render de la portada y no en el despachador, un cambio de
  // idioma sería una vía de escape más.
  ['cambiar de idioma',          `if (typeof switchLang === 'function') switchLang(lang === 'es' ? 'en' : 'es'); renderWorkspaceHome();`],
  ['y volver al idioma inicial', `if (typeof switchLang === 'function') switchLang('es'); renderWorkspaceHome();`],
  ['pestaña Plantillas directa', `_wshView='home'; _wsTab='templates'; renderWorkspaceHome();`],
  ['pestaña Interno directa',    `_wshView='home'; _wsTab='internal'; renderWorkspaceHome();`],
  ['reentrar en la sección',     `renderWorkspace();`],
  ['cancelar el pago',           `if(window.closeAurixPremiumModal)window.closeAurixPremiumModal(); renderWorkspaceHome();`],
];
for (const [label, js] of PATHS) {
  await ev(`(function(){ ${js} return true; })()`);
  await sleep(120);
  const v = await wsView();
  const inner = await J(`JSON.stringify({tabs:document.querySelectorAll('#aurixWorkspace .wsh-tab').length,cols:document.querySelectorAll('#aurixWorkspace .wsh-mse2-col').length,studio:document.querySelectorAll('#aurixWorkspace .wsh-studio-root').length})`);
  ok('B.' + label + ' → la portada Free permanece',
    v === 'free_cover' && inner.tabs === 0 && inner.cols === 0 && inner.studio === 0,
    'view=' + v + ' ' + JSON.stringify(inner));
}
// recarga completa: el guard no depende de estado de sesión
await load(390, 844, true); await showWs(); await persona('free');
await ev(`switchTab('workspace'); true`); await sleep(250);
ok('B.recarga → la portada Free permanece', (await wsView()) === 'free_cover', await wsView());
// las dos capacidades Free abren, y salir devuelve a la portada
for (const cap of ['compound', 'realestate']) {
  await ev(`(function(){var b=document.querySelector('[data-wsfc-open="${cap}"]'); if(b) b.click(); return !!b;})()`);
  await sleep(200);
  ok('B.capacidad Free «' + cap + '» abre', (await wsView()) === 'tool', await wsView());
  await ev(`(function(){var b=document.querySelector('#aurixWorkspace [data-wsh-nav="back"]'); if(b) b.click(); return !!b;})()`);
  await sleep(200);
  ok('B.salir de «' + cap + '» devuelve a la portada, no al interior', (await wsView()) === 'free_cover', await wsView());
}
// ruta directa a una capacidad Premium
await ev(`_wsOpenTool('loan'); true`); await sleep(200);
ok('B.ruta directa a una capacidad Premium no monta la capacidad',
  (await wsView()) === 'free_cover', await wsView());
ok('B.y lleva al flujo comercial autorizado', await ev(`(function(){
  var pay=document.querySelector('.aurix-premium-overlay');
  var mid=document.getElementById('upgradeOverlay');
  return !!(pay && pay.style.display==='flex') && !(mid && mid.classList.contains('open'));
})()`));
await ev(`if(window.closeAurixPremiumModal)window.closeAurixPremiumModal(); true`);
// el CTA de la portada
ok('B.CTA «Ver Workspace completo» abre el pago SIN modal intermedio', await ev(`(function(){
  _wshView='free_cover'; renderWorkspaceHome();
  var b=document.querySelector('#aurixWorkspace .wsfc-cta'); if(!b) return false;
  var lbl=b.innerText||'';
  b.click();
  var pay=document.querySelector('.aurix-premium-overlay');
  var mid=document.getElementById('upgradeOverlay');
  return /Ver Workspace completo/.test(lbl) && !!(pay&&pay.style.display==='flex') && !(mid&&mid.classList.contains('open'));
})()`));
ok('B.cancelar el pago devuelve a la portada Free', await ev(`(function(){
  if(window.closeAurixPremiumModal)window.closeAurixPremiumModal();
  renderWorkspaceHome();
  var r=document.querySelector('#aurixWorkspace .aurix-wsh');
  return !!r && r.getAttribute('data-wsh-view')==='free_cover';
})()`));
// el entitlement todavía sin resolver: ni interior ni portada comercial
await persona('pending');
await ev(`_wshView='home'; renderWorkspaceHome(); true`); await sleep(120);
ok('B.entitlement sin resolver: ni interior ni oferta comercial',
  (await wsView()) === 'pending', await wsView());
// Premium monta el interior
await persona('premium');
await ev(`_wshView='free_cover'; _wsTab='space'; renderWorkspaceHome(); true`); await sleep(150);
await repaintWs(); await sleep(120);
let prem = await J(`JSON.stringify({view:(document.querySelector('#aurixWorkspace .aurix-wsh')||{}).getAttribute?document.querySelector('#aurixWorkspace .aurix-wsh').getAttribute('data-wsh-view'):null,
  tabs:[].map.call(document.querySelectorAll('#aurixWorkspace .wsh-tab'),function(x){return x.getAttribute('data-wstab');})})`);
ok('B.Premium entra directamente en Workspace completo', prem.view === 'home', JSON.stringify(prem));
ok('B.Premium normal NO ve la pestaña Interno',
  prem.tabs.length === 3 && prem.tabs.indexOf('internal') === -1, JSON.stringify(prem.tabs));
// founder con override global: sigue sin Interno hasta activarlo a mano
await persona('founder');
await repaintWs(); await sleep(120);
let f1 = await J(`JSON.stringify([].map.call(document.querySelectorAll('#aurixWorkspace .wsh-tab'),function(x){return x.getAttribute('data-wstab');}))`);
ok('B.un override global Premium NO muestra Interno automáticamente',
  f1.indexOf('internal') === -1, JSON.stringify(f1));
await ev(`window.aurixFounderView(true); true`); await sleep(150);
await repaintWs(); await sleep(100);
let f2 = await J(`JSON.stringify([].map.call(document.querySelectorAll('#aurixWorkspace .wsh-tab'),function(x){return x.getAttribute('data-wstab');}))`);
ok('B.la vista técnica de fundador SÍ la muestra al activarla',
  f2.indexOf('internal') !== -1, JSON.stringify(f2));
// y un flag local sin derecho no concede nada
await persona('premium');
await repaintWs(); await sleep(120);
let f3 = await J(`JSON.stringify([].map.call(document.querySelectorAll('#aurixWorkspace .wsh-tab'),function(x){return x.getAttribute('data-wstab');}))`);
ok('B.el flag local SIN derecho del servidor no concede Interno',
  f3.indexOf('internal') === -1, JSON.stringify(f3));
await ev(`window.aurixFounderView(false); true`);

// ══════════════════════════════════════════════════════════════════════════
}

if (run('C')) {
console.log('\nC · INPUTS NUMÉRICOS — DOM → EVENTO → HANDLER → ESTADO → RENDER');
// ══════════════════════════════════════════════════════════════════════════
const MOUNT = {
  compound:   `_wsToolActive='compound';_wsToolInputs=_wsToolDefaultsFor('compound');_wsToolEditId=null;_wsToolDirty=false;c.innerHTML=_wsRenderTool();`,
  realestate: `_wsToolActive='realestate';_wsToolInputs=_wsToolDefaultsFor('realestate');_wsReDraft=_wsReNewDraft();c.innerHTML=_wsRenderTool();`,
  loan:       `_wsToolActive='loan';_wsToolInputs=_wsToolDefaultsFor('loan');_wsToolEditId=null;c.innerHTML=_wsRenderTool();`,
  scenario:   `_wshView='scenario';c.innerHTML=_renderScenarioBuilder();`,
  budget:     `_wsToolActive='budget';_wsToolInputs=_wsToolDefaultsFor('budget');_wsToolEditId=null;c.innerHTML=_wsRenderTool();`,
  receivables:`_wsToolActive='receivables';_wsToolInputs=_wsToolDefaultsFor('receivables');_wsRecvDraft=_wsRecvNewDraft();c.innerHTML=_wsRenderTool();`,
  goals:      `_wshView='goals';c.innerHTML=_renderGoals();`,
  journal:    `_wsToolActive='journal';_wsToolInputs=_wsToolDefaultsFor('journal');_wsJrnDraft=_wsJrnNewDraft();c.innerHTML=_wsRenderTool();`,
};
const ATTRS = ['wstool-input', 'wsre-input', 'wsrecv-input', 'wsjrn-input', 'wsap-input', 'wsg-form', 'wsg-input', 'wsb-param', 'wsloan-cmp-input'];
async function mount(name) {
  return J(`(function(){_wshWireOnce();var c=document.getElementById('aurixWorkspace');c.style.display='block';
    ${MOUNT[name]}
    var out=[];
    [].forEach.call(c.querySelectorAll('input[inputmode="decimal"]'),function(i){
      var attr=null,k=null;
      ${JSON.stringify(ATTRS)}.forEach(function(a){ if(k===null && i.getAttribute('data-'+a)!==null){attr=a;k=i.getAttribute('data-'+a);} });
      if(attr) out.push({attr:attr,k:k,v:i.value});
    });
    return JSON.stringify(out);})()`);
}
const q = f => `[data-${f.attr}="${f.k}"]`;
const dom = f => ev(`(function(){var e=document.querySelector('${q(f)}');return e?e.value:'<<GONE>>';})()`);
const focusAll = f => ev(`(function(){var e=document.querySelector('${q(f)}');e.focus();e.setSelectionRange(0,e.value.length);return e.value;})()`);
const blur = f => ev(`(function(){var e=document.querySelector('${q(f)}');e.blur();})()`);
const numOf = v => ev(`_wsNum(${JSON.stringify(String(v))})`);

// ── EL PRESUPUESTO DE ESTA MATRIZ, DICHO ───────────────────────────────────
// Cada pulsación es un viaje de ida y vuelta por CDP, y borrar un campo carácter a
// carácter son dos por tecla. Ocho capacidades × ~50 campos decimales × cuatro
// combinaciones de viewport/idioma con borrado tecla a tecla en todas se va a más
// de una hora, y una sonda que nadie ejecuta no es evidencia de nada. Así que el
// reparto es explícito:
//   · MÓVIL/ES —el caso que el founder reportó— recorre TODOS los campos
//     decimales de las ocho capacidades con borrado TECLA A TECLA;
//   · las otras tres combinaciones recorren los dos primeros campos de cada
//     capacidad y vacían con «seleccionar todo + Borrar», que es la otra forma
//     real en que un usuario vacía un campo.
// Lo que NO se recorta en ninguna combinación: pegar, sustituir, «3,5», «3.5»,
// miles, vacío+blur y la posición del cursor.
const MATRIX = [
  [390, 844, true,  'es', 'Safari/iPhone simulado', 'full'],
  [390, 844, true,  'en', 'Safari/iPhone simulado', 'lite'],
  [1366, 768, false, 'es', 'Desktop',               'lite'],
  [1366, 768, false, 'en', 'Desktop',               'lite'],
];
for (const [w, h, mobile, L, vpName, depth] of MATRIX) {
  {
    await load(w, h, mobile);
    await persona('founder');
    await ev(`lang=${JSON.stringify(L)}; true`);
    let bad = [];
    let checked = 0;
    for (const name of Object.keys(MOUNT)) {
      const all = await mount(name);
      const fields = depth === 'full' ? all : all.slice(0, 2);
      for (const f of fields) {
        checked++;
        // 1 · vaciar. En la combinación completa, TECLA A TECLA.
        const len = String(await dom(f)).length;
        await focusAll(f);
        if (depth === 'full') { await ev(`(function(){var e=document.querySelector('${q(f)}');e.setSelectionRange(e.value.length,e.value.length);})()`); await backspace(len); }
        else { await backspace(1); }
        await sleep(40);
        if (await dom(f) !== '') bad.push(name + '.' + f.k + ':vaciar=' + JSON.stringify(await dom(f)));
        // 2 · vacío + blur sigue vacío (nada reinsertado)
        await blur(f); await sleep(80);
        if (await dom(f) !== '') bad.push(name + '.' + f.k + ':vacio-blur=' + JSON.stringify(await dom(f)));
        // 3 · seleccionar todo y sustituir
        await focusAll(f); await typeStr('1234'); await sleep(40);
        if (await dom(f) !== '1234') bad.push(name + '.' + f.k + ':sustituir=' + JSON.stringify(await dom(f)));
        // 4 · el cursor no salta mientras se escribe
        const cur = await ev(`(function(){var e=document.querySelector('${q(f)}');return e.selectionStart;})()`);
        if (cur !== 4) bad.push(name + '.' + f.k + ':cursor=' + cur);
        // 5 · pegar (inserción REAL del navegador, no un ClipboardEvent sintético)
        await focusAll(f); await paste('2500'); await sleep(50);
        if (await dom(f) !== '2500') bad.push(name + '.' + f.k + ':pegar=' + JSON.stringify(await dom(f)));
        // 6 · el decimal, escrito de las dos formas, vale lo mismo
        for (const dec of ['3,5', '3.5']) {
          await focusAll(f); await typeStr(dec); await sleep(40);
          if (await dom(f) !== dec) bad.push(name + '.' + f.k + ':edicion(' + dec + ')=' + JSON.stringify(await dom(f)));
          await blur(f); await sleep(90);
          const n = await numOf(await dom(f));
          if (Math.abs(n - 3.5) > 1e-9) bad.push(name + '.' + f.k + ':' + dec + '→' + n);
        }
        // 7 · miles. En un campo de PLAZO se usa «1.000» en vez de «250.000»: la
        // agrupación de miles es lo que se está comprobando, y 250.000 AÑOS hace
        // que el motor recompute tres millones de meses en cada tecla — un coste
        // real del producto que no aporta nada a este contrato.
        const isTerm = /^(years?|year|plazo)$/i.test(String(f.k));
        const grouped = isTerm ? (L === 'es' ? '1.000' : '1,000') : (L === 'es' ? '250.000' : '250,000');
        const expect = isTerm ? 1000 : 250000;
        await focusAll(f); await typeStr(grouped);
        await blur(f); await sleep(90);
        const n2 = await numOf(await dom(f));
        if (n2 !== expect) bad.push(name + '.' + f.k + ':miles→' + n2);
        // Y se deja el campo en un valor benigno: si no, el siguiente campo se
        // edita sobre un documento que recomputa un horizonte absurdo en cada tecla.
        await focusAll(f); await typeStr('10'); await blur(f); await sleep(40);
      }
    }
    ok('C.' + vpName + ' / ' + L.toUpperCase() + ' (' + depth + ', ' + checked + ' campos) — contrato de edición en las 8 capacidades',
      bad.length === 0, bad.length ? bad.slice(0, 8).join(' · ') : checked + ' campos decimales OK');
  }
}
// 8 · un campo obligatorio vacío NO persiste y lo DICE
await load(390, 844, true); await persona('founder');
ok('C.obligatorio vacío: no persiste y muestra validación', await ev(`(function(){
  _wshWireOnce(); var c=document.getElementById('aurixWorkspace'); c.style.display='block';
  try{ localStorage.removeItem('aurix_ws_projects_v1'); }catch(_){}
  _wsToolActive='loan'; _wsToolInputs=_wsToolDefaultsFor('loan'); _wsToolEditId=null;
  _wsToolInputs.principal=''; c.innerHTML=_wsRenderTool();
  var b=c.querySelector('[data-wstool-save]'); b.click();
  var err=c.querySelector('.wsg-reqerr');
  var inv=c.querySelector('[data-wstool-input="principal"]').getAttribute('aria-invalid');
  var saved=(JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]')).length;
  var modal=document.getElementById('wsConfirmModal');
  return !!err && err.innerText.length>0 && inv==='true' && saved===0 && !modal;
})()`));
ok('C.una cifra válida sí llega al modal de nombre', await ev(`(function(){
  var c=document.getElementById('aurixWorkspace');
  _wsToolInputs=_wsToolDefaultsFor('loan'); _wsToolEditId=null; c.innerHTML=_wsRenderTool();
  c.querySelector('[data-wstool-save]').click();
  var m=document.getElementById('wsConfirmModal');
  return !!m && !!m.querySelector('#wsRenameInput');
})()`));

// ══════════════════════════════════════════════════════════════════════════
}

if (run('D')) {
console.log('\nD · MI ESPACIO');
// ══════════════════════════════════════════════════════════════════════════
await load(390, 844, true); await showWs(); await persona('premium');
const reset = () => ev(`(function(){
  ['aurix_ws_projects_v1','aurix_ws_goals_v1','aurix_ws_scenarios_v1','aurix_ws_pinned_v1','aurix_ws_recent_v1','aurix_ws_space_hidden_v1','aurix_ws_space_top_v1','aurix_ws_tool_state_v1'].forEach(function(k){try{localStorage.removeItem(k);}catch(_){}});
  _wsToolEditId=null; _wsToolInputs=null; _wshView='home'; _wsTab='space'; renderWorkspaceHome(); return true;})()`);
const space = () => J(`(function(){_wshView='home';_wsTab='space';_wshRepaintHome();
  var cols=document.querySelectorAll('#aurixWorkspace .wsh-mse2-col');
  var cards=[].map.call(document.querySelectorAll('#aurixWorkspace .wsh-mse2-card'),function(x){
    return {type:x.getAttribute('data-wsmse-type'),name:(x.querySelector('.wsh-mse2-name')||{}).innerText,col:x.closest('.wsh-mse2-col')===cols[0]?'tpl':'tool'};});
  return JSON.stringify({cols:cols.length,cards:cards,
    subs:document.querySelectorAll('#aurixWorkspace .wsh-mse2-sub').length});})()`);
const nameModal = async name => ev(`(function(){
  var m=document.getElementById('wsConfirmModal'); if(!m) return false;
  var i=m.querySelector('#wsRenameInput'); i.value=${JSON.stringify(name)};
  m.querySelector('[data-wsmodal="ok"]').click(); return true;})()`);
// Se abre POR EL CAMINO REAL: desde Mi espacio. `_wsOpenTool` pasa por el
// despachador, que es idempotente por vista —abrir DOS VECES la misma herramienta
// sin salir de ella no repinta, así que la barra de guardado seguiría mostrando el
// botón DESHABILITADO del guardado anterior—. Volver a Mi espacio entre aperturas
// es además lo que hace un usuario.
const openTool = k => ev(`(function(){ _wshView='home'; _wsTab='space'; _wshRepaintHome(); _wsOpenTool(${JSON.stringify(k)}); return true;})()`);
const clickSave = () => ev(`(function(){var b=document.querySelector('#aurixWorkspace [data-wstool-save]'); if(b) b.click(); return !!b;})()`);

await reset();
await openTool('budget'); await sleep(150);
let d1 = await space();
ok('D.1 abrir sin marcar ni guardar → NO aparece en Mi espacio', d1.cards.length === 0, JSON.stringify(d1.cards));
ok('D.0 las dos columnas se pintan siempre, y sin subtítulos', d1.cols === 2 && d1.subs === 0, JSON.stringify(d1));
// favorito
await ev(`(function(){_wsTogglePin(_wsCanonRef('tool','budget')); return true;})()`);
let d2 = await space();
ok('D.2 marcar favorito → aparece UNA sola vez',
  d2.cards.filter(c => c.type === 'fav').length === 1, JSON.stringify(d2.cards));
ok('D.2b y cae en la columna de su clase (Presupuesto es PLANTILLA)',
  (d2.cards.find(c => c.type === 'fav') || {}).col === 'tpl', JSON.stringify(d2.cards));
await ev(`(function(){_wsTogglePin(_wsCanonRef('tool','budget')); return true;})()`);
ok('D.3 desmarcar → desaparece', (await space()).cards.length === 0);
// guardado nombrado
await openTool('budget'); await sleep(150);
await clickSave(); await sleep(120);
ok('D.4 guardar por primera vez → modal obligatorio', await ev(`(function(){
  var m=document.getElementById('wsConfirmModal');
  return !!m && !!m.querySelector('#wsRenameInput[required]') && /Guardar en Mi espacio/.test(m.innerText);})()`));
ok('D.4b el campo obligatorio vacío no guarda y lo dice', await ev(`(function(){
  var m=document.getElementById('wsConfirmModal');
  m.querySelector('#wsRenameInput').value='';
  m.querySelector('[data-wsmodal="ok"]').click();
  var still=document.getElementById('wsConfirmModal');
  var err=still&&still.querySelector('#wsPromptErr');
  var saved=(JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]')).filter(function(p){return !p.deletedAt;}).length;
  return !!still && !!err && err.hidden===false && saved===0;})()`));
ok('D.5 cancelar el modal → no persiste nada', await ev(`(function(){
  var m=document.getElementById('wsConfirmModal');
  m.querySelector('[data-wsmodal="cancel"]').click();
  var saved=(JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]')).filter(function(p){return !p.deletedAt;}).length;
  return !document.getElementById('wsConfirmModal') && saved===0;})()`));
// dos instancias con nombres distintos
await clickSave(); await nameModal('Presupuesto personal'); await sleep(120);
await openTool('budget'); await sleep(120);
await clickSave(); await nameModal('Presupuesto empresa'); await sleep(120);
let d6 = await space();
ok('D.6 dos presupuestos con nombres distintos → aparecen los dos',
  d6.cards.filter(c => c.type === 'doc').length === 2
  && /Presupuesto personal/.test(JSON.stringify(d6.cards)) && /Presupuesto empresa/.test(JSON.stringify(d6.cards)),
  JSON.stringify(d6.cards));
// nombre repetido
await openTool('budget'); await sleep(120);
await clickSave(); await nameModal('Presupuesto empresa'); await sleep(120);
let d7 = await J(`JSON.stringify((JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]')).filter(function(p){return !p.deletedAt;}).map(function(p){return {id:p.id,n:p.customName};}))`);
ok('D.7 nombre repetido → IDs distintos, sin sobrescritura',
  d7.length === 3 && new Set(d7.map(x => x.id)).size === 3, JSON.stringify(d7));
// actualizar no duplica
await clickSave(); await sleep(140);
let d8 = await J(`JSON.stringify((JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]')).filter(function(p){return !p.deletedAt;}).length)`);
ok('D.8 guardar un documento existente → actualiza, no duplica', d8 === 3, String(d8));
// guardar como
await ev(`(function(){var b=document.querySelector('#aurixWorkspace [data-wstool-saveas]'); if(b) b.click(); return !!b;})()`);
await nameModal('Presupuesto copia'); await sleep(140);
let d9 = await J(`JSON.stringify((JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]')).filter(function(p){return !p.deletedAt;}).length)`);
ok('D.9 «Guardar como…» → crea una segunda instancia', d9 === 4, String(d9));
// renombrar conserva datos
let before = await ev(`(function(){var l=JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]');var p=l.find(function(x){return x.id===_wsToolEditId;});return JSON.stringify(p.inputs);})()`);
await ev(`(function(){var b=document.querySelector('#aurixWorkspace [data-wstool-rename]'); if(b) b.click(); return !!b;})()`);
await nameModal('Presupuesto renombrado'); await sleep(140);
let after = await ev(`(function(){var l=JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]');var p=l.find(function(x){return x.id===_wsToolEditId;});return JSON.stringify({n:p.customName,inputs:p.inputs});})()`);
ok('D.10 renombrar cambia el nombre y conserva los datos',
  JSON.parse(after).n === 'Presupuesto renombrado' && JSON.stringify(JSON.parse(after).inputs) === before,
  after.slice(0, 120));
// eliminar: confirmación + tombstone, sin tocar los demás
ok('D.11 eliminar pide confirmación, deja tombstone y no afecta a los demás', await ev(`(function(){
  var id=_wsToolEditId;
  document.querySelector('#aurixWorkspace [data-wstool-delete]').click();
  var m=document.getElementById('wsConfirmModal'); if(!m) return false;
  m.querySelector('[data-wsmodal="ok"]').click();
  var raw=JSON.parse(localStorage.getItem('aurix_ws_projects_v1')||'[]');
  var gone=raw.find(function(p){return p.id===id;});
  var live=raw.filter(function(p){return !p.deletedAt;}).length;
  return !!gone && !!gone.deletedAt && live===3;})()`));
// recargar
await load(390, 844, true); await showWs(); await persona('premium');
let d12 = await space();
ok('D.12 recargar → reaparecen con su nombre',
  d12.cards.filter(c => c.type === 'doc').length === 3
  && /Presupuesto personal/.test(JSON.stringify(d12.cards)), JSON.stringify(d12.cards.map(c => c.name)));
// aislamiento entre cuentas: el cambio de usuario aparca las claves por dueño
ok('D.14 las claves de trabajo están declaradas como user-scoped (aislamiento)',
  await ev(`(function(){ try { return USER_SCOPED_WORK_KEYS.indexOf('aurix_ws_projects_v1')!==-1 && USER_SCOPED_WORK_KEYS.indexOf('aurix_ws_pinned_v1')!==-1; } catch(_) { return false; } })()`));
// Free no obtiene guardado Premium manipulando el rail local
await persona('free');
ok('D.free: un rail local falsificado no concede persistencia', await ev(`(function(){
  try{ localStorage.setItem('aurix_plan', JSON.stringify({tier:'premium'})); }catch(_){}
  return _wsCanPersist()===false;})()`));

// ══════════════════════════════════════════════════════════════════════════
}

if (run('E')) {
console.log('\nE · VISUAL RESPONSIVE');
// ══════════════════════════════════════════════════════════════════════════
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [[360, 740], [390, 844], [430, 932], [768, 1024], [1366, 768]];
const measurements = {};
for (const [w, h] of VIEWPORTS) {
  for (const L of ['es', 'en']) {
    await load(w, h, w < 700);
    await showWs(); await persona('premium');
    await ev(`lang=${JSON.stringify(L)}; true`);
    // deja el espacio con contenido real en las dos columnas
    await ev(`(function(){
      _wsTogglePin(_wsCanonRef('tool','compound'));
      _wsTogglePin(_wsCanonRef('tool','budget'));
      return true;})()`);
    const m = await J(`(function(){
      _wshView='home'; _wsTab='space'; renderWorkspaceHome();
      var root=document.getElementById('aurixWorkspace');
      var cols=[].slice.call(root.querySelectorAll('.wsh-mse2-col'));
      var titles=[].slice.call(root.querySelectorAll('.wsh-mse2-title'));
      var r=function(e){var b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.left),y:Math.round(b.top)};};
      var cs=function(e){return getComputedStyle(e);};
      return JSON.stringify({
        colCount:cols.length,
        colBox:cols.map(r),
        colPad:cols.map(function(c){var s=cs(c);return s.paddingLeft+'/'+s.paddingRight+'/'+s.paddingTop;}),
        titleOneLine:titles.map(function(tt){ return Math.round(tt.getBoundingClientRect().height) <= Math.ceil(parseFloat(cs(tt).lineHeight||'0')||(parseFloat(cs(tt).fontSize)*1.4))+1; }),
        titleClipped:titles.map(function(tt){ return tt.scrollWidth > tt.clientWidth + 1; }),
        titleFont:titles.map(function(tt){ return parseFloat(cs(tt).fontSize); }),
        titleText:titles.map(function(tt){ return tt.innerText; }),
        cardMin:[].slice.call(root.querySelectorAll('.wsh-mse2-card')).map(function(c){return Math.round(c.getBoundingClientRect().height);}),
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        sectionOverflowX: root.scrollWidth > root.clientWidth + 1,
        taps:[].slice.call(root.querySelectorAll('button,[role="button"]')).map(function(b){return Math.round(b.getBoundingClientRect().height);}).filter(function(x){return x>0;}),
        // Sólo lo que el usuario LEE: un elemento sin texto propio o con caja de
        // cero no tiene tamaño de letra observable, y contarlo hacía que la
        // medición delatara 7,5 px de un nodo invisible. Se mide el texto real.
        minFont: (function(){
          var m = 99, off = [];
          [].slice.call(root.querySelectorAll('*')).forEach(function(e){
            var own = [].slice.call(e.childNodes).some(function(n){ return n.nodeType === 3 && String(n.nodeValue).trim().length; });
            if (!own) return;
            // Las ILUSTRACIONES quedan fuera: la miniatura de una tarjeta es un
            // dibujo de 34 px con etiquetas que nadie lee, y va marcada como
            // oculta para accesibilidad precisamente porque no es copy. Medir su
            // tipografia como si fuera texto legible es medir otra cosa.
            if (e.closest('[aria-hidden="true"]')) return;
            var b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
            var st = cs(e); if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) return;
            var f = parseFloat(st.fontSize);
            if (isFinite(f) && f > 0 && f < m) { m = f; }
            if (isFinite(f) && f > 0 && f < 11) off.push((e.tagName || '') + '.' + String(e.className || '').slice(0, 40) + '=' + f);
          });
          window.__minFontOff = off;
          return m;
        })(),
        minFontOff: (window.__minFontOff || []).slice(0, 6)
      });})()`);
    measurements[w + 'x' + h + '/' + L] = m;
    const sym = m.colCount === 2 && Math.abs(m.colBox[0].w - m.colBox[1].w) <= 1 && m.colBox[0].y === m.colBox[1].y
      && m.colPad[0] === m.colPad[1];
    ok(`E.${w}×${h} ${L.toUpperCase()} columnas simétricas`, sym, JSON.stringify({ box: m.colBox, pad: m.colPad }));
    ok(`E.${w}×${h} ${L.toUpperCase()} los dos títulos en UNA línea y sin recortar`,
      m.titleOneLine.every(Boolean) && m.titleClipped.every(x => x === false),
      JSON.stringify({ oneLine: m.titleOneLine, clipped: m.titleClipped, font: m.titleFont, text: m.titleText }));
    ok(`E.${w}×${h} ${L.toUpperCase()} cero overflow horizontal`,
      m.docOverflowX === false && m.sectionOverflowX === false, JSON.stringify({ doc: m.docOverflowX, sec: m.sectionOverflowX }));
    ok(`E.${w}×${h} ${L.toUpperCase()} ninguna fuente por debajo de 11 px`, m.minFont >= 11,
      'min=' + m.minFont + ' ' + JSON.stringify(m.minFontOff));
    if (w < 700) ok(`E.${w}×${h} ${L.toUpperCase()} controles táctiles ≥ 44 px`,
      m.taps.every(x => x >= 44), JSON.stringify(m.taps.filter(x => x < 44)));
    // ── LAS DOS PORTADAS, CON UNA SOLA SECCIÓN VISIBLE ─────────────────────
    // La primera versión medía el CTA con el Dashboard TODAVÍA montado encima, así
    // que el rectángulo salía a 2.282 px de un viewport de 740: no medía el
    // pliegue, medía la suma de dos secciones. Se cambia de sección por
    // `switchTab`, que es el owner de la visibilidad de secciones en producción.
    for (const [pname, tab, js] of [
      ['workspace', 'workspace', `${PERSONA.free} _wshView='free_cover';`],
      ['intelligence', 'intelligence', `${PERSONA.free} window.__realFacts=_aurixIntelligencePreviewFacts; _aurixIntelligencePreviewFacts=function(){var f=[{kind:'concentration',text:t('intprev_f_conc')(47,'Bitcoin')},{kind:'liquidity',text:t('intprev_f_liq')(12)},{kind:'watch:crypto',title:'x',text:'y'}];return {facts:f,state:'ok',visible:f.slice(0,1),locked:f.slice(1,3)};};`],
    ]) {
      await ev(`(function(){ ${js} switchTab(${JSON.stringify(tab)}); return true; })()`);
      await sleep(260);
      const c = await J(`(function(){
        var sel='${pname}'==='workspace' ? '#aurixWorkspace .wsfc-cta' : '.intprev-cta';
        var b=document.querySelector(sel);
        if(!b) return JSON.stringify({missing:true});
        var r=b.getBoundingClientRect();
        return JSON.stringify({top:Math.round(r.top),bottom:Math.round(r.bottom),vh:window.innerHeight,
          h:Math.round(r.height),docOverflowX:document.documentElement.scrollWidth>window.innerWidth+1,
          pageScroll:Math.max(0, document.documentElement.scrollHeight - window.innerHeight)});})()`);
      ok(`E.${w}×${h} ${L.toUpperCase()} CTA de la portada ${pname} visible sin scroll`,
        !c.missing && c.bottom <= c.vh && c.h >= 44 && c.docOverflowX === false, JSON.stringify(c));
      if (pname === 'intelligence') await ev(`(function(){ if (window.__realFacts) _aurixIntelligencePreviewFacts = window.__realFacts; return true; })()`);
    }
  }
}
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(measurements, null, 1));
}

console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO — evidencia en docs/p0-free-boundary/measurements.json');
process.exit(0);
