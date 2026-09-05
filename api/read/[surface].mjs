// /api/read/[surface]  ·  surface = overview | health
// ============================================================================
// AURIX-FOUNDER-READ-1 · la ÚNICA función Serverless de la frontera de lectura
// que Aurix publica para Founder Platform. Contrato `aurix.read.v1`, SOLO GET.
// ----------------------------------------------------------------------------
// POR QUÉ UN SEGMENTO DINÁMICO — no es estilo, es el cupo del plan:
// Vercel Hobby admite 12 Serverless Functions por deployment y `api/` estaba
// EXACTAMENTE en 12 (M.04, commit 15122d2). Dos ficheros de ruta —`overview.js`
// y `health.js`— lo subían a 14 y el deployment se rechaza ENTERO, con TODAS las
// rutas en 404. Un solo segmento dinámico sirve las dos superficies desde UNA
// entrada, igual que `api/billing/[op].js` lleva en producción desde M.04.
//
// LO QUE NO CAMBIA:
//   · Las rutas públicas son las que Founder espera: /api/read/overview y
//     /api/read/health. `[surface]` las resuelve de forma NATIVA —cero rewrites
//     en vercel.json— y `req.query.surface` lo rellena el router de Vercel.
//   · Los dos contratos siguen en `_founder-read-handlers.mjs` sin UNA SOLA
//     línea cambiada: método, credencial, forma y privacidad se deciden allí,
//     así que lo que certifica el gate es EXACTAMENTE lo que corre en producción.
//   · El prefijo `_` es lo único que mantiene los módulos fuera del enrutado.
//
// ESTE FICHERO SÓLO ELIGE SUPERFICIE. No hay ruta por defecto: una superficie
// desconocida es 404 y nada más — la superficie Founder se mantiene estrecha.
//
// POR QUÉ `.mjs` Y NO `.js` — verificado en producción, no es preferencia:
// el paquete no declara "type": "module", así que Vercel trata un `.js` como
// CJS y transpila sus `import` a `require()`. Un `require()` de un `.mjs` es
// ERR_REQUIRE_ESM: la función se cae al invocarse con FUNCTION_INVOCATION_FAILED
// (500 en TODOS los métodos, fail-closed pero inservible). `api/billing/[op].js`
// no lo sufre porque importa hermanos `.js`. Aquí la cadena es ESM de punta a
// punta —y tiene que seguir siéndolo: los módulos `_founder-read-*.mjs` son
// `.mjs` precisamente para que el gate local ejecute el código de producción
// TAL CUAL, sin duplicarlo ni simularlo.
//
// AVISO PARA QUIEN AÑADA FUNCIONES: `api/` está en el tope del plan. Un fichero
// nuevo en `api/` que no empiece por `_` rompe el deployment ENTERO.

import { overviewHandler, healthHandler } from '../_founder-read-handlers.mjs';

const SURFACES = { overview: overviewHandler, health: healthHandler };

export default async function handler(req, res) {
  const surface = String((req.query && req.query.surface) || '');
  // hasOwnProperty y no `SURFACES[surface]`: sin esto, `surface=constructor`
  // resolvería a una función heredada del prototipo y la llamaríamos con (req, res).
  const owner = Object.prototype.hasOwnProperty.call(SURFACES, surface)
    ? SURFACES[surface]
    : null;
  if (typeof owner !== 'function') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  return owner(req, res);
}
