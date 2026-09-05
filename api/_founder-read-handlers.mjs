// ════════════════════════════════════════════════════════════════════════════
// AURIX-FOUNDER-READ-1 · los dos handlers del contrato `aurix.read.v1`
// ════════════════════════════════════════════════════════════════════════════
// Viven en un módulo `.mjs` (fuera del enrutado, por el prefijo `_`) y las rutas
// `api/read/*.js` solo los delegan. Motivo: el paquete no declara
// "type": "module", así que un fichero `.js` no es importable por Node fuera de
// Vercel — y este código gobierna una frontera de seguridad que TIENE que poder
// ejecutarse en un gate local, tal cual, sin duplicarlo ni simularlo.
//
// Ambos handlers: solo GET · credencial propia · sin CORS · sin cookies · sin
// escritura · y todo subsistema ausente se declara `available: false`.
// ════════════════════════════════════════════════════════════════════════════

import { guardFounderRead } from './_founder-read-token.mjs';
import { CONTRACT, callAggregate, platformIdentity, unavailable } from './_founder-read-source.mjs';

/**
 * GET /api/read/overview — resumen Founder de Aurix.
 *
 * Grupos: platform · users · funnel · health. Fuentes canónicas vía
 * `public.founder_read_overview()`:
 *   users.registered / newLast7d / newLast30d → auth.users (agregado)
 *   users.activePortfolios                    → MISMA regla ACTIVE-ONLY que el
 *     capturador y que portfolio_snapshot_health_eval
 *   users.accountsWithState                   → public.user_portfolios
 *   funnel                                    → public."Correos usuario" +
 *                                               public.email_campaign_sends
 *   health                                    → public.portfolio_snapshot_health
 *
 * NO EXPONE filas de usuario, emails, nombres, user_ids, holdings, símbolos,
 * valores de cartera ni flujos de capital.
 *
 * MONETIZACIÓN: fuera del contrato a propósito. `user_portfolios.subscription`
 * es estado declarado por el cliente en prelanzamiento (ENFORCE_ENTITLEMENTS =
 * false) y no es verdad comercial: publicarlo sería presentar lo planeado como
 * real.
 */
export async function overviewHandler(req, res) {
  if (!guardFounderRead(req, res)) return;

  const agg = await callAggregate('founder_read_overview');

  return res.status(200).json({
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    platform: platformIdentity(),
    users: agg.ok ? agg.data.users : unavailable(agg.reason),
    funnel: agg.ok ? agg.data.funnel : unavailable(agg.reason),
    health: agg.ok ? agg.data.health : unavailable(agg.reason),
  });
}

/**
 * GET /api/read/health — salud operativa estructurada.
 *
 * Grupos: watchdog · integrity · continuity · providers. Fuentes canónicas vía
 * `public.founder_read_health()`:
 *   watchdog   → public.portfolio_snapshot_health (estado, lag, stale_since,
 *                checks consecutivos, incidente auditable)
 *   integrity  → public.portfolio_snapshots (total, totales no positivos/nulos,
 *                máximo de duplicados por usuario-minuto)
 *   continuity → public.portfolio_snapshot_user_health AGREGADO POR RESULTADO
 *                + cuántas cuentas llevan >24 h sin captura correcta
 *
 * PROVIDERS: deliberadamente no disponible. Los contadores de proveedor viven en
 * la memoria de CADA instancia de función y esta instancia no sirve precios:
 * publicarlos daría ceros con aspecto de monitorización real.
 *
 * NO EXPONE user_ids, emails, holdings, símbolos, valores por usuario ni los
 * textos de `warnings` (nombran el instrumento que bloqueó una valoración: eso
 * es QUÉ tiene una cuenta).
 */
export async function healthHandler(req, res) {
  if (!guardFounderRead(req, res)) return;

  const agg = await callAggregate('founder_read_health');

  return res.status(200).json({
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    platform: platformIdentity(),
    watchdog: agg.ok ? agg.data.watchdog : unavailable(agg.reason),
    integrity: agg.ok ? agg.data.integrity : unavailable(agg.reason),
    continuity: agg.ok ? agg.data.continuity : unavailable(agg.reason),
    providers: { available: false, reason: 'per_instance_counters_not_durable' },
  });
}
