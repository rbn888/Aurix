-- ============================================================================
-- AURIX-AFFILIATES-V1 · 2/3 · ROLLBACK
-- Pareja explícita de: db/billing_payments_1.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. ***   psql -v ON_ERROR_STOP=1 -f db/billing_payments_1_rollback.sql
-- Orden de rollback: PRIMERO db/founder_read_affiliates_1_rollback.sql, después
-- este fichero. ANTES de ejecutarlo, quitar los cinco tipos de evento nuevos del
-- endpoint de Stripe (o desplegar el webhook anterior): si no, cada entrega de
-- esos tipos encuentra el escritor borrado ⇒ 500 ⇒ reintentos.
--
-- DESTRUCTIVO PARA LA EVIDENCIA: borra cobros, reembolsos y disputas registrados.
-- No toca `subscriptions`, ni `billing_customers`, ni `billing_prices`, ni el
-- escritor de M.04: el acceso Premium no depende de nada de esto.
--
-- EL LEDGER: las filas de billing_events con 'recorded'/'missing_link' se pasan a
-- 'ignored_type' NO aplicadas (no se borran: siguen siendo el rastro de que el
-- evento llegó) para poder restaurar el CHECK original de M.04. Al no quedar
-- aplicadas, si se vuelve a aplicar esta migración un reenvío desde Stripe las
-- registra de nuevo en vez de descartarlas como duplicadas.
-- ============================================================================

begin;

drop function if exists public.aurix_billing_record_payment_event(text, text, text, timestamptz, boolean,
  text, text, text, text, text, text, integer, text, text, timestamptz, text, text);
drop table if exists public.billing_disputes;
drop table if exists public.billing_refunds;
drop table if exists public.billing_payments;

update public.billing_events
   set outcome = 'ignored_type', applied = false
 where outcome in ('recorded', 'missing_link');

alter table public.billing_events drop constraint if exists billing_events_outcome_chk;
alter table public.billing_events add constraint billing_events_outcome_chk
  check (outcome in ('applied','duplicate','unknown_price','unknown_customer',
                     'ignored_type','stale','invalid_payload','unknown_status',
                     'missing_period','other_subscription','received'));

do $$
begin
  if to_regclass('public.billing_payments') is not null
     or to_regclass('public.billing_refunds') is not null
     or to_regclass('public.billing_disputes') is not null
     or to_regprocedure('public.aurix_billing_record_payment_event(text,text,text,timestamptz,'
                        'boolean,text,text,text,text,text,text,integer,text,text,timestamptz,text,text)') is not null then
    raise exception 'PAYMENTS-1 ROLLBACK FAIL: queda algún objeto';
  end if;
  raise notice 'PAYMENTS-1 ROLLBACK VERIFIED — M.04 intacto';
end $$;

commit;
