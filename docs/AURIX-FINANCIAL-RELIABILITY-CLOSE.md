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

### FALLO REPRODUCIDO (sin corregir en este SPEC)
- **Tipo USD/EUR fijo** `usdToEur = 0.92` (`app.js` ~L12093, comentario «updated from API» falso). El
  proxy existente ya sirve `EURUSD=X` (hoy 1,1197 ⇒ 0,8931). Error actual en producción: los activos USD
  de un usuario con base EUR salen **+3,01 %** (1.000 USD = 920 € en vez de 893,10 €); los activos EUR
  con base USD, **−2,92 %** (1.000 € = 1.086,96 $ en vez de 1.119,70 $). Consumidores: `toBase`,
  `assetValueUSD`, `_nativeToUSD`, `_aurixFxLookup('EUR')` — centralizados, no dispersos.
  **BLOQUEADO — decisión requerida**: el histórico (`recordSnapshot` → `totalValueUSD`), los flujos de
  capital (`amountUSD`), el TWR y la ventana 24H pivotan en USD y se re-convierten con el tipo de HOY
  (`toBase(x,'USD')`). Con el ancla fija un usuario sólo-EUR ve hoy un gráfico plano y correcto; con un
  tipo vivo vería el ruido EUR/USD como «rendimiento» y un escalón de ~3 % el día del cambio — y
  recalcularía todo el histórico con el tipo de hoy. Cambiarlo exige sellar el tipo (con fecha y fuente)
  en cada snapshot/flujo o persistir en la moneda nativa: es Historical Engine (motor congelado) y
  requiere decisión del founder + revisión financiera. No se ha cambiado nada; no se ha inventado tasa
  ni 1:1. El tipo no se presenta en la UI como cotización.

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
| `docs/financial-reliability/probe-doc-currency.mjs` (fixtures B, C, E, F; ES/EN; recarga) | 116/116 |
| `docs/financial-reliability/probe-operations.mjs` (A, B, D; doble envío; cancelar; decimales ES) | 68/68 — sobre el build anterior falla (2.000 / 60) |
| `docs/financial-reliability/probe-sync.mjs` (recuperación, sin pisar local ni subidas pendientes, preferencias no aplicadas, carrera de cuenta, aislamiento) | 22/22 (CR/WK, 1440) |
| `docs/financial-reliability/probe-regressions.mjs` (WebKit escritorio, idioma ≠ moneda, Intelligence) | 20/20 |
| Gate completo `node scripts/aurix-ci-gate.mjs` (local, sin cargas en paralelo) | **GO 290/290** (322 s) |
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
- [bajo, RESIDUAL] Documentos subidos y borrados entre `319d7b7` (09-16) y `52ccd7a` (09-17) —cuando borrar
  aún no dejaba tombstone— siguen vivos en remoto y la lectura los volvería a añadir. Población: Premium
  que borró en esa ventana. Comprobable con SQL de lectura antes de publicar.
- [observación, RESIDUAL] El sello antiguo `currency` es «la base al último guardado»: un documento
  creado en EUR y re-guardado tras pasar a USD queda como USD (el usuario vio «$» al guardar; los datos no
  permiten distinguirlo).
- [preexistente, fuera de alcance] `_wsbParamsSet` encola una clave que no sincroniza y puede dejar su
  estado de subida en «guardando».

## 4. Riesgos de integración
- `main` no ha avanzado: la rama aplica limpia sobre `b913134` (rama de coherencia + 3–4 commits).
- Documentos antiguos sin sello de moneda (guardados antes del 2026-09-17) y borradores rápidos
  antiguos pasarán a «Moneda sin confirmar» con cifras sin símbolo hasta que el usuario confirme. Es
  intencional (no se asigna la base por suposición) pero es visible.
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
2. Decisión del founder sobre el tipo USD/EUR (§1 FALLO REPRODUCIDO): sellar tipo+fecha+fuente por
   snapshot/flujo vs. mantener el ancla etiquetada. Con decisión: revisión financiera previa.
3. Verificar la lectura de documentos con una cuenta sintética Premium real (dos navegadores).
4. Publicar demo (subruta propia) si se quiere revisión visual del aviso «Moneda sin confirmar».
