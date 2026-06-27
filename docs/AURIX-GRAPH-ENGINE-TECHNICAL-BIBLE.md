# AURIX GRAPH ENGINE — TECHNICAL BIBLE

Documento vivo del motor de representación del gráfico de patrimonio de Aurix
(`renderAurixInstitutionalChart`, compartido web + móvil-lite). Recoge las decisiones
de arquitectura y las lecciones aprendidas que se convierten en reglas permanentes.

## Principio permanente (NO negociable)

> **Nunca se sacrificarán datos financieros para mejorar la apariencia visual.
> La serie canónica permanecerá siempre completa.
> Únicamente podrá optimizarse la representación gráfica.**

`visiblePoints` / `visiblePixels` conservan SIEMPRE todos los puntos reales; tooltip,
inspector móvil y la auditoría render↔canónica operan sobre ellos. La capa ARR solo
decide qué **vértices se envían al path** (línea/área). Nunca toca serie/snapshots/
pricing/patrimonio/timestamps/valores/máximos/mínimos/último punto.

## Pipeline

```
getAurixRenderSeries → prepareAurixVisualSeries → downsampleAurixAdaptive (LTTB +
extrema) → computeAurixAdaptiveXScale (perceptual-X) + computeAurixValueScale →
[ ARR: _aurixArrConfig + _aurixArrRepresentVertices ] → _aurixMonotonePath +
buildAurixAreaPath
```

El SVG se pinta en un viewBox fijo `1000 × _WSC_VIEW_H` con `preserveAspectRatio="none"`,
escalado por CSS al ancho real (desktop ~0.70×, móvil ~0.34×). Por eso los umbrales de
ARR se expresan en **unidades viewBox** y se calibran al caso más estrecho (móvil).

## ARR — Adaptive Render Representation (RC3-INC1 → INC2)

- **INC1 (v379):** spacing global único `_AURIX_PATH_RENDER_SPACING`. Adelgaza vértices
  subpíxel conservando endpoints/máx/mín/extremos. Eliminó el mazacote de rangos largos.
- **INC2 (range + shape aware):** un spacing global NO sirve para todos los rangos.

### Range-aware (`_AURIX_RENDER_SPACING_BY_RANGE`)
Cada temporalidad tiene su contrato visual: `{24h:8, 7d:5, 30d:5, 1y:5.5, all:5.5}`
(+ prominencia de extremos y N de tramo final por rango). Fallback global si un rango
no está en la tabla.

### Shape-aware (multiplicadores por zona, `_AURIX_ARR_SHAPE`)
El spacing varía según la geometría real: `calma ×1.0`, `volátil ×0.45` (burst),
`narrativa inicial ×0.55`. El tramo final se preserva por conteo (Last Segment), no por
spacing.

## Range + Shape Aware Rendering Lessons

- **24H es el rango más sensible.** No puede compartir exactamente la lógica de los demás.
- **Un spacing global puede mejorar rangos largos y romper rangos cortos.** Por eso ARR
  pasó a ser range-aware.
- **ARR debe ser range-aware Y shape-aware.** La geometría real (volatilidad, tramo final,
  inicio en rangos largos) debe influir en cómo se representa la misma serie canónica.
- **El último tramo jamás puede desaparecer.** El path renderizado debe llegar SIEMPRE al
  último punto real; el marcador final nunca queda huérfano. Es guardrail permanente
  (G1: distancia último-path↔último-visible ≤ 0.5 viewBox).
- **1A y TOTAL necesitan protección narrativa inicial.** El primer 10–15% no puede
  colapsar a una recta artificial; se preservan más vértices (sin inventar datos).
- **Los datos financieros nunca se sacrifican.** Solo se optimiza la representación.
- **Web y móvil comparten motor.** Toda validación se hace en ambas superficies.
- **Toda anomalía visual real se convierte en guardrail permanente.**

### Lección de calibración 24H (sondas, RC3-INC2)
El mazacote de 24H tenía **dos causas independientes**, ninguna resuelta por "bajar el
spacing" (que era la intuición inicial y resultó **contraproducente**):
1. **Ruido de alta frecuencia / baja amplitud** marcado como "extremo significativo"
   (prominencia 0.03 → ~79% de los puntos protegidos → ARR no podía adelgazar). Fix:
   **subir la prominencia 24H a 0.15** (solo swings grandes se protegen).
2. **Spacing base demasiado bajo:** los ~223 puntos visibles ya estaban a ~3.96 viewBox
   de media → un spacing ≤5 apenas adelgazaba. Fix: **subir el spacing base 24H a 8**
   para limpiar la calma, con **burst (×0.45)** preservando los dientes reales y **Last
   Segment (N=12)** garantizando el final conectado.
- **Burst = desplazamiento NETO direccional** sobre una ventana (no rango local): el
  ruido oscila con neto ≈0 (no se protege), un movimiento sostenido tiene neto grande
  (se preserva). Distinguir diente real de ruido exige el neto, no max-min.
- **El "corte/línea rota" de 24H NO es ARR** (el path llega al último punto, Δ≤0.002):
  es el **gap nocturno** (>8h) fragmentando la vista. Decisión sobre el floor de gap de
  24H: PENDIENTE de datos live (`window.debugAurixGraphQuality()`); por ahora se respeta
  el Principio 6 (no cruzar gaps) y se preserva el tramo final.

## Last Segment Protection (`_AURIX_ARR_LAST_SEGMENT_N`)
`{24h:12, _default:6}`. Los últimos N puntos del run se preservan SIEMPRE → tramo final
conectado, marcador nunca huérfano, último punto = dashboard.

## Burst (Fase 4) — `_AURIX_ARR_BURST_DELTA_FRAC=0.09`, `_AURIX_ARR_BURST_WIN=3`
Desplazamiento neto |v[i+win]−v[i−win]| / rango ≥ frac ⇒ zona volátil ⇒ spacing ×0.45.

## Gaps (Fase 6)
No suavizar bordes. Se preservan primer/último punto de cada run y los bordes de gap. La
lógica de DETECCIÓN de gap (`_AURIX_VP_GAP_FLOOR_MS`) NO se toca.

### RC3-INC3 — Visual Gap Bridge (24H, render-only)
LECCIÓN: el defecto visual dominante de 24H NO era ARR/spacing sino la **fragmentación
por gap nocturno**. Una pausa normal de madrugada (sin snapshots) se detectaba como gap
y `_aurixSplitAtGaps` partía la línea, dejando el bloque reciente aislado → "gráfico roto".
- `_AURIX_GAP_BRIDGE_24H_MAX_MS` (14h por defecto): **solo 24H**, si el gap dura ≤ umbral,
  el PATH se dibuja CONTINUO a través del hueco (la curva monótona conecta los dos puntos
  reales; NO se inventa ningún punto). Gaps > umbral o de otros rangos siguen partiendo.
- El gap SE SIGUE detectando y se reporta (`diagnostics.bridgedGapCount` / `splitGapCount`,
  `rc.bridgedGapSegments`); tooltip/inspector/visiblePoints/equivalencia intactos.
- REGLA: solo 24H · solo gap ≤ umbral · marcador final siempre conectado · rollback
  `_AURIX_GAP_BRIDGE_24H_MAX_MS=0`.
- Decisión del floor de detección 24H: NO tocada; el bridge resuelve la percepción sin
  reclasificar el dato.

## RC3-INC3 — Inspector Lifecycle (tooltip persistente)
LECCIÓN: el tooltip/cursor quedaba fijo al soltar por una **race**: `touchmove` programa un
`requestAnimationFrame`; al soltar, `touchend → _aurixMobInspectorHide()` quita la clase,
pero el rAF pendiente dispara DESPUÉS y `_aurixMobInspectorUpdate` volvía a añadir
`.mob-inspecting` → reaparecía. Fixes:
- `_aurixMobInspectorUpdate` early-return si `!_aurixMobInspectorActive` (un rAF tardío
  tras soltar es no-op).
- `_aurixMobInspectorHide` fuerza `opacity:0` en cursor/hair/tip + vacía el tooltip +
  resetea estado y `touchAction` (swipe restaurado). La opacidad inline se limpia en el
  siguiente update activo (re-show OK).
- Red de seguridad `pointerup`/`pointercancel` (+ window-level) además de touchend/cancel.
REGLA permanente: el inspector debe DESAPARECER al soltar; ningún rAF/tardío puede
re-mostrarlo.

## Rollback
- `_AURIX_RENDER_SPACING_BY_RANGE[rango]=0` ⇒ ARR no-op en ese rango (cae al fallback).
- `_AURIX_PATH_RENDER_SPACING=0` ⇒ ARR no-op total.
- `window.disableAurixInstitutionalRender()` ⇒ render legacy completo.

## Instrumentación
- `window.debugAurixGraphQuality([range])` — tabla read-only por rango: visiblePoints,
  drawnVertexCount, ratio, effSpacing, gaps, lastSegΔ, conectado, vtx 1er15%/últ10%,
  sig%, equivalencia. Para calibrar con datos REALES.
- `window.debugAurixAdaptiveDensity`, `window.auditAurixRenderVsCanonicalAll`.

## Harnesses (gate obligatorio antes de cualquier commit del gráfico)
`AURIX-GRAPH-RANGE-SHAPE-QUALITY` (20 casos) · `AURIX-INSTITUTIONAL-RENDER*` ·
`AURIX-RENDER-CANONICAL-EQUIVALENCE` · `AURIX-ADAPTIVE-DENSITY` · `AURIX-RENDER-POLISH` ·
`AURIX-MOBILE-GUARDRAILS` (G1–G7) · `AURIX-MOBILE-LITE/RC3/INSPECTOR` · `AURIX-RENDER-CONTRACT`.
Cualquier fallo de guardrail móvil = cancelar.
