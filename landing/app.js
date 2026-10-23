/* ============================================================
   AURIX landing — i18n (ES/EN), header, mobile menu, reveal,
   early-access placeholder. Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  /* ── Translations ───────────────────────────────────── */
  var I18N = {
    es: {

      'hero.eyebrow': 'Sistema operativo del patrimonio',
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
      'pain.1.t': 'Sin visibilidad', 'pain.1.d': 'Nunca ves tu situación financiera completa.',
      'pain.2.t': 'Sin claridad', 'pain.2.d': 'No sabes cómo está distribuido todo.',
      'pain.3.t': 'Sin contexto', 'pain.3.d': 'Tus números no explican lo que significan.',

      'solution.title': 'Diseñado para ver todo tu patrimonio como un solo sistema.',
      'solution.lead': 'Aurix centraliza cada clase de activo en una interfaz clara, dándote control, contexto y claridad sobre tu vida financiera.',
      'solution.assets': 'Acciones · ETFs · Fondos · Cripto · Inmuebles · Metales · Liquidez',
      'asset.stocks': 'Acciones', 'asset.etfs': 'ETFs', 'asset.funds': 'Fondos', 'asset.crypto': 'Cripto',
      'asset.metals': 'Metales', 'asset.realestate': 'Inmuebles', 'asset.cash': 'Liquidez',
      'feat.value.t': 'Valor total', 'feat.value.d': 'Unificado entre todas tus clases de activo.',
      'feat.alloc.t': 'Asignación', 'feat.alloc.d': 'Cómo está repartido entre clases de activo.',
      'feat.evo.t': 'Evolución', 'feat.evo.d': 'El recorrido de tu patrimonio en el tiempo.',
      'feat.health.t': 'Salud de cartera', 'feat.health.d': 'Concentración, liquidez y riesgo, interpretados.',
      'feat.insights.t': 'Insights', 'feat.insights.d': 'Observaciones claras sobre tu estructura.',
      'feat.intel.t': 'Inteligencia', 'feat.intel.d': 'Contexto, no solo cifras.',

      'trust.label': 'Unificado en',
      'show.title': 'Diseñado para ver todo tu patrimonio como un único sistema.',
      'show.lead': 'Control, contexto y claridad en una sola interfaz.',

      'ws.eyebrow': 'Inteligencia',
      'ws.title': 'Plataforma de Inteligencia Patrimonial',
      'ws.lead': 'Centralizar tu patrimonio es solo el comienzo.',
      'ws.lead2': 'Aurix transforma datos dispersos en comprensión accionable para ayudarte a entender qué está cambiando, qué importa y qué requiere tu atención.',
      'ws.b1': 'Cambios relevantes detectados automáticamente',
      'ws.b2': 'Salud de cartera en tiempo real',
      'ws.b3': 'Contexto de mercado aplicado a tu patrimonio',
      'ws.b4': 'Recomendaciones accionables impulsadas por IA',

      'market.eyebrow': 'Mercado',
      'market.title': 'Consulta los mercados desde un único lugar.',
      'market.lead': 'Sigue cualquier activo relevante desde una interfaz profesional: el contexto de mercado que necesitas para entender qué ocurre con tus inversiones, no solo tu patrimonio.',
      'market.1': 'Acciones', 'market.2': 'ETFs y Fondos', 'market.3': 'Cripto',
      'market.4': 'Materias primas', 'market.5': 'Índices', 'market.6': 'Mercados globales',

      'roadmap.title': 'Hacia dónde va Aurix.',
      'roadmap.now': 'Ahora', 'roadmap.next': 'Próximo', 'roadmap.later': 'Después',
      'rm.now.1': 'Dashboard patrimonial', 'rm.now.2': 'Seguimiento de mercado', 'rm.now.3': 'Centro financiero personal', 'rm.now.4': 'Cartera inmobiliaria',
      'rm.next.1': 'Centro de inteligencia', 'rm.next.2': 'Salud de cartera', 'rm.next.3': 'Acceso Fundador', 'rm.next.4': 'Herramientas inteligentes',
      'rm.later.1': 'Automatización avanzada', 'rm.later.2': 'Insights asistidos por IA', 'rm.later.3': 'Integraciones ampliadas', 'rm.later.4': 'Planificación patrimonial avanzada',

      'updates.title': 'Centro financiero personal.',
      'updates.sub': 'Planifica, simula y organiza las áreas más importantes de tu patrimonio desde una única zona de trabajo.',
      'updates.1': 'Planificación financiera', 'updates.2': 'Cartera inmobiliaria', 'updates.3': 'Objetivos financieros',
      'updates.4': 'Herramientas de crecimiento patrimonial', 'updates.5': 'Análisis de escenarios', 'updates.6': 'Análisis de financiación',
      'updates.7': 'Diario de inversiones', 'updates.8': 'Gestión de flujo de caja', 'updates.9': 'Seguimiento de mercado',
      'updates.10': 'Calculadora de interés compuesto',

      'early.eyebrow': 'Beta privada',
      'early.title': 'Solo por invitación.',
      'early.sub': 'Aurix está abriendo acceso a usuarios seleccionados antes del lanzamiento público.',
      'early.founder': 'El Acceso Fundador estará disponible para los primeros miembros, con beneficios exclusivos, acceso prioritario y reconocimiento permanente de fundador.',
      'early.name': 'Nombre', 'early.email': 'Email', 'early.button': 'Solicitar acceso',
      'early.note': 'No compartiremos tu información. Beta privada · plazas limitadas.',
      'early.invalid': 'Revisa tu nombre y un email válido.',
      'early.sending': 'Enviando…',
      'early.dup': 'Ya estás en la lista de espera de Aurix.',
      'early.rate': 'Demasiados intentos. Inténtalo de nuevo más tarde.',
      'early.error': 'Algo salió mal. Inténtalo de nuevo.',
      'early.success': 'Solicitud recibida. Te contactaremos pronto.',
      'early.trust': 'Primeras plazas disponibles por invitación',
      'modal.title': 'Solicita acceso privado.',
      'modal.sub': 'Déjanos tus datos y contactaremos con usuarios seleccionados.',
      'footer.tag': 'Plataforma de inteligencia patrimonial',
      'footer.product': 'Plataforma', 'footer.legal': 'Legal', 'footer.privacy': 'Privacidad', 'footer.terms': 'Términos', 'footer.support': 'Soporte', 'footer.social': 'Social',
      'footer.desc': 'Aurix es una plataforma de inteligencia patrimonial diseñada para ayudar a las personas a centralizar su patrimonio, entender su evolución y ganar claridad sobre su futuro financiero.',

      'pos.eyebrow': 'Plataforma de inteligencia patrimonial',
      'pos.title1': 'Centraliza tu patrimonio.',
      'pos.title2': 'Entiende su evolución.',
      'pos.title3': 'Descubre qué impulsa tu futuro financiero.',
      'pos.lead': 'Aurix transforma datos financieros fragmentados en claridad, contexto y comprensión accionable.',
      'pos.lead2': 'Porque construir patrimonio no consiste solo en seguir activos. Consiste en entender las decisiones, tendencias y fuerzas que moldean tu futuro financiero.',

      'community.title': 'Únete a la comunidad de Aurix',
      'community.text': 'Sigue el desarrollo del producto, recibe novedades y conecta con los primeros usuarios que están construyendo el futuro de la inteligencia patrimonial.',
      'community.tg.sub': 'Comunidad oficial',

      'cred.1': 'Una sola plataforma.', 'cred.2': 'Todo tu patrimonio.', 'cred.3': 'Visibilidad completa.',

      'meta.title': 'Aurix — Inteligencia patrimonial para entender y planificar tu patrimonio',
      'meta.desc': 'Aurix es una plataforma de inteligencia patrimonial para quienes invierten: reúne acciones, ETFs, fondos, cripto y más, entiende qué está cambiando en tu cartera y planifica con tus propios números.'
    },
    en: {

      'hero.eyebrow': 'Wealth Operating System',
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
      'pain.1.t': 'No visibility', 'pain.1.d': 'You never see your full financial picture.',
      'pain.2.t': 'No clarity', 'pain.2.d': 'You don’t know how everything is distributed.',
      'pain.3.t': 'No context', 'pain.3.d': 'Your numbers don’t explain what they mean.',

      'solution.title': 'Built to see your entire wealth as one system.',
      'solution.lead': 'Aurix centralizes every asset class into one clear interface, giving you control, context and clarity over your financial life.',
      'solution.assets': 'Stocks · ETFs · Funds · Crypto · Real Estate · Metals · Cash',
      'asset.stocks': 'Stocks', 'asset.etfs': 'ETFs', 'asset.funds': 'Funds', 'asset.crypto': 'Crypto',
      'asset.metals': 'Metals', 'asset.realestate': 'Real Estate', 'asset.cash': 'Cash',
      'feat.value.t': 'Total value', 'feat.value.d': 'Unified across asset classes.',
      'feat.alloc.t': 'Allocation', 'feat.alloc.d': 'How it is split across asset classes.',
      'feat.evo.t': 'Evolution', 'feat.evo.d': 'Your wealth’s journey over time.',
      'feat.health.t': 'Portfolio health', 'feat.health.d': 'Concentration, liquidity and risk, interpreted.',
      'feat.insights.t': 'Insights', 'feat.insights.d': 'Clear observations about your structure.',
      'feat.intel.t': 'Intelligence', 'feat.intel.d': 'Context, not just figures.',

      'trust.label': 'Unified across',
      'show.title': 'Built to see your entire wealth as one system.',
      'show.lead': 'Control, context and clarity in a single interface.',

      'ws.eyebrow': 'Intelligence',
      'ws.title': 'Wealth Intelligence Platform',
      'ws.lead': 'Centralizing your wealth is only the beginning.',
      'ws.lead2': 'Aurix turns scattered data into actionable understanding — helping you see what is changing, what matters and what needs your attention.',
      'ws.b1': 'Relevant changes detected automatically',
      'ws.b2': 'Real-time portfolio health',
      'ws.b3': 'Market context applied to your wealth',
      'ws.b4': 'AI-driven actionable insights',

      'market.eyebrow': 'Market',
      'market.title': 'Follow the markets from one place.',
      'market.lead': 'Track any relevant asset from a professional interface — the market context you need to understand what is happening with your investments, not just your wealth.',
      'market.1': 'Stocks', 'market.2': 'ETFs & Funds', 'market.3': 'Crypto',
      'market.4': 'Commodities', 'market.5': 'Indices', 'market.6': 'Global markets',

      'roadmap.title': 'Where Aurix is heading.',
      'roadmap.now': 'Now', 'roadmap.next': 'Next', 'roadmap.later': 'Later',
      'rm.now.1': 'Portfolio Dashboard', 'rm.now.2': 'Market Tracking', 'rm.now.3': 'Personal Financial Center', 'rm.now.4': 'Real Estate Portfolio',
      'rm.next.1': 'Intelligence Center', 'rm.next.2': 'Portfolio Health', 'rm.next.3': 'Founder Access', 'rm.next.4': 'Smart Tools',
      'rm.later.1': 'Advanced Automation', 'rm.later.2': 'AI-Assisted Insights', 'rm.later.3': 'Expanded Integrations', 'rm.later.4': 'Advanced Wealth Planning',

      'updates.title': 'Personal financial center.',
      'updates.sub': 'Plan, simulate and organize the most important areas of your wealth from a single workspace.',
      'updates.1': 'Financial Planning', 'updates.2': 'Real Estate Portfolio', 'updates.3': 'Financial Goals',
      'updates.4': 'Wealth Growth Tools', 'updates.5': 'Scenario Analysis', 'updates.6': 'Financing Analysis',
      'updates.7': 'Investment Journal', 'updates.8': 'Cash Flow Management', 'updates.9': 'Market Monitoring',
      'updates.10': 'Compound Interest Calculator',

      'early.eyebrow': 'Private Beta',
      'early.title': 'Invitation only.',
      'early.sub': 'Aurix is currently opening access to selected early users before public launch.',
      'early.founder': 'Founder Access will be available for early members with exclusive benefits, priority access and permanent founder recognition.',
      'early.name': 'Name', 'early.email': 'Email', 'early.button': 'Request Access',
      'early.note': 'We will not share your information. Private beta · limited spots.',
      'early.invalid': 'Please check your name and a valid email.',
      'early.sending': 'Sending…',
      'early.dup': 'You’re already on the Aurix waitlist.',
      'early.rate': 'Too many attempts. Please try again later.',
      'early.error': 'Something went wrong. Please try again.',
      'early.success': 'Request received. We’ll be in touch.',
      'early.trust': 'Limited early invitations available',
      'modal.title': 'Request private access.',
      'modal.sub': 'Leave your details and we’ll contact selected users.',
      'footer.tag': 'Wealth Intelligence Platform',
      'footer.product': 'Platform', 'footer.legal': 'Legal', 'footer.privacy': 'Privacy', 'footer.terms': 'Terms', 'footer.support': 'Support', 'footer.social': 'Social',
      'footer.desc': 'Aurix is a Wealth Intelligence Platform designed to help people centralize their wealth, understand its evolution and gain clarity over their financial future.',

      'pos.eyebrow': 'Wealth Intelligence Platform',
      'pos.title1': 'Centralize your wealth.',
      'pos.title2': 'Understand its evolution.',
      'pos.title3': 'Discover what drives your financial future.',
      'pos.lead': 'Aurix transforms fragmented financial data into clarity, context and actionable understanding.',
      'pos.lead2': 'Because building wealth is not only about tracking assets. It is about understanding the decisions, trends and forces shaping your financial future.',

      'community.title': 'Join the Aurix Community',
      'community.text': 'Follow product development, receive updates and connect with early users building the future of wealth intelligence.',
      'community.tg.sub': 'Official Community',

      'cred.1': 'One platform.', 'cred.2': 'All your wealth.', 'cred.3': 'Complete visibility.',

      'meta.title': 'Aurix — Wealth intelligence to understand and plan your wealth',
      'meta.desc': 'Aurix is a wealth intelligence platform for people who invest: bring stocks, ETFs, funds, crypto and more together, understand what is changing in your portfolio and plan with your own numbers.'
    }
  };

  // ── SPEC 2 · LANDING DE CONVERSIÓN ── textos nuevos (audiencia, problema, beneficio, planes, FAQ).
  // Se aplican DESPUÉS del diccionario: varias claves (hero.*, cta.*) ya existían con el copy
  // anterior y en un literal de objeto ganaría la última aparición.
  Object.assign(I18N.es, {
      'nav.how': "Producto",
      'nav.plans': "Planes",
      'nav.faq': "Preguntas",
      'hero.h1a': "Todo tu patrimonio.",
      'hero.h1b': "Una visión más inteligente.",
      'hero.sub': "Reúne tus inversiones, entiende qué está cambiando y planifica tus próximos pasos. Acciones, ETFs, fondos, cripto y más, en un solo lugar.",
      'cta.start': "Crear cuenta gratis",
      'cta.see': "Explorar Aurix",
      'cta.premium': "Crear cuenta y descubrir Premium",
      'alt.dashboard': "Dashboard de Aurix (interfaz en inglés): patrimonio invertible, evolución de la cartera y categorías de acciones, ETF y fondos, cripto, metales, inmuebles y liquidez",
      'alt.positions': "Posiciones de una categoría en Aurix, con datos de ejemplo",
      'alt.intelligence': "Intelligence de Aurix (interfaz en inglés): salud de la cartera, lectura de concentración, radar, principales posiciones y preguntas para explorar el patrimonio",
      'alt.workspace': "Presupuesto mensual de Aurix con datos de ejemplo",
      'bridge': "Tus inversiones están repartidas. Tu visión no tiene por qué estarlo.",
      'how.eyebrow': "Cómo funciona",
      'how.lead': "Tú registras tus posiciones: Aurix no se conecta a tu banco ni te pide credenciales bancarias.",
      'how.1.t': "Reúne todo tu patrimonio",
      'how.1.d': "Consulta cuánto tienes, cómo se distribuye y cómo evoluciona. Organiza acciones, ETFs, fondos, cripto, metales, inmuebles y liquidez en una sola visión.",
      'how.mkt.t': "Sigue los mercados que te interesan.",
      'how.mkt.d': "Explora acciones, ETFs, criptomonedas, índices y materias primas. Consulta precios y variaciones, busca los activos que te interesan y guárdalos en tu lista de seguimiento.",
      'alt.market': "Market de Aurix: lista de cripto, acciones y ETFs con precio, variación en 24 horas, tendencia y activos guardados",
      'alt.market.open': "Abrir la captura de Market a tamaño completo",
      'how.2.t': "Descubre qué merece tu atención",
      'how.2.d': "Intelligence pone tu patrimonio en contexto: dónde se concentra, qué ha cambiado y cómo evoluciona su estructura. Una lectura de tus datos para entender mejor tu cartera.",
      'how.3.t': "Convierte tus números en planes",
      'how.3.d': "Planifica con tus propios números: organiza tu presupuesto, fija objetivos y comprueba cómo les afectaría un préstamo o el interés compuesto.",
      'how.3.ex': "Por ejemplo: Presupuesto mensual, Objetivos financieros, Simulador de préstamos e Interés compuesto.",
      'plans.title': "Empieza gratis. Pasa a Premium cuando quieras más.",
      'free.price': "0 €",
      'free.per': "sin coste",
      'free.intro': "Incluye:",
      'free.1': "Todas tus posiciones, sin límite de activos",
      'free.2': "Dashboard con total, reparto y evolución",
      'free.3': "Mercado: sigue índices y activos",
      'free.4': "Una primera lectura de Intelligence sobre tu cartera",
      'price.month': "7,99 €",
      'price.month.per': "al mes",
      'price.year.note': "O 69,99 € al año, cobrados anualmente: 5,83 € al mes, ahorras un 27 %.",
      'prem.intro': "Todo lo incluido en Free, más:",
      'prem.1': "Intelligence completa: entiende dónde se concentra tu patrimonio, qué ha cambiado y cómo evoluciona su estructura",
      'prem.2': "Todas las herramientas de planificación de Workspace: presupuesto, objetivos, préstamos, interés compuesto y más",
      'prem.3': "Guarda tus planes para retomarlos más tarde",
      'price.terms': "Suscripción renovable. Cancela desde Gestionar mi plan.",
      'faq.title': "Preguntas frecuentes",
      'faq.1.q': "¿Qué puedo hacer gratis?",
      'faq.1.a': "Registrar todas tus posiciones, ver tu patrimonio, su reparto y evolución, seguir el mercado y recibir una primera lectura de Intelligence. Premium añade Intelligence completa, todas las herramientas y plantillas de Workspace y el guardado de tus planes.",
      'faq.2.q': "¿Aurix se conecta con mi banco o mi bróker?",
      'faq.2.a': "No. Registras tus posiciones a mano y Aurix actualiza los precios de los activos cotizados. No necesita tus credenciales bancarias y no puede mover tu dinero.",
      'faq.3.q': "¿Cómo se cobra Premium y cómo lo cancelo?",
      'faq.3.a': "Mensual (7,99 € al mes) o anual (69,99 €, en un único cobro al año). La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles desde «Gestionar mi plan» en la app. El pago lo procesa Stripe; Aurix no guarda tu tarjeta.",
      'faq.4.q': "¿Aurix me dice qué comprar o vender?",
      'faq.4.a': "No. Aurix organiza y explica tu patrimonio; no ofrece asesoramiento financiero ni recomendaciones de inversión.",
      'faq.5.q': "¿Dónde puedo usarlo?",
      'faq.5.a': "En el navegador del ordenador o del móvil, y puedes añadirlo a la pantalla de inicio. Tus datos se guardan en tu cuenta.",
      'final.title': "Tu patrimonio, con más claridad.",
      'final.note': "Empieza con Free. Descubre Premium desde la aplicación.",
      'nav.product': 'Plataforma', 'nav.market': 'Mercado', 'nav.workspace': 'Inteligencia', 'nav.roadmap': 'Roadmap', 'nav.early': 'Acceso anticipado',
      'cta.enter': 'Comenzar', 'cta.request': 'Solicitar acceso',
  });
  Object.assign(I18N.en, {
      'nav.how': "Product",
      'nav.plans': "Plans",
      'nav.faq': "FAQ",
      'hero.h1a': "All your wealth.",
      'hero.h1b': "A smarter view.",
      'hero.sub': "Bring your investments together, understand what is changing and plan your next steps. Stocks, ETFs, funds, crypto and more, in one place.",
      'cta.start': "Create a free account",
      'cta.see': "Explore Aurix",
      'cta.premium': "Create an account and explore Premium",
      'alt.dashboard': "Aurix Dashboard: investable wealth, portfolio evolution and categories for stocks, ETFs and funds, crypto, metals, real estate and liquidity",
      'alt.positions': "Positions in a category in Aurix, with sample data",
      'alt.intelligence': "Aurix Intelligence: portfolio health, concentration reading, radar, key drivers and questions to explore your wealth",
      'alt.workspace': "Aurix monthly budget with sample data",
      'bridge': "Your investments are spread out. Your view doesn’t have to be.",
      'how.eyebrow': "How it works",
      'how.lead': "You record your positions yourself: Aurix does not connect to your bank or ask for your banking credentials.",
      'how.1.t': "Bring all your wealth together",
      'how.1.d': "See how much you have, how it is distributed and how it evolves. Organise stocks, ETFs, funds, crypto, metals, real estate and cash in a single view.",
      'how.mkt.t': "Follow the markets that interest you.",
      'how.mkt.d': "Explore stocks, ETFs, crypto, indices and commodities. Check prices and changes, find the assets that interest you and save them to your watchlist.",
      'alt.market': "Aurix Market (interface in Spanish): list of crypto, stocks and ETFs with price, 24-hour change, trend and saved assets",
      'alt.market.open': "Open the Market screenshot at full size",
      'how.2.t': "Find out what deserves your attention",
      'how.2.d': "Intelligence puts your wealth in context: where it is concentrated, what has changed and how its structure evolves. A reading of your data to better understand your portfolio.",
      'how.3.t': "Turn your numbers into plans",
      'how.3.d': "Plan with your own numbers: organise your budget, set goals and see how a loan or compound interest would affect them.",
      'how.3.ex': "For example: Monthly budget, Financial goals, Loan simulator and Compound interest.",
      'plans.title': "Start free. Go Premium when you want more.",
      'free.price': "€0",
      'free.per': "no cost",
      'free.intro': "Includes:",
      'free.1': "All your positions, with no asset limit",
      'free.2': "Dashboard with total, split and evolution",
      'free.3': "Market: follow indices and assets",
      'free.4': "A first Intelligence reading of your portfolio",
      'price.month': "€7.99",
      'price.month.per': "per month",
      'price.year.note': "Or €69.99 a year, billed annually: €5.83 a month, you save 27%.",
      'prem.intro': "Everything in Free, plus:",
      'prem.1': "Full Intelligence: understand where your wealth is concentrated, what has changed and how its structure evolves",
      'prem.2': "Every Workspace planning tool: budget, goals, loans, compound interest and more",
      'prem.3': "Save your plans to pick them up later",
      'price.terms': "Renewing subscription. Cancel from Manage my plan.",
      'faq.title': "Frequently asked questions",
      'faq.1.q': "What can I do for free?",
      'faq.1.a': "Record all your positions, see your wealth, its split and evolution, follow the market and get a first Intelligence reading. Premium adds full Intelligence, all Workspace tools and templates, and saving your plans.",
      'faq.2.q': "Does Aurix connect to my bank or broker?",
      'faq.2.a': "No. You record your positions by hand and Aurix updates the prices of listed assets. It does not need your banking credentials and cannot move your money.",
      'faq.3.q': "How is Premium charged and how do I cancel?",
      'faq.3.a': "Monthly (€7.99 a month) or annual (€69.99, in a single yearly charge). The subscription renews automatically at the end of each period until you cancel it from “Manage my plan” in the app. Payments are processed by Stripe; Aurix does not store your card.",
      'faq.4.q': "Does Aurix tell me what to buy or sell?",
      'faq.4.a': "No. Aurix organises and explains your wealth; it does not give financial advice or investment recommendations.",
      'faq.5.q': "Where can I use it?",
      'faq.5.a': "In the browser on your computer or phone, and you can add it to your home screen. Your data is kept in your account.",
      'final.title': "Your wealth, with more clarity.",
      'final.note': "Start with Free. Discover Premium from the app.",
      'nav.product': 'Platform', 'nav.market': 'Market', 'nav.workspace': 'Intelligence', 'nav.roadmap': 'Roadmap', 'nav.early': 'Early Access',
      'cta.enter': 'Get Started', 'cta.request': 'Request Access',
  });

  // LANDING MASTER · Intelligence con sección propia, Workspace completo y FAQ ampliada.
  // Mismo patrón que SPEC 2: se aplica después, así que `how.3.d` sustituye al copy anterior.
  Object.assign(I18N.es, {
      'intel.eyebrow': 'Aurix Intelligence',
      'intel.title': 'Tu patrimonio tiene una historia. Aurix te ayuda a leerla.',
      'intel.lead': 'Hacer seguimiento te dice qué tienes. Intelligence te ayuda a entender qué significa.',
      'intel.c1.t': 'Concentración',
      'intel.c1.d': 'Descubre qué posiciones y categorías pesan más en tu patrimonio y cuánto depende de ellas.',
      'intel.c2.t': 'Evolución',
      'intel.c2.d': 'Sigue cómo cambia la estructura de tu patrimonio con el tiempo, no solo su total.',
      'intel.c3.t': 'Cambios clave',
      'intel.c3.d': 'Detecta qué ha cambiado de forma relevante en tu cartera, sin ruido por movimientos menores.',
      'intel.note': 'Intelligence lee tus propios datos y te los explica. No te dice qué comprar ni qué vender.',
      'how.3.d': 'Workspace reúne herramientas para planificar con tus propios números. Guarda cada plan como un documento, retómalo más tarde y elige cuáles mostrar en tu Dashboard.',
      'ws.c.budget': 'Presupuestos', 'ws.c.goals': 'Objetivos', 'ws.c.re': 'Inmuebles', 'ws.c.recv': 'Cobros',
      'ws.c.compound': 'Interés compuesto', 'ws.c.loan': 'Préstamos', 'ws.c.scen': 'Escenarios',
      'ws.c.cmp': 'Comparador de rentabilidad', 'ws.c.jrn': 'Diario de inversiones',
      'faq.0.q': '¿Qué es Aurix?',
      'faq.0.a': 'Una plataforma de inteligencia patrimonial para quienes invierten. Reúnes tus posiciones en un solo lugar, Intelligence te ayuda a entender qué está cambiando y Workspace te permite planificar con tus propios números.',
      'faq.6.q': '¿Qué activos puedo registrar?',
      'faq.6.a': 'Acciones, ETFs, fondos, cripto, metales, inmuebles y liquidez. Aurix actualiza los precios de los activos cotizados; el valor del resto lo introduces tú.',
      'faq.7.q': '¿Qué hace Intelligence?',
      'faq.7.a': 'Lee tu cartera y te la explica: dónde se concentra tu patrimonio, cómo evoluciona su estructura y qué ha cambiado de forma relevante. Free incluye una primera lectura; Premium desbloquea el análisis completo.',
      'faq.8.q': '¿Qué es Workspace?',
      'faq.8.a': 'El espacio para planificar: presupuestos, objetivos, inmuebles, cobros, interés compuesto, préstamos, escenarios, comparador de rentabilidad y diario de inversiones. Forma parte de Premium.',
      'faq.9.q': '¿Se guardan mis planes?',
      'faq.9.a': 'Con Premium, cada plan se guarda como un documento en tu cuenta para que puedas retomarlo más tarde. En tu Dashboard no aparece nada que no hayas elegido mostrar.',
  });
  Object.assign(I18N.en, {
      'intel.eyebrow': 'Aurix Intelligence',
      'intel.title': 'Your wealth has a story. Aurix helps you read it.',
      'intel.lead': 'Tracking tells you what you own. Intelligence helps you understand what it means.',
      'intel.c1.t': 'Concentration',
      'intel.c1.d': 'See which positions and categories carry the most weight in your wealth, and how much of it depends on them.',
      'intel.c2.t': 'Evolution',
      'intel.c2.d': 'Follow how the structure of your wealth changes over time, not just its total.',
      'intel.c3.t': 'Key changes',
      'intel.c3.d': 'Spot what has changed in a meaningful way in your portfolio, without noise from minor moves.',
      'intel.note': 'Intelligence reads your own data and explains it. It does not tell you what to buy or sell.',
      'how.3.d': 'Workspace brings together tools to plan with your own numbers. Save each plan as a document, pick it up later and choose which ones to show on your Dashboard.',
      'ws.c.budget': 'Budgets', 'ws.c.goals': 'Goals', 'ws.c.re': 'Real estate', 'ws.c.recv': 'Receivables',
      'ws.c.compound': 'Compound interest', 'ws.c.loan': 'Loans', 'ws.c.scen': 'Scenarios',
      'ws.c.cmp': 'Return comparison', 'ws.c.jrn': 'Investment journal',
      'faq.0.q': 'What is Aurix?',
      'faq.0.a': 'A wealth intelligence platform for people who invest. You bring your positions together in one place, Intelligence helps you understand what is changing, and Workspace lets you plan with your own numbers.',
      'faq.6.q': 'Which assets can I add?',
      'faq.6.a': 'Stocks, ETFs, funds, crypto, metals, real estate and cash. Aurix updates the prices of listed assets; you enter the value of the rest yourself.',
      'faq.7.q': 'What does Intelligence do?',
      'faq.7.a': 'It reads your portfolio and explains it: where your wealth is concentrated, how its structure evolves and what has changed in a meaningful way. Free includes a first reading; Premium unlocks the full analysis.',
      'faq.8.q': 'What is Workspace?',
      'faq.8.a': 'The space to plan: budgets, goals, real estate, receivables, compound interest, loans, scenarios, return comparison and an investment journal. It is part of Premium.',
      'faq.9.q': 'Are my plans saved?',
      'faq.9.a': 'With Premium, each plan is saved as a document in your account so you can pick it up later. Nothing appears on your Dashboard unless you choose to show it there.',
  });

  // LANDING COMERCIAL V1 · copy definitivo (docs/AURIX-LANDING-COMMERCIAL-V1-SPEC.md §2). Claves nuevas
  // `lp.*`; las que ya existían y cambian de texto (nav.how, meta.*) se sobrescriben aquí, después de
  // los bloques anteriores. Las cifras del panel de Intelligence son las que publica el motor con la
  // cartera de demostración (scripts/aurix-landing-captures.mjs las contrasta antes de cada captura).
  Object.assign(I18N.es, {
      'meta.title': 'AURIX — Comprende mejor tu patrimonio',
      'meta.desc': 'Inteligencia patrimonial para inversores: reúne tus inversiones en un solo lugar y descubre de qué depende tu patrimonio y qué está cambiando. Empieza gratis.',
      'nav.how': 'Cómo empezar',
      'lp.cta.compact': 'Crear cuenta',
      'lp.hero.eyebrow': 'Inteligencia patrimonial para inversores',
      'lp.hero.h1a': 'Comprende mejor tu patrimonio.',
      'lp.hero.h1b': 'Decide con más información.',
      'lp.hero.sub': 'Reúne tus inversiones en un solo lugar y descubre qué está pasando con tu dinero.',
      'lp.cta.intel': 'Descubrir Intelligence',
      'lp.demo': 'Cartera de demostración',
      'lp.alt.hero': 'Dashboard de AURIX con una cartera de demostración: patrimonio invertible, evolución y reparto por categorías',
      'lp.if.label': 'Tu primera lectura con Free',
      'lp.if.quote': '«El 29 % de tu cartera financiera depende de Microsoft.»',
      'lp.b1.t': 'Comprende de qué depende tu dinero.',
      'lp.b1.d': 'Reconoce qué posiciones tienen más peso y cómo se distribuye tu patrimonio.',
      'lp.b2.t': 'Distingue los cambios importantes.',
      'lp.b2.d': 'Entiende qué ha cambiado en tu cartera y qué merece una revisión más detenida.',
      'lp.b2.note': 'Se apoya en el historial que AURIX registra desde que añades tus inversiones.',
      'lp.b3.t': 'Encuentra respuestas en tus propios datos.',
      'lp.b3.d': 'Explora preguntas sobre tus inversiones y descubre qué hay detrás de cada conclusión.',
      'lp.how.title': 'Empieza con las inversiones que ya tienes.',
      'lp.s1.t': 'Accede con tu correo.', 'lp.s1.d': 'Crea tu cuenta gratuita.',
      'lp.s2.t': 'Añade tus inversiones.', 'lp.s2.d': 'Reúne tus posiciones en un solo lugar.',
      'lp.s3.t': 'Descubre qué merece tu atención.', 'lp.s3.d': 'Consulta tu patrimonio y obtén tu primera lectura de Intelligence.',
      'lp.how.note': 'Tú registras tus posiciones. Sin facilitar credenciales bancarias.',
      'lp.trk.eyebrow': 'DASHBOARD Y SEGUIMIENTO',
      'lp.trk.title': 'Tu patrimonio cambia. Mantén la perspectiva.',
      'lp.trk.text': 'Consulta cuánto tienes, cómo se distribuye y cómo evoluciona.',
      'lp.trk.ctx': 'Organiza acciones, ETFs, fondos, cripto, metales, inmuebles y liquidez. AURIX actualiza los precios de los activos cotizados y construye el historial de tu patrimonio a medida que lo usas.',
      'lp.alt.positions': 'Posiciones de la categoría Acciones en AURIX, con la cartera de demostración',
      'lp.mkt.note': '',
      'lp.ws.title': 'Pon tus próximos objetivos en números.',
      'lp.ws.text': 'Calcula un objetivo, compara escenarios y organiza tu presupuesto.',
      'lp.ws.e1.t': 'Objetivos.', 'lp.ws.e1.d': 'Convierte tus metas en objetivos medibles.',
      'lp.ws.e2.t': 'Escenarios.', 'lp.ws.e2.d': 'Compara decisiones antes de ejecutarlas.',
      'lp.ws.e3.t': 'Presupuestos.', 'lp.ws.e3.d': 'Controla ingresos, gastos y ahorro libre.',
      'lp.ws.note': 'Incluido en Premium. Cada plan se guarda en tu cuenta para retomarlo más tarde.',
      'lp.trust.title': 'Claridad y control, desde el principio',
      'lp.t1.t': 'Sin acceso a tu dinero.', 'lp.t1.d': 'AURIX no se conecta a tu banco ni a tu bróker y no puede mover fondos.',
      'lp.t2.t': 'Interpreta, no recomienda.', 'lp.t2.d': 'Explica tus propios datos. No te dice qué comprar ni qué vender.',
      'lp.t3.t': 'Suscripción clara.', 'lp.t3.d': 'El pago lo procesa Stripe y AURIX no guarda tu tarjeta. Cancela cuando quieras desde «Gestionar mi plan».',
      'lp.t4.t': 'Soporte por correo.', 'lp.t4.d': 'Escríbenos desde la página de', 'lp.t4.link': 'Soporte',
      'lp.plans.title': 'Empieza gratis. Profundiza con Premium.',
      'lp.free.3': 'Market: sigue índices y activos',
      'lp.free.4': 'Tu primera lectura de Intelligence sobre la composición de tu cartera',
      'lp.price.year': '69,99 €', 'lp.price.year.per': 'al año',
      'lp.price.year.note': 'Un único cobro anual: equivale a 5,83 € al mes y ahorras un 27 % frente al pago mensual.',
      'lp.prem.1': 'Intelligence completa: dependencias, escenarios y qué ha cambiado en tu cartera, con preguntas sobre tus propios datos',
      'lp.prem.2': 'Todas las herramientas de Workspace: presupuestos, objetivos, escenarios, préstamos, interés compuesto y más',
      'lp.price.terms': 'Suscripción renovable. Cancela cuando quieras desde «Gestionar mi plan».',
      'lp.faq.0.q': '¿Qué es AURIX?',
      'lp.faq.0.a': 'Una plataforma de inteligencia patrimonial para inversores particulares. Reúnes tus inversiones en un solo lugar, Intelligence te ayuda a entender de qué depende tu patrimonio y qué está cambiando, y Workspace te permite planificar con tus propios números.',
      'lp.faq.6.a': 'Acciones, ETFs, fondos, cripto, metales, inmuebles y liquidez. AURIX actualiza los precios de los activos cotizados; el valor del resto lo introduces tú.',
      'lp.faq.2.q': '¿AURIX se conecta con mi banco o mi bróker?',
      'lp.faq.2.a': 'No. Registras tus posiciones a mano y AURIX actualiza los precios de los activos cotizados. No necesita tus credenciales bancarias y no puede mover tu dinero.',
      'lp.faq.1.a': 'Registrar todas tus posiciones, ver tu patrimonio, su reparto y evolución, seguir el mercado y recibir una primera lectura de Intelligence sobre la composición de tu cartera. Premium añade Intelligence completa, todas las herramientas de Workspace y el guardado de tus planes.',
      'lp.faq.7.a': 'Lee tu cartera y te la explica: de qué posiciones depende, cómo se reparte y qué ha cambiado de forma relevante. Lo que se refiere a cambios se apoya en el historial que AURIX registra desde que añades tus inversiones. Free incluye una primera lectura, que aparece cuando todos tus activos tienen precio y divisa disponibles; Premium desbloquea el análisis completo.',
      'lp.faq.3.a': 'Mensual (7,99 € al mes) o anual (69,99 €, en un único cobro al año). La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles desde «Gestionar mi plan» en la app. El pago lo procesa Stripe; AURIX no guarda tu tarjeta.',
      'lp.faq.4.q': '¿AURIX me dice qué comprar o vender?',
      'lp.faq.4.a': 'No. AURIX organiza y explica tu patrimonio; no ofrece asesoramiento financiero ni recomendaciones de inversión.',
      'lp.final.title': 'Comprende mejor lo que ya has construido.',
  });
  Object.assign(I18N.en, {
      'meta.title': 'AURIX — Understand your wealth better',
      'meta.desc': 'Wealth intelligence for investors: bring your investments together in one place and discover what your wealth depends on and what is changing. Start free.',
      'nav.how': 'Get started',
      'lp.cta.compact': 'Sign up',
      'lp.hero.eyebrow': 'Wealth intelligence for investors',
      'lp.hero.h1a': 'Understand your wealth better.',
      'lp.hero.h1b': 'Make better\u2011informed decisions.',
      'lp.hero.sub': 'Bring your investments together in one place and see what’s happening with your money.',
      'lp.cta.intel': 'Explore Intelligence',
      'lp.demo': 'Demo portfolio',
      'lp.alt.hero': 'AURIX Dashboard with a demo portfolio: investable wealth, evolution and split by category',
      'lp.if.label': 'Your first reading on Free',
      'lp.if.quote': '“29% of your financial portfolio depends on Microsoft.”',
      'lp.b1.t': 'Understand what your money depends on.',
      'lp.b1.d': 'See which positions carry the most weight and how your wealth is distributed.',
      'lp.b2.t': 'Spot the changes that matter.',
      'lp.b2.d': 'Understand what has changed in your portfolio and what deserves a closer review.',
      'lp.b2.note': 'Builds on the history AURIX records from the day you add your investments.',
      'lp.b3.t': 'Find answers in your own data.',
      'lp.b3.d': 'Ask questions about your investments and see what’s behind each conclusion.',
      'lp.how.title': 'Start with the investments you already have.',
      'lp.s1.t': 'Sign up with your email.', 'lp.s1.d': 'Create your free account.',
      'lp.s2.t': 'Add your investments.', 'lp.s2.d': 'Bring your positions together in one place.',
      'lp.s3.t': 'See what deserves your attention.', 'lp.s3.d': 'Check your wealth and get your first Intelligence reading.',
      'lp.how.note': 'You record your positions yourself. No banking credentials needed.',
      'lp.trk.eyebrow': 'DASHBOARD AND TRACKING',
      'lp.trk.title': 'Your wealth changes. Keep the bigger picture.',
      'lp.trk.text': 'See how much you have, how it is distributed and how it evolves.',
      'lp.trk.ctx': 'Organise stocks, ETFs, funds, crypto, metals, real estate and cash. AURIX updates the prices of listed assets and builds your wealth history as you use it.',
      'lp.alt.positions': 'Positions in the Stocks category in AURIX, with the demo portfolio',
      'lp.mkt.note': 'Interface shown in Spanish',
      'lp.ws.title': 'Put numbers on your next goals.',
      'lp.ws.text': 'Plan a goal, compare scenarios and organise your budget.',
      'lp.ws.e1.t': 'Goals.', 'lp.ws.e1.d': 'Turn your aspirations into measurable goals.',
      'lp.ws.e2.t': 'Scenarios.', 'lp.ws.e2.d': 'Compare decisions before you make them.',
      'lp.ws.e3.t': 'Budgets.', 'lp.ws.e3.d': 'Track income, spending and what’s left to save.',
      'lp.ws.note': 'Included with Premium. Each plan is saved to your account so you can pick it up later.',
      'lp.trust.title': 'Clarity and control, from the start',
      'lp.t1.t': 'No access to your money.', 'lp.t1.d': 'AURIX does not connect to your bank or broker and cannot move funds.',
      'lp.t2.t': 'Insight, not advice.', 'lp.t2.d': 'It explains your own data and never tells you what to buy or sell.',
      'lp.t3.t': 'A clear subscription.', 'lp.t3.d': 'Payments are processed by Stripe and AURIX does not store your card. Cancel anytime from “Manage my plan”.',
      'lp.t4.t': 'Email support.', 'lp.t4.d': 'Write to us from the', 'lp.t4.link': 'Support page',
      'lp.plans.title': 'Start free. Go deeper with Premium.',
      'lp.free.3': 'Market: follow indices and assets',
      'lp.free.4': 'Your first Intelligence reading of your portfolio’s composition',
      'lp.price.year': '€69.99', 'lp.price.year.per': 'per year',
      'lp.price.year.note': 'One annual payment, equivalent to €5.83 a month: 27% less than paying monthly.',
      'lp.prem.1': 'Full Intelligence: dependencies, scenarios and what has changed in your portfolio, plus answers to questions about your own data',
      'lp.prem.2': 'Every Workspace tool: budgets, goals, scenarios, loans, compound interest and more',
      'lp.price.terms': 'Renewing subscription. Cancel anytime from “Manage my plan”.',
      'lp.faq.0.q': 'What is AURIX?',
      'lp.faq.0.a': 'A wealth intelligence platform for individual investors. You bring your investments together in one place, Intelligence helps you understand what your wealth depends on and what is changing, and Workspace lets you plan with your own numbers.',
      'lp.faq.6.a': 'Stocks, ETFs, funds, crypto, metals, real estate and cash. AURIX updates the prices of listed assets; you enter the value of the rest yourself.',
      'lp.faq.2.q': 'Does AURIX connect to my bank or broker?',
      'lp.faq.2.a': 'No. You record your positions by hand and AURIX updates the prices of listed assets. It does not need your banking credentials and cannot move your money.',
      'lp.faq.1.a': 'Record all your positions, see your wealth, its split and evolution, follow the market and get a first Intelligence reading of your portfolio’s composition. Premium adds full Intelligence, every Workspace tool and saving your plans.',
      'lp.faq.7.a': 'It reads your portfolio and explains it: which positions it depends on, how it is split and what has changed in a meaningful way. Anything about changes builds on the history AURIX records from the day you add your investments. Free includes a first reading, which appears once every asset has an available price and currency; Premium unlocks the full analysis.',
      'lp.faq.3.a': 'Monthly (€7.99 a month) or annual (€69.99, in a single yearly charge). The subscription renews automatically at the end of each period until you cancel it from “Manage my plan” in the app. Payments are processed by Stripe; AURIX does not store your card.',
      'lp.faq.4.q': 'Does AURIX tell me what to buy or sell?',
      'lp.faq.4.a': 'No. AURIX organises and explains your wealth; it does not give financial advice or investment recommendations.',
      'lp.final.title': 'Get a clearer understanding of what you’ve already built.',
  });

  // LANDING COMERCIAL V2 · refinamiento: demostración interactiva y cápsula enlazada del hero.
  // Sobrescribe sólo lo que cambia (el resto de V1 sigue vigente).
  Object.assign(I18N.es, {
      'lp.intel.eyebrow': 'AURIX Intelligence',
      'lp.hot.aria': 'Salud: A vigilar · Ver análisis en AURIX Intelligence',
  });
  Object.assign(I18N.en, {
      'lp.intel.eyebrow': 'AURIX Intelligence',
      'lp.hot.aria': 'Health: Worth watching · View analysis in AURIX Intelligence',
  });

  // LANDING V3 · sufijo de porcentaje (ES con espacio fino) y texto alternativo del hero con su cifra.
  Object.assign(I18N.es, {
      'lp.alt.hero': 'Dashboard de AURIX con una cartera de demostración: patrimonio invertible de 186.055,38\u00a0US$, evolución de 24 horas y reparto por categorías',
  });
  Object.assign(I18N.en, {
      'lp.alt.hero': 'AURIX Dashboard with a demo portfolio: investable wealth of $186,055.38, 24-hour evolution and split by category',
  });

  // INTELLIGENCE V2 + PREMIUM POR MODALIDAD (docs/AURIX-LANDING-INTELLIGENCE-PREMIUM-SPEC.md).
  // El copy de Intelligence es el APROBADO, literal. Pregunta y respuesta son las del motor sobre la
  // cartera de demostración (scripts/aurix-landing-captures.mjs --intel-v2 las comprueba antes de capturar).
  Object.assign(I18N.es, {
      'lp.intel.title.a': 'Convierte tus inversiones en información,',
      'lp.intel.title.b': 'toma mejores decisiones desde hoy.',
      'lp.intel.sub': 'Obtén tu análisis al instante y descubre qué riesgos podrías estar ignorando',
      'lp.iv2.alt': 'AURIX Intelligence con una cartera de demostración: Microsoft, Bitcoin y Apple pesan más que tus otras 9 inversiones juntas. Acciones: 51% de tu cartera. Bitcoin: +1,2% en 24 h.',
      'lp.iv2.alt.drivers': 'Factores principales: Microsoft 29%, Bitcoin 22%, Apple 18%. Tus 3 mayores inversiones reúnen el 69% de tu cartera financiera.',
      'lp.iv2.alt.explore': 'Explora tu patrimonio: ¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones? ¿Qué parte de mi cartera está entre Acciones y Cripto? ¿Qué margen tengo para afrontar imprevistos o nuevas oportunidades?',
      'lp.iv2.q1': '¿Estoy repartido entre varias clases o sigo dependiendo de pocas inversiones?',
      'lp.iv2.a1_1': 'Repartes entre 4 clases de inversión, pero no tanto entre posiciones: el peso sigue recayendo en tus tres mayores inversiones.',
      'lp.iv2.a1_2': 'Clases: Acciones, Cripto, Fondos/ETF y Metales. Tres mayores: Microsoft, Bitcoin y Apple.',
      'lp.iv2.q2': '¿Qué parte de mi cartera está entre Acciones y Cripto?',
      'lp.iv2.a2_1': 'Acciones y Cripto reúnen hoy el 92% de tu cartera financiera.',
      'lp.iv2.a2_2': 'Acciones, 51%; Cripto, 41%.',
      // Pregunta 3: adaptación EDITORIAL de la demostración (autorizada por dirección, 2026-10-23); el 7 % es la
      // liquidez de la cartera de demo (7,16 %, motor) redondeada. No es una lectura literal de Explora.
      'lp.iv2.q3': '¿Qué margen tengo para afrontar imprevistos o nuevas oportunidades?',
      'lp.iv2.a3_1': 'Mantienes un 7 % en liquidez. Revisa si este margen cubre tus necesidades previstas y posibles imprevistos',
      'lp.iv2.radar': 'Historial analizado: 1 día',
      'lp.plan.annual': 'Anual',
      'lp.plan.monthly': 'Mensual',
      'lp.price.month': '7,99\u00a0€', 'lp.price.month.per': 'al mes',
      'lp.cta.annual': 'Elegir anual',
      'lp.login': 'Entrar',
      'lp.cta.monthly': 'Elegir mensual',
  });
  Object.assign(I18N.en, {
      'lp.intel.title.a': 'Turn your investments into insights,',
      'lp.intel.title.b': 'make better-informed decisions today.',
      'lp.intel.sub': 'Get your analysis instantly and discover risks you might be ignoring.',
      'lp.iv2.alt': 'AURIX Intelligence with a demo portfolio: Microsoft, Bitcoin and Apple outweigh your other 9 investments combined. Stocks: 51% of your portfolio. Bitcoin: +1.2% in 24 h.',
      'lp.iv2.alt.drivers': 'Key drivers: Microsoft 29%, Bitcoin 22%, Apple 18%. Your 3 largest investments hold 69% of your financial portfolio.',
      'lp.iv2.alt.explore': 'Explore your wealth: Am I spread across several investment classes, or do I still depend on a few investments? How much of my portfolio is in Stocks and Crypto? How much room do I have for unexpected expenses or new opportunities?',
      'lp.iv2.q1': 'Am I spread across several investment classes, or do I still depend on a few investments?',
      'lp.iv2.a1_1': 'You spread across 4 investment classes, but less so across positions: the weight still rests on your three largest investments.',
      'lp.iv2.a1_2': 'Classes: Stocks, Crypto, ETF / Funds and Metals. Three largest: Microsoft, Bitcoin and Apple.',
      'lp.iv2.q2': 'How much of my portfolio is in Stocks and Crypto?',
      'lp.iv2.a2_1': 'Stocks and Crypto together hold 92% of your financial portfolio today.',
      'lp.iv2.a2_2': 'Stocks, 51%; Crypto, 41%.',
      'lp.iv2.q3': 'How much room do I have for unexpected expenses or new opportunities?',
      'lp.iv2.a3_1': 'You hold 7% in cash. Check whether this covers your expected needs and unexpected expenses.',
      'lp.iv2.radar': 'History analysed: 1 day',
      'lp.plan.annual': 'Annual',
      'lp.plan.monthly': 'Monthly',
      'lp.price.month': '€7.99', 'lp.price.month.per': 'per month',
      'lp.cta.annual': 'Choose annual',
      'lp.login': 'Log in',
      'lp.cta.monthly': 'Choose monthly',
  });

  // AURIX-AFFILIATES-V1 · aviso de recomendación (sólo aparece con un `?ref=`).
  Object.assign(I18N.es, {
      'ref.title': 'Has llegado por una recomendación',
      'ref.body': '¿Recordamos el código de quien te recomendó en este navegador, hasta 30 días, para atribuirle tu registro si te das de alta más tarde? Sólo se guarda el código y la fecha. Si no aceptas, no se guarda nada y la recomendación sólo cuenta si te registras ahora.',
      'ref.accept': 'Sí, recordarlo',
      'ref.decline': 'No, gracias',
      'ref.more': 'Privacidad',
  });
  Object.assign(I18N.en, {
      'ref.title': 'You arrived through a referral',
      'ref.body': 'May we remember the referrer’s code in this browser, for up to 30 days, so your sign-up is credited to them if you join later? Only the code and the date are stored. If you decline, nothing is stored and the referral only counts if you sign up now.',
      'ref.accept': 'Yes, remember it',
      'ref.decline': 'No, thanks',
      'ref.more': 'Privacy',
  });

  var LS_KEY = 'aurix_lang';
  // M.03 · B — ELECCIÓN EXPLÍCITA vs IDIOMA POR DEFECTO.
  //
  // `aurix_lang` se escribe en CADA `applyLang()`, también en la del arranque, así
  // que su presencia nunca distinguió "el usuario eligió ES/EN aquí" de "la landing
  // se pintó en su idioma por defecto". Sin esa distinción el CTA afirmaba
  // `?lang=en` para TODO EL MUNDO, y como el app-side trata `?lang=` como una
  // elección explícita que gana, un usuario que había elegido español DENTRO de
  // Aurix volvía a entrar por la landing y se encontraba la app en inglés.
  //
  // La clave de elección es NUEVA a propósito: los contenedores que ya tienen
  // `aurix_lang` escrito por la ruta por defecto no pueden quedar marcados
  // retroactivamente como una elección que nunca hicieron.
  var LS_CHOICE_KEY = 'aurix_lang_choice';
  var lang = 'en';
  var langExplicit = false;

  function detectLang() {
    // English by default. Spanish stays available via the ES/EN toggle and is
    // remembered once chosen — we no longer auto-switch from the browser locale.
    var choice;
    // Un enlace con `?lang=es|en` (p. ej. compartido desde una campaña) es una elección explícita.
    try { var q = new URLSearchParams(location.search).get('lang'); if (q === 'es' || q === 'en') { langExplicit = true; return q; } } catch (_) {}
    try { choice = localStorage.getItem(LS_CHOICE_KEY); } catch (_) {}
    if (choice === 'es' || choice === 'en') { langExplicit = true; return choice; }
    var stored;
    try { stored = localStorage.getItem(LS_KEY); } catch (_) {}
    if (stored === 'es' || stored === 'en') return stored;
    return 'en';
  }

  function applyLang(next, explicit) {
    lang = (next === 'en') ? 'en' : 'es';
    var dict = I18N[lang];
    document.documentElement.lang = lang;
    try { localStorage.setItem(LS_KEY, lang); } catch (_) {}
    if (explicit === true) {
      langExplicit = true;
      try { localStorage.setItem(LS_CHOICE_KEY, lang); } catch (_) {}
    }

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      if (dict[key] != null) nodes[i].textContent = dict[key];
    }
    // Capturas del producto en el idioma activo (mismos datos ficticios) y su texto alternativo.
    // Sin data-i18n-src (Dashboard, Intelligence) sólo existe una versión: se localiza el alt, no el archivo.
    var imgs = document.querySelectorAll('img[data-i18n-alt]');
    for (var m = 0; m < imgs.length; m++) {
      var sk = imgs[m].getAttribute('data-i18n-src');
      if (sk) imgs[m].setAttribute('src', 'assets/' + sk + '-' + lang + '.jpg');
      var ak = imgs[m].getAttribute('data-i18n-alt'); if (ak && dict[ak] != null) imgs[m].setAttribute('alt', dict[ak]);
    }
    // LANDING COMERCIAL V1 · plantillas con `{lang}`: srcset del hero (<img> y <source> móvil) y el
    // enlace a la captura completa de Intelligence. Misma resolución de idioma, ninguna regla nueva.
    var tsets = document.querySelectorAll('[data-i18n-srcset]');
    for (var ts = 0; ts < tsets.length; ts++) {
      var tpl = tsets[ts].getAttribute('data-i18n-srcset').replace(/\{lang\}/g, lang);
      if (tsets[ts].getAttribute('srcset') !== tpl) tsets[ts].setAttribute('srcset', tpl);
      if (tsets[ts].tagName === 'IMG') {
        var first = tpl.split(/\s+/)[0];
        if (tsets[ts].getAttribute('src') !== first) tsets[ts].setAttribute('src', first);
      }
    }
    var threfs = document.querySelectorAll('[data-i18n-href]');
    for (var th = 0; th < threfs.length; th++) threfs[th].setAttribute('href', threfs[th].getAttribute('data-i18n-href').replace(/\{lang\}/g, lang));
    var arias = document.querySelectorAll('[data-i18n-aria]');
    for (var n = 0; n < arias.length; n++) { var rk = arias[n].getAttribute('data-i18n-aria'); if (dict[rk] != null) arias[n].setAttribute('aria-label', dict[rk]); }
    // Reflect active state on every language toggle (header + mobile)
    var btns = document.querySelectorAll('.lang-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle('active', btns[j].getAttribute('data-lang') === lang);
    }
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

    // Keep "Enter Aurix" links carrying the active language across origins.
    updateAppLinks();
    // Y lo mismo con las legales: viven en el dominio de la app, así que sin
    // `?lang=` un lector en inglés abriría Privacidad en español.
    updateLegalLinks();
    updateLoginLinks();
    // V2 · el idioma cambia longitudes de texto: la esfera recalcula su recorrido.
    try { window.dispatchEvent(new Event('aurix:lang')); } catch (_) {}
  }

  // Fictional headline wealth figure (labelled "Product preview"). ES: 4,82 M€ · EN: $4.82M
  var WEALTH_TARGET = 4.82;
  function fmtWealth(n) {
    return lang === 'en' ? ('$' + n.toFixed(2) + 'M') : (n.toFixed(2).replace('.', ',') + ' M€');
  }

  function t(key) { return (I18N[lang] && I18N[lang][key]) || (I18N.es[key]) || ''; }

  /* ── Market preview (illustrative) ──────────────────── */
  // Datasets are clearly a product preview — no real-time data, brands or return
  // promises. `line` is an SVG path over a 640×200 viewBox; the area is closed to
  // the baseline. The symbol label mirrors the active (localized) tab.
  var MK_DATA = [
    { val:5432.18, dec:2, pre:'', delta:'+1.24%', up:true,
      line:'M0,150 C60,140 110,150 170,120 C230,92 280,108 340,78 C400,52 460,70 520,44 C580,24 610,34 640,26' },
    { val:318.40, dec:2, pre:'', delta:'+0.86%', up:true,
      line:'M0,140 C70,138 120,120 180,118 C250,116 300,96 360,92 C430,88 480,70 540,64 C590,60 620,52 640,50' },
    { val:67920, dec:0, pre:'$', delta:'+3.10%', up:true,
      line:'M0,162 C50,150 90,172 140,120 C190,72 240,140 300,96 C360,54 410,122 470,70 C520,30 590,52 640,28' },
    { val:2384.50, dec:2, pre:'$', delta:'−0.42%', up:false,
      line:'M0,70 C60,66 110,84 170,90 C230,96 280,86 340,104 C400,120 460,110 520,128 C580,144 610,138 640,150' },
    { val:17210, dec:0, pre:'', delta:'+0.92%', up:true,
      line:'M0,150 C70,146 120,130 180,126 C250,120 300,104 360,100 C430,94 480,72 540,66 C600,60 620,52 640,46' },
    { val:3480.75, dec:2, pre:'', delta:'+0.54%', up:true,
      line:'M0,138 C70,134 120,128 180,118 C250,108 300,108 360,96 C430,84 480,80 540,68 C600,58 620,58 640,52' }
  ];

  function initMarket() {
    var panel = document.getElementById('marketPanel');
    if (!panel) return;
    var symEl = document.getElementById('mkSymbol');
    var priceEl = document.getElementById('mkPrice');
    var deltaEl = document.getElementById('mkDelta');
    var lineEl = document.getElementById('mkLine');
    var areaEl = document.getElementById('mkArea');
    var tabs = panel.querySelectorAll('.mk-tab');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var current = -1, rafId = 0;

    // Locale-aware grouping/decimal separators (EN 1,234.5 · ES 1.234,5).
    function fmt(n, dec, pre) {
      var fixed = dec ? n.toFixed(dec) : String(Math.round(n));
      var parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
      return pre + (parts.length > 1 ? parts[0] + (lang === 'en' ? '.' : ',') + parts[1] : parts[0]);
    }
    function countTo(target, dec, pre) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (reduce) { priceEl.textContent = fmt(target, dec, pre); return; }
      var dur = 720, start = null;
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        priceEl.textContent = fmt(target * eased, dec, pre);
        if (p < 1) rafId = requestAnimationFrame(step);
        else { priceEl.textContent = fmt(target, dec, pre); rafId = 0; }
      }
      rafId = requestAnimationFrame(step);
    }
    function drawLine() {
      if (reduce || !lineEl.getTotalLength) return;
      var len = lineEl.getTotalLength();
      lineEl.style.transition = 'none';
      lineEl.style.strokeDasharray = len;
      lineEl.style.strokeDashoffset = len;
      void lineEl.getBoundingClientRect(); // reflow so the reset takes effect
      lineEl.style.transition = 'stroke-dashoffset 1.1s var(--ease)';
      lineEl.style.strokeDashoffset = '0';
    }
    function select(i, animate) {
      if (i === current) return;
      current = i;
      var d = MK_DATA[i];
      for (var k = 0; k < tabs.length; k++) {
        tabs[k].classList.toggle('is-active', k === i);
        tabs[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
      }
      symEl.textContent = tabs[i] ? tabs[i].textContent : '';
      deltaEl.textContent = d.delta;
      deltaEl.classList.toggle('up', d.up);
      deltaEl.classList.toggle('down', !d.up);
      lineEl.setAttribute('d', d.line);
      areaEl.setAttribute('d', d.line + ' L640,200 L0,200 Z');
      if (animate) { countTo(d.val, d.dec, d.pre); drawLine(); }
      else { priceEl.textContent = fmt(d.val, d.dec, d.pre); }
    }

    for (var k = 0; k < tabs.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          select(parseInt(btn.getAttribute('data-mk'), 10) || 0, true);
        });
      })(tabs[k]);
    }

    select(0, false); // static first paint
    if (reduce || !('IntersectionObserver' in window)) {
      countTo(MK_DATA[0].val, MK_DATA[0].dec, MK_DATA[0].pre);
    } else {
      var mio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          mio.unobserve(en.target);
          current = -1; select(0, true); // animate on first entry
        });
      }, { threshold: 0.4 });
      mio.observe(panel);
    }
  }

  // AURIX-LANDING-PREMIUM-PASS-1: single source of truth for the private-app
  // URL. Every "Enter Aurix" link ([data-app-link]) points here.
  // El subdominio canónico ya está vivo, así que el TODO queda resuelto: este
  // owner reescribe el `href` de CADA CTA en `updateAppLinks()`, de modo que
  // mientras apuntara al host antiguo ganaba siempre al href correcto que el
  // HTML ya traía. Debe coincidir con el `href` del markup (mismo destino con y
  // sin JS).
  var APP_URL = 'https://app.aurixsystem.io/';

  // AURIX-WAITLIST-1: lead-capture endpoint (Vercel, same backend as the app API).
  var WAITLIST_ENDPOINT = 'https://isa-portfolio-ten.vercel.app/api/waitlist';

  // Cross-origin language handoff: localStorage is NOT shared between
  // aurixsystem.io and the app origin, so we pass the active language on every
  // "Enter Aurix" link; login.html / index.html read it into 'portfolio_lang'.
  //
  // M.03 · B — DOS PARÁMETROS, DOS AFIRMACIONES DISTINTAS:
  //   `lang=`     · el usuario ELIGIÓ este idioma en la landing → gana siempre.
  //   `langhint=` · es sólo el idioma con el que la landing se estaba mostrando →
  //                 se aplica únicamente si el contenedor de la app no tiene ya
  //                 una preferencia guardada.
  // Un único valor persistido en la app (`portfolio_lang`) sigue siendo la
  // autoridad; esto sólo evita que la landing afirme una elección inexistente.
  function appUrlForLang() {
    var v = (lang === 'en' ? 'en' : 'es');
    return APP_URL + '?' + (langExplicit ? 'lang=' : 'langhint=') + v;
  }
  // INTENCIÓN PREMIUM — el CTA «descubrir Premium» lo dice en el enlace (`intent=premium`) y la app
  // abre los planes UNA vez al llegar; los demás CTA no llevan intención, y su entrada la borra.
  // Sólo navegación: no concede nada ni elige compra.
  function updateAppLinks() {
    var links = document.querySelectorAll('[data-app-link]');
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('href', appUrlWithRef());
      if (links[i].getAttribute('data-app-intent') === 'premium') {
        // `plan` = la modalidad que el visitante eligió (annual|monthly). La app sólo la RESALTA en sus
        // planes: no inicia el cobro. Sin `data-app-plan`, Premium sin modalidad, como antes.
        var pl = links[i].getAttribute('data-app-plan');
        links[i].setAttribute('href', links[i].getAttribute('href') + '&intent=premium' + (pl === 'annual' || pl === 'monthly' ? '&plan=' + pl : ''));
      }
    }
  }
  // «Entrar» / «Log in» de la cabecera: la entrada NORMAL de la app (con sesión válida → la cuenta; sin
  // sesión → el acceso), con el idioma. Sin intención Premium, sin modalidad y sin referido: es para quien
  // ya tiene cuenta. La app trata una entrada sin `intent` como «borrar intención» (no reabre los planes).
  function updateLoginLinks() {
    var links = document.querySelectorAll('[data-app-login]');
    for (var i = 0; i < links.length; i++) links[i].setAttribute('href', appUrlForLang());
  }
  // Soporte y legales: páginas PÚBLICAS servidas por el dominio de la app. El
  // idioma viaja en `?lang=` (elección explícita, no una pista): quien está
  // leyendo la landing en inglés no debe aterrizar en un texto legal en español.
  var LEGAL_URLS = { privacy: 'privacy.html', terms: 'terms.html', support: 'support.html' };
  function updateLegalLinks() {
    var v = (lang === 'en' ? 'en' : 'es');
    var links = document.querySelectorAll('[data-legal-link]');
    for (var i = 0; i < links.length; i++) {
      var page = LEGAL_URLS[links[i].getAttribute('data-legal-link')];
      if (page) links[i].setAttribute('href', APP_URL + page + '?lang=' + v);
    }
  }

  /* ── AURIX-AFFILIATES-V1 · ATRIBUCIÓN DE PRIMERA PARTE ──────────────────────
     Un enlace de afiliado es `aurixsystem.io/?ref=123456` (6 dígitos exactos; lo
     demás se ignora). Aurix NO calcula comisiones: sólo traslada a la app de qué
     códigos vino este visitante, y la BD lo fija UNA vez, al registrarse.

     CONSENTIMIENTO. Sin él no se guarda NADA en el dispositivo: el código viaja
     sólo en el enlace a la app (vale si se registra en esta misma visita). Con
     él, hasta 5 códigos DISTINTOS {code, seenAt} en orden de primera vista, en
     localStorage, y se podan los de más de 30 días. El aviso sale SÓLO si hay
     un `ref` válido en la URL: un visitante normal no ve ningún banner.
     Si llega un sexto código distinto se descarta el más antiguo (la ventana
     siempre son las 5 recomendaciones más recientes).

     VISITAS Y REGISTRO. Con un `?ref=` se llama UNA vez por carga a
     `aurix_affiliate_click` (PostgREST, clave publicable): cuenta la visita y
     dice si el código existe y está activo en el registro de Founder. Sólo si
     vale se muestra el aviso, se guarda (con permiso) y se lleva a la app. No
     guarda nada en el dispositivo, así que no necesita consentimiento.

     HACIA LA APP. Con toques, el CTA lleva a `login.html` (no a la raíz: la raíz
     redirige al acceso SIN conservar la query) con `aref=<code>-<seg36>.…` y,
     si hubo consentimiento, `aconsent=1`. Las funciones puras de este bloque
     (entre los marcadores) las ejecuta el harness tal cual. */
  /* AURIX-REF:BEGIN */
  var REF_RE = /^[0-9]{6}$/;
  var REF_MAX = 5;
  var REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var REF_LS_KEY = 'aurix_ref_touches';
  var REF_CONSENT_KEY = 'aurix_ref_consent';
  function refFromSearch(search) {
    var m = /[?&]ref=([^&#]*)/.exec(String(search || ''));
    if (!m) return null;
    var v = m[1];
    try { v = decodeURIComponent(v); } catch (_) { return null; }
    return REF_RE.test(v) ? v : null;
  }
  // Limpia, deduplica, poda (>30 días o fecha futura imposible) y ordena por
  // primera vista. Nunca devuelve más de REF_MAX.
  function refPrune(touches, nowMs) {
    var out = [], seen = {};
    var list = Array.isArray(touches) ? touches : [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || typeof t.code !== 'string' || !REF_RE.test(t.code)) continue;
      var at = Date.parse(t.seenAt);
      if (!isFinite(at) || at < nowMs - REF_TTL_MS || at > nowMs + 5 * 60 * 1000) continue;
      if (seen[t.code]) continue;
      seen[t.code] = 1;
      out.push({ code: t.code, seenAt: new Date(at).toISOString() });
    }
    out.sort(function (a, b) { return Date.parse(a.seenAt) - Date.parse(b.seenAt); });
    return out.length > REF_MAX ? out.slice(out.length - REF_MAX) : out;
  }
  function refMerge(touches, code, nowMs) {
    var list = refPrune(touches, nowMs);
    if (code && REF_RE.test(code)) {
      var has = false;
      for (var i = 0; i < list.length; i++) if (list[i].code === code) has = true;
      if (!has) list.push({ code: code, seenAt: new Date(nowMs).toISOString() });
    }
    return refPrune(list, nowMs);
  }
  // Compacto y seguro en URL: `123456-<segundos en base 36>` separados por `.`.
  function refEncode(touches) {
    var parts = [];
    for (var i = 0; i < touches.length && i < REF_MAX; i++) {
      parts.push(touches[i].code + '-' + Math.floor(Date.parse(touches[i].seenAt) / 1000).toString(36));
    }
    return parts.join('.');
  }
  /* AURIX-REF:END */

  var REF_URL_CODE = null;     // el `?ref=` de ESTA carga, si tiene forma válida
  var REF_TOUCHES = [];        // VALIDADOS por el registro; en disco sólo con consentimiento
  var REF_UNVERIFIED = [];     // el de esta visita si el registro no respondió: sólo URL, nunca disco
  var REF_CONSENT = false;
  function refStorageGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function refPersist() {
    if (!REF_CONSENT) return;   // sin consentimiento, ni una escritura
    try {
      if (REF_TOUCHES.length) localStorage.setItem(REF_LS_KEY, JSON.stringify(REF_TOUCHES));
      else localStorage.removeItem(REF_LS_KEY);
    } catch (_) {}
  }
  // EL REGISTRO DECIDE. Sólo un código que Founder declaró y que está activo
  // AHORA vale (`aurix_affiliate_click` → {valid}). Válido: se recuerda (con
  // consentimiento), se pide el consentimiento y viaja a la app. Inválido: se
  // ignora del todo. Sin respuesta: viaja en el enlace de ESTA visita y nada más
  // (la BD lo vuelve a validar al capturar).
  function initReferral() {
    var now = Date.now();
    REF_URL_CODE = refFromSearch(location.search);
    REF_CONSENT = refStorageGet(REF_CONSENT_KEY) === '1';
    var stored = [];
    if (REF_CONSENT) { try { stored = JSON.parse(refStorageGet(REF_LS_KEY) || '[]'); } catch (_) { stored = []; } }
    REF_TOUCHES = refPrune(stored, now);
    refPersist();
    if (!REF_URL_CODE) return null;
    var code = REF_URL_CODE;
    return checkReferralCode(code).then(function (valid) {
      if (valid === true) {
        REF_TOUCHES = refMerge(REF_TOUCHES, code, Date.now());
        refPersist();
        if (!REF_CONSENT) showReferralNotice();
      } else if (valid === null) {
        REF_UNVERIFIED = refMerge([], code, Date.now());
      }
      updateAppLinks();
    });
  }
  function appUrlWithRef() {
    var base = appUrlForLang();
    var all = REF_UNVERIFIED.length ? refMerge(REF_TOUCHES.concat(REF_UNVERIFIED), null, Date.now()) : REF_TOUCHES;
    if (!all.length) return base;
    return APP_URL + 'login.html' + base.slice(APP_URL.length)
      + '&aref=' + refEncode(all) + (REF_CONSENT ? '&aconsent=1' : '');
  }
  // Cuenta la visita Y pregunta si el código vale. true / false / null (sin respuesta).
  var AURIX_SUPABASE_URL = 'https://ozcasyufbknnuemllwso.supabase.co';
  var AURIX_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_wlZsjnPGXay9jsRqcXA08Q_bVhmI7sU';
  function checkReferralCode(code) {
    try {
      if (typeof fetch !== 'function') return Promise.resolve(null);
      return fetch(AURIX_SUPABASE_URL + '/rest/v1/rpc/aurix_affiliate_click', {
        method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', apikey: AURIX_SUPABASE_PUBLISHABLE_KEY,
                   Authorization: 'Bearer ' + AURIX_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ p_code: code })
      }).then(function (r) {
        if (!r || !r.ok) return null;
        return r.json().then(function (j) {
          return (j && typeof j.valid === 'boolean') ? j.valid : null;
        }, function () { return null; });
      }, function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }
  function showReferralNotice() {
    if (document.getElementById('refNotice')) return;
    var box = document.createElement('section');
    box.id = 'refNotice';
    box.className = 'ref-notice';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-labelledby', 'refNoticeTitle');
    box.innerHTML =
      '<p class="ref-notice-title" id="refNoticeTitle" data-i18n="ref.title"></p>' +
      '<p class="ref-notice-body" data-i18n="ref.body"></p>' +
      '<div class="ref-notice-actions">' +
        '<button type="button" class="ref-btn ref-btn-primary" data-ref-consent="1" data-i18n="ref.accept"></button>' +
        '<button type="button" class="ref-btn" data-ref-consent="0" data-i18n="ref.decline"></button>' +
        '<a class="ref-more" data-legal-link="privacy" href="' + APP_URL + 'privacy.html" data-i18n="ref.more"></a>' +
      '</div>';
    var nodes = box.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    box.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-ref-consent]') : null;
      if (!b) return;
      if (b.getAttribute('data-ref-consent') === '1') {
        REF_CONSENT = true;
        try { localStorage.setItem(REF_CONSENT_KEY, '1'); } catch (_) {}
        refPersist();
      }
      // Rechazar no guarda NADA (tampoco un "no"): el aviso volverá con el
      // próximo enlace de recomendación, y mientras tanto el código sólo viaja
      // en el enlace a la app.
      if (box.parentNode) box.parentNode.removeChild(box);
      updateAppLinks();
    });
    document.body.appendChild(box);
    updateLegalLinks();
  }

  /* ── Init ───────────────────────────────────────────── */
  // WSPHERE.V3 #4 — desktop-only reflective sweep on the Intelligence orb. A soft
  // highlight follows the cursor across the sphere (transform-moved, rAF-throttled)
  // and fades when the pointer leaves. No-op on touch / reduced-motion / narrow screens.
  function initOrbSheen() {
    var orb = document.getElementById('intelOrb');
    if (!orb) return;
    var mq = window.matchMedia;
    if (!mq || !mq('(min-width: 861px) and (pointer: fine)').matches) return;
    if (mq('(prefers-reduced-motion: reduce)').matches) return;
    var sheen = orb.querySelector('.io-sheen');
    if (!sheen) return;
    var raf = 0, x = 0, y = 0, bw = 0, bh = 0;
    function apply() {
      raf = 0;
      // Centre the 62%-sized blob under the cursor (translate in px = GPU-cheap).
      sheen.style.setProperty('--io-sx', (x - bw * 0.31) + 'px');
      sheen.style.setProperty('--io-sy', (y - bh * 0.31) + 'px');
      orb.classList.add('is-sheen');
    }
    orb.addEventListener('pointermove', function (e) {
      var b = sheen.getBoundingClientRect();
      if (!b.width) return;
      x = e.clientX - b.left; y = e.clientY - b.top; bw = b.width; bh = b.height;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    orb.addEventListener('pointerleave', function () { orb.classList.remove('is-sheen'); });
  }


  /* ── LANDING V3 · entrada del dashboard del hero ─────────────────────────────
     Tres piezas de la captura, ya en su sitio: la cifra (HTML, Inter, mismo formato que la app) cuenta
     hasta 186.055,38; la curva se revela de izquierda a derecha (clip) y el donut en sentido horario
     (máscara cónica). Sin puntos nuevos ni proporciones distintas: son las capas reales recortadas.
     Una vez por carga, al entrar el dashboard de forma significativa (≥35 %); ~1,1 s; los enlaces y
     botones funcionan desde el principio. Cambiar de idioma resuelve la cifra al instante. */
  var HERO_VALUE = 186055.38;
  function heroFmt(v) {
    try { return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES', { style: 'currency', currency: 'USD' }).format(v); }
    catch (_) { return lang === 'en' ? '$' + v.toFixed(2) : v.toFixed(2).replace('.', ',') + ' US$'; }
  }
  function initHeroIntro() {
    var root = document.documentElement, shot = document.getElementById('heroShot');
    var val = shot && shot.querySelector('[data-hero-val]');
    var curve = shot && shot.querySelector('.hero-curve'), donut = shot && shot.querySelector('.hero-donut');
    var st = { playing: false, done: false, raf: 0 };
    function final() {
      if (val) val.textContent = heroFmt(HERO_VALUE);
      if (curve) curve.style.clipPath = '';
      if (donut) { donut.style.webkitMaskImage = ''; donut.style.maskImage = ''; }
    }
    function finish() { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; st.playing = false; st.done = true; final(); }
    window.addEventListener('aurix:lang', function () { if (st.playing) finish(); else if (val) val.textContent = heroFmt(st.done || !root.classList.contains('lp-anim') ? HERO_VALUE : 0); });
    var anim = root.classList.contains('lp-anim') && !root.classList.contains('lp-anim-off') && shot && val && window.requestAnimationFrame && 'IntersectionObserver' in window;
    if (!anim) { root.classList.add('lp-armed'); st.done = true; final(); return; }
    var ease = function (u) { return 1 - Math.pow(1 - u, 3); };
    var inout = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
    function set(t) {                                 // t en ms desde el inicio
      var a = ease(Math.min(1, t / 1100)), c = inout(Math.max(0, Math.min(1, (t - 60) / 1000))), d = ease(Math.max(0, Math.min(1, (t - 140) / 900)));
      val.textContent = heroFmt(a >= 1 ? HERO_VALUE : HERO_VALUE * a);
      if (curve) curve.style.clipPath = c >= 1 ? '' : 'inset(0 ' + ((1 - c) * 100).toFixed(3) + '% 0 0)';
      if (donut) { var m = d >= 1 ? '' : 'conic-gradient(#000 ' + (d * 360).toFixed(2) + 'deg, transparent 0deg)'; donut.style.webkitMaskImage = m; donut.style.maskImage = m; }
    }
    set(0);
    root.classList.add('lp-armed');                   // el estado inicial ya lo llevan los estilos en línea
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting || en[0].intersectionRatio < 0.35 || st.done || st.playing) return;
      io.disconnect(); st.playing = true;
      var t0 = 0;
      (function step(now) {
        if (!st.playing) return;
        if (!t0) t0 = now;
        set(now - t0);
        if (now - t0 < 1140) st.raf = requestAnimationFrame(step); else finish();
      })(performance.now());
    }, { threshold: [0, 0.35, 0.6] });
    io.observe(shot);
  }

  /* ── INTELLIGENCE V2 · las tres preguntas de «Explora» y el arco de Salud ────────────
     Como en el producto, UNA respuesta abierta cada vez: abrir una pregunta ocupa la card (las otras
     dejan de estar disponibles hasta cerrarla) y su cabecera queda arriba. La respuesta es TEXTO real
     (región enfocable y desplazable); la card abierta es la captura de la misma sesión. Volver a
     pulsar o Escape cierran y devuelven el foco. Sin JS los controles siguen `hidden` y se ve la
     lista estática (.iv2-static). Movimiento reducido: mismos estados, sin transiciones. */
  function initIntelV2() {
    var fig = document.getElementById('intelDemo');
    if (!fig) return;
    var hosts = [].slice.call(fig.querySelectorAll('.iv2-shot, .iv2-m-explore'));
    var btns = [].slice.call(fig.querySelectorAll('[data-iv2-toggle]'));
    var answers = [].slice.call(fig.querySelectorAll('.iv2-ans'));
    var stat = fig.querySelector('.iv2-static');
    var open = 0;
    function visibleBtn(q) { for (var i = 0; i < btns.length; i++) if (+btns[i].getAttribute('data-q') === q && btns[i].offsetParent !== null) return btns[i]; return null; }
    function set(q) {
      open = q;
      hosts.forEach(function (h) { if (q) h.setAttribute('data-open', String(q)); else h.removeAttribute('data-open'); });
      btns.forEach(function (b) { var bq = +b.getAttribute('data-q'); b.setAttribute('aria-expanded', String(bq === q)); b.hidden = !!q && bq !== q; });
      answers.forEach(function (a) { var on = +a.getAttribute('data-q') === q; a.hidden = !on; if (on) a.scrollTop = 0; });
    }
    btns.forEach(function (b) {
      b.hidden = false;
      b.addEventListener('click', function () { var q = +b.getAttribute('data-q'); set(open === q ? 0 : q); });
    });
    fig.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && open) { var q = open; set(0); var b = visibleBtn(q); if (b) b.focus(); }
    });
    if (stat) stat.hidden = true;
    fig.classList.add('is-live');
    initIv2Arc(fig);
  }
  // Arco de Salud: se arma vacío y se dibuja UNA vez (≈1 s) al entrar en pantalla; no se reinicia al
  // subir y bajar. Sin JS, sin IntersectionObserver o con movimiento reducido: valor final por CSS.
  function initIv2Arc(fig) {
    var fg = fig.querySelector('.iv2-arc-fg');
    if (!fg || !('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fg.classList.add('is-armed');
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (!es[i].isIntersecting) continue;
        io.disconnect();
        requestAnimationFrame(function () { requestAnimationFrame(function () { fg.classList.add('is-run'); fg.classList.remove('is-armed'); }); });
        return;
      }
    }, { threshold: 0.6 });
    io.observe(fg.ownerSVGElement || fg);
  }

  /* ── LANDING V2 · recorrido de la esfera ─────────────────────────────────────
     Acompaña el scroll real (nunca lo secuestra): un progreso q ∈ [0,3] sale de la posición
     de la página y la esfera lo sigue con un límite de velocidad, así que recorre SIEMPRE el
     camino (no atajos sobre el texto) y no queda nada pendiente si se baja deprisa.
       q = 0      en su hueco del panel (reposo; al aterrizar con el ancla no se va).
       0 → 1      se desprende hacia el margen derecho, baja haciendo UN looping, cruza el
                  pasillo libre entre panel y beneficios y llega al margen izquierdo.
       1 → 2      acompaña la lectura de los beneficios en el margen izquierdo, flotando.
       2 → 3      curva de salida y desvanecimiento antes de «Tu patrimonio cambia».
     Sólo vuela por zonas libres (márgenes y pasillo); si no hay sitio (tablet, móvil, ventanas
     estrechas) se queda en su hueco con movimiento local. El looping no se repite hasta que la
     esfera ha vuelto a su hueco. Movimiento reducido ⇒ estática (no se inicia). Decorativa:
     aria-hidden, fuera del foco; sólo transform y opacity por frame; reposo ⇒ sin rAF. */
  function initOrbFlight() {
    var slot = document.querySelector('.lp-orb-slot');
    var orb = slot && slot.querySelector('.lp-orb');
    var tilt = orb && orb.querySelector('.lp-orb-tilt');
    var panel = document.getElementById('intelDemo');
    var ben = document.querySelector('#intelligence .benefits');
    var trk = document.querySelector('#tracking .section-title');
    var intel = document.getElementById('intelligence');
    var header = document.getElementById('siteHeader');
    if (!orb || !panel || !ben || !trk || !intel) return;
    var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mqReduce && mqReduce.matches) return;

    var M = null, raf = 0, last = 0, t0 = (window.performance ? performance.now() : Date.now());
    var qEff = 0, qVel = 0, loopDone = false, ptr = null, slotOnScreen = true;
    var pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 }, prev = null, tiltS = { x: 0, y: 0 };   // desplazamiento respecto al hueco (px)
    var ev = { x: 0, y: 0 }, evv = { x: 0, y: 0 };       // evasión (ratón / toque)

    function measure() {
      var sy = window.scrollY || 0, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var rs = slot.getBoundingClientRect(), rp = panel.getBoundingClientRect(), rb = ben.getBoundingClientRect();
      var rt = trk.getBoundingClientRect(), ri = intel.getBoundingClientRect();
      var free = Math.min(rb.left, vw - rb.right);
      var m = { vw: vw, vh: vh, rest: rs.width || 1, free: free, size: Math.max(0, Math.min(64, free - 28)),
        S: { x: rs.left + rs.width / 2, y: rs.top + sy + rs.height / 2 },
        panelBottom: rp.bottom + sy, benTop: rb.top + sy, trkTop: rt.top + sy, contL: rb.left, contR: rb.right };
      m.fly = vw >= 1024 && m.size >= 44 && (m.benTop - m.panelBottom) >= m.size + 20;
      var gut = Math.min(free / 2, 110), halo = m.size * 0.76;
      m.loopR = Math.max(8, Math.min(24, gut - m.size / 2 - 10, vw - 6 - halo - (m.contR + gut)));
      m.RG = Math.min(m.contR + gut, vw - 6 - halo - m.loopR); m.LG = Math.max(m.contL - gut, halo + 6);
      var bandY = (m.panelBottom + m.benTop) / 2;
      var landing = ri.top + sy - 72;                    // donde deja el ancla «Descubrir Intelligence»
      m.s0 = Math.max(m.benTop - 0.9 * vh, landing + 0.15 * vh);
      m.s1 = m.s0 + 0.45 * vh;
      m.s3 = m.trkTop - 0.55 * vh; m.s2 = m.s3 - 0.25 * vh;
      if (m.s2 < m.s1 + 40) { m.s2 = m.s1 + 40; m.s3 = Math.max(m.s3, m.s2 + 80); }
      var K = [m.S, { x: m.RG, y: m.S.y }, { x: m.RG, y: bandY }, { x: m.LG, y: bandY }, { x: m.LG, y: m.benTop + 30 }];
      // esquinas redondeadas (Bézier cuadrática con control en el vértice, radio 36 px): el atajo
      // interior es de ~10 px, dentro del margen de seguridad de los márgenes y el pasillo.
      m.P = [K[0]];
      for (var c = 1; c < K.length - 1; c++) {
        var A = K[c - 1], B = K[c], C = K[c + 1];
        var la = Math.sqrt(Math.pow(A.x - B.x, 2) + Math.pow(A.y - B.y, 2)) || 1, lc = Math.sqrt(Math.pow(C.x - B.x, 2) + Math.pow(C.y - B.y, 2)) || 1;
        var rc = Math.min(36, la / 2, lc / 2);
        var a = { x: B.x + (A.x - B.x) * rc / la, y: B.y + (A.y - B.y) * rc / la }, b = { x: B.x + (C.x - B.x) * rc / lc, y: B.y + (C.y - B.y) * rc / lc };
        for (var j = 0; j <= 8; j++) { var t = j / 8, u1 = 1 - t; m.P.push({ x: u1 * u1 * a.x + 2 * u1 * t * B.x + t * t * b.x, y: u1 * u1 * a.y + 2 * u1 * t * B.y + t * t * b.y, k: c }); }
      }
      m.P.push(K[K.length - 1]);
      m.L = [0];
      for (var i = 1; i < m.P.length; i++) m.L.push(m.L[i - 1] + Math.sqrt(Math.pow(m.P[i].x - m.P[i - 1].x, 2) + Math.pow(m.P[i].y - m.P[i - 1].y, 2)));
      m.len = m.L[m.L.length - 1] || 1;
      var i1 = -1, i2 = -1;
      for (var q2 = 0; q2 < m.P.length; q2++) { if (m.P[q2].k === 1) i1 = q2; if (m.P[q2].k === 2 && i2 < 0) i2 = q2; }
      var Ld1 = m.L[i1], Ld2 = m.L[i2];
      m.loopA = (Ld1 + 0.2 * (Ld2 - Ld1)) / m.len;
      m.loopB = (Ld1 + 0.8 * (Ld2 - Ld1)) / m.len;
      m.endRight = Ld2 / m.len;
      m.eShrink = Math.max(0.02, 0.8 * m.L[i1 - 8 >= 0 ? i1 - 8 : 1] / m.len);   // ya a tamaño de vuelo antes del margen
      m.eGutter = m.L[i1] / m.len;                                                // desde aquí, en el margen derecho
      M = m;
    }
    function at(u) {                                     // punto por longitud de arco, salida y llegada suaves
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      var d = e * M.len, P = M.P, L = M.L;
      for (var i = 1; i < P.length; i++) {
        if (d <= L[i] || i === P.length - 1) {
          var k = (L[i] === L[i - 1]) ? 0 : Math.max(0, Math.min(1, (d - L[i - 1]) / (L[i] - L[i - 1])));
          return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, y: P[i - 1].y + (P[i].y - P[i - 1].y) * k, e: e };
        }
      }
      return { x: P[P.length - 1].x, y: P[P.length - 1].y, e: 1 };
    }
    function qRaw(s) {
      if (!M.fly || s <= M.s0) return 0;
      if (s <= M.s1) return (s - M.s0) / (M.s1 - M.s0);
      if (s <= M.s2) return 1 + (s - M.s1) / (M.s2 - M.s1);
      if (s <= M.s3) return 2 + (s - M.s2) / (M.s3 - M.s2);
      return 3;
    }
    function target(q, time) {
      var fs = M.size / M.rest, out = { x: M.S.x, y: M.S.y, scale: 1, op: 1, zone: 'rest', e: 0 };
      if (q <= 0) return out;
      if (q <= 1) {
        var p = at(q);
        out.x = p.x; out.y = p.y; out.e = p.e; out.scale = 1 + (fs - 1) * Math.min(1, p.e / M.eShrink);
        if (!loopDone && p.e > M.loopA && p.e < M.loopB) {
          var th = 2 * Math.PI * (p.e - M.loopA) / (M.loopB - M.loopA);
          out.x += M.loopR * Math.sin(th); out.y += M.loopR * (Math.cos(th) - 1);
        }
        out.zone = p.e < M.eGutter ? 'path' : (p.e <= M.endRight ? 'right' : (p.e > 0.98 ? 'left' : 'band'));
        return out;
      }
      var end = M.P[M.P.length - 1], y = end.y + Math.min(q - 1, 1) * (M.s2 - M.s1);
      out.x = end.x + 4 * Math.sin(time * 0.7); y += 6 * Math.sin(time * 1.1);   // flota
      out.scale = fs; out.zone = 'left'; out.e = 1;
      if (q > 2) {
        var x = Math.min(1, q - 2);
        y += x * (M.s3 - M.s2) - 46 * x; out.x -= 34 * x * x; out.op = 1 - x; out.scale = fs * (1 - 0.25 * x);
      }
      out.y = y;
      return out;
    }
    function zoneBox(t) {                                // límites del desplazamiento extra (evasión/toque)
      var h = M.size / 2 + 8;
      if (t.zone === 'left') return { x0: 6 + h - t.x, x1: M.contL - 14 - h - t.x, y0: -50, y1: 50 };
      if (t.zone === 'right') return { x0: M.contR + 14 + h - t.x, x1: M.vw - 6 - h - t.x, y0: -50, y1: 50 };
      if (t.zone === 'band' || t.zone === 'path') return { x0: -8, x1: 8, y0: -6, y1: 6 };
      return { x0: -10, x1: 10, y0: -8, y1: 8 };
    }
    function zoneOf(t) {                                 // el cero siempre cabe: sin puntero, nunca desplaza
      var z = zoneBox(t);
      return { x0: Math.min(0, z.x0), x1: Math.max(0, z.x1), y0: Math.min(0, z.y0), y1: Math.max(0, z.y1) };
    }
    var clamp = function (v, a, b) { return Math.max(Math.min(a, b), Math.min(Math.max(a, b), v)); };
    function frame(now) {
      raf = 0;
      if (!M) measure();
      var dt = last ? Math.min(0.05, Math.max(0.001, (now - last) / 1000)) : 0.016; last = now;
      var s = window.scrollY || 0, qr = qRaw(s);
      if (!M.fly) { qEff = 0; qVel = 0; loopDone = false; }      // sin sitio para volar: en su hueco
      // inercia: acelera y frena siguiendo al scroll; en el vuelo largo, como mucho ~750 px/s
      var vmax = qEff < 1 ? 750 / M.len : 1.4, kq = 40;
      qVel += (kq * (qr - qEff) - 2 * Math.sqrt(kq) * qVel) * dt;
      qVel = Math.max(-vmax, Math.min(vmax, qVel));
      qEff += qVel * dt;
      if (Math.abs(qr - qEff) < 0.0005 && Math.abs(qVel) < 0.002) { qEff = qr; qVel = 0; }
      if (qEff <= 0.02) loopDone = false;
      var T = target(qEff, (now - t0) / 1000);
      if (qEff > 0 && qEff <= 1 && T.e >= M.loopB) loopDone = true;
      if (qEff >= 2.999) T.op = 0;
      // evasión: se aparta del puntero en dirección opuesta, deprisa; vuelve despacio
      var Z = zoneOf(T), ex = 0, ey = 0;
      if (ptr && T.op > 0.2) {
        var dx = (M.S.x + pos.x + ev.x) - ptr.x, dy = (M.S.y + pos.y + ev.y) - (ptr.y + s), d = Math.sqrt(dx * dx + dy * dy), R = 120;
        if (d < R && d > 0.1) { var f = (R - d) / R * 46; ex = dx / d * f; ey = dy / d * f; }
      }
      ex = clamp(ex, Z.x0, Z.x1); ey = clamp(ey, Z.y0, Z.y1);
      var ke = (Math.abs(ex) + Math.abs(ey) > Math.abs(ev.x) + Math.abs(ev.y) + 0.5) ? 170 : 14;
      evv.x += (ke * (ex - ev.x) - 2 * Math.sqrt(ke) * evv.x) * dt; evv.y += (ke * (ey - ev.y) - 2 * Math.sqrt(ke) * evv.y) * dt;
      ev.x = clamp(ev.x + evv.x * dt, Z.x0 - 4, Z.x1 + 4); ev.y = clamp(ev.y + evv.y * dt, Z.y0 - 4, Z.y1 + 4);
      // posición exacta sobre el recorrido; la velocidad sólo inclina los anillos
      pos.x = T.x - M.S.x; pos.y = T.y - M.S.y;
      if (prev) { vel.x = (pos.x - prev.x) / dt; vel.y = (pos.y - prev.y) / dt; }
      prev = { x: pos.x, y: pos.y };
      var hidden = T.op < 0.01;
      orb.style.transform = 'translate3d(' + (pos.x + ev.x).toFixed(1) + 'px,' + (pos.y + ev.y).toFixed(1) + 'px,0) scale(' + T.scale.toFixed(3) + ')';
      orb.style.opacity = hidden ? '0' : String(+T.op.toFixed(3));
      orb.style.visibility = hidden ? 'hidden' : '';
      if (tilt) {                                      // inclinación con filtro de paso bajo: sin tirones en las curvas
        var kf = 1 - Math.exp(-dt * 5);
        tiltS.x += (clamp(vel.y * 0.03, -14, 14) - tiltS.x) * kf; tiltS.y += (clamp(vel.x * 0.03, -14, 14) - tiltS.y) * kf;
        tilt.style.setProperty('--rx', tiltS.x.toFixed(2) + 'deg');
        tilt.style.setProperty('--ry', tiltS.y.toFixed(2) + 'deg');
      }
      var flying = qEff > 0.001 && !hidden;
      orb.classList.toggle('is-paused', !flying && !slotOnScreen);
      var moving = Math.abs(qVel) > 0 || Math.abs(evv.x) + Math.abs(evv.y) + Math.abs(ev.x) + Math.abs(ev.y) > 0.3 || Math.abs(qr - qEff) > 0 || Math.abs(tiltS.x) + Math.abs(tiltS.y) > 0.05;
      if (moving || flying || (ptr && slotOnScreen)) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    function remeasure() { measure(); prev = null; kick(); }

    measure();
    // Lectura del estado para la sonda de la landing (sólo lectura; no forma parte de la interfaz).
    orb.__lp = { state: function () { return { q: qEff, loopDone: loopDone, fly: M.fly, s0: M.s0, s1: M.s1, s2: M.s2, s3: M.s3, loopA: M.loopA, loopB: M.loopB, RG: M.RG, LG: M.LG }; } };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    window.addEventListener('aurix:lang', remeasure);
    window.addEventListener('load', remeasure);
    if ('ResizeObserver' in window) { try { var ro = new ResizeObserver(remeasure); ro.observe(panel); ro.observe(ben); ro.observe(document.body); } catch (_) {} }
    if ('IntersectionObserver' in window) {
      try { new IntersectionObserver(function (en) { slotOnScreen = en[0].isIntersecting; kick(); }).observe(slot); } catch (_) {}
    }
    // Ratón: sólo apunta (no captura nada). Táctil: un toque directo en la esfera da un impulso corto;
    // el gesto de scroll no se intercepta (sin preventDefault, sin capa encima del contenido).
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { ptr = { x: e.clientX, y: e.clientY }; kick(); } }, { passive: true });
      document.addEventListener('pointerleave', function () { ptr = null; kick(); });
      window.addEventListener('blur', function () { ptr = null; });
    }
    orb.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      evv.x += (Math.random() < 0.5 ? -1 : 1) * 90; evv.y -= 70; kick();
    }, { passive: true });
    kick();
  }


  function init() {
    initReferral();   // AURIX-AFFILIATES-V1 — antes de pintar los CTA
    applyLang(detectLang());

    // Point every "Enter Aurix" CTA at the canonical app URL (with ?lang=).
    updateAppLinks();

    // Language toggle
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.lang-btn');
      if (b) { applyLang(b.getAttribute('data-lang'), true); }   // M.03 B — click = elección explícita
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
      // El estado oculto sólo existe si este código llega a ejecutarse: sin JS (o si falla antes),
      // el contenido se ve tal cual.
      var showAll = function () { for (var z = 0; z < reveals.length; z++) reveals[z].classList.add('is-visible'); };
      try {
      document.documentElement.classList.add('reveal-ready');
      var ioAlive = false;
      var io = new IntersectionObserver(function (entries) {
        ioAlive = true;
        entries.forEach(function (en) {
          // Lo que ya quedó por encima (salto a un ancla, scroll restaurado) se muestra sin animar.
          if (en.isIntersecting || en.boundingClientRect.bottom <= 0) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      for (var k = 0; k < reveals.length; k++) io.observe(reveals[k]);
      // Si el observador no llega a entregar su primera lectura, nada se queda oculto.
      setTimeout(function () { if (!ioAlive) showAll(); }, 1500);
      } catch (_) { showAll(); }
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

    // HOTFIX LANDING — the "Request Access" modal + waitlist form were removed with the Private
    // Beta section (Aurix is now open to the public; the single CTA is "Enter Aurix"). No modal
    // open/close, no waitlist submit, no Escape/backdrop handlers tied to it remain.

    // ── Market preview: tabs + animated chart ──────────────
    // Illustrative product preview (labelled, no real-time data): six tabs over a
    // chart that draws on viewport entry, with figures that count up on switch.
    initMarket();

    // ── Intelligence orb: desktop cursor sheen (WSPHERE.V3 #4) ──
    initOrbSheen();

    // LANDING V2/V3 · entrada del dashboard, demostración de Intelligence y recorrido de la esfera.
    initHeroIntro();
    initIntelV2();
    initOrbFlight();

    // Footer year (no Date pinning needed for a static label)
    var y = document.getElementById('year');
    if (y) { try { y.textContent = String(new Date().getFullYear()); } catch (_) {} }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
