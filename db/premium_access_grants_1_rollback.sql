-- AURIX-PREMIUM-ACCESS-V1 · ROLLBACK de db/premium_access_grants_1.sql
-- *** NO EJECUTADO. *** Quita las funciones del control y su historial.
-- NO toca `entitlement_overrides`: las concesiones ya hechas siguen siendo
-- filas normales del resolver y caducan solas en su fecha. Para cortarlas YA,
-- ejecutar antes el bloque opcional de abajo (no afecta a suscripciones pagadas).
--
--   update public.entitlement_overrides
--      set expires_at = greatest(now(), starts_at + interval '1 millisecond'), updated_at = now()
--    where reason = 'comp' and granted_by = 'founder-platform' and expires_at > now();
begin;
drop function if exists public.aurix_premium_access_apply(uuid, timestamptz, uuid, text, integer, timestamptz, text, text);
drop function if exists public.aurix_premium_access_lookup(text);
drop function if exists public.aurix_premium_access_state(uuid);
drop table    if exists public.premium_access_actions;
do $$ begin
  if to_regclass('public.premium_access_actions') is not null then
    raise exception 'PREMIUM-ACCESS ROLLBACK FAIL';
  end if;
end $$;
commit;
