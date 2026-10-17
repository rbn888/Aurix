-- ROLLBACK de db/workspace_documents_premium_gate_1.sql. NO APLICADO DESDE EL REPO.
begin;
drop trigger if exists workspace_documents_premium_gate on public.workspace_documents;
drop function if exists public.aurix_workspace_documents_premium_gate();
commit;
