-- ============================================================================
-- AURIX-AFFILIATES-V1 · 1/3 · ATRIBUCIÓN DE ADQUISICIÓN + VISITAS POR CÓDIGO
-- public.acquisition_attributions · public.aurix_attribution_capture(jsonb)
-- public.affiliate_clicks         · public.aurix_affiliate_click(text)
-- ----------------------------------------------------------------------------
-- Apply: pegar el fichero ENTERO en el editor SQL del proyecto Supabase y
-- ejecutarlo de una vez.   *** NO APLICADO DESDE EL REPO ***
--   psql -v ON_ERROR_STOP=1 -f db/affiliate_attribution_1.sql
--   (SIN `-1`: el fichero abre y cierra su propia transacción.)
-- Orden: DESPUÉS de db/affiliate_codes_1.sql (valida contra su registro); luego
-- db/billing_payments_1.sql y db/founder_read_affiliates_1.sql.
-- Pareja: db/affiliate_attribution_1_rollback.sql
--
-- QUÉ ES, Y QUÉ NO ES
--   Aurix guarda EVIDENCIA, no comisiones. Quién es afiliado, cuánto cobra y
--   cuándo lo decide Founder Platform, que lee esto por `/api/read/affiliates`.
--   Aquí no existe ni un porcentaje, ni un afiliado, ni un saldo.
--
-- LA ATRIBUCIÓN SE FIJA AL REGISTRARSE, Y NO SE MUEVE
--   · `aurix_attribution_capture()` sólo acepta la llamada del propio usuario
--     (auth.uid()) y sólo en las 24 h siguientes a la creación de su cuenta.
--     Más tarde devuelve 'too_late': un código pegado a una cuenta antigua no es
--     una adquisición, es un intento de cobrar una que ya existía.
--   · La primera captura gana. `on conflict do nothing`, y NO EXISTE ningún
--     camino de UPDATE: ni política, ni privilegio, ni función — y además un
--     trigger lo rechaza también para el owner y la service-role. Lo único que
--     puede hacer desaparecer la fila es borrar la cuenta (on delete cascade).
--   · El navegador manda los toques; la BD los VALIDA uno a uno (forma, número,
--     códigos distintos, fecha plausible) y guarda una versión NORMALIZADA. Lo
--     que no valida se rechaza entero.
--
-- LAS VISITAS SON UN INDICADOR, NO UNA PRUEBA
--   `affiliate_clicks` cuenta cargas de la landing con un `?ref=` válido, por
--   código y por día (Europe/Madrid). La llamada es ANÓNIMA —no hay sesión en la
--   landing— y por tanto INFLABLE (sólo con códigos reales y activos del
--   registro de Founder; uno inventado no deja fila): sirve para el embudo del
--   fundador, NUNCA para calcular dinero. No guarda IP, ni cookie, ni agente de
--   usuario, ni nada que identifique a quien visita: sólo (código, día, número).
--   Topes: 100000 por fila y 10000 códigos distintos por día, para que un
--   abuso no pueda hacer crecer la tabla sin límite.
--
-- SEGURIDAD
--   Tablas con RLS y política restrictiva de denegación; cero privilegios para
--   anon/authenticated. Funciones SECURITY DEFINER con search_path fijo.
--   capture: sólo `authenticated`. click: `anon` y `authenticated`.
-- ============================================================================

begin;

-- ── 1. Forma de los toques (inmutable: usable en un CHECK) ───────────────────
-- Sólo FORMA: array de 1..5 objetos {code, seenAt}, código de 6 dígitos, códigos
-- distintos y seenAt con forma de instante ISO-8601 en UTC. Las comprobaciones
-- que dependen del reloj (no más de 31 días, no en el futuro) son de la función
-- de captura: un CHECK con now() dejaría de cumplirse solo con el paso del tiempo.
create or replace function public.aurix_attribution_touches_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) between 1 and 5
    and not exists (
      select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or (select count(*) from jsonb_object_keys(e)) <> 2
          or jsonb_typeof(e -> 'code')   is distinct from 'string'
          or jsonb_typeof(e -> 'seenAt') is distinct from 'string'
          or (e ->> 'code')   !~ '^[0-9]{6}$'
          or (e ->> 'seenAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
    )
    and (select count(distinct e ->> 'code') from jsonb_array_elements(p) e)
        = jsonb_array_length(p),
    false);
$$;

revoke all on function public.aurix_attribution_touches_ok(jsonb) from public, anon, authenticated;


-- ── 2. public.acquisition_attributions ───────────────────────────────────────
create table if not exists public.acquisition_attributions (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  touches     jsonb       not null,
  captured_at timestamptz not null default now(),
  constraint acquisition_attributions_touches_chk
    check (public.aurix_attribution_touches_ok(touches))
);

-- INMUTABLE TAMBIÉN PARA QUIEN TIENE TODOS LOS PERMISOS. Sin privilegios el
-- cliente ya no puede tocarla; esto cierra además la puerta del owner y de la
-- service-role, que son las que usaría un "arreglo rápido" para mover a mano una
-- atribución de un afiliado a otro.
create or replace function public.aurix_attribution_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'acquisition_attributions es inmutable: la atribución se fija al registrarse';
end;
$$;

revoke all on function public.aurix_attribution_immutable() from public, anon, authenticated;

drop trigger if exists acquisition_attributions_no_update on public.acquisition_attributions;
create trigger acquisition_attributions_no_update
  before update on public.acquisition_attributions
  for each row execute function public.aurix_attribution_immutable();

alter table public.acquisition_attributions enable row level security;

drop policy if exists acquisition_attributions_no_client on public.acquisition_attributions;
create policy acquisition_attributions_no_client
  on public.acquisition_attributions
  as restrictive
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.acquisition_attributions from anon, authenticated;


-- ── 2b. ¿Estaba vivo este código en ese instante? (registro de Founder) ──────
-- Existe en affiliate_codes (db/affiliate_codes_1.sql), no está retirado ni
-- bloqueado, el instante cae en uno de sus intervalos activos (to null = sigue
-- activo) y dentro de la ventana de su campaña. Un código que Founder no ha
-- declarado no vale NUNCA, aunque tenga seis cifras.
create or replace function public.aurix_affiliate_code_live_at(p_code text, p_at timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select c.status not in ('retirado','bloqueada')
           and p_at between c.starts_at and c.ends_at
           and exists (
             select 1 from jsonb_array_elements(c.active_intervals) i
              where (i ->> 'from')::timestamptz <= p_at
                and (jsonb_typeof(i -> 'to') = 'null' or p_at <= (i ->> 'to')::timestamptz))
      from public.affiliate_codes c
     where c.code = p_code), false);
$$;

revoke all on function public.aurix_affiliate_code_live_at(text, timestamptz) from public, anon, authenticated;


-- ── 3. public.aurix_attribution_capture(jsonb) — sólo el propio usuario ──────
-- Resultados: captured · already_captured · too_late · no_valid_code · invalid ·
-- unauthenticated.
-- Nunca lanza por un dato del cliente: el login no puede depender de esto.
create or replace function public.aurix_attribution_capture(p_touches jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_created timestamptz;
  v_norm    jsonb;
  v_n       int;
  v_bad     int;
begin
  if v_uid is null then
    return jsonb_build_object('outcome', 'unauthenticated');
  end if;

  if p_touches is null or jsonb_typeof(p_touches) <> 'array' then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  v_n := jsonb_array_length(p_touches);
  if v_n < 1 or v_n > 5 then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- Cada toque: objeto, código de 6 dígitos y seenAt PARSEABLE dentro de la
  -- ventana [now() - 31 días, now() + 5 min]. El margen futuro absorbe relojes
  -- de dispositivo algo adelantados; más allá es un dato fabricado.
  begin
    select count(*) into v_bad
      from jsonb_array_elements(p_touches) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'code')   is distinct from 'string'
        or jsonb_typeof(e -> 'seenAt') is distinct from 'string'
        or (e ->> 'code') !~ '^[0-9]{6}$'
        -- Forma ISO explícita: Postgres acepta 'now', 'today' o 'epoch' como
        -- instantes válidos, y eso no es una fecha que el navegador haya visto.
        or (e ->> 'seenAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:?[0-9]{2})$'
        or (e ->> 'seenAt')::timestamptz < now() - interval '31 days'
        or (e ->> 'seenAt')::timestamptz > now() + interval '5 minutes';
  exception when others then
    return jsonb_build_object('outcome', 'invalid');      -- seenAt no parseable
  end;
  if v_bad > 0 then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if (select count(distinct e ->> 'code') from jsonb_array_elements(p_touches) e) <> v_n then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- Versión NORMALIZADA: sólo {code, seenAt}, seenAt en UTC con milisegundos, y
  -- en orden de primera vista (el reloj manda; el orden del array desempata).
  select jsonb_agg(jsonb_build_object(
           'code',   e ->> 'code',
           'seenAt', to_char((e ->> 'seenAt')::timestamptz at time zone 'UTC',
                             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         order by (e ->> 'seenAt')::timestamptz, o)
    into v_norm
    from jsonb_array_elements(p_touches) with ordinality as t(e, o);

  if exists (select 1 from public.acquisition_attributions a where a.user_id = v_uid) then
    return jsonb_build_object('outcome', 'already_captured');
  end if;

  -- LA ATRIBUCIÓN ES DEL REGISTRO. Una cuenta con más de 24 h ya existía antes
  -- de este clic: no se le puede pegar un código ahora.
  select u.created_at into v_created from auth.users u where u.id = v_uid;
  if v_created is null or v_created < now() - interval '24 hours' then
    return jsonb_build_object('outcome', 'too_late');
  end if;

  -- SÓLO CÓDIGOS DEL REGISTRO: se queda con los toques cuyo código existía y
  -- estaba activo cuando se vio. Si no queda ninguno no se guarda nada.
  select jsonb_agg(t.e order by t.o)
    into v_norm
    from jsonb_array_elements(v_norm) with ordinality as t(e, o)
   where public.aurix_affiliate_code_live_at(t.e ->> 'code', (t.e ->> 'seenAt')::timestamptz);
  if v_norm is null then
    return jsonb_build_object('outcome', 'no_valid_code');
  end if;

  insert into public.acquisition_attributions (user_id, touches)
  values (v_uid, v_norm)
  on conflict (user_id) do nothing;

  if not found then
    return jsonb_build_object('outcome', 'already_captured');
  end if;
  return jsonb_build_object('outcome', 'captured');
end;
$$;

revoke all     on function public.aurix_attribution_capture(jsonb) from public, anon, authenticated;
grant  execute on function public.aurix_attribution_capture(jsonb) to   authenticated;


-- ── 4. public.affiliate_clicks — VISITAS (indicador anónimo, no evidencia) ───
create table if not exists public.affiliate_clicks (
  code   text    not null,
  day    date    not null,
  clicks integer not null default 0,
  primary key (code, day),
  constraint affiliate_clicks_code_chk   check (code ~ '^[0-9]{6}$'),
  constraint affiliate_clicks_clicks_chk check (clicks between 0 and 100000)
);

create index if not exists affiliate_clicks_day_idx on public.affiliate_clicks (day);

alter table public.affiliate_clicks enable row level security;

drop policy if exists affiliate_clicks_no_client on public.affiliate_clicks;
create policy affiliate_clicks_no_client
  on public.affiliate_clicks
  as restrictive
  for all
  to anon, authenticated
  using      (false)
  with check (false);

revoke all on public.affiliate_clicks from anon, authenticated;


-- ── 5. public.aurix_affiliate_click(text) — +1 por (código, día de Madrid) ───
-- ANÓNIMA A PROPÓSITO: la landing no tiene sesión. Por eso mismo es inflable y
-- se documenta como indicador. Sin IP, sin cookie, sin identificador: no hay
-- nada personal que guardar, y por eso no necesita consentimiento.
-- Devuelve {valid, outcome}: counted · capped · invalid.
create or replace function public.aurix_affiliate_click(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- Sólo cuenta un código ACTIVO AHORA (status 'activa', intervalo abierto y
  -- dentro de la campaña). Uno desconocido o parado no deja ni una fila: un
  -- bucle con códigos inventados no infla nada. `valid` es lo que la landing
  -- usa para decidir si muestra el aviso y si lleva el código a la app.
  if p_code is null or p_code !~ '^[0-9]{6}$'
     or not public.aurix_affiliate_code_live_at(p_code, now())
     or not exists (select 1 from public.affiliate_codes c where c.code = p_code and c.status = 'activa') then
    return jsonb_build_object('valid', false, 'outcome', 'invalid');
  end if;

  -- Tope de filas por día (defensa adicional; con el registro ya es pequeño).
  if not exists (select 1 from public.affiliate_clicks c where c.code = p_code and c.day = v_day)
     and (select count(*) from public.affiliate_clicks c where c.day = v_day) >= 10000 then
    return jsonb_build_object('valid', true, 'outcome', 'capped');
  end if;

  insert into public.affiliate_clicks as c (code, day, clicks)
  values (p_code, v_day, 1)
  on conflict (code, day) do update
     set clicks = least(c.clicks + 1, 100000);

  return jsonb_build_object('valid', true, 'outcome', 'counted');
end;
$$;

revoke all     on function public.aurix_affiliate_click(text) from public;
grant  execute on function public.aurix_affiliate_click(text) to   anon, authenticated;


-- ── 6. VERIFICACIÓN — dentro de la transacción, antes del commit ─────────────
do $$
declare
  v_n  int;
  v_fc oid := to_regprocedure('public.aurix_attribution_capture(jsonb)')::oid;
  v_fk oid := to_regprocedure('public.aurix_affiliate_click(text)')::oid;
begin
  if to_regclass('public.acquisition_attributions') is null
     or to_regclass('public.affiliate_clicks') is null
     or to_regclass('public.affiliate_codes') is null then
    raise exception 'AFFILIATES-1 APPLY FAIL: falta una tabla';
  end if;
  if v_fc is null or v_fk is null then
    raise exception 'AFFILIATES-1 APPLY FAIL: falta una función';
  end if;

  select count(*) into v_n from pg_class
   where oid in ('public.acquisition_attributions'::regclass, 'public.affiliate_clicks'::regclass)
     and relrowsecurity;
  if v_n <> 2 then
    raise exception 'AFFILIATES-1 APPLY FAIL: RLS sólo en % de 2 tablas', v_n;
  end if;

  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('acquisition_attributions', 'affiliate_clicks')
     and grantee in ('anon', 'authenticated');
  if v_n <> 0 then
    raise exception 'AFFILIATES-1 APPLY FAIL: % privilegios de cliente sobre las tablas', v_n;
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.acquisition_attributions'::regclass
                    and tgname = 'acquisition_attributions_no_update') then
    raise exception 'AFFILIATES-1 APPLY FAIL: la atribución no es inmutable (falta el trigger)';
  end if;

  if not (select prosecdef from pg_proc where oid = v_fc)
     or not (select prosecdef from pg_proc where oid = v_fk) then
    raise exception 'AFFILIATES-1 APPLY FAIL: una función no es security definer';
  end if;
  if (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = v_fc)
       <> 'search_path=public, pg_temp'
     or (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = v_fk)
       <> 'search_path=public, pg_temp' then
    raise exception 'AFFILIATES-1 APPLY FAIL: search_path sin fijar';
  end if;

  if has_function_privilege('anon', v_fc, 'execute')
     or not has_function_privilege('authenticated', v_fc, 'execute') then
    raise exception 'AFFILIATES-1 APPLY FAIL: capture debe ser sólo de authenticated';
  end if;
  if not has_function_privilege('anon', v_fk, 'execute') then
    raise exception 'AFFILIATES-1 APPLY FAIL: la landing (anon) no puede contar visitas';
  end if;

  raise notice 'AFFILIATES-1 APPLY VERIFIED — 2 tablas cerradas, atribución inmutable, capture sólo authenticated';
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN MANUAL (después del commit)
-- ============================================================================
-- -- capture como un usuario recién creado (simulación de JWT):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<uuid-nuevo>","role":"authenticated"}', true);
-- select public.aurix_attribution_capture('[{"code":"123456","seenAt":"<iso-reciente>"}]');  -- captured
-- select public.aurix_attribution_capture('[{"code":"654321","seenAt":"<iso-reciente>"}]');  -- already_captured
-- rollback;
-- -- visitas: select public.aurix_affiliate_click('123456');  -- counted
-- ============================================================================
