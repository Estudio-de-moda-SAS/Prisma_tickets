# Módulo: Plantillas de solicitudes

## Resumen

Las plantillas (`TBL_Requests_Templates`) definen el tipo de ticket que un usuario puede crear (nombre, ícono, color, equipos habilitados) y su formulario dinámico (`Form_Schema`, JSONB con campos de texto, selección, casillas y ramas condicionales/multi-condicionales anidadas). Al crear un ticket, PRISMA copia ese esquema como un **snapshot inmutable** (`Request_Template_Schema_Snapshot`) dentro del propio ticket, de modo que editar la plantilla después no altera cómo se ven los tickets ya creados. Renombrar la `key` de un campo es la operación más delicada del módulo: hay que reescribir esa clave tanto en el `Form_Data` como en el snapshot de **todos** los tickets existentes de esa plantilla, lo cual se hace de forma síncrona para pocos tickets o como **job en background** (troceado/chunked) para volúmenes grandes.

## Flujos de usuario

- **Admin (Config → Plantillas de solicitudes)**: crea/edita/elimina plantillas desde `RequestsTemplates.tsx` (`TemplateList` → `TemplateForm`). En la pestaña "Info" define nombre, descripción, ícono, color, badge, equipos que la usan y si está activa (una plantilla inactiva no aparece en el modal de nueva solicitud). En la pestaña "Campos" arma el formulario dinámico: campos simples (texto, texto largo, desplegable, radio, casilla), campos **condicionales** (rama SÍ/NO, hasta 5 niveles de anidamiento) y campos **multi-condicionales** (N ramas nombrables, seleccionadas por `optionKey` estable en vez de por label). Cada campo puede marcarse como requerido, colapsable, visible en el modal, visible en la card del kanban, visible en el listado de tareas, y activo/desactivado.
- **Admin que renombra un campo existente**: al guardar, el frontend detecta automáticamente qué `key` cambiaron (comparando por un `__editId` interno efímero, no por posición) y, si hay cambios, muestra `TemplateRenameModal` con un resumen de los renombrados y cuántos tickets se verán afectados. Al confirmar, dispara el job de renombrado en background y muestra una barra de progreso con polling; puede cerrar el modal y el proceso sigue corriendo del lado del servidor.
- **Cualquier usuario que crea un ticket nuevo**: elige una plantilla activa disponible para su equipo; el formulario dinámico se renderiza según `Form_Schema` de esa plantilla, incluidas las ramas condicionales que aparecen/desaparecen según las respuestas.
- **Cualquier usuario que abre un ticket ya creado**: ve el formulario según el **snapshot** guardado en el propio ticket (`Request_Template_Schema_Snapshot`), no según la plantilla actual — así, si la plantilla cambió después, el ticket viejo se sigue viendo tal como era cuando se creó.

## Arquitectura técnica

### Frontend

- **Panel de configuración**: `src/components/ConfigPanelComponents/RequestsTemplates.tsx` — contiene:
  - `TemplateList`/`TemplateRow`: listado de plantillas del board.
  - `TemplateForm`: formulario de alta/edición con tabs "Info"/"Campos"; orquesta el flujo de detección y confirmación de renombrados (`handleSave` → `diffRenames` → `getTemplateRenameImpact` → modal → `createTemplateRenameJob` → polling de `getBackgroundJob`).
  - `FieldEditor`, `BranchEditor`, `MultiOptionEditor`: edición recursiva de campos simples, condicionales y multi-condicionales (recursión hasta `MAX_CONDITIONAL_DEPTH = 5`).
- **Tipos y fábricas de campos**: `src/features/requests/templates/types.ts` — define `FieldType`, `SimpleField`, `ConditionalField`, `MultiConditionalField`, `BranchOption`, y las fábricas `makeEmptySimpleField`/`makeEmptyConditionalField`/`makeEmptyMultiConditionalField`/`makeOptionKey`. Importante: en un campo multi-condicional, el valor guardado en `Form_Data` es el `optionKey` (estable, generado una sola vez), **nunca el label** — así se puede renombrar la etiqueta de una rama sin tocar ningún ticket.
- **Detección de renombrados**: `src/features/requests/templates/renameUtils.ts` — `annotateWithEditIds` agrega un `__editId` efímero (solo en memoria, nunca se persiste) a cada nodo del schema al cargar el editor; `diffRenames(initial, current)` empareja nodos por `__editId` entre el snapshot inicial y el estado actual del formulario para detectar qué `key` cambiaron, incluso si el usuario reordenó o anidó campos; `stripEditIds` limpia el schema antes de enviarlo al backend.
- **Modal de confirmación/progreso**: `src/features/requests/templates/TemplateRenameModal.tsx` — cuatro fases (`confirm` → `processing` → `done`/`error`); en `processing` muestra una barra de progreso alimentada por polling cada 1.5s contra `getBackgroundJob`, con mensajes rotativos y un "watchdog": si el job lleva >60s sin actualizarse, llama a `resumeStalledJob` para reintentar el siguiente chunk.
- **Renderizado dinámico del formulario en un ticket**: el formulario de creación/edición de un ticket lee `Request_Template_Form_Schema` (al crear) o `Request_Template_Schema_Snapshot` (al ver un ticket existente) y lo recorre con la misma estructura de tipos (`TemplateExtraField`) para pintar los campos, incluidas las ramas condicionales/multi-condicionales, en los componentes de `src/features/requests/components/` (p. ej. `RequestModal.tsx`, `CreateRequestModal.tsx`, `RequestModalComponents.tsx`), que consumen `Request.extraFields`/`Form_Data` definidos en `src/features/requests/types.ts`.
- **Modelo de ticket relacionado**: `src/features/requests/types.ts` define `Request.templateId`, `Request.extraFields` (`RequestExtraFields`) y `RequestTemplate` (`{ templateId, nombre, descripcion }`) — el tipo liviano usado en listados; la definición completa de campos vive en `templates/types.ts` (`TemplateDefinition`, `TemplateVisual`).

### Backend (Edge Function)

Handler: `supabase/functions/api/handlers/templates.ts` (`templateHandlers`), con utilidades en `supabase/functions/api/shared/templateKeys.ts` y el job en `supabase/functions/api/jobs/renameJob.ts`. Registrado en `router.ts`.

| Acción | Qué hace | Parámetros clave | Reglas no obvias |
|---|---|---|---|
| `fetchTemplatesByBoardId` | Lista las plantillas de un board, ordenadas por `Request_Template_ID` ascendente. | `{ boardId }` | — |
| `createTemplate` | Crea una plantilla nueva. | `{ boardId, name, description, icon, color, badge, formSchema, teamIds, isActive }` | — |
| `updateTemplate` | Actualiza una plantilla **sin** tocar tickets existentes ni detectar renombrados. | `{ id, ...datos }` | Solo debe usarse cuando no hay cambios de `key` en los campos; si los hay, usar `updateTemplateWithRenames` o `createTemplateRenameJob`. |
| `deleteTemplate` | Elimina una plantilla. | `{ id }` | No borra ni desvincula los tickets ya creados con ella (siguen teniendo su `Request_Template_ID` y su snapshot). |
| `getTemplateRenameImpact` | Cuenta cuántos tickets usan la plantilla, antes de decidir la ruta de renombrado. | `{ templateId }` | Devuelve `{ requestsCount }`; el frontend la usa para mostrar el número en el modal de confirmación. |
| `updateTemplateWithRenames` | Actualiza la plantilla y propaga los renombrados de forma **síncrona**, en lotes de 100 tickets. | `{ ...datos de plantilla, renames: [{oldKey,newKey}], renamedBy }` | Valida que cada `newKey` cumpla `^[a-z0-9_]+$`, que no haya `oldKey` duplicado, y que el schema final no tenga `key` repetidas. Pensada para **volúmenes chicos**; queda como ruta alternativa (el frontend actual usa la ruta de job, `createTemplateRenameJob`). |
| `createTemplateRenameJob` | Igual validación que la anterior, pero crea un `TBL_Background_Jobs` (`Job_Type: 'template_field_rename'`) y arranca el primer chunk vía `EdgeRuntime.waitUntil`. | `{ ...datos de plantilla, renames, renamedBy }` | Si no hay tickets que actualizar, finaliza el job de inmediato (sin llegar a correr un chunk). Devuelve `{ jobId, requestsTotal, ok }`; `jobId` es `null` si no había renombrados. Es la ruta que usa el frontend (`TemplateForm.handleConfirmRename`). |

Utilidades de `shared/templateKeys.ts` (compartidas entre la ruta síncrona y el job):
- `_collectSchemaKeys(schema)`: recolecta todas las `key` del schema recorriendo también `trueBranch`/`falseBranch` (condicional) y `options[].fields` (multi-condicional).
- `_renameKeysInSchema(schema, renames)`: devuelve una copia del schema con las `key` reescritas, respetando el mismo anidamiento.
- `_renameKeysInFormData(formData, renames)`: reescribe las claves de un `Form_Data`; trata `__labels` como caso especial (renombra también sus claves internas, preservando si el valor original era un string JSON o un objeto).

Acciones auxiliares usadas por el flujo de renombrado (documentadas en el módulo de sistema/jobs, no en `templates.ts`):
- `getBackgroundJob` (`supabase/functions/api/handlers/system.ts`) — consulta estado/progreso de un job, usada para el polling del frontend.
- `resumeStalledJob` (`supabase/functions/api/handlers/system.ts`) — si el job lleva >60s sin actualizarse, relanza el siguiente chunk.
- `_processBackgroundJobChunk` (interno, en `supabase/functions/api/index.ts`) — endpoint protegido por el header `X-Internal-Job-Secret` que la propia Edge Function usa para "auto-invocarse" y seguir procesando el job.

### Tablas de base de datos involucradas

- `TBL_Requests_Templates` — cabecera de la plantilla, con `Request_Template_Form_Schema` (JSONB, el esquema editable) y metadatos visuales (`Icon`, `Color`, `Badge`, `Teams`, `Is_Active`).
- `TBL_Requests` — cada ticket guarda `Request_Template_ID`, `Request_Form_Data` (respuestas del usuario) y `Request_Template_Schema_Snapshot` (JSONB, copia inmutable del schema al momento de crear el ticket).
- `TBL_Template_Field_Renames` — auditoría de cada renombrado aplicado: `Template_ID`, `Old_Key`, `New_Key`, `Renamed_By`, `Renamed_At`, `Requests_Affected`. Se escribe tanto en la ruta síncrona como al finalizar el job.
- `TBL_Background_Jobs` — cola/estado de jobs en background genérica (no exclusiva de plantillas; también la usa el job de exportación). Campos relevantes: `Job_Type`, `Job_Status` (`pending`/`running`/`done`/`failed`), `Job_Payload`, `Job_Progress_Current`/`Job_Progress_Total`, `Job_Result`, `Job_Error`, `Job_Created_By`, `Job_Updated_At`, `Job_Completed_At`.

(Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.)

## Reglas de negocio y validaciones clave

- **El snapshot es la fuente de verdad para tickets ya creados**: al crear un ticket, `requests.ts::createRequest` lee `Request_Template_Form_Schema` de la plantilla en ese instante y lo copia tal cual a `Request_Template_Schema_Snapshot` del nuevo ticket (`supabase/functions/api/handlers/requests.ts:270-294`). Editar la plantilla después (agregar/quitar campos, cambiar tipos) **no afecta** a los tickets ya existentes — solo a los que se creen después. La única forma de que un ticket viejo cambie su snapshot es un renombrado explícito de `key` (síncrono o por job), que reescribe el snapshot puntualmente para esa clave.
- **Formato de `key` válido**: al renombrar, la nueva clave debe cumplir `^[a-z0-9_]+$` (minúsculas, dígitos, guión bajo) — se valida tanto en `updateTemplateWithRenames` como en `createTemplateRenameJob`.
- **No se permiten `key` duplicadas**: se valida que el schema final no tenga dos campos con la misma `key` (recorriendo también las ramas anidadas vía `_collectSchemaKeys`), y que no haya dos renombrados con el mismo `oldKey`.
- **`optionKey` de un multi-condicional nunca se renombra**: es un identificador estable generado una vez (`makeOptionKey`); solo su `label` (texto mostrado) es editable. Esto evita que cambiar el texto de una opción rompa los tickets que ya eligieron esa rama.
- **Por qué el renombrado necesita un job en background y no una operación síncrona simple**: renombrar una `key` implica reescribir el `Form_Data` y el snapshot de **cada ticket** que usa esa plantilla — con miles de tickets, eso puede exceder ampliamente el tiempo de ejecución permitido para una sola invocación de una Edge Function. Por eso existen dos rutas:
  - **Síncrona** (`updateTemplateWithRenames`): procesa todos los tickets en un único request/response, en lotes de 100 (`BATCH_SIZE`) leídos con `.range()` y actualizados uno por uno. Aceptable solo para volúmenes chicos.
  - **Job en background** (`createTemplateRenameJob` + `renameJob.ts`): crea una fila en `TBL_Background_Jobs`, procesa hasta `JOB_MAX_CHUNKS_PER_INVOKE = 5` chunks de `JOB_CHUNK_SIZE = 100` tickets por invocación (`supabase/functions/api/config.ts`), persiste el progreso (`Job_Progress_Current`) después de cada chunk, y si aún quedan tickets se **auto-invoca** a sí misma (`_kickoffJobChunk` hace un `fetch` a la propia Edge Function con `action: '_processBackgroundJobChunk'` y el header `X-Internal-Job-Secret`) para continuar en una invocación nueva, evitando el límite de tiempo de una sola ejecución.
- **Qué pasa con los tickets ya creados con el nombre viejo del campo**: mientras el job no haya llegado a ellos, sus `Form_Data`/snapshot siguen con la `key` vieja; el job los procesa en el orden de `Request_ID` ascendente (paginado con `.range(processed, processed + JOB_CHUNK_SIZE - 1)`), así que el progreso es determinístico y reanudable — si el job se detiene a mitad de camino, `resumeStalledJob` puede continuarlo exactamente donde quedó (usa `Job_Progress_Current` como cursor).
- **Auditoría**: cada renombrado (síncrono o por job) deja una fila en `TBL_Template_Field_Renames` con cuántos tickets se vieron afectados, quién lo hizo y cuándo. Es un registro histórico, no reversible automáticamente (así lo advierte el modal de confirmación en el frontend).
- **Plantillas inactivas** (`Request_Template_Is_Active: false`) no aparecen en el modal de nueva solicitud, pero los tickets ya creados con ellas siguen funcionando normalmente (su snapshot no depende del estado `Is_Active` de la plantilla).

## Automatizaciones y efectos secundarios

- **Auto-invocación del job de renombrado**: cada chunk procesado dispara, si quedan más tickets, una nueva invocación de la propia Edge Function vía `fetch` + `EdgeRuntime.waitUntil` (o `.catch(() => {})` como fallback si `EdgeRuntime` no está disponible) — efecto secundario de red hacia sí misma, protegido por `INTERNAL_JOB_SECRET`.
- **Invalidación de caché en el frontend** tras completar un job de renombrado: `TemplateForm` invalida `['boardMetadata']`, `['templates']` y `['requests']` en TanStack Query para que el board y los listados reflejen los tickets ya actualizados.
- **Watchdog de jobs estancados**: si el polling del frontend detecta que `Job_Updated_At` lleva más de 60s sin cambiar, llama a `resumeStalledJob`, que relanza `_kickoffJobChunk` para ese `jobId`.

## Puntos frágiles / riesgos conocidos

- La auto-invocación del job (`_kickoffJobChunk` en `supabase/functions/api/jobs/renameJob.ts:34-48`) ignora cualquier error del `fetch` a propósito ("los errores se ignoran a propósito: si queda colgado, se reintenta en el próximo poll") — si `resumeStalledJob` no llega a dispararse (por ejemplo, si el usuario cierra el modal y nadie más hace polling), un job puede quedar indefinidamente en `running` sin que nadie lo reanude.
- Existen **dos implementaciones casi idénticas** del recorrido/reescritura de renombrados síncrono: `updateTemplateWithRenames` (en `templates.ts`) duplica la lógica de lote-de-100 que también existe, con distinto tamaño de chunk y mecanismo, en `_processTemplateRenameChunk` (`renameJob.ts`). Un cambio en la validación de renombrados en un lugar (por ejemplo, el regex de `newKey`) debe replicarse manualmente en el otro — ya están en paridad, pero no comparten código de validación.
- `updateTemplate` (sin renames) no valida que el nuevo `formSchema` no tenga `key` duplicadas ni que no haya cambiado ninguna `key` respecto al anterior — si el frontend tuviera un bug y llamara a `updateTemplate` en vez de `updateTemplateWithRenames`/`createTemplateRenameJob` tras un renombrado real, los tickets existentes quedarían con `Form_Data`/snapshot desincronizados de la plantilla nueva (con la `key` vieja), sin ningún aviso.
- El snapshot (`Request_Template_Schema_Snapshot`) se copia completo en cada ticket; para boards con muchísimos tickets y plantillas con schemas grandes, esto multiplica el almacenamiento de JSONB (trade-off consciente a cambio de inmutabilidad histórica).
- La profundidad máxima de anidamiento condicional es 5 (`MAX_CONDITIONAL_DEPTH` en `src/features/requests/templates/types.ts:91`) — es una regla de UI (`getBranchFieldTypes` oculta las opciones "Condicional"/"Multi-opción" al llegar al límite), pero no hay validación equivalente en el backend; un payload manual que exceda ese límite no sería rechazado por `templates.ts`.
- La detección de renombrados (`diffRenames` en `renameUtils.ts`) depende de que el `__editId` se preserve durante toda la edición en memoria; si un campo se elimina y se vuelve a crear con la misma `key` en la misma sesión de edición, se interpretaría como un campo nuevo (no como "sin cambios"), y no generaría una entrada de rename — comportamiento correcto, pero sutil si se depura el flujo.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchTemplatesByBoardId` | Lista las plantillas de un board. | `supabase/functions/api/handlers/templates.ts` |
| `createTemplate` | Crea una plantilla de solicitud. | `supabase/functions/api/handlers/templates.ts` |
| `updateTemplate` | Actualiza una plantilla sin propagar renombrados. | `supabase/functions/api/handlers/templates.ts` |
| `deleteTemplate` | Elimina una plantilla. | `supabase/functions/api/handlers/templates.ts` |
| `getTemplateRenameImpact` | Cuenta tickets afectados por un renombrado antes de aplicarlo. | `supabase/functions/api/handlers/templates.ts` |
| `updateTemplateWithRenames` | Actualiza la plantilla y propaga renombrados de forma síncrona (lotes de 100). | `supabase/functions/api/handlers/templates.ts` |
| `createTemplateRenameJob` | Actualiza la plantilla y lanza el renombrado como job en background. | `supabase/functions/api/handlers/templates.ts` |
| `getBackgroundJob` | Devuelve estado/progreso de un job (polling). | `supabase/functions/api/handlers/system.ts` |
| `resumeStalledJob` | Reanuda un job en background estancado (>60s sin update). | `supabase/functions/api/handlers/system.ts` |
| `_processBackgroundJobChunk` | Acción interna (self-invoke, protegida por `X-Internal-Job-Secret`) que procesa el siguiente chunk del job. | `supabase/functions/api/index.ts` → `supabase/functions/api/jobs/renameJob.ts` |
