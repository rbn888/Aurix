-- ============================================================================
-- M.04 ENSAYO · PASO 2 — CAPTURA PRE DE public.subscriptions
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
-- psql -v ON_ERROR_STOP=1 -f db/m04_rehearsal/02_pre_capture.sql
--
--   REGLA DE INVOCACIÓN: este fichero abre y cierra su PROPIA transacción, así
--   que se ejecuta SIN `-1`. Añadir `-1` anida un BEGIN sobre otro y hace que el
--   commit/rollback interno y el de psql dejen de significar lo mismo.
--
-- REQUIERE el paso 1 con veredicto LIMPIO. Es la primera puerta de la cadena:
-- sin `gate DIAGNOSE = PASS` este fichero se niega a capturar, porque una
-- captura PRE tomada sobre un estado PARCIAL o COMPLETO no es un "antes de
-- M.04" — y sería la evidencia con la que después se autorizaría el rollback.
--
-- Captura las cuatro cosas que el encargo exige poder demostrar después:
--   · ESTRUCTURA relevante (columnas, constraints, índices, triggers, políticas,
--     grants) — porque el VERIFY no puede ASUMIR que M.04 no alteró la forma de
--     la tabla; tiene que medirlo.
--   · FILAS y VALORES (espejo verbatim).
--   · NÚMERO DE FILAS.
--   · HUELLA DETERMINISTA (md5 de datos y md5 de estructura).
--
-- ----------------------------------------------------------------------------
-- POR QUÉ LA HUELLA ES ASÍ Y NO DE OTRA FORMA
-- ----------------------------------------------------------------------------
--   to_jsonb(fila) en vez de una lista de columnas escrita a mano: una lista a
--   mano IGNORA en silencio una columna añadida después, y esa columna es
--   exactamente donde se esconderá la diferencia que este ensayo busca. jsonb
--   además ordena sus claves de forma canónica, así que su texto es estable.
--
--   `set timezone = 'UTC'`: jsonb renderiza timestamptz aplicando el TimeZone
--   de la sesión. Sin fijarlo, la MISMA fila da dos huellas distintas en dos
--   sesiones y el ensayo produce un FAIL inventado. Es el único ajuste del que
--   depende el determinismo.
--
--   `order by` sobre la huella de fila, no sobre user_id ni sobre el orden
--   físico: el orden físico cambia con un UPDATE (fila nueva versión al final)
--   y eso NO es una diferencia de estado.
--
--   `fp_of(regclass)` toma la relación como PARÁMETRO en vez de ir clavada a
--   `public.subscriptions`. Es lo que permite recalcular la huella del ESPEJO
--   más tarde, y ésa es la comprobación que convierte la barrera del rollback
--   en un hecho verificable: no basta con que el espejo exista, tiene que
--   seguir valiendo la huella que se registró.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EL ESPEJO EN LA MISMA BD **NO** ES LA AUTORIDAD
-- ----------------------------------------------------------------------------
-- `m04_rehearsal.subscriptions_pre` vive en el mismo dominio de fallo que el
-- original: el mismo TRUNCATE equivocado, el mismo DROP SCHEMA, el mismo
-- `docker volume rm` se lleva las dos, y la misma sesión superusuario que puede
-- corromper `subscriptions` puede corromper el espejo sin dejar rastro. Un
-- espejo no puede demostrar que no fue editado.
--
-- Así que el espejo se queda SÓLO como instrumento de la comparación SQL en
-- ambos sentidos, y la AUTORIDAD del PRE es un volcado EXTERNO a la base de
-- datos, con su sha256 anotado ANTES de aplicar M.04:
--
--   mkdir -p evidence/m04
--   pg_dump "$REHEARSAL_DB_URL" --schema-only --no-owner --no-privileges \
--           --table=public.subscriptions  > evidence/m04/subscriptions_PRE.schema.sql
--   pg_dump "$REHEARSAL_DB_URL" --data-only --no-owner --no-privileges \
--           --table=public.subscriptions  > evidence/m04/subscriptions_PRE.data.sql
--   psql "$REHEARSAL_DB_URL" -At \
--        -c "select * from m04_rehearsal.manifest" > evidence/m04/subscriptions_PRE.manifest.txt
--   shasum -a 256 evidence/m04/subscriptions_PRE.*  > evidence/m04/subscriptions_PRE.sha256
--
-- ($REHEARSAL_DB_URL apunta SIEMPRE a 127.0.0.1. No es una credencial de
--  Supabase y no debe serlo nunca — lo verifica el guard del paso 0.)
-- ============================================================================


-- ── GUARD DE ENTORNO ────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception
      'GUARD DE ENSAYO: public.user_portfolios EXISTE ⇒ esta es la BD de Aurix. '
      'Este fichero NO se ejecuta contra producción. Abortado.';
  end if;
  if to_regclass('public.subscriptions') is null then
    raise exception 'PRECONDICIÓN: no existe public.subscriptions. Aplica B1 antes.';
  end if;
end $$;


-- ── PUERTA DE ENTRADA · el estado inicial tiene que ser LIMPIO ──────────────
do $$
declare
  v_g record;
begin
  if to_regclass('m04_rehearsal.gates') is null then
    raise exception 'BLOCKED: no hay diagnóstico. Ejecuta 01_diagnose_m04_state.sql';
  end if;
  select * into v_g from m04_rehearsal.gates where gate = 'DIAGNOSE';
  if not found then
    raise exception 'BLOCKED: no hay gate DIAGNOSE. Ejecuta 01_diagnose_m04_state.sql';
  end if;
  if v_g.verdict <> 'PASS' then
    raise exception 'BLOCKED: DIAGNOSE=% (%). Sólo se captura el PRE sobre un estado '
                    'LIMPIO.', v_g.verdict, v_g.detail;
  end if;
  if v_g.run_id is distinct from (select run_id from m04_rehearsal.run) then
    raise exception 'BLOCKED: el gate DIAGNOSE es de otro run. Re-diagnostica.';
  end if;
end $$;


-- ── HUELLA DE DATOS · parametrizada por relación ────────────────────────────
create or replace function m04_rehearsal.fp_of(p_rel regclass)
returns table (row_count bigint, data_fp text)
language plpgsql
set timezone = 'UTC'          -- determinismo del render de timestamptz (ver cabecera)
as $$
begin
  return query execute format(
    'select count(*)::bigint,
            coalesce(md5(string_agg(h, chr(10) order by h)), ''EMPTY'')
       from (select md5(to_jsonb(s)::text) as h from %s s) q', p_rel);
end;
$$;

-- Azúcar para el caso de siempre. Un solo owner de la huella: si se cambiara el
-- método, se cambia en fp_of y todos los pasos siguen midiendo lo mismo.
create or replace function m04_rehearsal.fp_data()
returns table (row_count bigint, data_fp text)
language sql
as $$
  select * from m04_rehearsal.fp_of('public.subscriptions'::regclass);
$$;

-- ── HUELLA DE ESTRUCTURA ────────────────────────────────────────────────────
-- Columnas + CHECKs + índices + triggers + políticas + grants de anon/
-- authenticated. Si M.04 (o una reparación a mano durante el ensayo) alterase
-- la forma de la tabla, la igualdad de datos no lo detectaría y esta sí.
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
    -- tgenabled es de tipo "char" (1 byte), no text: sin el cast explícito
    -- `text || "char"` es ambiguo y Postgres se niega a resolver el operador.
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

-- ── ESPEJO VERBATIM ─────────────────────────────────────────────────────────
-- Se niega a sobrescribir una captura previa: una captura PRE pisada por otra
-- posterior al APPLY convertiría el ensayo en un PASS automático.
do $$
begin
  if to_regclass('m04_rehearsal.subscriptions_pre') is not null then
    raise exception
      'YA EXISTE m04_rehearsal.subscriptions_pre. Una captura PRE pisada por otra '
      'post-APPLY haría que el VERIFY pasara siempre. Borra el espejo a mano si de '
      'verdad quieres recapturar: drop table m04_rehearsal.subscriptions_pre;';
  end if;
end $$;

create table m04_rehearsal.subscriptions_pre as
  select * from public.subscriptions;

-- ── MANIFIESTO ──────────────────────────────────────────────────────────────
-- `run_id` es lo que ata la captura a ESTE ensayo. Sin él, el espejo de un
-- ensayo anterior podría autorizar el rollback de otro.
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

-- Un run NUEVO no hereda el manifiesto del anterior. Sin este DELETE, el
-- insert de 'PRE' chocaría con la PK dejada por un ensayo previo ya cerrado, y
-- el paso 2 fallaría por una razón que no tiene nada que ver con la captura.
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

-- ── AFIRMACIÓN DE COHERENCIA DE LA PROPIA CAPTURA ───────────────────────────
-- El espejo tiene que tener las mismas filas que la tabla en este instante, Y
-- la MISMA huella. Comprobar sólo el recuento dejaría pasar un espejo con las
-- filas correctas y los valores mal. Si no cuadra, no se hace commit: es mejor
-- no tener captura que tenerla mal, porque una captura mala se convierte
-- después en una restauración mala.
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
    raise exception 'CAPTURA INCOHERENTE: la huella del espejo (%) no es la del '
                    'manifiesto (%)', v_mirror.data_fp, v_m.data_fp;
  end if;

  insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
  values ('PRE_CAPTURE', v_m.run_id, 'PASS',
          format('filas=%s data_fp=%s struct_fp=%s',
                 v_m.row_count, v_m.data_fp, v_m.struct_fp))
  on conflict (gate) do update
    set run_id = excluded.run_id, verdict = excluded.verdict,
        detail = excluded.detail, recorded_at = now();

  raise notice 'PRE CAPTURADO · filas=% · data_fp=% · struct_fp=%',
               v_m.row_count, v_m.data_fp, v_m.struct_fp;
end $$;

commit;

-- Anotar en el parte de evidencia (y volcarlo a fichero, ver cabecera):
select fase, run_id, captured_at, row_count, data_fp, struct_fp, db_name
  from m04_rehearsal.manifest where fase = 'PRE';
