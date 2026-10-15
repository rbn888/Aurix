#!/usr/bin/env node
/**
 * AURIX · WORKSPACE · CIERRE QUIRÚRGICO FINAL
 * ════════════════════════════════════════════════════════════════════════════
 * Navegador real (Chromium y WebKit) sobre la app servida en local, datos SINTÉTICOS:
 *   §A  Mi espacio = fijadas ∪ documentos (P0 de reentrada), sin duplicar, espera neutra
 *       mientras la lectura de la cuenta no ha resuelto; fijados hidratados del servidor sólo
 *       si el dispositivo no tiene ninguno; guardar / fijar / Dashboard independientes;
 *       herramientas con persistencia llegan al Dashboard por opt-in; renombrar, duplicar y
 *       eliminar se reflejan sin recarga; aislamiento entre cuentas.
 *   §B  Modo de trabajo: sin cabecera global ni navegación inferior dentro de una capacidad,
 *       barra local con Volver/nombre/estado, scroll al inicio, Back del navegador = Volver.
 *   §C  Presupuesto: KPIs + donut en el primer viewport móvil, añadir en la cabecera del bloque,
 *       una sola conclusión, nombres largos, sin desbordes.
 *   §D  Dashboard «Tu espacio»: Tus planes + Herramientas fijadas, grupos separados, columnas.
 *   AURIX_PW=/ruta/playwright/index.mjs node scripts/aurix-ws-final-close-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'workspace-visual-qa');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const AUTH_PATCH = x => String(x)
  .replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;')
  .replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
    let b = await readFile(f);
    if (f.endsWith('app.js')) b = Buffer.from(AUTH_PATCH(String(b)));
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(b);
  } catch (_) { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
let chromium, webkit;
try { ({ chromium, webkit } = await import(PW)); }
catch (e) { console.error('\n✗ SIN MOTORES — ' + PW); server.close(); process.exit(2); }
const ONLY = process.env.AURIX_ENGINES || 'CR,WK';
const SHOTS = process.env.AURIX_SHOTS === '1';

let pass = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (i ? '  [' + i + ']' : '')); console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
mkdirSync(OUT, { recursive: true });

const PREMIUM = (uid) => `(function(){
  try { _aurixCancelLoginRedirect('probe'); _aurixMarkSessionConfirmed(); } catch (_) {}
  var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
  var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
  var f = Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k] = (k !== 'workspace.catalog_preview'); });
  _aurixEnt = { loaded:true, loading:false, error:null, plan:'premium', status:'active', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
  try { _aurixActiveUserId = ${JSON.stringify(uid)}; _aurixStampCacheOwner(); } catch (_) {}
  return true; })()`;
const FREE = `(function(){
  try { _aurixCancelLoginRedirect('probe'); _aurixMarkSessionConfirmed(); } catch (_) {}
  var bl = document.getElementById('bootLoader'); if (bl) bl.remove();
  var ar = document.getElementById('appRoot'); if (ar) ar.style.opacity = '1';
  var f = Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k] = false; });
  _aurixEnt = { loaded:true, loading:false, error:null, plan:'free', status:'active', source:'default', validUntil:null, features:f, sources:Object.create(null), fetchedAt:Date.now() };
  return true; })()`;
async function boot(page, { lang = 'es', seed = null, uid = 'probe-a', free = false } = {}) {
  await page.addInitScript(`try{ localStorage.setItem('portfolio_lang', ${JSON.stringify(lang)});
    ${seed ? `if (!localStorage.getItem('__seeded')) { ${Object.keys(seed).map(k => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(seed[k]))});`).join('')} localStorage.setItem('__seeded','1'); }` : ''} }catch(_){}`);
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof _wsOpenTool === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'", null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(free ? FREE : PREMIUM(uid));
}
const J = (page, expr) => page.evaluate(`(function(){ try { return JSON.stringify((function(){ ${expr} })()); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`).then(JSON.parse);
const shot = (page, name) => SHOTS ? page.screenshot({ path: join(OUT, 'final-' + name + '.png') }) : null;
const space = page => page.evaluate(`(function(){ switchTab('workspace'); _wsTab='space'; _wshView='home'; _wshRepaintHome(); return true; })()`).then(() => page.waitForTimeout(350));
const NOW = Date.now();
const DOC = (id, type, name, extra) => Object.assign({ id, type, customName: name, inputs: {}, results: null, revision: 1, createdAt: NOW - 86400000, updatedAt: NOW - 3600000, currency: 'EUR', bodyVersion: 1 }, extra || {});
const BUDGET_IN = { rows: [
  { id: 'salary', type: 'income', labelKey: 'wsbud_new_income', label: 'Nómina', amount: '2400', order: 0 },
  { id: 'rent', type: 'expense', label: 'Alquiler', amount: '900', color: '#4A82F0', order: 1 },
  { id: 'food', type: 'expense', label: 'Comida', amount: '400', color: '#2BB3A3', order: 2 } ] };
const SEED_A = {
  aurix_ws_projects_v1: [
    DOC('ws4_bud1', 'monthly_budget', 'Casa octubre', { inputs: BUDGET_IN }),
    DOC('ws4_cmp1', 'compound_growth', 'Jubilación', { inputs: { initial: '10000', monthly: '200', rate: '5', years: '20' }, results: { final: 120000, contributed: 48000, years: 20 } }),
  ],
};

for (const [ENG, launcher] of [['CR', chromium], ['WK', webkit]]) {
  if (!ONLY.split(',').includes(ENG)) continue;
  const browser = await launcher.launch();
  console.log('\n══ ' + ENG + ' ══');

  // ═════════════════ §A · MI ESPACIO / CONTRATOS ═════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
    await boot(p, { seed: SEED_A });
    const T = ENG + '.§A';
    // La lectura remota se da por resuelta (no hay servidor en la sonda): la cuenta YA leyó.
    await p.evaluate(`_wsDocsPulledFor = _wsDocsSession(); _wsDocTableState = 'yes';`);
    await space(p);
    const ms = () => J(p, `var r=document.querySelector('.wsh-mse2'); if(!r) return null; return {
      state: r.getAttribute('data-wsmse-state'), docs: r.getAttribute('data-wsmse-docs'),
      groups: [].slice.call(r.querySelectorAll('.wsh-mse2-grp')).map(function(g){ return { cap: g.getAttribute('data-wsmse-cap'), fav: g.classList.contains('is-fav'),
        docs: [].slice.call(g.querySelectorAll('.wsh-mse2-doc-n')).map(function(n){return n.textContent}), meta: (g.querySelector('.wsh-mse2-meta')||{}).textContent,
        dash: [].slice.call(g.querySelectorAll('.wsh-mse2-doc.is-dash .wsh-mse2-doc-n')).map(function(n){return n.textContent}) }; }),
      empty: [].slice.call(r.querySelectorAll('.wsh-mse2-empty-t')).map(function(e){return e.textContent}) }`);
    let m = await ms();
    const g = cap => (m.groups || []).find(x => x.cap === cap);
    ok(`${T} P0: con documentos y SIN fijados, Mi espacio no dice «Sin plantillas»`, m && !m.empty.some(x => /Sin plantillas/.test(x)), JSON.stringify(m));
    ok(`${T} el presupuesto guardado aparece en su grupo con el nombre del usuario`, g('budget') && g('budget').docs.join() === 'Casa octubre', JSON.stringify(m && m.groups));
    ok(`${T} el documento de una HERRAMIENTA también aparece`, g('compound') && g('compound').docs.join() === 'Jubilación');
    ok(`${T} guardar NO fija: el grupo no lleva marca de fijado`, g('budget') && !g('budget').fav);
    ok(`${T} metadato textual: «1 documento»`, g('budget') && /1 documento/.test(g('budget').meta), g('budget') && g('budget').meta);
    // Fijar la capacidad que ya tiene documento: UN grupo, no dos.
    await p.evaluate(`_wsTogglePin(_wsCanonRef('tool','budget')); _wshRepaintHome();`); await p.waitForTimeout(150);
    m = await ms();
    ok(`${T} fijada + documento = UN solo grupo, marcado fijada`, (m.groups.filter(x => x.cap === 'budget').length === 1) && g('budget').fav && /Fijada/.test(g('budget').meta), JSON.stringify(m.groups));
    const allBudgetDocs = await J(p, `return _ws4Projects().filter(function(x){return x.type==='monthly_budget'}).length`);
    ok(`${T} fijar NO crea un documento`, allBudgetDocs === 1, String(allBudgetDocs));
    // Fijar una capacidad SIN documento: aparece sola, sin filas inventadas.
    await p.evaluate(`_wsTogglePin(_wsCanonRef('tool','loan')); _wshRepaintHome();`); await p.waitForTimeout(150);
    m = await ms();
    ok(`${T} herramienta fijada sin documento: grupo sin filas de documento`, g('loan') && g('loan').fav && g('loan').docs.length === 0, JSON.stringify(g('loan')));
    // Dashboard: plantilla visible por defecto (contrato previo), herramienta NO hasta opt-in.
    const dashRefs = () => J(p, `return _wsPlansAll().map(function(x){return x.kind+':'+x.id})`);
    let dr = await dashRefs();
    ok(`${T} Dashboard: el presupuesto (plantilla) se publica; la simulación NO sin opt-in`, dr.indexOf('workspace:ws4_bud1') >= 0 && dr.indexOf('workspace:ws4_cmp1') < 0, dr.join());
    await p.evaluate(`_wsPlanDashSet('ws4_cmp1', false, 'workspace')`); await p.waitForTimeout(100);
    dr = await dashRefs();
    ok(`${T} «Mostrar en Dashboard» publica la instancia de la HERRAMIENTA`, dr.indexOf('workspace:ws4_cmp1') >= 0, dr.join());
    await space(p); m = await ms();
    ok(`${T} Mi espacio marca «En Dashboard» en esa fila`, g('compound') && g('compound').dash.join() === 'Jubilación', JSON.stringify(g('compound')));
    const pinsAfterDash = await J(p, `return _wsPinned().map(function(x){return x.ref})`);
    ok(`${T} mostrar en Dashboard NO fija la capacidad`, pinsAfterDash.indexOf(_ref('compound')) < 0, pinsAfterDash.join());
    function _ref(k) { return 'tool:' + k; }
    // Volver a guardar la instancia publicada CONSERVA la publicación; «Guardar como» no la hereda.
    const resave = await J(p, `switchTab('workspace'); _wsOpenTool('compound','ws4_cmp1'); _wsToolInputs.monthly='250'; _wsToolDirty=true; _wsToolCommit(null,false);
      var a=_ws4Projects().find(function(x){return x.id==='ws4_cmp1'}); var keep=_wsPlanOnDash(a);
      _wsToolCommit('Copia', true); var c=_ws4Projects().find(function(x){return x.customName==='Copia'});
      var r={ keep: keep, copyOn: _wsPlanOnDash(c) }; _ws4Tombstone(c.id); _wsOpenTool('compound','ws4_cmp1'); return r;`);
    ok(`${T} volver a guardar mantiene «En Dashboard»; «Guardar como» crea otra sin publicarla`, resave.keep === true && resave.copyOn === false, JSON.stringify(resave));
    await p.evaluate(`_wsNavBack()`); await space(p);
    // Duplicar no hereda la publicación.
    await p.evaluate(`_wsxAct('dup','workspace:ws4_cmp1')`); await p.waitForTimeout(120);
    const dupOnDash = await J(p, `var l=_ws4Projects().filter(function(x){return x.type==='compound_growth'}); return { n:l.length, on:l.filter(_wsPlanOnDash).length }`);
    ok(`${T} duplicar crea un documento nuevo que NO entra solo en el Dashboard`, dupOnDash.n === 2 && dupOnDash.on === 1, JSON.stringify(dupOnDash));
    // Renombrar se refleja en Mi espacio y Dashboard sin recarga.
    await p.evaluate(`_wsRename('workspace:ws4_bud1', 'Casa noviembre'); _wsPlansRepaint();`); await p.waitForTimeout(150);
    m = await ms();
    const dashName = await J(p, `switchTab('home'); return null`);
    await p.waitForTimeout(700);
    const planNames = await J(p, `return [].slice.call(document.querySelectorAll('#wsPlansSection .wspl-name')).map(function(n){return n.textContent})`);
    ok(`${T} renombrar se refleja en Mi espacio y en el Dashboard`, g('budget').docs.join() === 'Casa noviembre' && planNames.indexOf('Casa noviembre') >= 0, JSON.stringify({ ms: g('budget').docs, planNames }));
    // Eliminar: desaparece de las dos superficies.
    await p.evaluate(`_ws4Tombstone('ws4_bud1'); _wsPlansRepaint();`); await p.waitForTimeout(150);
    const planAfterDel = await J(p, `return [].slice.call(document.querySelectorAll('#wsPlansSection .wspl-name')).map(function(n){return n.textContent})`);
    await space(p); m = await ms();
    ok(`${T} eliminar lo retira del Dashboard y de Mi espacio; la capacidad fijada sigue`, planAfterDel.indexOf('Casa noviembre') < 0 && g('budget') && g('budget').docs.length === 0 && g('budget').fav, JSON.stringify({ planAfterDel, b: g('budget') }));
    // Espera neutra: con sesión y la lectura de la cuenta sin resolver, NO se afirma vacío.
    await p.evaluate(`_wsDocsSession = function(){ return 'probe-a'; }; localStorage.setItem('aurix_ws_pinned_v1','[]'); localStorage.setItem('aurix_ws_projects_v1','[]'); _wsDocsPulledFor = null; _wsDocTableState = 'unknown'; _wshRepaintHome();`); await p.waitForTimeout(150);
    m = await ms();
    const sess = await J(p, `return !!_wsDocsSession()`);
    ok(`${T} sin resolver la lectura: espera neutra, nunca «Sin plantillas»`, sess && m.state === 'loading' && m.empty.length === 0, JSON.stringify(m));
    await p.evaluate(`_wsDocsPullFailed = true; _wshRepaintHome();`); await p.waitForTimeout(100);
    m = await ms();
    ok(`${T} lectura fallida: se dice y se ofrece reintentar, no «vacío»`, m.state === 'error' && m.empty.length === 0, JSON.stringify(m));
    await p.evaluate(`_wsDocsPullFailed = false; _wsDocsPulledFor = _wsDocsSession(); _wsDocTableState = 'yes'; _wshRepaintHome();`); await p.waitForTimeout(100);
    m = await ms();
    ok(`${T} resuelta y de verdad vacía: ahora sí el vacío honesto`, !m.state && m.empty.length === 2, JSON.stringify(m));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ═════════════════ §A2 · HIDRATACIÓN DE FIJADOS Y AISLAMIENTO ═════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
    await boot(p, { seed: {} });
    const T = ENG + '.§A2';
    // Un servidor simulado: devuelve UN documento y la preferencia de fijados de la cuenta.
    const res = await J(p, `
      var uid = 'probe-a';
      var rows = [
        { doc_id: 'ws4_srv1', kind: 'ws_project', body: { id: 'ws4_srv1', type: 'monthly_budget', customName: 'Desde el servidor', inputs: {}, revision: 3, createdAt: 1, updatedAt: ${NOW} }, revision: 3, deleted_at: null, body_version: 1, currency: 'EUR' },
        { doc_id: 'pref:aurix_ws_pinned_v1', kind: 'ws_pref', body: { key: 'aurix_ws_pinned_v1', value: [{ ref: 'tool:loan', ts: 5 }] }, revision: 9, deleted_at: null, body_version: 1, currency: null } ];
      window.__wsSrv = rows;
      return true;`);
    await p.evaluate(`(function(){
      _wsDocsSession = function(){ return 'probe-a'; };
      supabaseClient = { from: function(){ return { select: function(){ return { eq: function(){ return Promise.resolve({ data: window.__wsSrv, error: null }); } }; } }; } };
    })()`);
    await p.evaluate(`localStorage.removeItem('aurix_ws_pinned_v1'); localStorage.removeItem('aurix_ws_projects_v1');`);
    const ok1 = await p.evaluate(`_wsDocsPull()`);
    const after = await J(p, `return { pins: _wsPinned().map(function(x){return x.ref}), docs: _ws4Projects().map(function(x){return x.customName}) }`);
    ok(`${T} dispositivo SIN fijados: se hidratan los del servidor junto con los documentos`, ok1 === true && after.pins.join() === 'tool:loan' && after.docs.indexOf('Desde el servidor') >= 0, JSON.stringify(after));
    await p.evaluate(`localStorage.setItem('aurix_ws_pinned_v1', JSON.stringify([{ref:'tool:budget',ts:7}]));`);
    await p.evaluate(`_wsDocsPull()`);
    const kept = await J(p, `return _wsPinned().map(function(x){return x.ref})`);
    ok(`${T} dispositivo CON decisión propia: los fijados remotos no la pisan`, kept.join() === 'tool:budget', kept.join());
    await p.evaluate(`localStorage.setItem('aurix_ws_pinned_v1', '[]');`);
    await p.evaluate(`_wsDocsPull()`);
    const none = await J(p, `return _wsPinned().length`);
    ok(`${T} «ninguno» también es una decisión y se respeta`, none === 0, String(none));
    // Aislamiento: al cambiar de cuenta, documentos y fijados de A dejan de ser legibles.
    await p.evaluate(`localStorage.setItem('aurix_ws_pinned_v1', JSON.stringify([{ref:'tool:budget',ts:7}])); _clearLocalUserState(_AURIX_PURGE.USER_SWITCH, 'probe-a');`);
    const b = await J(p, `return { pins: _wsPinned().length, docs: _ws4Projects().length }`);
    ok(`${T} cambio de cuenta: la siguiente no lee fijados ni documentos de la anterior`, b.pins === 0 && b.docs === 0, JSON.stringify(b));
    await p.evaluate(`_aurixUnparkKeysForOwner('probe-a')`);
    const back = await J(p, `return { pins: _wsPinned().length, docs: _ws4Projects().length }`);
    ok(`${T} vuelve la cuenta A: recupera los suyos (aparcados, nunca borrados)`, back.pins === 1 && back.docs === 1, JSON.stringify(back));
    // Cierre de sesión de la MISMA cuenta: limpia caché sensible, nunca su trabajo.
    await p.evaluate(`_clearLocalUserState(_AURIX_PURGE.SAME_USER)`);
    const same = await J(p, `return { pins: _wsPinned().length, docs: _ws4Projects().length }`);
    ok(`${T} logout de la misma cuenta: documentos y fijados intactos`, same.pins === 1 && same.docs === 1, JSON.stringify(same));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ═════════════════ §B · MODO DE TRABAJO ═════════════════
  for (const [W, H] of [[390, 844], [720, 450], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 800 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
    await boot(p, { seed: SEED_A });
    const T = ENG + '.§B' + W;
    await space(p);
    await p.evaluate(`window.scrollTo(0, 200)`);
    const vis = sel => J(p, `var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); return cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0;`);
    const histBefore = await J(p, `return history.length`);
    await p.evaluate(`_wsxOpen('workspace:ws4_bud1')`); await p.waitForTimeout(500);
    const st = await J(p, `var b=innerWidth>=768 ? document.querySelector('.wsh-tool-view [data-wsh-barwrap]') : document.querySelector('.wsh-tool-view [data-wsh-bar]'); var r=b&&b.getBoundingClientRect(); var sv=document.querySelector('.wsh-bar-actions [data-wstool-save]'); var svT=sv?Math.round(sv.getBoundingClientRect().top):9999; var tt=document.querySelector('.wsh-bar-title'); return { work: document.body.classList.contains('ws-work'), y: window.scrollY,
      title: (document.querySelector('.wsh-bar-title')||{}).textContent, state: (document.querySelector('[data-wsbar-state]')||{}).getAttribute ? document.querySelector('[data-wsbar-state]').getAttribute('data-wsbar-state') : null,
      barH: r ? Math.round(r.height) : 0, save: !!sv, saveTop: svT, titleCut: !!tt && (tt.scrollWidth > tt.clientWidth + 1), back: !!document.querySelector('.wsh-bar [data-wsh-nav="back"]'), hist: history.length }`);
    ok(`${T} dentro de un documento: modo de trabajo activo`, st.work, JSON.stringify(st));
    ok(`${T} sin cabecera global, sin navegación inferior`, !(await vis('.header')) && !(await vis('#bottomNav')));
    ok(`${T} barra local con Volver, el NOMBRE del usuario y Guardar`, st.back && st.title === 'Casa octubre' && st.save, JSON.stringify(st));
    ok(`${T} Guardar junto al trabajo (en la barra o justo debajo) y el título sin recortar`, st.saveTop < 140 && !st.titleCut, JSON.stringify(st));
    ok(`${T} estado real «guardado» al abrir un documento guardado`, st.state === 'saved', st.state);
    ok(`${T} abre al inicio del espacio de trabajo`, st.y === 0, String(st.y));
    if (W >= 1024) ok(`${T} barra ≤ 56 px en escritorio`, st.barH <= 56, String(st.barH));
    ok(`${T} se apila UNA entrada de historial (el atrás del navegador vuelve)`, st.hist === histBefore + 1, histBefore + '→' + st.hist);
    // Editar → cambios pendientes; la barra lo dice sin recargar.
    await p.evaluate(`var i=document.querySelector('[data-wsbud-amt]'); i.focus(); i.value='2500'; i.dispatchEvent(new Event('input',{bubbles:true}));`); await p.waitForTimeout(120);
    ok(`${T} editar ⇒ «cambios pendientes» en la barra`, (await J(p, `return document.querySelector('[data-wsbar-state]').getAttribute('data-wsbar-state')`)) === 'dirty');
    // Sticky: tras desplazar, la barra sigue arriba y no tapa el primer contenido al abrir.
    await p.evaluate(`window.scrollTo(0, 600)`); await p.waitForTimeout(80);
    const top = await J(p, `return Math.round((innerWidth>=768 ? document.querySelector('.wsh-tool-view [data-wsh-barwrap]') : document.querySelector('.wsh-tool-view [data-wsh-bar]')).getBoundingClientRect().top)`);
    ok(`${T} la barra se queda pegada arriba al desplazar`, top === 0, String(top));
    // Atrás del navegador = Volver al origen (Mi espacio), y el borrador NO se pierde.
    await p.goBack(); await p.waitForTimeout(600);
    const back = await J(p, `return { work: document.body.classList.contains('ws-work'), view: _wshView, tab: _wsTab, header: getComputedStyle(document.querySelector('.header')).display, url: location.pathname }`);
    ok(`${T} atrás del navegador: vuelve a Mi espacio y la navegación global reaparece`, !back.work && back.view === 'home' && back.tab === 'space' && back.header !== 'none' && /index\.html|\/$/.test(back.url), JSON.stringify(back));
    await p.evaluate(`_wsxOpen('workspace:ws4_bud1')`); await p.waitForTimeout(400);
    // El borrador del documento abierto sigue: reabrir el MISMO documento carga lo guardado, el borrador
    // de acceso rápido conserva la edición (no se ha perdido trabajo al salir).
    const draft = await J(p, `var s=JSON.parse(localStorage.getItem('aurix_ws_tool_state_v1')||'{}'); var b=s.monthly_budget||s.budget||{}; return JSON.stringify(b).indexOf('2500')>=0`);
    ok(`${T} salir no pierde el borrador (queda en el estado de la herramienta)`, draft === true);
    // Volver por el botón: consume la entrada (un solo atrás no debe sacar de la app después).
    const h0 = await J(p, `return history.length`);
    await p.locator('.wsh-bar [data-wsh-nav="back"]').click(); await p.waitForTimeout(600);
    const after = await J(p, `return { work: document.body.classList.contains('ws-work'), state: history.state && history.state.aurixWork }`);
    ok(`${T} «Volver» sale del modo de trabajo y consume su entrada de historial`, !after.work && !after.state, JSON.stringify(after));
    // Desde el Dashboard: Continuar → documento → Volver = Dashboard.
    await p.evaluate(`switchTab('home')`); await p.waitForTimeout(900);
    await p.evaluate(`_wsPlansOpen('ws4_bud1','workspace')`); await p.waitForTimeout(900);
    const fromDash = await J(p, `return { work: document.body.classList.contains('ws-work'), title: (document.querySelector('.wsh-bar-title')||{}).textContent }`);
    ok(`${T} abrir desde el Dashboard entra en modo de trabajo`, fromDash.work && fromDash.title === 'Casa octubre', JSON.stringify(fromDash));
    await p.goBack(); await p.waitForTimeout(900);
    const dashBack = await J(p, `return { tab: currentTab, work: document.body.classList.contains('ws-work') }`);
    ok(`${T} y el atrás del navegador vuelve al Dashboard`, dashBack.tab === 'home' && !dashBack.work, JSON.stringify(dashBack));
    const sw = await J(p, `return document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
    ok(`${T} sin desbordamiento horizontal`, sw);
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ═════════════════ §C · PRESUPUESTO ═════════════════
  for (const [W, H, L] of [[360, 740, 'es'], [390, 844, 'en'], [768, 1024, 'es'], [1440, 900, 'en']]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 800 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
    const LONG = JSON.parse(JSON.stringify(SEED_A));
    LONG.aurix_ws_projects_v1[0].inputs = { currency: 'EUR', periodKey: '2026-10', rows: BUDGET_IN.rows.concat([{ id: 'lng', type: 'expense', label: 'Suscripciones y servicios digitales de toda la familia', amount: '1234567', color: '#E0A84A', order: 3 }]) };
    await boot(p, { seed: LONG, lang: L });
    const T = ENG + '.§C' + W + L;
    await p.evaluate(`switchTab('workspace')`); await p.waitForTimeout(500);
    await p.evaluate(`_wsOpenTool('budget','ws4_bud1')`); await p.waitForTimeout(500);
    const g = await J(p, `var r=function(s){var e=document.querySelector(s); return e? e.getBoundingClientRect():null};
      var k=r('.wsbud-kpis'), d=r('.wsbud-donut'), leg=r('.wsbud-legend');
      return { vh: innerHeight, kpiB: k&&k.bottom, donutB: d&&d.bottom, legT: leg&&leg.top,
        addInHead: !!document.querySelector('.wsbud-blockhead [data-wsbud-add="expense"]') && !!document.querySelector('.wsbud-blockhead [data-wsbud-add="income"]'),
        free: !!document.querySelector('.wsbud-free-note'), reading: document.querySelectorAll('.wsbud-reading').length,
        sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }`);
    ok(`${T} KPIs y donut COMPLETO en la primera pantalla`, g.kpiB && g.donutB && g.donutB <= g.vh, JSON.stringify(g));
    ok(`${T} «Añadir ingreso/gasto» en la cabecera de su bloque`, g.addInHead);
    ok(`${T} una sola conclusión (sin la nota «Dinero libre» duplicada)`, !g.free && g.reading === 1, JSON.stringify(g));
    ok(`${T} sin desbordamiento horizontal (nombre largo + importe grande)`, g.sw);
    // Añadir sin recorrer la lista: el botón de cabecera crea la fila y enfoca su nombre.
    const before = await J(p, `return _wsBudgetRows(_wsToolInputs).filter(function(r){return r.type==='expense'}).length`);
    await p.locator('.wsbud-blockhead [data-wsbud-add="expense"]').click(); await p.waitForTimeout(150);
    const add = await J(p, `return { n: _wsBudgetRows(_wsToolInputs).filter(function(r){return r.type==='expense'}).length, focus: !!(document.activeElement && document.activeElement.hasAttribute('data-wsbud-name-in')) }`);
    ok(`${T} añadir desde la cabecera crea la fila y enfoca su nombre`, add.n === before + 1 && add.focus, JSON.stringify(add));
    await p.keyboard.type('Gimnasio'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
    const amt = p.locator('[data-wsbud-list="expense"] [data-wsbud-amt]').last();
    await amt.fill('50'); await p.waitForTimeout(150);
    const leg = await J(p, `return [].slice.call(document.querySelectorAll('.wsbud-leg-n')).map(function(e){return e.textContent})`);
    ok(`${T} la leyenda del donut se actualiza al momento con el nombre y el importe nuevos`, leg.indexOf('Gimnasio') >= 0, leg.join('|'));
    if (SHOTS) await shot(p, 'budget-' + W + L);
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ═════════════════ §D · DASHBOARD «TU ESPACIO» ═════════════════
  for (const [W, H, COLS] of [[390, 844, 1], [768, 1024, 2], [1440, 900, 3]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
    const SD = JSON.parse(JSON.stringify(SEED_A));
    SD.aurix_ws_projects_v1[1].dashPinned = true;
    SD.aurix_ws_projects_v1[1].results.interest = 72000;
    SD.aurix_ws_projects_v1.push(DOC('ws4_rcv1', 'receivables_app', 'Clientes 2026', { inputs: { currency: 'EUR', items: [{ id: 'a', personOrCompany: 'A', concept: 'x', units: 1, unitPrice: 1000, paidAmount: 400, dueDate: '' }] } }));
    SD.aurix_ws_pinned_v1 = [{ ref: 'tool:loan', ts: 2 }, { ref: 'tpl:mbudget', ts: 1 }];
    await boot(p, { seed: SD });
    const T = ENG + '.§D' + W;
    await p.evaluate(`switchTab('home')`); await p.waitForTimeout(1200);
    await p.evaluate(`updateDashboardPlans()`); await p.waitForTimeout(200);
    const d = await J(p, `var sec=document.getElementById('wsPlansSection'); var grid=function(id){ var g=document.getElementById(id); if(!g) return null; var xs={}; [].slice.call(g.children).forEach(function(c){ xs[Math.round(c.getBoundingClientRect().left)]=1; }); return { n: g.children.length, cols: Object.keys(xs).length }; };
      return { title: (sec.querySelector('.wspl-title')||{}).textContent, groups: [].slice.call(sec.querySelectorAll('.wsx-gtitle')).map(function(e){return e.textContent}),
        plans: grid('wsPlansGrid'), pins: grid('wsPinGrid'),
        pinNames: [].slice.call(sec.querySelectorAll('.wspin-card .wspl-name')).map(function(e){return e.textContent}),
        ring: !!sec.querySelector('.wspl-card[data-wspl-id="ws4_bud1"] .wspl-ring'), cmpShare: !!sec.querySelector('.wspl-card[data-wspl-id="ws4_cmp1"] .wspl-share'),
        notInCats: !sec.closest('.categories-grid'), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }`);
    ok(`${T} un bloque «Tu espacio» con dos grupos: Tus planes y Herramientas fijadas`, d.title === 'Tu espacio' && d.groups.join('|') === 'Tus planes|Herramientas fijadas', JSON.stringify(d));
    ok(`${T} planes en ${COLS} columna(s)`, d.plans && d.plans.cols === Math.min(COLS, d.plans.n), JSON.stringify(d.plans));
    ok(`${T} fijadas en su PROPIA rejilla, en el orden del almacén de fijados`, d.pins && d.pinNames.join('|') === 'Simulador de préstamos|Presupuesto mensual', JSON.stringify(d.pinNames));
    ok(`${T} previews reales: minidonut del presupuesto y aportado/crecimiento de la simulación`, d.ring && d.cmpShare, JSON.stringify(d));
    ok(`${T} el bloque no está dentro de la rejilla patrimonial y no desborda`, d.notInCats && d.sw);
    // Reordenar las fijadas reescribe el almacén (mismo mecanismo de orden, otro grupo).
    await p.evaluate(`_AURIX_REORDER['wsPinGrid'].commit(['tpl:mbudget','tool:loan']); updateDashboardPlans();`); await p.waitForTimeout(150);
    const ord = await J(p, `return { store: _wsPinned().map(function(x){return x.ref}), names: [].slice.call(document.querySelectorAll('.wspin-card .wspl-name')).map(function(e){return e.textContent}) }`);
    ok(`${T} reordenar fijadas persiste en el almacén de fijados y repinta`, ord.store.join() === 'tpl:mbudget,tool:loan' && ord.names[0] === 'Presupuesto mensual', JSON.stringify(ord));
    // Abrir una fijada desde el Dashboard: work mode y Volver = Dashboard.
    await p.locator('.wspin-card [data-wspin-dopen="tool:loan"]').click(); await p.waitForTimeout(900);
    const op = await J(p, `return { work: document.body.classList.contains('ws-work'), tool: _wsToolActive, origin: _wsBackOrigin() }`);
    ok(`${T} abrir una herramienta fijada entra en modo de trabajo con retorno al Dashboard`, op.work && op.tool === 'loan' && op.origin === 'dashboard', JSON.stringify(op));
    if (SHOTS) { await p.evaluate(`switchTab('home')`); await p.waitForTimeout(900); await p.evaluate(`document.getElementById('wsPlansSection').scrollIntoView()`); await shot(p, 'dash-' + W); }
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ═════════════════ §E · FREE: NI WORK MODE NI «TU ESPACIO» ═════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
    await boot(p, { seed: SEED_A, free: true });
    const T = ENG + '.§E';
    await p.evaluate(`switchTab('workspace')`); await p.waitForTimeout(600);
    await p.evaluate(`try{ _wsOpenTool('budget','ws4_bud1'); }catch(e){}`); await p.waitForTimeout(500);
    const f = await J(p, `return { work: document.body.classList.contains('ws-work'), view: _wshView, tool: !!document.querySelector('.wsh-tool-view') }`);
    ok(`${T} Free no monta la herramienta ni entra en modo de trabajo (frontera intacta)`, !f.work && !f.tool, JSON.stringify(f));
    await p.evaluate(`switchTab('home')`); await p.waitForTimeout(900);
    const sec = await J(p, `var s=document.getElementById('wsPlansSection'); return s ? (s.style.display === 'none' || !s.innerHTML) : true`);
    ok(`${T} Free no ve «Tu espacio» (sus datos se conservan, no se filtran)`, sec === true);
    const kept = await J(p, `return _ws4Projects().length`);
    ok(`${T} y sus documentos siguen en su almacén`, kept === 2, String(kept));
    ok(`${T} sin errores de página`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
}
server.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nFALLOS:\n  ' + fails.join('\n  ')); process.exit(1); }
