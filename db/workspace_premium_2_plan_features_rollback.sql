-- ============================================================================
-- AURIX WORKSPACE COMPLETION · §1  ·  ROLLBACK de los derechos Premium
-- Pareja explícita de: db/workspace_premium_2_plan_features.sql
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
--
-- Retira las DIEZ filas de `plan_features` que introduce su pareja. No toca el
-- esquema, no borra tablas y no afecta a ninguna otra clave: el `where` nombra
-- exactamente las cinco claves de este bloque.
--
-- ----------------------------------------------------------------------------
-- EL ORDEN IMPORTA, Y ESTE ROLLBACK NO ES SEGURO SI SE INVIERTE
-- ----------------------------------------------------------------------------
-- `hasFeature()` exige `=== true` (app.js), así que una clave AUSENTE se resuelve
-- como DENEGADA. Ejecutar esto mientras las capacidades siguen `published: true`
-- deja a un usuario Premium que YA PAGA viendo denegada una capacidad publicada:
-- el catálogo se la ofrece y el resolver se la niega.
--
-- Así que el orden de retirada es el INVERSO al de despliegue:
--   1. poner `published: false` en las entradas afectadas de `_WS_CATALOG`
--   2. desplegar ese cambio y comprobar que los bytes públicos lo llevan
--   3. sólo entonces, ejecutar este fichero
--
-- ----------------------------------------------------------------------------
-- LO QUE ESTE ROLLBACK **NO** REVIERTE  (declarado, no olvidado)
-- ----------------------------------------------------------------------------
-- 1. LOS DOCUMENTOS QUE EL USUARIO YA CREÓ con esas capacidades. Viven en
--    `workspace_documents` y en el almacenamiento local, y NO se tocan aquí.
--    Retirar un derecho no destruye el trabajo hecho con él: si el derecho vuelve,
--    el documento sigue estando. Eso es deliberado.
-- 2. `workspace.loan` ni `intelligence.full` ni `workspace.catalog_preview`, que
--    son de bloques anteriores y están en producción.
-- ============================================================================

delete from public.plan_features
 where feature_key in ('workspace.budget', 'workspace.receivables',
                       'workspace.journal', 'workspace.goals', 'workspace.scenarios');

-- VERIFICACIÓN (sólo lectura)
--   select count(*) as debe_ser_cero from public.plan_features
--    where feature_key in ('workspace.budget','workspace.receivables',
--                          'workspace.journal','workspace.goals','workspace.scenarios');
--   -- esperado: 0
--   -- Y lo anterior sigue intacto:
--   select plan, feature_key, allowed from public.plan_features
--    where feature_key in ('workspace.loan','intelligence.full')
--    order by feature_key, plan;
