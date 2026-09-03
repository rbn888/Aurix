# AURIX · M.04 — BILLING REAL (STRIPE / WEB)

Continúa `AURIX-MONETIZATION-M02-B3B4-PRODUCT-ENTITLEMENT.md`. Baseline `main` @ `ca3335c`
(M.03 GO, v698, 255/255). Este bloque construye la primera ruta de cobro real y **no
activa nada por sí solo**: hasta que existan los secretos, los productos del proveedor y
el endpoint de webhook, el checkout responde `503 billing_unconfigured` y el paywall dice
honestamente que la compra todavía no está disponible.

## La cadena, y quién decide en cada eslabón

```
usuario → paywall → /api/billing/checkout → Stripe Checkout
                                               ↓ (el navegador ya no participa)
                        Stripe → /api/billing/webhook (firma verificada)
                                               ↓
                        public.aurix_billing_apply_event()  ← ÚNICO escritor
                                               ↓
                        public.subscriptions → aurix_entitlements() → hasFeature()
```

El navegador puede **iniciar** un checkout. No puede afirmar su resultado. `?billing=success`
sólo dispara una revalidación contra el servidor, que es libre de responder "sigues Free".

## Piezas

| Pieza | Qué decide | Quién puede escribirla |
|---|---|---|
| `public.billing_customers` | qué usuario es un customer del proveedor | service_role |
| `public.billing_prices` | plan, intervalo, importe, divisa, trial | service_role (el cliente sólo lee las activas) |
| `public.billing_events` | si un evento ya se aplicó | service_role |
| `aurix_billing_link_customer()` | vincula customer↔usuario, sin re-apuntar ajenos | service_role |
| `aurix_billing_apply_event()` | **todo lo demás** | service_role |
| `api/billing/[op].js` | única función Node: reparte a `_checkout.js` / `_portal.js` | — |
| `api/billing/webhook.mjs` | autenticidad + extracción (**Edge**, cuerpo crudo) | — |
| `api/billing/_portal.js` | portal del proveedor: tarjeta y **cancelación** | — |

## Precios canónicos

Una sola fuente: `public.billing_prices`. Ni el bundle ni el paywall llevan importes.

| Plan | Importe | Intervalo |
|---|---|---|
| Aurix Premium mensual | **7,99 €** (`799`, EUR) | `month` |
| Aurix Premium anual | **59,99 €** (`5999`, EUR) | `year` |

Trial de 14 días: **modelado y compatible** con Stripe (`subscription_data.trial_period_days`),
y **apagado** (`trial_days = 0`). Se enciende con un UPDATE en la tabla, sin deploy.

## PASOS MANUALES DEL FOUNDER (uno cada vez, en este orden)

0. **NADA que hacer en Vercel — pero hay que saberlo antes de tocar `api/`.**
   *El plan se queda en Hobby (coste cero), por directiva de proyecto.* Hobby admite
   **12 Serverless Functions por deployment** y `api/` estaba exactamente en 12:
   `checkout` y `portal` la subían a 14, así que el deployment se rechazaba **entero**
   y las tres rutas de billing respondían 404. No se ve venir: el build termina bien
   (`Build Completed`) y el rechazo llega después, en `Deploying outputs...`, con el
   motivo **fuera** del Deploy Log. Cerrado bajando el conteo, no el plan: `debug/health`
   retirado a `_health.js` y las dos operaciones de billing compartiendo
   `api/billing/[op].js`. **Cuenta actual: 12 Serverless + 1 Edge, o sea CERO margen.
   Añadir un fichero a `api/` que no empiece por `_` rompe el deployment entero.**
   El gate lo fija (J.6).

1. **Stripe → Productos.** Crear un producto "Aurix Premium" con **dos precios
   recurrentes**: 7,99 € / mes y 59,99 € / año, ambos en EUR. Copiar los dos
   `price_…`.
2. **Supabase → SQL editor.** Pegar y ejecutar `db/monetization_m04_billing_stripe_1.sql`
   completo. Después, descomentar los dos INSERT del final del fichero, pegar los dos
   `price_…` del paso 1 y ejecutarlos.
3. **Stripe → Webhooks.** Añadir endpoint
   `https://isa-portfolio-ten.vercel.app/api/billing/webhook` con **exactamente** estos
   eventos: `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copiar el *signing secret* (`whsec_…`).
4. **Vercel → Environment Variables** (nunca en el repo, nunca en el chat):
   `STRIPE_SECRET_KEY` = la clave secreta · `STRIPE_WEBHOOK_SECRET` = el `whsec_…` del
   paso 3. Redeploy.
5. **Stripe → Configuración del portal de clientes**: activarlo y permitir cancelar y
   actualizar método de pago. Sin esto, `/api/billing/portal` responde error del
   proveedor y el cliente no puede cancelar por sí mismo.
6. **Compra de prueba.** Con las claves de TEST, añadir `BILLING_ALLOW_TEST_EVENTS=1` en
   Vercel, comprar, comprobar que Premium aparece, cancelar desde el portal y comprobar
   que el acceso se mantiene hasta fin de periodo. **Quitar la variable después**: sin
   ella un evento de test no concede Premium real.

## Verificación que NO puede dar el gate

El harness no ejecuta Postgres, así que la capa SQL está argumentada sobre su texto. Las
cuatro pruebas que hay que ejecutar al aplicar la migración están escritas como consultas
comentadas al final del fichero (sección *2b*): idempotencia, rechazo reintentable,
periodo ausente y empate de segundo.

## Consulta de guardia (runbook de lanzamiento)

Con el ledger convertido en el mecanismo de recuperación, **una compra cobrada que no
concede se recupera reenviando su evento desde el dashboard de Stripe** — pero eso exige
que alguien la vea. Esta consulta es la que hay que mirar tras cada compra real y, después,
periódicamente:

```sql
select provider, event_id, event_type, outcome, user_id, received_at
  from public.billing_events
 where applied = false
   and outcome not in ('ignored_type','duplicate','stale','other_subscription')
 order by received_at desc
 limit 50;
```

Cada fila es un evento que **no** se aplicó y podría serlo: `unknown_customer` (falta el
mapeo), `unknown_price` (falta la fila de catálogo), `missing_period` (el payload no traía
periodo en ninguna de las dos formas), `invalid_payload`. Se arregla la causa y se pulsa
*Resend* en Stripe: el mismo `event_id` **sí** se aplica, porque sólo un evento `applied`
es definitivo.

`ignored_type` es ruido esperado (tipos que no cambian estado) y por eso queda fuera.

## Decisiones que conviene no re-litigar

- **Apple / IAP queda fuera: es M.04B.** Notificaciones firmadas con otro esquema, otra
  clave de idempotencia y precios en **mili-unidades** (no céntimos). Meterlo aquí habría
  hecho que una sola revisión cubriera dos modelos de amenaza.
- **El webhook lee el periodo en DOS sitios.** Desde `2025-04-30.basil` Stripe lo movió
  del objeto `subscription` a `items.data[]`, y la versión del payload la fija el endpoint
  del dashboard, no una cabecera nuestra.
- **Un rechazo del escritor es reintentable.** Sólo un evento `applied` es definitivo; un
  `unknown_customer`/`unknown_price` se puede reenviar desde el dashboard y se aplica.
- **`past_due` no concede acceso** (política de B2, no del cliente) pero **sí conserva** la
  ruta al portal: quien tiene una tarjeta caducada necesita poder pagar o cancelar.
- **El founder no es un suscriptor.** Su acceso es una fila de `entitlement_overrides`;
  `subscriptions` sólo recibe verdad del proveedor, así que MRR/ARR no se contamina.
- **Pagar no abre el catálogo interno.** `workspace.catalog_preview` no lo concede ningún
  plan.
- **Un `incomplete` no bloquea reintentar.** Es una suscripción cuyo primer pago nunca se
  cobró (3DS abandonado): bloquear ahí no evita un doble cargo y dejaba al usuario sin
  ruta durante ~23 h. `unpaid` sí bloquea, porque ahí hay algo que cobrar o cancelar.

## Residuales declarados

- **La capa SQL no está demostrada por el gate**: el harness no ejecuta Postgres. Las cuatro
  pruebas de la sección *2b* del fichero de migración son la demostración pendiente.
- **`missing_period` se responde 200** (no hay reintento automático): su recuperación pasa
  por la consulta de guardia de arriba.
- **Dos pestañas simultáneas** pueden abrir dos sesiones de pago en la ventana de segundos
  previa a que exista la primera suscripción. La comprobación cierra la ventana de minutos,
  no la de segundos.
- **Dos `customer.subscription.updated` en el MISMO segundo** siguen siendo indecidibles:
  el desempate por ciclo de vida no los distingue.
- **Una suscripción creada FUERA de la app** (dashboard, payment link) mientras hay otra
  vigente se rechaza como `other_subscription`; se recupera reenviando sus eventos una vez
  muerta la anterior.
- **Apple / IAP: M.04B**, sin empezar.
