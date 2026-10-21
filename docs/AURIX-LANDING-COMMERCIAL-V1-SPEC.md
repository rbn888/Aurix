# AURIX — SPEC único · Landing comercial v1

Estado: **APROBADO para implementar** (2026-10-21) · rama `aurix/landing-commercial-v1` · sin merge ni despliegue hasta revisión visual del fundador.
Referencia única. Consolida el informe de dirección comercial del 21-10-2026, la auditoría de la landing publicada y las cinco correcciones finales.

## 0. Alcance y principios

- Lote único limitado a `landing/` y a dos scripts de herramienta en `scripts/` (no se publican).
- Fuera de alcance: app, `login.html`, auth, onboarding, Stripe, precios, derechos, afiliados, legales, instrumentación, `og-image`.
- Se mantiene lo que funciona: anclas (el texto queda visible bajo la cabecera), paso de idioma (`lang`/`langhint`), `intent=premium`, CSP, footer y el sistema `.reveal` (sólo se activa con JS).
- Los datos del ejemplo son **los del motor** sobre la cartera de demostración (§4.1). Ninguna cifra se escribe a mano sin que el script de capturas la contraste con el motor.
- No se elimina ningún recurso existente de `landing/assets/` en este lote.

## 1. Orden de secciones y anclas

| # | Sección | id / clase |
|---|---|---|
| 1 | Cabecera | `#siteHeader` |
| 2 | Hero | `.hero` (en `main#top`) |
| 3 | AURIX Intelligence (panel + línea Free + beneficios) | `#intelligence` |
| 4 | Cómo empezar | `#how` (mismo id: el enlace del footer sigue funcionando) |
| 5 | Dashboard y seguimiento + Market | `#tracking` |
| 6 | Workspace | `#workspace` |
| 7 | Franja de confianza | `.section--trust` |
| 8 | Planes | `#plans` |
| 9 | Preguntas frecuentes | `#faq` |
| 10 | Cierre | `#start` |
| 11 | Footer | sin cambios |

Se retiran del marcado: frase puente, fila «Cómo funciona» con posiciones (pasa a §5), tarjetas `.intel-cap`, `intel.note` (pasa a la franja de confianza), `.ws-chips` (quedan en el FAQ) y `final.note`. Las claves i18n sin uso pueden quedarse.

## 2. Copy definitivo ES / EN

Porcentajes ES con espacio fino irrompible («29 %»).

### 2.1 Metadatos
| Clave | ES | EN |
|---|---|---|
| `meta.title` (+ `<title>`, `og:title`, `twitter:title` estáticos en EN) | AURIX — Comprende mejor tu patrimonio | AURIX — Understand your wealth better |
| `meta.desc` (+ `description`, `og:description`, `twitter:description`) | Inteligencia patrimonial para inversores: reúne tus inversiones en un solo lugar y descubre de qué depende tu patrimonio y qué está cambiando. Empieza gratis. | Wealth intelligence for investors: bring your investments together in one place and discover what your wealth depends on and what is changing. Start free. |

### 2.2 Cabecera
| Elemento | ES | EN |
|---|---|---|
| Enlaces | Intelligence · Cómo empezar · Planes · Preguntas | Intelligence · Get started · Plans · FAQ |
| CTA escritorio y menú móvil | Crear cuenta gratis | Create a free account |
| CTA compacto cabecera móvil (§5.4) | Crear cuenta | Sign up |
| CTA del pie del footer | Crear cuenta gratis | Create a free account |

### 2.3 Hero
| Elemento | ES | EN |
|---|---|---|
| Frase superior | Inteligencia patrimonial para inversores | Wealth intelligence for investors |
| H1 | Comprende mejor tu patrimonio. / Decide con más información. | Understand your wealth better. / Make better-informed decisions. |
| Descripción | Reúne tus inversiones en un solo lugar y descubre qué está pasando con tu dinero. | Bring your investments together in one place and see what's happening with your money. |
| CTA principal | Crear cuenta gratis | Create a free account |
| CTA secundario (→ `#intelligence`) | Descubrir Intelligence | Explore Intelligence |
| Pie de imagen | Cartera de demostración | Demo portfolio |
| Alt | Dashboard de AURIX con una cartera de demostración: patrimonio invertible, evolución y reparto por categorías | AURIX Dashboard with a demo portfolio: investable wealth, evolution and split by category |

### 2.4 AURIX Intelligence
| Elemento | ES | EN |
|---|---|---|
| Frase superior | AURIX INTELLIGENCE | AURIX INTELLIGENCE |
| Título | Descubre qué merece tu atención. | See what deserves your attention. |
| Descripción | Entiende de qué inversiones depende tu patrimonio, qué ha cambiado y dónde merece la pena mirar más de cerca. | Understand which investments your wealth depends on, what has changed and where it's worth taking a closer look. |
| Panel · titular (motor) | Microsoft, Bitcoin y Apple pesan más que tus otras 9 inversiones juntas. | Microsoft, Bitcoin and Apple outweigh your other 9 investments combined. |
| Panel · rótulo barras | Factores principales | Key drivers |
| Barras | Microsoft 29 % · Bitcoin 22 % · Apple 18 % · Resto de la cartera, liquidez incluida 31 % | Microsoft 29% · Bitcoin 22% · Apple 18% · Rest of the portfolio, cash included 31% |
| Panel · línea del motor | Tus 3 mayores inversiones reúnen el 69 % de tu cartera financiera. | Your 3 largest investments hold 69% of your financial portfolio. |
| Panel · consecuencia | Ahora sabes qué posiciones pueden marcar la evolución del conjunto. | Now you know which positions can shape how your whole portfolio moves. |
| Panel · identificación | Cartera de demostración · vista Premium | Demo portfolio · Premium view |
| Panel · enlace (nueva pestaña) | Ver la pantalla completa | See the full screen |
| Comparación Free · rótulo | Tu primera lectura con Free | Your first reading on Free |
| Comparación Free · texto (motor, Free) | «El 29 % de tu cartera financiera depende de Microsoft.» | “29% of your financial portfolio depends on Microsoft.” |
| Beneficio 1 | **Comprende de qué depende tu dinero.** Reconoce qué posiciones tienen más peso y cómo se distribuye tu patrimonio. | **Understand what your money depends on.** See which positions carry the most weight and how your wealth is distributed. |
| Beneficio 2 | **Distingue los cambios importantes.** Entiende qué ha cambiado en tu cartera y qué merece una revisión más detenida. | **Spot the changes that matter.** Understand what has changed in your portfolio and what deserves a closer review. |
| Beneficio 2 · nota | Se apoya en el historial que AURIX registra desde que añades tus inversiones. | Builds on the history AURIX records from the day you add your investments. |
| Beneficio 3 | **Encuentra respuestas en tus propios datos.** Explora preguntas sobre tus inversiones y descubre qué hay detrás de cada conclusión. | **Find answers in your own data.** Ask questions about your investments and see what's behind each conclusion. |
| Alt captura enlazada | Pantalla completa de AURIX Intelligence (vista Premium) con la cartera de demostración | Full AURIX Intelligence screen (Premium view) with the demo portfolio |

### 2.5 Cómo empezar (`#how`)
| Elemento | ES | EN |
|---|---|---|
| Título | Empieza con las inversiones que ya tienes. | Start with the investments you already have. |
| 01 | **Accede con tu correo.** Crea tu cuenta gratuita. | **Sign up with your email.** Create your free account. |
| 02 | **Añade tus inversiones.** Reúne tus posiciones en un solo lugar. | **Add your investments.** Bring your positions together in one place. |
| 03 | **Descubre qué merece tu atención.** Consulta tu patrimonio y obtén tu primera lectura de Intelligence. | **See what deserves your attention.** Check your wealth and get your first Intelligence reading. |
| CTA | Crear cuenta gratis | Create a free account |
| Nota | Tú registras tus posiciones. Sin facilitar credenciales bancarias. | You record your positions yourself. No banking credentials needed. |

### 2.6 Dashboard y seguimiento + Market (`#tracking`)
| Elemento | ES | EN |
|---|---|---|
| Frase superior | DASHBOARD Y SEGUIMIENTO | DASHBOARD AND TRACKING |
| Título | Tu patrimonio cambia. Mantén la perspectiva. | Your wealth changes. Keep the bigger picture. |
| Texto | Consulta cuánto tienes, cómo se distribuye y cómo evoluciona. | See how much you have, how it is distributed and how it evolves. |
| Contexto | Organiza acciones, ETFs, fondos, cripto, metales, inmuebles y liquidez. AURIX actualiza los precios de los activos cotizados y construye el historial de tu patrimonio a medida que lo usas. | Organise stocks, ETFs, funds, crypto, metals, real estate and cash. AURIX updates the prices of listed assets and builds your wealth history as you use it. |
| Alt posiciones | Posiciones de la categoría Acciones en AURIX, con la cartera de demostración | Positions in the Stocks category in AURIX, with the demo portfolio |
| Market · título/texto/alt | sin cambios (`how.mkt.*`, `alt.market`) | sin cambios |
| Market · pie (sólo EN) | — | Interface shown in Spanish |

### 2.7 Workspace (`#workspace`)
| Elemento | ES | EN |
|---|---|---|
| Frase superior | WORKSPACE · PREMIUM | WORKSPACE · PREMIUM |
| Título | Pon tus próximos objetivos en números. | Put numbers on your next goals. |
| Texto | Calcula un objetivo, compara escenarios y organiza tu presupuesto. | Plan a goal, compare scenarios and organise your budget. |
| Ejemplo 1 | **Objetivos.** Convierte tus metas en objetivos medibles. | **Goals.** Turn your aspirations into measurable goals. |
| Ejemplo 2 | **Escenarios.** Compara decisiones antes de ejecutarlas. | **Scenarios.** Compare decisions before you make them. |
| Ejemplo 3 | **Presupuestos.** Controla ingresos, gastos y ahorro libre. | **Budgets.** Track income, spending and what's left to save. |
| Nota | Incluido en Premium. Cada plan se guarda en tu cuenta para retomarlo más tarde. | Included with Premium. Each plan is saved to your account so you can pick it up later. |
| Alt | sin cambios (`alt.workspace`) | sin cambios |

### 2.8 Franja de confianza
| Elemento | ES | EN |
|---|---|---|
| Frase superior | Claridad y control, desde el principio | Clarity and control, from the start |
| 1 | **Sin acceso a tu dinero.** AURIX no se conecta a tu banco ni a tu bróker y no puede mover fondos. | **No access to your money.** AURIX does not connect to your bank or broker and cannot move funds. |
| 2 | **Interpreta, no recomienda.** Explica tus propios datos. No te dice qué comprar ni qué vender. | **Insight, not advice.** It explains your own data and never tells you what to buy or sell. |
| 3 | **Suscripción clara.** El pago lo procesa Stripe y AURIX no guarda tu tarjeta. Cancela cuando quieras desde «Gestionar mi plan». | **A clear subscription.** Payments are processed by Stripe and AURIX does not store your card. Cancel anytime from “Manage my plan”. |
| 4 | **Soporte por correo.** Escríbenos desde la página de Soporte. (`data-legal-link="support"`) | **Email support.** Write to us from the Support page. |

### 2.9 Planes
| Elemento | ES | EN |
|---|---|---|
| Título | Empieza gratis. Profundiza con Premium. | Start free. Go deeper with Premium. |
| Free · precio | 0 € · sin coste | €0 · no cost |
| Free 1–3 | Todas tus posiciones, sin límite de activos · Dashboard con total, reparto y evolución · Market: sigue índices y activos | All your positions, with no asset limit · Dashboard with total, split and evolution · Market: follow indices and assets |
| Free 4 | Tu primera lectura de Intelligence sobre la composición de tu cartera | Your first Intelligence reading of your portfolio's composition |
| Free · CTA | Crear cuenta gratis | Create a free account |
| Premium · precio destacado | 69,99 € al año | €69.99 per year |
| Premium · detalle | Un único cobro anual: equivale a 5,83 € al mes y ahorras un 27 % frente al pago mensual. | One annual payment, equivalent to €5.83 a month: 27% less than paying monthly. |
| Premium · alternativa | O 7,99 € al mes, con cobro mensual. | Or €7.99 a month, billed monthly. |
| Premium 1 | Intelligence completa: dependencias, escenarios y qué ha cambiado en tu cartera, con preguntas sobre tus propios datos | Full Intelligence: dependencies, scenarios and what has changed in your portfolio, plus answers to questions about your own data |
| Premium 2 | Todas las herramientas de Workspace: presupuestos, objetivos, escenarios, préstamos, interés compuesto y más | Every Workspace tool: budgets, goals, scenarios, loans, compound interest and more |
| Premium 3 | Guarda tus planes para retomarlos más tarde | Save your plans to pick them up later |
| Premium · CTA (`intent=premium`) | Descubrir Premium | Explore Premium |
| Condiciones | Suscripción renovable. Cancela cuando quieras desde «Gestionar mi plan». | Renewing subscription. Cancel anytime from “Manage my plan”. |

### 2.10 FAQ (orden)
1. ¿Qué es AURIX? — ES «Una plataforma de inteligencia patrimonial para inversores particulares. Reúnes tus inversiones en un solo lugar, Intelligence te ayuda a entender de qué depende tu patrimonio y qué está cambiando, y Workspace te permite planificar con tus propios números.» · EN «A wealth intelligence platform for individual investors. You bring your investments together in one place, Intelligence helps you understand what your wealth depends on and what is changing, and Workspace lets you plan with your own numbers.»
2. Activos (`faq.6`) · 3. Banco/bróker (`faq.2`) — sin cambios.
4. ¿Qué puedo hacer gratis? — ES «Registrar todas tus posiciones, ver tu patrimonio, su reparto y evolución, seguir el mercado y recibir una primera lectura de Intelligence sobre la composición de tu cartera. Premium añade Intelligence completa, todas las herramientas de Workspace y el guardado de tus planes.» · EN «Record all your positions, see your wealth, its split and evolution, follow the market and get a first Intelligence reading of your portfolio's composition. Premium adds full Intelligence, every Workspace tool and saving your plans.»
5. ¿Qué hace Intelligence? — ES «Lee tu cartera y te la explica: de qué posiciones depende, cómo se reparte y qué ha cambiado de forma relevante. Lo que se refiere a cambios se apoya en el historial que AURIX registra desde que añades tus inversiones. Free incluye una primera lectura, que aparece cuando todos tus activos tienen precio y divisa disponibles; Premium desbloquea el análisis completo.» · EN «It reads your portfolio and explains it: which positions it depends on, how it is split and what has changed in a meaningful way. Anything about changes builds on the history AURIX records from the day you add your investments. Free includes a first reading, which appears once every asset has an available price and currency; Premium unlocks the full analysis.»
6. Workspace (`faq.8`), guardado (`faq.9`), cobro (`faq.3`), recomendaciones (`faq.4`), dónde (`faq.5`) — texto sin cambios salvo «Aurix» → «AURIX».

### 2.11 Cierre
| ES | EN |
|---|---|
| Comprende mejor lo que ya has construido. · CTA «Crear cuenta gratis» | Get a clearer understanding of what you've already built. · CTA «Create a free account» |

## 3. Composición y responsive

Cortes: <768 móvil · 768–1023 tablet · ≥1024 escritorio. Contenedor `--maxw: 1200px`.

1. Hero: texto centrado; `<picture>` con escritorio `hero-dashboard-{lang}.jpg` (+`-2x`) y <768 `hero-dashboard-m-{lang}.jpg`; `width/height`, `fetchpriority="high"`; pie «Cartera de demostración». No se exige que la imagen quepa en el primer pantallazo.
2. Intelligence: ≥1024 rejilla 5fr/7fr; <1024 apilado texto → panel → Free → beneficios. Panel con `--surface`, borde `--border-hi`, radio 24, relleno 32/20; titular + esfera arriba; 4 barras `[nombre | barra | %]` con `tabular-nums` y ancho proporcional; separador, 69 %, consecuencia; pie identificación + enlace. Panel y comparación Free sin `.reveal`. Beneficios en 3 columnas ≥900 sin cajas, marcador azul.
3. Cómo empezar: 3 pasos en fila ≥900, numerados 01/02/03; CTA y nota.
4. Seguimiento: fila posiciones (`how-row`) + fila Market (`how-row--rev`, imagen ≤560 px en escritorio).
5. Workspace: texto izq./imagen dcha. ≥1024; tres ejemplos en lista compacta y nota.
6. Confianza: 4 columnas ≥1024, 2×2 tablet, 1 columna móvil; sin tarjetas grandes.
7. Planes: tarjetas existentes; Premium con anual destacado.
8. FAQ y cierre: acordeón existente; cierre sin `final.note`.

## 4. Recursos

### 4.1 Cartera de demostración (fuente única)
Acciones: Microsoft 53.500 · Apple 33.500 · Amazon 4.000 · Meta Platforms 3.620,13. ETF: SPDR S&P 500 700 · Invesco QQQ 700 · iShares S&P 500 511,78. Cripto: Bitcoin 40.930 · Ethereum 27.160 · Solana 4.000 · Sui 4.005,20. Metales: Oro 101,67. Liquidez: dos cuentas de 6.663,30 (valor en `qty`). Inmueble: Vivienda 308.165. Total invertible 186.055,38 USD · 12 inversiones · 15 activos.
Historial ilustrativo: 30 días, determinista, reparto constante, total ±0,2 % terminando en el valor actual; identificado como «Cartera de demostración».

### 4.2 Capturas (`scripts/aurix-landing-captures.mjs`)
| Fichero (ES y EN) | Vista | Encuadre |
|---|---|---|
| `hero-dashboard-{lang}.jpg` / `-2x.jpg` | Dashboard 1440×900 DPR2 | tarjeta superior + 16 px |
| `hero-dashboard-m-{lang}.jpg` | Dashboard móvil real 390×844 DPR2 | tarjeta superior |
| `intelligence-full-{lang}.jpg` | Intelligence Premium 1440 DPR2 | de la tarjeta Salud/titular al final de la fila Radar/Factores/Explora; pregunta de contexto descartada con su control en la sesión local |
| `positions-demo-{lang}.jpg` | Categoría Acciones 1440 | como el encuadre actual |

El script sirve el repo en `127.0.0.1`, corta toda petición externa salvo GET de imágenes, hojas de estilo y fuentes (logos y Google Fonts); ningún fetch/XHR sale de la máquina ⇒ cero escritura en producción y **falla** si el motor no devuelve 29/22/18/69/«9» en Premium y 29 % en Free.
Se conservan sin cambios todos los recursos existentes (`dashboard*.jpg`, `intelligence.jpg`, `positions-{es,en}.jpg`, `market*.jpg`, `workspace-{es,en}.jpg`); la página deja de referenciar los sustituidos.

### 4.3 Idioma
Resolución común: la que ya existe en `landing/app.js` (`detectLang` → `?lang` · elección explícita · idioma guardado · inglés por defecto; la landing no lee el idioma del navegador). **Decidido en implementación:** no se crea `landing/lang.js`. Moverla no evitaba la doble descarga (un script en `<head>` no puede cambiar una imagen que aún no existe) y el harness `docs/AURIX-M03-LANGUAGE-PERSISTENCE-harness.js` ejecuta ese resolutor tal cual desde `landing/app.js`. Las imágenes se localizan con `data-i18n-src` / `data-i18n-srcset` / `data-i18n-href` (plantillas con `{lang}`). Sin JS: versión EN. Medido: en ES el navegador pide también la imagen EN del hero antes del cambio; es objetivo de rendimiento, no condición de gate (§7.7).

## 5. Esfera, color, tipografía, movimiento

- Esfera: port fiel del orbe Intelligence V3 (clases `lp-orb*`): halo 4,2 s, anillos 16 s / 11 s, núcleo fijo con reflejo, ECG 3,4 s; `--orb-c: 77,141,255`; 96 / 80 / 64 px; reserva de halo; `aria-hidden`; `prefers-reduced-motion` ⇒ sin animación y ECG estático; pausa fuera de pantalla con el `IntersectionObserver` existente.
- Color: tokens existentes; títulos blancos, H1 con degradado blanco → `#BCD0EE`, CTA `#5A97F9 → #3F7FE8`, barras `--accent`.
- Tipografía Inter: H1 `clamp(36px, 5.2vw, 64px)`; títulos de sección `clamp(28px, 3.4vw, 46px)`; descripciones 18–19 / 16; titular del panel 24 / 20; mínimo 13 px con contraste AA.
- Cabecera móvil: CTA compacto ≥40 px de alto sólo si no se solapa con logo, idioma o menú; si no cabe, se oculta por debajo de ese ancho.

## 6. Archivos

`landing/index.html`, `landing/app.js`, `landing/styles.css`, `landing/assets/` (sólo añadidos), `scripts/aurix-landing-captures.mjs` y `scripts/aurix-landing-probe.mjs` (nuevos, no se publican), y `docs/AURIX-PUBLIC-LAUNCH-ACTIVATION-harness.js` (su check 4 fijaba el texto antiguo del CTA de cabecera, `cta.enter`; se re-decide a `cta.start` + CTA compacto, mismo destino). Cache-bust: `?v=lp-commercial-2` en CSS y `app.js` (V2).

**Corrección medida en implementación (anclas):** en ≤860 px la cabecera es `sticky` y, al navegar por ancla, el primer texto del destino quedaba ~19 px debajo de ella, también en la versión publicada (WebKit y Chromium). La auditoría previa lo dio por bueno porque midió con `scrollIntoView` y sólo en Chromium. Se añade `scroll-margin-top:72px` a las secciones con id, sólo en ≤860 px. No se tocan app, login, `api/`, `db/`, legales, `og-image`, `robots`, `sitemap`, `AURIX_BUILD`.

## 7. Aceptación (gate único: `scripts/aurix-landing-probe.mjs`, Chromium + WebKit, 360×640 · 375×667 · 390×844 · 412×915 · 768×1024 · 1440×900, ES/EN)

1. Desbordamiento horizontal 0.
2. H1, descripción y CTA principal dentro del primer pantallazo en todas las alturas; CTA secundario desde 667 px.
3. Panel en HTML en el idioma activo con 29/22/18/31/69 (suma 100) y línea Free; ≥16 px en móvil (etiquetas de barra ≥15).
4. Esfera dentro de su tamaño y sin intersección con el titular; con movimiento reducido, sin animación.
5. Anclas `#intelligence`, `#how`, `#plans`, `#faq` con el primer texto bajo la cabecera.
6. Enlaces: `lang`/`langhint`, `intent=premium`, Soporte con `?lang=`, captura completa del idioma activo.
7. Imagen del hero del idioma activo y sin saltos de maquetación (CLS); una segunda descarga se mide y se anota, no bloquea.
8. Sin JS: todo el texto visible.
9. Cabecera móvil sin solapes (o CTA compacto oculto).
10. Pie «Interface shown in Spanish» visible sólo en EN.
11. Capturas antes/después 390 y 1440 ES/EN.
12. Contraste AA y foco visible en CTA, idioma, enlaces y acordeón.
13. `scripts/aurix-landing-captures.mjs` en verde.

## 8. Publicación (sólo tras autorización explícita)

Rama → revisión visual → merge a `main` autorizado (el push a `main` despliega la landing en Vercel; Pages republica la app sin cambios) → `curl --resolve` + `cmp` de `index.html`, `styles.css`, `app.js`, `lang.js` e imágenes nuevas → sonda contra la URL pública (ES/EN, 390 y 1440) → iPhone real. Rollback: `git revert` del commit y push a `main`; si Pages falla, `gh workflow run pages.yml --ref main` (nunca `rerun --failed`).

---

# V2 — Refinamiento comercial y visual (2026-10-21)

Sustituye a lo anterior sólo donde lo dice. Implementado en la misma rama, sin commit.

## V2.1 Orden y eliminaciones
Cabecera y hero → Intelligence (encabezado arriba + demostración) → tres beneficios → Seguimiento → Market → Workspace → Confianza → Planes → FAQ → Cierre y pie.
Eliminados: la sección «Cómo empezar» (pasos y su CTA), el enlace de navegación y del pie a `#how`, el CTA de registro de la cabecera (también el compacto móvil; el menú móvil conserva el suyo), el pie «Cartera de demostración» del hero, el bloque «Tu primera lectura con Free», el pie «Cartera de demostración · vista Premium», el enlace a la fotografía de Intelligence y la nota de historial del beneficio 2 (la explicación sigue en la FAQ de Intelligence).

## V2.2 Hero
- Base: `landing/assets/dashboard.jpg` / `dashboard-2x.jpg` (captura original de la cuenta de prueba: 186.055,38 · +0,19 % en 24 h · 15 activos), identificada por contenido. La captura de 2026-10-08 es otra cartera (41.786 €) con una recta. No se recibió imagen adjunta para contrastar.
- Para que el texto esté en el idioma activo, la imagen final NO es la original retocada: es la app local con la cartera de demostración y el **recorrido original** de 24 h, extraído píxel a píxel de la captura (mediana de la línea verde por columna, 97 puntos) y colocado exactamente sobre el tramo que la app publica como «24 h» (de su snapshot base al último snapshot; la app mide el % contra el último snapshot, no contra el valor en vivo). Resultado verificado: +0,19 %, 186.055,38 en ES y EN.
- Retoque sólo de la captura (CSS inyectado en la sesión local; el producto no se toca): cápsula de salud en una línea con acabado glass y separador «·»; donut bajo el final de la cifra total (en EN la divisa va delante y manda la cápsula: el donut queda a su derecha con 20 px). El script comprueba una línea, separación ≥16 px y que el donut no sale de su zona.
- Nuevos recursos: `hero-dashboard-v2-{es,en}.jpg`, `-2x`, `hero-dashboard-v2-m-{es,en}.jpg`. No se borra ni sobrescribe nada.
- «Ver análisis»: `<a class="hero-hotspot" href="#intelligence">` sobre la cápsula de cada imagen (posición generada en el bloque `HERO-HOTSPOT` de `styles.css`), sin texto visible propio, `aria-label` localizado, área táctil ≥44 px, foco y hover con luz azul, misma pestaña.

## V2.3 Intelligence
Encabezado centrado arriba (rótulo «AURIX Intelligence», título y descripción aprobados). Panel en HTML con la conclusión del motor, el 69 % como protagonista («Tus 3 mayores inversiones reúnen el» **69 %** «de tu cartera financiera.»), el desglose 29/22/18 y «Resto de la cartera financiera» 31 %. Única identificación: «Ejemplo de análisis · Premium» / «Sample analysis · Premium».
Interacción: cada fila y el 69 % son botones con `aria-pressed`; la selección añade borde y marcador (no sólo color) y atenúa el resto a 0,5; el 69 % resalta las tres; volver a pulsar, «Ver todo» o Escape restablecen (el foco vuelve al 69 %).

## V2.4 Esfera
Volumen: núcleo con gradiente, borde de luz, sombra inferior y reflejo; anillos en perspectiva (rotateX 62°) que se inclinan con la velocidad; banda de luz interna; giros con aceleración y frenado. Sin dependencias.
Recorrido (`landing/app.js · initOrbFlight`): progreso q ∈ [0,3] derivado del scroll real y seguido con inercia (muelle crítico, ≤ ~750 px/s en el vuelo); la esfera va EXACTAMENTE sobre el recorrido (esquinas redondeadas, sin atajos): hueco → margen derecho → un looping → pasillo entre panel y beneficios → margen izquierdo, donde acompaña flotando → curva de salida y desvanecimiento antes de «Tu patrimonio cambia». Al aterrizar con el ancla no se va (el vuelo empieza 15 % de pantalla después). El looping no se repite hasta volver al hueco. Evasión del ratón limitada a su zona libre; toque directo = impulso corto; sin capa táctil ni `preventDefault`. Movimiento reducido ⇒ no se inicia (estática). Recalcula con resize, orientación, idioma (`aurix:lang`), `load` y `ResizeObserver`.
**Límite declarado:** sólo vuela con ≥1024 px de ancho y margen lateral libre suficiente (en la práctica, ventanas de ~1300 px o más). En 1280 px, tablet y móvil se queda en su hueco con movimiento local, porque no hay sitio para volar sin tapar texto.
`orb.__lp.state()` expone el estado sólo en lectura, para la sonda.

## V2.5 Resto
Acabado común de capturas (borde azul fino, profundidad, más luz al pasar el ratón). Planes sin la fila vacía de Free: tarjetas por contenido, precio y CTA alineados. Separación hero → Intelligence reducida (hero 20 px abajo, Intelligence 56/48 px arriba). Market mantiene «Interface shown in Spanish» sólo en EN.

## V2.6 Validación
`scripts/aurix-landing-probe.mjs` (Chromium + WebKit) añade a la matriz de §7: cabecera sin CTA, eliminaciones, rótulo único, enlace «Ver análisis», interacciones (ratón, teclado, táctil), aterrizaje, recorrido completo bajando y subiendo con comprobación de solape contra todos los nodos de texto, botones y enlaces en cada paso, looping único, evasión y recuperación, cambio de idioma y de tamaño, móvil/tablet sin vuelo, toque, movimiento reducido y sin JS. `--record` graba el recorrido. `scripts/aurix-landing-captures.mjs` mide el tramo 24 h de la app, coloca la curva, verifica +0,19 % y escribe el bloque `HERO-HOTSPOT`. `docs/AURIX-PUBLIC-LAUNCH-ACTIVATION-harness.js` check 4 re-decidido: sin CTA de registro en la cabecera.

---

# V3 — Retoque final de presentación y animaciones (2026-10-21)

Se conserva todo lo aprobado en V2 (estructura, copy, recorrido de la esfera). Cambia sólo:

- **Hero · entrada del dashboard.** La imagen se compone con una base (captura sin cifra, curva ni segmentos del donut) y tres capas capturadas en la MISMA sesión: curva y donut en PNG transparente y la cifra en HTML (Inter, `tnum`/`lnum`, el formato de la app: «186.055,38 US$» / «$186,055.38»). Una vez por carga, al entrar ≥35 % del dashboard: la cifra cuenta (1,1 s), la curva se revela de izquierda a derecha (`clip-path`) y el donut en sentido horario (máscara cónica). Cambiar de idioma resuelve la cifra al instante. Sin JS o con movimiento reducido se ve completa. Un script mínimo en `<head>` arma el estado inicial antes del primer pintado y, si `app.js` no llega a armarlo en 3 s, lo suelta. Recursos nuevos: `hero-dashboard-v3-{base,curve,donut,full}-*` (la `full` es la referencia de comparación; no se usa en la página). Posición y tipografía de las capas: bloque generado `HERO-LAYERS` de `styles.css`. Verificado: base + capas + cifra frente a la captura completa, misma caja, Chromium y WebKit, ES/EN, 1440 y 390: diferencia media ≤1,3/255 y ≤0,74 % de píxeles con diferencia visible (antialias de bordes).
- **Intelligence · entrada de los datos.** 0 → 69 %, barras desde cero (`scaleX`) y 29/22/18/31 %, una vez al entrar el panel (~950 ms, desaceleración). Ancho reservado y dígitos tabulares. Pulsar durante la entrada completa los valores y aplica la selección. El nombre accesible de cada control lleva siempre el valor final.
- **Esfera.** ECG con trazo base siempre visible y pulso encima (antes se desvanecía en parte del ciclo); `transform-style: flat` en los anillos, para que WebKit no reordene capas; núcleo con borde de luz; halo más contenido; inclinación por velocidad con filtro de paso bajo (sin tirones al cambiar de dirección). Recorrido intacto.
- **Market.** Sin enlace, lupa, cursor de zoom ni apertura en otra pestaña. Se probó un recorte más próximo: el contenido útil ocupa todo el ancho (nombre, precio, 24 h, tendencia, favoritos) y conservar ese contexto sólo ganaba ~4 % de tamaño de texto, así que se conserva el encuadre.
- **Menú móvil.** Sin CTA de registro (el de la cabecera ya se retiró en V2).
- **Capturas.** Sin `fullPage` (estirar la ventana re-maquetaba la app y descuadraba las capas); el móvil se captura en 390×1300. Al generar las capas, transiciones de `body` y del donut desactivadas: su transición dejaba un velo y el donut a medio camino. Bloqueo de escrituras a producción intacto.
- **Cache-bust:** `?v=lp-commercial-3`.
- **Nota de recursos:** la primera ejecución de este lote volvió a generar `hero-dashboard-v2-*` con el mismo nombre (contenido idéntico salvo la hora de «Actualizado a las…»); desde entonces el script escribe la imagen final como `hero-dashboard-v3-full-*`.
- **Validación:** `scripts/aurix-landing-probe.mjs` añade: entrada del hero (se anima, termina exacta, no se repite, idioma al vuelo), alineación píxel a píxel de las capas, entrada de Intelligence (desde cero, exacta, sin saltos de ancho, sin reinicios, interacción durante la entrada), scroll rápido, ECG visible en todo el vuelo, Market sin ampliación, menú sin registro, movimiento reducido y sin JS con los valores finales. `docs/AURIX-PUBLIC-LAUNCH-ACTIVATION-harness.js` check 4: sin CTA de registro en cabecera ni menú móvil.

---

# Cierre — carátula Open Graph, metadatos y publicación (2026-10-21)

- **Carátula:** `landing/og-aurix-v3-en.png` (la que usan los metadatos) y `landing/og-aurix-v3-es.png` (preparada). 1200×630, PNG opaco, optimizado sin pérdida con oxipng (~345 KB). Se compone con `scripts/og/aurix-og.html` usando los estilos reales de la landing (Inter, wordmark `.brand`, esfera V3 en pose fijada con ECG visible) y se renderiza con `scripts/aurix-og-render.mjs`, que comprueba márgenes ≥60 px, esfera y halo completos y que el texto no invade la esfera. `og-image.png` antiguo se conserva.
- **Metadatos:** OG + X (`summary_large_image`) con título, descripción, imagen, `secure_url`, tipo, dimensiones, texto alternativo, URL canónica y locales. Sin duplicados ni referencias locales. **Idioma efectivo: EN para cualquier enlace** (la landing es estática; `?lang=` sólo cambia el idioma con JavaScript, y los rastreadores no lo ejecutan).
- **Publicación DETENIDA por impedimento material:** `app.aurixsystem.io` devuelve el 404 de GitHub Pages en todas sus rutas (repo `rbn888/Aurix` con `has_pages: false` desde 2026-10-21 15:36 UTC). Publicar ahora mandaría a cada visitante de la nueva landing a ese 404, y el workflow de Pages de `main` fallaría. Se reanuda cuando Pages vuelva a estar activo, en una actuación separada.

---

# Ajuste final exclusivo de móvil (2026-10-21)

Sólo presentación móvil (breakpoint existente ≤860 px; el panel de Intelligence a ≤767 px, el mismo del hero móvil). Escritorio sin cambios: 1440 px ES/EN idéntico píxel a píxel a la V3 publicada.
- **Hero:** el hueco cabecera → antetítulo pasa de 100 a 32 px (la cabecera es sticky en el flujo y no hay que reservar su altura dos veces). Los dos botones del hero, centrados, mismo ancho (máx. 280 px), 50 px de alto, texto 16 px y 12 px de separación. Los demás botones no cambian.
- **Dashboard:** los dos puntos son los indicadores del carrusel de la app DENTRO de la captura, y el recorte terminaba encima de ellos. Recurso nuevo `hero-dashboard-v4-{base,curve,full}-m-{es,en}` (la captura llega al borde inferior de la tarjeta, puntos completos con ≥12 px de margen) y su geometría en el bloque generado `HERO-MOBILE-V4` (`scripts/aurix-landing-captures.mjs --mobile-v4`). Los recursos V3 se conservan.
- **Intelligence:** rótulo y esfera en la misma fila (rejilla con `display:contents` sobre el bloque de texto, sin posiciones absolutas) y la conclusión debajo, a todo el ancho y con la misma letra.
- **Cache-bust:** `?v=lp-commercial-4`.
- **Validación:** el gate añade 430 px a la matriz y comprueba hueco, botones, fila rótulo/esfera, ancho de la conclusión y halo; la alineación de capas móvil se mide contra `hero-dashboard-v4-full-m`.
