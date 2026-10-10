# AURIX-AFFILIATES-V1 · despliegue seguro (checklist)

Aurix guarda evidencia (registro de códigos, atribución, cobros/reembolsos/disputas); Founder calcula.
Coste: 12 Serverless + 1 Edge (sin cambio), 0 crons nuevos, 1 rewrite en `vercel.json` (Hobby OK).

## 0 · Pre-checks de producción (solo lectura) — ejecutados 2026-10-10
- [x] Postgres 17.6; `pg_catalog.sha256(bytea)` disponible (no hace falta pgcrypto).
- [x] Existen `billing_customers`, `billing_prices`, `billing_events`, `subscriptions`, `entitlement_overrides`, `plan_features`
      con las columnas que usan las migraciones; roles `anon`/`authenticated`/`service_role`.
- [x] `billing_events`: PK `(provider, event_id)`, 2 CHECK; `billing_events_outcome_chk` = la lista de M.04 (11 valores).
      En uso: `applied` 7, `stale` 3 → el CHECK ampliado los admite.
- [x] `aurix_billing_apply_event/14` y `aurix_billing_link_customer/3` con la firma esperada; únicos `aurix_billing*`.
- [x] Sin colisiones: ninguna tabla ni función nueva existe todavía.
- [x] El backfill sembraría 2 usuarios (`subscriptions.plan = 'premium'`).
- [x] Tamaño de la BD: 109,3 MB de 500 MB (free). Las tablas nuevas crecen en filas por usuario/cobro: despreciable.
- [x] Dry-run: DDL real de producción (reconstruido del catálogo, solo lectura; `supabase db dump` exige Docker)
      cargado en PGlite + las 4 migraciones ×2 + pruebas + rollbacks → `PASS 45/0`
      (`AURIX_REHEARSAL_SCHEMA=… node scripts/aurix-affiliates-sql-rehearsal.mjs`).

## 1 · SQL (editor de Supabase de producción, cada fichero ENTERO, en este orden)
1. `db/affiliate_codes_1.sql`
2. `db/affiliate_attribution_1.sql`
3. `db/billing_payments_1.sql`
4. `db/founder_read_affiliates_1.sql`  (siembra `affiliate_premium_backfill`)

Cada uno termina en `… APPLY VERIFIED`; si no, no se confirmó nada.

## 2 · Vercel (Production)
- [ ] Añadir `AURIX_AFFILIATE_CONTROL_TOKEN` (≥ 32 caracteres, aleatorio, DISTINTO de `AURIX_FOUNDER_READ_TOKEN` y de todo
      otro secreto: si coincide, el control queda deshabilitado). Darlo a Founder Platform como credencial de control.
- [ ] Confirmar `STRIPE_SECRET_KEY` (LIVE): el webhook la usa para leer el payment intent de `invoice.paid` (forma basil).
- [ ] Merge a `main` = despliegue de Pages (app/login) y Vercel (API/landing). Hacerlo DESPUÉS del paso 1.

## 2b · Founder Platform
- [ ] En `.env.local` de Founder: `AURIX_AFFILIATE_CONTROL_TOKEN=` el mismo valor del paso 2 (nunca el de lectura).
- [ ] Abrir Afiliados → «Sincronizar»: entrega el registro y lee la evidencia. Debe decir «Aurix tiene el registro de enlaces al día».

## 3 · Stripe LIVE (después del despliegue)
- [ ] En el endpoint `…/api/billing/webhook` activar: `invoice.paid`, `charge.refunded`,
      `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.

## 4 · Verificación post-despliegue
- [ ] SQL: `select public.founder_read_affiliates();` → `available: true`; `select count(*) from public.affiliate_premium_backfill;` → 2.
- [ ] Founder empuja el registro (`POST /api/control/affiliate-codes`) → 200 con `registryHash` = el suyo.
- [ ] `GET /api/read/affiliates` → `affiliates.registry.hash` = el mismo; `count` = códigos vigentes.
- [ ] `aurixsystem.io/?ref=<código activo>` → aparece el aviso; con un código inventado, no.
- [ ] Primer `invoice.paid` real: fila en `billing_payments` con `payment_intent_id` y `billing_events.outcome = 'recorded'`.

## 5 · Rollback (en orden inverso)
1. Stripe: desactivar los 5 eventos nuevos (si no, cada entrega daría 500 y reintentos).
2. Revertir el despliegue (revert del merge en `main`).
3. SQL, en este orden: `founder_read_affiliates_1_rollback` → `billing_payments_1_rollback` →
   `affiliate_attribution_1_rollback` → `affiliate_codes_1_rollback`.

Pérdida de datos al hacer rollback: cobros/reembolsos/disputas registrados, atribuciones (no se pueden reconstruir:
se fijan al registrarse), visitas y el registro de códigos (Founder puede reenviarlo). Exportarlos antes si ya se
usaron para pagar comisiones. Las filas de `billing_events` de los tipos nuevos se quedan como `ignored_type`
no aplicadas: inocuas para M.04. El acceso Premium no depende de nada de esto.

## E2E en modo TEST (local, sin producción)
`.env.e2e.local` (git-ignored) con `STRIPE_SECRET_KEY=sk_test_…` y las claves de aurix-staging, y
`node scripts/aurix-affiliates-e2e.mjs` (`--dry-run` no necesita Stripe). Requiere la Stripe CLI.
