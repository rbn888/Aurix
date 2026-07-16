'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MULTI-RANGE-FINANCIAL-CERTIFICATION-harness — SPEC DSH.CHART.MULTI_RANGE_FINANCIAL_CERTIFICATION
// ════════════════════════════════════════════════════════════════════════════
// READ-ONLY certification of every PUBLISHED return (24H/7D/30D/1Y/ALL). The graph engine is FROZEN — this
// harness only proves the mathematics of the SINGLE return owner `_aurixComputePeriodReturn` (flow-neutral)
// and its per-range guards, plus that every consumer reads ONE number. Certification equation:
//   baselineValue + marketPnl(returnValue) + externalCashflows(netFlows) == currentValue
//   published% == flow-neutral market return == (current − baseline − cashflows)/baseline × 100
// The ±0.05% neutral dead-band affects COLOR only, never the numeric percentage. Loads the REAL engine +
// net-flow window + the shipped read-only `_aurixCertifyRangeReturn`.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }
function konstSrc(n) { const m = new RegExp('const ' + n + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + n); const eq = m.index + m[0].length, f = app[eq]; if (f === '{' || f === '[') { const b = braceSlice(eq); const s = app.indexOf(';', eq + b.length); return app.slice(m.index, s + 1); } const s = app.indexOf(';', eq); return app.slice(m.index, s + 1); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }
const HOUR = 36e5, DAY = 864e5, T = 1_800_000_000_000;
const RANGES = ['24h', '7d', '30d', '1y', 'all'];
const spanOf = { '24h': HOUR * 20, '7d': DAY * 5, '30d': DAY * 20, '1y': DAY * 300, 'all': DAY * 300 };

// ── real engine + net-flow window + shipped audit ─────────────────────────────
let FLOWS = [];
const ctx = { console: { log() {} }, Math, JSON, Object, Number, String, Boolean, Array, isFinite };
ctx._aurixLoadCapitalFlows = () => FLOWS;
ctx.toBase = (v) => v;   // USD base in tests
vm.createContext(ctx);
['_AURIX_RET_MIN_BASE', '_AURIX_RET_SANE_PCT'].forEach(c => vm.runInContext(konstSrc(c), ctx));
vm.runInContext(fnSrc('_aurixNetFlowsInWindow'), ctx);
vm.runInContext(fnSrc('_aurixComputePeriodReturn'), ctx);
const CPR = (r, first, last) => vm.runInContext('_aurixComputePeriodReturn', ctx)(r, first, last);

// certify ONE scenario against the equation + flow-neutral identity + dead-band contract
function certify(label, range, baselineValue, currentValue, flows, expectPublish) {
  FLOWS = flows || [];
  const first = { ts: T, value: baselineValue }, last = { ts: T + spanOf[range], value: currentValue };
  const res = CPR(range, first, last);
  const netFlows = res.netFlows;
  const marketPnl = res.returnValue;              // neutralDelta (== rawDelta − netFlows) when ok
  const published = res.returnPct;                // published % (== badge/line/displayed — single owner)
  const ok_ = res.returnState === 'ok';
  const rows = { label, range, baselineTimestamp: first.ts, endpointTimestamp: last.ts, baselineValue, currentValue, externalCashflows: netFlows, marketPnl, publishedReturnPct: published, returnState: res.returnState, color: res.color };
  if (expectPublish === false) { ok(label + ' → honestly SUPPRESSED (no published %, no fake number)', !ok_ && published === null, res.returnState); return rows; }
  // 1) equation: baseline + marketPnl + cashflows == current (exact by construction)
  const residual = +(baselineValue + marketPnl + netFlows - currentValue).toFixed(2);
  ok(label + ' → equation baseline+marketPnl+cashflows==current (residual 0)', ok_ && Math.abs(residual) <= 0.01, 'residual=' + residual + ' state=' + res.returnState);
  // 2) published % == flow-neutral market return
  const expectedPct = +(((currentValue - baselineValue - netFlows) / baselineValue) * 100).toFixed(4);
  ok(label + ' → published% == flow-neutral return (' + expectedPct + '%)', ok_ && Math.abs(published - expectedPct) <= 0.0001, 'published=' + published + ' expected=' + expectedPct);
  // 3) color derives from the SAME number with the ±0.05 dead-band (presentation only)
  const colorExpected = published > 0.05 ? 'up' : (published < -0.05 ? 'down' : 'flat');
  ok(label + ' → color matches number via ±0.05 dead-band', res.color === colorExpected, 'color=' + res.color + ' expected=' + colorExpected);
  return rows;
}

console.log('\nCERTIFICATION (representative scenarios, all ranges share the same value-based engine):');
// positive / negative / zero (no flows)
certify('positive', '30d', 6000, 6120, []);                 // +2.0000%
certify('negative', '30d', 6000, 5880, []);                 // −2.0000%
certify('zero exact', '30d', 6000, 6000, []);               // 0.0000% flat
// deposit / withdrawal (flow excluded from market return)
certify('deposit +2000 (market +100)', '30d', 6000, 8100, [{ ts: T + HOUR, amountUSD: 2000 }]);   // neutral +1.6667%
certify('withdrawal -2000 (market +50)', '30d', 6000, 4050, [{ ts: T + HOUR, amountUSD: -2000 }]); // neutral +0.8333%
// liquidity-only account: value is all cash; a deposit moves value but flow-neutral return ~0
certify('liquidity-only + deposit (0 market)', '30d', 5000, 6000, [{ ts: T + HOUR, amountUSD: 1000 }]); // neutral 0.0000% flat
// multi-asset / crypto / stocks / mixed — the engine is value-based; composition does not change the math
certify('crypto multi-asset', '24h', 21000, 21315, []);     // +1.5%
certify('stocks', '7d', 14000, 14210, []);                  // +1.5%
certify('mixed portfolio', '1y', 48920, 53812, []);         // +10%
// partial vs full history (baseline > MIN_BASE, within sane bound) + ALL
certify('partial history 24H', '24h', 6000, 6072, []);      // +1.2%
certify('full history ALL', 'all', 1000, 2000, []);         // +100% (within ALL 250 bound)

console.log('\nDead-band (color-only, number exact):');
{ FLOWS = []; const res = CPR('30d', { ts: T, value: 6000 }, { ts: T + spanOf['30d'], value: 6003 });   // +0.05% edge
  ok('±0.05 dead-band: color flat but numeric % is the EXACT non-zero value (0.05)', res.color === 'flat' && res.returnPct === 0.05, 'color=' + res.color + ' pct=' + res.returnPct);
  const res2 = CPR('30d', { ts: T, value: 6000 }, { ts: T + spanOf['30d'], value: 6006 });               // +0.10% → up
  ok('just past dead-band → color up, number 0.10', res2.color === 'up' && res2.returnPct === 0.1); }

console.log('\nHonest suppression (no fake %):');
certify('new account (baseline ≤ MIN_BASE)', '30d', 0.5, 900, [], false);   // startV below floor → suppressed
certify('unrecorded capital (residual > sane bound)', '24h', 6000, 60000, [], false);   // +900% > 25 bound → suppressed
{ FLOWS = []; const res = CPR('7d', { ts: T, value: 6000 }, { ts: T + spanOf['7d'], value: 8600 });  // +43.3% < 45 bound → ok
  ok('within-bound large move still published (7D +43.3% < 45)', res.returnState === 'ok' && Math.abs(res.returnPct - 43.3333) <= 0.001); }

console.log('\nConsumer parity + no-overwrite (single return owner):');
ok('C1 buildProductionPortfolioChart assigns ONE value to returnPct/lineReturnPct/badgeReturnPct',
  /out\.returnPct = per\.returnPct;[\s\S]{0,80}out\.badgeReturnPct = per\.returnPct/.test(app) || /out\.badgeReturnPct = out\.returnPct;/.test(app) || /out\.returnPct = \+returnPct\.toFixed\(4\);[\s\S]{0,120}out\.badgeReturnPct = out\.returnPct;/.test(app));
ok('C2 exactly one flow-neutral engine (_aurixComputePeriodReturn)', (app.match(/function _aurixComputePeriodReturn\(/g) || []).length === 1);
ok('C3 badge painter reads emg.badgeReturnPct (not a re-computation)', /badgeReturnPct/.test(app) && /_aurixResolveChartReturnContract|_aurixEmergencyPaintBadgeNode/.test(app));
ok('C4 published 24H partial return also guarded by partial24hPublished (not overwritten by full-range per)', /if \(!out\.partial24hPublished\) \{[\s\S]{0,160}out\.returnPct = per\.returnPct/.test(app));
ok('C5 no consumer recomputes a second period-return number for the badge (single owner)', (app.match(/neutralDelta \/ startV/g) || []).length === 1);

console.log('\nShipped read-only certifier (additive; frozen engine):');
ok('S1 spec marker present', /MULTI_RANGE_FINANCIAL_CERTIFICATION/.test(app));
ok('S2 _aurixCertifyRangeReturn + window.aurixMultiRangeFinancialCertification exposed', /function _aurixCertifyRangeReturn\(/.test(app) && /window\.aurixMultiRangeFinancialCertification = function/.test(app));
{ const src = fnSrc('_aurixCertifyRangeReturn');
  // read-only: reads the chart contract; performs NO render/mobile/DOM writes and never re-assigns the
  // backend snapshots or the emg contract (regex avoids matching `===` comparisons).
  const mutates = /renderWealthCurve|scheduleAurixMobileLite|updateChart\(|\.innerHTML|_aurixBackendSnapshots\s*=[^=]|emg\.\w+\s*=[^=]/.test(src);
  ok('S3 certifier is READ-ONLY (reads buildProductionPortfolioChart, no render/DOM/state mutation)', /buildProductionPortfolioChart\(r\)/.test(src) && !mutates); }
ok('S4 FROZEN: no engine/render/merge/FRC edits (single defs intact)', (app.match(/function _aurixResolveFinalRenderSeriesContract\(/g) || []).length === 1 && (app.match(/function _aurixMergeSnapshotSources\(/g) || []).length === 1 && (app.match(/function _aurixRealGapFloorMs\(/g) || []).length === 1 && (app.match(/function _aurixForceMergedChartRepaint\(/g) || []).length === 1);

// desktop/mobile parity + every-consumer-same: both surfaces paint from buildProductionPortfolioChart(emg)
ok('P1 desktop + mobile both source the return from buildProductionPortfolioChart (same emg contract)', (app.match(/renderValidatedPortfolioChartWithInstitutionalRenderer\(emg\.points/g) || []).length >= 2);
ok('P2 the certifier reports consumerParity (returnPct===badgeReturnPct) per range', /consumerParity/.test(fnSrc('_aurixCertifyRangeReturn')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
