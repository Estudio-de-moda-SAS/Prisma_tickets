# Módulo: Organización y Equipos

## Resumen

Este módulo modela dos jerarquías distintas que suelen confundirse: la
**organización de personas** (`TBL_Departments` → `TBL_Teams`, el "organigrama"
usado en onboarding y en la ficha del usuario) y los **tableros de trabajo de
PRISMA** (`TBL_Board_Teams`, los "kanbans" del sidebar, que a su vez se dividen
en `TBL_Sub_Teams`). Sobre estas dos jerarquías se apoya todo lo demás: qué
board ve cada usuario (`shared/boardAccess.ts`), a qué sub-equipo se asigna un
ticket, qué columnas ve cada equipo y con qué reglas, y qué etiquetas puede
usar. Se gestiona desde el panel de configuración (`ConfigPanel.tsx`), en las
pestañas **Organización**, **Kanbans**, **Sub-equipos** y **Etiquetas**.

## La distinción clave: Departments/Teams vs. Board_Teams/Sub_Teams

Son dos árboles **independientes y sin FK entre sí** (salvo un enlace opcional
de conveniencia):

- **`TBL_Departments` → `TBL_Teams`** — estructura de **personas**. Un
  departamento (ej. "Finanzas", "TI") agrupa equipos organizacionales (ej.
  "Contabilidad"). Cada usuario (`TBL_Users`) tiene un `Department_ID` y un
  `Team_ID` que se asignan en el onboarding o desde el panel de Usuarios.
  Determina, entre otras cosas, si alguien es "de TI" (`Department_ID = 7`,
  constante hardcodeada) y por lo tanto puede ver el board de tickets.
  Gestionado en `supabase/functions/api/handlers/orgUnits.ts`.

- **`TBL_Board_Teams`** — los **kanbans** de PRISMA (ej. "Desarrollo TI",
  "Sistemas", "SOLVI"). Es la unidad de trabajo real: cada uno tiene sus
  propias columnas, etiquetas y sub-equipos. Opcionalmente se asocia a un
  `Department_ID` (nullable) — ese vínculo es lo que determina la visibilidad
  automática (ver más abajo), pero un board team **no es lo mismo** que un
  `TBL_Teams`: puede no existir ningún `TBL_Teams` con ese nombre, o pueden
  llamarse distinto. Gestionado en
  `supabase/functions/api/handlers/boardTeams.ts`.

- **`TBL_Sub_Teams`** — subdivisiones **dentro de un board team** (no dentro de
  un `TBL_Teams`). Aquí está la trampa: la columna que los vincula se llama
  `Sub_Team_Team_ID`, pero apunta a `TBL_Board_Teams.Board_Team_ID`, **no** a
  `TBL_Teams.Team_ID` (confirmado en `documentacion/BASE_DE_DATOS.md`, sección
  `TBL_Sub_Teams`, y en `supabase/functions/api/handlers/subteams.ts`, donde
  `fetchSubTeamsByTeamId` recibe un `teamId` que en realidad es un
  `Board_Team_ID`). El nombre de la columna es simplemente engañoso.

En una frase: **"Departamento/Equipo" es de dónde es la persona; "Kanban/
Sub-equipo" es en qué tablero y en qué sub-grupo de ese tablero trabaja.** Un
board sin departamento (`Department_ID = null`) solo lo ven los admins de TI;
uno con departamento lo ven automáticamente todos los miembros de ese
departamento (ver reglas de acceso más abajo).

## Flujos de usuario

- **Admin TI — Organización**: en Config → Organización crea/edita
  departamentos (nombre, código, si aparece en el onboarding) y sus equipos
  organizacionales. Eliminar un departamento o equipo desvincula a sus
  usuarios y los reenvía al onboarding (ver Automatizaciones).
- **Admin TI — Kanbans**: en Config → Kanbans crea/edita boards. Elige un tipo
  excluyente: *kanban propio* (tablero real en PRISMA), *externo* (abre un
  link en otra pestaña, sin columnas) o *de integración* (ej. SOLVI: se opera
  en otra app pero se pueden crear/ver tickets desde PRISMA). Asigna
  departamento, ícono, color, si es "solo admins" y si está activo/archivado.
  También reordena boards (dentro de su grupo de departamento) y administra
  las columnas globales del board (crear, renombrar, reordenar, límite WIP) y,
  por cada board, la config de columnas específica de ese equipo (visible,
  requiere evidencia, es columna de cierre, es inicio de estadísticas,
  colores propios).
- **Admin TI — Sub-equipos**: en Config → Sub-equipos, para el kanban
  seleccionado, crea sub-equipos, agrega/quita integrantes (buscador por
  nombre/correo) y marca supervisores (deben ser integrantes primero).
- **Admin TI — Etiquetas**: en Config → Etiquetas, por kanban, crea/edita/
  elimina etiquetas (nombre, color, ícono).
- **Member de otro departamento con acceso extra**: ve, además de los boards
  de su propio departamento, los que le fueron otorgados explícitamente vía
  grant (gestionado desde la ficha del usuario en Config → Usuarios, ver
  `documentacion/modulos/06-usuarios-y-autenticacion.md`).
- **Cualquier usuario en onboarding**: elige su departamento y equipo
  organizacional de una lista que excluye los departamentos marcados
  `Is_Hidden_From_Onboarding`.

## Arquitectura técnica

### Frontend

- `src/components/ConfigPanel.tsx` — panel de configuración; arma la barra de
  navegación por secciones (`Section` = `'org' | 'kanbans' | 'subteams' |
  'labels' | ...`) y el selector de equipo activo (`NavTeamSwitcher`, agrupa
  boards por departamento respetando `Board_Team_Sort_Order`). También define
  primitivos compartidos (`ColorPicker`, `AddBtn`, `SmBtn`, `FieldLabel`,
  `FormActions`, `ItemRow`).
- `src/components/ConfigPanelComponents/OrgConfig.tsx` — CRUD de departamentos
  y equipos organizacionales (`OrgSection`, `DeptCard`, `DeptForm`,
  `TeamForm`). Usa los hooks de `@/features/requests/hooks/useDepartments` y
  `useTeams`.
- `src/components/ConfigPanelComponents/KanbansConfig.tsx` — CRUD de boards
  (`KanbanSection`, `KanbanTeamForm`) con el selector de tipo excluyente
  (kanban/externo/integración) y el catálogo `INTEGRATIONS` (hoy solo
  `'solvi'`); y la configuración de columnas por equipo (`ColumnConfigPanel`,
  `ColumnConfigRow`, `ColumnEditForm`, `ColumnCreateForm`). Usa los hooks de
  `@/features/requests/hooks/useKanbanAdmin` y `useBoardMetadata`.
- `src/components/ConfigPanelComponents/SubTeamConfig.tsx` — CRUD de
  sub-equipos y gestión de integrantes/supervisores (`SubTeamList`,
  `SubTeamMembersSection`). Usa `@/features/requests/hooks/useSubTeamMembers`.
- `src/components/ConfigPanelComponents/LabelsConfig.tsx` — CRUD de etiquetas
  (`LabelList`), reutiliza `LabelForm`/`ItemRow` de `ConfigPanel.tsx`.

### Backend (Edge Function)

**`handlers/orgUnits.ts`** (`orgUnitHandlers`) — estructura de personas:

| Acción | Qué hace | Notas |
|---|---|---|
| `getDepartments` | Lista departamentos ordenados por nombre. | |
| `getTeamsByDepartment` | Lista equipos de un departamento. | |
| `getDepartmentsWithTeams` | Departamentos con su arreglo `teams` embebido. | Usado por Config → Organización y por los formularios de kanban (selector de departamento). |
| `createDepartment` / `updateDepartment` | Alta/edición de departamento. | Normaliza nombre (`trim`) y código (minúsculas). |
| `deleteDepartment` | Elimina un departamento. | Antes desvincula usuarios (`Department_ID`/`Team_ID` → `null`, `Is_New` → `true`) y borra sus equipos. |
| `createTeam` / `updateTeam` | Alta/edición de equipo organizacional. | |
| `deleteTeam` | Elimina un equipo. | Antes desvincula usuarios (`Team_ID` → `null`, `Is_New` → `true`). |

**`handlers/boardTeams.ts`** (`boardTeamHandlers`) — boards/kanbans y acceso:

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchAllTeams` | Lista todos los boards con su departamento embebido. | Ordenado por `Board_Team_Sort_Order`. |
| `fetchTeamsByBoardId` | Datos básicos de un board por ID. | |
| `createKanbanTeam` | Crea un board. | Aplica exclusión externo/integración (ver reglas); posición = máximo actual + 1. |
| `updateKanbanTeam` | Edita un board. | Mismas validaciones que `createKanbanTeam`; no toca el orden. |
| `reorderBoardTeam` | Sube/baja un board una posición. | Acotado al subconjunto de boards del **mismo** `Department_ID` (incluye el grupo `null`); solo intercambia `Sort_Order` con el vecino inmediato de ese grupo. |
| `fetchMyBoardTeams` | Boards visibles para un usuario. | Delega en `resolveVisibleBoardIds`. |
| `fetchUserBoardAccess` | IDs de boards con grant explícito para un usuario. | Alimenta el picker de la ficha de usuario. |
| `setUserBoardAccess` | Reemplaza el set completo de grants de un usuario. | Estrategia delete-all + insert; registra `Granted_By`. |

No existe un `deleteKanbanTeam`: el propio banner de `KanbansConfig.tsx`
avisa que "los kanbans solo pueden eliminarse directamente desde la base de
datos" — es una decisión de diseño, no un olvido (ver Puntos frágiles).

**`handlers/subteams.ts`** (`subTeamHandlers`):

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchSubTeamsByTeamId` | Sub-equipos de un board, con `supervisorIds` aplanado. | El parámetro `teamId` es en realidad un `Board_Team_ID`. |
| `createSubTeam` / `updateSubTeam` / `deleteSubTeam` | CRUD de sub-equipo. | |
| `fetchSubTeamMembers` | Integrantes de un sub-equipo. | |
| `addSubTeamMember` | Agrega integrante (idempotente, upsert). | |
| `removeSubTeamMember` | Quita integrante. | También borra su fila de supervisor, si la tenía (evita inconsistencia). |
| `fetchSubTeamSupervisors` | IDs de supervisores de un sub-equipo. | |
| `addSubTeamSupervisor` | Marca a alguien como supervisor. | Valida primero que sea integrante; si no, lanza error. |
| `removeSubTeamSupervisor` | Revoca supervisión. | No saca al usuario como integrante. |

**`handlers/teamColumnConfig.ts`** (`teamColumnConfigHandlers`):

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchTeamColumnConfig` | Columnas del board con la config efectiva de un equipo. | Combina `TBL_Board_Columns` (global) con `TBL_Team_Column_Config` (override), aplicando defaults en código si el equipo no tiene fila para esa columna. |
| `upsertTeamColumnConfig` | Crea/actualiza el override de una columna para un equipo. | Upsert sobre `(Team_ID, Column_ID)`; los colores solo se tocan si vienen definidos en el payload. |
| `setStatsStartColumn` | Fija/alterna la columna de inicio de estadísticas de un equipo. | Solo una por equipo (regla aplicada en código, no en la DB); reenviar la misma columna la desmarca (toggle). |
| `fetchStatsStartConfig` | Resuelve, para todo el board, la posición de inicio de stats de cada equipo. | Devuelve `columnPositions` (slug → posición) y `statsStartByTeam` (código de equipo → posición). |

**`handlers/columns.ts`** (`columnHandlers`) — catálogo/administración de
columnas globales del board (complementa el uso operativo visto en el módulo
de tickets):

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchBoardColumns` | Lista columnas de un board por posición. | |
| `updateBoardColumn` | Actualiza nombre, color y límite WIP de una columna. | Afecta a **todos** los equipos del board (es la columna global). |
| `createBoardColumn` | Crea una columna al final del board. | El `slug` se deriva del nombre (sin acentos, minúsculas, `_`); se usa como identificador estable en lógica de negocio. |
| `reorderBoardColumn` | Sube/baja una columna dentro de su board. | Intercambia `Board_Column_Position` con el vecino inmediato. |

**`handlers/labels.ts`** (`labelHandlers`):

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchLabelsByBoardId` | Todas las etiquetas de un board (todos sus equipos). | |
| `fetchLabelsByTeamId` | Etiquetas de un equipo específico dentro de un board. | |
| `createLabel` / `updateLabel` | CRUD de etiqueta. | |
| `deleteLabel` | Elimina una etiqueta. | Antes borra sus filas puente en `TBL_Request_Labels`. |

**`shared/boardAccess.ts`** — `resolveVisibleBoardIds(supabase, userId)`, la
fuente de verdad de qué boards ve cada usuario:

1. Admin de TI (`User_Role='admin'` y `Department_ID=7`) → `null` (sin
   restricción, ve todo).
2. Cualquier otro usuario → boards de su propio departamento, **excluyendo**
   los marcados `Board_Team_Is_Admin_Only`, más los boards otorgados por
   grant explícito en `TBL_Board_Team_Access` (estos sí pueden ser
   admin-only o de otro departamento — un grant es una decisión deliberada
   del admin que se respeta igual).
3. Un board sin `Department_ID` no lo ve nadie por la regla de departamento
   (solo un admin de TI, o quien reciba un grant explícito).

### Tablas de base de datos involucradas

- `TBL_Departments` / `TBL_Teams` — organigrama de personas.
- `TBL_Board_Teams` — kanbans/boards de trabajo (pueden ser externos o de
  integración).
- `TBL_Board_Team_Access` — grants de acceso cross-departamento a un board.
- `TBL_Sub_Teams` / `TBL_Sub_Team_Members` / `TBL_Sub_Team_Supervisors` —
  subdivisión de un board team, sus integrantes y supervisores.
- `TBL_Board_Columns` — columnas globales de un board.
- `TBL_Team_Column_Config` — override por equipo del comportamiento de una
  columna (visibilidad, evidencia, cierre, inicio de stats, colores).
- `TBL_Labels` / `TBL_Request_Labels` — catálogo de etiquetas y su bridge con
  tickets.

Detalle completo de columnas y relaciones en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- Un board team es **excluyentemente** externo o de integración (nunca
  ambos): si es de integración, `isExternal` se fuerza a `false`; un board
  externo exige `externalUrl`, uno de integración exige `integrationKey`
  (`boardTeams.ts`, `createKanbanTeam`/`updateKanbanTeam`).
- El reordenamiento de boards (`reorderBoardTeam`) y de columnas
  (`reorderBoardColumn`) es un intercambio de `Sort_Order`/`Position` con el
  vecino inmediato dentro del grupo correspondiente, no una reasignación
  completa de posiciones.
- Un supervisor de sub-equipo **debe** ser integrante primero
  (`addSubTeamSupervisor` lo valida y lanza error si no lo es); al quitar a
  alguien como integrante se le revoca automáticamente la supervisión
  (`removeSubTeamMember`).
- Los defaults de config de columna por equipo (`Is_Visible=true`,
  `Evidence_Required=false`, `Is_Close_Column=false`) se aplican **en
  código** cuando no existe fila en `TBL_Team_Column_Config`, no son defaults
  de la base de datos.
- Solo una columna por equipo puede ser `Is_Stats_Start=true`; la unicidad la
  garantiza la lógica de `setStatsStartColumn` (desmarca la anterior antes de
  marcar la nueva), no una constraint de base de datos.
- `Is_Hidden_From_Onboarding` es un filtro que aplica el **frontend** después
  de traer todos los departamentos (`OnBoardingPage.tsx`), no una condición
  en la consulta del backend — un departamento oculto del onboarding sigue
  siendo visible/seleccionable en el resto del panel de administración.

## Automatizaciones y efectos secundarios

- Eliminar un departamento o un equipo organizacional desvincula a sus
  usuarios (`Department_ID`/`Team_ID` → `null`) y los marca `Is_New = true`,
  forzándolos a repetir el onboarding en su próximo login (ver
  `documentacion/modulos/06-usuarios-y-autenticacion.md`).
- Eliminar una etiqueta borra primero sus asignaciones en
  `TBL_Request_Labels` para no dejar referencias colgando.
- Editar una columna global (`updateBoardColumn`) afecta a **todos** los
  equipos que comparten ese board — el propio banner de `KanbansConfig.tsx`
  lo advierte explícitamente ("⚠ afecta todos los equipos").
- Crear una columna nueva la agrega automáticamente a todos los equipos del
  board; para ocultarla a un equipo puntual hay que apagar su visibilidad
  desde la config de ese equipo.
- `setUserBoardAccess` reemplaza el set completo de grants (borra todo lo
  existente del usuario y vuelve a insertar), no hace un diff incremental.

## Puntos frágiles / riesgos conocidos

- **Nombre de columna engañoso**: `TBL_Sub_Teams.Sub_Team_Team_ID` apunta a
  `TBL_Board_Teams.Board_Team_ID`, no a `TBL_Teams.Team_ID`, pese a lo que
  sugiere el nombre. Confirmado en `documentacion/BASE_DE_DATOS.md` (sección
  `TBL_Sub_Teams`) y en el uso real de `teamId` en
  `supabase/functions/api/handlers/subteams.ts`. Alguien que lea el código
  sin este contexto puede asumir erróneamente que un sub-equipo cuelga de un
  equipo organizacional.
- **No hay borrado de boards vía API**: `boardTeamHandlers` no expone ningún
  `deleteKanbanTeam`; el propio panel (`KanbansConfig.tsx`, banner rojo)
  indica que solo se puede hacer directo en la base de datos. Es intencional,
  pero implica que un board mal creado (código o integración equivocada)
  requiere intervención manual en DB para desaparecer del todo — el único
  control disponible desde la UI es `Board_Team_Is_Active` (archivar).
- **Unicidad de `Is_Stats_Start` no garantizada por la DB**: dos llamadas
  concurrentes a `setStatsStartColumn` para columnas distintas del mismo
  equipo podrían, en teoría, dejar más de una columna marcada como inicio de
  stats, ya que la exclusividad depende de leer-luego-escribir en el handler
  (`teamColumnConfig.ts`) y no de una constraint.
- **`TBL_Board_Team_Access` sin columna de ID propia observada**: ningún
  `select`/`insert` leído en `boardTeams.ts` proyecta un ID propio de esta
  tabla; puede tener PK autogenerada no usada o PK compuesta
  `(User_ID, Board_Team_ID)` — no se pudo confirmar cuál sin acceso al
  esquema (mismo hallazgo que documenta `BASE_DE_DATOS.md`).
- **Renombrar una columna global no funciona desde la UI**: en
  `ColumnEditForm` (`KanbansConfig.tsx`), el input de nombre está marcado
  `readOnly`, aunque el estado `name` existe y se envía a `onSave`/
  `updateBoardColumn`. En la práctica, hoy no hay forma de cambiar el nombre
  de una columna existente desde el panel, pese a que el backend sí lo
  soporta.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `getDepartments` | Lista departamentos. | `handlers/orgUnits.ts` |
| `getTeamsByDepartment` | Lista equipos de un departamento. | `handlers/orgUnits.ts` |
| `getDepartmentsWithTeams` | Departamentos con equipos anidados. | `handlers/orgUnits.ts` |
| `createDepartment` | Crea departamento. | `handlers/orgUnits.ts` |
| `updateDepartment` | Edita departamento. | `handlers/orgUnits.ts` |
| `deleteDepartment` | Elimina departamento y desvincula usuarios. | `handlers/orgUnits.ts` |
| `createTeam` | Crea equipo organizacional. | `handlers/orgUnits.ts` |
| `updateTeam` | Edita equipo organizacional. | `handlers/orgUnits.ts` |
| `deleteTeam` | Elimina equipo y desvincula usuarios. | `handlers/orgUnits.ts` |
| `fetchAllTeams` | Lista todos los boards. | `handlers/boardTeams.ts` |
| `fetchTeamsByBoardId` | Datos básicos de un board. | `handlers/boardTeams.ts` |
| `createKanbanTeam` | Crea un board. | `handlers/boardTeams.ts` |
| `updateKanbanTeam` | Edita un board. | `handlers/boardTeams.ts` |
| `reorderBoardTeam` | Reordena un board dentro de su departamento. | `handlers/boardTeams.ts` |
| `fetchMyBoardTeams` | Boards visibles para un usuario. | `handlers/boardTeams.ts` |
| `fetchUserBoardAccess` | IDs de boards con grant para un usuario. | `handlers/boardTeams.ts` |
| `setUserBoardAccess` | Reemplaza los grants de un usuario. | `handlers/boardTeams.ts` |
| `fetchSubTeamsByTeamId` | Sub-equipos de un board. | `handlers/subteams.ts` |
| `createSubTeam` | Crea sub-equipo. | `handlers/subteams.ts` |
| `updateSubTeam` | Edita sub-equipo. | `handlers/subteams.ts` |
| `deleteSubTeam` | Elimina sub-equipo. | `handlers/subteams.ts` |
| `fetchSubTeamMembers` | Integrantes de un sub-equipo. | `handlers/subteams.ts` |
| `addSubTeamMember` | Agrega integrante. | `handlers/subteams.ts` |
| `removeSubTeamMember` | Quita integrante (y su supervisión). | `handlers/subteams.ts` |
| `fetchSubTeamSupervisors` | IDs de supervisores. | `handlers/subteams.ts` |
| `addSubTeamSupervisor` | Marca supervisor (exige ser integrante). | `handlers/subteams.ts` |
| `removeSubTeamSupervisor` | Revoca supervisión. | `handlers/subteams.ts` |
| `fetchTeamColumnConfig` | Columnas + config efectiva para un equipo. | `handlers/teamColumnConfig.ts` |
| `upsertTeamColumnConfig` | Crea/actualiza override de columna por equipo. | `handlers/teamColumnConfig.ts` |
| `setStatsStartColumn` | Fija/alterna columna de inicio de stats. | `handlers/teamColumnConfig.ts` |
| `fetchStatsStartConfig` | Inicio de stats de todos los equipos de un board. | `handlers/teamColumnConfig.ts` |
| `fetchBoardColumns` | Lista columnas de un board. | `handlers/columns.ts` |
| `updateBoardColumn` | Edita columna global (afecta a todos los equipos). | `handlers/columns.ts` |
| `createBoardColumn` | Crea columna global. | `handlers/columns.ts` |
| `reorderBoardColumn` | Reordena columna dentro del board. | `handlers/columns.ts` |
| `fetchLabelsByBoardId` | Etiquetas de todo el board. | `handlers/labels.ts` |
| `fetchLabelsByTeamId` | Etiquetas de un equipo. | `handlers/labels.ts` |
| `createLabel` | Crea etiqueta. | `handlers/labels.ts` |
| `updateLabel` | Edita etiqueta. | `handlers/labels.ts` |
| `deleteLabel` | Elimina etiqueta y sus asignaciones. | `handlers/labels.ts` |
