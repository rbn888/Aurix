-- ============================================================================
-- AURIX · CUTOVER A STRIPE LIVE  ·  ROLLBACK del catalogo de precios
-- Pareja explicita de: db/billing_live_cutover_1.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
--
-- Devuelve el catalogo a los precios de TEST. Util solo si el cutover se
-- revierte ANTES de que exista una suscripcion LIVE; con una venta real hecha,
-- volver a TEST deja al cliente que paga sin precio de record y NO es lo que se
-- debe hacer — ahi lo correcto es arreglar el precio LIVE, no retroceder.
--
-- Igual que su pareja: una transaccion, acotado a (stripe, premium, year|month),
-- sin borrar filas y sin tocar suscripciones, clientes ni derechos.
-- ============================================================================

begin;

create temporary table _rollback(interval_name text primary key, price_id text not null) on commit drop;
insert into _rollback(interval_name, price_id) values
  -- Los IDs de TEST son conocidos (`db/m04_prod/04_seed_test_prices_prod.sql`), asi
  -- que se dejan pegados: un rollback que exige buscar dos identificadores es un
  -- rollback que no se puede ejecutar cuando hace falta, que es siempre con prisa.
  ('year',  'price_1UBetMKuk0nQ7dBISxq3UtoB'),
  ('month', 'price_1UBeqjKuk0nQ7dBIPx0Luq1i');

do $$
declare v_bad int;
begin
  select count(*) into v_bad from _rollback
   where price_id like 'PEGAR_AQUI_%' or price_id !~ '^price_[A-Za-z0-9_]+$';
  if v_bad > 0 then
    raise exception 'ROLLBACK ABORTADO: faltan por sustituir % identificadores', v_bad;
  end if;
end $$;

update public.billing_prices
   set active = false
 where provider='stripe' and plan='premium' and billing_interval in ('year','month')
   and active and provider_price_id not in (select price_id from _rollback);

update public.billing_prices p
   set active = true
  from _rollback r
 where p.provider='stripe' and p.provider_price_id = r.price_id;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.billing_prices
   where provider='stripe' and plan='premium' and billing_interval in ('year','month') and active;
  if v_n <> 2 then raise exception 'ROLLBACK ABORTADO: % filas activas, deberian ser 2', v_n; end if;
end $$;

commit;
