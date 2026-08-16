# CLAUDE.md — Política operativa de Aurix

Política permanente de ejecución de Claude Code en este proyecto.

## 1. Principio general

Usar siempre el **proceso mínimo que garantice un cambio seguro y correcto**.
Optimizar a la vez seguridad, calidad, velocidad, coste y consumo de tokens.
Más investigación, más agentes o más validaciones **no** equivalen automáticamente a más calidad.

## 2. Ejecución proporcional al riesgo

| Tipo de cambio | Proceso |
|---|---|
| Pequeño / causa conocida | Claude principal, investigación mínima, cambio quirúrgico, **una** validación suficiente |
| Medio o causa incierta | Investigar solo hasta localizar causa y owner; delegar únicamente si aporta ventaja clara |
| Crítico / arquitectónico / financiero | Se permite investigación y revisión adicionales cuando el riesgo lo justifique |
| Grande y realmente paralelizable | Considerar múltiples agentes solo si hay beneficio claro |

## 3. Agentes

- **No usar subagentes por defecto.**
- Nunca para cambios triviales o de bajo riesgo.
- Delegar solo cuando aporte valor real: especialización, aislamiento de contexto, investigación independiente o paralelización.
- No lanzar varios agentes a investigar lo mismo.
- **Agent Teams** solo para trabajo grande, independiente y verdaderamente paralelizable.
- Si el SPEC pide explícitamente una estrategia de agentes, respetarla.

## 4. Investigación y contexto

- Buscar primero el **owner más probable**.
- Búsquedas dirigidas y rangos concretos antes que lecturas masivas.
- **No cargar `app.js` completo** salvo necesidad excepcional demostrable (3,5 MB).
- No investigar subsistemas adyacentes sin razón directamente ligada al objetivo.
- **Parar** en cuanto haya evidencia suficiente para implementar con seguridad.
- Reutilizar conocimiento y harnesses existentes cuando sigan siendo válidos.

## 5. Implementación

- Un problema y un owner principal por trabajo siempre que sea posible.
- Aplicar el **cambio mínimo correcto**.
- Sin refactors, limpiezas ni mejoras adyacentes no solicitadas.
- Preservar el comportamiento existente fuera del alcance.
- Escalar el proceso **solo** si aparece un riesgo inesperado o una necesidad arquitectónica real.

## 6. Validación

- Ejecutar el **mínimo conjunto de pruebas** que demuestre el cambio.
- Reutilizar harnesses existentes.
- Evitar gates múltiples que validen esencialmente lo mismo.
- Bajo riesgo ⇒ **un único gate final** es el estándar.
- Verificación live adicional solo cuando aporte evidencia que tests/gates no puedan dar.
- No repetir verificaciones ya demostradas.

## 7. Regla de STOP

Cuando los criterios del SPEC están implementados y demostrados: **STOP**.

No seguir investigando, refactorizando, documentando, creando memoria, ejecutando verificaciones redundantes ni proponiendo trabajo adicional, salvo riesgo real detectado.

## 8. Memoria y documentación

- No crear ni actualizar memoria en implementaciones normales, salvo petición explícita o necesidad excepcional.
- No documentar lo temporal ni lo evidente.
- Cierre ejecutivo **breve**: causa, cambio, validación, resultado.

## 9. Aurix

Producto financiero **en producción con usuarios reales**.

- Cambios que afecten cálculos financieros, Portfolio/Wealth/Historical Engines, persistencia, sincronización, autenticación, seguridad o integridad de datos reciben rigor **proporcional a su riesgo**.
- **Nunca** usar datos sintéticos como sustituto de datos reales en comportamiento de producción.
- Preservar compatibilidad y evitar regresiones.
