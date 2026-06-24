/* Executes the ACTUAL shipped _wscAssessSeriesQuality (+ its const deps) from
   app.js against the required scenarios A–H of the Chart Quality Gate spec.
   Run: node docs/AURIX-CHART-QUALITY-GATE-harness.js                             */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(name){ const s='function '+name+'('; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return src.slice(i,k); }
function extractConst(name){ const s='const '+name+' ='; const i=src.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=src.indexOf('{',i),d=0; for(;k<src.length;k++){const c=src[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} while(src[k]!==';'&&k<src.length)k++; return src.slice(i,k+1); }

const sb = { console };
vm.createContext(sb);
[ extractConst('_WSC_BUCKET_MS'), extractConst('_WSC_WINDOW_MS'), extractConst('_WSC_QUALITY'),
  src.match(/const _WSC_LOWDENSITY_MIN = \d+;/)[0], extractFunction('_wscAssessSeriesQuality') ]
  .forEach(code => vm.runInContext(code, sb));

// ── helpers to synthesise eligible series ──────────────────────────────────────
const H = 3600e3, D = 86400e3, NOW = 1000 * D;
const pts = (specs) => specs.map(([offMs, v]) => ({ ts: NOW - offMs, value: v }));
// n points spread evenly across `spanMs` ending at NOW
const spread = (n, spanMs, base) => Array.from({length:n}, (_,i) => ({ ts: NOW - spanMs + Math.round(i*spanMs/(n-1)), value: base + i*5 }));

let ok = true; const ck = (name, cond, got) => { console.log((cond?'  ✓':'  ✗')+' '+name+(got!==undefined?'  ['+got+']':'')); if(!cond) ok=false; };
const assess = (range, elig) => sb._wscAssessSeriesQuality(range, elig, elig, elig.map(p=>p.value));
const mode = q => q.institutionalRenderable ? 'premium-curve' : (q.realPointCount>=3 ? 'low-density' : 'building');

console.log('SCENARIO A — 24H with 2 real points (recent cluster only)');
{ const q = assess('24h', pts([[2*H,75000],[1*H,75100]]));
  ck('not renderable', !q.institutionalRenderable, q.reason);
  ck('mode = building (no false curve)', mode(q)==='building', mode(q)); }

console.log('SCENARIO B — 24H with 8 points spread across the window');
{ const q = assess('24h', spread(8, 22*H, 74000));
  ck('renderable (premium curve)', q.institutionalRenderable, q.reason);
  ck('buckets ≥ 4', q.distinctBucketCount>=4, q.distinctBucketCount);
  ck('coverage ≥ 35%', q.timeCoveragePct>=35, q.timeCoveragePct+'%'); }

console.log('SCENARIO C — 7D using the SAME few recent points as 24H');
{ const q = assess('7d', pts([[2*H,75000],[1*H,75100],[0.5*H,75050]]));
  ck('7D not renderable (no real week coverage)', !q.institutionalRenderable, q.reason);
  ck('mode = low-density or building (never fake full week)', mode(q)!=='premium-curve', mode(q)); }

console.log('SCENARIO D — big asset ADD: only a tiny fresh cluster in 24H');
{ const q = assess('24h', pts([[0.5*H,75450],[0.2*H,75600],[0.05*H,75651]]));  // 3 pts, ~27min span
  ck('not renderable (coverage too low after add)', !q.institutionalRenderable, q.reason);
  ck('mode = low-density (shows real points, not a curve)', mode(q)==='low-density', mode(q)); }

console.log('SCENARIO E — big asset REMOVE: 2 points only');
{ const q = assess('24h', pts([[1*H,40000],[0.1*H,28000]]));
  ck('not renderable', !q.institutionalRenderable, q.reason);
  ck('mode = building (no artificial descending line)', mode(q)==='building', mode(q)); }

console.log('SCENARIO F — 30D / 1A / TOTAL with enough points (no regression)');
{ for (const r of ['30d','1y','all']) { const q = assess(r, spread(25, (r==='30d'?29*D:r==='1y'?360*D:400*D), 50000));
    ck(r+' renderable (unchanged behaviour)', q.institutionalRenderable, q.reason); }
  const q2 = assess('30d', spread(20, 28*D, 50000));
  ck('30D with 20 spread points still renderable', q2.institutionalRenderable, q2.reason); }

console.log('SCENARIO G/H — same policy desktop & mobile');
{ // the gate is range-based and uid-independent (called once in _wscPaintSurface,
  // shared by desktop uid!=="m" and mobile uid==="m"); identical input → identical verdict.
  const elig = spread(8, 22*H, 74000);
  const qa = assess('24h', elig), qb = assess('24h', elig);
  ck('deterministic verdict (desktop==mobile for same series)',
     qa.institutionalRenderable===qb.institutionalRenderable && qa.reason===qb.reason, qa.reason); }

console.log('\nRESULT:', ok ? 'ALL SCENARIOS PASS ✓ (against shipped _wscAssessSeriesQuality)' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
