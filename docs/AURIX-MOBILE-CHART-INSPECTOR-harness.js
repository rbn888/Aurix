'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MOBILE-CHART-INSPECTOR-harness — RC2 mobile chart institutional interaction
// ════════════════════════════════════════════════════════════════════════════
// Executes the REAL inspector core (_aurixMobInspectorUpdate) against a fake DOM +
// fake rendered points, proving: X-only nearest-REAL-point selection (free vertical
// movement, no interpolation/fabrication), cursor sits ON the point, real-value tooltip,
// smart flip placement. Plus live-file checks for the touch coordination (long-press,
// swipe coexistence, no duplicate listeners), the mobile grid, range-change reset, and
// full isolation (mobile layer only; no Chart.js; never touches the carousel/engine).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) return ''; let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }

// ── extract the inspector block ──
const S = app.indexOf('let _aurixMobChartPts = null;');
const E = app.indexOf('window._aurixMobInspectorUpdate = _aurixMobInspectorUpdate; }');
if (S < 0 || E < 0) { console.log('  ✗ inspector block not found'); process.exit(1); }
const block = app.slice(S, E + 'window._aurixMobInspectorUpdate = _aurixMobInspectorUpdate; }'.length);

// ── fake DOM ──
function makeEnv() {
  const reg = {};
  function mk(id) {
    const n = {
      id: id || null, _html: '', kids: [], classes: new Set(), style: {}, offsetWidth: 110, offsetHeight: 52, _rect: { left: 0, top: 0, width: 300, height: 140 },
      get innerHTML() { return n._html; }, set innerHTML(v) { n._html = v; },
      appendChild(c) { n.kids.push(c); if (c.id) reg[c.id] = c; return c; },
      getBoundingClientRect() { return n._rect; },
      setAttribute() {},
      classList: { add(c) { n.classes.add(c); }, remove(c) { n.classes.delete(c); }, contains(c) { return n.classes.has(c); } },
    };
    return n;
  }
  const area = mk('wealthCurveMobile'); reg['wealthCurveMobile'] = area;
  const sandbox = {
    console, Math, Date,
    document: { getElementById: (id) => reg[id] || null, createElement: () => mk(null) },
    formatBase: (v) => '$' + Math.round(v),
    requestAnimationFrame: (fn) => fn(),
  };
  sandbox.window = sandbox; sandbox.window.AURIX_MOBILE_SAFE = true;
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return { sandbox, reg, area };
}
// pts: known viewBox x positions across 6..994
const PTS = [
  { t: 1000 * 86400e3, v: 10000, x: 6,   y: 200 },
  { t: 1001 * 86400e3, v: 10400, x: 250, y: 150 },
  { t: 1002 * 86400e3, v: 10250, x: 500, y: 170 },
  { t: 1003 * 86400e3, v: 11000, x: 750, y: 90  },
  { t: 1004 * 86400e3, v: 11800, x: 994, y: 40  },
];
function setPtsAndUpdate(env, clientX, range) {
  vm.runInContext('_aurixMobChartPts = ' + JSON.stringify(PTS) + '; _aurixMobChartMeta = ' + JSON.stringify({ range: range || '30d', deltaPct: 18, up: true }) + ';', env.sandbox);
  // RC3-INC3: update no-ops unless the inspector is active (long-press sets this before
  // the first rAF update in real use). Activate so the selection core runs.
  vm.runInContext('_aurixMobInspectorActive = true;', env.sandbox);
  env.sandbox._aurixMobInspectorUpdate(clientX);
}

console.log('AURIX-MOBILE-CHART-INSPECTOR — RC2 institutional interaction');
console.log('\nEXECUTION — selection / cursor / tooltip / placement (real renderer core):');

// 1. nearest REAL point by X (free vertical movement — update takes ONLY clientX)
{ const env = makeEnv(); setPtsAndUpdate(env, 150); // rect width 300 → fx≈500 → nearest x=500 (idx2)
  const cur = env.reg['mobChartCursor'];
  ck('1. nearest-by-X selects the middle real point', cur && cur.style.left === ((500 / 1000) * 100).toFixed(3) + '%', cur && cur.style.left);
  ck('1b. cursor sits ON the point Y (not the finger) → free vertical movement', cur && cur.style.top === ((170 / 260) * 100).toFixed(3) + '%'); }
{ const env = makeEnv(); setPtsAndUpdate(env, 0);   // far left → nearest x=6 (idx0)
  ck('2. finger far-left → first real point', env.reg['mobChartCursor'].style.left === ((6 / 1000) * 100).toFixed(3) + '%'); }
{ const env = makeEnv(); setPtsAndUpdate(env, 300); // far right → nearest x=994 (idx4)
  ck('3. finger far-right → last real point', env.reg['mobChartCursor'].style.left === ((994 / 1000) * 100).toFixed(3) + '%'); }

// 4. tooltip shows the REAL value of the selected point (no interpolation/fabrication)
{ const env = makeEnv(); setPtsAndUpdate(env, 150);
  const tipHtml = env.reg['mobChartTip']._html;
  ck('4. tooltip value = exact REAL point value ($10250)', tipHtml.indexOf('$10250') > -1 && /mob-tip-v/.test(tipHtml));
  ck('4b. tooltip % computed from REAL start value (no fabrication)', /mob-tip-chg/.test(tipHtml) && (tipHtml.indexOf('+2.50%') > -1)); /* (10250-10000)/10000 */ }

// 5. tooltip value is ALWAYS one of the real points (sweep) — never an interpolated value
{ const env = makeEnv(); let allReal = true;
  const realSet = new Set(PTS.map(p => '$' + Math.round(p.v)));
  for (let cx = 0; cx <= 300; cx += 15) { setPtsAndUpdate(env, cx); const m = env.reg['mobChartTip']._html.match(/mob-tip-v">(\$\d+)</); if (!m || !realSet.has(m[1])) { allReal = false; break; } }
  ck('5. every hover value is a REAL point value (selection-only)', allReal); }

// 6. smart placement flips: finger left → tip right; finger right → tip flips left
{ const envL = makeEnv(); setPtsAndUpdate(envL, 10);  const tipL = parseFloat(envL.reg['mobChartTip'].style.left);
  const envR = makeEnv(); setPtsAndUpdate(envR, 295); const tipR = parseFloat(envR.reg['mobChartTip'].style.left);
  const pxR = (994 / 1000) * 300; // last point px
  ck('6. tooltip flips to stay inside (left grip → right; right grip → left of point)', tipL > 0 && tipR < pxR, 'L=' + tipL + ' R=' + tipR + ' pxR=' + pxR.toFixed(0)); }

// 7. inspecting class applied on update (cursor/tip become visible via CSS)
{ const env = makeEnv(); setPtsAndUpdate(env, 150);
  ck('7. area gets .mob-inspecting (reveals cursor/hair/tip)', env.area.classList.contains('mob-inspecting')); }

// 8. hide clears the inspecting state
{ const env = makeEnv(); setPtsAndUpdate(env, 150); env.sandbox.window.__noop = env.sandbox; // ensure context
  vm.runInContext('_aurixMobInspectorHide();', env.sandbox);
  ck('8. hide() removes .mob-inspecting', !env.area.classList.contains('mob-inspecting')); }

// ── LIVE FILE — touch coordination, grid, isolation ──
console.log('\nLIVE FILE — touch coordination / grid / isolation:');
const initFn = fnSrc('_aurixInitMobileChartInspector');
ck('Fase 1 — long-press (~280ms) claims the gesture', /lpTimer = setTimeout\(function \(\)/.test(initFn) && /claimed = true;/.test(initFn) && /\}, 280\);/.test(initFn));
ck('Fase 1 — swipe/scroll wins before claim (drag threshold abandons long-press)', /if \(!claimed\) \{[\s\S]{0,160}> 10 \|\|[\s\S]{0,40}> 12\) clearLp\(\);[\s\S]{0,30}return;/.test(initFn));
ck('Fase 1 — once claimed, inspector blocks swipe (preventDefault + stopPropagation)', /e\.preventDefault\(\); e\.stopPropagation\(\);/.test(initFn));
ck('Fase 1 — release stops the slider snapping (stopPropagation on end when claimed) + restores swipe', /if \(claimed\) \{ try \{ e\.stopPropagation/.test(initFn) && /_aurixMobInspectorHide\(\);/.test(initFn));
ck('no duplicate listeners (bound exactly once)', /_aurixMobInspectorBound\) return;/.test(initFn) && /_aurixMobInspectorBound = true;/.test(initFn));
ck('Fase 9 — one update per frame via requestAnimationFrame', /requestAnimationFrame\(function \(\) \{ rafOn = false; _aurixMobInspectorUpdate/.test(initFn));
ck('Fase 9 — does NOT re-render the SVG on hover (only moves cursor/tooltip)', fnSrc('_aurixMobInspectorUpdate').indexOf('innerHTML = svg') < 0 && fnSrc('_aurixMobInspectorUpdate').indexOf('renderAurixInstitutionalChart') < 0);
ck('Fase 7 / RC4-B Fase 3 — mobile-specific grid drawn in the lite SVG (3h + 3v, classed)',
   /mob-chart-grid/.test(app) && (app.match(/<line class="[hv]" x1="/g) || []).length >= 6 && css.indexOf('.mob-chart-grid line') >= 0);
ck('Fase 8 — a fresh lite render closes the inspector (range change)', /_aurixMobInspectorHide\(\); \} catch \(_\) \{\}\s*\/\/ RC2 Fase 8/.test(app));
ck('Fase 6 — points cached from REAL render output (visiblePoints + visiblePixels), no fabrication',
   /_aurixMobChartPts = rc\.visiblePoints\.map/.test(app) && app.indexOf('rc.visiblePixels') >= 0);
ck('Fase 10 — inspector is mobile-only (gated AURIX_MOBILE_SAFE) + no Chart.js',
   initFn.indexOf('!window.AURIX_MOBILE_SAFE') >= 0 && block.indexOf('new Chart') < 0 && block.indexOf('initChart(') < 0);
ck('Fase 10 — inspector touches ONLY #wealthCurveMobile + dedicated nodes (never the carousel/track)',
   block.indexOf("getElementById('wealthCurveMobile')") >= 0 && block.indexOf('mobileSliderTrack') < 0 && block.indexOf('.mobile-slide') < 0);
ck('Fase 10 — engine untouched: inspector never calls the 6 engine fns',
   ['renderAurixInstitutionalChart(', 'computeAurixAdaptiveXScale(', 'computeAurixValueScale(', 'downsampleAurixAdaptive(', 'prepareAurixVisualSeries(', '_aurixMonotonePath('].every(s => block.indexOf(s) < 0));
ck('cursor/hair/tip hidden until inspecting + pointer-events:none (never intercept touch)',
   /#wealthCurveMobile\.mob-inspecting .mob-chart-cursor/.test(css) && /\.mob-chart-hair, \.mob-chart-cursor, \.mob-chart-tip \{[\s\S]{0,120}pointer-events: none/.test(css));
ck('reduced-motion guard for inspector transitions', /prefers-reduced-motion[\s\S]{0,160}\.mob-chart-cursor, \.mob-chart-tip \{ transition: none/.test(css));
// the heavy mobile chart paths stay gated; mobile lite chart still intact
ck('AURIX_MOBILE_SAFE still gates the heavy chart fns (≥6)', (app.match(/AURIX_MOBILE_SAFE\) return;/g) || []).length >= 6);
ck('mobile lite chart + donut still intact', app.indexOf('function renderAurixMobileLiteChart') >= 0 && app.indexOf('function renderAurixMobileDonutLite') >= 0);

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
