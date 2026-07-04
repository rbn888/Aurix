# AURIX — Backend Snapshot Architecture (PLAN ONLY — not implemented)

**Status:** design plan produced under `DSH.CHART.INSTITUTIONAL.DATA-TRUTH.01` Phase 6.
**NOT implemented in this commit.** Do not build until explicitly requested. The DATA-TRUTH runtime
change was frontend truth/segmentation only.

## Why
The confirmed root cause of the repeated long-range geometry is `GENUINELY_SHORT` history: the remote
`category_history` spans only ~5 days because snapshots are captured **only while the app is open**.
7D/30D/1Y/ALL therefore draw the same ~5-day series. Frontend honesty (TRUTHFUL_RANGES.01 +
DATA-TRUTH.01) now *labels/segments* this truthfully, but real long-range charts need real long-range
data — a backend capture that runs while the app is closed.

## Proposed design (for a future SPEC)
1. **Scheduled capture (app-closed):** a server-side cron (Supabase scheduled Edge Function / pg_cron)
   computes each user's investable value on a fixed cadence and appends to `category_history`.
   - Cadence: crypto-heavy portfolios 24/7 (e.g. hourly); equities/funds only during/after market hours.
2. **Retention policy:** keep full-resolution recent (e.g. 30d), then downsample older to daily/weekly;
   cap total rows; never delete the construction baseline anchor.
3. **Backfill strategy:** one-time backfill from existing transactions + known price history where
   available; mark backfilled points `confidence:'reconstructed'` (never `real`).
4. **Confidence flags per snapshot:** `real` (live app), `scheduled` (server capture), `reconstructed`
   (backfilled), `stale_price` (market closed / last-known price). The chart renders `reconstructed`/
   `stale_price` runs with the low-confidence (segmented) treatment, not premium cubic.
5. **Market-open / closed behaviour:**
   - Crypto: continuous 24/7 capture.
   - Equities/funds: capture during market hours; between sessions hold last close and flag `stale_price`
     (do NOT draw a moving line across a closed market as if it were live).
6. **Server = source of truth for history;** the client remains a cache + push buffer (unchanged auth /
   sync authority). No change to `_aurixHistorySourceForDisplay` semantics.

## Non-goals / guardrails for the future implementation
- Never fabricate market observations; reconstructed points must be flagged and rendered low-confidence.
- Do not change auth, valuation formulas, or the accepted mobile login flow.
- Must keep the dense 24H premium reference green and the DATA-TRUTH segmentation semantics.

## Interaction with the shipped frontend truth (DATA-TRUTH.01)
Once real long-range data exists:
- `coverageRatio` rises → `displayedRangeState` becomes `full` → TRUTHFUL_RANGES stops suppressing 7D/30D/1Y.
- Genuine long-range returns can display (subject to the same flow-neutral + trust gates).
- The capital-step + sparse-ramp segmentation continues to protect against deposits/gaps being drawn as
  market performance.
