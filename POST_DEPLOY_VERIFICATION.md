# POST-DEPLOY VERIFICATION — Chart Integrity (LB-1/2/3)

> Run against **production** `ozcasyufbknnuemllwso` (reads only; the one write path is the existing cron).
> Use a server-side key from env only; never paste it inline. `<prod-svc>` = production service-role key.

## §baseline — capture BEFORE deploy (for comparison)
```sql
-- prod snapshot state pre-deploy
select count(*) rows, count(*) filter (where total_value_usd is null or total_value_usd<=0) bad,
       max(ts) last from portfolio_snapshots;
select d.status, count(*) n, max(d.end_time) last
  from cron.job_run_details d join cron.job j on j.jobid=d.jobid
  where j.jobname='aurix-portfolio-snapshot' group by d.status;
```

## 1. Snapshot integrity (T+15m, T+1h, T+24h)
```sql
-- must be bad=0 and growing total; no NaN/null/<=0 ever
select count(*) total,
       count(*) filter (where total_value_usd is null or total_value_usd<=0 or total_value_usd='NaN'::numeric) bad,
       min(ts) first, max(ts) last
from portfolio_snapshots where ts > now() - interval '25 hours';

-- no duplicates per user/minute (expect max=1)
select coalesce(max(c),0) max_dupe from
  (select user_id, floor(extract(epoch from ts)/60) mb, count(*) c
   from portfolio_snapshots group by 1,2) x;

-- continuity: max gap between consecutive snapshots per active user (expect no large unexplained gap)
select user_id, round(max(g)::numeric,1) max_gap_min from
  (select user_id, extract(epoch from (ts - lag(ts) over (partition by user_id order by ts)))/60 g
   from portfolio_snapshots where ts > now()-interval '25 hours') s
  where g is not null group by user_id order by max_gap_min desc limit 5;
```

## 2. Cron verification
```sql
-- all runs since deploy succeeded; failed=0
select d.status, count(*) n, min(d.start_time) first, max(d.end_time) last
  from cron.job_run_details d join cron.job j on j.jobid=d.jobid
  where j.jobname='aurix-portfolio-snapshot' and d.start_time > now()-interval '25 hours'
  group by d.status;
-- job still active
select jobname, schedule, active from cron.job where jobname like 'aurix-portfolio-snapshot%';
```

## 3. Health commands
```bash
SUPABASE_URL=https://ozcasyufbknnuemllwso.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<prod-svc> \
node scripts/aurix-backend-health.mjs --json      # expect HEALTHY (exit 0) at T+15m/1h/6h/24h
```
In the live app console: `window.aurixBackendHealth()` → HEALTHY (or EMPTY_NEW_USER for a brand-new account).

## 4. Edge Function guard (server-side LB-1)
- Optional pre-deploy canary: set `DRY_RUN=1`, invoke once, confirm response carries `dropped_asset_count`/`incompleteRej`, then unset.
- Post-deploy: a portfolio with an unpriced/orphan/invalid holding must yield **0 new rows** for that user and increment `incompleteRej`; complete users unaffected (`inserted`>0, `errored=0`).
- Observability (browser): `window.__AURIX_INTEGRITY_EVENTS__` shows only reason codes/counts (no balances/symbols).

## 5. Frontend checks (desktop + mobile, real accounts + a test account)
- [ ] Cold start: no numeric return before readiness; safe state ("Calculando…"/"Historial parcial") when not ready.
- [ ] Complete account with ≥24h history: 24H publishes a correct % (reconciles with value); longer ranges publish or honestly show partial.
- [ ] Backend unavailable (throttle/offline): badge → "Calculando…" + explicit safe state, never a stale number.
- [ ] Badge = monetary = tooltip agree (one generation); desktop == mobile.
- [ ] Hard reload / range switch (24H/7D/30D/1Y/ALL): consistent.

## 6. User validation
- [ ] Spot-check 2–3 real accounts: displayed return reconciles with (endpoint − baseline − netFlows)/baseline; no false −X% on cold morning open.
- [ ] Overnight: reopen next morning → history continuous (backend filled the closed interval); no discontinuity, no fabricated return.

## Accept ⇢ only when
bad=0, dupes=0, cron failed=0, HEALTHY sustained ≥24h, no premature/false return observed, desktop==mobile, no rollback trigger.
