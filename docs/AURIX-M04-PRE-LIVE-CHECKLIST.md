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
