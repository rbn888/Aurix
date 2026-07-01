'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RETURN-BADGE-BINDING-harness — P0 paint EVERY visible return badge, not just two ids
// ════════════════════════════════════════════════════════════════════════════
// v440 proved #chartChange/#chartChangeMobile repaint to the ready value, yet the user still saw
// "Calculando…" → the VISIBLE node was a DIFFERENT element the painter never targeted. FIX:
// _aurixFindReturnBadgeNodes() collects the two ids + every .chart-change element + the host of every
// .wsc-metric-calc span (our pending markup wherever rendered); _aurixRepaintReturnBadges paints them ALL,
// so no visible node is left in "Calculando…" when getValidReturnBaseline().valid === true.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} }

// ── minimal fake DOM ──
function node(id, className, innerHTML){
  const n = { nodeType:1, id, className, innerHTML, get textContent(){ return String(this.innerHTML).replace(/<[^>]*>/g,''); }, set textContent(v){ this.innerHTML = v; } };
  n.getBoundingClientRect = () => ({ x:0,y:0,width:80,height:18 });
  n.closest = (sel) => (String(n.className||'').split(' ').some(c => '.'+c === sel) ? n : null);
  return n;
}
const PEND = '<span class="wsc-metric-val wsc-metric-calc">Calculando…</span>';
function buildEnv(nodes){
  const sb = { Math, Number, console:{log:()=>{},warn:()=>{}}, activeRange:'24h', _aurixEmergencyChartOn:()=>false /* legacy badge-binding path; emergency path covered by AURIX-EMERGENCY-CHART-RECOVERY */ };
  const byId = {}; nodes.forEach(n => { if(n.id) byId[n.id]=n; });
  sb.document = {
    getElementById: id => byId[id] || null,
    querySelectorAll: sel => {
      let res;
      if (sel.indexOf('#chartChange') >= 0) res = nodes.filter(n => n.id==='chartChange' || n.id==='chartChangeMobile');
      else if (sel === '.chart-change') res = nodes.filter(n => /(^| )chart-change( |$)/.test(' '+n.className+' '));
      else if (sel === '.wsc-metric-calc') res = nodes.filter(n => /wsc-metric-calc/.test(n.innerHTML)).map(n => ({ nodeType:1, className:'wsc-metric-calc', closest:(s)=> n.closest(s) || n, parentElement:n }));
      else res = [];
      res.forEach = Array.prototype.forEach.bind(res); return res;
    },
  };
  sb.window = { getComputedStyle: () => ({ display:'block', visibility:'visible', opacity:'1' }) };
  sb.getValidReturnBaseline = () => ({ valid:true, deltaPct:0.3661, deltaAbs:50.2, returnState:'ready' });
  sb._dshFmtPct = (p) => ({ text: (p>=0?'+':'') + p.toFixed(2) + '%' });
  sb._dshFmtMoney0 = (v) => (v>=0?'+':'') + Math.round(v);
  sb._aurixReturnPendingHTML = () => PEND;
  sb._AURIX_RETURN_PENDING_TEXT = 'Calculando…';
  vm.createContext(sb);
  // P0-PERFORMANCE-PIPELINE-RECONSTRUCTION — the painter is now a PASSIVE consumer of the one authoritative
  // snapshot. Stub the producer (derived from the existing getValidReturnBaseline stub so the pending toggle
  // below still drives it) + the ledger recorder. Load the real snapshot→badge formatter.
  vm.runInContext("function computePerformanceSnapshot(r){ var g=getValidReturnBaseline(r); var ready=!!(g&&g.valid&&Number.isFinite(g.deltaPct)); return { badgeReady:ready, graphReady:ready, state:ready?'ready':'pending', displayedReturnPct:ready?g.deltaPct:null, displayedReturnValue:ready?g.deltaAbs:null, tone:ready?(g.deltaPct>0.005?'up':(g.deltaPct<-0.005?'down':'flat')):'flat', producerHash:'h' }; } function _aurixRecordRender(){}", sb);
  vm.runInContext(fnSrc('_aurixFormatReturnText'), sb);
  vm.runInContext(fnSrc('_aurixFormatReturnFromSnapshot'), sb);
  vm.runInContext(fnSrc('_aurixNodeIsVisible'), sb);
  vm.runInContext(fnSrc('_aurixPaintReturnBadge'), sb);
  vm.runInContext(fnSrc('_aurixFindReturnBadgeNodes'), sb);
  vm.runInContext(fnSrc('_aurixRepaintReturnBadges'), sb);
  sb._nodes = nodes;
  return sb;
}

console.log('AURIX-RETURN-BADGE-BINDING — repaint every visible return badge\n');

console.log('The stray visible badge (a THIRD .chart-change node) is found and repainted:');
{ const cc = node('chartChange','chart-change calculating', PEND);
  const ccm = node('chartChangeMobile','chart-change calculating', PEND);
  const hero = node('heroReturnBadge','chart-change calculating', PEND);   // the REAL visible one (different id)
  const sb = buildEnv([cc, ccm, hero]);
  const found = vm.runInContext('_aurixFindReturnBadgeNodes()', sb);
  ok('1 _aurixFindReturnBadgeNodes finds all THREE badges (incl. the stray #heroReturnBadge)', found.length === 3);
  vm.runInContext('_aurixRepaintReturnBadges("test")', sb);
  ok('2 #chartChange repainted to the value', /\+0\.37%/.test(cc.innerHTML) && !/Calculando/.test(cc.innerHTML));
  ok('3 #chartChangeMobile repainted to the value', /\+0\.37%/.test(ccm.innerHTML));
  ok('4 the STRAY visible badge repainted to the value (no longer Calculando)', /\+0\.37%/.test(hero.innerHTML) && !/Calculando/.test(hero.innerHTML));
  ok('5 NO node left showing Calculando when ready', ![cc,ccm,hero].some(n => /Calculando/.test(n.innerHTML))); }

console.log('\nDe-dup — a node matching both an id and .chart-change is painted once:');
{ const cc = node('chartChange','chart-change calculating', PEND);
  const sb = buildEnv([cc]);
  const found = vm.runInContext('_aurixFindReturnBadgeNodes()', sb);
  ok('6 #chartChange (also .chart-change, also has .wsc-metric-calc) appears exactly once', found.length === 1); }

console.log('\nPending stays Calculando when NOT ready (no false value):');
{ const cc = node('chartChange','chart-change calculating', PEND);
  const sb = buildEnv([cc]);
  vm.runInContext('getValidReturnBaseline = () => ({ valid:false, returnState:"pending_baseline" });', sb);
  vm.runInContext('_aurixRepaintReturnBadges("test")', sb);
  ok('7 not-ready → node shows Calculando (pending markup), never a value', /Calculando/.test(cc.innerHTML)); }

console.log('\nSource — finder coverage, binding log, dom-debug:');
ok('8 finder collects ids + .chart-change + .wsc-metric-calc hosts',
   /querySelectorAll\('#chartChange, #chartChangeMobile'\)/.test(fnSrc('_aurixFindReturnBadgeNodes')) &&
   /querySelectorAll\('\.chart-change'\)/.test(fnSrc('_aurixFindReturnBadgeNodes')) &&
   /querySelectorAll\('\.wsc-metric-calc'\)\.forEach\(span => add\(span\.closest\('\.chart-change'\) \|\| span\.parentElement\)\)/.test(fnSrc('_aurixFindReturnBadgeNodes')));
ok('9 _aurixRepaintReturnBadges paints ALL found nodes (not two ids)',
   /const nodes = _aurixFindReturnBadgeNodes\(\);\s*nodes\.forEach\(n => \{ try \{ _aurixPaintReturnBadge\(n,/.test(fnSrc('_aurixRepaintReturnBadges')));
ok('10 [UI][RETURN_BADGE_BINDING] log with totalFound/visiblePendingNodes/visibleReadyNodes/paintedNodes/skippedNodes',
   /\[UI\]\[RETURN_BADGE_BINDING\]/.test(app) && /totalFound:/.test(app) && /visiblePendingNodes:/.test(app) && /visibleReadyNodes:/.test(app) && /paintedNodes:/.test(app) && /skippedNodes:/.test(app));
ok('11 window.aurixReturnBadgeDomDebug exposes the required fields',
   /window\.aurixReturnBadgeDomDebug = function/.test(app) &&
   ['allCalculandoNodes','allReadyValueNodes','visibleCalculandoNodes','visibleReadyValueNodes','chartChangeNode','chartChangeMobileNode','activeRange','returnState','displayedReturnPct']
     .every(k => app.indexOf(k + ':') !== -1));

console.log('\nNo-touch (calc/baseline/sync/renderer untouched — DOM binding only):');
ok('12 calc/baseline/consumer untouched',
   /function getValidReturnBaseline\(range, opts\)/.test(app) && /function _aurixRangeReturn\(range\)/.test(app) && /function renderAurixInstitutionalChart\(/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
