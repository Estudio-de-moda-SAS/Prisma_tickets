# Módulo: Ciclo de vida del ticket (comentarios, adjuntos, cierre, feedback y calificación)

## Resumen

Este módulo cubre todo lo que ocurre **dentro** de un ticket ya creado, entre su apertura y su cierre definitivo: la conversación (comentarios con menciones), la evidencia (adjuntos y criterios de aceptación), el cierre formal con evidencia, la revisión y aprobación/rechazo del cliente, la calificación de la resolución (satisfacción con el resolutor) y la auditoría completa de cambios. Es el "cuerpo" del `RequestModal`: casi todo lo que ve un usuario al abrir el detalle de un ticket, salvo los datos básicos y el movimiento entre columnas (documentados en `documentacion/modulos/01-tickets-y-kanban.md`). Importa porque es donde queda registrado, de forma auditable, cómo se resolvió cada solicitud y qué tan conforme quedó quien la pidió.

## Flujos de usuario

### Comentar y mencionar
1. Cualquier participante del ticket escribe un comentario en `CommentComposer` (editor basado en Tiptap con soporte de `@menciones`).
2. Al enviar, el backend **re-valida** las menciones server-side (no confía en lo que mandó el cliente): si el ticket es confidencial y el autor no es admin, ninguna mención se permite; un admin puede mencionar a cualquiera; un usuario no-admin solo puede mencionar a gente de TI o de su propio departamento, y nunca a sí mismo.
3. Cada mención válida le da al mencionado acceso durable como **participante** del ticket (`TBL_Request_Participants`, vía `Added_Via = 'mention'`) y le dispara una notificación tipo `mention`.
4. El resto de involucrados (resolutores + solicitante, excluyendo autor y ya-mencionados) reciben una notificación tipo `comment`, y — si no hubo un correo de comentario reciente para ese ticket (ventana anti-spam de 15 minutos por destinatario) — un correo con una vista previa del comentario (omitida si el ticket es confidencial).
5. Un admin o un resolutor asignado puede revocar el acceso de un participante mencionado (`ParticipantsPanel`, botón "revocar" al pasar el mouse).

### Adjuntar evidencia general
1. Desde el detalle del ticket, cualquier participante sube un archivo (`useUploadAttachment`), que se envía como base64 y se guarda en el bucket `attachments` bajo `requests/{requestId}/...`.
2. Los adjuntos se listan siempre con **URLs firmadas temporales** generadas al vuelo (nunca se expone la ruta interna del bucket).

### Definir y revisar criterios de aceptación
1. Al crear el ticket se exige mínimo un criterio de aceptación (ver módulo 1); después se pueden agregar, editar el título o eliminar más criterios desde el detalle.
2. Un revisor marca cada criterio como `accepted` o `rejected` (o lo vuelve a `pending`); cada cambio de estado (menos a `pending`) notifica a los resolutores asignados, excluyendo a quien revisó.
3. Todo alta, edición, cambio de estado y baja de un criterio queda en el historial de auditoría del ticket.

### Cerrar (o avanzar) un ticket con evidencia
1. Al mover una tarjeta hacia una columna marcada como "requiere evidencia" (`TBL_Team_Column_Config.Evidence_Required`), se abre `ClosureModal` en vez de mover directo.
2. El modal **bloquea la confirmación en el cliente** si quedan criterios de aceptación en estado `pending` — hay que aceptarlos o rechazarlos todos antes de poder cerrar.
3. El usuario escribe una nota obligatoria y, en el modo "Subir nueva", hasta 5 archivos (las imágenes se comprimen en el navegador si superan 2 MB). Si el ticket ya tenía un cierre previo con adjuntos (por ejemplo, viene de una reapertura), puede en cambio elegir **"Reutilizar"** (clona los adjuntos del cierre anterior hacia el nuevo registro) o **"No reutilizar"** (avanza solo con la nota, sin adjuntos).
4. Al confirmar (`closeRequest`), se crea una fila en `TBL_Request_Closure`, se mueve el ticket a la columna destino, y si esa columna es de cierre se sella `Request_Finished_At`/progreso 100. Se notifica a resolutores + solicitante y, si la columna destino es la de revisión del cliente, se dispara el correo correspondiente.

### Aprobar o rechazar el cierre (feedback del cliente)
1. Cuando el ticket llega a la columna "Cliente Review", el solicitante ve un banner (`ClientReviewBanner`) con la evidencia de cierre y dos opciones: **aprobar** o **rechazar** (pidiendo ajustes), con una nota opcional.
2. Al enviar (`submitClientFeedback`), el ticket se mueve automáticamente: a `ready_to_deploy` si aprueba, o de vuelta a `en_revision_qas` si rechaza. Se notifica a los resolutores y se envía un correo con un "stepper" visual que refleja el nuevo estado.
3. Solo se admite **un feedback por cada cierre registrado**: si ya se envió feedback para el ciclo de cierre actual, hay que reabrir el ticket (moverlo y volver a cerrarlo) para poder enviar uno nuevo.
4. Si quien aprueba es el propio solicitante original, al aprobar se le pide además una **calificación de la resolución** (`ResolutionRatingModal`): dos puntajes de 1 a 5 (solución y atención recibida) más un comentario opcional.

### Consultar el historial de auditoría
1. Desde el detalle del ticket, un usuario autorizado abre `RequestHistoryModal`, que lista cronológicamente cada cambio: creación, ediciones de campo (incluidas las de `Form_Data`), movimientos de columna, cierres, reaperturas y altas/bajas/cambios de estado de criterios — cada entrada con quién la hizo y cuándo.
2. El acceso está restringido: solo lo ve un `admin`, o un usuario que **supervise** alguno de los sub-equipos a los que está enrutado el ticket (`TBL_Sub_Team_Supervisors`); cualquier otro usuario recibe un error `FORBIDDEN`.

### Medir el tiempo trabajado (timer flotante)
1. Un resolutor puede iniciar un cronómetro para un ticket desde el detalle; aparece como un widget flotante y arrastrable (`FloatingTimer`) que sigue visible aunque se navegue a otra pantalla.
2. Solo puede haber **un timer corriendo a la vez**: iniciar uno nuevo pausa automáticamente el anterior.
3. Al presionar "Guardar", el tiempo acumulado (en horas) se suma a `Request_Logged_Hours` del ticket (vía `updateRequest`) y el cronómetro se reinicia.

### Calificar la experiencia con el equipo resolutor
- Cubierto arriba, dentro del flujo de aprobación de feedback: `ResolutionRatingModal` califica la **resolución de un ticket puntual** (solución + atención, 1–5) y queda asociada a los resolutores que lo atendieron en ese momento (snapshot).
- Existe además un `SatisfactionModal` (`src/components/layout/SatisfactionModal.tsx`), accesible desde la barra lateral, que **no** es una calificación de un ticket sino una encuesta general de satisfacción con la app PRISMA (acción `createSatisfactionRating`); su detalle funcional pertenece al módulo `documentacion/modulos/12-sistema-y-soporte.md`, se menciona aquí solo para no confundirlo con `ResolutionRatingModal`.

## Arquitectura técnica

### Frontend
- **Página**: `src/pages/TicketPage.tsx` — resuelve un ticket por deep-link (`useTicketResolver`) y decide si mostrar el `RequestModal` completo (kanban) o una variante de solo lectura (`HomeRequestModal`) según si el rol del usuario puede ver el board de origen.
- **Componente hub**: `src/features/requests/components/RequestModal.tsx` reúne comentarios, adjuntos, criterios, participantes, banner de revisión del cliente, historial de cierres/feedback y el botón de historial de auditoría.
- **Sub-componentes**: `ClosureModal.tsx` (evidencia de cierre/avance), `ClientReviewBanner.tsx` (aprobar/rechazar), `ResolutionRatingModal.tsx` (calificación de resolución), `RequestHistoryModal.tsx` (timeline de auditoría, con `ACTION_META` mapeando cada `HistoryAction` a un ícono/verbo), `RequestTimelines.tsx` (`CierreBanner`/`CierreTimeline`/`FeedbackTimeline`, el render de las evidencias y el feedback dentro del cuerpo del ticket), y en `components/mentions/`: `CommentComposer.tsx` (editor Tiptap con `@mención`), `CommentText.tsx` (render del texto con menciones resaltadas), `MentionList.tsx` (dropdown de sugerencias), `ParticipantsPanel.tsx` (avatares de solicitante/resolutores/mencionados, con revocación).
- **Timer**: `src/store/timerStore.ts` (estado persistido en `localStorage`, un solo timer activo a la vez, con heartbeat para no perder progreso si se cierra el navegador) y `src/components/layout/FloatingTimer.tsx` (widget flotante y arrastrable que lo consume).
- **Hooks**: `useComments.ts`, `useAttachments.ts`, `useAcceptanceCriteria.ts` (con actualización optimista y sincronización del `criteriaSummary` — el contador que se ve en la tarjeta del tablero — hacia todas las cachés relevantes), `useCloseRequest.ts`, `useClientFeedback.ts`, `useRequestHistory.tsx`, `useTicketResolver.ts` (decide `kanban` vs `home` vs `not_found` vs `loading`).

### Backend (Edge Function)

| Acción | Descripción | Parámetros clave / reglas no obvias | Tablas |
|---|---|---|---|
| `fetchComments` | Lista comentarios de un ticket con su autor. | — | `TBL_Comments` |
| `createComment` | Crea un comentario y re-valida las menciones server-side. | `{ requestId, userId, text, mentionedUserIds? }`. Reglas de mención: confidencial+no-admin → ninguna; admin → todas; no-admin → solo TI (`Department_ID=7`) o su propio departamento; nunca auto-mención. | `TBL_Comments`, `TBL_Comment_Mentions`, `TBL_Request_Participants` |
| `deleteComment` | Borra un comentario por ID. | No valida autoría/rol de quien borra. | `TBL_Comments` |
| `fetchRequestParticipants` | Lista participantes de un ticket. | Devuelve `User_Name`/`Avatar` vacíos a propósito: el frontend los resuelve con su lista de usuarios ya cargada. | `TBL_Request_Participants` |
| `removeParticipant` | Revoca a un participante. | Exige que `actorId` sea `admin` o un resolutor asignado al ticket; si no, lanza "No autorizado". | `TBL_Request_Participants`, `TBL_Requests_Assignments` |
| `fetchAttachments` | Lista adjuntos con URL firmada temporal por archivo. | Si falla la firma de uno, ese adjunto queda con URL `null` en vez de tumbar toda la respuesta. | `TBL_Attachments` |
| `uploadAttachment` | Sube un archivo (base64→bytes) al bucket `attachments` y registra la fila. | Ruta `requests/{requestId}/{timestamp}_{fileName}`, `upsert:false`. | `TBL_Attachments` |
| `deleteAttachment` | Borra archivo de storage + fila. | | `TBL_Attachments` |
| `fetchAcceptanceCriteria` | Lista criterios de un ticket. | | `TBL_Acceptance_Criteria` |
| `createAcceptanceCriteria` | Crea un criterio en `pending`. | Registra `criterion_added` en el historial. | `TBL_Acceptance_Criteria`, `TBL_Requests_History` |
| `updateAcceptanceCriteriaStatus` | Cambia estado (`accepted`/`rejected`/`pending`). | Fija/limpia `Reviewed_At` según el estado; notifica a resolutores (menos a quien revisó) si el estado deja de ser `pending`; registra `criterion_status` solo si hubo cambio real. | `TBL_Acceptance_Criteria`, `TBL_Notifications`, `TBL_Requests_History` |
| `deleteAcceptanceCriteria` | Elimina un criterio. | Hace *prefetch* de `Request_ID`/`Title` antes de borrar (los necesita para el historial, y después de borrar ya no están disponibles). | `TBL_Acceptance_Criteria`, `TBL_Requests_History` |
| `updateCriteriaTitle` | Edita el título de un criterio. | Solo registra `criterion_edited` si el título cambió. | `TBL_Acceptance_Criteria`, `TBL_Requests_History` |
| `closeRequest` | Cierra/avanza el ticket con evidencia (`new`/`reuse`/`skip`). | En `reuse`, clona filas de `TBL_Closure_Attachments` del cierre indicado (`reuseFromClosureId`) hacia el nuevo `Closure_ID`. **No valida** que los criterios de aceptación estén todos revisados (esa validación solo existe en `ClosureModal.tsx`). | `TBL_Request_Closure`, `TBL_Closure_Attachments`, `TBL_Requests`, `TBL_Requests_History` |
| `fetchClosureAttachments` | Lista adjuntos de un cierre con URL firmada. | | `TBL_Closure_Attachments` |
| `uploadClosureAttachment` | Sube un archivo de evidencia y lo asocia a un cierre. | Ruta `closures/{requestId}/{timestamp}_{fileName}`. | `TBL_Closure_Attachments` |
| `fetchClientFeedback` | Lista el historial de feedback del cliente de un ticket. | Orden descendente por fecha. | `TBL_Client_Feedback` |
| `submitClientFeedback` | Registra el veredicto del cliente y mueve el ticket. | **Regla de ciclo**: si `count(feedback) >= count(cierres)`, rechaza con error pidiendo reabrir y volver a cerrar. Mueve el ticket a `targetColumnId` directamente (sin pasar por `isCloseColumn`/lógica de `moveToColumn`). | `TBL_Client_Feedback`, `TBL_Requests`, `TBL_Notifications` |
| `fetchResolutionRatings` | Lista todas las calificaciones de resolución (uso administrativo/reportes). | Aplana el snapshot de resolutores embebido. | `TBL_Resolution_Ratings`, `TBL_Resolution_Rating_Resolvers` |
| `submitResolutionRating` | Registra una calificación de resolución con snapshot de resolutores. | Valida que ambos puntajes estén 1–5 (mensaje más claro que el `CHECK` de la base). El snapshot evita que el registro cambie si el ticket se reasigna después. | `TBL_Resolution_Ratings`, `TBL_Resolution_Rating_Resolvers` |
| `fetchRequestHistory` | Lista el historial de auditoría de un ticket. | Gating de acceso: admin siempre; si no, debe supervisar (`TBL_Sub_Team_Supervisors`) algún sub-equipo del ticket, si no lanza `FORBIDDEN`. Es de los pocos handlers de todo el proyecto con control de autorización explícito y granular. | `TBL_Requests_History`, `TBL_Request_Sub_Team`, `TBL_Sub_Team_Supervisors` |

Utilidades compartidas: `supabase/functions/api/lib/history.ts` (`logHistory`, `diffFields`, `diffFormData` — el motor de auditoría, *best-effort*: si falla la inserción del historial, solo lo loguea y no interrumpe la operación principal) y `supabase/functions/api/shared/criteria.ts` (`attachCriteriaSummary`, agrega el conteo de criterios a los listados de tickets para pintar el badge en la tarjeta del tablero).

### Tablas de base de datos involucradas

- `TBL_Comments` / `TBL_Comment_Mentions` — comentarios y sus menciones.
- `TBL_Request_Participants` — acceso durable de mencionados (y otros orígenes) a un ticket.
- `TBL_Attachments` — adjuntos generales del ticket.
- `TBL_Acceptance_Criteria` — criterios de aceptación y su estado de revisión.
- `TBL_Request_Closure` / `TBL_Closure_Attachments` — registros de cierre/avance con evidencia y sus archivos.
- `TBL_Client_Feedback` — veredictos del cliente (aprobado/rechazado) por ciclo de cierre.
- `TBL_Resolution_Ratings` / `TBL_Resolution_Rating_Resolvers` — calificación de la resolución y snapshot de quién la atendió.
- `TBL_Requests_History` — auditoría de todos los cambios del ticket.
- `TBL_Sub_Team_Supervisors` — usados solo para autorizar el acceso al historial.
- `TBL_Notifications`, `TBL_Email_Logs` — efectos colaterales de notificación (detalle en el módulo de sistema/soporte).

El detalle completo de columnas de cada tabla está en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- Las reglas de mención se **re-validan siempre en el servidor** al crear un comentario, sin confiar en la lista que mandó el cliente — es de los pocos puntos del módulo con una autorización de negocio explícita y bien acotada.
- Un ticket confidencial oculta el contenido real en los correos de comentario y de feedback del cliente (se avisa que hay novedad, pero no se incluye el texto); esto es una decisión tomada en los helpers de correo (`shared/requests.ts`), no en la base de datos.
- El cierre exige siempre una nota (`Closure_Note`); los adjuntos son opcionales salvo que se elija "Reutilizar" evidencia previa, en cuyo caso los archivos ya existen y se clonan por referencia.
- El feedback del cliente está limitado a **uno por ciclo de cierre**: la cuenta de `TBL_Client_Feedback` no puede igualar o superar la de `TBL_Request_Closure` para el mismo ticket sin pasar antes por una reapertura y un nuevo cierre.
- Aprobar el feedback mueve el ticket a `ready_to_deploy`; rechazarlo lo regresa a `en_revision_qas` — este mapeo está hardcodeado en el frontend (`useClientFeedback.ts`), no proviene de configuración.
- La calificación de resolución solo se ofrece cuando quien aprueba el feedback es el **mismo usuario que solicitó** el ticket (`currentUser.User_ID === effectiveRequest.solicitanteId`); un aprobador distinto del solicitante original nunca ve el modal de calificación.
- El timer de trabajo es enteramente **client-side**: no existe una tabla de sesiones de tiempo en el backend. El único rastro que llega al servidor es la suma acumulada de horas cuando el usuario presiona "Guardar" (patch a `Request_Logged_Hours`).

## Automatizaciones y efectos secundarios

- **Notificaciones in-app** (`TBL_Notifications`): `mention` (a cada mencionado válido), `comment` (a resolutores + solicitante, excluyendo autor y mencionados), `criteria_reviewed` (a resolutores al aceptar/rechazar un criterio), `closure` (al cerrar con evidencia), `client_approved`/`client_rejected` (al recibir feedback del cliente).
- **Correos transaccionales** (siempre *best-effort*, nunca tumban la operación principal): `createComment` (con ventana anti-spam de 15 minutos por destinatario/ticket), `movido_client_review` (también disparado desde `closeRequest`, reutilizando el mismo helper que usa `moveToColumn`), `submitClientFeedback` (con un "stepper" visual que cambia de color/paso según aprobación o rechazo).
- **Sincronización de badge de criterios**: cada mutación de criterios recalcula `criteriaSummary` y lo propaga a todas las cachés de React Query que puedan tener ese ticket (tablero, listas planas, detalle) sin esperar a un refetch — ver `useAcceptanceCriteria.ts` (`syncCriteriaSummary`).
- **Snapshot de resolutores** al calificar: `submitResolutionRating` guarda una copia de quiénes eran los resolutores asignados en el momento de calificar, para que reasignar el ticket después no altere retroactivamente a quién se refiere una calificación histórica.

## Puntos frágiles / riesgos conocidos

- **El gate de "criterios sin contestar" antes de cerrar es solo de frontend**: `ClosureModal.tsx` bloquea el botón "Confirmar" si hay criterios `pending`, pero el handler `closeRequest` (`supabase/functions/api/handlers/closure.ts`) no repite esa validación — una llamada directa a la Edge Function (o un bug futuro en el modal) podría cerrar un ticket con criterios de aceptación sin revisar.
- **`deleteComment` no valida autoría ni rol**: cualquier usuario autenticado que conozca un `commentId` puede borrarlo (`handlers/comments.ts`); a diferencia de `removeParticipant`, que sí exige ser admin o resolutor asignado.
- **El timer no tiene respaldo en el servidor**: si el navegador se cierra sin guardar (o se limpia `localStorage`), el tiempo acumulado en el ticket se pierde sin dejar rastro; tampoco hay forma de auditar cuánto tiempo estuvo realmente corriendo un timer, ni de ver el trabajo de un resolutor desde otro dispositivo.
- **El historial de auditoría es *best-effort***: `logHistory` solo loguea en consola si la inserción falla, no reintenta ni alerta; un fallo transitorio de la base puede dejar huecos silenciosos en el timeline de un ticket sin que nadie se entere.
- **`fetchResolutionRatings` no filtra por nada**: devuelve *todas* las calificaciones de resolución de todos los tickets sin paginar ni acotar por equipo/board, a diferencia de casi todos los demás listados del proyecto.
- **Inconsistencia de autorización entre handlers de este mismo módulo**: `fetchRequestHistory` valida explícitamente rol/supervisión antes de devolver datos, mientras que `fetchComments`, `fetchAttachments`, `fetchAcceptanceCriteria`, `fetchClientFeedback` y `submitClientFeedback` no comprueban en absoluto que quien llama tenga relación con el ticket — dependen enteramente de que el frontend no ofrezca la acción fuera de contexto.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchComments` | Lista comentarios de un ticket. | `handlers/comments.ts` |
| `createComment` | Crea un comentario, valida menciones y notifica. | `handlers/comments.ts` |
| `deleteComment` | Elimina un comentario. | `handlers/comments.ts` |
| `fetchRequestParticipants` | Lista participantes de un ticket. | `handlers/comments.ts` |
| `removeParticipant` | Revoca a un participante (admin o resolutor asignado). | `handlers/comments.ts` |
| `fetchAttachments` | Lista adjuntos con URL firmada. | `handlers/attachments.ts` |
| `uploadAttachment` | Sube un adjunto general. | `handlers/attachments.ts` |
| `deleteAttachment` | Elimina un adjunto. | `handlers/attachments.ts` |
| `fetchAcceptanceCriteria` | Lista criterios de aceptación. | `handlers/criteria.ts` |
| `createAcceptanceCriteria` | Crea un criterio. | `handlers/criteria.ts` |
| `updateAcceptanceCriteriaStatus` | Cambia el estado de un criterio. | `handlers/criteria.ts` |
| `deleteAcceptanceCriteria` | Elimina un criterio. | `handlers/criteria.ts` |
| `updateCriteriaTitle` | Edita el título de un criterio. | `handlers/criteria.ts` |
| `closeRequest` | Cierra/avanza un ticket con evidencia. | `handlers/closure.ts` |
| `fetchClosureAttachments` | Lista adjuntos de un cierre. | `handlers/closure.ts` |
| `uploadClosureAttachment` | Sube evidencia de cierre. | `handlers/closure.ts` |
| `fetchClientFeedback` | Lista el historial de feedback del cliente. | `handlers/feedback.ts` |
| `submitClientFeedback` | Registra el veredicto del cliente y mueve el ticket. | `handlers/feedback.ts` |
| `fetchResolutionRatings` | Lista todas las calificaciones de resolución. | `handlers/resolutionRatings.ts` |
| `submitResolutionRating` | Registra una calificación de resolución. | `handlers/resolutionRatings.ts` |
| `fetchRequestHistory` | Lista el historial de auditoría (con control de acceso). | `handlers/history.ts` |
