'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MULTIDEVICE-STATE-HARDENING-harness — SPEC MULTI-DEVICE STATE HARDENING (P0)
// ════════════════════════════════════════════════════════════════════════════
// Reconciliation is a WRITE BARRIER: no device may publish persistent state over the canonical
// user_portfolios row until the remote reconcile has SETTLED safely. This harness proves:
//   • the barrier helpers exist and behave fail-closed (block on failed/null/pre-boot/reset);
//   • EVERY persistent user_portfolios writer consults _aurixPersistenceReady();
//   • the history columns get the same defensive omit as assets/holdings (and the payload FORMAT
//     — the `category_history: categoryHistory,` literal — is UNCHANGED, so other harnesses hold);
//   • loadPortfolioFromBackend distinguishes no-row (new account) from a transient failure;
//   • the EXPLICIT reset writer (_pushEmptyPortfolioToBackend) is deliberately NOT gated.
// Read-only: extracts function sources and runs the two pure barrier helpers in a vm sandbox.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function braceSlice(startIdx) { let k = app.indexOf('{', startIdx), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(startIdx, k); }
function fnSrc(name) { const s = 'function ' + name + '('; const i = app.indexOf(s); if (i < 0) throw new Error('missing fn ' + name); return braceSlice(i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

console.log('AURIX-MULTIDEVICE-STATE-HARDENING — SPEC MULTI-DEVICE STATE HARDENING (P0)\n');

// ── 1 barrier helpers + outcome flag exist ───────────────────────────────────
console.log('1 — barrier primitives:');
ok('1.1 _aurixRemoteLoadOutcome declared (null default)', /let _aurixRemoteLoadOutcome = null;/.test(app));
ok('1.2 _aurixPersistenceReady() present', /function _aurixPersistenceReady\(\)/.test(app));
ok('1.3 _aurixHistoryColumnsSafe() present', /function _aurixHistoryColumnsSafe\(\)/.test(app));

// ── 2 barrier behaviour (pure, run in a sandbox) ─────────────────────────────
console.log('2 — barrier fail-closed behaviour:');
const ctx = {};
vm.createContext(ctx);
vm.runInContext('var supabaseClient, currentUser, _bootLoadComplete, _aurixResetInProgress, _aurixRemoteLoadOutcome, _aurixCanonicalHistoryLoaded;', ctx);
vm.runInContext(fnSrc('_aurixPersistenceReady'), ctx);
vm.runInContext(fnSrc('_aurixHistoryColumnsSafe'), ctx);
const ready = () => vm.runInContext('_aurixPersistenceReady()', ctx);
const histSafe = () => vm.runInContext('_aurixHistoryColumnsSafe()', ctx);
function setEnv(o) { ctx.supabaseClient = o.client; ctx.currentUser = o.user; ctx._bootLoadComplete = o.boot; ctx._aurixResetInProgress = o.reset; ctx._aurixRemoteLoadOutcome = o.outcome; ctx._aurixCanonicalHistoryLoaded = o.canon; }
const GOOD = { client: {}, user: { id: 'u1' }, boot: true, reset: false, outcome: 'ok-row', canon: true };

setEnv(GOOD);                                                   ok('2.1 fully reconciled (ok-row) ⇒ WRITE allowed', ready() === true);
setEnv(Object.assign({}, GOOD, { outcome: 'no-row', canon: false })); ok('2.2 genuine new account (no-row) ⇒ WRITE allowed', ready() === true);
setEnv(Object.assign({}, GOOD, { outcome: 'failed', canon: false })); ok('2.3 transient load failure ⇒ BLOCKED', ready() === false);
setEnv(Object.assign({}, GOOD, { outcome: null, canon: false }));     ok('2.4 no load attempted yet (null) ⇒ BLOCKED', ready() === false);
setEnv(Object.assign({}, GOOD, { boot: false }));              ok('2.5 boot reconcile not finished ⇒ BLOCKED', ready() === false);
setEnv(Object.assign({}, GOOD, { reset: true }));             ok('2.6 reset in progress ⇒ BLOCKED (reset owns the write)', ready() === false);
setEnv(Object.assign({}, GOOD, { user: null }));             ok('2.7 no authed user ⇒ BLOCKED', ready() === false);
setEnv(Object.assign({}, GOOD, { client: null }));           ok('2.8 no supabase client ⇒ BLOCKED', ready() === false);

// ── 3 history-column omit mirrors assets/holdings ────────────────────────────
console.log('3 — history-column omit:');
setEnv(Object.assign({}, GOOD, { canon: true, outcome: 'ok-row' }));  ok('3.1 canonical loaded ⇒ history columns INCLUDED', histSafe() === true);
setEnv(Object.assign({}, GOOD, { canon: false, outcome: 'no-row' })); ok('3.2 new account (no-row) ⇒ history INCLUDED (creates row)', histSafe() === true);
setEnv(Object.assign({}, GOOD, { canon: false, outcome: 'failed' })); ok('3.3 canonical NOT loaded + failed ⇒ history OMITTED', histSafe() === false);
setEnv(Object.assign({}, GOOD, { canon: false, outcome: 'ok-row' })); ok('3.4 canonical NOT loaded (defensive) ⇒ history OMITTED', histSafe() === false);

// ── 4 every persistent writer consults the barrier ───────────────────────────
console.log('4 — writers gated by the barrier:');
ok('4.1 _flushStatePersistence calls _aurixPersistenceReady()', /_aurixPersistenceReady\(\)/.test(fnSrc('_flushStatePersistence')));
ok('4.2 _flushStatePersistence omits history when unsafe', /delete payload\.category_history; delete payload\.portfolio_history;/.test(fnSrc('_flushStatePersistence')));
ok('4.3 _flushStatePersistence payload FORMAT unchanged (category_history literal kept)', /category_history:\s+categoryHistory,/.test(fnSrc('_flushStatePersistence')));
ok('4.4 autoSaveToBackend calls _aurixPersistenceReady()', /_aurixPersistenceReady\(\)/.test(fnSrc('autoSaveToBackend')));
ok('4.5 supabaseSavePortfolio calls _aurixPersistenceReady()', /_aurixPersistenceReady\(\)/.test(fnSrc('supabaseSavePortfolio')));
ok('4.6 _aurixFlushPerformanceState calls _aurixPersistenceReady()', /_aurixPersistenceReady\(\)/.test(fnSrc('_aurixFlushPerformanceState')));

// ── 5 loadPortfolioFromBackend classifies the load outcome ───────────────────
console.log('5 — load-outcome classification:');
const lpf = fnSrc('loadPortfolioFromBackend');
ok('5.1 sets ok-row on a successful row read', /_aurixRemoteLoadOutcome = data \? 'ok-row' : 'failed';/.test(lpf));
ok('5.2 distinguishes no-row (PGRST116) from failed', /PGRST116/.test(lpf) && /'no-row' : 'failed'/.test(lpf));
ok('5.3 sets failed on exception', /_aurixRemoteLoadOutcome = 'failed';/.test(lpf));

// ── 6 explicit reset writer is NOT gated ─────────────────────────────────────
console.log('6 — reset path is a deliberate user wipe (never blocked):');
ok('6.1 _pushEmptyPortfolioToBackend does NOT call the barrier', !/_aurixPersistenceReady/.test(fnSrc('_pushEmptyPortfolioToBackend')));

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
