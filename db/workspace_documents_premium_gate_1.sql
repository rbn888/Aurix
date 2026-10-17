-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING V3 · WORKSPACE · PUERTA PREMIUM EN EL SERVIDOR (P2-02)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠ DECISIÓN COMERCIAL DEL FOUNDER. PREPARADO, NO ACTIVADO. NO APLICAR sin esa decisión.
-- Rollback: db/workspace_documents_premium_gate_1_rollback.sql
--
-- QUÉ CIERRA. Hoy la frontera Premium de Workspace la pone sólo el cliente
-- (`_wsCanPersist()` → `hasAurixPremiumAccess()` = feature `intelligence.full`). Una cuenta
-- Free que fuerce `_aurixEnt` desde la consola puede guardar documentos en la nube. No da
-- acceso a datos ajenos ni derechos comerciales: es sincronización no pagada.
--
-- QUÉ HACE. Exige el MISMO derecho que el cliente (`intelligence.full`, resuelto por
-- `aurix_entitlements()` con `auth.uid()`) sólo para CREAR un documento NUEVO.
--
-- QUÉ NO HACE, A PROPÓSITO (por eso es un trigger y no una política de INSERT):
--   · El cliente guarda con UPSERT. Una política de INSERT se evaluaría también al reescribir o
--     borrar (tombstone) un documento EXISTENTE, y quien pierde Premium no podría ni borrar
--     su propio trabajo. El trigger deja pasar todo lo que ya existe y todos los borrados.
--   · Leer, exportar y borrar quedan siempre permitidos.
--   · Sin `auth.uid()` (service role / mantenimiento) no aplica.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.aurix_workspace_documents_premium_gate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
begin
  if auth.uid() is null or new.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.workspace_documents d
              where d.user_id = new.user_id and d.doc_id = new.doc_id) then
    return new;                                   -- reescribir lo propio nunca se bloquea
  end if;
  select coalesce((e.features ->> 'intelligence.full')::boolean, false)
    into v_allowed
    from public.aurix_entitlements() e;
  if not coalesce(v_allowed, false) then
    raise exception 'workspace_premium_required' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.aurix_workspace_documents_premium_gate() from public, anon, authenticated;

drop trigger if exists workspace_documents_premium_gate on public.workspace_documents;
create trigger workspace_documents_premium_gate
  before insert on public.workspace_documents
  for each row execute function public.aurix_workspace_documents_premium_gate();

commit;

-- NOTA PARA EL CLIENTE. El error llega como 42501 («permission denied»), que
-- `_wsDocErrPermanent` ya clasifica como permanente → el documento queda «guardado en este
-- dispositivo», que es exactamente lo que el cliente ya muestra a una cuenta Free.
