'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-LAUNCH-GATE-OBSERVABILITY-RUNNER-harness — SPEC DSH.CHART.LAUNCH_GATE_OBSERVABILITY_RUNNER.24
// ════════════════════════════════════════════════════════════════════════════
// aurixRunChartLaunchGate is a safe, self-logging, timeout-safe AUDIT-ONLY wrapper around the SPEC.23 soak.
// This harness runs the REAL runner source (extracted from app.js) inside a mock window with a STUBBED
// aurixChartRuntimeSoakAudit and TRACKED timers (real Node timers, counted), then drives all four paths —
// success / defect / timeout / exception — asserting the return shape, the stored result, the copy helper,
// JSON-serializability, zero leaked timers, and (source-level) that the runner writes no
// localStorage/Supabase/save-sync and mutates no chart data.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function stmt(sig) { const i = app.indexOf(sig); if (i < 0) throw new Error('missing ' + sig); return braceSlice(i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const runnerSrc = stmt('window.aurixRunChartLaunchGate = function');
const copySrc = stmt('window.aurixCopyLastChartLaunchGate = function');

// ── tracked timers (wrap real Node timers; count outstanding to prove no leak) ──
let live = 0;
const tSet = (fn, ms) => { live++; return setTimeout(fn, ms); };
const tClr = (h) => { if (h != null) { live--; clearTimeout(h); } };
const iSet = (fn, ms) => { live++; return setInterval(fn, ms); };
const iClr = (h) => { if (h != null) { live--; clearInterval(h); } };
const quietConsole = { log() {} };

// build a fresh mock window + install the runner/copy fns bound to the tracked timers.
function freshEnv(soakImpl, navImpl) {
  const win = { AURIX_BUILD: 'v506-test', aurixChartRuntimeSoakAudit: soakImpl };
  const nav = navImpl || { clipboard: null };
  const factory = new Function('window', 'navigator', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console',
    runnerSrc + ';\n' + copySrc + ';');
  factory(win, nav, tSet, tClr, iSet, iClr, quietConsole);
  return win;
}

// stub soaks
const soakSuccess = (opts) => Promise.resolve({
  verdict: 'STABLE_LAUNCH_READY',
  summary: { all24hSinglePath: true, totalSyntheticPoints: 0, bridgedDiscontinuousGapCount: 0, desktopEqualsMobile: true, defectCount: 0, defectCodes: [] },
  crossRangeMatrix: { '7d|30d': 'SAME_AVAILABLE_HISTORY_LEGITIMATE' }, crossRangeVerdict: 'CROSS_RANGE_CLEAN',
  sevenDayTransitions: [], defects: [], finalTick: { perRange: {} },
});
const soakDefect = (opts) => Promise.resolve({
  verdict: 'NOT_LAUNCH_READY',
  summary: { all24hSinglePath: true, totalSyntheticPoints: 0, bridgedDiscontinuousGapCount: 0, desktopEqualsMobile: false, defectCount: 1, defectCodes: ['DESKTOP_MOBILE_DIVERGENCE'] },
  crossRangeMatrix: { '24h|7d': 'CROSS_RANGE_ALIAS_DEFECT' }, crossRangeVerdict: 'CROSS_RANGE_DEFECT',
  sevenDayTransitions: [], defects: [{ type: 'DESKTOP_MOBILE_DIVERGENCE' }], finalTick: { perRange: {} },
});
const soakNever = (opts) => new Promise(function () { /* never resolves ⇒ triggers timeout */ });
const soakThrow = (opts) => Promise.reject(new Error('boom_audit'));

(async function () {
  console.log('AURIX-CHART-LAUNCH-GATE-OBSERVABILITY-RUNNER — SPEC.24');

  // 1-6, 9, 10-14 — SUCCESS path
  {
    const win = freshEnv(soakSuccess);
    ok('1 aurixRunChartLaunchGate exists', typeof win.aurixRunChartLaunchGate === 'function');
    ok('4 aurixCopyLastChartLaunchGate exists', typeof win.aurixCopyLastChartLaunchGate === 'function');
    const r = await win.aurixRunChartLaunchGate({ durationMs: 100, sampleEveryMs: 10, timeoutMs: 1000, verbose: false });
    ok('2 returns an object', r && typeof r === 'object');
    ok('3 stores __AURIX_LAST_CHART_LAUNCH_GATE__', win.__AURIX_LAST_CHART_LAUNCH_GATE__ === r);
    ok('5 success → auditVerdict STABLE_LAUNCH_READY + launchReady true', r.auditVerdict === 'STABLE_LAUNCH_READY' && r.launchReady === true && r.completed === true);
    ok('5b maps summary/defects/crossRange/7d/finalTick/rawGate', r.summary && Array.isArray(r.defects) && r.crossRangeMatrix && Array.isArray(r.sevenDayTransitions) && r.finalTick && r.rawGate);
    ok('9 JSON-serializable', (function () { try { JSON.stringify(r); return true; } catch (_) { return false; } })());
    ok('shape: spec/appVersion/timestamps/flags present', r.spec === 'DSH.CHART.LAUNCH_GATE_OBSERVABILITY_RUNNER.24' && r.appVersion === 'v506-test' && r.startedAtIso && r.endedAtIso && r.timedOut === false && r.threw === false);
    ok('14 no timers leaked after success', live === 0, 'live=' + live);
  }

  // 6 — DEFECT path
  {
    const win = freshEnv(soakDefect);
    const r = await win.aurixRunChartLaunchGate({ durationMs: 100, sampleEveryMs: 10, timeoutMs: 1000, verbose: false });
    ok('6 defect → NOT launchReady, verdict NOT_LAUNCH_READY', r.launchReady === false && r.auditVerdict === 'NOT_LAUNCH_READY' && r.completed === true);
    ok('6b defect surfaces defect codes', r.defects.length === 1 && r.summary.defectCodes.indexOf('DESKTOP_MOBILE_DIVERGENCE') >= 0);
    ok('6c no timers leaked after defect', live === 0, 'live=' + live);
  }

  // 7 — TIMEOUT path
  {
    const win = freshEnv(soakNever);
    const r = await win.aurixRunChartLaunchGate({ durationMs: 60000, sampleEveryMs: 1000, timeoutMs: 60, verbose: false });
    ok('7 timeout → DEFECT_AUDIT_TIMEOUT, launchReady false, timedOut true', r.auditVerdict === 'DEFECT_AUDIT_TIMEOUT' && r.launchReady === false && r.timedOut === true && r.completed === false);
    ok('7b no timers leaked after timeout', live === 0, 'live=' + live);
  }

  // 8 — EXCEPTION path
  {
    const win = freshEnv(soakThrow);
    const r = await win.aurixRunChartLaunchGate({ durationMs: 100, sampleEveryMs: 10, timeoutMs: 1000, verbose: false });
    ok('8 exception → DEFECT_AUDIT_EXCEPTION, launchReady false, threw true', r.auditVerdict === 'DEFECT_AUDIT_EXCEPTION' && r.launchReady === false && r.threw === true);
    ok('8b exception message captured', r.errorMessage === 'boom_audit');
    ok('8c no timers leaked after exception', live === 0, 'live=' + live);
  }

  // 8d — soak unavailable → exception path (no crash)
  {
    const win = freshEnv(undefined);
    const r = await win.aurixRunChartLaunchGate({ durationMs: 100, sampleEveryMs: 10, timeoutMs: 1000, verbose: false });
    ok('8d missing soak → DEFECT_AUDIT_EXCEPTION (graceful)', r.auditVerdict === 'DEFECT_AUDIT_EXCEPTION' && r.launchReady === false);
    ok('8d no timers leaked', live === 0, 'live=' + live);
  }

  // copy helper
  {
    const writes = [];
    const win = freshEnv(soakSuccess, { clipboard: { writeText: (s) => { writes.push(s); return Promise.resolve(); } } });
    await win.aurixRunChartLaunchGate({ durationMs: 50, sampleEveryMs: 10, timeoutMs: 1000, verbose: false });
    const json = win.aurixCopyLastChartLaunchGate();
    ok('4b copy helper returns pretty JSON of last result', typeof json === 'string' && json.indexOf('STABLE_LAUNCH_READY') >= 0 && json.indexOf('\n') >= 0);
    ok('4c copy helper wrote to clipboard when available', writes.length === 1 && writes[0] === json);
    ok('4d copy helper never throws with no prior result', (function () { const w2 = freshEnv(soakSuccess); try { const s = w2.aurixCopyLastChartLaunchGate(); return typeof s === 'string' && /no launch gate result yet/.test(s); } catch (_) { return false; } })());
  }

  // 15 — custom short options work
  {
    const win = freshEnv(soakSuccess);
    const r = await win.aurixRunChartLaunchGate({ durationMs: 100, sampleEveryMs: 10, timeoutMs: 1000, verbose: false });
    ok('15 custom short options complete cleanly', r.completed === true && r.launchReady === true && live === 0);
  }

  // 10-13 — source-level safety: no storage / supabase / save-sync / render mutation
  ok('10 no localStorage write', !/localStorage|sessionStorage/.test(runnerSrc));
  ok('11 no save/sync trigger', !/\bsaveState\b|\bsyncNow\b|\bsavePortfolio\b|\bscheduleSave\b|\bqueueSync\b|onPortfolioChange\(/.test(runnerSrc));
  ok('12 no Supabase write', !/supabase|\.from\(|\.upsert\(|\.insert\(|\.update\(/.test(runnerSrc));
  ok('13 no chart rendering mutation', !/\.innerHTML|emg\.points\s*=|renderWealthCurve\(|_wscPaint|scheduleAurixMobileLite\(|updateChart\(/.test(runnerSrc));
  ok('13b only reads the read-only soak', /window\.aurixChartRuntimeSoakAudit\(/.test(runnerSrc));

  // 16-17 — existing audit + prior SPEC markers intact
  ok('16 aurixChartRuntimeSoakAudit unchanged/present', /window\.aurixChartRuntimeSoakAudit = function/.test(app));
  ok('16b SPEC.19 sole final render chokepoint', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1);
  ['DSH.CHART.FINAL_RENDER_SERIES_CONTRACT.19', 'DSH.CHART.FINAL-CONTRACT-GUARDRAILS.20', 'DSH.CHART.CANONICAL-REFRESH-DETERMINISM', 'DSH.CHART.RELIABILITY_DEADLOCK_RESOLUTION.22', 'DSH.CHART.RUNTIME_SOAK_CROSS_RANGE_PROVENANCE_LAUNCH_GATE.23'].forEach(m =>
    ok('17 marker intact: ' + m, app.indexOf(m) >= 0));
  ok('24 SPEC.24 marker present', app.indexOf('DSH.CHART.LAUNCH_GATE_OBSERVABILITY_RUNNER.24') >= 0);

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
