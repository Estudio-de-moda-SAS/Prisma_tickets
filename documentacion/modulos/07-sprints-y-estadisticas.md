# Módulo: Sprints

## Resumen

Este módulo cubre la gestión de **sprints**: períodos de trabajo con fecha de inicio/fin, capacidad externa por equipo (usada para auto-asignar tickets de usuarios externos al primer sprint con cupo disponible) y arranque automático el día de inicio. Los sprints creados acá alimentan tanto el dashboard de estadísticas (`/stats`) como comparativos de cumplimiento por sprint — pero **el cálculo de esas métricas está documentado aparte**, en [`modulos/13-dashboard.md`](13-dashboard.md), porque no es parte de la gestión del sprint en sí. Casi todo vive en un único handler (`sprints.ts`); la auto-asignación de sprint a tickets externos vive en `requests.ts::createRequest`.

## Flujos de usuario

- **Admin (Config → Sprints)**: crea/edita/elimina sprints (`SprintsConfig.tsx` → `SprintList`/`SprintForm`), define fechas de inicio/fin y, opcionalmente, la "capacidad externa" por equipo (máximo de tickets de usuarios externos que un equipo puede recibir en ese sprint). También puede disparar manualmente "Activar sprints del día", que mueve a la primera columna de flujo los tickets de sprints que arrancan hoy.
- **Usuario externo que crea un ticket sin elegir sprint**: el backend lo auto-asigna al primer sprint futuro con cupo disponible en la capacidad externa de su equipo (ver `requests.ts::createRequest`).
- **Cualquiera con acceso al board**: al mover/editar un ticket puede reasignarlo de sprint desde el modal de edición (persiste vía `TBL_Request_Sprint`).
- **Cualquier usuario con acceso al board**: consulta el dashboard de estadísticas (`/stats`), que usa los sprints creados acá para filtrar y comparar — ver [`modulos/13-dashboard.md`](13-dashboard.md) para el cálculo de esas métricas.

## Arquitectura técnica

### Frontend

- **Tipos de sprint**: `src/features/requests/hooks/useSprints.ts` — hooks TanStack Query (`useSprints`, `useCreateSprint`, `useUpdateSprint`, `useDeleteSprint`), todos con mutaciones optimistas sobre la query key `['sprints']`. Define `Sprint`, `SprintTeamCapacity`, `SprintCapacityInput`. El dashboard de estadísticas reutiliza `useSprints()` solo para leer (ver [`modulos/13-dashboard.md`](13-dashboard.md)).
- **Configuración de sprints (admin)**: `src/components/ConfigPanelComponents/SprintsConfig.tsx` — `SprintList`/`SprintForm`/`SprintRow`; incluye el botón "Activar sprints del día" que llama a la acción `triggerSprintStartMoves`.

### Backend (Edge Function)

Handler: `supabase/functions/api/handlers/sprints.ts` (`sprintHandlers`). Registrado en `supabase/functions/api/router.ts`.

| Detalle por acción | Descripción |
|---|---|
| `fetchSprints` | Lista todos los `TBL_Sprint` ordenados por fecha de inicio descendente, con su arreglo `capacities` embebido desde `TBL_Sprint_Team_Capacity` (join `capacities:TBL_Sprint_Team_Capacity`). |
| `createSprint` | Inserta la cabecera del sprint (`{ text, startDate, endDate }`) y, si vienen `teamCapacities`, inserta las filas de capacidad por equipo. No re-consulta tras insertar las capacidades: el `Capacity_ID` que devuelve al frontend es `null` hasta el próximo refetch. |
| `updateSprint` | Actualiza la cabecera y hace **upsert** de `teamCapacities` sobre la clave compuesta `(Sprint_ID, Board_Team_ID)` — actualiza las existentes y crea las nuevas sin duplicar. |
| `deleteSprint` | Borra el sprint por `Sprint_ID`. |
| `triggerSprintStartMoves` | Automatización de arranque de sprint (ver más abajo). `payload: { boardId? }` (default 1). |

Además, la lógica de **auto-asignación de sprint** para tickets de usuarios externos vive en `requests.ts::createRequest` (no en `sprints.ts`), y la reasignación manual de sprint de un ticket existente vive en `requests.ts` (acción de actualización, ver reglas de negocio).

### Tablas de base de datos involucradas

- `TBL_Sprint` — cabecera del sprint (`Sprint_ID`, `Sprint_Text`, `Sprint_Start_Date`, `Sprint_End_Date`). Sprints migrados desde el sistema anterior pueden no tener fechas ("históricos").
- `TBL_Sprint_Team_Capacity` — capacidad externa máxima (`External_Capacity`) por combinación `(Sprint_ID, Board_Team_ID)`.
- `TBL_Request_Sprint` — tabla puente 1 ticket ↔ 1 sprint (`Request_Sprint_Request_ID`, `Request_Sprint_ID`); se borra e inserta de nuevo al reasignar sprint.
- `TBL_Request_Team`, `TBL_Users` — usados por la auto-asignación de sprint externo para contar cuántos tickets externos de un equipo ya ocupan cada sprint futuro.
- `TBL_Board_Columns` — columnas del board, incluido `Board_Column_Slug`/`Board_Column_Position`, usados por `triggerSprintStartMoves` para encontrar la primera columna de flujo.

(Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.)

## Reglas de negocio y validaciones clave

- **Auto-asignación de sprint a tickets externos** (`requests.ts::createRequest`): si el ticket se crea sin `sprintId` y el solicitante NO es `admin`/`ti_member` (es decir, es "externo"), el backend busca sprints futuros (`Sprint_Start_Date > ahora`), calcula cuántos tickets externos de ese mismo equipo ya ocupan cada sprint (cruzando `TBL_Request_Sprint`, `TBL_Request_Team` y el rol del solicitante) y asigna el ticket al primer sprint futuro cuyo conteo sea menor a su `External_Capacity` configurada (default 20 si no hay fila de capacidad). Si algo falla en este cálculo, se ignora silenciosamente y el ticket queda sin sprint — **no bloquea la creación**.

> Las reglas de cómo se calcula cumplimiento/puntaje/flujo a partir de los sprints (score por prioridad, meta, penalización, linaje de sprint, vista Global, modo combinado, quién puede ver el dashboard) están documentadas en [`modulos/13-dashboard.md`](13-dashboard.md) — no son parte de la gestión del sprint en sí.

## Automatizaciones y efectos secundarios

- **`triggerSprintStartMoves`** (botón "Activar sprints del día" en `SprintsConfig.tsx`, o disparable programáticamente): busca sprints cuyo `Sprint_Start_Date` cae exactamente en el día de hoy (rango `[hoy 00:00, hoy 23:59]` UTC), toma todos los tickets vinculados a esos sprints vía `TBL_Request_Sprint` que sigan en la columna "Sin categorizar" y sin `Request_Finished_At`, y los mueve a la primera columna de flujo del board (columna con menor `Board_Column_Position` que no sea "sin_categorizar"). No es un cron automático dentro de la Edge Function — se dispara manualmente desde el panel de config; para automatizarlo por completo haría falta un scheduler externo que llame a esta acción diariamente.
- **Auto-asignación de sprint externo** al crear un ticket (ver regla de negocio arriba) — efecto secundario silencioso de `createRequest`.
- **Reglas de automatización `solicitud_creada`**: tras crear el ticket y resolver equipo/sprint, `createRequest` también evalúa `TBL_Automation_Rules` activas para ese trigger (p. ej. `asignar_resolutor`) — no es parte central de este módulo pero comparte el mismo flujo de creación.
- Las mutaciones de sprint en el frontend (`useCreateSprint`, `useUpdateSprint`, `useDeleteSprint`) son **optimistas**: actualizan la caché de TanStack Query antes de la respuesta del servidor y revierten (`onError`) si falla; siempre invalidan (`onSettled`) para converger con el estado real.

## Puntos frágiles / riesgos conocidos

- `createSprint` no vuelve a consultar tras insertar las capacidades: el frontend recibe `Capacity_ID: null` hasta el próximo refetch (`supabase/functions/api/handlers/sprints.ts:70-75`) — cualquier lógica que dependa de un `Capacity_ID` inmediato tras crear se rompería.
- La auto-asignación de sprint externo en `createRequest` (`supabase/functions/api/handlers/requests.ts:314-393`) hace varias consultas encadenadas (sprints futuros → capacidades → links → equipos → roles) dentro de un único `try/catch` que traga cualquier error silenciosamente ("no bloquear la creación del ticket"). Un bug ahí simplemente deja el ticket sin sprint, sin ningún log ni aviso visible al usuario.
- `triggerSprintStartMoves` asume que existe una columna con slug `sin_categorizar` y al menos una columna de flujo distinta en el board; si no las encuentra, lanza error (`supabase/functions/api/handlers/sprints.ts:151`) y no mueve nada.
- **Qué cuenta como sprint "con fecha" vs "histórico" se infiere por heurística de texto acá también**: `hasValidDates` (`SprintsConfig.tsx`) decide si mostrar los selectores de fecha según si el sprint ya tiene fechas cargadas; el dashboard de estadísticas infiere la misma distinción de forma independiente para comparar sprints — ver el riesgo de duplicación (y por qué puede desalinearse) en [`modulos/13-dashboard.md`](13-dashboard.md).

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchSprints` | Lista sprints con sus capacidades por equipo embebidas. | `supabase/functions/api/handlers/sprints.ts` |
| `createSprint` | Crea un sprint y, opcionalmente, sus capacidades por equipo. | `supabase/functions/api/handlers/sprints.ts` |
| `updateSprint` | Actualiza un sprint y hace upsert de sus capacidades por equipo. | `supabase/functions/api/handlers/sprints.ts` |
| `deleteSprint` | Elimina un sprint. | `supabase/functions/api/handlers/sprints.ts` |
| `triggerSprintStartMoves` | Mueve a "Por hacer" los tickets de sprints que inician hoy. | `supabase/functions/api/handlers/sprints.ts` |
| `createRequest` | Crea un ticket; incluye auto-asignación de sprint para externos. | `supabase/functions/api/handlers/requests.ts` |
