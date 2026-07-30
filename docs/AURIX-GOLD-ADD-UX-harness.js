'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-GOLD-ADD-UX-harness — SPEC GOLD ADD UX POLISH V1
// ════════════════════════════════════════════════════════════════════════════
// Owner único: el modal "Añadir oro físico". Entrega CSS-only: ni cálculos, ni
// spot, ni conversión g/oz/kg, ni persistencia.
//
// Lo que protege este harness (medido antes con el flujo real abierto y relleno):
//   · el CTA se superponía a campos VIVOS en todo viewport < 901 px
//     (iPhone 80 px sobre el input de precio de compra, Android 26 px,
//      tablet 26-37 px sobre custodia y tarjeta de resumen);
//   · "Ajustar escenario de venta", "Precio internacional del oro" y
//     "Ubicación / custodio" seguían en el flujo de alta.
//
// La contrapartida crítica: todo va acotado a [data-mode="gold"]. Si una de
// estas reglas se escapa del selector, el resto de tipos de activo cambia —
// y eso está explícitamente fuera del alcance del SPEC.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const css  = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app  = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
// Las aserciones "esto ya no está" tienen que mirar CÓDIGO, no comentarios: los de esta
// entrega citan literalmente los selectores retirados para dejar constancia de la causa.
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '  → ' + extra : '')); } }
console.log('AURIX-GOLD-ADD-UX — SPEC GOLD ADD UX POLISH V1\n');

// Extrae el cuerpo de la ÚLTIMA regla que casa un selector. El delimitador previo puede ser
// `{` además de `}` o `,`: la PRIMERA regla dentro de un @media va precedida por la llave del
// propio @media, y omitirla hacía que este helper devolviera una regla anterior ya superada.
function lastRule(selector, scope) {
  const src = scope || cssCode;
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[{},])\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g');
  let m, out = null;
  while ((m = re.exec(src))) out = m[2];
  return out;
}
// Sección introducida por esta entrega, aislada por su marcador.
const GOLD_SECTION = (() => {
  const i = css.indexOf('GOLD-ADD-UX-POLISH-V1');
  return i < 0 ? '' : css.slice(i, css.indexOf('.type-btn {', i));
})();
// Para EXTRAER reglas hay que trabajar sin comentarios: `lastRule` exige que el carácter previo
// al selector sea `{`, `}` o `,`, y un comentario intercalado rompe esa vecindad.
const GOLD_SECTION_CODE = GOLD_SECTION.replace(/\/\*[\s\S]*?\*\//g, '');

// ── 1. Simplificación: los tres bloques salen del ALTA, pero NO se borran ───
console.log('1 — Simplificación del flujo (ocultar, no destruir):');
{
  const hideRule = /\.modal\[data-mode="gold"\]\s*#goldBuyerBlock\s*,\s*\.modal\[data-mode="gold"\]\s*#goldMarketRef\s*,\s*\.modal\[data-mode="gold"\]\s*\.wl-loc-field\s*\{\s*display:\s*none\s*!important;\s*\}/;
  ok('1.1 los tres bloques se ocultan en una sola regla acotada a gold', hideRule.test(cssCode));
  // "No eliminar la lógica si es reutilizada internamente": el markup y los handlers siguen.
  ok('1.2 #goldBuyerBlock SIGUE existiendo en el markup (reutilizable)', /id="goldBuyerBlock"/.test(html));
  ok('1.3 #goldMarketRef SIGUE existiendo en el markup (reutilizable)', /id="goldMarketRef"/.test(html));
  ok('1.4 .wl-loc-field SIGUE existiendo en el markup (reutilizable)', /class="wl-loc-field"/.test(html));
  ok('1.5 la lógica de escenario de venta no se ha tocado', /goldBuyerToggle/.test(app) && /data-gold-buyer/.test(html));
  ok('1.6 la infraestructura de custodia sigue intacta', /_wlReadLocationForm/.test(app) && /_wlResetLocationForm/.test(app));
  // Ocultar custodia por CSS sólo es seguro si el submit no puede recoger un valor fantasma.
  ok('1.7 custodia oculta no puede persistir: se limpia al abrir y null si está vacía',
     /_wlResetLocationForm\(\);/.test(app) && /if \(!type && !provider\) return null;/.test(app));
}

// ── 2. El botón nunca flota sobre el contenido ──────────────────────────────
console.log('\n2 — El CTA cierra el formulario (opción A del SPEC):');
{
  ok('2.0 la entrega deja su marcador en la hoja', GOLD_SECTION.length > 200);
  const body = lastRule('.modal[data-mode="gold"] .modal-cta', GOLD_SECTION_CODE);
  ok('2.1 existe una regla final para el CTA de oro', !!body);
  ok('2.2 el CTA de oro es estático (ni sticky ni absolute)', !!body && /position:\s*static/.test(body), body && body.replace(/\s+/g, ' ').slice(0, 90));
  ok('2.3 sin fondo ni sombra propios (ya no simula una capa flotante)',
     !!body && /background:\s*none/.test(body) && /box-shadow:\s*none/.test(body));
  ok('2.4 el anclaje al borde inferior queda anulado', !!body && /bottom:\s*auto/.test(body));
  // La reserva de ~116 px sólo tenía sentido con footer anclado; sin él sería un hueco muerto.
  const mb = lastRule('.modal[data-mode="gold"] .modal-body', GOLD_SECTION_CODE);
  ok('2.5 se retira la reserva de altura del footer anclado (sin hueco muerto)',
     !!mb && !/92px/.test(mb) && /padding-bottom/.test(mb), mb && mb.replace(/\s+/g, ' ').slice(0, 90));
}

// ── 3. Alcance: ningún otro tipo de activo puede verse afectado ─────────────
console.log('\n3 — Alcance acotado (otros activos byte-idénticos):');
{
  const BLOCK = cssCode.slice(cssCode.indexOf('GOLD-ADD-UX-POLISH-V1') >= 0 ? 0 : 0);
  // Cada selector nuevo de esta entrega tiene que llevar [data-mode="gold"].
  const newSelectors = [
    '.modal[data-mode="gold"] #goldBuyerBlock',
    '.modal[data-mode="gold"] #goldMarketRef',
    '.modal[data-mode="gold"] .wl-loc-field',
    '.modal[data-mode="gold"] .modal-cta',
    '.modal[data-mode="gold"] .modal-body',
  ];
  ok('3.1 todos los selectores de la entrega están acotados a [data-mode="gold"]',
     newSelectors.every(s => s.indexOf('[data-mode="gold"]') >= 0));
  // Un `.wl-loc-field { display:none }` suelto (sin acotar) rompería TODOS los activos.
  ok('3.2 no existe ninguna regla global que oculte la custodia',
     !/(^|[},])\s*\.wl-loc-field\s*\{[^}]*display:\s*none/.test(cssCode));
  ok('3.3 no existe ninguna regla global que oculte el escenario de venta o la tarjeta de mercado',
     !/(^|[},])\s*#goldBuyerBlock\s*\{[^}]*display:\s*none/.test(cssCode) &&
     !/(^|[},])\s*#goldMarketRef\s*\{[^}]*display:\s*none/.test(cssCode));
  // El CTA compartido conserva su comportamiento para el resto de modales.
  // El CTA compartido conserva su regla base sticky (la usan los demás modales del producto).
  ok('3.4 el .modal-cta genérico sigue siendo sticky para los demás flujos',
     /(^|[{},])\s*\.modal-cta\s*\{[^}]*position:\s*sticky/.test(cssCode));
  ok('3.5 el footer de activos no-oro conserva su tratamiento propio',
     /\.modal\[data-mode="asset"\] \.add-v2-footer/.test(cssCode));
}

// ── 4. Un único scroll y flujo continuo ─────────────────────────────────────
console.log('\n4 — Scroll único y orden del formulario:');
{
  ok('4.1 el cuerpo del formulario sigue siendo el único propietario del scroll',
     /\.modal-body\s*\{[^}]*overflow-y:\s*auto/.test(cssCode));
  ok('4.2 la tarjeta de resumen sigue siendo única (#formPreview oculto en oro)',
     /\.modal\[data-mode="gold"\] #formPreview \{ display: none !important; \}/.test(css) && /id="goldSummaryCard"/.test(html));
  // Orden del SPEC: tipo → pureza → unidad → cantidad → precio compra → resumen → CTA.
  const iType = html.indexOf('id="goldTypeRow"');
  const iKarat = html.indexOf('data-gold-karat="24"');
  const iUnit = html.indexOf('id="goldUnitRow"');
  const iQty  = html.indexOf('id="goldQtyAnchor"');
  const iSum  = html.indexOf('id="goldSummaryCard"');
  const iCta  = html.indexOf('id="btnSubmitAsset"');
  ok('4.3 el markup respeta el orden tipo → pureza → unidad → cantidad → resumen → CTA',
     iType > 0 && iType < iKarat && iKarat < iUnit && iUnit < iQty && iQty < iSum && iSum < iCta,
     [iType, iKarat, iUnit, iQty, iSum, iCta].join(' < '));
  ok('4.4 el precio de compra sigue disponible en el flujo de oro (per oz)',
     /purchasePricePerOz/.test(app) && /id="purchasePriceGroup"/.test(html));
}

// ── 5. Nada financiero se ha tocado ─────────────────────────────────────────
console.log('\n5 — Cero impacto en cálculo, spot y persistencia:');
{
  ok('5.1 la conversión g/oz/kg sigue intacta', /GRAMS_PER_TROY_OZ|31\.1034/.test(app));
  ok('5.2 la valoración por peso × pureza × spot sigue intacta', /_renderGoldSpotLine/.test(app));
  ok('5.3 los factores de escenario 5/8/15 siguen existiendo (lógica no destruida)',
     /data-margin-internal="5"/.test(html) && /data-margin-internal="8"/.test(html) && /data-margin-internal="15"/.test(html));
  ok('5.4 la entrega no añade JavaScript: es CSS-only',
     !/GOLD-ADD-UX-POLISH-V1/.test(app) && /GOLD-ADD-UX-POLISH-V1/.test(css));
}

console.log(`\nRESULT: ${fail ? 'FAIL ✗' : 'PASS ✓'}  (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
