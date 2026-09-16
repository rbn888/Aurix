-- ============================================================================
-- AURIX WORKSPACE COMPLETION · §1  ·  derechos de las capacidades Premium
--                              *** APLICADO EN PRODUCCION · 2026-09-16 ***
-- ----------------------------------------------------------------------------
-- Aplicar: pegar este fichero entero en el editor SQL de Supabase del proyecto
-- al que apunta SUPABASE_URL en config.js, y ejecutar.
-- *** APLICADO: el founder lo ejecutó el 2026-09-16 en el editor SQL de
--     producción («Success. No rows returned») y verificó el resultado:
--     exactamente 10 filas para las cinco claves, con free=false y
--     premium=true en cada una. Es idempotente: reejecutarlo no cambia nada. ***
--
-- Idempotente y ADITIVO: DIEZ filas en `public.plan_features`. No toca el esquema,
-- no crea tablas, no modifica ninguna fila existente (el `on conflict` reescribe
-- sólo las cinco claves que nombra). Antes de aplicarlo las cinco capacidades
-- estaban INTERNAS; el catálogo no las publica sin estas filas.
--
-- POR QUÉ HACEN FALTA
--   `_WS_CATALOG` declara su propia REGLA DE VERDAD: «si el founder ve "Premium",
--   es porque REALMENTE está incluido en Premium — hay una fila en `plan_features`
--   que lo concede al plan premium. No se pinta "Premium" decorativamente».
--   Las CINCO capacidades publicables del catálogo canónico ya declaran su `featureKey` en
--   app.js, pero `published` sigue en `false` porque sin estas filas el resolver
--   negaría el acceso a un usuario Premium que ya ha pagado. Publicarlas antes de
--   aplicar esto sería vender algo que el gate deniega.
--
-- EL ORDEN IMPORTA, Y ES ÉSTE
--   1. aplicar este fichero
--   2. aplicar db/workspace_documents_1.sql (sin él, las plantillas guardan sólo
--      en el dispositivo y lo DICEN; con él, sincronizan de verdad)
--   3. poner `published: true` en las cinco entradas de `_WS_CATALOG` — una línea
--      por entrada — y desplegar
--   Invertirlo no rompe datos, pero deja un periodo en el que el catálogo ofrece
--   algo que el resolver deniega, y eso se lee como un producto roto.
--
-- FREE EN `false`, EXPLÍCITAMENTE
--   No se omite la fila de `free`: se declara negada. El resolver falla cerrado
--   ante una clave ausente, así que omitirla daría el mismo efecto HOY, pero deja
--   la decisión sin escribir. Una frontera comercial declarada es revisable; una
--   frontera que depende de una ausencia, no.
--
-- LO QUE ESTO NO HACE
--   No cambia precios, ni el catálogo de Stripe, ni las condiciones comerciales,
--   ni concede nada al plan free. No toca `workspace.loan` ni `intelligence.full`,
--   que ya están decididas y en producción.
-- ============================================================================

insert into public.plan_features (plan, feature_key, allowed) values
  -- Presupuesto mensual · PLANTILLA
  ('free',    'workspace.budget',      false),
  ('premium', 'workspace.budget',      true),
  -- Control de cobros · PLANTILLA
  ('free',    'workspace.receivables', false),
  ('premium', 'workspace.receivables', true),
  -- Diario de operaciones · PLANTILLA
  ('free',    'workspace.journal',     false),
  ('premium', 'workspace.journal',     true),
  -- Seguimiento de precios: NO SE INCLUYE, y la ausencia es deliberada. §J pide
  -- que aporte valor distinto a Market y, si sigue siendo redundante, que se
  -- mantenga interna «sin vender una copia». La watchlist ya existe en Market y
  -- además sincroniza; y lo construido aquí responde la misma pregunta que el
  -- Diario de operaciones. Conceder `workspace.prices` sería vender dos veces la
  -- misma capacidad, así que la clave no existe y la entrada sigue interna.
  -- Objetivos · PLANTILLA
  ('free',    'workspace.goals',       false),
  ('premium', 'workspace.goals',       true),
  -- Simulador de escenarios · HERRAMIENTA
  ('free',    'workspace.scenarios',   false),
  ('premium', 'workspace.scenarios',   true)
on conflict (plan, feature_key) do update
  set allowed = excluded.allowed;

-- ============================================================================
-- VERIFICACIÓN (sólo lectura). «Lo ejecuté y no dio error» NO es prueba.
-- ============================================================================
-- -- 1 · las seis claves conceden a premium y niegan a free
-- select feature_key, plan, allowed from public.plan_features
--  where feature_key in ('workspace.budget','workspace.receivables','workspace.journal',
--                        'workspace.goals','workspace.scenarios')
--  order by feature_key, plan;
-- -- esperado: 10 filas · premium=true · free=false
--
-- -- 2 · ninguna de ellas quedó concedida al plan free
-- select count(*) as debe_ser_cero from public.plan_features
--  where plan = 'free' and allowed
--    and feature_key in ('workspace.budget','workspace.receivables','workspace.journal',
--                        'workspace.goals','workspace.scenarios');
-- -- esperado: 0
--
-- -- 3 · lo que ya estaba decidido sigue intacto
-- select plan, feature_key, allowed from public.plan_features
--  where feature_key in ('workspace.loan','intelligence.full','workspace.catalog_preview')
--  order by feature_key, plan;
-- ============================================================================
