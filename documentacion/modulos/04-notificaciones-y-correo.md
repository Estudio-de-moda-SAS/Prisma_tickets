# Módulo: Notificaciones y Correo

## Resumen

Este módulo cubre cómo PRISMA avisa a sus usuarios de lo que pasa en sus tickets: notificaciones dentro de la app (campana con panel desplegable), notificaciones nativas del sistema operativo/navegador mientras la app está abierta, correos transaccionales por evento (asignación, comentario, cambio de columna, cierre, feedback) enviados vía la API corporativa de Microsoft Graph, y anuncios globales (banners, tarjetas de inicio y modales críticos) que administra TI para toda la organización. Es transversal: casi todos los demás módulos de negocio (tickets, comentarios, cierre, feedback) generan notificaciones y correos a través de este módulo, aunque no siempre por el mismo camino (ver "Reglas de negocio" más abajo).

## Flujos de usuario

1. **Recibir una notificación in-app** — Cualquier usuario ve un contador en la campana (`NotificationBell`) en cuanto algo relevante ocurre en un ticket suyo (le asignan un ticket, comentan, cambia de columna, se revisa un criterio, etc.). Al abrir el panel ve la lista ordenada de más reciente a más antigua, con ícono y color por tipo, quién la originó y hace cuánto. Click en una notificación la marca como leída y navega al ticket (o, si es de tipo `export_ready`, abre el historial de exportaciones).
2. **Activar avisos del sistema operativo** — La primera vez que hay soporte del navegador y el permiso está en `default`, aparece un prompt (`NotificationPermissionPrompt`) y, dentro del panel de la campana, un banner ("Mostramos avisos del sistema mientras PRISMA esté abierto — Activar"). Si el usuario acepta, mientras tenga la pestaña abierta (o el Service Worker activo) las notificaciones nuevas también aparecen como notificación nativa del SO/navegador; si hace click en ellas, PRISMA enfoca la ventana existente o abre una nueva en el ticket correspondiente. El usuario puede decir "No volver a mostrar" para no ver más el prompt.
3. **Recibir un correo** — Cuando corresponde (ver contrato de `notifyEvent`/`sendEventEmail` más abajo), el usuario recibe un correo transaccional a su(s) dirección(es) registrada(s), con asunto y cuerpo generados a partir de una plantilla configurable. Los correos del mismo ticket se agrupan como respuestas del mismo hilo cuando es posible.
4. **Configurar plantillas de correo (admin)** — Desde el panel de configuración, pestaña de plantillas de correo (`EmailsTemplatesConfig` / `EmailTemplateList`), un admin ve las plantillas existentes por evento (`Event_Key`), puede editar el HTML/asunto con una vista previa de ejemplo, editar nombre/variables sin tocar el cuerpo, activar/desactivar una plantilla (una plantilla inactiva hace que ese evento no envíe correo aunque el código lo dispare) o crear una plantilla nueva para un evento nuevo.
5. **Configurar anuncios globales (admin)** — Desde `AnnouncementsConfig`, un admin crea un aviso con título, descripción, tipo (info/aviso/crítico/éxito), en qué superficies se muestra (banner, login, inicio, modal) y a qué audiencia (todos, solo admin, o un departamento/equipo puntual), con ventana de vigencia opcional. Los avisos de tipo `critical` mostrados en superficie `home` aparecen además como modal bloqueante que el usuario debe confirmar ("Entendido") antes de poder descartarlo.
6. **Ver/descartar anuncios (cualquier usuario)** — Los banners y tarjetas de anuncio se pueden cerrar; PRISMA recuerda ese descarte en el navegador del usuario (no en el servidor) para no volver a mostrarlo. Los anuncios en login son visibles sin haber iniciado sesión.

## Arquitectura técnica

### Frontend

- `src/components/layout/NotificationBell.tsx` — ícono + contador de no leídas + panel desplegable; usa `useNotifications` para los datos y `useBrowserNotifications` para el puente con notificaciones nativas. Mapea `type` de notificación a ícono/color (`assignment`, `comment`, `column_move`, `closure`, `criteria_reviewed`, `sub_request_created`, `mention`, `export_ready`, `new_external_request`).
- `src/features/requests/hooks/useNotifications.ts` — query con **polling adaptativo** (30s con la pestaña visible, 2min en segundo plano, sigue refrescando en background), mutaciones optimistas `markRead`/`markAllRead` con rollback en error.
- `src/features/requests/hooks/useBrowserNotifications.ts` — hook que traduce notificaciones de la app a notificaciones nativas del SO. Mantiene el estado de permiso en un store externo compartido (patrón `useSyncExternalStore`) para que `NotificationBell` y `NotificationPermissionPrompt` vean el mismo permiso sin recargar. En Chrome Android usa `ServiceWorkerRegistration.showNotification()` (obligatorio ahí, `new Notification()` está prohibido); en escritorio/dev sin SW cae al constructor nativo como fallback. En la primera corrida fija una línea base (`lastSeenId`) para no re-disparar notificaciones ya existentes al montar.
- `src/components/layout/NotificationPermissionPrompt.tsx` — banner de solicitud de permiso, con estado "descartado para siempre" persistido en `src/store/notifPromptStore.ts` (Zustand + `persist`, clave `prisma-notif-prompt`) y un descarte de solo sesión aparte (estado local).
- `src/components/layout/AnnouncementBanner.tsx` — expone `AnnouncementBanner` (franja fija entre topbar y contenido, superficie `banner`) y `HomeAnnouncementsSection` (tarjetas en la página de inicio, superficie `home`). Ambos filtran localmente los anuncios ya descartados por el usuario.
- `src/components/layout/AnnouncementModal.tsx` — modal bloqueante centrado; solo se muestra para el anuncio `critical` más reciente de superficie `home` que el usuario no haya confirmado todavía. Requiere click en "Entendido" para cerrarse.
- `src/features/requests/hooks/useAnnouncements.ts` — modelo `Announcement`, estilos por tipo (`ANNOUNCEMENT_TYPE_STYLE`), tres queries (`useAnnouncements` in-app filtrada por audiencia del usuario actual, `useAllAnnouncements` sin filtrar para admin, `usePublicAnnouncements` para login sin sesión —llama directo a la Edge Function con la anon key—), mutaciones CRUD, y helpers de `localStorage` (`prisma_dismissed_announcements`, `prisma_confirmed_announcements`) para recordar descartes/confirmaciones **por navegador**, no por usuario en servidor.
- `src/components/ConfigPanelComponents/AnnouncementsConfig.tsx` — CRUD de anuncios para admin; calcula `target_role` como string compuesto (`admin`, `dept:<id>`, `dept:<id>,team:<id>`, o `null` = todos) y lo decodifica de vuelta al editar.
- `src/components/ConfigPanelComponents/EmailsTemplatesConfig.tsx` (contiene `EmailTemplateList` y subcomponentes) — CRUD de plantillas por board; incluye un editor con pestañas Editor/Preview que sustituye variables `{{var}}` por valores de ejemplo hardcodeados (`PREVIEW_VARS`) solo para visualización — el envío real interpola con `renderTemplate()` en el Edge Function, no con este preview.
- `src/features/requests/hooks/useEmailTemplates.ts` — hooks CRUD de plantillas y `EMAIL_EVENT_VARIABLES_FALLBACK`, variables por defecto para los eventos conocidos (`assignRequest`, `createComment`, `moveToColumn`, `closeRequest`, `updateAcceptanceCriteriaStatus`, `submitClientFeedback`), usadas cuando una plantilla todavía no tiene `Email_Template_Variables` propias.
- `public/sw-notifications.js` — Service Worker (inyectado al SW generado por Workbox/vite-plugin-pwa vía `importScripts`) que escucha `notificationclick`: si ya hay una ventana de PRISMA abierta, la enfoca y le manda un `postMessage` (`prisma:notification-click`) con el `notificationId` y la URL destino para que la SPA reutilice su propia lógica de activación (marcar leída + navegar); si no hay ninguna ventana abierta, abre una nueva en la URL destino con `clients.openWindow`. Es el puente entre "notificación mostrada por el SO" (incluso con la app cerrada) y "acción dentro de la SPA".

### Backend (Edge Function)

**Handlers involucrados:** `handlers/notifications.ts`, `handlers/notifyEvent.ts`, `handlers/emailTemplates.ts`, `handlers/announcements.ts`, más los helpers compartidos `shared/notifications.ts` y `email/send.ts`.

| Acción | Descripción | Notas clave |
|---|---|---|
| `getNotifications` | `{ userId, limit? }` (default 40). Devuelve `{ notifications, unreadCount }` con el actor embebido, más recientes primero. | `unreadCount` se calcula solo sobre el lote traído (no es el total real si hay más de `limit` no leídas). |
| `markNotificationRead` | `{ notificationId, userId }`. | Filtra también por `userId` en el `UPDATE` para que nadie marque notificaciones ajenas. |
| `markAllNotificationsRead` | `{ userId }`. | Marca todas las no leídas de ese usuario. |
| `fetchEmailTemplates` | `{ boardId }`. Lista plantillas de un board ordenadas por ID. | |
| `updateEmailTemplate` | `{ id, subject, html, text }`. Actualiza cuerpo y refresca `Updated_At`. | No toca nombre/variables/event key. |
| `toggleEmailTemplate` | `{ id, isActive }`. | Una plantilla inactiva hace que `sendEventEmail` no encuentre template activo y **no** envíe correo para ese evento (silenciosamente). |
| `createEmailTemplate` | `{ boardId, name, eventKey, subject, variables }`. Crea con cuerpos vacíos. | Valida unicidad de `eventKey` a nivel **global** (no por board) y lanza error si ya existe. |
| `deleteEmailTemplate` | `{ id }`. | Borrado permanente. |
| `updateEmailTemplateMetadata` | `{ id, name, subject, variables }`. | No toca el cuerpo HTML/texto. |
| `get_announcements` | `{ surface?, userRole?, userDeptId?, userTeamId? }`. Filtra por vigencia en la query y por audiencia (`target_role`) en memoria. | Usa `service_role`, por lo que el filtrado de audiencia depende enteramente de la lógica de la aplicación, no de RLS. |
| `get_all_announcements` | Sin filtros; para el panel admin. | |
| `create_announcement` | `{ title, body?, type, showIn, targetRole?, startsAt?, endsAt?, createdBy }`. | `startsAt` por defecto es "ahora". |
| `update_announcement` | `{ id, ...campos parciales }`. | Patch parcial: solo escribe los campos presentes en el payload. |
| `delete_announcement` | `{ id }`. | Borrado permanente. |
| `get_public_announcements` (no está en el handler map, es una función exportada aparte, `getPublicAnnouncements`) | Sin payload. Anuncios activos con `show_in` conteniendo `'login'`. | Es la única acción **pública** de toda la API (sin JWT) — se invoca antes de iniciar sesión. |

**`notifyEvent()`** (`supabase/functions/api/handlers/notifyEvent.ts`) — helper combinado in-app + correo, pensado para ser importado por otros handlers de dominio (no es una acción de API, no está registrado en `router.ts`). Su contrato:

- Firma: `notifyEvent(supabase, { eventKey, userIds, requestId, actorId, notification: { type, title, body }, emailVars?, cc? })`.
- Paso 1, siempre: inserta la notificación in-app para todos los `userIds` vía `insertNotifications` — esta parte nunca se salta.
- Paso 2, condicional: solo si **ambos** `emailVars` **y** `requestId` están presentes, llama a `sendEventEmail` para intentar el correo del evento. **Si falta cualquiera de los dos, no se envía correo — sin error, sin log, en silencio.**
- Dentro de `sendEventEmail` además se exige que exista una plantilla **activa** para ese `eventKey`; si no la hay, tampoco se envía nada.
- El envío de correo es best-effort: `sendEventEmail` envuelve todo en `try/catch` interno, así que un fallo de la API de Graph nunca se propaga hacia `notifyEvent` ni hacia el handler que lo llamó.
- **Hallazgo relevante:** pese a que el comentario del módulo (y `documentacion/ARQUITECTURA.md §6.2`) lo describe como el patrón central usado por "casi todos los módulos de negocio", una búsqueda en todo el repo (`grep notifyEvent`) muestra que **ningún otro archivo lo importa ni lo llama** — está definido pero huérfano. En la práctica, los módulos de negocio (`handlers/requests.ts`, `handlers/assignments.ts`, `shared/requests.ts`) llaman **por separado** a `insertNotifications` (in-app) y a `sendEventEmail` de `email/send.ts` (correo), replicando manualmente el mismo patrón que `notifyEvent` pretende centralizar, en vez de pasar por él. Ver "Puntos frágiles".

**`insertNotifications`** (`supabase/functions/api/shared/notifications.ts`) — inserta una fila por usuario en `TBL_Notifications` (fan-out), marcada como no leída; no hace nada si `userIds` viene vacío.

**`sendEventEmail`** (`supabase/functions/api/email/send.ts`) — la implementación real y activa de envío de correo, usada directamente por `requests.ts`, `assignments.ts` y `shared/requests.ts` (además de por `notifyEvent`):
1. Corta temprano si `MAIL_API_URL`/`MAIL_SENDER` (variables de entorno) no están configuradas, o si `userIds` viene vacío.
2. Busca la plantilla **activa** para `Event_Key` (columna única a nivel global).
3. Resuelve destinatarios desde la vista `VW_User_Notification_Emails` (todas las identidades de correo notificables de cada usuario, ya filtrando inactivos e identidades con `Identity_Notify = false`), deduplicando por dirección.
4. Interpola `{{variable}}` en asunto y cuerpo con `renderTemplate()`.
5. Envía **un correo por destinatario** (hilo propio por bandeja, sin exponer otras direcciones) a la API corporativa de Microsoft Graph (`MAIL_API_URL`), con headers `In-Reply-To`/`References` para encadenar el hilo cuando `MAIL_SUPPORTS_REPLY_HEADERS` está en `true` y existe un envío previo registrado en `TBL_Email_Logs` para ese request+destinatario.
6. Registra **siempre** una fila en `TBL_Email_Logs` por destinatario, con estado `sent` o `error` (con el texto del error si falló), el `providerMsgId` devuelto por Graph si hubo éxito, y las cabeceras de hilo usadas.
7. Todo el cuerpo de la función está envuelto en un `try/catch` externo con `console.error` — a diferencia de las automatizaciones, aquí sí queda log del fallo.

**Nota sobre código muerto:** existe una segunda implementación de `renderTemplate`/`sendEventEmail` en `supabase/functions/api/shared/email.ts`, más simple (no llama a ninguna API externa, solo deja el correo en estado `pending` en `TBL_Email_Logs`, comentario explícito: "cambiar a variable cuando actives el envío real"). No es importada por ningún archivo del proyecto (`grep` no encuentra referencias) — quedó reemplazada por `email/send.ts` pero nunca se eliminó.

### Tablas de base de datos involucradas

- `TBL_Notifications` — una fila por notificación in-app y destinatario.
- `TBL_Email_Templates` — plantillas de correo por evento (`Event_Key`, único global), con asunto/HTML/texto y estado activo.
- `TBL_Email_Logs` — un registro por correo efectivamente intentado (uno por destinatario), con estado, mensaje, IDs de hilo (`In-Reply-To`/`References`) y error si aplica.
- `TBL_Announcements` — anuncios globales (banners/modales); usa columnas en **snake_case** (`title`, `body`, `show_in`, `target_role`, `is_active`, `starts_at`, `ends_at`, `created_by`, `created_at`, `announcement_id`), a diferencia de la convención PascalCase `TBL_` del resto del sistema.
- `TBL_Users` — resolución de destinatarios "usuario específico".
- `VW_User_Notification_Emails` (vista) — identidades de correo notificables por usuario, usada exclusivamente por `sendEventEmail` para resolver a quién efectivamente se le manda el correo.

Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- Una notificación in-app **siempre** se crea si se llama al helper correspondiente; el correo es siempre condicional y nunca bloquea nada — el usuario nunca deja de enterarse dentro de la app aunque el correo falle o no aplique.
- El correo de un evento solo sale si se cumplen **las tres condiciones a la vez**: (1) el código que originó el evento pasó `emailVars`, (2) pasó un `requestId`, y (3) existe una plantilla `TBL_Email_Templates` **activa** para ese `Event_Key`. Faltando cualquiera, no hay correo, sin ningún aviso de que se omitió.
- `Event_Key` es único a nivel **global**, no por board — `createEmailTemplate` lo valida explícitamente y lanza si ya existe.
- Los destinatarios de un correo se resuelven por **todas las identidades activas y notificables** de cada `User_ID` (vista `VW_User_Notification_Emails`), no por un único correo por usuario — un usuario con varias cuentas registradas puede recibir el mismo correo más de una vez (una por dirección).
- El hilo de correo (`In-Reply-To`/`References`) se arma solo si `MAIL_SUPPORTS_REPLY_HEADERS = true` (constante hardcodeada en `email/send.ts`, condicionada a que la API de correo confirme soporte de esos headers) y solo si hay un envío previo con `Provider_Msg_ID` no nulo para el mismo `requestId` + dirección de destino.
- Un anuncio con `show_in` incluyendo `login` fuerza en el formulario de admin que la audiencia sea "Todos" (no tiene sentido segmentar por departamento algo visible sin sesión iniciada) — validación solo en el frontend (`AnnouncementsConfig.tsx`, función `toggle`).
- El modal crítico (`AnnouncementModal`) solo se dispara para anuncios `type === 'critical'` en superficie `home`; los demás tipos/superficies nunca son bloqueantes.
- Los descartes de banners y las confirmaciones de modales críticos se guardan en `localStorage` del navegador, **no en el servidor** — cambiar de dispositivo o navegador hace reaparecer avisos ya descartados/confirmados.

## Automatizaciones y efectos secundarios

- Casi todo evento de negocio relevante dispara notificación in-app y, potencialmente, correo: asignación de ticket (`assignRequest`), comentario (`createComment`), ticket recibido/creado (`ticket_recibido`), movimiento a "en progreso" (`movido_en_progreso`) o a revisión de cliente (`movido_client_review`), envío de feedback del cliente (`submitClientFeedback`). Estos `eventKey` son los que hoy tienen código que los dispara — ver el módulo de tickets/ciclo de vida para el detalle de cada disparo.
- Las reglas de **automatización** (módulo `03-automatizaciones.md`) generan notificaciones in-app propias vía `insertNotifications`, pero **no** pasan por `sendEventEmail` ni `notifyEvent` — una automatización nunca dispara un correo transaccional de este módulo.
- Una notificación in-app nueva, si el usuario dio permiso de notificaciones del navegador, se traduce en una notificación nativa del SO a través de `useBrowserNotifications` — esto ocurre enteramente en el cliente, iterando sobre las notificaciones ya traídas por polling; no hay push real (Web Push/FCM) del lado del servidor.
- Los anuncios activos con vigencia vencida o `is_active = false` dejan de aparecer en `get_announcements`/`getPublicAnnouncements` automáticamente por el filtro de fecha en la query; no requieren limpieza manual.

## Puntos frágiles / riesgos conocidos

- **`notifyEvent()` está huérfano.** Existe, tiene TSDoc completo y aparece descrito en `documentacion/ARQUITECTURA.md §6.2` como el patrón central de notificación, pero ningún handler lo importa (confirmado por búsqueda en todo el repo). El comportamiento real de "in-app + correo" está duplicado a mano en `supabase/functions/api/handlers/requests.ts`, `handlers/assignments.ts` y `shared/requests.ts`, cada uno llamando a `insertNotifications` y `sendEventEmail` por separado. Riesgo concreto: cualquier mejora futura al contrato combinado (p. ej. reintentos, validación de `emailVars`) que se haga solo en `notifyEvent` no tendrá ningún efecto real hasta que los llamadores existentes se migren a usarlo.
- **Código muerto duplicado en `shared/email.ts`.** Segunda implementación de `sendEventEmail`/`renderTemplate` que deja correos en estado `pending` sin enviarlos de verdad (tal como dice su propio comentario). No la importa nadie, pero puede confundir a quien busque "dónde se envía el correo" y edite el archivo equivocado.
- **Fallo de correo silencioso para el usuario y casi silencioso para el operador.** El único rastro de un correo fallido es una fila con `Email_Log_Status = 'error'` en `TBL_Email_Logs` y un `console.error` en los logs de la Edge Function; no hay reintento automático ni alerta. Si `MAIL_API_URL`/`MAIL_SENDER` no están configuradas, la función retorna temprano sin loguear nada (comentario `console.warn` está comentado/deshabilitado en el código), lo que dificulta diagnosticar un ambiente mal configurado.
- **`TBL_Announcements` rompe la convención de nombres del resto del sistema** (snake_case en vez de `TBL_` + PascalCase). No es un bug funcional, pero es una fuente probable de errores de copy-paste al escribir queries nuevas contra esta tabla.
- **Anuncios: filtrado de audiencia en memoria, no en la base.** `get_announcements` trae todos los anuncios vigentes de la superficie pedida y filtra por rol/depto/equipo del lado de la aplicación (comentario explícito en el propio archivo: "las queries usan el service role key... el filtrado por audiencia se aplica en la capa de aplicación, no en la base de datos"). Cualquier nuevo caller que use `service_role` directamente sin pasar por este handler expondría anuncios de otras audiencias.
- **Descartes/confirmaciones de anuncios viven solo en `localStorage`.** Un usuario que limpia su navegador, usa modo incógnito o cambia de dispositivo vuelve a ver anuncios (incluido el modal crítico bloqueante) que ya había confirmado. No hay tabla de "anuncios vistos por usuario" en el servidor.
- **`unreadCount` de `getNotifications` no es el total real.** Se calcula solo sobre el lote de máximo `limit` (40 por defecto) notificaciones traídas, no sobre el total de no leídas en la tabla. Un usuario con más de 40 notificaciones no leídas verá un contador subestimado.
- **Sin RLS, filtrado dependiente de cada handler.** Igual que el resto de la Edge Function, `markNotificationRead`/`markAllNotificationsRead` dependen de que el `userId` recibido en el payload sea correcto — no hay verificación adicional contra el JWT de quien llama a nivel de este módulo específico (la verificación de identidad ocurre una capa antes, en el entry point).

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `getNotifications` | Lista notificaciones de un usuario + contador de no leídas (del lote traído) | `supabase/functions/api/handlers/notifications.ts` |
| `markNotificationRead` | Marca una notificación puntual como leída | `supabase/functions/api/handlers/notifications.ts` |
| `markAllNotificationsRead` | Marca todas las no leídas de un usuario como leídas | `supabase/functions/api/handlers/notifications.ts` |
| `fetchEmailTemplates` | Lista plantillas de correo de un board | `supabase/functions/api/handlers/emailTemplates.ts` |
| `updateEmailTemplate` | Actualiza asunto/HTML/texto de una plantilla | `supabase/functions/api/handlers/emailTemplates.ts` |
| `toggleEmailTemplate` | Activa/desactiva una plantilla | `supabase/functions/api/handlers/emailTemplates.ts` |
| `createEmailTemplate` | Crea una plantilla nueva para un `eventKey` único | `supabase/functions/api/handlers/emailTemplates.ts` |
| `deleteEmailTemplate` | Elimina una plantilla | `supabase/functions/api/handlers/emailTemplates.ts` |
| `updateEmailTemplateMetadata` | Actualiza nombre/asunto/variables sin tocar el cuerpo | `supabase/functions/api/handlers/emailTemplates.ts` |
| `get_announcements` | Lista anuncios vigentes filtrados por audiencia | `supabase/functions/api/handlers/announcements.ts` |
| `get_all_announcements` | Lista todos los anuncios sin filtrar (admin) | `supabase/functions/api/handlers/announcements.ts` |
| `create_announcement` | Crea un anuncio | `supabase/functions/api/handlers/announcements.ts` |
| `update_announcement` | Actualiza parcialmente un anuncio | `supabase/functions/api/handlers/announcements.ts` |
| `delete_announcement` | Elimina un anuncio | `supabase/functions/api/handlers/announcements.ts` |
| `get_public_announcements` | Anuncios activos para pantalla de login (única acción pública, sin JWT) | `supabase/functions/api/handlers/announcements.ts` (función `getPublicAnnouncements`, fuera del handler map) |

> `notifyEvent` no aparece en esta tabla porque no es una acción de API: es un helper interno pensado para ser llamado desde otros handlers, y hoy no lo llama ninguno (ver "Puntos frágiles").
