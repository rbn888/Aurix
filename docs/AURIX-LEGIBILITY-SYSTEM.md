# AURIX · Sistema global de legibilidad, contraste y profundidad

Owner único: bloque «SISTEMA GLOBAL DE LEGIBILIDAD» al final de `styles.css` (una capa semántica sobre la escala existente `--elev-0…3`, `--text*`, `--border*`; sin segunda hoja). Medición: `scripts/aurix-legibility-audit.mjs` (contraste real compuesto, objetivos táctiles, desbordamiento) y `scripts/aurix-low-brightness-probe.mjs` (brillo bajo / exterior, ΔL* CIELAB).

## Tokens (función → valor · uso permitido)
| Token | Valor | Uso |
|---|---|---|
| `--surface-app` | `--elev-0` #040507 | lienzo |
| `--surface-nav` | rgba(14,19,31,.94) | barras de navegación |
| `--surface-card` | material de Intelligence (radial azul + 165° rgba(32,44,72,.5)→rgba(28,36,58,.62)) | cards de contenido |
| `--surface-card-elevated` / `--surface-panel(-hover)` / `--surface-input` | `--elev-2` / lila .06 (.10) / lila .07 | elevado, panel interior, campos |
| `--surface-tooltip` / `--surface-modal` / `--surface-scrim` | #121a2b / 165° #1a2642→#0c1222 (opaco) / rgba(6,10,20,.72) | capas superiores |
| `--text-primary` / `--text-secondary` / `--text-tertiary` | `--text-bright` / `--text-muted` #b0b4bd / `--text-dim` **#9097A6** (era #7C8393: 3,7:1 en `--elev-2`, ahora 4,8:1) | jerarquía de texto |
| `--text-link` | #8db4ff (8,2:1 lienzo · 6,6:1 card) | enlaces y texto azul pequeño |
| `--border-subtle/default/strong` | lila .10 / **.18** / .28 | `default`: 1,37:1 lienzo, 1,5:1 card (antes 1,13–1,16) |
| `--border-interactive` / `--border-focus` / `--border-premium` | azul .48 / #8db4ff / dorado .45 | control, foco, Premium |
| `--accent-primary-fill(-hi)` | #356CDA (#3A72E0) | relleno de CTA: blanco 4,87:1 (el azul de marca daba 3,66:1) |
| `--accent-cyan/turquoise/violet/gold` | #4fc3f7 / #2ec4b6 / #a78bfa / #d4af5d | series y acentos; NUNCA ganancia/pérdida; dorado = Premium |
| `--status-*` | verde/rojo = SÓLO resultado financiero; warning #e9b04f; info #8db4ff | estados |
| `--chart-*` | grid .10 · eje .22 · etiqueta = terciario · series 1–5 | gráficos |
| `--focus-ring`, `--hover/pressed-overlay`, `--selected-surface`, `--skeleton-*` | — | interacción |
| `--shadow-card/elevated`, `--glow-primary/premium` | — | profundidad selectiva |

## Reglas aplicadas
- Foco: `:focus-visible` de 2 px `--border-focus` en todo control (teclado), sin afectar ratón/toque.
- Cards de categoría, Market, Workspace y promos Free → `--surface-card` + `--border-default` (antes 1,05–1,10 del lienzo).
- CTA primarios (onboarding, acceso, portadas Free, paywall) → `--accent-primary-fill`.
- Navegación inferior: inactivos legibles (antes ~30 % efectivo), activo = icono blanco + indicador azul; fuera el verde financiero, el halo y el bucle `navBreath`.
- «Mercado cerrado/abierto»: neutro/turquesa (no es ganancia ni pérdida), sin opacidad.
- Deshabilitados (acceso, «Próximamente»): inequívocos y legibles (sin relleno, borde, texto terciario), sin opacidad global.
- Objetivos táctiles: área invisible de 44 px (`::after`) donde la geometría está certificada; `min-height: 44px` donde no.
- Promos Free: motivo abstracto propio (Intelligence = concentración + cambio; Workspace = reparto, plan, progreso), sin datos.

## Excepciones justificadas
- `range-btn`/`perf-btn` (gráfico): 44 px de alto, ancho limitado por la fila certificada (cumple 2.5.8 AA ≥ 24 px).
- `header-tab`, botones del hero en escritorio con puntero fino: 30–34 px (con puntero táctil suben a 44).
- `#compositionClose` conserva `position:absolute` (su ::after funciona igual).
- Defecto funcional ajeno NO tratado: reconstrucción de documentos en «Mi espacio» tras iniciar sesión.

## Verificación
Ver informe del cierre (matriz, brillo bajo, gate, bytes). Simulación ≠ dispositivo físico: iPhone/Android reales al 20–30 % de brillo **no probados**.
