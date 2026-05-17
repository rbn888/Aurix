/* ─────────────────────────────────────────────────────────────────
   AurixChartCore — CHART-2 isolated prototype.

   ONE chart engine, MANY surfaces (future). Today: prototype only.

   Public API (attached to window.AurixCharts):
     createChart(container, options) → controller
     createSparkline(container, options) → controller    // sugar for variant: 'sparkline'
     createMockSeries(opts) → AurixSeries
     mountDemo() / destroyDemo()
     isReady() → boolean   (LightweightCharts loaded?)

   Controller contract:
     setData(series, meta?) | setRange(range) | setCurrency(currency)
     setState(state)        | resize()        | destroy()

   No production surface is touched by this module. The legacy Chart.js
   instances and SVG sparklines continue to render as before.
   ───────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── Theme tokens ────────────────────────────────────────────────
  const THEME = Object.freeze({
    bg:        'transparent',
    text:      'rgba(220, 230, 250, 0.42)',
    textHi:    'rgba(225, 233, 255, 0.92)',
    line:      'rgba(138, 166, 255, 0.95)',          // Aurix blue
    lineUp:    'rgba(63, 191, 127, 0.95)',
    lineDown:  'rgba(224, 90, 90, 0.95)',
    areaTop:   'rgba(138, 166, 255, 0.28)',
    areaBot:   'rgba(138, 166, 255, 0.00)',
    areaTopUp: 'rgba(63, 191, 127, 0.22)',
    areaTopDn: 'rgba(224, 90, 90, 0.22)',
    grid:      'rgba(255, 255, 255, 0.035)',
    crosshair: 'rgba(138, 166, 255, 0.40)',
    border:    'rgba(255, 255, 255, 0.06)',
  });

  // ── Internal state ──────────────────────────────────────────────
  const _instances = new Set();
  let _stylesInjected = false;
  let _libLoadWarned  = false;

  function _isLangEs() {
    try {
      return (typeof lang !== 'undefined' && lang === 'es')
          || String(document.documentElement.lang || '').toLowerCase().startsWith('es');
    } catch (_) { return false; }
  }

  function _isReady() {
    return typeof window !== 'undefined'
        && typeof window.LightweightCharts === 'object'
        && typeof window.LightweightCharts.createChart === 'function';
  }

  // ── Inject scoped styles for chart chrome (states, badges, etc.).
  //    Self-contained inside this module so the engine is genuinely
  //    isolated — no styles.css edits.
  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const css = `
      .aurix-chart-host { position: relative; width: 100%; min-height: 0; overflow: hidden; }
      .aurix-chart-host[data-variant="sparkline"] { min-height: 0; }
      .aurix-chart-canvas { position: absolute; inset: 0; }
      .aurix-chart-state {
        position: absolute; inset: 0;
        display: none;
        align-items: center; justify-content: center;
        pointer-events: none;
        font-family: inherit;
        font-size: 12.5px;
        color: rgba(220,230,250,0.55);
        letter-spacing: 0.005em;
        text-align: center;
        padding: 12px;
      }
      .aurix-chart-host[data-state="loading"] .aurix-chart-state--loading,
      .aurix-chart-host[data-state="empty"]   .aurix-chart-state--empty,
      .aurix-chart-host[data-state="error"]   .aurix-chart-state--error {
        display: flex;
      }
      .aurix-chart-host[data-state="loading"] .aurix-chart-canvas,
      .aurix-chart-host[data-state="empty"]   .aurix-chart-canvas,
      .aurix-chart-host[data-state="error"]   .aurix-chart-canvas {
        opacity: 0.0;
      }
      .aurix-chart-skeleton {
        width: 80%;
        height: 60%;
        border-radius: 8px;
        background: linear-gradient(
          90deg,
          rgba(255,255,255,0.03) 0%,
          rgba(138,166,255,0.06) 50%,
          rgba(255,255,255,0.03) 100%
        );
        background-size: 200% 100%;
        animation: aurix-chart-shimmer 1.4s linear infinite;
      }
      @keyframes aurix-chart-shimmer {
        from { background-position: 200% 0; }
        to   { background-position: -200% 0; }
      }
      .aurix-chart-badge {
        position: absolute;
        top: 8px; right: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(225,233,255,0.78);
        background: rgba(138,166,255,0.10);
        border: 1px solid rgba(138,166,255,0.22);
        pointer-events: none;
      }
      .aurix-chart-badge[hidden] { display: none; }
      .aurix-chart-tooltip {
        position: absolute;
        pointer-events: none;
        z-index: 4;
        min-width: 100px;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(14,18,28,0.92);
        border: 1px solid rgba(255,255,255,0.07);
        box-shadow: 0 12px 28px -16px rgba(4,8,16,0.85);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        font-family: inherit;
        font-size: 12px;
        color: rgba(225,233,255,0.92);
        opacity: 0;
        transform: translate(-50%, -100%) translateY(-8px);
        transition: opacity 0.12s ease;
      }
      .aurix-chart-tooltip[data-visible="true"] { opacity: 1; }
      .aurix-chart-tooltip-time {
        font-size: 10.5px;
        color: rgba(220,230,250,0.55);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 2px;
      }
      .aurix-chart-tooltip-value {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: -0.005em;
        font-variant-numeric: tabular-nums;
      }
      .aurix-chart-tooltip-value.is-up   { color: #3FBF7F; }
      .aurix-chart-tooltip-value.is-down { color: #E05A5A; }
      .aurix-chart-ranges {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
      }
      .aurix-chart-range {
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: rgba(220,230,250,0.6);
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 999px;
        cursor: pointer;
        font-family: inherit;
        transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      }
      .aurix-chart-range:hover {
        color: rgba(225,233,255,0.92);
        border-color: rgba(138,166,255,0.22);
        background: rgba(138,166,255,0.06);
      }
      .aurix-chart-range[aria-pressed="true"] {
        color: #fff;
        border-color: rgba(138,166,255,0.45);
        background: rgba(138,166,255,0.14);
      }
      .aurix-chart-sandbox {
        display: grid;
        grid-template-columns: 1fr;
        gap: 22px;
        padding: 22px;
        background: rgba(8,12,20,0.92);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 18px;
        color: rgba(225,233,255,0.92);
      }
      .aurix-chart-sandbox h4 {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(220,230,250,0.55);
        margin-bottom: 10px;
      }
      .aurix-chart-sandbox .demo-card {
        padding: 16px;
        border-radius: 14px;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.05);
      }
      .aurix-chart-sandbox .demo-row {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .aurix-chart-sandbox .demo-row .demo-card { flex: 1; }
    `;
    const style = document.createElement('style');
    style.dataset.aurixChartCore = '1';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Mock series generator (CHART-2 only) ───────────────────────
  // Deterministic-ish random walk; intentionally NOT a hard seed so
  // each call shows a slightly different shape. No business logic.
  function createMockSeries(opts) {
    const o = opts || {};
    const range  = o.range  || '7d';
    const trend  = (typeof o.trend === 'number') ? o.trend : 0.0008;
    const base   = (typeof o.base  === 'number') ? o.base  : 18450;
    const points = ({ '24h': 96, '7d': 168, '30d': 180, '3m': 180, '1y': 220, 'all': 250 })[range] || 168;
    const spanMs = ({ '24h': 24*3600e3, '7d': 7*86400e3, '30d': 30*86400e3, '3m': 90*86400e3, '1y': 365*86400e3, 'all': 730*86400e3 })[range] || 7*86400e3;
    const now    = Date.now();
    const step   = spanMs / points;
    let v = base;
    const series = [];
    for (let i = 0; i < points; i++) {
      const t = now - spanMs + i * step;
      const drift  = (Math.random() - 0.48) * base * 0.006;
      const trendy = base * trend * i;
      v = Math.max(1, v + drift + trendy * 0.02);
      series.push({ time: t, value: +v.toFixed(2) });
    }
    return {
      series,
      meta: {
        source: 'mock',
        currency: 'USD',
        asOf: now,
        granularity: range === '24h' ? '15m' : '1h',
        isSynthetic: true,
        completeness: 1,
      },
    };
  }

  // ── Internal helpers ───────────────────────────────────────────
  function _msToSec(ms) { return Math.floor(ms / 1000); }

  function _formatTooltipTime(ms, range) {
    try {
      const d = new Date(ms);
      const esLocale = _isLangEs() ? 'es-ES' : 'en-US';
      if (range === '24h') {
        return d.toLocaleTimeString(esLocale, { hour: '2-digit', minute: '2-digit' });
      }
      if (range === '7d') {
        return d.toLocaleDateString(esLocale, { weekday: 'short', day: '2-digit' });
      }
      return d.toLocaleDateString(esLocale, { day: '2-digit', month: 'short' });
    } catch (_) { return ''; }
  }

  function _formatTooltipValue(value, currency) {
    try {
      const locale = _isLangEs() ? 'es-ES' : 'en-US';
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch (_) { return String(value); }
  }

  // ── Chart factory ──────────────────────────────────────────────
  function createChart(container, options) {
    _injectStyles();
    const opts = Object.assign({
      variant:        'portfolio',  // 'portfolio' | 'asset' | 'sparkline' | 'mini'
      height:         null,
      currency:       'USD',
      showTooltip:    true,
      showCrosshair:  true,
      showTimeScale:  true,
      showPriceScale: true,
      colorMode:      'auto',       // 'auto' | 'positive' | 'negative' | 'neutral'
      compact:        false,
      range:          '7d',
    }, options || {});

    if (!container || !(container instanceof HTMLElement)) {
      throw new Error('AurixCharts.createChart: container element required');
    }
    if (opts.variant === 'sparkline' || opts.variant === 'mini') {
      opts.showTooltip    = !!options?.showTooltip;
      opts.showCrosshair  = !!options?.showCrosshair;
      opts.showTimeScale  = false;
      opts.showPriceScale = false;
    }

    // Host element wraps both the chart canvas and the state overlays.
    const host = document.createElement('div');
    host.className = 'aurix-chart-host';
    host.dataset.variant = opts.variant;
    host.dataset.state   = 'loading';
    if (opts.height) host.style.height = opts.height + 'px';
    else if (opts.variant === 'sparkline') host.style.height = '32px';
    else if (opts.variant === 'mini')      host.style.height = '64px';
    else                                    host.style.height = '240px';

    const canvasHolder = document.createElement('div');
    canvasHolder.className = 'aurix-chart-canvas';
    host.appendChild(canvasHolder);

    const tooltip = document.createElement('div');
    tooltip.className = 'aurix-chart-tooltip';
    tooltip.innerHTML = '<div class="aurix-chart-tooltip-time"></div><div class="aurix-chart-tooltip-value"></div>';
    if (opts.showTooltip) host.appendChild(tooltip);

    const badge = document.createElement('div');
    badge.className = 'aurix-chart-badge';
    badge.hidden = true;
    host.appendChild(badge);

    const loading = document.createElement('div');
    loading.className = 'aurix-chart-state aurix-chart-state--loading';
    loading.innerHTML = '<div class="aurix-chart-skeleton"></div>';
    host.appendChild(loading);

    const empty = document.createElement('div');
    empty.className = 'aurix-chart-state aurix-chart-state--empty';
    empty.textContent = _isLangEs() ? 'Sin datos disponibles' : 'No data available';
    host.appendChild(empty);

    const errorEl = document.createElement('div');
    errorEl.className = 'aurix-chart-state aurix-chart-state--error';
    errorEl.textContent = _isLangEs() ? 'No se pudo cargar el gráfico' : 'Chart could not be loaded';
    host.appendChild(errorEl);

    container.appendChild(host);

    // Bail out gracefully if the library never loaded — the consumer
    // still gets a controller with a sane API, but the surface shows
    // the error state and console.warn fires exactly once.
    if (!_isReady()) {
      if (!_libLoadWarned) {
        _libLoadWarned = true;
        console.warn('[AurixCharts] LightweightCharts not loaded — engine running in fallback (state=error).');
      }
      host.dataset.state = 'error';
      const controller = {
        host,
        setData: () => {},
        setRange: () => {},
        setCurrency: () => {},
        setState: (s) => { if (s) host.dataset.state = s; },
        resize: () => {},
        destroy: () => {
          if (host.parentNode) host.parentNode.removeChild(host);
          _instances.delete(controller);
        },
      };
      _instances.add(controller);
      return controller;
    }

    // ── Build the Lightweight Charts instance ───────────────────
    const LWC = window.LightweightCharts;
    const chart = LWC.createChart(canvasHolder, {
      width:  canvasHolder.clientWidth  || 320,
      height: canvasHolder.clientHeight || 240,
      layout: {
        background: { type: 'solid', color: 'rgba(0,0,0,0)' },
        textColor:  THEME.text,
        fontFamily: 'inherit',
        fontSize:   11,
      },
      grid: {
        vertLines: { color: opts.showPriceScale ? THEME.grid : 'rgba(0,0,0,0)' },
        horzLines: { color: opts.showPriceScale ? THEME.grid : 'rgba(0,0,0,0)' },
      },
      rightPriceScale: {
        visible: !!opts.showPriceScale,
        borderVisible: false,
        scaleMargins: { top: 0.10, bottom: 0.04 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: !!opts.showTimeScale,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: opts.showCrosshair
        ? {
            mode: LWC.CrosshairMode ? LWC.CrosshairMode.Magnet : 1,
            vertLine: { color: THEME.crosshair, style: 2, width: 1, labelVisible: false },
            horzLine: { color: THEME.crosshair, style: 2, width: 1, labelVisible: false },
          }
        : { mode: 0 },
      handleScroll: opts.variant === 'sparkline' ? false : true,
      handleScale:  opts.variant === 'sparkline' ? false : true,
    });

    const series = chart.addAreaSeries({
      lineColor:       THEME.line,
      lineWidth:       2,
      topColor:        THEME.areaTop,
      bottomColor:     THEME.areaBot,
      priceLineVisible: false,
      lastValueVisible: opts.variant !== 'sparkline',
      crosshairMarkerVisible: opts.variant !== 'sparkline',
      crosshairMarkerRadius:  3,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Apply colorMode shading at series level.
    function _applyColor(mode) {
      if (mode === 'positive')      series.applyOptions({ lineColor: THEME.lineUp,   topColor: THEME.areaTopUp, bottomColor: THEME.areaBot });
      else if (mode === 'negative') series.applyOptions({ lineColor: THEME.lineDown, topColor: THEME.areaTopDn, bottomColor: THEME.areaBot });
      else                          series.applyOptions({ lineColor: THEME.line,    topColor: THEME.areaTop,   bottomColor: THEME.areaBot });
    }
    if (opts.colorMode && opts.colorMode !== 'auto') _applyColor(opts.colorMode);

    // ── Tooltip wiring ──────────────────────────────────────────
    let _state = {
      currency: opts.currency,
      range:    opts.range,
      data:     [],
      meta:     null,
    };

    if (opts.showTooltip && opts.showCrosshair) {
      const timeEl  = tooltip.querySelector('.aurix-chart-tooltip-time');
      const valEl   = tooltip.querySelector('.aurix-chart-tooltip-value');
      chart.subscribeCrosshairMove(param => {
        if (!param || !param.point || !param.time || !param.seriesData?.size) {
          tooltip.dataset.visible = 'false';
          return;
        }
        const data = param.seriesData.get(series);
        if (!data || typeof data.value !== 'number') {
          tooltip.dataset.visible = 'false';
          return;
        }
        const ms = (typeof param.time === 'number' ? param.time * 1000 : Date.parse(param.time));
        timeEl.textContent = _formatTooltipTime(ms, _state.range);
        valEl.textContent  = _formatTooltipValue(data.value, _state.currency);
        // Direction class — derive vs first visible point.
        const first = _state.data[0]?.value;
        const dir   = first == null ? 'flat' : (data.value > first ? 'up' : (data.value < first ? 'down' : 'flat'));
        valEl.classList.toggle('is-up',   dir === 'up');
        valEl.classList.toggle('is-down', dir === 'down');
        // Position
        const x = param.point.x;
        const y = param.point.y;
        const hostRect = host.getBoundingClientRect();
        const ttW = tooltip.offsetWidth  || 120;
        let left = Math.max(ttW / 2 + 6, Math.min(hostRect.width - ttW / 2 - 6, x));
        let top  = Math.max(0, y);
        tooltip.style.left = left + 'px';
        tooltip.style.top  = top  + 'px';
        tooltip.dataset.visible = 'true';
      });
    }

    // ── ResizeObserver (responsive sizing) ─────────────────────
    let _ro = null;
    if (typeof ResizeObserver === 'function') {
      _ro = new ResizeObserver(() => {
        const w = canvasHolder.clientWidth  || 0;
        const h = canvasHolder.clientHeight || 0;
        if (w && h) chart.applyOptions({ width: w, height: h });
      });
      _ro.observe(canvasHolder);
    }

    // ── Controller ──────────────────────────────────────────────
    const controller = {
      host,
      setData(seriesData, meta) {
        const arr = Array.isArray(seriesData) ? seriesData : [];
        if (!arr.length) {
          host.dataset.state = 'empty';
          series.setData([]);
          return;
        }
        // Lightweight Charts wants UTC seconds + ascending order.
        const formatted = arr
          .filter(p => p && typeof p.value === 'number' && Number.isFinite(p.value))
          .map(p => ({ time: _msToSec(p.time), value: p.value }))
          .sort((a, b) => a.time - b.time);
        if (!formatted.length) {
          host.dataset.state = 'empty';
          series.setData([]);
          return;
        }
        // Dedupe identical timestamps (LWC requires strictly ascending).
        const deduped = [];
        let lastT = -1;
        for (const p of formatted) {
          if (p.time === lastT) continue;
          deduped.push(p);
          lastT = p.time;
        }
        series.setData(deduped);
        if (opts.colorMode === 'auto') {
          const first = deduped[0].value;
          const last  = deduped[deduped.length - 1].value;
          _applyColor(last >= first ? 'positive' : 'negative');
        }
        _state.data = arr;
        _state.meta = meta || null;
        // Synthetic badge
        if (meta && meta.isSynthetic) {
          badge.hidden = false;
          badge.textContent = _isLangEs() ? 'Estimación' : 'Estimate';
        } else {
          badge.hidden = true;
        }
        host.dataset.state = 'ready';
        try { chart.timeScale().fitContent(); } catch (_) {}
      },
      setRange(range) {
        _state.range = String(range || '7d');
      },
      setCurrency(currency) {
        _state.currency = String(currency || 'USD').toUpperCase();
      },
      setState(state) {
        const valid = new Set(['loading', 'empty', 'error', 'ready']);
        if (valid.has(state)) host.dataset.state = state;
      },
      resize() {
        const w = canvasHolder.clientWidth  || 0;
        const h = canvasHolder.clientHeight || 0;
        if (w && h) chart.applyOptions({ width: w, height: h });
      },
      destroy() {
        try { if (_ro) _ro.disconnect(); } catch (_) {}
        try { chart.remove(); } catch (_) {}
        if (host.parentNode) host.parentNode.removeChild(host);
        _instances.delete(controller);
      },
    };
    _instances.add(controller);
    return controller;
  }

  function createSparkline(container, options) {
    return createChart(container, Object.assign({}, options || {}, {
      variant: 'sparkline',
      showTimeScale: false,
      showPriceScale: false,
      showTooltip: !!(options && options.showTooltip),
      showCrosshair: !!(options && options.showCrosshair),
      height: (options && options.height) || 32,
    }));
  }

  // ── Range pills (optional, reusable) ───────────────────────────
  function createRangePills(container, opts) {
    _injectStyles();
    const o = Object.assign({
      ranges:  ['1D', '1W', '1M', '3M', '1Y', 'ALL'],
      initial: '1W',
      onChange: () => {},
    }, opts || {});
    const wrap = document.createElement('div');
    wrap.className = 'aurix-chart-ranges';
    wrap.setAttribute('role', 'tablist');
    const buttons = o.ranges.map(label => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'aurix-chart-range';
      b.textContent = label;
      b.setAttribute('aria-pressed', label === o.initial ? 'true' : 'false');
      b.addEventListener('click', () => {
        buttons.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        try { o.onChange(label); } catch (_) {}
      });
      wrap.appendChild(b);
      return b;
    });
    container.appendChild(wrap);
    return {
      destroy() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); },
    };
  }

  // ── Demo / sandbox ─────────────────────────────────────────────
  let _demo = null;

  function mountDemo() {
    if (_demo) return _demo;
    _injectStyles();
    let sandbox = document.getElementById('aurixChartSandbox');
    if (!sandbox) {
      sandbox = document.createElement('div');
      sandbox.id = 'aurixChartSandbox';
      sandbox.className = 'aurix-chart-sandbox';
      sandbox.style.position = 'fixed';
      sandbox.style.right = '16px';
      sandbox.style.top   = '16px';
      sandbox.style.width = 'min(420px, calc(100vw - 32px))';
      sandbox.style.maxHeight = 'calc(100vh - 32px)';
      sandbox.style.overflowY = 'auto';
      sandbox.style.zIndex = '99999';
      sandbox.style.boxShadow = '0 24px 48px -24px rgba(4,8,16,0.95)';
      document.body.appendChild(sandbox);
    }
    sandbox.style.display = 'grid';
    sandbox.innerHTML = `
      <div>
        <button type="button" id="aurixDemoClose"
          style="float:right;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(225,233,255,0.85);cursor:pointer;font-family:inherit;font-size:12px;">
          Close
        </button>
        <h4 style="margin-right:60px;">Aurix Chart Sandbox</h4>
      </div>
      <div class="demo-card">
        <h4>Portfolio variant</h4>
        <div id="aurixDemoRangesHost"></div>
        <div id="aurixDemoPortfolio" style="height: 240px;"></div>
      </div>
      <div class="demo-card">
        <h4>Asset variant</h4>
        <div id="aurixDemoAsset" style="height: 220px;"></div>
      </div>
      <div class="demo-row">
        <div class="demo-card">
          <h4>Sparkline</h4>
          <div id="aurixDemoSparkline" style="height: 32px;"></div>
        </div>
        <div class="demo-card">
          <h4>Mini</h4>
          <div id="aurixDemoMini" style="height: 64px;"></div>
        </div>
      </div>
      <div class="demo-row">
        <div class="demo-card">
          <h4>Loading state</h4>
          <div id="aurixDemoLoading" style="height: 120px;"></div>
        </div>
        <div class="demo-card">
          <h4>Empty state</h4>
          <div id="aurixDemoEmpty" style="height: 120px;"></div>
        </div>
      </div>
      <div class="demo-card">
        <h4>Error state</h4>
        <div id="aurixDemoError" style="height: 120px;"></div>
      </div>
    `;

    // Build the demo charts.
    const portfolioMock = createMockSeries({ range: '7d', trend: 0.0010 });
    const assetMock     = createMockSeries({ range: '30d', base: 218, trend: -0.0006 });
    const sparkMock     = createMockSeries({ range: '24h', base: 100, trend: 0.0003 });
    const miniMock      = createMockSeries({ range: '7d', base: 64.50 });

    const portfolio = createChart(document.getElementById('aurixDemoPortfolio'), {
      variant: 'portfolio', height: 240, colorMode: 'auto', range: '1W',
    });
    portfolio.setData(portfolioMock.series, portfolioMock.meta);

    const asset = createChart(document.getElementById('aurixDemoAsset'), {
      variant: 'asset', height: 220, colorMode: 'auto', range: '1M',
    });
    asset.setData(assetMock.series, assetMock.meta);

    const ranges = createRangePills(document.getElementById('aurixDemoRangesHost'), {
      initial: '1W',
      onChange(label) {
        const map = { '1D': '24h', '1W': '7d', '1M': '30d', '3M': '3m', '1Y': '1y', 'ALL': 'all' };
        const r = map[label] || '7d';
        const fresh = createMockSeries({ range: r });
        portfolio.setRange(r);
        portfolio.setData(fresh.series, fresh.meta);
      },
    });

    const sparkline = createSparkline(document.getElementById('aurixDemoSparkline'), {
      colorMode: 'positive',
    });
    sparkline.setData(sparkMock.series, sparkMock.meta);

    const mini = createChart(document.getElementById('aurixDemoMini'), {
      variant: 'mini', height: 64, colorMode: 'auto',
    });
    mini.setData(miniMock.series, miniMock.meta);

    const loading = createChart(document.getElementById('aurixDemoLoading'), {
      variant: 'asset', height: 120, showTimeScale: false, showPriceScale: false,
    });
    loading.setState('loading');

    const emptyChart = createChart(document.getElementById('aurixDemoEmpty'), {
      variant: 'asset', height: 120, showTimeScale: false, showPriceScale: false,
    });
    emptyChart.setData([]);

    const errorChart = createChart(document.getElementById('aurixDemoError'), {
      variant: 'asset', height: 120, showTimeScale: false, showPriceScale: false,
    });
    errorChart.setState('error');

    const closeBtn = document.getElementById('aurixDemoClose');
    if (closeBtn) closeBtn.addEventListener('click', destroyDemo);

    _demo = {
      sandbox,
      controllers: [portfolio, asset, sparkline, mini, loading, emptyChart, errorChart],
      ranges,
    };
    return _demo;
  }

  function destroyDemo() {
    if (!_demo) return;
    try { _demo.controllers.forEach(c => { try { c.destroy(); } catch (_) {} }); } catch (_) {}
    try { _demo.ranges && _demo.ranges.destroy(); } catch (_) {}
    if (_demo.sandbox && _demo.sandbox.parentNode) {
      _demo.sandbox.parentNode.removeChild(_demo.sandbox);
    }
    _demo = null;
  }

  function destroyAll() {
    _instances.forEach(c => { try { c.destroy(); } catch (_) {} });
    _instances.clear();
    destroyDemo();
  }

  // ── Public surface ─────────────────────────────────────────────
  window.AurixCharts = Object.freeze({
    isReady:          _isReady,
    createChart,
    createSparkline,
    createRangePills,
    createMockSeries,
    mountDemo,
    destroyDemo,
    destroyAll,
    THEME,
  });
})();
