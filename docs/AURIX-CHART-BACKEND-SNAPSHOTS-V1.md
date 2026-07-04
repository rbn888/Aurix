# AURIX — Backend Snapshots V1 (DSH.CHART.BACKEND-SNAPSHOTS.V1.01)

**Status:** design + SAFE frontend half shipped (read-only merge behind flag, NO-OP until activation).
**Scheduler NOT deployed** — it needs a service-role secret + a price source (Fase 6 STOP).

## Fase 1 — Current data audit
| Item | Reality (from code) |
|---|---|
| History store | Single **`user_portfolios`** row per user (keyed `user_id`). |
| History columns | `category_history` (jsonb array), `portfolio_history` (jsonb array), `performance_state` (jsonb). |
| Write strategy | **Last-writer-wins full-row `upsert`** (`onConflict: user_id`, app.js ~1665). `performance_state` via a decoupled `UPDATE … eq(user_id)` (needs an RLS UPDATE policy — known). |
| Point shape | `{ ts, total, real_estate, … }` — `total` = portfolio total USD, `real_estate` = real-estate USD. |
| Chart value | **investable = `toBase(total − real_estate)`** (`_aurixHpqRawStages`). |
| Frontend cadence | category snapshot appended ~every 5 s while app is **open**; 365-day local retention. |
| Display source | `_aurixHistorySourceForDisplay()` → authed: normalized remote `category_history` (`_aurixCanonicalCatHistory`); anon: local `categoryHistory`. |
| Price sources | serverless `api/prices` (+ `services/prices.js`, `services/portfolio-price-layer.js`). A **server-side price path already exists** for the scheduler to reuse. |
| Root cause | snapshots only while app open ⇒ history `GENUINELY_SHORT` ⇒ 7D/30D/1Y collapse. |

**Risk that drives the design:** the last-writer-wins full-row upsert means a backend writer appending to
`category_history` would be **clobbered** by the next frontend flush. ⇒ backend MUST use a separate store.

## Fase 2 — Chosen design
**New table `portfolio_snapshots`** (see `db/portfolio_snapshots_1.sql`, not yet applied), append-only,
service-role INSERT, users SELECT own. Columns: `user_id, ts, total_value_usd, real_estate,
category_values, asset_count, source='backend_snapshot', confidence, market_state, price_staleness,
schema_version`. Hard no-duplicate floor: unique `(user_id, minute-bucket)`.

**Merge (frontend, read-only):** `_aurixMergeSnapshotSources(frontend, backend)` in app.js —
- frontend (dense, authoritative) ∪ backend (gap-filler), sorted by ts;
- drop a backend point within 5 min **and** 0.2% value of a frontend point (frontend wins where dense);
- drop backend–backend near-duplicates; **invents no point**; deterministic; error ⇒ returns frontend untouched.
- Wired at the single chokepoint `_aurixHistorySourceForDisplay()` behind `_AURIX_BACKEND_SNAPSHOTS_ENABLED`.
  `_aurixBackendSnapshots` is **empty** until the table read is wired at activation ⇒ today a strict NO-OP
  (chart byte-identical; 24H premium untouched). 30D/1Y stay `partial_history` until coverage ≥ 0.8, then
  become `full` automatically (existing TRUTHFUL_RANGES logic).

## Fase 3 — Scheduler (recommended: Supabase Edge Function + `pg_cron`)
Chosen over a GitHub Action cron because the service-role key lives in the Supabase env (never in this
public Pages repo / GitHub secrets), and it is co-located with the DB and the existing price path.

- **Cadence:** every 15 min. Crypto captured 24/7 (`market_state:'crypto_24_7'`). Equities/funds: during
  market hours `price_staleness:'live'`; when closed, hold last close and mark `price_staleness:'last_close'`,
  `market_state:'closed'` (do NOT draw a moving line across a closed market — the frontend renders
  non-`live` runs low-confidence via the existing segmentation).
- **Per user:** service-role reads holdings, values each via the existing price path (USD), computes
  `total_value_usd` + `category_values` + `real_estate`, and INSERTs — skipping if a value/time
  near-duplicate already exists (plus the minute-bucket unique index as a hard floor).
- **No secret in frontend; service-role never exposed.**

### Edge Function skeleton (reference — NOT deployed)
```ts
// supabase/functions/portfolio-snapshot/index.ts  — deploy manually at activation
// Deno + supabase-js with SERVICE_ROLE (env). Scheduled via pg_cron / dashboard schedule.
import { createClient } from 'jsr:@supabase/supabase-js@2'
Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rows } = await admin.from('user_portfolios').select('user_id, assets, holdings')
  const now = new Date().toISOString()
  for (const r of rows ?? []) {
    const v = await computeUserValueUSD(r)            // TODO: reuse api/prices valuation; mirror investable math
    if (!v || !Number.isFinite(v.total)) continue
    if (await nearDuplicateExists(admin, r.user_id, v.total)) continue   // value/time near-dup guard
    await admin.from('portfolio_snapshots').insert({
      user_id: r.user_id, ts: now, total_value_usd: v.total, real_estate: v.realEstate,
      category_values: v.categories, asset_count: v.count, source: 'backend_snapshot',
      confidence: 'scheduled', market_state: v.marketState, price_staleness: v.staleness, schema_version: 1,
    })
  }
  return new Response('ok')
})
```

## Fase 4 — What shipped this turn (SAFE, frontend only)
- `_AURIX_BACKEND_SNAPSHOTS_ENABLED` + `_aurixMergeSnapshotSources` + `_aurixNormalizeBackendSnapshot`,
  wired NO-OP into `_aurixHistorySourceForDisplay`.
- `window.aurixSnapshotSourceAudit()` / `window.aurixSnapshotMergeDebug()` (read-only diagnostics).
- `db/portfolio_snapshots_1.sql` (migration, **not applied**).
- NO change to auth, valuation formulas, renderer, UI, cards/donut/market, Pages workflow, or the
  frontend write path. app.js diagnostics/merge only.

## Fase 6 — To ACTIVATE the real cron (needs confirmation)
1. Apply `db/portfolio_snapshots_1.sql` in the Supabase SQL editor.
2. Provide/confirm a **service-role** capture path:
   - `SUPABASE_SERVICE_ROLE_KEY` available to the Edge Function env (Supabase dashboard secret).
   - a server valuation+price path (reuse `api/prices`) to compute per-user USD value server-side.
3. Deploy the Edge Function + schedule it (pg_cron / dashboard) every 15 min.
4. Wire the frontend read: fetch the current user's `portfolio_snapshots` (read-only, RLS-safe) into
   `_aurixBackendSnapshots` on the existing reconcile path (one isolated `select`, no auth/sync-write change).
5. Verify with `aurixSnapshotSourceAudit()` / `aurixSnapshotMergeDebug()`; confirm 24H premium unchanged
   and long ranges gain real coverage.

**STOP:** steps 1–4 require DB migration + a service-role secret + a scheduler. Not performed here.
