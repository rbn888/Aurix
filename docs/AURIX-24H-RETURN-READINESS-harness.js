'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-24H-RETURN-READINESS-harness — SPEC DSH.CHART.24H_RETURN_READINESS.46
// ════════════════════════════════════════════════════════════════════════════
// P0: after many real hours (incl. markets open) a fresh account's 24H range stayed neutral + no % +
// "Historial parcial". Owner: buildProductionPortfolioChart suppressed the 24H return whenever the rolling
// window covered < 80% of 24h (historyTooShortForRange), and the SPEC.22 partial-promotion that rescues
// 7D/30D/1Y EXPLICITLY excludes 24H — so 24H had no path to publish a trustworthy covered-period return.
// SPEC.46 adds a 24H-ONLY, additive trust boundary: publish the REAL covered-period return when enough
// elapsed coverage + an original validated baseline + a FRESH endpoint + a continuous-enough interval +
// flow-neutral trust + supported domain all hold; else the EXACT prior neutral/"Historial parcial" state.
// This harness proves the pure readiness resolver, the read-only audit contract, and the source-level
// invariants (24H-only gate, no point/geometry mutation, no surface-specific code).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app);
  if (!m) throw new Error('missing const ' + name);
  const i = m.index, eq = m.index + m[0].length, first = app[eq];
  if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); }
  const semi = app.indexOf(';', eq); return app.slice(i, semi + 1);
}
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const MIN = 60000, HOUR = 36e5, DAY = 864e5, T0 = 1_800_000_000_000;

const CONSTS = [
  '_AURIX_PARTIAL_RETURN_MIN_PCT', '_AURIX_EMG_RANGE_MS',
  '_AURIX_24H_PARTIAL_MIN_COVERAGE', '_AURIX_24H_PARTIAL_MIN_POINTS',
  '_AURIX_24H_ENDPOINT_FRESH_MS', '_AURIX_24H_MAX_INTERNAL_GAP_MS',
];
const FNS = ['_aurix24hReturnReadiness', '_aurixAudit24hReturnReadinessCore'];
function mkCtx() {
  const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set,
    buildProductionPortfolioChart: () => ({ points: [] }) };   // stub — the audit is always fed emg directly here
  vm.createContext(ctx);
  CONSTS.forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) { console.log('  (const load fail ' + c + ': ' + e.message + ')'); } });
  FNS.forEach(f => { try { vm.runInContext(fnSrc(f), ctx); } catch (e) { console.log('  (fn load fail ' + f + ': ' + e.message + ')'); } });
  return ctx;
}
const CTX = mkCtx();
const readiness = ev => vm.runInContext('_aurix24hReturnReadiness', CTX)(ev);
const audit = (emg, now) => vm.runInContext('_aurixAudit24hReturnReadinessCore', CTX)(emg, now);
const ev = o => Object.assign({
  coverageRatio: 0.5, pointCount: 24, endpointFreshnessMs: 10 * MIN, largestGapMs: 20 * MIN,
  baselineIsOriginal: true, currentValueAvailable: true, financialConfidenceOk: true,
  returnPct: 1.24, bootstrapOnly: false,
}, o);
// color the visible badge/line will use (mirror of _aurixResolveChartReturnContract colorFor)
const colorFor = pct => (Number.isFinite(pct) ? (pct > 0.05 ? 'positive' : (pct < -0.05 ? 'negative' : 'neutral')) : 'neutral');
// a coverage-suppressed but otherwise-good 24H emg (rolling window 8h of 24 = 0.333 coverage)
const seg = (n, spanMs, base, driftPct) => { const out = []; for (let i = 0; i < n; i++) out.push({ ts: T0 - spanMs + Math.round(i * spanMs / (n - 1)), value: +(base * (1 + (driftPct / 100) * (i / (n - 1)))).toFixed(2) }); return out; };
const partialEmg = (over) => Object.assign({
  range: '24h', state: 'ready', points: seg(24, 8 * HOUR, 1000, 1.24),
  finalPointCount: 24, coverageRatio: 0.3333, historyTooShortForRange: true,
  baselineTs: T0 - 8 * HOUR, baselineValue: 1000, currentTs: T0, currentValue: 1012.4,
  returnState: 'ok', returnPct: 1.24, badgeReturnPct: 1.24, partial24hPublished: true,
  displayedRangeState: 'partial_history', reason: 'partial_24h_return_published',
}, over || {});
const suppressedEmg = (over) => Object.assign({
  range: '24h', state: 'ready', points: seg(24, 8 * HOUR, 1000, 1.24),
  finalPointCount: 24, coverageRatio: 0.3333, historyTooShortForRange: true,
  baselineTs: T0 - 8 * HOUR, baselineValue: 1000, currentTs: T0, currentValue: 1012.4,
  returnState: 'insufficient_return_history', returnSuppressedReason: 'insufficient_requested_range_history',
  returnPct: null, badgeReturnPct: null, coverageSuppressed: true,
  partialReturnPct: 1.24, partialReturnTrusted: true, displayedRangeState: 'partial_history',
}, over || {});

// ── 1) pure readiness resolver — the 13 behavioural cases ──
console.log('\nReadiness resolver:');
// (1) short coverage → line visible, return hidden
{ const r = readiness(ev({ coverageRatio: 0.10 })); ok('1 short coverage → not publishable (INSUFFICIENT_ELAPSED_COVERAGE)', r.publishable === false && r.reasonCode === 'INSUFFICIENT_ELAPSED_COVERAGE', JSON.stringify(r)); }
// (2) sufficient trusted partial coverage → real return visible
{ const r = readiness(ev({ coverageRatio: 0.50 })); ok('2 sufficient partial coverage → publishable', r.publishable === true && r.reasonCode === 'TRUSTED_PARTIAL_24H_RETURN', JSON.stringify(r)); }
// (3) full trusted 24H coverage → publishable (coverage well above floor)
{ const r = readiness(ev({ coverageRatio: 0.95 })); ok('3 full trusted 24H coverage → publishable', r.publishable === true, JSON.stringify(r)); }
// (4) many points but insufficient elapsed time → no false readiness
{ const r = readiness(ev({ pointCount: 400, coverageRatio: 0.05 })); ok('4 many points + tiny elapsed → not publishable on point-count alone', r.publishable === false && r.reasonCode === 'INSUFFICIENT_ELAPSED_COVERAGE', JSON.stringify(r)); }
// (5) stale endpoint → return hidden
{ const r = readiness(ev({ endpointFreshnessMs: 3 * HOUR })); ok('5 stale endpoint → not publishable (STALE_ENDPOINT)', r.publishable === false && r.reasonCode === 'STALE_ENDPOINT', JSON.stringify(r)); }
// (6) untrusted cashflow → return hidden
{ const r = readiness(ev({ financialConfidenceOk: false })); ok('6 untrusted cashflow → not publishable (FINANCIAL_CONFIDENCE_UNTRUSTED)', r.publishable === false && r.reasonCode === 'FINANCIAL_CONFIDENCE_UNTRUSTED', JSON.stringify(r)); }
// (7) positive return → publishable + green
{ const r = readiness(ev({ returnPct: 2.5 })); ok('7 positive return → publishable + colorFor=positive (green)', r.publishable === true && colorFor(r.returnPct) === 'positive', JSON.stringify(r)); }
// (8) negative return → publishable + red
{ const r = readiness(ev({ returnPct: -2.5 })); ok('8 negative return → publishable + colorFor=negative (red)', r.publishable === true && colorFor(r.returnPct) === 'negative', JSON.stringify(r)); }
// (9) zero return → publishable + neutral (never fabricated; a real 0.00% is honest)
{ const r = readiness(ev({ returnPct: 0 })); ok('9 zero return → publishable + colorFor=neutral', r.publishable === true && r.returnPct === 0 && colorFor(r.returnPct) === 'neutral', JSON.stringify(r)); }
// supported-domain boundary — a total-loss/impossible % is never promoted
{ const r = readiness(ev({ returnPct: -100 })); ok('domain floor: returnPct=-100 → RETURN_OUTSIDE_SUPPORTED_DOMAIN', r.publishable === false && r.reasonCode === 'RETURN_OUTSIDE_SUPPORTED_DOMAIN', JSON.stringify(r)); }
{ const r = readiness(ev({ returnPct: -250 })); ok('domain floor: returnPct=-250 → not publishable', r.publishable === false && r.reasonCode === 'RETURN_OUTSIDE_SUPPORTED_DOMAIN', JSON.stringify(r)); }
// baseline not original → hidden
{ const r = readiness(ev({ baselineIsOriginal: false })); ok('baseline not original → BASELINE_NOT_ORIGINAL', r.publishable === false && r.reasonCode === 'BASELINE_NOT_ORIGINAL', JSON.stringify(r)); }
// current value unavailable → hidden
{ const r = readiness(ev({ currentValueAvailable: false })); ok('current value unavailable → CURRENT_VALUE_UNAVAILABLE', r.publishable === false && r.reasonCode === 'CURRENT_VALUE_UNAVAILABLE', JSON.stringify(r)); }
// bootstrap/construction history → hidden
{ const r = readiness(ev({ bootstrapOnly: true })); ok('bootstrap-only history → BOOTSTRAP_ONLY_HISTORY', r.publishable === false && r.reasonCode === 'BOOTSTRAP_ONLY_HISTORY', JSON.stringify(r)); }
// discontinuous interval → hidden
{ const r = readiness(ev({ largestGapMs: 8 * HOUR })); ok('interior 8h hole → DISCONTINUOUS_INTERVAL', r.publishable === false && r.reasonCode === 'DISCONTINUOUS_INTERVAL', JSON.stringify(r)); }
// insufficient points → hidden
{ const r = readiness(ev({ pointCount: 5 })); ok('insufficient points → INSUFFICIENT_REAL_POINTS', r.publishable === false && r.reasonCode === 'INSUFFICIENT_REAL_POINTS', JSON.stringify(r)); }
// coverage exactly at floor → publishable (inclusive)
{ const r = readiness(ev({ coverageRatio: 0.25 })); ok('coverage == floor (0.25) → publishable (inclusive)', r.publishable === true, JSON.stringify(r)); }
// freshness exactly at bound → publishable (inclusive)
{ const r = readiness(ev({ endpointFreshnessMs: 90 * MIN })); ok('freshness == 90min bound → publishable (inclusive)', r.publishable === true, JSON.stringify(r)); }

// ── 2) read-only audit contract ──
console.log('\nRead-only audit contract:');
const REQUIRED_KEYS = ['pointCount', 'oldestTimestamp', 'newestTimestamp', 'coverageHours', 'coverageRatio', 'largestGapMinutes',
  'baselineTimestamp', 'baselineValue', 'baselineAccepted', 'baselineRejectionReason', 'currentTimestamp', 'currentValue',
  'endpointFreshnessMinutes', 'returnComputable', 'computedReturnPct', 'performanceMode', 'cashflowConfidence',
  'currentState', 'exactBlockingStage', 'exactOwnerFunction', 'exactBlockingRule', 'configuredThreshold', 'exactReason'];
{
  const a = audit(partialEmg(), T0 + 5 * MIN);   // endpoint 5 min old → fresh
  ok('A published partial → returnComputable=true', a.returnComputable === true, JSON.stringify({ rc: a.returnComputable, cs: a.currentState }));
  ok('A published partial → currentState=TRUSTED_PARTIAL_RETURN (never full 24H)', a.currentState === 'TRUSTED_PARTIAL_RETURN', a.currentState);
  ok('A published partial → computedReturnPct=1.24, mode=ok', a.computedReturnPct === 1.24 && a.performanceMode === 'ok', JSON.stringify({ p: a.computedReturnPct, m: a.performanceMode }));
  ok('A published partial → historyTooShortForRange stays true (honestly partial)', a.historyTooShortForRange === true && a.partial24hPublished === true);
  ok('A audit JSON is serializable', (function () { try { JSON.stringify(a); return true; } catch (_) { return false; } })());
  ok('A audit exposes ALL required keys', REQUIRED_KEYS.every(k => Object.prototype.hasOwnProperty.call(a, k)), REQUIRED_KEYS.filter(k => !Object.prototype.hasOwnProperty.call(a, k)).join(','));
}
{
  // suppressed emg BUT stale endpoint → audit must report the blocking owner, not publish
  const a = audit(suppressedEmg(), T0 + 5 * HOUR);   // 5h stale
  ok('B suppressed + stale → returnComputable=false', a.returnComputable === false, JSON.stringify({ rc: a.returnComputable, r: a.exactReason }));
  ok('B suppressed → currentState=PARTIAL_HISTORY_NEUTRAL', a.currentState === 'PARTIAL_HISTORY_NEUTRAL', a.currentState);
  ok('B blocking owner + rule + reason surfaced', /24hReturnReadiness/.test(String(a.exactOwnerFunction)) && a.exactReason === 'STALE_ENDPOINT' && a.exactBlockingRule === 'endpoint_freshness_exceeded', JSON.stringify({ o: a.exactOwnerFunction, r: a.exactReason, b: a.exactBlockingRule }));
  ok('B endpointFreshnessMinutes ≈ 300', Math.round(a.endpointFreshnessMinutes) === 300, String(a.endpointFreshnessMinutes));
}
{
  // untrusted cashflow → owner is the return computation, not coverage
  const a = audit(suppressedEmg({ partialReturnTrusted: false, returnState: 'insufficient_return_history' }), T0 + 5 * MIN);
  ok('C untrusted cashflow → owner=_aurixComputePeriodReturn, reason=FINANCIAL_CONFIDENCE_UNTRUSTED', a.returnComputable === false && a.exactOwnerFunction === '_aurixComputePeriodReturn' && a.exactReason === 'FINANCIAL_CONFIDENCE_UNTRUSTED', JSON.stringify({ o: a.exactOwnerFunction, r: a.exactReason }));
}
{
  // full-coverage healthy 24H (historyTooShortForRange false, returnState ok) → TRUSTED_RETURN, no partial
  const a = audit(partialEmg({ historyTooShortForRange: false, partial24hPublished: false, coverageRatio: 0.95, displayedRangeState: 'full' }), T0 + 5 * MIN);
  ok('D full trusted 24H → currentState=TRUSTED_RETURN (no partial label)', a.returnComputable === true && a.currentState === 'TRUSTED_RETURN', a.currentState);
}

// ── 3) source-level invariants ──
console.log('\nSource-level invariants:');
ok('10 SPEC.46 marker present', /24H_RETURN_READINESS\.46/.test(app));
ok('10 exactly ONE readiness resolver', (app.match(/function _aurix24hReturnReadiness\(/g) || []).length === 1);
ok('10 exactly ONE audit core', (app.match(/function _aurixAudit24hReturnReadinessCore\(/g) || []).length === 1);
ok('10 window.aurixAudit24hReturnReadiness registered', /window\.aurixAudit24hReturnReadiness\s*=/.test(app));
// the publish branch is 24H-gated (7D/30D/1Y/TOTAL untouched)
const buildSrc = fnSrc('buildProductionPortfolioChart');
ok('11 publish decision gated on r===\'24h\'', /if \(r === '24h' && typeof _aurix24hReturnReadiness === 'function'\)/.test(buildSrc));
ok('11 partial24hPublished only set inside 24H gate', (buildSrc.match(/partial24hPublished = true/g) || []).length === 1);
// isolate the publish block and prove it never mutates points/geometry
const pubStart = buildSrc.indexOf('if (_partial24hOk) {');
const pubBlock = pubStart >= 0 ? buildSrc.slice(pubStart, pubStart + 900) : '';
ok('10 publish block never assigns out.points (no geometry change)', pubBlock.length > 0 && !/out\.points\s*=/.test(pubBlock));
ok('10 publish block never touches renderPoints/chartHash/svg', !/renderPoints|linePath|areaPath/.test(pubBlock));
// the non-publishable ELSE branch keeps the EXACT prior suppression contract
ok('11 fallback suppression preserved (insufficient_requested_range_history + partialReturnTrusted)', /out\.returnSuppressedReason = 'insufficient_requested_range_history';/.test(buildSrc) && /out\.partialReturnTrusted = true;/.test(buildSrc));
// desktop/mobile parity: the fix lives in the shared builder + a pure resolver, no surface-specific code
ok('12 readiness resolver + publish block are surface-agnostic', !/mobile|desktop|surface/.test(fnSrc('_aurix24hReturnReadiness')) && !/'mobile'|'desktop'/.test(pubBlock));
// the deadlock resolver still excludes 24H (7D/30D/1Y path unchanged)
ok('11 SPEC.22 deadlock resolver still excludes 24H', /r === '24h' \|\| r === 'all'\) return out;/.test(app));
ok('11 FRC deadlock step still excludes 24H (r !== \'24h\')', /deadlockResOn && out\.lineEligible && !out\.badgeEligible && r !== '24h' && r !== 'all'/.test(app));
// no threshold relaxation of existing gates — new thresholds are ADDITIVE constants
ok('source: additive 24H thresholds defined', /_AURIX_24H_PARTIAL_MIN_COVERAGE = 0\.25/.test(app) && /_AURIX_24H_ENDPOINT_FRESH_MS = 90 \* 60000/.test(app));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
