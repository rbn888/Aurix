-- ============================================================================
-- AURIX · CIERRE WORKSPACE PREMIUM  ·  ROLLBACK
-- Pareja explicita de: db/workspace_premium_3_all_premium.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Pareja de una migracion que SI esta aplicada (2026-09-22). ***
--
-- Retira exactamente las cuatro filas de `plan_features` y los dos overrides que
-- introduce su pareja. Nada mas: el `where` nombra las dos claves.
--
-- EL ORDEN IMPORTA, Y ESTE ROLLBACK NO ES SEGURO SI SE INVIERTE
--   `hasFeature()` exige `=== true`, asi que una clave AUSENTE se resuelve como
--   DENEGADA. Ejecutar esto mientras el catalogo sigue declarando las dos claves
--   deja a una cuenta Premium con dos capacidades publicadas y denegadas.
--   El orden de retirada es el INVERSO al de despliegue:
--     1. devolver `compound_growth` y `tpl_realestate` a `commercialTier: 'free'`
--        con `featureKey: null` en `_WS_CATALOG`
--     2. desplegar ese cambio y comprobar que los bytes publicos lo llevan
--     3. solo entonces, ejecutar este fichero
--
-- LO QUE ESTE ROLLBACK **NO** REVIERTE  (declarado, no olvidado)
--   Los documentos que el usuario ya creo con esas dos capacidades. Viven en
--   `workspace_documents` y en el almacenamiento local, y NO se tocan aqui.
-- ============================================================================

delete from public.plan_features
 where feature_key in ('workspace.compound', 'workspace.realestate');

delete from public.entitlement_overrides o
 using auth.users u
 where o.user_id = u.id
   and lower(u.email) = lower('rbn892@gmail.com')
   and o.feature_key in ('workspace.compound', 'workspace.realestate');

-- VERIFICACION (solo lectura)
--   select count(*) as debe_ser_cero from public.plan_features
--    where feature_key in ('workspace.compound','workspace.realestate');
--   -- esperado: 0
