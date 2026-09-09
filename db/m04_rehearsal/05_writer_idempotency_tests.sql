-- ============================================================================
-- M.04 ENSAYO · PASO 5 — PRUEBAS DEL WRITER / IDEMPOTENCIA  (SIN STRIPE)
-- ----------------------------------------------------------------------------
-- *** NO EJECUTADO. Artefacto preparatorio. ***
-- psql -v ON_ERROR_STOP=1 -f db/m04_rehearsal/05_writer_idempotency_tests.sql
--
--   REGLA DE INVOCACIÓN: este fichero abre y cierra su PROPIA transacción, así
--   que se ejecuta SIN `-1`. Añadir `-1` anida un BEGIN sobre otro y hace que el
--   commit/rollback interno y el de psql dejen de significar lo mismo.
--
-- ¡¡NUNCA con `supabase db query --linked`!!  `--linked` apunta al proyecto
-- vinculado, que es PRODUCCIÓN. Este fichero se ejecuta contra el entorno
-- desechable y sólo contra él (lo fuerza el guard de más abajo).
--
-- Ejecuta las DOS funciones M.04 contra Postgres real, con filas reales del
-- entorno de ensayo, para las garantías que el APPLY dejó declaradas como "lo
-- que el gate no puede ejecutar" (sección 2b de la migración). No reimplementa
-- la lógica: las respuestas las da la función.
--
-- SIN STRIPE, y eso no es una limitación sino el punto: el writer decide desde
-- billing_customers y billing_prices, no desde el payload. Un evento fabricado
-- a mano ejerce exactamente el mismo camino que uno firmado. El E2E con Stripe
-- TEST (firma, extractor del webhook, red) es un bloque POSTERIOR y prueba otra
-- cosa: el transporte, no la decisión.
--
-- ESTRUCTURA: todo dentro de `begin; … rollback;`, con los resultados
-- materializados en una tabla TEMP porque un NOTICE puede no mostrarse. Se
-- reutiliza el patrón ya certificado en db/monetization_b2_resolver_certification.sql.
-- Al terminar, la base queda EXACTAMENTE como estaba: el rollback se lleva los
-- usuarios de fixture, el precio, el mapeo, el ledger y las subscriptions.
--
-- NO CUBIERTO POR ESTE FICHERO (residual declarado, no olvidado):
--   · La serialización del `for update` entre DOS reintentos CONCURRENTES. Una
--     transacción no puede competir consigo misma. Exige dos sesiones psql
--     simultáneas y es una prueba MANUAL: ver §6.b del plan.
--   · La verificación de firma de Stripe y el extractor de api/billing/webhook.mjs.
--     No son SQL. Van en el E2E posterior.
-- ============================================================================

do $$
begin
  if to_regclass('public.user_portfolios') is not null then
    raise exception 'GUARD DE ENSAYO: esta es la BD de Aurix. Abortado.';
  end if;
  if to_regprocedure('public.aurix_billing_apply_event(text,text,text,text,text,text,text,'
                     'timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,'
                     'timestamptz)') is null then
    raise exception 'PRECONDICIÓN: M.04 no está aplicado en este entorno.';
  end if;
end $$;

-- ── PUERTA · sólo se prueba un APPLY ya certificado ─────────────────────────
-- Sin el gate POST_APPLY, estas pruebas podrían correr sobre un M.04 de forma
-- incorrecta y sus PASS no significarían nada: mediríamos un writer que no es
-- el que se va a desplegar.
do $$
declare
  v_g   record;
  v_run uuid;
begin
  if to_regclass('m04_rehearsal.gates') is null then
    raise exception 'BLOCKED: no hay andamiaje de ensayo. Ejecuta los pasos 1-4.';
  end if;
  select run_id into v_run from m04_rehearsal.run;
  select * into v_g from m04_rehearsal.gates where gate = 'POST_APPLY';
  if not found or v_g.verdict <> 'PASS' or v_g.run_id <> v_run then
    raise exception 'BLOCKED: POST_APPLY no es PASS para este run (paso 4).';
  end if;
end $$;

begin;

create temp table _m04_wr (n text primary key, escenario text, verdicto text, detalle text);

do $$
declare
  v_a       uuid := gen_random_uuid();
  v_b       uuid := gen_random_uuid();
  v_price   text := 'price_TEST_MONTH_0001';
  v_cus_a   text := 'cus_TEST_A_0001';
  v_cus_b   text := 'cus_TEST_B_0001';
  v_cus_x   text := 'cus_TEST_SIN_MAPEO';
  r         jsonb;
  s         public.subscriptions;
  e         public.billing_events;
  t0        timestamptz := now();
  v_n       int;
  v_txt     text;
  v_json    jsonb;
  n_pass    int := 0;
begin
  -- ── FIXTURES ──────────────────────────────────────────────────────────────
  -- Cuentas propias, creadas aquí y desechadas por el rollback. No se toca
  -- ninguna cuenta preexistente: el ensayo no debe depender de qué usuarios
  -- haya, ni dejarles estado comercial.
  insert into auth.users (id, email) values
    (v_a, 'm04-fixture-a@example.invalid'),
    (v_b, 'm04-fixture-b@example.invalid');

  insert into public.billing_prices
    (provider, provider_price_id, plan, billing_interval, amount_cents, currency, trial_days, active)
  values
    ('stripe', v_price, 'premium', 'month', 799, 'EUR', 0, true);

  -- ══ L1 · link_customer crea el mapeo y devuelve el handle ════════════════
  v_txt := public.aurix_billing_link_customer(v_a, 'stripe', v_cus_a);
  if v_txt <> v_cus_a then
    raise exception 'L1: devolvió % en vez de %', v_txt, v_cus_a;
  end if;
  select count(*) into v_n from public.billing_customers
   where provider='stripe' and user_id=v_a;
  if v_n <> 1 then raise exception 'L1: % filas de mapeo', v_n; end if;
  insert into _m04_wr values ('L1','link_customer crea y devuelve el handle','PASS',v_txt);
  n_pass := n_pass + 1;

  -- ══ L2 · IDEMPOTENTE: segunda llamada reutiliza, no acumula ══════════════
  -- Es lo que evita que un doble clic en "Suscribirse" genere dos customers
  -- de Stripe y, más tarde, dos suscripciones cobrándose a la vez.
  v_txt := public.aurix_billing_link_customer(v_a, 'stripe', 'cus_TEST_OTRO_HANDLE');
  if v_txt <> v_cus_a then
    raise exception 'L2: re-apuntó el mapeo a % (debía conservar %)', v_txt, v_cus_a;
  end if;
  select count(*) into v_n from public.billing_customers where user_id = v_a;
  if v_n <> 1 then raise exception 'L2: % filas para el mismo usuario', v_n; end if;
  insert into _m04_wr values ('L2','link_customer idempotente (no acumula customers)','PASS',v_txt);
  n_pass := n_pass + 1;

  -- ══ L3 · FAIL-CLOSED: un handle ya usado NO se re-apunta a otro usuario ══
  -- Re-apuntarlo sería fuga entre cuentas: un pago entitlando a dos.
  begin
    v_txt := public.aurix_billing_link_customer(v_b, 'stripe', v_cus_a);
    raise exception 'L3: NO lanzó — aceptó re-apuntar un customer ajeno';
  exception
    when others then
      -- Re-lanzar nuestra propia asercion, y no dar por buena una excepcion
      -- CUALQUIERA: un error de tipo o de nombre tambien "lanza" y pasaria por
      -- fail-closed sin serlo.
      if sqlerrm like 'L3:%' then raise; end if;
      if position('another user' in sqlerrm) = 0 then
        raise exception 'L3: excepción inesperada (no es el fail-closed): %', sqlerrm;
      end if;
  end;
  select count(*) into v_n from public.billing_customers where provider='stripe'
     and provider_customer_id = v_cus_a;
  if v_n <> 1 then raise exception 'L3: el mapeo se duplicó'; end if;
  insert into _m04_wr values ('L3','handle ajeno ⇒ raise, sin re-apuntar','PASS',null);
  n_pass := n_pass + 1;

  -- ══ L4 · argumento nulo ⇒ raise ══════════════════════════════════════════
  begin
    v_txt := public.aurix_billing_link_customer(null, 'stripe', v_cus_b);
    raise exception 'L4: NO lanzó con user_id nulo';
  exception
    when others then
      if sqlerrm like 'L4:%' then raise; end if;
      if position('null argument' in sqlerrm) = 0 then
        raise exception 'L4: excepción inesperada: %', sqlerrm;
      end if;
  end;
  insert into _m04_wr values ('L4','argumento nulo ⇒ raise','PASS',null);
  n_pass := n_pass + 1;

  -- ══ A1 · CAMINO FELIZ: concede premium con periodo ═══════════════════════
  r := public.aurix_billing_apply_event(
         'stripe','evt_A1','customer.subscription.created',
         v_cus_a,'sub_TEST_1',v_price,'active',
         t0, t0 + interval '30 days', false, null, null, null, t0);
  if r->>'outcome' <> 'applied' then raise exception 'A1: outcome=%', r->>'outcome'; end if;
  select * into s from public.subscriptions where user_id = v_a;
  if s.plan <> 'premium' or s.status <> 'active' then
    raise exception 'A1: plan=% status=%', s.plan, s.status;
  end if;
  -- El precio y el intervalo salen del CATÁLOGO, no del payload: eso es lo que
  -- se comprueba aquí, no que "se escribió algo".
  if s.price_amount_cents <> 799 or s.price_currency <> 'EUR'
     or s.billing_interval <> 'month' then
    raise exception 'A1: precio/intervalo no vienen del catálogo (%,%,%)',
                     s.price_amount_cents, s.price_currency, s.billing_interval;
  end if;
  if s.provider <> 'stripe' or s.last_event_id <> 'evt_A1' then
    raise exception 'A1: provider/last_event_id incorrectos';
  end if;
  insert into _m04_wr values ('A1','applied · premium con periodo · precio del catálogo','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A2 · MISMO event_id DOS VECES ════════════════════════════════════════
  -- Primera válida, segunda 'duplicate' SIN duplicar ni corromper. Se compara
  -- la fila ENTERA antes y después, no sólo el outcome: un duplicate que
  -- "aplicase igual" daría el mismo outcome y sería indetectable mirando sólo
  -- el retorno.
  declare
    v_antes jsonb := to_jsonb(s);
  begin
    r := public.aurix_billing_apply_event(
           'stripe','evt_A1','customer.subscription.created',
           v_cus_a,'sub_TEST_1',v_price,'active',
           t0, t0 + interval '30 days', false, null, null, null, t0);
    if r->>'outcome' <> 'duplicate' then
      raise exception 'A2: outcome=% (esperado duplicate)', r->>'outcome';
    end if;
    select * into s from public.subscriptions where user_id = v_a;
    if to_jsonb(s) is distinct from v_antes then
      raise exception 'A2: la fila CAMBIÓ en un duplicate';
    end if;
    select count(*) into v_n from public.billing_events
     where provider='stripe' and event_id='evt_A1';
    if v_n <> 1 then raise exception 'A2: % filas en el ledger para evt_A1', v_n; end if;
    select count(*) into v_n from public.subscriptions where user_id = v_a;
    if v_n <> 1 then raise exception 'A2: % filas de subscription', v_n; end if;
  end;
  insert into _m04_wr values ('A2','mismo event_id 2x ⇒ duplicate, sin duplicar ni corromper','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A3 · UN RECHAZO ES REINTENTABLE ══════════════════════════════════════
  -- El defecto que la propia migración documenta: un evento rechazado por
  -- mapeo ausente NO puede quedar quemado como duplicado, porque el arreglo
  -- natural es corregir el mapeo y reenviar el MISMO evento desde el
  -- dashboard. Si se descartara, sería una compra cobrada que nunca concede.
  r := public.aurix_billing_apply_event(
         'stripe','evt_A3','customer.subscription.created',
         v_cus_x,'sub_TEST_3',v_price,'active',
         t0, t0 + interval '30 days', false, null, null, null, t0 + interval '1 min');
  if r->>'outcome' <> 'unknown_customer' then
    raise exception 'A3a: outcome=%', r->>'outcome';
  end if;
  select * into e from public.billing_events where provider='stripe' and event_id='evt_A3';
  if e.applied then raise exception 'A3a: quedó applied=true'; end if;

  perform public.aurix_billing_link_customer(v_b, 'stripe', v_cus_x);
  r := public.aurix_billing_apply_event(
         'stripe','evt_A3','customer.subscription.created',
         v_cus_x,'sub_TEST_3',v_price,'active',
         t0, t0 + interval '30 days', false, null, null, null, t0 + interval '1 min');
  if r->>'outcome' <> 'applied' then
    raise exception 'A3b: el reintento dio % (esperado applied)', r->>'outcome';
  end if;
  select * into s from public.subscriptions where user_id = v_b;
  if s.plan <> 'premium' then raise exception 'A3b: plan=%', s.plan; end if;
  insert into _m04_wr values ('A3','rechazo REINTENTABLE con el mismo event_id','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A4 · PERIODO AUSENTE ⇒ rechazo con causa, no excepción ═══════════════
  -- Sin el guard, el CHECK subscriptions_premium_bound_chk ESTALLA, el ledger
  -- se va con el rollback y Stripe reintenta el mismo payload hasta agotarse:
  -- cobrado, sin premium y sin forense. Se exige CERO filas nuevas.
  declare
    v_subs_antes int;
  begin
    select count(*) into v_subs_antes from public.subscriptions;
    r := public.aurix_billing_apply_event(
           'stripe','evt_A4','customer.subscription.created',
           v_cus_a,'sub_TEST_1',v_price,'active',
           t0, NULL, false, null, null, null, t0 + interval '2 min');
    if r->>'outcome' <> 'missing_period' then
      raise exception 'A4: outcome=%', r->>'outcome';
    end if;
    select count(*) into v_n from public.subscriptions;
    if v_n <> v_subs_antes then raise exception 'A4: creó filas de subscription'; end if;
    select * into e from public.billing_events where event_id='evt_A4';
    if e.applied or e.outcome <> 'missing_period' then
      raise exception 'A4: ledger applied=% outcome=%', e.applied, e.outcome;
    end if;
  end;
  insert into _m04_wr values ('A4','periodo ausente ⇒ missing_period reintentable, 0 filas','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A5 · TRIAL SIN FIN ⇒ el mismo fail-open por la vía del trial ═════════
  r := public.aurix_billing_apply_event(
         'stripe','evt_A5','customer.subscription.created',
         v_cus_a,'sub_TEST_1',v_price,'trialing',
         t0, t0 + interval '30 days', false, t0, NULL, null, t0 + interval '3 min');
  if r->>'outcome' <> 'missing_period' then
    raise exception 'A5: outcome=%', r->>'outcome';
  end if;
  insert into _m04_wr values ('A5','trialing sin trial_end ⇒ missing_period','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A6 · PRECIO NO MAPEADO ⇒ no se puede decir QUÉ se compró ═════════════
  r := public.aurix_billing_apply_event(
         'stripe','evt_A6','customer.subscription.updated',
         v_cus_a,'sub_TEST_1','price_QUE_NO_EXISTE','active',
         t0, t0 + interval '30 days', false, null, null, null, t0 + interval '4 min');
  if r->>'outcome' <> 'unknown_price' then
    raise exception 'A6: outcome=%', r->>'outcome';
  end if;
  insert into _m04_wr values ('A6','precio no mapeado ⇒ unknown_price, no concede','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A7 · STATUS DESCONOCIDO **DEGRADA**, no congela ══════════════════════
  -- La doctrina: una anomalía comercial puede quitar acceso y nunca concederlo.
  r := public.aurix_billing_apply_event(
         'stripe','evt_A7','customer.subscription.updated',
         v_cus_a,'sub_TEST_1',v_price,'paused',
         t0, t0 + interval '30 days', false, null, null, null, t0 + interval '5 min');
  if r->>'outcome' <> 'unknown_status' then
    raise exception 'A7: outcome=%', r->>'outcome';
  end if;
  select * into s from public.subscriptions where user_id = v_a;
  if s.plan <> 'free' or s.status <> 'expired' then
    raise exception 'A7: quedó plan=% status=% (debía degradar)', s.plan, s.status;
  end if;
  insert into _m04_wr values ('A7','status desconocido ⇒ degrada a free/expired','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A8 · EMPATE DE SEGUNDO: un `created` no pisa a un `updated` del mismo ts
  -- `event.created` de Stripe tiene resolución de SEGUNDO y el orden de entrega
  -- no está garantizado. Sin el desempate por rango, un `created` (incomplete)
  -- entregado DESPUÉS de su `updated` (active) degradaba a quien acababa de pagar.
  declare
    v_tie timestamptz := t0 + interval '10 min';
  begin
    r := public.aurix_billing_apply_event(
           'stripe','evt_A8u','customer.subscription.updated',
           v_cus_a,'sub_TEST_1',v_price,'active',
           t0, t0 + interval '30 days', false, null, null, null, v_tie);
    if r->>'outcome' <> 'applied' then raise exception 'A8a: outcome=%', r->>'outcome'; end if;

    r := public.aurix_billing_apply_event(
           'stripe','evt_A8c','customer.subscription.created',
           v_cus_a,'sub_TEST_1',v_price,'active',
           t0, t0 + interval '30 days', false, null, null, null, v_tie);
    if r->>'outcome' <> 'stale' then
      raise exception 'A8b: outcome=% (esperado stale por empate de ts)', r->>'outcome';
    end if;
    select * into s from public.subscriptions where user_id = v_a;
    if s.last_event_id <> 'evt_A8u' then
      raise exception 'A8b: el created pisó al updated (last_event_id=%)', s.last_event_id;
    end if;
  end;
  insert into _m04_wr values ('A8','empate de segundo ⇒ desempate por ciclo de vida (stale)','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A9 · EVENTO ESTRICTAMENTE ANTIGUO ⇒ stale ════════════════════════════
  r := public.aurix_billing_apply_event(
         'stripe','evt_A9','customer.subscription.updated',
         v_cus_a,'sub_TEST_1',v_price,'active',
         t0, t0 + interval '30 days', false, null, null, null, t0 - interval '1 day');
  if r->>'outcome' <> 'stale' then raise exception 'A9: outcome=%', r->>'outcome'; end if;
  insert into _m04_wr values ('A9','evento fuera de orden ⇒ stale (no resucita estado)','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A10 · TIPO IGNORADO deja rastro y no escribe ═════════════════════════
  -- Se resuelve ANTES de buscar el customer, para que un invoice.payment_failed
  -- no se registre como 'unknown_customer' y contamine el diagnóstico de mapeo.
  declare
    v_antes jsonb;
  begin
    select to_jsonb(x) into v_antes from public.subscriptions x where user_id = v_a;
    r := public.aurix_billing_apply_event(
           'stripe','evt_A10','invoice.payment_failed',
           v_cus_a,'sub_TEST_1',v_price,'ignored',
           null, null, null, null, null, null, t0 + interval '20 min');
    if r->>'outcome' <> 'ignored_type' then
      raise exception 'A10: outcome=%', r->>'outcome';
    end if;
    select to_jsonb(x) into v_json from public.subscriptions x where user_id = v_a;
    if v_json is distinct from v_antes then
      raise exception 'A10: un tipo ignorado modificó la subscription';
    end if;
    select * into e from public.billing_events where event_id='evt_A10';
    if e.applied then raise exception 'A10: quedó applied=true'; end if;
  end;
  insert into _m04_wr values ('A10','tipo ignorado ⇒ ignored_type, rastro y 0 escritura','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A11 · UNA CANCELACIÓN SÓLO CANCELA LO SUYO ═══════════════════════════
  -- Con dos suscripciones vivas, el `deleted` de la duplicada no puede poner la
  -- cuenta en Free mientras la otra sigue cobrándose.
  declare
    v_t timestamptz := t0 + interval '30 min';
  begin
    -- dejar la cuenta B premium vigente sobre sub_TEST_3 (ya lo está por A3b)
    select * into s from public.subscriptions where user_id = v_b;
    if s.plan <> 'premium' or s.status <> 'active' then
      raise exception 'A11: precondición — B no está premium vigente';
    end if;
    r := public.aurix_billing_apply_event(
           'stripe','evt_A11','customer.subscription.deleted',
           v_cus_x,'sub_TEST_OTRA',v_price,'canceled',
           t0, t0 + interval '30 days', false, null, null, v_t, v_t);
    if r->>'outcome' <> 'other_subscription' then
      raise exception 'A11: outcome=%', r->>'outcome';
    end if;
    select * into s from public.subscriptions where user_id = v_b;
    if s.plan <> 'premium' then
      raise exception 'A11: la cancelación de OTRA suscripción degradó la cuenta';
    end if;
  end;
  insert into _m04_wr values ('A11','deleted de otra suscripción ⇒ other_subscription','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A12 · CANCELACIÓN LEGÍTIMA ⇒ free, sin precio colgando ═══════════════
  r := public.aurix_billing_apply_event(
         'stripe','evt_A12','customer.subscription.deleted',
         v_cus_x,'sub_TEST_3',v_price,'canceled',
         t0, t0 + interval '30 days', false, null, null,
         t0 + interval '40 min', t0 + interval '40 min');
  if r->>'outcome' <> 'applied' then raise exception 'A12: outcome=%', r->>'outcome'; end if;
  select * into s from public.subscriptions where user_id = v_b;
  if s.plan <> 'free' then raise exception 'A12: plan=%', s.plan; end if;
  if s.price_amount_cents is not null or s.price_currency is not null
     or s.billing_interval is not null then
    raise exception 'A12: quedó precio/intervalo en una fila free';
  end if;
  insert into _m04_wr values ('A12','deleted de la suya ⇒ free y precio a null','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A13 · payload inválido ⇒ invalid_payload ═════════════════════════════
  r := public.aurix_billing_apply_event(
         'stripe','evt_A13','customer.subscription.updated',
         v_cus_a,'sub_TEST_1',v_price,'',
         t0, t0 + interval '30 days', false, null, null, null, t0 + interval '50 min');
  if r->>'outcome' <> 'invalid_payload' then
    raise exception 'A13: outcome=%', r->>'outcome';
  end if;
  insert into _m04_wr values ('A13','status vacío ⇒ invalid_payload','PASS',r::text);
  n_pass := n_pass + 1;

  -- ══ A14 · EL LEDGER REGISTRA TODO LO VISTO ═══════════════════════════════
  -- Un rechazo es evidencia, no silencio: es lo que hará falta cuando alguien
  -- diga "he pagado y no me ha dado nada".
  -- 13 event_id distintos vistos arriba (evt_A1, A3, A4, A5, A6, A7, A8u, A8c,
  -- A9, A10, A11, A12, A13). Se afirma el número EXACTO: uno de más significaría
  -- una fila duplicada en el ledger, y uno de menos, un evento perdido.
  select count(*) into v_n from public.billing_events;
  if v_n <> 13 then
    raise exception 'A14: % filas en el ledger, se esperaban 13', v_n;
  end if;
  select count(*) into v_n from public.billing_events where user_id is null and outcome <> 'ignored_type';
  if v_n <> 0 then
    raise exception 'A14: % eventos resueltos sin user_id (forense incompleta)', v_n;
  end if;
  insert into _m04_wr values ('A14','todo evento visto queda en el ledger con su causa','PASS',null);
  n_pass := n_pass + 1;

  raise notice 'M.04 WRITER TESTS: % escenarios PASS', n_pass;
end $$;

-- ── PRIVILEGIOS: el cliente no puede ni escribir un precio ni llamar al writer
-- Se hace fuera del DO porque `set local role` no puede convivir con el
-- security definer del bloque anterior sin confundir de quién es el privilegio
-- que se está midiendo.
do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from pg_proc p
    cross join (values ('anon'),('authenticated')) r(rol)
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('aurix_billing_apply_event','aurix_billing_link_customer')
     and has_function_privilege(r.rol, p.oid, 'execute');
  if v_n <> 0 then
    raise exception 'PRIV FAIL: % concesiones de execute a anon/authenticated', v_n;
  end if;

  if not has_table_privilege('authenticated', 'public.billing_prices', 'select') then
    raise exception 'PRIV FAIL: authenticated no puede LEER el catálogo de precios';
  end if;
  if has_table_privilege('authenticated', 'public.billing_prices', 'insert')
     or has_table_privilege('authenticated', 'public.billing_prices', 'update') then
    raise exception 'PRIV FAIL: authenticated puede ESCRIBIR precios';
  end if;
  if has_table_privilege('authenticated', 'public.billing_customers', 'select')
     or has_table_privilege('authenticated', 'public.billing_events', 'select') then
    raise exception 'PRIV FAIL: authenticated ve tablas sensibles';
  end if;

  raise notice 'PRIVILEGIOS: PASS';
end $$;

select * from _m04_wr order by n;

-- ── NADA PERSISTE ───────────────────────────────────────────────────────────
-- El rollback deshace fixtures, precio, mapeos, ledger y subscriptions. Es lo
-- que permite correr este fichero N veces sin que la enésima ejecución dependa
-- de las anteriores.
rollback;


-- ── EL GATE, FUERA DE LA TRANSACCIÓN DE PRUEBAS ─────────────────────────────
-- Tiene que escribirse DESPUÉS del `rollback;`: dentro, el propio rollback se
-- lo llevaría y el gate nunca existiría. Y si cualquier aserción de arriba
-- hubiera fallado, la ejecución habría abortado antes de llegar aquí — así que
-- la EXISTENCIA de esta fila es, por construcción, la prueba de que las 18
-- pasaron.
insert into m04_rehearsal.gates (gate, run_id, verdict, detail)
select 'WRITER', (select run_id from m04_rehearsal.run), 'PASS',
       '18 escenarios de writer/idempotencia + privilegios; sin residuo (rollback)'
on conflict (gate) do update
  set run_id = excluded.run_id, verdict = excluded.verdict,
      detail = excluded.detail, recorded_at = now();

select gate, verdict, detail from m04_rehearsal.gates order by recorded_at;
