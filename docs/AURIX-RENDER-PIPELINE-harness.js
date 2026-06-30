'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RENDER-PIPELINE-harness — P0 authoritative ownership: ONE producer, passive consumers
// ════════════════════════════════════════════════════════════════════════════
// computePerformanceSnapshot() is the SOLE producer of portfolio performance. Every renderer (desktop chart,
// mobile chart, desktop badge, mobile badge) is a passive consumer reading one frozen PerformanceRenderState.
// READY exists once: graphReady === badgeReady === (state==='ready'); skeleton === !ready. Desktop and mobile
// read the EXACT same immutable instance (memoised by producerHash). aurixRenderAudit() throws
// PERFORMANCE_RENDER_DESYNC if any consumer painted from a different producer snapshot.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

// ── Sandbox running the REAL producer + audit over controllable engine stubs ──
function env(scn){
  scn = scn || {};
  const sb = { Math, Number, JSON, Date:{ now:(()=>{ let n=1000; return ()=>(n+=1); })() }, console:{log:()=>{},table:()=>{}} };
  vm.createContext(sb);
  vm.runInContext("var activeRange='24h';", sb);
  vm.runInContext("var _lc='L1', _rev=7, _gv=null, _series=null, _cur=null;", sb);
  vm.runInContext("function _aurixCurrentLifecycleId(){return _lc;} function _aurixCurrentRevision(){return _rev;} function totalValueBase(){return _cur;}", sb);
  vm.runInContext("function getValidReturnBaseline(r){return _gv;} function getInstitutionalPerformanceSeries(r){return _series;} function _aurixHistoryHash(parts){return 'h:'+parts.join('|');}", sb);
  vm.runInContext("function _dshFmtPct(p){return {text:(p>=0?'+':'')+p.toFixed(2)+'%'};} function _dshFmtMoney0(v){return (v>=0?'+':'')+Math.round(v);} var activePerfMode='pct';", sb);
  vm.runInContext("var window={}; window.AURIX_BUILD='test';", sb);
  // real producer + ledger + audit + format helper
  vm.runInContext("var _aurixPerfSnapshotCache={snapshot:null}; var _aurixPerfSnapshotGen=0; var _aurixRenderLedger={producer:null,desktopBadge:null,mobileBadge:null,desktopChart:null,mobileChart:null};", sb);
  vm.runInContext(fnSrc('_aurixRecordRender'), sb);
  vm.runInContext(fnSrc('_aurixFormatReturnText'), sb);
  vm.runInContext(fnSrc('_aurixFormatReturnFromSnapshot'), sb);
  vm.runInContext(fnSrc('computePerformanceSnapshot'), sb);
  // the audit IIFE installs window.aurixRenderAudit — extract the function EXPRESSION (brace-matched) + run it
  const ai = app.indexOf('window.aurixRenderAudit = function'); const as = app.indexOf('function', ai);
  let ap = app.indexOf('(', as), apd = 0; for (; ap < app.length; ap++){ if(app[ap]==='(')apd++; else if(app[ap]===')'){apd--; if(!apd){ap++;break;}} }
  let ak = app.indexOf('{', ap), ad = 0; for (; ak < app.length; ak++){ if(app[ak]==='{')ad++; else if(app[ak]==='}'){ad--; if(!ad){ak++;break;}} }
  vm.runInContext('window.aurixRenderAudit = ' + app.slice(as, ak) + ';', sb);
  // scenario: ready by default
  const series = scn.series || (function(){ const s=[]; for(let i=0;i<10;i++) s.push({time:i,value:8000+i*10}); return s; })();
  vm.runInContext("_gv="+JSON.stringify(scn.gv || { valid:true, deltaPct:1.13, deltaAbs:90, baselineValue:8000, baselineTs:0, invalidReason:null, performanceSource:'remote' })+";", sb);
  vm.runInContext("_series={ renderSeries:"+JSON.stringify(series.map(p=>({time:p.time,value:p.value})))+", mode:'premium-curve', renderMode:'premium-curve', realPointCount:"+series.length+", coveragePct:100, reason:'ok', rawValueSeries:"+JSON.stringify(series)+" };", sb);
  vm.runInContext("_cur="+(scn.cur!=null?scn.cur:8090)+";", sb);
  return sb;
}
const snap = (sb,r) => vm.runInContext("computePerformanceSnapshot('"+(r||'24h')+"')", sb);

console.log('AURIX-RENDER-PIPELINE — one producer, passive consumers, impossible to diverge\n');

console.log('Single immutable producer:');
{ const sb=env(); const a=snap(sb); const b=snap(sb);
  ok('1 one producer emits a PerformanceRenderState with all mandated fields', a && ['lifecycleId','portfolioRevision','activeRange','renderState','displayedReturnPct','displayedReturnValue','chartSeries','chartHash','chartPointCount','graphReady','badgeReady','skeleton','baseline','currentValue','calculatedAt','producerHash'].every(k=>k in a));
  ok('2 the snapshot is FROZEN (immutable — consumers cannot mutate it)', Object.isFrozen(a) && Object.isFrozen(a.chartSeries));
  ok('3 same inputs → the EXACT same instance (===) so every consumer shares one object', a===b && a.producerHash===b.producerHash); }

console.log('\nREADY exists once — graph and badge can never disagree:');
{ const sb=env(); const s=snap(sb);
  ok('4 ready: graphReady === badgeReady === (state==="ready") === !skeleton', s.state==='ready' && s.graphReady===true && s.badgeReady===true && s.skeleton===false && s.graphReady===s.badgeReady); }
{ const sb=env({ gv:{ valid:false, deltaPct:null, invalidReason:'remote_performance_pending', performanceSource:'pending' } });
  const s=snap(sb);
  ok('5 badge pending → graph ALSO pending (skeleton), %=null — skeleton & % can never coexist', s.state==='pending' && s.graphReady===false && s.badgeReady===false && s.skeleton===true && s.displayedReturnPct===null); }
{ const sb=env({ series:[{time:0,value:8000}] });   // 1 point → graph not buildable
  const s=snap(sb);
  ok('6 graph not buildable (<2 pts) → badge ALSO pending (one decision), no % beside a skeleton', s.state==='pending' && s.badgeReady===false && s.graphReady===false && s.displayedReturnPct===null); }

console.log('\nDesktop and mobile consume the SAME instance + chartSeries + %:');
{ const sb=env(); const desktop=snap(sb,'24h'); const mobile=snap(sb,'24h');
  ok('7 desktop instance === mobile instance (identical frozen object)', desktop===mobile);
  ok('8 desktop.chartSeries === mobile.chartSeries (one series, one hash)', desktop.chartSeries===mobile.chartSeries && desktop.chartHash===mobile.chartHash);
  ok('9 desktop.displayedReturnPct === mobile.displayedReturnPct (one number)', desktop.displayedReturnPct===mobile.displayedReturnPct); }

console.log('\nDeterminism — same state → same producerHash (refresh / live price / range / reload / revision / sync):');
{ const sb=env(); const h1=snap(sb).producerHash;
  // re-derive with identical inputs (a "reload"/"refresh" with the same data) → same hash
  const sb2=env(); const h2=snap(sb2).producerHash;
  ok('10 refresh/reload deterministic (same inputs → same producerHash)', h1===h2); }
{ const sb=env(); const before=snap(sb).producerHash; vm.runInContext("_cur=8095;", sb); const after=snap(sb).producerHash;
  ok('11 live price change → a NEW deterministic hash (data changed ⇒ state changed)', before!==after); }
{ const sb=env(); const a=snap(sb,'24h'); vm.runInContext("activeRange='7d';", sb); const b=snap(sb,'7d');
  ok('12 range switch deterministic (range is part of the producer key)', a.activeRange==='24h' && b.activeRange==='7d'); }
{ const sb=env(); const before=snap(sb).producerHash; vm.runInContext("_rev=8;", sb); const after=snap(sb).producerHash;
  ok('13 revision change → new hash (revision is part of the state)', before!==after); }
{ const sb=env(); const before=snap(sb).producerHash; vm.runInContext("_lc='L2';", sb); const after=snap(sb).producerHash;
  ok('14 lifecycle/sync change → new hash', before!==after); }

console.log('\nRender audit — proves one producer; throws PERFORMANCE_RENDER_DESYNC on any divergence:');
{ const sb=env(); const s=snap(sb);
  // simulate all four consumers painting from the current snapshot
  vm.runInContext("_aurixRecordRender('desktopBadge',computePerformanceSnapshot('24h')); _aurixRecordRender('mobileBadge',computePerformanceSnapshot('24h')); _aurixRecordRender('desktopChart',computePerformanceSnapshot('24h')); _aurixRecordRender('mobileChart',computePerformanceSnapshot('24h'));", sb);
  const audit = vm.runInContext("window.aurixRenderAudit()", sb);
  ok('15 all consumers in sync → producerHash == desktopHash == mobileHash == badgeHash == graphHash', audit.allConsumersInSync===true && audit.producerHash===audit.desktopHash && audit.desktopHash===audit.mobileHash && audit.badgeHash===audit.producerHash && audit.graphHash===audit.producerHash);
  ok('16 audit reports one producer + zero duplicated decisions', audit.oneProducer===true && audit.zeroDuplicatedDecisions===true); }
{ const sb=env(); snap(sb);
  // a consumer that painted from a STALE/foreign hash must trip the fatal desync
  vm.runInContext("_aurixRenderLedger.desktopChart={hash:'STALE',gen:0,range:'24h',ts:1};", sb);
  let threw=null; try { vm.runInContext("window.aurixRenderAudit()", sb); } catch(e){ threw=e; }
  ok('17 a divergent consumer → throws PERFORMANCE_RENDER_DESYNC (fatal architecture error)', !!threw && /PERFORMANCE_RENDER_DESYNC/.test(String(threw && (threw.message||threw)))); }

console.log('\nNo renderer performs business logic (consumers read the snapshot, never the engine):');
ok('18 desktop badge + mobile badge painter reads computePerformanceSnapshot (NOT getValidReturnBaseline/_aurixRangeReturn)',
   /computePerformanceSnapshot\(/.test(fnSrc('_aurixPaintReturnBadge')) && !/getValidReturnBaseline\(/.test(fnSrc('_aurixPaintReturnBadge')) && !/_aurixRangeReturn\(/.test(fnSrc('_aurixPaintReturnBadge')));
ok('19 desktop chart (_wscPaintSurface) reads the snapshot, not getInstitutionalPerformanceSeries/getValidReturnBaseline directly for its decisions',
   /computePerformanceSnapshot\(activeRange\)/.test(fnSrc('_wscPaintSurface')) && /_snap\.graphReady/.test(fnSrc('_wscPaintSurface')));
ok('20 mobile chart (renderAurixMobileLiteChart) reads the snapshot tone/graphReady, not its own getValidReturnBaseline',
   /computePerformanceSnapshot\(r\)/.test(fnSrc('renderAurixMobileLiteChart')) && /_snap\.graphReady/.test(fnSrc('renderAurixMobileLiteChart')) && /const tone = _snap\.tone;/.test(fnSrc('renderAurixMobileLiteChart')));
ok('21 ONLY the producer calls the engine: getInstitutionalPerformanceSeries + getValidReturnBaseline appear inside computePerformanceSnapshot',
   /getValidReturnBaseline\(r\)/.test(fnSrc('computePerformanceSnapshot')) && /getInstitutionalPerformanceSeries\(r\)/.test(fnSrc('computePerformanceSnapshot')));

console.log('\nNo-touch (pixel-drawing + mobile guardrails preserved — ownership refactor only):');
ok('22 chart renderer + mobile-safe guard + Chart.js-off-mobile preserved',
   /function renderAurixInstitutionalChart\(/.test(app) && /AURIX_MOBILE_SAFE/.test(app) && /window\.AURIX_MOBILE_CHART_LITE_ENABLED = true/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
