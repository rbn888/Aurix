# AURIX · SPEC 2 — Conversión y acabado para lanzamiento · REGISTRO

2026-10-08 · rama `aurix/launch-conversion` (worktree `~/claude-test/portfolio-launch`) · build
`v803-launch` · appjs 762 · loginhtml 492. **No es «listo para vender»** (ver Bloqueos).

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
- Demo: la insignia tapa el logotipo en móvil; «precios no cargados» por no haber red.
- Captura del Dashboard en el hero repetida en «Cómo funciona» (paso 1).
- Landing estática: si cambia el catálogo, actualizar precios a mano (`landing/app.js`).
- Toast «tu portfolio ha empezado» (anglicismo).
- Demo: al pulsar comprar aparecen dos avisos (el de la demo y «La compra todavía no está disponible»).
