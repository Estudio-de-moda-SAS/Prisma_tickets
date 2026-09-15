# Módulo: Dashboards y métricas de desempeño

## Resumen

Este módulo documenta las dos superficies de PRISMA que muestran KPIs/rankings calculados a partir de datos ya existentes, en vez de gestionar una entidad propia:

1. **Dashboard de estadísticas** (`/stats`, ítem "Dashboard" del sidebar — `StatsPage.tsx`): cumplimiento, puntaje, velocidad y métricas de flujo/salud del board, por equipo/sprint.
2. **Ranking de Resolutores** (`/prisma` → tab "Resolutores" del panel admin, `ResolutionTab` dentro de `PrismaAdminPage.tsx`): desempeño por resolutor (promedio de solución/atención, ranking, volumen) a partir de las calificaciones de resolución de ticket.

Ambos comparten el mismo patrón: **no tienen backend propio** — consumen acciones que pertenecen a otros módulos (tickets, sprints, calificaciones de resolución) y hacen **todo el cálculo en el cliente**, sin memoización dedicada en el caso del ranking de resolutores y con `useMemo` en el caso del dashboard de estadísticas. Este documento cubre el *cálculo y la presentación* de esas métricas; los datos crudos que consumen y las acciones que los originan están documentados en sus módulos dueños:

- Gestión de sprints (crear/editar/eliminar, capacidad externa, arranque automático) → [`modulos/07-sprints-y-estadisticas.md`](07-sprints-y-estadisticas.md).
- Tickets, tablero Kanban y la acción `fetchAllByBoardStats` que alimenta el dashboard → [`modulos/01-tickets-y-kanban.md`](01-tickets-y-kanban.md).
- Columna de "inicio de stats" por equipo (`Is_Stats_Start`) → [`modulos/05-organizacion-y-equipos.md`](05-organizacion-y-equipos.md).
- Calificación de resolución (flujo de "calificar un ticket cerrado", backend `resolutionRatings.ts`) → [`modulos/02-ciclo-de-vida-del-ticket.md`](02-ciclo-de-vida-del-ticket.md).
- El resto del panel `/prisma` (Bug Reports, Satisfacción) → [`modulos/12-sistema-y-soporte.md`](12-sistema-y-soporte.md).

## Flujos de usuario

- **Cualquier usuario con acceso al board** (`admin`, `ti_member`, o `client` con ≥1 kanban asignado): entra a `StatsPage` (`/stats`), elige un equipo (tab) o la vista "Global" (solo visible con 2+ equipos), selecciona uno o varios sprints (o "Todos los sprints"), y opcionalmente filtra por un integrante del equipo. Ve tarjetas de sprint (planeadas, activas, completadas, bloqueadas, post-planning), el panel de "Puntaje & Cumplimiento", tiempos promedio, distribución por columna/prioridad, top resolutores (con detalle de sus tickets), y una sección de "Flujo & salud" (lead time, aging, throughput, precisión de estimación, críticas más antiguas).
- **`admin`** (`RequireAdmin`) — `/prisma` → tab **Resolutores**: ve 4 tarjetas KPI globales (promedio solución, promedio atención, total de calificaciones, % con comentario), el ranking de resolutores (con medallas para el top 3 y una barra de volumen por resolutor), un gráfico de barras del promedio por dimensión (solución vs. atención), un selector para filtrar el listado de calificaciones individuales por resolutor, y el listado completo con ticket vinculado, calificador, comentario y resolutores involucrados.

## Arquitectura técnica

### Frontend

#### Dashboard de estadísticas (`/stats`)

- **Página**: `src/pages/StatsPage.tsx` — dashboard unificado con tabs por equipo + "Global", selector de sprint(s) (multi-selección, con filtro por año), selector de usuario, y todas las secciones de KPIs/gráficos (usa Chart.js para barras).
- **Motor de cálculo**: `src/features/requests/hooks/useStatsData.ts` — hook `useStatsData(selectedSprintIds, teams, userFilter, teamCodeFilter, statsConfig, combinedTeams)` que:
  - Carga el board completo vía `useBoardCompletoStats()` (`src/features/requests/hooks/useRequests.ts`, acción de backend `fetchAllByBoardStats`, `staleTime` de 30s — ver [`modulos/01-tickets-y-kanban.md`](01-tickets-y-kanban.md)) y los sprints vía `useSprints()` (lectura únicamente; la gestión de sprints —crear/editar/eliminar— vive en [`modulos/07-sprints-y-estadisticas.md`](07-sprints-y-estadisticas.md)).
  - Deriva en cliente (con `useMemo`, sin llamadas extra) las métricas generales (`calcGeneral`), por equipo (`calcBoard`), combinadas para 2+ equipos (`calcBoardCombined`), de sprint (`calcSprint`), del sprint anterior del mismo linaje (`findPrevSprint`) y de flujo/salud (`calcFlowMetrics`: lead time, WIP, aging, throughput, precisión de estimación).
  - Exporta también helpers reutilizados por la UI: `isBlockedLabelName`, `PENALIZACION_ACTIVA`.
- **Tipos de estadísticas**: `src/features/stats/types.ts` (tipos de soporte del dominio de stats; el grueso de los tipos de cálculo vive directamente en `useStatsData.ts`: `SprintStats`, `GeneralStatsReal`, `BoardStatsReal`, `FlowMetrics`, `StatsConfig`, etc.).
- **Store de UI**: `src/store/statsStore.ts` — Zustand con persistencia en `localStorage` (`prisma-stats-ui`) para recordar la selección de sprint(s), filtro de usuario, tab de equipo/combinación y año seleccionados entre sesiones. Solo persiste selección de UI, nunca datos calculados.
- **Config de "inicio de stats" por equipo**: `useStatsStartConfig` en `src/features/requests/hooks/useKanbanAdmin.ts`, que llama a la acción `fetchStatsStartConfig` (handler `teamColumnConfig.ts`, documentado en [`modulos/05-organizacion-y-equipos.md`](05-organizacion-y-equipos.md)). Cada equipo puede definir a partir de qué columna del board sus tickets empiezan a contar en las estadísticas — la configuración se edita en el panel de Kanban admin, no en este módulo; acá solo se documenta cómo el motor de cálculo la consume.
- **Permisos de acceso**: `useRole()` / `canSeeStats()` en `src/auth/roles.ts`.

#### Ranking de Resolutores (`/prisma` → tab "Resolutores")

- Vive dentro de la misma página que Bug Reports y Satisfacción (`src/pages/PrismaAdminPage.tsx` — arquitectura general del panel documentada en [`modulos/12-sistema-y-soporte.md`](12-sistema-y-soporte.md)); esta sección cubre solo el tab `ResolutionTab`.
- **Tab Resolutores** (`ResolutionTab`, componente en el mismo archivo): dashboard de desempeño por resolutor, calculado enteramente en el cliente sobre el array plano que devuelve `fetchResolutionRatings` — mismo patrón de "todo el cálculo vive en el frontend" que `useStatsData.ts` arriba, pero acá **sin hook dedicado ni memoización**: se recalcula en cada render del componente padre (`PrismaAdminPage`).
  - Agregación por resolutor (`resolverMap`, en `PrismaAdminPage`): recorre cada calificación y, por cada resolutor en su `resolvers[]` (el snapshot de `TBL_Resolution_Rating_Resolvers`), suma `solutionScore`/`attentionScore` y cuenta 1 — una calificación con varios resolutores asignados **suma completa a cada uno**, no se reparte entre ellos.
  - Por resolutor calcula `avgSolution`, `avgAttention` y `avgOverall = (Σsolution + Σattention) / (count × 2)` — promedio simple, sin ponderar por prioridad/score del ticket calificado ni por antigüedad de la calificación.
  - El ranking (`ResolverRankRow`) ordena por `avgOverall` descendente; por defecto **oculta resolutores con menos de `MIN_RATINGS_FOR_RANK = 2` calificaciones** (constante hardcodeada en el componente, no en config central) para no rankear con muestras de tamaño 1 — un botón "Ver todos" desactiva ese filtro sin cambiar el orden.
  - Las 4 tarjetas KPI (promedio solución/atención, total, % con comentario) se calculan sobre el array completo, sin acotar por equipo, board ni rango de fechas.
  - Un selector adicional (`resolverFilter`) filtra solo el listado de tarjetas de calificaciones individuales debajo del ranking; no afecta el ranking ni los KPIs globales.

### Backend (Edge Function)

Este módulo **no tiene handler propio**: ambos dashboards son consumidores puros de acciones que pertenecen a otros módulos.

| Acción | Para qué la usa el dashboard | Handler | Documentado en |
|---|---|---|---|
| `fetchAllByBoardStats` | Trae el board completo (liviano) para que `useStatsData.ts` calcule todas las métricas en el cliente. | `handlers/requests.ts` | [`modulos/01-tickets-y-kanban.md`](01-tickets-y-kanban.md) |
| `fetchSprints` | Lista de sprints para el selector del dashboard y para comparar contra el sprint anterior. | `handlers/sprints.ts` | [`modulos/07-sprints-y-estadisticas.md`](07-sprints-y-estadisticas.md) |
| `fetchStatsStartConfig` | Columna de inicio de conteo de stats por equipo (`Is_Stats_Start`). | `handlers/teamColumnConfig.ts` | [`modulos/05-organizacion-y-equipos.md`](05-organizacion-y-equipos.md) |
| `fetchResolutionRatings` | Calificaciones de resolución crudas que alimentan el ranking de Resolutores. | `handlers/resolutionRatings.ts` | [`modulos/02-ciclo-de-vida-del-ticket.md`](02-ciclo-de-vida-del-ticket.md) |

### Tablas de base de datos involucradas

Todas de solo lectura desde la perspectiva de este módulo (ninguna se escribe desde el dashboard):

- `TBL_Requests` — `Request_Score` (puntaje fijo por prioridad) y `Request_Board_Column_ID`, base de todo el cálculo de cumplimiento/flujo.
- `TBL_Sprint`, `TBL_Request_Sprint` — sprints y su vínculo con tickets, usados para filtrar y comparar.
- `TBL_Board_Columns` — `Is_Stats_Start` (desde qué columna un equipo empieza a contar en stats) y `Board_Column_Position`.
- `TBL_Resolution_Ratings`, `TBL_Resolution_Rating_Resolvers` — calificaciones de resolución y su snapshot de resolutores, base del ranking de Resolutores.

(Detalle completo de columnas en [`BASE_DE_DATOS.md`](../BASE_DE_DATOS.md).)

## Reglas de negocio y validaciones clave

### Cumplimiento y puntaje (Dashboard `/stats`)

- **Qué es el "puntaje" (score) de un ticket**: cada prioridad tiene un puntaje fijo, definido en `src/features/requests/types.ts`: `baja = 1, media = 2, alta = 4, crítica = 6` (`PRIORIDAD_TO_SCORE` / `SCORE_TO_PRIORIDAD`). El puntaje se guarda en `TBL_Requests.Request_Score` al crear el ticket y el frontend deriva la prioridad visual a partir del score guardado. **No existe una tabla `Request_Score` separada ni un cálculo de score en el backend de stats** — es un campo simple y fijo por prioridad.
- **Cómo se calcula "cumplimiento"**: TODO el cálculo ocurre en el **frontend**, en `useStatsData.ts` (`calcBoard`, `calcBoardCombined`, `calcSprint`). El backend no calcula nada de esto; solo entrega tickets y sprints crudos.
  1. `puntajePlaneado` = suma de `PRIORIDAD_TO_SCORE` de todos los tickets "contables" del sprint/equipo seleccionado.
  2. `meta` = `puntajePlaneado * 0.83334` (redondeado) — es decir, la meta de cumplimiento es ~83.3% de lo planeado, no el 100%.
  3. `puntajeRealizado` = suma de puntaje de los tickets ya en columnas "done" (`ready_to_deploy`, `hecho`, `historial`).
  4. `penalizacion` = doble del puntaje de tickets abiertos con ≥2 sprints de atraso — **actualmente desactivada** (`PENALIZACION_ACTIVA = false`; el cálculo original queda intacto por si se reactiva, y en la UI se muestra "N/A").
  5. `puntajeReal` = `max(0, puntajeRealizado − penalizacion)`.
  6. `puntajeOtrosSprints` ("arrastre"): tickets planeados en OTRO sprint pero cerrados en columna `hecho` dentro de la ventana de fechas del sprint seleccionado; su puntaje también suma al cumplimiento — **ver bug conocido en "Puntos frágiles"**: esto puede hacer que el mismo ticket sume al cumplimiento de dos sprints distintos a la vez.
  7. `cumplimiento` = `round(((puntajeReal + puntajeOtrosSprints) / meta) * 100)` — puede superar 100% por el arrastre. Si `meta` es 0, `cumplimiento` es 0.
- **Columnas "done" siempre cuentan**: `ready_to_deploy`, `hecho` e `historial` cuentan como resueltas sin importar la configuración de "inicio de stats" del equipo (`DONE_COLUMNS`, bypass de `minPos`) — esto evita que tickets históricos migrados a la columna "historial" queden en 0.
- **Tickets bloqueados/pausados**: se excluyen de la mayoría de los conteos salvo que ya estén en una columna "done" (`isBlocked()`, detecta labels cuyo nombre incluye "bloqueada" o "pausada" — match por subcadena, `isBlockedLabelName`).
- **Linaje de sprint** (para comparar contra el sprint anterior): un sprint "PRISMA" (con fecha) solo se compara contra otro con fecha, ordenados cronológicamente; un sprint "histórico" (migrado, sin fecha) solo se compara contra otro histórico, ordenado por `(año, número extraído del texto "#N")`. Nunca se cruzan (`findPrevSprint`).
- **Vista "Global"** solo aparece si el board tiene 2+ equipos visibles para el usuario (`canSeeGlobal = boardTeams.length > 1`); con un solo equipo, mostrarla no aportaría nada.
- **Modo equipo combinado** (2+ equipos seleccionados a la vez, sin ser "Global"): las estadísticas se calculan sobre la **unión deduplicada** de tickets que tocan cualquiera de los equipos seleccionados (`calcBoardCombined`), de forma que un ticket compartido entre equipos no se cuenta dos veces. El `minPos` (posición de columna desde la que empieza a contar) usado es el más permisivo (mínimo) entre los equipos combinados.
- **Quién puede ver el dashboard** (`canSeeStats` en `src/auth/roles.ts`): `admin` y `ti_member` siempre pueden verlo; un `client` solo si tiene al menos un kanban/equipo asignado (`hasKanbanTeams` se calcula fuera de `roles.ts`, en el consumidor del guard). Dentro de `StatsPage`, además, un `admin` ve todos los equipos del board (`useBoardTeams`); cualquier otro rol solo ve sus propios equipos asignados (`useMyBoardTeams`), y en ambos casos se excluyen equipos marcados como externos o de integración (`Board_Team_Is_External`, `Board_Team_Is_Integration`) porque no tienen tablero Kanban propio.

### Ranking de resolutores (`/prisma`)

- **Cada calificación suma completa a cada resolutor del snapshot**, no se reparte entre ellos si hay varios (ver Arquitectura técnica arriba).
- **`avgOverall` es un promedio simple** de las dos dimensiones (solución y atención), sin ponderar por prioridad del ticket ni por antigüedad.
- **Umbral de ranking (`MIN_RATINGS_FOR_RANK = 2`)** es un filtro de presentación, no de datos: un resolutor con 1 calificación no aparece en el ranking por defecto, pero sus datos sí están incluidos en los KPIs globales y se puede ver su fila con el botón "Ver todos".
- **Los KPIs globales y el ranking no aceptan ningún filtro** (ni equipo, ni sprint, ni rango de fechas) — el único filtro disponible (`resolverFilter`) solo acota el listado de calificaciones individuales, no las métricas agregadas.

## Automatizaciones y efectos secundarios

Ninguno de los dos dashboards dispara efectos secundarios en el servidor ni tiene automatización propia — son puramente de lectura y recálculo reactivo cuando cambian sus datos fuente:

- El dashboard de estadísticas recalcula todo vía `useMemo` cuando cambia el board (`useBoardCompletoStats`, refetch al montar) o la selección de sprint/equipo/usuario en la UI.
- El ranking de Resolutores recalcula en cada render de `PrismaAdminPage` cuando cambia `resRatings` (tras el refetch manual con el botón "Actualizar" del tab).
- Los efectos secundarios reales sobre los datos que alimentan estos dashboards (mover tickets al iniciar un sprint, auto-asignar sprint a un ticket externo, registrar una calificación de resolución) pertenecen a los módulos dueños de esos datos — [`modulos/07-sprints-y-estadisticas.md`](07-sprints-y-estadisticas.md) y [`modulos/02-ciclo-de-vida-del-ticket.md`](02-ciclo-de-vida-del-ticket.md) respectivamente — no a este.

## Puntos frágiles / riesgos conocidos

- **Bug: un ticket puede sumar su puntaje al cumplimiento de dos sprints distintos a la vez, en vez de solo al del sprint en el que se cerró.** `puntajeRealizado` cuenta a un ticket dentro del cumplimiento de su **sprint de origen** (el vinculado vía `Request_Sprint_ID`) con la única condición de que esté en una columna "done" — sin verificar que se haya cerrado dentro de la ventana de fechas de *ese* sprint (`done = mineScoped.filter(DONE_COLUMNS)` en `calcBoard`, `useStatsData.ts:502`; lo mismo vía `completadas` en `calcSprint:829-831`). Si el ticket se cierra más tarde, ya dentro de la ventana de fechas de **otro** sprint, el mecanismo de "arrastre" (`arrastre`/`otrosCerradas`, `useStatsData.ts:517-521` y `:876-882`) lo detecta y también suma su puntaje — como `puntajeOtrosSprints` — al cumplimiento de ese otro sprint (`:526-527` y `:897-899`), siempre que esté en columna `hecho`. Neto: el mismo ticket aporta puntaje al cumplimiento de **dos sprints al mismo tiempo** — el de origen (incondicionalmente, mientras siga "done", incluso años después) y el de cierre (vía arrastre). Lo correcto sería que contara una sola vez, en el sprint donde efectivamente se cerró — hoy cuenta en ambos. Este comportamiento no está cubierto por ningún test (ver [`ROADMAP_DEUDA_TECNICA.md` → 0.3](../ROADMAP_DEUDA_TECNICA.md)).
- La **penalización por atraso** está desactivada por una bandera hardcodeada (`PENALIZACION_ACTIVA = false` en `src/features/requests/hooks/useStatsData.ts:360`); si se reactiva sin revisar el código relacionado (`SPRINT_LAG = 2`, `PENALIZATION_EXEMPT_COLUMNS`), el cumplimiento histórico cambiaría retroactivamente para todos los sprints ya cerrados.
- Todo el cálculo de cumplimiento/puntaje corre en el **cliente**, sobre el dataset completo del board (`fetchAllByBoardStats`, sin paginar). Si el volumen de tickets crece mucho, esto es un riesgo de performance en el navegador, no de backend.
- **La distinción "sprint con fecha (PRISMA)" vs "histórico (sin fecha)" se infiere por heurística de texto, duplicada en al menos 3 lugares**: `findPrevSprint`/`sprintOrder`/`sprintYearLocal` en `useStatsData.ts`, `getSprintYear`/`getSprintNumber` en `StatsPage.tsx`, y (fuera de este módulo) `hasValidDates` en `SprintsConfig.tsx` — ver [`modulos/07-sprints-y-estadisticas.md`](07-sprints-y-estadisticas.md). Las tres infieren lo mismo (patrón `#N` y `(YYYY)` en `Sprint_Text`) de forma independiente; un nombre de sprint que no siga esa convención puede ordenarse mal en el dashboard, no encontrar su "sprint anterior" para comparar, o comportarse distinto acá que en la gestión de sprints.
- **Ranking de resolutores sin alcance por equipo/board ni por período**: a diferencia del dashboard de `/stats` (que sí filtra por equipo y sprint), el ranking de `/prisma` → Resolutores agrega TODAS las calificaciones de resolución de TODOS los tickets desde siempre, sin poder acotar por equipo ni por sprint/fecha — el desempeño histórico completo de un resolutor pesa igual que su desempeño reciente, y no hay forma de comparar un período contra otro.
- **`avgOverall` no pondera por volumen de calificaciones**: dos resolutores con 2 y 200 calificaciones pueden rankear en el mismo lugar si tienen igual promedio; `count` se muestra en la fila pero no influye en el orden, solo en si el resolutor supera el umbral `MIN_RATINGS_FOR_RANK = 2` para aparecer en el ranking por defecto.
- **Agregación por resolutor sin repartir el peso en calificaciones con varios resolutores**: si una calificación tiene 2+ resolutores en el snapshot, cada uno recibe el puntaje completo de esa calificación en su promedio (no se divide entre ellos) — un ticket resuelto en equipo puede inflar el promedio individual de todos los que participaron.
- **Cálculo del ranking sin memoización**: `resolverMap`/`resolutionStats` se recalculan en cada render de `PrismaAdminPage` (no usan `useMemo`); combinado con que `fetchResolutionRatings` no pagina ni filtra en el servidor (ver riesgo en [`modulos/02-ciclo-de-vida-del-ticket.md`](02-ciclo-de-vida-del-ticket.md)), el costo crece con el volumen histórico de calificaciones.

## Referencia rápida de acciones de la API

Ninguna de estas acciones pertenece a este módulo — se listan acá solo como referencia rápida de qué consume cada dashboard; el contrato completo (parámetros, reglas, tabla de origen) está documentado en el módulo dueño de cada una (columna "Documentado en" de la tabla en Arquitectura técnica → Backend).

| Acción | Handler (archivo) |
|---|---|
| `fetchAllByBoardStats` | `supabase/functions/api/handlers/requests.ts` |
| `fetchSprints` | `supabase/functions/api/handlers/sprints.ts` |
| `fetchStatsStartConfig` | `supabase/functions/api/handlers/teamColumnConfig.ts` |
| `fetchResolutionRatings` | `supabase/functions/api/handlers/resolutionRatings.ts` |
