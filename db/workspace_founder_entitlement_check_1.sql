-- ============================================================================
-- AURIX · CIERRE WORKSPACE · ¿RESUELVE LA CUENTA DE QA COMO PREMIUM DE VERDAD?
--                                       *** SOLO LECTURA · NO MODIFICA NADA ***
-- ----------------------------------------------------------------------------
-- POR QUÉ EXISTE ESTE FICHERO
--
-- El bloque de cierre arregló un P0 del CLIENTE: `_AURIX_ENT_CANON` era una lista
-- literal de cuatro claves y las cinco capacidades Premium publicadas se caían en
-- silencio del mapa de features, así que `hasFeature('workspace.budget')` devolvía
-- false para toda cuenta premium. Eso está corregido y verificado.
--
-- Pero queda una pregunta que NO se puede responder desde el cliente ni desde el
-- sandbox, y de ella depende una de las condiciones de GO de la SPEC («la cuenta
-- de QA abre las capacidades Premium»):
--
--   ¿Cómo es Premium esa cuenta — por SUSCRIPCIÓN o por OVERRIDES por-clave?
--
-- El resolver (db/monetization_entitlement_resolver_1.sql) concede así:
--   · plan = 'premium'  ⇒  TODA clave con `plan_features(premium, k, true)`.
--     Las cinco nuevas entran solas: el SQL ya está aplicado.
--   · plan = 'free' + override `('*', true)`  ⇒  también entran solas.
--   · plan = 'free' + overrides POR CLAVE  ⇒  **NO entran**. Un override sólo
--     afecta a la clave que nombra, y las cinco claves nuevas no existían cuando
--     se crearon esos overrides, así que resuelven DENEGADAS.
--
-- El tercer caso es plausible: `workspace.catalog_preview` está en `false` para
-- los dos planes (db/monetization_catalog_preview_key_1.sql), o sea que si esa
-- cuenta ve el catálogo interno es porque tiene un override por clave.
--
-- Si el tercer caso es el real, el producto está bien y la cuenta de QA seguirá
-- viendo paywall en Presupuesto, Cobros, Objetivos, Diario y Escenarios: no sería
-- un defecto de código sino un derecho que falta en la base de datos.
--
-- Ejecutar en el editor SQL de producción y pegar el resultado.
-- ============================================================================

-- 1 · El veredicto del resolver PARA ESA CUENTA, tal y como lo ve el cliente.
--     Se ejecuta con el uid real: es la única lectura que no adivina nada.
with u as (
  select id as uid from auth.users where lower(email) = lower('rbn892@gmail.com')
)
select
  u.uid,
  s.plan                       as plan_suscripcion,
  s.status                     as estado_suscripcion,
  s.billing_interval,
  s.current_period_end,
  (select count(*) from public.entitlement_overrides o
    where o.user_id = u.uid and o.feature_key = '*'
      and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
  )                            as tiene_override_global,
  (select string_agg(o.feature_key || '=' || o.allowed, ', ' order by o.feature_key)
     from public.entitlement_overrides o
    where o.user_id = u.uid and o.feature_key <> '*'
      and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
  )                            as overrides_por_clave
from u left join public.subscriptions s on s.user_id = u.uid;

-- 2 · Y LA RESPUESTA DIRECTA: ¿concede el resolver las cinco claves nuevas?
--     Esto es lo que decide si la QA autenticada puede abrir las cinco.
--     (La función es `security definer` y lee `auth.uid()`, así que desde el editor
--      no se puede impersonar: se reproduce su lógica sobre las MISMAS tablas.)
with u as (
  select id as uid from auth.users where lower(email) = lower('rbn892@gmail.com')
),
plan_efectivo as (
  select u.uid,
         case when s.plan = 'premium'
                   and s.status in ('active','trialing')
                   and (s.billing_interval is not distinct from 'lifetime'
                        or (s.current_period_end is not null and s.current_period_end > now()))
              then 'premium' else 'free' end as plan
  from u left join public.subscriptions s on s.user_id = u.uid
),
star as (
  select u.uid, o.allowed
  from u join public.entitlement_overrides o
    on o.user_id = u.uid and o.feature_key = '*'
   and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
)
select
  k.feature_key,
  coalesce(pf.allowed, false)                     as concede_el_plan,
  (select allowed from star)                      as override_global,
  (select o.allowed from public.entitlement_overrides o, u
    where o.user_id = u.uid and o.feature_key = k.feature_key
      and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
  )                                               as override_por_clave,
  -- El resultado efectivo, con la misma precedencia que el resolver:
  --   deny global > allow global > override por clave > plan
  case
    when (select allowed from star) is false then false
    when (select o.allowed from public.entitlement_overrides o, u
           where o.user_id = u.uid and o.feature_key = k.feature_key
             and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())) is not null
      then (select o.allowed from public.entitlement_overrides o, u
             where o.user_id = u.uid and o.feature_key = k.feature_key
               and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now()))
    when (select allowed from star) is true then true
    else coalesce(pf.allowed, false)
  end                                             as PUEDE_ABRIRLA
from (values
  ('workspace.budget'), ('workspace.receivables'), ('workspace.journal'),
  ('workspace.goals'), ('workspace.scenarios'), ('workspace.loan'),
  ('intelligence.full')
) as k(feature_key)
cross join plan_efectivo pe
left join public.plan_features pf
       on pf.plan = pe.plan and pf.feature_key = k.feature_key
order by k.feature_key;

-- ----------------------------------------------------------------------------
-- CÓMO LEER EL RESULTADO
--   · `PUEDE_ABRIRLA` en true para las SIETE  ⇒  la QA autenticada puede hacerse
--     entera y no hay nada que tocar.
--   · false en las cinco nuevas  ⇒  NO es un defecto de código: falta el derecho.
--     El arreglo está en el fichero pareja `workspace_founder_entitlement_fix_1.sql`,
--     que NO se ejecuta sin leer antes este resultado.
-- ============================================================================
