# PRODUCTION ROLLOUT CHECKLIST — Chart Integrity (LB-1/2/3)

> Certified commit `4aa5553`. **Execute only under explicit deploy authorization.** Fail-closed at any ✗.
> Production Supabase `ozcasyufbknnuemllwso`. No DB migration required.

## 0. Pre-flight (must all pass)
- [ ] Deploy explicitly authorized (this is a controlled production rollout).
- [ ] On `repair/chart-integrity-lb123` @ `4aa5553`; working tree clean.
- [ ] `node scripts/aurix-ci-gate.mjs` → **GO 171/171, exit 0**.
- [ ] `git diff 24f4726..4aa5553 -- app.js | grep -c '_aurixComputePeriodReturn'` → **0** (return formula untouched).
- [ ] No secrets/prod-ref/service-role in any browser bundle: `grep -rE "service_role|eyJ[A-Za-z0-9_-]{30,}" index.html app.js` → none.
- [ ] Production backend healthy NOW: `SUPABASE_URL=https://ozcasyufbknnuemllwso.supabase.co SUPABASE_SERVICE_ROLE_KEY=<prod-svc> node scripts/aurix-backend-health.mjs --json` → `HEALTHY`.
- [ ] Rollback package reviewed (`ROLLBACK.md`); operator + comms window agreed.
- [ ] Snapshot of current prod state captured (see `POST_DEPLOY_VERIFICATION.md §baseline`).

## 1. Prepare the production commit (version bump ONLY — logic unchanged)
- [ ] Branch `release/chart-integrity-prod` off `main`; merge/cherry-pick `e1392f8 1ec1f9d 4aa5553` (skip nothing behavioral). *(1b998b1 runbook doc optional.)*
- [ ] Bump cache-bust: `AURIX_BUILD` in `index.html` + `version.json` `appjs` (all 4 version sources coherent).
- [ ] Re-run gate incl. `AURIX-CHART-ATOMIC-BUILD-COHERENCE-harness` → green.
- [ ] Confirm diff vs `main` = LB-1/2/3 + version strings only.

## 2. Deployment order (BACKEND FIRST — stop persisting partials before the client changes)
1. **Edge Function (server-side LB-1):**
   - [ ] `supabase functions deploy portfolio-snapshot --project-ref ozcasyufbknnuemllwso`
   - [ ] Read back version; confirm deployed. (Optional canary: `DRY_RUN=1` one cycle, inspect `incompleteRej`/`inserted`, then unset.)
2. **Scheduler:** no change (pg_cron already live in prod; guard lives in the function). Confirm job still `active`.
3. **Frontend (client LB-1/2/3):**
   - [ ] Merge `release/chart-integrity-prod` → `main` → GitHub Actions Pages deploy runs the **gate** job (must be green) then `deploy`.
   - [ ] Confirm the live bundle serves the new `AURIX_BUILD`.
4. **Database:** none (no migration).

## 3. Validation (immediately after each step) — see `POST_DEPLOY_VERIFICATION.md`
- [ ] Edge Function: next real/canary run → `errored=0`; any partial portfolio → `incompleteRej>0`, `inserted` unaffected for complete users.
- [ ] No partial/null/≤0 totals persisted post-deploy; no duplicates.
- [ ] Frontend: badge never shows a number before hydration ready; safe states render; a complete account with ≥24h history publishes a correct %.
- [ ] Desktop + mobile identical behavior.

## 4. Health verification
- [ ] `aurix-backend-health.mjs` (prod) → `HEALTHY` at T+15m, T+1h, T+6h.
- [ ] `window.aurixBackendHealth()` in the live app → HEALTHY/EMPTY_NEW_USER as appropriate.

## 5. Success criteria (all true ⇒ rollout accepted)
- [ ] 0 partial/incomplete snapshots accepted in prod post-deploy.
- [ ] 0 false/premature returns published (real users + a test account).
- [ ] Cron continues succeeding; continuity intact overnight.
- [ ] Badge / chart / tooltip / monetary agree (one generation).
- [ ] Health stays HEALTHY ≥ 24h.
- [ ] No P0 console/server errors; no rollback trigger hit.

## 6. Abort / rollback triggers → execute `ROLLBACK.md`
Any incomplete snapshot accepted · any false/unexplained return · a % before readiness · health falsely HEALTHY · badge/tooltip disagreement · desktop/mobile divergence · red gate · missing overnight continuity while healthy · sensitive data in logs.
