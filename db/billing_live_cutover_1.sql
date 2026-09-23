-- ============================================================================
-- AURIX · CUTOVER A STRIPE LIVE  ·  el catálogo de precios
--                        *** PENDIENTE DE APLICAR · requiere dos IDs LIVE ***
-- ----------------------------------------------------------------------------
-- QUE HACE, Y NADA MAS
--   Desactiva las filas de precio de TEST y activa las de LIVE para
--   (stripe, premium, year) y (stripe, premium, month). Una sola transaccion.
--   No toca `subscriptions`, ni `billing_customers`, ni `entitlement_overrides`,
--   ni `plan_features`. No concede ni retira un derecho a nadie.
--
-- POR QUE NO SE PUEDEN TENER LAS CUATRO A LA VEZ
--   `billing_prices_active_uidx` es UNICO sobre (provider, plan, billing_interval)
--   WHERE active. Los `price_id` de TEST y de LIVE no pueden coexistir activos
--   para el mismo intervalo: el paywall no tendria forma de elegir. Por eso el
--   orden dentro de la transaccion es desactivar y DESPUES activar.
--
-- ANTES DE EJECUTAR: crear los dos precios en Stripe LIVE (producto «Aurix
-- Premium», recurrentes, EUR) y pegar sus IDs abajo. Los importes NO se copian
-- de Stripe: se declaran aqui y `api/billing/status` los contrasta contra el
-- proveedor despues. Si los dos no coinciden, el diagnostico lo dice.
--
-- IMPORTES APROBADOS: anual 59,99 EUR (5999) · mensual 7,99 EUR (799).
-- SIN PRUEBA GRATUITA: trial_days = 0 en las dos. Encender un trial es una
-- decision comercial aparte y el diagnostico la marca como bloqueo si aparece.
--
-- ESTE FICHERO SE NIEGA A EJECUTARSE con los marcadores sin sustituir, asi que
-- no puede dejar el catalogo a medias por un copiar-pegar incompleto.
-- ============================================================================

begin;

-- ── LOS DOS UNICOS VALORES QUE HAY QUE EDITAR ──────────────────────────────
-- Sustituir por los IDs de Stripe LIVE. Empiezan por `price_`.
create temporary table _cutover(interval_name text primary key, price_id text not null) on commit drop;
insert into _cutover(interval_name, price_id) values
  ('year',  'PEGAR_AQUI_PRICE_ID_LIVE_ANUAL'),
  ('month', 'PEGAR_AQUI_PRICE_ID_LIVE_MENSUAL');

-- Guarda: marcadores sin sustituir, o IDs que no tienen forma de price.
do $$
declare v_bad int;
begin
  select count(*) into v_bad from _cutover
   where price_id like 'PEGAR_AQUI_%' or price_id !~ '^price_[A-Za-z0-9_]+$';
  if v_bad > 0 then
    raise exception 'CUTOVER ABORTADO: faltan por sustituir % identificadores de precio LIVE', v_bad;
  end if;
  -- Y que no se peguen dos veces el mismo: seria vender el anual al precio del mensual.
  if (select count(distinct price_id) from _cutover) <> 2 then
    raise exception 'CUTOVER ABORTADO: los dos identificadores de precio son iguales';
  end if;
end $$;

-- ── 1 · LO QUE HABIA, DESACTIVADO ──────────────────────────────────────────
-- Acotado a los dos intervalos de este cutover. No se borra ninguna fila: un
-- precio retirado sigue siendo el precio de record de las suscripciones que se
-- vendieron con el, y `subscriptions` lo referencia.
update public.billing_prices
   set active = false
 where provider = 'stripe'
   and plan = 'premium'
   and billing_interval in ('year','month')
   and active
   and provider_price_id not in (select price_id from _cutover);

-- ── 2 · LOS PRECIOS LIVE, ACTIVOS ──────────────────────────────────────────
-- `on conflict` sobre la clave primaria (provider, provider_price_id): si el
-- precio ya existiera en la tabla, se reactiva con los valores aprobados en
-- lugar de fallar.
insert into public.billing_prices
  (provider, provider_price_id, plan, billing_interval, amount_cents, currency, trial_days, active)
select 'stripe', c.price_id, 'premium', c.interval_name,
       case c.interval_name when 'year' then 5999 else 799 end,
       'EUR', 0, true
  from _cutover c
on conflict (provider, provider_price_id) do update
   set plan             = excluded.plan,
       billing_interval = excluded.billing_interval,
       amount_cents     = excluded.amount_cents,
       currency         = excluded.currency,
       trial_days       = excluded.trial_days,
       active           = true;

-- ── 3 · LA COMPROBACION VA DENTRO DE LA TRANSACCION ────────────────────────
-- Si el resultado no es exactamente una fila activa por intervalo con el importe
-- aprobado, esto revienta y el `commit` no llega a ocurrir.
do $$
declare v_n int; v_year int; v_month int;
begin
  select count(*) into v_n from public.billing_prices
   where provider='stripe' and plan='premium' and billing_interval in ('year','month') and active;
  if v_n <> 2 then
    raise exception 'CUTOVER ABORTADO: quedan % filas activas, deberian ser 2', v_n;
  end if;
  select amount_cents into v_year  from public.billing_prices
   where provider='stripe' and plan='premium' and billing_interval='year'  and active;
  select amount_cents into v_month from public.billing_prices
   where provider='stripe' and plan='premium' and billing_interval='month' and active;
  if v_year <> 5999 or v_month <> 799 then
    raise exception 'CUTOVER ABORTADO: importes % / %, aprobados 5999 / 799', v_year, v_month;
  end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACION (solo lectura). «Lo ejecute y no dio error» NO es prueba.
-- ============================================================================
-- select billing_interval, provider_price_id, amount_cents, currency, trial_days, active
--   from public.billing_prices
--  where provider='stripe' and plan='premium'
--  order by active desc, billing_interval;
-- -- esperado: DOS filas con active=true (year 5999 EUR, month 799 EUR, trial 0)
-- --           y las de TEST con active=false, sin borrar.
--
-- Y DESPUES, la comprobacion que de verdad importa —que esos IDs existen en
-- Stripe LIVE, con esos importes y esa recurrencia, y que el webhook y el
-- portal son del mismo entorno— con `POST /api/billing/status` desde la cuenta
-- fundadora. Este SQL no puede saberlo: solo escribe el catalogo.
-- ============================================================================
