// ════════════════════════════════════════════════════════════════════════════
// aurix-chart-history-audit — SPEC CHART ENGINE · VALIDACIÓN DEFINITIVA DEL HISTÓRICO
// ════════════════════════════════════════════════════════════════════════════
// Auditoría READ-ONLY de 24H / 7D / 30D / 1A / TOTAL contra el motor REAL DESPLEGADO.
// No sustituye al harness del gate (docs/AURIX-CHART-PRODUCTION-CERTIFICATION, sección H):
// el harness certifica invariantes sin navegador; esto ejercita el pipeline COMPLETO
// —_aurixHistorySourceForDisplay → _aurixTrustedChartSource → _aurixApplyRangeSourceAuthority
// → buildValidatedHistoricalSeries → buildProductionPortfolioChart → FRC → contrato de badge—
// y usa el certificador ya desplegado `_aurixCertifyRangeReturn`.
//
// USO:  node --experimental-websocket scripts/aurix-chart-history-audit.mjs
//       AUDIT_ORIGIN=http://localhost:8081 node --experimental-websocket scripts/…   (contra un repo servido)
// Requiere Chrome instalado y salida a red. NO se ejecuta en el gate (necesita navegador).
//
// CÓMO FUNCIONA Y POR QUÉ ASÍ: la app está tras OTP, así que en lugar de autenticar se sirve
// el bundle de producción por un proxy local que parchea ÚNICAMENTE la navegación a login.html
// (ni el i18n, ni el motor, ni el histórico se tocan) y se siembra histórico realista en
// `category_history` ANTES del arranque. Siete escenarios: cobertura completa, cobertura
// insuficiente, baseline post-reset, snapshots corruptos/duplicados/desordenados, determinismo
// por orden de llegada, flujos de capital (flow-neutral), persistencia tras recarga y
// transición entre temporalidades.
//
// LO QUE ESTA HERRAMIENTA NO PUEDE CERTIFICAR (requiere sesión real del founder):
// persistencia entre login/logout y entre dispositivos. El mecanismo (write barrier
// `_aurixPersistenceReady`, epoch de reset, unión por ts/LWW) está cubierto por
// AURIX-MULTIDEVICE-* y por el harness de persistencia; la comprobación de extremo a extremo
// con dos dispositivos es un paso manual.
//
// NOTA DE INTERPRETACIÓN (la trampa que costó tiempo): el histórico DE CONFIANZA no es el que
// se siembra. `_aurixInvestableChartEpoch()` impone un suelo global
// (AURIX_INVESTABLE_CHART_EPOCH = 2026-06-06, cuarentena de datos AURIX-DATA-001), así que
// 1A sólo puede publicar cuando existan ~292 días POSTERIORES a ese suelo. Un 1A en
// "histórico parcial" con menos histórico que eso es comportamiento CORRECTO, no un fallo.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const LIVE = process.env.AUDIT_ORIGIN || 'https://app.aurixsystem.io';
const PORT = 8080, CDP_PORT = 9351;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

let navPatched = false;
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  (async () => {
    let buf;
    try {
      const r = await fetch(LIVE + (url === '/' ? '/index.html' : url) + '?cb=' + Math.floor(process.uptime() * 1e6));
      if (!r.ok) throw new Error('http ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (_) { res.writeHead(404); return res.end('nf'); }
    let body = buf;
    if (url === '/app.js') {
      let src = buf.toString('utf8');
      const before = src;
      src = src.replace(/safeRedirect\('login\.html'/g, "void(0) && safeRedirect('login.html'");
      src = src.replace(/location\.replace\(base \+ 'login\.html'\)/g, 'void 0');
      navPatched = before !== src;
      body = Buffer.from(src, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'text/plain' });
    res.end(body);
  })();
});
await new Promise(r => server.listen(PORT, r));

const profile = fs.mkdtempSync('/tmp/chart-prof-');
const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
let wsu;
for (let i = 0; i < 60; i++) {
  try { wsu = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl; break; }
  catch { await new Promise(r => setTimeout(r, 250)); }
}
const ws = new WebSocket(wsu);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (m, p = {}, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, x => x.error ? rej(new Error(m + ': ' + x.error.message)) : res(x.result)); ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: s })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const ev = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

// ── Generador de histórico REALISTA (determinista, sin Math.random) ─────────
// Densidad como la de producción: 15 min las últimas 48h, 1h hasta 7d, 6h hasta 30d,
// diario hasta 400d. Trayectoria = deriva suave + oscilación acotada, con pasos por
// punto muy por debajo de los umbrales de spike/construcción para que la auditoría mida
// el CÁLCULO y no el saneamiento.
function makeSeries(nowMs, opts = {}) {
  const days = opts.days ?? 400;
  const start = opts.startValue ?? 10000;
  const end = opts.endValue ?? 13000;
  const pts = [];
  const push = (ts) => pts.push(ts);
  for (let t = nowMs - days * 864e5; t < nowMs - 30 * 864e5; t += 864e5) push(t);
  for (let t = nowMs - 30 * 864e5; t < nowMs - 7 * 864e5; t += 6 * 36e5) push(t);
  for (let t = nowMs - 7 * 864e5; t < nowMs - 2 * 864e5; t += 36e5) push(t);
  for (let t = nowMs - 2 * 864e5; t <= nowMs; t += 15 * 6e4) push(t);
  const t0 = pts[0], t1 = pts[pts.length - 1];
  return pts.map((ts, i) => {
    const u = (ts - t0) / (t1 - t0);
    const drift = start + (end - start) * u;
    const wob = 1 + 0.012 * Math.sin(i * 0.37) + 0.006 * Math.sin(i * 1.9);
    const total = +(drift * wob).toFixed(2);
    return { ts, total, real_estate: 0 };
  });
}

const SEED = `(rows, extra) => {
  try {
    localStorage.setItem('category_history', JSON.stringify(rows));
    localStorage.setItem('portfolio_history', JSON.stringify(rows.map(p => ({ ts: p.ts, total: p.total }))));
    if (extra && extra.flows) localStorage.setItem('aurixCapitalFlows', JSON.stringify(extra.flows));
    else localStorage.removeItem('aurixCapitalFlows');
    if (extra && extra.chartEpoch) localStorage.setItem('aurix_investable_chart_epoch', String(extra.chartEpoch));
    else localStorage.removeItem('aurix_investable_chart_epoch');
    if (extra && extra.portfolioEpoch) localStorage.setItem('aurix_portfolio_epoch', String(extra.portfolioEpoch));
    else localStorage.removeItem('aurix_portfolio_epoch');
    return true;
  } catch (e) { return String(e); }
}`;

// Medición por rango: todo lo que el SPEC pide, leído del motor real.
const MEASURE = `(() => {
  const RANGES = ['24h','7d','30d','1y','all'];
  const iso = t => Number.isFinite(t) ? new Date(t).toISOString() : null;
  const out = { seriesInStore: (categoryHistory || []).length, ranges: {} };
  try {
    const trusted = _aurixTrustedChartSource(_aurixHistorySourceForDisplay() || []) || [];
    const ts = trusted.filter(p => p && Number.isFinite(p.ts)).map(p => p.ts);
    out.trustedSpanDays = ts.length ? +((Math.max.apply(null, ts) - Math.min.apply(null, ts)) / 864e5).toFixed(1) : 0;
    const ep = _aurixInvestableChartEpoch();
    out.trustEpochIso = Number.isFinite(ep) && ep > 0 ? new Date(ep).toISOString() : null;
    out.trustEpochSource = (ep === AURIX_INVESTABLE_CHART_EPOCH) ? 'AURIX_INVESTABLE_CHART_EPOCH'
      : (ep === (typeof _aurixPortfolioEpoch === 'function' ? _aurixPortfolioEpoch() : -1)) ? 'portfolio_reset_epoch' : 'override';
  } catch (_) { out.trustedSpanDays = null; }
  RANGES.forEach(r => {
    let emg = null, cert = null, vs = null, frc = null;
    try { emg = buildProductionPortfolioChart(r); } catch (e) { emg = { error: String(e) }; }
    try { cert = _aurixCertifyRangeReturn(r); } catch (e) { cert = { error: String(e) }; }
    try { vs = buildValidatedHistoricalSeries(r); } catch (e) { vs = null; }
    try { frc = emg && emg._frc ? emg._frc : null; } catch (_) {}
    const pts = (emg && Array.isArray(emg.points)) ? emg.points : [];
    const rp  = (frc && Array.isArray(frc.renderPoints)) ? frc.renderPoints : pts;
    // integridad de la serie publicada
    let monotonic = true, dupes = 0, nonFinite = 0, nonPositive = 0;
    for (let i = 0; i < rp.length; i++) {
      const p = rp[i];
      const t = p && (p.ts ?? p.x), v = p && (p.value ?? p.y);
      if (!Number.isFinite(t) || !Number.isFinite(v)) { nonFinite++; continue; }
      if (!(v > 0)) nonPositive++;
      if (i > 0) {
        const pt = rp[i-1] && (rp[i-1].ts ?? rp[i-1].x);
        if (Number.isFinite(pt)) { if (t < pt) monotonic = false; if (t === pt) dupes++; }
      }
    }
    const span = _AURIX_EMG_RANGE_MS[r];
    const nowRef = vs ? vs.nowRef : (emg ? emg.currentTs : null);
    const startTs = (r === 'all' || !Number.isFinite(span)) ? null : (nowRef - span);
    const first = rp.length ? (rp[0].ts ?? rp[0].x) : null;
    const last  = rp.length ? (rp[rp.length-1].ts ?? rp[rp.length-1].x) : null;
    out.ranges[r] = {
      // ventana
      windowStart: iso(startTs), nowRef: iso(nowRef),
      firstSnapshot: iso(first), lastSnapshot: iso(last),
      pointsInLine: rp.length, pointsBuilt: pts.length,
      windowRespected: (startTs == null) || (first != null && first >= startTs - 1),
      endpointIsLastSnapshot: (last != null && nowRef != null && Math.abs(last - nowRef) <= 1),
      // baseline / valor / rentabilidad
      baselineTs: iso(cert && cert.baselineTimestamp), baselineValue: cert && cert.baselineValue,
      currentValue: cert && cert.currentValue,
      deltaEur: (cert && Number.isFinite(cert.currentValue) && Number.isFinite(cert.baselineValue))
        ? +(cert.currentValue - cert.baselineValue).toFixed(2) : null,
      externalCashflows: cert && cert.externalCashflows, marketPnl: cert && cert.marketPnl,
      publishedPct: cert && cert.publishedReturnPct, expectedPct: cert && cert.expectedReturnPct,
      difference: cert && cert.difference, equationResidual: cert && cert.equationResidual,
      returnState: cert && cert.returnState, certified: cert && cert.certified, certReason: cert && cert.reason,
      consumerParity: cert && cert.consumerParity,
      // estados temporales
      displayedRangeState: emg && emg.displayedRangeState,
      frcMode: frc && frc.mode, frcReason: frc && frc.reason,
      coverageRatio: emg && emg.coverageRatio,
      historyTooShortForRange: emg && emg.historyTooShortForRange,
      // integridad
      monotonic, dupes, nonFinite, nonPositive,
      quarantined: vs ? vs.quarantined.length : null,
      quarantineReasons: vs ? [...new Set(vs.quarantined.map(q => q.reason))] : null,
      // paridad de consumidores
      returnPct: emg && emg.returnPct, badgeReturnPct: emg && emg.badgeReturnPct, lineReturnPct: emg && emg.lineReturnPct,
    };
  });
  return out;
})()`;

async function boot(rows, extra) {
  await S('Page.navigate', { url: 'http://localhost:' + PORT + '/index.html' });
  // Sembrar en cuanto exista el documento pero ANTES de que app.js lea el store.
  await S('Page.addScriptToEvaluateOnNewDocument', { source: `(${SEED})(${JSON.stringify(rows)}, ${JSON.stringify(extra || {})})` });
  await S('Page.navigate', { url: 'http://localhost:' + PORT + '/index.html' });
  for (let i = 0; i < 300; i++) {
    let ready = false;
    try {
      ready = await ev(`(() => typeof buildProductionPortfolioChart === 'function'
        && typeof _aurixCertifyRangeReturn === 'function'
        && Array.isArray(categoryHistory) && categoryHistory.length > 0)()`);
    } catch (_) {}
    if (ready) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

const fails = [];
const A = (c, m) => { if (!c) fails.push(m); };
const NOW = Date.parse('2026-07-28T12:00:00Z');
const sections = [];

// ═══ S1 — COBERTURA COMPLETA (400 días, sin flujos) ═══════════════════════
{
  const rows = makeSeries(NOW);
  A(await boot(rows), 'S1: el motor no arrancó con histórico sembrado');
  const m = await ev(MEASURE);
  sections.push({ name: 'S1 cobertura completa (400d, ' + rows.length + ' snapshots)', m });
  // El histórico DE CONFIANZA no es el sembrado: `_aurixInvestableChartEpoch()` impone un
  // suelo global (AURIX_INVESTABLE_CHART_EPOCH = 2026-06-06, cuarentena AURIX-DATA-001).
  // La auditoría mide contra el histórico realmente disponible, no contra el que yo siembro.
  const trustedSpanDays = m.trustedSpanDays;
  const canCover = { '24h': trustedSpanDays >= 0.8, '7d': trustedSpanDays >= 5.6, '30d': trustedSpanDays >= 24, '1y': trustedSpanDays >= 292, 'all': true };
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const x = m.ranges[r];
    A(x.pointsInLine >= 2, `S1/${r}: línea con ${x.pointsInLine} puntos`);
    A(x.windowRespected, `S1/${r}: el primer punto (${x.firstSnapshot}) cae fuera de la ventana (${x.windowStart})`);
    A(x.endpointIsLastSnapshot, `S1/${r}: el endpoint no es el último snapshot`);
    A(x.monotonic, `S1/${r}: serie NO ordenada`);
    A(x.dupes === 0, `S1/${r}: ${x.dupes} timestamps duplicados en la línea`);
    A(x.nonFinite === 0 && x.nonPositive === 0, `S1/${r}: puntos no finitos/no positivos (${x.nonFinite}/${x.nonPositive})`);
    A(x.certified, `S1/${r}: NO certificado → ${x.certReason}`);
    if (canCover[r]) {
      // Rango con histórico suficiente ⇒ DEBE publicar y cuadrar.
      A(x.returnState === 'ok', `S1/${r}: returnState=${x.returnState} con ${trustedSpanDays}d de histórico de confianza`);
      A(Math.abs(x.equationResidual || 0) <= 0.01, `S1/${r}: residual de la ecuación ${x.equationResidual}`);
      A(x.difference === 0 || Math.abs(x.difference || 0) <= 0.0001, `S1/${r}: publicado≠esperado (dif ${x.difference})`);
      A(x.returnPct === x.badgeReturnPct, `S1/${r}: badge≠valor único (${x.returnPct} vs ${x.badgeReturnPct})`);
      A(Math.abs((x.deltaEur ?? 0) - (x.marketPnl ?? 0)) <= 0.02, `S1/${r}: Δ€ ${x.deltaEur} ≠ marketPnl ${x.marketPnl} sin flujos`);
      const pctCalc = +(((x.deltaEur) / x.baselineValue) * 100).toFixed(4);
      A(Math.abs(pctCalc - x.publishedPct) <= 0.001, `S1/${r}: % publicado ${x.publishedPct} ≠ Δ/baseline ${pctCalc}`);
      A(!/building|construcc|calculando/i.test(String(x.frcMode) + String(x.displayedRangeState)),
        `S1/${r}: estado temporal presente con cobertura suficiente (frc=${x.frcMode}, state=${x.displayedRangeState})`);
    } else {
      // Rango SIN histórico suficiente ⇒ supresión honesta: ni % inventado ni estado 'full'.
      A(x.publishedPct == null, `S1/${r}: publica ${x.publishedPct}% con sólo ${trustedSpanDays}d de histórico de confianza`);
      A(x.displayedRangeState === 'partial_history', `S1/${r}: estado ${x.displayedRangeState} en vez de partial_history`);
      A(x.pointsInLine >= 2, `S1/${r}: sin línea aunque hay serie dibujable`);
    }
  }
  // El suelo de confianza es la constante de cuarentena, no un accidente: si alguien la
  // mueve o la anula, esta aserción lo detecta.
  A(m.trustEpochIso === '2026-06-06T00:00:00.000Z' && m.trustEpochSource === 'AURIX_INVESTABLE_CHART_EPOCH',
    `S1: el suelo de confianza cambió → ${m.trustEpochIso} (${m.trustEpochSource})`);
  // el valor ACTUAL es el mismo en las 5 temporalidades (una sola verdad)
  const vals = ['24h', '7d', '30d', '1y', 'all'].map(r => m.ranges[r].currentValue);
  A(new Set(vals.map(v => Math.round(v * 100))).size === 1, `S1: el valor actual difiere entre rangos → ${vals.join(' | ')}`);
  // ventanas encajadas: baseline más antigua a medida que crece el rango
  const bs = ['24h', '7d', '30d', '1y'].map(r => Date.parse(m.ranges[r].baselineTs));
  A(bs[0] > bs[1] && bs[1] > bs[2] && bs[2] > bs[3], `S1: las baselines no crecen hacia atrás con el rango → ${bs.map(t => new Date(t).toISOString()).join(' | ')}`);
}

// ═══ S2 — COBERTURA INSUFICIENTE (3 horas) ════════════════════════════════
{
  const rows = [];
  for (let t = NOW - 3 * 36e5; t <= NOW; t += 15 * 6e4) rows.push({ ts: t, total: +(10000 * (1 + 0.0004 * ((t - NOW) / 6e4))).toFixed(2), real_estate: 0 });
  A(await boot(rows), 'S2: el motor no arrancó');
  const m = await ev(MEASURE);
  sections.push({ name: 'S2 cobertura insuficiente (3h, ' + rows.length + ' snapshots)', m });
  for (const r of ['7d', '30d', '1y']) {
    const x = m.ranges[r];
    // NUNCA un % de 3h presentado como retorno de 7D/30D/1A
    A(x.publishedPct == null || x.displayedRangeState === 'partial_history',
      `S2/${r}: publica ${x.publishedPct}% con sólo 3h de histórico y estado ${x.displayedRangeState}`);
    A(x.certified, `S2/${r}: no certificado → ${x.certReason}`);
  }
  A(m.ranges['24h'].pointsInLine >= 2, 'S2/24h: sin línea con 3h de histórico');
}

// ═══ S3 — BASELINE POST-RESET (TOTAL no inventa histórico previo) ═════════
{
  const rows = makeSeries(NOW);
  const epoch = NOW - 5 * 864e5;                 // reset hace 5 días
  A(await boot(rows, { chartEpoch: epoch, portfolioEpoch: epoch }), 'S3: el motor no arrancó');
  const m = await ev(MEASURE);
  sections.push({ name: 'S3 baseline post-reset (epoch = hace 5 días)', m });
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const x = m.ranges[r];
    A(Date.parse(x.firstSnapshot) >= epoch - 1, `S3/${r}: la línea empieza en ${x.firstSnapshot}, ANTES del epoch de reset`);
    A(Date.parse(x.baselineTs) >= epoch - 1, `S3/${r}: baseline ${x.baselineTs} anterior al epoch de reset`);
  }
  const all = m.ranges['all'];
  A(Date.parse(all.firstSnapshot) >= epoch - 1, 'S3/all: TOTAL inventa histórico previo al reset');
  A(m.trustEpochSource === 'override' || m.trustEpochSource === 'portfolio_reset_epoch',
    `S3: el epoch de reset no manda sobre la constante (fuente ${m.trustEpochSource})`);
}

// ═══ S4 — SNAPSHOTS CORRUPTOS / DUPLICADOS / DESORDENADOS ═════════════════
{
  const clean = makeSeries(NOW);
  const dirty = clean.slice();
  const mid = clean[Math.floor(clean.length * 0.6)];
  dirty.push({ ts: mid.ts, total: mid.total * 1.0001, real_estate: 0 });      // duplicado exacto de ts
  dirty.push({ ts: clean[10].ts, total: NaN, real_estate: 0 });               // valor no finito
  dirty.push({ ts: clean[20].ts, total: 0, real_estate: 0 });                 // cero
  dirty.push({ ts: clean[30].ts, total: -500, real_estate: 0 });              // negativo
  dirty.push({ ts: null, total: 12000, real_estate: 0 });                     // ts inválido
  dirty.push({ ts: NOW + 400 * 864e5, total: 12500, real_estate: 0 });        // futuro absurdo
  dirty.push({ ts: clean[Math.floor(clean.length * 0.4)].ts + 1, total: mid.total * 6, real_estate: 0 }); // spike ×6
  // orden de llegada barajado de forma determinista
  const shuffled = dirty.map((p, i) => [p, (i * 2654435761) % dirty.length]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  A(await boot(shuffled), 'S4: el motor no arrancó');
  const m = await ev(MEASURE);
  sections.push({ name: 'S4 snapshots corruptos/duplicados/desordenados (' + shuffled.length + ' filas)', m });
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const x = m.ranges[r];
    A(x.monotonic, `S4/${r}: la serie publicada NO queda ordenada`);
    A(x.dupes === 0, `S4/${r}: ${x.dupes} duplicados sobreviven`);
    A(x.nonFinite === 0 && x.nonPositive === 0, `S4/${r}: basura sobrevive (nf ${x.nonFinite}, np ${x.nonPositive})`);
    A(Date.parse(x.lastSnapshot) <= NOW + 60000, `S4/${r}: el snapshot futuro se convirtió en endpoint (${x.lastSnapshot})`);
  }
  A((m.ranges['all'].quarantined || 0) > 0, 'S4: la cuarentena no registró ningún rechazo');
  // determinismo: mismo contenido, otro orden de llegada ⇒ misma serie y mismo %
  const sorted = dirty.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  A(await boot(sorted), 'S4b: el motor no arrancó');
  const m2 = await ev(MEASURE);
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    A(m.ranges[r].pointsInLine === m2.ranges[r].pointsInLine &&
      m.ranges[r].publishedPct === m2.ranges[r].publishedPct &&
      m.ranges[r].firstSnapshot === m2.ranges[r].firstSnapshot,
      `S4/${r}: el resultado depende del ORDEN DE LLEGADA (${m.ranges[r].pointsInLine}/${m.ranges[r].publishedPct} vs ${m2.ranges[r].pointsInLine}/${m2.ranges[r].publishedPct})`);
  }
  sections.push({ name: 'S4b determinismo (mismo contenido, orden ordenado)', m: m2 });
}

// ═══ S5 — FLUJOS DE CAPITAL (flow-neutral) ════════════════════════════════
{
  const rows = makeSeries(NOW);
  // depósito de 2000 hace 3 días: la línea sube pero el % NO debe contarlo
  const depTs = NOW - 3 * 864e5;
  const bumped = rows.map(p => p.ts > depTs ? { ...p, total: +(p.total + 2000).toFixed(2) } : p);
  const flows = [{ ts: depTs + 1000, amountUSD: 2000, kind: 'deposit' }];
  A(await boot(bumped, { flows }), 'S5: el motor no arrancó');
  const m = await ev(MEASURE);
  sections.push({ name: 'S5 depósito de 2000 hace 3 días (flow-neutral)', m });
  for (const r of ['7d', '30d', '1y', 'all']) {
    const x = m.ranges[r];
    A(Math.abs((x.externalCashflows || 0) - 2000) <= 0.01, `S5/${r}: el ledger no ve el depósito (cashflows=${x.externalCashflows})`);
    if (x.returnState === 'ok') {
      A(Math.abs(x.equationResidual || 0) <= 0.01, `S5/${r}: residual ${x.equationResidual} (baseline+market+flujos≠actual)`);
      const grossPct = +(((x.currentValue - x.baselineValue) / x.baselineValue) * 100).toFixed(4);
      A(x.publishedPct < grossPct, `S5/${r}: el % publicado (${x.publishedPct}) NO excluye el depósito (bruto ${grossPct})`);
    }
  }
  A(Math.abs((m.ranges['24h'].externalCashflows || 0)) <= 0.01, 'S24h: un depósito de hace 3 días entra en la ventana de 24H');
}

// ═══ S6 — PERSISTENCIA TRAS RECARGA ══════════════════════════════════════
{
  const rows = makeSeries(NOW);
  A(await boot(rows), 'S6: el motor no arrancó');
  const before = await ev(MEASURE);
  await S('Page.reload');
  for (let i = 0; i < 300; i++) {
    let ok = false;
    try { ok = await ev(`(() => typeof buildProductionPortfolioChart === 'function' && Array.isArray(categoryHistory) && categoryHistory.length > 0)()`); } catch (_) {}
    if (ok) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const after = await ev(MEASURE);
  sections.push({ name: 'S6 tras recarga', m: after });
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const b = before.ranges[r], a = after.ranges[r];
    A(b.firstSnapshot === a.firstSnapshot && b.lastSnapshot === a.lastSnapshot &&
      b.baselineValue === a.baselineValue && b.currentValue === a.currentValue &&
      b.publishedPct === a.publishedPct && b.pointsInLine === a.pointsInLine,
      `S6/${r}: cambia tras recargar (${b.publishedPct}% ${b.pointsInLine}pts → ${a.publishedPct}% ${a.pointsInLine}pts)`);
  }
}

// ═══ S7 — TRANSICIÓN ENTRE TEMPORALIDADES ════════════════════════════════
{
  const rows = makeSeries(NOW);
  A(await boot(rows), 'S7: el motor no arrancó');
  const seq = await ev(`(() => {
    const order = ['24h','7d','30d','1y','all','24h','7d','24h'];
    return order.map(r => { const e = buildProductionPortfolioChart(r);
      return { r, pts: (e.points||[]).length, cur: e.currentValue, base: e.baselineValue, pct: e.badgeReturnPct, state: e.displayedRangeState, color: e.color }; });
  })()`);
  sections.push({ name: 'S7 secuencia de temporalidades', seq });
  const first24 = seq[0], again24 = seq[5], last24 = seq[7], first7 = seq[1], again7 = seq[6];
  A(JSON.stringify(first24) === JSON.stringify(again24) && JSON.stringify(first24) === JSON.stringify(last24),
    'S7: volver a 24H no reproduce el mismo resultado (no idempotente)');
  A(JSON.stringify(first7) === JSON.stringify(again7), 'S7: volver a 7D no reproduce el mismo resultado');
  const curs = seq.map(s => Math.round(s.cur * 100));
  A(new Set(curs).size === 1, `S7: el valor actual cambia al cambiar de temporalidad → ${[...new Set(curs)].join(' | ')}`);
}

// ── Informe ────────────────────────────────────────────────────────────────
const fmt = v => (v == null ? '—' : (typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(2) : String(v)) : String(v)));
console.log('\n╔══ AUDITORÍA DEL HISTÓRICO — motor de producción (' + LIVE + ') ══╗');
console.log('  navegación parcheada: ' + (navPatched ? 'sí (sólo login redirect)' : 'NO'));
for (const s of sections) {
  console.log('\n── ' + s.name + (s.m && s.m.trustedSpanDays != null ? '  [histórico de confianza: ' + s.m.trustedSpanDays + 'd · suelo ' + s.m.trustEpochIso + ' (' + s.m.trustEpochSource + ')]' : '') + ' ──');
  if (s.seq) { s.seq.forEach((x, i) => console.log(`  ${i}. ${x.r.padEnd(4)} pts=${String(x.pts).padStart(4)} valor=${fmt(x.cur)} baseline=${fmt(x.base)} ${fmt(x.pct)}% estado=${x.state} color=${x.color}`)); continue; }
  console.log('  rango  ventana→endpoint                          pts   baseline     valor        Δ€        %        flujos   resid  estado            cert');
  for (const r of ['24h', '7d', '30d', '1y', 'all']) {
    const x = s.m.ranges[r];
    console.log('  ' + r.padEnd(6) +
      String(x.firstSnapshot || '—').slice(5, 16).padEnd(13) + '→ ' + String(x.lastSnapshot || '—').slice(5, 16).padEnd(14) +
      String(x.pointsInLine).padStart(5) + ' ' +
      fmt(x.baselineValue).padStart(11) + ' ' + fmt(x.currentValue).padStart(12) + ' ' +
      fmt(x.deltaEur).padStart(9) + ' ' + fmt(x.publishedPct).padStart(8) + ' ' +
      fmt(x.externalCashflows).padStart(8) + ' ' + fmt(x.equationResidual).padStart(6) + '  ' +
      String(x.returnState + '/' + (x.displayedRangeState || '—')).padEnd(18) + (x.certified ? '✓' : '✗'));
  }
}
console.log('\n╚══ RESULTADO ══╝');
if (fails.length) console.log('FAIL (' + fails.length + '):\n' + fails.map(f => '  ✗ ' + f).join('\n'));
else console.log('PASS — 7 escenarios × 5 temporalidades, todas las aserciones verdes');

ws.close(); chrome.kill('SIGTERM'); server.close();
process.exit(fails.length ? 1 : 0);
