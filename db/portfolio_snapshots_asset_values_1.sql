-- ============================================================================
-- AURIX · ASSET-LEVEL HISTORICAL DATA FOUNDATION
-- portfolio_snapshots.asset_values
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.  *** NOT YET APPLIED ***
-- Idempotent + ADDITIVE: adds ONE nullable column. Touches no existing column,
-- no index, no policy, no row. `total_value_usd`, `real_estate` and
-- `category_values` conservan exactamente el mismo significado.
--
-- POR QUÉ AHORA, AUNQUE NADIE LO LEA TODAVÍA
--   La Fase 2 demostró que Aurix puede atribuir el cambio de patrimonio a nivel
--   de CATEGORÍA (category_values + capital_flows), pero no a nivel de POSICIÓN,
--   porque no existe una serie temporal por activo. Esa serie no se puede
--   reconstruir después: hacerlo exigiría pedir precios históricos a un
--   proveedor externo, lo que no es determinista (rate limits, huecos), no es
--   auditable y haría que dos dispositivos calculasen números distintos — justo
--   lo que el contrato financiero de Aurix prohíbe.
--   Por eso el coste de esperar no es cero: la serie empieza el día que se
--   persiste, no el día que se decide usarla.
--
-- POR QUÉ UNA COLUMNA JSONB Y NO UNA TABLA
--   Es el MISMO patrón que `category_values`, ya en producción: un mapa por
--   snapshot, escrito y leído junto al resto de la fila. Una tabla normalizada
--   (snapshot_id, asset_id, value) sería una segunda arquitectura histórica en
--   paralelo, con su FK, su retención y su join — para el mismo dato. La forma
--   mínima que preserva identidad + valor + instante es esta.
--
-- POR QUÉ NULLABLE Y SIN DEFAULT  ← la decisión importante de este fichero
--   `category_values` es `not null default '{}'::jsonb`. Copiar eso aquí sería
--   un error de semántica: los miles de snapshots ya capturados pasarían a decir
--   `{}` = "este usuario no tenía ninguna posición", cuando la verdad es "esto
--   no se capturaba todavía". Una futura atribución leería una cartera vacía
--   donde había patrimonio. NULL es la única representación honesta de NO DATA.
--
-- FORMA:  { "<asset_id>": <usd_value>, ... }
--   · clave  = holdings.asset_id (la identidad canónica del join catálogo⋈holdings,
--              la misma que ya usan los capital_flows). Nunca ticker ni nombre.
--   · valor  = USD de la posición en el instante `ts`, misma valoración que
--              alimenta `total_value_usd` y `category_values`.
--   · una posición sin precio válido NO aparece. Y no puede haber un mapa
--     parcial: el guard LB-1 del capturador descarta el snapshot entero cuando
--     alguna posición activa queda sin valorar, así que todo `asset_values`
--     persistido está completo por construcción.
--
-- WRITE-ONLY POR AHORA: ningún cálculo, insight, gráfico ni UI lo consume. Sólo
-- se acumula para que una SPEC futura pueda calcular peso histórico, cambio de
-- valor y —cruzándolo con capital_flows.asset_id— separar mercado de flujo.
-- ============================================================================

alter table public.portfolio_snapshots
  add column if not exists asset_values jsonb;

comment on column public.portfolio_snapshots.asset_values is
  'ASSET-LEVEL HISTORICAL DATA FOUNDATION — { asset_id: usd_value } de cada posición valorada en `ts`. NULL = no capturado (snapshot anterior a esta capacidad); NO equivale a cartera vacía. Sólo se escribe en snapshots completos (dropped_asset_count = 0). Write-only: ningún consumidor de producto lo lee todavía.';
