# Módulo: Sistema y Soporte

## Resumen

Este módulo agrupa funcionalidad transversal que no pertenece a ningún board ni equipo en particular: el **reporte de fallos** desde dentro de la app (con conversión opcional a ticket real), la **calificación de satisfacción** general con PRISMA, un **sistema genérico de jobs en background** (usado hoy por el renombrado masivo de campos de plantilla y por las exportaciones), y el **mecanismo de actualización de versión** de la PWA (detección de deploy nuevo + banner de recarga). El panel `/prisma` (`PrismaAdminPage`, solo `admin`) es la cara visible de todo esto para TI, con tres tabs: **Bug Reports**, **Satisfacción** y **Resolutores**. Este documento cubre los dos primeros tabs; el tercero (un dashboard de ranking/desempeño por resolutor, aunque vive en la misma página) está documentado en [`modulos/13-dashboard.md`](13-dashboard.md) junto con el resto de dashboards del sistema. Casi todo el resto vive en un único handler pequeño (`system.ts`); la pieza de versión/PWA es puramente frontend + configuración de build.

## Flujos de usuario

- **Cualquier usuario autenticado**: desde algún punto común de la UI (botón de feedback, ver `Topbar`/layout) abre `BugReportModal` para reportar un fallo (título + descripción obligatorios; la pantalla actual se adjunta automáticamente vía `useLocation().pathname`) o `SatisfactionModal` para calificar su experiencia con PRISMA (1 a 5 estrellas + comentario opcional).
- **`admin`** (`RequireAdmin`) — `/prisma`: panel con tres tabs — **Bug Reports** (buscar/filtrar por severidad y estado, ver detalle expandible, botón "Asignar" que abre `AssignBugModal` para convertir el reporte en un ticket real), **Satisfacción** (promedio, distribución 1–5, lista de respuestas con comentario) y **Resolutores** (dashboard de ranking de desempeño por resolutor — ver flujo completo en [`modulos/13-dashboard.md`](13-dashboard.md)).
- **`admin` asignando un bug**: en `AssignBugModal`, elige equipo, resolutor (de los sub-equipos de ese equipo), sprint opcional, horas estimadas, score/prioridad y labels; al confirmar, el reporte se convierte en un ticket real dentro del board de TI y desaparece de "pendientes" (pasa a `asignado`, con un chip "🎫 <ID>" que enlaza al ticket).
- **Cualquier usuario, en segundo plano**: la pestaña detecta sola si hay una versión nueva desplegada (polling cada 5 min + al volver de background/foco) y muestra un `VersionUpdateBanner` no intrusivo con botón "Recargar ahora"; también puede instalar PRISMA como PWA si el navegador ofrece el prompt nativo (`useInstallPrompt`, consumido desde `Topbar`).
- **Configuración de plantillas (`admin`)**: al renombrar un campo de una plantilla de solicitud, un job en background propaga el cambio a todos los requests existentes; la UI de plantillas hace polling de su progreso usando las mismas acciones genéricas de este módulo (`getBackgroundJob`, `resumeStalledJob`).

## Arquitectura técnica

### Frontend

- **Modales de feedback**: `src/components/layout/BugReportModal.tsx` y `src/components/layout/SatisfactionModal.tsx` — ambos autocontenidos (estado propio, sin hook dedicado), llaman `apiClient.call` directo y comparten las clases CSS `feedback-modal*`.
- **Panel admin**: `src/pages/PrismaAdminPage.tsx` — página única con estado propio por tab (`fetchBugReports`/`fetchSatisfactionRatings`/`fetchResolutionRatings`, cada una con su `load*`/loading/error vía `useState`/`useCallback`, sin TanStack Query), refetch manual por tab con el botón "Actualizar", y filtros/búsqueda siempre en memoria sobre el array ya cargado completo (sin paginar en servidor). El tercer tab (`ResolutionTab`, "Resolutores") vive en el mismo archivo pero está documentado en [`modulos/13-dashboard.md`](13-dashboard.md) junto con el resto de dashboards del sistema.
- **Conversión de bug a ticket**: `src/features/requests/components/AssignBugModal.tsx` — arma el payload de `assignBugToRequest` (equipo, resolutor por sub-equipo, sprint vigente, horas, score, labels).
- **Detección de nueva versión**: `src/components/hooks/useVersionCheck.ts` — hace `fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })`, compara contra la constante de build `__APP_VERSION__`; se ejecuta al montar, al volver la pestaña a visible (`visibilitychange`) y cada 5 minutos (`POLL_INTERVAL`); no corre en `import.meta.env.DEV`.
- **Banner de actualización**: `src/components/layout/VersionUpdateBanner.tsx` — registra el service worker a nivel de módulo (una sola vez por carga de página) vía `registerSW` de `virtual:pwa-register` (Vite PWA plugin), en modo `prompt` (el SW nuevo queda en espera hasta que el usuario decide recargar). Cuando `useVersionCheck` detecta versión nueva, fuerza `swRegistration.update()` para que el SW ya esté listo cuando el usuario haga clic en "Recargar ahora".
- **Instalación de PWA**: `src/hooks/useInstallPrompt.ts` — captura `beforeinstallprompt` **a nivel de módulo** (no dentro de un efecto de React), porque Chrome puede disparar el evento antes del primer render; expone `canInstall`/`promptInstall` vía `useSyncExternalStore`. Consumido desde `src/components/layout/Topbar.tsx`.
- **Config de build de versión**: `vite.config.ts` — plugin `prisma-version` (hook `buildStart`) escribe `public/version.json` con el short hash de git (`git rev-parse --short HEAD`, o timestamp si no hay git) tanto en dev como en build, y lo expone también como constante inyectada `__APP_VERSION__`. `public/version.json` se excluye explícitamente del precache de Workbox (`globIgnores`) y de `navigateFallback` — si entrara al precache, el chequeo de versión dejaría de funcionar porque siempre leería el valor cacheado.

### Backend (Edge Function)

Handler: `supabase/functions/api/handlers/system.ts` (`systemHandlers`). Registrado en `router.ts`.

| Acción | Qué hace | Parámetros clave | Reglas no obvias |
|---|---|---|---|
| `createBugReport` | Inserta el reporte en `TBL_Bug_Reports` con `Status: 'pendiente'`. | `{ userId, title, description, severity?, screenPath }` | Notifica *best-effort* a los miembros de todos los sub-equipos del board team "Desarrollo TI" (`Sub_Team_Team_ID = 11`, hardcodeado), excluyendo al reportante; un fallo notificando no revierte la creación. |
| `fetchBugReports` | Lista todos los reportes con `reporter`, `resolver` y `request.Request_Score` embebidos. | — | Orden descendente por `Created_At`. |
| `updateBugReportStatus` | Cambia `Status` de un reporte. | `{ reportId, status }` | Ya no está enlazado a ningún control visible en `PrismaAdminPage` (ver riesgos) — el cambio de estado real ocurre por sincronización automática (ver Automatizaciones). |
| `assignBugToRequest` | Convierte un bug report en un ticket real y asigna resolutor. | `{ reportId, boardId, teamId, resolverId, assignedBy, sprintId, estimatedHours, score, labelIds }` | Usa la plantilla fija "Fallo PRISMA" (`Request_Template_ID = 13`); guarda trazabilidad al origen en `Request_Form_Data.__source = 'bug_report'`; score = el elegido por el admin o, si no se elige, mapeo fijo por severidad (`bajo:1, medio:2, alto:4, critico:6`); falla si el reporte ya tenía `Linked_Request_ID` (evita doble conversión) o si el board no tiene columna "Sin categorizar". |
| `createSatisfactionRating` | Inserta una calificación en `TBL_Satisfaction_Ratings`. | `{ userId, score, comment }` | Rate limit configurable por `RATING_RATE_LIMIT_DAYS` (`config.ts`) — **actualmente en `0`, es decir, sin límite activo** aunque el código de la ventana sigue implementado. |
| `fetchSatisfactionRatings` | Lista todas las calificaciones con `rater` embebido. | — | Orden descendente por `Created_At`. |
| `getBackgroundJob` | Devuelve estado/progreso de un job (`TBL_Background_Jobs`) para polling. | `{ jobId }` | Genérico: no sabe de qué tipo de job se trata (`Job_Type` es solo un dato más). |
| `resumeStalledJob` | Reanuda un job "estancado". | `{ jobId }` | No hace nada si ya terminó (`done`/`failed`); si su última actualización fue hace más de 60s, relanza el siguiente chunk vía `EdgeRuntime.waitUntil` (o `.catch` silencioso si no está disponible ese runtime). |

### Tablas de base de datos involucradas

- `TBL_Bug_Reports` — reportes de fallos (título, descripción, severidad, estado, pantalla de origen, vínculo a ticket, resolutor asignado).
- `TBL_Satisfaction_Ratings` — calificaciones generales de satisfacción con la app (1-5 + comentario opcional).
- `TBL_Background_Jobs` — tabla **genérica** de jobs asíncronos (`Job_ID`, `Job_Type`, `Job_Status`, `Job_Progress_Current/Total`, `Job_Result`, `Job_Error`, timestamps); hoy la usan al menos el renombrado de campos de plantilla (`supabase/functions/api/jobs/renameJob.ts`) y las exportaciones (`supabase/functions/api/jobs/exportJob.ts`, `handlers/exportJobs.ts`).
- `TBL_Sub_Teams` / `TBL_Sub_Team_Members` — usadas por `createBugReport` para resolver a quién notificar dentro de "Desarrollo TI".
- `TBL_Requests`, `TBL_Requests_Templates`, `TBL_Board_Columns`, `TBL_Request_Team`, `TBL_Request_Sprint`, `TBL_Request_Labels`, `TBL_Requests_Assignments` — todas tocadas por `assignBugToRequest` al crear el ticket derivado del bug.
- `TBL_Users` — autores/resolutores/calificadores embebidos en los listados.

(Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.)

## Reglas de negocio y validaciones clave

- **Un bug solo se puede convertir en ticket una vez**: `assignBugToRequest` revisa `Linked_Request_ID` antes de insertar; si ya existe, lanza error explícito ("Este reporte ya fue convertido en ticket.").
- **Plantilla fija para bugs**: todo bug convertido usa el template `ID 13` ("Fallo PRISMA"); si ese template cambia de ID en el futuro, el valor hardcodeado en `system.ts:172` debe actualizarse a mano.
- **Score por severidad como fallback, no como regla dura**: el admin puede elegir cualquier score al asignar; solo si no elige uno se aplica el mapeo fijo por severidad.
- **Notificación de bug nuevo acotada a un board team fijo**: `DESARROLLO_TI_BOARD_TEAM_ID = 11` está hardcodeado en el handler (`system.ts:65`); si el board de Desarrollo TI cambiara de ID, las notificaciones de nuevos bugs dejarían de llegar sin que nada lo señale.
- **Rate limit de satisfacción desactivado en configuración actual**: `RATING_RATE_LIMIT_DAYS = 0` en `supabase/functions/api/config.ts:34` — la lógica de ventana sigue en el handler pero `0 > 0` nunca es verdadero, así que hoy cualquier usuario puede calificar cuantas veces quiera.
- **Reanudación de jobs por umbral de tiempo fijo**: un job se considera "estancado" si pasaron más de 60 segundos desde su última actualización (`system.ts:390`), sin importar el tipo de job ni cuánto debería tardar normalmente un chunk.
- **`version.json` es la única fuente de verdad de versión**: se compara contra `__APP_VERSION__` inyectado en build time; ambos derivan del mismo hash de git en el momento del build, por lo que un build reproducible sin commit nuevo generaría el mismo valor (no habría falso positivo de "hay actualización" solo por redeployar el mismo commit).

## Automatizaciones y efectos secundarios

- **Sincronización automática de estado de bug al mover el ticket vinculado**: quien cambia el `Status` de un `TBL_Bug_Reports` en la práctica no es `updateBugReportStatus`, sino el propio flujo de mover tickets del board (`supabase/functions/api/handlers/requests.ts`, sección "Sincronizar bug report vinculado", líneas ~649-662): al cerrar el ticket derivado del bug, el bug pasa a `cerrado`; al reabrirlo, vuelve a `asignado`. Esto ocurre dentro de un `try/catch` que ignora errores para no bloquear el movimiento del ticket.
- **Notificación best-effort al reportar un bug**: a los miembros de "Desarrollo TI" (excluyendo al reportante); un fallo se traga silenciosamente.
- **Notificación al resolutor asignado** (si no es quien asigna) al convertir un bug en ticket.
- **Auto-continuación de jobs**: cuando un chunk de un job termina y quedan más por procesar, el propio proceso se auto-invoca (`_kickoffJobChunk`, en `jobs/renameJob.ts`) haciendo un `fetch` a la misma Edge Function con un secreto interno (`INTERNAL_JOB_SECRET`) — `resumeStalledJob` es la red de seguridad si esa auto-invocación se pierde.
- **Registro del service worker en modo `prompt`**: el SW nuevo queda en espera (`waiting`) hasta que el usuario decide recargar desde `VersionUpdateBanner`; nunca se activa solo. Al detectar versión nueva vía `version.json`, se fuerza `registration.update()` para adelantar la descarga del SW antes de que el usuario haga clic.

## Puntos frágiles / riesgos conocidos

- **`updateBugReportStatus` quedó sin ningún control en la UI que lo invoque.** `PrismaAdminPage.tsx` define `changeStatus` (que sí llama a esa acción) y se lo pasa a `BugReportsTab`, pero `BugCard` (`src/pages/PrismaAdminPage.tsx:484-602`) desestructura solo `{ bug, onAssign }` — ignora `onAdvance` y `updating` — y el propio código deja un comentario explícito: *"Status (solo lectura — se maneja por el flujo, no a mano)"*. La acción sigue siendo válida y llamable vía API, lo que deja dos caminos posibles para cambiar el estado de un bug (manual vía API, y automático vía cierre del ticket) sin que el manual esté expuesto — riesgo si algún código nuevo vuelve a conectar ese botón sin revisar la sincronización automática.
- **Bug real en `VersionUpdateBanner.handleReload`**: la "red de seguridad" de recarga forzada está rota — `window.setTimeout(() => window.location.reload(), )` (`src/components/layout/VersionUpdateBanner.tsx:45`) no tiene segundo argumento (delay), por lo que el timeout se dispara casi de inmediato (delay `undefined` → `0`) en lugar de esperar los 3 segundos que el comentario del propio código dice que debería esperar (*"si el SW no toma el control en 3s, recargamos igual"*). En la práctica, la recarga de respaldo compite con `updateSW(true)` casi al mismo tiempo en vez de darle margen.
- **Panel `/prisma` sin paginación en el servidor**: `fetchBugReports` y `fetchSatisfactionRatings` (y, para el tab Resolutores, `fetchResolutionRatings`) traen la tabla completa; el filtrado/búsqueda de `PrismaAdminPage` es 100% en memoria sobre ese array. Con volumen alto de reportes o calificaciones, esto degrada tanto la respuesta de la Edge Function como el render del panel.
- **IDs de negocio hardcodeados en el handler**: `BUG_TEMPLATE_ID = 13`, `DESARROLLO_TI_BOARD_TEAM_ID = 11` (`system.ts`). Ninguno se resuelve por nombre/slug; un cambio de esos IDs en la base (p. ej. recrear el template o el board team) rompe silenciosamente la conversión de bugs o sus notificaciones.
- **Rate limit de satisfacción efectivamente apagado** (`RATING_RATE_LIMIT_DAYS = 0`): si se esperaba que estuviera activo en producción, es una discrepancia entre configuración y comportamiento esperado.
- **`getBackgroundJob`/`resumeStalledJob` no distinguen tipo de job para decidir el umbral de "estancado"**: los 60 segundos fijos pueden ser demasiado agresivos o demasiado laxos según el tipo de job que use la tabla en el futuro.

Los riesgos propios del dashboard de ranking de Resolutores (alcance, ponderación, memoización) están documentados en [`modulos/13-dashboard.md`](13-dashboard.md).

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `createBugReport` | Crea un reporte de fallo y notifica a Desarrollo TI. | `supabase/functions/api/handlers/system.ts` |
| `fetchBugReports` | Lista todos los reportes de fallos. | `supabase/functions/api/handlers/system.ts` |
| `updateBugReportStatus` | Cambia el estado de un reporte (sin UI activa que lo invoque). | `supabase/functions/api/handlers/system.ts` |
| `assignBugToRequest` | Convierte un reporte en ticket real y asigna resolutor. | `supabase/functions/api/handlers/system.ts` |
| `createSatisfactionRating` | Registra una calificación de satisfacción. | `supabase/functions/api/handlers/system.ts` |
| `fetchSatisfactionRatings` | Lista todas las calificaciones de satisfacción. | `supabase/functions/api/handlers/system.ts` |
| `getBackgroundJob` | Consulta estado/progreso de un job en background. | `supabase/functions/api/handlers/system.ts` |
| `resumeStalledJob` | Reanuda un job estancado (sin actividad hace 60s+). | `supabase/functions/api/handlers/system.ts` |
