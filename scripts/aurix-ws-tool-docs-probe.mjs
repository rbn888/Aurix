#!/usr/bin/env node
/**
 * AURIX · «MIS DOCUMENTOS» — LA PRIMITIVA GUARDADA, SEGUNDO CONSUMIDOR
 * ════════════════════════════════════════════════════════════════════════════
 * FASE 2 paso 4. Objetivos tiene un editor POR instancia; una herramienta tiene UN editor y N
 * documentos. Que la MISMA primitiva sirva a las dos formas es la prueba de si la abstracción
 * era correcta o estaba moldeada al primer caso — y es lo que esta sonda mide.
 *
 * Incluye la regresión del DEFECTO PREEXISTENTE que este bloque encontró: abrir un documento
 * guardado desde DENTRO de la herramienta cambiaba el estado y no la pantalla, así que el
 * siguiente «Guardar» habría sobrescrito ese documento con los valores viejos.
 *
 * ACOMODACIÓN DECLARADA: sin sesión OTP el guard de auth programa un rebote a login.html; se
 * cancela por su propio owner.
 *
 *   node scripts/aurix-ws-tool-docs-probe.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
const PW = process.env.AURIX_PW || '/tmp/aurix-pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=normalize(join(ROOT,p));const b=await readFile(f);res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(0,r));const O='http://127.0.0.1:'+server.address().port;
let pass=0; const fails=[];
const ok=(n,c,i)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fails.push(n);console.log('  ✗ '+n+(i?'  ['+i+']':''));} };
const DOCS=[
 {id:'ws4_a',type:'compound_growth',customName:'Plan jubilación',updatedAt:900,revision:1,inputs:{initial:10000,monthly:300,years:20,rate:6},results:{final:187000,initial:10000,contributed:82000,contributedOnly:72000}},
 {id:'ws4_b',type:'compound_growth',customName:'Plan agresivo',updatedAt:800,revision:1,inputs:{initial:5000,monthly:500,years:15,rate:9},results:{final:210000,initial:5000,contributed:95000,contributedOnly:90000}},
 {id:'ws4_c',type:'compound_growth',customName:'Sin cifras guardadas',updatedAt:700,revision:1,inputs:{initial:1000,monthly:10,years:5,rate:3}},
 {id:'ws4_z',type:'loan_simulation',customName:'Hipoteca vivienda',updatedAt:600,revision:1,inputs:{principal:200000,annual:3.2,years:30},results:{monthlyPayment:865,totalInterest:111400,totalPaid:311400,principal:200000,annual:3.2,years:30}},
];
for (const [ENG,launcher] of [['CR',chromium],['WK',webkit]]) {
  const b=await launcher.launch(); const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const pg=await c.newPage(); pg.on('pageerror',e=>console.log('  [pageerror]',e.message));
  await pg.goto(O+'/index.html',{waitUntil:'domcontentloaded'});
  await pg.waitForFunction("typeof _wsOpenTool==='function' && typeof _AURIX_ENT_CANON!=='undefined'",null,{timeout:60000});
  await pg.waitForTimeout(900);
  await pg.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){}
    var bl=document.getElementById('bootLoader');if(bl)bl.remove();var ar=document.getElementById('appRoot');if(ar)ar.style.opacity='1';
    var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(DOCS))});
    switchTab('workspace'); _wsOpenTool('compound'); return true;})()`);
  await pg.waitForTimeout(700);
  const st=await pg.evaluate(`(function(){
    const card=document.querySelector('.wsdoc-card'); const it=[].slice.call(document.querySelectorAll('.wsdoc-card .wssi'));
    const first=document.querySelector('.wstool-inputs-card .ws4-num, .wstool-fields .ws4-num');
    return JSON.stringify({ card:!!card,
      title:(card&&card.querySelector('.wsh-title')||{}).textContent,
      n:it.length, open:it.map(x=>x.open),
      names:it.map(x=>(x.querySelector('.wssi-name')||{}).textContent),
      accents:it.map(x=>x.getAttribute('data-ws-accent')),
      belowWork: card ? Math.round(card.getBoundingClientRect().top) : null,
      firstField: first ? Math.round(first.getBoundingClientRect().top) : null,
      noneNote: document.querySelectorAll('.wssi-doc-none').length,
      onlyCompound: it.every(x=>/Plan |Sin cifras/.test((x.querySelector('.wssi-name')||{}).textContent||'')) });})()`).then(JSON.parse);
  ok(`${ENG}.doc la lista aparece en la capacidad, con su título`, st.card===true && /MIS DOCUMENTOS/.test(st.title||''), JSON.stringify(st.title));
  ok(`${ENG}.doc sólo los documentos de ESTA capacidad (no los del préstamo)`, st.n===3 && st.onlyCompound===true, JSON.stringify(st.names));
  ok(`${ENG}.doc todas plegadas por defecto`, st.open.every(x=>x===false), JSON.stringify(st.open));
  ok(`${ENG}.doc con el acento de la capacidad`, st.accents.every(a=>a==='teal'), JSON.stringify(st.accents));
  ok(`${ENG}.doc va DEBAJO del trabajo: no mueve el primer campo`, st.firstField<400 && st.belowWork>st.firstField, JSON.stringify({campo:st.firstField,lista:st.belowWork}));
  // el cuerpo publica las cifras GUARDADAS, y si no hay no inventa
  await pg.evaluate(`(function(){ document.querySelectorAll('.wsdoc-card .wssi')[0].open=true; document.querySelectorAll('.wsdoc-card .wssi')[2].open=true; return true;})()`);
  await pg.waitForTimeout(250);
  const bod=await pg.evaluate(`(function(){ const it=[].slice.call(document.querySelectorAll('.wsdoc-card .wssi'));
    return JSON.stringify({ k0:[].slice.call(it[0].querySelectorAll('.wssi-doc-kpi b')).map(b=>b.textContent.trim()),
      none2: it[2].querySelectorAll('.wssi-doc-none').length,
      kpis2: it[2].querySelectorAll('.wssi-doc-kpi').length,
      openBtn: it[0].querySelectorAll('[data-wsdoc-open]').length });})()`).then(JSON.parse);
  ok(`${ENG}.doc el cuerpo publica las cifras GUARDADAS del documento`, bod.k0.length===2 && /187/.test(bod.k0[0]), JSON.stringify(bod.k0));
  ok(`${ENG}.doc un documento sin resultados NO publica cifras inventadas`, bod.none2===1 && bod.kpis2===0, JSON.stringify(bod));
  ok(`${ENG}.doc y ofrece abrirlo`, bod.openBtn===1);
  // ABRIR carga el documento en el editor
  await pg.evaluate(`(function(){ document.querySelector('.wsdoc-card .wssi [data-wsdoc-open]').click(); return true;})()`);
  await pg.waitForTimeout(600);
  const opened=await pg.evaluate(`(function(){
    const cur=document.querySelector('.wsdoc-card .wssi.is-current');
    return JSON.stringify({ editId:_wsToolEditId, docName:(document.querySelector('.wsh-doc')||{}).textContent||'',
      current:!!cur, currentName:cur?(cur.querySelector('.wssi-name')||{}).textContent:null,
      openBtnOnCurrent: cur?cur.querySelectorAll('[data-wsdoc-open]').length:-1 });})()`).then(JSON.parse);
  ok(`${ENG}.doc abrir carga ESE documento en el editor`, opened.editId==='ws4_a', JSON.stringify(opened));
  ok(`${ENG}.doc el abierto se distingue y no se ofrece abrirlo otra vez`, opened.current===true && opened.openBtnOnCurrent===0, JSON.stringify(opened));
  // el ⋯ de una herramienta SÍ ofrece «Abrir» (lo que el segundo consumidor obligó a cambiar)
  await pg.evaluate(`(function(){ document.querySelectorAll('.wsdoc-card .wssi [data-wssi-menu]')[1].click(); return true;})()`);
  await pg.waitForTimeout(250);
  const menu=await pg.evaluate(`(function(){ const m=document.getElementById('wsSavedMenu');
    return JSON.stringify({ open:!!m, items:m?[].slice.call(m.querySelectorAll('[data-wsmenu-act]')).map(b=>b.getAttribute('data-wsmenu-act')):[] });})()`).then(JSON.parse);
  ok(`${ENG}.doc el ⋯ de una herramienta ofrece «Abrir»`, menu.open && menu.items[0]==='open', JSON.stringify(menu.items));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  // y Objetivos SIGUE sin ofrecerlo
  await pg.evaluate(`(function(){ localStorage.setItem('aurix_ws_goals_v1', JSON.stringify([{id:'g1',name:'Meta',type:'wealth',target:1000,current:100,monthly:10,mode:'manual',createdAt:1,updatedAt:1,revision:1}]));
    switchTab('dashboard'); switchTab('workspace'); _wsOpenSurface('goals'); return true;})()`);
  await pg.waitForTimeout(500);
  await pg.evaluate(`(function(){ document.querySelector('.wssi [data-wssi-menu]').click(); return true;})()`);
  await pg.waitForTimeout(250);
  const gm=await pg.evaluate(`(function(){ const m=document.getElementById('wsSavedMenu');
    return JSON.stringify({ items:m?[].slice.call(m.querySelectorAll('[data-wsmenu-act]')).map(b=>b.getAttribute('data-wsmenu-act')):[] });})()`).then(JSON.parse);
  ok(`${ENG}.doc …y en Objetivos el ⋯ sigue SIN «Abrir» (misma primitiva, dos contratos)`, gm.items.indexOf('open')<0, JSON.stringify(gm.items));
  // ── REGRESIÓN DEL DEFECTO PREEXISTENTE ────────────────────────────────────────────────────
  // Abrir un documento desde DENTRO de la herramienta tiene que repintar la pantalla. Antes no
  // lo hacía —el guard de idempotencia de `renderWorkspaceHome` cortaba— y el estado quedaba
  // apuntando a un documento cuyos valores no eran los que se veían.
  // El paso anterior dejó la página en Objetivos y, sin sesión, el guard de auth puede haber
  // rebotado a login.html — que es comportamiento correcto y deja un documento sin el ámbito de
  // app.js. Se vuelve a montar antes de medir, en vez de suponer que seguimos en la misma página.
  await pg.goto(O + '/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction("typeof _wsOpenTool === 'function' && typeof _AURIX_ENT_CANON !== 'undefined'", null, { timeout: 60000 });
  await pg.waitForTimeout(900);
  await pg.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){}
    var bl=document.getElementById('bootLoader');if(bl)bl.remove();var ar=document.getElementById('appRoot');if(ar)ar.style.opacity='1';
    var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(DOCS))});
    switchTab('workspace'); _wsOpenTool('compound'); return true;})()`);
  await pg.waitForTimeout(600);
  const pre = await pg.evaluate(`(function(){ const f=document.querySelector('[data-wstool-input="initial"]');
    return JSON.stringify({ v: f ? f.value : null, id: _wsToolEditId }); })()`).then(JSON.parse);
  await pg.evaluate(`(function(){ _wsOpenTool('compound','ws4_b'); return true; })()`);
  await pg.waitForTimeout(600);
  const post = await pg.evaluate(`(function(){ const f=document.querySelector('[data-wstool-input="initial"]');
    return JSON.stringify({ v: f ? f.value : null, id: _wsToolEditId, state: _wsToolInputs ? String(_wsToolInputs.initial) : null }); })()`).then(JSON.parse);
  ok(`${ENG}.doc abrir desde DENTRO repinta la pantalla, no sólo el estado`,
    post.id === 'ws4_b' && post.v !== pre.v && String(post.v).replace(/\D/g, '') === String(post.state).replace(/\D/g, ''),
    JSON.stringify({ pre, post }));

  // ── RESPONSIVE · la fila y su cuerpo en las seis anchuras ─────────────────────────────────
  await c.close();
  for (const [w,h] of [[360,780],[375,812],[390,844],[768,1024],[1024,900],[1440,1000]]) {
    const cx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor: w<700?2:1, reducedMotion:'reduce' });
    const p2 = await cx.newPage();
    await p2.goto(O+'/index.html',{waitUntil:'domcontentloaded'});
    await p2.waitForFunction("typeof _wsOpenTool==='function' && typeof _AURIX_ENT_CANON!=='undefined'",null,{timeout:60000});
    await p2.waitForTimeout(900);
    await p2.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){}
      var bl=document.getElementById('bootLoader');if(bl)bl.remove();var ar=document.getElementById('appRoot');if(ar)ar.style.opacity='1';
      var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
      _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
      localStorage.setItem('aurix_ws_projects_v1', ${JSON.stringify(JSON.stringify(DOCS))});
      switchTab('workspace'); _wsOpenTool('compound'); return true;})()`);
    await p2.waitForTimeout(650);
    await p2.evaluate(`(function(){ const d=document.querySelector('.wsdoc-card .wssi'); if(d) d.open=true; return true; })()`);
    await p2.waitForTimeout(250);
    const g = await p2.evaluate(`(function(){
      const card=document.querySelector('.wsdoc-card'); const it=card.querySelector('.wssi');
      const nm=it.querySelector('.wssi-name'), mn=it.querySelector('.wssi-menu');
      const nb=nm.getBoundingClientRect(), mb=mn.getBoundingClientRect(), cb=card.getBoundingClientRect();
      const af=getComputedStyle(mn,'::after');
      const spill=[].slice.call(card.querySelectorAll('*')).filter(e=>{const r=e.getBoundingClientRect();
        return r.width && (r.right>cb.right+1 || r.left<cb.left-1);}).length;
      return JSON.stringify({ overlap: nb.right > mb.left + 0.5, spill: spill,
        tap: Math.round(Math.min(parseFloat(af.width)||mb.width, parseFloat(af.height)||mb.height)),
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth+1,
        cta: !!it.querySelector('[data-wsdoc-open]') });})()`).then(JSON.parse);
    ok(`${ENG}.${w} la fila del documento no solapa su ⋯`, g.overlap===false, JSON.stringify(g));
    ok(`${ENG}.${w} nada se pinta fuera de la tarjeta`, g.spill===0, 'spill='+g.spill);
    ok(`${ENG}.${w} el ⋯ mantiene 44 px de área táctil`, g.tap>=44, 'tap='+g.tap);
    ok(`${ENG}.${w} sin scroll horizontal`, g.hscroll===false);
    ok(`${ENG}.${w} el cuerpo ofrece abrir el documento`, g.cta===true);
    if (w===390) await p2.screenshot({path:join(ROOT,'docs','workspace-visual-qa','wsdoc-'+ENG+'-390.png'),fullPage:true}).catch(()=>{});
    await cx.close();
  }
  await b.close();
}
server.close();
console.log('\n════════════════════════════════════════════════');
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nFAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log('\nRESULT: NO-GO'); process.exit(1); }
console.log('\nRESULT: GO');
process.exit(0);
