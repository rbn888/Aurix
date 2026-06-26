# CHECKPOINT — aurix-graph-stable-v1

Official, verified stable return point for the AURIX graph (desktop + mobile) before any
further interaction/curve work. Documentation only — this checkpoint changes NO product
behaviour.

## Identity
- **Tag:** `aurix-graph-stable-v1` (annotated)
- **Backup branch:** `backup/aurix-graph-stable-v1`
- **Product-stable commit:** `4918008` (RC1-B increment 5). This checkpoint commit adds
  ONLY this document on top of `4918008`; `app.js`, `styles.css`, `index.html` are
  byte-identical to `4918008` (no product change).
- **Build:** `v376-web-chart-rc1b-inc5`
- **app.js?v:** `379`
- **styles.css?v:** `315`
- **Date:** 2026-06-26
- **Harnesses:** full suite 38/38 PASS (incl. mobile guardrails G1-G7, render↔canonical
  equivalence, institutional render, mobile dashboard contract, web-chart RC1-A).

## What is working
- Mobile dashboard fully functional (shell-first render contract; cards immediate +
  skeleton; nav/menu/+ button; Market/Intelligence/Workspace lazy).
- Mobile wealth chart visible (lite native-SVG, `#mobileChartLiteHost`, no Chart.js).
- Mobile donut visible with full legend (categories · colours · %); lower category cards
  restored; carousel swipe works.
- Desktop web chart on the Institutional Render Engine: RC1-A premium presentation +
  RC1-B calibration increments 1-5 (vertical air, 24H/7D perceptual-X fill, long-range
  density, quieter grid).
- Patrimonio synced desktop/mobile/web; time ranges 24H/7D/30D/1A/TOTAL operative.
- Guardrails G1-G7 active; Chart.js blocked on mobile (`AURIX_MOBILE_SAFE`).

## What is pending (not started)
- RC1-B Fase 1 — curve tension/continuity (HIGHEST risk; only via a calibration constant,
  never a rewrite of `_aurixMonotonePath`). Optional, only if still warranted.
- Phase 6 certification → freeze as "AURIX INSTITUTIONAL RENDER ENGINE — CERTIFIED
  RELEASE".

## How to restore this point

### Path A — hard reset to the checkpoint (clean revert of everything after it)
Use when later commits are broken and you want EXACTLY this state back.
```
git fetch --all --tags
git checkout main
git reset --hard aurix-graph-stable-v1
git push --force-with-lease origin main
```
GitHub Pages then redeploys this commit automatically (it serves `main`).

### Path B — safer, non-destructive (preferred when history must be preserved)
Reverts only the bad commits, keeping history linear and auditable.
```
git fetch --all --tags
git checkout main
git revert --no-edit <first_bad_commit>^..<last_bad_commit>
git push origin main
```
If unsure of the range, restore from the backup branch instead:
```
git fetch --all --tags
git checkout main
git restore --source=backup/aurix-graph-stable-v1 -- app.js styles.css index.html
git commit -m "restore: roll graph back to aurix-graph-stable-v1 product files"
git push origin main
```

## Verification AFTER rollback
```
# 1. correct commit / clean tree
git rev-parse --short HEAD            # → 4918008 (Path A) or product files identical
git status --porcelain                # → empty

# 2. app.js syntactically valid
node --check app.js

# 3. full harness suite (must be all PASS)
for f in docs/*harness*.js docs/*-proof.cjs docs/*probe*.js; do node "$f" >/dev/null 2>&1 && echo "PASS $f" || echo "FAIL $f"; done

# 4. live production serves this build + byte-identical (after Pages redeploys, ~1-3 min)
curl -s "https://rbn888.github.io/Aurix/index.html?cb=$RANDOM" | grep -oE "v376-web-chart-rc1b-inc5|app\.js\?v=379|styles\.css\?v=315"
curl -s "https://rbn888.github.io/Aurix/app.js?v=379"     -o /tmp/a.js && cmp -s app.js /tmp/a.js && echo "app.js served == repo"
curl -s "https://rbn888.github.io/Aurix/styles.css?v=315"  -o /tmp/c.css && cmp -s styles.css /tmp/c.css && echo "styles.css served == repo"
```

## Guardrails that MUST pass at this checkpoint (and after any rollback)
- `docs/AURIX-MOBILE-GUARDRAILS-harness.js` — G1-G7 (mobile never regresses)
- `docs/AURIX-RENDER-CANONICAL-EQUIVALENCE-harness.js` — render ↔ canonical series
- `docs/AURIX-INSTITUTIONAL-RENDER-harness.js` (+ `-CONTINUITY`, `-VISIBLE`)
- `docs/AURIX-MOBILE-DASHBOARD-CONTRACT-harness.js`
- `docs/AURIX-WEB-CHART-RC1A-harness.js`
- `docs/AURIX-ADAPTIVE-DENSITY-harness.js`, `docs/AURIX-VISUAL-PREPARATION-harness.js`,
  `docs/AURIX-RENDER-POLISH-harness.js`, `docs/AURIX-BOOT-WATCHDOG-harness.js`
- Full suite gate: **38/38 PASS**.
