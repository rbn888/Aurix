# AURIX MONETIZATION V1 · M.01B — Workspace Monetization Surface

Estado: **implementado como PRESENTACIÓN**. No hay pago, ni checkout, ni entitlement
comercial, ni bloqueo real. Este documento existe para una sola cosa: dejar escrito
qué falta para conectar la frontera declarada a un entitlement de verdad.

## Lo que este bloque deja construido

| Pieza | Owner | Naturaleza |
|---|---|---|
| Tres secciones (Mi espacio · Plantillas · Herramientas) | `TABS` en `_renderWorkspaceHome` (app.js) | arquitectura visible |
| Estado honesto de Plantillas (catálogo vacío ⇒ nota, no galería) | `.wsh-tplarch` + `wstpl_arch_*` | presentación |
| Frontera comercial declarada | `_WS_APP_IDENTITY[<id>].premiumTier` | **fuente única** |
| Chip de plan del catálogo | `_wsToolTier()` / `_wsTierChip()` | presentación |

`premiumTier` ya existía en el registro de identidad y era puramente descriptivo.
M.01B lo convierte en la única fuente de la frontera visible: `compound_growth: 'free'`,
`loan_simulation: 'premium'`. Cualquier otro valor (`'core'`, `'soon'`, ausente) **no
pinta chip**: no se afirma un plan que el producto no ha decidido.

## Lo que NO se ha hecho, deliberadamente

- **No se bloquea la apertura de Loan.** No existe un entitlement server-authoritative,
  así que fabricar el bloqueo sería seguridad comercial falsa: cualquiera podría
  saltárselo desde el cliente y, peor, el producto empezaría a *prometer* un candado
  que no existe.
- **No se ha tocado `ENFORCE_ENTITLEMENTS`** (sigue `false`: todo desbloqueado para
  todos los tiers, que es el contrato de prelanzamiento).
- **No se decide qué plantilla será FREE.** El catálogo público de plantillas sigue
  vacío y ninguna se publica en este bloque.

## Hecho de plataforma que condiciona la lectura comercial

Workspace **completo** está hoy detrás de `hasAurixPremiumAccess(user)` en
`renderWorkspace()`: quien no es el owner (email autenticado) ve el preview
"Workspace se está preparando", no el catálogo. Es decir: hoy **ningún usuario Free
llega a ver Compound**, aunque Compound esté declarado FREE. La frontera Free/Premium
dentro de Workspace no es efectiva hasta que se decida abrir la sección al plan Free
— decisión de producto, fuera del alcance de M.01B, y con impacto directo en
activación (una sección publicada sin nada usable convierte peor que una sección con
una herramienta real dentro).

## Para conectar el entitlement real (bloque posterior)

1. Registrar la clave del catálogo premium: reutilizar `workspace_advanced` de
   `PREMIUM_FEATURES`, o añadir una clave propia por herramienta si la frontera va a
   ser por herramienta y no por sección.
2. Mapear `premiumTier` → clave de feature en **un** punto (no repartir el mapa por
   las tarjetas). El catálogo y las tarjetas no deberían cambiar.
3. Gatear la **apertura**, no la tarjeta: envolver la rama `cta === 'tool'` /
   `_wsOpenTool(key)` en `requireFeature(<clave>, () => _wsOpenTool(key))`. La tarjeta
   sigue visible y descubrible; lo que cambia es qué pasa al abrir.
4. Hacer el tier **server-authoritative**: hoy `getPlan()` lee `localStorage`
   (`aurix_plan`), que el usuario controla. Sin tier verificado en servidor, el paso 3
   es UX, no cobro.
5. Sólo entonces flipar `ENFORCE_ENTITLEMENTS`.

## Gate

`docs/AURIX-WORKSPACE-FORMULA-INTEGRITY-harness.js`, bloque `M.01B` (M1–M20): protege
que las tres secciones existen, que no se publica contenido inventado, que la frontera
vive en una sola fuente, que **no** hay gating fabricado y que la tarjeta Premium no
parece deshabilitada. `L13` queda superado y anotado en el propio harness.

## FASE D — plantillas y renderers preservados (auditoría, sin tocar contenido)

Criterio aplicado, el que ya decidió WORKSPACE-LAUNCH-V1: se publica lo que tiene
matemática comprobada **y** no promete una permanencia que la arquitectura no da
(`aurix_ws_*_v1` no viaja en el payload de sync). Ninguna se publica aquí.

**A · suficientemente terminada para futura exposición — NINGUNA.**
Ninguna de las preservadas tiene su matemática cubierta por un gate, y ninguna queda
fuera del prerrequisito de sync. Las dos que sí cumplen la regla (compound, loan) ya
están publicadas.

**B · necesita polish (candidatas reales, defecto conocido y acotado)**

| Superficie | Owner | Qué le falta |
|---|---|---|
| Presupuesto mensual | `_renderBudgetTool` | 1 símbolo `€` hardcodeado (la misma clase de defecto corregida en compound/loan). Además ya está juzgada como "formulario, no la hoja editable de la visión" |
| Plantillas `networth` · `property` · `business` · `fire` (y `investment`, `budget` del mismo registro) | `_ws4Templates` / `_renderWorkspaceDetail` | 12 unidades `€` hardcodeadas mientras los resultados salen por `formatBase()`; guardan proyecto sólo en localStorage |
| Proyección | vista `planning` (`_wsp*`) | Calculadora sin dataset de usuario, pero su matemática no está cubierta por ningún gate |

**C · no apta para lanzamiento hoy**

| Superficie | Owner | Causa |
|---|---|---|
| Diario de operaciones · Inmuebles · Cobros · Precios de activos | `_renderJournalTool`, `_renderRealEstateTool`, `_renderReceivablesTool`, `_renderAssetPricesTool` | Son **apps de datos**: el usuario introduce filas que sólo viven en localStorage ⇒ prometerían permanencia. Prerrequisito: **Workspace Sync** |
| Objetivos · Escenarios | vistas `goals` / `scenario` | Guardan artefactos con nombre del usuario ⇒ mismo prerrequisito |
| Calculadora financiera · Analizador de inversión | — | **No existen**: eran `soon: true`, sin renderer ni owner |

Ningún renderer se ha borrado ni modificado (asserts L16/L17 del gate). Reponer
cualquiera sigue siendo **una línea de catálogo**.
