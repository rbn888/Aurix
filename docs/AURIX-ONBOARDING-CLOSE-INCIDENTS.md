# Incidencias separadas del cierre del onboarding (rama `onboarding/premium`)

Ninguna se corrige en este cierre: no vienen de sus cambios. Se documentan con la evidencia reunida.

## 1 · WebKit de escritorio: el Dashboard deja de responder

**Síntoma.** En WebKit automatizado (Playwright, headless **y** con ventana), con sesión y ancho de
ventana **> 768 px**, el hilo principal se bloquea ~0,5–2 s después de cargar `index.html`: no vuelve
ni un `evaluate` trivial y no se registra ningún temporizador más (bloqueo síncrono). Con **≤ 768 px**
funciona normal (87 latidos en 9 s frente a 5–6).

**Lo que está descartado.**
- El rediseño del onboarding: la primera demo (código de `main`, antes de esta rama) se atascaba igual.
- La pantalla de onboarding: ocurre también con cuenta vacía y con cartera, sin onboarding.
- Las librerías de gráficos: bloqueando Chart.js y lightweight-charts persiste (sólo se retrasa).
- La marca de la demo y sus reglas `:has()`: retiradas, persiste.
- El modo headless: con ventana también se congela.

**Dónde está.** El umbral exacto (768/770 px) es el de `window.AURIX_MOBILE_SAFE = innerWidth <= 768`
(`app.js:912`): la ruta de ESCRITORIO del Dashboard. La ruta «mobile-safe» no se congela.

**Lo que NO se ha podido determinar.** Si ocurre en **Safari real** de escritorio (no se ha probado en
un dispositivo) y si lo dispara algún dato del adaptador de demo (estado vacío/sin historia) que en
producción no se da. Ninguna sonda existente ejercita en WebKit el Dashboard de escritorio CON sesión.

**Siguiente paso propuesto (fuera de este cierre).** Abrir Safari de escritorio con una cuenta real; si
se reproduce, perfilar la ruta `AURIX_MOBILE_SAFE === false` del primer render del Dashboard.

## 2 · «Riesgo elevado» con sólo liquidez

**Origen.** `_aurixHealthScore` (`app.js`, salud heredada de Dashboard/Workspace; la Salud V2 de
Intelligence es otra). Para una cuenta con un único registro de liquidez (100 % efectivo):
- `topCategory.pctTotal > 60` (la categoría dominante es «liquidez») → **−20**
- `assetCount === 1` → **−25**
- `cashPct > 60` → **−10**
- `dominantAsset` no penaliza (la cartera es totalmente líquida, el owner ya lo excluye).

100 − 55 = **45** ⇒ banda 40–59 ⇒ «Riesgo elevado». La misma concentración en efectivo se penaliza tres
veces. No se ha cambiado mensaje, umbral ni fórmula: es una decisión financiera del fundador.
