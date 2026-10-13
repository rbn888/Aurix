// Personas de Intelligence compartidas por las sondas V2 y V3 (extraídas sin cambios de aurix-intelligence-v2-probe.mjs).
export const DAY = 864e5, H = 3600e3;
// [id, ticker, name, type, weight %, cambio 24 h %, deriva 30 d %]
export const QA = [
  ['a1', 'MSFT', 'Microsoft', 'stock', 29, 0.8, 3.0],
  ['a2', 'BTC', 'Bitcoin', 'crypto', 22, -2.4, -5.0],
  ['a3', 'AAPL', 'Apple', 'stock', 18, 0.4, 2.0],
  ['a4', 'ETH', 'Ethereum', 'crypto', 13.5, 3.1, 6.0],
  ['a5', 'USD', 'Efectivo', 'cash', 7, 0, 0],
  ['a6', 'NVDA', 'NVIDIA', 'stock', 4, 1.2, 8.0],
  ['a7', 'SOL', 'Solana', 'crypto', 0.8, -6.1, -9.0],
  ['a8', 'ADA', 'Cardano', 'crypto', 0.8, -1.5, -4.0],
  ['a9', 'LINK', 'Chainlink', 'crypto', 0.8, 2.2, 1.0],
  ['a10', 'VWCE', 'Vanguard FTSE All-World', 'etf', 0.9, 0.3, 1.5],
  ['a11', 'IUSA', 'iShares S&P 500', 'etf', 0.8, 0.5, 2.5],
  ['a12', 'GLD', 'SPDR Gold', 'metal', 0.8, -0.2, 1.0],
  ['a13', 'PHAU', 'WisdomTree Gold', 'metal', 0.8, -0.3, 0.8],
  ['a14', 'FND', 'Fondo Global', 'fund', 0.8, 0.1, 0.5],
];
const TOTAL = 100000;
// REAL · la cuenta observada en producción (V2.1): historia 10-sep → 10-oct (30 días),
// peso máximo 51,6 % (Bitcoin) → 28,7 % (Microsoft), liquidez 7D 6,8 % → 7,2 %,
// reparto efectivo 2,5 → 5,2; Microsoft 29 %, Bitcoin 22 %, Apple 18 %, top-3 69 %,
// acciones 51 %. Las posiciones nuevas entran sin operación registrada: «Qué movió»
// NO puede certificarse (y debe desaparecer).
export function personaReal() {
  const now = Date.now(), endAt = now - H, start = now - 30 * DAY;
  const NOW_W = { a1: 28.7, a2: 22, a3: 18, a4: 14.6, a5: 7.2, a6: 4, a7: 0.6875, a8: 0.6875, a9: 0.6875, a10: 0.6875, a11: 0.6875, a12: 0.6875, a13: 0.6875, a14: 0.6875 };
  const START_W = { a2: 51.6, a1: 34, a3: 10, a5: 4.4 };
  const D7_W = Object.assign({}, NOW_W); { const f = (100 - 6.8) / (100 - 7.2); Object.keys(D7_W).forEach(k => { D7_W[k] = k === 'a5' ? 6.8 : NOW_W[k] * f; }); }
  // Total estable: el reparto cambia sin inventar una rentabilidad que el fixture no tiene.
  const total = (t) => 100000 * (1 + 0.002 * Math.sin((t - start) / (9 * H)));   // relativo: determinista entre ejecuciones
  const weightsAt = (t) => {
    if (t <= start + H) return START_W;
    if (t <= now - 7 * DAY) { const f = (t - start) / (23 * DAY); const o = {}; Object.keys(D7_W).forEach(k => { o[k] = (START_W[k] || 0) * (1 - f) + D7_W[k] * f; }); return o; }
    const f = Math.min(1, (t - (now - 7 * DAY)) / (7 * DAY - H)); const o = {}; Object.keys(NOW_W).forEach(k => { o[k] = D7_W[k] * (1 - f) + NOW_W[k] * f; }); return o;
  };
  const typeOf = Object.fromEntries(QA.map(r => [r[0], r[3]]));
  const bucket = t2 => ({ cash: 'liquidity' })[t2] || t2;
  const at = (t) => { const w = weightsAt(t), tot = total(t), vals = {}, cv = { crypto: 0, stock: 0, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
    Object.keys(w).forEach(k => { if (!(w[k] > 0)) return; const v = +(tot * w[k] / 100).toFixed(2); vals[k] = v; cv[bucket(typeOf[k])] += v; });
    Object.keys(cv).forEach(k => cv[k] = +cv[k].toFixed(2)); return { vals, cv, tot: +tot.toFixed(2) }; };
  const hist = [], cats = [], server = [];
  for (let ts = start; ts <= endAt + 1; ts += DAY) { const s2 = at(ts); hist.push({ ts, value: s2.tot }); cats.push(Object.assign({ ts, total: s2.tot }, s2.cv)); }
  { const s2 = at(endAt); hist.push({ ts: endAt, value: s2.tot }); cats.push(Object.assign({ ts: endAt, total: s2.tot }, s2.cv)); }
  for (let ts = start; ts <= endAt + 1; ts += (endAt - ts <= 26 * H ? 15 * 60e3 : 6 * H)) { const s2 = at(ts); server.push({ ts, total_value_usd: s2.tot, real_estate: 0, category_values: s2.cv, confidence: 'high' }); }
  const srvTs = server.map(x => x.ts), firstAtOrAfter = (t) => srvTs.find(x => x >= t);
  const memTs = Array.from(new Set([srvTs[srvTs.length - 1], firstAtOrAfter(now - DAY), firstAtOrAfter(now - 7 * DAY), firstAtOrAfter(now - 30 * DAY), srvTs[0]].filter(Number.isFinite))).sort((a, b) => a - b);
  const memRows = memTs.map(ts => ({ ts, values: at(ts).vals, re: 0 }));
  const assets = QA.map(r => { const price = r[3] === 'cash' ? 1 : (r[1] === 'BTC' ? 60000 : (r[1] === 'ETH' ? 3000 : 100 + r[4]));
    const v = 100000 * NOW_W[r[0]] / 100;
    return { id: r[0], ticker: r[1], name: r[2], type: r[3], qty: v / price, price, assetCurrency: 'USD', change24h: r[3] === 'cash' ? null : r[5],
      transactions: [{ type: 'buy', qty: v / price, price, ts: now - 60 * DAY }], createdAt: now - 60 * DAY,
      ...(r[3] === 'crypto' ? { coinId: r[2].toLowerCase() } : { marketSymbol: r[1] }) }; });
  return { hist, cats, server, memRows, assets, lineage: true, now };
}
export function persona(kind) {
  if (kind === 'real') return personaReal();
  const now = Date.now();
  let spec = QA.map(r => r.slice());
  if (kind === 'calm') spec = spec.map(r => { r[5] = r[5] * 0.08; r[6] = r[6] * 0.1; return r; });
  if (kind === 'volatile') spec = spec.map(r => { r[5] = r[3] === 'cash' ? 0 : r[5] * 3.2; return r; });
  if (kind === 'fresh') spec = spec.slice(0, 4).map((r, i) => { r[4] = [50, 30, 15, 5][i]; return r; });
  const days = kind === 'fresh' ? 0 : 44;
  const endAt = kind === 'stale' ? now - 5 * DAY : now - H;
  // precio(t) por activo: deriva lineal hasta −24 h y el cambio 24 h en el último día
  const priceNow = {}, qty = {};
  spec.forEach(r => { priceNow[r[0]] = r[3] === 'cash' ? 1 : (r[1] === 'BTC' ? 60000 : (r[1] === 'ETH' ? 3000 : 100 + r[4])); qty[r[0]] = TOTAL * r[4] / 100 / priceNow[r[0]]; });
  // flows: la posición de BTC tenía 1/3 menos de cantidad antes de hace 10 días
  const buyAt = now - 10 * DAY, btcBefore = qty.a2 * (2 / 3);
  const price = (r, t) => {
    if (r[3] === 'cash') return 1;
    const pNow = priceNow[r[0]], c = r[5] / 100, d = r[6] / 100;
    const ref = endAt;                                     // «ahora» de la persona
    const p24 = pNow / (1 + c);
    if (t >= ref - DAY) return p24 + (pNow - p24) * Math.min(1, (t - (ref - DAY)) / DAY);
    return p24 * Math.exp(d * (t - (ref - DAY)) / (30 * DAY));
  };
  const q = (r, t) => (kind === 'flows' && r[0] === 'a2' && t < buyAt) ? btcBefore : qty[r[0]];
  const bucket = t2 => ({ cash: 'liquidity' })[t2] || t2;
  const at = (t) => {
    const vals = {}, cv = { crypto: 0, stock: 0, etf: 0, fund: 0, metal: 0, real_estate: 0, liquidity: 0, other: 0 };
    let tot = 0;
    spec.forEach(r => { const v = +(q(r, t) * price(r, t)).toFixed(2); vals[r[0]] = v; cv[bucket(r[3])] += v; tot += v; });
    Object.keys(cv).forEach(k => cv[k] = +cv[k].toFixed(2));
    return { vals, cv, tot: +tot.toFixed(2) };
  };
  const hist = [], cats = [], server = [];
  const steps = [];
  if (kind === 'fresh') steps.push(endAt);
  else { for (let i = days; i >= 1; i--) steps.push(endAt - i * DAY); steps.push(endAt); }
  steps.forEach(ts => { const s = at(ts); hist.push({ ts, value: s.tot }); cats.push(Object.assign({ ts, total: s.tot }, s.cv)); });
  // Cadencia del cron real en el último día (*/15); cada 6 h antes, para no inflar la persona.
  if (kind !== 'fresh') for (let ts = endAt - days * DAY; ts <= endAt + 1; ts += (endAt - ts <= 26 * H ? 15 * 60e3 : 6 * H)) { const s = at(ts); server.push({ ts, total_value_usd: s.tot, real_estate: 0, category_values: s.cv, confidence: 'high' }); }
  const srvTs = server.map(x => x.ts);
  const firstAtOrAfter = (t) => srvTs.find(x => x >= t);
  const memTs = kind === 'fresh' ? [] : Array.from(new Set([srvTs[srvTs.length - 1], firstAtOrAfter(now - DAY), firstAtOrAfter(now - 7 * DAY), firstAtOrAfter(now - 30 * DAY), srvTs[0]].filter(Number.isFinite))).sort((a, b) => a - b);
  const memRows = memTs.map(ts => ({ ts, values: at(ts).vals, re: 0 }));
  const assets = spec.map(r => {
    const tx = [{ type: 'buy', qty: (kind === 'flows' && r[0] === 'a2') ? btcBefore : qty[r[0]], price: price(r, now - 60 * DAY), ts: now - 60 * DAY }];
    if (kind === 'flows' && r[0] === 'a2') tx.push({ type: 'buy', qty: qty.a2 - btcBefore, price: price(r, buyAt), ts: buyAt });
    return { id: r[0], ticker: r[1], name: r[2], type: r[3], qty: qty[r[0]], price: priceNow[r[0]], assetCurrency: 'USD',
      change24h: r[3] === 'cash' ? null : r[5], transactions: tx, createdAt: now - 60 * DAY,
      ...(r[3] === 'crypto' ? { coinId: r[2].toLowerCase() } : { marketSymbol: r[1] }) };
  });
  return { hist, cats, server, memRows, assets, lineage: kind !== 'fresh', now };
}

