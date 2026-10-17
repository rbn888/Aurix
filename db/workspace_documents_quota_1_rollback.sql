-- ROLLBACK de db/workspace_documents_quota_1.sql. NO APLICADO DESDE EL REPO.
-- Retira la cuota de almacenamiento de Workspace. No toca ningún documento.
begin;
drop trigger if exists workspace_documents_quota on public.workspace_documents;
drop function if exists public.aurix_workspace_documents_quota();
alter table public.workspace_documents drop constraint if exists workspace_documents_body_size;
commit;
