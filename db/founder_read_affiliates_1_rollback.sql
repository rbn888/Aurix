-- ============================================================================
-- AURIX-AFFILIATES-V1 · 3/3 · ROLLBACK
-- Pareja explícita de: db/founder_read_affiliates_1.sql
-- *** NO EJECUTADO. ***   psql -v ON_ERROR_STOP=1 -f db/founder_read_affiliates_1_rollback.sql
-- Sólo retira la función de lectura: GET /api/read/affiliates pasa a responder
-- `affiliates: { available: false, reason: 'not_applied' }`. No borra evidencia.
-- ============================================================================

begin;
drop function if exists public.founder_read_affiliates();
do $$
begin
  if to_regprocedure('public.founder_read_affiliates()') is not null then
    raise exception 'FOUNDER-READ-AFFILIATES ROLLBACK FAIL';
  end if;
end $$;
commit;
