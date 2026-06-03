/* ============================================================================
   services/portfolio-chart-engine.js — AURIX-PORTFOLIO-CHART-ENGINE-1 · Fase A

   THE PURE MATH + TIME CORE of the Aurix Portfolio Chart Engine (PCE).

   This is the definitive foundation for ALL Aurix net-worth-style charts
   (Dashboard, Wealth Evolution, Category Performance, Workspace, future premium
   surfaces, professional fullscreen). It reconstructs portfolio value over time
   as  netWorth(t) = Σ qtyᵢ(t)·priceᵢ(t)·fx(t) + cash(t)  instead of relying on
   the snapshots the app could self-record while open.

   FASE A SCOPE — strictly the math + temporal core. This file:
     • is PURE: no DOM, no fetch, no timers, no app.js globals, no side effects
       beyond defining window.AurixPortfolioEngine (a frozen namespace);
     • is COMPLETELY DORMANT: it is NOT loaded by index.html in this phase, so
       Aurix's visible behaviour is byte-for-byte unchanged;
     • performs NO price fetching and NO rendering (later phases inject prices
       and bridge to aurix-chart-core);
     • is deterministic and node-testable (run `node services/portfolio-chart-engine.js`).

   DESIGN PRINCIPLES (locked in here so later phases never need a rewrite):
     1. Generic by asset-set — every function works on an arbitrary list of
        holdings, so Dashboard (all), Category (filtered), Workspace (subset)
        and Wealth Evolution (all + contributions) share ONE engine.
     2. Multi-resolution — granularity (intraday | daily | weekly | monthly) is
        a first-class parameter; the grid builder is resolution-agnostic.
     3. Fullscreen / crosshair ready — the output is a structured object with a
        timestamped series (exact read-by-date) plus reserved `overlays` /
        `annotations` arrays for future trend lines / overlays / notes.
     4. Dependency inversion — the engine NEVER hardcodes asset→symbol policy.
        The caller injects a `resolveHolding` resolver. In integration the real
        `_aurixAssetPickAdapter` (app.js:11083) is passed in, so there is ZERO
        duplication / drift of classification rules. `defaultResolveHolding`
        below mirrors those rules ONLY for self-tests.

   FIDELITY > AESTHETICS: this core never fabricates a data point. Market value
   is sampled by linear interpolation strictly BETWEEN real provider samples
   (the market was continuous); it never extrapolates a price before the first
   real sample. Quantities and cash are step functions that change only at real
   user events. Static (non-feed) holdings are held flat — which is the truth
   for a user-asserted value, not invented market movement — and are reported as
   reduced confidence so the surface can label them.
   ============================================================================ */
(function (global) {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────────────── */
  var DAY_MS  = 86400000;
  var RANGE_MS = {
    '24h': DAY_MS,
    '7d':  7   * DAY_MS,
    '30d': 30  * DAY_MS,
    '1y':  365 * DAY_MS,
    'all': null            // unbounded — caller supplies the span via firstTs
  };
  // Default temporal resolution per range. Overridable by the caller.
  var DEFAULT_GRANULARITY = {
    '24h': 'intraday', '7d': 'intraday', '30d': 'daily', '1y': 'daily', 'all': 'weekly'
  };
  var GRANULARITY = ['intraday', 'daily', 'weekly', 'monthly'];
  var MAX_GRID_POINTS = 250;             // hard cap on rendered points (perf)
  var MIN_INTRADAY_STEP_MS = 5 * 60000;  // 5 min — finest grid we ever draw

  var CONFIDENCE = { COMPLETE: 'complete', PARTIAL: 'partial', INSUFFICIENT: 'insufficient' };

  /* ── Small pure utilities ──────────────────────────────────────────────── */
  function _isFiniteNum(x) { return typeof x === 'number' && isFinite(x); }
  function _num(x, fallback) { return _isFiniteNum(x) ? x : (fallback || 0); }
  function _asArray(x) { return Array.isArray(x) ? x : []; }

  // Coarse step (ms) for a granularity. For 'intraday' the step adapts to the
  // span so a 24h window is fine-grained and a 30d intraday window stays bounded.
  function _granularityStep(granularity, spanMs) {
    switch (granularity) {
      case 'daily':   return DAY_MS;
      case 'weekly':  return 7 * DAY_MS;
      case 'monthly': return 30 * DAY_MS;
      case 'intraday':
      default:
        if (!_isFiniteNum(spanMs) || spanMs <= 0) return MIN_INTRADAY_STEP_MS;
        return Math.max(MIN_INTRADAY_STEP_MS, Math.floor(spanMs / MAX_GRID_POINTS));
    }
  }

  /* ── Temporal core: the grid ───────────────────────────────────────────────
     Builds an ascending array of timestamps covering [now - span, now].
     Resolution-agnostic and bounded to MAX_GRID_POINTS. The final timestamp is
     always exactly `now` so the live anchor lands on a real grid slot.        */
  function buildGrid(opts) {
    var o = opts || {};
    var now = _num(o.now, 0);
    if (now <= 0) return [];
    var range = o.range;
    var span = RANGE_MS.hasOwnProperty(range) && RANGE_MS[range] != null
      ? RANGE_MS[range]
      : _num(o.spanMs, 0);                 // 'all' / custom → caller supplies span
    if (span <= 0 && _isFiniteNum(o.firstTs) && o.firstTs > 0) span = now - o.firstTs;
    if (span <= 0) return [now];

    var granularity = GRANULARITY.indexOf(o.granularity) !== -1
      ? o.granularity
      : (DEFAULT_GRANULARITY[range] || 'daily');
    var maxPoints = _num(o.maxPoints, MAX_GRID_POINTS);

    var step = _granularityStep(granularity, span);
    var n = Math.floor(span / step);
    if (n > maxPoints) { step = Math.ceil(span / maxPoints); n = maxPoints; }
    if (n < 1) n = 1;

    var start = now - span;
    var grid = [];
    for (var i = 0; i < n; i++) grid.push(start + i * step);
    grid.push(now);                         // guarantee the live anchor slot
    return grid;
  }

  /* ── Quantity timeline ──────────────────────────────────────────────────────
     From an asset's transactions[] ([{type:'buy'|'sell', qty, price, ts}]) builds
     a cumulative step function of units held. qtyAt(t) = Σ buys − Σ sells with
     ts ≤ t (0 before the first transaction). 100% real — no fabrication.        */
  function buildQuantityTimeline(transactions) {
    var txns = _asArray(transactions)
      .filter(function (t) { return t && _isFiniteNum(t.ts) && _isFiniteNum(t.qty); })
      .slice()
      .sort(function (a, b) { return a.ts - b.ts; });
    var points = [];     // [{ts, qty}] cumulative
    var running = 0;
    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      var sign = (t.type === 'sell') ? -1 : 1;
      running += sign * Math.abs(t.qty);
      if (running < 0) running = 0;          // never report a negative position
      points.push({ ts: t.ts, qty: running });
    }
    return {
      points: points,
      firstTs: points.length ? points[0].ts : null,
      at: function (ts) {
        var q = 0;
        for (var j = 0; j < points.length; j++) {
          if (points[j].ts <= ts) q = points[j].qty; else break;
        }
        return q;
      }
    };
  }

  /* ── Cash timeline ──────────────────────────────────────────────────────────
     From wealth-ledger external-capital events (deposit/withdrawal/opening/...
     and trade buy/sell that move a cash balance) builds a per-currency step
     balance. Pure: caller passes the events array. balanceAt(t) sums signed
     amounts with ts ≤ t. Cash is flat between events — the truth (no market).   */
  var CASH_SIGN = { opening: 1, deposit: 1, transfer_in: 1, withdrawal: -1, transfer_out: -1 };
  function buildCashTimeline(events) {
    var evs = _asArray(events)
      .filter(function (e) { return e && _isFiniteNum(e.ts) && CASH_SIGN.hasOwnProperty(e.type); })
      .slice()
      .sort(function (a, b) { return a.ts - b.ts; });
    // Per-currency cumulative points so multi-currency cash is reconstructable.
    var byCcy = {};
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      var ccy = (e.currency || 'USD').toUpperCase();
      var prev = byCcy[ccy] && byCcy[ccy].length ? byCcy[ccy][byCcy[ccy].length - 1].balance : 0;
      var bal = prev + CASH_SIGN[e.type] * Math.abs(_num(e.amount, 0));
      if (bal < 0) bal = 0;
      (byCcy[ccy] = byCcy[ccy] || []).push({ ts: e.ts, balance: bal });
    }
    return {
      byCurrency: byCcy,
      balanceAt: function (ts, ccy) {
        var pts = byCcy[(ccy || 'USD').toUpperCase()] || [];
        var b = 0;
        for (var j = 0; j < pts.length; j++) { if (pts[j].ts <= ts) b = pts[j].balance; else break; }
        return b;
      }
    };
  }

  /* ── Series sampling ────────────────────────────────────────────────────────
     Sample a real price series [{t,v}] (ascending) at time ts.
       mode 'linear' (market prices): linear interpolation strictly BETWEEN real
         samples; returns null before the first sample (never extrapolate a price
         backwards), holds the last real value for ts beyond the last sample.
       mode 'step'   (user-asserted values): last value with t ≤ ts.
     Returns null when there is no honest value to report.                       */
  function sampleSeriesAt(series, ts, mode) {
    var s = _asArray(series);
    if (!s.length) return null;
    if (ts <= s[0].t) return (ts === s[0].t) ? s[0].v : (mode === 'step' ? null : null);
    if (ts >= s[s.length - 1].t) return s[s.length - 1].v;
    // find bracketing samples
    var lo = 0, hi = s.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (s[mid].t <= ts) lo = mid; else hi = mid;
    }
    if (mode === 'step') return s[lo].v;
    var a = s[lo], b = s[hi];
    if (b.t === a.t) return a.v;
    var f = (ts - a.t) / (b.t - a.t);
    return a.v + (b.v - a.v) * f;
  }

  /* ── Confidence classifier ─────────────────────────────────────────────────
     coverage = covered value / total value at a point (0..1).
     hasStatic = some value came from a user-asserted (non-feed) holding.        */
  function classifyConfidence(coverage, hasStatic) {
    if (!_isFiniteNum(coverage) || coverage < 0.5) return CONFIDENCE.INSUFFICIENT;
    if (coverage < 0.999 || hasStatic) return CONFIDENCE.PARTIAL;
    return CONFIDENCE.COMPLETE;
  }

  /* ── Default holding resolver (SELF-TEST ONLY) ───────────────────────────────
     Mirrors app.js `_aurixAssetPickAdapter` so the self-test is self-contained.
     PRODUCTION INJECTS THE REAL RESOLVER — this is never the source of truth.   */
  function defaultResolveHolding(asset) {
    var a = asset || {};
    var tp = String(a.type || '').toLowerCase();
    if (tp === 'cash') return { mode: 'cash' };
    if (tp === 'real_estate') return { mode: 'static' };
    if (tp === 'crypto' && a.coinId) return { mode: 'market', provider: 'crypto', key: String(a.coinId) };
    var sym = a.marketSymbol || a.ticker || '';
    if (tp === 'metal' && (sym === 'XAU' || a.ticker === 'XAU')) sym = 'GC=F';
    if (!sym) return { mode: 'static' };
    return { mode: 'market', provider: 'yahoo', key: String(sym).toUpperCase() };
  }

  /* ── Composition: the net-worth series ───────────────────────────────────────
     PURE. Prices are passed in (priceByKey: { key → [{t,v}] }); no fetching here.
     Inputs:
       grid          : ascending timestamps (from buildGrid)
       holdings      : [{ asset, classification, qtyTimeline, currentValue }]
                       classification = { mode:'market'|'cash'|'static', provider?, key? }
                       currentValue   = live value in BASE currency (for static + anchor)
       priceByKey    : map of provider key → real price series [{t,v}] (BASE ccy)
       cashTimeline  : from buildCashTimeline (optional)
       fxAt(ts)      : function → conversion factor to base ccy (default 1)
       nowValue      : live total (BASE) to anchor the final point (optional)
       baseCurrency  : label only
     Output (fullscreen/crosshair-ready, extensible):
       { series:[{t, v, confidence}], meta:{...}, overlays:[], annotations:[] }   */
  function composeNetWorth(input) {
    var o = input || {};
    var grid = _asArray(o.grid);
    var holdings = _asArray(o.holdings);
    var priceByKey = o.priceByKey || {};
    var fxAt = (typeof o.fxAt === 'function') ? o.fxAt : function () { return 1; };
    var cashTl = o.cashTimeline || null;

    var series = [];
    var anyStaticOverall = false;
    var coverageAccum = 0;

    for (var gi = 0; gi < grid.length; gi++) {
      var t = grid[gi];
      var total = 0, coveredVal = 0, expectedVal = 0, hasStatic = false;

      for (var hi = 0; hi < holdings.length; hi++) {
        var h = holdings[hi];
        var cls = h.classification || { mode: 'static' };

        if (cls.mode === 'cash') {
          // Cash is reconstructed from its timeline if present, else flat current.
          var cv = cashTl
            ? cashTl.balanceAt(t, (h.asset && h.asset.assetCurrency) || 'USD') * fxAt(t)
            : _num(h.currentValue, 0);
          total += cv; coveredVal += cv; expectedVal += cv;
          continue;
        }

        if (cls.mode === 'market' && h.qtyTimeline) {
          var qty = h.qtyTimeline.at(t);
          if (qty <= 0) continue;                       // no position at t → no value
          var px = sampleSeriesAt(priceByKey[cls.key], t, 'linear');
          if (px == null) {
            // Position held but NO real price coverage at t → uncovered. It does
            // not contribute to the drawn value; it only adds to `expectedVal`
            // (weighted by the last-known price) so coverage — and therefore the
            // point's confidence — drops honestly. Never invent the value.
            var lastPx = sampleSeriesAt(priceByKey[cls.key], grid[grid.length - 1], 'linear');
            expectedVal += (lastPx != null) ? qty * lastPx * fxAt(t) : _num(h.currentValue, 0);
            continue;
          }
          // Covered: real value at t. expected == covered (coverage neutral).
          var v = qty * px * fxAt(t);
          total += v; coveredVal += v; expectedVal += v;
          continue;
        }

        // static (real estate, manual / no-feed funds): held flat at current value.
        var sv = _num(h.currentValue, 0);
        total += sv; expectedVal += sv; hasStatic = true; anyStaticOverall = true;
        // static value counts as "covered" in the sense of being known, but its
        // presence downgrades confidence to PARTIAL via hasStatic.
        coveredVal += sv;
      }

      var coverage = expectedVal > 0 ? (coveredVal / expectedVal) : (holdings.length ? 0 : 1);
      coverageAccum += coverage;
      series.push({ t: t, v: +total.toFixed(2), confidence: classifyConfidence(coverage, hasStatic) });
    }

    // Anchor the final point to the live total so the chart end == Hero Card.
    if (_isFiniteNum(o.nowValue) && series.length) {
      series[series.length - 1] = {
        t: series[series.length - 1].t,
        v: +o.nowValue.toFixed(2),
        confidence: series[series.length - 1].confidence
      };
    }

    var avgCoverage = series.length ? (coverageAccum / series.length) : 0;
    var overallConf = classifyConfidence(avgCoverage, anyStaticOverall);
    var first = series.length ? series[0].v : null;
    var last = series.length ? series[series.length - 1].v : null;

    return {
      series: series,
      meta: {
        range: o.range || null,
        granularity: o.granularity || null,
        baseCurrency: o.baseCurrency || null,
        asOf: _num(o.asOf, 0) || null,           // caller stamps the time (engine is deterministic)
        pointCount: series.length,
        coverage: +avgCoverage.toFixed(3),
        confidence: overallConf,
        anchored: _isFiniteNum(o.nowValue),
        firstValue: first,
        lastValue: last,
        deltaAbs: (_isFiniteNum(first) && _isFiniteNum(last)) ? +(last - first).toFixed(2) : null,
        deltaPct: (_isFiniteNum(first) && first > 0 && _isFiniteNum(last)) ? +(((last - first) / first) * 100).toFixed(4) : null,
        source: 'reconstructed'
      },
      // Reserved for fullscreen / advanced analysis (Fase posterior; vacíos hoy).
      overlays: [],
      annotations: []
    };
  }

  /* ── Self-test (deterministic; runnable under node) ─────────────────────────
     `node services/portfolio-chart-engine.js` → PASS/FAIL, exit 1 on failure.   */
  function selfTest() {
    var R = [], ok = true;
    function check(name, cond) { R.push({ name: name, pass: !!cond }); if (!cond) ok = false; }

    // grid: bounded + ends at now + ascending
    var now = 1700000000000;
    var g = buildGrid({ range: '24h', granularity: 'intraday', now: now });
    check('grid non-empty', g.length > 1);
    check('grid capped', g.length <= MAX_GRID_POINTS + 1);
    check('grid ends at now', g[g.length - 1] === now);
    check('grid ascending', g.every(function (t, i) { return i === 0 || t > g[i - 1]; }));

    // quantity timeline: buy 2 @ t1, buy 3 @ t2, sell 1 @ t3
    var qt = buildQuantityTimeline([
      { type: 'buy', qty: 2, price: 10, ts: 100 },
      { type: 'buy', qty: 3, price: 12, ts: 200 },
      { type: 'sell', qty: 1, price: 15, ts: 300 }
    ]);
    check('qty before first = 0', qt.at(50) === 0);
    check('qty after first buy = 2', qt.at(150) === 2);
    check('qty after second buy = 5', qt.at(250) === 5);
    check('qty after sell = 4', qt.at(350) === 4);

    // cash timeline: +1000, -400
    var ct = buildCashTimeline([
      { type: 'deposit', amount: 1000, currency: 'EUR', ts: 100 },
      { type: 'withdrawal', amount: 400, currency: 'EUR', ts: 200 }
    ]);
    check('cash before = 0', ct.balanceAt(50, 'EUR') === 0);
    check('cash mid = 1000', ct.balanceAt(150, 'EUR') === 1000);
    check('cash after = 600', ct.balanceAt(250, 'EUR') === 600);

    // linear sampling between real samples
    var s = [{ t: 0, v: 100 }, { t: 10, v: 200 }];
    check('sample no extrapolation before first', sampleSeriesAt(s, -5, 'linear') === null);
    check('sample linear midpoint', sampleSeriesAt(s, 5, 'linear') === 150);
    check('sample holds last beyond end', sampleSeriesAt(s, 99, 'linear') === 200);
    check('sample step', sampleSeriesAt(s, 7, 'step') === 100);

    // composition: 1 market holding (qty 2 from t=100), price 100→110 over grid
    var grid = [100, 150, 200];
    var comp = composeNetWorth({
      grid: grid,
      range: '24h', granularity: 'intraday', baseCurrency: 'USD', asOf: 200,
      holdings: [{
        asset: { type: 'stock', ticker: 'AAPL' },
        classification: { mode: 'market', provider: 'yahoo', key: 'AAPL' },
        qtyTimeline: buildQuantityTimeline([{ type: 'buy', qty: 2, price: 100, ts: 100 }]),
        currentValue: 220
      }],
      priceByKey: { AAPL: [{ t: 100, v: 100 }, { t: 200, v: 110 }] }
    });
    check('compose point count', comp.series.length === 3);
    check('compose t=100 value = 200', comp.series[0].v === 200);
    check('compose t=150 value = 210 (linear 105×2)', comp.series[1].v === 210);
    check('compose t=200 value = 220', comp.series[2].v === 220);
    check('compose complete confidence', comp.meta.confidence === CONFIDENCE.COMPLETE);
    check('compose deltaPct = 10', comp.meta.deltaPct === 10);
    check('output has reserved overlays/annotations', Array.isArray(comp.overlays) && Array.isArray(comp.annotations));

    // anchor: final point forced to live total
    var comp2 = composeNetWorth({
      grid: [100, 200], range: '24h',
      holdings: [{ asset: { type: 'stock', ticker: 'X' }, classification: { mode: 'market', key: 'X' },
        qtyTimeline: buildQuantityTimeline([{ type: 'buy', qty: 1, price: 50, ts: 100 }]), currentValue: 70 }],
      priceByKey: { X: [{ t: 100, v: 50 }, { t: 200, v: 60 }] },
      nowValue: 999
    });
    check('anchor overrides last point', comp2.series[comp2.series.length - 1].v === 999 && comp2.meta.anchored === true);

    // static holding → partial confidence, no invented movement
    var comp3 = composeNetWorth({
      grid: [100, 200], range: '30d',
      holdings: [{ asset: { type: 'real_estate' }, classification: { mode: 'static' }, currentValue: 300000 }]
    });
    check('static flat both points', comp3.series[0].v === 300000 && comp3.series[1].v === 300000);
    check('static → partial', comp3.meta.confidence === CONFIDENCE.PARTIAL);

    try {
      console.log('%c[AurixPCE] self-test ' + (ok ? 'PASS' : 'FAIL'),
        'color:' + (ok ? '#27c768' : '#e0664a') + ';font-weight:700',
        R.filter(function (r) { return !r.pass; }));
    } catch (_) {
      // node console (no CSS)
      console.log('[AurixPCE] self-test ' + (ok ? 'PASS' : 'FAIL'));
      if (!ok) console.log(R.filter(function (r) { return !r.pass; }));
    }
    return { pass: ok, results: R };
  }

  /* ── Public namespace (frozen; pure functions only) ─────────────────────── */
  global.AurixPortfolioEngine = Object.freeze({
    version: 1,
    CONFIDENCE: CONFIDENCE,
    GRANULARITY: GRANULARITY.slice(),
    DEFAULT_GRANULARITY: DEFAULT_GRANULARITY,
    buildGrid: buildGrid,
    buildQuantityTimeline: buildQuantityTimeline,
    buildCashTimeline: buildCashTimeline,
    sampleSeriesAt: sampleSeriesAt,
    classifyConfidence: classifyConfidence,
    composeNetWorth: composeNetWorth,
    defaultResolveHolding: defaultResolveHolding,   // self-test / fallback only
    selfTest: selfTest
  });

  // Node: run the self-test immediately so `node <file>` validates the core.
  // Browser: NEVER auto-runs (and in Fase A the file is not even loaded).
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var r = selfTest();
    if (!r.pass && typeof process.exit === 'function') process.exit(1);
  }

})(typeof window !== 'undefined' ? window : this);
