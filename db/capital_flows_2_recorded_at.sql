-- ============================================================================
-- AURIX ADVANCED INTELLIGENCE · §3  ·  capital_flows.recorded_at   *** NOT YET APPLIED ***
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- *** NOT YET APPLIED — PENDING FOUNDER AUTHORIZATION (SPEC §3). ***
--
-- Idempotent + STRICTLY ADDITIVE: one nullable column on an existing table. No
-- backfill, no default, no constraint, no index, no RLS change, no data rewrite.
-- Nothing that exists today changes behaviour if this is never applied.
--
-- WHY IT IS NEEDED
--   `capital_flows.ts` is the ECONOMIC instant of the operation (`effectiveAt`):
--   the user chooses it and it can be in the past, because a purchase made two
--   years ago did happen two years ago. What the table cannot express today is
--   WHEN THE ROW ENTERED AURIX (`recordedAt`) — and §3 requires Intelligence to
--   tell those two apart, because they produce different true sentences:
--
--     effectiveAt old + recordedAt today  → "Hoy has registrado 100 acciones…"
--     effectiveAt today                   → "Hoy has comprado 100 acciones…"
--     recordedAt unknown                  → "Tienes registrado …"   (never "hoy")
--
-- WHY NULLABLE, AND WHY NO BACKFILL
--   Every row written before this column exists has NO provenance, and there is
--   no honest way to reconstruct it: `ts` is the economic date, `updated_at` moves
--   on every edit, and inventing either would be the precise error §3 forbids
--   ("no reconstruir 'lo hiciste hoy'"). NULL is the truthful value and the reader
--   already treats it as UNKNOWN, which fails towards "Tienes registrado" instead
--   of towards a claim about today.
--
-- CURRENT STATE WITHOUT THIS MIGRATION (declared limit, not a silent gap)
--   `_aurixCaptureFlow` writes `recordedAt` into the LOCAL ledger, so the device
--   that performed the operation says "Hoy has registrado …" correctly and
--   immediately. `_aurixCapitalFlowsPull` merges remote rows with `Object.assign`
--   over the keys the remote row carries, so a local `recordedAt` SURVIVES a
--   remote revision bump rather than being erased. A SECOND device receives the
--   row without the field, reads provenance as UNKNOWN, and degrades to "Tienes
--   registrado …". No device ever claims a registration day it cannot prove.
--
-- AFTER APPLYING (follow-up, deliberately NOT shipped in this release)
--   `_aurixFlowRowFromLocal` must start sending `recorded_at`, using the same
--   write-time schema discovery already proven for the `intent` column (an upsert
--   naming an absent column fails COMPLETELY, so the column can only be included
--   once its presence is demonstrated by a successful write). That wiring is held
--   back on purpose: turning it on before this SQL is applied would make every
--   device's first ledger write fail and retry, on a production financial ledger,
--   for no gain.
-- ============================================================================

alter table public.capital_flows
  add column if not exists recorded_at timestamptz;

comment on column public.capital_flows.recorded_at is
  'When this operation was RECORDED IN AURIX. Distinct from ts, which is the economic instant of the operation. NULL = provenance unknown (row written before this column existed, or by a client that does not send it); readers must treat NULL as UNKNOWN and must never infer a registration date from ts.';

-- VERIFY (read-only):
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'capital_flows'
--      and column_name = 'recorded_at';
-- Expected after apply: one row, timestamptz, YES.
-- "Ejecuté el SQL y no dio error" NO es prueba de que esté aplicado: la prueba es
-- esta consulta devolviendo la fila.
