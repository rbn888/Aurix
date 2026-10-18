-- ════════════════════════════════════════════════════════════════════════════
-- AURIX-PREMIUM-ACCESS-V1 · accesos Premium gratuitos concedidos desde Founder
-- *** NO APLICADO. *** Requiere aprobación del fundador antes de producción.
-- Aplicar: psql -v ON_ERROR_STOP=1 -f db/premium_access_grants_1.sql
-- Revertir: db/premium_access_grants_1_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════
-- NO HAY MECANISMO NUEVO DE DERECHOS. La concesión es una fila por capacidad en
-- `entitlement_overrides` —la tabla de accesos NO comerciales que el resolver
-- único `aurix_entitlements()` ya suma con OR al plan, dentro de su ventana
-- `starts_at <= now() < expires_at`—. Por eso:
--   · Premium efectivo = suscripción pagada válida O concesión vigente, y lo
--     decide el mismo resolver de siempre, en servidor y con la hora del servidor.
--   · La caducidad no necesita cron: fuera de ventana la fila deja de contar,
--     aunque el usuario tenga la sesión abierta (Intelligence, el disparador de
--     Workspace y la función de chat consultan el resolver en cada uso).
--   · Revocar o caducar no toca `subscriptions`: si hay pago, sigue habiéndolo.
--   · No se escribe NADA en subscriptions, facturas, clientes, precios, Stripe
--     ni afiliación.
--
-- FILAS GESTIONADAS = reason 'comp' + granted_by 'founder-platform'. Esta
-- función sólo crea, amplía o cierra ESAS filas. Si el usuario tiene cualquier
-- otro override (founder, qa, support o un 'comp' manual) la concesión se
-- rechaza ('foreign_override'): no se pisa lo que alguien gestionó a mano.
--
-- CAPACIDADES = las que el plan premium concede en `plan_features`. Nunca '*':
-- un '*' también daría las claves reservadas al fundador (catalog_preview,
-- intelligence.comparator). Así no se puede conceder nada administrativo.
--
-- IDEMPOTENCIA. Cada operación lleva un actionId. Mismo actionId y misma huella
-- ⇒ se devuelve el resultado guardado sin volver a aplicar ('replay'); misma
-- clave con otra huella ⇒ 'conflict'. Además cada operación declara la fecha de
-- vencimiento que el fundador TENÍA DELANTE (`p_expected_expires_at`): si ya no
-- es la vigente se rechaza ('stale'). Dos clics con dos actionId distintos no
-- amplían dos veces.
--
-- TRAZABILIDAD. `premium_access_actions` guarda cada operación —aplicada o
-- rechazada—, append-only para el cliente (sin privilegios), con el estado
-- anterior y el nuevo.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.premium_access_actions (
  action_id           uuid        primary key,
  received_at         timestamptz not null default now(),
  issued_at           timestamptz,
  user_id             uuid,
  operation           text        not null,
  days                integer,
  reason              text        not null,
  fingerprint         text        not null,
  outcome             text        not null,
  code                text,
  previous_expires_at timestamptz,
  new_expires_at      timestamptz,
  constraint premium_access_actions_op_chk      check (operation in ('grant','extend','replace','revoke')),
  constraint premium_access_actions_days_chk    check (days is null or days between 1 and 365),
  constraint premium_access_actions_reason_chk  check (length(reason) between 3 and 200),
  constraint premium_access_actions_fp_chk      check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint premium_access_actions_outcome_chk check (outcome in ('applied','rejected'))
);
create index if not exists premium_access_actions_user_idx
  on public.premium_access_actions (user_id, received_at desc);

alter table public.premium_access_actions enable row level security;
drop policy if exists premium_access_actions_no_client on public.premium_access_actions;
create policy premium_access_actions_no_client on public.premium_access_actions
  as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on public.premium_access_actions from anon, authenticated;

-- ── Estado de un usuario para Founder (sin efectos) ─────────────────────────
-- Identidad por correo (sólo como criterio de búsqueda) → id autoritativo.
-- `paid` replica EXACTAMENTE el paso 1 del resolver (aurix_entitlements), que
-- sólo sabe responder para auth.uid(); el harness compara las dos.
create or replace function public.aurix_premium_access_state(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select * from public.subscriptions where user_id = p_user_id
  ), g as (
    select min(o.starts_at) as starts_at, max(o.expires_at) as expires_at, max(o.updated_at) as updated_at
      from public.entitlement_overrides o
     where o.user_id = p_user_id and o.reason = 'comp' and o.granted_by = 'founder-platform'
  ), paid as (
    select coalesce(bool_or(
             s.plan = 'premium' and s.status in ('active','trialing')
             and (s.billing_interval is not distinct from 'lifetime'
                  or (s.current_period_end is not null and s.current_period_end > now()))
             and (s.status <> 'trialing' or (s.trial_end is not null and s.trial_end > now()))
           ), false) as active,
           max(case when s.billing_interval is not distinct from 'lifetime' then null
                    else s.current_period_end end) as until
      from s
  )
  select jsonb_build_object(
    'paid', jsonb_build_object(
      'active', paid.active,
      'until', case when paid.active and paid.until is not null
                    then to_char(paid.until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end),
    'grant', case when g.expires_at is null then null else jsonb_build_object(
      'active', g.starts_at <= now() and g.expires_at > now(),
      'startsAt',  to_char(g.starts_at  at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', to_char(g.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end,
    'foreignOverride', exists (
      select 1 from public.entitlement_overrides o
       where o.user_id = p_user_id
         and not (o.reason = 'comp' and o.granted_by is not distinct from 'founder-platform'))
  )
  from paid, g;
$$;

revoke all     on function public.aurix_premium_access_state(uuid) from public, anon, authenticated;
grant  execute on function public.aurix_premium_access_state(uuid) to service_role;

create or replace function public.aurix_premium_access_lookup(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_n     int;
  v_user  record;
begin
  if length(v_email) not between 3 and 254 or position('@' in v_email) < 2 then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  select count(*) into v_n from auth.users u where lower(u.email) = v_email and u.deleted_at is null;
  if v_n <> 1 then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select u.id, u.email, u.created_at, u.email_confirmed_at into v_user
    from auth.users u where lower(u.email) = v_email and u.deleted_at is null;
  return jsonb_build_object(
    'outcome', 'found',
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', lower(v_user.email),
      'registeredAt', to_char(v_user.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'emailVerified', v_user.email_confirmed_at is not null),
    'state', public.aurix_premium_access_state(v_user.id),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'actionId', a.action_id, 'at', to_char(a.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
               'operation', a.operation, 'days', a.days, 'reason', a.reason,
               'outcome', a.outcome, 'code', a.code,
               'newExpiresAt', to_char(a.new_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
             order by a.received_at desc)
        from (select * from public.premium_access_actions
               where user_id = v_user.id order by received_at desc limit 20) a), '[]'::jsonb));
end;
$$;

revoke all     on function public.aurix_premium_access_lookup(text) from public, anon, authenticated;
grant  execute on function public.aurix_premium_access_lookup(text) to service_role;

-- ── Única escritura ─────────────────────────────────────────────────────────
create or replace function public.aurix_premium_access_apply(
  p_action_id           uuid,
  p_issued_at           timestamptz,
  p_user_id             uuid,
  p_operation           text,
  p_days                integer,
  p_expected_expires_at timestamptz,
  p_reason              text,
  p_fingerprint         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev     public.premium_access_actions;
  v_verified boolean;
  v_current  timestamptz;     -- vencimiento de la concesión VIGENTE (null si no hay)
  v_now      timestamptz := date_trunc('milliseconds', now());
  v_new      timestamptz;
  v_code     text;
  v_reason   text := trim(coalesce(p_reason, ''));
begin
  if p_action_id is null or p_user_id is null
     or p_operation is null or p_operation not in ('grant','extend','replace','revoke')
     or (p_operation = 'revoke' and p_days is not null)
     or (p_operation <> 'revoke' and (p_days is null or p_days not between 1 and 365))
     or length(v_reason) not between 3 and 200
     or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- Un cerrojo por usuario: dos operaciones simultáneas sobre la misma persona
  -- se ordenan, y la segunda ve lo que dejó la primera.
  perform pg_advisory_xact_lock(hashtext('aurix_premium_access:' || p_user_id::text));

  select * into v_prev from public.premium_access_actions where action_id = p_action_id;
  if v_prev.action_id is not null then
    if v_prev.fingerprint <> p_fingerprint then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    return jsonb_build_object('outcome', 'replay', 'result', v_prev.outcome, 'code', v_prev.code,
                              'at', v_prev.received_at,
                              'state', public.aurix_premium_access_state(p_user_id));
  end if;

  select u.email_confirmed_at is not null into v_verified
    from auth.users u where u.id = p_user_id and u.deleted_at is null;

  select max(o.expires_at) into v_current
    from public.entitlement_overrides o
   where o.user_id = p_user_id and o.reason = 'comp' and o.granted_by = 'founder-platform'
     and o.starts_at <= now() and o.expires_at > now();
  v_current := date_trunc('milliseconds', v_current);

  if v_verified is null then
    v_code := 'user_not_found';
  elsif p_operation <> 'revoke' and not v_verified then
    v_code := 'email_not_verified';
  elsif p_expected_expires_at is distinct from v_current then
    v_code := 'stale';
  elsif p_operation = 'grant' and v_current is not null then
    v_code := 'already_active';
  elsif p_operation <> 'grant' and v_current is null then
    v_code := 'no_active_grant';
  elsif p_operation <> 'revoke' and exists (
      select 1 from public.entitlement_overrides o
       where o.user_id = p_user_id
         and not (o.reason = 'comp' and o.granted_by is not distinct from 'founder-platform')) then
    v_code := 'foreign_override';
  elsif p_operation <> 'revoke'
        and not exists (select 1 from public.plan_features where plan = 'premium' and allowed) then
    v_code := 'no_catalog';
  end if;

  if v_code is null then
    if p_operation = 'revoke' then
      -- Se CIERRA la ventana (no se borra): la fila queda como evidencia y el
      -- resolver deja de contarla en este mismo instante.
      update public.entitlement_overrides o
         set expires_at = greatest(v_now, o.starts_at + interval '1 millisecond'), updated_at = now()
       where o.user_id = p_user_id and o.reason = 'comp' and o.granted_by = 'founder-platform'
         and o.expires_at > now();
      v_new := null;
    else
      v_new := case p_operation
                 when 'extend' then v_current + make_interval(days => p_days)
                 else v_now + make_interval(days => p_days)
               end;
      -- Las capacidades del plan premium de HOY. Ampliar o sustituir re-sincroniza
      -- el conjunto; lo que ya no esté en el catálogo se cierra.
      insert into public.entitlement_overrides as o
        (user_id, feature_key, allowed, reason, granted_by, starts_at, expires_at)
      select p_user_id, pf.feature_key, true, 'comp', 'founder-platform',
             case when p_operation = 'extend' then (select min(x.starts_at) from public.entitlement_overrides x
                                                     where x.user_id = p_user_id and x.reason = 'comp'
                                                       and x.granted_by = 'founder-platform'
                                                       and x.expires_at > now())
                  else v_now end,
             v_new
        from public.plan_features pf
       where pf.plan = 'premium' and pf.allowed
      on conflict (user_id, feature_key) do update set
        allowed    = true,
        starts_at  = coalesce(excluded.starts_at, v_now),
        expires_at = excluded.expires_at,
        updated_at = now()
      where o.reason = 'comp' and o.granted_by = 'founder-platform';

      update public.entitlement_overrides o
         set expires_at = greatest(v_now, o.starts_at + interval '1 millisecond'), updated_at = now()
       where o.user_id = p_user_id and o.reason = 'comp' and o.granted_by = 'founder-platform'
         and o.expires_at > now()
         and not exists (select 1 from public.plan_features pf
                          where pf.plan = 'premium' and pf.allowed and pf.feature_key = o.feature_key);
    end if;
  end if;

  insert into public.premium_access_actions
    (action_id, issued_at, user_id, operation, days, reason, fingerprint, outcome, code,
     previous_expires_at, new_expires_at)
  values
    (p_action_id, p_issued_at, case when v_verified is null then null else p_user_id end,
     p_operation, p_days, v_reason, p_fingerprint,
     case when v_code is null then 'applied' else 'rejected' end, v_code, v_current, v_new);

  return jsonb_build_object('outcome', case when v_code is null then 'applied' else 'rejected' end,
                            'code', v_code, 'at', now(),
                            'state', public.aurix_premium_access_state(p_user_id));
end;
$$;

revoke all     on function public.aurix_premium_access_apply(uuid, timestamptz, uuid, text, integer, timestamptz, text, text) from public, anon, authenticated;
grant  execute on function public.aurix_premium_access_apply(uuid, timestamptz, uuid, text, integer, timestamptz, text, text) to service_role;

do $$ begin
  if to_regclass('public.premium_access_actions') is null
     or to_regprocedure('public.aurix_premium_access_apply(uuid,timestamptz,uuid,text,integer,timestamptz,text,text)') is null
     or to_regprocedure('public.aurix_premium_access_lookup(text)') is null then
    raise exception 'PREMIUM-ACCESS SELF-CHECK FAIL';
  end if;
end $$;

commit;

-- Verificación (solo lectura):
--   select action_id, received_at, operation, days, outcome, code, new_expires_at
--     from public.premium_access_actions order by received_at desc limit 20;
--   select user_id, feature_key, starts_at, expires_at from public.entitlement_overrides
--    where reason = 'comp' and granted_by = 'founder-platform';
