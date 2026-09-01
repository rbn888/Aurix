# AURIX MONETIZATION V1 · M.02 — B3/B4 PRODUCT ENTITLEMENT INTEGRATION

Continúa B2 (`14b02b9`). **Es el primer bloque de monetización que cambia lo que ve un usuario.**
Sin Stripe, sin Apple, sin checkout, sin paywall final, sin precios, sin herramientas ni plantillas nuevas.

---

## AUTORIDAD

Una sola capa cliente refleja el resolver server-side. No calcula nada.

```
public.aurix_entitlements()  →  _aurixEntitlementsLoad()  →  _aurixEnt  →  hasFeature(key)  →  UI
```

**Se gatea siempre con `features[key] === true`, jamás con `plan`.** B2 documenta por qué: si
`plan_features` se degradara, `plan` seguiría diciendo `premium` con el mapa vacío, y leer `plan` reabriría
el fail-open. Se exige booleano **estricto**: un `"true"` string o un `1` no conceden.

**Fail-closed sin excepción.** Mientras no haya una lectura correcta del servidor, `hasFeature()` es
`false`. Timeout, error de red, sesión ausente, forma inesperada de la respuesta: Free/Preview.

**Revalidación.** B2 declara que un deny global es *absoluto*, y en cliente no lo era: la carga ocurría una
vez por carga de página, así que un PWA abierto desde ayer conservaba el acceso tras un corte de soporte, y
una suscripción cancelada seguía dando acceso toda la sesión. Ahora se revalida en **dos** momentos, los dos
cableados: `visibilitychange` cuando la pestaña vuelve al primer plano, y `TOKEN_REFRESHED` — el segundo
importa porque `visibilityState` sigue en `'visible'` con la ventana simplemente *tapada*, así que una
pestaña de escritorio abierta todo el día no dispararía el primero. Respeta el TTL (sin `force`), **sin
polling**, y sólo repinta si cambia lo que el usuario puede usar.

**Un fallo de red no borra una lectura ya obtenida.** El `catch` reseteaba el estado, lo cual es correcto en
la primera carga —no hay evidencia que perder— y destructivo después: la revalidación corre típicamente con
red mala, así que degradaba a un cliente **que ha pagado** hasta el preview Free, con el badge en FREE y un
«plan premium» al tocar Préstamo. Fail-closed en dirección, sí, pero una afirmación comercial **falsa**
causada por la cobertura móvil. Ahora, si ya había lectura, se conserva y se anota el error invalidando la
caché para reintentar. El kill switch no se debilita: aterriza en la primera lectura que sí funcione.
Lo destapó la revisión de seguridad, y ningún assert lo cubría porque todos los tests de fallo arrancaban de
un estado no cargado.

### «Kill switch» no significa enforcement — la frontera, por escrito
Conservar la lectura previa implica que un cliente **hostil** puede retener un estado concedido bloqueando
la RPC (modo avión, bloqueo de petición en DevTools, `hosts`). **No es una regresión y no es un límite de
seguridad**, porque nunca lo fue: el mismo cliente obtiene lo mismo con una línea en la consola
(`_aurixEnt.features['intelligence.full'] = true`). Esto es gating de cliente sobre los datos del **propio**
usuario.

El kill switch sirve contra un cliente **no hostil** —suscripción caducada, cancelación, soporte cortando a
alguien que no manipula su navegador— y para esa población queda acotado a «la siguiente lectura buena», que
llega con el foco o con el refresco de token. **Si algún día hace falta un tope duro, va en el servidor**
(`valid_until` corto), no en el cliente. Que nadie lea «kill switch» y lo confunda con enforcement.

---

## FREE

- **Workspace accesible.** Aquí vivía el gate de Launch-1: la sección entera se sustituía por el preview
  premium salvo para el owner, así que **ningún usuario Free llegó nunca a ver Compound**. Se retira; lo que
  se gatea son las herramientas.
- **Compound usable** — `commercialTier: free`, `featureKey: null`. Matemática, divisa base e icono intactos.
- **Loan visible y protegido** — la tarjeta no parece deshabilitada (sin `is-soon`, sin opacidad, con su chip
  Premium); al abrir, upgrade intent.
- **Intelligence Preview** — entra en la pestaña y ve el preview real de INT.PREVIEW.V1.
- **Catálogo oculto: cero entradas.**

## PREMIUM
Desbloquea exactamente lo que `plan_features` concede: `workspace.loan`, `intelligence.full`,
`premium.settings`. **No** ve el catálogo interno: pagando no se compra producto sin terminar.

## FOUNDER
No es Premium comercial. `plan=free`, `source=default`, acceso por `entitlement_overrides`
(`feature_key='*'`, `reason='founder'`, sin caducidad, creado server-side para
`2c337e68-…`). El email compilado en el bundle **desapareció**. No contamina MRR/ARR ni conversión.

Ve las **23** entradas del catálogo interno para poder evaluarlas.

---

## WORKSPACE · el gate vive en la herramienta

`_wsToolAccess(toolKey)` es **una sola decisión con dos consumidores**: el owner de apertura
(`_wsOpenTool`, único camino por el que se abre una herramienta — catálogo, Mi Espacio, proyecto guardado,
enlace directo) y el registro de uso reciente. Devuelve `{ok, reason, featureKey}` con dos razones
distintas, y el orden importa:

1. **`unpublished`** — ¿esto existe para ti? Va primero. **No** ofrece upgrade: decir "esto es Premium" de
   algo que simplemente no está publicado sería mentir.
2. **`entitlement`** — ¿tienes derecho? Ofrece upgrade intent.

Compartir la decisión es lo que impide que Mi Espacio afirme un *"último uso: hace 2 min"* de una
herramienta que nunca se abrió — el registro de recencia es una **afirmación**, y antes se escribía antes
del gate.

---

## CATÁLOGO · una fuente, estado comercial explícito

`_WS_CATALOG` sustituye a dos arrays escritos a mano dentro de `renderWorkspaceHome` más un tercer criterio
en `_WS_APP_IDENTITY.premiumTier` (que queda descriptivo y **sin autoridad**). 23 entradas con
`{id, kind, published, featureKey, commercialTier}`. Las tres vistas —Herramientas, Plantillas y Mi
Espacio— **derivan** de aquí a través de un **único** filtro, `_wsCatalogVisible`.

| | usuario normal | founder |
|---|---|---|
| `published: true` | la ve | la ve |
| `published: false` | **cero entradas** | la ve |

El catálogo público **no** se construye filtrando el del founder: hay un solo filtro y se aplica siempre.

### Etiquetas
Una convención, tres valores, y **son verdad**:

| Etiqueta | Significa |
|---|---|
| **Incluido** | `published` + `free` |
| **Premium** | `published` + `premium` + **hay `featureKey`**, es decir Premium lo concede de verdad |
| **Interno** | no publicado o sin decidir |

`Premium` no se pinta decorativamente: sin `featureKey` no hay etiqueta Premium. El gate lo comprueba
ejecutando el owner sobre una entrada sintética, no sobre el catálogo de hoy — mirar sólo las entradas
actuales dejaba pasar que la etiqueta se volviera decorativa, porque la única entrada premium sí tiene
clave.

### El catálogo interno es una capacidad, no una deducción
La primera versión lo deducía: *"si las tres features vienen de override, es el founder"*. La revisión de
seguridad demostró que eso conflaba dos cosas — el resolver estampa `source='override'` también en los
overrides **por clave**, y B1 admite `reason` `comp`/`qa` — así que un usuario **compensado** con tres
concesiones individuales, una acción de soporte normal, habría visto las 21 entradas sin publicar y podido
abrir herramientas a medio construir.

Ahora tiene su propia clave: **`workspace.catalog_preview`**, con las dos filas de `plan_features` en
`false`. **Ningún plan la concede y no se vende**; la única vía es un override explícito. El resolver la
recogió sin un solo cambio de código, porque deriva su conjunto canónico de `plan_features` — la decisión
de B2 de no hardcodear las claves se pagó sola.

---

## AUTORIDAD LEGACY RETIRADA

`hasAurixPremiumAccess` ya **no decide**: delega en `hasFeature('intelligence.full')`. Fuera la allowlist
del email del owner y la rama `user.premium || user.isPremium || user.subscriptionActive` (que nunca tuvo
escritor y se volvía auto-concesión el día que alguien mapeara `user_metadata` sobre el user).

El badge del menú también se repuntó: leía `getPlan()` → `localStorage.aurix_plan`, así que desde la consola
`setPlanTier('founder')` ponía el badge en «FOUNDER» de forma durable y en todos los dispositivos del
usuario (el flush escribe la columna `subscription`). No concedía ninguna feature, pero un badge **es** una
afirmación comercial. Retirar la *escritura* de `aurix_plan` / `user_portfolios.subscription` sigue siendo
**B7**; aquí se le quitó el último consumidor que la publicaba.

Siguen existiendo sin autoridad: `ENFORCE_ENTITLEMENTS`, `PLAN_FEATURES`, `PREMIUM_FEATURES`,
`PLAN_CATALOG`, `PROMO_CODES`, `applyPromoCode`, `setPlanTier`, `premiumTier`, `aurix_plan`,
`user_portfolios.subscription`.

---

## UPGRADE INTENT

`openUpgradeIntent({featureKey, source})` — el seam mínimo para que una feature denegada no quede muerta al
click. Reutiliza `#upgradeOverlay`, que ya era honesto, y **oculta su botón «Ver Aurix Founder»**, porque
ese camino sí pinta un precio (`openFounderPage` lee `PLAN_CATALOG`).

Registra `{featureKey, source, ts}`, tope 50, sin PII, **namespaced por usuario**, nunca sale del
dispositivo. **No registra nada mientras el entitlement no ha resuelto**: durante la ventana de boot
`hasFeature()` es false para todos, así que un Premium de pago que pulsara antes de resolver habría
inventado un deseo en la línea base de conversión.

Las tres claves canónicas tienen **etiqueta humana**. Sin ellas `_featureLabel` devolvía la clave cruda y el
único punto de conversión del producto le mostraba al usuario `workspace.loan` como nombre de la función.

`workspace.loan` **delega en `wsloan_n`**, la misma clave que pinta la tarjeta, en lugar de repetir la
cadena: duplicarla produjo «Simulador de préstamo**s**» en la tarjeta y «Simulador de préstamo» en el modal,
a un click de distancia. Leyendo la misma fuente no puede volver a divergir.

---

## GATES RE-DECIDIDOS

Cinco harnesses congelaban el comportamiento anterior. Phase A ya lo anticipó para dos de ellos.

| Harness | Qué afirmaba | Ahora |
|---|---|---|
| `AURIX-PREMIUM-PREVIEW-OWNER` | el email del owner concede acceso; `user.premium` también | lo contrario, y se verifica la **delegación** inyectando el gate |
| `AURIX-INT-PREVIEW-V1` | «7.3 el gate no cambia, `hasAurixPremiumAccess` sigue decidiendo» | decide el resolver; el preview sigue siendo el fallback |
| `AURIX-WORKSPACE-FORMULA-INTEGRITY` | «M11 la ruta de apertura de loan **no gatea nada**» | gatea, contra el entitlement real |
| ídem | L10/L11/L14 buscaban literales `data-wstool="budget"` | **pasaron a ser vacuas** al volverse declarativo el catálogo (los literales se emiten interpolados). Repuntadas a la propiedad, sobre el catálogo |
| `AURIX-CATEGORY-HISTORY-READER` | byte-identidad de `hasAurixPremiumAccess` | exenta, con gate nombrado, siguiendo el precedente de `_aurixFetchBackendSnapshots`, más 17.0c/17.0d como sustituto |

La cuarta fila es la incómoda: **cobertura perdida, no movida.** La detectó la revisión de seguridad.

---

## RESIDUALES

1. **El gating es de cliente y por tanto de UI.** Es el dato del propio usuario, así que manipular la
   consola cambia lo que *ve*, no lo que *puede*: la RPC está acotada a `auth.uid()`, `subscriptions` y
   `entitlement_overrides` tienen `revoke all … from authenticated`, y `_aurixEnt` **no se persiste**, así
   que no hay semilla que pre-envenenar. Protección de servidor real para los datos: M.03+.
2. **`cta:'goals'|'scenario'|'planning'|'workspace'` abren sin pasar por `_wsOpenTool`.** Inofensivo hoy
   —sólo se pintan en el catálogo interno, que ahora exige una capacidad que ningún plan vende— pero
   contradice «un único owner de apertura». No se gatearon porque comparten rama con `nav === …` y
   bloquearlas sin trazar la navegación podría romper la vuelta. **Trazarlo y unificarlo antes de publicar
   cualquiera de esas cuatro**, y con este dato: `cta:'workspace'` va a `_ws4OpenOrCreate`, que **CREA y
   persiste** un proyecto en `aurix_ws_projects_v1`. Si una se publica sin trazar, el fallo no es «ve algo
   sin terminar» sino «genera estado que no sincroniza».
2b. ~~Nada asevera que `_wsCatalogFor` sea el único productor de listas de tarjetas~~ — **CERRADO.** Era
   el último hueco de §18. No se cerró con una comprobación de AUSENCIA de forma —esa es la familia que se
   volvió vacua en L10/L11— sino con **igualdad de recuento y pertenencia positiva**, que no pueden
   satisfacerse sobre un conjunto vacío: `_wsCatalogFor` aparece 3 veces en `_renderWorkspaceHome` y 4 en
   `app.js`; hay exactamente 4 `data-wsh-cta` y 3 `data-wstool`, **cero** de ellos literales (el único
   literal de `data-wsh-cta` es `"tool"`, que es la clase, no la identidad); y las claves de `TOOL_RENDER`
   (11), `TPL_RENDER` (12) y `_MSE_TOOL_RENDER` (2) son todas ids del catálogo, con sus valores `tool:`
   dentro de `_WS_TOOLKEY_TO_ID` (7). Una tarjeta escrita a mano sube el recuento ⇒ rojo; borrar un emisor
   lo baja ⇒ rojo; un renderer huérfano se caza por pertenencia. Verificado inyectando ambas mutaciones.
3. **Dos entradas internas no tienen ruta de apertura** (`financial_calc`, `investment_analyzer`) y llevan
   dos etiquetas con significados distintos en la misma tarjeta: pill «Próximamente» + chip «Interno». El
   founder puede pulsarlas y no pasa nada. No se inventa una etiqueta de madurez: se evalúa abriendo.
4. **La rejilla de Herramientas.** Con dos tarjetas publicadas, `repeat(5, 1fr)` dejaba tres columnas
   vacías en escritorio — la clase de defecto que GLOBAL POLISH ya cerró una vez. Mitigado con `is-sparse`
   (< 3 tarjetas ⇒ `auto-fit`, `justify-content: start`), así el hueco queda FUERA de la rejilla y las
   tarjetas conservan su ancho. **Pendiente de QA visual del founder en los tres viewports**; y si a
   ≥1280px sigue leyéndose hueco, el arreglo honesto ya no es CSS sino el tamaño del catálogo (una tercera
   herramienta publicada) ⇒ M.03. **No añadir más geometría.**
4b. **Una herramienta no publicada alcanzada por una ruta futura devuelve un no-op silencioso.**
   Comercialmente correcto —no se afirma nada— e incompleto en UX. M.03.
5. **La instrumentación de conversión no sale del dispositivo**, y la cuenta del founder —que es la que
   tiene override— nunca la genera. Mide aperturas del intent, no deseo confirmado. Emitirlo por
   `api/client-log.js` o una tabla propia: **M.03**.
6. **Intelligence Preview echa al usuario fuera**: su único CTA es «Volver al Dashboard» y no registra
   intención. Es el activo de conversión más fuerte del producto. Tocarlo entra en una superficie
   certificada y su harness ⇒ **M.03**.
7. **`window.aurixEntitlements` sigue exponiendo** `getPlan` / `setPlanTier` / `PLAN_CATALOG`. Ya no
   conceden nada, pero el nombre invita a confundirlos con la autoridad real. Renombrar: B7.
7b. **Para B7, un detalle que la revisión de seguridad añadió:** `_applyRemoteSubscription` sigue adoptando
   el objeto remoto en `aurix_plan` por LWW, así que una afirmación forjada sigue **viajando entre
   dispositivos** aunque nadie la lea. B7 debe **borrar la columna**, no sólo dejar de leerla.
8. **El `'*'` del founder concede también `workspace.catalog_preview`**, así que un deny global futuro le
   apagaría el catálogo interno junto con todo lo demás. Es coherente —`'*'` significa todo— y queda dicho.
9. **QA VISUAL DEL FOUNDER PENDIENTE**, con sesión autenticada y en los tres viewports: es el primer bloque
   que cambia la UX, y ningún gate sustituye eso.
10. **VALIDACIÓN DE LIFECYCLE EN iPHONE REAL — la única evidencia que ni el gate ni una revisión pueden
   dar.** Este bloque añade dos disparadores que sólo se observan ahí: `visibilitychange` y
   `TOKEN_REFRESHED`. El ciclo que importa es *background → foreground sin red*, que es exactamente el que
   producía el fallo del `catch`. Es la misma deuda que el proyecto ya arrastra («la validación de lifecycle
   en iPhone real nunca llegó a ejecutarse») y este bloque le añade superficie. **Ejecutarla antes de
   considerar B3/B4 cerrado en producción**; no bloquea el commit.

**NEXT: M.03 — Premium UX + Intelligence preview + upgrade surfaces.**
