-- ============================================================================
-- AURIX-PARTNER-ENGINE-V2 · 1/2 · DESGLOSE DEL COBRO (Stripe → Aurix)
-- public.billing_payment_breakdowns
-- public.aurix_billing_record_payment_breakdown(...)
-- ----------------------------------------------------------------------------
-- Apply: pegar el fichero ENTERO en el editor SQL y ejecutarlo de una vez.
--   *** NO APLICADO DESDE EL REPO ***
--   psql -v ON_ERROR_STOP=1 -f db/billing_payment_breakdown_1.sql   (SIN `-1`)
-- Requiere AURIX-AFFILIATES-V1 aplicado (db/billing_payments_1.sql y M.04).
-- Orden: 1/2 (después: db/founder_read_affiliates_2.sql).
-- Pareja: db/billing_payment_breakdown_1_rollback.sql
--
-- QUÉ ES
--   `billing_payments` guarda lo COBRADO (amount_paid). La comisión por
--   PORCENTAJE se calcula sobre ese importe —IVA incluido y ya neto de
--   descuentos—, así que NO depende de esta tabla. Esta tabla guarda, por
--   factura, el desglose TAL COMO LO INFORMA STRIPE: subtotal, descuentos,
--   impuesto, total sin impuesto y si Stripe CALCULÓ el impuesto o no. Founder
--   lo usa para el desglose económico (impuestos conocidos, margen
--   provisional), nunca para retener ni recalcular una comisión.
--   Aurix no calcula impuestos ni porcentajes ni comisiones: sólo registra.
--
-- tax_status — LA DIFERENCIA ENTRE "0 € DE IVA" Y "NADIE CALCULÓ EL IVA"
--   · 'computed'     → Stripe calculó el impuesto (automatic_tax completo, o la
--                      factura trae al menos una línea de impuesto). tax_cents
--                      es lo que Stripe dice, también si es 0.
--   · 'not_computed' → Stripe NO calculó impuesto (hoy el checkout no activa
--                      automatic_tax). tax_cents es NULL a propósito: un 0 aquí
--                      parecería "exento" y Founder mostraría como conocido un
--                      impuesto que nadie calculó. Founder lo enseña como
--                      "desconocido"; la comisión no cambia.
--   Lo impone un CHECK: computed ⇔ tax_cents no nulo.
--
-- INMUTABLE: LA PRIMERA ESCRITURA GANA
--   Una factura pagada no cambia. `insert … on conflict do nothing`: un
--   reintento o un webhook duplicado NUNCA reescribe un desglose guardado
--   (devuelve 'duplicate'). No hay camino de UPDATE.
--
-- ENTRADA MAL FORMADA ⇒ 'rejected', SIN raise (misma doctrina que
--   aurix_billing_record_payment_event con 'invalid_payload'): un dato malo no
--   mejora reintentando, así que el webhook contesta 200 y Stripe no reintenta
--   para siempre. Sólo un fallo REAL de la base (raise) da 500 ⇒ reintento.
--
-- No toca `billing_payments`, ni `billing_events`, ni `subscriptions`, ni
-- `entitlement_overrides`: no concede ni retira acceso.
-- ============================================================================

begin;

-- ── 1. public.billing_payment_breakdowns — una fila por factura ──────────────
create table if not exists public.billing_payment_breakdowns (
  provider                  text        not null,
  invoice_id                text        not null,
  subtotal_cents            integer,
  discount_cents            integer,
  tax_cents                 integer,
  total_excluding_tax_cents integer,
  tax_status                text        not null,
  event_id                  text        not null,
  recorded_at               timestamptz not null default now(),

  primary key (provider, invoice_id),
  constraint billing_payment_breakdowns_provider_chk check (provider in ('stripe','apple','manual')),
  constraint billing_payment_breakdowns_handle_chk   check (length(invoice_id) between 3 and 255),
  constraint billing_payment_breakdowns_status_chk   check (tax_status in ('computed','not_computed')),
  constraint billing_payment_breakdowns_amounts_chk  check (
        coalesce(subtotal_cents, 0) >= 0
    and coalesce(discount_cents, 0) >= 0
    and coalesce(tax_cents, 0) >= 0
    and coalesce(total_excluding_tax_cents, 0) >= 0),
  -- "No calculado" nunca se guarda como 0: NULL. "Calculado" siempre con cifra.
  constraint billing_payment_breakdowns_tax_chk check (
    (tax_status = 'computed') = (tax_cents is not null))
);


-- ── 2. RLS: deny para el cliente, sin privilegios ────────────────────────────
alter table public.billing_payment_breakdowns enable row level security;

drop policy if exists billing_payment_breakdowns_no_client on public.billing_payment_breakdowns;
create policy billing_payment_breakdowns_no_client on public.billing_payment_breakdowns
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on public.billing_payment_breakdowns from anon, authenticated;


-- ── 3. public.aurix_billing_record_payment_breakdown() — service_role only ───
-- El webhook EXTRAE (api/billing/webhook.mjs · paymentBreakdownOf); aquí sólo
-- se valida la forma y se guarda la primera vez.
create or replace function public.aurix_billing_record_payment_breakdown(
  p_provider            text,
  p_event_id            text,
  p_invoice_id          text,
  p_subtotal            integer,
  p_discount            integer,
  p_tax                 integer,
  p_total_excluding_tax integer,
  p_tax_status          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_provider is null or p_provider not in ('stripe','apple','manual')
     or p_event_id is null or length(p_event_id) = 0 then
    return jsonb_build_object('ok', false, 'outcome', 'rejected', 'reason', 'missing_event');
  end if;
  if p_invoice_id is null or length(p_invoice_id) not between 3 and 255 then
    return jsonb_build_object('ok', false, 'outcome', 'rejected', 'reason', 'missing_invoice');
  end if;
  if p_tax_status is null or p_tax_status not in ('computed','not_computed') then
    return jsonb_build_object('ok', false, 'outcome', 'rejected', 'reason', 'bad_tax_status');
  end if;
  if coalesce(p_subtotal, 0) < 0 or coalesce(p_discount, 0) < 0
     or coalesce(p_tax, 0) < 0 or coalesce(p_total_excluding_tax, 0) < 0 then
    return jsonb_build_object('ok', false, 'outcome', 'rejected', 'reason', 'negative_amount');
  end if;
  if (p_tax_status = 'computed') <> (p_tax is not null) then
    return jsonb_build_object('ok', false, 'outcome', 'rejected', 'reason', 'tax_status_mismatch');
  end if;

  -- LA PRIMERA ESCRITURA GANA. Ni un reintento ni un duplicado la cambian.
  insert into public.billing_payment_breakdowns (
    provider, invoice_id, subtotal_cents, discount_cents, tax_cents,
    total_excluding_tax_cents, tax_status, event_id
  ) values (
    p_provider, p_invoice_id, p_subtotal, p_discount, p_tax,
    p_total_excluding_tax, p_tax_status, p_event_id
  )
  on conflict (provider, invoice_id) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'outcome', 'duplicate');
  end if;
  return jsonb_build_object('ok', true, 'outcome', 'recorded');
end;
$$;

revoke all     on function public.aurix_billing_record_payment_breakdown(text, text, text, integer, integer,
  integer, integer, text) from public, anon, authenticated;
grant  execute on function public.aurix_billing_record_payment_breakdown(text, text, text, integer, integer,
  integer, integer, text) to service_role;


-- ── 4. VERIFICACIÓN — dentro de la transacción ───────────────────────────────
do $$
declare
  v_n  int;
  v_f  oid := to_regprocedure('public.aurix_billing_record_payment_breakdown(text,text,text,integer,'
                              'integer,integer,integer,text)')::oid;
begin
  if to_regclass('public.billing_payments') is null then
    raise exception 'BREAKDOWN-1 APPLY FAIL: falta billing_payments (aplicar antes billing_payments_1)';
  end if;
  if to_regclass('public.billing_payment_breakdowns') is null then
    raise exception 'BREAKDOWN-1 APPLY FAIL: falta la tabla';
  end if;
  if v_f is null then
    raise exception 'BREAKDOWN-1 APPLY FAIL: falta aurix_billing_record_payment_breakdown/8';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.billing_payment_breakdowns'::regclass and contype = 'p')
     is distinct from 'PRIMARY KEY (provider, invoice_id)' then
    raise exception 'BREAKDOWN-1 APPLY FAIL: PK no es (provider, invoice_id)';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid = 'public.billing_payment_breakdowns'::regclass and contype = 'c';
  if v_n <> 5 then
    raise exception 'BREAKDOWN-1 APPLY FAIL: % CHECK, se esperaban 5', v_n;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.billing_payment_breakdowns'::regclass) then
    raise exception 'BREAKDOWN-1 APPLY FAIL: sin RLS';
  end if;

  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'billing_payment_breakdowns'
     and grantee in ('anon', 'authenticated');
  if v_n <> 0 then
    raise exception 'BREAKDOWN-1 APPLY FAIL: % privilegios de cliente', v_n;
  end if;

  if not (select prosecdef from pg_proc where oid = v_f)
     or (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = v_f)
        <> 'search_path=public, pg_temp' then
    raise exception 'BREAKDOWN-1 APPLY FAIL: el escritor no es definer con search_path fijo';
  end if;
  if not has_function_privilege('service_role', v_f, 'execute')
     or has_function_privilege('anon', v_f, 'execute')
     or has_function_privilege('authenticated', v_f, 'execute') then
    raise exception 'BREAKDOWN-1 APPLY FAIL: el escritor no es sólo de service_role';
  end if;

  raise notice 'BREAKDOWN-1 APPLY VERIFIED — tabla cerrada, escritor inmutable sólo service_role';
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN MANUAL (después del commit; como owner)
-- ============================================================================
-- select tax_status, count(*) from public.billing_payment_breakdowns group by 1;
-- (i) primera escritura gana: la misma factura dos veces con otras cifras ⇒
--     'recorded' y luego 'duplicate', la fila no cambia.
-- select public.aurix_billing_record_payment_breakdown('stripe','evt_t1','in_t1', 799, 0, null, 799, 'not_computed');
-- select public.aurix_billing_record_payment_breakdown('stripe','evt_t2','in_t1', 1, 1, 1, 1, 'computed');
-- (limpiar después: delete from public.billing_payment_breakdowns where invoice_id = 'in_t1';)
-- ============================================================================
