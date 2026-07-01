'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-DASH-RENDER-STABILITY-harness — SPEC DSH.RENDER.STABILITY.01 (6 guards)
// ════════════════════════════════════════════════════════════════════════════
// FIX1 visual repaint guard (ts-only never repaints) · FIX2 single render per price tick ·
// FIX3 Market/hidden does not repaint Dashboard · FIX4 idempotent performance_state write ·
// FIX5 Total Value idempotent by visible text · FIX6 coalesced foreground repaint. No business logic.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name) {
  const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing ' + name);
  let p = app.indexOf('(', i), pd = 0; for (; p < app.length; p++) { if (app[p] === '(') pd++; else if (app[p] === ')') { pd--; if (!pd) { p++; break; } } }
  let k = app.indexOf('{', p), d = 0; for (; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) { k++; break; } } }
  return app.slice(i, k);
}
let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } }

console.log('AURIX-DASH-RENDER-STABILITY — SPEC DSH.RENDER.STABILITY.01\n');

console.log('FIX 1 — visual signature (timestamp is NOT a repaint cause):');
{ const sb = { Math: Math, Array: Array, activePerfMode: 'pct', baseCurrency: 'USD' }; vm.createContext(sb);
  vm.runInContext(fnSrc('_aurixVisualChartSignature'), sb);
  const S = (emg, surf) => vm.runInContext('_aurixVisualChartSignature(' + JSON.stringify(emg) + ',' + JSON.stringify(surf) + ')', sb);
  const base = { range: '30d', state: 'ready', color: 'up', points: [{ ts: 1, value: 100.00 }, { ts: 2, value: 101.00 }] };
  const tsShift = { range: '30d', state: 'ready', color: 'up', points: [{ ts: 9990, value: 100.00 }, { ts: 9991, value: 101.00 }] };
  const diffVal = { range: '30d', state: 'ready', color: 'up', points: [{ ts: 1, value: 100.00 }, { ts: 2, value: 102.00 }] };
  const diffRange = { range: '7d', state: 'ready', color: 'up', points: [{ ts: 1, value: 100.00 }, { ts: 2, value: 101.00 }] };
  ok('same values, different ts → SAME signature (no repaint)', S(base, 'desktop') === S(tsShift, 'desktop'));
  ok('different value → different signature (repaints)', S(base, 'desktop') !== S(diffVal, 'desktop'));
  ok('different range → different signature', S(base, 'desktop') !== S(diffRange, 'desktop'));
  ok('different surface → different signature (desktop vs mobile)', S(base, 'desktop') !== S(base, 'mobile'));
  vm.runInContext('activePerfMode="curr"', sb);
  ok('different %/€ mode → different signature', S(base, 'desktop') !== (function () { const sb2 = { Math: Math, Array: Array, activePerfMode: 'pct', baseCurrency: 'USD' }; vm.createContext(sb2); vm.runInContext(fnSrc('_aurixVisualChartSignature'), sb2); return vm.runInContext('_aurixVisualChartSignature(' + JSON.stringify(base) + ',"desktop")', sb2); })()); }
ok('FIX1 desktop paint has the guard (skip innerHTML when signature unchanged + line present)',
  /_aurixLastVisualSig\[surface\] === _sig\) return true;/.test(app) && /hostEl\.querySelector\('\.wsc-line'\)/.test(app));
ok('FIX1 mobile paint has the guard (skip svg rewrite when unchanged)',
  /_aurixLastVisualSig\.mobile === _sig\) \{ st\.rendered = true; return; \}/.test(app) && /host\.querySelector && host\.querySelector\('\.aurix-lite-line'\)/.test(app));

console.log('\nFIX 2/3 — single render per price tick + Market/hidden isolation:');
ok('FIX2 direct price path marks the tick (window.__aurixLastDirectDashRenderAt) before render()',
  /window\.__aurixLastDirectDashRenderAt = Date\.now\(\);[\s\S]{0,180}\n\s*render\(\);/.test(app));
ok('FIX2/3 reactive render skipped when a direct render just ran OR dashboard not visible',
  /_recentDirect = \(Date\.now\(\) - \(window\.__aurixLastDirectDashRenderAt \|\| 0\)\) < 3000/.test(app) &&
  /_dashVisible = \(typeof currentTab === 'undefined' \|\| currentTab === 'dashboard'\) && !\(typeof document !== 'undefined' && document\.hidden\)/.test(app) &&
  /if \(typeof render === 'function' && !_skipReactiveRender\)/.test(app));

console.log('\nFIX 4 — idempotent performance_state write:');
ok('skip write when payloadHash === last written (no WRITE_START/OK/VERIFY_READ, no audit.ok)',
  /audit\.payloadHash === _aurixLastWrittenPerfPayloadHash\)\s*\{\s*audit\.skipped = true;/.test(app) &&
  !/audit\.payloadHash === _aurixLastWrittenPerfPayloadHash\)\s*\{\s*audit\.ok = true/.test(app));
ok('last written hash stored ONLY after a confirmed write (after audit.ok = true)',
  /audit\.ok = true;\s*\n\s*_aurixLastWrittenPerfPayloadHash = audit\.payloadHash;/.test(app));

console.log('\nFIX 5 — Total Value idempotent by visible text:');
ok('countUpTotalValue skips when the formatted text already equals the displayed text',
  /const _finalText = formatBase\(targetBase\);\s*\n\s*if \(totalValueEl && totalValueEl\.textContent === _finalText\) \{ _countUpCurrent = targetBase; return; \}/.test(app));

console.log('\nFIX 6 — coalesced foreground repaint (debounced, single run):');
ok('scheduleForegroundRepaint debounces visibility/focus/pageshow/online into ONE resync',
  /const scheduleForegroundRepaint = \(reason\) => \{/.test(app) &&
  /if \(_aurixFgTimer\) return;/.test(app) &&
  /setTimeout\(\(\) => \{[\s\S]{0,300}_aurixResyncFromRemote\(rs\);/.test(app));
ok('the 4 foreground listeners route through _aurixFg → scheduleForegroundRepaint',
  /const _aurixFg = \(reason\) => scheduleForegroundRepaint\(reason\);/.test(app) &&
  /addEventListener\('focus',   \(\) => _aurixFg\('focus'\)\)/.test(app) &&
  /addEventListener\('pageshow', \(\) => _aurixFg\('pageshow'\)\)/.test(app));

console.log('\nLIMPIEZA — [CHART UPDATE] log fully gated (silent by default):');
ok('log only prints when window.AURIX_CHART_LOG is truthy',
  /function _aurixChartUpdateLog\(reason, emg\) \{\s*try \{\s*if \(typeof window === 'undefined' \|\| !window\.AURIX_CHART_LOG\) return;/.test(app));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);
