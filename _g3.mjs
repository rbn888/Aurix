import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
const { chromium } = await import('/tmp/aurix-pw/node_modules/playwright/index.mjs');
const ROOT='/Users/ruben/claude-test/portfolio';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=normalize(join(ROOT,p));const b=await readFile(f);res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(0,r));const O='http://127.0.0.1:'+server.address().port;
const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const pg=await c.newPage(); pg.on('pageerror',e=>console.log('  [pageerror]',e.message));
const boot = async () => {
  await pg.waitForFunction("typeof _wsOpenSurface==='function' && typeof _AURIX_ENT_CANON!=='undefined'",null,{timeout:60000});
  await pg.waitForTimeout(900);
  // El sandbox no tiene sesión OTP, así que el guard de auth programa un rebote a login.
  // Se CANCELA por su propio owner: es una acomodación de la sonda, no un cambio de producto.
  await pg.evaluate(`(function(){
    try { _aurixCancelLoginRedirect('probe'); } catch(_) {}
    try { _aurixMarkSessionConfirmed(); } catch(_) {}
    var bl=document.getElementById('bootLoader');if(bl)bl.remove();
    var ar=document.getElementById('appRoot');if(ar)ar.style.opacity='1';
    var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
    _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
    return true;})()`);
  setInterval(()=>{}, 1000);
};
await pg.goto(O+'/index.html',{waitUntil:'domcontentloaded'});
await boot();
const keep = setInterval(async()=>{ try { await pg.evaluate(`(function(){try{_aurixCancelLoginRedirect('probe');}catch(_){ } return 1;})()`); } catch(_){} }, 300);
await pg.evaluate(`(function(){ localStorage.removeItem('aurix_ws_goals_v1'); switchTab('workspace'); _wsOpenSurface('goals'); return true; })()`);
await pg.waitForTimeout(500);
await pg.evaluate(`(function(){
 var r=document.querySelector('.wsh-wsg');
 r.querySelector('[data-wsg-form="name"]').value='Libertad financiera';
 var tgt=r.querySelector('[data-wsg-form="target"]'); tgt.value='250000'; tgt.dispatchEvent(new Event('input',{bubbles:true}));
 document.querySelector('[data-wsg-create]').click(); return true;})()`);
await pg.waitForTimeout(1200);
const st=await pg.evaluate(`(function(){
 var cards=[].slice.call(document.querySelectorAll('.wsg-card'));
 var c0=cards[0];
 return JSON.stringify({
  raw: JSON.parse(localStorage.getItem('aurix_ws_goals_v1')||'[]').length,
  cards: cards.length,
  collapsed: c0 ? !!c0.querySelector('details') : null,
  actions: c0 ? [].slice.call(c0.querySelectorAll('[data-wsg-act]')).map(x=>x.getAttribute('data-wsg-act')) : [],
  hasDots: c0 ? !!c0.querySelector('[data-wsgmenu],[data-wsmenu]') : null,
  savebar: c0 ? !!c0.querySelector('[data-wsg-savebar]') : null,
  postSavePrompt: /Añadir al Dashboard|wsmse_dash/.test(document.body.innerHTML),
  url: location.pathname });})()`).then(JSON.parse);
console.log('TRAS CREAR  :', JSON.stringify(st));
await pg.evaluate(`(function(){ switchTab('dashboard'); try{updateDashboardPlans();}catch(_){ } return true; })()`);
await pg.waitForTimeout(400);
const dash=await pg.evaluate(`(function(){ var s=document.getElementById('wsPlansSection');
 return JSON.stringify({ plans: s?s.querySelectorAll('.wspl-card').length:0,
  goalVisible: /Libertad financiera/.test(s?s.innerHTML:''), display: s?getComputedStyle(s).display:'?' });})()`).then(JSON.parse);
console.log('EN DASHBOARD:', JSON.stringify(dash));
clearInterval(keep);
await c.close(); await b.close(); server.close();
