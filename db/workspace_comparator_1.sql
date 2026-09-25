-- ============================================================================
-- AURIX · COMPARADOR DE RENTABILIDAD  ·  la NOVENA capacidad de Workspace
--                        *** PENDIENTE DE APLICAR ***
-- ----------------------------------------------------------------------------
-- Aplicar: pegar este fichero entero en el editor SQL de Supabase del proyecto
-- al que apunta SUPABASE_URL en config.js, y ejecutar.
--
-- QUE HACE, Y NADA MAS
--   Declara el derecho de UNA capacidad: `workspace.comparator`. Dos filas en
--   `public.plan_features` (free = false, premium = true) y un override por
--   clave para la cuenta del founder, que es como estan concedidas las otras
--   ocho (su acceso NO viene de `plan = 'premium'`, viene de overrides
--   nombrados — ver db/workspace_founder_entitlement_fix_1.sql).
--
--   Es ADITIVO e IDEMPOTENTE. No toca el esquema, no crea tablas, no modifica
--   ninguna otra clave, no cambia precios ni el catalogo de Stripe, y no borra
--   ni un documento.
--
-- DE DONDE VIENE ESTA CAPACIDAD
--   El comparador vivia en Intelligence detras de `intelligence.comparator`,
--   una clave que SOLO tiene la cuenta fundadora por override: ningun cliente
--   Premium lo ha visto nunca. Al mudarlo a Workspace deja de ser una lectura
--   que Intelligence ofrece y pasa a ser una HERRAMIENTA que se abre a
--   proposito, y una herramienta del catalogo necesita un derecho que Premium
--   conceda de verdad. Eso es esta fila.
--
-- POR QUE UNA CLAVE NUEVA Y NO LA QUE YA TENIA
--   `intelligence.comparator` no la concede ningun plan: se otorga por override
--   y su nombre declara otro espacio. Publicar la herramienta con ella dejaria
--   a toda cuenta Premium viendo una capacidad que se le DENIEGA. Una capacidad
--   publicada, una clave que Premium conceda.
--
-- EL ORDEN IMPORTA, Y ES ESTE
--   1. aplicar este fichero
--   2. desplegar el cliente que cambia la entrada `return_comparator` de
--      `_WS_CATALOG` a:
--         published: true, featureKey: 'workspace.comparator',
--         commercialTier: 'premium'
--      y sube la portada Free de ocho capacidades a nueve.
--   Invertirlo NO abre nada a nadie —`hasFeature()` exige `=== true`, asi que
--   una clave ausente se resuelve como DENEGADA— pero deja una ventana en la
--   que una cuenta Premium ve DENEGADA una capacidad publicada. Es una
--   degradacion visible, no un agujero. Por eso el cliente desplegado HOY deja
--   la entrada INTERNA: hasta que estas filas existan, la herramienta la ve
--   unicamente la cuenta fundadora.
--
-- QUE PASA CON `intelligence.comparator`
--   Se deja INTACTA a proposito. Es la clave con la que la cuenta fundadora
--   abre la herramienta mientras la entrada sigue interna, asi que retirarla
--   antes de publicar dejaria la capacidad sin owner ni para el founder.
--   Retirarla es un paso POSTERIOR a la publicacion y va en su propio fichero:
--   mezclar «conceder lo nuevo» y «revocar lo viejo» en una transaccion hace
--   imposible revertir solo la mitad que falle.
--
-- EL `reason` ES UN VALOR CERRADO
--   `entitlement_overrides_reason_chk` solo admite
--   'founder' | 'comp' | 'qa' | 'support'. Una frase descriptiva REBOTA. El
--   motivo se documenta aqui, en el fichero, no en una columna con dominio
--   cerrado.
-- ============================================================================

insert into public.plan_features (plan, feature_key, allowed) values
  -- Comparador de rentabilidad · HERRAMIENTA (novena capacidad de Workspace)
  ('free',    'workspace.comparator', false),
  ('premium', 'workspace.comparator', true)
on conflict (plan, feature_key) do update
  set allowed = excluded.allowed;

insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
select u.id, 'workspace.comparator', true, 'founder'
from auth.users u
where lower(u.email) = lower('rbn892@gmail.com')
on conflict (user_id, feature_key) do update
  set allowed = excluded.allowed,
      reason  = excluded.reason;

-- ============================================================================
-- VERIFICACION (solo lectura). «Lo ejecute y no dio error» NO es prueba.
-- ============================================================================
-- -- 1 · la clave concede a premium y niega a free  → esperado: 2 filas
-- select feature_key, plan, allowed from public.plan_features
--  where feature_key = 'workspace.comparator'
--  order by plan;
--
-- -- 2 · no quedo concedida al plan free  → esperado: 0
-- select count(*) as debe_ser_cero from public.plan_features
--  where plan = 'free' and allowed and feature_key = 'workspace.comparator';
--
-- -- 3 · la cuenta del founder la tiene  → esperado: 1 fila con allowed = true
-- select o.feature_key, o.allowed, o.reason
--   from public.entitlement_overrides o
--   join auth.users u on u.id = o.user_id
--  where lower(u.email) = lower('rbn892@gmail.com')
--    and o.feature_key = 'workspace.comparator';
--
-- -- 4 · las ocho anteriores siguen intactas  → esperado: sin cambios
-- select plan, feature_key, allowed from public.plan_features
--  where feature_key like 'workspace.%' or feature_key like 'intelligence.%'
--  order by feature_key, plan;
-- ============================================================================
