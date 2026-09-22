-- ============================================================================
-- AURIX · CIERRE WORKSPACE · EL DERECHO QUE LE FALTA A LA CUENTA DE QA
--                        *** NO EJECUTAR SIN LEER ANTES EL FICHERO DE LECTURA ***
--                        *** pareja: workspace_founder_entitlement_check_1.sql ***
-- ----------------------------------------------------------------------------
-- SÓLO tiene sentido si la consulta 2 del fichero de lectura devuelve
-- `PUEDE_ABRIRLA = false` para las cinco claves nuevas. Si devuelve true, este
-- fichero no hace falta y no debe ejecutarse.
--
-- QUÉ HACE, Y QUÉ NO
--   Añade CINCO overrides por clave a UNA cuenta. No toca `plan_features`, no
--   toca `subscriptions`, no cambia el plan comercial de nadie y no afecta a
--   ningún otro usuario. Es aditivo e idempotente (`on conflict do update`).
--
-- POR QUÉ POR-CLAVE Y NO UN `('*', true)`
--   Un allow global concede TODA clave presente y futura, incluidas las que el
--   producto todavía no ha decidido vender. Eso convierte una cuenta de QA en una
--   cuenta con acceso indefinido a lo que venga después, que es justo lo que el
--   resolver documenta como el caso a evitar. Cinco claves nombradas se revocan
--   nombrándolas.
--
-- POR QUÉ NO SE MARCA LA CUENTA COMO `plan = 'premium'`
--   Sería más corto y sería MENTIRA: no hay suscripción de pago detrás, y
--   `subscriptions` es el registro comercial que luego se le enseña al usuario y
--   lo que tiene que cuadrar con Stripe. Un override declara lo que es: un
--   derecho concedido, con su motivo escrito.
--
-- ⚠ EL `reason` DE ABAJO NO PASA LA RESTRICCIÓN, y se descubrió el 2026-09-22
--   ejecutando su equivalente de este bloque: `entitlement_overrides_reason_chk`
--   (db/monetization_commercial_truth_1.sql) sólo admite 'founder' | 'comp' |
--   'qa' | 'support'. Si este fichero se ejecuta tal cual, Postgres lo rechaza.
--   Sustituir la frase por 'founder' antes de ejecutarlo; el motivo largo vive en
--   esta cabecera, que es donde se lee.
--
-- VERIFICACIÓN: volver a ejecutar la consulta 2 del fichero de lectura.
-- ROLLBACK: al final de este fichero, comentado.
-- ============================================================================

insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
select u.id, k.feature_key, true, 'founder QA · cierre Workspace 2026-09-16'
from auth.users u
cross join (values
  ('workspace.budget'), ('workspace.receivables'), ('workspace.journal'),
  ('workspace.goals'), ('workspace.scenarios')
) as k(feature_key)
where lower(u.email) = lower('rbn892@gmail.com')
on conflict (user_id, feature_key) do update
  set allowed = excluded.allowed,
      reason  = excluded.reason;

-- VERIFICACIÓN (sólo lectura)
--   select o.feature_key, o.allowed, o.reason
--     from public.entitlement_overrides o
--     join auth.users u on u.id = o.user_id
--    where lower(u.email) = lower('rbn892@gmail.com')
--      and o.feature_key like 'workspace.%'
--    order by o.feature_key;
--   -- esperado: las cinco claves con allowed = true

-- ROLLBACK (retira exactamente lo que este fichero añade, y nada más)
--   delete from public.entitlement_overrides o
--    using auth.users u
--    where o.user_id = u.id
--      and lower(u.email) = lower('rbn892@gmail.com')
--      and o.feature_key in ('workspace.budget','workspace.receivables',
--                            'workspace.journal','workspace.goals','workspace.scenarios');
-- ============================================================================
