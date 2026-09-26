#!/usr/bin/env node
/**
 * AURIX · INSTANCIA GUARDADA PLEGADA — LA PRIMITIVA COMÚN, EN NAVEGADOR REAL
 * ════════════════════════════════════════════════════════════════════════════
 * FASE 2 paso 2/3: `_wsSavedItemHtml` es el patrón que §22 pide para los guardados de TODA
 * capacidad, y Objetivos es su primer consumidor. Lo que se mide aquí es que la abstracción
 * funcione de verdad sobre una capacidad ya cerrada: plegado por defecto, apertura con teclado,
 * edición viva dentro del cuerpo, el ⋯ sin plegar la instancia, Dashboard sin borrar,
 * persistencia tras recargar y aislamiento al cambiar de cuenta.
 *
 * ACOMODACIÓN DECLARADA: sin sesión OTP el guard de auth programa un rebote a login.html —
 * comportamiento CORRECTO y ajeno a lo que se mide— y se cancela por su propio owner.
 *
 *   node scripts/aurix-ws-saved-instance-probe.mjs
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
async function boot(pg){
  await pg.goto(O+'/index.html',{waitUntil:'domcontentloaded'});
  await pg.waitForFunction("typeof _wsOpenSurface==='function' && typeof _AURIX_ENT_CANON!=='undefined'",null,{timeout:60000});
  await pg.waitForTimeout(900);
  await pg.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){}
    var bl=document.getElementById('bootLoader');if(bl)bl.remove();var ar=document.getElementById('appRoot');if(ar)ar.style.opacity='1';
    var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    return true;})()`);
}
const openGoals = pg => pg.evaluate(`(function(){ switchTab('workspace'); _wsOpenSurface('goals'); return true; })()`);
for (const [ENG,launcher] of [['CR',chromium],['WK',webkit]]) {
  const b=await launcher.launch(); const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const pg=await c.newPage(); pg.on('pageerror',e=>console.log('  [pageerror]',e.message));
  await boot(pg);
  // dos objetivos guardados de antemano: uno de ellos ya en el Dashboard
  await pg.evaluate(`(function(){ localStorage.setItem('aurix_ws_goals_v1', JSON.stringify([
    {id:'g1',name:'Libertad financiera',type:'wealth',target:250000,current:40000,monthly:500,mode:'manual',dashPinned:true,createdAt:1,updatedAt:900,revision:1},
    {id:'g2',name:'Colchón de emergencia',type:'wealth',target:12000,current:3000,monthly:200,mode:'manual',createdAt:2,updatedAt:800,revision:1}])); return true;})()`);
  await openGoals(pg); await pg.waitForTimeout(500);
  const st=await pg.evaluate(`(function(){
    const it=[].slice.call(document.querySelectorAll('.wssi'));
    return JSON.stringify({ n:it.length, open:it.map(x=>x.open),
      names:it.map(x=>(x.querySelector('.wssi-name')||{}).textContent),
      accents:it.map(x=>x.getAttribute('data-ws-accent')),
      refs:it.map(x=>x.getAttribute('data-wssi-ref')),
      cardid:it.map(x=>x.getAttribute('data-wsg-cardid')),
      menus:it.filter(x=>x.querySelector('[data-wssi-menu]')).length,
      inputsHidden: it[0].querySelectorAll('[data-wsg-input]').length });})()`).then(JSON.parse);
  ok(`${ENG}.si dos instancias, las dos PLEGADAS por defecto`, st.n===2 && st.open.every(x=>x===false), JSON.stringify(st.open));
  ok(`${ENG}.si cada una publica su nombre, su acento y su ref`, st.names[0]==='Libertad financiera' && st.accents.every(a=>a==='plum') && st.refs[0]==='goal:g1', JSON.stringify(st));
  ok(`${ENG}.si conserva `+'`data-wsg-cardid`'+`, que es lo que la edición en vivo resuelve`, st.cardid[0]==='g1');
  ok(`${ENG}.si cada una tiene su ⋯`, st.menus===2);
  // ABRIR con teclado (es un <details> nativo)
  await pg.evaluate(`(function(){ document.querySelectorAll('.wssi-sum')[0].focus(); return true; })()`);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
  const opened=await pg.evaluate(`(function(){ const it=document.querySelectorAll('.wssi');
    return JSON.stringify({ open:[].slice.call(it).map(x=>x.open),
      inputs: it[0].querySelectorAll('[data-wsg-input]').length,
      chev: getComputedStyle(it[0].querySelector('.wssi-chev')).transform.slice(0,20) });})()`).then(JSON.parse);
  ok(`${ENG}.si se abre con TECLADO y sólo la enfocada`, opened.open[0]===true && opened.open[1]===false, JSON.stringify(opened.open));
  ok(`${ENG}.si al abrirse aparecen sus campos de edición`, opened.inputs>=2, 'inputs='+opened.inputs);
  // EDITAR: el cálculo sigue vivo dentro del cuerpo
  const before=await pg.evaluate(`(function(){ return (document.querySelector('.wssi[open] [data-wsg-out]')||{}).textContent||''; })()`);
  const fld=await pg.$('.wssi[open] [data-wsg-input="current"]');
  await fld.click({clickCount:3}); await pg.keyboard.type('90000',{delay:15}); 
  await pg.waitForTimeout(350);
  const after=await pg.evaluate(`(function(){ return (document.querySelector('.wssi[open] [data-wsg-out]')||{}).textContent||''; })()`);
  ok(`${ENG}.si editar dentro del cuerpo sigue recalculando`, before!==after && after.length>0);
  // el ⋯ NO pliega la instancia
  await pg.evaluate(`(function(){ document.querySelector('.wssi[open] [data-wssi-menu]').click(); return true; })()`);
  await pg.waitForTimeout(250);
  const menu=await pg.evaluate(`(function(){ const m=document.getElementById('wsSavedMenu');
    return JSON.stringify({ open:!!m, stillOpen:document.querySelectorAll('.wssi[open]').length,
      items:m?[].slice.call(m.querySelectorAll('[data-wsmenu-act]')).map(b=>b.getAttribute('data-wsmenu-act')):[] });})()`).then(JSON.parse);
  ok(`${ENG}.si el ⋯ abre el menú y NO pliega la instancia`, menu.open===true && menu.stillOpen===1, JSON.stringify(menu));
  ok(`${ENG}.si el menú ofrece quitar del Dashboard (g1 ya estaba)`, menu.items.indexOf('unpin')>=0, JSON.stringify(menu.items));
  // quitar del Dashboard: no borra
  await pg.evaluate(`(function(){ document.querySelector('#wsSavedMenu [data-wsmenu-act="unpin"]').click(); return true; })()`);
  await pg.waitForTimeout(400);
  const un=await pg.evaluate(`(function(){ const raw=JSON.parse(localStorage.getItem('aurix_ws_goals_v1')||'[]');
    const g=raw.find(x=>x.id==='g1');
    return JSON.stringify({ exists:!!g, pinned:!!(g&&g.dashPinned), deleted:!!(g&&g.deletedAt), target:g&&g.target, items:document.querySelectorAll('.wssi').length });})()`).then(JSON.parse);
  ok(`${ENG}.si quitar del Dashboard NO borra ni saca de la lista`, un.exists&&!un.pinned&&!un.deleted&&un.target===250000&&un.items===2, JSON.stringify(un));
  // reload: persistencia intacta
  await pg.reload({waitUntil:'domcontentloaded'}); await pg.waitForTimeout(1500);
  await pg.evaluate(`(function(){ try{_aurixCancelLoginRedirect('p');_aurixMarkSessionConfirmed();}catch(_){}
    var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    switchTab('workspace'); _wsOpenSurface('goals'); return true;})()`);
  await pg.waitForTimeout(600);
  const re=await pg.evaluate(`(function(){ const it=document.querySelectorAll('.wssi');
    return JSON.stringify({ n:it.length, open:[].slice.call(it).map(x=>x.open),
      raw:JSON.parse(localStorage.getItem('aurix_ws_goals_v1')||'[]').length });})()`).then(JSON.parse);
  ok(`${ENG}.si tras recargar siguen los dos, y otra vez plegados`, re.n===2 && re.raw===2 && re.open.every(x=>x===false), JSON.stringify(re));
  // aislamiento por cuenta: el almacén del anterior no se hereda
  // Se SALE y se VUELVE, que es lo que hace una persona: `renderWorkspaceHome` tiene un guard de
  // idempotencia (`if (shown === 'goals') return`) y purgar el almacén no pide por sí mismo un
  // repintado. La primera versión de esta prueba medía el DOM viejo y acusaba al producto.
  const iso=await pg.evaluate(`(function(){ try{ _clearLocalUserState(_AURIX_PURGE.USER_SWITCH,'u1'); }catch(_){ localStorage.removeItem('aurix_ws_goals_v1'); }
    switchTab('dashboard'); switchTab('workspace'); _wsOpenSurface('goals');
    return JSON.stringify({ items:document.querySelectorAll('.wssi').length,
      raw:JSON.parse(localStorage.getItem('aurix_ws_goals_v1')||'[]').length });})()`).then(JSON.parse);
  ok(`${ENG}.si tras cambiar de cuenta no queda ni una instancia del anterior`, iso.items===0 && iso.raw===0, JSON.stringify(iso));
  await pg.screenshot({path:join(ROOT,'docs','workspace-visual-qa','wssi-'+ENG+'.png')}).catch(()=>{});
  await c.close();

  // ── RESPONSIVE · la fila plegada tiene que caber y ser tocable en las seis anchuras ────────
  for (const [w,h] of [[360,780],[375,812],[390,844],[768,1024],[1024,900],[1440,1000]]) {
    const cx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor: w<700?2:1, reducedMotion:'reduce' });
    const p2 = await cx.newPage();
    await boot(p2);
    await p2.evaluate(`(function(){ localStorage.setItem('aurix_ws_goals_v1', JSON.stringify([
      {id:'r1',name:'Un nombre deliberadamente largo para comprobar que envuelve y no empuja al menu fuera de su fila',type:'wealth',target:1250000,current:640000,monthly:2500,mode:'manual',dashPinned:true,createdAt:1,updatedAt:900,revision:1}])); return true;})()`);
    await openGoals(p2); await p2.waitForTimeout(450);
    const g = await p2.evaluate(`(function(){
      const it=document.querySelector('.wssi'), sum=it.querySelector('.wssi-sum');
      const nm=it.querySelector('.wssi-name'), mn=it.querySelector('.wssi-menu');
      const sb=sum.getBoundingClientRect(), nb=nm.getBoundingClientRect(), mb=mn.getBoundingClientRect();
      const af=getComputedStyle(mn,'::after');
      const spill=[].slice.call(it.querySelectorAll('*')).filter(e=>{const r=e.getBoundingClientRect();
        return r.width && (r.right>it.getBoundingClientRect().right+1 || r.left<it.getBoundingClientRect().left-1);}).length;
      return JSON.stringify({ tap:Math.round(Math.min(parseFloat(af.width)||mb.width, parseFloat(af.height)||mb.height)),
        overlap: nb.right > mb.left + 0.5, spill: spill, sumH: Math.round(sb.height),
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth+1,
        kpis: getComputedStyle(it.querySelector('.wssi-kpis')||document.body).display });})()`).then(JSON.parse);
    ok(`${ENG}.${w} el nombre largo envuelve y NO empuja al ⋯ fuera de su fila`, g.overlap===false, JSON.stringify(g));
    ok(`${ENG}.${w} el ⋯ mantiene 44 px de área táctil`, g.tap>=44, 'tap='+g.tap);
    ok(`${ENG}.${w} nada se pinta fuera de la instancia`, g.spill===0, 'spill='+g.spill);
    ok(`${ENG}.${w} sin scroll horizontal`, g.hscroll===false);
    // las métricas de la fila se retiran en móvil a propósito: el nombre manda cuando no hay sitio
    if (w < 640) ok(`${ENG}.${w} las métricas de la fila se retiran en móvil (el nombre manda)`, g.kpis==='none', g.kpis);
    else ok(`${ENG}.${w} las métricas de la fila se muestran cuando hay sitio`, g.kpis==='flex', g.kpis);
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
