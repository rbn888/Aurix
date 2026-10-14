# AURIX · Cierre del recorrido Free → Premium (v822-funnel-premium)

Base: producción v821 (`b36ed70`, verificado con `cmp` contra lo servido). Rollback: volver a publicar el árbol de `b36ed70` (un push).

## Qué cambia
| Bloque | Cambio | Owner |
|---|---|---|
| Intención Premium | CTA Premium de la landing → `intent=premium`; `index.html`/`login.html` la guardan en `sessionStorage.aurix_intent` (la entrada desde un CTA gratuito la BORRA) y la quitan de la URL; `_aurixPremiumIntentTryConsume` la consume UNA vez | `landing/app.js` `updateAppLinks` · `app.js` |
| Paywall | 4 estados (comprobando / disponible / no disponible / error + reintento); «Continuar con anual / mensual»; ejemplos del catálogo en vez de «Las 9 capacidades»; «Seguir con el plan gratuito»; CTA alineados; cierre siempre visible; fondo opaco | `_buildHtml`, `_valueBlocks`, `_wire` |
| Dashboard Free | acabado negro/azul, compactas en móvil, ocultas con cartera vacía | `updateDashboardDiscover` + CSS `.wsdisc-*` |
| Buscadores | `landing/robots.txt` (Allow all) + `landing/sitemap.xml` | Vercel (landing) |

Sin cambios: precios, catálogo, checkout, webhook, permisos, suscripciones, frontera Free/Premium.

## Reglas de la intención
- Sólo navegación: no concede, no elige plan, no inicia checkout.
- Se consume con sesión + permisos resueltos (`_aurixEntLoaded`), onboarding asentado (no mostrado / aplazado / completado) y sin modal abierto. Premium (incl. concesión fundador/QA, `hasAurixPremiumAccess`) la descarta sin ver nada.
- Una vez: se borra antes de abrir; recarga, otra pestaña o volver al Dashboard no reabren. `signOut()` la borra.

## Medición — inventario y huecos
| Paso | Fuente existente | Estado |
|---|---|---|
| Visita / clic CTA Free vs Premium | ninguna (sólo `aurix_affiliate_click` para referidos) | **HUECO** |
| Registro | `auth.users.created_at` | servidor ✓ (`db/spec3_funnel_readonly.sql`) |
| Onboarding | `window.aurixAnalytics(...)` en el motor | **hook sin destino** (nunca definido) |
| Activación (primer activo) | `portfolio_snapshots` | servidor ✓ (misma consulta) |
| Primera lectura de Intelligence | — | **HUECO** |
| Paywall mostrado + origen | `_aurixRecordUpgradeIntent('paywall:open', source)` — orígenes: `landing-premium` (nuevo), `intelligence-preview`, `workspace:*`, `dashboard:plans`, `settings-menu`, `settings-membership` | sólo **local** (localStorage por usuario) |
| Elección de plan | `log('checkout_click', {interval})` | sólo consola |
| Checkout | `billing_customers` | servidor ✓ |
| Premium confirmado | `subscriptions` (webhook) | servidor ✓ |
Fundador/QA ya se excluyen en la consulta por `entitlement_overrides.reason in ('founder','qa')`.

## Propuestas (NO ejecutadas, requieren revisión de arquitectura y privacidad)
1. **Origen del paywall en el servidor sin tabla nueva**: añadir `source` (lista cerrada: `landing-premium|intelligence-preview|workspace|dashboard-plans|settings`) al body de `/api/billing/checkout` y a `metadata.aurix_source` de la Checkout Session. Sin PII ni importes. Cambia la API de cobro ⇒ fuera de este SPEC.
2. **Destino mínimo de eventos** (si se aprueba): conecta el hook `window.aurixAnalytics` ya existente.
```sql
-- PROPUESTA · no aplicar sin revisión
create table public.funnel_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event text not null check (event in ('onboarding_deferred','completed','activation_viewed','add_asset_started','paywall_open','plan_choice')),
  source text check (source is null or source ~ '^[a-z0-9:_.-]{1,48}$'),
  created_at timestamptz not null default now()
);
alter table public.funnel_events enable row level security;
create policy funnel_events_insert_own on public.funnel_events for insert to authenticated with check (user_id = auth.uid());
-- sin SELECT para anon/authenticated: sólo lectura desde el editor (agregados, como spec3_funnel_readonly.sql)
revoke all on public.funnel_events from anon;
```
3. **robots.txt del dominio de la app** (requiere añadirlo a la allowlist de `scripts/aurix-build-site.mjs`):
```
User-agent: *
Allow: /privacy.html
Allow: /terms.html
Allow: /support.html
Disallow: /
```

## Verificación
- Automatizada (demo aislada: Supabase falso, sin red ni cobros): `scripts/aurix-premium-intent-probe.mjs` 206/206 (Chromium+WebKit · 390/1440 · ES/EN): cuenta nueva por raíz y por login, onboarding aplazado y completo, Free existente, Premium, CTA gratuito posterior, otra pestaña, recarga, volver al Dashboard, cerrar sesión, 4 estados del catálogo + reintento, cierre visible, cartera vacía. `aurix-paywall-probe` 394/394 · `aurix-ws-catalog-probe` 566/566 · `aurix-dashboard-adaptive-probe` 196/196 · CI gate.
- NO verificado: journey con backend real (cuenta QA, OTP real), Stripe TEST, iPhone físico.
- Precios: el catálogo `billing_prices` no es legible sin sesión (RLS 42501). Coinciden landing, paywall de producción observado y aritmética (69,99/12 = 5,83; 1 − 69,99/95,88 = 27 %).
