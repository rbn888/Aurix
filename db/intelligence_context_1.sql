-- ============================================================================
-- AURIX · INTELLIGENCE CONTEXT · CROSS-DEVICE  ·  *** NOT YET APPLIED ***
-- ----------------------------------------------------------------------------
-- (La marca `NOT YET APPLIED` es la convención del repo para «no se aplica desde
--  git», no para «no está en la base de datos». La llevan también ficheros que SÍ
--  están en producción.)
--
-- POR QUÉ EXISTE: el contexto que el usuario le enseña a Aurix Intelligence
-- (intención de una concentración, horizonte, objetivo, si su patrimonio está
-- completo) vive hoy en localStorage. Eso significa que Aurix conoce al usuario en
-- el portátil y NO lo conoce en el móvil, y que un logout/login en otro navegador
-- lo olvida. Para una superficie cuyo valor es «Aurix me conoce», eso no es
-- aceptable.
--
-- QUÉ NO ES: no es portfolio, no es verdad financiera y no es Workspace Sync. Es
-- UNA FILA POR USUARIO con contexto de presentación. Ningún importe, ninguna
-- posición, ningún precio. Si esta tabla no existe, la app sigue funcionando
-- exactamente como hoy (local), porque el cliente lo detecta y cae a local.
--
-- ADITIVA E IDEMPOTENTE: `create table if not exists`, `create policy` precedido de
-- `drop policy if exists`. No borra, no renombra y no toca ninguna tabla existente.
-- ROLLBACK al final, comentado.
-- ============================================================================

create table if not exists public.intelligence_context (
  user_id        uuid        primary key references auth.users(id) on delete cascade,
  schema_version smallint    not null default 1,
  -- Contexto estructurado: `fields`, `asked`, `declined`, `pausedAt`, `memory`.
  -- JSONB y no columnas porque el catálogo de campos es una decisión de PRODUCTO y
  -- añadir uno no puede exigir una migración. El cliente ya valida contra su
  -- catálogo cerrado al leer, así que un payload con basura no inyecta nada.
  payload        jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  -- Cota de tamaño: es contexto, no un almacén. Evita que un cliente roto
  -- convierta esta fila en un vertedero.
  constraint intelligence_context_payload_size check (pg_column_size(payload) < 64 * 1024)
);

comment on table public.intelligence_context is
  'AURIX INTELLIGENCE · contexto de presentación por usuario (cross-device). NO contiene verdad financiera.';

alter table public.intelligence_context enable row level security;

-- OWNERSHIP: cada usuario ve y escribe EXCLUSIVAMENTE su fila. No hay política de
-- lectura cruzada, ni de servicio, ni de anon: el aislamiento A/B lo garantiza la
-- base de datos y no el cliente.
drop policy if exists intelligence_context_own_select on public.intelligence_context;
create policy intelligence_context_own_select
  on public.intelligence_context for select
  using (auth.uid() = user_id);

drop policy if exists intelligence_context_own_insert on public.intelligence_context;
create policy intelligence_context_own_insert
  on public.intelligence_context for insert
  with check (auth.uid() = user_id);

drop policy if exists intelligence_context_own_update on public.intelligence_context;
create policy intelligence_context_own_update
  on public.intelligence_context for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sin DELETE por política: el borrado va por `on delete cascade` de auth.users, así
-- que una cuenta que se borra se lleva su contexto y nadie más puede borrarlo.

grant select, insert, update on public.intelligence_context to authenticated;

-- `updated_at` lo pone el SERVIDOR, no el cliente: es el árbitro del LWW entre dos
-- dispositivos, y un reloj de cliente desajustado no puede ganarle a otro.
create or replace function public.intelligence_context_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists intelligence_context_touch_t on public.intelligence_context;
create trigger intelligence_context_touch_t
  before insert or update on public.intelligence_context
  for each row execute function public.intelligence_context_touch();

-- ── VERIFICACIÓN · ejecutar APARTE, nunca en la misma transacción ───────────
-- El editor de Supabase ejecuta el script como UNA transacción, así que un error
-- en la verificación revierte también el DDL. Se espera 1 / 3 / 1.
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='intelligence_context';
--   select count(*) from pg_policies
--    where schemaname='public' and tablename='intelligence_context';
--   select count(*) from information_schema.role_table_grants
--    where table_name='intelligence_context' and grantee='authenticated' and privilege_type='SELECT';
-- Sonda externa (publishable key): `42501 permission denied` = la tabla EXISTE.
--   PGRST205 = no existe o no está expuesta.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   drop trigger if exists intelligence_context_touch_t on public.intelligence_context;
--   drop function if exists public.intelligence_context_touch();
--   drop table if exists public.intelligence_context;
