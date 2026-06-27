# SPEC RC3-INC1 — Adaptive Render Representation (ARR)

Estado: **IMPLEMENTADO** (build v379-arr-render-representation, app.js?v=381).
Arquitectura definitiva aprobada por el founder. Sustituye a las opciones A (reducir
densidad por constantes) y B (densidad sobre ancho real), descartadas.

## Principio permanente del motor Aurix

> **Nunca se sacrificarán datos financieros para mejorar la apariencia visual.
> La serie canónica permanecerá siempre completa.
> Únicamente podrá optimizarse la representación gráfica.**

## Problema

Efecto "mazacote": múltiples muestras caen sobre prácticamente los mismos píxeles.
Causa estructural — la densidad (`targetPointCount`) se calcula contra el viewBox
lógico fijo (`_WSC_VIEW_W = 1000`) y no contra el ancho efectivo en píxeles; tras el
escalado CSS (`preserveAspectRatio="none"`) los vértices quedan a < 1.5 px y los
segmentos cúbicos se solapan. Aparece en desktop y móvil (motor compartido).

## Solución — ARR (representación, no datos)

Optimiza ÚNICAMENTE el conjunto de vértices enviados al path. La serie preparada,
`visiblePoints`, `visiblePixels`, el tooltip, el inspector móvil y la equivalencia
render↔canónica conservan TODOS los puntos reales.

- **Función:** `_aurixArrRepresentVertices(run, xScale, spacing)` (app.js).
- **Punto de inserción:** bucle `runs.forEach` de `renderAurixInstitutionalChart`,
  antes de `_aurixMonotonePath` / `buildAurixAreaPath`. Nada más cambia.
- **Puntos significativos (inamovibles):** endpoints del run, máximo y mínimo del run
  (⇒ preserva también máx/mín globales) y extremos locales significativos
  (`_aurixSignificantLocalExtrema`, prominencia 0.03).
- **Algoritmo:** recorrido voraz O(n); se mantiene un punto si es significativo o si
  su x dista ≥ `spacing` (unidades viewBox) del último vértice mantenido. Primer y
  último punto siempre presentes.
- **Diagnóstico:** `rc.diagnostics.drawnVertexCount` (vértices dibujados ≤ visiblePoints).

## Parámetro calibrable

```js
const _AURIX_PATH_RENDER_SPACING = 5;   // unidades viewBox; calibrable: 3.5 / 4 / 4.5 / 5 / 5.5
```

Primer incremento = parámetro calibrable (no el número definitivo). `0` ⇒ ARR no-op
(path byte-idéntico al previo = rollback inmediato). No cambia arquitectura ajustarlo.

## Contratos verificados (no se rompe ninguno)

1. `auditAurixRenderVsCanonical` compara `rc.visiblePoints` vs canónica, NO el path.
2. Inspector móvil selecciona sobre `_aurixMobChartPts` ← `visiblePoints`/`visiblePixels` (completos).
3. Tooltip desktop muestra `sampleVal` ← `visiblePoints` (valores reales idénticos).
4. Último punto (= dashboard), máx, mín y extremos locales: preservados por diseño.
5. ARR solo afecta a los vértices del path; `prepared`/`visiblePoints`/`visiblePixels` intactos.

## Validación

- 27/27 harnesses en verde (incl. INSTITUTIONAL-RENDER, RENDER-CANONICAL-EQUIVALENCE,
  ADAPTIVE-DENSITY, RENDER-POLISH, MOBILE-GUARDRAILS G1–G7, MOBILE-LITE/RC3/INSPECTOR).
- Sonda directa: serie densa 730 pts → `visiblePoints`=336 (intacto), `drawnVertexCount`
  227 (desktop) / 231 (móvil), −31/32% vértices; last==dashboard; máx/mín preservados;
  `lastDeltaPct=0`; rollback (spacing=0) devuelve todo sin cambios.

## Rollback

`_AURIX_PATH_RENDER_SPACING = 0` ⇒ no-op. Además sigue activa la válvula global
`window.disableAurixInstitutionalRender()` (cae al render legacy). Sin estado persistente.
