# Módulo: Tickets y Tablero Kanban

## Resumen

Este es el módulo central de PRISMA: cubre el ciclo de vida básico de una solicitud (ticket) — su creación a partir de una plantilla dinámica, su representación como tarjeta en el tablero Kanban, el movimiento entre columnas (drag-and-drop), la asignación de resolutores, el ruteo a sub-equipos, el etiquetado y el filtrado/búsqueda del tablero. Lo usan tanto clientes internos/externos (para crear y seguir sus solicitudes) como el equipo de TI y otros equipos de la organización (para gestionar su cola de trabajo). Es el punto de partida de casi cualquier otra funcionalidad de la app: comentarios, adjuntos, cierre con evidencia, feedback del cliente, etc. (ver `documentacion/modulos/02-ciclo-de-vida-del-ticket.md`) cuelgan de la solicitud creada aquí.

## Flujos de usuario

### Crear una solicitud
1. El usuario abre el asistente de creación (`CreateRequestModal`) desde el botón "+" de una columna del tablero, desde "Nueva solicitud" (`NewRequestPage`) o como sub-solicitud desde un ticket padre.
2. **Paso 1 — Equipo**: elige a qué equipo (board team) va dirigida la solicitud. Los equipos se agrupan por departamento; se excluyen los equipos externos, de integración y los marcados "solo admin" (salvo que el usuario sea `admin`).
3. **Paso 2 — Tipo (plantilla)**: elige una plantilla activa disponible para ese equipo. Cada plantilla trae su propio `Form_Schema` (campos adicionales, incluidos campos condicionales y "multicondicionales" anidados).
4. **Paso 3 — Detalles**: completa título, descripción, prioridad, etiquetas, sub-equipo(s) destino, sprint (opcional), resolutor(es) a asignar, horas estimadas, los campos propios de la plantilla y, obligatoriamente, al menos un **criterio de aceptación**. El botón de crear queda deshabilitado hasta que estas validaciones pasan (`isFormReady` en `CreateRequestModal.tsx`).
5. Al confirmar, se crea el ticket (acción `createRequest`), y en paralelo se crean sus criterios de aceptación (`createAcceptanceCriteria`) y sus asignaciones (`assignRequest`) — ver `useCreateRequest`.
6. Si el solicitante es externo (no es `admin` ni `ti_member`) y no se eligió sprint manualmente, el backend intenta auto-asignarle el primer sprint futuro con cupo externo disponible para ese equipo, y se lo comunica por correo (`ticket_recibido`).

### Ver y navegar el tablero Kanban
1. El usuario entra a `/board/:equipo` (`BoardPage`). Si el equipo no está en su lista de boards visibles, se lo redirige a `/home`.
2. El tablero se arma combinando: las columnas configuradas para ese equipo (visibilidad, color, si requiere evidencia, si es columna de cierre — `TBL_Team_Column_Config`), y las solicitudes del equipo agrupadas por columna.
3. La columna **Historial** solo trae, por defecto, las últimas 50 filas; el usuario puede pedir "Cargar más" para paginar hacia atrás por cursor (fecha + ID).
4. El usuario puede acotar la vista con: buscador (`BoardSearch`, con debounce y mínimo 2 caracteres), filtros avanzados (`BoardFilters`, condiciones AND/OR sobre múltiples campos), zoom del tablero, colapsar columnas, y el indicador de "sin categorizar" (`IntakeBadge`) que resalta tickets nuevos sin revisar.

### Mover un ticket en el tablero (drag & drop)
1. El usuario arrastra una tarjeta a otra columna (`KanbanBoard` usa `@dnd-kit`).
2. Si la columna destino requiere evidencia (`Evidence_Required` en `TBL_Team_Column_Config`) y el ticket todavía no tiene un cierre registrado, se abre `ClosureModal` pidiendo una nota obligatoria y, opcionalmente, adjuntos — el modal bloquea la confirmación si quedan criterios de aceptación sin contestar (ver más abajo, es una validación **solo de interfaz**).
3. Si no requiere evidencia, el movimiento se aplica de inmediato de forma optimista (la tarjeta salta de columna en la UI antes de que responda el servidor) vía `useMoveRequest` / acción `moveToColumn`.
4. Si la columna de origen "cerraba" el ticket y la de destino no, el ticket se reabre: se limpia `Request_Finished_At`, el progreso vuelve a 0, se agrega un comentario automático de sistema explicando la reapertura, y si el ticket había nacido de un bug report vinculado (`TBL_Bug_Reports.Linked_Request_ID`), ese bug vuelve a estado `asignado`.

### Asignar responsables y rutear a sub-equipos
- Desde el detalle del ticket (`RequestModal`), un usuario con permisos de edición puede asignar o desasignar resolutores individuales, o asignar/desasignar todo un sub-equipo de una vez (lo que asigna a todos sus miembros).
- El ticket también puede enrutarse a uno o más **sub-equipos** (`TBL_Request_Sub_Team`, acción `updateRequestSubTeams`), independientemente de a qué resolutor individual se asigne — es la unidad más fina de ruteo interno dentro de un board team.
- Asignar notifica in-app y por correo al resolutor (si quien asigna no es el mismo asignado), evitando duplicar la notificación si ya hay una sin leer para ese ticket.

### Aplicar etiquetas
- Las etiquetas (labels) se gestionan como catálogo por equipo/board en el panel de configuración (fuera de este módulo — ver el módulo de administración de catálogos). Aplicarlas o quitarlas de **un ticket puntual** se hace desde `RequestModal` (selector de categorías) y viaja como parte del patch de `updateRequest` (`labelIds`), que reemplaza el conjunto completo de etiquetas del ticket (estrategia delete-all + insert en `TBL_Request_Labels`).

### Filtrar el tablero
- El panel de filtros (`BoardFilters`, respaldado por `filterStore` y evaluado por `useFilteredBoard`) permite condiciones sobre título, prioridad, columna, equipo/sub-equipo, etiqueta, solicitante, resolutor, sprint, confidencialidad, si tiene/ es sub-ticket, progreso, horas estimadas y campos propios de cada plantilla (incluidos los que viven dentro de ramas condicionales). Las condiciones se combinan con AND u OR y persisten por board en `localStorage`.
- Existe también un filtrado más pesado del lado del servidor (RPC `filter_requests`, acción `filterRequests`) pensado para paginar/filtrar sin traer todo el board a memoria; construye un AST de condiciones y devuelve IDs + conteos por columna + cursor.

## Arquitectura técnica

### Frontend
- **Páginas**: `src/pages/BoardPage.tsx` (tablero por equipo, arma columnas + datos + filtros + búsqueda), `src/pages/NewRequestPage.tsx` (creación fuera del modal, mismo motor de plantillas), `src/pages/MyRequestsPage.tsx` / `ClientRequestsPage.tsx` / `TeamRequestsPage.tsx` / `RequestsPage.tsx` (vistas planas del mismo dataset, filtradas por solicitante/cliente/equipo), `src/pages/TasksPage.tsx` (solo reexporta `TasksTable`).
- **Componentes clave** (`src/features/requests/components/`): `KanbanBoard.tsx` (orquesta drag-and-drop, modal de ticket, modal de cierre, señal de apertura externa desde búsqueda), `KanbanColumn.tsx` (una columna: header con contadores de horas, colapso, "cargar más" del historial vía `IntersectionObserver`), `RequestCard.tsx` (tarjeta), `RequestModal.tsx` (detalle completo del ticket — el componente más grande de la feature, hub de edición/asignación/etiquetas/comentarios/adjuntos/criterios/feedback), `CreateRequestModal.tsx` (asistente de 3 pasos), `BoardFilters.tsx` / `BoardSearch.tsx` / `BoardCustomization.tsx` (controles del tablero), `IntakeBadge.tsx` (alerta de "sin categorizar" nuevos, usando `intakeStore`), `ClosureModal.tsx` (evidencia de cierre/avance, compartido con el módulo de ciclo de vida).
- **Hooks** (`src/features/requests/hooks/`): `useRequests.ts` (queries centrales: board por equipo, board completo, board de stats, "sin categorizar", historial con paginación por cursor, búsqueda con debounce — define `requestKeys`, la fábrica de query keys que usan casi todos los demás hooks), `useMoveRequests.ts` (mutación optimista de `moveToColumn`), `useCreateRequest.ts` (crea el ticket + sus criterios + sus asignaciones en paralelo), `UseUpdateRequest.tsx` (patch genérico con optimismo y rollback), `useColumnMap.ts` (resuelve `slug de columna → Board_Column_ID` por board, con fallback estático si el nombre no coincide), `useFilteredBoard.ts` (motor de evaluación de condiciones de filtro), `useKanbanAdmin.ts` (CRUD de columnas/equipos del kanban, usado por el panel de configuración), `useLabels.ts` (lectura de etiquetas por equipo/board).
- **Servicios**: `src/features/requests/services/SupabaseRequestsService.ts` — capa que traduce entre los tipos de dominio (`Request`) y las respuestas crudas de la Edge Function, y que además contiene la única excepción documentada al patrón de punto único de entrada: cuando `config.USE_DIRECT_READS` está activo, `fetchByTeamCode` y `fetchUncategorized` leen **directo de PostgREST** (con RLS) en vez de pasar por la Edge Function, duplicando manualmente la lógica de esos dos handlers (incluye un comentario `TODO: centralizar` reconociendo la duplicación).
- **Tipos**: `src/features/requests/types.ts` (modelo `Request`, `BoardData`, columnas/prioridades/payloads) y `src/features/requests/types/SolviTicket.ts` (tickets de la integración externa SOLVI, fuera del alcance de este documento).
- **Stores** (`src/store/`): `boardStore.ts` (zoom del kanban, equipo activo, señal de "enfocar columna"), `filterStore.ts` (condiciones de filtro persistidas por board), `intakeStore.ts` (IDs de tickets "sin categorizar" ya vistos, persistido, para el badge de intake).

### Backend (Edge Function)

El handler `supabase/functions/api/handlers/requests.ts` concentra casi toda la lógica de este módulo, apoyado en `shared/requests.ts` (correos transaccionales y helpers de participantes/columna de cierre), `shared/selects.ts` (los `select` reutilizables de PostgREST), `shared/mappers.ts` (tipos del sistema de acciones) y `shared/templateKeys.ts` (renombrado recursivo de claves de plantilla/`Form_Data`, usado cuando se edita el schema de una plantilla ya en uso).

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchAllByBoard` / `fetchAllByBoardStats` | Trae todas las solicitudes de un board (completo o liviano, paginando en tandas de 500 para stats). | Sin restricción de equipo — pensado para vistas de admin. |
| `fetchByTeamCode` | Trae el board de un equipo: columnas activas sin límite + historial recortado a 50, reordenado por fecha/ID. | Usa `chunkedIn` para no romper el límite de URL de PostgREST con boards grandes. |
| `fetchUncategorized` | Trae los tickets de la columna "Sin categorizar" de un board. | |
| `fetchById` | Detalle completo de un ticket (`DETAIL_SELECT`, incluye criterios). | `maybeSingle`: un ID inexistente da `null`, no 500. |
| `createRequest` | Crea el ticket, sus relaciones (equipos/labels/sprint), auto-asigna sprint a solicitantes externos si aplica, corre reglas de automatización `solicitud_creada`, notifica a sub-equipos si la solicitud es externa, y manda el correo `ticket_recibido` solo a externos. | Guarda un snapshot inmutable del `Form_Schema` de la plantilla (`Request_Template_Schema_Snapshot`) para no romper tickets viejos si la plantilla cambia después. |
| `moveToColumn` | Mueve el ticket de columna; si la columna destino es "de cierre" (`TBL_Team_Column_Config.Is_Close_Column`) sella `Request_Finished_At` y progreso 100; si reabre, los limpia y agrega un comentario automático. Sincroniza el bug report vinculado, notifica participantes, dispara correos de cambio de columna y corre reglas `columna_cambiada`. | No valida el límite (`Board_Column_Limit`) de la columna destino — ver Puntos frágiles. |
| `updateRequest` | Actualiza campos escalares, `Form_Data` y relaciones (labels/sprint/equipos) con estrategia delete-all + insert; registra el diff en el historial (`diffFields` + `diffFormData`). | El progreso se acota siempre a 0–100. |
| `updateRequestSubTeams` | Reemplaza el conjunto de sub-equipos de un ticket. | Delete-all + insert sobre `TBL_Request_Sub_Team`. |
| `deleteRequest` | Borra el ticket y todas sus filas relacionadas (equipos, labels, sprint, asignaciones, sub-equipos, criterios, feedback). | |
| `fetchChildRequests` | Lista las sub-solicitudes de un ticket padre. | |
| `fetchByAssignedTo` / `fetchByRequestedBy` / `fetchByParticipant` / `fetchMyMentions` | Listados personales (asignado a mí, creado por mí, participo, me mencionaron), acotados a un board. | |
| `fetchTeamHistorialCount` / `fetchTeamHistorialPage` | Conteo total y paginación por cursor (`Request_Created_At` + `Request_ID` descendente) del historial de un equipo. | Tamaño de página fijo (50), debe mantenerse en sync manualmente con `HISTORIAL_PAGE_SIZE` del frontend. |
| `searchRequests` | Búsqueda por título/ID dentro de un equipo (`ilike`, escapando caracteres especiales de PostgREST), mínimo 2 caracteres, hasta 30 resultados. | |
| `filterRequests` | Filtrado avanzado vía RPC de Postgres `filter_requests` (recibe un AST de condiciones), hidrata los IDs devueltos y reordena según la secuencia original de la RPC. | La lógica del AST vive en la base (función SQL), no en este repo. |

`supabase/functions/api/handlers/columns.ts` (`columnHandlers`) gestiona el catálogo de columnas del board: `fetchBoardColumns`, `updateBoardColumn` (nombre/color/límite), `createBoardColumn` (deriva el slug del nombre) y `reorderBoardColumn` (swap de posición con el vecino). `supabase/functions/api/handlers/assignments.ts` (`assignmentHandlers`) resuelve `assignRequest`/`unassignRequest` con notificación in-app y correo best-effort. `supabase/functions/api/handlers/labels.ts` (`labelHandlers`) es, en esta parte, el **catálogo** de etiquetas (`fetchLabelsByBoardId`, `fetchLabelsByTeamId`, `createLabel`, `updateLabel`, `deleteLabel`); la aplicación de una etiqueta a un ticket puntual no tiene una acción propia — viaja embebida en `updateRequest` (`labelIds`) y `createRequest` (inserta directo en `TBL_Request_Labels`).

### Tablas de base de datos involucradas

- `TBL_Requests` — la tabla central: cada fila es un ticket.
- `TBL_Board_Columns` — columnas del kanban (nombre, slug, posición, color, límite WIP).
- `TBL_Team_Column_Config` — configuración de una columna *por equipo* (visibilidad, si requiere evidencia, si es columna de cierre, colores propios).
- `TBL_Board_Teams` — los "equipos" del kanban (boards por equipo).
- `TBL_Request_Team` — a qué board team(s) pertenece un ticket.
- `TBL_Request_Sub_Team` / `TBL_Sub_Teams` — ruteo fino a sub-equipos.
- `TBL_Requests_Assignments` — resolutores asignados a un ticket.
- `TBL_Request_Labels` / `TBL_Labels` — etiquetas aplicadas y su catálogo.
- `TBL_Request_Sprint` / `TBL_Sprint` / `TBL_Sprint_Team_Capacity` — sprint asignado y capacidad externa por sprint/equipo (usada en la auto-asignación al crear).
- `TBL_Requests_Templates` — plantillas y su `Form_Schema`.
- `TBL_Automation_Rules` — reglas disparadas en `solicitud_creada` y `columna_cambiada`.
- `TBL_Bug_Reports` — bug reports que pueden originar un ticket (`Linked_Request_ID`) y cuyo estado se sincroniza al cerrar/reabrir.
- `TBL_Requests_History` — auditoría de cambios (ver también el módulo de ciclo de vida).

El detalle completo de columnas de cada tabla está en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- El identificador del ticket (`Request_ID`) sigue un formato estructurado documentado como `TCK-AÑO-LETRA-NÚMERO` (ver `README.md`); es generado por la base de datos al insertar (no hay lógica de generación en este repo, la columna se llena por un `DEFAULT`/trigger de Postgres fuera del código de la Edge Function).
- Crear un ticket exige **al menos un criterio de aceptación** (validación de frontend en `CreateRequestModal`; el backend no lo re-valida — ver Puntos frágiles).
- El `Form_Data` se guarda junto con un **snapshot inmutable** del `Form_Schema` de la plantilla al momento de crear (`Request_Template_Schema_Snapshot`); si la plantilla cambia después, los tickets viejos conservan su schema original.
- "Externo" se calcula de dos formas distintas y deliberadamente distintas en `createRequest`: por **rol** (`!= admin && != ti_member`) para decidir auto-asignación de sprint y el envío del correo `ticket_recibido`; y por **departamento** (`Department_ID !== 7`, TI) para decidir si se notifica a los sub-equipos destino. El código documenta explícitamente por qué no se puede reutilizar el mismo criterio para ambos casos (`ti_member` no existe como valor real en `TBL_Users.User_Role`).
- Al mover un ticket, si la columna origen cerraba el ticket y la destino no, se **reabre**: limpia `Request_Finished_At`, progreso a 0, y dispara un comentario de sistema explicando la reapertura al ticket (visible para todos los participantes).
- El límite de columna (`Board_Column_Limit`, configurable en el panel de administración) es **puramente informativo**: se muestra en la UI de configuración pero ningún handler lo valida al mover un ticket.
- El historial de un equipo se pagina siempre en tandas de 50 (`HISTORIAL_INITIAL_LIMIT` en backend, `HISTORIAL_PAGE_SIZE` en frontend); ambas constantes deben mantenerse sincronizadas a mano.
- La búsqueda (`searchRequests`) exige un mínimo de 2 caracteres y escapa los caracteres especiales de `ilike` (`%_,()`) antes de armarlo, para evitar que una búsqueda del usuario rompa la sintaxis del filtro.

## Automatizaciones y efectos secundarios

- **Reglas de automatización** (`TBL_Automation_Rules`) se evalúan en dos disparadores: `solicitud_creada` (al crear) y `columna_cambiada` (al mover, filtrando por el nombre exacto de la columna destino). Acciones soportadas: `asignar_resolutor`, `asignar_prioridad` (solo en `columna_cambiada`), `notificar_usuario` (a `solicitante`, `todos`, `asignados` o un `User_ID` fijo). Cada regla ejecutada incrementa su contador (`Rule_Exec_Count`) y registra `Rule_Last_Exec_At`. Todas envueltas en `try/catch` individuales: una regla que falla no frena a las demás ni al movimiento/creación.
- **Auto-asignación de sprint**: si un solicitante externo crea un ticket sin elegir sprint, el backend recorre los sprints futuros ordenados por fecha y asigna el primero con cupo externo disponible (`TBL_Sprint_Team_Capacity.External_Capacity`, default 20 si no hay fila configurada) para ese equipo.
- **Notificaciones in-app**: se insertan sobre `TBL_Notifications` en creación (a sub-equipos destino, si es externa), en `moveToColumn` (a resolutores + solicitante) y en toda regla de automatización que dispare `notificar_usuario`/`asignar_resolutor`.
- **Correos transaccionales** (`shared/requests.ts`, vía `sendEventEmail`): `ticket_recibido` (creación, solo externos), `movido_en_progreso` (una sola vez por ticket, solo si el solicitante no es también resolutor y es externo), `movido_client_review` (al llegar a la columna de revisión del cliente, se dispara tanto desde `moveToColumn` como desde el cierre con evidencia). Todos son *best-effort*: nunca lanzan excepción, solo loguean si fallan.
- **Sincronización de bug reports**: si un ticket nació de un `TBL_Bug_Reports` (vía `AssignBugModal`, componente fuera de este módulo), cerrarlo o reabrirlo actualiza el `Status` del bug report vinculado (`cerrado` / `asignado`).

## Puntos frágiles / riesgos conocidos

- **Autorización por board casi ausente en los handlers de tickets**: `shared/boardAccess.ts` expone `resolveVisibleBoardIds` como "fuente de verdad" de qué boards puede ver un usuario, pero en todo el código solo lo invoca `handlers/boardTeams.ts` (para armar el sidebar). Ninguna acción de `handlers/requests.ts` (`fetchByTeamCode`, `fetchAllByBoard`, `updateRequest`, `moveToColumn`, `deleteRequest`, `filterRequests`, etc.) valida que el usuario autenticado tenga realmente acceso al `boardId`/`teamCode` que pasa por parámetro. Como la Edge Function opera con la service role (bypassa RLS), cualquier llamada autenticada que conozca o adivine un `teamCode`/`boardId`/`Request_ID` puede leer o modificar tickets de un equipo al que no debería tener acceso; hoy la restricción vive solo en que el frontend no ofrece navegar a esos boards.
- **El límite de columna (`Board_Column_Limit`) no se aplica**: es configurable desde el panel de administración (`KanbansConfig.tsx`) y se muestra como "lím. N", pero ni `moveToColumn` ni el drag-and-drop del frontend impiden superarlo.
- **La asignación de resolutores no invalida caché**: `useAssignRequest`/`useUnassignRequest` (`src/features/requests/hooks/useUsers.ts`) no tienen `onSuccess`/`onSettled` que invaliden ninguna query; `RequestModal.tsx` actualiza únicamente su estado local (`setAssigneeIds`) tras llamar a la mutación. El resto de vistas que leen `request.assignees` desde la caché de React Query (tarjetas del tablero, `MemberHoursBar`, filtros por resolutor) quedan desincronizadas hasta el próximo refetch natural (`staleTime` de 60s en el board, o recarga de página).
- **Duplicación de `BASE_SELECT`**: `SupabaseRequestsService.ts` mantiene una copia manual (`BASE_SELECT_DIRECT`) del `select` de PostgREST del backend (`shared/selects.ts`), usada solo cuando `config.USE_DIRECT_READS` está activo. El propio código marca esto con un `// TODO: centralizar` — un cambio en el select del backend puede quedar sin reflejarse en el camino directo sin que nada lo avise.
- **Mapa de columnas hardcodeado en cuatro lugares distintos** como fallback ante una carga lenta o fallida de `fetchBoardColumns`: `KanbanBoard.tsx` (`COLUMN_ID_FALLBACK`), `BoardPage.tsx` (`COLUMN_ID_FALLBACK`), `TicketPage.tsx` (`COLUMN_ID_MAP`) y `useColumnMap.ts` (`MOCK_COLUMN_MAP`)/`useCloseRequest.ts` (`columnIdToKanban`). Si se agrega o reordena una columna en la base, estos mapas quedan desactualizados y hay que tocarlos todos a mano.
- **Filtrado de campos de plantilla**: `useFilteredBoard` trata un valor de campo de plantilla ausente como `'false'` solo si el filtro es booleano, y como "vacío" en cualquier otro caso — un comportamiento sutil que puede sorprender si se agregan tipos de campo nuevos a las plantillas sin actualizar este motor.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchAllByBoard` | Todas las solicitudes de un board. | `handlers/requests.ts` |
| `fetchAllByBoardStats` | Todas las solicitudes de un board, paginado, para estadísticas. | `handlers/requests.ts` |
| `fetchByTeamCode` | Board de un equipo (activas + historial recortado). | `handlers/requests.ts` |
| `fetchUncategorized` | Solicitudes en "Sin categorizar". | `handlers/requests.ts` |
| `fetchById` | Detalle completo de una solicitud. | `handlers/requests.ts` |
| `createRequest` | Crea una solicitud con relaciones y efectos colaterales. | `handlers/requests.ts` |
| `moveToColumn` | Mueve una solicitud de columna. | `handlers/requests.ts` |
| `updateRequest` | Actualiza campos/relaciones de una solicitud. | `handlers/requests.ts` |
| `updateRequestSubTeams` | Reemplaza los sub-equipos de una solicitud. | `handlers/requests.ts` |
| `deleteRequest` | Elimina una solicitud y sus dependencias. | `handlers/requests.ts` |
| `fetchChildRequests` | Sub-solicitudes de un padre. | `handlers/requests.ts` |
| `fetchByRequestedBy` / `fetchByAssignedTo` / `fetchByParticipant` / `fetchMyMentions` | Listados personales por board. | `handlers/requests.ts` |
| `fetchTeamHistorialCount` / `fetchTeamHistorialPage` | Conteo y paginación por cursor del historial. | `handlers/requests.ts` |
| `searchRequests` | Búsqueda por título/ID en un equipo. | `handlers/requests.ts` |
| `filterRequests` | Filtrado avanzado vía RPC `filter_requests`. | `handlers/requests.ts` |
| `fetchBoardColumns` | Columnas de un board. | `handlers/columns.ts` |
| `updateBoardColumn` | Actualiza nombre/color/límite de una columna. | `handlers/columns.ts` |
| `createBoardColumn` | Crea una columna nueva. | `handlers/columns.ts` |
| `reorderBoardColumn` | Reordena una columna (swap con vecina). | `handlers/columns.ts` |
| `assignRequest` | Asigna un resolutor a una solicitud. | `handlers/assignments.ts` |
| `unassignRequest` | Quita un resolutor de una solicitud. | `handlers/assignments.ts` |
| `fetchLabelsByBoardId` / `fetchLabelsByTeamId` | Lista etiquetas del catálogo. | `handlers/labels.ts` |
| `createLabel` / `updateLabel` / `deleteLabel` | CRUD del catálogo de etiquetas. | `handlers/labels.ts` |
