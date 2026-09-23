# AURIX · M.04 · REQUISITOS PRE-LIVE

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

Hay que sustituir **dos** literales: los `price_…` de LIVE. El script **se niega
a ejecutarse** con los marcadores puestos, con dos IDs iguales, o si al final no
queda exactamente una fila activa por intervalo con 5999 / 799 EUR.

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

1. Crear producto y **dos precios en Stripe LIVE** (59,99 €/año, 7,99 €/mes, EUR,
   recurrentes, sin trial).
2. Crear el **event destination LIVE** con la URL del webhook y los tres eventos
   `customer.subscription.created/updated/deleted`.
3. En Vercel (Production): `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` **de
   LIVE** (rotados, §2), y borrar `BILLING_ALLOW_TEST_EVENTS`.
4. Configurar el **Customer Portal en LIVE** (cancelación).
5. Ejecutar `db/billing_live_cutover_1.sql` con los dos IDs LIVE.
6. `POST /api/billing/status` ⇒ `ready_for_live: true`, `blockers: []`.
7. Sólo entonces, la **compra real controlada** del fundador.
