# AURIX · Entorno de demo aislado (auditoría sin cuenta)

**URL:** https://rbn888.github.io/aurix-demo/demo.html — representa **v759 · v799-ws-usability**.
Alojamiento: GitHub Pages del repositorio público `rbn888/aurix-demo` (sin coste). Origen
distinto de producción (`app.aurixsystem.io`), así que no comparte almacenamiento con ella.
Excluida de buscadores con `noindex` y `robots.txt` (eso NO es el aislamiento; el aislamiento es lo de abajo).

## Qué es y qué no es
- Es el MISMO código de la app (mismos textos, estilos, validaciones y transiciones), ensamblado
  aparte por `scripts/aurix-build-demo.mjs`. El código de producción no cambia y el runtime de
  demo no existe en producción: no se puede activar allí por URL, parámetro ni almacenamiento.
- `demo/aurix-demo-runtime.js` es el primer script de cada página del build:
  cliente Supabase **falso** en el localStorage del visitante; red a otros orígenes bloqueada
  (fetch, XHR, sendBeacon, WebSocket, EventSource); la API de Aurix contestada en local.
- Además la CSP del build fija `connect-src 'self'`, los hosts de producción se reescriben a
  `.invalid` y Chart.js, lightweight-charts e Inter van dentro del artefacto. El build FALLA si
  queda un host o credencial de producción.

## Entradas
- **Recorrer onboarding**: cuenta nueva. Acceso por correo SIMULADO: cualquier correo, no se envía
  nada; el código de prueba se muestra en pantalla (`24681357`). Onboarding real completo.
- **Abrir aplicación demo** (Free o Premium simulado) con cartera ficticia, o **Cuenta vacía**.
- **Reiniciar la demo** borra todo el estado de ese navegador.

## Simulado o no disponible
Acceso por correo (código fijo), pagos (deshabilitados con aviso; no se crea cargo ni
suscripción), precios en vivo y búsqueda de activos (no disponibles: se usan los precios
guardados; Market sin cotizaciones), logos de activos externos (glifo de respaldo),
sincronización entre dispositivos (cada navegador tiene su propia demo), Premium (concedido
por el entorno, sin suscripción).

## Verificación
`node scripts/aurix-demo-probe.mjs` (artefacto local) o
`AURIX_DEMO_URL=https://rbn888.github.io/aurix-demo/ node scripts/aurix-demo-probe.mjs` (publicada).
Limitación conocida de la sonda: en **WebKit de escritorio** el clic automatizado en la tarjeta de
idioma del onboarding no se completa (animación continua; Playwright nunca la ve estable). Chromium
móvil/escritorio y WebKit móvil recorren el flujo completo.

## Actualizar a una versión nueva
1. En el repo principal, rama `demo/audit-env` (rebase sobre `main` o merge de `main` EN la rama;
   nunca al revés): `AURIX_DEMO_BASE=/aurix-demo/ node scripts/aurix-build-demo.mjs /tmp/aurix-demo-publish`.
2. Copiar el contenido de `/tmp/aurix-demo-publish` sobre un clon de `rbn888/aurix-demo` (borrando lo
   anterior, conservando `.git`), commit y push a su `main`. Pages lo publica en 1–2 min.
3. Pasar la sonda contra la URL publicada.
No hay sincronización automática: la demo sólo cambia cuando se repite este procedimiento.
Fixtures: `demo/demo-start.js` (cartera ficticia e historial sintético de 90 días).

**No** lanzar `pages.yml` (workflow_dispatch) con la rama de demo: ese workflow publica PRODUCCIÓN.

## Retirar
`gh api -X DELETE repos/rbn888/aurix-demo/pages` (deja de servirse) y, si se quiere, borrar el
repositorio `rbn888/aurix-demo`. Producción no se ve afectada.
