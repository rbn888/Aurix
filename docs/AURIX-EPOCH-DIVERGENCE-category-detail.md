# AURIX — Divergencia de epoch: Dashboard/PCE vs drill-down de categoría

- **Status:** OPEN · documentación únicamente · **no implementar**
- **Clasificación:** Backlog · Post-launch · **Prioridad baja**
- **Abierto:** 2026-06-08 (auditoría Bloque 0.4 — coherencia histórica)
- **Bloque de trabajo:** ninguno (no abrir hasta priorización post-launch)

---

## 1. Hallazgo

Dos superficies consumen una referencia de epoch **distinta** sobre el mismo
`categoryHistory`:

- **Dashboard + headline + PCE** usan `_aurixInvestableChartEpoch()`
  (`app.js:4942-4948`) = `max(_aurixPortfolioEpoch, AURIX_INVESTABLE_CHART_EPOCH
  [2026-06-06], override)`. Consumido por `_investableSnapshotSource()`
  (`app.js:13696`) y por la reconstrucción PCE (`app.js:12329,12335,12351`).
- **Drill-down de categoría** usa solo `_aurixPortfolioEpoch()` (epoch de reset,
  ≤ epoch invertible) + un "structural-jump trim" >150% propio
  (`app.js:5148, 5165+`, CATEGORY-DETAIL-POLISH-1).

**Consecuencia:** un drill-down de categoría puede mostrar histórico anterior al
baseline invertible (2026-06-06) que el chart principal del Dashboard oculta.

## 2. Por qué NO es bloqueador

- No afecta a lanzamiento, credibilidad financiera ni métricas principales.
- Es por-diseño defendible: los charts de categoría son por-bucket e **incluyen
  `real_estate`**, que el baseline *invertible* no gobierna; usar la epoch general
  de reset + su trim estructural propio es coherente con su alcance.
- Superficie **secundaria** (drill-down), y **protegida independientemente** contra
  el caso "-99%" por el trim estructural.
- Las 4 superficies auditadas en 0.4 (PCE / Wealth Evolution / Dashboard /
  Workspace) SÍ son coherentes entre sí.

## 3. Opción a evaluar (post-launch, no ahora)

Evaluar si las categorías *invertibles* (todas menos `real_estate`) deberían
alinear su baseline con `_aurixInvestableChartEpoch()` para que un drill-down no
muestre histórico pre-baseline que el total oculta. Es una **decisión de producto**
(consistencia visual del drill-down), no de credibilidad. Mantener `real_estate`
sobre la epoch de reset general.

## 4. Fuera de alcance

- No implementar. No modificar código. No abrir bloque de trabajo.
- Revisar en priorización post-launch (candidato a Bloque 3 — pulido, o micro-ticket propio).
