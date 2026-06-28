'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CATEGORY-CARDS-CLEANUP-harness — remove mini charts from asset-category detail cards
// ════════════════════════════════════════════════════════════════════════════
// The per-category detail panel (Acciones/Cripto/Fondos·ETF/Inmuebles/Liquidez/…) is rendered by
// ONE shared component (_aurixCategoryPerfRender/_aurixCategoryPerfBuildPanel). With
// _AURIX_CATEGORY_PERF_CHART_ENABLED=false it renders a compact textual header (title + gain/loss)
// only — no internal chart, no now-useless range selector, no empty-state container (no dead
// space). The institutional dashboard chart is a SEPARATE component and is untouched.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
function fn(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0)throw new Error('missing '+name);
  let k=app.indexOf('{',i),d=0; for(;k<app.length;k++){const c=app[k]; if(c==='{')d++; else if(c==='}'){d--; if(!d){k++;break;}}} return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,i){ if(c){pass++;console.log('  ✓ '+n+(i?'  ['+i+']':''));}else{fail++;console.log('  ✗ '+n+(i?'  ['+i+']':''));} }

console.log('AURIX-CATEGORY-CARDS-CLEANUP\n');
const build = fn('_aurixCategoryPerfBuildPanel');
const apply = fn('_aurixCategoryPerfApplyRange');
const render = fn('_aurixCategoryPerfRender');
// chartless branch of the builder
const cl = build.slice(build.indexOf('if (!_AURIX_CATEGORY_PERF_CHART_ENABLED)'), build.indexOf('const pills ='));

console.log('Flag + single shared point:');
ok('1 chart disabled flag present (rollback: set true)', /const _AURIX_CATEGORY_PERF_CHART_ENABLED = false;/.test(app));
ok('2 ONE shared, type-agnostic component for every category', /function _aurixCategoryPerfRender\(type\)/.test(app) && /function _aurixCategoryPerfBuildPanel\(type\)/.test(app) && (app.match(/_aurixCategoryPerfRender\(/g)||[]).length>=1);

console.log('\nChartless panel (no chart / no selector / no empty container):');
ok('3 chartless builder branch exists + tags the panel .is-chartless', /className = 'category-perf-panel is-chartless'/.test(cl));
ok('4 keeps the performance TITLE + gain/loss change', /category-perf-title/.test(cl) && /category-perf-change/.test(cl));
ok('5 NO internal chart host in chartless markup', !/category-perf-chart/.test(cl));
ok('6 NO range selector in chartless markup (useless without a chart)', !/category-perf-range/.test(cl) && !/category-perf-ranges/.test(cl) && !/data-cat-perf-range/.test(cl));
ok('7 NO empty-state container left behind (no dead space)', !/category-perf-empty/.test(cl));

console.log('\nGain/loss stays correct + no chart mount when disabled:');
ok('8 applyRange (chartless) updates the textual header from the REAL series, skips chart/empty',
   /if \(!_AURIX_CATEGORY_PERF_CHART_ENABLED\) \{ _aurixCategoryPerfUpdateHeader\(panel, series\); return; \}/.test(apply));
ok('9 header math unchanged (abs + pct, up/down/flat tone, base currency)',
   /const abs   = last - first;/.test(fn('_aurixCategoryPerfUpdateHeader')) && /is-' \+ tone/.test(fn('_aurixCategoryPerfUpdateHeader')));
ok('10 chart mount stays guarded by the host presence (null host ⇒ no V2 chart created)',
   /const chartHost = panel\.querySelector\('\.category-perf-chart'\);/.test(render) && /if \(chartHost && window\.AurixCharts/.test(render));

console.log('\nCSS recompaction:');
ok('11 .is-chartless compact block present (tight padding, single-row header, no dead space)',
   /\.category-perf-panel\.is-chartless \{ margin: 0 0 12px; padding: 14px 18px; \}/.test(css) &&
   /\.category-perf-panel\.is-chartless \.category-perf-header \{[^}]*margin-bottom: 0;/.test(css));

console.log('\nRollback path intact (enabled template still complete):');
ok('12 enabled builder still emits chart + ranges + empty (rollback = flag true)',
   /<div class="category-perf-chart"><\/div>/.test(build) && /class="category-perf-ranges"/.test(build) && /class="category-perf-empty"/.test(build));

console.log('\nMain institutional chart NOT touched (frozen renderer intact):');
ok('13 institutional renderer + protected layers intact',
   /function renderAurixInstitutionalChart\(/.test(app) &&
   /_AURIX_PREMIUM_MOTION_ENABLED = true/.test(app) &&
   /_AURIX_VERTICAL_STEP_SOFTENING_ENABLED = true/.test(app) &&
   /_AURIX_24H_SPIKE_GUARD_V2_ENABLED = true/.test(app) &&
   /drawn = _aurixSpikeDiscipline\(drawn, xScale, yScale, r, prepared\.gaps/.test(app));
ok('14 dashboard chart hosts (#perfSnapshot / wealthCurveMobile / lite host) not referenced by the category cleanup',
   !/category-perf/.test(fn('renderWealthCurve')) && !/_AURIX_CATEGORY_PERF_CHART_ENABLED/.test(fn('renderAurixInstitutionalChart')));

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail===0?0:1);
