'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-INSPECTOR-LIFECYCLE-harness — RC3-INC3 mobile inspector lifecycle fix
// ════════════════════════════════════════════════════════════════════════════
// Reproduces the persistent-tooltip bug and proves the fix: the inspector appears on
// long-press, moves with the finger, and DISAPPEARS on release (pointerup/touchend/
// touchcancel) — including the rAF RACE (a frame scheduled during touchmove that fires
// AFTER release must NOT re-show). Swipe/carousel restored on release. Executes the REAL
// inspector core against a fake DOM + live-file checks for the event wiring.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ck(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) return ''; let k = app.indexOf('{', i), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(i, k); }

// ── extract the inspector block (state + nodes + hide + update + init) ──
const S = app.indexOf('let _aurixMobChartPts = null;');
const Etoken = 'window._aurixMobInspectorUpdate = _aurixMobInspectorUpdate; }';
const E = app.indexOf(Etoken);
if (S < 0 || E < 0) { console.log('  ✗ inspector block not found'); process.exit(1); }
const block = app.slice(S, E + Etoken.length);

function makeEnv() {
  const reg = {};
  function mk(id) {
    const n = { id: id || null, _html: '', kids: [], classes: new Set(), style: {}, offsetWidth: 110, offsetHeight: 52, _rect: { left: 0, top: 0, width: 300, height: 140 },
      get innerHTML() { return n._html; }, set innerHTML(v) { n._html = v; },
      appendChild(c) { n.kids.push(c); if (c.id) reg[c.id] = c; return c; },
      getBoundingClientRect() { return n._rect; }, setAttribute() {},
      classList: { add(c) { n.classes.add(c); }, remove(c) { n.classes.delete(c); }, contains(c) { return n.classes.has(c); } } };
    return n;
  }
  const area = mk('wealthCurveMobile'); reg['wealthCurveMobile'] = area;
  const sandbox = { console, Math, Date, document: { getElementById: (id) => reg[id] || null, createElement: () => mk(null) },
    formatBase: (v) => '$' + Math.round(v), requestAnimationFrame: (fn) => fn() };
  sandbox.window = sandbox; sandbox.window.AURIX_MOBILE_SAFE = true;
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return { sandbox, reg, area };
}
const PTS = [ { t: 1000 * 86400e3, v: 10000, x: 6, y: 200 }, { t: 1001 * 86400e3, v: 10400, x: 250, y: 150 },
  { t: 1002 * 86400e3, v: 10250, x: 500, y: 170 }, { t: 1003 * 86400e3, v: 11000, x: 750, y: 90 }, { t: 1004 * 86400e3, v: 11800, x: 994, y: 40 } ];
function seed(env) { vm.runInContext('_aurixMobChartPts = ' + JSON.stringify(PTS) + '; _aurixMobChartMeta = ' + JSON.stringify({ range: '24h', deltaPct: 18, up: true }) + ';', env.sandbox); }
function activate(env) { vm.runInContext('_aurixMobInspectorActive = true;', env.sandbox); }
function update(env, cx) { env.sandbox._aurixMobInspectorUpdate(cx); }
function hide(env) { vm.runInContext('_aurixMobInspectorHide();', env.sandbox); }
function active(env) { return vm.runInContext('_aurixMobInspectorActive', env.sandbox); }

console.log('AURIX-INSPECTOR-LIFECYCLE — RC3-INC3 (appear → move → vanish on release)\n');
console.log('EXECUTION — real inspector core against a fake DOM:');

// 1. appears on (long-press →) active update
{ const env = makeEnv(); seed(env); activate(env); update(env, 150);
  ck('1. inspector appears: .mob-inspecting set + cursor positioned', env.area.classList.contains('mob-inspecting') && !!env.reg['mobChartCursor'].style.left); }

// 2. moves with the finger
{ const env = makeEnv(); seed(env); activate(env); update(env, 10); const a = env.reg['mobChartCursor'].style.left; update(env, 290); const b = env.reg['mobChartCursor'].style.left;
  ck('2. inspector moves: cursor left changes with finger x', a !== b, a + ' → ' + b); }

// 3. disappears on release (hide clears class + cursor + hair + tip + state)
{ const env = makeEnv(); seed(env); activate(env); update(env, 150); hide(env);
  const cur = env.reg['mobChartCursor'], hair = env.reg['mobChartHair'], tip = env.reg['mobChartTip'];
  ck('3. release: .mob-inspecting removed', !env.area.classList.contains('mob-inspecting'));
  ck('3b. release: cursor + hair + tip forced hidden (opacity 0)', cur.style.opacity === '0' && hair.style.opacity === '0' && tip.style.opacity === '0');
  ck('3c. release: tooltip content cleared', tip._html === '');
  ck('3d. release: active state reset', active(env) === false); }

// 4. THE RACE FIX — a late rAF update fired AFTER release must NOT re-show
{ const env = makeEnv(); seed(env); activate(env); update(env, 150); hide(env);
  update(env, 150);   // simulate the frame scheduled during touchmove firing post-release
  ck('4. late update after release does NOT re-show (active-guard)', !env.area.classList.contains('mob-inspecting'));
  ck('4b. tooltip stays empty after the late update', env.reg['mobChartTip']._html === ''); }

// 5. re-show works after a previous hide (inline opacity cleared on next active update)
{ const env = makeEnv(); seed(env); activate(env); update(env, 150); hide(env); activate(env); update(env, 150);
  const cur = env.reg['mobChartCursor'];
  ck('5. re-activate after release shows again (opacity cleared, class re-added)', env.area.classList.contains('mob-inspecting') && cur.style.opacity === ''); }

// 6. swipe/carousel restored on release (touchAction reset)
{ const env = makeEnv(); seed(env); activate(env);
  vm.runInContext("document.getElementById('wealthCurveMobile').style.touchAction = 'none';", env.sandbox);
  update(env, 150); hide(env);
  ck('6. swipe restored: area.touchAction reset on release', env.area.style.touchAction === ''); }

console.log('\nLIVE FILE — event wiring:');
const initFn = fnSrc('_aurixInitMobileChartInspector');
ck('7. touchend + touchcancel → clearInspector (_aurixMobInspectorHide)', /addEventListener\('touchend', end\)/.test(initFn) && /addEventListener\('touchcancel', end\)/.test(initFn) && /_aurixMobInspectorHide\(\);/.test(initFn));
ck('8. pointerup + pointercancel safety net → hide', /addEventListener\('pointerup', endP\)/.test(initFn) && /addEventListener\('pointercancel', endP\)/.test(initFn) && /_aurixMobInspectorHide\(\);/.test(fnSrc('_aurixInitMobileChartInspector')));
ck('9. window-level release teardown (release outside the chart still clears)', /window\.addEventListener\('pointerup', endP\)/.test(initFn));
ck('10. update guards on active flag (no work / no re-show when inactive)', /if \(!_aurixMobInspectorActive\) return;/.test(fnSrc('_aurixMobInspectorUpdate')));
ck('11. hide explicitly clears cursor/hair/tip nodes', /\['mobChartHair', 'mobChartCursor', 'mobChartTip'\]\.forEach/.test(fnSrc('_aurixMobInspectorHide')));
ck('12. still bound exactly once (no duplicate listeners)', /_aurixMobInspectorBound\) return;/.test(initFn) && /_aurixMobInspectorBound = true;/.test(initFn));
ck('13. inspector still uses the FULL real points (visiblePoints/visiblePixels), no fabrication', /_aurixMobChartPts = rc\.visiblePoints\.map/.test(app));
ck('14. no Chart.js / engine calls in the inspector block', ['new Chart', 'initChart(', 'renderAurixInstitutionalChart(', '_aurixMonotonePath('].every(s => block.indexOf(s) < 0));

console.log('\nRC3-INC6 — Inspector Gesture Lock (carousel vs chart):');
// _aurixSliderShouldSwipe lives in the extracted inspector block → callable in the sandbox.
const env = makeEnv();
const should = (dx,dt,fromInsp,cool) => vm.runInContext(`_aurixSliderShouldSwipe(${dx},${dt},${fromInsp},${cool},50,0.3)`, env.sandbox);
ck('15. drag LEFT inside the chart (inspector gesture) → NO donut switch', should(-180, 400, true, false) === false);
ck('16. release after inspector (cooldown active) → NO donut switch', should(-180, 400, false, true) === false);
ck('17. NEW clear swipe (not inspector, no cooldown) → switches to donut', should(-140, 220, false, false) === true);
ck('18. tiny near-vertical gesture → NO switch (vertical scroll unaffected)', should(-8, 300, false, false) === false);
ck('19. fast new flick still switches (velocity threshold honoured)', should(-40, 90, false, false) === true);
// wiring: inspector sets the shared flag on claim + cooldown on release; slider reads them
ck('20. inspector claim sets window.__aurixInspectorActive', /window\.__aurixInspectorActive = true;/.test(initFn));
ck('21. release opens cooldown (window.__aurixInspectorCooldownUntil)', /__aurixInspectorCooldownUntil = Date\.now\(\) \+ _AURIX_INSPECTOR_COOLDOWN_MS/.test(initFn));
ck('22. hide clears the shared active flag', /window\.__aurixInspectorActive = false/.test(fnSrc('_aurixMobInspectorHide')));
const slider = fnSrc('initMobileSlider');
ck('23. slider marks fromInspector at touchstart + during move', /fromInspector = !!\(typeof window/.test(slider) && /window\.__aurixInspectorActive\) fromInspector = true;/.test(slider));
ck('24. slider touchend uses _aurixSliderShouldSwipe + cooldown gate', /_aurixSliderShouldSwipe\(dx, dt, fromInspector, cooldownActive/.test(slider) && /__aurixInspectorCooldownUntil/.test(slider));
ck('25. cooldown is configurable (150–250ms)', /_AURIX_INSPECTOR_COOLDOWN_MS = (1[5-9]\d|2[0-5]\d);/.test(app));

console.log('\nRESULT: ' + (fail === 0 ? 'PASS ✓' : 'FAIL ✗') + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
