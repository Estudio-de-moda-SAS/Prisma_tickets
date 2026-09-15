# Módulo: Migración de datos (PRISMA Migrations)

## Resumen

"PRISMA Migrations" es una herramienta de línea de comandos, **independiente y hermana** de la app PRISMA (vive en `prisma-migrations/`, fuera de `src/` y de `supabase/`), que migra solicitudes históricas desde archivos Excel hacia la base de datos relacional de PRISMA. No se despliega en ningún entorno: se ejecuta puntualmente desde una máquina local, cuando el negocio necesita volcar el histórico de un equipo que todavía llevaba sus tickets en Excel. Sigue un patrón ETL de tres fases (Extract → Transform/Resolve → Load) con **dry-run** obligatorio antes de escribir, e **idempotencia** garantizada por una tabla de mapeo (`TBL_Migration_Map`) que permite reejecutar sin duplicar. Del lado de PRISMA, un puñado de acciones atómicas en la Edge Function (protegidas por un secreto interno, no por JWT de usuario) reciben cada fila ya transformada y crean la solicitud con sus relaciones.

## Flujos de usuario

**Importante**: esto no es un flujo de usuario final de la app — ningún cliente ni agente de TI interactúa con esta herramienta desde PRISMA. Es un flujo operativo que ejecuta un desarrollador o administrador técnico, típicamente una sola vez por equipo/Excel a migrar:

1. El operador coloca el Excel del equipo (p. ej. `excels/crm.xlsx`) en una carpeta local y ajusta `prisma-migrations/src/config/runConfig.ts` para la corrida: `BOARD_ID`, `TEMPLATE_ID` (1 = General, 12 = Migraciones — la que preserva columnas extra en un campo de solo lectura), `TARGET_TEAM_ID` (un equipo por corrida), `TARGET_COLUMN_ID` y, si el Excel trae columnas que no encajan en el modelo estándar, `EXTRA_DATA_COLS`.
2. Si el Excel tiene encabezados distintos a los ya mapeados, el operador ajusta `src/config/mapping.ts` (el objeto `COL`) para que cada destino apunte al nombre exacto de columna del nuevo archivo. El motor (fases, transformaciones) no se toca para adaptar un Excel nuevo — solo configuración.
3. **Dry-run** (`npm run dry -- --file ./excels/crm.xlsx`): lee el Excel, valida y construye un reporte en consola — sin escribir nada en la base. El operador revisa encabezados faltantes, asignados sin resolver, sprints/etiquetas que se crearían, y filas con advertencias (fechas ilegibles, prioridades desconocidas). Corrige `mapping.ts` o los datos del Excel según haga falta y repite el dry-run hasta que el reporte se vea bien.
4. **Commit** (`npm run commit -- --file ./excels/crm.xlsx`): repite el proceso pero esta vez escribe. Crea/reutiliza sprints y etiquetas, y luego crea cada solicitud llamando a la Edge Function una por una.
5. Si el commit falla a mitad de camino (error de red, fila puntual con dato corrupto), el operador corrige lo puntual y **vuelve a correr el mismo comando de commit**: las filas ya migradas se detectan por `TBL_Migration_Map` y se saltan automáticamente ("saltadas" en el reporte), solo se reprocesan las que faltan o fallaron.
6. Al terminar, el script imprime un resumen (creadas / saltadas / fallidas / sprints creados / etiquetas creadas) y, si hubo fallidas, la lista de filas con su error para reintentar.

## Arquitectura técnica

### Frontend / Herramienta

No hay frontend — es un proyecto Node/TypeScript ejecutado por CLI. Estructura (`prisma-migrations/`):

```
prisma-migrations/
├── .env                      # PRISMA_API_URL + INTERNAL_JOB_SECRET (no se versiona)
├── package.json
├── tsconfig.json
├── excels/                   # Excels de entrada (histórico por equipo)
└── src/
    ├── run.ts                # orquestador CLI — punto de entrada (parsea --file/--sheet/--commit/--dry-run)
    ├── config/
    │   ├── runConfig.ts       # IDs de la corrida (board, plantilla, equipo, columna) + mapa de prioridad + EXTRA_DATA_COLS
    │   └── mapping.ts         # manifiesto declarativo: columna Excel → destino en Prisma (objeto COL)
    ├── lib/
    │   ├── apiClient.ts       # fetch a la Edge Function con header X-Internal-Job-Secret; call() y callWithRetry()
    │   ├── excel.ts           # lee el .xlsx y entrega filas como { 'Encabezado': valor } (por nombre, no posición)
    │   ├── transforms.ts      # conversiones: horas HH:MM→decimal, fechas D/M/AAAA (Bogotá)→UTC, booleanos, prioridad→score
    │   ├── users.ts           # resuelve "Asignada" (texto) → User_ID
    │   └── buildPayload.ts    # combina una fila cruda + los mapas resueltos → payload de migrateRequest
    └── phases/
        ├── 01-resolve.ts      # RESOLVE (solo en --commit): upsert de sprints y etiquetas → mapas nombre→id
        ├── 02-validate.ts     # VALIDATE (dry-run): reporta sin escribir
        └── 03-load.ts         # LOAD (commit): llama 01-resolve.ts y luego migrateRequest fila por fila
```

**Orden de ejecución** (confirmado en `src/run.ts` y `src/phases/03-load.ts`):
1. `run.ts` lee el Excel (`readExcel`) y construye el resolutor de usuarios (`buildUserResolver`, trae todos los `TBL_Users` vía `migrationFetchUsers`).
2. Si es dry-run: `runDryRun` (fase `02-validate.ts`) — usa extractores locales (`extractUniqueSprints`/`extractUniqueLabels` de `01-resolve.ts`) para reportar qué se crearía, **sin llamar** a `upsertSprintByName`/`upsertLabelByName` (no escribe).
3. Si es commit: `runLoad` (fase `03-load.ts`) primero llama `resolveSprintsAndLabels` (fase `01-resolve.ts`, **esta sí escribe**: upsert real de sprints/etiquetas vía la Edge Function) y arma los mapas `sprintMap`/`labelMap`; luego recorre cada fila no vacía y llama `migrateRequest` con reintentos (`callWithRetry`, hasta 3 intentos con backoff, sin reintentar errores 4xx).
4. `lib/apiClient.ts` llama a la Edge Function con `POST`, header `X-Internal-Job-Secret` (nunca `Authorization: Bearer`) y body `{ action, payload }` — el mismo envelope `apiClient.call(action, payload)` que usa el frontend, pero autenticado como proceso interno en vez de como usuario.

### Backend (Edge Function)

`supabase/functions/api/handlers/migration.ts` (`migrationHandlers`). Estas acciones **no pasan por la autenticación JWT normal**: en `supabase/functions/api/index.ts` están en la misma rama protegida por `X-Internal-Job-Secret` que usan los jobs internos (`migrateRequest`, `upsertLabelByName`, `upsertSprintByName`, `migrationFetchUsers`), es decir, solo son invocables por procesos que conocen ese secreto (el script de migración, corriendo local), no por el navegador de un usuario normal.

| Acción | Qué hace | Parámetros clave | Reglas no obvias |
|---|---|---|---|
| `upsertSprintByName` | Busca un sprint por `Sprint_Text` exacto; si no existe, lo crea con fechas `null`. | `{ text }` | Si hay duplicados, usa el de menor `Sprint_ID`. Devuelve `{ sprintId, created }`. |
| `upsertLabelByName` | Busca un label por la tripleta `(nombre, equipo, board)`; si no existe en ese equipo, lo crea. | `{ name, teamId, boardId }` | El nombre es único **dentro de un equipo**: puede existir el mismo nombre en otro equipo sin conflicto. Si crea, asigna color e ícono (emoji) aleatorios de un pool duplicado del ConfigPanel del front (ver Puntos frágiles). Devuelve `{ labelId, created }`. |
| `migrationFetchUsers` | Lista **todos** los usuarios (`User_ID`, `User_Name`), incluidos inactivos. | — | Se usa para que el script resuelva "Asignada" (texto) contra el universo completo de usuarios, incluso deshabilitados, porque el histórico puede referenciar gente que ya no está activa. |
| `migrateRequest` | Crea **una** solicitud histórica completa con todas sus relaciones. Es la única acción de esta lista con efectos secundarios múltiples (insert de ticket + relaciones + comentario). | Ver payload abajo. | Ver "Reglas de negocio" — idempotencia, `Requested_By = null`, sin automatizaciones, sin notificaciones, sin auto-asignación de sprint. |

Payload de `migrateRequest` (todo ya resuelto/transformado por el script, la Edge Function no hace matching de texto): `sourceFile`, `sourceRow`, `boardId`, `columnId`, `templateId`, `titulo`, `descripcion`, `score`, `isConfidential`, `createdAt`/`finishedAt` (ISO UTC), `progress` (0 o 100), `estimatedHours`/`loggedHours`, `legacyRequester` (texto crudo del "Equipo solicitante"), `teamIds`, `labelIds`, `sprintId`, `assigneeIds`, `note` (→ comentario), `formData?` (para la plantilla Migraciones).

Flujo interno de `migrateRequest` (`supabase/functions/api/handlers/migration.ts:204-336`):
1. Chequea `TBL_Migration_Map` por `(Source_File, Source_Row)`; si ya existe, retorna `{ skipped: true, requestId }` sin tocar nada más.
2. Toma el snapshot vivo del `Form_Schema` de la plantilla (`Request_Template_Schema_Snapshot`).
3. Inserta la solicitud en `TBL_Requests` con `Request_Requested_By: null`, `Request_Is_Legacy: true`, `Request_Legacy_Requester` con el texto crudo, fechas/progreso explícitos tal como vienen del Excel.
4. En paralelo (`Promise.all`), inserta las relaciones: `TBL_Request_Team` (equipo destino de la corrida), `TBL_Request_Labels`, `TBL_Request_Sprint`, `TBL_Requests_Assignments` (asignados ya resueltos a `User_ID`, sin volver a matchear por nombre), y si hay `note`, un comentario en `TBL_Comments` con autor el usuario de sistema `User_ID = 17` (`MigracionesPRISMA`, `sisinfo@estudiodemoda.com.co`).
5. **Al final**, y solo si todo lo anterior no lanzó, inserta la fila en `TBL_Migration_Map` — así, si algo falla a mitad de camino, la fila no queda marcada como migrada y el reintento la reprocesa completa (puede dejar un ticket huérfano creado pero no relaciones a medias no detectadas — ver Puntos frágiles).
6. Devuelve la solicitud completa vía `BASE_SELECT`, el mismo contrato que usa la creación normal de tickets.

A diferencia del flujo normal de creación de tickets (`createRequest`), `migrateRequest` explícitamente **no** ejecuta automatizaciones, **no** inserta notificaciones y **no** auto-asigna sprint — el histórico se vuelca tal cual, sin disparar reglas de negocio pensadas para tickets nuevos.

### Tablas de base de datos involucradas

- `TBL_Requests` — la solicitud creada (`Request_Is_Legacy = true`, `Request_Requested_By = null`, `Request_Legacy_Requester` con el texto crudo del equipo solicitante).
- `TBL_Migration_Map` — registro de idempotencia: `(Source_File, Source_Row) → Request_ID`. Es la pieza central que permite reejecutar sin duplicar.
- `TBL_Request_Team`, `TBL_Request_Labels`, `TBL_Request_Sprint`, `TBL_Requests_Assignments` — relaciones de la solicitud migrada (equipo destino, etiquetas/épicas, sprint, asignados).
- `TBL_Comments` — la "Nota" del Excel, si existe, como comentario del usuario de sistema (`User_ID = 17`).
- `TBL_Sprint` — upsert por `Sprint_Text` exacto (`upsertSprintByName`).
- `TBL_Labels` — upsert por `(Label_Name, Label_Team_ID, Label_Board_ID)` (`upsertLabelByName`).
- `TBL_Users` — consultada de forma masiva (`migrationFetchUsers`) para resolver asignados por nombre desde el script.
- `TBL_Requests_Templates` — de donde se toma el snapshot del `Form_Schema` al momento de migrar (plantilla General `ID=1` o Migraciones `ID=12`).

Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- **Idempotencia por fila**: la unicidad la da la dupla `(Source_File, Source_Row)` en `TBL_Migration_Map`, no el contenido de la fila. Si se corre el mismo archivo dos veces (incluso con datos ligeramente distintos en una fila ya migrada), esa fila se salta igual.
- **Nunca se adivinan asignados**: en `prisma-migrations/src/lib/users.ts`, el nombre de "Asignada" del Excel se compara (sin tildes, sin distinguir mayúsculas) contra nombre completo, formato colombiano (primer nombre + primer apellido) y primer nombre. Si matchea exactamente uno, se asigna; si matchea cero o varios, la solicitud se migra **sin asignar** y queda reportada en el dry-run/commit.
- **No se pierden datos aunque sean imperfectos**: filas sin título, con prioridad no reconocida o asignado ambiguo igual se migran (con esos campos vacíos/sin resolver) y se marcan en el reporte para revisión manual — la herramienta no descarta filas por defectos de dato, solo filas completamente en blanco (`isBlankRow` en `03-load.ts`).
- **Un equipo por corrida**: `TARGET_TEAM_ID` es fijo para toda la ejecución; para migrar a otro equipo hay que cambiar la configuración y volver a correr (el Excel completo se re-lee, pero las filas ya migradas a otro `sourceFile`/fila se saltan igual por la idempotencia — mezclar equipos en una sola corrida no está soportado).
- **Plantilla según si hay datos heterogéneos**: plantilla General (`ID=1`, `Form_Schema=[]`, `Request_Form_Data={}`) cuando el Excel no trae columnas extra útiles; plantilla Migraciones (`ID=12`, un único campo `datos_adicionales` de solo lectura) cuando sí las hay — declaradas en `EXTRA_DATA_COLS` de `runConfig.ts`, cada una se vuelca como `Etiqueta: valor` (una línea por columna con dato).
- **Enrutamiento a columna del tablero**: hoy todo cae en `DEFAULT_COLUMN_ID` (Historial); `STATUS_TO_COLUMN` permite mapear valores de "Status" del Excel a otra columna, con claves normalizadas (minúsculas, sin tildes).
- **Mapa de prioridad configurable**: `PRIORITY_TO_SCORE` en `runConfig.ts` traduce texto de prioridad a `Request_Score` (bajo/baja=1, medio/media=2, alto/alta=4, urgente=6); lo que no matchea queda sin score.

## Automatizaciones y efectos secundarios

- Comparte el patrón de **auto-invocación protegida por secreto interno** con el resto de jobs en background del sistema (exportaciones, renombrado de plantillas — ver `supabase/functions/api/index.ts`), aunque acá no hay `EdgeRuntime.waitUntil` ni chunking en el servidor: el "orquestador de lote" vive enteramente en el script Node externo, que llama `migrateRequest` una vez por fila, secuencialmente, con reintento (`callWithRetry`) ante errores de red o 5xx.
- Crear sprints/etiquetas nuevos durante la corrida (`upsertSprintByName`/`upsertLabelByName`) es un efecto secundario visible en el resto de la app: esos sprints/etiquetas quedan disponibles para tickets nuevos, no exclusivos del histórico.
- Ningún efecto de notificación: `migrateRequest` explícitamente no llama `insertNotifications`, así que nadie recibe alertas por tickets migrados.

## Puntos frágiles / riesgos conocidos

- **Rollback no automatizado**: según `prisma-migrations/README.md` (sección 8), revertir una migración es un proceso manual guiado por `TBL_Migration_Map` y los arrays de sprints/etiquetas creados que reporta el commit; el SQL de rollback "se genera bajo demanda" y no está incluido en el repo por defecto, para evitar borrados accidentales. No hay comando `npm run rollback`.
- **Huérfanos posibles si falla a mitad de fila**: el registro en `TBL_Migration_Map` se hace al final de `migrateRequest` (`supabase/functions/api/handlers/migration.ts:322-328`) a propósito, para que un fallo parcial reprocese la fila completa en el reintento. Pero si el insert principal en `TBL_Requests` tuvo éxito y luego falló algo posterior (por ejemplo, una de las relaciones en el `Promise.all`) y el `mapInsErr` también falla, queda un ticket con `Request_Is_Legacy = true` sin fila correspondiente en `TBL_Migration_Map` — el README documenta esto como detectable ("son solicitudes con `Is_Legacy = true` que no aparecen en `TBL_Migration_Map`") pero no hay una acción de limpieza automática para ello.
- **Pool de colores/íconos de etiquetas duplicado**: `LABEL_COLORS`/`LABEL_EMOJIS` en `supabase/functions/api/handlers/migration.ts:45-60` son una copia manual del pool que usa el ConfigPanel del frontend. Si alguien cambia el pool del front sin actualizar este archivo, las etiquetas creadas durante una migración quedarán visualmente inconsistentes con las creadas manualmente. El propio README lo advierte en su sección de mantenimiento.
- **Acoplamiento a `BASE_SELECT`**: el README (sección 10) advierte que si se agregan campos a `TBL_Requests`, hay que actualizar `BASE_SELECT` (compartido con el resto del sistema) — si no, `migrateRequest` seguirá funcionando pero el objeto `request` devuelto en la respuesta quedará incompleto.
- **Coincidencia de encabezados carácter por carácter**: `mapping.ts` exige que el nombre en `COL` coincida exactamente (tildes, mayúsculas, espacios) con el encabezado real del Excel; un desfasaje silencioso deja ese campo siempre vacío si no se lee con atención el aviso de "encabezados faltantes" del dry-run.
- **Sin transacción real entre relaciones**: el insert de `TBL_Request_Team`/`TBL_Request_Labels`/`TBL_Request_Sprint`/`TBL_Requests_Assignments`/`TBL_Comments` se hace con `Promise.all` (`supabase/functions/api/handlers/migration.ts:285-320`), es decir, en paralelo pero sin una transacción SQL que las agrupe atómicamente con el insert principal — si una falla y las demás no, el estado queda parcialmente escrito (mitigado en la práctica por el registro tardío en `TBL_Migration_Map`, que fuerza el reprocesamiento completo, pero no revierte lo ya insertado).
- **Ejecución estrictamente secuencial y sin límite de tiempo por parte de PRISMA**: al no correr dentro de la Edge Function ni tener chunking, una corrida de miles de filas depende enteramente de que el proceso Node local no se interrumpa; no hay mecanismo de progreso persistido del lado del servidor (a diferencia del módulo de Exportaciones) — si se corta la conexión a mitad de un commit largo, hay que volver a correr el mismo comando desde el principio (las filas ya migradas se saltan, pero el script vuelve a leer y evaluar todo el Excel).

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `upsertSprintByName` | Busca o crea un sprint por texto exacto | `supabase/functions/api/handlers/migration.ts` |
| `upsertLabelByName` | Busca o crea una etiqueta por (nombre, equipo, board) | `supabase/functions/api/handlers/migration.ts` |
| `migrationFetchUsers` | Lista todos los usuarios (activos e inactivos) para resolver asignados | `supabase/functions/api/handlers/migration.ts` |
| `migrateRequest` | Crea una solicitud histórica completa con sus relaciones; idempotente por `(sourceFile, sourceRow)` | `supabase/functions/api/handlers/migration.ts` |
