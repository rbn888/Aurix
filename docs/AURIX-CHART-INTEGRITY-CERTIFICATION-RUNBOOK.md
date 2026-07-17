# AURIX Chart-Engine Integrity — Certification Runbook (LB-1/2/3)

Operator procedure for the certification steps that require production/staging credentials, a running app,
or real elapsed time — none of which are executable in the automated build environment. Branch
`repair/chart-integrity-lb123` (commits `e1392f8`, `1ec1f9d`). **Do not deploy production** until the final
GO checklist (§6) is fully satisfied.

Security: pass Supabase creds via env only. Never paste the service-role key on a command line that enters
shell history — use a sourced, git-ignored env file or a secret manager. The service-role key is server-side
only; never expose it to browser code. All probes here are read-only.

---

## 1. Backend verification (closes the operational half of LB-3)

### 1a. Health probe (read-only)
```bash
set +o history                 # avoid history capture
export SUPABASE_URL='https://<project>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<server-side key>'   # or source a git-ignored .env.local
node scripts/aurix-backend-health.mjs --json
set -o history
```
Record (UTC): project ref, timestamp, status, latest snapshot ts, age, cadence, exit code.
**Only `HEALTHY` (exit 0) closes LB-3 operationally.** `LATE`=investigate cadence; `STALE`=cron dead/behind;
`UNAVAILABLE`/`UNAUTHORIZED`=fix before app code; `UNKNOWN`/no rows=pre-activation or empty.

### 1b. Independent evidence (Supabase SQL editor — read-only). Verify the probe, don't trust the summary.
```sql
-- cadence + gaps over 7d for one safe/aggregated user (replace :uid)
with s as (
  select ts, total_value_usd,
         lag(ts) over (order by ts) as prev_ts
  from portfolio_snapshots
  where user_id = :uid and ts > now() - interval '7 days'
)
select count(*)                                             as rows,
       count(distinct ts)                                  as distinct_ts,
       min(ts) as first_ts, max(ts) as last_ts,
       percentile_cont(0.5) within group (order by extract(epoch from ts-prev_ts)) as median_gap_s,
       percentile_cont(0.95) within group (order by extract(epoch from ts-prev_ts)) as p95_gap_s,
       max(extract(epoch from ts-prev_ts))                 as max_gap_s,
       count(*) filter (where ts-prev_ts > interval '30 min') as gaps_gt_30m,
       count(*) filter (where total_value_usd is null or total_value_usd <= 0
                          or total_value_usd = 'NaN'::numeric) as invalid_totals
from s;

-- scheduler health
select jobname, schedule, active from cron.job where jobname like 'aurix-portfolio-snapshot%';
select status, count(*), max(start_time) from cron.job_run_details
  where start_time > now() - interval '24 hours' group by status;

-- proof snapshots advance while the app is closed: rows exist in an interval with no client activity
-- (compare a known overnight window to auth/session logs).
```
Confirm: job `active=true`, `*/15` cadence, `job_run_details` mostly `succeeded`, `invalid_totals = 0`,
`gaps_gt_30m` explained, snapshots present during a closed-app interval.

### 1c. Backend cannot persist partial totals
The Edge Function skips unpriced holdings (`unpriced_asset_count`), so a partial day can write a low total.
**Required backend follow-up (server-side, mirrors LB-1):** the Edge Function should skip the INSERT when
`unpriced_asset_count > 0` (or mark `confidence='partial'` and have the client merge treat it as non-endpoint).
Track as an OPEN backend task until deployed + verified via a DRY_RUN row report.

---

## 2. RLS / security verification
```sql
-- as an authenticated non-owner (anon+JWT), this must return 0 rows:
select count(*) from portfolio_snapshots where user_id <> auth.uid();
-- there must be NO client insert/update/delete policy (writes are service-role only):
select cmd, roles from pg_policies where tablename = 'portfolio_snapshots';
```

---

## 3. Automated certification (already green here; re-run from a clean checkout)
```bash
git checkout repair/chart-integrity-lb123 && git status --porcelain   # clean (ignore supabase/.temp)
node --check app.js
node scripts/aurix-ci-gate.mjs        # full suite, P0 first, fail-closed → expect GO 170/170 exit 0
```
Real CI: the gate runs in GitHub Actions via the `gate` job (`.github/workflows/pages.yml`); `deploy`
`needs: gate`. To exercise the gate in Actions WITHOUT deploying, run it on a branch/PR (deploy triggers only
on push to `main`). Prove fail-closed: temporarily add a failing harness on a throwaway branch, confirm the
gate job goes red and `deploy` is skipped, then delete it. (Local fail-closed proof: see §5 evidence.)

---

## 4. Staging scenario matrix (deploy to STAGING only)
Controlled mixed portfolio: cash + crypto + equity + ≥1 FX + zero-qty holding + deposit + withdrawal.
Precompute expected value and flow-neutral returns independently. For each row capture UTC times, build/commit,
device, hydrationState, valuationComplete, backendHealth, FE/BE/merged counts, snapshot accepted/rejected,
readiness state, displayed vs expected return, screenshot, pass/fail.

| # | Scenario | Pass criteria |
|---|---|---|
| 1–5 | cold start, warm reload, range switch ×5, desktop+mobile, tooltip/%/$ consistency | badge=$=tooltip agree; one value per generation |
| 6–9 | delay a price / unprice a holding / delay FX / restore | **no incomplete snapshot persisted; no false %; safe state; one valid endpoint after recovery** (LB-1) |
| 10–12 | delay hydration / make local≠merged / complete hydration | **no confirmed % before reconcile; explicit Calculando/Reconstruyendo; one atomic publish; badge=tooltip agree** (LB-2) |
| 13–19 | bg/fg ×N, focus+visibility+online together, mobile lock, reopen 1h/8h, hard reload, offline→online | one reconcile per generation; no dup snapshots; no stale overwrite; backend fills closed interval when healthy |
| 20–21 | simulate stale/unavailable backend, then restore | health STALE/UNAVAILABLE; no fabricated continuity; safe state; bounded retry; recovers |

Verify LB-2 tooltip fix directly: during scenario 10 (hydration delayed), hover the line — the per-point %
must be withheld (`—` desktop / no chip mobile) while value+date still show; after hydration it returns.

Inspect console/network: no errors, no duplicate requests/loops, no balances/tokens logged.

---

## 5. Accelerated soak (≥24h, ≥1 overnight closed transition; prefer 48h/2 nights)
Monitor continuously: latest snapshot age, cadence, rejected-incomplete count, hydration duration,
reconciliation failures, readiness, generation mismatches, return publications, desktop/mobile divergence,
gaps-while-healthy. Success = 0 incomplete accepted, 0 false returns, 0 premature publishes, 0 generation
mismatches, 0 dup lifecycle snapshots, no gap while healthy, safe degradation while unhealthy, all ranges
consistent, no P0 console/server errors. Any financial-integrity failure resets the clock after the fix.

Local fail-closed proof of the gate (do NOT commit): add a throwaway `docs/ZZZ-FAIL-harness.js` that prints
`1 failed` and `process.exit(1)`; run `node scripts/aurix-ci-gate.mjs` → expect `NO-GO`, exit 1; delete it.

---

## 6. GO checklist (all must be true — else NO-GO)
- [ ] LB-1 code-closed **and** staging-verified (scenarios 6–9)
- [ ] LB-2 code-closed **and** staging-verified (scenarios 10–12 incl. tooltip)
- [ ] LB-3 backend probe **HEALTHY** + safe degradation tested (scenarios 20–21)
- [ ] backend Edge Function cannot persist partial totals (§1c deployed+verified)
- [ ] full suite + real CI gate green
- [ ] every financial consumer uses the same ready generation
- [ ] full staging matrix passed
- [ ] ≥1 real overnight soak transition passed
- [ ] rollback + monitoring ready (§7)
- [ ] no unresolved P0 / high-risk defect

## 7. Rollback package
- Pre-repair prod commit: `24f4726` (v558). Repair: `e1392f8`, `1ec1f9d`.
- Code rollback: `git revert 1ec1f9d e1392f8` (or never merge the branch to `main`).
- Runtime fallbacks (no revert): `_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED=false` (stop blocking on failed hydration);
  `_AURIX_BACKEND_SNAPSHOTS_ENABLED=false` (readiness gate becomes inert; reverts to frontend-only merge NO-OP).
- No DB migration performed by this repair ⇒ no DB rollback needed (the §1c backend follow-up, when done, needs its own migration + dry-run + row report).
- Immediate rollback triggers: any incomplete snapshot accepted; any false/unexplained return; a % visible
  before readiness; health falsely HEALTHY; persistent badge/tooltip disagreement; desktop/mobile divergence;
  red P0 CI gate; missing overnight continuity while backend healthy; sensitive data in logs.
