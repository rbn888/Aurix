# AURIX · CIERRE WORKSPACE + PRESENTACIÓN PREMIUM — checklist de evidencia

`v789-paywall-premium` · appjs 749. Continúa el cierre que venía de `v788` y **no
retrocede nada**: el trabajo de Intelligence (`8deb818`…`11c1c36`) queda intacto.

## Alcance cerrado en esta pasada

| § | Superficie | Estado | Evidencia |
|---|---|---|---|
| 8 | **Paywall** — presentación centrada en Premium | CERRADO | `scripts/aurix-paywall-probe.mjs` · `docs/paywall/` (antes/después, 6 anchos × ES/EN × Chromium/WebKit) |
| 6 | **Portadas Free** — igualdad del contenedor exterior | CERRADO | `scripts/aurix-wsfc-cover-probe.mjs` 394/394 |
| 3 | **Nombres** — título y subtítulo no se repiten | CERRADO | `scripts/aurix-dashboard-plans-probe.mjs` 132/132 |
| — | Gate completo | GO | `node scripts/aurix-ci-gate.mjs` |

## DEFECTO ENCONTRADO Y **NO** CERRADO AQUÍ: `switchLang` cuelga WebKit en ≥1024

La sonda del paywall se quedaba colgada —sin excepción y sin assert rojo— siempre
en el mismo punto: WebKit, inglés, 1024×768. Aislado, la causa es que
**`switchLang('en')` NO VUELVE y BLOQUEA EL HILO**: ni ese `evaluate` ni ninguno
posterior contestan.

- **Repro mínimo**: WebKit · viewport 1024×768 · cargar `index.html` · esperar a
  que exista `switchLang` · llamarlo con `'en'`. No vuelve en 45 s.
- **NO lo introduce este cierre**: reproduce idéntico sobre los bytes de HEAD
  (`11c1c36`), antes de tocar nada.
- **Sólo WebKit**: Chromium pasa los seis anchos en los dos idiomas.
- **Dependencia**: `switchLang` es el owner único del idioma y, en la pestaña
  activa, repinta el **Dashboard** — motor EXCLUIDO de este alcance (§1). Cerrarlo
  exige entrar ahí, así que se declara con su evidencia en vez de tocarlo.
- **Impacto probable en producción**: alguien en Safari con una ventana de
  ≥1024 px que pulse EN podría dejar la pestaña sin responder. **Sin confirmar en
  Safari real** — WebKit de escritorio no es Safari.

La sonda deja de depender de ello: **fija el idioma ANTES de arrancar**
(`portfolio_lang` en `localStorage`), que además es el camino real —quien tiene la
app en inglés la abre ya en inglés— y comprueba que arrancó en el idioma pedido.
Un cuelgue silencioso parece trabajo en curso, y eso es peor que fallar.

## Qué cambió, y por qué

**§8 · El paywall deja de vender comparándose con Free.** La comparativa «Ya
incluido en Free» se retira ENTERA (marcado, nueve claves i18n y estilos). Dos de
sus frases eran falsas por construcción: «las ocho capacidades» con NUEVE
publicadas, y «lo que Aurix publique en Premium a partir de ahora», una promesa
abierta sobre producto que no existe. Su espacio lo ocupa **qué se compra**, con
tres bloques y un ejemplo de uso comprobable cada uno. **El recuento y los nombres
de las capacidades salen de `_wsfcPublishedCaps()`** —la misma fuente que la
portada Free— así que publicar una décima capacidad actualiza el paywall sin que
nadie lo toque.

**§8 · Dos defectos de accesibilidad y contraste, cerrados de paso.**
- El **foco se perdía** al abrir: `openAurixPremiumModal` enfocaba el botón de
  cierre y acto seguido `_aurixBillingPricesLoad()` reemplazaba el `innerHTML`.
  Con el catálogo ya cacheado la promesa resuelve en el mismo microtask, así que
  a partir de la SEGUNDA apertura de la sesión el foco caía al `<body>`, fuera
  de la trampa de Tab. Ahora se devuelve tras reconstruir, y sólo si estaba dentro.
- La **microcopia** («Tu plan se activa cuando el pago se confirma») medía
  **4,44:1** a 11 px, por debajo del 4,5 que exige §2. Sube a ~5,1:1.

**§6 · El contenedor exterior de las dos portadas Free no medía lo mismo.** Tres
números mágicos para el mismo cromo: Intelligence descontaba 116 px, Workspace
118 px + área segura, y en ≥1024 Workspace descontaba 68 px. Diferencia medida:
2 px en móvil y tablet, **48 px en escritorio**. Un solo owner
(`--aurix-cover-chrome`) y los cuatro sitios lo consumen.

**§3 · «Presupuesto mensual / Presupuesto mensual».** El primer guardado SUGIERE
el nombre de la capacidad, así que la tarjeta más probable del producto repetía
título y subtítulo. `_wsSubIfDistinct()` decide si se PINTA el subtítulo; el
nombre guardado no se toca.

## Asserts sustituidos (y el contrato que los reemplaza)

- `F.9` protegía las cuatro claves de la lista Premium → ahora exige que el
  recuento y los nombres **deriven del catálogo** y que no haya ni una cifra ni un
  nombre escritos a mano en el bloque.
- `F.9b` prohibía anunciar como gratis una capacidad de pago → ahora exige que la
  comparativa **no exista**: ni marcado, ni claves, ni estilos.
- `F2.10` prohibía las palabras «Informes» y «Objetivos» → **«Objetivos
  financieros» se publica** y es una de las nueve. La prohibición pasa a
  derivarse: lo que el catálogo no publica no se puede nombrar.
- `F.9d` es nueva: ninguna promesa abierta sobre producto futuro, en los dos idiomas.
- `C.9` (M06) pedía `pw_free_tier` y `pw_prem_tier` en los dos idiomas: eran los
  DOS RÓTULOS de la comparativa retirada. La pregunta no cambia —«¿está la copy
  crítica en los dos idiomas?»— y ahora apunta a lo que ocupa ese espacio.
- `AURIX-DASHBOARD-PLANS-harness.js` no perdió ningún assert: le faltaba
  `_wsSubIfDistinct` en su sandbox y el render LANZABA. Volvió a ser el primero en
  avisar, que es exactamente para lo que está.

## Pendientes externos (NO cerrados aquí, y no bloquean esto)

- **iPhone físico del founder.** WebKit de escritorio comparte el motor de layout
  pero no la barra de URL dinámica, `100dvh` real ni `env(safe-area-inset-*)`.
- **Journey Premium autenticado.** El sandbox es OTP-only (`mailer_autoconfirm:false`):
  las personas se montan por la superficie saneada del resolver, no iniciando sesión.
- ~~**Stripe sigue en TEST.**~~ **CORREGIDO (registro del 2026-10-01):** el fundador hizo
  una compra **LIVE** de 7,99 € en producción, recibió el cargo y Premium se activó. Esta
  línea describía el estado de cuando se escribió el checklist y ya no vale para producción.
  Las sondas de este cierre siguen siendo **simuladas** (persona Premium montada por la
  superficie saneada del resolver, sin Checkout ni cobro). Los importes de las sondas
  (69,99 € / 7,99 €) son la ENTRADA del render, no producto: el paywall no lleva ni un
  precio en el bundle.
- **Prueba de brillo físico reducido** (§2): no ejecutable desde aquí.
- **`switchLang` en WebKit ≥1024** (arriba): pre-existente, fuera de alcance,
  pendiente de decisión del founder.
