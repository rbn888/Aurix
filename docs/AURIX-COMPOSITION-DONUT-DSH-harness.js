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

console.log('Markup (independent micro-donut beside the pill + modal):');
ok('1 micro-donut is OUTSIDE the pill (independent), in .aurix-signal-row, with aria-label + title',
   /aria-label="Ver composición de cartera" title="Ver composición de cartera"/.test(html) &&
   /<div class="aurix-signal-row">/.test(html) &&
   // donut comes AFTER the pill's closing </section> (not a descendant of #aurixSignal)
   html.indexOf('id="microCompositionDonut"') > html.indexOf('</section>', html.indexOf('id="aurixSignal"')) &&
   // and the pill itself no longer contains the donut
   html.slice(html.indexOf('id="aurixSignal"'), html.indexOf('</section>', html.indexOf('id="aurixSignal"'))).indexOf('microCompositionDonut') === -1);
ok('1b pill restored to original (icon + body + Ver análisis CTA, no donut/extra)',
   /id="aurixSignalCta"[\s\S]*?data-i18n="signalHealthCta">Ver análisis/.test(html));
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
ok('12b donut click is INDEPENDENT: stopPropagation + only opens modal (never switchTab/Intelligence)',
   /btn\.addEventListener\('click', \(e\) => \{ try \{ e\.stopPropagation\(\); e\.preventDefault\(\); \} catch \(_\) \{\} openCompositionModal\(\); \}\)/.test(app) &&
   !/switchTab|intelligence/i.test(fnSrc('openCompositionModal')) && !/switchTab|intelligence/i.test(fnSrc('closeCompositionModal')));
ok('13 renderMiniCompositionDonut hook runs only on the DESKTOP path of updateDonut (after mobile early-return)',
   fnSrc('updateDonut').indexOf('renderAurixMobileDonutLite') < fnSrc('updateDonut').indexOf('renderMiniCompositionDonut()') &&
   /return;\s*\}\s*\/\/ AURIX-INVESTABLE-WEALTH-1/.test(fnSrc('updateDonut')));
ok('14 mobile donut/slider NOT referenced by the new code', !/portfolioMobileSlider|mobileChartLiteHost|renderAurixMobileDonutLite/.test(fnSrc('renderMiniCompositionDonut')) && !/portfolioMobileSlider/.test(fnSrc('openCompositionModal')));

console.log('\nAnimation + interaction:');
ok('15 entrance: fade-in + ring draws 0→100% + segs reveal after',
   /@keyframes aurixMcdIn/.test(css) && /@keyframes aurixMcdDraw \{ to \{ stroke-dashoffset: 0; \} \}/.test(css) && /\.mcd-track \{[\s\S]*?stroke-dashoffset: 100;[\s\S]*?animation: aurixMcdDraw/.test(css) && /\.mcd-segs \{ opacity: 0; animation: aurixMcdSegs/.test(css));
ok('16 hover scale ≤1.05 + glow + 160ms; ~10s breathing (≤1.02); reduced-motion disables',
   /\.micro-composition-donut:hover \{[\s\S]*?transform: scale\(1\.05\)/.test(css) && /transition: transform \.16s/.test(css) &&
   /@keyframes aurixMcdBreath \{ 0%, 90%, 100% \{ transform: scale\(1\); \} 95% \{ transform: scale\(1\.02\); \} \}/.test(css) &&
   /\.mcd-ring \{[^}]*animation: aurixMcdBreath 10s/.test(css) &&
   /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.mcd-track \{ animation: none; stroke-dashoffset: 0; \}/.test(css));
ok('16b independent premium 54px donut, moved ~60px right of the pill',
   /\.micro-composition-donut \{[^}]*width: 54px; height: 54px/.test(css) && /\.aurix-signal-row \{ gap: 60px; \}/.test(css));

console.log('\nDSH.DONUT.03 — final UX:');
ok('21 mini: outer ring removed + crisp butt-cap slices (no round/blur)',
   /\.mcd-track \{ display: none; \}/.test(css) && /stroke-linecap="butt"/.test(fnSrc('_aurixDonutSegmentsSVG')));
ok('22 segments draw ONE BY ONE (progressive sweep) + mini animates ONCE per load',
   /@keyframes aurixSegDraw \{ to \{ stroke-dashoffset: 0; \} \}/.test(css) &&
   /animation: aurixSegDraw ' \+ durMs \+ 'ms linear ' \+ delayMs/.test(fnSrc('_aurixDonutSegmentsSVG')) &&
   /const animate = entries\.length > 0 && !_aurixMiniDonutDrawn;/.test(fnSrc('renderMiniCompositionDonut')) &&
   /if \(entries\.length\) _aurixMiniDonutDrawn = true;/.test(fnSrc('renderMiniCompositionDonut')));
ok('23 modal: compact panel (≈−22% → 560px) + fade+scale .96→1 / 150ms + centred title',
   /\.modal--composition \{ max-width: 560px; \}/.test(css) &&
   /\.modal--composition \{ max-width: 720px; transform: scale\(\.96\); transition: opacity \.15s ease, transform \.15s ease; \}/.test(css) &&
   /\.modal--composition \.modal-header \{ justify-content: center;/.test(css) &&
   /\.modal--composition \.modal-close \{ position: absolute; right: 12px;/.test(css));
ok('24 big donut protagonist NOT smaller (234px), rebuilds + draws from 0 each open (900ms)',
   /\.aurix-composition-chart \{ width: 234px; height: 234px; \}/.test(css) && /_aurixDonutSegmentsSVG\(entries, 74, 100, 100, 26, 0\.9, \{ animate: true, dur: 900 \}\)/.test(app));
ok('25 legend TWO narrow columns (name+% close, not at modal edge) + clear column gap + hover sync',
   /grid-template-columns: repeat\(2, minmax\(0, 184px\)\); gap: 8px 48px;/.test(css) &&
   /\.aurix-composition-legend \.acl-label \{ flex: 1 1 auto; min-width: 0; \}/.test(css) &&
   /function _aurixCompositionHover\(/.test(app) && /_aurixCompositionWireHover\(\);/.test(app) &&
   /\.aurix-composition-chart\.hot \.mcd-seg\.is-hot \{ opacity: 1; filter: brightness/.test(css));
ok('26 close fade+scale via .modal--composition (X / Cerrar / Escape / backdrop all → closeCompositionModal)',
   /id="compositionClose"/.test(html) && /id="compositionCloseBtn"/.test(html) &&
   /getElementById\('compositionClose'\); if \(x\) x\.addEventListener\('click', closeCompositionModal\)/.test(app));

console.log('\nDSH.DONUT.04 — final premium pass:');
ok('27 thicker SOLID mini ring (12px, smaller hole) + 50px svg',
   /\.mcd-segs circle \{ stroke-width: 12; \}/.test(css) && /\.mcd-ring \{ width: 50px; height: 50px; \}/.test(css) &&
   /_aurixDonutSegmentsSVG\(entries, 18, 25, 25, 12, 1\.0, \{ animate: animate, dur: 850 \}\)/.test(app));
ok('28 mini repositioned: down ~18px + right ~24px; subtle halo, no dark frame',
   /\.micro-composition-donut \{[\s\S]*?margin-top: 18px; margin-left: 24px;[\s\S]*?background: transparent;/.test(css));
ok('29 no holes / solid colours: ~1px gap (1.0 units), butt caps, plain hex stroke (no gradient)',
   /_aurixDonutSegmentsSVG\(entries, 18, 25, 25, 12, 1\.0/.test(app) && /stroke-linecap="butt"/.test(fnSrc('_aurixDonutSegmentsSVG')) &&
   /stroke="' \+ e\.color \+ '"/.test(fnSrc('_aurixDonutSegmentsSVG')) && !/linearGradient|url\(#/.test(fnSrc('_aurixDonutSegmentsSVG')));

console.log('\nDSH.DONUT.05 — split-ring bug fix:');
ok('32 CAUSE FIXED: slices positioned by INLINE css transform (transform-box fill-box), NOT the SVG attribute (which was nulled by transform:none) → ring closes 100%',
   /transform: rotate\(' \+ startDeg \+ 'deg\); transform-box: fill-box; transform-origin: center;/.test(fnSrc('_aurixDonutSegmentsSVG')) &&
   !/transform="rotate\(/.test(fnSrc('_aurixDonutSegmentsSVG')) &&
   /\.mcd-seg \{ transform-box: fill-box; transform-origin: center; \}/.test(css));
ok('33 final state complete (static slices dashoffset:0; animation ends at dashoffset:0 with both)',
   /draw = 'stroke-dashoffset:0;'/.test(fnSrc('_aurixDonutSegmentsSVG')) && /@keyframes aurixSegDraw \{ to \{ stroke-dashoffset: 0; \} \}/.test(css));
// behavioral: 6 slices, contiguous rotations covering the full ring (last start + its slot ≈ 360)
{ const sb = { Math }; vm.createContext(sb); vm.runInContext(fnSrc('_aurixDonutSegmentsSVG'), sb);
  const e = [{color:'#7C3AED',pct:47.7},{color:'#EA580C',pct:35.9},{color:'#2563EB',pct:13.1},{color:'#0891B2',pct:2.7},{color:'#16A34A',pct:0.4},{color:'#CA8A04',pct:0.2}];
  const svg = sb._aurixDonutSegmentsSVG(e, 18, 25, 25, 12, 1.0, { animate: false });
  const rots = (svg.match(/rotate\(([-0-9.]+)deg\)/g) || []).map(s => parseFloat(s.match(/([-0-9.]+)/)[1]));
  const cumAfterLast = rots[rots.length-1] + 90 + (e[e.length-1].pct/100*360);   // last start (rel to -90) + its slot
  ok('34 slices fully cover the ring (no empty half): start angles ascend, last reaches ~360°',
     (svg.match(/<circle /g)||[]).length===6 && rots[0]===-90 && rots.every((v,i)=>i===0||v>rots[i-1]) && Math.abs(cumAfterLast - 360) < 1.5, 'lastEnd=' + cumAfterLast.toFixed(1) + '°'); }
ok('30 per-segment tooltip: name · % · REAL monetary value (from getInvestableDistribution)',
   /valueBase: \(Number\(d\.valueBase\) \|\| 0\)/.test(fnSrc('_aurixCompositionEntries')) &&
   /e\.value = fmt\(e\.valueBase\)/.test(app) && /act-val">' \+ esc\(e\.value/.test(fnSrc('_aurixCompositionHover')) &&
   /id="compositionTip"/.test(html));
{ // behavioral: entries carry real valueBase + share
  const sb = { Math, Number, Array, String, JSON,
    TYPE_META: { crypto:{label:'Cripto',color:'#2563EB'}, real_estate:{label:'Inmuebles',color:'#7C3AED'} },
    getInvestableDistribution: () => ([ { type:'real_estate', valueBase:4770 }, { type:'crypto', valueBase:5230 } ]) };
  vm.createContext(sb); vm.runInContext(fnSrc('_aurixCompositionEntries'), sb);
  const e = vm.runInContext('_aurixCompositionEntries()', sb);
  ok('31 entries expose real valueBase + correct share', e[0].valueBase===5230 && Math.abs(e[0].pct - 52.3) < 0.01 && e.find(x=>x.type==='real_estate').valueBase===4770); }

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
