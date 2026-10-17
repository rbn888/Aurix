-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING V3 · EMAIL · PRUEBA DE CONSENTIMIENTO COMERCIAL (P2-10)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠ DECISIÓN DEL FOUNDER (legal/comercial). PREPARADO, NO APLICADO.
-- Rollback: db/email_marketing_consent_1_rollback.sql
--
-- Añade DÓNDE registrar el consentimiento; no registra ninguno. Todas las filas existentes
-- quedan con `marketing_consent_at = null`, es decir SIN consentimiento demostrado, y
-- scripts/aurix-send-campaign.mjs no les enviará nada. Rellenarla exige una fuente real
-- (p. ej. una casilla explícita en la landing o en el login que hoy NO existe): no se
-- deduce del alta, del login ni del hecho de estar en la tabla.
-- ════════════════════════════════════════════════════════════════════════════
begin;
alter table public."Correos usuario"
  add column if not exists marketing_consent_at     timestamptz,
  add column if not exists marketing_consent_source text;
commit;
