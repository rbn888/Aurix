-- ============================================================================
-- AURIX-AFFILIATES-V1 · 1/3 · ROLLBACK
-- Pareja explícita de: db/affiliate_attribution_1.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. ***   psql -v ON_ERROR_STOP=1 -f db/affiliate_attribution_1_rollback.sql
-- Orden de rollback: PRIMERO db/founder_read_affiliates_1_rollback.sql (que lee
-- estas tablas), después este fichero.
--
-- DESTRUCTIVO PARA LA EVIDENCIA: borra las atribuciones capturadas y el recuento
-- de visitas. Una atribución no se puede reconstruir después (se fija al
-- registrarse). Exportarlas antes si Founder ya las ha usado para una comisión.
-- No toca auth.users, ni billing_*, ni nada de M.04.
-- ============================================================================

begin;

drop function if exists public.aurix_affiliate_click(text);
drop function if exists public.aurix_attribution_capture(jsonb);
drop table    if exists public.affiliate_clicks;
drop table    if exists public.acquisition_attributions;
drop function if exists public.aurix_attribution_immutable();
drop function if exists public.aurix_attribution_touches_ok(jsonb);

do $$
begin
  if to_regclass('public.acquisition_attributions') is not null
     or to_regclass('public.affiliate_clicks') is not null
     or to_regprocedure('public.aurix_attribution_capture(jsonb)') is not null
     or to_regprocedure('public.aurix_affiliate_click(text)') is not null then
    raise exception 'AFFILIATES-1 ROLLBACK FAIL: queda algún objeto';
  end if;
  raise notice 'AFFILIATES-1 ROLLBACK VERIFIED';
end $$;

commit;
