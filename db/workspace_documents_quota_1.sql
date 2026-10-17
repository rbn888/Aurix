-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING V3 · WORKSPACE · CUOTAS DE ALMACENAMIENTO (P2-18)
-- ════════════════════════════════════════════════════════════════════════════
-- NO APLICADO DESDE EL REPO. Lo aplica el founder en el SQL Editor, tras ejecutar la
-- comprobación de solo lectura del final y confirmar que ningún usuario la supera.
-- Rollback: db/workspace_documents_quota_1_rollback.sql
--
-- PROBLEMA. `workspace_documents` sólo exigía `auth.uid() = user_id`: cualquier cuenta
-- (crearla cuesta un OTP) podía escribir documentos de tamaño y número ilimitados. En plan
-- Free de Supabase, superar el disco pone el proyecto en SOLO LECTURA para TODOS.
--
-- LÍMITES (por cuenta, sólo sobre documentos VIVOS):
--   · 512 KB por documento (texto JSON del cuerpo)       — el cliente corta antes, a 460 KB
--   · 200 documentos vivos                               — plantillas + preferencias de superficie
--   · 5 MB entre todos sus documentos vivos
--
-- LO QUE NO SE TOCA, A PROPÓSITO:
--   · LEER y EXPORTAR: los límites sólo actúan al escribir.
--   · BORRAR: el borrado es un upsert con `deleted_at` (tombstone). Una fila con `deleted_at`
--     no cuenta ni se mide, así que siempre se puede borrar, incluso un documento antiguo que
--     ya superase el límite.
--   · DATOS EXISTENTES: la CHECK es NOT VALID (no se valida contra filas antiguas) y el
--     trigger sólo actúa en escrituras nuevas. Nada se borra ni se reescribe.
--   · Premium: esto es una cuota de almacenamiento, igual para todos. La frontera comercial
--     vive en db/workspace_documents_premium_gate_1.sql (decisión del founder).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- 1 · Tamaño por documento. NOT VALID: no se revalidan filas existentes.
alter table public.workspace_documents
  drop constraint if exists workspace_documents_body_size;
alter table public.workspace_documents
  add constraint workspace_documents_body_size
  check (deleted_at is not null or octet_length(body::text) <= 524288) not valid;

-- 2 · Número y volumen por cuenta. BEFORE INSERT también se dispara en el upsert
-- (INSERT … ON CONFLICT DO UPDATE) que usa el cliente, así que el recuento EXCLUYE el propio
-- doc_id: reescribir un documento existente nunca cuenta como uno nuevo.
create or replace function public.aurix_workspace_documents_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count int;
  v_bytes bigint;
begin
  if new.deleted_at is not null then
    return new;                                   -- borrar siempre está permitido
  end if;

  select count(*), coalesce(sum(octet_length(d.body::text)), 0)
    into v_count, v_bytes
    from public.workspace_documents d
   where d.user_id = new.user_id
     and d.doc_id <> new.doc_id
     and d.deleted_at is null;

  if v_count >= 200 then
    raise exception 'workspace_quota_documents' using errcode = 'check_violation';
  end if;
  if v_bytes + octet_length(new.body::text) > 5242880 then
    raise exception 'workspace_quota_bytes' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.aurix_workspace_documents_quota() from public, anon, authenticated;

drop trigger if exists workspace_documents_quota on public.workspace_documents;
create trigger workspace_documents_quota
  before insert or update of body, deleted_at on public.workspace_documents
  for each row execute function public.aurix_workspace_documents_quota();

-- Autoverificación: si algo no quedó, la transacción no commitea.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspace_documents_body_size') then
    raise exception 'quota: falta la CHECK de tamaño';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'workspace_documents_quota' and not tgisinternal) then
    raise exception 'quota: falta el trigger';
  end if;
end $$;

commit;

-- ── COMPROBACIÓN PREVIA (SOLO LECTURA, agregados sin identificar a nadie) ───────
-- Ejecutar ANTES de aplicar. Si alguna cifra supera un límite, NO aplicar y avisar:
-- ese usuario no podría guardar nuevos documentos hasta borrar alguno.
--
-- select max(n) as max_docs_vivos_por_usuario,
--        max(bytes) as max_bytes_vivos_por_usuario,
--        max(max_doc) as max_bytes_un_documento
--   from (select user_id, count(*) as n,
--                sum(octet_length(body::text)) as bytes,
--                max(octet_length(body::text)) as max_doc
--           from public.workspace_documents
--          where deleted_at is null
--          group by user_id) t;
