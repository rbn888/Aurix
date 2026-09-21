-- ============================================================================
-- AURIX-INTELLIGENCE · CIERRE DEFINITIVO · I.2 · intelligence.comparator
-- ----------------------------------------------------------------------------
-- Apply:  supabase db query --linked -f db/intelligence_comparator_key_1.sql
-- Idempotente y ADITIVO: dos filas en `public.plan_features`. No toca esquema,
-- no toca políticas, no toca privilegios.  *** NO APLICADO ***
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EXISTE
-- ----------------------------------------------------------------------------
-- El comparador se publicó con un canary en `localStorage`, y eso no es un
-- canary: es por NAVEGADOR, no sobrevive a cambiar de dispositivo y cualquiera
-- puede escribirlo desde la consola. El checkpoint I.2 pide exactamente lo
-- contrario —«derivada del usuario autenticado, nunca de account_id enviado por
-- el cliente», «persistente en móvil y escritorio», «Free no debe obtener acceso
-- por manipulación del cliente»— y pide además no inventar un mecanismo nuevo.
--
-- No hace falta inventarlo: `workspace.catalog_preview` (M.02 B4) ya resolvió
-- este problema exacto, y esta clave copia su forma sin una sola variación.
--
-- ----------------------------------------------------------------------------
-- LA FORMA IMPORTA: NINGÚN PLAN LA CONCEDE
-- ----------------------------------------------------------------------------
-- Las dos filas van con `allowed = false`, igual que el catálogo interno. No es
-- un descuido:
--
--   · El comparador está pendiente de la Founder QA. Un cliente Premium de pago
--     NO debe verlo todavía, y una fila con `allowed = true` en el plan premium
--     lo abriría a todos en el instante en que se aplicase este SQL.
--   · La única vía de concesión queda siendo una fila explícita en
--     `entitlement_overrides`. Hoy el founder tiene un `'*'`, así que aplicar
--     este fichero le concede la clave a él y SÓLO a él, en todos sus
--     dispositivos, sin tocar ni una línea de cliente.
--
-- El resolver la recoge SIN cambios porque deriva su conjunto canónico de claves
-- de esta misma tabla. En el cliente, `_AURIX_ENT_CANON_EXTRA` ya la declara: sin
-- esa declaración el gate la negaría aunque la base de datos la concediera, que
-- es la lección que costó el incidente de las cinco capacidades de Workspace.
--
-- ----------------------------------------------------------------------------
-- CÓMO SE ABRE A PREMIUM, EL DÍA QUE EL FOUNDER LO AUTORICE
-- ----------------------------------------------------------------------------
-- Una sola línea, y NO forma parte de este fichero a propósito:
--   update public.plan_features set allowed = true
--    where plan = 'premium' and feature_key = 'intelligence.comparator';
-- Mientras tanto, el kill switch global (`window.__AURIX_CMP_KILL`) sigue
-- mandando por encima de cualquier concesión.
-- ============================================================================

insert into public.plan_features (plan, feature_key, allowed) values
  ('free',    'intelligence.comparator', false),
  ('premium', 'intelligence.comparator', false)
on conflict (plan, feature_key) do update
  set allowed = excluded.allowed;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- -- La clave existe en los dos planes y NINGUNO la concede:
-- select plan, feature_key, allowed from public.plan_features
--  where feature_key = 'intelligence.comparator' order by plan;
--
-- select count(*) as debe_ser_cero from public.plan_features
--  where feature_key = 'intelligence.comparator' and allowed;
--
-- -- Y el founder SÍ la tiene, por su override '*' (ejecutar como él):
-- select features -> 'intelligence.comparator' as debe_ser_true
--   from public.aurix_entitlements();
-- ============================================================================
