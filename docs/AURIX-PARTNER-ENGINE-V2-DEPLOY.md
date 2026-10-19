# AURIX-PARTNER-ENGINE-V2 · desglose del cobro · despliegue seguro (checklist)

Aurix registra, por factura pagada, lo que Stripe informa: subtotal, descuentos, impuesto, total sin impuesto y si
Stripe CALCULÓ el impuesto (`taxStatus`). Lo publica en `GET /api/read/affiliates` para que Founder decida si la base
de una comisión por porcentaje es certificable. Aurix no calcula impuestos, porcentajes ni comisiones.
Coste: 0 funciones nuevas (12 Serverless + 1 Edge, sin cambio), 0 crons, 1 tabla pequeña (una fila por factura).
Requiere AURIX-AFFILIATES-V1 aplicado (ver `docs/AURIX-AFFILIATES-V1-DEPLOY.md`).

## 0 · Ensayo (local, sin producción)
- `node docs/AURIX-PARTNER-ENGINE-V2-harness.js` — extracción del webhook en las dos formas de Stripe y forma del SQL.
- `AURIX_PGLITE_DIR=/tmp/pglite-partners node scripts/aurix-partner-breakdown-sql-rehearsal.mjs` — ejecuta los
  ficheros reales en PGlite (instalación en /tmp, ver la cabecera del script). Opcional `AURIX_REHEARSAL_SCHEMA=…`
  con el DDL de producción, como en V1.

## 1 · SQL (editor de Supabase de producción, cada fichero ENTERO, en este orden)
1. `db/billing_payment_breakdown_1.sql`  → `BREAKDOWN-1 APPLY VERIFIED`
2. `db/founder_read_affiliates_2.sql`    → `FOUNDER-READ-AFFILIATES-2 APPLY VERIFIED`

No resiembra `affiliate_premium_backfill`. `db/monetization_m04_billing_stripe_1.sql` sólo cambia en su verificación
(admite el escritor nuevo si alguna vez se reaplica); NO hay que volver a aplicarlo.

## 2 · Despliegue
- Merge a `main` DESPUÉS del paso 1: el webhook nuevo llama a `aurix_billing_record_payment_breakdown`; si la función no
  existe, cada `invoice.paid` contestaría 500 (Stripe reintenta; el cobro en sí es idempotente y no se pierde).
- Stripe: ningún evento nuevo. El desglose viaja con `invoice.paid`, que ya está activado.

## 3 · Verificación post-despliegue
```sql
-- forma: cada cobro trae las 4 claves (null en los anteriores a V2)
select p -> 'invoiceId' as invoice, p -> 'subtotalCents' as subtotal, p -> 'discountCents' as discount,
       p -> 'taxCents' as tax, p -> 'taxStatus' as tax_status
  from jsonb_array_elements(public.founder_read_affiliates() -> 'payments') p;
-- tras el primer invoice.paid real:
select tax_status, count(*) from public.billing_payment_breakdowns group by 1;
```
Esperado hoy: `not_computed` y `tax_cents` null.

## 4 · IMPORTANTE: hoy Stripe NO calcula el impuesto
El checkout no activa `automatic_tax`, así que Stripe no calcula IVA y cada desglose sale `taxStatus: 'not_computed'`
con `taxCents: null` (no 0: "nadie calculó el IVA" no es "exento"). Founder mantendrá EN ESPERA las comisiones por
porcentaje mientras sea así. Este cambio NO toca el checkout; activar `automatic_tax` (y registrar la empresa en Stripe
Tax) es una decisión aparte. Los cobros anteriores a V2 no tienen desglose: sus 4 claves son null y tampoco son base
certificable.

## 5 · Rollback (en orden inverso)
1. Revertir el despliegue (revert del merge en `main`) — antes del SQL, para que el webhook deje de llamar al escritor.
2. SQL, en este orden: `db/founder_read_affiliates_2_rollback.sql` (restaura el cuerpo exacto de v1) →
   `db/billing_payment_breakdown_1_rollback.sql` (se NIEGA si la lectura v2 sigue viva).

Pérdida de datos: los desgloses registrados (exportarlos antes si ya se usaron para pagar). No toca cobros,
reembolsos, disputas, `billing_events`, suscripciones ni el acceso Premium.

## Premium gratuito y primera compra

La lectura v2 publica también `paidBefore`: la cuenta ya había PAGADO Premium
antes de ese cobro (otro cobro pagado, o el Premium histórico sembrado al
aplicar v1). Un acceso gratuito administrativo —vigente, caducado o revocado—
no cuenta. El Programa Influencers usa `paidBefore`; el clásico sigue usando
`premiumBefore`, idéntico a v1.
