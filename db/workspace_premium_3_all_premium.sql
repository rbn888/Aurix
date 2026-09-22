-- ============================================================================
-- AURIX · CIERRE WORKSPACE PREMIUM  ·  las DOS claves que faltaban
--                              *** APLICADO EN PRODUCCION · 2026-09-22 ***
-- ----------------------------------------------------------------------------
-- Aplicar: pegar este fichero entero en el editor SQL de Supabase del proyecto
-- al que apunta SUPABASE_URL en config.js, y ejecutar.
--
-- QUE HACE
--   Declara el derecho de las DOS ultimas capacidades de Workspace que todavia
--   eran gratuitas: Interes compuesto y Portfolio inmobiliario. Cuatro filas en
--   `public.plan_features` (free = false, premium = true) y dos overrides por
--   clave para la cuenta de QA del founder, que es como estan concedidas las
--   otras cinco (ver db/workspace_founder_entitlement_fix_1.sql: su acceso NO
--   viene de `plan = 'premium'`, viene de overrides nombrados).
--
--   Es ADITIVO e IDEMPOTENTE. No toca el esquema, no crea tablas, no modifica
--   ninguna otra clave, no cambia precios ni el catalogo de Stripe, y no borra
--   NI UN DOCUMENTO: `workspace_documents` no se menciona aqui. Lo que un
--   usuario Free guardo con estas dos capacidades sigue donde estaba.
--
-- EL ORDEN IMPORTA, Y ES ESTE
--   1. aplicar este fichero
--   2. desplegar el cliente que pone `featureKey` + `commercialTier: 'premium'`
--      en `compound_growth` y `tpl_realestate` dentro de `_WS_CATALOG`
--   Invertirlo NO abre nada a nadie —`hasFeature()` exige `=== true`, asi que una
--   clave ausente se resuelve como DENEGADA y Free queda bloqueado igual— pero
--   deja una ventana en la que una cuenta Premium ve DENEGADAS dos capacidades
--   publicadas. Es una degradacion visible, no un agujero.
--
-- POR QUE DOS CLAVES Y NO UNA GLOBAL
--   `workspace.full` existe, pero es una clave de ETIQUETA del paywall (para que
--   el modal diga «Workspace completo» y no una clave cruda). Convertirla en gate
--   seria sustituir siete permisos especificos por un override global, que es
--   exactamente lo que el resolver documenta como el caso a evitar: un derecho
--   global concede toda clave presente y FUTURA. Dos claves nombradas se revocan
--   nombrandolas.
--
-- EL `reason` ES UN VALOR CERRADO, Y AQUI COSTO UNA EJECUCION FALLIDA
--   `entitlement_overrides_reason_chk` (db/monetization_commercial_truth_1.sql)
--   solo admite 'founder' | 'comp' | 'qa' | 'support'. La primera version de este
--   fichero escribia una frase descriptiva con la fecha y el bloque, y la
--   restriccion la rechazo. El motivo del override se documenta AQUI, en el
--   fichero, no en una columna que tiene dominio cerrado.
--
-- POR QUE LOS OVERRIDES DEL FOUNDER TAMBIEN
--   Sin ellos la cuenta de QA no podria abrir las dos capacidades y el bloque no
--   se podria verificar. Si esa cuenta llegara a tener `plan = 'premium'` de
--   verdad, las filas de `plan_features` ya bastarian y el override es inocuo.
-- ============================================================================

insert into public.plan_features (plan, feature_key, allowed) values
  -- Interes compuesto · HERRAMIENTA (era la unica herramienta gratuita)
  ('free',    'workspace.compound',   false),
  ('premium', 'workspace.compound',   true),
  -- Portfolio inmobiliario · PLANTILLA (era la unica plantilla gratuita)
  ('free',    'workspace.realestate', false),
  ('premium', 'workspace.realestate', true)
on conflict (plan, feature_key) do update
  set allowed = excluded.allowed;

insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
select u.id, k.feature_key, true, 'founder'
from auth.users u
cross join (values
  ('workspace.compound'), ('workspace.realestate')
) as k(feature_key)
where lower(u.email) = lower('rbn892@gmail.com')
on conflict (user_id, feature_key) do update
  set allowed = excluded.allowed,
      reason  = excluded.reason;

-- ============================================================================
-- VERIFICACION (solo lectura). «Lo ejecute y no dio error» NO es prueba.
-- ============================================================================
-- -- 1 · las dos claves conceden a premium y niegan a free  → esperado: 4 filas
-- select feature_key, plan, allowed from public.plan_features
--  where feature_key in ('workspace.compound','workspace.realestate')
--  order by feature_key, plan;
--
-- -- 2 · ninguna quedo concedida al plan free  → esperado: 0
-- select count(*) as debe_ser_cero from public.plan_features
--  where plan = 'free' and allowed
--    and feature_key in ('workspace.compound','workspace.realestate');
--
-- -- 3 · la cuenta de QA las tiene  → esperado: 2 filas con allowed = true
-- select o.feature_key, o.allowed, o.reason
--   from public.entitlement_overrides o
--   join auth.users u on u.id = o.user_id
--  where lower(u.email) = lower('rbn892@gmail.com')
--    and o.feature_key in ('workspace.compound','workspace.realestate')
--  order by o.feature_key;
-- -- VERIFICADO POR EL FOUNDER el 2026-09-22: 4 filas en (1), cero en (2) y las
-- -- dos claves concedidas en (3). Las tres consultas prueban las FILAS de
-- -- permiso; el acceso efectivo de Free y Premium se comprueba en la app.
--
-- -- 4 · lo anterior sigue intacto  → esperado: las cinco claves de §1 + loan
-- select plan, feature_key, allowed from public.plan_features
--  where feature_key like 'workspace.%' or feature_key = 'intelligence.full'
--  order by feature_key, plan;
-- ============================================================================
