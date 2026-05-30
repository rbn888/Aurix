/* ============================================================
   AURIX landing — i18n (ES/EN), header, mobile menu, reveal,
   early-access placeholder. Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  /* ── Translations ───────────────────────────────────── */
  var I18N = {
    es: {
      'nav.product': 'Producto', 'nav.workspace': 'Workspace', 'nav.roadmap': 'Roadmap', 'nav.early': 'Acceso anticipado',
      'cta.enter': 'Entrar en Aurix', 'cta.request': 'Solicitar acceso',

      'hero.eyebrow': 'Sistema privado de patrimonio',
      'hero.h1a': 'Todo tu patrimonio.',
      'hero.h1b': 'Un solo sistema operativo.',
      'hero.sub': 'Aurix reúne acciones, fondos, cripto, metales, inmuebles y liquidez en una interfaz clara y privada.',
      'preview.label': 'Vista previa del producto',
      'mock.total': 'Patrimonio total', 'mock.value': '4,82 M€', 'mock.delta': '+8,4% YTD',
      'mock.health': 'Salud de cartera', 'mock.health.v': 'Sólida',
      'mock.risk': 'Riesgo', 'mock.risk.v': 'Equilibrado',

      'problem.title': 'Tu patrimonio está fragmentado.',
      'problem.lead': 'Repartido entre bancos, brókers y aplicaciones que no se hablan entre sí.',
      'frag.banks.t': 'Bancos', 'frag.banks.d': 'efectivo y depósitos',
      'frag.brokers.t': 'Brókers', 'frag.brokers.d': 'acciones, ETFs y fondos',
      'frag.crypto.t': 'Cripto', 'frag.crypto.d': 'activos digitales',
      'frag.realestate.t': 'Inmuebles', 'frag.realestate.d': 'asignación inmobiliaria',
      'frag.metals.t': 'Metales', 'frag.metals.d': 'oro y metales preciosos',
      'frag.cash.t': 'Liquidez', 'frag.cash.d': 'posición disponible',
      'pain.1.t': 'Sin visibilidad', 'pain.1.d': 'Nunca ves el total real de lo que tienes.',
      'pain.2.t': 'Sin claridad', 'pain.2.d': 'No sabes cómo está repartido tu patrimonio.',
      'pain.3.t': 'Sin contexto', 'pain.3.d': 'Los números no te dicen qué significan.',

      'solution.title': 'Una única visión.',
      'solution.lead': 'Aurix centraliza cada clase de activo en una sola interfaz, con el contexto que necesitas para decidir.',
      'asset.stocks': 'Acciones', 'asset.etfs': 'ETFs', 'asset.funds': 'Fondos', 'asset.crypto': 'Cripto',
      'asset.metals': 'Metales', 'asset.realestate': 'Inmuebles', 'asset.cash': 'Liquidez',
      'feat.value.t': 'Valor total', 'feat.value.d': 'Unificado entre todas tus clases de activo.',
      'feat.alloc.t': 'Asignación', 'feat.alloc.d': 'Cómo está repartido entre clases de activo.',
      'feat.evo.t': 'Evolución', 'feat.evo.d': 'El recorrido de tu patrimonio en el tiempo.',
      'feat.health.t': 'Salud de cartera', 'feat.health.d': 'Concentración, liquidez y riesgo, interpretados.',
      'feat.insights.t': 'Insights', 'feat.insights.d': 'Observaciones claras sobre tu estructura.',
      'feat.intel.t': 'Inteligencia', 'feat.intel.d': 'Contexto, no solo cifras.',

      'trust.label': 'Unificado en',
      'show.title': 'Diseñado como un producto premium.',
      'show.lead': 'Una experiencia clara, institucional y rápida.',

      'ws.eyebrow': 'Workspace',
      'ws.title1': 'Más que seguimiento.', 'ws.title2': 'Comprensión.',
      'ws.lead': 'La capa de inteligencia de Aurix. Workspace interpreta tu cartera y te ayuda a entender qué hay detrás de los números.',
      'ws.tag.health': 'Health Score', 'ws.tag.risk': 'Señales de riesgo', 'ws.tag.analysis': 'Análisis de cartera', 'ws.tag.actions': 'Insights accionables',
      'ws.c1.t': 'Concentración', 'ws.c1.d': 'Detecta cuándo un activo pesa demasiado.',
      'ws.c2.t': 'Diversificación', 'ws.c2.d': 'Entiende el reparto real entre clases.',
      'ws.c3.t': 'Liquidez', 'ws.c3.d': 'Cuánto podrías mover sin fricción.',
      'ws.c4.t': 'Riesgo', 'ws.c4.d': 'Exposición interpretada, no solo medida.',
      'ws.c5.t': 'Salud de cartera', 'ws.c5.d': 'Una lectura única del estado de tu patrimonio.',
      'ws.c6.t': 'Insights', 'ws.c6.d': 'Observaciones claras y accionables.',
      'ws.c7.t': 'Inteligencia', 'ws.c7.d': 'Contexto sobre tu estructura, no solo cifras.',

      'roadmap.title': 'Hacia dónde va Aurix.',
      'roadmap.now': 'Ahora', 'roadmap.next': 'Próximo', 'roadmap.later': 'Después',
      'rm.now.1': 'Dashboard de patrimonio', 'rm.now.2': 'Inteligencia de asignación', 'rm.now.3': 'Seguimiento de mercado', 'rm.now.4': 'Workspace',
      'rm.next.1': 'Métricas avanzadas', 'rm.next.2': 'Salud de cartera ampliada', 'rm.next.3': 'Seguimiento de objetivos', 'rm.next.4': 'Planificación patrimonial',
      'rm.later.1': 'App nativa iOS', 'rm.later.2': 'App nativa Android', 'rm.later.3': 'Insights asistidos por IA', 'rm.later.4': 'Capa de automatización',

      'early.eyebrow': 'Beta privada',
      'early.title': 'Solo por invitación.',
      'early.sub': 'Aurix está disponible actualmente para un número limitado de usuarios.',
      'early.name': 'Nombre', 'early.email': 'Email', 'early.button': 'Solicitar acceso',
      'early.note': 'No compartiremos tu información. Beta privada · plazas limitadas.',
      'early.invalid': 'Revisa tu nombre y un email válido.',
      'early.success': 'Solicitud recibida. Te contactaremos pronto.',
      'early.trust': 'Acceso por invitación · Sin promesas financieras',
      'modal.title': 'Solicita acceso privado.',
      'modal.sub': 'Déjanos tus datos y contactaremos con usuarios seleccionados.',
      'footer.tag': 'Private Wealth OS',
      'footer.product': 'Producto', 'footer.legal': 'Legal', 'footer.privacy': 'Privacidad', 'footer.terms': 'Términos', 'footer.social': 'Social',
      'meta.title': 'Aurix — El sistema operativo de tu patrimonio',
      'meta.desc': 'Controla, entiende y gestiona todo tu patrimonio — acciones, fondos, cripto, inmuebles, metales y liquidez — desde una sola plataforma.'
    },
    en: {
      'nav.product': 'Product', 'nav.workspace': 'Workspace', 'nav.roadmap': 'Roadmap', 'nav.early': 'Early Access',
      'cta.enter': 'Enter Aurix', 'cta.request': 'Request Access',

      'hero.eyebrow': 'Private Wealth OS',
      'hero.h1a': 'Your entire wealth.',
      'hero.h1b': 'One operating system.',
      'hero.sub': 'Aurix brings stocks, funds, crypto, metals, real estate and cash into one clear, private interface.',
      'preview.label': 'Product preview',
      'mock.total': 'Total Wealth', 'mock.value': '$4.82M', 'mock.delta': '+8.4% YTD',
      'mock.health': 'Health Score', 'mock.health.v': 'Strong',
      'mock.risk': 'Risk', 'mock.risk.v': 'Balanced',

      'problem.title': 'Your wealth is fragmented.',
      'problem.lead': 'Spread across banks, brokers and apps that never talk to each other.',
      'frag.banks.t': 'Banks', 'frag.banks.d': 'Cash and deposits',
      'frag.brokers.t': 'Brokers', 'frag.brokers.d': 'Stocks, ETFs and funds',
      'frag.crypto.t': 'Crypto', 'frag.crypto.d': 'Digital assets',
      'frag.realestate.t': 'Real Estate', 'frag.realestate.d': 'Property allocation',
      'frag.metals.t': 'Metals', 'frag.metals.d': 'Gold and precious metals',
      'frag.cash.t': 'Cash', 'frag.cash.d': 'Liquidity position',
      'pain.1.t': 'No visibility', 'pain.1.d': 'You never see the real total of what you own.',
      'pain.2.t': 'No clarity', 'pain.2.d': 'You don’t know how your wealth is allocated.',
      'pain.3.t': 'No context', 'pain.3.d': 'The numbers don’t tell you what they mean.',

      'solution.title': 'One unified view.',
      'solution.lead': 'Aurix centralizes every asset class into a single interface, with the context you need to decide.',
      'asset.stocks': 'Stocks', 'asset.etfs': 'ETFs', 'asset.funds': 'Funds', 'asset.crypto': 'Crypto',
      'asset.metals': 'Metals', 'asset.realestate': 'Real Estate', 'asset.cash': 'Cash',
      'feat.value.t': 'Total value', 'feat.value.d': 'Unified across asset classes.',
      'feat.alloc.t': 'Allocation', 'feat.alloc.d': 'How it is split across asset classes.',
      'feat.evo.t': 'Evolution', 'feat.evo.d': 'Your wealth’s journey over time.',
      'feat.health.t': 'Portfolio health', 'feat.health.d': 'Concentration, liquidity and risk, interpreted.',
      'feat.insights.t': 'Insights', 'feat.insights.d': 'Clear observations about your structure.',
      'feat.intel.t': 'Intelligence', 'feat.intel.d': 'Context, not just figures.',

      'trust.label': 'Unified across',
      'show.title': 'Designed like a premium product.',
      'show.lead': 'A clear, institutional and fast experience.',

      'ws.eyebrow': 'Workspace',
      'ws.title1': 'More than tracking.', 'ws.title2': 'Understanding.',
      'ws.lead': 'The intelligence layer of Aurix. Workspace interprets your portfolio and helps you understand what is behind the numbers.',
      'ws.tag.health': 'Health Score', 'ws.tag.risk': 'Risk signals', 'ws.tag.analysis': 'Portfolio analysis', 'ws.tag.actions': 'Actionable insights',
      'ws.c1.t': 'Concentration', 'ws.c1.d': 'Spot when a single asset weighs too much.',
      'ws.c2.t': 'Diversification', 'ws.c2.d': 'Understand the real split across classes.',
      'ws.c3.t': 'Liquidity', 'ws.c3.d': 'How much you could move without friction.',
      'ws.c4.t': 'Risk', 'ws.c4.d': 'Exposure interpreted, not just measured.',
      'ws.c5.t': 'Portfolio health', 'ws.c5.d': 'A single reading of your wealth’s state.',
      'ws.c6.t': 'Insights', 'ws.c6.d': 'Clear, actionable observations.',
      'ws.c7.t': 'Intelligence', 'ws.c7.d': 'Context on your structure, not just figures.',

      'roadmap.title': 'Where Aurix is heading.',
      'roadmap.now': 'Now', 'roadmap.next': 'Next', 'roadmap.later': 'Later',
      'rm.now.1': 'Portfolio Dashboard', 'rm.now.2': 'Allocation Intelligence', 'rm.now.3': 'Market Tracking', 'rm.now.4': 'Workspace',
      'rm.next.1': 'Advanced Metrics', 'rm.next.2': 'Portfolio Health Expansion', 'rm.next.3': 'Goal Tracking', 'rm.next.4': 'Wealth Planning',
      'rm.later.1': 'Native iOS App', 'rm.later.2': 'Native Android App', 'rm.later.3': 'AI Assisted Insights', 'rm.later.4': 'Automation Layer',

      'early.eyebrow': 'Private Beta',
      'early.title': 'Invitation only.',
      'early.sub': 'Aurix is currently available to a limited number of users.',
      'early.name': 'Name', 'early.email': 'Email', 'early.button': 'Request Access',
      'early.note': 'We will not share your information. Private beta · limited spots.',
      'early.invalid': 'Please check your name and a valid email.',
      'early.success': 'Request received. We’ll be in touch.',
      'early.trust': 'Invite-only · No financial promises',
      'modal.title': 'Request private access.',
      'modal.sub': 'Leave your details and we’ll contact selected users.',
      'footer.tag': 'Private Wealth OS',
      'footer.product': 'Product', 'footer.legal': 'Legal', 'footer.privacy': 'Privacy', 'footer.terms': 'Terms', 'footer.social': 'Social',
      'meta.title': 'Aurix — The operating system for your wealth',
      'meta.desc': 'Track, understand and manage your entire wealth — stocks, funds, crypto, real estate, metals and cash — from one platform.'
    }
  };

  var LS_KEY = 'aurix_lang';
  var lang = 'es';

  function detectLang() {
    var stored;
    try { stored = localStorage.getItem(LS_KEY); } catch (_) {}
    if (stored === 'es' || stored === 'en') return stored;
    var nav = ((navigator.language || navigator.userLanguage || 'en') + '').toLowerCase();
    return nav.indexOf('es') === 0 ? 'es' : 'en';
  }

  function applyLang(next) {
    lang = (next === 'en') ? 'en' : 'es';
    var dict = I18N[lang];
    document.documentElement.lang = lang;
    try { localStorage.setItem(LS_KEY, lang); } catch (_) {}

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      if (dict[key] != null) nodes[i].textContent = dict[key];
    }
    // Reflect active state on every language toggle (header + mobile)
    var btns = document.querySelectorAll('.lang-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle('active', btns[j].getAttribute('data-lang') === lang);
    }
    // Keep the early-access note in sync unless it is showing a live status
    var note = document.getElementById('earlyNote');
    if (note && !note.classList.contains('ok')) note.textContent = dict['early.note'];

    // AURIX-LANDING-POLISH-1: multilingual SEO basics — localize the document
    // title, meta description and og:locale when the language changes. (No
    // separate /en route; single page, dynamic per selection.)
    if (dict['meta.title']) document.title = dict['meta.title'];
    var md = document.querySelector('meta[name="description"]');
    if (md && dict['meta.desc']) md.setAttribute('content', dict['meta.desc']);
    var ogl = document.querySelector('meta[property="og:locale"]');
    if (ogl) ogl.setAttribute('content', lang === 'en' ? 'en_US' : 'es_ES');

    // Keep the animated wealth figure in the active language (final value).
    var cv = document.getElementById('countValue');
    if (cv && !cv.dataset.counting) cv.textContent = fmtWealth(WEALTH_TARGET);
  }

  // Fictional headline wealth figure (labelled "Product preview"). ES: 4,82 M€ · EN: $4.82M
  var WEALTH_TARGET = 4.82;
  function fmtWealth(n) {
    return lang === 'en' ? ('$' + n.toFixed(2) + 'M') : (n.toFixed(2).replace('.', ',') + ' M€');
  }

  function t(key) { return (I18N[lang] && I18N[lang][key]) || (I18N.es[key]) || ''; }

  // AURIX-LANDING-PREMIUM-PASS-1: single source of truth for the private-app
  // URL. Every "Enter Aurix" link ([data-app-link]) points here.
  // TODO: flip APP_URL to 'https://app.aurixsystem.io' once that subdomain is
  // live (the HTML href is the same live fallback for no-JS).
  var APP_URL = 'https://rbn888.github.io/Aurix/';

  /* ── Init ───────────────────────────────────────────── */
  function init() {
    applyLang(detectLang());

    // Point every "Enter Aurix" CTA at the canonical app URL.
    var appLinks = document.querySelectorAll('[data-app-link]');
    for (var a = 0; a < appLinks.length; a++) appLinks[a].setAttribute('href', APP_URL);

    // Language toggle
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.lang-btn');
      if (b) { applyLang(b.getAttribute('data-lang')); }
    });

    // Header scroll state (rAF-throttled)
    var header = document.getElementById('siteHeader');
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        header.classList.toggle('scrolled', window.scrollY > 12);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mobile menu
    var menuToggle = document.getElementById('menuToggle');
    var mobileMenu = document.getElementById('mobileMenu');
    function closeMenu() {
      document.body.classList.remove('menu-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden', 'true');
    }
    menuToggle.addEventListener('click', function () {
      var open = !document.body.classList.contains('menu-open');
      document.body.classList.toggle('menu-open', open);
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      mobileMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    });
    mobileMenu.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });

    // Reveal on scroll
    var reveals = document.querySelectorAll('.reveal');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      for (var r = 0; r < reveals.length; r++) reveals[r].classList.add('is-visible');
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      for (var k = 0; k < reveals.length; k++) io.observe(reveals[k]);
    }

    // Total-value counter — subtle count-up to the fictional figure on reveal.
    var cv = document.getElementById('countValue');
    if (cv) {
      if (reduce || !('IntersectionObserver' in window)) {
        cv.textContent = fmtWealth(WEALTH_TARGET);
      } else {
        var cio = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            cio.unobserve(en.target);
            cv.dataset.counting = '1';
            var dur = 1100, start = null;
            function step(ts) {
              if (start === null) start = ts;
              var p = Math.min(1, (ts - start) / dur);
              var eased = 1 - Math.pow(1 - p, 3);
              cv.textContent = fmtWealth(WEALTH_TARGET * eased);
              if (p < 1) requestAnimationFrame(step);
              else { cv.textContent = fmtWealth(WEALTH_TARGET); delete cv.dataset.counting; }
            }
            requestAnimationFrame(step);
          });
        }, { threshold: 0.6 });
        cio.observe(cv);
      }
    }

    // Request-access modal (exclusive, compact). No backend.
    var modal = document.getElementById('accessModal');
    var openBtn = document.getElementById('openModal');
    function openModal() {
      if (!modal) return;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      var f = modal.querySelector('#ea-name');
      if (f) setTimeout(function () { try { f.focus(); } catch (_) {} }, 60);
    }
    function closeModal() {
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }
    if (openBtn) openBtn.addEventListener('click', openModal);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-modal-close]')) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeModal();
    });

    // Early-access form — placeholder behavior (no backend yet)
    var form = document.getElementById('earlyForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = form.querySelector('#ea-name');
        var email = form.querySelector('#ea-email');
        var note = document.getElementById('earlyNote');
        var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email.value || '').trim());
        var nameOk = (name.value || '').trim().length >= 2;
        name.classList.toggle('invalid', !nameOk);
        email.classList.toggle('invalid', !emailOk);
        if (!nameOk || !emailOk) {
          note.classList.remove('ok');
          note.textContent = t('early.invalid');
          return;
        }
        note.classList.add('ok');
        note.textContent = t('early.success');
        form.querySelector('button[type="submit"]').disabled = true;
        // TODO: POST to early-access endpoint when the backend exists.
      });
    }

    // Footer year (no Date pinning needed for a static label)
    var y = document.getElementById('year');
    if (y) { try { y.textContent = String(new Date().getFullYear()); } catch (_) {} }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
