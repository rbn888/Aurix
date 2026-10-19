-- ════════════════════════════════════════════════════════════════════════════
-- AURIX · PREMIUM-ACCESS · UNA CONCESIÓN SIGUE AL CATÁLOGO PREMIUM (P1-4)
-- *** NO APLICADO. *** Requiere autorización del founder antes de producción.
-- Requiere: db/premium_access_grants_1.sql aplicado (lo comprueba y aborta si no).
-- Rollback: db/premium_access_follow_catalog_1_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════
-- QUÉ CORRIGE. aurix_premium_access_apply() copia en `entitlement_overrides` las
-- claves de `plan_features` (premium, allowed) que existen EL DÍA de la concesión.
-- Un acceso permanente no se puede ampliar (`permanent_grant`), así que una
-- capacidad Premium publicada DESPUÉS quedaba denegada a quien tiene el acceso
-- concedido, aunque el catálogo se la ofrezca (ya ocurrió y se arregló a mano en
-- workspace_premium_3_all_premium.sql). Lectura de producción del 2026-10-19
-- (lote 0, Q4b): 0 titulares vigentes ⇒ hoy no afecta a nadie; es latente.
--
-- QUÉ HACE. Un trigger sobre `plan_features`, y nada más:
--   · Una clave que PASA a (premium, allowed=true) se añade a cada concesión
--     gestionada VIGENTE (reason 'comp' + granted_by 'founder-platform'), con la
--     MISMA ventana que esa concesión (inicio más antiguo; sin caducidad si es
--     permanente, si no su vencimiento). Caducadas y revocadas: nada.
--   · Si el usuario ya tiene un override de OTRO gestor para esa clave (una
--     denegación explícita, support, qa…), NO se toca. Sólo una fila gestionada
--     CERRADA (clave despublicada que vuelve) se reabre, y sólo si la concesión
--     sigue vigente: una concesión revocada no tiene filas vigentes y no recibe nada. Y una denegación
--     global '*' sigue siendo absoluta en aurix_entitlements(): esto no la salta.
--   · Una clave que DEJA de ser (premium, allowed) cierra sus filas gestionadas
--     vigentes — se CIERRA la ventana, no se borra, igual que apply() al resincronizar.
--   · Nunca '*', nunca una clave que el plan premium no conceda: no puede crear un
--     privilegio que el propio catálogo Premium no tenga.
-- NO toca el resolver, ni subscriptions, ni Stripe, ni premium_access_actions.
-- Backfill final: idempotente; con 0 titulares vigentes no escribe nada.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $chk$
begin
  if to_regclass('public.premium_access_actions') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'aurix_premium_access_apply') then
    raise exception 'ABORTADO: premium_access_grants_1.sql no está aplicado en esta base';
  end if;
end $chk$;

create or replace function public.aurix_premium_access_follow_catalog()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_was boolean := false;
  v_is  boolean := false;
  v_key text;
begin
  -- OLD/NEW sólo se leen en la operación que los tiene.
  if tg_op = 'INSERT' then
    v_is := (new.plan = 'premium' and new.allowed);  v_key := new.feature_key;
  elsif tg_op = 'UPDATE' then
    v_was := (old.plan = 'premium' and old.allowed);
    v_is  := (new.plan = 'premium' and new.allowed);  v_key := new.feature_key;
    if old.feature_key is distinct from new.feature_key and v_was then
      -- Renombrar una clave es retirar la vieja y publicar la nueva.
      update public.entitlement_overrides o
         set expires_at = greatest(now(), o.starts_at + interval '1 millisecond'), updated_at = now()
       where o.feature_key = old.feature_key
         and o.reason = 'comp' and o.granted_by = 'founder-platform'
         and (o.expires_at is null or o.expires_at > now());
      v_was := false;
    end if;
  else
    v_was := (old.plan = 'premium' and old.allowed);  v_key := old.feature_key;
  end if;

  if v_is and not v_was then
    insert into public.entitlement_overrides
      (user_id, feature_key, allowed, reason, granted_by, starts_at, expires_at)
    select g.user_id, v_key, true, 'comp', 'founder-platform', g.starts_at, g.expires_at
      from (select o.user_id,
                   min(o.starts_at) as starts_at,
                   case when bool_or(o.expires_at is null) then null else max(o.expires_at) end as expires_at
              from public.entitlement_overrides o
             where o.reason = 'comp' and o.granted_by = 'founder-platform' and o.allowed
               and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
             group by o.user_id) g
    -- Una fila de OTRO gestor (denegación explícita, support, qa…) no se toca nunca.
    -- Una fila GESTIONADA cerrada (la clave se despublicó y vuelve) se reabre con la
    -- ventana de la concesión vigente; las abiertas se quedan como están.
    on conflict (user_id, feature_key) do update
       set allowed = true, starts_at = excluded.starts_at, expires_at = excluded.expires_at, updated_at = now()
     where entitlement_overrides.reason = 'comp' and entitlement_overrides.granted_by = 'founder-platform'
       and entitlement_overrides.expires_at is not null and entitlement_overrides.expires_at <= now();
  elsif v_was and not v_is then
    update public.entitlement_overrides o
       set expires_at = greatest(now(), o.starts_at + interval '1 millisecond'), updated_at = now()
     where o.feature_key = v_key
       and o.reason = 'comp' and o.granted_by = 'founder-platform'
       and (o.expires_at is null or o.expires_at > now());
  end if;
  return null;
end;
$$;

revoke all on function public.aurix_premium_access_follow_catalog() from public, anon, authenticated;

drop trigger if exists plan_features_premium_access_follow on public.plan_features;
create trigger plan_features_premium_access_follow
  after insert or update of allowed, plan, feature_key or delete on public.plan_features
  for each row execute function public.aurix_premium_access_follow_catalog();

-- Backfill: las concesiones vigentes que hoy no cubran una clave ya publicada.
insert into public.entitlement_overrides
  (user_id, feature_key, allowed, reason, granted_by, starts_at, expires_at)
select g.user_id, pf.feature_key, true, 'comp', 'founder-platform', g.starts_at, g.expires_at
  from (select o.user_id,
               min(o.starts_at) as starts_at,
               case when bool_or(o.expires_at is null) then null else max(o.expires_at) end as expires_at
          from public.entitlement_overrides o
         where o.reason = 'comp' and o.granted_by = 'founder-platform' and o.allowed
           and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
         group by o.user_id) g
  cross join public.plan_features pf
 where pf.plan = 'premium' and pf.allowed
on conflict (user_id, feature_key) do nothing;

commit;
