# AURIX Institutional Renderer — v1 (PROTECTED COMPONENT)

**Checkpoint:** `aurix-renderer-v1` · backup branch `backup/aurix-renderer-v1`
**Stable commit base:** RC5-A (`v399-rc5a-premium-motion`, `app.js?v=401`, `styles.css?v=319`)
**Status:** Founder-validated on web + iPhone (RC4-G spike discipline + RC4-G desktop snap + RC5-A premium motion all approved).

This document freezes the institutional wealth chart renderer as a **protected component**. It is the single source of truth for the chart shown in:
- Desktop "Resumen de rendimiento" (`#perfSnapshot`, `renderWealthCurve` / `_wscAttachTooltip`).
- Mobile lite SVG (`#mobileChartLiteHost`, `scheduleAurixMobileLite`).

Both surfaces share `renderAurixInstitutionalChart(range, w, h, box)` for geometry. Data/logic are never touched by the renderer.

---

## Frozen surface — DO NOT MODIFY

From this checkpoint, the following are **locked**. No edits without an approved reason (see Change policy):

| Area | Functions / constants (locked) |
|---|---|
| **Geometry** | `renderAurixInstitutionalChart`, `_aurixRenderContractGeometry`, `computeAurixTimeScale`, `computeAurixAdaptiveXScale`, `computeAurixValueScale`, `_aurixComputeVisualPreparation`, `prepareAurixVisualSeries` |
| **ARR** (adaptive render representation) | `_aurixArrConfig`, `_aurixArrRepresentVertices`, `_AURIX_*` ARR/VP tuning constants |
| **Spike guard** | `_aurixSpikeReduce`, `_aurixSpikeParams`, `_aurixSpikeDiscipline`, `_aurix24hSpikeGuard`, `_AURIX_24H_SPIKE_GUARD_V2_ENABLED`, `_AURIX_SPIKE_DISCIPLINE_BY_RANGE`, `_AURIX_SPIKE_DISCIPLINE_LEVELS` |
| **Volatility polish** | `_aurixVolatilityPolish` (delegates to `_aurixSpikeDiscipline`) |
| **Gap bridge** | `_aurixSplitAtGaps` + the 24H no-split RULE 0 (24H always renders ONE subpath) |
| **visualSamples** | `_aurixSampleSegments`, `_aurixDensifyPathSegments`, the `visualSamples` output array |
| **Inspector** | mobile `_aurixVisualPointAtX(_aurixMobChartVisual, …)` long-press snap, gesture lock |
| **Tooltip** | `_wscAttachTooltip` data source (real `dataPoint` for value; `visualPoint` only for cursor) |
| **Marker lock** | end-dot `.wsc-last-dot` / cursor position (JS-positioned; never re-derived) |

### Invariants that must always hold (verified by the suite)
1. **Data untouched:** `visiblePoints` == canonical downsample; `visiblePixels.length === visiblePoints.length`.
2. **Equivalence:** `auditAurixRenderVsCanonical(range)` is `faithful-downsampled` (never `divergent`) for `24h/7d/30d/1y/all`.
3. **24H no-split:** `renderedSubpaths === 1` for 24H (incl. under any rollback).
4. **Desktop cursor snap ≤ 1px:** cursor/dot ride the polished line via `_aurixVisualPointAtX(model.visualSamples, vbX)`.
5. **Color parity:** line/area colour follows `_aurixRangeReturn(range)` sign (`#2ebd85` up / `#e25563` down / `#9fb0c7` neutral, ±0.005).
6. **Mobile never loads Chart.js** (`AURIX_MOBILE_SAFE`).

---

## Premium Motion (RC5-A) — visual layer, separately gated

`_AURIX_PREMIUM_MOTION_ENABLED` (CSS keyed on `.aurix-pm`). Visual-only entrance/transition (line draw via `pathLength="1"` + `stroke-dashoffset`, area reveal, end-dot fade). It does **not** touch geometry; it may be toggled off without affecting any invariant above.

---

## Rollback levers (exact)

| Lever | Effect |
|---|---|
| `_AURIX_PREMIUM_MOTION_ENABLED = false` (or `window.AURIX_PREMIUM_MOTION = false`) | Disable premium motion ⇒ exact RC4 behaviour |
| `_AURIX_24H_SPIKE_GUARD_V2_ENABLED = false` | Spike discipline ⇒ legacy guard/polish params |
| `_AURIX_SPIKE_DISCIPLINE_BY_RANGE[range] = { strict: 'off' }` | Disable spike discipline for one range |
| `window.disableAurixInstitutionalRender()` | Fall back to legacy WSC geometry |
| **Full restore** | `git checkout aurix-renderer-v1` (or `git checkout backup/aurix-renderer-v1`) |

---

## Verification harnesses (run before ANY future renderer change)

- Full suite: `for h in docs/*harness*.js; do node "$h"; done` — **41/41 PASS** at this checkpoint.
- Mobile guardrails: `node docs/AURIX-MOBILE-GUARDRAILS-harness.js` — **40/40**.
- Key renderer harnesses: `AURIX-SPIKE-DISCIPLINE-RC4G`, `AURIX-VOLATILITY-PARITY-RC4E`, `AURIX-24H-SPIKE-GUARD`, `AURIX-MOBILE-LAYOUT-RC4B`, `AURIX-MOBILE-LITE-CHART`, `AURIX-PREMIUM-MOTION-RC5A`, `AURIX-BOOT-WATCHDOG`.

---

## Change policy (post-checkpoint)

Edits to any locked area are allowed **only** for:
1. **Critical bug** (correctness/regression affecting users), or
2. **Approved new functionality**, or
3. **Explicit product evolution.**

Any such change MUST: keep all invariants above, re-run the full suite green (incl. guardrails + equivalence), bump versions, and create a new checkpoint tag (`aurix-renderer-v2`, …). Do not silently mutate the frozen surface.
