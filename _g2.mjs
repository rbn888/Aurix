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
await pg.goto(O+'/index.html',{waitUntil:'domcontentloaded'});
await pg.waitForFunction("typeof _wsOpenSurface==='function' && typeof _AURIX_ENT_CANON!=='undefined'",null,{timeout:60000});
await pg.waitForTimeout(900);
await pg.evaluate(`(function(){var bl=document.getElementById('bootLoader');if(bl)bl.remove();var ar=document.getElementById('appRoot');if(ar)ar.style.opacity='1';
 var f=Object.create(null);_AURIX_ENT_CANON.forEach(function(k){f[k]=(k!=='workspace.catalog_preview');});
 _aurixEnt={loaded:true,loading:false,error:null,plan:'premium',status:'none',source:'default',validUntil:null,features:f,sources:Object.create(null),fetchedAt:Date.now()};
 localStorage.removeItem('aurix_ws_goals_v1'); switchTab('workspace'); return true;})()`);
await pg.waitForTimeout(500);
await pg.evaluate(`(function(){ _wsOpenSurface('goals'); return true; })()`);
await pg.waitForTimeout(500);
let nav = 0; pg.on('framenavigated', f => { if (f === pg.mainFrame()) { nav++; console.log('  [NAVEGACIÓN #'+nav+'] ' + f.url().slice(-60)); } });
await pg.evaluate(`(function(){ window.__marker = 'alive'; return true; })()`);
const d=await pg.evaluate(`(function(){
 var r=document.querySelector('.wsh-wsg');
 r.querySelector('[data-wsg-form="name"]').value='Libertad financiera';
 var tgt=r.querySelector('[data-wsg-form="target"]'); tgt.value='250000'; tgt.dispatchEvent(new Event('input',{bubbles:true}));
 document.querySelector('[data-wsg-create]').click();
 return JSON.stringify({ immediate: document.querySelectorAll('.wsg-card').length, stored: _wsgGoals().length });})()`).then(JSON.parse);
console.log('inmediato:', JSON.stringify(d));
for (const ms of [200, 400, 800, 1500]) {
  await pg.waitForTimeout(ms);
  const snap = await pg.evaluate(`(function(){ return JSON.stringify({
    marker: window.__marker || null,
    cards: document.querySelectorAll('.wsg-card').length,
    view: (document.querySelector('.aurix-wsh')||{getAttribute:function(){return null;}}).getAttribute('data-wsh-view'),
    raw: JSON.parse(localStorage.getItem('aurix_ws_goals_v1')||'[]').length });})()`).then(JSON.parse);
  console.log('+acum' + ms + 'ms:', JSON.stringify(snap));
}
console.log('navegaciones tras el clic:', nav);
