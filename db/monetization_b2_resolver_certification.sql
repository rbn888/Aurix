-- ============================================================================
-- AURIX-MONETIZATION-M02-B2 · BEHAVIOURAL CERTIFICATION OF THE RESOLVER
-- ----------------------------------------------------------------------------
-- Run:  supabase db query --linked -f db/monetization_b2_resolver_certification.sql
--
-- This EXECUTES public.aurix_entitlements() against real Postgres with real
-- rows, for all the cases M.02 B2 must satisfy. It is not a static check and it
-- does not reimplement the decision logic: the answers come from the function.
--
-- SAFETY — LÉELO ANTES DE EJECUTAR:
--   Esto retira temporalmente CUATRO CHECK de `public.subscriptions`
--   (plan_chk, status_chk, premium_bound_chk, premium_price_chk) para poder
--   escribir estados que B1 hace inalcanzables — a propósito, porque un resolver
--   cuyo fail-closed depende de una constraint de otra capa no es fail-closed.
--   Y vacía `plan_features` en S24.
--
--   NO se confía en el rollback para deshacerlo. Re-aplicar B1 NO repondría un
--   CHECK perdido (viven dentro de un `create table if not exists`, que no-opea).
--   Así que hay tres redes, en este orden:
--     1. PRECONDICIÓN: se niega a correr si subscriptions/overrides no están a 0
--        o si no hay 12 CHECK — lo que además delata el residuo de una ejecución
--        anterior en vez de dejarlo pasar en silencio.
--     2. RESTAURACIÓN EXPLÍCITA dentro del propio bloque, verificada antes de
--        terminar (12 CHECK, 6 filas de seed, 0 filas de prueba).
--     3. El `begin;…rollback;` de fuera. Y como un DO es UNA sentencia, si algo
--        lanzase a mitad, el rollback implícito de la sentencia también revierte
--        los `drop constraint`.
--
--   Aun así: **NO ejecutar este fichero por trozos.**
--
-- Any failed assertion raises, which aborts and rolls back the whole thing.
-- Success prints one NOTICE per scenario and a final count.
-- ============================================================================
begin;

-- Resultados materializados: este cliente no muestra los NOTICE de plpgsql, y una
-- certificación sin evidencia visible no es evidencia. La tabla es TEMP y muere
-- con el rollback.
create temp table _b2_cert (n int, escenario text, verdicto text, detalle text);

do $$
declare
  v_a       uuid;
  v_b       uuid;
  e         record;                     -- one row of aurix_entitlements()
  n_pass    int := 0;
  v_future  timestamptz := now() + interval '30 days';
  v_past    timestamptz := now() - interval '1 day';
begin
  -- ── PRECONDICIÓN ────────────────────────────────────────────────────────
  -- Se niega a correr sobre un estado que no sea el esperado. Dos razones: no
  -- contaminar datos reales, y detectar que una ejecución ANTERIOR dejó residuo
  -- (que es exactamente el fallo que este fichero podría causar).
  if (select count(*) from public.subscriptions) <> 0
     or (select count(*) from public.entitlement_overrides) <> 0 then
    raise exception 'PRECONDICIÓN: subscriptions/entitlement_overrides no están vacías. '
                    'Residuo de una ejecución previa o datos reales: NO se continúa.';
  end if;
  if (select count(*) from pg_constraint c join pg_class r on r.oid = c.conrelid
       where r.relname = 'subscriptions' and c.contype = 'c') <> 12 then
    raise exception 'PRECONDICIÓN: subscriptions no tiene las 12 CHECK de B1. '
                    'Reponerlas ANTES de certificar (ver el bloque de restauración al final).';
  end if;

  select id into v_a from auth.users order by created_at limit 1;
  select id into v_b from auth.users order by created_at offset 1 limit 1;
  if v_a is null or v_b is null then raise exception 'need two real users to certify isolation'; end if;

  -- helper: act as a given user for the rest of the transaction
  -- (auth.uid() reads request.jwt.claims; `true` scopes it to this transaction)

  -- ══ 1. FREE — no subscription row at all ════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S1: plan=% expected free', e.plan; end if;
  if e.source <> 'default' then raise exception 'S1: source=%', e.source; end if;
  if e.subscription_status <> 'none' then raise exception 'S1: status=%', e.subscription_status; end if;
  if coalesce((e.features->>'workspace.loan')::boolean, true) then raise exception 'S1: workspace.loan granted'; end if;
  if coalesce((e.features->>'intelligence.full')::boolean, true) then raise exception 'S1: intelligence.full granted'; end if;
  if coalesce((e.features->>'premium.settings')::boolean, true) then raise exception 'S1: premium.settings granted'; end if;
  if e.valid_until is not null then raise exception 'S1: valid_until set'; end if;
  -- Contrato: TODAS las claves canónicas, siempre. Sin esto, un mapa vacío haría
  -- pasar todos los asserts de "denegado" sin comprobar nada.
  if (select count(*) from jsonb_object_keys(e.features)) <> 3
    then raise exception 'S1: el mapa no trae las 3 claves canónicas: %', e.features; end if;
  if (select count(*) from jsonb_object_keys(e.feature_sources)) <> 3
    then raise exception 'S1: feature_sources incompleto: %', e.feature_sources; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S1', 'PASS', 'sin fila ⇒ free, las 3 features denegadas');

  -- ══ 2. PREMIUM válido (mensual, periodo vigente) ════════════════════════
  insert into public.subscriptions (user_id, plan, status, provider, billing_interval,
    current_period_start, current_period_end, price_amount_cents, price_currency)
    values (v_a, 'premium','active','stripe','month', now(), v_future, 1499, 'EUR');
  select * into e from public.aurix_entitlements();
  if e.plan <> 'premium' then raise exception 'S2: plan=%', e.plan; end if;
  if e.source <> 'subscription' then raise exception 'S2: source=%', e.source; end if;
  if not coalesce((e.features->>'workspace.loan')::boolean, false) then raise exception 'S2: workspace.loan denied'; end if;
  if not coalesce((e.features->>'intelligence.full')::boolean, false) then raise exception 'S2: intelligence.full denied'; end if;
  if not coalesce((e.features->>'premium.settings')::boolean, false) then raise exception 'S2: premium.settings denied'; end if;
  if e.feature_sources->>'workspace.loan' <> 'plan' then raise exception 'S2: source por feature=%', e.feature_sources->>'workspace.loan'; end if;
  if e.valid_until is null then raise exception 'S2: valid_until nulo en una suscripción con periodo'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S2', 'PASS', 'premium vigente ⇒ las 3 según plan_features, source=plan');

  -- ══ 3. PREMIUM EXPIRADO ⇒ fail closed ═══════════════════════════════════
  update public.subscriptions set current_period_end = v_past, current_period_start = v_past - interval '30 days'
   where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S3: FAIL-OPEN plan=% con periodo expirado', e.plan; end if;
  if coalesce((e.features->>'intelligence.full')::boolean, true) then raise exception 'S3: FAIL-OPEN feature concedida'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S3', 'PASS', 'periodo expirado ⇒ free (fail-closed)');

  -- ══ 4. status canceled / past_due / expired ⇒ no premium ════════════════
  update public.subscriptions set current_period_end = v_future where user_id = v_a;
  update public.subscriptions set status = 'canceled' where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S4: canceled dio plan=%', e.plan; end if;
  update public.subscriptions set status = 'past_due' where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S4: past_due dio plan=%', e.plan; end if;
  update public.subscriptions set status = 'expired' where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S4: expired dio plan=%', e.plan; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S4', 'PASS', 'canceled/past_due/expired ⇒ free');

  -- ══ 5. TRIAL vigente ⇒ premium ══════════════════════════════════════════
  update public.subscriptions set status='trialing', trial_start=now(), trial_end=v_future,
         current_period_end=v_future where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'premium' then raise exception 'S5: trial vigente dio plan=%', e.plan; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S5', 'PASS', 'trial vigente ⇒ premium');

  -- ══ 6. TRIAL CADUCADO pero fila aún `trialing` ⇒ estado RANCIO ⇒ free ═══
  -- trial_start también al pasado: B1 exige trial_end >= trial_start, y la
  -- constraint tiene razón — lo que se quiere simular es un trial que YA terminó,
  -- no uno incoherente.
  update public.subscriptions set trial_start = v_past - interval '14 days', trial_end = v_past
   where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S6: FAIL-OPEN trial rancio dio plan=%', e.plan; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S6', 'PASS', 'trial caducado sin actualizar ⇒ free (estado rancio)');

  -- ══ 7. LIFETIME sin periodo ⇒ premium, sin cota ═════════════════════════
  update public.subscriptions set status='active', billing_interval='lifetime',
         trial_start=null, trial_end=null, current_period_start=null, current_period_end=null,
         price_amount_cents=9900 where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'premium' then raise exception 'S7: lifetime dio plan=%', e.plan; end if;
  if e.valid_until is not null then raise exception 'S7: lifetime con valid_until=%', e.valid_until; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S7', 'PASS', 'lifetime ⇒ premium sin cota');

  -- ══ 8. OVERRIDE DENY sobre una feature que el plan SÍ incluye ═══════════
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, 'workspace.loan', false, 'support');
  select * into e from public.aurix_entitlements();
  if coalesce((e.features->>'workspace.loan')::boolean, true) then raise exception 'S8: el override deny no denegó'; end if;
  if not coalesce((e.features->>'intelligence.full')::boolean, false) then raise exception 'S8: denegó de más'; end if;
  if e.feature_sources->>'workspace.loan' <> 'override' then raise exception 'S8: source=%', e.feature_sources->>'workspace.loan'; end if;
  if e.plan <> 'premium' then raise exception 'S8: el override cambió el plan'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S8', 'PASS', 'override deny quita UNA feature incluida por el plan, sin tocar el resto');

  -- ══ 9. OVERRIDE EXPIRADO ⇒ ningún efecto (ni conceder ni denegar) ═══════
  update public.entitlement_overrides set starts_at = v_past - interval '10 days', expires_at = v_past
   where user_id = v_a and feature_key = 'workspace.loan';
  select * into e from public.aurix_entitlements();
  if not coalesce((e.features->>'workspace.loan')::boolean, false) then raise exception 'S9: un override EXPIRADO siguió denegando'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S9', 'PASS', 'override expirado ⇒ sin efecto en ninguna dirección');

  -- ══ 10. OVERRIDE AÚN NO VIGENTE ⇒ ningún efecto ════════════════════════
  update public.entitlement_overrides set starts_at = v_future, expires_at = null
   where user_id = v_a and feature_key = 'workspace.loan';
  select * into e from public.aurix_entitlements();
  if not coalesce((e.features->>'workspace.loan')::boolean, false) then raise exception 'S10: un override FUTURO ya denegaba'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S10', 'PASS', 'override con starts_at futuro ⇒ sin efecto todavía');
  delete from public.entitlement_overrides where user_id = v_a;

  -- ══ 11. OVERRIDE ALLOW sobre un usuario FREE (founder/comp) ═════════════
  delete from public.subscriptions where user_id = v_a;
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, 'intelligence.full', true, 'founder');
  select * into e from public.aurix_entitlements();
  if not coalesce((e.features->>'intelligence.full')::boolean, false) then raise exception 'S11: el override allow no concedió'; end if;
  if coalesce((e.features->>'workspace.loan')::boolean, true) then raise exception 'S11: concedió de más'; end if;
  if e.plan <> 'free' then raise exception 'S11: FOUNDER CONTAMINA — plan=%', e.plan; end if;
  if e.source <> 'default' then raise exception 'S11: FOUNDER CONTAMINA — source=%', e.source; end if;
  if e.feature_sources->>'intelligence.full' <> 'override' then raise exception 'S11: source por feature=%', e.feature_sources->>'intelligence.full'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S11', 'PASS', 'override allow concede UNA feature y el plan sigue FREE (founder ≠ pagador)');

  -- ══ 12. GLOBAL '*' ALLOW ⇒ todas, plan sigue free ══════════════════════
  delete from public.entitlement_overrides where user_id = v_a;
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, '*', true, 'founder');
  select * into e from public.aurix_entitlements();
  if not coalesce((e.features->>'workspace.loan')::boolean, false)
     or not coalesce((e.features->>'intelligence.full')::boolean, false)
     or not coalesce((e.features->>'premium.settings')::boolean, false)
    then raise exception 'S12: el override global no concedió todo: %', e.features; end if;
  if e.plan <> 'free' or e.source <> 'default' then raise exception 'S12: FOUNDER CONTAMINA plan=% source=%', e.plan, e.source; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S12', 'PASS', 'override global ''*'' ⇒ las 3, y el plan sigue FREE');

  -- ══ 13. GLOBAL ALLOW + ESPECÍFICO DENY ⇒ gana el específico ════════════
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, 'workspace.loan', false, 'support');
  select * into e from public.aurix_entitlements();
  if coalesce((e.features->>'workspace.loan')::boolean, true) then raise exception 'S13: el específico no venció al global'; end if;
  if not coalesce((e.features->>'intelligence.full')::boolean, false) then raise exception 'S13: el global dejó de conceder el resto'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S13', 'PASS', 'ALLOW global + deny específico ⇒ gana el específico (el allow sí se refina)');

  -- ══ 14. GLOBAL '*' DENY sobre un premium de pago ⇒ todo denegado ═══════
  delete from public.entitlement_overrides where user_id = v_a;
  insert into public.subscriptions (user_id, plan, status, provider, billing_interval,
    current_period_end, price_amount_cents, price_currency)
    values (v_a,'premium','active','stripe','month', v_future, 1499,'EUR');
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, '*', false, 'support');
  select * into e from public.aurix_entitlements();
  if coalesce((e.features->>'workspace.loan')::boolean, true)
     or coalesce((e.features->>'intelligence.full')::boolean, true)
     or coalesce((e.features->>'premium.settings')::boolean, true)
    then raise exception 'S14: el deny global no denegó: %', e.features; end if;
  if e.plan <> 'premium' then raise exception 'S14: el deny global borró el plan comercial'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S14', 'PASS', 'deny global revoca las features y CONSERVA el hecho comercial (sigue pagando)');

  -- ══ 15. OVERRIDE de una clave FUERA del catálogo ⇒ ignorado ════════════
  delete from public.entitlement_overrides where user_id = v_a;
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, 'workspace.templates', true, 'qa');
  select * into e from public.aurix_entitlements();
  if e.features ? 'workspace.templates' then raise exception 'S15: un override INVENTÓ una capacidad'; end if;
  if (select count(*) from jsonb_object_keys(e.features)) <> 3 then raise exception 'S15: nº de claves=%', e.features; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S15', 'PASS', 'un override no puede inventar una capacidad ausente del catálogo');
  delete from public.entitlement_overrides where user_id = v_a;

  -- ══ 16. AISLAMIENTO A/B ════════════════════════════════════════════════
  -- A es premium de pago; B no tiene nada. B no debe heredar NADA.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S16: FUGA — B recibió plan=% de A', e.plan; end if;
  if coalesce((e.features->>'intelligence.full')::boolean, true) then raise exception 'S16: FUGA — B recibió una feature de A'; end if;
  if e.subscription_status <> 'none' then raise exception 'S16: FUGA — B ve status=%', e.subscription_status; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S16', 'PASS', 'B jamás hereda el entitlement de A');

  -- ══ 17. SIN SESIÓN (auth.uid() null) ⇒ free ════════════════════════════
  perform set_config('request.jwt.claims', '', true);
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S17: sin sesión dio plan=%', e.plan; end if;
  if coalesce((e.features->>'premium.settings')::boolean, true) then raise exception 'S17: sin sesión concedió una feature'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S17', 'PASS', 'sin sesión ⇒ free');

  -- ══ 18. FILA MALFORMADA / ESTADO NO RECONOCIDO ⇒ no premium ════════════
  -- Se retiran temporalmente dos CHECK de B1 para poder ESCRIBIR estados que B1
  -- hace inalcanzables. Es a propósito: si el fail-closed del resolver dependiera
  -- de una constraint de otra capa, no sería fail-closed. El rollback las repone.
  alter table public.subscriptions drop constraint subscriptions_status_chk;
  alter table public.subscriptions drop constraint subscriptions_plan_chk;
  alter table public.subscriptions drop constraint subscriptions_premium_bound_chk;
  alter table public.subscriptions drop constraint subscriptions_premium_price_chk;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);

  update public.subscriptions set status = 'god_mode' where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S18a: FAIL-OPEN status desconocido dio plan=%', e.plan; end if;
  if e.subscription_status <> 'unrecognized' then raise exception 'S18a: status publicado=%', e.subscription_status; end if;
  if coalesce((e.features->>'intelligence.full')::boolean, true) then raise exception 'S18a: FAIL-OPEN feature concedida'; end if;

  update public.subscriptions set status = 'active', plan = 'founder' where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S18b: FAIL-OPEN plan=founder dio plan=%', e.plan; end if;
  if coalesce((e.features->>'intelligence.full')::boolean, true) then raise exception 'S18b: FAIL-OPEN plan founder concedió'; end if;

  -- fila premium PARCIAL (sin cota ni importe): el fail-open que B1 cerró, ahora
  -- también cerrado independientemente por el resolver.
  update public.subscriptions set plan='premium', status='active', billing_interval=null,
         current_period_end=null, price_amount_cents=null, price_currency=null where user_id = v_a;
  select * into e from public.aurix_entitlements();
  if e.plan <> 'free' then raise exception 'S18c: FAIL-OPEN fila premium parcial dio plan=%', e.plan; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S18', 'PASS', 'status desconocido, plan founder y fila premium PARCIAL ⇒ free (sin depender de las CHECK)');

  -- ══ 19. PRIVACIDAD: nada del sistema de pago en la respuesta ═══════════
  update public.subscriptions set plan='premium', status='active', billing_interval='month',
         current_period_end=v_future, price_amount_cents=1499, price_currency='EUR',
         provider_customer_id='cus_SECRETO', provider_subscription_id='sub_SECRETO',
         last_event_id='evt_SECRETO' where user_id = v_a;
  select * into e from public.aurix_entitlements();
  -- strpos, NO like: en LIKE el `_` es comodín de UN carácter, así que '%sub_%'
  -- casaría con "subscription" (el valor legítimo de `source`) y el assert daría
  -- una fuga falsa. Comparación literal.
  if strpos(e::text, 'SECRETO') > 0 then raise exception 'S19: FUGA de identificador de proveedor: %', e::text; end if;
  if strpos(e::text, '1499')    > 0 then raise exception 'S19: FUGA del importe: %', e::text; end if;
  if strpos(e::text, 'cus_')    > 0 then raise exception 'S19: FUGA de provider_customer_id'; end if;
  if strpos(e::text, 'evt_')    > 0 then raise exception 'S19: FUGA de last_event_id'; end if;
  insert into _b2_cert values (0, 'S19-RAW', 'EVIDENCIA', e::text);
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S19', 'PASS', 'ni provider IDs, ni event ID, ni importe en la respuesta');

  -- ══ 20. DENY GLOBAL vs ALLOW ESPECÍFICO PREEXISTENTE ⇒ el deny MANDA ═══
  -- El caso de abuso real: queda un grant de QA sin caducidad y soporte corta
  -- con '*'. Si el específico venciera, el kill switch no mataría.
  delete from public.entitlement_overrides where user_id = v_a;
  delete from public.subscriptions where user_id = v_a;
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, 'intelligence.full', true, 'qa');
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, '*', false, 'support');
  select * into e from public.aurix_entitlements();
  if coalesce((e.features->>'intelligence.full')::boolean, true)
    then raise exception 'S20: KILL SWITCH ROTO — un grant de QA sobrevivió al deny global'; end if;
  if coalesce((e.features->>'workspace.loan')::boolean, true)
    then raise exception 'S20: el deny global no denegó todo'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S20', 'PASS',
    'deny global ABSOLUTO: vence a un allow específico preexistente (kill switch real)');

  -- ══ 21. AISLAMIENTO DE OVERRIDES A/B ══════════════════════════════════
  -- S16 aisla suscripciones; esto aisla OVERRIDES, que es el camino por el que
  -- un founder podría filtrar acceso a todo el mundo.
  delete from public.entitlement_overrides where user_id = v_a;
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason)
    values (v_a, '*', true, 'founder');
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  select * into e from public.aurix_entitlements();
  if coalesce((e.features->>'intelligence.full')::boolean, true)
     or coalesce((e.features->>'workspace.loan')::boolean, true)
     or coalesce((e.features->>'premium.settings')::boolean, true)
    then raise exception 'S21: FUGA — B heredó el override global de A: %', e.features; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S21', 'PASS', 'B no hereda el override global ''*'' de A');
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  delete from public.entitlement_overrides where user_id = v_a;

  -- ══ 22. cancel_at_period_end con periodo VIGENTE ⇒ SIGUE premium ══════
  -- El estado real de Stripe tras cancelar: ya pagó el periodo en curso y no
  -- puede perder el acceso antes de que termine. Fail-closed no es fail-mean.
  insert into public.subscriptions (user_id, plan, status, provider, billing_interval,
    current_period_end, cancel_at_period_end, price_amount_cents, price_currency)
    values (v_a,'premium','active','stripe','month', v_future, true, 1499,'EUR');
  select * into e from public.aurix_entitlements();
  if e.plan <> 'premium' then raise exception 'S22: perdió el acceso alguien que YA PAGÓ el periodo'; end if;
  if not coalesce((e.features->>'intelligence.full')::boolean, false)
    then raise exception 'S22: features denegadas a un periodo pagado y vigente'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S22', 'PASS',
    'cancel_at_period_end con periodo vigente ⇒ sigue premium (no se castiga a quien pagó)');

  -- ══ 23. expires_at EXACTAMENTE = now() ⇒ ya no actúa (ventana semiabierta) ══
  delete from public.entitlement_overrides where user_id = v_a;
  insert into public.entitlement_overrides (user_id, feature_key, allowed, reason, starts_at, expires_at)
    values (v_a, 'workspace.loan', false, 'support', now() - interval '1 hour', now());
  select * into e from public.aurix_entitlements();
  if not coalesce((e.features->>'workspace.loan')::boolean, false)
    then raise exception 'S23: un override con expires_at = now() siguió actuando'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S23', 'PASS', 'expires_at = now() ⇒ fuera de ventana (semiabierta)');
  delete from public.entitlement_overrides where user_id = v_a;

  -- ══ 24. CATÁLOGO DEGRADADO ⇒ features denegadas, y `plan` NO es una puerta ══
  -- Si plan_features se vacía, `features` cae a denegado (fail-closed) mientras
  -- `plan` sigue diciendo la verdad comercial: el usuario PAGA. Esa divergencia es
  -- intencionada, y es exactamente por lo que `features` es la ÚNICA autoridad de
  -- acceso y `plan` nunca es una puerta. B3 debe leer features, jamás plan.
  delete from public.plan_features;
  select * into e from public.aurix_entitlements();
  if (select count(*) from jsonb_object_keys(e.features)) <> 0
    then raise exception 'S24: catálogo vacío y aun así hay features: %', e.features; end if;
  -- Aquí la AUSENCIA de clave es el resultado correcto, así que el coalesce(...,true)
  -- que protege de la vacuidad en el resto de escenarios no sirve: se comprueba la
  -- propiedad de verdad — ninguna clave concede.
  if exists (select 1 from jsonb_each(e.features) t where t.value::text = 'true')
    then raise exception 'S24: FAIL-OPEN con catálogo vacío: %', e.features; end if;
  if e.plan <> 'premium' then raise exception 'S24: se borró el hecho comercial (el usuario sí paga)'; end if;
  n_pass := n_pass + 1;
  insert into _b2_cert values (n_pass, 'S24', 'PASS',
    'catálogo vacío ⇒ CERO features (fail-closed) y `plan` conserva el hecho comercial ⇒ plan NO es una puerta');

  -- ══ RESTAURACIÓN EXPLÍCITA ════════════════════════════════════════════
  -- NO se delega en el rollback. Si este bloque se ejecutase sin la transacción
  -- —un `begin;` que no entró, un cliente que trocea sentencias, un highlight
  -- parcial en el editor SQL— el rollback no existe, y `create table if not
  -- exists` de B1 NO repone un CHECK perdido. Así que el propio bloque deshace
  -- todo lo que hizo, y el SELECT posterior lo verifica.
  delete from public.entitlement_overrides where user_id in (v_a, v_b);
  delete from public.subscriptions        where user_id in (v_a, v_b);

  -- S24 vacía plan_features: reponer el seed de B1 tal cual.
  insert into public.plan_features (plan, feature_key, allowed) values
    ('free','workspace.loan',false), ('free','intelligence.full',false), ('free','premium.settings',false),
    ('premium','workspace.loan',true), ('premium','intelligence.full',true), ('premium','premium.settings',true)
  on conflict (plan, feature_key) do update set allowed = excluded.allowed;
  if (select count(*) from public.plan_features) <> 6 then
    raise exception 'RESTAURACIÓN FALLIDA: plan_features no vuelve a tener 6 filas';
  end if;

  alter table public.subscriptions add constraint subscriptions_plan_chk
    check (plan in ('free','premium'));
  alter table public.subscriptions add constraint subscriptions_status_chk
    check (status in ('active','trialing','past_due','canceled','expired'));
  alter table public.subscriptions add constraint subscriptions_premium_bound_chk
    check (plan <> 'premium'
           or status not in ('active','trialing')
           or current_period_end is not null
           or billing_interval is not distinct from 'lifetime');
  alter table public.subscriptions add constraint subscriptions_premium_price_chk
    check (plan <> 'premium'
           or status not in ('active','trialing')
           or price_amount_cents is not null);

  if (select count(*) from pg_constraint c join pg_class r on r.oid = c.conrelid
       where r.relname = 'subscriptions' and c.contype = 'c') <> 12 then
    raise exception 'RESTAURACIÓN FALLIDA: subscriptions no vuelve a tener 12 CHECK';
  end if;
  if (select count(*) from public.subscriptions) <> 0
     or (select count(*) from public.entitlement_overrides) <> 0 then
    raise exception 'RESTAURACIÓN FALLIDA: quedaron filas de prueba';
  end if;
  insert into _b2_cert values (99, 'RESTORE', 'PASS',
    '4 CHECK repuestas explícitamente y 0 filas de prueba — sin depender del rollback');

  if n_pass <> 24 then raise exception 'faltan escenarios: sólo % de 24', n_pass; end if;
end $$;

-- Estado real ANTES de revertir: si esto no dice 12/0/0/6, el fichero ha dejado
-- producción peor de como la encontró y hay que arreglarlo a mano.
select (select count(*) from pg_constraint c join pg_class r on r.oid = c.conrelid
         where r.relname = 'subscriptions' and c.contype = 'c') as checks_subscriptions,
       (select count(*) from public.subscriptions)         as filas_subscriptions,
       (select count(*) from public.entitlement_overrides) as filas_overrides,
       (select count(*) from public.plan_features)         as filas_plan_features;

select n, escenario, verdicto, detalle from _b2_cert order by n;

rollback;
