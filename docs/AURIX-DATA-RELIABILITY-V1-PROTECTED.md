# AURIX Data Reliability — v1 (PROTECTED CONTRACTS)

**Checkpoint:** `aurix-data-reliability-v1` · backup branch `backup/aurix-data-reliability-v1`
**Stable commit base:** `v417-sync-trace-reset-propagation` (`app.js?v=417`)
**Status:** Founder-validated in real production (web↔mobile sync + user isolation). Suite 50/50.

This freezes the account / persistence / sync layer as a **protected contract set**. Identity,
isolation, durability and cross-device sync are now reliable. Do not change this layer except for
a **critical bug** (see Change policy).

---

## Authority model (the contract)

1. **Supabase `user_portfolios` = the single source of truth across devices.** Every read is
   scoped `.eq('user_id', userId)`; every write is `upsert({ user_id: currentUser.id, … })`. No
   query/write touches the table without the `user_id` filter.
2. **localStorage = local cache only**, never authority between devices. It is stamped with the
   owning user (`aurix_cache_owner`) and is ignored / purged when it belongs to a different user.
3. **Web and mobile converge** via boot load + foreground/focus/pageshow/online re-sync
   (`_aurixResyncFromRemote`). An add/buy on one device appears on the other after refresh/
   foreground; a reset propagates both directions.

## Frozen contracts — DO NOT MODIFY (except critical bug)

| Contract | Implementation (locked) |
|---|---|
| **Identity / isolation** | `aurix_cache_owner` stamp · `_aurixActiveUserId` · `_aurixCacheIsForeign` · `_aurixEnforceCacheOwner` (purge foreign cache on user switch) · `getPortfolioData` foreign-cache guard · meta/journal/owner in `PORTFOLIO_KEYS` (cleared on SIGNED_OUT/reset) |
| **Source of truth / scoping** | `loadPortfolioFromBackend` / `autoSaveToBackend` (always `user_id`-scoped) |
| **Cross-device sync** | `aurix_portfolio_meta { version(revision), updatedAt, syncedAt, deviceId }` · `_aurixPendingSync` · `_aurixMergePortfolio` (never blind overwrite) · `_aurixResyncFromRemote` (foreground/focus/pageshow/online) |
| **Reset propagation** | merge `remote-reset` (remote row empty + `updated_at > syncedAt`) vs `remote-unavailable` (null → keep local) · `remote-reset` destructive context · boot cache purge |
| **Destructive-save guard** | `assertNonDestructivePortfolioSave` · `_AURIX_DESTRUCTIVE_CONTEXTS` · `_AURIX_BLOCK_DESTRUCTIVE_SAVES` kill switch · `[DATA][SAVE_BLOCKED_DESTRUCTIVE]` |
| **Salvage (no silent loss)** | `_aurixSalvageHolding` · `convertFromNewToFlat` (no silent `filter(Boolean)`; logs `[DATA][RECOVERED]`) |
| **Append-only journal** | `aurix_portfolio_events` · `_aurixJournalAppend` (append-only; events carry userId/deviceId/revision/context) · `rebuildPortfolioFromEvents` · `_aurixRecoverFromJournalIfEmpty` |
| **Migration safety** | timestamped backup before write + count validation + restore-on-shrink |

### Invariants (verified by the suite)
1. **Isolation:** user B never reads/writes user A's cache; logout/login does not mix localStorage.
2. **Authority:** local cache is ignored when its owner ≠ active user; remote (scoped) wins as truth.
3. **No blind overwrite:** merge keeps the larger/newer set; a reduction needs an explicit
   destructive context (delete/sell/reset/edit-transaction/migration/remote-reset).
4. **No silent loss:** an orphaned holding is salvaged + logged, never dropped silently.
5. **Recoverable:** the portfolio can be rebuilt from the append-only journal.
6. **Reset propagation:** an authoritative empty remote (written after our sync) clears local; a
   failed/null remote never wipes local.

## Cross-device QA (founder-validated in production)
- Web add → mobile sees it (after refresh/foreground). ✓
- Mobile add → web sees it. ✓
- Reset web → mobile reflects reset. ✓
- Reset mobile → web reflects reset. ✓
- Same userId/email both devices; local stale never beats remote new. ✓

## Live diagnostic
`await window.aurixSyncTrace()` — read-only; reports userId/email, deviceId, local vs remote
revision/updatedAt/assetCount/symbols, pendingSync, last save/load status, last merge decision,
last applied source, last error, and a plain-language `verdict` naming any break point.

## Server-side requirement (OUTSIDE the repo)
The hard guarantee that one user cannot read/write another's row is **Supabase RLS**.
`user_portfolios` MUST have RLS enabled with `auth.uid() = user_id` policies for
SELECT/INSERT/UPDATE/DELETE. The client always scopes by `user_id`, but RLS is the enforcement.

## Verification
- Full suite: `for h in docs/*harness*.js; do node "$h"; done` — **50/50 PASS** at this checkpoint.
- Key harnesses: `AURIX-RELIABILITY-GATE`, `AURIX-SYNC-INTEGRITY`, `AURIX-DATA-INTEGRITY-LOCK`,
  `AURIX-DATA-JOURNAL`, `AURIX-ASSET-PERSISTENCE-GUARDRAIL`, `AURIX-ASSET-DOCTOR-RECOVERY`,
  `AURIX-BOOT-WATCHDOG`.

## Rollback
- Full restore: `git checkout aurix-data-reliability-v1` (or `git checkout backup/aurix-data-reliability-v1`).
- Per lever: `_AURIX_BLOCK_DESTRUCTIVE_SAVES=false` (disable destructive guard) ·
  `window.aurixResyncFromRemote('manual')` (force a pull) · revert individual commits
  (v417 sync-trace/reset → v416 isolation → v408 sync → v407 journal → v406 integrity-lock →
  v404 salvage).

## Change policy (post-checkpoint)
This layer (auth/identity, persistence, sync, merge, journal, isolation) is changed **only** for a
critical bug or an explicitly-approved evolution. Any change MUST keep all invariants, re-run the
full suite green, and create a new checkpoint tag (`aurix-data-reliability-v2`, …).
