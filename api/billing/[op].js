// /api/billing/[op]  ·  op = checkout | portal
// ============================================================================
// AURIX-MONETIZATION-M04 · la ÚNICA función Serverless de billing.
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE ESTE FICHERO — no es una preferencia de estilo:
// Vercel Hobby admite 12 Serverless Functions por deployment y `api/` estaba
// EXACTAMENTE en 12 antes de M.04. `checkout` y `portal` la subían a 14 y el
// deployment se rechazaba ENTERO —las tres rutas de billing en 404—, con el build
// terminando bien y el rechazo llegando después, en `Deploying outputs...`.
// La directiva del proyecto es mantener Hobby, así que las dos operaciones
// comparten una sola entrada Serverless. Cuenta final: 12 + 1 Edge.
//
// LO QUE NO CAMBIA:
//   · Las rutas públicas siguen siendo /api/billing/checkout y /api/billing/portal.
//     El segmento dinámico `[op]` las resuelve de forma NATIVA: cero rewrites en
//     vercel.json, y `req.query.op` lo rellena el propio router de Vercel.
//   · Los dos contratos siguen en ficheros SEPARADOS —`_checkout.js` y
//     `_portal.js`— y sin UNA SOLA línea cambiada. El prefijo `_` es lo único que
//     impide que Vercel les cree función propia; se siguen importando y
//     empaquetando con normalidad (mismo mecanismo que `api/search/_cg-catalog.js`,
//     que ya lleva meses en producción importado por `crypto.js`).
//   · Cada handler conserva SU CORS, su guarda de método, su 503
//     `billing_unconfigured` y su verificación del token. Aquí no se decide nada
//     de eso, así que el diseño que revisó el gate de seguridad queda intacto.
//   · El webhook NO entra aquí. Es Edge —firma sobre los bytes crudos— y una
//     función Edge no cuenta contra el cupo de 12, así que sigue en `webhook.mjs`
//     con su propia ruta. El fichero estático gana al segmento dinámico, de modo
//     que /api/billing/webhook nunca cae en este dispatcher.
//
// ESTE FICHERO SÓLO ELIGE OWNER. Si `op` no es exactamente una de las dos
// operaciones publicadas, 404 y nada más: no hay ruta por defecto.
//
// AVISO PARA QUIEN AÑADA FUNCIONES: `api/` está en el tope del plan. Un fichero
// nuevo en `api/` que no empiece por `_` rompe el deployment ENTERO.

import checkout from './_checkout.js';
import portal   from './_portal.js';

const OPS = { checkout, portal };

export default async function handler(req, res) {
  const op = String((req.query && req.query.op) || '');
  // hasOwnProperty y no `OPS[op]`: sin esto, `op=constructor` resolvería a una
  // función heredada del prototipo y la llamaríamos con (req, res).
  const owner = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (typeof owner !== 'function') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  return owner(req, res);
}
