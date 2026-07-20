# INSTITUTIONAL CHART ENGINE — TECHNICAL SPECIFICATION

> Branch `feature/institutional-chart-engine` (off production `b8010ee`). **No deploy, no prod change** until certified.
> Principles: surgical, smallest-correct-change, preserve working behavior, fail-closed, rollback at every milestone, verify-don't-guess, harness-gated. One milestone at a time; validate before advancing.

## 0. Current state (verified) & the gap
Existing, working, certified pieces:
- **Portfolio Value** — `totalValueUSD()` / `investableValueUSD()` = Σ qty×price (live).
- **Investment Return** — `_aurixComputePeriodReturn` flow-neutral `(endV − startV − netFlows)/startV` (certified).
- **Cash Flows** — ledger `_aurixLoadCapitalFlows`/`_aurixCaptureFlow` (deposit +, withdrawal −), neutralized in returns via `_aurixNetFlowsInWindow`.
- **Unrealized PnL** — `computePositionPerformance` = currentValue − costBasis (per position/category).
- **Realized PnL** — stored per-asset (`asset.realizedPnL` → `realizedPnLUSD`).

**Gap (why it's not yet institutional):** these five quantities exist independently but are **not unified by a single owner that enforces the accounting identity**, and the **partial-buy / partial-sell → average-cost → realized-PnL** transaction logic is **unaudited**. Institutional platforms present these five as distinct, always-reconciling numbers:

```
ΔPortfolioValue(t0→t1) ≡ NetCashFlows + MarketPnL
MarketPnL             ≡ RealizedPnL + ΔUnrealizedPnL
Return%               ≡ MarketPnL / (capital at risk)     [flow-neutral, already certified]
```

The engine must **prove** this identity holds for every portfolio and every window, and never let a deposit/withdrawal/sell masquerade as a market loss.

---

## MILESTONE PLAN (each: objective · approach · acceptance · rollback)

### M0 — Accounting forensic audit (READ-ONLY, no code change)
- **Objective:** establish deterministic ground truth for the 5 quantities + the transaction (buy/sell) accounting, before changing anything.
- **Approach:** read-only `window.aurixAccountingAudit()` + a Node harness that, for a battery of synthetic portfolios (partial buys, partial sells, full exits, re-buys, multi-lot), computes each quantity from the CURRENT code and checks the identity `ΔPV = NetFlows + Realized + ΔUnrealized`. Catalog every divergence with a reason.
- **Acceptance:** a signed audit report: for each scenario, identity residual = 0 or a proven, explained defect. No guesses.
- **Rollback:** none (read-only).

### M1 — Canonical accounting model (one owner, read-only over existing data)
- **Objective:** a single deterministic owner `_aurixComputeAccounting(window)` returning the 5 **separated** quantities + the identity residual, feeding all consumers (badge, tooltip, cards, chart).
- **Approach:** pure function over the existing holdings + flow ledger + cost basis. Does **not** change stored data; it reconciles and exposes. Enforces `residual ≈ 0` (fail-closed: if it can't reconcile, it reports a non-publishable state, never a fabricated number).
- **Acceptance:** harness proves the 5 quantities + identity for all M0 scenarios; existing return (flow-neutral) reproduced exactly (no regression); full suite green.
- **Rollback:** flag-gated; off ⇒ byte-identical to today.

### M2 — Transaction accounting correctness (partial buys/sells, average cost, realized gains)
- **Objective:** correct average-cost-basis accounting so partial sells book realized PnL and leave the remaining position's cost basis correct; partial buys update the weighted average; full exit → closed with final realized PnL.
- **Approach:** audit the add/edit/sell transaction path (where `costBasis`/`realizedPnL`/`averagePurchasePrice` are written); surgically fix only proven defects (smallest change). Weighted-average-cost method (document the method explicitly; no silent FIFO/LIFO switch).
- **Acceptance:** harness matrix (buy, buy-more, partial-sell, sell-more, full-exit, re-buy) with hand-computed expected cost basis + realized PnL to the cent; identity holds; no history rewrite of existing user data (forward-correct only, with a documented one-time reconciliation audit if past data is wrong).
- **Rollback:** flag-gated; migration (if any) is dry-run + reversible.

### M3 — "Flows never look like market losses" across every surface
- **Objective:** deposits, withdrawals and asset sales render as **capital steps**, never as return/market losses — on the line, the badge, the tooltip and the cards, consistently.
- **Approach:** ensure every flow (incl. sale proceeds) is captured in the ledger and attributed as a capital step in the chart segmentation (`_aurixCapitalStepBreaks`) and neutralized in the return; the tooltip labels a step as a flow, not a "−X%".
- **Acceptance:** harness: a withdrawal/sell day shows Δvalue attributed to flow (return ≈ market-only); tooltip/badge never show a negative % caused by a flow. Visual staging check.
- **Rollback:** flag-gated.

### M4 — Chart output audit (labels, %, €/$ values, axes, tooltips, locale, consistency)
- **Objective:** every displayed number is correct, consistent and correctly localized (es-ES; € vs $ per the value's currency), and the four surfaces (badge, monetary, tooltip, cards) never contradict each other.
- **Approach:** read-only `aurixChartOutputAudit()` enumerating every rendered figure + a harness asserting locale/format/sign/currency + cross-surface equality (one generation).
- **Acceptance:** zero inconsistencies; locale/currency correct for all types; harness green.
- **Rollback:** presentation-only; flag-gated.

### M5 — Android/Chrome rendering stability & mobile performance (Priority 2)
- **Objective:** eliminate flicker, poor scrolling, rendering instability, unnecessary re-renders on Android Chrome.
- **Approach:** instrument render/repaint counts (dev flag); identify redundant repaints (e.g., duplicate hydration/paint triggers, layout thrash); surgical fixes (debounce/coalesce paints, avoid forced reflow, GPU-friendly transforms); measure before/after. No functional change to the chart data.
- **Acceptance:** measured reduction in repaints/frame drops; no flicker in a scripted Android-Chrome (device-emulation) scroll/interaction test; parity with desktop behavior.
- **Rollback:** presentation/perf-only; flag-gated.

### M6 — Financial validation suite (Priority 3) — foundational, built early & extended each milestone
- **Objective:** a comprehensive, deterministic suite covering deposits, withdrawals, partial buys/sells, full exits, cash movements, multi-asset portfolios, realized/unrealized PnL, and chart correctness.
- **Approach:** a fixture library (hand-computed expected values) + harnesses run in the fail-closed CI gate; extended as M1–M4 land. Every accounting milestone must pass it before advancing.
- **Acceptance:** suite covers all listed cases with cent-exact expectations; wired into the deploy gate.
- **Rollback:** tests only.

### M7 — Institutional certification & staging soak
- **Objective:** certify the whole engine like the chart-integrity release (full suite + fail-closed gate + staging + soak) before any production authorization.
- **Acceptance:** all suites green; staging matrix + ≥1 overnight soak clean; benchmark vs CoinMarketCap/institutional shapes.
- **Rollback:** documented per prior release process.

---

## Execution rules
- Work only on `feature/institutional-chart-engine`; production frozen.
- One milestone at a time; do not start the next until the current is validated (harness + evidence) and the full suite is green.
- Every change flag-gated where feasible; rollback documented per milestone.
- Fail-closed: any unreconciled accounting ⇒ non-publishable state, never a fabricated figure.
- Evidence preserved (harness outputs, audits) per milestone.
- No production deploy until M7 certified + explicit authorization.
