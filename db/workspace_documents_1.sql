-- ============================================================================
-- AURIX WORKSPACE COMPLETION · §4  ·  public.workspace_documents   *** APPLIED 2026-09-16 ***
-- ----------------------------------------------------------------------------
-- Apply: paste this whole file into the Supabase SQL editor for the project
-- referenced by SUPABASE_URL in config.js, then run.
-- *** APPLIED: run by the founder on 2026-09-16 in the production SQL editor
--     ("Success. No rows returned"). Verified from outside with the
--     publishable key: /rest/v1/workspace_documents went from PGRST205
--     (absent) to 42501 (exists, no grant for that role) — which is the
--     only external proof that the transaction committed. Idempotent:
--     re-running it changes nothing. ***
--
-- Idempotent and ADDITIVE: creates ONE new table. Touches no existing table, no
-- existing column, no existing policy. Before it was applied Workspace stayed
-- device-local and said so; that fallback is still the behaviour if the table is
-- ever revoked or dropped.
--
-- WHY IT IS NEEDED
--   The ten `aurix_ws_*_v1` keys live in ONE browser's localStorage. app.js says
--   so in two places, and WORKSPACE-LAUNCH-V1 used it as the reason to publish
--   only the two stateless calculators: "sólo se publica lo que NO guarda trabajo
--   del usuario". The six Premium templates of the canonical catalog all save
--   work, so publishing them without this table would promise a permanence Aurix
--   does not give — the user loses everything on a second device or a storage
--   clear. §4 is explicit: "no declarar sincronizado un guardado exclusivamente
--   local".
--
-- WHY A DEDICATED TABLE, NOT ONE MORE jsonb COLUMN
--   The existing remote persistences (portfolio_history, category_history,
--   watchlist, subscription, preferences, ui_state) are jsonb columns written by a
--   LAST-WRITER-WINS full-row upsert. The Intelligence cross-device work already
--   paid for that lesson: the push replaced the whole record, so a device that
--   only LOOKED erased what the other had answered. A Workspace document is a
--   USER-AUTHORED artifact — a budget, a journal, a set of goals — and losing one
--   is losing work, not a cache. One row per document, addressed by a stable
--   client id, so two devices editing two different documents can never collide.
--
-- CONFLICTS ARE RESOLVED, NOT SILENCED
--   `revision` is bumped by every edit and is the authority, exactly like
--   capital_flows: a later edit always wins and a stale client cannot resurrect an
--   old body. `updated_at` is audit, never the arbiter — a clock is not an
--   authority (that is why capital_flows resolves by revision and not by time).
--   `deleted_at` is a tombstone: deleting a document from the client hides it, it
--   does not destroy it, so a delete racing an edit cannot lose the edit.
--
-- WHAT IT IS NOT
--   Not a ledger, not money, and nothing here is real. A budget is a PLAN and a
--   projection is a SIMULATION; `nature` records which, so a future Intelligence
--   integration can never mistake a planned figure for an observed one. Nothing
--   in this table may ever be summed into wealth.
-- ============================================================================

create table if not exists public.workspace_documents (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- Stable, client-generated, opaque. NOT derived from the title or the body: a
  -- rename must update the SAME row, never insert a second document.
  doc_id      text        not null,
  -- Which capability owns it ('monthly_budget', 'trade_journal', 'goals', …).
  -- Text, not an enum: publishing a new template must not require a migration.
  kind        text        not null,
  title       text,
  -- The document itself. The client owns its shape; the server never interprets
  -- it, so a template can evolve its fields without a migration.
  body        jsonb       not null default '{}'::jsonb,
  -- §CONTINUIDAD — provenance travels WITH the document, so a future Intelligence
  -- integration inherits it instead of guessing:
  --   'declared'  · the user typed it
  --   'projected' · Aurix computed it from the user's assumptions
  --   'simulated' · a what-if, true of no actual portfolio
  -- Never 'observed': this table holds no measurement.
  nature      text        not null default 'declared',
  -- The currency the numbers in `body` are written in. Without it, a base-currency
  -- change would silently reinterpret every amount the user ever saved.
  currency    text        not null default 'EUR',
  -- Schema version of `body` for THIS kind. §B: old saved documents keep their
  -- convention and are never reinterpreted silently.
  body_version int        not null default 1,
  revision    int         not null default 1,        -- bumped by every edit / delete: the authority
  deleted_at  timestamptz,                           -- tombstone, so a delete cannot lose a concurrent edit
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),    -- audit only, never the arbiter
  primary key (user_id, doc_id)
);

-- The reader is always "this user's live documents of one kind, most recent first".
create index if not exists workspace_documents_user_kind_idx
  on public.workspace_documents (user_id, kind, updated_at desc)
  where deleted_at is null;

alter table public.workspace_documents enable row level security;
alter table public.workspace_documents force  row level security;

-- Fail-closed per user: a client may only ever see and write its OWN rows.
-- No DELETE policy on purpose — a delete is a tombstone (UPDATE deleted_at), so a
-- document cannot be physically destroyed from the client and a delete racing an
-- edit cannot lose work.
drop policy if exists workspace_documents_select_own on public.workspace_documents;
create policy workspace_documents_select_own
  on public.workspace_documents for select
  using (auth.uid() = user_id);

drop policy if exists workspace_documents_insert_own on public.workspace_documents;
create policy workspace_documents_insert_own
  on public.workspace_documents for insert
  with check (auth.uid() = user_id);

drop policy if exists workspace_documents_update_own on public.workspace_documents;
create policy workspace_documents_update_own
  on public.workspace_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── THE GRANT THAT THIS PROJECT ALREADY PAID FOR ONCE ───────────────────────
-- Project DEFAULT PRIVILEGES grant `anon` SELECT on NEW tables in `public`. That
-- was found on the Intelligence tables (advanced_intelligence_u1_1.sql:205): RLS
-- was the ONLY barrier and the grant was not. RLS above is fail-closed and
-- `auth.uid()` is null for `anon`, so no row is reachable either way — but a
-- barrier that depends on one mechanism is one mistake away, so the grant goes
-- too. Same two lines as U1, for the same reason.
revoke all privileges on table public.workspace_documents from anon;
grant select, insert, update on table public.workspace_documents to authenticated;

-- VERIFY (read-only). "Ejecuté el SQL y no dio error" is NOT proof it applied.
--   -- 1 · the table exists with its columns
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'workspace_documents'
--    order by ordinal_position;
--   -- 2 · RLS is on AND forced
--   select relrowsecurity, relforcerowsecurity
--     from pg_class where oid = 'public.workspace_documents'::regclass;
--   -- expect: true, true
--   -- 3 · exactly three policies, and NO delete policy
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'workspace_documents' order by cmd;
--   -- expect: insert, select, update  (never delete)
--   -- 4 · anon holds nothing
--   select count(*) as debe_ser_cero from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'workspace_documents'
--      and grantee = 'anon';
--   -- expect: 0
