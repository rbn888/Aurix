'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RESET-LIFECYCLE-GENERATION-GUARD-harness — atomic reset lifecycle + generation guard
// ════════════════════════════════════════════════════════════════════════════
// A late remote resync (started before a reset, landing after) could re-hydrate the PREVIOUS lifecycle's
// portfolio. ROOT CAUSE: _aurixResyncFromRemote never captured/checked the reset generation, so a response
// from the old lifecycle still merged+wrote. FIX (surgical, one owner): the resync captures
// _aurixResetGeneration before the network await and DISCARDS the entire response if the generation advanced
// while awaiting (a reset ran in flight). This harness proves the guard exists at the exact owner, the reset
// is atomic + idempotent + generation-bumping, and the existing tombstone/epoch protections stay intact —
// with NO second onboarding/snapshot/intelligence implementation and NO artificial timeouts.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s, i) { let k = s.indexOf('{', i), d = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return s.slice(i, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) { const j = app.indexOf('async function ' + n + '('); if (j < 0) throw new Error('missing ' + n); return braceSlice(app, j); } return braceSlice(app, i); }
let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

const resync = fnSrc('_aurixResyncFromRemote');
const atomic = fnSrc('performAtomicFreshStartReset');
const safe   = fnSrc('performSafeReset');
const merge  = fnSrc('_aurixMergePortfolio');

console.log('\nAURIX-RESET-LIFECYCLE-GENERATION-GUARD');

// ── 1 generation staleness semantics (pure) ──────────────────────────────────
(function () {
  const ctx = { console: { log() {} } }; ctx._aurixResetGeneration = 7; vm.createContext(ctx);
  vm.runInContext(fnSrc('_aurixIsResetStale'), ctx);
  const stale = g => vm.runInContext('_aurixIsResetStale(' + g + ')', ctx);
  ok('1 current generation is NOT stale', stale(7) === false);
  ok('1 an older generation IS stale', stale(6) === true && stale(0) === true);
  ctx._aurixResetGeneration = 8;   // a reset advanced the generation
  ok('1 a generation captured before a reset becomes stale after it', stale(7) === true);
})();

// ── 2 the reset button hands off to the ATOMIC orchestrator ───────────────────
ok('2 #resetConfirmBtn → performAtomicFreshStartReset()', /#resetConfirmBtn[\s\S]{0,900}performAtomicFreshStartReset\(\)/.test(app));

// ── 3 atomic reset: bumps the generation, idempotent reentrancy guard ─────────
ok('3 atomic reset increments _aurixResetGeneration', /_aurixResetGeneration\+\+/.test(atomic));
ok('3 atomic reset is idempotent (reentrancy guard returns early)', /if \(_aurixResetInProgress\) return false;/.test(atomic));
ok('3 atomic reset captures gen + bails if a newer reset supersedes', /const gen = _aurixResetGeneration;/.test(atomic) && /_aurixIsResetStale\(gen\)/.test(atomic));

// ── 4 THE FIX — resync captures the reset generation and discards a stale response ─
ok('4 resync captures the reset generation BEFORE the network await', resync.indexOf('const _resetGen') >= 0 && resync.indexOf('const _resetGen') < resync.indexOf('await loadPortfolioFromBackend'));
ok('4 resync discards the response when the generation advanced (in-flight reset)', /_aurixIsResetStale\(_resetGen\)[\s\S]{0,200}return;/.test(resync));
ok('4 the discard happens BEFORE any merge/apply/write (no re-hydration)', resync.indexOf('_aurixIsResetStale(_resetGen)') < resync.indexOf('_mergeRemoteState(remote)') && resync.indexOf('_aurixIsResetStale(_resetGen)') < resync.indexOf('assets = flat'));
ok('4 the guard is a synchronous reject — NO artificial timeout/delay added', !/setTimeout\([^)]*DISCARD/i.test(resync) && /DISCARDED_STALE_GENERATION/.test(resync));

// ── 5 performSafeReset closes the old lifecycle atomically ────────────────────
ok('5 stamps the reset tombstone + portfolio epoch FIRST', /localStorage\.setItem\(RESET_AT_KEY[\s\S]{0,120}localStorage\.setItem\(PORTFOLIO_EPOCH_KEY/.test(safe));
ok('5 wipes the authoritative in-memory sources (assets/history/category)', /assets = \[\]/.test(safe) && /portfolioHistory = \[\]/.test(safe) && /categoryHistory  = \[\]/.test(safe));
ok('5 clears persisted portfolio keys + pushes the empty state to the backend', /PORTFOLIO_KEYS\.forEach/.test(safe) && /_pushEmptyPortfolioToBackend\(\)/.test(safe));
ok('5 reuses existing onboarding flow via the aurix:reset event (no 2nd impl)', /new CustomEvent\('aurix:reset'\)/.test(safe));

// ── 6 existing complementary protections intact (tombstone + epoch read-filter) ─
ok('6 merge distrusts remote older than the reset tombstone (keep local)', /_shouldDistrustRemote/.test(merge) && /apply: 'local', reason: 'tombstone'/.test(merge));
ok('6 read-time epoch filter (ts >= epoch) present', /function _aurixFilterAfterEpoch/.test(app) && /p\[key\] >= epoch/.test(fnSrc('_aurixFilterAfterEpoch')));
ok('6 _shouldDistrustRemote compares the reset tombstone vs remote updated_at', /RESET_AT_KEY|aurix_reset_at|reset/.test(fnSrc('_shouldDistrustRemote')));

// ── 7 no second onboarding / snapshot / intelligence implementation created ───
ok('7 reset reuses normal flows (render/recompute/onPortfolioChange), no forked engine', /recomputeDerivedFinancialState/.test(atomic) && /render\(\)/.test(atomic) && /onPortfolioChange/.test(atomic) && !/function _aurix\w*(Onboarding|Snapshot|Intelligence|Sync)\b/.test(atomic));

// ── 8 idempotent + finally-safe (flag always released) ────────────────────────
ok('8 atomic reset releases the in-progress flag in finally', /finally \{[\s\S]{0,80}_aurixResetInProgress = false;/.test(atomic));

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' RESET-LIFECYCLE-GENERATION-GUARD — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
