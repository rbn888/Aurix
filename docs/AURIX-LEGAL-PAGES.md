# AURIX · Páginas legales públicas

Páginas servidas por la app (`app.aurixsystem.io`, publicadas desde `rbn888/aurix-app-site`), sin sesión y en
ES/EN: `privacy.html`, `terms.html`, `legal-notice.html` y `support.html`, con `legal.css` y `legal.js`. Están
en la allowlist de `scripts/aurix-build-site.mjs`. La landing las enlaza en su footer (LEGAL), en este orden:
Privacidad · Condiciones · Aviso legal · Soporte.

## Datos identificativos del titular — UBICACIÓN ÚNICA

Los datos del titular se incorporan en **un solo sitio**: la sección `#titular` (`data-owner-slot`) de
`legal-notice.html`. Es un bloque bilingüe único (fuera de los bloques ES/EN), así que el ancla `#titular` sirve
para los dos idiomas. Privacidad («Responsable») y Condiciones («Quién presta el servicio») **no repiten** los
datos: enlazan a `legal-notice.html#titular`.

Mientras falten, el bloque muestra sólo la nota aprobada:

- ES: «Información del titular: los datos identificativos exigibles se incorporarán antes del inicio de la
  prestación comercial definitiva.»
- EN: «Service operator information: the required identification details will be added before the definitive
  commercial launch.»

Para incorporarlos, sustituir los dos `<p data-lang-block=…>` de esa sección por una lista con los datos reales,
escritos directamente en el HTML (nunca desde variables de entorno ni desde otra página):

```html
<dl data-lang-block="es">
  <dt>Titular</dt>      <dd>NOMBRE COMPLETO O DENOMINACIÓN SOCIAL</dd>
  <dt>NIF</dt>          <dd>NIF</dd>
  <dt>Domicilio</dt>    <dd>DOMICILIO O DIRECCIÓN PROFESIONAL</dd>
  <dt>Contacto</dt>     <dd>aurixsystemofficial@gmail.com</dd>
  <!-- Sólo si aplica: <dt>Datos registrales</dt> <dd>…</dd> -->
</dl>
<dl data-lang-block="en">
  <dt>Operator</dt>     <dd>FULL NAME OR COMPANY NAME</dd>
  <dt>Tax ID (NIF)</dt> <dd>NIF</dd>
  <dt>Address</dt>      <dd>ADDRESS OR PROFESSIONAL ADDRESS</dd>
  <dt>Contact</dt>      <dd>aurixsystemofficial@gmail.com</dd>
</dl>
```

`legal.css` ya da estilo a `.lg-owner dl/dt/dd` (legible, sin letra diminuta). Después: subir `?v=` de
`legal.css`/`legal.js`, ajustar `scripts/aurix-legal-pages-probe.mjs` (hoy exige la nota) y publicar la app.

## Estado (2026-10-26)

Contenido público limpio: sin «BORRADOR», «PENDIENTE» ni notas internas. El Aviso legal sigue incompleto hasta
incorporar los datos reales del titular. Este contenido no certifica cumplimiento jurídico definitivo.

Pendiente fuera del alcance de esta entrega: `login.html` (registro) no enlaza Privacidad ni Condiciones, y los
enlaces legales de Stripe Checkout se configuran en el panel de Stripe (no en el código).
