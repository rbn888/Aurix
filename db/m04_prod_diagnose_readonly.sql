-- ============================================================================
-- AURIX · M.04 — SONDA DE ESTADO EN PRODUCCIÓN  ·  100% READ-ONLY
-- ----------------------------------------------------------------------------
-- UNA sola consulta. Pegar tal cual en el SQL Editor de Supabase y ejecutar.
--
-- Reutiliza la lógica de db/m04_rehearsal/01_diagnose_m04_state.sql, ya validada
-- contra PostgreSQL real en el rehearsal, pero SIN nada de lo que aquel hace
-- además: no crea el esquema m04_rehearsal, no abre run, no escribe gates ni
-- findings, no usa DO, no abre transacción y no toca ningún objeto.
--
-- SÓLO LEE CATÁLOGOS: pg_class, pg_attribute, pg_constraint, pg_index, pg_proc,
-- pg_policy, pg_trigger, pg_roles, aclexplode() y las funciones de introspección
-- to_regclass / to_regprocedure / format_type / pg_get_constraintdef /
-- has_function_privilege. NINGUNA de ellas escribe.
--
-- NO toca public.subscriptions y NO lee ni una fila de billing_*: sólo pregunta
-- por su METADATO. Se puede ejecutar con la base en producción y con usuarios
-- dentro sin ningún efecto.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ ESTAS COMPROBACIONES Y NO OTRAS
-- ----------------------------------------------------------------------------
--   · to_regclass / to_regprocedure devuelven NULL en vez de lanzar, así que la
--     sonda funciona igual con los objetos ausentes. Un `::regclass` directo
--     habría abortado la consulta sobre un estado LIMPIO — la sonda no puede
--     fallar precisamente en el caso que más importa distinguir.
--   · La identidad de las funciones se resuelve por TIPOS de argumento
--     (to_regprocedure). NO con pg_get_function_identity_arguments, que también
--     renderiza los NOMBRES de los parámetros: el rehearsal demostró que
--     compararla contra una lista de tipos desnudos da FAIL contra un M.04
--     PERFECTO. Un falso PARCIAL aquí sería tan caro como un falso LIMPIO.
--   · Los privilegios de tabla salen de aclexplode(relacl) y las columnas de
--     pg_attribute, no de information_schema: information_schema filtra por los
--     privilegios del usuario que consulta, así que con un rol restringido
--     devolvería menos columnas y menos grants e inventaría un PARCIAL.
--   · Se lee el CUERPO de las funciones (prosrc) buscando los outcomes del
--     contrato. Una firma correcta con un cuerpo ANTERIOR —sin los guards de
--     periodo, sin el desempate de segundo— es indistinguible por catálogo, y es
--     exactamente lo que un intento de aplicación fallido deja detrás.
--   · tgenabled y relkind van con ::text explícito: son de tipo "char" de 1 byte
--     y `text || "char"` es AMBIGUO en Postgres (el rehearsal lo destapó
--     haciendo que la función ni se pudiera crear).
--
-- ----------------------------------------------------------------------------
-- CLASIFICACIÓN  (por eliminación: la ambigüedad cae SIEMPRE en PARCIAL)
-- ----------------------------------------------------------------------------
--   LIMPIO    ⇔ 0 de los 5 objetos  Y  0 restos
--   COMPLETO  ⇔ 5 de 5  Y  0 fallos de forma  Y  0 restos
--   PARCIAL   ⇔ cualquier otra cosa
-- ============================================================================

with o as (
  select
    to_regclass('public.billing_customers') as bc,
    to_regclass('public.billing_prices')    as bp,
    to_regclass('public.billing_events')    as be,
    to_regprocedure('public.aurix_billing_link_customer(uuid,text,text)') as fl,
    to_regprocedure(
      'public.aurix_billing_apply_event(text,text,text,text,text,text,text,'
      'timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,timestamptz)'
    ) as fa
),
rol as (
  -- Si un rol no existiese, has_function_privilege LANZARÍA y la sonda no daría
  -- respuesta. Se comprueba antes y la comprobación se marca como no evaluable.
  select bool_or(rolname = 'anon')          as has_anon,
         bool_or(rolname = 'authenticated') as has_auth,
         bool_or(rolname = 'service_role')  as has_svc
    from pg_roles
),
presence as (
  select 1 as ord, 'billing_customers'::text as obj,
         'public.billing_customers'::text as label,
         (bc is not null) as ex, coalesce(bc::text,'—') as ident from o
  union all select 2, 'billing_prices', 'public.billing_prices',
         bp is not null, coalesce(bp::text,'—') from o
  union all select 3, 'billing_events', 'public.billing_events',
         be is not null, coalesce(be::text,'—') from o
  union all select 4, 'aurix_billing_link_customer',
         'public.aurix_billing_link_customer(uuid,text,text)',
         fl is not null, coalesce(fl::text,'—') from o
  union all select 5, 'aurix_billing_apply_event',
         'public.aurix_billing_apply_event(...14 args)',
         fa is not null, coalesce(fa::text,'—') from o
),

-- ── COMPROBACIONES DE FORMA · sólo para los objetos PRESENTES ───────────────
chk as (
  -- ══ billing_customers ══════════════════════════════════════════════════
  select 'billing_customers'::text as obj, 'columnas y tipos'::text as comprobacion,
    'created_at:timestamp with time zone,provider:text,provider_customer_id:text,'
    'updated_at:timestamp with time zone,user_id:uuid'::text as esperado,
    (select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod), ','
                       order by a.attname)
       from pg_attribute a
      where a.attrelid = o.bc and a.attnum > 0 and not a.attisdropped)::text as encontrado
    from o where o.bc is not null
  union all select 'billing_customers', 'nº de CHECK', '2',
    (select count(*)::text from pg_constraint c
      where c.conrelid = o.bc and c.contype = 'c')
    from o where o.bc is not null
  union all select 'billing_customers', 'clave primaria',
    'PRIMARY KEY (provider, user_id)',
    (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = o.bc and c.contype = 'p')
    from o where o.bc is not null
  union all select 'billing_customers', 'FK a auth.users', '1',
    (select count(*)::text from pg_constraint c
      where c.conrelid = o.bc and c.contype = 'f'
        and c.confrelid = to_regclass('auth.users'))
    from o where o.bc is not null
  -- Sin este índice, dos cuentas podrían mapear al MISMO customer de Stripe y un
  -- solo pago entitlaría a las dos.
  union all select 'billing_customers', 'índice ÚNICO de handle', 'true',
    (select exists(select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
                    where x.indrelid = o.bc and x.indisunique
                      and i.relname = 'billing_customers_handle_uidx')::text)
    from o where o.bc is not null
  union all select 'billing_customers', 'trigger de updated_at', 'true',
    (select exists(select 1 from pg_trigger t
                    where t.tgrelid = o.bc and not t.tgisinternal
                      and t.tgname = 'billing_customers_touch_updated_at')::text)
    from o where o.bc is not null
  union all select 'billing_customers', 'RLS activa', 'true',
    (select c.relrowsecurity::text from pg_class c where c.oid = o.bc)
    from o where o.bc is not null
  union all select 'billing_customers', 'política de denegación', 'restrictive',
    (select case when pol.polpermissive then 'permissive' else 'restrictive' end
       from pg_policy pol where pol.polrelid = o.bc
        and pol.polname = 'billing_customers_no_client')
    from o where o.bc is not null
  union all select 'billing_customers', 'privilegios de cliente', '',
    (select coalesce(string_agg(g.rolname||':'||ac.privilege_type, ','
                                order by g.rolname, ac.privilege_type), '')
       from pg_class c cross join lateral aclexplode(c.relacl) ac
       join pg_roles g on g.oid = ac.grantee
      where c.oid = o.bc and g.rolname in ('anon','authenticated'))
    from o where o.bc is not null

  -- ══ billing_prices ═════════════════════════════════════════════════════
  union all select 'billing_prices', 'columnas y tipos',
    'active:boolean,amount_cents:integer,billing_interval:text,'
    'created_at:timestamp with time zone,currency:text,plan:text,provider:text,'
    'provider_price_id:text,trial_days:integer,updated_at:timestamp with time zone',
    (select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod), ','
                       order by a.attname)
       from pg_attribute a
      where a.attrelid = o.bp and a.attnum > 0 and not a.attisdropped)
    from o where o.bp is not null
  union all select 'billing_prices', 'nº de CHECK', '7',
    (select count(*)::text from pg_constraint c
      where c.conrelid = o.bp and c.contype = 'c')
    from o where o.bp is not null
  union all select 'billing_prices', 'clave primaria',
    'PRIMARY KEY (provider, provider_price_id)',
    (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = o.bp and c.contype = 'p')
    from o where o.bp is not null
  -- ÚNICO y PARCIAL (where active). Dos precios activos para el mismo intervalo
  -- no son un catálogo, son una ambigüedad que el paywall tendría que desempatar.
  union all select 'billing_prices', 'único PARCIAL de precio activo', 'true',
    (select exists(select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
                    where x.indrelid = o.bp and x.indisunique
                      and x.indpred is not null
                      and i.relname = 'billing_prices_active_uidx')::text)
    from o where o.bp is not null
  union all select 'billing_prices', 'trigger de updated_at', 'true',
    (select exists(select 1 from pg_trigger t
                    where t.tgrelid = o.bp and not t.tgisinternal
                      and t.tgname = 'billing_prices_touch_updated_at')::text)
    from o where o.bp is not null
  union all select 'billing_prices', 'RLS activa', 'true',
    (select c.relrowsecurity::text from pg_class c where c.oid = o.bp)
    from o where o.bp is not null
  union all select 'billing_prices', 'política de lectura del catálogo', 'true',
    (select exists(select 1 from pg_policy pol
                    where pol.polrelid = o.bp
                      and pol.polname = 'billing_prices_read_active')::text)
    from o where o.bp is not null
  -- La ÚNICA concesión al cliente en todo M.04: ni más (fuga) ni menos (el
  -- paywall no podría renderizar el precio de récord).
  union all select 'billing_prices', 'privilegios de cliente', 'authenticated:SELECT',
    (select coalesce(string_agg(g.rolname||':'||ac.privilege_type, ','
                                order by g.rolname, ac.privilege_type), '')
       from pg_class c cross join lateral aclexplode(c.relacl) ac
       join pg_roles g on g.oid = ac.grantee
      where c.oid = o.bp and g.rolname in ('anon','authenticated'))
    from o where o.bp is not null

  -- ══ billing_events ═════════════════════════════════════════════════════
  union all select 'billing_events', 'columnas y tipos',
    'applied:boolean,event_id:text,event_type:text,outcome:text,provider:text,'
    'received_at:timestamp with time zone,user_id:uuid',
    (select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod), ','
                       order by a.attname)
       from pg_attribute a
      where a.attrelid = o.be and a.attnum > 0 and not a.attisdropped)
    from o where o.be is not null
  union all select 'billing_events', 'nº de CHECK', '2',
    (select count(*)::text from pg_constraint c
      where c.conrelid = o.be and c.contype = 'c')
    from o where o.be is not null
  -- La PK **ES** la idempotencia: si no es (provider, event_id), un reenvío de
  -- Stripe no choca con nada y se aplica dos veces.
  union all select 'billing_events', 'clave primaria (ES la idempotencia)',
    'PRIMARY KEY (provider, event_id)',
    (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = o.be and c.contype = 'p')
    from o where o.be is not null
  union all select 'billing_events', 'índice forense por usuario', 'true',
    (select exists(select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
                    where x.indrelid = o.be
                      and i.relname = 'billing_events_user_idx')::text)
    from o where o.be is not null
  union all select 'billing_events', 'RLS activa', 'true',
    (select c.relrowsecurity::text from pg_class c where c.oid = o.be)
    from o where o.be is not null
  union all select 'billing_events', 'política de denegación', 'restrictive',
    (select case when pol.polpermissive then 'permissive' else 'restrictive' end
       from pg_policy pol where pol.polrelid = o.be
        and pol.polname = 'billing_events_no_client')
    from o where o.be is not null
  union all select 'billing_events', 'privilegios de cliente', '',
    (select coalesce(string_agg(g.rolname||':'||ac.privilege_type, ','
                                order by g.rolname, ac.privilege_type), '')
       from pg_class c cross join lateral aclexplode(c.relacl) ac
       join pg_roles g on g.oid = ac.grantee
      where c.oid = o.be and g.rolname in ('anon','authenticated'))
    from o where o.be is not null

  -- ══ aurix_billing_link_customer ════════════════════════════════════════
  union all select 'aurix_billing_link_customer', 'security definer', 'true',
    (select p.prosecdef::text from pg_proc p where p.oid = o.fl::oid)
    from o where o.fl is not null
  -- Una función definer sin search_path fijado es una superficie de escalada de
  -- privilegios, no un detalle de estilo.
  union all select 'aurix_billing_link_customer', 'search_path fijado',
    'search_path=public, pg_temp',
    (select coalesce(array_to_string(p.proconfig, ','), '')
       from pg_proc p where p.oid = o.fl::oid)
    from o where o.fl is not null
  union all select 'aurix_billing_link_customer', 'execute de service_role', 'true',
    (select case when r.has_svc
                 then has_function_privilege('service_role', o.fl::oid, 'execute')::text
                 else 'NO EVALUABLE: no existe el rol service_role' end)
    from o, rol r where o.fl is not null
  union all select 'aurix_billing_link_customer', 'execute de anon', 'false',
    (select case when r.has_anon
                 then has_function_privilege('anon', o.fl::oid, 'execute')::text
                 else 'NO EVALUABLE: no existe el rol anon' end)
    from o, rol r where o.fl is not null
  union all select 'aurix_billing_link_customer', 'execute de authenticated', 'false',
    (select case when r.has_auth
                 then has_function_privilege('authenticated', o.fl::oid, 'execute')::text
                 else 'NO EVALUABLE: no existe el rol authenticated' end)
    from o, rol r where o.fl is not null
  -- El fail-closed ante un handle ajeno es lo que distingue esta función de un
  -- upsert "servicial" que fugaría entre cuentas.
  union all select 'aurix_billing_link_customer',
    'cuerpo con el fail-closed de handle ajeno', 'true',
    (select (p.prosrc like '%already linked to another user%')::text
       from pg_proc p where p.oid = o.fl::oid)
    from o where o.fl is not null

  -- ══ aurix_billing_apply_event ══════════════════════════════════════════
  union all select 'aurix_billing_apply_event', 'security definer', 'true',
    (select p.prosecdef::text from pg_proc p where p.oid = o.fa::oid)
    from o where o.fa is not null
  union all select 'aurix_billing_apply_event', 'search_path fijado',
    'search_path=public, pg_temp',
    (select coalesce(array_to_string(p.proconfig, ','), '')
       from pg_proc p where p.oid = o.fa::oid)
    from o where o.fa is not null
  union all select 'aurix_billing_apply_event', 'tipo de retorno', 'jsonb',
    (select format_type(p.prorettype, null) from pg_proc p where p.oid = o.fa::oid)
    from o where o.fa is not null
  union all select 'aurix_billing_apply_event', 'execute de service_role', 'true',
    (select case when r.has_svc
                 then has_function_privilege('service_role', o.fa::oid, 'execute')::text
                 else 'NO EVALUABLE: no existe el rol service_role' end)
    from o, rol r where o.fa is not null
  union all select 'aurix_billing_apply_event', 'execute de anon', 'false',
    (select case when r.has_anon
                 then has_function_privilege('anon', o.fa::oid, 'execute')::text
                 else 'NO EVALUABLE: no existe el rol anon' end)
    from o, rol r where o.fa is not null
  union all select 'aurix_billing_apply_event', 'execute de authenticated', 'false',
    (select case when r.has_auth
                 then has_function_privilege('authenticated', o.fa::oid, 'execute')::text
                 else 'NO EVALUABLE: no existe el rol authenticated' end)
    from o, rol r where o.fa is not null
  -- Los 9 outcomes del contrato. Es la comprobación que separa "la función
  -- existe" de "la función es la de M.04".
  union all select 'aurix_billing_apply_event',
    'cuerpo con los 9 outcomes del contrato', 'true',
    (select bool_and(p.prosrc like '%'||s||'%')::text
       from pg_proc p
       cross join unnest(array['missing_period','other_subscription','unknown_status',
                               'unknown_price','unknown_customer','ignored_type',
                               'stale','duplicate','invalid_payload']) s
      where p.oid = o.fa::oid)
    from o where o.fa is not null
),

-- ── RESTOS · lo que un rollback no se llevaría y nadie delataría ────────────
resid as (
  select count(*)::int as n,
         coalesce(string_agg(d, ' · ' order by d), '') as detalle
    from (
      select 'relación inesperada: '||c.relname||' (relkind='||c.relkind::text||')' as d
        from pg_class c, o
       where c.relnamespace = 'public'::regnamespace
         and c.relname like 'billing\_%'
         and c.relkind in ('r','p','v','m','f')
         and c.relname not in ('billing_customers','billing_prices','billing_events')
      union all
      -- Una SOBRECARGA sobrante sobreviviría al DROP del rollback y dejaría M.04
      -- medio retirado sin que nada lo indicara.
      select 'función inesperada: '||p.oid::regprocedure::text
        from pg_proc p, o
       where p.pronamespace = 'public'::regnamespace
         and p.proname like 'aurix_billing%'
         and p.oid not in (coalesce(o.fl::oid, 0::oid), coalesce(o.fa::oid, 0::oid))
    ) x
),
marcado as (
  select c.*, (c.esperado is not distinct from c.encontrado) as ok from chk c
),
totales as (
  select (select count(*) from presence where ex)::int          as presentes,
         (select count(*) from presence where not ex)::int       as ausentes,
         (select count(*) from marcado where not ok)::int        as fallos_forma,
         (select n from resid)                                   as restos
),
estado as (
  select t.*,
         case when t.presentes = 0 and t.restos = 0 then 'LIMPIO'
              when t.presentes = 5 and t.fallos_forma = 0 and t.restos = 0 then 'COMPLETO'
              else 'PARCIAL' end as st
    from totales t
),
por_objeto as (
  select p.ord, p.label, p.ex, p.ident,
         case when not p.ex then false
              else coalesce(bool_and(m.ok), true) end as shape_ok,
         coalesce(string_agg(m.comprobacion||' → esperado ['||coalesce(m.esperado,'∅')||
                             '] encontrado ['||coalesce(m.encontrado,'∅')||']', ' · '
                             order by m.comprobacion)
                  filter (where not m.ok), '') as detalle
    from presence p
    left join marcado m on m.obj = p.obj
   group by p.ord, p.label, p.ex, p.ident
)

-- ── SALIDA ──────────────────────────────────────────────────────────────────
select 0 as n, 'ESTADO'::text as seccion, 'overall_state'::text as item,
       e.st::text as resultado, null::boolean as ok,
       format('presentes %s/5 · fallos de forma %s · restos %s',
              e.presentes, e.fallos_forma, e.restos)::text as detalle
  from estado e
union all
select 10 + b.ord, 'OBJETO', b.label,
       format('exists=%s shape_ok=%s', b.ex, b.shape_ok),
       (b.ex and b.shape_ok),
       nullif(b.detalle, '')
  from por_objeto b
union all
select 20, 'RESTOS', 'restos / sobrecargas inesperadas',
       r.n::text, (r.n = 0), nullif(r.detalle, '')
  from resid r
union all
select 30, 'TOTALES', 'fallos frente a COMPLETO',
       (e.ausentes + e.fallos_forma + e.restos)::text,
       ((e.ausentes + e.fallos_forma + e.restos) = 0),
       format('%s objetos ausentes + %s fallos de forma + %s restos',
              e.ausentes, e.fallos_forma, e.restos)
  from estado e
union all
select 40, 'CONCLUSIÓN', e.st,
       case e.st
         when 'LIMPIO'   then 'M.04 NO está en la base. El APPLY nunca llegó a comitear.'
         when 'COMPLETO' then 'M.04 está entero y con la forma canónica. NO reaplicar.'
         else 'M.04 está a medias o alterado. NO reaplicar y NO reparar a ciegas.'
       end,
       null::boolean,
       case e.st
         when 'LIMPIO'   then 'Camino autorizado: aplicar M.04 (atómico y auto-verificado) '
                              'cuando exista autorización explícita.'
         when 'COMPLETO' then 'Si la app sigue viendo PGRST205, la causa NO es la migración: '
                              'es la caché de esquema de PostgREST (D3, diferido).'
         else 'Entregar esta tabla entera. La reparación se diseña DESPUÉS, con las '
              'filas ok=false delante, y nunca con el APPLY tal cual.'
       end
  from estado e
union all
-- Una fila por comprobación FALLIDA. Vacío si no hay ninguna. Es la evidencia
-- con la que se diseñaría después una reparación.
select 50, 'DETALLE', m.obj||' · '||m.comprobacion,
       coalesce(m.encontrado, '∅'), false,
       'esperado: '||coalesce(m.esperado, '∅')
  from marcado m where not m.ok
order by n, item;
