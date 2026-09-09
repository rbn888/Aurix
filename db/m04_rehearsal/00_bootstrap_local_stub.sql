-- ============================================================================
-- M.04 ENSAYO · PASO 0 — BOOTSTRAP DEL ENTORNO DESECHABLE (Postgres LOCAL)
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. EL ENTORNO NO ESTÁ CREADO. ***
--
-- Crea lo MÍNIMO de Supabase que B1/B2/M.04 necesitan, y nada más. No es un
-- clon de Supabase y no pretende serlo: lo que se ensaya aquí es el APPLY, el
-- ROLLBACK y la RESTAURACIÓN a nivel de Postgres, que es donde vive el riesgo
-- de este bloque. Lo que este entorno NO puede probar está declarado en
-- docs/AURIX-M04-REHEARSAL-PLAN.md §7.
--
-- Qué hace falta y por qué exactamente eso:
--   · Roles anon / authenticated / service_role — los GRANT y los REVOKE de
--     B1 y M.04 los nombran; sin ellos el APPLY falla al primer grant.
--   · auth.users — las tres tablas con user_id tienen FK contra ella.
--   · auth.uid() — la lee aurix_entitlements() de B2. Es la definición estándar
--     de Supabase, copiada tal cual para no cambiar el comportamiento medido.
--
-- Qué NO se crea A PROPÓSITO:
--   · public.user_portfolios. Es la prueba POSITIVA de que este entorno no es
--     Aurix, y todos los scripts del ensayo se niegan a correr si la encuentran.
--     Crearla aquí desarmaría el guard de todos ellos.
-- ============================================================================

-- ── ROLES ───────────────────────────────────────────────────────────────────
-- `nologin`: no hacen falta para nada más que para ser el sujeto de un GRANT, y
-- un rol sin login no puede conectarse ni por error.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- ── STUB DE auth ────────────────────────────────────────────────────────────
create schema if not exists auth;

-- Sólo las columnas que las FK y los fixtures usan. Un stub más ancho daría la
-- falsa impresión de que este entorno reproduce el auth de Supabase.
create table if not exists auth.users (
  id         uuid        primary key default gen_random_uuid(),
  email      text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ── AFIRMACIÓN DE QUE ESTO NO ES PRODUCCIÓN ─────────────────────────────────
-- Se comprueba aquí, en el primer fichero que se ejecuta, y se vuelve a
-- comprobar en cada paso posterior. El servidor tiene que ser local: si
-- inet_server_addr() devuelve algo que no es loopback, la conexión ha salido de
-- la máquina y este entorno ya no es "aislado".
do $$
declare
  v_addr text := coalesce(host(inet_server_addr()), 'unix-socket');
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD: public.user_portfolios existe ⇒ BD de Aurix. Abortado.';
  end if;
  if v_addr not in ('unix-socket', '127.0.0.1', '::1', 'localhost') then
    raise exception 'GUARD: el servidor no es local (%). El ensayo exige un Postgres '
                    'desechable en loopback.', v_addr;
  end if;
  raise notice 'BOOTSTRAP OK · db=% · servidor=% · roles y stub de auth listos',
               current_database(), v_addr;
end $$;

-- ============================================================================
-- ORDEN DE CARGA A PARTIR DE AQUÍ (ver el plan §1 para las dependencias)
-- ============================================================================
--   psql -1 -v ON_ERROR_STOP=1 -f db/monetization_commercial_truth_1.sql
--   psql -1 -v ON_ERROR_STOP=1 -f db/monetization_entitlement_resolver_1.sql
--   psql -1 -v ON_ERROR_STOP=1 -f db/monetization_catalog_preview_key_1.sql
--   -- y ya con el entorno en su estado "pre-M.04", el DIAGNÓSTICO manda:
--   psql    -v ON_ERROR_STOP=1 -f db/m04_rehearsal/01_diagnose_m04_state.sql
--
-- REGLA DE INVOCACIÓN, para todo el ensayo: los ficheros que abren su propia
-- transacción (01, 02, 05, 06, el APPLY y el ROLLBACK) se ejecutan SIN `-1`;
-- los que sólo son bloques DO de lectura/aserción (03, 04, 07) pueden usarlo.
-- Anidar un BEGIN sobre otro rompe el significado de sus commit y rollback.
-- ============================================================================
