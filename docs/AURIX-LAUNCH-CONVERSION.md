# AURIX · SPEC 2 — Conversión y acabado para lanzamiento · REGISTRO

2026-10-08 · rama `aurix/launch-conversion` (worktree `~/claude-test/portfolio-launch`) · build
`v803-launch` · appjs 763 · loginhtml 492. **No es «listo para vender»** (ver Bloqueos).

## Composición del candidato
- Base: `aurix/financial-reliability` @ `3b4734f` (SPEC 1 completo, identificable por sus commits).
- Onboarding aprobado (`onboarding/premium`), SÓLO sus commits de producto, por cherry-pick:
  `fefa866`→`3239563`, `13cc3bc`→`86a2fda` (conflicto de cola en styles.css: se conservan ambos
  bloques), `041ec00`→`0ad5bb0` (sin sus ficheros de demo), `71f03f0`→`6843d13`.
- El entorno de demo vive APARTE: rama `demo/launch-conversion` (= `demo/financial-reliability` +
  cambios de demo de `041ec00` + catálogo de precios simulado).

## Revisión inicial (una vez) → lista cerrada
Referencias (getquin, kubera, snowball): se adaptan hero con público/beneficio/CTA, bloques de
producto alternos con capturas, comparativa Free/Premium, anual con total y ahorro, FAQ tras los
precios. NO se adaptan cifras de usuarios, testimonios, IA ni prueba gratuita (Aurix no los acredita
o no los tiene configurados).

Precio vigente VERIFICADO en producción (`billing_prices`, lectura con la cuenta sintética QA):
**7,99 €/mes · 69,99 €/año · EUR · sin prueba**. Coincide con la referencia del SPEC.

| # | Cambio | Commit |
|---|---|---|
| 1 | Landing: público/problema/beneficio, CTA visible en todas las anchuras con idioma, producto real con datos ficticios etiquetados, 3 beneficios, Free/Premium + precios + condiciones, FAQ, CTA final; fuera mock inventado, «AI-driven insights» y roadmap | `cc43f80` |
| 2 | Paywall: contexto de la capacidad pedida, cobro y periodicidad por plan, renovación y cancelación antes de pagar | `ddce683` |
| 3 | Entrada desde X en iOS: sin el botón que reabre el bloqueo; copiar enlace + instrucción | `1e0a394` |
| 4 | Cambiar de idioma repinta el gráfico (escritorio y móvil) | `96d0e08` |
| 5 | Contraste ≥ 4,5:1 medido; tarjetas de categoría en el idioma activo | `4414dbc` |
| 6 | Portada Free de Workspace con ejemplo de uso; foco visible en la landing | `a61338f` |
| 7 | Versión `v803-launch` | `717ad12` |

## Verificado (entorno, resultado)
Demo aislada local y publicada (Supabase falso, red bloqueada), Chromium y WebKit de Playwright.
- Landing ES/EN, 320/390/1440: CTA en el primer pliegue, sin desbordamiento, 0 claves vacías, 0 errores.
- Acceso/onboarding (`scripts/aurix-onboarding-close-probe.mjs`): **108/108** (idioma de entrada,
  ES/EN sin perder datos, retroceso, omisión, reanudación, doble pulsación, recarga, llegada arriba).
- Paywall con catálogo simulado: ES/EN × 320/390/1440 × CR/WK, sin desbordamiento; contexto correcto.
- X: `docs/launch-conversion/probe-x-entry.mjs` 4/4 (UA emulado) + harness EMBEDDED 47/47.
- Contraste: `docs/launch-conversion/probe-contrast.mjs` → 0 fallos (6 pantallas × 2 anchuras).
- Checkout (sin pagar, lectura de código + harness M04 188/188): doble envío bloqueado, el servidor
  verifica importe/moneda/recurrencia en Stripe antes de abrir la sesión, cancelación sin cargo,
  Premium sólo cuando el servidor lo confirma (`?billing=success` sólo inicia la espera).
- Gate completo (código final, sin cargas en paralelo): **GO 290/290** (319 s); ensamblado del sitio OK.

## Cierre comercial y visual de la landing (2.ª entrega)
| # | Cambio | Commit |
|---|---|---|
| 8 | Presupuesto: moneda y periodo en una cabecera compacta, después ingresos/gastos/disponible, después reparto y edición (sin tocar cálculo, valores, restricciones ni guardado) | `b56ade7` |
| 9 | Logo de acción que no carga: se oculta la imagen rota y queda la letra | `c16b3be` |
| 10 | Landing: estructura Hero → Reúne/Entiende/Planifica → Free/Premium → FAQ → CTA final → pie; copy del SPEC; 4 capturas distintas con pie fuera de la imagen; planes alineados; animación de entrada que no oculta sin JS | `92ae8a3` |
| 11 | Versión appjs 763 | `bd7b611` |

Demo (rama `demo/launch-conversion`, `9d3145b`, `7806d12`): una sola cartera de ejemplo coherente
(reparto derivado de las posiciones, compra hace 90 días con ganancia modesta, acciones y cripto primero
por el orden real), iconos BTC/ETH CC0-1.0 (spothq y atomiclabs) servidos localmente, insignia de demo
sin tapar controles. **Acciones/ETF sin logo**: Financial Modeling Prep no es redistribuible → se
conserva la letra (no se inventa logo).

Verificado: gate completo **GO 290/290** · `probe-budget-header.mjs` 72/72 · `probe-landing-close.mjs` 158/158 (CR/WK × ES/EN ×
320/390/1440 + sin JS) · harnesses de presupuesto, fórmulas, Workspace, entitlement e iconos en verde.

Discrepancias registradas (no se cambia producto):
- «controla cobros y pagos pendientes»: la plantilla real es **Control de cobros** (pagado/pendiente/vencido);
  no hay una herramienta separada de pagos.
- En inglés la cantidad de cripto sale con coma decimal («0,12 BTC») en el detalle de posiciones (captura B EN).
- Salud: Dashboard «Salud sólida» frente a Intelligence «Equilibrada» (ya registrado, SPEC 1).

## Propuesta publicada
- **Landing**: https://rbn888.github.io/aurix-demo/v803-launch/landing/index.html (ES/EN con el selector)
- **App (demo)**: https://rbn888.github.io/aurix-demo/v803-launch/demo.html — build `v803-launch` · appjs 762.
- Subruta aislada (commits `e46b3a9`, `eb9a924` en rbn888/aurix-demo); raíz, `v801/` y `v802-fr/` intactas.
- Identificado: insignia «Demo · Datos ficticios · v762», etiqueta de propuesta en la landing, `noindex`.
  Simulado: acceso por correo (código fijo), pagos (deshabilitados; los precios son copia del catálogo real),
  precios en vivo, sincronización (base de datos falsa del navegador), tipo EUR/USD sin red.
- En la copia de demo los CTA y las legales abren la DEMO (nunca producción); fuentes locales.
- Verificado sobre la URL pública: sonda del entorno 116/116, onboarding 108/108, landing→CTA→acceso
  con idioma conservado y 0 peticiones fuera del origen (CR/WK, 390/1440), paywall con contexto y planes,
  compra bloqueada sin cargo.

## Bloqueos que requieren al propietario
- **Cobro LIVE**: comprobar `POST /api/billing/status` (cuenta fundadora) → `ready_for_live:true`
  con 799/6999; no se puede desde aquí. Ningún pago ejecutado.
- **IVA**: la landing no dice si los precios incluyen impuestos; hace falta la decisión/dato fiscal.
- **Legales**: privacidad y condiciones siguen en BORRADOR (no se ha tocado); la landing enlaza a ellos.
- **Dispositivos reales**: iPhone (X iOS, teclado), Android (intent://), Safari real — no ejecutados.
- **Salud**: Dashboard «Salud sólida» vs Intelligence «Equilibrada»; «Riesgo elevado» con sólo
  liquidez en la primera posición → registrado para SPEC 1 (motor de salud, decisión del founder).

## Backlog secundario
- 320×640: la portada Free de Workspace no encaja sin scroll (ya antes de este SPEC).
- Moneda base por defecto USD para cuentas nuevas aunque el idioma sea ES.
- Demo: «precios no cargados» por no haber red.
- Landing estática: si cambia el catálogo, actualizar precios a mano (`landing/app.js`).
- Toast «tu portfolio ha empezado» (anglicismo).
- Demo: al pulsar comprar aparecen dos avisos (el de la demo y «La compra todavía no está disponible»).

---

# SPEC 3 — Cierre de producto y preparación para vender (2026-10-08)

Rama `release/spec3` desde `origin/main` @ `b496afd` (landing publicada, intacta). Build
**`v804-spec3` · appjs 764 · login 493**. Selección por commits (`cherry-pick -x`), sin fusionar ramas
enteras ni herramientas de demo.

## Bloque 1 — integrado
- De `aurix/financial-reliability` (SPEC 1), hasta el corte seguro `b92f45f`: estabilidad WebKit, cierre de
  posición durable, Diario en su divisa y rótulo del Hero («Patrimonio invertible»), retirada de liquidez,
  Escenarios/Guardar/Tus planes, pregunta de Intelligence estable, salida de X en Android + intent://,
  **moneda por documento** (`4be25af`) y su **confirmación de documentos antiguos** (`da5023d`, puerto
  manual del conflicto + su harness), **protección frente a operaciones duplicadas** (`b92f45f`). El
  **aislamiento entre cuentas** de Escenarios que ya estaba en main sigue igual.
- De `aurix/launch-conversion` (SPEC 2), sin la landing ni los bumps: onboarding (3 commits), paywall,
  X en iOS, repintado del gráfico al cambiar de idioma, contraste, ejemplo de la portada Free, **cabecera
  compacta del Presupuesto** y **respaldo del logo que falla**.

## Bloque 1 — retenido (bloque financiero + sincronización, juntos)
`9645119`, `138c12e`, `014a1b5`, `8facbfc`, `94706c3`, `b4e60f2`, `796a84d` (+ sus registros).
- **Por qué juntos**: la historia de la rama no es separable por commits. `138c12e` (no resucitar
  borrados) **no parsea** como JavaScript hasta `014a1b5` (FX), que además recoloca código de
  sincronización; `9645119` (recuperar en otro dispositivo) sin `138c12e` resucitaría documentos borrados;
  revertir los FX en la punta también deja el fichero roto. Separarlo sería reescribir, no seleccionar.
- **Por qué no se despliega**: el bloque FX cambia valoración y la ventana 24H; falta la comprobación con
  historia REAL y coordinarlo con el encargo del gráfico (toca el hero, la etiqueta/badge 24H y las marcas
  `data-fx-*` del cambio del gráfico).
- **24H real — estado (lectura con la sesión QA, sin escribir)**: la cuenta sintética
  `rbn892+aurixqa1` tiene **0 posiciones y 0 snapshots** ⇒ no se puede ejercitar. Intenté añadir 10.000 €
  + 1.000 US$ de liquidez en producción para arrancar el reloj y el entorno **denegó la escritura**: no se
  hizo nada. **Siguiente paso exacto (founder)**: en `app.aurixsystem.io` con la cuenta QA, «Añadir
  liquidez» 10.000 EUR y 1.000 USD (código actual, tipo 0,92 fijo = la historia «anterior»); esperar ≥ 24 h
  de capturas del servidor (cada 15 min); entonces servir el candidato con el bloque retenido en
  `http://localhost` contra el backend real y pasar `docs/financial-reliability/probe-ranges-fx.mjs` +
  la §2 de `docs/financial-reliability/PROCEDIMIENTO-VERIFICACION-REAL.md`. El Premium QA (7 días) no
  hace falta para el 24H; no se amplía.
- **Compartido con el encargo del gráfico ya integrado aquí**: sólo `6d9bd23` (al cambiar de idioma se
  llama `updateChart(true)` y se invalida la firma de las tarjetas). Ningún cambio de motor ni de diseño.

## Bloque 2 — Intelligence y acabado (perfiles con la demo: vacío, sólo liquidez, concentrado, diversificado)
Reproducido y corregido (commits separados):
| Defecto | Commit |
|---|---|
| Cuenta sin activos: **Intelligence en blanco** (el vacío nunca recibía `is-revealed`; CSS a opacidad 0) | `c0f1b2b` |
| **Salud contradictoria**: Dashboard leía `_aurixHealthScore` (NOT COMPUTABLE) — 100 % liquidez «Riesgo elevado» frente a «Débil» en Intelligence. Ahora publica el estado de `_intccHealthScore` («Salud: Equilibrada»). Cero fórmulas/umbrales tocados | `88d426d`, `511fc9b` (móvil: una línea con «…», sin cambiar el hero) |
| Pregunta «¿Tu posición en — …?» con todo en liquidez | `fc57fd3` |
| Inglés: «0,12 BTC» (separador decimal fijo `es-ES`) | `a2bd170` |
Workspace no muestra hoy ninguna etiqueta de Salud (la superficie que la usaba no está publicada).
Comprobado sin defecto: actualización tras modificar posiciones (Dashboard e Intelligence cambian juntos),
contraste (`probe-contrast` GO). No tocado: «Lo que importa hoy» frente al titular (miden cosas distintas:
cambios del día frente a estructura) y el «Calculando…» del gráfico en móvil (encargo del gráfico).

## Bloque 3 — medición mínima
- **Existe**: `_aurixRecordFunnelStep` / intenciones de upgrade — registro LOCAL del navegador (no sale del
  dispositivo); `api/client-log` sólo para errores; `founder_read_overview` (registrados/activos).
  **No hay proveedor de analítica.**
- **Activación inicial (verificable en servidor)**: primera captura del servidor con activos
  (`portfolio_snapshots.asset_count > 0`) dentro de los 7 días siguientes al registro.
- **`db/spec3_funnel_readonly.sql`** (sólo lectura, sólo recuentos por cohorte, sin PII; excluye
  `founder`/`qa`): registro → primera posición → activación 7 d → checkout abierto → **Premium confirmado
  por el webhook** (`subscriptions`/`billing_events`, nunca el retorno de Stripe). No ejecutado desde aquí.
- **Gap (no simulado)**: visita, clic en CTA, primer análisis mostrado y paywall mostrado sólo ocurren en el
  navegador y no tienen destino. Hace falta: (1) **decisión de privacidad** (la política sigue en
  borrador; analítica sin cookies y sin PII), y (2) **infraestructura**: o Vercel Web Analytics en el
  proyecto de la landing (activación en el panel; mismo origen, la CSP no cambia) para visita/CTA, o una
  tabla de eventos con inserción acotada para los pasos de la app. Vercel Hobby no admite otra función.

## Verificación (candidato `14917ce`, demo local, Chromium + WebKit)
`probe-block2` **148/148** (CR/WK × 390/1440 × ES/EN) · `probe-doc-currency` **120/120** · `probe-operations`
**68/68** · `probe-budget-header` **72/72** · onboarding **108/108** · `probe-contrast` GO · `probe-x-entry` 4/4 ·
gate completo **GO 290/290** (el primero dio NO-GO 289/290 por el harness de Tus planes; corregido en `14917ce`).
Sin dispositivos físicos.

## Reversión
Los commits intermedios de SPEC 1 no son válidos por separado (heredado de su rama): **no revertir uno a
uno**. Reversión completa: `git revert --no-edit b496afd..<punta desplegada> && git push origin main`
(o volver a desplegar `b496afd`). Los commits del bloque 2 (`c0f1b2b`, `88d426d`+`511fc9b`, `fc57fd3`,
`a2bd170`) sí se revierten individualmente.

## Bloqueos para vender
1. **IVA**: sin decisión fiscal; la web no dice si los precios lo incluyen.
2. **Legales en borrador**: privacidad y condiciones se publican como «BORRADOR · pendiente de revisión».
3. **Dispositivo real**: ningún iPhone/Android físico probado (X iOS, teclado, `100dvh`, notch).
4. **24H real + bloque FX/sincronización retenido**: sin él, los documentos de Workspace no se recuperan
   en otro dispositivo y el tipo EUR/USD sigue fijo en 0,92.
5. **Medición**: sin destino para visita/CTA/análisis/paywall (decisión de privacidad + infraestructura).
