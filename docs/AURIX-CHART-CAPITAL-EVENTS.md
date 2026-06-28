# AURIX Chart — Large Capital Injection Behavior (observation note)

**Status:** Observation / design note. **No code change.** Documentation only.
**Scope:** the institutional wealth chart (frozen renderer `aurix-renderer-v1`). Nothing here
modifies the renderer, data, sync, persistence, chart or UI.
**Date:** 2026-07-01 · related: [project_web_chart_rc1] (frozen renderer), AURIX-RETURN-UNIFY-1.

---

## What was observed

A large AAPL/BTC position was added that multiplied total wealth versus the prior portfolio. The
chart:
- **re-scaled the Y axis correctly** (no clipping, the curve stayed inside the plot box);
- **showed a structural level change** (a step up to the new wealth level);
- **did not produce an infinite/▌off-chart spike**;
- **did not break the renderer** (no overshoot, gap-split or marker-lock failure).

## Why the current behavior is correct (acceptable for Fase 1)

1. **The line plots absolute investable wealth.** A real, large buy genuinely raises total wealth,
   so a step up is an honest representation of the portfolio's value — not a bug.
2. **The Y scale is adaptive and bounded.** `computeAurixValueScale` maps the value domain into the
   plot box with a perceptual margin (`_AURIX_IR_VALUE_MARGIN`) and an optional legible-blend mode,
   so a 10× jump rescales the axis instead of escaping the chart. Point VALUES are never altered
   (the equivalence / last-point / max-min invariants of the frozen renderer hold).
3. **The vertical step is softened, not faked.** RC5-B vertical step softening eases the entry/exit
   of the near-vertical transition (`_aurixSoftenVerticalSteps`) without removing the real jump.
4. **The return metric already separates market from capital.** `_aurixRangeReturn` (the %/€
   performance indicator) is **flow-neutral**: it computes a Modified-Dietz-style return that
   neutralises capital flows (deposits/withdrawals/asset_add/asset_remove/import_baseline, captured
   via `_aurixCaptureFlow`). So a big buy does **not** read as a market gain in the % figure — only
   the absolute-value line shows the level change.

In short: **value line = honest absolute wealth (steps on big buys); % return = flow-neutral
market performance.** Both are already correct for Fase 1.

## Known limitation (conceptual)

The **absolute-wealth line** visually mixes two different things at the moment of a large flow:
1. **market variation** (price moves on existing holdings), and
2. **capital injection/withdrawal** (a big buy or sell changing the principal).

A viewer looking only at the line could misread a large buy's step-up as performance. The %
indicator already disambiguates this, but the line itself does not annotate *why* the level moved.

> Note: the render contract ALREADY emits the data needed to annotate this — `render
> AurixInstitutionalChart(...)` returns `eventMarkers` (`{ x, timestamp, type, amountUSD,
> visualPriority }`) derived from the captured capital flows. They are simply **not drawn yet**.

## Proposed future enhancement (NOT Fase 1)

Add discreet **capital-event markers** on the line, purely visual, consuming the existing
`eventMarkers` data:
- a small, unobtrusive dot/tick at large buys/contributions (and withdrawals);
- tooltip copy such as *"Compra AAPL · Entrada de capital"* / *"Entrada de capital"*;
- visually distinguish **market return** from **capital entry** at a glance (e.g. a subtle glyph
  + the existing flow-neutral % already shown);
- threshold-gated (`visualPriority` / amount vs prior wealth) so only *large* events annotate;
- **must not touch** the geometry, value scale, spike/volatility/softening pipeline, gap bridge,
  visualSamples, inspector, tooltip data source or marker lock of the frozen renderer — it would
  be an additive overlay layer reading `eventMarkers`, gated behind its own flag with full
  rollback, and would require a new checkpoint (`aurix-renderer-v2`) per the protected-component
  change policy.

## Decision criterion

**Do NOT implement in Fase 1** unless there is an explicit product decision to do so. The current
behavior (adaptive axis + honest absolute line + flow-neutral % return) is accepted as correct and
non-blocking. This note exists so the limitation is recorded and the future enhancement is
pre-scoped, without committing any code now.
