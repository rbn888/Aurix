# SPEC 1 · Verificación REAL pendiente (no ejecutable desde aquí)

La demo usa un Supabase FALSO y genera un id de usuario nuevo en cada acceso: certifica el contrato del
cliente, NO la sincronización real ni el comportamiento del histórico con snapshots reales del servidor.
Esto es lo que falta y cómo hacerlo. **Nada de esto toca usuarios reales ni requiere SQL.**

## Requisitos
- Una cuenta **sintética** Premium autorizada en producción (override `reason='qa'`; dominio cerrado:
  `founder|comp|qa|support`). Sin datos personales.
- La rama `aurix/financial-reliability` desplegada en un entorno con la API y el Supabase de producción
  (p. ej. un preview), o publicada tras la decisión de merge. **No** se ejecuta contra usuarios reales.
- Dos navegadores/perfiles limpios (A y B) y, si es posible, un iPhone físico.

## 1. Documentos en otro dispositivo (workspace_documents)
1. A: crear y guardar un Presupuesto «QA-vigente» (EUR) y un Objetivo «QA-objetivo» con un fondo asignado.
2. B (perfil limpio, misma cuenta): abrir Dashboard → **esperado**: «QA-vigente» y «QA-objetivo» aparecen
   en «Tus planes»/Workspace con su moneda; el fondo aparece bajo su objetivo.
3. A: borrar «QA-vigente». B: recargar → **esperado**: desaparece (tombstone), no vuelve.
4. A: editar «QA-objetivo» sin red (subida fallida) y en B editarlo con red → A, con red: **esperado**: la
   edición local pendiente de A no la pisa la lectura; la siguiente subida resuelve por revisión.
5. Cambio de cuenta: en A cerrar sesión durante la carga del Dashboard y entrar con otra cuenta sintética →
   **esperado**: ningún documento de la primera en la segunda.
6. Registro antiguo ambiguo: SQL de **solo lectura** (founder) para contar filas sin `revision` en el
   cuerpo — `select count(*) from workspace_documents where deleted_at is null and not (body ? 'revision');`
   — y comprobar en B que aparecen en «Hay N documentos antiguos…» y que «Recuperar» restaura sólo el elegido.

## 2. Primer punto tras el cambio de tipo (histórico real con snapshots del servidor)
1. Cuenta sintética con 10.000 € de liquidez + una posición USD, con histórico de cliente **anterior** al
   despliegue (0,92) y snapshots del servidor (cada 15 min).
2. Tras desplegar: abrir la app → **esperado**: Ajustes muestra «Cambio EUR/USD: 1 € = … $ · Yahoo Finance
   · fecha»; 24H/7D/30D/ALL **sin variación** y con explicación (*) mientras su ventana empiece antes del
   último punto antiguo; ningún hecho de Intelligence de «subida/bajada de patrimonio» por ese salto.
3. Al día siguiente: 24H vuelve a publicarse; a los 7 días, 7D; etc.
4. Cuenta sólo USD: **ningún** aviso ni limitación.

## 3. Lo que falta para declarar el SPEC 1 cerrado
- Ejecutar §1 y §2 y registrar el resultado en `docs/AURIX-FINANCIAL-RELIABILITY-CLOSE.md`.
- Decidir la UX para descartar documentos ambiguos (hoy: no se restauran solos ni se borran; el aviso
  permanece mientras existan).
