-- ============================================================================
-- AURIX · M.04 PRODUCCIÓN · PASO 1 — SNAPSHOT PRE DE public.subscriptions
-- ----------------------------------------------------------------------------
-- Pegar TODO en el SQL Editor de Supabase y ejecutar de una vez.
--
-- Es db/m04_rehearsal/02_pre_capture.sql, ya certificado en el rehearsal, con
-- tres cambios y ninguno más:
--   1. GUARD INVERTIDO. El del rehearsal se niega a correr si existe
--      public.user_portfolios. Éste se niega si NO existe: cada fichero apunta
--      a un único destino y no puede confundirse con el otro.
--   2. No exige el gate DIAGNOSE de un run de rehearsal (no hay). Lo emite él
--      mismo a partir de una PRECONDICIÓN de 5 líneas — que no es repetir el
--      diagnóstico, es comprobar que el estado no ha cambiado entre tu consulta
--      manual y esta captura. Capturar un PRE sobre un M.04 a medias sería
--      capturar basura y llamarla evidencia.
--   3. Cierra el esquema al cliente (revoke), porque un espejo de la tabla
--      comercial NO puede quedar legible por anon/authenticated.
--
-- EL NOMBRE DEL ESQUEMA SIGUE SIENDO m04_rehearsal A PROPÓSITO. Es feo en
-- producción, y aun así es la decisión correcta: el rollback y el restore ya
-- certificados lo referencian por nombre. Renombrarlo obligaría a editar dos
-- artefactos validados para no ganar nada funcional.
--
-- NO toca ninguna fila de negocio: sólo LEE public.subscriptions y escribe en
-- su propio esquema.
-- ============================================================================

-- ── GUARD · esto TIENE que ser la BD de Aurix ────────────────────────────────
do $$
begin
  if to_regclass('public.user_portfolios') is null then
    raise exception
      'GUARD DE PRODUCCIÓN: no existe public.user_portfolios ⇒ ésta NO es la BD de '
      'Aurix. Para un entorno de ensayo usa db/m04_rehearsal/02_pre_capture.sql.';
  end if;
  if to_regclass('public.subscriptions') is null then
    raise exception 'PRECONDICIÓN: no existe public.subscriptions (B1 no está aplicado).';
  end if;
end $$;

create schema if not exists m04_rehearsal;

-- Un espejo de la tabla comercial no puede ser legible por el cliente. El
-- esquema tampoco está expuesto en PostgREST, pero las dos cosas juntas son la
-- diferencia entre "no alcanzable hoy" y "no concedido".
revoke all on schema m04_rehearsal from public;
revoke all on schema m04_rehearsal from anon, authenticated;

create table if not exists m04_rehearsal.run (
  singleton  boolean     not null primary key default true
                         constraint run_singleton_chk check (singleton),
  run_id     uuid        not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  db_name    text        not null default current_database()
);

create table if not exists m04_rehearsal.gates (
  gate        text        not null primary key,
  run_id      uuid        not null,
  verdict     text        not null
                          constraint gates_verdict_chk
                          check (verdict in ('PASS','FAIL','BLOCKED')),
  detail      text,
  recorded_at timestamptz not null default now()
);

-- ── HUELLAS · idénticas a las certificadas, sin una coma de diferencia ───────
create or replace function m04_rehearsal.fp_of(p_rel regclass)
returns table (row_count bigint, data_fp text)
language plpgsql
set timezone = 'UTC'      -- jsonb renderiza timestamptz según el TimeZone de la
                          -- sesión; sin fijarlo, la MISMA fila da dos huellas.
as $$
begin
  return query execute format(
    'select count(*)::bigint,
            coalesce(md5(string_agg(h, chr(10) order by h)), ''EMPTY'')
       from (select md5(to_jsonb(s)::text) as h from %s s) q', p_rel);
end;
$$;

create or replace function m04_rehearsal.fp_data()
returns table (row_count bigint, data_fp text)
language sql
as $$
  select * from m04_rehearsal.fp_of('public.subscriptions'::regclass);
$$;

create or replace function m04_rehearsal.fp_struct()
returns text
language sql
stable
as $$
  with parts as (
    select 'col:' || string_agg(
             c.ordinal_position || ':' || c.column_name || ':' || c.data_type || ':' ||
             c.is_nullable || ':' || coalesce(c.column_default, '-'),
             '|' order by c.ordinal_position) as p
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'subscriptions'
    union all
    select 'chk:' || coalesce(string_agg(con.conname || ':' || pg_get_constraintdef(con.oid),
                                         '|' order by con.conname), '-')
      from pg_constraint con
     where con.conrelid = 'public.subscriptions'::regclass
    union all
    select 'idx:' || coalesce(string_agg(i.indexname || ':' || i.indexdef,
                                         '|' order by i.indexname), '-')
      from pg_indexes i
     where i.schemaname = 'public' and i.tablename = 'subscriptions'
    union all
    -- tgenabled es "char" de 1 byte: `text || "char"` es AMBIGUO y sin el cast
    -- esta función no se puede ni crear (lo destapó el rehearsal).
    select 'trg:' || coalesce(string_agg(t.tgname || ':' || t.tgenabled::text,
                                         '|' order by t.tgname), '-')
      from pg_trigger t
     where t.tgrelid = 'public.subscriptions'::regclass and not t.tgisinternal
    union all
    select 'pol:' || coalesce(string_agg(pol.polname || ':' || pol.polpermissive::text,
                                         '|' order by pol.polname), '-')
      from pg_policy pol
     where pol.polrelid = 'public.subscriptions'::regclass
    union all
    select 'rls:' || (select relrowsecurity::text
                        from pg_class where oid = 'public.subscriptions'::regclass)
    union all
    select 'grn:' || coalesce(string_agg(g.grantee || ':' || g.privilege_type,
                                         '|' order by g.grantee, g.privilege_type), '-')
      from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'subscriptions'
       and g.grantee in ('anon', 'authenticated')
  )
  select md5(string_agg(p, chr(10) order by p)) from parts;
$$;


begin;

-- ── PRECONDICIÓN · el estado sigue siendo LIMPIO ────────────────────────────
-- NO es el diagnóstico otra vez: son cinco to_reg* y un recuento de restos. Su
-- único trabajo es garantizar que nada cambió entre tu consulta manual y esta
-- captura. Si algo apareció en medio, este PRE no serviría de nada.
do $$
declare
  v_restos int;
  v_pres   int;
begin
  v_pres := (to_regclass('public.billing_customers') is not null)::int
          + (to_regclass('public.billing_prices')    is not null)::int
          + (to_regclass('public.billing_events')    is not null)::int
          + (to_regprocedure('public.aurix_billing_link_customer(uuid,text,text)') is not null)::int
          + (to_regprocedure('public.aurix_billing_apply_event(text,text,text,text,'
              'text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,'
              'timestamptz,timestamptz)') is not null)::int;

  select count(*) into v_restos from (
    select 1 from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relname like 'billing\_%'
       and c.relkind in ('r','p','v','m','f')
       and c.relname not in ('billing_customers','billing_prices','billing_events')
    union all
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'aurix_billing%'
  ) x;

  if v_pres <> 0 or v_restos <> 0 then
    raise exception
      'STOP: el estado ya NO es LIMPIO (objetos M.04 presentes=%, restos=%). Ha '
      'cambiado desde el diagnóstico manual. No se captura PRE y no se aplica nada: '
      'volver a lanzar db/m04_prod_diagnose_readonly.sql y decidir con su salida.',
      v_pres, v_restos;
  end if;

  -- Las 12 CHECK de B1 son la red que hace fail-closed al writer. Sin ellas,
  -- M.04 escribiría sobre una tabla más permisiva que la que se certificó.
  select count(*) into v_restos from pg_constraint
   where conrelid = 'public.subscriptions'::regclass and contype = 'c';
  if v_restos <> 12 then
    raise exception 'STOP: public.subscriptions tiene % CHECK y B1 define 12.', v_restos;
  end if;
end $$;

-- ── EL RUN ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('m04_rehearsal.subscriptions_pre') is not null then
    raise exception
      'YA EXISTE m04_rehearsal.subscriptions_pre. Un PRE pisado por otro posterior '
      'al APPLY haría que toda verificación pasara siempre. Si de verdad quieres '
      'recapturar, bórralo a mano y de forma deliberada.';
  end if;
end $$;

delete from m04_rehearsal.gates;
delete from m04_rehearsal.run;
insert into m04_rehearsal.run default values;

-- El diagnóstico queda registrado con lo que ACABA de comprobarse arriba, no con
-- lo que recuerde nadie.
insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
select 'DIAGNOSE', run_id, 'PASS',
       'clase=LIMPIO objetos_presentes=0/5 forma_incorrecta=0 restos=0 '
       '(precondición verificada en vivo por 01_pre_capture_prod)'
  from m04_rehearsal.run;

-- ── ESPEJO VERBATIM ─────────────────────────────────────────────────────────
create table m04_rehearsal.subscriptions_pre as
  select * from public.subscriptions;

revoke all on m04_rehearsal.subscriptions_pre from public;
revoke all on m04_rehearsal.subscriptions_pre from anon, authenticated;

-- ── MANIFIESTO ──────────────────────────────────────────────────────────────
create table if not exists m04_rehearsal.manifest (
  fase        text        not null primary key,
  run_id      uuid        not null,
  captured_at timestamptz not null default now(),
  row_count   bigint      not null,
  data_fp     text        not null,
  struct_fp   text        not null,
  db_name     text        not null,
  server_ver  text        not null
);

revoke all on m04_rehearsal.manifest, m04_rehearsal.gates, m04_rehearsal.run
  from public, anon, authenticated;

delete from m04_rehearsal.manifest
 where run_id is distinct from (select run_id from m04_rehearsal.run);

insert into m04_rehearsal.manifest
  (fase, run_id, row_count, data_fp, struct_fp, db_name, server_ver)
select 'PRE', (select run_id from m04_rehearsal.run),
       d.row_count, d.data_fp, m04_rehearsal.fp_struct(),
       current_database(), version()
  from m04_rehearsal.fp_data() d
on conflict (fase) do update
  set run_id = excluded.run_id, captured_at = now(), row_count = excluded.row_count,
      data_fp = excluded.data_fp, struct_fp = excluded.struct_fp;

-- ── COHERENCIA DE LA PROPIA CAPTURA ─────────────────────────────────────────
-- Se comprueba la huella del ESPEJO, no sólo su recuento: un espejo con las
-- filas correctas y los valores mal pasaría un recuento y arruinaría el restore.
-- Si no cuadra NO se hace commit: mejor sin captura que con una captura falsa.
do $$
declare
  v_live int; v_m record; v_mirror record;
begin
  select count(*) into v_live from public.subscriptions;
  select * into v_m from m04_rehearsal.manifest where fase = 'PRE';
  select * into v_mirror from m04_rehearsal.fp_of('m04_rehearsal.subscriptions_pre'::regclass);

  if v_live <> v_m.row_count or v_mirror.row_count <> v_m.row_count then
    raise exception 'CAPTURA INCOHERENTE: live=% espejo=% manifiesto=%',
                    v_live, v_mirror.row_count, v_m.row_count;
  end if;
  if v_mirror.data_fp <> v_m.data_fp then
    raise exception 'CAPTURA INCOHERENTE: huella del espejo % ≠ manifiesto %',
                    v_mirror.data_fp, v_m.data_fp;
  end if;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('PRE_CAPTURE', v_m.run_id, 'PASS',
          format('filas=%s data_fp=%s struct_fp=%s',
                 v_m.row_count, v_m.data_fp, v_m.struct_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();
end $$;

commit;

-- ── ANOTA ESTOS TRES VALORES FUERA DE LA BASE DE DATOS ──────────────────────
select fase, run_id, captured_at, row_count, data_fp, struct_fp, db_name
  from m04_rehearsal.manifest where fase = 'PRE';
