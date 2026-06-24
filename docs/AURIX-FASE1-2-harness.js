/* FASE 1/2 validation against shipped code: _aurixInvestableSnapshots excludes
   fxPartial/fxApprox snapshots (kills the false +12,651 vertical jump).
   Run: node docs/AURIX-FASE1-2-harness.js                                         */
'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fn(n){const s='function '+n+'(';const i=src.indexOf(s);if(i<0)throw new Error('missing '+n);
  let k=src.indexOf('{',i),d=0;for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){k++;break;}}}return src.slice(i,k);}

const H=3600e3,D=86400e3,NOW=1000*D;
let CH=[];
const sb={ console, Date:(()=>{const R=Date;return class extends R{static now(){return NOW;}};})(),
  toBase:v=>v, _aurixPortfolioEpoch:()=>0 };
Object.defineProperty(sb,'categoryHistory',{ get(){ return CH; } });   // live view of CH
sb.window=sb; vm.createContext(sb);
vm.runInContext(fn('_aurixInvestableSnapshots'), sb);
vm.runInContext(fn('_aurixSnapshotRejectReason'), sb);

let ok=true; const ck=(n,c,g)=>{console.log((c?'  ✓':'  ✗')+' '+n+(g!==undefined?'  ['+g+']':''));if(!c)ok=false;};

console.log('FASE 1 — fxPartial / fxApprox snapshots excluded from the canonical series');
CH=[
  {ts:NOW-23*H,   total:75200, real_estate:0},
  {ts:NOW-5*H,    total:75300, real_estate:0},
  {ts:NOW-4*H-23*60e3, total:62886, real_estate:0, fxPartial:true},  // 23 jun 21:57 PARTIAL
  {ts:NOW-37*60e3, total:75538, real_estate:0},                       // 24 jun 02:37 FULL
  {ts:NOW,        total:75651, real_estate:0},
];
{ const s=sb._aurixInvestableSnapshots('24h');
  ck('partial 62.886 point dropped', !s.some(p=>Math.round(p.value)===62886), JSON.stringify(s.map(p=>Math.round(p.value))));
  // largest adjacent jump must no longer be the +12.651 artefact
  let mj=0; for(let i=1;i<s.length;i++){const a=s[i-1].value; if(a>0) mj=Math.max(mj,Math.abs(s[i].value/a-1));}
  ck('no ≥18% adjacent jump after exclusion', mj<0.18, '+'+(mj*100).toFixed(1)+'%'); }

console.log('\nfxApprox also excluded by default');
CH=[{ts:NOW-10*H,total:70000,real_estate:0},{ts:NOW-5*H,total:71000,real_estate:0,fxApprox:true},{ts:NOW,total:72000,real_estate:0}];
{ const s=sb._aurixInvestableSnapshots('24h');
  ck('fxApprox point dropped (3→2)', s.length===2 && !s.some(p=>Math.round(p.value)===71000), JSON.stringify(s.map(p=>Math.round(p.value)))); }

console.log('\nDEFENSIVE — if excluding approx would leave <2 points, keep approx (never empty)');
CH=[{ts:NOW-10*H,total:70000,real_estate:0,fxApprox:true},{ts:NOW,total:72000,real_estate:0,fxApprox:true}];
{ const s=sb._aurixInvestableSnapshots('24h');
  ck('all-approx series kept (fallback, chart not starved)', s.length===2, s.length); }

console.log('\nfxPartial is ALWAYS dropped even under the fallback');
CH=[{ts:NOW-10*H,total:70000,real_estate:0,fxPartial:true},{ts:NOW,total:72000,real_estate:0,fxPartial:true}];
{ const s=sb._aurixInvestableSnapshots('24h');
  ck('all-partial series → empty (partial never kept)', s.length===0, s.length); }

console.log('\nClean snapshots pass through unchanged');
CH=[{ts:NOW-10*H,total:70000,real_estate:5000},{ts:NOW,total:72000,real_estate:5000}];
{ const s=sb._aurixInvestableSnapshots('24h');
  ck('investable = total − real_estate (65000, 67000)', s.length===2 && Math.round(s[0].value)===65000 && Math.round(s[1].value)===67000, JSON.stringify(s.map(p=>Math.round(p.value)))); }

console.log('\nFASE 2 — write guard (_aurixSnapshotRejectReason)');
const R = sb._aurixSnapshotRejectReason;
const N = NOW;
ck('impossible value (NaN) rejected',      R(NaN,69000,N,N-60e3,false,false,false) === 'impossible_value');
ck('impossible value (0) rejected',        R(0,69000,N,N-60e3,false,false,false) === 'impossible_value');
ck('fxPartial rejected',                   /^fxPartial/.test(R(70000,69000,N,N-60e3,true,false,false)));
ck('fxApprox rejected',                    /^fxApprox/.test(R(70000,69000,N,N-60e3,false,true,false)));
ck('anomalous rapid jump (50%/30s) rejected', /^anomalous_jump/.test(R(90000,60000,N,N-30e3,false,false,false)));
ck('MATERIAL jump allowed (real deposit)', R(90000,60000,N,N-30e3,false,false,true) === null);
ck('slow real move allowed (50% over 3h)', R(90000,60000,N,N-3*36e5,false,false,false) === null);
ck('clean small move allowed',             R(70500,70000,N,N-60e3,false,false,false) === null);
ck('first snapshot (no last) allowed',     R(70000,undefined,N,undefined,false,false,false) === null);

console.log('\nRESULT:', ok?'ALL PASS ✓ (shipped _aurixInvestableSnapshots + _aurixSnapshotRejectReason)':'FAIL ✗');
process.exit(ok?0:1);
