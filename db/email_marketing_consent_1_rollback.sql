-- ROLLBACK de db/email_marketing_consent_1.sql. NO APLICADO DESDE EL REPO.
-- Ojo: borra cualquier consentimiento que se haya registrado después de aplicarlo.
begin;
alter table public."Correos usuario"
  drop column if exists marketing_consent_source,
  drop column if exists marketing_consent_at;
commit;
