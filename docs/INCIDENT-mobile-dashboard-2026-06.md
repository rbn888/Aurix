# Incident note — Mobile dashboard regression (June 2026)

**Status:** CLOSED (founder-validated on a real iPhone). Hardened by `AURIX-MOBILE-GUARDRAILS-harness.js`.
**Final build:** `v369-mobile-restore` · `app.js?v=374` · `styles.css?v=313`.

---

## 1. Initial root cause

A web-chart render roadmap (institutional chart, SPEC 1–6.1) progressively coupled the
**mobile** dashboard's first paint to heavy chart work. On iOS Safari the chart
initialisation (Chart.js + the institutional/WSC render machinery) is heavy and
synchronous; iOS kills a long-running script after ~10s of main-thread CPU. The mobile
boot ran chart init on the critical path, so the dashboard froze: splash stuck, then a
visible-but-dead dashboard (no nav, no buttons, prices stuck "Actualizando…").

## 2. Chain of regressions

1. **Infinite splash / frozen UI** — chart init on the boot critical path blocked the
   main thread on the device.
2. **Deferred-but-still-frozen** — moving chart init to a 250ms `setTimeout` (v362) still
   re-froze the thread after the shell; Chart.js itself was the cost.
3. **Mobile-safe over-correction** — gating all chart functions (v363) restored
   interactivity but left the chart as a placeholder AND silently disabled the carousel
   swipe (`initMobileSlider` was gated) and the lower category cards + donut legend
   (built only by the now-gated `updateDonut`).
4. **First lite-chart attempt reverted** (v364→v365) — a lite SVG renderer reinjected
   `innerHTML` into hosts inside the carousel on every refresh, breaking the donut/
   carousel layout and slowing the cards. Reverted to the stable v363 state.
5. **Visible debug + unreliable chart** (v366/v367) — the splash painted a build/watchdog
   stamp; the lite chart's only trigger (a fragile top-level autostart) didn't fire on
   device, so the boot placeholder persisted.
6. **Cards/donut still incomplete** (v368) — shell-first reveal fixed "cards tardan", but
   the lower **category cards** (`#categoriesSection`, shown only by `updateCategoryCards`,
   triggered only by the gated `updateDonut`) and the **donut legend**
   (`#distributionLegendMobile`, built by the gated `updateDonut`) were still missing.

## 3. Why it happened

The mobile first paint and the dashboard's secondary visuals were **coupled to two heavy
dependencies that don't belong on the critical path**: (a) Chart.js / the web chart
engine, and (b) the network (Supabase) — `initPortfolioData` awaited the backend before
the first `render(true)`, and the splash hid only after that render. A single shared
trigger (`updateDonut`, Chart.js-based) owned the donut, its legend AND the category
cards; gating it for stability silently removed three unrelated pieces of UI.

## 4. Commits that solved it

| Build | Commit | Fix |
|------|--------|-----|
| v363-mobile-safe | `84fb2e3` | `AURIX_MOBILE_SAFE`: hard-gate the 6 heavy Chart.js fns on phones; nav bound at top level. Restored interactivity. |
| v365-mobile-safe | `3cd746f`+`4fc6ed6` | Revert the carousel-breaking lite renderer back to the stable v363 state. |
| v366-mobile-lite-chart | `1cd1c90` | Lite SVG wealth curve in a dedicated `#mobileChartLiteHost` (budget/cancel/fallback), never touches the carousel. |
| v367-mobile-dashboard-clean | `c18815c` | Production-clean splash (removed `#aurixBuildStamp`); reliable boot-block chart trigger + empty-data retry; `placeholderReason`. |
| v368-render-contract | `1cbe666` | **Permanent render contract** `_aurixApplyRenderContract()`: shell-first reveal (skeleton + splash <300ms) decoupled from data; carousel swipe re-enabled (touch-only); lite SVG donut. |
| v369-mobile-restore | `34f58f3` | `updateDonut` mobile branch routes to lite donut + `updateCategoryCards`; donut legend restored; category cards rebuilt at boot/range. |

## 5. What is now protected (permanent guarantees)

Enforced by `docs/AURIX-MOBILE-GUARDRAILS-harness.js` (fails the suite if violated):

- **G1** — a web-chart change cannot touch mobile boot: the mobile first paint
  (`_aurixApplyRenderContract`) runs at module scope BEFORE the boot IIFE and never calls
  the chart; the 6 heavy chart fns hard-gate on `AURIX_MOBILE_SAFE`.
- **G2** — no mobile chart uses Chart.js: the lite chart + lite donut are native SVG; the
  Chart.js paths early-return on mobile.
- **G3** — the mobile dashboard does not depend on Supabase for the first render: shell +
  skeleton + splash-clear happen before the boot IIFE's auth/portfolio awaits.
- **G4** — the mobile chart cannot block navigation: nav binds at module scope before boot;
  the lite chart is deferred + 100ms-budgeted + try/catch + `pointer-events:none`.
- **G5** — donut/cards do not depend on the heavy `updateDonut`: its mobile branch routes
  to the lightweight SVG donut + `updateCategoryCards` (no Chart.js).
- **G6** — the splash shows no debug in production: no build stamp / watchdog text; the
  diagnostic panel is gated to a genuine fatal (app.js never executed).
- **G7** — `AURIX_MOBILE_SAFE` cannot be removed silently: the guardrail harness requires
  the flag and a minimum gate count, so removing it fails the suite.

## 6. Next work

Mobile dashboard is closed. The next task returns to the original roadmap: **finish the
institutional WEB chart** from this stable base. Per G1, that work cannot regress mobile.
