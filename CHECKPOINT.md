# AURIX GOLDEN CHART CHECKPOINT — v468

> Recovery checkpoint. Documentation only — no application code changes were made to create it.

| Field | Value |
|---|---|
| **Commit hash** | `bb9945846054391e1ca8be583f7518e1cbb8a984` (`bb99458`) |
| **Build version** | `v468-chart-grid-axis-hover` |
| **app.js version** | `app.js?v=468` |
| **version.json** | `{ "appjs": 468, "build": "v468-chart-grid-axis-hover" }` |
| **Deployment URL** | https://rbn888.github.io/Aurix/ |
| **Annotated tag** | `aurix-golden-chart-v468` |
| **Checkpoint branch** | `checkpoint/aurix-golden-chart-v468` |
| **Full test suite** | 87/87 harnesses green |

---

## Why this checkpoint exists

v468 is the **first visually acceptable, institutional-grade Portfolio Evolution chart** after the
long renderer-recovery arc (v455 → v468). It is the first state that simultaneously:

- draws the premium **monotone-cubic** institutional line (not the emergency straight polyline),
- shows the **grid**, **right-side Y-axis amounts**, and a working **desktop hover** + mobile inspector,
- keeps the **validated v459/v465 data source** (snapshot quarantine intact),
- keeps the **v464 routing/cache/auth stability** (no index⇄login flicker, no stale bundle),
- keeps the **v466 render-loop guards** (no flicker/duplicate renders/idempotent writes).

This is the known-good line to return to if any future change regresses the chart.

---

## What is considered stable (verified)

- **Renderer**: visible chart draws through the original institutional geometry via
  `renderValidatedPortfolioChartWithInstitutionalRenderer` → `downsampleAurixAdaptive` (LTTB) →
  `computeAurixAdaptiveXScale` / `computeAurixValueScale` (regime scale) → `_aurixMonotonePath`
  (cubic `C`) → `buildAurixAreaPath`. Cubic path confirmed (199 `C` commands on a 200-pt series).
- **Data source (single, validated)**: `buildProductionPortfolioChart(range)` → `buildValidatedHistoricalSeries`
  (validation → dedup → zero/future/stale → spike quarantine → plateau → range). Desktop + mobile
  consume identical points.
- **Financial engine**: institutional performance engine + graceful value fallback + tightened gates
  (v460–v463 lineage) with construction/deposit handling; returns never fabricated.
- **Visuals (v468)**: desktop grid (`wsc-grid-layer` behind area/line), right Y-axis (`.wsc-ylab`),
  mobile grid (`mob-chart-grid`) + right axis (`mob-ylab`), mobile edge padding (box 14/986/24/236).
- **Interaction**: desktop hover via `_wscAttachTooltip` on `.wsc-plot`; SVG/grid/area/line are
  `pointer-events:none`, the `.wsc-plot` div is the interactive layer; mobile has its own inspector.
- **Render stability (v466)**: visual-signature repaint guard, single render per price tick,
  Market/hidden isolation, idempotent `performance_state` write, idempotent Total Value, coalesced
  foreground events.
- **Delivery (v464)**: `safeRedirect` loop breaker, `waitForSession` cold-boot fix, spurious-SIGNED_OUT
  guard, cache-busted `version.json` stale-bundle guard (one-time reload).

## Debug entry points (read-only)

`window.aurixChartVisualDebug(range)` · `window.aurixProductionChartDebug(range)` ·
`window.aurixInstitutionalPerformanceDebug(range)` · `window.aurixHistoricalPipelineAudit()` ·
`window.aurixBootDiagnostic()` · `window.renderValidatedPortfolioChartWithInstitutionalRenderer(points, opts)`.

---

## MUST NOT be modified without explicit approval

1. `buildProductionPortfolioChart`, `buildValidatedHistoricalSeries`, `buildInstitutionalPerformanceSeries`
   — data, return %, baseline, snapshot quarantine. (Byte-identical since v459/v465.)
2. `renderValidatedPortfolioChartWithInstitutionalRenderer` and the institutional geometry helpers
   (`downsampleAurixAdaptive`, `computeAurixAdaptiveXScale`, `computeAurixValueScale`, `_aurixMonotonePath`,
   `buildAurixAreaPath`).
3. The visible wiring: `_wscPaintEmergency` (desktop) and the emergency block of `renderAurixMobileLiteChart`
   (mobile). Do **NOT** let `_aurixEmergencyBuildSvg` (straight polyline) become the visible renderer — it is
   the rollback-only fallback.
4. Routing/cache: `safeRedirect` loop breaker, `waitForSession`, `version.json` ↔ `index.html` APPJS_V sync
   (a harness enforces this on every deploy).
5. Do **NOT** re-enable any old data source or re-gate the visible chart on `performance_state`.
6. Do **NOT** add new financial heuristics or thresholds to "make the chart appear".

Any change to the above must keep the full harness suite green (87/87) and preserve: cubic path, single
validated source, desktop==mobile points, returnPct unchanged.

---

## Known remaining issues (non-blocking, accepted)

- **Value-fallback vs performance**: with no recorded cashflow ledger, the chart shows the raw *value*
  line labelled "Evolución del valor patrimonial" (not return). A genuine **unrecorded** deposit appears
  as a value step; a **mid-series** deposit is not flow-neutralized (no capital-flow logic wired — out of
  scope). Fully flow-neutral performance requires enriching the capital-flow ledger.
- **Live visual confirmation**: cubic line, hover, grid and axis are proven via harness execution and the
  served bundle, but final on-device visual confirmation (authenticated session) is the founder's to make.
- **version.json discipline**: every future deploy must bump `version.json.appjs` to match `index.html`
  APPJS_V (AURIX-ROUTING-CACHE-STABILITY test 7 enforces).

---

## Rollback instructions (revert a bad future change back to this golden state)

```bash
# Option A — safe, keeps history (preferred for a shared branch):
git revert <bad_commit>            # or a range: git revert <old>..<HEAD>
git push origin main
# then bump build + version.json and redeploy per the normal flow.

# Option B — hard reset main to the golden commit (force):
git checkout main
git reset --hard aurix-golden-chart-v468
git push --force-with-lease origin main
```

## Recovery instructions (inspect / rebuild from this checkpoint)

```bash
# Inspect the exact golden code:
git checkout aurix-golden-chart-v468          # detached HEAD at the golden commit
#   or the branch:
git checkout checkpoint/aurix-golden-chart-v468

# Rebuild a working branch from golden:
git checkout -b restore/from-golden aurix-golden-chart-v468

# Redeploy golden to production (GitHub Pages serves main):
git checkout main && git reset --hard aurix-golden-chart-v468 && git push --force-with-lease origin main
```

Golden commit: `bb99458` · tag `aurix-golden-chart-v468` · branch `checkpoint/aurix-golden-chart-v468`.
