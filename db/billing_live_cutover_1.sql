-- ============================================================================
-- AURIX · CUTOVER A STRIPE LIVE  ·  el catálogo de precios
--                        *** PENDIENTE DE APLICAR ***
-- ----------------------------------------------------------------------------
-- QUE HACE, Y NADA MAS
--   Desactiva las filas de precio anteriores y activa las dos LIVE aprobadas
--   para (stripe, premium, year) y (stripe, premium, month). Una transaccion.
--   La UNICA tabla que se escribe es `public.billing_prices` (mas una tabla
--   temporal que se destruye al terminar). No toca `subscriptions`, ni
--   `billing_customers`, ni `entitlement_overrides`, ni `plan_features`, ni
--   usuarios, ni permisos, ni webhooks. No concede ni retira un derecho.
--   No llama a Stripe: es SQL puro.
--
-- POR QUE NO SE PUEDEN TENER LAS CUATRO A LA VEZ
--   `billing_prices_active_uidx` es UNICO sobre (provider, plan, billing_interval)
--   WHERE active. Los `price_id` antiguos y los nuevos no pueden coexistir
--   activos para el mismo intervalo: el paywall no tendria forma de elegir. Por
--   eso el orden dentro de la transaccion es desactivar y DESPUES activar.
--
-- IMPORTES APROBADOS: anual 69,99 EUR (6999) · mensual 7,99 EUR (799).
-- SIN PRUEBA GRATUITA: trial_days = 0 en las dos.
-- Las filas antiguas NO se borran: son el precio de record de lo ya vendido, y
-- `subscriptions` las referencia.
--
-- LO QUE ESTE SQL NO PUEDE SABER: si esos identificadores son de LIVE o de TEST.
-- Eso lo dicen `POST /api/billing/status` y el propio checkout, que lee el
-- precio en Stripe antes de abrir sesion y se NIEGA a cobrar si importe,
-- divisa, recurrencia, estado o entorno no coinciden con esta tabla.
-- ============================================================================

begin;

-- ── LOS DOS PRECIOS APROBADOS ──────────────────────────────────────────────
-- Fuente unica de este script: cualquier comprobacion posterior se hace contra
-- esta tabla, no contra literales repetidos por el fichero.
create temporary table _cutover(
  interval_name text primary key,
  price_id      text    not null,
  amount_cents  integer not null,
  currency      text    not null,
  trial_days    integer not null
) on commit drop;

insert into _cutover(interval_name, price_id, amount_cents, currency, trial_days) values
  ('year',  'price_1UIu7S3l0aCDKMqE3UCE6FtO', 6999, 'EUR', 0),
  ('month', 'price_1UIu3n3l0aCDKMqEL5ocVJ5A',  799, 'EUR', 0);

-- ── GUARDA PREVIA ──────────────────────────────────────────────────────────
-- Antes de tocar nada: que los datos de partida sean los aprobados.
do $$
declare
  v_bad int;
  v_n   int;
begin
  select count(*) into v_n from _cutover;
  if v_n <> 2 then
    raise exception 'CUTOVER ABORTADO: se esperaban 2 precios declarados y hay %', v_n;
  end if;

  select count(*) into v_bad from _cutover
   where price_id !~ '^price_[A-Za-z0-9]+$';
  if v_bad > 0 then
    raise exception 'CUTOVER ABORTADO: % identificador(es) no tienen forma de price de Stripe', v_bad;
  end if;

  -- Dos veces el mismo id seria vender el anual al precio del mensual.
  if (select count(distinct price_id) from _cutover) <> 2 then
    raise exception 'CUTOVER ABORTADO: los dos identificadores de precio son iguales';
  end if;

  select count(*) into v_bad from _cutover
   where currency <> 'EUR' or trial_days <> 0
      or (interval_name = 'year'  and amount_cents <> 6999)
      or (interval_name = 'month' and amount_cents <>  799);
  if v_bad > 0 then
    raise exception 'CUTOVER ABORTADO: % fila(s) declarada(s) no coinciden con lo aprobado (6999/799 EUR, sin trial)', v_bad;
  end if;
end $$;

-- ── 1 · LO QUE HABIA, DESACTIVADO ──────────────────────────────────────────
-- Acotado a los dos intervalos de este cutover. No se borra ninguna fila.
update public.billing_prices
   set active = false
 where provider = 'stripe'
   and plan = 'premium'
   and billing_interval in ('year','month')
   and active
   and provider_price_id not in (select price_id from _cutover);

-- ── 2 · LOS PRECIOS APROBADOS, ACTIVOS ─────────────────────────────────────
-- `on conflict` sobre la clave primaria (provider, provider_price_id): si el
-- precio ya existiera en la tabla, se reescribe con los valores aprobados en
-- lugar de fallar.
insert into public.billing_prices
  (provider, provider_price_id, plan, billing_interval, amount_cents, currency, trial_days, active)
select 'stripe', c.price_id, 'premium', c.interval_name,
       c.amount_cents, c.currency, c.trial_days, true
  from _cutover c
on conflict (provider, provider_price_id) do update
   set plan             = excluded.plan,
       billing_interval = excluded.billing_interval,
       amount_cents     = excluded.amount_cents,
       currency         = excluded.currency,
       trial_days       = excluded.trial_days,
       active           = true;

-- ── 3 · LA COMPROBACION VA DENTRO DE LA TRANSACCION ────────────────────────
-- Si el estado final no es EXACTAMENTE el aprobado, esto lanza una excepcion,
-- la transaccion se aborta y el `commit` no llega a ocurrir: la base queda como
-- estaba. Se comprueban las seis cosas, no solo el importe.
do $$
declare
  v_active int;
  r        record;
begin
  -- a) EXACTAMENTE dos filas activas en los dos intervalos.
  select count(*) into v_active
    from public.billing_prices
   where provider = 'stripe' and plan = 'premium'
     and billing_interval in ('year','month') and active;
  if v_active <> 2 then
    raise exception 'CUTOVER ABORTADO: hay % fila(s) activa(s) en year|month, deberian ser exactamente 2', v_active;
  end if;

  -- b) Y esas dos son las esperadas CAMPO A CAMPO: id, intervalo, importe,
  --    moneda y trial. Se recorre la declaracion para poder decir cual falla.
  for r in select * from _cutover order by interval_name loop
    perform 1
       from public.billing_prices p
      where p.provider          = 'stripe'
        and p.plan              = 'premium'
        and p.active
        and p.provider_price_id = r.price_id
        and p.billing_interval  = r.interval_name
        and p.amount_cents      = r.amount_cents
        and p.currency          = r.currency
        and p.trial_days        = r.trial_days;
    if not found then
      raise exception 'CUTOVER ABORTADO: la fila activa de % no coincide con lo aprobado (id=%, importe=%, moneda=%, trial=%)',
        r.interval_name, r.price_id, r.amount_cents, r.currency, r.trial_days;
    end if;
  end loop;

  -- c) Y ninguna otra fila activa de esos intervalos se ha colado.
  if exists (
    select 1 from public.billing_prices p
     where p.provider = 'stripe' and p.plan = 'premium'
       and p.billing_interval in ('year','month') and p.active
       and p.provider_price_id not in (select price_id from _cutover)
  ) then
    raise exception 'CUTOVER ABORTADO: queda activa una fila que no es ninguna de las dos aprobadas';
  end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACION (solo lectura, despues del commit).
-- Esperado: DOS filas con active = true — year 6999 EUR y month 799 EUR, las
-- dos con trial_days = 0 — y las anteriores con active = false, sin borrar.
-- ============================================================================
select billing_interval,
       provider_price_id,
       amount_cents,
       currency,
       trial_days,
       active
  from public.billing_prices
 where provider = 'stripe'
   and plan = 'premium'
 order by active desc, billing_interval;
