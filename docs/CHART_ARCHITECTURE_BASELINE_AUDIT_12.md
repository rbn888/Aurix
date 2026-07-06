# CHART ARCHITECTURE — BASELINE AUDIT

**SPEC:** `DSH.CHART.ARCHITECTURE-DATA-LINEAGE.BASELINE-AUDIT.12`
**Fecha:** 2026-07-06
**Naturaleza:** read-only, sin cambios funcionales ni visuales. Este documento + `window.aurixChartArchitectureAudit()` + su harness son la **línea base** para decidir con evidencia qué pieza del gráfico se **conserva / refactoriza / reemplaza**. **No se arregla nada aquí.**

> Todas las líneas `app.js:N` son anclas de evidencia sobre el estado del repo en el commit de este SPEC. Los "puntos" del historial son **untagged** (no llevan `portfolioRevision` / `accountId` / `lifecycleId` / `source` por punto salvo el backend, que sí lleva `source:'backend_snapshot'`). Por eso **epoch / familia / segmento son heurísticas DERIVADAS, no verdad almacenada** — esto es la raíz de varias deudas técnicas de abajo.

---

## 1. Diagrama textual del pipeline completo

```
ESCRITURA (produce puntos)                         LECTURA (consume puntos)
──────────────────────────                         ────────────────────────
assets[] ── recordCategorySnapshot() ──┐           _aurixHistorySourceForDisplay()  ← EL chokepoint de lectura
  app.js:9330                          │             app.js:929
  · buckets por categoría              │             authed && canonical? → _aurixCanonicalCatHistory (remoto)
  · guard: _aurixGuardSnapshot         │             else                 → categoryHistory (local)
  · material-change 1% / 5s upsert     │                    │
        │                              │                    ├─ merge backend (flag) ─ _aurixMergeSnapshotSources  app.js:902
        ▼                              │                    │     · fe-authority ±60min (time-only)
  categoryHistory (local, cache)       │                    │     · near-dup backend↔backend
  app.js: HISTORY / categoryHistory    │                    ▼
        │  (union-by-ts, LWW push)     │           _aurixHpqRawStages(range)  app.js:23243
        ▼                              │             ├─ _aurixTrustedChartSource (epoch trust)  app.js:23181  [flag]
  Supabase user_portfolios            │             │     · age floor (created_at, reset epoch, chart epoch)
  · category_history[]                 │             │     · value-band [0.25×,2.5×] del último investable
  · performance_state                  │             ├─ _aurixApplyRangeSourceAuthority(range)  app.js:23232  [flag]
        │                              │             │     · 24H: si frontend usable ⇒ excluye TODO backend
  _mergeRemoteState(row)  app.js:1621  │             ├─ normalize (total−real_estate → base ccy), validate
  · _aurixCanonicalCatHistory = remoto─┘             ├─ dedupe determinista por ts (value asc tie-break)
  · hashes remoto/aplicado                           └─ future/stale outlier trim (>365d gap)
  · _aurixCanonicalHistoryLoaded=true                        │
        │                                                    ▼
  BACKEND (scheduler, tabla aparte)                  buildValidatedHistoricalSeries(range)  app.js:23368
  portfolio_snapshots ─ _aurixFetchBackendSnapshots  │  Stage7 spike quarantine  app.js:23321
  app.js:996  →  _aurixBackendSnapshots[]            │  Stage8 construction-prefix trim  app.js:23301
        (RLS-safe select, nunca escribe)             │  Stage9 plateau cleanup
                                                     │  Stage10 range extraction (anchor = last ts, no Date.now)
                                                             │
                                                             ▼
                                                     buildProductionPortfolioChart(range)  app.js:23497
                                                     · reconcile gate (authed ⇒ espera canonical)  app.js:23525
                                                     · badge = _aurixComputePeriodReturn (flow-neutral)  app.js:23461
                                                     · ALL/TOTAL maturity trust gate  app.js:23631
                                                     · displayedRangeState: full / partial_history / all_history
                                                             │
                                                             ▼  points:[{ts,value}], state, badge, chartHash
                                                     renderValidatedPortfolioChartWithInstitutionalRenderer  app.js:23877
                                                     · LTTB downsample → monotone-cubic + area
                                                     · _aurixStructuralBreaks → split en subpaths  app.js:(structuralBreaks)
                                                     · fallback: _aurixEmergencyBuildSvg (polyline)  app.js:23695
```

**Autoridades clave:**
- `_aurixHistorySourceForDisplay()` es **el único chokepoint** que decide fuente base (remoto vs local) y fusiona backend.
- El **badge** y la **línea visible** leen del **mismo** `buildProductionPortfolioChart`/`buildValidatedHistoricalSeries` → no pueden discrepar en datos… **pero el renderer aplica un corte de subpaths propio** que la línea del badge no ve (ver §6).

---

## 2. Tabla de fuentes de datos

| Fuente | Quién escribe | Cuándo | Persiste en | user_id | portfolioRevision | lifecycleId | source tag | ts confiable | Sobrevive logout/reset | ¿Contamina otros rangos? |
|---|---|---|---|---|---|---|---|---|---|---|
| `categoryHistory` (local) | `recordCategorySnapshot` app.js:9330 | cada ~30s + on add/edit/delete | localStorage `HISTORY`/cat | no (implícito por device) | **no** | **no** | no | sí (`Date.now()`) | reset: filtrado por epoch; logout: queda en device | **sí** si epoch/band no lo recorta |
| `_aurixCanonicalCatHistory` (remoto) | `_mergeRemoteState` app.js:1642 | boot + focus reconcile | memoria (desde `user_portfolios.category_history`) | **sí** (fila del usuario) | **no** | **no** | no | sí | sí (autoridad) | sí (histórico multi-epoch sin tag) |
| `portfolio_snapshots` → `_aurixBackendSnapshots` | scheduler backend + `_aurixFetchBackendSnapshots` app.js:996 | programado (cron) / autoload | tabla Supabase → memoria | **sí** | no | no | **`backend_snapshot`** | sí (timestamptz→ms) | sí | **sí** — gap-filler; en 24H se excluye si frontend usable |
| Live point | tail de categoryHistory/canonical | continuo (30s) | igual que local/remoto | hereda | no | no | no | sí | igual | no (es el último punto) |
| `performance_state` (remoto) | `_mergeRemoteState` app.js:1630 | boot reconcile | `user_portfolios.performance_state` | sí | n/a | n/a | n/a | n/a | sí | no (no alimenta la línea) |
| `_aurixRemoteHistoryDiag` | `_mergeRemoteState` app.js:1648 | boot | memoria (forense) | sí | no | no | no | sí | no | **no** (nunca leído por display/return) |

**Hecho crítico:** ninguna fuente de la **familia frontend** (local/remoto/live) lleva `portfolioRevision`, `lifecycleId`, `accountId` **ni `source`** por punto. Solo el backend lleva `source`. → toda separación de epoch/cuenta es **derivada**.

---

## 3. Tabla de consumidores

| Función | Fuente que lee | Filtros que aplica | Filtros que NO aplica | Rango | Impacto visual |
|---|---|---|---|---|---|
| `_aurixHistorySourceForDisplay` app.js:929 | canonical/local + backend | selección remoto/local, merge backend | epoch, band, account-age, range-authority | todos | define universo base |
| `_aurixMergeSnapshotSources` app.js:902 | base + backend | fe-authority ±60min (time-only), near-dup backend | **range-awareness**, epoch, band | todos | decide qué backend sobrevive |
| `_aurixTrustedChartSource` app.js:23181 | source | age floor + value-band [0.25×,2.5×] | **range-awareness** (band global, no por rango) | todos | recorta epochs foráneos por valor |
| `_aurixApplyRangeSourceAuthority` app.js:23232 | source, range | **solo 24H**: excluye backend si frontend usable | 7d/30d/1y/all (no toca) | 24H | mata cruce backend→remoto en 24H |
| `_aurixHpqRawStages` app.js:23243 | source, range | normalize, validate, dedupe determinista, future/stale | — | todos | base validada |
| `buildValidatedHistoricalSeries` app.js:23368 | rawStages | spike / construction / plateau / range-extract | — | todos | serie limpia |
| `buildProductionPortfolioChart` app.js:23497 | validated | reconcile gate, coverage, ALL maturity | — | todos | points + badge + state |
| `_aurixComputePeriodReturn` app.js:23461 | first/last | flow-neutral, sane-band, min-base | comparabilidad epoch/familia explícita | todos | % del badge |
| `renderValidatedPortfolioChartWithInstitutionalRenderer` app.js:23877 | points | LTTB, monotone-cubic, **_aurixStructuralBreaks split** | — | todos | **CORTA la línea en subpaths (islas visibles)** |

---

## 4. Tabla de flags actuales

| Flag | Default | Efecto | Rollback | Tests |
|---|---|---|---|---|
| `_AURIX_BACKEND_SNAPSHOTS_ENABLED` app.js:871 | `true` | habilita merge backend | `false` → NO-OP | BACKEND-SNAPSHOTS, SOURCES-CONSISTENCY |
| `_AURIX_BACKEND_SNAPSHOTS_AUTOLOAD` app.js:889 | `true` | dispara read tras auth | `false` | BACKEND-SNAPSHOTS |
| `_AURIX_CHART_EPOCH_TRUST` app.js:23179 | `true` | age-floor + value-band epoch trim | `false` | POINT-LINEAGE, 24H-FE-AUTHORITY |
| `_AURIX_CHART_24H_FE_AUTHORITY` app.js:23212 | `true` | 24H frontend-first, excluye backend | `false` | 24H-FRONTEND-SOURCE-AUTHORITY |
| `_AURIX_CHART_RECONCILE_GATE` app.js:23492 | `true` | authed espera canonical reconciled | `false` | DETERMINISM-NEW-ACCOUNT |
| `_AURIX_BRIDGE_SEG_ENABLED` app.js:23732 | `true` | corta subpath en bridge gaps | `false` | 24H-BRIDGE-SEGMENTATION |
| `_AURIX_CAPITAL_STEP_SEG_ENABLED` app.js:23770 | `true` | corta subpath en capital steps | `false` | BRIDGE-SEGMENTATION |
| `_AURIX_ORPHAN_CLEANUP_ENABLED` app.js:23783 | `true` | salta micro-isla interior ≤2 pts | `false` | V480-RUNTIME-CLEANUP |

---

## 5. Tabla de tests / harness (chart) existentes

| Harness | Cubre |
|---|---|
| `AURIX-CHART-24H-FRONTEND-SOURCE-AUTHORITY` | source authority 24H (GATE OFF vs ON) |
| `AURIX-CHART-24H-BRIDGE-SEGMENTATION` | corte de subpaths por bridge |
| `AURIX-CHART-POINT-LINEAGE-DISCONTINUITY` | islas/needles/pre-account/epoch trust |
| `AURIX-CHART-DETERMINISM-NEW-ACCOUNT` | shape determinista por reload |
| `AURIX-CHART-NEW-ACCOUNT-TOTAL-TRUST` | TOTAL neutro en cuenta nueva |
| `AURIX-CHART-BACKEND-SNAPSHOTS` | merge backend NO-OP hasta activación |
| `AURIX-CHART-RETURNS-FLOWNEUTRAL` / `-LEDGER` / `-RETIMING` | badge flow-neutral |
| `AURIX-CHART-TRUTHFUL-RANGES` / `-INSTITUTIONAL-DATA-TRUTH` | coverage / partial_history |
| `AURIX-CHART-QUALITY-GATE` (+V2) / `-VISUAL-COMPLETION` | quarantine visual |
| `AURIX-PRODUCTION-PORTFOLIO-CHART` / `-EMERGENCY-CHART-RECOVERY` | pipeline core |
| `AURIX-CHART-ARCHITECTURE-BASELINE-AUDIT` **(nuevo, este SPEC)** | auditor arquitectónico read-only |

Baseline suite antes de este SPEC: **110/110 verde**.

---

## 6. Deudas técnicas confirmadas (con evidencia)

1. **Puntos untagged.** La familia frontend no lleva `portfolioRevision`/`accountId`/`lifecycleId`/`source` por punto (`recordCategorySnapshot` app.js:9349 escribe solo ts+buckets). → epoch/cuenta/familia se derivan por heurística de valor/tiempo. Raíz de casi todo lo demás.
2. **Doble filosofía de filtrado.** El path del **return** usó históricamente age-gate + value-band; el path **visible** solo los ganó en `.10` vía `_aurixTrustedChartSource`. Aún así el trust es **global, no por rango** (band anclado al último valor, no re-evaluado por ventana).
3. **fe-authority time-only en el merge** (app.js:916) es range-agnóstico; `.11` parchó 24H fuera del merge (`_aurixApplyRangeSourceAuthority`) pero 7d/30d/1y/all siguen mezclando familias.
4. **El renderer corta la línea por su cuenta.** `_aurixStructuralBreaks` (bridges ∪ capital-steps ∪ sparse-ramps) parte la curva en múltiples `M…` subpaths (app.js:23912). **Esto produce las islas visibles en 7D/30D/1A/TOTAL aunque los datos sean de un solo epoch/familia.** El badge no ve estos cortes → línea y badge pueden "contar historias distintas".
5. **`categoryHistory` local sigue siendo lecturable** como fuente cuando canonical no está (anon/offline), sin los tags que lo hagan comparable entre epochs.
6. **`buildValidatedHistoricalSeries` re-corre por rango** (no cachea) → costoso si se llama muchas veces (el propio auditor lo hace 5×; aceptable para diagnóstico, no para render caliente).

---

## 7. Riesgos abiertos

| Riesgo | Severidad | Nota |
|---|---|---|
| Islas visibles 7D/30D/1A/TOTAL por split del renderer | **alta** | §6.4 — no es dato falso, es geometría; pero se lee como discontinuidad |
| Cruce de familia/epoch en rangos largos (badge "ok") | media | epoch/family derivados; `crossSourceReturns`/`crossEpochReturns` del auditor lo miden |
| Trust band global (no por rango) deja pasar epoch foráneo intermedio | media | value-band ancla en último valor, no segmenta por ventana |
| Backend gap-filler puede seguir siendo first-point en rangos largos | media | autoridad de familia solo aplica a 24H |
| Determinismo depende de dedupe + reconcile gate | baja | cubierto por DETERMINISM-NEW-ACCOUNT (verde) |

---

## Entregable 4 — MATRIZ DE DECISIÓN

| MÓDULO | ESTADO | RIESGO | DECISIÓN PROPUESTA |
|---|---|---|---|
| Backend snapshots (`portfolio_snapshots`) | funciona como gap-filler/histórico | medio | **conservar** — mantener fuera de 24H cuando frontend usable (ya en `.11`) |
| Remote canonical history | autoridad de display authed | bajo | **conservar** — fuente de verdad |
| Local `categoryHistory` como fuente visible | cache + push-buffer | medio | **limitar** — nunca autoridad de display para authed; solo buffer |
| `_aurixMergeSnapshotSources` | fe-authority time-only | medio | **refactorizar** — meter range-awareness en el merge |
| Epoch trust (`_aurixTrustedChartSource`) | age-floor + value-band | bajo | **conservar** — considerar hacerla range-aware |
| Source authority (`_aurixApplyRangeSourceAuthority`) | solo 24H | medio | **ampliar** — autoridad validada por continuidad a 7d/30d/1y |
| Renderer smoothing / structural-break split | corta subpaths | **alto** | **auditar más** — es la causa viva de islas en rangos largos |
| Badge return path | flow-neutral + madurez | bajo | **conservar** — alinear su comparabilidad epoch/familia con la línea |
| Visible path | consume points pero re-corta | **alto** | **alinear** — misma serie continuity-validated que el badge |
| TOTAL/ALL | neutro hasta madurez | bajo | **mantener neutro** — funciona (gates `.06`) |
| 24H | frontend-first | bajo | **frontend-first** — mantener |
| 7D/30D/1A | backend histórico | medio | backend **solo con continuidad validada** (no first-point suelto) |

---

## Entregable 5 — SALIDA FINAL

**1. Qué ya está bien:**
- Chokepoint único de lectura (`_aurixHistorySourceForDisplay`) y de construcción (`buildProductionPortfolioChart`).
- Badge flow-neutral + gates de madurez ALL/TOTAL (`.06`) → no inventa % en cuenta nueva.
- 24H frontend-first (`.11`) + epoch trust (`.10`) + reconcile gate (`.09`) → 24H y determinismo por reload sólidos.
- Cero puntos sintéticos en todo el pipeline (verificado por el auditor y harness).

**2. Qué está duplicado:**
- Filtrado de confiabilidad en **dos** sitios con distinta filosofía (merge time-only vs epoch/band en rawStages vs autoridad 24H aparte). Tres capas que hacen variantes de "qué punto es confiable".
- Segmentación: el auditor/lineage derivan epochs por valor **y** el renderer corta por structural-breaks — dos nociones de "discontinuidad" no unificadas.

**3. Qué es peligroso:**
- El **split del renderer** (`_aurixStructuralBreaks`) — corta la línea visible sin que el badge lo sepa. Alto riesgo de "línea rota / islas" percibidas como bug de datos.
- Backend como potencial first-point en rangos largos.

**4. Qué debe congelarse (no tocar):**
- Reconcile gate, badge flow-neutral, gates ALL/TOTAL, 24H frontend-authority, dedupe determinista. Todo verde y estable.

**5. Qué necesita refactor:**
- Unificar las tres capas de confiabilidad en **una** noción de "serie confiable del epoch actual, por rango".
- Alinear la línea visible con esa misma serie (que el renderer no reintroduzca cortes que el badge no reconoce).

**6. Causa exacta de las islas que aún se ven en 7D/30D/1A/TOTAL:**
> **El renderer `renderValidatedPortfolioChartWithInstitutionalRenderer` (app.js:23877) divide la curva en subpaths `M…` en cada `structural break` detectado por `_aurixStructuralBreaks` (bridges ∪ capital-steps ∪ sparse-ramps).** En rangos largos con historia dispersa (backend gap-filler + saltos de capital reales + ramps), estos breaks son frecuentes → la línea se dibuja como varios trozos = islas. Los filtros de datos (`.10`/`.11`) trabajan sobre la **fuente**, pero **no** sobre la decisión de corte del **renderer**; y el `epoch trust` es **global (band por valor), no por rango**, así que un epoch foráneo intermedio dentro de la ventana larga puede sobrevivir y disparar un capital-step break. La combinación (datos multi-epoch/dispersos que sobreviven a la ventana larga + corte del renderer) es la que produce las islas. **No son datos falsos ni puntos sintéticos** (el auditor confirma `syntheticPoints:0`): es geometría de render sobre una serie que aún no está saneada por rango.

**7. Siguiente SPEC recomendado (NO implementar todavía):**
> **`DSH.CHART.CONTINUITY-UNIFICATION.13`** — hacer el `epoch trust` **range-aware** (segmentar la ventana al epoch actual también en 7d/30d/1y, no solo por band global) y **alinear el renderer**: que la línea visible consuma exactamente la misma serie continuity-validated que el badge, de modo que `_aurixStructuralBreaks` no reintroduzca cortes dentro del epoch actual confiable (sí conservar cortes en gaps temporales genuinos, marcados honestamente). Objetivo medible: `rendererMatrix[r].renderPathCount == 1` cuando `epochMatrix[r].sameEpoch == true` y no hay gap temporal real. Reversible por flag, con harness GATE OFF/ON.

---

## Auditor read-only asociado

`window.aurixChartArchitectureAudit()` — app.js (bloque de audits, tras `aurixChartPointLineageAudit`).
Devuelve JSON serializable con identidad, `dataSources`, `rangeDiagnostics` (24h/7d/30d/1y/all con los ~40 campos del SPEC), `sourceFamilyMatrix`, `epochMatrix`, `segmentMatrix`, `badgeMatrix`, `rendererMatrix`, `trustGateMatrix`, y agregados `gaps/islands/needles/crossSourceReturns/crossEpochReturns/stalePoints/futurePoints/preAccountPoints/untaggedPoints/recommendations`.
**PURA lectura:** no muta memoria/localStorage/remoto, no llama save/sync, no dispara snapshot, no toca UI, no cambia flags. Determinista (misma fuente ⇒ mismo objeto; único reloj es `accountAgeHours`, que no alimenta ningún hash).
Harness: `docs/AURIX-CHART-ARCHITECTURE-BASELINE-AUDIT-harness.js` (57 checks, cubre los 25 requisitos del SPEC).
