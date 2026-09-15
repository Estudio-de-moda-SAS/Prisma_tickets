# Módulo: Exportaciones

## Resumen

Permite a cualquier usuario exportar el listado de tickets (solicitudes) a Excel (`.xlsx`) o CSV, con un filtrado flexible (equipo, sprint, columna, plantilla, prioridad, solicitante, asignado, etiqueta, confidencialidad, rango de fechas) y control de qué columnas incluir. Para volúmenes grandes, la exportación corre como un **job en background** procesado por chunks dentro de la misma Edge Function (auto-invocación con `EdgeRuntime.waitUntil`), con progreso consultable por *polling*. El armado final del archivo (hojas, formato, colores, ZIP) ocurre **en el navegador del usuario**, no en el servidor: el backend solo entrega los tickets en crudo, troceados, vía Supabase Storage. Existe además un export directo/síncrono (`exportRequests`) para vistas previas y volúmenes chicos, y un historial persistente de exportaciones por usuario.

## Flujos de usuario

1. El usuario abre el panel de configuración → pestaña **Exportaciones** → **Nueva exportación**, lo que dispara un wizard de 3 pasos:
   - **Paso 1 — Filtros (`ScopeStep`)**: elige equipos, sprints, columnas, plantillas, prioridades, solicitantes, asignados, confidencialidad y rango de fechas de creación. Cualquier filtro vacío significa "todos".
   - **Paso 2 — Columnas (`ColumnsStep`)**: elige y ordena las columnas a incluir, entre columnas fijas (estructurales) y columnas dinámicas detectadas desde los `Form_Schema` de las plantillas que matchean los filtros. Las dinámicas solo se conocen tras pedir una vista previa (`useExportData` con `limit: 30`).
   - **Paso 3 — Formato (`FormatStep`)**: elige `xlsx` o `csv`, si agrupa en una hoja/archivo por equipo o todo junto, y ve una tabla de muestra (primeras 8 filas del preview) más el conteo total de tickets que matchean.
2. Al confirmar ("Encolar exportación") se crea un **job en background** (`createExportJob`). La UI cambia a `ExportProgressView`, que hace *polling* cada 2 segundos del estado del job (`getBackgroundJob`) y muestra una barra de progreso con ETA estimado.
3. Cuando el job llega a `done`, la propia vista dispara automáticamente la descarga: pide URLs firmadas de los artefactos (`getExportArtifactUrls`), descarga todos los chunks JSON, arma el archivo final (Excel o ZIP de CSVs) en el navegador y lo guarda con `saveAs`. Si el job falla, se muestra el mensaje de error y el usuario puede volver atrás.
4. El usuario puede seguir usando la app mientras el job corre ("Mantener en segundo plano" en el header de progreso vuelve a la lista); el job sigue procesándose del lado del servidor independientemente de si la vista de progreso sigue abierta.
5. En la pestaña **Historial** (`ExportHistoryList`) el usuario ve sus exportaciones pasadas con estado (`en cola` / `en progreso` / `listo` / `fallido` / `sin archivo`), puede **Descargar** de nuevo (si el artefacto en Storage todavía existe), **Repetir** (crea un job nuevo con los mismos filtros/columnas/formato) o **Eliminar** la entrada (borra también los artefactos de Storage y el job).

## Arquitectura técnica

### Frontend

- `src/components/ConfigPanelComponents/ExportsConfig.tsx` — componente raíz: maneja las pestañas ("Nueva exportación" / "Historial") y el wizard de 3 pasos (`ExportsWizard`, `ScopeStep`, `ColumnsStep`, `FormatStep`, `MultiSelectFilter`, `PreviewTable`). Cuando el wizard crea un job, muestra `ExportProgressView` en su lugar.
- `src/components/ConfigPanelComponents/ExportProgressView.tsx` — pantalla de progreso de un job puntual: hace polling vía `useExportJob`, calcula `%` y ETA a partir de `Job_Progress_Current`/`Job_Progress_Total`, y al detectar `Job_Status === 'done'` dispara automáticamente `processExportArtifact` (descarga + armado del archivo). Si `Job_Status === 'failed'`, muestra el error.
- `src/components/ConfigPanelComponents/ExportHistoryList.tsx` — lista el historial (`useExportHistory`), permite re-descargar (`processExportArtifact` directo, sin pasar por progreso), repetir (`useRepeatExport` → `repeatExport`) o eliminar (`useDeleteExport` → `deleteExportHistoryEntry`).
- `src/features/exports/hooks/`:
  - `useCreateExportJob.ts` — mutación que llama `createExportJob`; invalida `['export-history']` al terminar.
  - `useExportJob.ts` — `useQuery` con `refetchInterval` de 2s mientras el job esté `pending`/`running`; se detiene en `done`/`failed`. **Es polling, no realtime** (no usa Supabase Realtime/websockets).
  - `useExportHistory.ts` — lista de historial (`fetchExportHistory`, `staleTime` 30s) + mutaciones `useDeleteExport` (`deleteExportHistoryEntry`) y `useRepeatExport` (`repeatExport`).
  - `useExportData.ts` — ejecuta el export directo/síncrono `exportRequests`, usado para la vista previa del wizard (`staleTime: 0`, `retry: false`).
- `src/features/exports/services/`:
  - `columnRegistry.ts` — define `FIXED_COLUMNS` (24 columnas estructurales: ID, título, descripción, equipos, sub-equipos, sprint, etiquetas, prioridad, puntaje, progreso, horas, columna/estado, confidencialidad, solicitante y su email/departamento/equipo, asignados, fechas de creación/cierre, nota y autor de cierre, ticket padre) y detecta **columnas dinámicas** recorriendo `Request_Template_Schema_Snapshot` de los tickets devueltos (aplanando condicionales `trueBranch`/`falseBranch`, saltando tipos puramente visuales como `section`/`divider`/`heading`, y campos sin `label` humano).
  - `buildXlsx.ts` / `buildCsv.ts` — arman el archivo final **en el cliente**: hoja/archivo "Resumen" con conteos por equipo/plantilla/prioridad/columna, y una hoja (XLSX) o archivo dentro de un ZIP (CSV, siempre ZIP, con BOM UTF-8) por equipo cuando `sheetPerTemplate` está activo (pese al nombre del flag, agrupa por **equipo**, no por plantilla — ver Puntos frágiles). Si un ticket pertenece a varios equipos aparece repetido en cada hoja/archivo correspondiente.
  - `processExportArtifact.ts` — orquesta la descarga: pide URLs firmadas, baja `metadata.json` y todos los `chunk_NNNN.json` (concurrencia acotada a 5 descargas simultáneas), arma el `ExportDataset`, resuelve columnas, y si el total de filas supera `MAX_ROWS_PER_FILE` (25 000, espejo del `EXPORT_JOB_CHUNK_SIZE` del backend multiplicado) parte el resultado en un ZIP con varias partes (`buildXlsxZipSplit` / `buildCsvZipSplit`) para no reventar memoria del navegador. Al terminar, llama `confirmExportDownloaded`.
  - `buildCsv.ts`/`buildXlsx.ts` no suben nada de vuelta a Storage: el archivo final se entrega directo al usuario vía `file-saver` (`saveAs`), nunca pasa por el backend.

### Backend (Edge Function)

Todas las acciones de este módulo requieren JWT de usuario (ruta autenticada normal del `index.ts`), **excepto** el procesamiento interno del chunk, que usa el secreto interno (ver más abajo).

**`supabase/functions/api/handlers/exportJobs.ts`** (`exportJobHandlers`):

| Detalle por acción | |
|---|---|
| `createExportJob` | Resuelve el universo de tickets según `ExportFilters` (relacionales primero vía `_resolveExportCandidateIds`, luego orden/filtrado escalar vía `_resolveOrderedExportIds`, o un `count` directo si no hay filtros relacionales). Valida `total > 0` y `total <= MAX_EXPORT_SIZE` (100 000 por defecto). Inserta `TBL_Background_Jobs` (`Job_Type='export_requests'`) y `TBL_Export_History`. Sube `candidate_ids.json` (si hubo filtros relacionales) y `metadata.json` (catálogos de equipos/columnas/plantillas) al bucket `exports`, bajo el prefijo `${userId}/${jobId}`. Dispara el primer chunk con `EdgeRuntime.waitUntil(_kickoffExportChunk(jobId))`. |
| `getExportArtifactUrls` | Devuelve URLs firmadas (10 minutos de validez) de `metadata.json` y de cada `chunk_NNNN.json`, solo si el job es `done` y el usuario que pide es el dueño (`Job_Created_By` o `Job_Payload.userId`). |
| `confirmExportDownloaded` | Marca `Export_Downloaded_At` e incrementa `Export_Download_Count` en `TBL_Export_History`. **No borra artefactos de Storage** — el usuario puede re-descargar después con "Descargar" desde el historial, hasta que algo los limpie. |
| `fetchExportHistory` | Lista `TBL_Export_History` del usuario, más reciente primero, límite configurable (default 20). |
| `deleteExportHistoryEntry` | Verifica dueño, limpia artefactos de Storage (`_cleanupExportArtifacts`, best-effort) y borra la fila de historial y la del job. |
| `repeatExport` | Recupera filtros/formato/columnas de un export anterior y delega en `createExportJob` vía `dispatch` (mismo patrón usado por otros módulos del proyecto para componer acciones). |
| `exportRequests` | Export **directo y síncrono** (sin job), tope `MAX_LIMIT = 500` filas. Usado por el wizard para la vista previa (`limit: 30`). Misma lógica de filtros relacionales + escalares que el job, pero en una sola invocación: hace un "scan liviano" (solo `Request_ID` + fecha) para elegir el top-N más reciente antes de traer el `BASE_SELECT` pesado, minimizando el tamaño de la URL con `.in()`. |

**`supabase/functions/api/jobs/exportJob.ts`** — helpers del pipeline (no son `action`, se invocan internamente):
- `_resolveExportCandidateIds` / `_resolveOrderedExportIds` / `_countExportMatches` — resuelven filtros relacionales (equipo, sprint, asignado, etiqueta) por intersección de IDs, paginando con `.range()` para evitar el corte silencioso de PostgREST a 1000 filas, y troceando `.in()` en lotes de 150 para no exceder el largo de URL.
- `_uploadExportArtifact` / `_downloadCandidateIds` — sube/baja JSON a/desde el bucket `exports`.
- `_kickoffExportChunk` — hace un `fetch` a la propia función (`SELF_URL`) con `action: '_processExportJobChunk'` y el header `X-Internal-Job-Secret`; errores de red se ignoran a propósito (hay un watchdog).
- `_processExportChunks(jobId, supabase)` — **el corazón del job**: por cada invocación procesa hasta `EXPORT_MAX_CHUNKS_PER_INVOKE` (8 por defecto) chunks de `EXPORT_JOB_CHUNK_SIZE` (500 por defecto) tickets cada uno, es decir hasta 4000 tickets por invocación de la función. Transiciona `pending → running` en el primer chunk. Cada chunk se enriquece con `attachCriteriaSummary` (mismo helper compartido usado en otras partes del sistema) y se sube como `chunk_0001.json`, `chunk_0002.json`, etc. Si queda trabajo, se auto-invoca de nuevo (`_kickoffExportChunk`); si terminó, llama `_finalizeExportJob` (marca `done` en ambas tablas, arma el nombre de archivo, envía notificación `export_ready` vía `insertNotifications`). Cualquier excepción marca el job y el historial como `failed` con el mensaje de error (`_failExportJob`).
- `_cleanupExportArtifacts` — borra todos los archivos bajo un prefijo de Storage; se usa solo desde `deleteExportHistoryEntry`. Los errores se ignoran ("un cron limpiará si quedó algo" — ver Puntos frágiles).

**Punto de entrada (`supabase/functions/api/index.ts`)**: la acción `_processExportJobChunk` está protegida por el header `X-Internal-Job-Secret` (comparado contra `INTERNAL_JOB_SECRET`), no por JWT de usuario — es el mismo patrón de auto-invocación que usa el job de renombrado de plantillas (`_processBackgroundJobChunk` / `_processTemplateRenameChunk`, documentado aparte). El watchdog que reanuda jobs estancados es la acción `resumeStalledJob` (en `handlers/system.ts`, ruta autenticada normal): si el job no está `done`/`failed` y no se actualizó en más de 60 segundos, vuelve a lanzar `_kickoffJobChunk`. **Nota**: por el código revisado, este watchdog genérico dispara `_kickoffJobChunk` (el de renombrado); no se encontró un disparador explícito equivalente para exports estancados más allá del propio reintento en cadena de `_processExportChunks` — ver Puntos frágiles.

Constantes relevantes (`supabase/functions/api/config.ts`, todas configurables por variable de entorno):
- `MAX_EXPORT_SIZE` (100 000) — tope de tickets exportables en un job.
- `EXPORT_JOB_CHUNK_SIZE` (500) — tickets por chunk.
- `EXPORT_MAX_CHUNKS_PER_INVOKE` (8) — chunks procesados por invocación de la función.
- `EXPORT_BUCKET` = `'exports'` — bucket de Storage.
- `INTERNAL_JOB_SECRET`, `SELF_URL` — usados para la auto-invocación.

### Tablas de base de datos involucradas

- `TBL_Background_Jobs` — fila de estado del job (`Job_Type='export_requests'`, `Job_Status`, `Job_Payload` con filtros/formato/prefijo de storage, `Job_Progress_Current/Total`, `Job_Result`, `Job_Error`). Compartida con otros tipos de job en background (p. ej. renombrado de plantillas).
- `TBL_Export_History` — historial de exportaciones por usuario: filtros y columnas usadas, formato, total, nombre de archivo, prefijo de storage, estado, error, fechas de creación/completado/descarga, contador de descargas, `Export_Auto_Delete_At`.
- `TBL_Requests` — origen de los tickets exportados (vía `BASE_SELECT`, con sus joins a plantillas, columnas, requester, etc.).
- `TBL_Request_Team`, `TBL_Request_Sprint`, `TBL_Requests_Assignments`, `TBL_Request_Labels` — tablas de unión usadas para resolver los filtros relacionales (equipo, sprint, asignado, etiqueta).
- `TBL_Board_Teams`, `TBL_Board_Columns`, `TBL_Requests_Templates` — catálogos incluidos en `metadata.json` para poder agrupar/mostrar nombres en el archivo final sin volver a golpear la base desde el cliente.

Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- Un export vacío (`total === 0`) o que supere `MAX_EXPORT_SIZE` se rechaza **antes** de crear el job (no se crea `TBL_Background_Jobs` ni `TBL_Export_History`).
- El export directo (`exportRequests`) tiene un tope duro de 500 filas (`MAX_LIMIT`), pensado solo para preview — nunca para el archivo final.
- Los filtros vacíos/`null` se interpretan como "sin restricción" (trae todo), tanto en frontend como en backend.
- Las URLs firmadas de artefactos duran solo 10 minutos (`createSignedUrls(filesToSign, 600)`); si la descarga del cliente se demora más que eso en arrancar, falla y hay que volver a pedirlas (`getExportArtifactUrls` se puede reintentar mientras el job siga `done` y los archivos sigan en Storage).
- `getExportArtifactUrls` exige explícitamente `Job_Status === 'done'` y que el usuario sea dueño del job (`Job_Created_By` o `Job_Payload.userId`) — no se puede pedir un export ajeno ni uno todavía en curso.
- El armado del archivo final (Excel/CSV) **nunca ocurre en el servidor**: los chunks en Storage son siempre JSON crudo; toda la lógica de formato, agrupamiento por equipo, colores de prioridad y hoja "Resumen" vive en el navegador (`buildXlsx.ts`/`buildCsv.ts`). Esto implica que la generación del archivo depende del dispositivo/memoria del usuario, no del backend.
- El flag `sheetPerTemplate` (nombre heredado de una fase anterior del diseño) hoy **agrupa por equipo**, no por plantilla; un ticket con varios equipos aparece duplicado en cada hoja/archivo de equipo correspondiente.

## Automatizaciones y efectos secundarios

- Al completar un job, se inserta una notificación (`insertNotifications`, tipo `export_ready`) para el usuario dueño, con el conteo de tickets y el formato.
- El progreso (`Job_Progress_Current`) se persiste después de cada chunk, lo que permite que la UI (polling cada 2s) muestre avance incluso si el usuario recarga la página o cierra y reabre la vista de progreso — el job sigue corriendo del lado del servidor independientemente del cliente.
- `repeatExport` no reutiliza artefactos viejos: crea un job completamente nuevo (nuevo `Job_ID`, nuevo `Export_ID`, nuevo prefijo de Storage), aunque los filtros sean idénticos.
- Compartir bucket/patrón con el job de renombrado de plantillas: ambos usan `EdgeRuntime.waitUntil` + auto-invocación HTTP protegida por `X-Internal-Job-Secret` para eludir el límite de tiempo de una sola invocación de Edge Function.

## Puntos frágiles / riesgos conocidos

- **Limpieza de artefactos vencidos no localizada en este repo**: `TBL_Export_History.Export_Auto_Delete_At` existe y se lee (`fetchExportHistory`), y el mensaje de notificación dice "disponible para descarga por 7 días" (`supabase/functions/api/jobs/exportJob.ts:430`), pero no se encontró en `supabase/functions/api` ningún proceso que efectivamente borre los archivos de Storage cuando vence ese plazo — la única limpieza de artefactos en código es manual, vía `deleteExportHistoryEntry` (`supabase/functions/api/handlers/exportJobs.ts:301-318`). Es probable que exista un `pg_cron` o tarea externa a nivel de base de datos no versionada en este repositorio; si no existe, los archivos JSON quedarían huérfanos en Storage indefinidamente tras la fecha de auto-borrado.
- **`_cleanupExportArtifacts` silencia errores** (`supabase/functions/api/jobs/exportJob.ts:637-643`, comentario "un cron limpiará si quedó algo") — si falla el borrado de Storage al eliminar una entrada de historial, no queda registro del fallo.
- **Reanudación de jobs estancados**: `resumeStalledJob` (`supabase/functions/api/handlers/system.ts:378-399`) llama `_kickoffJobChunk`, que por el nombre corresponde al pipeline de renombrado de plantillas, no al de exportación (`_kickoffExportChunk`). No se encontró en el código un watchdog equivalente específico para jobs de tipo `export_requests`; si un chunk de exportación queda "colgado" (el `fetch` de auto-invocación falla silenciosamente y no hay reintento externo), el job podría quedar `running` sin avanzar y sin mecanismo de recuperación visible más allá de que el usuario lo note y decida repetir el export.
- **Nombre de campo engañoso**: `sheetPerTemplate` (tipo, payload, UI) agrupa por **equipo**, no por plantilla, tanto en `buildXlsx.ts` como en `buildCsv.ts`. Cualquier cambio futuro que asuma agrupamiento por plantilla a partir del nombre del campo va a introducir un bug.
- **Memoria del navegador**: para exports muy grandes el split solo entra en juego a partir de `MAX_ROWS_PER_FILE` (25 000 filas) en `processExportArtifact.ts:23`; hasta ese umbral, todos los tickets y su archivo completo se mantienen en memoria del cliente antes de guardar.
- **Dependencia de `src/types/supabase.types.ts`**: ese archivo está desactualizado (solo 19 de 49 tablas reales) — no usarlo como referencia de columnas de `TBL_Export_History` / `TBL_Background_Jobs`; los tipos reales usados por este módulo viven en `src/features/exports/types.ts` y en los propios handlers.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `createExportJob` | Crea un job de exportación en background y dispara el primer chunk | `supabase/functions/api/handlers/exportJobs.ts` |
| `getExportArtifactUrls` | Devuelve URLs firmadas (10 min) de los artefactos de un export `done` | `supabase/functions/api/handlers/exportJobs.ts` |
| `confirmExportDownloaded` | Marca un export como descargado e incrementa su contador | `supabase/functions/api/handlers/exportJobs.ts` |
| `fetchExportHistory` | Lista el historial de exportaciones de un usuario | `supabase/functions/api/handlers/exportJobs.ts` |
| `deleteExportHistoryEntry` | Borra una entrada de historial, su job y sus artefactos de Storage | `supabase/functions/api/handlers/exportJobs.ts` |
| `repeatExport` | Repite un export previo con los mismos filtros/formato (crea un job nuevo) | `supabase/functions/api/handlers/exportJobs.ts` |
| `exportRequests` | Export directo/síncrono, tope 500 filas (usado para preview) | `supabase/functions/api/handlers/exportJobs.ts` |
| `_processExportJobChunk` | Acción interna (solo `X-Internal-Job-Secret`) que procesa el siguiente lote de chunks de un job | `supabase/functions/api/index.ts` → `supabase/functions/api/jobs/exportJob.ts` |
| `getBackgroundJob` | Devuelve estado/progreso de cualquier job en background (usado para el polling de la UI) | `supabase/functions/api/handlers/system.ts` |
| `resumeStalledJob` | Reanuda un job estancado hace más de 60s (ver Puntos frágiles sobre su alcance) | `supabase/functions/api/handlers/system.ts` |
