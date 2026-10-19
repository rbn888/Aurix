-- ════════════════════════════════════════════════════════════════════════════
-- AURIX · ROLLBACK · billing_other_subscription_vigente_1
-- *** NO APLICADO. *** Requiere autorización del founder antes de producción.
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de db/billing_other_subscription_vigente_1.sql: restaura el cuerpo original
-- de M.04 (guard `other_subscription` sólo por estado).
-- HUELLA. Sólo se reemplaza una versión CONOCIDA de la función: si producción tiene
-- otra (un hotfix no versionado), la transacción aborta sin tocar nada. Idempotente:
-- volver a aplicarlo sobre la versión destino no cambia nada.
--   md5(prosrc) origen  = f42a238fa36b40bd7912d43004971088
--   md5(prosrc) destino = f0945dfbe3bfe15145c7ba515f5aa8ed
-- `create or replace` conserva propietario y permisos (revoke/grant de M.04 intactos).
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $chk$
declare v_md5 text; v_n int;
begin
  select count(*), max(md5(p.prosrc)) into v_n, v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'aurix_billing_apply_event';
  if v_n <> 1 then
    raise exception 'ABORTADO: se esperaba 1 función aurix_billing_apply_event y hay %', v_n;
  end if;
  if v_md5 not in ('f42a238fa36b40bd7912d43004971088', 'f0945dfbe3bfe15145c7ba515f5aa8ed') then
    raise exception 'ABORTADO: versión desconocida de aurix_billing_apply_event en esta base (md5 %)', v_md5;
  end if;
end $chk$;

create or replace function public.aurix_billing_apply_event(
  p_provider             text,
  p_event_id             text,
  p_event_type           text,
  p_customer_id          text,
  p_subscription_id      text,
  p_price_id             text,
  p_status               text,
  p_current_period_start timestamptz,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_trial_start          timestamptz,
  p_trial_end            timestamptz,
  p_canceled_at          timestamptz,
  p_event_at             timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid;
  v_price     public.billing_prices;
  v_prev      public.subscriptions;
  v_ev        public.billing_events;
  v_plan      text;
  v_status    text;
  v_at        timestamptz := coalesce(p_event_at, now());
  v_outcome   text;
  v_inserted  boolean := false;
  v_prev_type text;
  v_rank      int;
  v_prev_rank int;
begin
  -- ORDEN DENTRO DEL MISMO SEGUNDO. `event.created` tiene resolucion de SEGUNDO,
  -- asi que dos eventos de la misma suscripcion pueden empatar y el orden de
  -- ENTREGA no esta garantizado. Con un `<` estricto, un `created` (status
  -- incomplete) entregado DESPUES de su `updated` (active) no era stale y
  -- degradaba a Free a quien acababa de pagar; y un `updated` tras el `deleted`
  -- del mismo segundo resucitaba una suscripcion cancelada. El rango desempata
  -- por la semantica del ciclo de vida, que si es un orden total.
  v_rank := case p_event_type
              when 'customer.subscription.created' then 1
              when 'customer.subscription.updated' then 2
              when 'customer.subscription.deleted' then 3
              else 0 end;
  if p_provider is null or p_event_id is null or p_event_type is null then
    return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
  end if;

  -- ── IDEMPOTENCY FIRST. The insert IS the lock. ────────────────────────────
  -- Y la idempotencia es sobre lo APLICADO, no sobre lo VISTO. La primera version
  -- trataba cualquier id ya presente como duplicado, y eso convertia un rechazo
  -- RECUPERABLE en perdida permanente: la suscripcion de un customer todavia sin
  -- mapear se registraba `unknown_customer`, se arreglaba el mapeo, se reenviaba
  -- el evento desde el dashboard --MISMO id-- y se descartaba como duplicado. Una
  -- compra cobrada que nunca concede. Ahora solo un evento APLICADO es definitivo;
  -- uno rechazado se reintenta, y el `for update` serializa dos reintentos
  -- concurrentes sobre la misma fila.
  insert into public.billing_events (provider, event_id, event_type, outcome, applied)
  values (p_provider, p_event_id, p_event_type, 'received', false)
  on conflict (provider, event_id) do nothing;

  if not found then
    select * into v_ev from public.billing_events be
     where be.provider = p_provider and be.event_id = p_event_id
       for update;
    if v_ev.applied then
      return jsonb_build_object('ok', true, 'outcome', 'duplicate');
    end if;
    -- rechazo previo => se REINTENTA con el catalogo/mapeo actuales
  end if;
  v_inserted := true;

  -- ── TIPOS QUE NO CAMBIAN ESTADO ───────────────────────────────────────────
  -- El webhook los manda con `p_status = 'ignored'` para que quede su rastro. Se
  -- resuelve ANTES de buscar el customer: si no, un `invoice.payment_failed` se
  -- registraba como `unknown_customer` y quedaba indistinguible de un incidente
  -- real de mapeo, que es justo el diagnostico que este ledger existe para dar.
  if p_status = 'ignored' then
    update public.billing_events
       set outcome = 'ignored_type', applied = false
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'ignored_type');
  end if;

  -- ── WHO. From the provider's customer id, via our own mapping. ────────────
  if p_customer_id is not null then
    select bc.user_id into v_user
      from public.billing_customers bc
     where bc.provider = p_provider and bc.provider_customer_id = p_customer_id;
  end if;

  if v_user is null then
    update public.billing_events
       set outcome = 'unknown_customer', applied = false
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'unknown_customer');
  end if;

  -- ── WHAT. From the price catalogue. An unmapped price grants nothing. ─────
  if p_price_id is not null then
    select * into v_price
      from public.billing_prices bp
     where bp.provider = p_provider and bp.provider_price_id = p_price_id;
  end if;

  -- ── STALENESS. Out-of-order delivery must not resurrect old state. ────────
  select * into v_prev from public.subscriptions s where s.user_id = v_user;
  if v_prev.user_id is not null and v_prev.last_event_id is not null then
    select be.event_type into v_prev_type
      from public.billing_events be
     where be.provider = v_prev.provider and be.event_id = v_prev.last_event_id;
    v_prev_rank := case v_prev_type
                     when 'customer.subscription.created' then 1
                     when 'customer.subscription.updated' then 2
                     when 'customer.subscription.deleted' then 3
                     else 0 end;
  end if;
  if v_prev.user_id is not null and v_prev.last_event_at is not null
     and (v_at < v_prev.last_event_at
          or (v_at = v_prev.last_event_at and v_prev_rank is not null
              and v_rank < v_prev_rank)) then
    update public.billing_events
       set outcome = 'stale', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'stale');
  end if;

  -- ── UNA CANCELACION SOLO CANCELA LO SUYO ─────────────────────────────────
  -- Un customer admite VARIAS suscripciones. Si el usuario termina con una
  -- duplicada y la cancela, el `deleted` de ESA no puede poner la cuenta en Free
  -- mientras la otra sigue viva y cobrandose. Se ignora cualquier evento de una
  -- suscripcion distinta de la que gobierna la fila, salvo que la fila no este
  -- premium vigente: ahi otra suscripcion puede tomar el relevo legitimamente.
  if v_prev.user_id is not null and v_prev.provider_subscription_id is not null
     and p_subscription_id is not null
     and p_subscription_id <> v_prev.provider_subscription_id
     and v_prev.plan = 'premium' and v_prev.status in ('active','trialing') then
    update public.billing_events
       set outcome = 'other_subscription', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'other_subscription');
  end if;

  -- ── STATUS whitelist (B1's CHECK set). Unknown ⇒ refuse the event. ────────
  v_status := lower(coalesce(p_status, ''));
  if v_status = 'incomplete_expired' then
    v_status := 'expired';                              -- Stripe's terminal name for a failed first payment
  elsif v_status = 'unpaid' then
    v_status := 'past_due';                             -- same commercial meaning for B2: no access, still a customer
  end if;

  if v_status = '' then
    update public.billing_events
       set outcome = 'invalid_payload', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'invalid_payload');
  end if;

  -- UN STATUS DESCONOCIDO DEGRADA; NO CONGELA. Rechazar el evento y salir dejaba
  -- la fila anterior intacta, asi que un `paused` --o cualquier status futuro que
  -- signifique "ya no se cobra"-- conservaba Premium hasta fin de periodo: un
  -- fail-open por congelacion. La doctrina de este subsistema es que una anomalia
  -- comercial puede DEGRADAR el acceso y nunca concederlo, asi que un status que
  -- no entendemos se trata como no vigente y queda dicho en el ledger.
  if v_status not in ('active','trialing','past_due','canceled','expired','incomplete') then
    v_outcome := 'unknown_status';
    v_plan    := 'free';
    v_status  := 'expired';
  end if;

  -- `incomplete` (first payment not settled) is NOT one of B1's five statuses,
  -- and it must not be written as something that could grant. It is a pre-paid
  -- state: the commercial row stays / becomes free.
  if v_plan = 'free' then
    null;                                       -- ya resuelto arriba (unknown_status)
  elsif v_status = 'incomplete' then
    v_plan   := 'free';
    v_status := 'expired';
  elsif v_status in ('canceled','expired') then
    v_plan   := 'free';
  elsif v_price.provider_price_id is null then
    -- Live status but no known price ⇒ we cannot state WHAT was bought. Refuse.
    update public.billing_events
       set outcome = 'unknown_price', applied = false, user_id = v_user
     where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', false, 'outcome', 'unknown_price');
  else
    v_plan := v_price.plan;
    -- EL PERIODO ES OBLIGATORIO PARA CONCEDER, y este guard existe porque el CHECK
    -- de B1 (`subscriptions_premium_bound_chk`) lo hace ESTALLAR: la excepcion deja
    -- el ledger vacio por el rollback, devuelve 500 y Stripe reintenta el MISMO
    -- payload hasta agotarse -- cobrado, sin Premium y sin forense. Con el guard el
    -- rechazo queda registrado con su causa y es REINTENTABLE, asi que reenviar el
    -- evento una vez corregido el extractor si lo aplica.
    if v_status in ('active','trialing')
       and p_current_period_end is null
       and v_price.billing_interval is distinct from 'lifetime' then
      update public.billing_events
         set outcome = 'missing_period', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'missing_period');
    end if;
    -- Un trial sin fecha de fin es el mismo fail-open por la via del trial.
    if v_status = 'trialing' and p_trial_end is null then
      update public.billing_events
         set outcome = 'missing_period', applied = false, user_id = v_user
       where provider = p_provider and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'outcome', 'missing_period');
    end if;
  end if;

  -- ── WRITE. One row per user (B1's model), canonical values only. ──────────
  insert into public.subscriptions as s (
    user_id, plan, status, provider, billing_interval,
    trial_start, trial_end, current_period_start, current_period_end,
    cancel_at_period_end, canceled_at,
    price_amount_cents, price_currency,
    provider_customer_id, provider_subscription_id,
    last_event_id, last_event_at
  ) values (
    v_user,
    v_plan,
    v_status,
    p_provider,
    case when v_plan = 'premium' then v_price.billing_interval else null end,
    p_trial_start, p_trial_end, p_current_period_start, p_current_period_end,
    coalesce(p_cancel_at_period_end, false), p_canceled_at,
    case when v_plan = 'premium' then v_price.amount_cents else null end,
    case when v_plan = 'premium' then upper(v_price.currency) else null end,
    p_customer_id, p_subscription_id,
    p_event_id, v_at
  )
  on conflict (user_id) do update set
    plan                     = excluded.plan,
    status                   = excluded.status,
    provider                 = excluded.provider,
    billing_interval         = excluded.billing_interval,
    trial_start              = excluded.trial_start,
    trial_end                = excluded.trial_end,
    current_period_start     = excluded.current_period_start,
    current_period_end       = excluded.current_period_end,
    cancel_at_period_end     = excluded.cancel_at_period_end,
    canceled_at              = excluded.canceled_at,
    price_amount_cents       = excluded.price_amount_cents,
    price_currency           = excluded.price_currency,
    provider_customer_id     = excluded.provider_customer_id,
    provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
    last_event_id            = excluded.last_event_id,
    last_event_at            = excluded.last_event_at
  -- Belt and braces on top of the ledger: even if this function were called
  -- twice with the same event id inside one transaction, the row would not be
  -- written twice.
  -- `last_event_id` NO lleva provider (la unicidad de B1 si: el indice es
  -- `(provider, last_event_id)`), asi que sin comparar el provider un id de Apple
  -- que coincidiera con el ultimo de Stripe se habria saltado la escritura y aun
  -- asi se habria marcado como aplicada. Hoy inalcanzable con un solo proveedor;
  -- alcanzable el dia de M.04B, que es cuando nadie lo estaria mirando.
  where s.last_event_id is null
     or s.provider is distinct from excluded.provider
     or s.last_event_id <> excluded.last_event_id;

  v_outcome := coalesce(v_outcome, 'applied');
  update public.billing_events
     set outcome = v_outcome, applied = true, user_id = v_user
   where provider = p_provider and event_id = p_event_id;

  return jsonb_build_object('ok', true, 'outcome', v_outcome,
                            'plan', v_plan, 'status', v_status);
exception
  when others then
    -- The ledger row is inside the same transaction, so a raise rolls it back
    -- too: the event stays UNAPPLIED and Stripe's retry can try again. Failing
    -- with the event recorded as applied would lose a real purchase.
    raise;
end;
$$;

do $chk$
declare v_md5 text;
begin
  select md5(p.prosrc) into v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'aurix_billing_apply_event';
  if v_md5 <> 'f0945dfbe3bfe15145c7ba515f5aa8ed' then
    raise exception 'ABORTADO: la función no quedó en la versión esperada (md5 %)', v_md5;
  end if;
end $chk$;

commit;
