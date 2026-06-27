'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-TOOLTIP-PREMIUM-harness — RC4-A
// ════════════════════════════════════════════════════════════════════════════
// Tooltip is VISUAL + POSITIONING only. The shared placement (_aurixPlaceTooltip):
// centered over the point, ABOVE it (off the finger on mobile), flips below only when
// there is no room above, always clamped inside, NEVER covers the active point. Premium
// glass CSS + 80–120ms fade. Data source / values are unchanged.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
const sb = { Math }; vm.createContext(sb); vm.runInContext(fn('_aurixPlaceTooltip'), sb);
const place = sb._aurixPlaceTooltip;
let pass=0, fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }
function covers(pl, px, py, tw, th){ return px >= pl.tx && px <= pl.tx+tw && py >= pl.ty && py <= pl.ty+th; }

console.log('AURIX-TOOLTIP-PREMIUM — RC4-A\n');
const W=360, H=200, tw=120, th=60, m=18;
// 1. never covers the active point (sweep a grid of points)
{ let worst=true; for(let px=10;px<=W-10;px+=20)for(let py=10;py<=H-10;py+=20){ const pl=place(px,py,tw,th,W,H,m,true); if(covers(pl,px,py,tw,th)) worst=false; }
  ok('1 tooltip NEVER covers the active point (grid sweep)', worst); }
// 2. prefers ABOVE (off the finger) when there is room
{ const pl=place(180,150,tw,th,W,H,m,true); ok('2 prefers above the point (off the finger)', pl.below===false && pl.ty < 150, 'ty='+pl.ty.toFixed(0)); }
// 3. flips BELOW only when no room above
{ const pl=place(180,20,tw,th,W,H,m,true); ok('3 flips below near the top', pl.below===true && pl.ty > 20, 'ty='+pl.ty.toFixed(0)); }
// 4. centered over the point (when not clamped)
{ const pl=place(180,150,tw,th,W,H,m,false); ok('4 centered horizontally over the point', Math.abs((pl.tx+tw/2)-180) < 0.6, 'cx='+(pl.tx+tw/2).toFixed(1)); }
// 5. clamped inside near edges (left/right)
{ const l=place(5,150,tw,th,W,H,m,false), r=place(W-5,150,tw,th,W,H,m,false);
  ok('5 clamped inside near left/right edges', l.tx>=4 && r.tx+tw<=W-4, 'L='+l.tx.toFixed(0)+' R='+(r.tx+tw).toFixed(0)); }
// 6. min margin honoured (gap between point and tooltip ≥ ~margin)
{ const pl=place(180,150,tw,th,W,H,m,false); ok('6 vertical margin ≥ configured', (150-(pl.ty+th)) >= m-0.5, 'gap='+(150-(pl.ty+th)).toFixed(1)); }
// 7. finger clearance: below-placement on mobile gets extra clearance vs desktop
{ const mob=place(180,15,tw,th,W,H,m,true), desk=place(180,15,tw,th,W,H,m,false);
  ok('7 mobile below-flip clears the finger more than desktop', mob.ty > desk.ty, 'mob='+mob.ty.toFixed(0)+' desk='+desk.ty.toFixed(0)); }

console.log('\nLIVE FILE — both tooltips use the shared premium placement:');
ok('8 desktop _wscAttachTooltip uses _aurixPlaceTooltip', /_aurixPlaceTooltip\(px, py, tw, th, r\.width, r\.height, _AURIX_TOOLTIP_MARGIN_DESKTOP/.test(fn('_wscAttachTooltip')));
ok('9 mobile inspector uses _aurixPlaceTooltip', /_aurixPlaceTooltip\(ptx, pty, tw, th, rect\.width, rect\.height, _AURIX_TOOLTIP_MARGIN_MOBILE, true\)/.test(fn('_aurixMobInspectorUpdate')));
ok('10 margins are configurable constants', /_AURIX_TOOLTIP_MARGIN_DESKTOP = \d+/.test(app) && /_AURIX_TOOLTIP_MARGIN_MOBILE = \d+/.test(app));
// 11. tooltip values still REAL (desktop uses sv/val from samples; mobile uses p.v — unchanged data source)
ok('11 tooltip values come from real samples (data source untouched)',
   /class="wsc-tip-v">\$\{formatBase\(val\)\}/.test(app) && /mob-tip-v.>.\s*\+\s*valStr/.test(app.replace(/\n/g,' ')) || /<span class="mob-tip-v">' \+ valStr/.test(app));
ok('12 desktop tooltip data unchanged (sampleVal/interp val, snapToPoint preserved)', /val = sv\[k\]/.test(app) && /snapToPoint/.test(app));

console.log('\nCSS — premium card + smooth fade (80–120ms):');
ok('13 .wsc-tip premium glass (layered shadow + blur)', css.indexOf('box-shadow: 0 8px 28px rgba(0,0,0,.46)') >= 0 && css.indexOf('backdrop-filter: blur(11px) saturate(1.15)') >= 0);
ok('14 .wsc-tip fade within 80–120ms', css.indexOf('transition: opacity .1s var(--ease-out') >= 0);
ok('15 .mob-chart-tip premium glass (layered shadow + blur)', css.indexOf('box-shadow: 0 8px 26px rgba(0,0,0,.46)') >= 0 && (css.match(/blur\(11px\) saturate\(1\.15\)/g) || []).length >= 2);
ok('16 tooltips fade in/out via parent state (.wsc-hot / .mob-inspecting), not always-on', /\.wsc-plot\.wsc-hot .wsc-tip { opacity: 1; }/.test(css) && /#wealthCurveMobile\.mob-inspecting .mob-chart-tip { opacity: 1; }/.test(css));
// not a debug look: value is the dominant element
ok('17 value is the dominant element (no debug styling)', /\.wsc-tip-v\s+{[^}]*font-weight: 800/.test(css) && /\.mob-tip-v\s+{[^}]*800/.test(css));

console.log('\nNO REGRESSION — inspector/cursor/24H untouched by tooltip change:');
ok('18 inspector cursor still uses visualPoint (snap fidelity intact)', /_aurixVisualPointAtX\(_aurixMobChartVisual, fx\)/.test(app));
ok('19 gesture lock intact (fromInspector / cooldown)', /_aurixSliderShouldSwipe\(/.test(app) && /__aurixInspectorCooldownUntil/.test(app));
ok('20 24H bridge RULE 0 intact (normal_pause)', /out\.bridged = true; out\.reason = 'normal_pause'/.test(app));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
