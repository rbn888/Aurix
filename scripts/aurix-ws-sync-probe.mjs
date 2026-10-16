// Dos dispositivos (contextos de navegador independientes) de la MISMA cuenta contra un
// servidor workspace_documents en memoria con la semántica de PostgREST (upsert onConflict
// user_id,doc_id · select filtrado por user_id = RLS). Ejecuta los bytes del repo (= desplegados).
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { join, extname, normalize } from 'node:path';
const ROOT = process.env.ROOT || '/Users/ruben/claude-test/portfolio';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const http = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = normalize(join(ROOT, p)); let b = await readFile(f); if (f.endsWith('app.js')) b = Buffer.from(String(b).replace('function safeRedirect(path, source) {', 'function safeRedirect(path, source) { return false;').replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0')); res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(b); } catch (_) { res.writeHead(404).end(); } });
await new Promise(r => http.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${http.address().port}/index.html`;
const { chromium, webkit } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');
const ENG = process.env.ENG || 'cr';
const browser = await (ENG === 'wk' ? webkit : chromium).launch();
// ── servidor ──
const server = new Map();   // user_id|doc_id → row
let upserts = 0;
function sbOp(op) {
  const { table, kind, rows, filters, uid } = op;
  if (table !== 'workspace_documents') return { data: [], error: null };
  if (kind === 'upsert') { for (const r of rows) { if (r.user_id !== uid) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }; server.set(r.user_id + '|' + r.doc_id, JSON.parse(JSON.stringify(r))); upserts++; } return { data: null, error: null }; }
  if (kind === 'select') { let out = [...server.values()].filter(r => r.user_id === uid); for (const [c, v] of filters) out = out.filter(r => String(r[c]) === String(v)); return { data: JSON.parse(JSON.stringify(out)), error: null }; }
  return { data: null, error: null };
}
const MOCK = `(function(){ window.__mkSb = function(uid){ function q(table){ var st={table:table,filters:[],uid:uid};
  var b={ select:function(){ st.kind='select'; return b; }, eq:function(c,v){ st.filters.push([c,v]); return b; }, order:function(){return b;}, limit:function(){return b;},
    upsert:function(rows){ st.kind='upsert'; st.rows=Array.isArray(rows)?rows:[rows]; return b; },
    then:function(res,rej){ return window.__sb(JSON.stringify(st)).then(function(s){ return JSON.parse(s); }).then(res,rej); } }; return b; }
  return { from:q, auth:{ getSession:async function(){ return {data:{session:{user:{id:uid}}}}; }, onAuthStateChange:function(){ return {data:{subscription:{unsubscribe:function(){}}}}; } }, channel:function(){ return {on:function(){return this;},subscribe:function(){return this;}}; }, removeChannel:function(){} }; }; })()`;
async function device(name, seed) {
  const ctx = await browser.newContext({ viewport: { width: name === 'iphone' ? 390 : 1440, height: name === 'iphone' ? 844 : 900 }, hasTouch: name === 'iphone' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.exposeFunction('__sb', s => JSON.stringify(sbOp(JSON.parse(s))));
  await p.addInitScript(`try{ localStorage.setItem('portfolio_lang','es'); if(!sessionStorage.getItem('__seeded')){ ${Object.entries(seed || {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join('')} sessionStorage.setItem('__seeded','1'); } }catch(_){}`);
  await p.addInitScript(MOCK);
  const boot = async () => {
    await p.goto(URL0, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction("typeof _wsDocsPull==='function' && typeof _AURIX_ENT_CANON!=='undefined'", null, { timeout: 60000 });
    await p.waitForTimeout(600);
    await p.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){} var bl=document.getElementById('bootLoader'); if(bl) bl.remove();
      var f=Object.create(null); _AURIX_ENT_CANON.forEach(function(k){ f[k]=(k!=='workspace.catalog_preview'); });
      _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'active',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
      currentUser={id:'u-test-1',email:'qa@example.test'}; supabaseClient=window.__mkSb('u-test-1'); try{_aurixActiveUserId='u-test-1'; _aurixStampCacheOwner();}catch(_){} })()`);
  };
  await boot();
  const api = {
    p, errs, name,
    ev: (s) => p.evaluate(s),
    pull: () => p.evaluate(`(async function(){ _wsDocsPulledFor=null; return await _wsDocsPull(); })()`),
    flush: () => p.evaluate(`(async function(){ Object.keys(_wsDocTimers).forEach(function(k){ clearTimeout(_wsDocTimers[k]); delete _wsDocTimers[k]; }); var r=[]; for (var k of Object.keys(_WS_DOC_KEYS).concat(_WS_PREF_KEYS)) r.push(await _wsDocsPush(k)); return r; })()`),
    reload: async () => { await boot(); },
    docs: () => p.evaluate(`JSON.stringify(_ws4ProjectsRaw().map(function(d){ return {id:d.id, name:d.customName, rev:d.revision, del:!!d.deletedAt, dash:_wsPlanOnDash(d), pin:d.dashPinned, hid:d.dashHidden, inputs:d.inputs}; }))`).then(JSON.parse),
  };
  return api;
}
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; fails.push(n); console.log('  ✗', n, d === undefined ? '' : JSON.stringify(d)); } };
const BUD = (id, name, amt, extra) => Object.assign({ id, type: 'monthly_budget', customName: name, currency: 'EUR', createdAt: Date.now() - 1e6, updatedAt: Date.now() - 1e6, dashHidden: true,
  inputs: { currency: 'EUR', periodKey: '2026-10', rows: [{ id: 'salary', type: 'income', label: 'Nómina', amount: String(amt), order: 0 }, { id: 'rent', type: 'expense', label: 'Alquiler', amount: '900', order: 1 }] } }, extra || {});

console.log(`== SYNC · ${ENG} ==`);
const mac = await device('mac', {});
const iph = await device('iphone', {});

// T1 crear y guardar en Mac → aparece en iPhone, mismo contenido, sin duplicar
await mac.ev(`_ws4Persist(${JSON.stringify(BUD('d_t1', 'Casa QA', 2400))})`); await mac.flush();
ok('T1 la fila llega al servidor con la cuenta autenticada', server.has('u-test-1|d_t1') && server.get('u-test-1|d_t1').body.revision >= 1);
await iph.pull(); let D = await iph.docs(); let x = D.filter(d => d.id === 'd_t1');
ok('T1 el iPhone recupera el documento del Mac (sin datos locales previos)', x.length === 1 && x[0].inputs.rows[0].amount === '2400', D);
// T2 actualización sucesiva y recarga
await mac.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount='2500'; _ws4Persist(d); d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount='2600'; _ws4Persist(d); })()`); await mac.flush();
await iph.reload(); await iph.pull(); D = await iph.docs(); x = D.filter(d => d.id === 'd_t1');
ok('T2 guardados sucesivos + recarga: el iPhone ve el último (2600), una sola copia', x.length === 1 && x[0].inputs.rows[0].amount === '2600', x);
// T3 publicar en Dashboard desde el Mac → iPhone lo publica; contenido intacto
await mac.ev(`_wsPlanDashSet('d_t1', false)`); await mac.flush(); await iph.pull(); D = await iph.docs(); x = D.find(d => d.id === 'd_t1');
ok('T3 publicar en el Mac → publicado en el iPhone, contenido intacto', x && x.dash === true && x.inputs.rows[0].amount === '2600', x);
// T4 retirar del Dashboard en el Mac → retirado en el iPhone
await mac.ev(`_wsPlanDashSet('d_t1', true)`); await mac.flush(); await iph.pull(); D = await iph.docs(); x = D.find(d => d.id === 'd_t1');
ok('T4 retirar en el Mac → retirado en el iPhone, contenido intacto', x && x.dash === false && x.inputs.rows[0].amount === '2600', x);
// T4b el iPhone edita después y sube: no debe re-publicarlo en el Mac
await iph.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount='2700'; _ws4Persist(d); })()`); await iph.flush(); await mac.pull(); D = await mac.docs(); x = D.find(d => d.id === 'd_t1');
ok('T4b una edición posterior en el iPhone no resucita la publicación en el Mac', x && x.dash === false && x.inputs.rows[0].amount === '2700', x);
// T4c re-publicar en iPhone → Mac
await iph.ev(`_wsPlanDashSet('d_t1', false)`); await iph.flush(); await mac.pull(); D = await mac.docs(); x = D.find(d => d.id === 'd_t1');
ok('T4c re-publicar en el iPhone → publicado en el Mac', x && x.dash === true, x);
// T5 favoritos independientes de publicación y documentos
await mac.ev(`_wshWriteStore(_WSH_PINNED_KEY, [{ref:'tpl:mbudget', ts: Date.now()}])`); await mac.flush(); await iph.pull();
let pinI = await iph.ev(`JSON.stringify(_wshReadStore(_WSH_PINNED_KEY))`);
ok('T5 favorito del Mac llega al iPhone', /tpl:mbudget/.test(pinI), pinI);
await mac.p.waitForTimeout(1100); await mac.ev(`_wshWriteStore(_WSH_PINNED_KEY, [])`); await mac.flush(); await iph.pull(); pinI = await iph.ev(`JSON.stringify(_wshReadStore(_WSH_PINNED_KEY))`);
D = await iph.docs(); x = D.find(d => d.id === 'd_t1');
ok('T5 quitar el último favorito en el Mac → vacío en el iPhone; el documento y su publicación no cambian', pinI === '[]' && x && x.dash === true && !x.del, { pinI, x });
// T6 borrar en el iPhone → desaparece en el Mac (tombstone), sin borrar otros
await mac.ev(`_ws4Persist(${JSON.stringify(BUD('d_t6', 'Otro QA', 1000))})`); await mac.flush(); await iph.pull();
await iph.ev(`_ws4Tombstone('d_t6')`); await iph.flush(); await mac.pull(); D = await mac.docs();
ok('T6 borrar en el iPhone → borrado en el Mac; el otro documento sigue', D.find(d => d.id === 'd_t6').del === true && D.find(d => d.id === 'd_t1').del === false, D.map(d => [d.id, d.del]));
// T6b borrar en un dispositivo y editar en el otro desde la misma revisión
await mac.ev(`_ws4Persist(${JSON.stringify(BUD('d_t6b', 'Borrar QA', 500))})`); await mac.flush(); await iph.pull();
await iph.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t6b';}); d.inputs.rows[0].amount='600'; _ws4Persist(d); })()`);
await mac.p.waitForTimeout(50); await mac.ev(`_ws4Tombstone('d_t6b')`);
await iph.flush(); await mac.flush();   // el servidor queda con el borrado (posterior)
await iph.pull(); await mac.pull();
let tb = { mac: (await mac.docs()).filter(d => d.id === 'd_t6b'), iph: (await iph.docs()).filter(d => d.id === 'd_t6b'), srv: !!server.get('u-test-1|d_t6b').deleted_at };
ok('T6b borrado posterior a una edición simultánea: los dos y el servidor convergen a borrado, sin duplicar', tb.mac.length === 1 && tb.iph.length === 1 && tb.mac[0].del && tb.iph[0].del && tb.srv, tb);
await iph.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount=d.inputs.rows[0].amount; _ws4Persist(d); })()`); await iph.flush();
ok('T6b un guardado posterior de otro documento en el iPhone no resucita el borrado', !!server.get('u-test-1|d_t6b').deleted_at);
// T6c inverso: edición posterior al borrado → gana la edición en los dos
await mac.ev(`_ws4Persist(${JSON.stringify(BUD('d_t6c', 'Editar QA', 500))})`); await mac.flush(); await iph.pull();
await mac.ev(`_ws4Tombstone('d_t6c')`); await iph.p.waitForTimeout(50);
await iph.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t6c';}); d.inputs.rows[0].amount='700'; _ws4Persist(d); })()`);
await iph.flush(); await mac.flush();   // el servidor queda con el borrado (anterior)
await iph.pull(); await iph.p.waitForTimeout(1600); await iph.flush(); await mac.pull();
tb = { mac: (await mac.docs()).filter(d => d.id === 'd_t6c'), iph: (await iph.docs()).filter(d => d.id === 'd_t6c'), srv: server.get('u-test-1|d_t6c') };
ok('T6c edición posterior a un borrado simultáneo: gana la edición (700) en los dos y en el servidor', tb.mac.length === 1 && !tb.mac[0].del && tb.mac[0].inputs.rows[0].amount === '700' && !tb.iph[0].del && !tb.srv.deleted_at && tb.srv.body.inputs.rows[0].amount === '700', { mac: tb.mac, iph: tb.iph, srvDel: tb.srv.deleted_at });
// T7 conflicto: los dos editan la misma revisión sin leer antes
await mac.pull(); await iph.pull();
await mac.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.customName='Mac edit'; _ws4Persist(d); })()`);
await iph.p.waitForTimeout(50);
await iph.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount='3000'; _ws4Persist(d); })()`);
await mac.flush(); await iph.flush();
console.log('    dbg', await mac.ev(`JSON.stringify({st:_wsDocSync['aurix_ws_projects_v1'], at:_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}).updatedAt})`), server.get('u-test-1|d_t1').body.updatedAt);
await mac.pull(); await iph.pull();
const cm = (await mac.docs()).find(d => d.id === 'd_t1'), ci = (await iph.docs()).find(d => d.id === 'd_t1'), cs = server.get('u-test-1|d_t1').body;
console.log('    T7 conflicto → servidor:', cs.customName, cs.inputs.rows[0].amount, 'rev', cs.revision, '| mac:', cm.name, cm.inputs.rows[0].amount, cm.rev, '| iphone:', ci.name, ci.inputs.rows[0].amount, ci.rev);
ok('T7 conflicto simultáneo: ningún documento desaparece ni se duplica', (await mac.docs()).filter(d => d.id === 'd_t1').length === 1 && (await iph.docs()).filter(d => d.id === 'd_t1').length === 1);
ok('T7 conflicto simultáneo: los dos dispositivos convergen al mismo contenido', cm.name === ci.name && cm.inputs.rows[0].amount === ci.inputs.rows[0].amount, { cm, ci });
// T7b inverso: el iPhone edita ANTES pero sube DESPUÉS (sin conexión) → el servidor queda con la edición más antigua
await mac.pull(); await iph.pull();
await iph.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount='3100'; _ws4Persist(d); })()`);
await mac.p.waitForTimeout(50);
await mac.ev(`(function(){ var d=_ws4ProjectsRaw().find(function(x){return x.id==='d_t1';}); d.inputs.rows[0].amount='3200'; _ws4Persist(d); })()`);
await mac.flush(); await iph.flush();
await mac.pull(); await mac.p.waitForTimeout(1600); await mac.flush(); await iph.pull();
const bm = (await mac.docs()).find(d => d.id === 'd_t1'), bi = (await iph.docs()).find(d => d.id === 'd_t1');
console.log('    T7b → servidor:', server.get('u-test-1|d_t1').body.inputs.rows[0].amount, '| mac:', bm.inputs.rows[0].amount, '| iphone:', bi.inputs.rows[0].amount);
ok('T7b subida tardía de una edición más antigua: los dos y el servidor convergen a la más reciente (3200)', bm.inputs.rows[0].amount === '3200' && bi.inputs.rows[0].amount === '3200' && server.get('u-test-1|d_t1').body.inputs.rows[0].amount === '3200');
// T8 ambiguo: fila remota antigua sin `revision` en el cuerpo (anterior a 52ccd7a)
server.set('u-test-1|d_old', { user_id: 'u-test-1', doc_id: 'd_old', kind: 'ws_project', title: 'Antiguo', body: (() => { const b = BUD('d_old', 'Antiguo QA', 1800); delete b.dashHidden; return b; })(), revision: 1, deleted_at: null, body_version: 1, currency: 'EUR' });
await iph.pull(); D = await iph.docs(); let rec = JSON.parse(await iph.ev(`JSON.stringify(_wsRecoverable())`));
ok('T8 un documento remoto antiguo sin revisión NO se restaura solo: queda como recuperable', !D.some(d => d.id === 'd_old') && rec.length === 1 && rec[0].docId === 'd_old', { D: D.map(d => d.id), rec });
ok('T8 el recuperable conserva el contenido completo', rec[0] && rec[0].body.inputs.rows[0].amount === '1800');
await iph.ev(`_wsRecoverDoc(_wsRecoverable()[0])`); await iph.flush(); D = await iph.docs(); rec = JSON.parse(await iph.ev(`JSON.stringify(_wsRecoverable())`));
ok('T8 Recuperar: vuelve una sola vez, con su contenido, y deja de estar pendiente', D.filter(d => d.id === 'd_old').length === 1 && D.find(d => d.id === 'd_old').inputs.rows[0].amount === '1800' && rec.length === 0, { D, rec });
ok('T8 tras recuperar, el servidor lo tiene con revisión en el cuerpo (vigente para el resto)', typeof server.get('u-test-1|d_old').body.revision === 'number');
const mac2 = await device('mac', {}); await mac2.pull(); D = await mac2.docs();
ok('T8 un tercer navegador sin datos lo recibe directamente (sin pasar por recuperables), sin duplicar', D.filter(d => d.id === 'd_old').length === 1 && JSON.parse(await mac2.ev(`JSON.stringify(_wsRecoverable())`)).length === 0);
// T9 recarga y reapertura de sesión en el Mac: nada desaparece
await mac.reload(); await mac.pull(); D = await mac.docs();
ok('T9 recarga del Mac: mismos documentos, sin duplicados', ['d_t1', 'd_t6', 'd_t6b', 'd_t6c', 'd_old'].every(id => D.filter(d => d.id === id).length === 1), D.map(d => d.id));
ok('T10 sin errores de página', !mac.errs.length && !iph.errs.length && !mac2.errs.length, [mac.errs, iph.errs, mac2.errs]);
console.log(`\n${pass} passed, ${fail} failed`); if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
await browser.close(); http.close(); process.exit(fail ? 1 : 0);
