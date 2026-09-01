# AURIX MONETIZATION V1 · M.02 — B0/B1 COMMERCIAL TRUTH FOUNDATION

Continues `docs/AURIX-MONETIZATION-M02-PHASE-A.md`. Implemented on `main` @ `43b3079` (v695 LIVE).

**This block is invisible to the user.** It adds server-authoritative infrastructure and changes
no behaviour: no enforcement, no paywall, no gate moved, no price shown, no UI touched.

---

## COMMERCIAL TRUTH CONTRACT V1

1. The **billing provider** informs the backend. Nothing else may.
2. Only **backend / service-role** writes commercial state.
3. `public.subscriptions` represents **billing / subscription state**.
4. `public.plan_features` represents the **capabilities included by a plan**.
5. `public.entitlement_overrides` represents **non-commercial exceptions** (founder, comp, QA, support).
6. The future entitlement resolver (B2) combines **subscription + plan_features + a valid override**.
7. The frontend consumes the **resolved result**, never the raw tables.
8. The frontend **never grants Premium**.
9. Absence or error of commercial truth resolves **fail-closed**: no row, no answer, no session ⇒ no Premium.
10. **Founder ≠ paying customer.** Founder access is an override, never a subscription.
11. **Overrides never count as MRR/ARR** — they live in a *different table*, so every aggregate over
    `subscriptions` excludes them structurally. (Phase A's `source` is a field of the *resolver output*
    in B2, not a stored column; nothing in the schema is named `source`.)
12. **Legacy state never grants a right.** See the section at the bottom of this file.

---

## B0 — LEGACY COMMERCIAL STATE INVENTORY

**Status: query prepared, execution pending on the founder. B1 does not depend on it.**

The only Supabase credential in the repository is the publishable/anon key in `config.js`, and `anon`
has no privilege on `user_portfolios`. Verified against production, read-only:

```
GET /rest/v1/user_portfolios?select=subscription&limit=5   (apikey: publishable)
→ HTTP 401  {"code":"42501","message":"permission denied for table user_portfolios"}
```

A service-role key would be required, and a service-role key must never enter this repo or a shell
command (`db/supabase_rls.sql`). So the inventory is `db/monetization_b0_legacy_inventory.sql`, to be
run by the founder in the Supabase SQL editor. It is READ-ONLY: five SELECTs, zero mutating statements.

Also verified against production, same probe: `subscriptions`, `entitlement_overrides` and
`plan_features` all return **404** — none of them exists yet, so B1 creates rather than alters.

**Why B1 is not blocked by the answer:** whatever the count is, the values are client-controlled
(`app.js` writes `user_portfolios.subscription`, and RLS grants the user UPDATE on their own row).
There is no paid channel in production, so no value there can be evidence of a purchase. The new
tables start **empty**, and an absent row means Free — the correct state for every existing user.
Migrating those values would launder self-granted tiers into real subscriptions. **No backfill.**

---

## B1 — WHAT WAS CREATED

One migration: **`db/monetization_commercial_truth_1.sql`** — idempotent, additive, three new tables.
It touches no existing table, column or row.

### `public.subscriptions`
One effective commercial row per user (`user_id` is the primary key). Billing history and concurrent
subscriptions are deliberately not modelled yet.

`plan` is **`free | premium` only — there is no `founder` plan.** This is the one place where this
block overrides Phase A section D: Phase A listed `founder` as a commercial plan, and section G.3 of
the same document then seeded founder access as an *override*. Both cannot be true. Keeping `founder`
out of `plan` is what makes MRR/ARR computable without a second exclusion table.

Sensitive columns — `provider_customer_id`, `provider_subscription_id`, `last_event_id`,
`price_amount_cents`, `price_currency` — exist and have **no client read path at all** (see RLS).

Two deliberate naming deviations from the SPEC field list:
- `billing_interval` instead of `interval` — `INTERVAL` is a Postgres type keyword; a column with
  that name has to be quoted forever.
- `price_currency` instead of `currency` — pairs with `price_amount_cents`, and can never be confused
  with the user's *display* currency, which is a preference in `user_portfolios`.

Constraints: enums on `plan` / `status` / `provider` / `billing_interval`; trial and period ends not
before their starts; price non-negative; `price_currency` an ISO-4217 alpha-3; amount and currency
present or absent together.

**Three constraints exist specifically to close a fail-OPEN found in adversarial review.** Validating
each field in isolation is not enough: `(u,'premium','active','stripe','month')` with the period
columns missing — a truncated webhook payload, a failed second statement, a hand repair — satisfied
every per-field check and was **byte-identical to a legitimate lifetime purchase**. Any natural
resolver predicate (`current_period_end is null or current_period_end > now()`) would then grant
Premium forever, surviving cancellation and card failure. A partial row is Aurix's historical failure
class, so the schema refuses it:

- `subscriptions_premium_bound_chk` — a **live** premium row (`active` / `trialing`) must either carry
  `current_period_end` or say `billing_interval = 'lifetime'` explicitly. Lifetime is still
  expressible; it just has to be *stated* rather than inferred from missing data.

  This constraint uses **`is not distinct from`, not `=`**, and the reason is the whole point of the
  guard. The first version wrote `billing_interval = 'lifetime'`; with the column NULL that comparison
  is NULL, so the chain evaluated to `false or false or NULL or false = NULL` — and **Postgres accepts
  a CHECK that returns NULL.** The most partial row of all (premium/active, no interval, no period —
  exactly what a `checkout.session.completed` payload or a hand repair produces) sailed straight
  through the constraint written to stop it. Caught in adversarial review, not by the example-based
  test, because the example carried `billing_interval = 'month'`. The gate now sweeps 15,360 rows and
  asserts that **no constraint on these tables can ever abstain**, which closes the class rather than
  the instance.
- `subscriptions_trialing_bound_chk` — a `trialing` row must carry `trial_end`.
- `subscriptions_premium_price_chk` — a live premium row must carry its canonical amount. This is what
  keeps **contract point 10 true inside the billing table**: `provider = 'manual'` is required by the
  SPEC and legitimately needed for support repairs, but it would otherwise let a comp'd account sit
  here as an indistinguishable premium row, and price is nullable for real provider rows too, so
  `price is null` could not separate them. With the constraint:

  ```
  paying ⇔ plan='premium' and status in ('active','trialing') and price_amount_cents > 0
  ```

  Note for B9: Stripe returns `currency` lowercase and Apple's price is in milli-units — see residual 6.

  A comp is an explicit `0`. Founder / QA / comp still belong in `entitlement_overrides` and must not
  be written here at all.

A `canceled` or `expired` row is deliberately *not* constrained this way — over-constraining the end
of life would block the very webhook that records a cancellation.

**What the two partial unique indexes do and do not guarantee** — `(provider, last_event_id)` and
`(provider, provider_subscription_id)`. They guarantee that one provider event id cannot be recorded
against two *different* users, and that one provider subscription cannot entitle two accounts. They
do **not** deliver webhook idempotency: with one row per user, a re-delivered event that updates the
same row to the same `last_event_id` conflicts with nothing and is applied twice. Real idempotency is
the writer's job in B9 (`update … where user_id = $1 and (last_event_id is null or last_event_id <>
$2)`); the column is recorded from day one so that guard has something to compare against.

### `public.entitlement_overrides`
Founder / comp / QA / support access, with **no payment information**. One representation covers both
cases the SPEC asks for: `feature_key = '*'` is a global premium grant, anything else is a single
feature. `allowed` can be `false`, so a revoked grant stays **visible as a denial** instead of
vanishing. `unique (user_id, feature_key)`, `reason in (founder|comp|qa|support)`, `granted_by` for
audit, `starts_at` / `expires_at` window with `expires_at > starts_at`.

Honest limit: `unique (user_id, feature_key)` makes this **last-write-wins**, so setting
`allowed = false` overwrites the `reason` / `granted_by` of the grant it revokes. This is a
*current-state* table, not a grant history — a full grant/revoke log is B11 and is not pretended here.

### `public.plan_features`
The map `plan → feature`, server-side. Today the equivalent map is `PLAN_FEATURES` /
`PREMIUM_FEATURES` in the shipped bundle, which means the JavaScript decides what a plan includes.
From B2 on, this table decides.

**V1 keys, and only these three:**

| Key | Free | Premium |
|---|---|---|
| `workspace.loan` | false | true |
| `intelligence.full` | false | true |
| `premium.settings` | false | true |

Rows are explicit on both sides so the map is inspectable and a missing row is unambiguously a bug.
The resolver in B2 still treats **absence as false**.

Deliberately **not** keys: `workspace.compound` (Compound is Free behaviour), `intelligence.preview`
(the preview is the fail-closed fallback, not a right), `workspace.access` and `workspace.templates`
(not decided / nothing to gate yet). A key is a capability that must be *granted*; a Free default
never gets one.

The `feature_key` CHECK is a **format** check, not an allowlist, so adding a capability in B5/B6 does
not require a constraint migration. The exact V1 key *set* is asserted by the harness, which is where
that contract belongs.

`plan_features_free_denies_chk` — **a free row can only ever deny** (`plan <> 'free' or allowed =
false`). This is the one table where a single row changes what the entire user base can do, and the
worst row is `('free', <any premium key>, true)`: one INSERT hands a paid capability to every Free
user, and the seed's `on conflict do update` would never correct it because a future key is not in the
seed list. RLS cannot defend this — the realistic actor is an admin or service-role mistake, and
`service_role` bypasses RLS by design — so the guarantee has to be a constraint. Granting a capability
to Free means *removing its key*, not flipping this flag.

### `public.aurix_commercial_state()`
The **sanitized read surface**. The frontend never reads `subscriptions`; it reads this function,
which returns only its own row and only the non-sensitive projection: `plan`, `status`, `provider`,
`billing_interval`, `trial_end`, `current_period_end`, `cancel_at_period_end`, `updated_at`.

**Zero rows = no subscription = Free.** Absence, error and unauthenticated all resolve to "no
Premium", which is the fail-closed reading. The function does **not** resolve entitlements — it never
looks at `entitlement_overrides` or `plan_features`. Combining the three is B2's job, and keeping it
out of here is what stops the client from doing that arithmetic itself.

Same pattern as the existing `public.validate_invite_code(text)` in `db/supabase_rls.sql`: table
closed, narrow `SECURITY DEFINER` surface open, `execute` granted to `authenticated` only.

---

## RLS — WHY SELF-UPGRADE IS IMPOSSIBLE

Three independent locks, because one is never enough:

1. **Privileges.** Supabase's default privileges grant `ALL` on new `public` tables to `anon` and
   `authenticated`. The migration `REVOKE`s them on all three tables (and re-grants only `SELECT` on
   `plan_features`). Privileges are checked **before** row security, so even a future policy mistake
   cannot open a write path.
2. **RLS enabled with no permissive policy** for `anon` / `authenticated` on `subscriptions` and
   `entitlement_overrides` ⇒ default deny.
3. **A `RESTRICTIVE` deny policy** on those two tables. Permissive policies OR together, so an
   accidental future `select_own` policy would open the table; restrictive policies AND with
   everything. This is the lock that survives a future mistake.

`force row level security` is deliberately **not** used. FORCE only affects the *table owner*, which
here is the administrator who seeds and repairs these rows from the SQL editor; the threat model is
the `authenticated` role, against which FORCE adds nothing. This matches `portfolio_snapshots_1.sql`,
the existing service-role-written table. (`user_portfolios` and `capital_flows` use FORCE because
there the client *is* a legitimate writer — a different situation.)

`service_role` bypasses RLS by design and is the future writer. It is not present in the client
bundle and must never be.

**Function privileges are revoked from the named roles, not just from `PUBLIC`.** Supabase's default
privileges grant `EXECUTE` on new functions to `anon` and `authenticated` as named roles, and a
`revoke … from public` does not remove a role-specific grant. `anon` calling
`aurix_commercial_state()` today would only get 0 rows (`auth.uid()` is null) — harmless now, and it
would stop being harmless the moment B2 widens the projection. Both functions are therefore revoked
from `public, anon, authenticated` explicitly, and only `aurix_commercial_state()` is re-granted to
`authenticated`.

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `subscriptions` | nothing | nothing (reads via the sanitized function) | full |
| `entitlement_overrides` | nothing | nothing | full |
| `plan_features` | nothing | `SELECT` only | full |

---

## LEGACY CLIENT STATE ≠ COMMERCIAL TRUTH

Everything below still exists and still works exactly as before. **None of it may ever be used to
grant Premium**, and none of it feeds the tables created in B1:

`localStorage.aurix_plan` · `localStorage.aurix_subscription_updated_at` ·
`user_portfolios.subscription` + `subscription_updated_at` · `hasAurixPremiumAccess()` ·
`PLAN_FEATURES` · `PREMIUM_FEATURES` · `PLAN_CATALOG` · `PLAN_LIMITS` · `PROMO_CODES` ·
`applyPromoCode` · `_WS_APP_IDENTITY[].premiumTier` · `AURIX_PREMIUM_UI_ENABLED` · the premium modal
prices · `FOUNDER.founderSlotsTaken` · the Workspace and Intelligence previews.

They are kept intact on purpose: B1 introduces the new authority **without changing behaviour**.
The progressive retirement is B2–B7, in that order, and the first block that changes what a user sees
is B5.

`aurix_pce_founder` is a chart diagnostics toggle. It is **not** commercial, despite the name.

---

## STATE AFTER THIS BLOCK

```
Billing provider            [not built — B9/B10]
        ↓
Commercial truth            ✅ server-authoritative (this block)
        ↓
Entitlement resolver        [next — B2]
        ↓
Features / UI               [B3–B7 — unchanged today]
```

`ENFORCE_ENTITLEMENTS` is still `false`. Stripe and Apple are still unimplemented. The Chart Engine,
`portfolio_snapshots`, `capital_flows` and every financial owner are untouched.

---

## RESIDUALS — carried, with cause

Nothing here blocks B1. Each is either out of this block's scope or not fixable in a schema.

1. **DB↔file divergence is undetectable by the gate.** `create table if not exists` silently no-ops, and
   the harness models the *file*, never the database. A column or CHECK added to this file later will
   not reach a database that already has the tables, and the gate will still report the new contract
   satisfied. Mitigation: verification queries 3b/3c in the migration dump the real columns,
   constraints and function ACLs for comparison. **Anyone editing this file after it has been applied
   must ship an explicit `alter table`, not an edit to the `create table` body.**
2. **Real webhook idempotency is B9's, not the schema's.** See the index note above.
3. **Grant/revoke history for overrides is not kept** (last-write-wins). A full audit log is B11.
4. **`on delete cascade` erases commercial history** when an auth user is deleted, so historical MRR is
   not reconstructible from this table. Kept deliberately: it is the convention of every existing Aurix
   table (`capital_flows`, `portfolio_snapshots`), and changing it would break account deletion. A
   billing-events log that outlives the user is B11.
5. **One row per user means a provider switch overwrites the previous provider's row.** If a user is
   ever billed by Stripe and Apple at once, the schema cannot represent it and the second write hides
   the first. Acceptable for V1 (no provider exists yet); B9/B10 must decide before the second provider
   ships. Related: `(provider, provider_subscription_id)` is correct against one Apple purchase
   entitling two accounts, but it surfaces as a unique violation on a natural
   `on conflict (user_id) do update` upsert — a restore-purchase across two Aurix accounts fails
   closed, and B9 must handle that specific conflict rather than retry forever.
6. **Two writer traps for B9, on the critical path of every paying user.** Making price mandatory on a
   live premium row is correct, and it promotes two pre-existing hazards:
   - **Stripe returns `currency` lowercase** (`"eur"`). `subscriptions_currency_chk` demands
     `^[A-Z]{3}$`, so a pass-through write is rejected on *every* paying row. That is loud and
     fail-closed — no wrong number is ever published — but if the handler answers `200` anyway, the
     user pays and stays Free. **B9 must `upper()` at the writer.**
   - **Apple's transaction price is in milli-units, not cents.** A raw pass-through writes 10× into a
     column named `_cents` and passes every CHECK. No constraint can catch a unit error; this is Aurix's
     classic failure class and declaring it is the only guard available here.
7. **B2 must apply the override time window and denial precedence.** `starts_at` / `expires_at` and
   `allowed = false` are stored but nothing enforces that a resolver honours them; an expired override
   read as a grant would be a fail-open. This is the first thing B2's own gate has to assert.
8. **Constraint totality is DERIVED, not intrinsic.** Every CHECK is total only because `plan`,
   `status`, `feature_key`, `reason`, `starts_at` and `allowed` are `NOT NULL`. If a future migration
   drops `NOT NULL` on `status`, `premium_bound_chk` returns NULL again for
   `(premium, NULL, NULL interval, NULL period)` and the fail-open is silently back. The sweep cannot
   see it, because its domains never generate NULL for those columns — so `Z.11` gates the pillars
   directly. **Dropping a `NOT NULL` on these tables is a fail-open change, not a relaxation.**
9. **The gate cannot observe Postgres.** No `psql`, no Docker, and the repo is zero-dependency, so the
   authorization decisions are resolved from the SQL rather than executed. Three things only the
   founder can confirm at apply time, all covered by the verification queries: that the `REVOKE`
   actually removes Supabase's default ACL (depends on the grantor role matching the SQL-editor role),
   the function ACL for `anon`, and that `service_role` retains full privileges (that failure mode is
   fail-closed).

**NEXT: M.02 B2 — server entitlement resolver + sanitized commercial state.**
