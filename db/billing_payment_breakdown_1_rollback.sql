-- ============================================================================
-- AURIX-PARTNER-ENGINE-V2 · 1/2 · ROLLBACK
-- Pareja explícita de: db/billing_payment_breakdown_1.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. ***   psql -v ON_ERROR_STOP=1 -f db/billing_payment_breakdown_1_rollback.sql
-- Orden de rollback: PRIMERO db/founder_read_affiliates_2_rollback.sql (la
-- lectura v2 lee esta tabla; si sigue viva, este fichero se NIEGA), y ANTES el
-- webhook anterior desplegado: si no, cada `invoice.paid` encuentra el escritor
-- borrado ⇒ 500 ⇒ reintentos.
--
-- DESTRUCTIVO PARA LA EVIDENCIA: borra los desgloses registrados. No toca
-- `billing_payments`, `billing_events`, `subscriptions` ni el acceso Premium.
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('public.founder_read_affiliates()') is not null
     and position('billing_payment_breakdowns' in
                  pg_get_functiondef('public.founder_read_affiliates()'::regprocedure)) > 0 then
    raise exception 'BREAKDOWN-1 ROLLBACK FAIL: la lectura v2 sigue usando la tabla; '
                    'aplicar antes db/founder_read_affiliates_2_rollback.sql';
  end if;
end $$;

drop function if exists public.aurix_billing_record_payment_breakdown(text, text, text, integer, integer,
  integer, integer, text);
drop table if exists public.billing_payment_breakdowns;

do $$
begin
  if to_regclass('public.billing_payment_breakdowns') is not null
     or to_regprocedure('public.aurix_billing_record_payment_breakdown(text,text,text,integer,'
                        'integer,integer,integer,text)') is not null then
    raise exception 'BREAKDOWN-1 ROLLBACK FAIL: queda algún objeto';
  end if;
  if to_regclass('public.billing_payments') is null then
    raise exception 'BREAKDOWN-1 ROLLBACK FAIL: billing_payments no debería haberse tocado';
  end if;
  raise notice 'BREAKDOWN-1 ROLLBACK VERIFIED — evidencia de cobro V1 intacta';
end $$;

commit;
