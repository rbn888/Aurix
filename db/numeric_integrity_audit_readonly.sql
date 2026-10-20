-- ============================================================================
-- AURIX · LOTE 1 P0 INTEGRIDAD NUMÉRICA — AUDITORÍA HISTÓRICA  ·  100% READ-ONLY
-- ----------------------------------------------------------------------------
-- NO EJECUTADA DESDE EL REPO. Requiere aprobación del founder. Pegar en el SQL
-- Editor de Supabase (rol con lectura de public.user_portfolios) y ejecutar.
-- Una sola sentencia SELECT: no crea, no escribe, no abre transacción.
--
-- FORMA REAL DE LOS DATOS (convertToNewModel, app.js): `assets` es el CATÁLOGO
-- ({id, type, currentPrice, rent, isin, …}) y `holdings` las POSICIONES
-- ({asset_id, quantity, transactions[{type, qty, price, ts, pv?}]}). Se cruzan por
-- id. Una fila legada con activos planos (qty/price/transactions en `assets`) se
-- lee también: cada campo cae al plano si falta en el modelo nuevo.
--
-- QUÉ BUSCA — huellas compatibles con el parser de v851 y anteriores, que quitaba
-- TODO punto («0.2»→2, «300.50»→30050) y con el autorrelleno ISIN («45.1234»→451234):
--   H1  precio de una COMPRA ≈ 10× / 100× / 1.000× / 10.000× el precio actual del
--       activo (±20 % alrededor de cada potencia de 10). Excluye liquidez e inmuebles.
--   H2  inmueble con alquiler mensual > 0 y < 10 (edición en EN: «1,200» → 1,2).
--   H3  cripto con cantidad ENTERA ≥ 2 valorada en > 100.000 («0.2» BTC → 2).
--   H4  (confianza BAJA) fondo/ETF con ISIN cuyo precio actual supera 1.000: el
--       autorrelleno ISIN inflaba a la vez el precio y la compra, así que H1 no lo
--       ve (su razón queda ≈ 1). La mayoría de NAV están por debajo de 1.000, pero
--       no todos: es sólo una pista para revisar.
-- Las operaciones con `pv = 2` se escribieron con el contrato nuevo y se excluyen.
--
-- LÍMITES — un candidato NO es un error demostrado: un precio de compra antiguo,
-- un activo que se ha multiplicado, un alquiler simbólico o una cartera grande dan
-- las mismas huellas. No ve lo que sólo vive en el localStorage de un navegador
-- (render corrige en memoria y no guarda; el remoto suele llevar ya la corrección
-- ÷100 de precios > 100.000). No detecta la cantidad ×10 de editar una operación
-- salvo que caiga en H3. Nada se corrige, borra ni migra: la decisión por
-- candidato es del founder y, si procede, del propio usuario.
--
-- PRIVACIDAD — no sale email, nombre, user_id, símbolo ni importe. Por candidato
-- sólo: un seudónimo de cuenta (md5 truncado del user_id, para localizarla con una
-- segunda consulta autorizada), el tipo de activo, la heurística y la BANDA de la
-- razón. El primer bloque es agregado.
--
-- ORDEN DE EVALUACIÓN — Postgres no garantiza que un filtro WHERE se evalúe antes
-- que un cast del SELECT; por eso todo cast y todo log van dentro de CASE, que sí
-- garantiza el orden: un valor no numérico da NULL, nunca un error.
-- ============================================================================
with acc as (
  select up.user_id,
         case when jsonb_typeof(up.assets::jsonb)   = 'array' then up.assets::jsonb   else '[]'::jsonb end as cat,
         case when jsonb_typeof(up.holdings::jsonb) = 'array' then up.holdings::jsonb else '[]'::jsonb end as hold
  from public.user_portfolios up
),
pos as (
  select acc.user_id, c.value as c,
         (select h.value from jsonb_array_elements(acc.hold) h(value)
           where jsonb_typeof(h.value) = 'object'
             and coalesce(h.value->>'asset_id', h.value->>'id') = c.value->>'id'
           limit 1) as h
  from acc, jsonb_array_elements(acc.cat) c(value)
  where jsonb_typeof(c.value) = 'object'
),
num as (
  select user_id, c, h,
         c->>'type' as type,
         nullif(c->>'isin', '') as isin,
         case when coalesce(h->>'quantity', c->>'qty') ~ '^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$'
              then coalesce(h->>'quantity', c->>'qty')::numeric end as qty,
         case when coalesce(c->>'currentPrice', c->>'price') ~ '^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$'
              then coalesce(c->>'currentPrice', c->>'price')::numeric end as price,
         case when (c->>'rent') ~ '^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then (c->>'rent')::numeric end as rent,
         case when jsonb_typeof(h->'transactions') = 'array' then h->'transactions'
              when jsonb_typeof(c->'transactions') = 'array' then c->'transactions'
              else '[]'::jsonb end as txs
  from pos
),
tx as (
  select n.user_id, n.type, n.price,
         case when (t.value->>'price') ~ '^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then (t.value->>'price')::numeric end as txp
  from num n, jsonb_array_elements(n.txs) t(value)
  where jsonb_typeof(t.value) = 'object' and t.value->>'type' = 'buy'
    and coalesce(t.value->>'pv', '') <> '2'
),
ratio as (
  select user_id, type,
         case when price > 0 and txp > 0 and txp / price >= 8 then log(10, txp / price) end as lg
  from tx where type not in ('cash', 'real_estate')
),
h1 as (
  select user_id, type, 'H1_buy_price_x10n'::text as h, round(lg)::int as band
  from ratio where lg is not null and abs(lg - round(lg)) <= 0.08
),
h2 as (
  select user_id, type, 'H2_rent_lt_10'::text as h, null::int as band
  from num where type = 'real_estate' and rent > 0 and rent < 10
),
h3 as (
  select user_id, type, 'H3_crypto_int_qty_high_value'::text as h, null::int as band
  from num where type = 'crypto' and qty >= 2 and qty = trunc(qty) and price > 0 and qty * price > 100000
),
h4 as (
  select user_id, type, 'H4_isin_price_gt_1000_low_confidence'::text as h, null::int as band
  from num where type in ('fund', 'etf') and isin is not null and price > 1000
),
cand as (select * from h1 union all select * from h2 union all select * from h3 union all select * from h4)
select 'summary' as section,
       jsonb_build_object(
         'accounts_examined',  (select count(*) from acc),
         'positions_examined', (select count(*) from pos),
         'buy_tx_examined',    (select count(*) from tx),
         'H1_candidates',      (select count(*) from h1),
         'H2_candidates',      (select count(*) from h2),
         'H3_candidates',      (select count(*) from h3),
         'H4_candidates',      (select count(*) from h4),
         'accounts_with_any',  (select count(distinct user_id) from cand)
       ) as detail
union all
select 'candidate',
       jsonb_build_object('account', left(md5(user_id::text), 10), 'type', type, 'heuristic', h,
                          'ratio_power_of_10', band)
from cand;
