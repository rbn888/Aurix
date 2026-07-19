# RELEASE — Chart Integrity (LB-1 / LB-2 / LB-3)

> **Status: CERTIFIED IN STAGING — NOT DEPLOYED.** No production change, no merge to `main`.
> This document freezes the certified release. Rollout is gated on explicit authorization.

## Identity
| Field | Value |
|---|---|
| Release name | `chart-integrity-v1.0` |
| Git tag | `release/chart-integrity-v1.0-certified` |
| **Certified commit** | `4aa5553a771293308e48232841cf7b52047ad862` (`4aa5553`) |
| Branch | `repair/chart-integrity-lb123` |
| Pre-repair production base | `24f4726` (v558) |
| Diff | `git diff 24f4726..4aa5553` — 11 files, ~813 insertions, 3 deletions |
| Certified on | 24h+ staging soak, ended 2026-07-19T14:28Z |

## Environments
| | Ref / URL | Role |
|---|---|---|
| Production Supabase | `ozcasyufbknnuemllwso` | **read-only** during prep; rollout target |
| Staging Supabase | `rudocbifgefjknzrqvrt` | certified here; synthetic data only |
| Vercel staging preview | `https://aurix-staging-site-5651csl1w-rbn888s-projects.vercel.app` | certified frontend build |
| Production frontend | GitHub Pages (`rbn888.github.io/Aurix/`, via `.github/workflows/pages.yml`) | rollout target |
| Price API | Vercel `isa-portfolio-ten` | unchanged |

## What changed (all additive; flow-neutral return formula byte-untouched)
- **LB-1 (client)** — `_aurixAssessValuationCompleteness()`; `recordSnapshot`/`recordCategorySnapshot` hard-reject an incomplete valuation via a first-gate `valuation_incomplete` in `_shouldRejectSnapshot` (not quarantined). *(app.js)*
- **LB-1 (server)** — Edge Function `portfolio-snapshot` adds a `dropped` counter (active holdings excluded from the total, distinct from stale-but-valued) and **skips the insert when `dropped>0`** (`incompleteRej`), preserving the previous valid snapshot. *(supabase/functions/portfolio-snapshot/index.ts)*
- **LB-2** — `_aurixResolvePublicationReadiness()` gates the return contract; badge + hover tooltips withhold a number until hydration settles (`_aurixReturnPublishReadyNow`). Toggle `_AURIX_LB2_BLOCK_ON_HYDRATION_FAILED` (default `true`). *(app.js)*
- **LB-3** — `_aurixBackendHealth()` classifier + `scripts/aurix-backend-health.mjs` probe.
- **Observability** — `_aurixEmitIntegrityEvent` (counts/reason codes only; no balances/PII).
- **CI** — `scripts/aurix-ci-gate.mjs` fail-closed; `.github/workflows/pages.yml` `deploy` needs `gate`.
- **Tests** — 6 new harnesses; suite **171/171**; fail-closed gate proven.

## Certification evidence
- Suite: **171/171** green (clean tree); deliberate-failure → `NO-GO` exit 1 (fail-closed proven).
- Soak: **25.9h**, **124/124 cron runs succeeded (0 failed)**, **415 snapshots, 0 partial/null/≤0**, **0 duplicates**, **0 incomplete-user rows**, overnight closed-app continuity verified (60 snaps 01:00–05:45Z), **HEALTHY** throughout.
- Frontend (real browser vs staging): delayed hydration → "Calculando…" (no premature number); backend unavailable → safe state; published 24H "+2.06%" when coverage met; longer ranges honestly partial; reload consistent.
- Evidence: `/Users/ruben/aurix-soak-evidence/` and `docs/AURIX-CHART-INTEGRITY-CERTIFICATION-RUNBOOK.md`.

## Rollout artifacts
`PRODUCTION_ROLLOUT_CHECKLIST.md` · `ROLLBACK.md` · `POST_DEPLOY_VERIFICATION.md` · `NEXT_PHASE.md`.

## Known constraints at rollout
1. Frontend deploy needs a **cache-bust version bump** (`AURIX_BUILD` in index.html + `version.json` appjs — 4 version sources) and a re-run of `AURIX-CHART-ATOMIC-BUILD-COHERENCE-harness` — the certified logic stays byte-identical; only version strings change.
2. Edge Function deploy targets **production** `--project-ref ozcasyufbknnuemllwso` (server-side LB-1).
3. **No database migration** — LB-1 is code-only; `portfolio_snapshots` already exists in prod.
