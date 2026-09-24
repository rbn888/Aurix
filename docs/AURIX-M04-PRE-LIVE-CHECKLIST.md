# AURIX · M.04 · REQUISITOS PRE-LIVE

> **ESTADO (2026-09-23): STRIPE PAUSADO, NO CERRADO.** El código del cutover a
> LIVE está preparado y verde (`b487bfc`); lo que falta es configuración en
> Stripe y una compra real, y las dos las decide el fundador. Nada de esta lista
> se ha retirado ni se ha dado por hecho. Los SPECs posteriores de Workspace y
> Dashboard **no tocan** billing, secretos, precios, checkout, webhook ni portal.

Lo que hay que hacer **antes** de cobrar dinero real. No es documentación del
diseño (eso vive en `db/monetization_m04_billing_stripe_1.sql` y en el harness):
es la lista de lo que la certificación TEST deja deliberadamente abierto.

## 1 · `BILLING_ALLOW_TEST_EVENTS` — RETIRAR

Existe **sólo** para que un evento `livemode:false` pueda conceder Premium durante
la certificación TEST (`api/billing/webhook.mjs`, guarda de MODO). Con esa variable
puesta, una suscripción de prueba entitlea una cuenta de la BD de PRODUCCIÓN.

**Acción:** borrarla de Vercel (Production) antes del cutover LIVE. Sin ella, el
webhook responde `200 ignored_testmode` a cualquier evento de test y no escribe.

**Bloqueo estructural (M.04, ya en producción):** olvidarla dejó de ser un agujero.
El permiso se **anula** en cuanto la `STRIPE_SECRET_KEY` configurada no es de TEST
(`sk_test_`/`rk_test_`), y también si no hay clave — fail-closed. En un deployment
LIVE la variable no tiene efecto: un evento de prueba no puede conceder Premium real
aunque nadie se acuerde de borrarla. Lo afirman K2.3 y K2.4 del gate de M.04.
Borrarla sigue siendo lo correcto; ya no es lo único que nos protege.

## 2 · ROTAR LOS SECRETOS DE STRIPE

Durante M.04 se manipularon en pantalla la secret key y el signing secret, y
cualquier valor que haya podido aparecer en una captura debe considerarse
**potencialmente expuesto**.

**Acción:** rotar en Stripe y actualizar en Vercel (Production) `STRIPE_SECRET_KEY`
y `STRIPE_WEBHOOK_SECRET`. Los tres valores de configuración de billing se
normalizan con `.trim()`, así que un espacio al pegarlos ya no puede volver a
disfrazarse de rechazo del proveedor.

## 3 · PRECIOS LIVE — UNA FILA ACTIVA POR INTERVALO

`billing_prices_active_uidx` es único sobre `(provider, plan, billing_interval)`
**where active**: los `price_id` de TEST y de LIVE **no pueden coexistir activos**
para el mismo intervalo.

**Acción:** crear los precios en Stripe LIVE, y en la misma transacción poner
`active = false` en las dos filas TEST e insertar las LIVE. Nunca las cuatro
activas: el índice lo impide y el paywall no tendría forma de elegir.

## 4 · WEBHOOK DEL ENTORNO LIVE

El bus de eventos de LIVE es distinto del Sandbox: el endpoint de TEST **no**
recibe eventos LIVE. Hay que crear el event destination en LIVE con la misma URL y
los mismos tres eventos (`customer.subscription.created/updated/deleted`), y poner
**su** signing secret en Vercel. Ésta fue la causa raíz de un P0 completo en TEST.

## 5 · CUENTAS QA

`rbn892+m04a@gmail.com` queda con una suscripción TEST en la BD de producción.
Decidir si se conserva como cuenta de QA o se limpia antes de LIVE.

---

# CUTOVER A LIVE · ESTADO Y HERRAMIENTAS (2026-09-23)

## 0 · Cómo se comprueba, sin cobrar y sin secretos

`POST /api/billing/status` — **sólo lectura, sólo cuenta fundadora**
(`workspace.catalog_preview`, resuelto por el mismo resolver server-side; no hay
allowlist de email). Contesta en una llamada:

* `mode` — `live` / `test` / `unset`, **derivado del prefijo de la clave**. El
  valor de la clave nunca sale.
* por intervalo: fila activa del catálogo, importe, divisa, trial, y el precio
  **leído de Stripe**: `livemode`, `active`, `unit_amount`, `currency`,
  recurrencia. Con sus `checks` cruzados.
* `webhook`: si el signing secret está puesto (booleano) y si existe un endpoint
  **del mismo modo**, habilitado y con los tres eventos.
* `portal`: si hay configuración de Customer Portal, y de qué modo.
* `blockers[]` y `ready_for_live`.

Desde la app, con sesión iniciada, en la consola del navegador:

```js
(async () => {
  const { data } = await supabaseClient.auth.getSession();
  const r = await fetch(AURIX_API_ORIGIN + '/api/billing/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
               Authorization: 'Bearer ' + data.session.access_token },
  });
  console.log(JSON.stringify(await r.json(), null, 2));
})();
```

No pide ni imprime ningún secreto. No crea sesiones. No cobra.

## 6 · Precios LIVE — el SQL ya está escrito

`db/billing_live_cutover_1.sql` (pareja: `_rollback.sql`). Transaccional,
acotado a `(stripe, premium, year|month)`, **no borra ninguna fila** y **no toca**
`subscriptions`, `billing_customers`, `entitlement_overrides` ni `plan_features`.

Los dos `price_…` de LIVE **ya están pegados** (anual
`price_1UIu7S3l0aCDKMqE3UCE6FtO`, mensual `price_1UIu3n3l0aCDKMqEL5ocVJ5A`), y el
`_rollback.sql` lleva pegados los de TEST por la misma razón: un rollback que
exige buscar identificadores es un rollback que no se puede ejecutar con prisa.
El script **se niega a ejecutarse** con marcadores sin sustituir, con dos IDs
iguales, o si al final no queda exactamente una fila activa por intervalo con
**6999 / 799 EUR** (el anual pasó de 59,99 € a 69,99 € el 2026-09-23).

## 7 · El defecto que habría bloqueado la primera compra real

Un `cus_…` creado en TEST **no existe** para una clave LIVE. Quien lo descubría
era el guard anti-doble-cargo de `_checkout.js`, que falla CERRADO: toda cuenta
con mapeo de TEST —las de QA y la del fundador, justo las de la primera compra—
se habría quedado con un `503 check_failed` que además parece un problema de
pago. **Corregido**: si el proveedor responde 404 sobre el cliente mapeado (o lo
da por `deleted`), el mapeo se retira —acotado a ese usuario— y se crea uno nuevo
por el camino de siempre. Un fallo de transporte **no** invalida el mapeo. Lo
fijan D.21–D.24 del gate de billing.

## 8 · Orden del cutover

1. Crear producto y **dos precios en Stripe LIVE** (69,99 €/año, 7,99 €/mes, EUR,
   recurrentes, sin trial). **HECHO**: los dos precios LIVE ya existen y sus IDs
   están en el SQL del cutover. Falta confirmar contra Stripe que pertenecen al
   producto esperado, en EUR y con la recurrencia correcta — lo dice
   `POST /api/billing/status`, y el checkout lo vuelve a comprobar en cada compra.
2. Crear el **event destination LIVE** con la URL del webhook y los tres eventos
   `customer.subscription.created/updated/deleted`.
3. En Vercel (Production): `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` **de
   LIVE** (rotados, §2), y borrar `BILLING_ALLOW_TEST_EVENTS`.
4. Configurar el **Customer Portal en LIVE** (cancelación).
5. Ejecutar `db/billing_live_cutover_1.sql` con los dos IDs LIVE.
6. `POST /api/billing/status` ⇒ `ready_for_live: true`, `blockers: []`.
7. Sólo entonces, la **compra real controlada** del fundador.

## 9 · Precio LIVE 69,99 € · qué cambió el 2026-09-23

**El precio anual pasa de 59,99 € a 69,99 €.** El importe canónico vive en
`public.billing_prices` (base de datos), no en el bundle: el paywall lo lee de
ahí y **deriva** de los dos importes el ahorro anual y el equivalente mensual
(69,99 frente a 12×7,99 ⇒ **27 %** y **5,83 €/mes**). Por eso no hubo ni un
precio que cambiar en la interfaz: si el porcentaje hubiera estado escrito en el
copy, hoy estaríamos anunciando un 37 % que ya no existe.

Lo que sí se tocó, y dónde:

| Dónde | Qué |
|---|---|
| `api/billing/_status.js` | `APPROVED.year` = **6999**. Mientras la BD siga en 5999, el diagnóstico devuelve `amount_not_approved:year` y `ready_for_live: false`. Es lo correcto. |
| `db/billing_live_cutover_1.sql` | **6999** + los dos `price_…` de LIVE ya pegados. La verificación va DENTRO de la transacción. **Sin aplicar.** |
| `db/billing_live_cutover_1_rollback.sql` | Los `price_…` de TEST también pegados: un rollback que obliga a buscar identificadores no se puede ejecutar con prisa. |
| `db/m04_prod/04_seed_test_prices_prod.sql` | **No se reescribe**: describe lo sembrado para TEST, donde el anual sigue siendo 59,99 €. Marcado como histórico y no válido para LIVE. |
| Harnesses | Importes y porcentaje actualizados; `E.17`, `F2.2`–`F2.4` re-decididos con su razón escrita. |

### El defecto de fondo que se cerró con el cambio de precio

El catálogo decide **dos cosas que nadie contrastaba entre sí**: el importe que
el paywall PINTA (`amount_cents`) y el precio que Stripe COBRA
(`provider_price_id`). Son dos columnas de la misma fila, y viajan por caminos
distintos —una migración de base de datos y un precio creado a mano en Stripe—,
así que basta con que una se actualice sin la otra para que la pantalla anuncie
69,99 € y el cargo sea otro.

Ahora `POST /api/billing/checkout` **lee el precio en Stripe antes de abrir
sesión** y contrasta importe, divisa, recurrencia, que esté activo y que su modo
coincida con la clave. Cualquier discrepancia **falla cerrado** (`409
price_mismatch`) y no poder comprobarlo tampoco permite cobrar (`503
price_verification_unavailable`). Coste: un GET de sólo lectura por intento.
Lo fijan **D.25–D.33** del gate de billing.

> **CONSECUENCIA OPERATIVA:** con la clave LIVE puesta y la BD todavía con los
> `price_…` de TEST, **no se puede vender** — el checkout se niega antes de
> cobrar, en vez de fallar con un error opaco del proveedor. Vender exige
> ejecutar el paso 5 del §8.

## 10 · Portal de Stripe · lo que se revisó y lo que quedó fijado

Cubierto ahora por **P.1–P.8** del gate de billing:

- **Cambio mensual↔anual** hecho en el portal: llega como
  `customer.subscription.updated` y lo que se escribe es el **precio nuevo** con
  su nuevo periodo, no el de la compra original.
- **Cancelación a fin de periodo**: se guarda `cancel_at_period_end`, el estado
  sigue `active` y **el plan lo decide el estado**, no la bandera. Cancelar el
  día 2 de un anual no quita Premium once meses antes.
- **Cambios diferidos (`subscription_schedule`)**: Aurix **no** escucha esos
  eventos, y no debe empezar a hacerlo a ciegas — un cambio *programado* aún no
  ha ocurrido y aplicarlo al anunciarse sería adelantar el plan. Se ignora de
  forma **registrada**, y el cambio entra cuando de verdad ocurre, por el
  `customer.subscription.updated` de la transición.
- **Aurix no puede pisar un schedule creado en el portal**: no escribe
  suscripciones ni schedules en el proveedor por ninguna ruta. Lo único que lee
  de `/v1/subscriptions` es el guard anti-doble-cargo, con GET.

## 11 · Soporte y legales · estado

Tres páginas públicas nuevas, sin sesión, ES/EN, servidas por Pages y en la
allowlist de publicación (`support.html`, `privacy.html`, `terms.html` +
`legal.css` / `legal.js`). Cubiertas por `scripts/aurix-legal-pages-probe.mjs`
(252 asserts, Chromium y WebKit, cuatro anchuras).

**Defecto corregido:** el correo de soporte publicado en la app era
`aurixsystemoficial@` —con **una** efe—. El harness del Account Center fijaba esa
misma errata como contrato, así que el gate llevaba meses certificando un buzón
inexistente. Corregido en los dos sitios.

**Bloqueo declarado:** privacidad y condiciones son **borradores**. Llevan aviso
visible y marcan como hueco todo lo que exige decisión del titular o criterio
jurídico (identidad, base jurídica, conservación, reembolsos, responsabilidad,
ley aplicable, edad mínima, preaviso de precio). **No se ha inventado ninguno.**
Publicación definitiva = revisión del titular + retirada del aviso.

## 12 · PENDIENTES EXPLÍCITOS (nadie los puede cerrar por su cuenta)

| # | Pendiente | De quién |
|---|---|---|
| **A** | QA manual en **iPhone real** (v744+): edición numérica y **Guardar al primer toque** en Escenarios y Presupuesto. | Fundador |
| **B** | Crear / actualizar / «guardar otra» una comparación y **reabrir las dos** desde «Tus planes». | Fundador |
| **C** | **Aislamiento entre dos cuentas o dispositivos** (no se puede declarar por inspección de código). | Fundador |
| **D** | Defecto conocido y medido: en **360×740** el inventario de Portfolio inmobiliario empieza **61 px por debajo** del primer viewport (su resumen ocupa 552 px). No es regresión; cerrarlo exige rehacer esa densidad. | Decisión del fundador |
| **E** | **Revisar y aprobar** los textos legales, rellenar los huecos marcados, retirar el aviso de borrador y **sólo después** copiar las URL reales a Stripe. | Fundador (+ asesoría) |
| **F** | **Corte LIVE de la base de datos** (§8.5), `ready_for_live: true` sin bloqueos y **compra real controlada**. Únicamente con autorización expresa. | Fundador |

---

# ANEXO · WORKSPACE · SEGUNDA RONDA DE CAPACIDADES (inventario, sin implementar)

Estado **comprobado sobre el código**, no sobre la intención. Ninguna de estas
siete se ha implementado en este trabajo: esto es el inventario que decide cuáles
merecen construirse y cuáles serían un duplicado con nombre nuevo.

Recordatorio de lo que YA existe y está publicado (8): Interés compuesto,
Simulador de préstamos, Simulador de escenarios, Portfolio inmobiliario,
Presupuesto mensual, Control de cobros, Objetivos y Diario de operaciones.

| # | Candidata | Estado real | Qué habría que decidir |
|---|---|---|---|
| 1 | **Conversor de divisas** | **NO EXISTE** como capacidad. Sí existe la infraestructura: `_AURIX_FX_PAIRS` mantiene cambios para **USD, EUR, GBP, CHF y JPY** (cinco, no «múltiples»), con TTL de **12 h**, refresco best-effort por el proxy de precios y un **fallback estático aproximado** que el propio código marca como `approx`. | Ampliar el juego de pares o declarar las cinco divisas como el alcance. **No se puede prometer cotización en tiempo real**: el dato es de hasta 12 h y a veces aproximado, y eso hay que decirlo en pantalla. Definir qué es un «documento» guardable aquí (¿un par fijado? ¿una lista?) para que aparezca en Tus planes. |
| 2 | **Proyección patrimonial** | **EXISTE PARCIALMENTE, INTERNA.** Hay superficie (`_renderWealthProjection`, vista `planning`) y motor (`projectWealthPlan`), y una entrada de catálogo `tpl_projection` con `published:false` / `featureKey:null` / `commercialTier:'undecided'`. **No guarda documento** y **no se conecta al patrimonio real**. | Es la candidata prioritaria y la de mayor riesgo de duplicado: hoy se solapa con Interés compuesto y con Escenarios. Su diferencia tendría que ser **partir del patrimonio real y recalcular al cambiar los datos**, y eso obliga a decidir la frecuencia de actualización REAL y qué pasa con un escenario guardado cuando el patrimonio cambia por debajo (¿se recalcula y deja de ser lo que se guardó, o se congela?). Sin esa decisión no se debe construir. |
| 3 | **Jubilación / FIRE** | **EXISTE PARCIALMENTE, en tres sitios distintos.** (a) `fire` es un **tipo de objetivo** dentro de Objetivos, que está **publicado**; (b) hay una hoja legacy `ws4` interna con su subtítulo (`ws4_sub_fire`); (c) queda una plantilla antigua `ws_tpl_fire_*` en el mapa histórico. | **Alto riesgo de duplicar Objetivos.** Antes de construir nada: decidir si FIRE es un objetivo con mejor cálculo (extender lo publicado) o una capacidad aparte. Tres representaciones del mismo concepto es justamente lo que el catálogo canónico vino a cerrar. |
| 4 | **Ingresos de cartera** | **NO EXISTE.** Sólo hay categorías de dividendos en el catálogo de activos; ninguna capacidad de planificación de rentas. | Definir de dónde saldría el dato: Aurix **no** tiene dividendos por activo ni calendario de pagos. Sin fuente, sería una hoja de entrada manual — legítima, pero hay que decirlo y no venderla como «tus ingresos». |
| 5 | **Distribución patrimonial** | **EXISTE FUERA DE WORKSPACE.** El Dashboard ya publica la distribución por categorías con su donut, y hay además una hoja legacy `networth` interna. | Duplicaría el Dashboard. Sólo tendría sentido si aporta algo que allí no cabe (objetivo de reparto, desviación frente a él, simulación de rebalanceo). Si no, **no construir**. |
| 6 | **Informes patrimoniales** | **NO EXISTE.** La exportación está deshabilitada desde v584 (código intacto). Existen dos claves de texto muertas (`ap_p_reports`, `ap_std_b4`) que **no se pintan en ningún sitio**: nadie está anunciando informes que no existan. | Decidir formato (¿PDF? ¿qué motor?) y, sobre todo, si el primer paso no es simplemente **reactivar la exportación** que ya está escrita. |
| 7 | **Revisión financiera anual** | **NO EXISTE.** Ni superficie, ni motor, ni textos. | Definir qué revisa y con qué datos. Es la más cara de las siete y la única sin ninguna base construida. |

**Observación colateral:** en el diccionario quedan cadenas comerciales muertas de
una iteración anterior (entre ellas un `5.99€/mo`). No se pintan en ninguna parte
—verificado— así que no contradicen el precio vigente, pero conviene saber que
están ahí antes de reutilizar ese bloque de claves.

**Precisión sobre la candidata 2 (conservada del encargo):** la Proyección
patrimonial debe usar el patrimonio **actualizado** *cuando el usuario elija
conectarlo* —conexión explícita, opt-in, no automática—, permitir explorar
supuestos y aportar algo más que una calculadora de interés compuesto. Su diseño
sigue **pendiente**; y no se pueden prometer cotizaciones en tiempo real sin un
dato que las soporte (hoy: 5 divisas, TTL 12 h, fallback aproximado).

**Orden recomendado:** consolidar las ocho actuales (este trabajo) → decidir
§2 (Proyección patrimonial) con sus dos preguntas abiertas resueltas → §1
(Conversor) por ser el de alcance más acotado → descartar §5 salvo que aporte
reparto objetivo → el resto, después.

---

# ANEXO · PROCEDIMIENTO DE CIERRE OPERATIVO M.04 (para el fundador)

Verificado contra el repositorio real el **2026-09-24**. Nada de esto se ha
ejecutado: **ni cutover, ni compra, ni cambio en Stripe, ni aprobación legal**.

## Paso 0 · Lo que ya está hecho y NO hay que repetir

| | Estado | Evidencia |
|---|---|---|
| Precio anual 69,99 € en código, SQL, diagnóstico y pruebas | ✅ | gate de billing, §9 de este documento |
| El checkout se niega a cobrar si Stripe y el catálogo no coinciden | ✅ | D.25–D.33 |
| Portal: cambio de plan, cancelación a fin de periodo, cambios diferidos | ✅ | P.1–P.8 |
| Webhook: firma, replay, entrega desordenada, correspondencia usuario/cliente | ✅ | C.1–C.14, E.6c–E.12 |
| URLs públicas de soporte, privacidad y condiciones | ✅ **HTTP 200 sin sesión** | comprobado hoy |
| Correo de soporte publicado | ✅ `aurixsystemofficial@gmail.com` | comprobado hoy en las tres páginas |
| `anon` sin privilegios sobre las tablas sensibles | ✅ `42501` en las cinco | sonda en vivo, hoy |

## Paso 1 · Decisiones legales (sólo tuyas)

Los huecos marcados en las páginas publicadas, **uno por uno**:

- **Privacidad**: identidad y contacto del responsable · base jurídica de cada
  tratamiento · plazos de conservación tras la baja · región de cada proveedor y
  transferencias internacionales · marco legal aplicable y autoridad de control ·
  enumeración formal de derechos.
- **Condiciones**: identidad jurídica y datos fiscales · edad mínima · plazo de
  preaviso de cambio de precio · derecho de desistimiento y reembolsos ·
  compromiso de disponibilidad (si asumes alguno) · responsabilidad, garantías,
  ley aplicable y jurisdicción.
- **Soporte**: plazo de respuesta comprometido (o dejarlo sin comprometer).

Cuando estén decididos: rellenar los huecos, **retirar el aviso de borrador**
(`.lg-draft` en `privacy.html` y `terms.html`) y desplegar. **Sólo entonces**
copiar las URLs a Stripe. No las copies antes: hoy abren un borrador declarado.

## Paso 2 · El corte LIVE de base de datos

- **Script:** `db/billing_live_cutover_1.sql` · **Rollback:** `db/billing_live_cutover_1_rollback.sql`
- **Qué hace:** desactiva las filas de precio de TEST y activa las de LIVE para
  `(stripe, premium, year|month)`. Una transacción. **No borra ninguna fila** y no
  toca `subscriptions`, `billing_customers`, `entitlement_overrides` ni `plan_features`.
- **Precondiciones:** los dos precios LIVE ya existen y sus IDs están pegados
  (anual `price_1UIu7S3l0aCDKMqE3UCE6FtO`, mensual `price_1UIu3n3l0aCDKMqEL5ocVJ5A`);
  clave y webhook secret de LIVE en Vercel; portal LIVE configurado.
- **Se aborta solo** si quedan marcadores sin sustituir, si los dos IDs son
  iguales, o si al terminar no hay exactamente una fila activa por intervalo con
  **6999 / 799 EUR**. La verificación va DENTRO de la transacción: si falla, no
  hay `commit`.
- **Rollback — QUÉ ES Y QUÉ NO ES.** Activa de nuevo las filas de TEST. Analizado
  antes de recomendarlo:
  - **No rompe a los clientes que ya pagaron.** El escritor del webhook busca el
    precio por `provider_price_id` **sin exigir `active`**, y el cutover no borra
    ninguna fila: una renovación sobre el precio LIVE se sigue resolviendo y
    conservando el Premium. (Si el escritor filtrara por `active`, este rollback
    dejaría a un cliente de pago en `unknown_price`, es decir, sin Premium.)
  - **Sí detiene la venta, y limpiamente.** Con una clave LIVE, los `price_…` de
    TEST no existen en ese entorno: el checkout lo detecta ANTES de abrir sesión
    y responde `503`, sin cobrar nada.
  - **Pero deja el escaparate mintiendo:** el paywall pasaría a mostrar los
    importes de TEST (59,99 €) para algo que no se puede comprar. Por eso este
    script es un **interruptor de PARAR**, no una vuelta a un estado vendible:
    úsalo para dejar de vender, y después decide.

## Paso 3 · El diagnóstico, antes de vender

`POST /api/billing/status` **desde tu cuenta autenticada** (es la única con
`workspace.catalog_preview`; cualquier otra recibe 403). Sólo lectura: no escribe
en Stripe, no crea sesiones, no concede nada.

Esperado para vender: `mode: "live"`, `ready_for_live: true`, `blockers: []`.

**Detente si aparece cualquiera de estos:** `stripe_key_not_live`,
`amount_not_approved:*`, `price_mode_mismatch:*`, `price_not_found_in_stripe:*`,
`recurrence_mismatch:*`, **`trial_in_catalogue:*`**, **`trial_in_stripe_price:*`**,
`portal_unconfigured`, `portal_mode_mismatch`, `webhook_endpoint_missing_for_mode`,
`test_events_allowed`.

> **Los DOS sitios del «período de prueba» (corregido el 2026-09-24).** Hasta hoy
> este endpoint sólo miraba `trial_days` de NUESTRO catálogo y llamaba al bloqueo
> `trial_enabled`. Pero un precio de Stripe puede llevar su propio
> `recurring.trial_period_days`, que **no pasa por nuestra tabla** —lo aplica
> Stripe, no nuestro checkout—, así que el diagnóstico podía decir «sin prueba»
> mientras la pasarela enseñaba un periodo de prueba. Ahora se leen los dos y el
> bloqueo dice cuál es: `trial_in_catalogue:*` (lo arreglas con un UPDATE en
> `billing_prices`) o `trial_in_stripe_price:*` (lo arreglas en Stripe, creando
> el precio sin trial). La respuesta la da el campo
> `catalogue[].stripe.trial_period_days`.

Hoy, con el catálogo aún en TEST, **debe** devolver `amount_not_approved:year` y
`ready_for_live: false`. Eso es correcto, no un fallo.

## Paso 4 · Después del corte (comprobaciones, sin cobrar)

1. Repetir el Paso 3 → `ready_for_live: true`.
2. Abrir el paywall: los importes tienen que leerse **69,99 €** y **7,99 €**, con
   el ahorro derivado (**27 %**, 5,83 €/mes). Si no coinciden, no sigas.
3. No hace falta comprar para saber si el precio está bien: **el checkout
   compara con Stripe antes de abrir sesión** y se niega si no cuadra.

## Paso 5 · La compra real controlada (requiere tu autorización expresa)

1. Con tu cuenta, elegir plan y completar el pago **real**.
2. Al volver: la app dice «Confirmando tu pago…», consulta al servidor y sólo
   anuncia «Premium activado» cuando el servidor lo confirma. Si el webhook
   tarda, avisa de que se activará en unos minutos — **no se queda reintentando
   para siempre**.
3. Comprobar acceso: Workspace completo, Intelligence completa y «Tus planes».
4. Recargar y abrir en otro dispositivo: el estado Premium tiene que sobrevivir.
5. Probar el portal: cambiar de plan y cancelar a fin de periodo. Tras cancelar,
   **Premium debe seguir activo hasta el final del periodo pagado**.

**Condición de parada en cualquier punto:** si la app anuncia Premium y el
servidor no lo confirma, o al revés, detener y revisar antes de anunciar nada.


---

# ANEXO · 24/09/2026 · LA PRIMERA COMPRA REAL, Y LO QUE ENSEÑÓ

## Lo que pasó

Catálogo en 69,99 €/7,99 € con `trial_days = 0`, claves LIVE desplegadas y
`POST /api/billing/status` devolviendo `mode: live`, `blockers: []`,
`ready_for_live: true`. Se hizo una **compra real mensual de 7,99 €**. Al
volver, Aurix decía «confirmando pago» y seguía en Free, incluso recargando.

Causa: Stripe entregaba en `https://app.aurixsystem.io/api/billing/webhook` y
recibía **HTTP 405**. Ese dominio es **GitHub Pages**: ficheros estáticos, ahí no
hay ninguna función. El webhook vive en Vercel
(`https://isa-portfolio-ten.vercel.app/api/billing/webhook`). Corregido a mano el
destino y reenviado `customer.subscription.updated`: **HTTP 200** y Premium
activo tras recargar.

## Por qué el diagnóstico dijo que todo estaba bien

El endpoint buscaba los destinos con `/\/api\/billing\/webhook$/` — una
expresión que sólo mira el FINAL de la URL. **Cualquier host valía.** El destino
equivocado estaba `enabled`, en `livemode` y con los tres eventos, así que pasó
como bueno. Un fallo mío, y del tipo más caro: el diagnóstico existía justamente
para evitar esto.

**Corregido:**
- Se compara la **URL completa** contra la esperada (`BILLING_API_ORIGIN`, por
  defecto el origen de la API). Si sólo falla el host, el bloqueo lo dice por su
  nombre: **`webhook_url_not_api_origin`**, y se publica `webhook.expected_url`
  para poder compararlo de un vistazo.
- **`ready_for_live` ya no se lee como «probado»**: significa «la configuración
  es coherente». Se añade **`activation_verified`**, que sólo es `true` si
  nuestro propio ledger `billing_events` tiene eventos procesados. Sin ninguno,
  `webhook.delivery.verified = 'never_observed'` y una nota lo dice en texto.
  Que Stripe LISTE un destino no prueba que entregue.
- Lo fija el caso `el webhook apunta al dominio de la APP, no al de la API` del
  gate de billing, que **falla con el código anterior**.

## Y lo que le pasaba al usuario mientras tanto

Al agotarse los reintentos del retorno, el aviso se desvanecía y no quedaba nada
que pulsar: había pagado, la app decía Free y el único camino era recargar.
**Ahora el aviso se queda y ofrece «Comprobar estado»**, que vuelve a preguntar
al MISMO resolver autoritativo (sin segunda fuente de verdad y sin conceder nada
desde el cliente). Si sigue sin constar, lo dice y ofrece **soporte** —nunca
pagar otra vez—. La cadencia de reintentos pasa a `0, 1.2, 2.5, 5, 9, 15 s`:
sigue acotada, pero detecta antes.

## Estado del checklist

| | |
|---|---|
| Precio | **RESUELTO** · 69,99 €/año y 7,99 €/mes, `trial_days = 0` |
| Compra real | **RECUPERADA** a mano (reenvío del evento). No repetir |
| Portal y cancelación | **VERIFICADOS** · cancelación programada 24/10/2026, Premium conservado |
| Reembolso | **DESCARTADO** por decisión del fundador |
| Activación automática | **PENDIENTE de evidencia** · la recuperación manual NO demuestra que el retorno funcione solo |
| M.04 | **ABIERTO** |

## Lo único que falta para cerrar la activación automática

Una compra de prueba **en TEST** (no LIVE, no un cargo nuevo) con el destino ya
corregido, comprobando que Premium aparece **sin recargar**. Alternativa sin
compra: reenviar desde Stripe un `customer.subscription.updated` y confirmar que
`activation_verified` pasa a `true` y la interfaz se actualiza sola.
