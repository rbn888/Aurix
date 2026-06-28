'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-PREMIUM-MOTION-RC5A-harness — RC5-A (premium motion layer)
// ════════════════════════════════════════════════════════════════════════════
// VISUAL-ONLY entrance/transition: the line draws left→right (pathLength=1 +
// stroke-dashoffset, NO getTotalLength/per-frame measure), the area reveals AFTER
// the line, the end-dot fades in (opacity only — marker lock position is JS, untouched).
// Painted only under the `.aurix-pm` host class, added on first VISIBLE render +
// manual range/unit change, never on auto refresh / hidden tab / reduced-motion.
// Flag OFF (or class absent) ⇒ exactly the prior RC4 behaviour.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-PREMIUM-MOTION-RC5A — RC5-A\n');

console.log('FASE 6 + 1 — flag / gating:');
ok('1 motion flag + helper + window override present',
   /const _AURIX_PREMIUM_MOTION_ENABLED = true;/.test(app) &&
   /function _aurixPremiumMotionOn\(\)/.test(app) &&
   /window\.AURIX_PREMIUM_MOTION === false/.test(fn('_aurixPremiumMotionOn')));
ok('1b rollback exact: ALL draw/reveal CSS keyed on .aurix-pm (absent ⇒ RC4 untouched)',
   /\.wsc-in\.aurix-pm \.wsc-line/.test(css) &&
   /\.aurix-lite-in\.aurix-pm \.aurix-lite-line/.test(css) &&
   // the legacy RC4 fade rule is still present and unchanged (motion-off path)
   /\.wsc-in \.wsc-line  \{ animation: wscDraw/.test(css) &&
   /@keyframes aurixLiteIn/.test(css));

const rwc = fn('renderWealthCurve');
ok('2 line reveal only on FIRST visible paint (one-shot, gated on motion ON ⇒ off=RC4)',
   /let _aurixWscFirstPaintDone = false;/.test(app) &&
   /_firstVisible = _pm && _visible && !_aurixWscFirstPaintDone/.test(rwc) &&
   /if \(_firstVisible\) _aurixWscFirstPaintDone = true;/.test(rwc));
ok('3 line reveal on MANUAL range/unit change (animate=true)',
   /_dshRenderPerfSnapshot\(true\)/.test(app) &&                       // range change + unit toggle
   /if \(\(animate \|\| _firstVisible\) && _visible\)/.test(rwc) &&
   /el\.classList\.add\('wsc-in'\); if \(_pm\) el\.classList\.add\('aurix-pm'\);/.test(rwc));
ok('4 NO reveal on auto refresh (data paths pass falsy/false)',
   /renderWealthCurve\(false\)/.test(app) &&                            // boot / toggle entry
   // updateDonut data-refresh path calls the snapshot with NO animate arg
   /_dshRenderPerfSnapshot\(\); \} catch \(_\) \{\}/.test(app));
ok('5 reduced-motion disables motion (JS guard + CSS media reset to solid)',
   /const _reduced = _dshReducedMotion\(\);/.test(rwc) &&
   /if \(el && !_reduced && !\(typeof document !== 'undefined' && document\.hidden\)\)/.test(rwc) &&
   /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.wsc-in\.aurix-pm \.wsc-line,[\s\S]*?animation: none; stroke-dasharray: none; stroke-dashoffset: 0;/.test(css));
ok('5b hidden-tab guard (desktop + mobile lite)',
   /!\(typeof document !== 'undefined' && document\.hidden\)/.test(rwc) &&
   /document\.hidden\) && !_dshReducedMotion\(\)\) \? ' aurix-pm'/.test(app));

console.log('\nFASE 1/2/3 — what is animated + timing:');
// extract the RC5-A CSS block
const blk = css.slice(css.indexOf('RC5-A — Premium Motion Layer'), css.indexOf('RC5-A — Premium Motion Layer')+1600);
ok('6 LINE draws left→right via pathLength=1 + dashoffset (no getTotalLength in render JS)',
   /pathLength="1"/.test(app) &&                                       // markup on both line paths
   /@keyframes aurixLineDraw \{ from \{ stroke-dashoffset: 1; \} to \{ stroke-dashoffset: 0; \} \}/.test(css) &&
   /stroke-dasharray: 1; stroke-dashoffset: 1;/.test(blk) &&
   !/getTotalLength/.test(rwc));
{ const m = blk.match(/animation: aurixLineDraw \.(\d+)s/); const ms = m ? +m[1]*10 : 0;
  ok('6b line duration in 300–450ms, no overshoot/bounce (cubic-bezier .4,0,.2,1, no spring)',
     ms>=300 && ms<=450 && /aurixLineDraw \.4\ds cubic-bezier\(\.4, 0, \.2, 1\)/.test(blk), 'lineDur='+ms+'ms'); }
ok('7 AREA reveals AFTER the line (delay 80–120ms, fade, does not precede)',
   /@keyframes aurixAreaReveal \{ from \{ opacity: 0; \} \}/.test(css) &&
   /\.wsc-in\.aurix-pm \.wsc-area     \{ animation: aurixAreaReveal \.2s var\(--ease-out, ease\) \.11s backwards;/.test(blk) &&
   /\.aurix-lite-in\.aurix-pm \.aurix-lite-area \{ animation: aurixAreaReveal \.2s var\(--ease-out, ease\) \.1s backwards;/.test(blk));
ok('8 end-DOT fades in (opacity only, no scale) AFTER line; marker lock position untouched',
   /@keyframes aurixDotIn     \{ from \{ opacity: 0; \} \}/.test(css) &&
   /\.wsc-in\.aurix-pm \.wsc-last-dot \{ animation: aurixDotIn \.22s var\(--ease-out, ease\) \.3s backwards;/.test(blk) &&
   !/scale/.test(blk));

console.log('\nFASE 5 — performance:');
ok('9 path length cached via pathLength=1 (no per-frame measure / no reflow loop / no new listeners)',
   (app.match(/pathLength="1"/g)||[]).length>=2 &&
   !/getTotalLength/.test(rwc) &&
   // CSS-driven motion: no setInterval/requestAnimationFrame added in renderWealthCurve
   !/requestAnimationFrame|setInterval/.test(rwc) &&
   // single timeout to strip the one-shot classes, listeners untouched
   /setTimeout\(\(\) => el\.classList\.remove\('wsc-in', 'aurix-pm'\), 620\)/.test(rwc));

console.log('\nNO REGRESSION (data / geometry / inspector / parity / spike):');
// minimal render to assert 24H still one subpath + visualSamples intact
const CONST_BLOCK = app.slice(app.indexOf('const _AURIX_PATH_RENDER_SPACING'), app.indexOf('function _aurixArrConfig'));
const ENG = ['_aurixRenderContractGeometry','_aurixVpTargetPointCount','_aurixComputeVisualPreparation','prepareAurixVisualSeries','downsampleAurixLTTB','_aurixSignificantLocalExtrema','downsampleAurixAdaptive','computeAurixTimeScale','computeAurixAdaptiveXScale','computeAurixValueScale','_aurixArrConfig','_aurixArrRepresentVertices','_aurixSpikeReduce','_aurixSpikeParams','_aurixSpikeDiscipline','_aurix24hSpikeGuard','_aurixVolatilityPolish','_aurixPolishSimplify','_aurixSampleSegments','_aurixDensifyPathSegments','_aurixVisualPointAtX','_aurixMonotonePath','buildAurixMonotonicPath','buildAurixAreaPath','_aurixSplitAtGaps','_wscFmtAxisVal','renderAurixInstitutionalChart'];
const AUX = ['_AURIX_RC_QUALITY_THRESHOLD','_AURIX_RC_WINDOW_MS','_AURIX_RC_DASHBOARD_TOL','_AURIX_RC_ASPECT','_AURIX_RC_PAD_FRAC','_AURIX_RC_VPAD_FRAC','_AURIX_IR_VALUE_MARGIN','_AURIX_IR_VPAD_FRAC','_AURIX_Y_JUMP_DOMINANCE','_AURIX_Y_LEGIBLE_ALPHA','_AURIX_X_FILL_BETA','_AURIX_VP_DENSITY','_AURIX_VP_GAP_FLOOR_MS','_AURIX_VP_GAP_MEDIAN_MULT','_AURIX_VP_CAPITAL_KINDS','_AURIX_VP_CLUSTER_WIDTH_PX','_AURIX_VP_CLUSTER_MIN_PTS','_AURIX_VP_VALUE_EPS'];
const HOUR=36e5,MIN=60e3,DAY=864e5,NOW=1000*DAY;
const sb={ console, getAurixRenderSeries:()=>SB, investableValueBase:()=>DB, _aurixLoadCapitalFlows:()=>[], window:undefined, Math, JSON, Array, Number, isFinite, Infinity, Date, activeRange:'24h' };
let SB=[],DB=null; vm.createContext(sb); vm.runInContext(CONST_BLOCK,sb);
AUX.forEach(c=>{const m=app.match(new RegExp('const '+c+'\\s*=[^;]*?;','s'));if(m)vm.runInContext(m[0],sb);});
ENG.forEach(n=>{try{vm.runInContext(fn(n),sb);}catch(e){}});
(function(){const v0=72000,p=[];let k=0;for(let t=NOW-24*HOUR;t<=NOW;t+=5*MIN,k++){const tt=(k%3===0?1:k%3===1?-1:0.5)*180;const c=(t>NOW-6*HOUR&&t<NOW-5*HOUR)?((t-(NOW-6*HOUR))/HOUR)*1300:(t>=NOW-5*HOUR?1300:0);p.push({time:t,value:Math.round(v0+tt+c)});}SB=p;DB=p[p.length-1].value;})();
const r24 = vm.runInContext(`renderAurixInstitutionalChart('24h',1000,260,{left:6,right:994,top:16,bottom:244})`,sb);
ok('10 24H still ONE subpath (no split — motion did not touch geometry)', r24.diagnostics.renderedSubpaths===1);
ok('11 visiblePoints / visualSamples intact (data + geometry untouched)', Array.isArray(r24.visiblePoints)&&r24.visiblePoints.length>0&&Array.isArray(r24.visualSamples)&&r24.visualSamples.length>0);
ok('12 inspector + tooltip snap intact (mobile + desktop visualPoint)',
   /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app) &&
   /_aurixVisualPointAtX\(model\.visualSamples, vbX\)/.test(fn('_wscAttachTooltip')));
ok('13 color parity + spike/volatility discipline intact',
   /tone === 'down' \? '#e25563'/.test(app) && /_aurixRangeReturn\(r\)/.test(app) &&
   /_AURIX_24H_SPIKE_GUARD_V2_ENABLED = true/.test(app) &&
   /drawn = _aurixSpikeDiscipline\(drawn, xScale, yScale, r, prepared\.gaps/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
