-- ════════════════════════════════════════════════════════════════════════════
-- AURIX · ROLLBACK · premium_access_follow_catalog_1
-- *** NO APLICADO. ***
-- Retira el trigger y su función. Las filas que el trigger o el backfill hayan
-- añadido son filas gestionadas normales ('comp' + 'founder-platform'): siguen las
-- reglas de siempre y se cierran con la revocación de la concesión. No se borran
-- aquí: borrar derechos concedidos no es un rollback de código.
-- ════════════════════════════════════════════════════════════════════════════
begin;
drop trigger if exists plan_features_premium_access_follow on public.plan_features;
drop function if exists public.aurix_premium_access_follow_catalog();
commit;
