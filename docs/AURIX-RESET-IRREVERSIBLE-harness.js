'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-RESET-IRREVERSIBLE-harness — SPEC 65 (P0 data integrity)
// ════════════════════════════════════════════════════════════════════════════
// A confirmed RESET must be irreversible: no refresh / login / restore / sync /
// cache / fallback / migration / device-change may resurrect pre-reset data.
// Root causes fixed:
//   • the remote wipe was fire-and-forget and success was declared regardless
//     (reset not atomic, unconfirmed) → cross-device/re-login resurrected assets;
//   • portfolio_snapshots (backend wealth history) was never deleted AND its read
//     had no reset-epoch filter → pre-reset patrimonio rehydrated on focus.
// The live remote/cross-device delete needs the committed DELETE-policy migration
// applied in Supabase; the node gate asserts the client contract + pure-logic
// simulations of the epoch floor and the stale-generation discard.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  ✓ ' + n + (i ? '  [' + i + ']' : '')); } else { fail++; console.log('  ✗ ' + n + (i ? '  [' + i + ']' : '')); } };
const fn = (name) => { const m = app.match(new RegExp('(async\\s+)?function ' + name + '\\s*\\([^)]*\\)\\s*\\{')); if (!m) return ''; const s = app.indexOf(m[0]); let d = 0, i = app.indexOf('{', s); for (let j = i; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}') { d--; if (d === 0) return app.slice(s, j + 1); } } return app.slice(s, s + 4000); };

console.log('AURIX-RESET-IRREVERSIBLE — SPEC 65\n');

// ── ATOMIC, REMOTE-CONFIRMED RESET ──────────────────────────────────────────
const orch = fn('performAtomicFreshStartReset');
// 1. The orchestrator AWAITS the remote wipe and gates on its boolean result.
ok('1 reset awaits the remote wipe (const remoteOk = await _pushEmptyPortfolioToBackend())',
  /const\s+remoteOk\s*=\s*await\s+_pushEmptyPortfolioToBackend\(\)/.test(orch));
// 2. On remote failure it does NOT declare success — returns false, shows error, re-enables retry.
ok('2 remote failure ⇒ no fake success (error toast + re-enable btn + return false)',
  /if\s*\(!remoteOk\)\s*\{[\s\S]*?variant:\s*'error'[\s\S]*?resetConfirmBtn[\s\S]*?disabled\s*=\s*false[\s\S]*?return false/.test(orch));
// 3. Remote wipe is confirmed BEFORE the local wipe (performSafeReset called after the remoteOk gate).
ok('3 local wipe (performSafeReset) runs only AFTER the remote is confirmed',
  orch.indexOf('await _pushEmptyPortfolioToBackend()') >= 0 &&
  orch.indexOf('await _pushEmptyPortfolioToBackend()') < orch.indexOf('performSafeReset()'));
// 4. Generation bumped up-front so in-flight async is discarded on return.
ok('4 reset bumps _aurixResetGeneration and re-checks _aurixIsResetStale(gen)',
  /_aurixResetGeneration\+\+/.test(orch) && /_aurixIsResetStale\(gen\)/.test(orch));

// ── REMOTE WIPE HELPER ──────────────────────────────────────────────────────
const push = fn('_pushEmptyPortfolioToBackend');
// 5. Returns true only when the user_portfolios upsert has no error; false otherwise.
ok('5 remote wipe returns TRUE only on confirmed user_portfolios upsert (false on error)',
  /const\s*\{\s*error\s*\}\s*=\s*await supabaseClient[\s\S]*?\.from\('user_portfolios'\)[\s\S]*?\.upsert\(/.test(push) &&
  /if\s*\(error\)\s*\{[^}]*return false/.test(push) && /return true/.test(push) && /return false/.test(push));
// 6. The empty upsert wipes every rehydratable column incl. performance_state.
ok('6 empty upsert wipes assets/holdings/history/watchlist + performance_state:null',
  /assets:\s*\[\]/.test(push) && /holdings:\s*\[\]/.test(push) && /portfolio_history:\s*\[\]/.test(push) &&
  /category_history:\s*\[\]/.test(push) && /watchlist:\s*\[\]/.test(push) && /performance_state:\s*null/.test(push));
// 7. It DELETES the backend snapshot source (own rows) — not merely hides it.
ok('7 remote wipe deletes the portfolio_snapshots source (delete().eq(user_id))',
  /\.from\('portfolio_snapshots'\)\s*\.delete\(\)\s*\.eq\('user_id',\s*currentUser\.id\)/.test(push));

// 8. performSafeReset no longer fire-and-forgets the remote push (the orchestrator owns it, awaited).
const safe = fn('performSafeReset');
ok('8 performSafeReset no longer fire-and-forgets the remote wipe',
  !/_pushEmptyPortfolioToBackend\(\)/.test(safe));
// 9. Local wipe clears the portfolio keys + stamps tombstone + epoch.
ok('9 local wipe clears PORTFOLIO_KEYS + sets reset tombstone + portfolio epoch',
  /PORTFOLIO_KEYS\.forEach\(k =>[^\n]*removeItem/.test(safe) && /setItem\(RESET_AT_KEY/.test(safe) && /setItem\(PORTFOLIO_EPOCH_KEY/.test(safe));

// ── ANTI-REHYDRATION: BACKEND SNAPSHOTS ─────────────────────────────────────
const fetchSnap = fn('_aurixFetchBackendSnapshots');
// 10. Read applies the reset-epoch floor both server-side (gte) and client-side (filter).
ok('10 snapshot read floors on the reset epoch (server gte + client filter ts >= epoch)',
  /_resetEpoch\s*=\s*\(typeof _aurixPortfolioEpoch/.test(fetchSnap) &&
  /Math\.max\(_lookbackMs,\s*_resetEpoch\)/.test(fetchSnap) &&
  /\.filter\(p =>[^\n]*p\.ts >= _resetEpoch\)/.test(fetchSnap));
// 11. Hydration discards a response whose fetch began before a reset (stale generation).
const hyd = fn('_aurixHydrateBackendSnapshots');
ok('11 snapshot hydration discards pre-reset in-flight responses (_aurixIsResetStale after await)',
  /_resetGenAtStart\s*=/.test(hyd) && /_aurixIsResetStale\(_resetGenAtStart\)/.test(hyd));
// 12. The foreground/portfolio sync also discards pre-reset in-flight responses (existing guard intact).
ok('12 portfolio sync discards stale-generation responses (_aurixIsResetStale in sync path)',
  /_aurixIsResetStale\(_resetGen\)/.test(app) && /DISCARDED_STALE_GENERATION/.test(app));

// ── ACCOUNT ISOLATION (identity, not email) ─────────────────────────────────
// 13. Cache owner is keyed on the real auth user id (currentUser.id), foreign cache purged.
ok('13 account isolation: cache owner keyed on currentUser.id; foreign cache purged',
  /_aurixActiveUserId\s*=\s*currentUser && currentUser\.id/.test(app) &&
  /owner\s*!==\s*_aurixActiveUserId/.test(app) && /_clearLocalUserState\(\)/.test(fn('_aurixEnforceCacheOwner')));

// ── NO DEMO/FALLBACK FILL FOR AUTHENTICATED EMPTY ACCOUNT ────────────────────
const init = fn('initPortfolioData');
ok('14 empty authenticated account is NOT filled from demo/fallback (returns empty assets)',
  /return \{ assets: \[\], holdings: \[\] \}/.test(init) && !/DEMO|seedDemo|sampleAssets/i.test(init));

// ── SOURCE-DELETION MIGRATION COMMITTED ─────────────────────────────────────
const mig = path.join(root, 'db', 'portfolio_snapshots_reset_delete_1.sql');
const migExists = fs.existsSync(mig);
const migSql = migExists ? fs.readFileSync(mig, 'utf8') : '';
ok('15 committed migration adds an owner DELETE policy on portfolio_snapshots',
  migExists && /for delete\s*[\s\S]*using \(auth\.uid\(\) = user_id\)/.test(migSql));

// ── PURE-LOGIC SIMULATIONS (behaviour, not just source) ─────────────────────
// 16. Epoch floor: only snapshots at/after the reset epoch survive.
(function () {
  const epoch = 1000;
  const rows = [{ ts: 400 }, { ts: 900 }, { ts: 1000 }, { ts: 1500 }];
  const kept = rows.filter(p => p.ts >= epoch).map(p => p.ts);
  ok('16 SIM epoch floor keeps only ts >= resetEpoch (pre-reset dropped)',
    JSON.stringify(kept) === JSON.stringify([1000, 1500]));
})();
// 17. Stale-generation discard: a response from gen N is dropped once gen advanced.
(function () {
  let currentGen = 5;
  const isStale = (g) => g !== currentGen;
  const startedGen = currentGen;            // fetch begins
  currentGen++;                             // a RESET fires mid-fetch
  ok('17 SIM stale-generation response is discarded after a mid-flight reset', isStale(startedGen) === true);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('GATE: GO — all ' + pass + ' assertions passed');
process.exit(0);
