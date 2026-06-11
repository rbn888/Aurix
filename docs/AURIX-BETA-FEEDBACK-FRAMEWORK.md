# AURIX — BETA FEEDBACK FRAMEWORK

> Marco operativo para recoger, clasificar y priorizar el feedback de los testers
> de la beta privada curada. **Documento de proceso — no es código ni roadmap.**
> Estado del producto: BETA READY (ver `project_lr4_beta_qa_verdict`). Acceso:
> "Beta privada curada válida" (ver `project_beta_access_verdict`).

---

## 1. Cómo registrar feedback de testers

**Objetivo:** un único embudo, baja fricción para el tester, formato estable para
quien procesa. Nada se pierde, nada se procesa "de memoria".

**Canal de entrada (elegir UNO como canónico, el resto redirige a él):**
- Un canal directo y asíncrono (p. ej. un chat/grupo privado de la beta o un email
  dedicado tipo `beta@…`). El tester no debería tener que aprender una herramienta.

**Registro canónico (donde vive el feedback ya estructurado):**
- Una sola tabla/lista maestra (hoja de cálculo o tablero). El canal de entrada es
  para *recibir*; la tabla maestra es la *fuente de verdad*. Todo mensaje del canal
  se transcribe a una fila.

**Campos mínimos por entrada (una fila = una observación atómica):**

| Campo | Descripción |
|---|---|
| `id` | correlativo |
| `fecha` | cuándo se reportó |
| `tester` | quién lo reportó (para poder repreguntar) |
| `dispositivo/contexto` | iPhone/Safari/PWA/desktop — imprescindible para reproducir |
| `superficie` | Login / Dashboard / Add Asset / Market / Intelligence / Workspace / Watchlist / PWA / Persistencia / Navegación |
| `categoría` | Bug / Fricción / Petición (ver §2) |
| `prioridad` | Crítico / Medio / Bajo (ver §3) |
| `descripción` | qué pasó, qué esperaba |
| `pasos / repro` | cómo reproducirlo (sólo Bug) |
| `estado` | Nuevo → Triado → Aceptado (roadmap) / Rechazado / Resuelto |
| `decisión` | nota de por qué entra o no (ver §4) |

**Regla de oro:** una entrada = **una sola** observación. Si un tester manda un
párrafo con 3 cosas, se parte en 3 filas. Mezclar bug + petición en una fila rompe
el triaje.

---

## 2. Categorías

Toda entrada se etiqueta con **exactamente una** categoría:

- **Bug** — algo no funciona como debería. Comportamiento incorrecto, error,
  dato erróneo, pantalla rota, pérdida de estado. *Requiere pasos de reproducción.*
- **Fricción** — funciona, pero cuesta/confunde/molesta. Copy poco claro, paso de
  más, jerarquía visual confusa, lentitud percibida, expectativa no cumplida.
  *No es un fallo: es coste de uso.*
- **Petición** — el tester pide algo que **no existe**. Funcionalidad nueva, soporte
  de un activo/ubicación, integración, opción de configuración. *Va al backlog de
  producto, nunca se trata como bug.*

> Si dudas entre Bug y Fricción: ¿el sistema hace algo *incorrecto*? → Bug.
> ¿Hace lo correcto pero *cuesta*? → Fricción.
> Si dudas entre Fricción y Petición: ¿pide algo que **no existe**? → Petición.

---

## 3. Prioridad

Independiente de la categoría. Mide **impacto en la beta**, no esfuerzo.

- **Crítico** — bloquea el happy-path o destruye confianza:
  impide login / impide añadir activo / rompe dashboard / muestra patrimonio
  incorrecto / pérdida de datos / navegación principal rota.
  → **Atención inmediata.** Un Crítico abierto pausa el resto.
- **Medio** — fricción importante o bug no bloqueante que daña la experiencia pero
  tiene workaround. No impide usar el producto.
  → Se agenda; no urge.
- **Bajo** — pulido visual, copy, mejora menor, preferencia personal.
  → Se acumula; se aborda por lotes o se descarta.

> La prioridad de una **Petición** mide cuánto la valida la beta (cuántos testers
> distintos la piden + alineación estratégica), no cuánto la quiere un solo tester.

**Matriz rápida categoría × prioridad (orientativa):**

| | Crítico | Medio | Bajo |
|---|---|---|---|
| **Bug** | Arreglar ya, pausa todo | Agendar próximo lote | Backlog de pulido |
| **Fricción** | Raro; tratar como bloqueante de confianza | Candidata fuerte a roadmap | Pulido / descartable |
| **Petición** | No aplica (una petición no "bloquea") → reclasificar | Evaluar señal (§4) | Anotar y esperar más señal |

---

## 4. Criterio para decidir qué entra en roadmap

El feedback **no entra en roadmap automáticamente.** Pasa por un triaje con tres
preguntas, en orden:

1. **¿Es Crítico (Bug o Fricción)?**
   → Sí: entra **inmediatamente** como fix, fuera de la cola normal. No se debate.

2. **¿Hay señal repetida?**
   → ¿Lo reportan **varios testers independientes**? Una observación aislada es una
   anécdota; un patrón es una señal. Patrón Medio → candidato real a roadmap.

3. **¿Está alineado con la dirección del producto?**
   → Aurix = *Wealth Intelligence Platform*, no un tracker genérico (ver
   `project_roadmap`). Una Petición popular pero fuera de la tesis **no entra**;
   se anota como "fuera de alcance, revisar post-validación".

**Reglas de corte:**
- **Crítico** → siempre entra (fix inmediato).
- **Medio con patrón + alineado** → entra al roadmap, priorizado por frecuencia.
- **Medio aislado** o **Bajo** → backlog; lote de pulido o descarte explícito.
- **Petición** → *nunca* entra solo por pedirla un tester. Necesita patrón + encaje
  estratégico. Lo demás se aparca, no se rechaza para siempre.
- **Toda decisión se escribe** en el campo `decisión`. "Rechazado sin nota" no
  existe: si algo no entra, queda registrado por qué, para no re-litigarlo.

**Lo que el feedback NO debe provocar en beta:**
- Reabrir auditorías ya cerradas (Launch Readiness, invitaciones) salvo que aparezca
  un Crítico nuevo y reproducible.
- Construir features a demanda de un único tester.
- Tocar áreas vetadas sin decisión explícita (PCE/gráficos/CoinGecko/Workspace
  internals/Wealth Engine/monetización).

---

### Flujo resumido

```
Tester → canal de entrada → fila en tabla maestra
   → categoría (Bug / Fricción / Petición)
   → prioridad (Crítico / Medio / Bajo)
   → triaje (¿Crítico? → ¿patrón? → ¿alineado?)
   → Aceptado (roadmap) / Backlog / Rechazado-con-nota / Fix inmediato
```

El valor de la beta no es recoger mucho feedback: es **decidir bien** qué merece
convertirse en trabajo. Curar la entrada (§1-3) y aplicar el criterio (§4) con
disciplina es lo que mantiene el producto enfocado.
