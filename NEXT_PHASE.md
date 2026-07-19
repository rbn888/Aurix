# NEXT PHASE — PROJECT: Institutional Chart Quality

> **Priority: P0.** Builds on the certified Chart Integrity release (`4aa5553`). Same non-negotiables:
> absolute valuation correctness, never fabricate returns, flow-neutral formula stays authoritative.
> This is a *quality/continuity* project, not a correctness rewrite — correctness is already certified.

## Problem statement
The engine is financially correct but not yet visually institutional. Residual artifacts:
artificial vertical jumps, overnight/observation discontinuities, snapshot-to-snapshot valuation drift,
timestamp incoherence across assets, and visible live-price↔fallback transitions. The chart must read
like CoinMarketCap / institutional portfolio software while remaining truthful.

## Objectives (P0)
1. Eliminate artificial jumps (non-economic vertical steps).
2. Eliminate night/observation discontinuities (already mitigated by backend continuity; finish the visual side).
3. Investigate valuation consistency between consecutive snapshots (same inputs ⇒ same value).
4. Guarantee coherent timestamps across all assets within one snapshot (single valuation instant).
5. Analyze and smooth live-price ↔ stored-fallback transitions (no visible step when a price refreshes).
6. Redesign historical series generation for density + coherence.
7. Improve continuity across 24H / 7D / 30D / 1Y / ALL.
8. Benchmark against CoinMarketCap + institutional portfolio tools.
9. Preserve absolute valuation correctness; **never fabricate returns**; produce an institutional-grade chart.

## Architecture proposal
**A. Single-instant valuation snapshot (timestamp coherence).**
Value every holding at ONE captured price-set per snapshot (client and Edge Function already aim at this;
formalize a `valuationInstant` stamped on the snapshot; reject snapshots whose per-asset prices span >N seconds).
Extends the LB-1 completeness contract with a *coherence* dimension.

**B. Provenance-tagged points (live vs fallback).**
Persist per-point `price_staleness`/provenance (already present: `live|last_close|stale`). The renderer must
treat a live→fallback→live transition as the SAME regime (no vertical step) — smooth, not a cliff — while a
genuine capital step stays a hard break. Reuse the existing `_aurixRegimeBoundaryBreaks` split set; add a
"valuation-regime transition" that is bridged, not segmented.

**C. Continuity/densification layer (truthful).**
A read-only presentation layer over the canonical merged series that: (a) bridges same-regime observation
gaps visually without inventing points (draw a continuous stroke between real endpoints, marked as
interpolated for tooltips), (b) never bridges a real capital step or a regime boundary. Density target
per range (e.g. ≥1 pt / 15 min for 24H) sourced only from real frontend+backend points.

**D. Range-coherent windowing.**
One windowing owner (already `_aurixResolveFinalRenderSeriesContract`); ensure 24H/7D/30D/1Y/ALL derive
from the same canonical series with consistent baseline/endpoint selection and gap policy (range-invariant,
per the v553 SPEC) — extend to guarantee visual smoothness parity across ranges.

**E. Jump classifier.**
Deterministic classifier for every vertical delta: `economic_move | capital_flow | valuation_regime_transition
| artifact`. Only `capital_flow` is a hard break; `artifact` is quarantined/smoothed; `economic_move` is drawn;
`valuation_regime_transition` is bridged. Feeds both the line and the return-eligibility gate.

## Investigation plan (before any code)
1. **Forensic replay** of real production series (read-only) across all ranges; catalog every vertical delta
   and label its true cause (flow vs price-refresh vs artifact) using the ledger + provenance.
2. **Snapshot-consistency audit**: recompute value for a fixed portfolio at two adjacent snapshots with the
   same price-set; quantify drift; find non-deterministic inputs (FX rounding, gold purity, stale fallback mix).
3. **Timestamp coherence audit**: measure intra-snapshot price-timestamp spread per asset.
4. **Transition audit**: measure the visible step magnitude at each live↔fallback transition.
5. **Benchmark study**: capture CoinMarketCap / institutional chart behavior for the same shapes (gaps,
   weekends, market-closed, mixed crypto/equity) → define the target visual contract.
6. Produce a **quantified defect inventory** with severity + frequency.

## Implementation phases
- **P0.1 — Instrumentation & audits (read-only):** ship the forensic/consistency/coherence/transition audits
  as `window.aurix*` tools + harnesses. No behavior change. *(1 wk)*
- **P0.2 — Snapshot coherence:** single valuationInstant + per-asset price-timestamp spread guard (extend
  LB-1). Client + Edge Function. *(1 wk)*
- **P0.3 — Jump classifier:** deterministic delta classifier + harness matrix. *(1–1.5 wk)*
- **P0.4 — Continuity/densification renderer:** truthful bridge/smooth layer; range parity. *(1.5–2 wk)*
- **P0.5 — Transition smoothing:** live↔fallback treated as one regime. *(0.5–1 wk)*
- **P0.6 — Benchmark parity + certification:** cert harness comparing shapes to the institutional target;
  full staging soak. *(1 wk)*
Each phase: harness-first, full suite green, fail-closed gate, staging validation before the next.

## Acceptance criteria
- Zero artificial vertical jumps in any range (every remaining vertical is a proven `capital_flow` or `economic_move`).
- Zero night/observation discontinuities when backend health is good; explicit safe state when not.
- Snapshot-to-snapshot valuation drift = 0 for identical inputs (deterministic).
- Intra-snapshot price-timestamp spread ≤ threshold (e.g. ≤ 60 s) or snapshot rejected.
- No visible step at any live↔fallback transition (bridged, not a cliff).
- 24H/7D/30D/1Y/ALL visually smooth + consistent, all reconciling to the same canonical returns.
- Benchmarked "reads institutional" vs CoinMarketCap for ≥ the defined shape set.
- **Valuation correctness preserved; no fabricated returns** (regression suite from this release stays green).

## Risks
- Over-smoothing hides a real economic move or capital step → **mitigate:** classifier is conservative;
  bridging never crosses a proven boundary; tooltips mark interpolated segments.
- Densification tempts synthetic points → **hard rule:** never invent a data point; only stroke between real ones.
- Determinism regressions from FX/gold/fallback → covered by the snapshot-consistency harness.
- Scope creep into the (frozen, certified) correctness engine → keep quality layer read-only over canonical series.
- Benchmark subjectivity → convert to a concrete visual contract + fixtures.

## Estimated effort
~6–8 focused weeks total (P0.1→P0.6), harness-gated, staging-certified per phase. P0.1–P0.3 (audits +
coherence + classifier) are the high-leverage foundation (~3–4 wks); P0.4–P0.6 deliver the institutional finish.

## Dependencies / preconditions
- Chart Integrity release (`4aa5553`) in production and stable.
- Separate open item: production historical partial-row audit/remediation (do first or in parallel; read-only audit).
- CoinGecko/price-API stability for benchmark fidelity.
