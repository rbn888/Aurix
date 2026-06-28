'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-COMPOSITION-DONUT-DSH-harness — DSH.DONUT.01 (desktop micro-donut + composition modal)
// ════════════════════════════════════════════════════════════════════════════
// Desktop-only micro-donut next to the analysis pill → opens a modal with the REAL composition
// (percentages from getInvestableDistribution; no invented data). Mobile untouched.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-COMPOSITION-DONUT-DSH — DSH.DONUT.01\n');

console.log('Markup (micro-donut in the pill + modal):');
ok('1 micro-donut button inside #aurixSignal with aria-label + title',
   /<button type="button" class="micro-composition-donut" id="microCompositionDonut"\s*\n?\s*aria-label="Ver composición de cartera" title="Ver composición de cartera">/.test(html) &&
   html.indexOf('id="microCompositionDonut"') > html.indexOf('id="aurixSignal"') &&
   html.indexOf('id="microCompositionDonut"') < html.indexOf('</section>', html.indexOf('id="aurixSignal"')));
ok('2 micro-donut SVG ring + track + segs group', /<svg class="mcd-ring"[\s\S]*?<circle class="mcd-track"[\s\S]*?<g class="mcd-segs">/.test(html));
ok('3 composition modal overlay with title / close / close-btn / chart / legend',
   /id="compositionOverlay"/.test(html) && /id="compositionTitle"[^>]*>Composición de cartera/.test(html) &&
   /id="compositionClose"/.test(html) && /id="compositionCloseBtn"/.test(html) &&
   /id="compositionChart"/.test(html) && /id="compositionLegend"/.test(html));

console.log('\nFunctions exist (per spec):');
['renderMiniCompositionDonut','openCompositionModal','closeCompositionModal','renderCompositionModalDonut','_aurixCompositionEntries','_aurixDonutSegmentsSVG']
  .forEach(n => ok('4 '+n+'() defined', new RegExp('function '+n+'\\(').test(app)));

console.log('\nReal data reuse (no new source, no invented %):');
ok('5 reuses getInvestableDistribution (incl. real estate), share over total, 0 excluded, sorted',
   /getInvestableDistribution\(\{ includeNonInvestable: true \}\)/.test(fnSrc('_aurixCompositionEntries')) &&
   /Number\(d\.valueBase\) \|\| 0\) \/ total \* 100/.test(fnSrc('_aurixCompositionEntries')) &&
   /\.filter\(e => e\.pct > 0\.05\)\.sort\(\(a, b\) => b\.pct - a\.pct\)/.test(fnSrc('_aurixCompositionEntries')));
ok('6 legend shows percentages with 1 decimal', /e\.pct\.toFixed\(1\) \+ '%/.test(app));

// behavioral: entries from a stubbed real distribution
{ const sb = { Math, Number, Array, String, JSON,
    TYPE_META: { crypto:{label:'Cripto',color:'#2563EB'}, stock:{label:'Acciones',color:'#EA580C'}, etf:{label:'Fondos/ETF',color:'#0891B2'}, real_estate:{label:'Inmuebles',color:'#7C3AED'}, other:{label:'Otros',color:'#6b7280'} },
    getInvestableDistribution: () => ([
      { type:'crypto', valueBase:5560, pct:55.6 }, { type:'stock', valueBase:1840 },
      { type:'etf', valueBase:1200 }, { type:'real_estate', valueBase:600, nonInvestable:true },
      { type:'other', valueBase:0 } ]) };
  vm.createContext(sb);
  vm.runInContext(fnSrc('_aurixCompositionEntries'), sb);
  vm.runInContext(fnSrc('_aurixDonutSegmentsSVG'), sb);
  const e = vm.runInContext('_aurixCompositionEntries()', sb);
  const total = 5560+1840+1200+600;
  ok('7 entries computed from REAL values, 0-value excluded, includes real estate', e.length===4 && !e.some(x=>x.type==='other'));
  ok('8 percentages real (share of total) + sorted desc + sum≈100',
     Math.abs(e[0].pct - 5560/total*100) < 0.01 && e[0].type==='crypto' &&
     Math.abs(e.reduce((s,x)=>s+x.pct,0) - 100) < 0.01 && e.every((x,i)=> i===0 || e[i-1].pct >= x.pct));
  ok('9 labels + Aurix colors from TYPE_META', e.find(x=>x.type==='crypto').label==='Cripto' && e.find(x=>x.type==='crypto').color==='#2563EB');
  // segments
  const segs = vm.runInContext('_aurixDonutSegmentsSVG(_aurixCompositionEntries(), 72, 100, 100, 26)', sb);
  const cryptoLen = (5560/total*100).toFixed(2), cryptoGap = (100 - 5560/total*100).toFixed(2);
  ok('10 segments: one <circle> per entry, pathLength=100, dasharray = real % share',
     (segs.match(/<circle /g)||[]).length===4 && /pathLength="100"/.test(segs) && segs.indexOf('stroke-dasharray="'+cryptoLen+' '+cryptoGap+'"') !== -1); }

console.log('\nDesktop-only gating + mobile untouched:');
ok('11 micro-donut CSS hidden by default + shown only ≥769px',
   /\.micro-composition-donut \{ display: none; \}/.test(css) && /@media \(min-width: 769px\) \{[\s\S]*?\.micro-composition-donut \{/.test(css));
ok('12 openCompositionModal guards desktop (innerWidth<=768 returns)', /window\.innerWidth <= 768\) return;/.test(fnSrc('openCompositionModal')));
ok('13 renderMiniCompositionDonut hook runs only on the DESKTOP path of updateDonut (after mobile early-return)',
   fnSrc('updateDonut').indexOf('renderAurixMobileDonutLite') < fnSrc('updateDonut').indexOf('renderMiniCompositionDonut()') &&
   /return;\s*\}\s*\/\/ AURIX-INVESTABLE-WEALTH-1/.test(fnSrc('updateDonut')));
ok('14 mobile donut/slider NOT referenced by the new code', !/portfolioMobileSlider|mobileChartLiteHost|renderAurixMobileDonutLite/.test(fnSrc('renderMiniCompositionDonut')) && !/portfolioMobileSlider/.test(fnSrc('openCompositionModal')));

console.log('\nAnimation + interaction:');
ok('15 entrance: fade-in + ring draws 0→100% + segs reveal after',
   /@keyframes aurixMcdIn/.test(css) && /@keyframes aurixMcdDraw \{ to \{ stroke-dashoffset: 0; \} \}/.test(css) && /\.mcd-track \{[\s\S]*?stroke-dashoffset: 100;[\s\S]*?animation: aurixMcdDraw/.test(css) && /\.mcd-segs \{ opacity: 0; animation: aurixMcdSegs/.test(css));
ok('16 hover scale ≤1.04 + glow + 160ms; subtle pulse; reduced-motion disables',
   /\.micro-composition-donut:hover \{[\s\S]*?transform: scale\(1\.04\)/.test(css) && /transition: transform \.16s/.test(css) && /@keyframes aurixMcdPulse/.test(css) &&
   /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.mcd-track \{ animation: none; stroke-dashoffset: 0; \}/.test(css));

console.log('\nModal close (3 ways) + scroll lock + focus return:');
ok('17 close via button(s) + backdrop click + Escape',
   /getElementById\('compositionClose'\); if \(x\) x\.addEventListener\('click', closeCompositionModal\)/.test(app) &&
   /getElementById\('compositionCloseBtn'\); if \(c\) c\.addEventListener\('click', closeCompositionModal\)/.test(app) &&
   /if \(e\.target === overlay\) closeCompositionModal\(\)/.test(app) &&
   /if \(e\.key === 'Escape'\) \{ const ov = document\.getElementById\('compositionOverlay'\); if \(ov && ov\.classList\.contains\('open'\)\) closeCompositionModal/.test(app));
ok('18 scroll lock via body.modal-open (add on open, remove on close) + focus return to micro-donut',
   /classList\.add\('modal-open'\)/.test(fnSrc('openCompositionModal')) && /classList\.remove\('modal-open'\)/.test(fnSrc('closeCompositionModal')) && /_aurixCompositionOpener\.focus\(\)/.test(fnSrc('closeCompositionModal')));
ok('19 body.modal-open scroll-lock rule exists (reused)', /body\.modal-open \{/.test(css));

console.log('\nNo collateral damage:');
ok('20 institutional renderer + mini-chart removal + persistence layers intact',
   /function renderAurixInstitutionalChart\(/.test(app) && /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app) &&
   /const _AURIX_BLOCK_DESTRUCTIVE_SAVES = true;/.test(app) && /const _AURIX_JOURNAL_KEY = 'aurix_portfolio_events';/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
