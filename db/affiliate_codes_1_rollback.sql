-- AURIX-AFFILIATES-V1 · 0/3 · ROLLBACK de db/affiliate_codes_1.sql
-- *** NO EJECUTADO. *** Ejecutar el ÚLTIMO (después del rollback de
-- affiliate_attribution_1, cuyas funciones leen esta tabla). Borra el registro
-- recibido de Founder y su auditoría; Founder puede volver a empujarlo.
begin;
drop function if exists public.aurix_affiliate_codes_replace(uuid, timestamptz, text, jsonb);
drop function if exists public.aurix_affiliate_registry_rows();
drop table    if exists public.affiliate_code_pushes;
drop table    if exists public.affiliate_codes;
drop function if exists public.aurix_affiliate_intervals_ok(jsonb);
drop function if exists public.aurix_iso_utc_ok(text);
do $$ begin
  if to_regclass('public.affiliate_codes') is not null then
    raise exception 'AFFILIATE-CODES ROLLBACK FAIL';
  end if;
end $$;
commit;
