-- ============================================================================
-- AURIX-MONETIZATION-M02-B4 · workspace.catalog_preview
-- ----------------------------------------------------------------------------
-- Apply:  supabase db query --linked -f db/monetization_catalog_preview_key_1.sql
-- Idempotente y ADITIVO: dos filas en `public.plan_features`. No toca esquema, no
-- toca políticas, no toca privilegios, no toca B1 ni B2.  *** YA APLICADO ***
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EXISTE
-- ----------------------------------------------------------------------------
-- B4 necesita una capacidad: "ver el catálogo INTERNO" (las 21 herramientas y
-- plantillas sin publicar, para poder evaluarlas). La primera versión la DEDUCÍA
-- del resolver: "si las tres features vienen de un override, es el founder".
--
-- La revisión adversarial demostró que eso conflaba dos cosas distintas. El
-- resolver de B2 estampa `source='override'` también en los overrides POR CLAVE,
-- y B1 admite `reason` in ('founder','comp','qa','support'). Así que un usuario
-- compensado con tres filas individuales —una acción de soporte perfectamente
-- normal— habría visto el catálogo interno y podido abrir herramientas a medio
-- construir cuyo estado vive sólo en localStorage y no sincroniza.
--
-- Se le da su propia clave, y la señal pasa a ser inequívoca.
--
-- ----------------------------------------------------------------------------
-- LA FORMA IMPORTA: NINGÚN PLAN LA CONCEDE, NUNCA
-- ----------------------------------------------------------------------------
-- Las dos filas van con `allowed = false`. No es un descuido: esta capacidad no
-- se vende y no debe poder venderse. Un cliente Premium de pago NO ve el catálogo
-- interno — vería producto sin terminar, que es justo el resultado inaceptable
-- que §18 del SPEC prohíbe. La única vía de concesión es una fila explícita en
-- `entitlement_overrides` (hoy: el `'*'` del founder).
--
-- El resolver la recoge SIN cambios porque deriva su conjunto canónico de claves
-- de esta misma tabla (`select distinct feature_key`) — B1 lo diseñó así a
-- propósito, con un CHECK de FORMATO y no una lista blanca, precisamente para que
-- añadir una capacidad no exigiera una migración de constraint.
--
-- Consecuencia declarada: el `'*'` del founder concede también esta clave, así
-- que un deny global futuro le apagaría el catálogo interno junto con lo demás.
-- Es coherente: '*' significa todo.
-- ============================================================================

insert into public.plan_features (plan, feature_key, allowed) values
  ('free',    'workspace.catalog_preview', false),
  ('premium', 'workspace.catalog_preview', false)
on conflict (plan, feature_key) do update
  set allowed = excluded.allowed;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- -- 8 filas: 4 claves x 2 planes. catalog_preview en false en AMBOS.
-- select plan, feature_key, allowed from public.plan_features order by feature_key, plan;
--
-- -- Ningún plan la concede:
-- select count(*) as debe_ser_cero from public.plan_features
--  where feature_key = 'workspace.catalog_preview' and allowed;
-- ============================================================================
