# SPEC WEB-CHART-RC1A — desktop presentation finish (DELIVERED)

**Scope:** desktop web chart **presentation layer only**. ZERO changes to the shared
Institutional Render Engine. Near-zero mobile risk. Part of the RC1 plan (A obligatoria,
B only if A is insufficient).

**Build:** `v371-web-chart-rc1a` · `app.js?v=375` · `styles.css?v=314`.

## Allowed surface (touched)
- `_wscPaintSurface` — added a TradingView-style end marker (HTML element positioned in
  % from the already-computed render samples; no engine/coord change) + a richer area
  gradient (added a mid-stop in the `<linearGradient>` markup).
- CSS `.wsc-*` — premium finish: `.wsc-last-dot` (tone-coloured glowing end marker with a
  reduced-motion-guarded pulse); richer 3-stop area fill (`.wsc-area-mid`); premium
  tooltip card (glass gradient, hairline border, layered shadow, backdrop blur, tone
  accent bar via `::before`); cursor adopts the trend tone + a soft 60ms glide; finer
  crosshair dashes.

## NOT touched (engine — forbidden list, verified untouched in the diff)
`renderAurixInstitutionalChart`, `computeAurixAdaptiveXScale`, `computeAurixValueScale`,
`downsampleAurixAdaptive`, `prepareAurixVisualSeries`, `_aurixMonotonePath`.
Also untouched: mobile chart lite, mobile donut, mobile cards, carousel, boot, auth,
Supabase, snapshots, write guard, PCE, pricing core, canonical series, financial logic.

## Guardrail gate (all green before ship)
`docs/AURIX-WEB-CHART-RC1A-harness.js` (presentation present + engine markers never leak
+ mobile untouched) + the full suite: **38/38 PASS**, including the mandatory guards —
`AURIX-MOBILE-GUARDRAILS` (G1–G7), `AURIX-RENDER-CANONICAL-EQUIVALENCE`,
`AURIX-INSTITUTIONAL-RENDER*`, `AURIX-MOBILE-DASHBOARD-CONTRACT`. Engine behaviour is
proven unchanged because the institutional-render + equivalence + adaptive-density
harnesses (which execute the real engine) still pass.

## Next
After live + visual review: a fresh audit (achieved finish vs remaining objectives vs
real limitations of the desktop-only layer) decides whether RC1-B (single, reversible,
individually-validated engine micro-adjustments) is warranted. RC1-B is NOT started.
