# AURIX · SPEC 1 — CIERRE DE FIABILIDAD FINANCIERA Y PERSISTENCIA · REGISTRO ÚNICO

Registrado: 2026-10-08. Sustituye como punto de reanudación a `docs/AURIX-COHERENCE-RESUME.md`
(que se conserva intacto: sus hallazgos siguen vigentes y se referencian aquí).
**Nada de esto está en producción. No hay merge a `main`.**

## 0. Estado real comprobado (2026-10-08)

| Elemento | Valor | Cómo se comprobó |
|---|---|---|
| Producción | `v800-dash-order` · appjs 760 · loginhtml 490 | `curl version.json` + `cmp` de `app.js` servido = `origin/main:app.js` (idénticos) |
| `origin/main` | `b913134` (no ha avanzado) | `git fetch` |
| Rama de coherencia | `aurix/coherence-premium` = `2ef385a` (intacta) | worktree `~/claude-test/portfolio-coherence` |
| Rama de demo | `demo/coherence-premium` = `2bd4613` (intacta) | worktree `~/claude-test/portfolio-demo` |
| Onboarding | `onboarding/premium` (no tocada) | — |
| **Rama de este trabajo** | `aurix/financial-reliability`, creada sobre `2ef385a` | worktree `~/claude-test/portfolio-coherence` |
| Demo v801 | `https://rbn888.github.io/aurix-demo/v801/demo.html` → 200 | curl |

Build de la rama: sigue declarando `v801-coherence` · appjs 761 (sin re-bump: no se despliega; el bump
corresponde al merge, ver §6).

## 1. Registro por estado

### PUBLICADO (en producción)
- Nada de este SPEC ni de la rama de coherencia.

### IMPLEMENTADO PENDIENTE (en rama, verificado, sin producción)
Heredado de `aurix/coherence-premium` (ver su nota, tabla A): WebKit/recursión de exportaciones,
cierre de posición durable, Diario en su divisa, retirar liquidez, Escenarios sin base, primer clic
de Guardar, «Comprobando tus planes», Intelligence estable, acceso X Android.

Nuevo en este SPEC:

| Commit | Bloque | Causa → cambio |
|---|---|---|
| `4be25af` | **Moneda de documento** (Objetivos, Presupuesto, Cobros, Inmobiliario, Préstamo, Interés compuesto, Escenarios) | Pintaban con `formatBase` (símbolo de la BASE sin convertir) y cada guardado re-sellaba `currency` con la base del momento → cambiar la base convertía «1.000 €» en «1.000 $». Ahora: moneda declarada al nacer (base visible), conservada al guardar, usada en campos, filas, totales, gráficos, Tus planes, Mis documentos y Mi espacio. Antiguos sin evidencia: «Moneda sin confirmar», cifras sin símbolo, confirmación explícita en el documento (sin preselección; sólo escribe la moneda). Diario: ya resuelto en `29c11d9`/`e9377c3`, no se re-toca. |
| `4be25af` | Guardado honesto ante fallo | Escenarios marcaba «Guardado» aunque la escritura fallara; Objetivos descartaba la copia de trabajo. Ahora conservan el trabajo, lo dicen y permiten reintentar. |
| `4be25af` | Hallazgo demo «objetivo no aparece en Mi espacio» | No era pérdida: Mi espacio publica sólo FAVORITOS (regla vigente) y el diálogo decía «Guardar en Mi espacio». Título → «Guardar documento». |
| `b92f45f` | **Doble envío** | Reproducido: con el foco en la hoja cerrada, un segundo Enter re-enviaba — liquidez 1.000 € → 2.000 € (2 operaciones) y alta de 30 MSFT → 60. Liquidez y alta de activo/inmueble ignoran un envío con la hoja cerrada (Reducir/Añadir/Transacción ya estaban protegidos). |
| `b92f45f` | Texto de compra/venta | «Aurix registra la operación en tu cartera; no mueve dinero ni descuenta tu liquidez.» (ES/EN; oculto en modo liquidez). Sin relación contable nueva. |
| (commit de sincronización) | **Lectura de documentos de Workspace** | `_wsDocsPull` no tenía llamador: los guardados Premium se subían a `workspace_documents` (existe en producción: sonda anónima → `42501`) pero ningún dispositivo los leía. Ahora una lectura por cuenta al resolverse el derecho; descarta la respuesta si la cuenta cambió en vuelo; «Tus planes» dice «comprobando» mientras lee y «error + reintentar» si falla. Fusión preexistente por revisión, sin sustituir la lista. |
| (commit de sincronización) | **Aislamiento entre cuentas** | Reproducido con dos cuentas sintéticas en la demo: B leía los parámetros de Escenarios de A (incluida la base de patrimonio declarada) y sus revisiones de preferencias. `aurix_ws_scn_params_v1` y el prefijo `aurix_ws_prefrev_` pasan al aparcado por cuenta existente. |

#### Continuación del SPEC 1 (2026-10-08, segunda entrega)

| Commit | Bloque | Causa → cambio |
|---|---|---|
| `da5023d` | **Moneda antigua: el sello ya no acredita** | El sello `currency` del último guardado era «la base visible al guardar»: si la base cambió antes de ese guardado, decía USD sobre importes tecleados en EUR. Ahora sólo cuentan `inputs.currency` (escrito al crear o al confirmar) y la moneda de las filas del Diario/Precios de activos. Con sólo el sello ⇒ «Moneda sin confirmar», importes intactos. Caso de prueba: presupuesto creado en EUR y re-guardado con base USD. |
| `138c12e` | **No resucitar borrados** | Entre `319d7b7` (09-16) y `52ccd7a` (09-17) borrar no dejaba tombstone: esas filas siguen vivas en remoto y son indistinguibles de «nunca estuvo en este dispositivo». La lectura **ya no añade** documentos ausentes en local (desactivado y documentado); sigue aplicando ediciones más nuevas y tombstones a los existentes. «Tus planes» dice «tu cuenta tiene documentos que este dispositivo no puede recuperar» en vez de «no tienes planes». Sin borrar filas remotas, sin SQL. |
| `014a1b5` + `8facbfc` | **Tipo EUR/USD fechado** | Ver abajo. |

**Tipo EUR/USD — CORREGIDO (antes «fallo reproducido / bloqueado»).**
- Fuente: la integración EXISTENTE — `EURUSD=X` (Yahoo Finance) por el proxy de precios de Aurix, sin
  credenciales en cliente ni coste. Es la MISMA fuente con la que el snapshot del SERVIDOR
  (`supabase/functions/portfolio-snapshot`, cada 15 min desde 2026-08-17) ya valoraba EUR: el histórico
  de producción mezclaba puntos de servidor al tipo real con puntos de cliente a 0,92 (≈3 % de
  diferencia). El argumento del bloqueo anterior («con el ancla un usuario sólo-EUR ve un gráfico plano»)
  era falso en producción. Alternativa evaluada: tipos de referencia del BCE (oficiales, diarios, sin
  coste) — el cliente no puede llamarlos (CSP `connect-src`) y añadir un endpoint exige desplegar la API
  (producción) y el plan Hobby no tiene margen de funciones: queda como mejora posible.
- `usdToEur` = 1 / EURUSD del último tipo fechado. Estados: **actual** (< 12 h), **último conocido**
  (con su fecha; total marcado aproximado) y **sin tipo** (0,92 sólo como respaldo marcado aproximado;
  nunca 1:1). Fuera de «actual», el write-guard existente (fx_approx) no persiste puntos de cliente.
- Visible (móvil: sólo «≈» + etiqueta accesible, el hero no cambia de forma; texto corto desde 768 px): Ajustes → «Cambio EUR/USD: 1 € = 1,1197 $ · Yahoo Finance · 08/10/2026, 14:05» (fecha del
  CAMBIO, distinta de la de los precios); el hero añade «≈» y «total aproximado: cambio EUR/USD no actual»
  sólo si la cartera necesita EUR↔otra moneda.
- Revisión financiera (2.ª): [alto] los flujos DERIVADOS de transacciones pasadas en EUR se convertían
  con el tipo de hoy (TWR cambiando cada día) ⇒ ahora con el ancla con la que se registró aquel escalón
  (determinista). [medio] GBP/CHF/JPY se declaraban actuales por el `ts` global ⇒ frescura por par.
  [medio] «sólo se refresca al arrancar» — no aplica: existe `setInterval(fetchExchangeRate, 1 h)`.
- Residual: los puntos de cliente ya guardados a 0,92 no se re-escriben (no se toca historia); el primer
  punto tras publicar sube ≈3 % sobre la parte en EUR (corrección, no rendimiento) — no comprobado si
  `suspicious_jump` lo pone en cuarentena. El ≈ sólo está en hero y Ajustes (no en gráfico/24H/Intelligence).

### FALLO REPRODUCIDO (sin corregir)
- Ninguno abierto de este SPEC.

### PENDIENTE DE COMPROBAR (no ejecutado ⇒ no aprobado)
- Sincronización REAL contra producción y entre dos dispositivos físicos (la demo usa Supabase falso
  y un id de usuario nuevo en cada acceso, así que «volver como A» no se ha podido ejercitar; sólo que
  lo de A queda aparcado). Requiere una cuenta sintética Premium autorizada en producción.
- Edición simultánea del MISMO documento en dos dispositivos: la fusión por revisión deja ganar a la
  última subida y no avisa (diseño preexistente, no cambiado).
- Usuarios reales con documentos antiguos: cuántos quedarán «sin confirmar» (sin SQL de lectura aquí).
- Coherencia cifra a cifra Dashboard ↔ categorías ↔ fichas ↔ Intelligence ↔ Workspace más allá de lo que
  certifica el gate (Hero = patrimonio INVERTIBLE, inmueble fuera — decisión 2026-06-04; Workspace no lee
  la cartera: `AURIX_WS_USE_REAL_DATA = false`).
- Comisiones en posiciones: la hoja de transacción no tiene campo de comisión (sólo el Diario) — no hay
  nada que verificar ni se añade.
- iPhone/Android reales, Safari real, teclado móvil físico.
- Comprobación de Intelligence en `probe-regressions` es superficial (sigue viva tras el cambio); el
  refresco lo certifica `AURIX-COHERENCE-PREMIUM` §5–6.

## 2. Hallazgos de la demo (bloque 5)

| Hallazgo | Veredicto |
|---|---|
| Interés compuesto/Escenarios quedan «Sin guardar» tras Guardar | **Producto, ya corregido en rama** (`9719273`). Reproducido en la demo equivalente a producción (raíz, v759): el primer clic de Guardar en Interés compuesto se pierde (canonización en `focusout` repinta la barra entre mousedown y mouseup). En la rama: 0 clics perdidos en CR/WK × 390/1440, local y en la demo v801 publicada. |
| Objetivo recuperado en la herramienta pero no en «Mi espacio» | **Regla vigente + copia engañosa**: Mi espacio = favoritos. Corregido el título del diálogo. |
| Volver tras editar un escenario no completaba | **No reproducido** en rama (CR/WK × 390/1440: vuelve a la portada). Nota: volver descarta los cambios pendientes sin aviso (comportamiento preexistente, fuera de alcance). |

## 3. Verificación (entorno, resultado)

Todo en local, sobre la demo aislada construida con el código de la rama (Supabase falso, red
bloqueada), Chromium y WebKit de Playwright (≠ Safari real), 390 y 1440:

| Prueba | Resultado |
|---|---|
| `docs/financial-reliability/probe-doc-currency.mjs` (fixtures B, C, E, F + sello re-guardado; ES/EN; recarga) | 120/120 |
| `docs/financial-reliability/probe-operations.mjs` (A, B, D; doble envío; cancelar; decimales ES) | 68/68 — sobre el build anterior falla (2.000 / 60) |
| `docs/financial-reliability/probe-sync.mjs` (ausentes NO se resucitan y se dice, ediciones y tombstones sí, sin pisar subidas pendientes, preferencias no aplicadas, carrera de cuenta, aislamiento) | 26/26 (CR/WK, 1440) |
| `docs/financial-reliability/probe-fx.mjs` (actual / último conocido / sin tipo; Ajustes y hero; móvil sin cambio de forma; por par; flujo derivado determinista; ES/EN) | 48/48 |
| `docs/financial-reliability/probe-regressions.mjs` (WebKit escritorio, idioma ≠ moneda, Intelligence) | 20/20 |
| Gate completo `node scripts/aurix-ci-gate.mjs` (local, sin cargas en paralelo) | **GO 290/290** (334 s, tras el último cambio) |
| `docs/financial-reliability/repro-save-first-click.mjs` | demo raíz: 1.er clic perdido; rama: no |

Esperados escritos a mano: 1.000 − 250 = 750; retirada excesiva bloqueada; 30 + 2 − 1 = 31; objetivo
250/1.000 = 25 %; préstamo 1.000 a 0 %/1 año = 83 €/mes (redondeo guardado); compuesto 1.000 sin aportes
ni tasa = 1.000; 1.000 € siguen siendo 1.000 € tras pasar la base a USD.

### Aserciones re-decididas (con su razón en el propio harness y cobertura equivalente)
- DASHBOARD-PLANS 2.1 (+2.1b base USD sigue en €, +2.1c sin moneda ⇒ sin símbolo).
- WORKSPACE-NUMERIC-TRUTH 6.1 (+6.1b dentro de un documento manda su moneda).
- WORKSPACE-FORMULA-INTEGRITY L9 (owner `_wsSurfaceCcy` + glifo existente).
- WORKSPACE-CAPABILITY-TRUTH 8.15b (mismo guion para lo ausente, formateador del objetivo).
- COHERENCE-PREMIUM §4 (+4.4 lectura en vuelo ⇒ comprobando, +4.5 lectura fallida ⇒ error).
- Sandboxes de COHERENCE-PREMIUM §2 y BUDGET-PILOT: el importe sigue saliendo por su `formatBase`
  sustituido (certifican validación/geometría; la moneda la certifica la sonda de navegador).

## 3b. Revisión financiera adversarial (agente, 2026-10-08) y respuesta
- [alto] La lectura aplicaba `aurix_ws_tool_state_v1` (borradores de TODAS las herramientas) como LWW por
  reloj del dispositivo ⇒ podía borrar un cobro no guardado hecho en otro dispositivo. **Corregido**: la
  lectura NO aplica preferencias (sólo documentos); se siguen subiendo.
- [medio] Una lectura descartada dejaba la cuenta marcada como leída. **Corregido**: toda lectura que no
  termina bien se puede repetir.
- [medio] Un remoto más nuevo pisaba una edición local cuya subida estaba pendiente o había fallado.
  **Corregido**: con subida pendiente/fallida el remoto sólo añade documentos que faltan.
- [medio] `_wsDocCurrencyOf` ponía el sello de la base por delante de `results.currency` (moneda real de
  filas en Diario/Precios de activos). **Corregido**: entradas → resultados → sello.
- [bajo] Resurrección de borrados de la ventana 09-16/17 — **RESUELTO en la continuación** (la lectura no añade ausentes).
- [observación] Sello antiguo = base al último guardado — **RESUELTO en la continuación** (ya no acredita).
- [preexistente, fuera de alcance] `_wsbParamsSet` encola una clave que no sincroniza y puede dejar su
  estado de subida en «guardando».

## 4. Riesgos de integración
- `main` no ha avanzado: la rama aplica limpia sobre `b913134` (rama de coherencia + 3–4 commits).
- Documentos antiguos sin sello de moneda (guardados antes del 2026-09-17) y borradores rápidos
  antiguos pasarán a «Moneda sin confirmar» con cifras sin símbolo hasta que el usuario confirme. Es
  intencional (no se asigna la base por suposición) pero es visible.
- **Bloqueo documentado — recuperación en dispositivo nuevo**: un dispositivo sin copia local (nuevo,
  reinstalado, o iOS tras 7 días sin uso) NO recupera documentos de la cuenta (siguen intactos en el
  servidor y se avisa en «Tus planes»). Reactivarla exige un marcador de vigencia fiable en servidor
  (p. ej. marcar como borradas las filas de la ventana 09-16/17 tras revisarlas) — decisión + SQL revisado,
  fuera de este SPEC.
- La lectura de documentos es la primera vez que datos remotos de Workspace entran en el almacén local
  de usuarios reales. La fusión es por revisión y no borra, pero conviene verificarla con una cuenta
  sintética Premium en producción ANTES de publicar.
- Las preferencias de Workspace (borradores rápidos, favoritos, orden) siguen siendo POR DISPOSITIVO al leer.

## 5. Reversión
- Nada desplegado: descartar = no hacer merge.
- Tras un merge: `git revert` por commit (cada bloque es independiente: `4be25af` moneda, `b92f45f`
  operaciones, el de sincronización/aislamiento). Sin SQL, sin esquema, sin permisos. Los campos nuevos
  (`currency` en objetivos/escenarios/entradas) son aditivos: un cliente antiguo los ignora.
- Bump de versión: al publicar, subir `AURIX_BUILD`/appjs en las cuatro fuentes (ver memoria del proyecto).

## 6. Punto de reanudación
1. `cd ~/claude-test/portfolio-coherence && git fetch && git status && git log --oneline origin/main..HEAD`.
2. Tipo EUR/USD: valorar si `suspicious_jump` pone en cuarentena el primer punto tras publicar, y si se
   quiere el BCE como fuente (exige endpoint en la API = despliegue).
3. Verificar la lectura de documentos con una cuenta sintética Premium real (dos navegadores).
4. Publicar demo (subruta propia) si se quiere revisión visual del aviso «Moneda sin confirmar».

## 7. Demo de revisión (continuación)
- URL: **https://rbn888.github.io/aurix-demo/v802-fr/demo.html** (200, `noindex`). Repo `rbn888/aurix-demo`,
  commits `0452761` + `cc19a89`, cambios SÓLO bajo `v802-fr/`; raíz y `v801/` intactas (200).
- Fuente: rama `demo/financial-reliability` (= `demo/coherence-premium` + merge de esta rama + lista de
  simulado ampliada). El panel de entrada dice qué está simulado: acceso por correo, pagos, precios en
  vivo, sincronización (base de datos FALSA en el navegador) y el tipo EUR/USD (sin red ⇒ «sin tipo», total
  con «≈»). Todos los datos son ficticios. El build declara `v761 (v801-coherence)`: no hay bump de versión.
- Sobre la URL pública: sonda del entorno de demo 120/120, probe-fx 48/48, probe-sync 26/26,
  probe-doc-currency (CR 1440) 30/30, probe-operations (CR 390) 17/17. Capturas: `docs/financial-reliability/`.
- La demo NO verifica producción, sincronización real ni dispositivos físicos.
- Retirar: borrar `v802-fr/` en `rbn888/aurix-demo` (o `git revert cc19a89 0452761`).

## 8. Cierre final (2026-10-08, tercera entrega) — ESTADO: **PENDIENTE DE INTEGRACIÓN / VERIFICACIÓN REAL**

No se declara cerrado: el comportamiento está implementado y verificado en la demo aislada, pero la
sincronización real y el histórico con snapshots reales del servidor no se han podido ejercitar (ver
`docs/financial-reliability/PROCEDIMIENTO-VERIFICACION-REAL.md`).

### Implementado
**Documentos en otro dispositivo — vigencia ACREDITADA, sin SQL.**
- Prueba en los propios datos (sin relojes): `_wsDocStamp` (que escribe `revision` en el CUERPO) y los
  tombstones entraron en el MISMO commit `52ccd7a`; antes nadie escribía `revision` en el cuerpo (subida
  activa desde `225442d`). Un cuerpo con `revision` ⇒ lo escribió un cliente que borra con tombstone ⇒
  vigente si la fila no tiene `deleted_at`. **Excepción** (revisión financiera): las plantillas internas
  ws4 (`investment/budget/property/business/networth/fire`) se borraban en producción con `_ws4Delete`,
  que filtraba sin tombstone ⇒ siempre ambiguas. `_ws4Delete` deja ahora tombstone (antes además borraba
  TODAS las lápidas al guardar la lista filtrada).
- Ausente en local + vigente ⇒ se recupera (con su moneda y revisión). Ambiguo (cuerpo sin `revision`) ⇒
  se aparta en `aurix_ws_recoverable_v1` (por cuenta) y «Tus planes» dice «Hay N documentos antiguos…
  [Revisar]»; recuperar es EXPLÍCITO, relee la fila remota y no restaura si otro dispositivo la borró;
  la lista se poda con los tombstones remotos. Fondos asignados (sin borrado propio) sólo si su objetivo
  está vivo; nunca se ofrecen como documentos. Nada se borra ni se restaura solo.
- Cambios locales pendientes, conflicto por revisión, cambio de cuenta y respuesta tardía: guardas
  existentes + contador de ambiguos por cuenta.

**Cambio de tipo sin rentabilidad ficticia — LIMITAR, no corregir.**
- Primer diseño (apunte técnico en el ledger) **retirado** tras revisión financiera: el salto depende de
  qué punto inicia cada ventana (puntos de cliente al 0,92, de servidor al tipo real) y un apunte único
  podía fabricar ±1,57 %.
- Cada punto nuevo declara `fxBasis` ('dated'|'na') y `fxEurUsd`. Límite = último punto de CLIENTE sin
  base declarada. Si hubo EUR invertible ANTES del límite (posiciones EUR activas o cerradas con
  operaciones anteriores; la exposición actual no sirve), una variación cuya ventana empieza en o antes
  del límite NO se publica (`fx_basis_change`) en: gráfico/24H (`_aurixComputePeriodReturn`), resumen y
  `performance_state` remoto (`_aurixRangeReturn`), Intelligence (`_aurixInvestablePerformance` con el
  inicio real de su ventana) y hechos de nivel (cambio de nivel, máximo histórico, por debajo del máximo).
  El badge lo explica («Sin variación comparable: hasta el {fecha} Aurix valoraba los euros con 0,92…»).
  Se levanta solo cuando la ventana empieza después del límite (24H al día siguiente…; ALL no se
  publica mientras la serie contenga puntos antiguos).
- Histórico intacto; ningún tipo histórico inventado; flujos derivados de compras EUR pasadas marcados
  `fxBasis:'anchor_reconstructed'`.

**Calidad del cambio en sus consumidores.**
- Tipo no actual (último conocido con fecha, o sin tipo): hero «≈», variación «*», categorías afectadas
  «≈»; explicación accesible por toque o teclado (botón enfocable + burbuja, Escape cierra), sin hover y
  sin mover el diseño móvil; Ajustes con valor/fuente/fecha. Rentabilidad e Intelligence no publican
  (`fx_rate_not_current`) sólo si hay activos EN EUR (base EUR con sólo USD: el % no depende del tipo).
  Inmuebles fuera de lo invertible. Ningún punto nuevo se persiste con tipo no actual (guard existente).

### Verificado (demo aislada local + pública; Chromium y WebKit de Playwright)
Ver §9 con las cifras finales. Esperados a mano: control negativo +1,57 % ficticio sin el límite; movimiento
real del EUR 1,1197→1,15 en ventana posterior = +1,43 %.

### Pendiente / requisito de integración
- Ejecutar el procedimiento de verificación real (cuenta sintética Premium, dos perfiles, histórico real).
- SQL: **ninguno necesario**. Opcional, sólo lectura, para dimensionar ambiguos (en el procedimiento).
- UX: no hay «descartar» para documentos ambiguos (el aviso permanece mientras existan).
- ALL/1A permanecerán sin variación publicada para cuentas con EUR mientras su serie tenga puntos
  anteriores al despliegue: es la consecuencia honesta de no inventar tipos históricos; reconsiderar
  cuando exista un tipo histórico fechado (p. ej. BCE vía la API — exige desplegar un endpoint).
- `computeAurixTWRSeries` (sin consumidor visible) no tiene la puerta.
- Un dispositivo con bundle antiguo que siga escribiendo con 0,92 mantiene el límite (correcto).

## 9. Resultados finales (tercera entrega)
| Prueba | Resultado |
|---|---|
| probe-sync (dispositivo nuevo, vigente, borrado actual, ambiguo, plantilla interna, borrado remoto antes de recuperar, conflicto local, cambio de cuenta en vuelo, aislamiento) | 38/38 CR+WK |
| probe-fx-correction (mercado constante, control negativo +1,57 %, cliente y servidor anteriores, EUR vendido, EUR posterior, movimiento real +1,43 %, tipo antiguo, sin tipo, inmueble, base EUR sólo USD, teclado) | 44/44 CR+WK |
| probe-fx · probe-doc-currency · probe-operations · probe-regressions | 48/48 · 120/120 · 68/68 · 20/20 |
| Gate completo (código final, sin cargas en paralelo) | **GO 290/290** (343 s) |
| URL pública v802-fr: sonda de demo · probe-fx-correction · probe-sync · probe-fx | GO · 44/44 · 38/38 · 48/48 |

Commits: `94706c3` (recuperación acreditada), `b4e60f2` (límite FX + calidad). Demo: `13b9621` sólo bajo `v802-fr/`.
Revisión financiera adversarial: 2 rondas sobre este bloque; todos los hallazgos aplicados salvo los
listados como pendientes en §8. **No ejecutado (no cuenta como aprobado):** sincronización real,
histórico real con snapshots del servidor, 24H con la puerta de racha densa (se midió su owner de
cálculo), dispositivos físicos.

## 10. Verificación previa a integrar (2026-10-08, cuarta entrega)

### Observado
- **24H completo con su puerta de preparación** (motor real, historia DENSA cada 15 min, pulsando los
  rangos en la UI de la demo, Chromium y WebKit — `docs/financial-reliability/probe-ranges-fx.mjs` 10/10):
  control sólo USD publica 24H/7D/30D/1A/TOTAL; cuenta con EUR recién actualizada: los cinco rangos
  muestran «Rendimiento no disponible» / «Historial disponible» con la explicación accesible, nunca un %.
- **Defecto encontrado y corregido**: el 24H se pinta por OTRO pintor (gráfico de emergencia) que no
  añadía la explicación — se mostraba «Rendimiento no disponible» sin decir por qué. Ahora ese pintor
  también marca (y la nota mira la línea base del gráfico publicado, porque el 24H publica su propio motivo).
- **Qué verá una cuenta afectada** (medido):
  | Desde el despliegue | 24H | 7D | 30D | 1A | TOTAL |
  |---|---|---|---|---|---|
  | 0 h | sin % + nota | sin % + nota | sin % + nota | sin % + nota | sin % + nota |
  | 30 h | % | sin % | sin % | sin % | sin % |
  | 8 días | % | % | sin % | sin % | sin % |
  | 370 días | % | % | % | % | sin % |
  1A recupera el % cuando su ventana (365 d) empieza después del último punto antiguo: ≈ 1 año tras el
  despliegue (o tras el último punto escrito por un cliente antiguo). TOTAL **no** lo recupera mientras la
  serie contenga puntos antiguos (su ventana siempre empieza en ellos). Opciones para decidir: medir TOTAL
  «desde el {fecha}» (re-etiquetado, sin inventar nada) o re-expresar el histórico con un tipo histórico
  fechado (BCE vía la API: exige desplegar un endpoint).
- **`computeAurixTWRSeries`**: sin consumidores en producto. Sólo `window.computeAurixTWRSeries` y
  `window.debugAurixTWRSeries` (consola). Ningún render, Intelligence, persistencia ni `performance_state`
  la lee; 4 harnesses lo vigilan (INT-TRUTH-FOUNDATION 2.10, INT-CORE-FACT-ENGINE, PC01, M.06 entitlements).
  Su fórmula compartida `_aurixTwrChain` la usa `_aurixInvestablePerformance`, que SÍ tiene la protección.
  No puede publicar sin la protección FX hoy; si se conecta en el futuro debe pasar por `_aurixFxBasisLimited`.
- **Ensayo contra el backend real** (sin cuenta, sin enviar correo): el candidato servido en
  `http://localhost` carga el login y el cliente Supabase de producción (CORS/CSP OK).

### Pendiente (requiere acceso del founder)
- Guardar en un perfil / recuperar en otro / borrar y confirmar que no reaparece **contra el backend real**:
  kit listo en `docs/financial-reliability/qa-real/` (`grant-qa-premium.sql`, `run-real-sync.mjs`,
  `revoke-qa-premium.sql`). Pasos exactos en el informe de esta entrega.
- 24H real de la cuenta sintética: necesita ≥ 24 h de historia real (snapshots del servidor cada 15 min)
  ⇒ crear la cuenta hoy y pasar `probe-ranges` contra ella mañana.

### Verificación REAL de documentos (2026-10-08, backend de producción autorizado)
Código candidato servido en `http://localhost` (sin desplegar) contra el Supabase de producción, cuenta
SINTÉTICA `rbn892+aurixqa1@gmail.com` (Premium temporal `qa`, 7 días, concedido por el founder), tres
perfiles de navegador independientes. `docs/financial-reliability/qa-real/run-real-sync.mjs` → **GO 7/7**:
sesión real; Premium efectivo; A guarda y la fila remota lleva revisión en el cuerpo; B (perfil limpio)
lo recupera con nombre y moneda; A borra y la fila queda con tombstone (no se borra nada); B recarga y no
reaparece; C (perfil limpio nuevo) no lo recupera ni lo ofrece como ambiguo. Sólo se escribió un documento
`QA-SPEC1-…` (hoy, en tombstone). Ninguna otra cuenta tocada; producción sin cambios.
Pendiente: 24H con historia real de esta cuenta (≥ 24 h de snapshots del servidor) y retirar el Premium
temporal al terminar (`revoke-qa-premium.sql`).
