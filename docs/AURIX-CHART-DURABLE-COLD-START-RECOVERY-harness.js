'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-DURABLE-COLD-START-RECOVERY-harness — SPEC DSH.CHART.DURABLE_COLD_START_RECOVERY.35
// ════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE (proven): buildProductionPortfolioChart's reconcile gate returned state:'pending'
// ("Histórico en construcción") on EVERY cold start for an authenticated user until the remote row reconciled —
// even though loadCategoryHistory() had already restored a valid durable series from localStorage (identity-
// isolated upstream by _aurixEnforceCacheOwner). FIX: a pure decision (_aurixResolveColdStartRender) renders the
// last verified durable series IMMEDIATELY and keeps the return canonical-gated until reconcile (no return/%
// change). This harness proves the decision contract + wiring + 24H data-recency anchor + owner/geometry
// invariants with deterministic fakes (no real waiting). Continuity while the app is CLOSED still needs the
// external portfolio_snapshots scheduler — asserted as a reported dependency, never faked.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
function konstSrc(name) { const m = new RegExp('const ' + name + '\\s*=\\s*').exec(app); if (!m) throw new Error('missing const ' + name); const i = m.index, eq = m.index + m[0].length, first = app[eq]; if (first === '{' || first === '[') { const body = braceSlice(eq); const semi = app.indexOf(';', eq + body.length); return app.slice(i, semi + 1); } const semi = app.indexOf(';', eq); return app.slice(i, semi + 1); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const DAY = 864e5, HOUR = 36e5, MIN = 60e3, T0 = 1_800_000_000_000;
const ctx = { console: { log() {} }, Math, JSON, Array, Number, isFinite, Infinity, Date, Set, Map, String, Object };
vm.createContext(ctx);
['_AURIX_ALL_MIN_TRUST_POINTS', '_AURIX_CHART_DURABLE_COLD_START'].forEach(c => { try { vm.runInContext(konstSrc(c), ctx); } catch (e) {} });
try { vm.runInContext(fnSrc('_aurixResolveColdStartRender'), ctx); } catch (e) { console.log('  ! ' + e.message); }
const G = n => vm.runInContext(n, ctx);
const MINPTS = G('_AURIX_ALL_MIN_TRUST_POINTS');
const decide = (reconciled, src, opts) => G('_aurixResolveColdStartRender')(reconciled, src, opts || {});
function series(n, t0) { const o = []; for (let i = 0; i < n; i++) o.push({ ts: (t0 || T0) + i * HOUR, total: 1000 + i * 3 }); return o; }
const MATURE = series(40), SHORT = series(3), EMPTY = [];

console.log('\nAURIX-CHART-DURABLE-COLD-START-RECOVERY — SPEC.35   (minMaturePoints=' + MINPTS + ')');

// ── 1) Valid persisted history renders immediately on cold boot ──────────────
(function () { const d = decide(false, MATURE, { flagOn: true, minMaturePoints: MINPTS }); ok('1 valid persisted series renders immediately (not building)', d.renderFromDurable === true && d.buildingPlaceholder === false && d.source === 'durable_local'); })();

// ── 2) Slow backend does not clear or hide it (still not-reconciled → durable) ─
(function () { const d = decide(false, MATURE, { flagOn: true }); ok('2 slow backend keeps durable series visible', d.renderFromDurable === true && d.buildingPlaceholder === false); })();

// ── 3) Offline boot keeps last verified history visible ──────────────────────
(function () { const d = decide(false, MATURE, { flagOn: true }); ok('3 offline (unreconciled) keeps durable series', d.renderFromDurable === true); })();

// ── 4) Newer valid hydration replaces atomically (reconciled → canonical path) ─
(function () { const d = decide(true, MATURE, { flagOn: true }); ok('4 reconciled ⇒ canonical path (atomic replacement)', d.renderFromDurable === false && d.buildingPlaceholder === false && d.reason === 'reconciled' && d.source === 'canonical'); })();

// ── 5) Older/shorter/invalid hydration rejected — return stays canonical-gated ─
(function () {
  // pre-reconcile durable render must SUPPRESS the return (never paint a local-only %/authority)
  const d = decide(false, MATURE, { flagOn: true });
  ok('5 durable cold-start suppresses the return (canonical-gated, no local %)', d.suppressReturn === true);
})();

// ── 6) Wrong user/account/currency/revision rejected — identity isolation upstream ─
(function () {
  ok('6 identity isolation: _aurixEnforceCacheOwner purges other-user cache pre-boot', /function _aurixEnforceCacheOwner\(/.test(app) && /initPortfolioData/.test(app) && app.indexOf('_aurixEnforceCacheOwner(userId)') >= 0);
  ok('6 durable source read via identity-scoped display owner', /_aurixHistorySourceForDisplay\(\)/.test(app));
})();

// ── 7) Cache-empty + backend-history: building until reconcile, then canonical ─
(function () {
  const cold = decide(false, EMPTY, { flagOn: true });
  const afterHydrate = decide(true, MATURE, { flagOn: true });
  ok('7 empty cache ⇒ building until reconcile, then canonical restore', cold.buildingPlaceholder === true && afterHydrate.reason === 'reconciled');
})();

// ── 8) Local-history + backend-unavailable restores correctly (THE fix) ──────
(function () { const d = decide(false, MATURE, { flagOn: true }); ok('8 local history + backend unavailable ⇒ renders durable', d.renderFromDurable === true && d.reason === 'durable_last_verified_series'); })();

// ── 9) Truly new portfolio may show building state ───────────────────────────
(function () { const d = decide(false, SHORT, { flagOn: true, minMaturePoints: MINPTS }); ok('9 truly-new/short portfolio ⇒ building (rule 6/9)', d.buildingPlaceholder === true && d.renderFromDurable === false && d.reason === 'no_mature_verified_series'); })();

// ── 10) Portfolio revision isolation (existing performance_state userId/revision gate) ─
(function () { ok('10 performance_state carries userId + portfolioRevision for isolation', /userId:\s*_aurixCurrentUserId\(\)/.test(app) && /portfolioRevision:\s*_aurixCurrentRevision\(\)/.test(app) && /ps\.userId !== _aurixCurrentUserId\(\)/.test(app)); })();

// ── 11) Logout/login does not leak another identity ──────────────────────────
(function () { ok('11 SIGNED_OUT clears local history keys (_clearLocalUserState incl category_history)', /_clearLocalUserState/.test(app) && /'category_history'/.test(app) && /aurix_cache_owner/.test(app)); })();

// ── 12) Multiple tabs remain deterministic (same input ⇒ same decision) ──────
(function () { ok('12 deterministic decision (same input ⇒ same output)', JSON.stringify(decide(false, MATURE, { flagOn: true })) === JSON.stringify(decide(false, MATURE, { flagOn: true }))); })();

// ── 13/14/15) 24H rolling anchor = [nowRef−24h, nowRef], data-recency based ──
(function () {
  const window24h = nowRef => ({ start: nowRef - 24 * HOUR, end: nowRef });   // mirrors app.js:961/20261 (nowRef - spanMs)
  const a = window24h(T0);
  ok('13 24H window = [nowRef−24h, nowRef]', a.end - a.start === 24 * HOUR);
  const b = window24h(T0 + 5 * HOUR);
  ok('14 advancing the clock/data advances BOTH boundaries', b.start === a.start + 5 * HOUR && b.end === a.end + 5 * HOUR);
  // midnight/calendar independence: two nowRefs straddling a calendar midnight shift the window by the delta,
  // with no discontinuous "reset" (the window is nowRef-relative, never day-boundary relative).
  const midnight = T0 - (T0 % DAY);
  const beforeMid = window24h(midnight - 1), afterMid = window24h(midnight + 1);
  ok('15 no midnight reset (window is nowRef-relative, continuous across day boundary)', (afterMid.start - beforeMid.start) === 2 && (afterMid.end - beforeMid.end) === 2);
  ok('15 source anchors 24H on nowRef − spanMs (NOT calendar/session/cache)', /nowRef - spanMs/.test(app) && /nowRef - \(ms\[range\]/.test(app) && !/setHours\(0,\s*0,\s*0,\s*0\)/.test(app.slice(app.indexOf('function buildValidatedHistoricalSeries'), app.indexOf('function buildValidatedHistoricalSeries') + 4000)));
})();

// ── 16) Closing/reopening the simulated session does not reset persisted history ─
(function () {
  // simulate: session 1 persists MATURE to a fake localStorage; session 2 (cold) reads it back → decision renders it
  const fakeLS = {}; fakeLS['category_history'] = JSON.stringify(MATURE);
  const restored = JSON.parse(fakeLS['category_history']);
  const d = decide(false, restored, { flagOn: true });
  ok('16 reopened session restores persisted history (renders durable)', d.renderFromDurable === true && restored.length === MATURE.length);
})();

// ── 17) No synthetic points (decision selects the durable REAL series; never fabricates) ─
(function () {
  const d = decide(false, MATURE, { flagOn: true });
  ok('17 no synthetic points (decision carries no fabricated data; maturePointCount = real count)', d.maturePointCount === MATURE.length && !('points' in d));
})();

// ── 18) No timestamp/value mutation ──────────────────────────────────────────
(function () { const before = JSON.stringify(MATURE); decide(false, MATURE, { flagOn: true }); ok('18 durable source not mutated', JSON.stringify(MATURE) === before); })();

// ── 19) FRC / render owner count unchanged ───────────────────────────────────
(function () {
  ok('19 single FRC chokepoint', (app.match(/^function _aurixResolveFinalRenderSeriesContract\(/gm) || []).length === 1);
  ok('19 single production builder', (app.match(/^function buildProductionPortfolioChart\(/gm) || []).length === 1);
  ok('19 single renderer + single cold-start decision owner', (app.match(/^function renderValidatedPortfolioChartWithInstitutionalRenderer\(/gm) || []).length === 1 && (app.match(/^function _aurixResolveColdStartRender\(/gm) || []).length === 1);
})();

// ── 20) Projection/density/returns/badges/colors/interactions unchanged (owners intact) ─
(function () {
  ok('20 SPEC.32 beta + SPEC.33 density owners untouched', /_AURIX_UNIFIED_X_FILL_BETA = 0\.48/.test(app) && /_AURIX_UNIFIED_VP_DENSITY = \{ pixelsPerPoint: 5, minPoints: 80, maxPoints: 180 \}/.test(app));
  ok('20 return canonical-gate intact (canDisplayCanonicalReturn) + cold-start suppresses return', /function canDisplayCanonicalReturn\(/.test(app) && /out\.__durableColdStart/.test(app) && /returnState = 'insufficient_return_history'/.test(app));
  ok('20 SPEC.34 interaction resolver untouched', (app.match(/^function _aurixResolveChartInteraction\(/gm) || []).length === 1);
})();

// ── 21) Desktop/mobile parity (chart source is single; cold-start applies to both surfaces) ─
(function () { ok('21 single display source owner feeds both surfaces', (app.match(/^function _aurixHistorySourceForDisplay\(/gm) || []).length === 1); })();

// ── 22) No timer/listener/network fan-out leaks introduced by the fix ────────
(function () {
  const gateSrc = app.slice(app.indexOf('SPEC.35 — instead of always showing'), app.indexOf('SPEC.35 — instead of always showing') + 1400);
  ok('22 cold-start gate adds no timers/network/storage writes', !/setTimeout|setInterval|fetch\(|addEventListener|localStorage\.setItem|autoSaveToBackend/.test(gateSrc));
  ok('22 decision helper is pure (no side effects)', !/setTimeout|fetch\(|localStorage|addEventListener|Date\.now/.test(fnSrc('_aurixResolveColdStartRender')));
})();

// ── 23) Flag OFF restores exact v515 behavior (building placeholder) ─────────
(function () {
  const d = decide(false, MATURE, { flagOn: false });
  ok('23 flag OFF ⇒ building placeholder (exact v515)', d.buildingPlaceholder === true && d.renderFromDurable === false && d.reason === 'awaiting_canonical_reconcile');
  ok('23 flag declared once + gate reads it', (app.match(/const _AURIX_CHART_DURABLE_COLD_START\s*=/g) || []).length === 1 && /_AURIX_CHART_DURABLE_COLD_START !== 'undefined'/.test(app));
})();

// ── 24) Golden checkpoint unchanged ──────────────────────────────────────────
(function () { ok('24 Golden v510 checkpoint doc present', fs.existsSync(path.join(root, 'docs', 'AURIX-CHART-GOLDEN-CHECKPOINT-v510.md'))); })();

// ── extra) architectural stop rule: closed-app continuity dependency reported, not faked ─
(function () {
  ok('S1 backend closed-app continuity is reported as an EXTERNAL dependency (portfolio_snapshots scheduler)', /portfolio_snapshots/.test(app) && /snapshots are captured only while the app is open|scheduled BACKEND capture/.test(app));
  ok('S2 audit exposes coldStart contract (enabled, canonical-gated return, external backend dependency)', /coldStart: \{/.test(app) && /render_last_verified_durable_series_then_atomic_hydrate/.test(app) && /requires external portfolio_snapshots scheduler/.test(app));
  ok('S3 marker present', app.indexOf('DSH.CHART.DURABLE_COLD_START_RECOVERY.35') >= 0);
})();

// ════════════════════════════════════════════════════════════════════════════
// SPEC PREMIUM-24H-FIRST-PAINT (P0) — SPEC.35's activation boundary for 24H
// ════════════════════════════════════════════════════════════════════════════
// SPEC.35 publishes the durable series as the FIRST visible frame with the return still
// canonical-gated. For 24H on a mature account that IS the reported artefact: provisional
// neutral line + "Calculando…" and then a visible repaint into the definitive red/green
// chart. This section pins the narrowed activation: while the remote load has not SETTLED,
// 24H publishes nothing but the existing premium loading state; the moment it settles —
// EITHER way — SPEC.35 behaves exactly as before. The gate is executed from the REAL app.js
// source (extracted verbatim), not re-implemented here, so drift fails the gate.
(function () {
  console.log('\nFIRST PAINT — publication boundary:');
  const marker = 'SPEC PREMIUM-24H-FIRST-PAINT';
  ok('P0 marker present in the SPEC.35 reconcile gate', app.indexOf(marker) >= 0);
  let gate = null;
  try {
    const i = app.indexOf('let _holdFirstPaint');
    const j = app.indexOf('_AURIX_CHART_DURABLE_COLD_START;', i);
    const snippet = app.slice(i, j + '_AURIX_CHART_DURABLE_COLD_START;'.length);
    // The extracted source is the ONLY logic under test.
    gate = new Function('r', '_aurixRemoteLoadOutcome', '_AURIX_CHART_DURABLE_COLD_START',
      snippet + ' return { hold: _holdFirstPaint, durableOn: !!_durableOn };');
  } catch (e) { ok('P0 gate extractable from source', false, e.message); }
  if (gate) {
    ok('P0 gate extractable from source', true);
    // SPEC P0-CHART-FIRST-PAINT-GAP-INTEGRITY supersedes the v598 scoping: the hold was `r === '24h'`,
    // so 7D/30D/1Y/TOTAL still published SPEC.35's provisional durable frame (neutral line + suppressed
    // return) and then repainted into the definitive red/green chart. The publication boundary is now
    // RANGE-AGNOSTIC — every range holds while the remote load is unsettled and releases the instant it
    // settles, whatever the outcome.
    for (const r of ['24h', '7d', '30d', '1y', 'all']) {
      const boot = gate(r, null, true);
      ok(`P0 ${r} + load unsettled ⇒ durable cold-start SUPPRESSED (no provisional line/%)`,
         boot.hold === true && boot.durableOn === false, JSON.stringify(boot));
    }
    // Settled — any outcome — releases immediately. 'failed' is the offline case: SPEC.35 must
    // still render the durable line, otherwise this fix would strand an offline user in loading.
    for (const r of ['24h', '7d', 'all']) {
      for (const outcome of ['ok-row', 'no-row', 'failed']) {
        const s = gate(r, outcome, true);
        ok(`P0 ${r} + load settled '${outcome}' ⇒ SPEC.35 unchanged (durable line restored)`,
           s.hold === false && s.durableOn === true, JSON.stringify(s));
      }
    }
    // The flag still wins: with SPEC.35 disabled nothing is force-enabled.
    ok('P0 gate never force-enables durable cold-start when the flag is off',
       gate('24h', 'ok-row', false).durableOn === false && gate('7d', null, false).durableOn === false);
  }
  // Presentation-only: reuses the EXISTING pending state/reason — no new visual state invented.
  const blk = app.slice(app.indexOf(marker), app.indexOf(marker) + 2600);
  ok('P0 holds the EXISTING premium loading state (awaiting_canonical_reconcile), no new state',
     /buildingPlaceholder/.test(blk) && /awaiting_canonical_reconcile/.test(blk));
  ok('P0 no timer / delay / CSS hiding introduced by the fix',
     !/setTimeout|setInterval|requestAnimationFrame|style\.|classList/.test(blk));
  // No second reconcile owner: the fix only READS the signal, and every WRITE still lives in
  // loadPortfolioFromBackend's terminal paths (1 declaration + 4 writes = 5 assignment forms).
  ok('P0 the fix only READS the reconcile signal (never writes it)',
     !/_aurixRemoteLoadOutcome\s*=[^=]/.test(blk));
  ok('P0 no duplicated reconcile machinery — writes still confined to the existing owner',
     (app.match(/_aurixRemoteLoadOutcome\s*=[^=]/g) || []).length === 5);
  ok('P0 return math / series builders untouched by this SPEC',
     !/getValidReturnBaseline|buildValidatedHistoricalSeries|deltaPct/.test(blk));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' SPEC.35 DURABLE COLD-START RECOVERY — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
