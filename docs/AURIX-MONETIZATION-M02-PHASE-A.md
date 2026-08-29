# AURIX MONETIZATION V1 · M.02 — COMMERCIAL TRUTH FOUNDATION
## FASE A — auditoría read-only (2026-08-29). CERO CÓDIGO.

Estado auditado: `main` @ `aa9f3be` (v693 LIVE).

---

## A. Mapa completo de monetización actual

`CC` = client-controlled · `SA` = server-authoritative · `F/T` = founder/test-only ·
`⚠` = confundible con commercial truth.

### A.1 · Estado persistido

| Owner | Storage / source | Escribe | Lee | CC | SA | F/T | ⚠ | Consumidores |
|---|---|---|---|---|---|---|---|---|
| `PLAN_KEY = 'aurix_plan'` (app.js 62422) · `loadPlan/getPlan/savePlan/setPlanTier` (62485–62518) | localStorage | `savePlan`, `setPlanTier`, `applyPromoCode`, `_applyRemoteSubscription` | `getPlan`, `hasFeature`, `_settingsPopulate`, `_aurixMenuTier` | **SÍ** | no | no | **SÍ** | Settings (nombre de plan + descripción), badge del menú, `hasFeature` |
| `SUBSCRIPTION_TS_KEY = 'aurix_subscription_updated_at'` (1684) | localStorage | `_touchSubscription` | merge de boot (3396) | **SÍ** | no | no | sí | rail de sync LWW |
| `user_portfolios.subscription` + `subscription_updated_at` (db/persistence_remote_subscription_1.sql) | Postgres/Supabase | **el cliente**, vía `_collectSubscription` en el upsert de `_flushStatePersistence` (3479) | merge de boot → `_applyRemoteSubscription` (3405–3409) | **SÍ** | **no** (remoto ≠ autoritativo) | no | **SÍ (el peor)** | convergencia multi-dispositivo del tier |
| RLS de `user_portfolios` (db/supabase_rls.sql 44–72) | Postgres | — | — | — | fila propia | no | — | `auth.uid() = user_id` en SELECT/INSERT/**UPDATE**/DELETE ⇒ el usuario puede escribir su propia columna `subscription` |
| `aurix_pce_founder` (40522) | localStorage + query param | el propio usuario (`?aurix_pce_founder=1`) | `_aurixPceFounderMode` | sí | no | **SÍ** | no (pero el NOMBRE confunde) | overlay de diagnóstico del chart. **No comercial** |

### A.2 · Lógica de plan / entitlement (cliente)

| Owner | Naturaleza | Consumidores reales |
|---|---|---|
| `ENFORCE_ENTITLEMENTS = false` (62420) | constante de compilación; master switch | `hasFeature` |
| `PREMIUM_FEATURES` (62427) — 7 claves: `wealth_evolution`, `portfolio_intelligence`, `portfolio_health`, `monthly_reports`, `advanced_exports`, `ai_wealth_assistant`, `workspace_advanced` | catálogo en cliente | **ninguno** |
| `PLAN_FEATURES` (62440) — `free: {}`, `founder == premium == PREMIUM_FEATURES` | mapa tier→features en cliente | `hasFeature` |
| `PLAN_CATALOG` (62447) — founder **14,99 €/año**, premium sin precio | metadatos comerciales en cliente | `planTierName`, Settings |
| `PLAN_LIMITS` (62464) | sin cap real (∞ en los tres tiers) | ninguno |
| `hasFeature(feature)` (62537) | gate único de diseño; con el switch off devuelve **siempre true** | sólo `requireFeature` |
| `requireFeature(feature, onAllowed)` (63630) | seam de gating + modal de upgrade | **ninguno** |
| `window.aurixEntitlements` (62545, 63639) | superficie pública | `_aurixMenuTier` (sólo `getPlan`) |
| `PROMO_CODES` / `resolvePromoCode` / `applyPromoCode` (62571–62595) | concesión de tier **local**, sin validación de servidor | ninguno (dormido, sin UI) |

### A.3 · Gating REAL en producción

| Owner | Naturaleza | Consumidores |
|---|---|---|
| `hasAurixPremiumAccess(user)` (50126) — `email === 'rbn892@gmail.com'` **o** `user.premium \|\| user.isPremium \|\| user.subscriptionActive` | allowlist de email en el bundle + flags del objeto user. **NO consulta el plan** | `renderWorkspace` (21303), `renderIntelligenceTab` (50389), `_wsFullBleed` (50031), badge/entrada de menú (60167, 63656) |
| `_aurixCurrentAuthUser()` (50133) | lee `currentUser` = `session.user` de Supabase (57922). `user_metadata` sólo se usa para el nombre visible (60135) ⇒ `premium/isPremium/subscriptionActive` **no tienen escritor**: rama muerta hoy | idem |
| `_aurixPremiumPreviewHTML(section)` (50142) | preview compartido Workspace/Intelligence | fallback de Workspace |
| `_aurixIntelligencePreviewHTML()` (50300) | preview real de Intelligence (INT.PREVIEW.V1) | fallback de Intelligence |
| `_WS_APP_IDENTITY[].premiumTier` + `_wsToolTier`/`_wsTierChip` (M.01B) | **presentación** declarativa: compound `free`, loan `premium` | chip del catálogo de Herramientas |
| `AURIX_PREMIUM_UI_ENABLED = false` (62608) → `html[data-aurix-premium-ui="off"]` | oculta TODA la UI de Membresía/Premium en Settings | Settings |
| Modal Premium (63807) + `_buildHtml` (63719) | **precios 59 €/año y 39 €/año founder + CTA mensual**, escasez `FOUNDER.founderSlotsTaken = 10 / 50`, catálogos de copy `FREE_K` (11) y `PREM_K` (12) | alcanzable **sólo por el owner** hoy (`#menuPremium` no-op para el resto; Settings oculto) |
| CTA del modal → `_ctaState` (63788) | cambia su propia etiqueta a "Te avisaremos pronto" + `console.log`. **No persiste nada** | — |

### A.4 · Servidor

| Qué | Estado |
|---|---|
| `api/` (assets, prices, search, cron, client-log, verify-pin, waitlist) | **cero** lógica de premium/subscription/entitlement |
| `services/` | cero (sólo la palabra "premium" en comentarios de estilo) |
| `supabase/functions` | sólo `portfolio-snapshot` |
| `api/verify-pin.js` | PIN administrativo del waitlist (hash + rate limit). Auth de servidor real, **ajena** a entitlements |
| Webhooks de proveedor | no existen |

### A.5 · Harnesses que congelan el comportamiento actual
`AURIX-PREMIUM-PREVIEW-OWNER` (owner→full, otros→preview, "depende sólo de user, sin localStorage"),
`AURIX-INT-PREVIEW-V1` (rama no-premium de Intelligence), `AURIX-SECTION-ISOLATION`
(`.premium-preview-stage` sin residuos), `AURIX-WORKSPACE-FORMULA-INTEGRITY` (M.01B: frontera declarada,
sin gating fabricado). **M.02 tendrá que reescribir asserts en los dos primeros.**

---

## B. Fuentes falsas / no autoritativas

Ninguna fuente actual es válida como commercial truth:

1. `localStorage.aurix_plan` — el usuario lo edita.
2. `localStorage.aurix_subscription_updated_at` — idem; además decide quién gana el LWW.
3. **`user_portfolios.subscription`** — vive en el servidor pero **lo escribe el cliente** y la RLS lo autoriza. Remoto ≠ autoritativo. Es la fuente más peligrosa precisamente porque *parece* servidor.
4. `hasAurixPremiumAccess` — es **acceso founder**, no suscripción.
5. `PLAN_FEATURES` / `PREMIUM_FEATURES` / `PLAN_CATALOG` / `PLAN_LIMITS` — mapas en el bundle.
6. `PROMO_CODES` + `applyPromoCode` — concesión local de tier.
7. `_WS_APP_IDENTITY.premiumTier` — presentación (M.01B lo declara explícitamente).
8. `FOUNDER.founderSlots*`, precios 59/39 €, `FREE_K`/`PREM_K` — semántica y cifras comerciales viviendo en la UI.
9. `AURIX_PREMIUM_UI_ENABLED`, previews, `.premium-preview-stage` — visibilidad, no derecho.
10. `aurix_pce_founder` — diagnóstico de dispositivo. **No mezclar** aunque se llame "founder".

---

## C. Owner recomendado de Commercial Truth

**Una tabla propia, escrita sólo por service-role, y un resolver de entitlements en servidor.**

- `public.subscriptions` — **nueva tabla**, NO una columna de `user_portfolios`. Razón dura: `user_portfolios` se
  actualiza por diseño con un `upsert` de fila completa del propio usuario; no se puede hacer una columna
  read-only dentro de una fila que el usuario escribe. Cambiar eso rompería el rail de sync de cartera.
- RLS: `select` propio; **cero** políticas de `insert/update/delete` para el rol autenticado. Sólo service-role
  (webhook / edge function) escribe.
- `public.entitlement_overrides` — concesiones founder/comp/test/QA. Es lo que mantiene **founder access
  separado de billing truth** pasando por el mismo resolver.
- **Resolver único server-side** (`entitlements_v1`): subscription + overrides → conjunto efectivo de features.
  El frontend no calcula derechos, sólo los consume. Fail closed.
- El cliente cachea el resultado **en memoria** por sesión (revalidación en focus / cambio de auth). localStorage
  puede guardar un *last-known-good* con TTL corto, nunca como autoridad, y siempre fail-closed al expirar.

---

## D. Modelo mínimo Subscription (provider-independent)

`subscriptions` (1 fila por `user_id`):

| Campo | Tipo | Nota |
|---|---|---|
| `user_id` | uuid PK → auth.users | |
| `plan` | text | `free \| premium \| founder` (**founder = plan comercial**, distinto de founder-access) |
| `status` | text | `active \| trialing \| past_due \| canceled \| expired` |
| `provider` | text | `none \| stripe \| apple \| manual` |
| `interval` | text null | `month \| year \| lifetime` — **necesario** para monthly/annual y MRR/ARR |
| `trial_start` / `trial_end` | timestamptz null | |
| `current_period_start` / `current_period_end` | timestamptz null | |
| `cancel_at_period_end` | bool | default false |
| `canceled_at` | timestamptz null | |
| `price_amount_cents` + `price_currency` | int / text null | importe **canónico**, no el precio de la UI |
| `provider_customer_id` / `provider_subscription_id` | text null | opacos; **nunca al frontend** |
| `last_event_id` / `last_event_at` | text / timestamptz | idempotencia de webhooks |
| `created_at` / `updated_at` | timestamptz | |

Añadidos sobre la lista del SPEC: `interval`, `price_amount_cents/currency`, `provider_*_id`, `last_event_id`.
Nada de semántica de UI (ni copy, ni claves de i18n, ni "badge", ni orden de tarjetas).

---

## E. Modelo mínimo Entitlement

**Derivado, no almacenado por feature.** Una tabla de entitlements por usuario×feature se convierte en caché que
deriva de la suscripción y acaba divergiendo — es exactamente el defecto que M.02 viene a cerrar.

- `plan_features` — mapa `plan → feature_key[]`, versionado en **un** sitio (servidor), expuesto como dato.
- `entitlement_overrides` — `user_id`, `feature_key` (`'*'` permitido), `reason` (`founder|comp|qa|support`),
  `granted_by`, `expires_at`, `created_at`.
- Resolver → por cada feature key:

| Campo | Valores |
|---|---|
| `feature_key` | ver F |
| `allowed` | bool |
| `source` | `plan \| trial \| override \| default` |
| `effective_status` | espejo del `status` de la suscripción (o `override`) |
| `reason` | por qué se denegó (para instrumentar, nunca para la UI de venta) |

`source` es lo que permite excluir founder/comp de los agregados de negocio (G) sin una segunda tabla.
Fail closed: sin resolver disponible ⇒ `allowed=false` para todo lo premium (el Free nunca se rompe porque
las capacidades free no llevan key).

---

## F. Feature keys V1 (derivadas del producto real)

Sólo lo que existe y alguien gatea hoy:

| Key | Superficie real | Free ve |
|---|---|---|
| `workspace.loan` | Simulador de préstamo (declarado PREMIUM en M.01B) | la tarjeta, con su chip; al abrir, upgrade |
| `intelligence.full` | Intelligence completa (`renderIntelligenceTab`) | el preview real de INT.PREVIEW.V1 |
| `premium.settings` | Membresía / gestión de plan en Settings | nada (hoy oculto por `AURIX_PREMIUM_UI_ENABLED`) |

Condicionales, **no crear todavía**:
- `workspace.templates` — al publicar la primera plantilla (hoy el catálogo está vacío).
- `workspace.access` — **sólo si** se decide que Workspace siga siendo una sección de pago. Recomendación:
  **no** crearla; abrir Workspace al plan Free y gatear únicamente las herramientas premium. Menos claves,
  y resuelve el residual de M.01B (hoy ningún Free llega a ver Compound).

**No** crear `intelligence.preview` ni `workspace.compound`: un entitlement gatea una capacidad; el preview y las
herramientas free son *lo que se ve al no tener ninguna*. Crear una key para el estado por defecto obliga a
"conceder" algo a Free e invita a la divergencia. Fail-closed ya produce el preview.

Retirar `premiumTier` del registro de identidad y sustituirlo por `featureKey` (nullable): un solo campo
alimenta **el chip** (label = tiene key ⇒ Premium) y **el gate** (`requireFeature(featureKey)`).

---

## G. Migración recomendada desde el estado actual

0. **Read-only primero**: contar filas de `user_portfolios` con `subscription->>'tier' <> 'free'`. Expectativa:
   ninguna real. Si alguna existe, es autoconcesión o pruebas del owner — **no se migra**.
1. Declarar `aurix_plan` + `user_portfolios.subscription` **no autoritativos**. Dejar de escribirlos (quitar
   `subscription`/`subscription_updated_at` del payload de flush); **no** borrar la columna aún.
2. Crear `subscriptions` + `entitlement_overrides` + `plan_features` con RLS select-own y escritura service-role.
3. Sembrar el acceso del owner como **override** (`feature_key='*'`, `reason='founder'`) — retira la allowlist de
   email del bundle.
4. Resolver server-side + `aurixEntitlements.load()` en cliente (memoria, fail closed). `hasFeature` pasa a leer
   el resolver; `PLAN_FEATURES` deja de ser autoridad.
5. Repuntar los **dos** gates reales (`renderWorkspace`, `renderIntelligenceTab`) de `hasAurixPremiumAccess` a
   `hasFeature`, conservando los previews como fallback fail-closed. Reescribir los asserts de
   `AURIX-PREMIUM-PREVIEW-OWNER` e `AURIX-INT-PREVIEW-V1`.
6. `premiumTier` → `featureKey` en `_WS_APP_IDENTITY` (chip y gate desde el mismo campo).
7. Reconciliar en UNA fuente: precio (14,99 vs 59 vs 39 €), el catálogo Free/Premium (`PREMIUM_FEATURES` vs
   `FREE_K`/`PREM_K`), la escasez `founderSlotsTaken` (medirla o retirar la afirmación) y la captura de intención
   del CTA (hoy se descarta).
8. Sólo entonces proveedor: Stripe como **escritor** de `subscriptions` vía webhook idempotente; Apple después,
   escribiendo la misma verdad. `ENFORCE_ENTITLEMENTS` desaparece a favor del resolver.
9. Agregados Founder como vista derivada de `subscriptions` (+ exclusión por `source='override'`).

---

## H. Riesgos reales

| # | Riesgo | Evidencia | Severidad |
|---|---|---|---|
| R1 | Autoconcesión de tier **persistida en el servidor** y propagada a todos los dispositivos del usuario | el cliente escribe `user_portfolios.subscription`; RLS UPDATE lo autoriza | crítico **el día que se active el enforcement** |
| R2 | El gate REAL no consulta ningún plan: allowlist de email en el bundle | `hasAurixPremiumAccess` (50126) | alto |
| R3 | Rama latente manipulable: `user.premium/isPremium/subscriptionActive` sin escritor hoy; se vuelve autoconcesión si alguien mapea `user_metadata` sobre el user | 50128 + 60135 | medio (latente) |
| R4 | **Dos sistemas paralelos que no se hablan**: `hasFeature/PLAN_FEATURES` (0 consumidores) vs `hasAurixPremiumAccess` (2 gates vivos) | grep de call sites | alto |
| R5 | Founder mezclado con Premium: mismo predicado, y `PLAN_FEATURES.founder === PLAN_FEATURES.premium` ⇒ imposible separar comp/test de pagador en cualquier agregado | 62440 | alto |
| R6 | Tres precios divergentes (14,99 / 59 / 39 €) y dos catálogos Free-vs-Premium; la UI es la fuente de facto | `PLAN_CATALOG` vs modal | alto (bloquea checkout) |
| R7 | Escasez afirmada sin medir: "10 de 50 plazas" hardcodeado y mostrado | `FOUNDER` (63713) | medio (verdad de producto) |
| R8 | El único punto de conversión **descarta la intención** (log + cambio de etiqueta): sin baseline de conversión | `_ctaState` (63788) | medio |
| R9 | `applyPromoCode` concede tier localmente sin servidor | 62592 | medio (dormido) |
| R10 | `_applyRemoteSubscription` acepta el blob remoto validando sólo que `tier` sea string | 3418 (mitigado en `loadPlan`) | bajo |
| R11 | `ENFORCE_ENTITLEMENTS` es constante de compilación: activar = cambio global, sin rollout gradual ni kill-switch por usuario | 62420 | medio |
| R12 | "founder" significa tres cosas distintas (tier comercial, acceso del owner, toggle de diagnóstico `aurix_pce_founder`) | 62442 / 50127 / 40522 | medio (induce errores de gating) |
| R13 | Gating puramente visual: la sección premium se renderiza en cliente; el preview se impone por CSS `!important`. El dato es del propio usuario, así que el riesgo es de UI, no de fuga de datos — pero no hay protección de servidor | 50168, 21303 | declarado |

---

## I. Orden exacto de implementación de M.02

`B0` conteo read-only de tiers ≠ free → **decisión: no migrar valores**
`B1` SQL `subscriptions` + `entitlement_overrides` + `plan_features` (RLS select-own, escritura service-role)
`B2` resolver server-side `entitlements_v1` (fail closed) + contrato de respuesta congelado
`B3` cliente: `aurixEntitlements.load()` en memoria + `hasFeature` real; `PLAN_FEATURES` deja de decidir
`B4` founder access → override sembrado; retirar la allowlist de email
`B5` repuntar los dos gates vivos + reescribir los asserts de los dos harnesses de preview
`B6` `premiumTier` → `featureKey` (chip y gate, un campo)
`B7` dejar de escribir `aurix_plan` / `user_portfolios.subscription` (columna intacta)
`B8` reconciliar precio + copy + escasez + captura de intención del CTA
`B9` Stripe: checkout + webhook idempotente escribiendo `subscriptions`; retirar `ENFORCE_ENTITLEMENTS`
`B10` Apple IAP contra la misma verdad
`B11` agregados Founder (vista derivada)

Cada paso es desplegable por separado. `B1`–`B7` no cobran ni bloquean nada: dejan la verdad lista.
El primer paso que **cambia lo que ve un usuario** es `B5`.

---

## J. Qué NO tocar todavía

- Stripe, Apple IAP, checkout, billing, webhooks, trials, precios reales, restauración de compra.
- `ENFORCE_ENTITLEMENTS` (sigue `false` hasta `B9`).
- Usuarios existentes: ni un tier reescrito, ni una migración de datos comerciales.
- Portfolio / Wealth / Historical / Chart engines, persistencia de cartera, snapshots, auth, onboarding, landing.
- El rail de sync de `user_portfolios` (assets/holdings/history/watchlist/preferences/ui_state) — sólo se retira
  `subscription` del payload en `B7`, nada más.
- Workspace y Compound/Loan: matemática y catálogos, intactos. La decisión "Workspace abierto al plan Free"
  es de producto y **no** se toma en M.02 Fase A.
- Los renderers de preview (Workspace/Intelligence): son el fallback fail-closed del nuevo sistema.
- `aurix_pce_founder` y `api/verify-pin.js`: no son comerciales.
- Founder Platform / Booking Platform / `aurix.read.v1` (rama `aurix-founder-read-1`, sin desplegar).
