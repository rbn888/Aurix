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
