# WN.24 — Institutional Chart Audit & Final Corrections

**Build audited:** v318-wn23-visual-finish (app.js?v=328, styles.css?v=297)
**Scope:** Aurix wealth chart engine after WN.17–WN.23. Audit + validation only.
**Code changed:** None to the chart engine. Report-only commit.

## Method
Headless harness exercising the exact render pipeline
(`eligible → resample → despike → MA → vertical-regime → y-remap +
event-dominance cap → activity-warp → PCHIP path`) plus every existing scorer
(`_wscNarrativeModel`, `_wscEventDominanceModel`, `_wscYScaleModel`,
`_wscInstitutionalCurveScore`) and geometry-safety checks (x strictly
increasing, gFrac monotone & in-bounds, PCHIP no-overshoot, no NaN, no
out-of-bounds), across 16 scenarios mapped to the 5 ranges.

The per-range **audit score** = mean of the four institutional sub-scores
(narrative / event-dominance / Y-scale / curve), gated to ≤50 if any geometry
check fails.

## Scenarios (16) — all clean, geometry safe
| # | Scenario | Range | Audit | Narr | Event | Y | Curve |
|---|---|---|---|---|---|---|---|
| 1 | Quiet 24H | 24h | 99 | 97.8 | 100 | 99.4 | 99.1 |
| 2 | Volatile 24H | 24h | 99 | 97.8 | 100 | 99.4 | 99.4 |
| 3 | 7D rally + consolidation | 7d | 100 | 100 | 100 | 100 | 99.3 |
| 4 | 7D drawdown + recovery | 7d | 99 | 97.8 | 100 | 99.4 | 99.9 |
| 5 | 30D trend + correction | 30d | 100 | 100 | 100 | 100 | 99.8 |
| 6 | 1A long-term growth | 1y | 100 | 100 | 100 | 100 | 98.6 |
| 7 | TOTAL long history | all | 99 | 97.8 | 100 | 99.4 | 99.9 |
| 8 | One-day spike | 7d | 99 | 97.8 | 100 | 99.4 | 99.4 |
| 9 | Flash crash | 30d | 99 | 97.8 | 100 | 99.4 | 99.9 |
| 10 | Long sideways | 30d | 99 | 97.8 | 100 | 99.4 | 99.0 |
| 11 | Internal rebalance (neutralized) | 30d | 99 | 97.8 | 100 | 99.4 | 99.8 |
| 12 | External deposit (neutralized) | all | 99 | 97.8 | 100 | 99.4 | 99.8 |
| 13 | Small portfolio (500→5k) | 1y | 100 | 100 | 100 | 100 | 98.6 |
| 14 | Large portfolio (500k→5M) | 1y | 100 | 100 | 100 | 100 | 98.6 |
| 15 | Sparse data | 1y | 99 | 97.8 | 100 | 99.4 | 100 |
| 16 | Dense data | 24h | 99 | 97.8 | 100 | 99.4 | 99.1 |

Scenarios 11/12 (flow events) are validated at the engine level: the
flow-neutralized adjusted series renders as a clean continuous curve (the
neutralizer is upstream and unchanged). Scale invariance (13 vs 14): sub-scores
**identical**.

## Final scores (min across each range's scenarios)
| Range | Score | Target | Verdict | Main issue |
|---|---|---|---|---|
| 24H | 99/100 | ≥92 | PASS | none |
| 7D | 99/100 | ≥92 | PASS | none |
| 30D | 99/100 | ≥92 | PASS | none |
| 1A | 99/100 | ≥92 | PASS | none |
| TOTAL | 99/100 | ≥94 | PASS | none |

## Issues found
None meeting the bar (visible + reproducible + rule-tied + surgically fixable).

## Fixes applied
None. No chart code changed.

## Intentionally left unfixed (by design, not defects)
- Genuinely flat / collinear gap-fill regions render as calm straight segments
  (no fabricated micro-structure) — honest per WN.22.
- Exact retina vs non-retina appearance of the WN.23 SVG glow filter cannot be
  verified headlessly; needs on-device eyeball (standard visual-validation step).

## Non-regression
- WN.17 static grid, no bottom X labels, right-side Y labels — intact.
- WN.18–22 outputs unchanged; WN.23 styling-only.
- Geometry safe in all 16 scenarios; tooltip wiring (`sampleX/sampleY/sampleVal`)
  and anchors untouched; metric / financial values / real-estate exclusion not
  touched by this audit.

## Product-lock readiness
**Engine: READY.** All ranges ≥ target, no critical visual defect, no financial
regression. Final product lock pending only the standard on-device visual
confirmation (desktop/tablet/mobile) per the visual-change workflow.
