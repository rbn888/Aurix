# AURIX · LANDING — INTELLIGENCE V2 + PREMIUM POR MODALIDAD

**Estado:** implementado en local (rama `aurix/landing-intel-premium`), pendiente de revisión visual del founder.
**No publicado.** Contrato de alcance: informe de Dirección Comercial y UX/UI (2026-10-22) + decisiones de dirección
posteriores (esfera de la landing, copy EN, Salud fuera del móvil, persistencia de `plan`, pie del Radar).

## 1. Copy (literal)

| Clave | ES (aprobado) | EN (aprobado para este lote) |
|---|---|---|
| `lp.intel.title.a` (blanco) | Convierte tus inversiones en información, | Turn your investments into insights, |
| `lp.intel.title.b` (azul `--accent-2`) | toma mejores decisiones desde hoy. | make better-informed decisions today. |
| `lp.intel.problem` | Descubre qué riesgos podrías estar ignorando. | Discover the risks you might be overlooking. |
| `lp.intel.lead` | Obtén tu análisis desde el primer momento y ahorra tiempo interpretando cifras y gráficos. | Get your analysis from the start and save time interpreting figures and charts. |

Jerarquía: eyebrow `AURIX Intelligence` → h2 (salto tras la coma sólo ≥768 px; en escritorio, una frase por línea) →
problema (18–23 px, 600, casi blanco; nunca menor que el beneficio) → beneficio (`section-lead`).

Cadenas de la demostración y de Premium (todas en `landing/app.js`, bloque «INTELLIGENCE V2 + PREMIUM»):

| Clave | ES | EN |
|---|---|---|
| `lp.iv2.q` (nombre del control) | ¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones? | Am I spread across several investment classes, or do I still depend on a few investments? |
| `lp.iv2.a1` | Repartes entre 4 clases de inversión, pero no tanto entre posiciones: el peso sigue recayendo en tus tres mayores inversiones. | You spread across 4 investment classes, but less so across positions: the weight still rests on your three largest investments. |
| `lp.iv2.a2` | Clases: Acciones, Cripto, Fondos/ETF y Metales. Tres mayores: Microsoft, Bitcoin y Apple. | Classes: Stocks, Crypto, ETF / Funds and Metals. Three largest: Microsoft, Bitcoin and Apple. |
| `lp.iv2.note` (pie, sólo escritorio) | Radar: Estabilidad y Crecimiento se calculan sobre 1 día de historia de la cartera. | Radar: Stability and Growth are calculated over 1 day of portfolio history. |
| `lp.iv2.alt` | AURIX Intelligence con una cartera de demostración: Microsoft, Bitcoin y Apple pesan más que tus otras 9 inversiones juntas. Tus 3 mayores inversiones reúnen el 69% de tu cartera financiera. | AURIX Intelligence with a demo portfolio: Microsoft, Bitcoin and Apple outweigh your other 9 investments combined. Your 3 largest investments hold 69% of your financial portfolio. |
| `lp.iv2.alt.drivers` | Factores principales: Microsoft 29%, Bitcoin 22%, Apple 18%. Tus 3 mayores inversiones reúnen el 69% de tu cartera financiera. | Key drivers: Microsoft 29%, Bitcoin 22%, Apple 18%. Your 3 largest investments hold 69% of your financial portfolio. |
| `lp.iv2.alt.explore` | Explora tu patrimonio: ¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones? ¿Qué parte de mi cartera está entre Acciones y Cripto? ¿Cuánto han rendido realmente mis inversiones? | Explore your wealth: Am I spread across several investment classes, or do I still depend on a few investments? How much of my portfolio is in Stocks and Crypto? How much have my investments actually returned? |
| `lp.plan.annual` / `lp.plan.monthly` | Anual / Mensual | Annual / Monthly |
| `lp.price.year` + `.per` | 69,99 € · al año | €69.99 · per year |
| `lp.price.year.note` (secundaria) | Un único cobro anual: equivale a 5,83 € al mes y ahorras un 27 % frente al pago mensual. | One annual payment, equivalent to €5.83 a month: 27% less than paying monthly. |
| `lp.price.month` + `.per` | 7,99 € · al mes | €7.99 · per month |
| `lp.cta.annual` / `lp.cta.monthly` | Elegir anual / Elegir mensual | Choose annual / Choose monthly |

Retiradas: `lp.intel.title`, todas las `lp.ip.*`, `lp.price.month.alt`, `lp.cta.premium`.

## 2. Demostración

Fuente única: `scripts/aurix-landing-captures.mjs --intel-v2`. Misma cartera de demostración y misma historia que el
hero del Dashboard. **Antes de escribir** verifica en el motor: titular, 29/22/18, 69 %, «9», Salud 33 % · A vigilar,
Radar 5/5 ejes certificados, Estabilidad y Crecimiento medidos sobre **1 d** (`_aurixPeakRetention` /
`_aurixGrowthAxis`, mismo `intv7_axis_span_days` que el eje) y el texto exacto de la pregunta y su respuesta.
Si algo no coincide, falla sin escribir. Al capturar sólo se oculta `.intcc-orb` y se aplaza la pregunta de contexto
(acción real del usuario; su sincronización la corta el script, nada sale de la máquina).

| Recurso | Encuadre |
|---|---|
| `intelligence-v2-{es,en}.jpg` (1187×593) y `-2x` | Escritorio 1440: Salud + Inteligencia, Radar, Factores, Explora |
| `intelligence-v2-open-{es,en}.jpg` y `-2x` | La card Explora con la pregunta 1 abierta (misma caja) |
| `intelligence-v2-m-{head,drivers,explore,explore-open}-{es,en}.jpg` (756 px) | Vista móvil real 390: cabecera de Intelligence → Factores → Explora (**sin Salud ni Radar**), cada card por separado |

Composición: ≥1024 px la pantalla completa; <1024 px la vista móvil (máx. 400 px, tablet incluida, para que el texto
de la captura no baje de su escala). Geometría generada en `landing/styles.css` (`INTEL-V2-LAYERS`).

**Interacción:** un `<button>` real sobre la fila de la pregunta 1 (`aria-expanded`, `aria-controls="iv2Answer"`,
área ≥44 px). Al pulsarlo aparece la card capturada abierta (fundido 180 ms; instantáneo con movimiento reducido) y
`#iv2Answer` deja de estar `hidden`: la respuesta queda como texto accesible. Volver a pulsar o Escape cierra y
devuelven el foco. Sin JS el botón sigue `hidden` (es el único control afectado) y la captura se ve completa.
Aporta lo que la captura no dice: la cartera está repartida por **clases** pero no por **posiciones**.
En la vista móvil real la respuesta tiene desplazamiento interno: el primer párrafo se lee entero y el segundo queda
bajo el degradado de «hay más», tal como en la app (el texto completo está en `#iv2Answer`).

**Radar:** se incluye en escritorio con el pie `lp.iv2.note`; el periodo sale del motor y el script lo exige.
No hay más indicadores visibles dependientes de ese periodo (Crecimiento ya está en el pie; la pregunta de
rentabilidad de Explora aparece cerrada, sin cifra).

**Esfera:** la `.lp-orb` de la landing, intacta (aspecto, ECG, toque, recorrido). Su hueco se coloca sobre el de la
app: centro medido y tamaño `0,88/1,08 ×` la caja de la app (mismo diámetro de anillo exterior). Una sola esfera en el
DOM. `#intelDemo` es ahora la `figure`, así que `initOrbFlight` conserva sus anclas. `.section--intel` recorta sólo en
horizontal (el halo del looping del margen derecho podía crear desplazamiento lateral transitorio).

## 3. Premium

Free + Premium; dentro de Premium, **Anual** (destacado, botón principal) y luego **Mensual** (botón secundario),
ambos con su precio a la vista, y una sola lista de funciones. En escritorio cada tarjeta mide lo que su contenido.

Enlaces: `…&intent=premium&plan=annual|monthly` (`data-app-plan`, lo añade `updateAppLinks()`).

App (sin tocar Stripe, precios, catálogo ni entitlements):

| Momento | `aurix_intent` | `aurix_intent_plan` |
|---|---|---|
| Entrada desde la landing con `intent=premium&plan=…` (index.html / login.html) | `premium` | `year`/`month` (SUSTITUYE) |
| Entrada con `intent=premium` sin plan válido | `premium` | se borra |
| Entrada por el CTA gratuito (trae `lang`/`langhint`, sin intent) | se borra | se borra |
| Vueltas internas sin parámetros (login.html, redirecciones, OTP) | intacta | intacta |
| Consumo (`_aurixPremiumIntentTryConsume`) | se borra antes de abrir | se borra antes de abrir; pasa como `options.plan` |
| Usuario ya Premium | se borra | se borra |
| Cerrar sesión / cambiar de cuenta (`signOut`) | se borra | se borra |

El modal marca la tarjeta elegida con `is-chosen` (anillo de acento; el anual sigue primero y destacado) y le da el
foco a su botón; lo conserva al repintar por la llegada del catálogo o un reintento, y lo olvida al cerrarse.
**Nunca hay clic programático ni checkout automático.** Cerrar el modal es cancelar el recorrido: ya no queda nada.

Versión: app 821 · login.html 498 · build `v861-premium-plan-choice` · landing `?v=lp-commercial-6`.

## 4. Validación

Automática (local):
- `node scripts/aurix-landing-captures.mjs --intel-v2` — verificación del motor ES/EN antes de escribir.
- `node scripts/aurix-landing-probe.mjs` — Chromium + WebKit, 7 viewports, ES/EN: copy literal, jerarquía, captura
  por idioma, esfera centrada (≤2 px) y a tamaño (≤1 px), control único con nombre y ≥44 px, respuesta accesible,
  pie del Radar, escala móvil ≥0,85, interacción (ratón, teclado, toque, Escape, cambio de idioma abierta),
  movimiento reducido, sin JS, Premium (precios, orden, botones, una lista, `plan=`), más todo lo anterior del hero,
  vuelo de la esfera, móvil y anclas.
- `AURIX_DEMO_URL=… node scripts/aurix-premium-intent-probe.mjs` — sobre el artefacto de demo: modalidad tras acceso y
  OTP (incluida una entrada a login sin parámetros), resaltado + foco, consumo, refresco de precios, cierre,
  sustitución, plan inválido, CTA gratuito, cierre de sesión, Premium; sin cobro.
- `node scripts/aurix-ci-gate.mjs` (gate de publicación; `AURIX-M04-BILLING-STRIPE` declara el nuevo estado del
  cierre del modal, `_chosenPlan`).

Pendiente de recorrido real (no automatizable desde aquí): cuenta nueva con OTP real → «Elegir mensual» / «Elegir
anual» → modal con la modalidad resaltada → abrir Stripe Checkout de ese plan y **cancelar sin pagar**; correo abierto
en otra pestaña/dispositivo (la elección NO debe sobrevivir: `sessionStorage` es por pestaña); navegador integrado
(Instagram → Safari) con `plan`; iPhone real.

## 5. Publicación (separada; nada sin aprobación)

1. **App** → `rbn888/aurix-app-site` (Pages, `app.aurixsystem.io`). Procedimiento usado en v859/v860:
   `git archive origin/main` → `node scripts/aurix-build-site.mjs <dir>` → gitleaks + retirada del correo del
   propietario → `rsync` sobre el clon de `aurix-app-site` (sin `.git` ni `CNAME`) → commit `AURIX app — sitio
   publicado (vNNN)` → push → esperar Pages y comprobar `version.json` (appjs 821 · loginhtml 498) y `cmp` de los
   bytes publicados. El deploy de Pages del repositorio privado NO es la vía.
2. **Landing** → proyecto Vercel `aurix-landing` (integración Git: lo despliega el push a `main` de `rbn888/Aurix`,
   igual que `isa-portfolio` para la API). La caché del edge de `aurixsystem.io` puede servir el HTML anterior unos
   minutos: verificar por bytes (`?v=lp-commercial-6`).
3. Orden: app primero (una landing nueva contra una app antigua sólo pierde el resaltado; nada se rompe).
   El push a `main` también publica la API (`isa-portfolio`) y dispara el workflow antiguo de Pages.

---

## 6. CIERRE VISUAL Y FUNCIONAL (2026-10-22, segunda ronda)

Alcance registrado del encargo «SPEC de cierre visual y funcional». Sustituye lo anterior donde lo contradiga.

**Hero.** Intacto respecto a lo publicado (copy ES/EN, animaciones, «Ver análisis», encuadre móvil, botones).
No se regenera: la app actual ya pinta otra cápsula (v859) y regenerarlo cambiaría lo aprobado. Comprobado que la
cartera nueva NO altera el hero: render HEAD vs nueva con la misma app ⇒ geometría generada idéntica y curva
visualmente idéntica (diferencias sub‑píxel por redondeo al céntimo; HEAD vs HEAD difiere ya en la hora impresa).

**Copy de Intelligence.** Literal (§1). Énfasis discreto en «ahorra tiempo» / «save time» (`lp.intel.lead.a/b/c`,
`<strong class="iv2-save">`: peso 600, blanco pleno).

**Cartera de demostración (fuente única, `scripts/aurix-landing-captures.mjs`).** Cotizaciones de 24 h / última
sesión moderadas (`CHG24`): MSFT +0,2 · AAPL −0,368 (resuelta, no elegida) · AMZN +0,5 · META +0,7 · ETFs +0,3 ·
BTC +1,2 · ETH −0,6 · SOL −0,4 · SUI +0,3 · oro +0,2. Restricción exigida por el script: su suma ponderada =
+0,19 % (el 24 h del hero). La historia por categoría sigue la curva del hero escalada (`f_k = 1 + K_k(F − 1)`):
la suma ES la curva original y al final todo vale 1 ⇒ 29/22/18/69, titular, Salud y Radar intactos. Sólo BTC
supera el umbral de «movimiento» del motor (≥1 % y ≥0,05 pp). Seguimiento (`positions-demo-*`) regenerado con
la misma cartera (`--positions`).

**Etiquetas (reales del motor, en la captura).** «Acciones: 51% de tu cartera» · «Bitcoin: +1,2% · 24 h» (EN:
«Stocks: 51% of your portfolio» · «Bitcoin: +1.2% · 24 h»). «Tres mayores inversiones» no aparece porque el
titular ya lo dice (regla del producto). No hay liquidez (sin serie de Evolución) ni asociaciones inventadas.

**Salud — producto (app).** El anillo vuelve a la escalera INT.2Z que ya existía (`is-tone-*` en CSS, retirada en
49b8618): ≥80 verde · ≥60 lima · ≥40 ámbar · ≥20 naranja · <20 rojo. Cero umbrales nuevos (40/60 coinciden con
las bandas de `_aurixIntelHealth`); sólo en estados que juzgan (débil, a vigilar, estable, equilibrada); «dos
posiciones», «no medible» y «sin posiciones» siguen neutros. Puntuación, bandas y texto intactos. La demo (33 %,
«A vigilar») sale **naranja**: no se pinta de verde ni se cambia la cartera para ello. Gates re‑decididos:
`AURIX-INTELLIGENCE-ENGINE` M.5 y `AURIX-INT-TRUTH-FOUNDATION` 1.5.

**Salud — landing.** Arco vectorial (`.iv2-arc`) sobre la pista de la captura (la base se captura sin arco);
caja, color y fracción medidos en la misma sesión. Se arma vacío y se dibuja una vez (1000 ms) al entrar en
pantalla; no se reinicia. Sin JS / movimiento reducido: valor final por CSS. Sólo escritorio (en móvil no hay
Salud).

**Tres preguntas de Explora.** Las tres visibles, reales del motor, ES/EN:
1. ¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones? → «Repartes entre 4 clases de
   inversión, pero no tanto entre posiciones: el peso sigue recayendo en tus tres mayores inversiones.» / «Clases:
   Acciones, Cripto, Fondos/ETF y Metales. Tres mayores: Microsoft, Bitcoin y Apple.»
2. ¿Qué parte de mi cartera está entre Acciones y Cripto? → «Acciones y Cripto reúnen hoy el 92% de tu cartera
   financiera.» / «Acciones, 51%; Cripto, 41%.»
3. ¿Cuánto han rendido realmente mis inversiones? → «El rendimiento de tu cartera financiera fue del 0,19% en el
   último día registrado» (coherente con el +0,19 % del hero).
EN: «Am I spread across several investment classes, or do I still depend on a few investments?» → «You spread
across 4 investment classes, but less so across positions: the weight still rests on your three largest
investments.» / «Classes: Stocks, Crypto, ETF / Funds and Metals. Three largest: Microsoft, Bitcoin and Apple.»;
«How much of my portfolio is in Stocks and Crypto?» → «Stocks and Crypto together hold 92% of your financial
portfolio today.» / «Stocks, 51%; Crypto, 41%.»; «How much have my investments actually returned?» → «The return
of your financial portfolio was 0.19% over the last recorded day».
Comportamiento del producto: UNA abierta cada vez; abrir ocupa la card (las otras no están disponibles hasta
cerrar). La card abierta es la captura sin el texto; el texto va encima como región real (enfocable, desplazable
con rueda, teclado y dedo; sin bloquear el scroll de la página), con la tipografía medida (sangría 28 px del
producto, color del 2.º párrafo) y un mínimo de 13 px. Controles ≥44 px, `aria-expanded`/`aria-controls`, Escape
cierra y devuelve el foco. Sin JS: lista estática de las tres preguntas con su respuesta (`.iv2-static`).
Corrección de producto asociada: `intv6_r_effective_days` decía «los últimos 1 día registrados» → «el último día
registrado» (EN «the last recorded day»).

**Acabado común.** Hero, Intelligence, Seguimiento, Market y Workspace: fondo navy, borde azul discreto (anillo en
el contenedor, sin mover capas) y difuminado azul. Iluminación al pasar/foco sólo en lo interactivo (hero e
Intelligence); las capturas estáticas dejan de iluminarse.

**Idioma.** ES→EN→ES (con pausa, rápido y durante la animación del hero) reproducido en local y en producción sin
diferencias frente a la carga directa. Causa probable de lo observado: la vista previa se servía con caché (http
.server) y `app.js/styles.css` cambiaron sin subir `?v=` ⇒ HTML nuevo con JS viejo. Ahora: servidor sin caché
(`no-store`) y `?v=lp-commercial-6`.

**Gate.** `AURIX-CHART-V480-RUNTIME-CLEANUP` (fallo intermitente vía `DATA-TRUTH` → hermanos): descartado el
límite temporal de `AUTH-MOBILE-STABILITY-FREEZE` #9 (1,51 s frente a 3,5 s, también con carga) y la cadena
instrumentada pasa 8/8 conservando la salida. Patrón observado: procesos que se cuelgan (99 % CPU) o mueren. El gate
final se ejecuta UNA vez con `--report-on-signal` y un vigilante que vuelca la pila de cualquier arnés >120 s, sin
cambiar límites ni comprobaciones.

---

## 7. AJUSTES FINALES (2026-10-23)

- **Beneficio de Intelligence** (literal): ES «Obtén tu análisis al instante. Ahorra tiempo, descubre lo que importa»
  (sin punto final, tal como se aprobó) · EN «Get your analysis instantly. Save time, discover what matters.».
  Énfasis discreto en «Ahorra tiempo» / «Save time» (`lp.intel.lead.a/b/c`). Repetición informada, no corregida:
  «descubre» aparece en líneas seguidas (problema «Descubre qué riesgos…» y beneficio «…descubre lo que importa») y
  también en el subtítulo del hero; en EN, «Discover…» / «…discover what matters».
- **Acabado:** las cinco demostraciones (Dashboard, Intelligence, Seguimiento, Market, Workspace) usan EXACTAMENTE
  el tratamiento exterior del Dashboard (una regla compartida): fondo navy, borde azul, difuminado y el mismo brillo
  azul eléctrico al pasar el ratón, misma intensidad y transición. Las estáticas: cursor normal, sin enlace ni zoom.
- **Radar:** fuera el pie exterior. Nota dentro de la tarjeta, en la fila del título y alineada a la derecha:
  ES «Historial analizado: 1 día» · EN «History analysed: 1 day» (`lp.iv2.radar`, ≥12 px). El «1» es el periodo
  medido por el motor sobre la cartera de demo (el script lo exige antes de escribir); posición medida en la misma
  sesión (`INTEL-V2-LAYERS`).
- **Planes:** dentro de Premium, Anual y Mensual en dos columnas cuando la tarjeta tiene ≥380 px de contenido
  (container query; escritorio y tablet), con filas compartidas (subgrid): nombre · precio · nota · botón alineados;
  Anual primero y destacado; funciones comunes debajo, una vez. Por debajo, apiladas. Free sin estirar. Precios,
  condiciones y destinos sin cambios.
- Cache-bust: `?v=lp-commercial-7`.

---

## 8. CIERRE Y PUBLICACIÓN (2026-10-23)

- **Planes:** Premium arriba (todo el ancho) y Free debajo, en el mismo contenedor centrado (máx. 960 px), en
  escritorio y móvil (Premium primero también en el DOM). Dentro de Premium: Anual izquierda / Mensual derecha con
  precios y botones alineados cuando hay anchura (container query ≥380 px de contenido); apiladas en móvil. Anual
  conserva el azul glass. Funciones comunes debajo, una vez. Free compacto y de altura natural (en escritorio, dos
  columnas internas: nombre, precio y botón | lista). Retirado el `min-height` de las condiciones (ya no hay
  columnas que igualar). Precios, condiciones, textos y destinos sin cambios.
- **Cabecera:** «Entrar» (ES) / «Log in» (EN) a la derecha de ES | EN (`.hdr-login`, `data-app-login`): pastilla
  compacta con acabado AURIX, área táctil ≥44 px, visible en móvil sin crecer la cabecera (77 px). Destino:
  la entrada normal de la app con el idioma (`https://app.aurixsystem.io/?lang|langhint=…`), sin `intent`, sin
  `plan` y sin referido; la app la trata como entrada sin intención (no reabre planes). «Crear cuenta gratis»
  sigue en el hero.
- Cache-bust: `?v=lp-commercial-8`. App: 821 · login 498 · `v861-premium-plan-choice`.
- Validación: probe de la landing 1457/1457 (Chromium + WebKit, ES/EN, 360–1440).
