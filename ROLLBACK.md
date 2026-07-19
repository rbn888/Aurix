# ROLLBACK — Chart Integrity (LB-1/2/3)

> Exact recovery per surface. Pre-repair production baseline: **`24f4726` (v558)**.
> The repair performed **no database migration**, so there is nothing destructive to undo in the DB.
> Prefer the **runtime flag** fallbacks first (instant, no redeploy) before code reverts.

## Instant runtime fallbacks (no redeploy — try first)
- **LB-2 too aggressive** (badge stuck "Calculando…" for healthy users on a backend hiccup):
  set `_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED = false` (app.js) → publishes local-only on hydration `failed` instead of blocking. (Requires a frontend redeploy to take effect; it is a one-line flag, logic otherwise intact.)
- **Disable backend-merge/readiness entirely**: `_AURIX_BACKEND_SNAPSHOTS_ENABLED = false` → merge becomes NO-OP and the LB-2 hydration gate goes inert (reverts to frontend-only chart). Frontend redeploy.

## 1. Frontend (GitHub Pages)
- **Revert code:** `git revert 4aa5553 1ec1f9d e1392f8` on `main` (or `git revert <release-merge-commit>` if merged as one), bump `AURIX_BUILD`, push → Actions redeploys the prior UI. OR reset `main` to `24f4726` and redeploy (heavier).
- **Verify:** live bundle serves the reverted `AURIX_BUILD`; badge behavior = v558.

## 2. Edge Function (server-side LB-1)
- **Redeploy the previous version:** check out `24f4726` (or the last pre-repair function) and
  `supabase functions deploy portfolio-snapshot --project-ref ozcasyufbknnuemllwso`.
- Effect: removes the `dropped>0` skip guard (returns to prior behavior). **Note:** prior behavior could persist partial totals — only roll back the function if the guard itself is proven faulty; otherwise keep it (it is fail-safe: at worst it skips a cycle).
- **Verify:** next run `errored=0`; `supabase functions list --project-ref ozcasyufbknnuemllwso` shows the reverted deploy time.

## 3. Scheduler (pg_cron)
- The rollout does **not** change the scheduler; no rollback normally needed.
- If it must be paused: `select cron.unschedule('aurix-portfolio-snapshot');` (production SQL editor). Re-enable with the original `db/portfolio_snapshots_cron_1.sql` schedule. **Never** delete `job_run_details`/snapshots.

## 4. Database
- **No migration was applied ⇒ no schema rollback.**
- **Do NOT** delete/modify historical `portfolio_snapshots` rows as part of rollback.
- If the *pre-fix* production data contains historical partial rows (separate, still-open audit), that is handled by a **separate** dry-run remediation migration — **never** bundled with this rollback.

## Post-rollback verification (must pass before declaring rollback complete)
- [ ] `aurix-backend-health.mjs` (prod) → HEALTHY.
- [ ] Frontend loads; badge behaves as the rolled-back version; no console P0 errors.
- [ ] Next cron run `errored=0`; no duplicates.
- [ ] No data loss (snapshot count did not drop).

## Ownership
- Operator: <fill at rollout>. Comms: <fill>. Decision authority for abort: <fill>.
