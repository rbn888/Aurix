-- ============================================================================
-- AURIX-AFFILIATES-V1 · 0/3 · REGISTRO AUTORIZADO DE CÓDIGOS (lo empuja Founder)
-- public.affiliate_codes · public.affiliate_code_pushes
-- public.aurix_affiliate_codes_replace(uuid, timestamptz, text, jsonb)
-- ----------------------------------------------------------------------------
-- Apply ANTES que affiliate_attribution_1.sql (la captura y las visitas validan
-- contra esta tabla).  psql -v ON_ERROR_STOP=1 -f db/affiliate_codes_1.sql
-- Pareja: db/affiliate_codes_1_rollback.sql      *** NO APLICADO DESDE EL REPO ***
--
-- Founder es la verdad de qué códigos existen (contrato aurix.affiliate-control.v1,
-- POST /api/control/affiliate-codes). Aurix guarda la ÚLTIMA foto completa:
--   · `codes.replace` = upsert de todo lo recibido; lo que ya se conocía y no
--     viene pasa a 'retirado' sin intervalos activos. Nunca se borra un código:
--     una atribución antigua tiene que poder seguir explicándose.
--   · Una sola transacción, serializada con un advisory lock.
--   · Auditoría por actionId: repetir el MISMO actionId devuelve lo guardado con
--     applied=false (y si el contenido no coincide, 'conflict'). `applied` es
--     false también cuando la foto no cambia nada (no-op legítimo).
--   · Las fechas se guardan como timestamptz y los intervalos tal como llegan
--     (ISO UTC de `toISOString()`, validado), de modo que la huella que calcula el
--     servidor sobre lo GUARDADO coincide byte a byte con la de Founder.
-- Sin datos personales. RLS deny, cero privilegios de cliente, escritor sólo
-- service_role.
-- ============================================================================

begin;

-- ISO UTC exacto de `Date.prototype.toISOString()`.
create or replace function public.aurix_iso_utc_ok(p text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$', false);
$$;

-- Intervalos: array (≤ 200) de {from, to|null}, from ≤ to.
create or replace function public.aurix_affiliate_intervals_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 200
    and not exists (
      select 1 from jsonb_array_elements(p) i
       where jsonb_typeof(i) <> 'object'
          or (select count(*) from jsonb_object_keys(i)) <> 2
          or not (i ? 'from') or not (i ? 'to')
          or not public.aurix_iso_utc_ok(i ->> 'from')
          or (jsonb_typeof(i -> 'to') <> 'null' and not public.aurix_iso_utc_ok(i ->> 'to'))
          or (jsonb_typeof(i -> 'to') <> 'null' and (i ->> 'to') < (i ->> 'from'))
    ), false);
$$;

revoke all on function public.aurix_iso_utc_ok(text) from public, anon, authenticated;
revoke all on function public.aurix_affiliate_intervals_ok(jsonb) from public, anon, authenticated;

create table if not exists public.affiliate_codes (
  code             text        primary key,
  campaign_id      text        not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text        not null,
  active_intervals jsonb       not null default '[]'::jsonb,
  last_action_id   uuid,
  updated_at       timestamptz not null default now(),
  constraint affiliate_codes_code_chk      check (code ~ '^[1-9][0-9]{5}$'),
  constraint affiliate_codes_campaign_chk  check (length(campaign_id) between 1 and 120),
  constraint affiliate_codes_window_chk    check (starts_at <= ends_at),
  constraint affiliate_codes_status_chk
    check (status in ('pendiente','activa','pausada','bloqueada','retirado')),
  constraint affiliate_codes_intervals_chk check (public.aurix_affiliate_intervals_ok(active_intervals))
);

create table if not exists public.affiliate_code_pushes (
  action_id     uuid        primary key,
  received_at   timestamptz not null default now(),
  issued_at     timestamptz,
  registry_hash text        not null,
  count         integer     not null,
  applied       boolean     not null,
  constraint affiliate_code_pushes_hash_chk check (registry_hash ~ '^[0-9a-f]{64}$')
);

alter table public.affiliate_codes       enable row level security;
alter table public.affiliate_code_pushes enable row level security;
drop policy if exists affiliate_codes_no_client on public.affiliate_codes;
create policy affiliate_codes_no_client on public.affiliate_codes
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists affiliate_code_pushes_no_client on public.affiliate_code_pushes;
create policy affiliate_code_pushes_no_client on public.affiliate_code_pushes
  as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on public.affiliate_codes       from anon, authenticated;
revoke all on public.affiliate_code_pushes from anon, authenticated;

-- Lo GUARDADO (sin retirados), en la forma exacta del contrato y ordenado por
-- código: es la entrada de `canonicalRegistry()` en el servidor.
create or replace function public.aurix_affiliate_registry_rows()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code',            c.code,
           'campaignId',      c.campaign_id,
           'startsAt',        to_char(c.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'endsAt',          to_char(c.ends_at   at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'status',          c.status,
           'activeIntervals', c.active_intervals
         ) order by c.code collate "C"), '[]'::jsonb)
    from public.affiliate_codes c
   where c.status <> 'retirado';
$$;

revoke all     on function public.aurix_affiliate_registry_rows() from public, anon, authenticated;
grant  execute on function public.aurix_affiliate_registry_rows() to service_role;

create or replace function public.aurix_affiliate_codes_replace(
  p_action_id     uuid,
  p_issued_at     timestamptz,
  p_registry_hash text,
  p_codes         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev    public.affiliate_code_pushes;
  v_n       int;
  v_up      int := 0;
  v_ret     int := 0;
  v_applied boolean;
begin
  if p_action_id is null or p_registry_hash is null or p_registry_hash !~ '^[0-9a-f]{64}$'
     or p_codes is null or jsonb_typeof(p_codes) <> 'array' then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  v_n := jsonb_array_length(p_codes);
  if v_n > 1000 then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtext('aurix_affiliate_codes_replace'));

  select * into v_prev from public.affiliate_code_pushes where action_id = p_action_id;
  if v_prev.action_id is not null then
    if v_prev.registry_hash <> p_registry_hash then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    return jsonb_build_object('outcome', 'replay', 'applied', false,
                              'at', v_prev.received_at,
                              'rows', public.aurix_affiliate_registry_rows());
  end if;

  -- Forma de cada entrada (el handler ya validó; esto es la última barrera).
  if exists (
    select 1 from jsonb_array_elements(p_codes) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'code', '') !~ '^[1-9][0-9]{5}$'
        or length(coalesce(e ->> 'campaignId', '')) not between 1 and 120
        or not public.aurix_iso_utc_ok(e ->> 'startsAt')
        or not public.aurix_iso_utc_ok(e ->> 'endsAt')
        or (e ->> 'startsAt') > (e ->> 'endsAt')
        or coalesce(e ->> 'status', '') not in ('pendiente','activa','pausada','bloqueada')
        or not public.aurix_affiliate_intervals_ok(e -> 'activeIntervals')
  ) or (select count(distinct e ->> 'code') from jsonb_array_elements(p_codes) e) <> v_n then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  insert into public.affiliate_codes as c
    (code, campaign_id, starts_at, ends_at, status, active_intervals, last_action_id, updated_at)
  select e ->> 'code', e ->> 'campaignId', (e ->> 'startsAt')::timestamptz, (e ->> 'endsAt')::timestamptz,
         e ->> 'status', e -> 'activeIntervals', p_action_id, now()
    from jsonb_array_elements(p_codes) e
  on conflict (code) do update set
    campaign_id      = excluded.campaign_id,
    starts_at        = excluded.starts_at,
    ends_at          = excluded.ends_at,
    status           = excluded.status,
    active_intervals = excluded.active_intervals,
    last_action_id   = excluded.last_action_id,
    updated_at       = now()
  where (c.campaign_id, c.starts_at, c.ends_at, c.status, c.active_intervals)
        is distinct from
        (excluded.campaign_id, excluded.starts_at, excluded.ends_at, excluded.status, excluded.active_intervals);
  get diagnostics v_up = row_count;

  -- Lo que Founder ya no declara se RETIRA (no se borra).
  update public.affiliate_codes c
     set status = 'retirado', active_intervals = '[]'::jsonb,
         last_action_id = p_action_id, updated_at = now()
   where c.status <> 'retirado'
     and not exists (select 1 from jsonb_array_elements(p_codes) e where e ->> 'code' = c.code);
  get diagnostics v_ret = row_count;

  v_applied := (v_up + v_ret) > 0;
  insert into public.affiliate_code_pushes (action_id, issued_at, registry_hash, count, applied)
  values (p_action_id, p_issued_at, p_registry_hash, v_n, v_applied);

  return jsonb_build_object('outcome', 'stored', 'applied', v_applied, 'at', now(),
                            'rows', public.aurix_affiliate_registry_rows());
end;
$$;

revoke all     on function public.aurix_affiliate_codes_replace(uuid, timestamptz, text, jsonb) from public, anon, authenticated;
grant  execute on function public.aurix_affiliate_codes_replace(uuid, timestamptz, text, jsonb) to service_role;

do $$
declare
  v_f oid := to_regprocedure('public.aurix_affiliate_codes_replace(uuid,timestamptz,text,jsonb)')::oid;
  v_n int;
begin
  if to_regclass('public.affiliate_codes') is null or to_regclass('public.affiliate_code_pushes') is null or v_f is null then
    raise exception 'AFFILIATE-CODES APPLY FAIL: falta un objeto';
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('affiliate_codes','affiliate_code_pushes')
     and grantee in ('anon','authenticated');
  if v_n <> 0 then
    raise exception 'AFFILIATE-CODES APPLY FAIL: % privilegios de cliente', v_n;
  end if;
  if has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute')
     or not has_function_privilege('service_role', v_f, 'execute')
     or not (select prosecdef from pg_proc where oid = v_f) then
    raise exception 'AFFILIATE-CODES APPLY FAIL: el escritor debe ser definer y sólo de service_role';
  end if;
  raise notice 'AFFILIATE-CODES APPLY VERIFIED';
end $$;

commit;
