# Módulo: Automatizaciones

## Resumen

El motor de automatizaciones permite definir reglas del tipo "cuando pase X, hacé Y" sobre el ciclo de vida de los tickets: por ejemplo, asignar automáticamente un resolutor cuando se crea una solicitud, subir la prioridad cuando un ticket entra a una columna determinada, o notificar a alguien cuando eso ocurre. Es exclusivo del rol `admin` (TI) y vive en la pantalla **Automatizaciones** del panel. Reduce trabajo manual repetitivo del equipo de TI (asignación y triage) y estandariza avisos sin que nadie tenga que acordarse de enviarlos a mano.

## Flujos de usuario

1. **Ver reglas existentes** — Un `admin` entra a `/automations` desde el sidebar (ítem visible solo para admin). Ve tarjetas con el formato "CUANDO `<disparador>` → ENTONCES `<acción>`", su estado (Activa/Inactiva), cuántas veces se ejecutó y cuándo fue la última vez. Puede filtrar por Todas / Activas / Inactivas.
2. **Crear una regla** — Click en "Nueva automatización" abre un modal: nombre, descripción opcional, equipo (o "Todos los equipos"), disparador (`Solicitud creada` o `Columna cambiada`), y según el disparador, sus acciones disponibles y el valor de esa acción (usuario a asignar, prioridad, o destinatario de notificación). El botón "Crear regla" se habilita solo cuando los campos obligatorios están completos.
3. **Activar/Desactivar** — Cada tarjeta tiene un toggle que llama a `toggleAutomationRule` sin borrar la regla; una regla inactiva simplemente deja de evaluarse.
4. **Eliminar** — Botón de papelera en la tarjeta, borra la regla de forma permanente (sin confirmación adicional en el frontend).
5. **Efecto invisible para el usuario final** — Un `client` o `ti_member` nunca ve esta pantalla; solo percibe sus efectos: un ticket que aparece con un resolutor ya asignado, una notificación nueva en la campana, o un ticket cuya prioridad cambió solo al moverlo de columna.

## Arquitectura técnica

### Frontend

- `src/pages/AutomationsPage.tsx` — página principal: lista de tarjetas (`AutomationCard`), estadísticas (`AutomationStats`: activas/inactivas/ejecuciones totales) y filtro por estado. Protegida en `src/App.tsx` con `<RequireAdmin>` en las rutas `automations` y `automations/logs` (ambas rutas montan el mismo componente).
- `src/components/layout/Sidebar.tsx` — muestra el ítem de navegación solo si `canSeeAutomations(role)` es verdadero (`src/auth/roles.ts`), que a su vez solo es `true` para `role === 'admin'`.
- `src/features/automations/components/CreateAutomationModal.tsx` — formulario de alta. Carga equipos (`fetchAllTeams`) y usuarios (acción `rs`) vía TanStack Query; filtra usuarios "pre-registrados" (con `User_Name` vacío) para que no aparezcan como opción de resolutor/destinatario. El mapa `TRIGGER_ACTIONS` (hardcodeado en este componente) decide qué acciones son válidas para cada disparador y debe mantenerse en sync manualmente con lo que el backend realmente soporta por disparador (ver más abajo).
- `src/features/automations/hooks/useAutomationRules.ts` — hooks de TanStack Query: `useAutomationRules` (fetch + mapeo de fila cruda a `AutomationRule` camelCase), `useCreateAutomationRule`, `useToggleAutomationRule`, `useDeleteAutomationRule`. Todos invalidan la query key `['automation-rules']` al mutar.
- `src/features/automations/types.ts` — fuente única de verdad del frontend para los tipos de disparador (`AutomationTriggerType`: `solicitud_creada` | `columna_cambiada`) y de acción (`AutomationActionType`: `asignar_resolutor` | `asignar_prioridad` | `notificar_usuario`), sus etiquetas legibles, las columnas conocidas (reutiliza `KANBAN_COLUMNAS` de `features/requests/types`) y los destinatarios posibles de `notificar_usuario` por disparador (`NOTIFY_TARGETS`).
- `src/store/automationStore.ts` — store Zustand mínimo de UI: si el modal de creación está abierto y qué regla está seleccionada (este último campo se define pero no se usa activamente en la página).

### Backend (Edge Function)

**Handler dedicado:** `supabase/functions/api/handlers/automationRules.ts` (`automationRuleHandlers`) — CRUD puro de la tabla de reglas, sin lógica de evaluación.

| Detalle por acción | |
|---|---|
| `fetchAutomationRules` | Trae todas las reglas con su equipo embebido (`TBL_Board_Teams`), ordenadas por fecha de creación descendente. Resuelve `Rule_Action_Value` a una etiqueta legible (`Rule_Action_Resolved_Label`): nombre de usuario si la acción es `asignar_resolutor`, etiqueta de prioridad (Baja/Media/Alta/Crítica) si es `asignar_prioridad`, y para `notificar_usuario` usa las etiquetas fijas `asignados`/`solicitante`/`todos` o, si el valor es un ID numérico, el nombre del usuario. Los nombres de usuario se resuelven en una sola query batch. |
| `createAutomationRule` | `{ name, description, teamId, trigger, triggerValue, action, actionValue }`. Aplica `trim()` a nombre/descripción, crea la regla **activa** por defecto con `Rule_Exec_Count: 0`. No valida en el backend que la combinación disparador/acción sea coherente (esa validación solo existe en el frontend, ver riesgos). |
| `toggleAutomationRule` | `{ ruleId, isActive }` — activa/desactiva sin borrar. |
| `deleteAutomationRule` | `{ ruleId }` — borrado permanente, sin soft-delete. |

**La evaluación real de las reglas NO vive en `automationRules.ts`**, sino embebida dentro de `supabase/functions/api/handlers/requests.ts`, en dos puntos exactos del ciclo de vida del ticket:

1. **Al crear una solicitud** (dentro de la acción de creación de tickets), justo después de insertar las relaciones de equipo/etiquetas/sprint del nuevo ticket (`requests.ts` ~línea 412-477, bloque `// ── Ejecutar reglas solicitud_creada ──────────────────`):
   - Busca reglas activas con `Rule_Trigger = 'solicitud_creada'`.
   - Filtra por equipo: una regla con `Rule_Team_ID` solo corre si ese equipo está entre los `equipoIds` de la solicitud nueva; una regla con `Rule_Team_ID = null` corre siempre ("todos los equipos").
   - Si `Rule_Action === 'asignar_resolutor'`: hace `upsert` en `TBL_Requests_Assignments` y notifica al usuario asignado (in-app, vía `insertNotifications`).
   - Si `Rule_Action === 'notificar_usuario'`: resuelve destinatarios según `Rule_Action_Value` — `'solicitante'` (el creador del ticket), `'todos'` (todos los asignados frescos + el solicitante) o un ID de usuario específico — y les inserta una notificación in-app.
   - Nota: en este disparador **no existe** la acción `asignar_prioridad` (ni en frontend ni en backend); solo se evalúan `asignar_resolutor` y `notificar_usuario`.
   - Tras ejecutar, incrementa `Rule_Exec_Count` y actualiza `Rule_Last_Exec_At`.
   - Todo el bloque, y cada regla individual dentro del loop, están envueltos en `try/catch` que traga el error (comentario `/* no bloquear la creación */`): un fallo de automatización nunca impide crear el ticket.

2. **Al mover un ticket de columna** (dentro de la acción de mover/actualizar columna), después de enviar los correos de cambio de columna (`requests.ts` ~línea 712-795, bloque `// ── Ejecutar reglas columna_cambiada ──────────────────`):
   - Solo corre si se pudo resolver el nombre de la columna destino (`movedColName`).
   - Busca reglas activas con `Rule_Trigger = 'columna_cambiada'` **y** `Rule_Trigger_Value` igual al nombre exacto de la columna destino (comparación por texto, no por ID de columna).
   - Filtra por equipo comparando contra los `Request_Team_ID` reales del ticket movido (tabla `TBL_Request_Team`).
   - Soporta las tres acciones:
     - `asignar_resolutor`: mismo `upsert` + notificación que en creación.
     - `asignar_prioridad`: traduce la prioridad textual (`baja`/`media`/`alta`/`critica`) a un `Request_Score` numérico fijo (`1`/`2`/`4`/`6`) y lo escribe directo en `TBL_Requests`. **Esta acción solo existe para el disparador `columna_cambiada`.**
     - `notificar_usuario`: además de `'solicitante'` y un ID específico, admite `'asignados'` (resolutores actuales del ticket) y `'todos'` (asignados + solicitante), resueltos vía `getRequestParticipants`.
   - Mismo patrón de contador de ejecuciones y de `try/catch` best-effort (no bloquea el movimiento del ticket).

### Tablas de base de datos involucradas

- `TBL_Automation_Rules` — cada regla: disparador, valor del disparador, acción, valor de la acción, equipo objetivo (o null = todos), estado activo/inactivo, contador y fecha de última ejecución.
- `TBL_Requests_Assignments` — donde se escribe la asignación cuando la acción es `asignar_resolutor`.
- `TBL_Requests` — donde se escribe `Request_Score` cuando la acción es `asignar_prioridad`.
- `TBL_Notifications` — donde caen las notificaciones in-app generadas por `notificar_usuario` (y por `asignar_resolutor`, que también notifica).
- `TBL_Board_Teams`, `TBL_Request_Team` — resolución de equipo objetivo de la regla y equipos reales del ticket, usados para el filtro de coincidencia.
- `TBL_Users` — resolución de nombres de usuario para las etiquetas legibles y para el selector del modal.

Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- Una regla con `Rule_Team_ID = null` aplica a **todos los equipos**; con un ID, solo a ese equipo.
- El emparejamiento de `columna_cambiada` es por **nombre de columna en texto** (`Rule_Trigger_Value` vs. `Board_Column_Name`), no por `Board_Column_ID`. Si alguien renombra una columna, las reglas que apuntaban al nombre viejo dejan de dispararse silenciosamente (no hay migración automática de `Rule_Trigger_Value`).
- Las acciones disponibles varían por disparador: `solicitud_creada` → `asignar_resolutor` | `notificar_usuario`; `columna_cambiada` → `asignar_resolutor` | `asignar_prioridad` | `notificar_usuario`. Esta restricción está codificada dos veces de forma independiente: en el frontend (`TRIGGER_ACTIONS` en `CreateAutomationModal.tsx`) y implícitamente en el backend (el `switch` de `requests.ts` simplemente no tiene rama `asignar_prioridad` en el bloque de `solicitud_creada`). No hay una fuente única de verdad ni una validación explícita en el backend que rechace una combinación inválida si llegara por otra vía (ver riesgos).
- El contador `Rule_Exec_Count` se incrementa **por cada regla que corrió**, incluso si su acción interna no tuvo efecto (p. ej. `Rule_Action_Value` no parsea a un ID de usuario válido) — el incremento ocurre siempre después del bloque de ejecución, salvo que ese bloque específico lance una excepción.
- Todos los efectos de automatización son **best-effort**: nunca deben tumbar la creación ni el movimiento del ticket. Los errores se descartan silenciosamente (sin log) tanto a nivel de regla individual como del bloque completo.

## Automatizaciones y efectos secundarios

- Una automatización `asignar_resolutor` dispara además una notificación in-app al usuario asignado (tipo `assignment`), igual que una asignación manual.
- Una automatización `notificar_usuario` en `columna_cambiada` puede generar notificaciones a **múltiples usuarios a la vez** si el destino es `'asignados'` o `'todos'`.
- Ninguna acción de automatización dispara correo: usan directamente `insertNotifications` (solo in-app), no `notifyEvent` ni `sendEventEmail`. Si se necesita que un evento de automatización también envíe correo, hoy no hay ese camino — ver módulo de Notificaciones y Correo.
- El movimiento de columna que dispara `columna_cambiada` ocurre en el mismo handler que también dispara los correos de "en revisión de cliente" / "en progreso" (`maybeSendClientReviewEmail`, `maybeSendInProgressEmail`) — ambos mecanismos corren en la misma operación pero son independientes entre sí.

## Puntos frágiles / riesgos conocidos

- **Sin validación cruzada disparador/acción en el backend.** `createAutomationRule` acepta cualquier combinación de `trigger`/`action`/`actionValue` sin verificar que sea una combinación soportada por el evaluador de `requests.ts`. Si se crea una regla `solicitud_creada` + `asignar_prioridad` (posible saltándose el frontend, p. ej. con una llamada directa a la API), quedará guardada, activa y contando como válida en la UI, pero nunca se ejecutará porque el bloque de `solicitud_creada` no tiene esa rama — comportamiento silenciosamente inconsistente.
- **Coincidencia de columna por nombre, no por ID** (`requests.ts`, bloque `columna_cambiada`): renombrar una columna del tablero rompe cualquier regla que apuntara a su nombre anterior, sin aviso ni migración.
- **Duplicación de la matriz disparador→acciones válidas.** Vive por separado en `src/features/automations/components/CreateAutomationModal.tsx` (`TRIGGER_ACTIONS`) y en la lógica if/else de `supabase/functions/api/handlers/requests.ts`. Un cambio en uno de los dos lugares sin el otro produce reglas configurables en la UI que nunca se ejecutan, o casos soportados por el backend que la UI nunca ofrece.
- **Errores de ejecución completamente silenciosos.** Los `catch (_ruleErr)` y `catch (_autoErr)` en `requests.ts` no registran nada (ni `console.error`), a diferencia de otros puntos del código (p. ej. `sendEventEmail` sí hace `console.error`). Si una regla falla sistemáticamente (por ejemplo, un `Rule_Action_Value` corrupto), no queda ningún rastro para diagnosticarlo salvo notar que `Rule_Exec_Count` no avanza o que el efecto esperado no ocurrió.
- **Sin límite ni deduplicación de reglas superpuestas.** Nada impide crear dos reglas activas con el mismo disparador/columna/equipo pero acciones distintas (o contradictorias, p. ej. dos reglas `asignar_prioridad` con valores distintos para la misma columna); ambas se ejecutarán en el orden en que las devuelva la query, y la segunda sobreescribe el efecto de la primera sin aviso.
- **Ruta `automations/logs`** (`src/App.tsx`) monta el mismo componente `AutomationsPage` que `automations` — no hay una vista de "logs" o historial de ejecuciones distinta; el único rastro de ejecución visible es el contador y la fecha de última ejecución en la tarjeta de cada regla.
- **Eliminación sin confirmación explícita en el frontend** (`deleteAutomationRule`): el botón de papelera de `AutomationCard` no pide confirmación antes de llamar a la mutación, a diferencia de, por ejemplo, `AnnouncementsConfig.tsx` que sí usa `confirm(...)` antes de borrar un anuncio.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchAutomationRules` | Lista todas las reglas con equipo embebido y etiqueta resuelta de la acción | `supabase/functions/api/handlers/automationRules.ts` |
| `createAutomationRule` | Crea una regla nueva (activa, contador en 0) | `supabase/functions/api/handlers/automationRules.ts` |
| `toggleAutomationRule` | Activa/desactiva una regla existente | `supabase/functions/api/handlers/automationRules.ts` |
| `deleteAutomationRule` | Elimina una regla de forma permanente | `supabase/functions/api/handlers/automationRules.ts` |

> La evaluación de reglas (disparo real de efectos) no es una acción de API independiente: ocurre como efecto colateral dentro de las acciones de creación y movimiento de tickets del handler `supabase/functions/api/handlers/requests.ts` (documentado en `modulos/01-tickets-y-kanban.md`).
