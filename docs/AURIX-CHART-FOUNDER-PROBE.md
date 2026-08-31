# AURIX CHART RELIABILITY — sonda de QA del founder

**No envía código a producción.** Es un snippet que se pega en la consola de DevTools: lee funciones que
`app.js` ya expone en `window` y no escribe nada. Al cerrar la pestaña desaparece — no hay nada que retirar
de la UI pública.

**No captura valores patrimoniales individuales.** Devuelve: número de puntos, timestamps como *offsets
relativos* (minutos desde ahora), etiquetas de fuente, número de segmentos, hueco mayor, estado de
continuidad, elegibilidad del badge y un **hash de la serie**. El hash cubre los pares (offset, valor) para
detectar cualquier cambio de serie, pero no imprime ningún valor.

## Qué se está comprobando

El invariante: **misma verdad persistida + mismo timeframe ⇒ mismo hash**. Si sales y vuelves a entrar sin
que cambie la cartera, el hash tiene que ser idéntico. Dos hashes distintos = la regresión sigue viva.

## El snippet

Pegar una vez en la consola (queda disponible como `aurixProbe()` durante esa sesión):

```js
window.aurixProbe = function (range) {
  const r = range || (typeof activeRange !== 'undefined' ? activeRange : '24h');
  const H = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const now = Date.now();
  const emg = buildProductionPortfolioChart(r);
  const frc = (typeof _aurixResolveFinalRenderSeriesContract === 'function' && emg.state === 'ready')
    ? _aurixResolveFinalRenderSeriesContract(emg, r, 'desktop') : null;
  const pts = (frc && frc.renderPoints) || emg.points || [];
  const T = p => (p.time != null ? p.time : p.ts);
  const cont = (pts.length > 1 && typeof _aurixBuildContinuityValidatedSeries === 'function')
    ? _aurixBuildContinuityValidatedSeries(pts, r) : null;
  let gap = 0; for (let i = 1; i < pts.length; i++) gap = Math.max(gap, T(pts[i]) - T(pts[i - 1]));
  const src = {}; ((typeof _aurixEmergencyLast !== 'undefined' && emg.points) || []).forEach(p => { const s = p.source || 'frontend'; src[s] = (src[s] || 0) + 1; });
  const canon = { outcome: (typeof _aurixRemoteLoadOutcome !== 'undefined') ? _aurixRemoteLoadOutcome : '?',
                  loaded: (typeof _aurixCanonicalHistoryLoaded !== 'undefined') ? _aurixCanonicalHistoryLoaded : '?',
                  hydration: (typeof _aurixBackendSnapshotsState !== 'undefined') ? _aurixBackendSnapshotsState : '?' };
  const pend = (typeof _aurixChartPublicationSourcesPending === 'function') ? _aurixChartPublicationSourcesPending() : { pending: '?' };
  return {
    range: r,
    points: pts.length,
    firstOffsetMin: pts.length ? Math.round((now - T(pts[0])) / 60000) : null,
    lastOffsetMin: pts.length ? Math.round((now - T(pts[pts.length - 1])) / 60000) : null,
    segments: cont ? cont.segments.length : null,
    continuity: cont ? cont.continuityState : null,
    largestGapH: +(gap / 3600000).toFixed(2),
    gapFloorH: cont ? +(cont.realGapFloorMs / 3600000).toFixed(2) : null,
    coverage: cont ? cont.coverageRatio : null,
    sources: src,
    badgeEligible: frc ? !!frc.badgeEligible : null,
    returnPct: emg.returnPct,
    sourcesPending: pend.pending, pendingReason: pend.reason || null,
    assembly: canon,
    seriesHash: H(pts.map(p => Math.round((now - T(p)) / 60000) + ':' + (p.value != null ? p.value : p.total)).join('|')),
  };
};
console.table([aurixProbe('24h'), aurixProbe('7d')]);
```

> El `seriesHash` usa offsets **relativos a ahora**, así que entre dos capturas separadas por varios minutos
> cambiará aunque la serie sea la misma. Para comparar entradas, mirar sobre todo `points`, `segments`,
> `continuity`, `largestGapH`, `firstOffsetMin` y `sources`: son los que delatan la regresión.

## Protocolo (SPEC §11)

Con la cartera **sin tocar** durante toda la prueba:

| # | Acción | Qué capturar |
|---|---|---|
| A | Abrir la app, ir al Dashboard, dejar 24H | pegar el snippet → `console.table` |
| B | `aurixProbe('24h')` | captura 1 |
| C | Salir de Dashboard (otra pestaña de la app) | — |
| D | Volver a Dashboard | — |
| E | `aurixProbe('24h')` | captura 2 |
| F | Cambiar a 7D | — |
| G | `aurixProbe('7d')`, luego repetir C–E en 7D | capturas 3 y 4 |

**Esperado:** entre la captura 1 y la 2 (y entre la 3 y la 4) `points`, `segments`, `continuity`,
`largestGapH` y `sources` deben coincidir **exactamente**.

**Señal de que la regresión sigue viva:** `segments` pasa de 1 a 2, o `points` sube mucho, entre dos entradas
sin cambios en la cartera.

**Esperado durante el arranque:** puede aparecer `sourcesPending: true` con `pendingReason`
`canonical_read_failed`, `canonical_reconcile_in_flight` o `backend_hydration_in_progress`. Eso es correcto:
significa que el gráfico está **reteniendo** en lugar de publicar historia incompleta. Debe resolverse solo
en 1–2 s (o al volver a poner la app en primer plano).

**Vale la pena reportar:** si `sourcesPending` se queda `true` más de ~10 s con red buena, o si el gráfico
no aparece nunca.
