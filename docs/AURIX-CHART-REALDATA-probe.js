/* AURIX-CHART-REALDATA-probe — paste this whole block into the browser console
   ON rbn888.github.io/Aurix (logged in, your real portfolio). It is READ-ONLY:
   it reads your live categoryHistory + investable value and replicates the new
   validation inline (so it works on the CURRENTLY deployed page too, before the
   launch-quality build is pushed). It prints, per 7D / 30D / TOTAL:
     liveValue · firstPoint · lastPoint · minPoint · maxPoint · spanDays ·
     validateSeriesAgainstLive · availabilityReason · renderState
   Nothing is written, persisted, or sent anywhere. */
(function () {
  var DAY = 86400000, MIN = 60000;
  var REGIME = { '24h': [0.6, 1.5], '7d': [0.5, 2.2], '30d': [0.4, 2.5], '1y': [0.15, 8], 'all': [0.1, 12] };
  var WIN = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '1y': 365 * DAY };

  function epoch() {
    try { if (typeof _aurixInvestableChartEpoch === 'function') return _aurixInvestableChartEpoch(); } catch (_) {}
    var o = 0; try { o = parseInt(localStorage.getItem('aurix_investable_chart_epoch') || '0', 10) || 0; } catch (_) {}
    return Math.max(o, 1780704000000);
  }
  function liveUSD() {
    try { if (typeof investableValueUSD === 'function') return Number(investableValueUSD()); } catch (_) {}
    try { if (typeof investableValueBase === 'function') return Number(investableValueBase()); } catch (_) {}
    return NaN;
  }
  function hasAssets() {
    try { return Array.isArray(assets) && assets.filter(function (a) { return !a || a.lifecycleStatus !== 'closed'; }).length > 0; } catch (_) { return true; }
  }
  // investable series per range from the REAL categoryHistory (USD, post-epoch)
  function invSeries(range) {
    var ep = epoch(), now = Date.now();
    var ch = (typeof categoryHistory !== 'undefined' && Array.isArray(categoryHistory)) ? categoryHistory : [];
    var start = range === 'all' ? ep : Math.max(ep, now - (WIN[range] || 0));
    var out = [];
    for (var i = 0; i < ch.length; i++) {
      var p = ch[i]; if (!p || typeof p.ts !== 'number' || p.ts < start) continue;
      var inv = Number(p.total) - Number(p.real_estate || 0);
      if (!isFinite(inv) || inv <= 0) continue;
      out.push({ time: p.ts, value: +inv.toFixed(2) });
    }
    out.sort(function (a, b) { return a.time - b.time; });
    return out;
  }
  function availability(range, s, ep) {
    var v = s.filter(function (p) { return p && isFinite(p.time) && p.time > 0 && isFinite(p.value) && p.value > 0 && (!ep || p.time >= ep); });
    var n = v.length, spanDays = n >= 2 ? (v[n - 1].time - v[0].time) / DAY : 0, spanMin = n >= 2 ? (v[n - 1].time - v[0].time) / MIN : 0;
    var days = {}; v.forEach(function (p) { days[Math.floor(p.time / DAY)] = 1; }); var nd = Object.keys(days).length;
    var r = String(range).toLowerCase(), available = false, reason = 'building_no_points';
    if (n < 2) reason = 'building_no_points';
    else if (r === '24h') { available = n >= 4 && spanMin >= 30; reason = available ? 'ready' : 'building_insufficient_intraday'; }
    else if (r === '7d') { available = nd >= 2 || n >= 4; reason = available ? 'ready' : 'building_insufficient_points'; }
    else if (r === '30d') { available = nd >= 5 || spanDays >= 7; reason = available ? 'ready' : 'building_insufficient_days'; }
    else if (r === '1y') { available = spanDays >= 30; reason = available ? 'ready' : 'building_insufficient_coverage'; }
    else if (r === 'all') { available = n >= 2; reason = available ? 'ready' : 'building_no_points'; }
    return { available: available, reason: reason };
  }
  function validateLive(range, s, L) {
    var arr = s.filter(function (p) { return p && isFinite(p.time) && p.time > 0 && isFinite(p.value) && p.value > 0; });
    if (arr.length < 2) return { valid: false, reason: 'too_few' };
    if (!isFinite(L) || L <= 0) return { valid: true, reason: 'no_live' };
    var band = REGIME[String(range).toLowerCase()] || [0.1, 12], rlo = L * band[0], rhi = L * band[1];
    for (var i = 0; i < arr.length; i++) if (arr[i].value < rlo || arr[i].value > rhi) return { valid: false, reason: 'regime_incompatible' };
    var spanDays = (arr[arr.length - 1].time - arr[0].time) / DAY, fold = 1 + 1.5 * Math.max(spanDays, 0.1);
    if (arr[0].value < L / fold || arr[0].value > L * fold) return { valid: false, reason: 'headline_implausible' };
    return { valid: true, reason: 'ok' };
  }
  function renderState(range, s, L, ep) {
    if (!hasAssets()) return 'empty';
    if (s.length < 2) return 'building';
    return (availability(range, s, ep).available && validateLive(range, s, L).valid) ? 'ready' : 'building';
  }

  var L = liveUSD(), ep = epoch(), rows = [];
  ['7d', '30d', 'all'].forEach(function (range) {
    var s = invSeries(range), vals = s.map(function (p) { return p.value; });
    rows.push({
      range: range === 'all' ? 'TOTAL' : range.toUpperCase(),
      liveValue: Math.round(L),
      points: s.length,
      firstPoint: vals.length ? Math.round(vals[0]) : null,
      lastPoint: vals.length ? Math.round(vals[vals.length - 1]) : null,
      minPoint: vals.length ? Math.round(Math.min.apply(null, vals)) : null,
      maxPoint: vals.length ? Math.round(Math.max.apply(null, vals)) : null,
      spanDays: s.length >= 2 ? +((s[s.length - 1].time - s[0].time) / DAY).toFixed(3) : 0,
      validate: JSON.stringify(validateLive(range, s, L)),
      availabilityReason: availability(range, s, ep).reason,
      renderState: renderState(range, s, L, ep),
    });
  });
  console.log('%c[AURIX-CHART-REALDATA] epoch=' + new Date(ep).toISOString() + ' liveUSD=' + Math.round(L), 'color:#7aa2ff;font-weight:700');
  console.table(rows);
  console.log('Expected: any range whose series contains ~18k–20k vs live ~6.9k → validate.valid=false → renderState="building".');
  return rows;
})();
