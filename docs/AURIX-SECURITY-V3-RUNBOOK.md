# AURIX · Security Hardening V3 · Runbook operativo

Rama `aurix/security-hardening-v3`, base `50dce0d`, que es producción a 17-10-2026. Este documento solo cubre lo que **no** hace el código: acciones manuales, decisiones pendientes y el orden en que aplicar los cambios. Sin secretos.

## 1. ROTACIÓN DE TWELVE DATA (P1-01, prioritaria, manual)

Dos claves de Twelve Data estuvieron en `app.js` entre el 16-04 y el 13-05 de 2026 (commits `4e70bc1` y `2ad9701`). El repo es público y siguen en el historial. **No se reescribe el historial: se rotan.**

**Dónde se usa hoy.** La variable `TWELVE_API_KEY` vive solo en Vercel y la leen dos funciones:
- `api/prices.js`, para las peticiones `twelvedata:*`. El cliente actual solo envía `coingecko:*`, así que hoy no depende de ella.
- `api/prices/snapshot.js`, como respaldo después de Yahoo para acciones, ETF y metales. Si la variable falta, esa capa de respaldo se omite sin error.

**Qué deja de funcionar si se revoca sin sustituir:** el respaldo de Twelve Data. Yahoo sigue siendo la fuente primaria.

**Orden:**
1. En el panel de Twelve Data, genera una clave nueva.
2. En Vercel → Settings → Environment Variables, pon `TWELVE_API_KEY` = la nueva, **solo en Production**, y redespliega.
3. Valida: `POST /api/prices` con `{"providers":["twelvedata:AAPL"]}` debe devolver un precio.
4. Revoca **después** las claves antiguas en el panel.
5. Anota «revocadas N, la nueva funciona sí/no». No compartas valores.

## 2. DISPUTAS Y REEMBOLSOS (P2-01, manual hasta que haya regla comercial)

**Comportamiento actual (probado en el harness V3):**
- El webhook registra `charge.refunded` y `charge.dispute.*` en el ledger (`billing_refunds` / `billing_disputes`).
- **No** cancela la suscripción: ni un reembolso ni una disputa cambian Premium.
- Stripe tampoco cancela por sí mismo: el acceso dura hasta fin de periodo y **se renueva** si la tarjeta sigue cobrando.

**Por qué no se automatiza todavía:** un reembolso parcial de cortesía no debe quitar Premium, y una disputa abierta puede ganarse. La regla es comercial.

**Procedimiento manual:**
1. Activa en Stripe las alertas por email de disputa y de fallo del webhook (Settings → Team & security → Notifications).
2. **Disputa abierta** (`needs_response`): responde con la evidencia en Stripe. No toques Premium.
3. **Disputa perdida** (`lost`): en Stripe → Customer → Subscription, «Cancel immediately». El webhook `customer.subscription.deleted` retira Premium solo.
4. **Reembolso total** de la última factura por baja: cancela de inmediato igual que en el paso 3. Un **reembolso parcial** de cortesía no se cancela.
5. Antes de pagar comisiones de afiliados, Founder Platform debe excluir los pagos con reembolso o disputa (ver §5).

**Propuesta para automatizar (requiere aprobación):** disputa cerrada como `lost`, o reembolso igual al importe de la factura → cancelar la suscripción en Stripe desde el webhook.

## 3. Acciones manuales pendientes (no se pueden hacer desde el código)

| # | Dónde | Qué |
|---|---|---|
| 1 | Twelve Data + Vercel | §1 |
| 2 | Vercel → Firewall | Regla de rate limit por IP sobre `/api/prices*` y `/api/search*`. Los cupos del código son **por instancia** y no son un límite global. |
| 3 | Vercel → Plan | Hobby es de uso no comercial; Aurix cobra. Decide si pasar a Pro. |
| 4 | Supabase → SQL Editor | Ejecuta la comprobación previa de `db/workspace_documents_quota_1.sql` y, si cabe, aplica el fichero. |
| 5 | GitHub → Settings → Code security | Activa secret scanning y push protection (gratis en repos públicos). Es la primera red; `scripts/aurix-secret-scan.mjs` en CI es la segunda. |
| 6 | Stripe | Alertas de §2 y revisión del webhook LIVE (checklist V2 §F.4). |
| 7 | Decisión | `db/workspace_documents_premium_gate_1.sql`: puerta Premium en el servidor (comercial). |
| 8 | Decisión legal | `db/email_marketing_consent_1.sql` y cómo se recoge el consentimiento. Sin eso, `--send` está bloqueado. |

## 4. Orden de aplicación

1. **Rotar Twelve Data (§1).** Es independiente del resto.
2. **Integrar la rama.** Antes de mergear a `main`, rebasa sobre lo que haya en `main` en ese momento, incluido `aurix/chart-final-integration` si ya se publicó, y repite el gate completo.
3. **Publicar** con el bump habitual de `AURIX_BUILD` / `__AURIX_APPJS_VERSION__` / `version.json`. El push a `main` despliega Pages y Vercel.
4. **Verificar en vivo:**
   - login OTP y recuperación de contraseña (supabase-js ahora sale de `vendor/`);
   - Market con cotizaciones y mini gráficos;
   - Dashboard;
   - `GET /api/cron/welcome-email` sin cabecera → 401;
   - la consola sin errores de CSP ni de integridad.
5. **SQL de cuota** (§3.4), después de la comprobación previa.
6. **Firewall de Vercel** (§3.2).
7. **Decisiones** §3.7 y §3.8, cuando el founder las tome.

**Rollback:**
- Código: revertir el merge. Los `vendor/` se van con él y las páginas vuelven a jsDelivr.
- SQL de cuota: `db/workspace_documents_quota_1_rollback.sql`.
- Nada de esta rama modifica datos existentes.

## 5. Límite de responsabilidad · Founder Platform

Aurix garantiza dos cosas:
- **Atribución inmutable:** una vez, en una ventana de 24 h, con un código vigente.
- **Pagos solo desde un webhook firmado.**

Founder Platform debe garantizar el resto:
- Validar el self-referral.
- Retener antes de pagar.
- Aplicar clawback por reembolso o disputa.
- Excluir importes de 0 € y `livemode=false`.
- Conservar su propia copia de la evidencia, porque un borrado de cuenta en Aurix hace desaparecer el pago del feed.

Nada de eso se verifica desde este repo.
