# AURIX · COHERENCIA, RETENCIÓN PREMIUM Y ACABADO — NOTA DE REANUDACIÓN

Registrada: 2026-10-06. Encargo: «SPEC ÚNICO — COHERENCIA, RETENCIÓN PREMIUM Y ACABADO» + «CIERRE SEGURO, RESPALDO Y PLAN ÚNICO DE REANUDACIÓN».
**Nada de esto está en producción.** No se ha hecho merge.

## Estado del repositorio

| Elemento | Valor |
|---|---|
| Rama de trabajo | `aurix/coherence-premium` — worktree `~/claude-test/portfolio-coherence` |
| Base | `b913134` (= `origin/main` = producción v800-dash-order / appjs 760, verificado con `curl version.json` el 2026-10-06) |
| HEAD | el commit que añade esta nota (sobre `ba95926`); respaldado en `origin/aurix/coherence-premium` |
| Rama de demo | `demo/coherence-premium` — worktree `~/claude-test/portfolio-demo` = HEAD de trabajo (hasta `e9377c3`) + `cec1934`/`74331c2` (entorno demo, cherry-pick de `demo/audit-env`); respaldada en `origin/demo/coherence-premium` |
| `main` | sin tocar. El repo principal (`~/claude-test/portfolio`) está en `dashboard/order-plans` = `b913134` |
| Cambios sin commit | ninguno al cerrar |
| Build de la rama | `v801-coherence` · appjs 761 · loginhtml 491 |

## A. IMPLEMENTADO (commit local + respaldado en remoto; NO en producción)

| Commit | Cambio | Causa | Archivos |
|---|---|---|---|
| `c2c24c8` | Cuelgue de WebKit de escritorio | `window.auditAurixRenderVsCanonical = (r) => auditAurixRenderVsCanonical(r)` sustituye la función de nivel superior por una flecha recursiva; `renderWealthCurve` la llama en cada pintado de escritorio. Chromium: RangeError silenciado; JSC ('use strict', llamadas de cola) no vuelve. Mismo patrón en `computeAurixTWRSeries` (sólo diagnóstico) | app.js |
| `4f915ce` | Cierre de posición durable | `lifecycleStatus='closed'` sólo vivía en memoria; tras recargar la fila volvía activa a 0. Ahora viaja en el jsonb de holdings (sin esquema nuevo). Filas antiguas: cerradas sólo con cantidad canónica 0 + coste 0 + operaciones que netean a 0 (endurecido por revisión financiera) | app.js, docs/AURIX-UNKNOWN-QUANTITY-INTEGRITY-harness.js |
| `29c11d9` + `e9377c3` | Diario en la divisa del documento; Hero «Patrimonio invertible» | **Defecto de PRESENTACIÓN**: el total (4.852) era correcto en la divisa del diario (EUR); filas/vista previa usaban `formatBase` (símbolo de la divisa BASE, sin convertir), unidades «€» literal y borrador con divisa base ⇒ con base USD parecían dólares. **No hay suma sin conversión confirmada.** Divisa elegible sólo con diario vacío. Resultados guardados: `netProfit` null (no 0) + divisa. Hero: la etiqueta «Valor total» mostraba patrimonio invertible (decisión 2026-06-04) | app.js, index.html, docs/AURIX-WORKSPACE-CATALOG-PERSISTENCE-harness.js |
| `19e5295` | Retirar liquidez | Hoja de venta de unidades reutilizada; `display:flex` anulaba `[hidden]` («Valor de la operación —»). Ahora: «Retirar liquidez», importe en su divisa, saldo restante | app.js, styles.css |
| `9719273` | Escenarios / Guardar / Tus planes | (1) `_wsbCompare` sin validación: proyectaba desde 0 sin base → `publishable` gobierna tarjetas, impacto, gráfico, conclusión y guardado. (2) la canonización en `focusout` re-emitía el mismo valor, ensuciaba y repintaba la barra entre mousedown/mouseup → primer clic perdido. (3) «Comprobando tus planes» esperaba `_wsDocsPull`, que nunca se invoca | app.js, docs/AURIX-DASHBOARD-PLANS-harness.js |
| `1498960` | Intelligence: pregunta estable + refresco | La impresión mandaba la pregunta a su cooldown y al volver salía otra; la pestaña sólo se pintaba al entrar (sin refresco al hidratar o al cambiar activos) | app.js |
| `7907fee` + `2b2d5d2` | Acceso X Android, build visible, movimiento reducido | Android: `window.open` recargaba en la misma WebView (bucle) → `intent://…;scheme=https;S.browser_fallback_url` vía `location.assign` (el verificador `aurix-build-site.mjs` bloqueaba `href='intent://'`). Ajustes: build era literal «v1.0 · 2026.05». aurora-bg/orb sin reduced-motion | login.html, index.html, aurora-bg.js, orb.js, docs/AURIX-AUTH-EMBEDDED-BROWSER-CONVERSION-harness.js |
| `c1fbdda` | Bump v801-coherence / 761 / login 491 | cuatro fuentes de appjs juntas + `?v=` en aurora-bg/orb | version.json, index.html, app.js, login.html |
| `7381fd4` | Harness `docs/AURIX-COHERENCE-PREMIUM-harness.js` | owners reales de cada defecto + invariante «ninguna `window.X = (…) => X(…)`» (detecta los 2 casos de producción) | docs/ |
| `ba95926` | 20 capturas de evidencia | — | docs/coherence-premium/ |

**Aserciones re-decididas (4), con la razón escrita en el propio harness:** DASHBOARD-PLANS 3.1 («unknown» sin petición en vuelo ⇒ empty; añadida «escritura en vuelo ⇒ loading»), EMBEDDED 5.2/5.3 (intent:// sólo Android con fallback; sigue prohibido forzar navegador; nueva 5.2b), CATALOG-PERSISTENCE 1.10c/7.8/8.11 (divisa elegible sólo con diario vacío; nueva 8.12 de comportamiento), UNKNOWN-QUANTITY 30.3 (llamada declarada `_aurixHoldingIsClosed`). **PENDIENTE: revisar su justificación y cobertura equivalente** (ver D).

## B. VERIFICADO (qué, dónde, resultado, límites)

- Gate completo `node scripts/aurix-ci-gate.mjs` sobre la rama (hasta `e9377c3`): **GO 290/290, 317 s**, local, sin nada en paralelo. (Dos pasadas previas NO-GO por timeouts de 120 s causados por contención de CPU; el harness ADVANCED-INTELLIGENCE-CLOSURE tarda 70 s igual en producción.)
- Harness focal COHERENCE-PREMIUM: **31/31** (node, owners extraídos de app.js).
- `aurix-build-site.mjs`: SITIO OK, 67 ficheros, 0 referencias sin resolver.
- Sonda de demo `scripts/aurix-demo-probe.mjs` (artefacto LOCAL): **120/120 GO** — Chromium y WebKit, móvil y escritorio, incl. WebKit 1440 completo (antes limitación conocida).
- Sonda WebKit `switchLang('en')` a 1024: antes TIMEOUT >30 s; después 100 ms. `renderWealthCurve` 14–20 ms.
- Capturas (demo local, datos ficticios, base USD): Chromium/WebKit × 390/1440 — hero, retirar liquidez, Diario, Escenarios sin base, Ajustes tras `switchLang` (5–10 ms), sin errores de página.
- Revisión financiera adversarial (agente) del bloque de persistencia: 1 hallazgo medio corregido (cierre heredado), resto PASS.
- **Límites:** ningún flujo autenticado real (OTP-only); Supabase falso en demo; sin dispositivos físicos; sin Safari real (WebKit de Playwright ≠ Safari); sin pagos. **El gate NO certifica los recorridos pendientes.**

## C. RESPALDADO / PUBLICADO

- Rama remota: `origin/aurix/coherence-premium` (repo rbn888/Aurix) — HEAD = commit de esta nota.
- Rama remota de demo: `origin/demo/coherence-premium`.
- **Demo de revisión:** repo `rbn888/aurix-demo`, commit `70ead04`, SOLO bajo `v801/` (102 ficheros, 0 fuera de `v801/`). URL: `https://rbn888.github.io/aurix-demo/v801/demo.html` — **pendiente de verificar que Pages la sirve** (daba 404 justo tras el push). La demo raíz (v759 + propuesta onboarding/premium) NO se tocó.
- **Producción: SIN CAMBIOS** — `app.aurixsystem.io/version.json` = v800-dash-order / appjs 760 (2026-10-06).

## D. PENDIENTE

### Decisiones tomadas por el founder (a IMPLEMENTAR al reanudar, no implementadas)
1. **Divisas de documentos** (Objetivos, Presupuesto, Cobros, Inmobiliario, Préstamo, Interés compuesto, Escenarios — hoy sin moneda, pintan con `formatBase`):
   - nuevo documento: moneda explícita guardada al crear;
   - antiguo sin moneda: conservar importes, estado «sin declarar», pedir elección CONFIRMADA; nunca asignar la base actual por suposición;
   - recuperar de metadatos sólo con evidencia inequívoca;
   - cambiar la base no redenomina ni sobrescribe;
   - sin moneda declarada: sin símbolo inventado y fuera de agregados incompatibles.
2. **Tipo USD/EUR** (`usdToEur = 0.92` fijo en app.js ~L12083, comentario «updated from API» falso): integración mínima con el sistema existente (`_aurixFxRefresh` ya trae GBP/CHF/JPY vía proxy); fuente, cobertura, fecha efectiva, caché, actualización, fallos; sin secretos en frontend; último conocido ≠ actualizado; no recalcular histórico con el tipo de hoy; validar ausencia, obsolescencia, conversión, recuperación. **Riesgo financiero alto: revisión financiera obligatoria.**
3. **Salud:** unificar superficies con el owner canónico vigente (SALUD V2 `_aurixIntelHealth`); retirar el diagnóstico antiguo (`_aurixHealthScore`: chip Dashboard `renderAurixSignal`, Workspace `_aurixWorkspaceIntelligence`, cockpit, anillo) donde lo contradiga; sin tocar umbrales; explicar qué mide (concentración ≠ riesgo global); conservar composición aprobada. Caso: 100 % liquidez ⇒ «Riesgo elevado» (−20 categoría, −25 un activo, −10 cash).
4. **Sincronización Workspace** (`_wsDocsPull` existe y nunca se llama): revisar modelo remoto, RLS, identidad por cuenta, conflictos; lectura vacía/tardía nunca sobrescribe local ni pendientes; errores visibles + reintento; probar 2 cuentas/dispositivos, sesiones, red fallida, edición simultánea; si requiere migración: alcance + reversión ANTES.
5. **Compras/ventas:** mantener posiciones independientes sin mover efectivo; explicarlo brevemente donde corresponda (Aurix registra, no ejecuta).

### Implementación / investigación / QA NO ejecutada (no cuenta como aprobada)
- Recorrido de las nueve capacidades (Diario, Objetivos, Escenarios, Presupuesto, Cobros, Inmobiliario, Interés compuesto, Préstamos, Comparador): monedas, cálculos, datos ausentes, límites, guardado, edición, reapertura, documentos distintos, renombre, favoritos, eliminación/duplicación.
- Casos protegidos a re-ejecutar explícitamente: liquidez 1.000−250=750; retirada excesiva bloqueada; Microsoft 30+2−1=31 (cubierto en COHERENCE 1.3); objetivo 250/1.000=25 %; cobro 2×100−50=150; préstamo 1.000 a 0 %/1 año=83,33/mes; compuesto 1.000 sin aportes/tasa=1.000.
- Formulario inmobiliario: moneda efectiva y vocabulario (sin custodios genéricos).
- Liquidez: flujo «Añadir» (sólo se revisó «Retirar»).
- Cierre de posiciones: recuentos e historial en UI real tras recarga; efecto sobre usuarios con posiciones totalmente vendidas (dejan de contar como activas).
- Separación entre cuentas, preferencias, documentos y dispositivos; logout/login; Free→Premium.
- No mostrar cartera vacía durante la carga (no verificado).
- ES/EN completo, teclado móvil, entradas numéricas (escribir/borrar/sustituir/pegar, miles/decimales ES/EN), guardar con teclado abierto, recarga, red lenta, guardado fallido, doble pulsación.
- Intelligence: duplicaciones («Qué ha cambiado» puede repetir lo del hero/Memoria), memoria, frescura, explicaciones completas, siguientes pasos útiles; analítica (activación, primer plan, retorno; ampliación mínima sin importes).
- UX: contraste medido (divisas, labels, notas, errores, gráficos, iconos, foco/hover/disabled), tipografía, cards, formularios (unidad junto al campo, errores cercanos), iconos accesibles y táctiles, logos fiables con fallback, negro/azul eléctrico coherentes, móvil/tablet/escritorio, zoom, movimiento reducido (halos/estrellas detrás del contenido).
- Preservar orden Dashboard/Tus planes, apertura de documentos arriba, retorno de scroll (verificar que nada de esta rama lo rompe).
- Market: búsqueda, identidad, filtros, seguimiento, precios, fuente, moneda, frescura, errores (los guiones de demo no son bugs del feed).
- Cuenta, soporte, diagnóstico, versión (login.html conserva `AURIX_BUILD='pwa-consistency-2-lr3'` y pie «v1.0»), mensajes honestos de demo; notificaciones, importar/exportar, Otros activos/RWA: mensajes acordes a disponibilidad.
- Registro/onboarding, selector ES/EN, reanudación, membresía. **QA física pendiente.** No pagos reales ni resets de usuarios.
- Acceso desde X: Android pendiente de QA física; iOS documentar señales/límites (SFSafariViewController sin token «Twitter»; destino profundo se pierde porque `app.js` redirige a login sin query) y fallback sin bucle; no prometer apertura forzada ni detección infalible.
- Justificar las 4 aserciones re-decididas y su cobertura equivalente.
- No añadir chatbot ni herramientas nuevas.

## E. PRÓXIMO PASO EXACTO AL REANUDAR

1. `cd ~/claude-test/portfolio-coherence && git fetch origin && git status && git log --oneline origin/main..HEAD` — confirmar que `origin/main` sigue en `b913134` (si avanzó: rebase de la rama sobre él antes de nada) y que no hay cambios sin commit.
2. `curl https://rbn888.github.io/aurix-demo/v801/demo.html` (200) y `AURIX_DEMO_URL=https://rbn888.github.io/aurix-demo/v801/ AURIX_PW=/tmp/aurix-pw/node_modules/playwright/index.mjs node scripts/aurix-demo-probe.mjs` desde `~/claude-test/portfolio-demo` (Playwright en /tmp puede haberse borrado al reiniciar: `mkdir -p /tmp/aurix-pw && cd /tmp/aurix-pw && npm i playwright && npx playwright install webkit chromium`).
3. Empezar por la decisión 1 (divisas de documentos), commit propio; luego 2 (tipo USD/EUR, con revisión financiera); luego 3 (Salud); 4 (sync) sólo tras presentar alcance; 5 (texto).
4. Después, el recorrido de las nueve capacidades y el resto de D.

## Método (vinculante al reanudar)
Confirmar build actual; no reabrir lo resuelto; cambios mínimos y commits por bloque; sin resets, cambios de precios/permisos ni migraciones por suposición; pruebas focales + gate completo al cierre (sin otras cargas en paralelo); no relajar tests para esconder defectos y registrar cambios legítimos de requisitos; demo de revisión en subruta independiente, sin tocar la demo raíz; cada punto como corregido y probado / ya resuelto / limitado por entorno / pendiente; **no ejecutado ≠ aprobado**; no publicar producción hasta revisar resultado concreto, decisiones financieras y evidencia.

## Reversión
- Nada desplegado: descartar = no hacer merge. Tras un futuro merge: `git revert <commit>` del bloque (tabla A); el bump `c1fbdda` se revierte junto al último bloque retirado o se re-bumpea.
- Sin migraciones ni SQL. El campo `lifecycleStatus/closedAt` en holdings es aditivo: un cliente antiguo lo ignora y la regla heredada lo re-deriva.
- Demo: `git revert 70ead04` en rbn888/aurix-demo (o borrar `v801/`); la raíz no depende de ella.
