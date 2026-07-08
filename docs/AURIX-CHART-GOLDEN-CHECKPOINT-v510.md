# AURIX Chart Golden Checkpoint — v510

Recoverable, verified chart baseline after SPEC.28. Roll back here if a later SPEC breaks the chart.

## Identity
- **Tag:** `aurix-chart-golden-v510` (annotated, immutable)
- **Commit SHA:** `d292c934960ccd20dfda42fb68bc7c1a09723690`
- **Build marker:** `v510-short-history-premium-presentation-28`
- **version.json:** `appjs=510` · index `APPJS_V='510'` · `app.js?v=510` (all in sync)
- **Spec lineage:** SPEC.19 (final render contract) → .22 (deadlock) → .25 (evidence audit) → .26 (long-range state) → .27 (impossible-return guard) → .28 (short-history premium presentation)

## Validation summary (v510)
- SPEC.19 final render chokepoint count = **1**
- `_aurixComputePeriodReturn` count = **1** · `_aurixResolveReliabilityDeadlock` count = **1**
- SPEC.27 impossible-return guard (`withinSupportedReturnDomain`) present
- SPEC.28 `historyPresentationState` present
- `node --check app.js` OK · full harness suite **126/126** green (isolation)
- No backend/auth/schema/snapshot/save-sync/CSS change vs prior baseline

## Real-account expected state (founder-verified live)
- `verdict`: SHORT_HISTORY_TRUTHFUL_PRESENTATION_NEEDED
- aliasDefectCount 0 · possibleBridgeDefectCount 0 · returnContractDefectCount 0 · impossiblePromotedReturnCount 0
- totalSyntheticPoints 0 · desktopMobileParity true
- partialHistoryPresentationCount 3 (7D/30D/1Y) · availableHistoryPresentationCount 1 (ALL)
- 24H trusted return visible; 7D/30D/1Y = PARTIAL_HISTORY ("Historial parcial"); ALL = AVAILABLE_HISTORY ("Historial disponible")
- Note: the audit's `badgeLabel` is the FRC internal label (still "Calculando…" when not eligible); the **DOM** badge text is decided by `_aurixEmergencyPaintBadgeNode` from `historyPresentationState`, so PARTIAL_HISTORY/AVAILABLE_HISTORY deterministically render the premium labels. Browser-only DOM read: `aurixEmergencyChartDebug(range).visibleBadgeText`.

## Rollback (inspect the golden state)
```
git fetch origin --tags
git checkout aurix-chart-golden-v510
```

## Restore main to the golden state (destructive — only if a later SPEC broke the chart)
```
git checkout main
git reset --hard aurix-chart-golden-v510
git push --force-with-lease origin main
```

## Restore verification (after rollback + redeploy)
```
node --check app.js
node docs/AURIX-CHART-SHORT-HISTORY-PREMIUM-PRESENTATION-harness.js   # 26/26
node docs/AURIX-ROUTING-CACHE-STABILITY-harness.js                    # version sync
# in browser console on the live app:
const a = await aurixAuditLongRangeEvidence({ranges:['7d','30d','1y','all'],surfaces:['desktop','mobile'],include24hControl:true});
a.verdict; a.summary;   // expect the real-account state above
```
