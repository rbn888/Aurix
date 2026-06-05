# AURIX-DATA-001 — Historical snapshot contamination audit

- **Status:** OPEN · documentation only · **do NOT implement before launch**
- **Priority:** post-launch (data integrity debt)
- **Opened:** 2026-06-05
- **Related (display mitigation already shipped):** commit `71b4aa8`
  `fix(chart): prevent contaminated intraday series from rendering`
  (anti-divergence gate, 24H, display-only — does NOT clean the source)
- **Scope:** `categoryHistory` snapshots only. Does not touch Supabase sync,
  Market, or the chart render.

---

## 1. Problem statement

On 2026-06-05 the Dashboard 24H chart showed a false **-54.60%**: the investable
series sat at **~12.5k–18k €** for hours, then dropped vertically to the real
**~5.6k €**. The headline was `(5.6k − 12.5k) / 12.5k ≈ -54%`.

The chart reads investable wealth as `inv = total − real_estate` per
`categoryHistory` snapshot (`_investableSnapshotSource()`), filtered by the
investable epoch. The contaminated points are **POSTERIOR to the epoch**
(`AURIX_INVESTABLE_CHART_EPOCH = 1780604468000` = 2026-06-04T20:21:08Z), so the
baseline did not exclude them. The display gate now hides them; **this ticket is
about why they exist in the first place.**

---

## 2. What is already known (from code + git, no runtime data)

- **Only writer of `categoryHistory`:** `recordCategorySnapshot()` (app.js).
  Introduced in `a7663cd feat(charts): record category portfolio history
  snapshots`. It has **always** recorded a separate `real_estate` bucket →
  *the contamination is NOT a missing `real_estate` field.*
- **Investable interpretation** (`inv = total − real_estate`):
  `_investableSnapshotSource()`, introduced in
  `550f4ba feat(dashboard): main Dashboard = investable wealth (real estate out)`.
- **Visual epoch:** `cd774b8 feat(dashboard): investable chart visual baseline`.
- **Bucketing** (`_aurixCategoryBucket`): maps `asset.type` → bucket; a property
  is excluded from investable **only if `asset.type === 'real_estate'`**.
- **Second writer:** the remote merge `_mergeCategoryByTs(local, remote)` unions
  `categoryHistory` by `ts` on boot — a foreign/older remote row could inject
  entries.

**Implication:** `recordCategorySnapshot` itself is arithmetically correct. The
inflated investable value therefore comes from the *portfolio state at capture
time*, not from a snapshot-generation bug — unless one of H2–H4 below holds.

---

## 3. Hypotheses (ranked, to confirm with runtime data)

- **H1 — Asset removal / test-data cleanup (most likely).** The user genuinely
  held ~12–18k of NON-real-estate (investable) assets after the epoch, recorded
  honest snapshots, then deleted/sold them (test cleanup) down to ~5.6k. History
  is immutable (correctly), so the pre-deletion value persists in the 24h window.
  → Not a bug; it is a *value discontinuity from a contribution/withdrawal* that
  the snapshot chart shows as "performance". PCE accounts for flows; the snapshot
  series does not.
- **H2 — Mis-typed real-estate asset.** A property stored with `type` ≠
  `'real_estate'` (e.g. `other`/`stock`) would land outside the `real_estate`
  bucket → counted as investable → inflated `inv`. Later corrected/removed.
- **H3 — Transient bad valuation.** A wrong price / wrong `assetCurrency` / FX
  glitch inflated `assetValueUSD(a)` for some captures (there is precedent: the
  chart code references a "fictitious ~1M spike"). Inflates `total` → `inv`.
- **H4 — Remote merge of foreign state.** `_mergeCategoryByTs` adopted
  `category_history` rows from a different/older account state into the window.

---

## 4. What this ticket NEEDS (requires runtime / Supabase data — not available statically)

> Run these read-only probes when picking up the ticket. They answer items 1, 3
> and 4 of the request. Nothing here mutates data.

### 4.1 — Timeline + count of contaminated snapshots (browser console, logged-in device)
```js
// Investable value per categoryHistory point, vs the current live value.
const liveUSD = investableValueUSD();
const rows = (categoryHistory||[]).map(p => ({
  when: new Date(p.ts).toISOString(),
  total: p.total, real_estate: p.real_estate,
  inv: Number(p.total) - Number(p.real_estate||0),
  ratio: +(((Number(p.total)-Number(p.real_estate||0))/liveUSD)).toFixed(2),
}));
const bad = rows.filter(r => r.ratio > 1.5 || r.ratio < 0.6);
console.table(bad);                       // → item 1 (exact timestamps) + item 4 (count)
console.log('contaminated:', bad.length, 'of', rows.length, '| firstBad:', bad[0], '| lastBad:', bad[bad.length-1]);
```
- **First/last `when` in `bad`** → the exact regime-change window (item 1).
- **`bad.length`** → item 4.
- Inspect a `bad` row's per-bucket fields (`crypto/stock/etf/...`) to tell H1/H2
  apart: if a non-RE bucket carries the ~12–18k, it was investable assets later
  removed (H1) or a mis-typed property (H2); if `real_estate` is 0 while it should
  not be, suspect H2.

### 4.2 — Cross-check Supabase (SQL editor)
```sql
select jsonb_array_length(category_history) as n_points,
       (category_history #>> '{0,ts}')                    as first_ts,
       (category_history #>> '{-1,ts}')                   as last_ts
  from public.user_portfolios where user_id = '<uid>';
-- then inspect the high-value entries to confirm they originate locally vs remote
```

### 4.3 — Pin the originating commit (item 3)
- Snapshot mechanism: `a7663cd`. Investable interpretation: `550f4ba`.
- If H2/H3: `git log -S "_aurixCategoryBucket" -- app.js` and the asset
  valuation/currency commits around the contaminated timestamps; cross-reference
  `bad[0].when` with `git log --until=<that date>`.

---

## 5. Cleanup plan (post-launch — non-destructive, reversible, with backup)

**Principles:** never delete valid history; always back up before any write;
prefer display-time exclusion over storage mutation; everything reversible.

1. **(Shipped, keep)** Display-time anti-divergence gate (`71b4aa8`) — already
   prevents the false render for 24H. Verify it still covers the audited cases.
2. **Option A — Re-baseline the investable epoch (cheapest, reversible).**
   `window.__aurixRebaselineInvestable(<ts just after the last bad point>)` sets
   `aurix_investable_chart_epoch`. Excludes the contaminated window from ALL
   ranges without touching data. Trade-off: also drops legitimate investable
   history before that ts. Revert: `localStorage.removeItem('aurix_investable_chart_epoch')`.
3. **Option B — One-time guarded prune (only if H2/H3 confirmed = truly corrupt).**
   - Back up first: copy `categoryHistory` (localStorage + Supabase row) to a
     dated key / export.
   - Remove ONLY entries proven corrupt (e.g. mis-typed RE, NaN/Inf, impossible
     single-step jumps), never entries that are merely "high but real" (H1).
   - Re-persist + re-sync; keep the backup until verified.
4. **Option C — If H1 (real removals): do nothing to data.** It is honest
   history. Instead, route the Dashboard chart through PCE (flow-aware) so a
   contribution/withdrawal is not shown as performance. (Bigger change — own
   ticket.)
5. **Prevention:** add a capture-time guard in `recordCategorySnapshot` that
   refuses to persist a point whose `total`/bucket is non-finite or diverges
   absurdly from the previous point within seconds (corruption, not a real move).
   Design it to never reject legitimate large moves; log + skip only the
   impossible. (Implement post-launch, behind verification.)

---

## 6. Out of scope / do not do now
- No data deletion, no Supabase writes, no epoch change in production yet.
- No code changes — this ticket is documentation + a runbook only.
- Revisit after launch; current priority is mobile/web sync, then Market.
