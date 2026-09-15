# Módulo: Integración SOLVI

## Resumen

SOLVI es un sistema externo de mesa de ayuda con SLA ("ANS") propio, categorías/subcategorías/artículos gestionados en listas de SharePoint y un pool de técnicos resolutores. **No es el motor de tickets de PRISMA**: es un sistema paralelo que "se opera en su propia aplicación" (comentario textual en `SolviRequestPage.tsx`); PRISMA solo le agrega, dentro de la misma app, (a) un formulario para levantar solicitudes con asignación automática de resolutor y cálculo de fecha límite por SLA, y (b) una bandeja de solo lectura para que TI monitoree, busque y comente esos tickets sin salir de PRISMA. Los tickets viven en tablas propias (`TBL_Ticket_Solvi`, `TBL_Seguimientos_Solvi`, `TBL_Ticket_Attachments_Solvi`), completamente separadas del board Kanban de PRISMA (`TBL_Requests`). Sobre esas tablas, PRISMA superpone su propio sistema de comentarios/menciones/participantes (`TBL_Solvi_*`), paralelo pero independiente del de tickets normales. Es también el único módulo de la app cuya ruta de escritura principal (creación de ticket, subida de adjuntos) no pasa por la Edge Function central, sino que escribe directo a Supabase desde el navegador.

## Flujos de usuario

- **Cualquier usuario autenticado (incluye `client`)** — `/integracion/solvi`: completa un formulario corto (título, categoría → subcategoría → artículo en cascada, descripción, hasta 5 adjuntos) para levantar una solicitud SOLVI. No requiere rol de TI: es una alternativa a `/new` para este tipo de solicitud. Al enviar, PRISMA resuelve el ANS/SLA aplicable, asigna un resolutor automáticamente y notifica a solicitante y resolutor.
- **Solo `admin` / `ti_member`** (`RequireTI`) — `/integracion/solvi/tickets`: bandeja tipo planilla (similar a `TasksPage`) con scroll infinito sobre potencialmente miles de tickets, búsqueda global server-side, columnas redimensionables y congeladas. Al hacer clic en una fila se abre el detalle como overlay.
- **Cualquier usuario autenticado con el ID/enlace** — `/integracion/solvi/tickets/:ticketId`: overlay de detalle (`SolviTicketModal`) con tabs *Detalle* (campos del ticket + línea de tiempo de "seguimientos" nativos de SOLVI + sus adjuntos), *Comentarios* (capa propia de PRISMA, con menciones y participantes) y *Adjuntos* (los que se suben desde PRISMA). Esta ruta **no exige `RequireTI`** — solo autenticación — por lo que un usuario `client` puede ver el detalle de su propio ticket si llega al ID por un enlace directo, desde "Mis solicitudes" (`ClientRequestsPage`, vía `fetchMySolviTickets` por correo) o desde "Mis menciones" (`MyMentionsPage`, vía `fetchMySolviMentions`), aunque no pueda navegar la bandeja completa.
- **Comentar/adjuntar dentro del detalle**: solo puede hacerlo quien coincide por correo con el solicitante o el resolutor del ticket, quien ya haya sido agregado como participante (por mención), o un `admin`. Un ticket "cerrado"/"resuelto" (por texto libre en `ticket_solvi_estado`) bloquea comentarios y adjuntos nuevos para todos.
- **Revocar un participante**: solo un `admin` (el concepto de "resolutor" no sirve de autoridad aquí porque en SOLVI el resolutor es texto libre, no un `User_ID`).

### Patrón de "modal como ruta superpuesta"

Igual que el detalle de ticket normal (`TicketPage`), el detalle SOLVI se navega con `state: { backgroundLocation: location }` (ver `src/App.tsx`). Cuando existe `backgroundLocation`, el `<Routes>` principal sigue renderizando la página de fondo (la bandeja, "Mis solicitudes", el Home, etc.) en esa ubicación, y un segundo árbol de rutas (`TicketOverlayRoutes`, sin `AppLayout`) monta `SolviTicketOverlay` encima como modal `position: fixed`. Si se entra por URL directa (sin `backgroundLocation`, p. ej. un bookmark), la misma ruta (`integracion/solvi/tickets/:ticketId`, declarada también dentro del layout normal) sirve el modal solo, sobre un layout vacío. `SolviTicketModal` expone además "Copiar enlace" para compartir ese deep link.

## Arquitectura técnica

### Frontend

- **Páginas**: `src/pages/integrations/SolviRequestPage.tsx` (creación) y `src/pages/integrations/SolviTicketsPage.tsx` (bandeja + overlay routing vía `ticketId` de `useParams`).
- **Subcomponentes de la página de creación**: `src/features/requests/components/SolviRequestPageComponents.tsx` (tarjetas del formulario: solicitud, cascada de categoría, descripción, adjuntos, pantallas de éxito/error) y `SolviRequestFormControls.tsx`.
- **Modal de detalle**: `src/features/requests/components/SolviTicketModal.tsx` — de solo lectura para los campos nativos del ticket; sanea el HTML de `ticket_solvi_descripcion`/descripciones de seguimientos con un sanitizador propio y básico (`sanitizeHtml`, sin dependencias — el propio código deja la nota de que si se necesita robustez real contra XSS habría que migrar a DOMPurify).
- **Hooks de datos**: `src/features/requests/hooks/useSolviTickets.ts` (listado paginado con `useInfiniteQuery`, preview, detalle, adjuntos), `useSolviComments.ts`, `useSolviParticipants.ts`, `useMySolviTickets.ts` (tickets/menciones propias), `useSolviCategorias.ts` / `useSolviSubcategorias.ts` / `useSolviArticulos.ts` / `useSolviAns.ts` (árbol de clasificación y SLA, leído de SharePoint).
- **Orquestación de creación**: `src/features/requests/hooks/useSolviActions.ts` (`useSolviActionsTickets`) — arma el ticket, decide el resolutor, calcula la fecha máxima de solución y sube adjuntos.
- **Servicios de dominio** (`src/features/requests/services/`): `SolviBusinessDate.service.ts` (turno nocturno, fecha de solución según SLA/horas hábiles), `SolviTicketAssignment.service.ts` (técnico con menos casos activos), `SolviShifts.service.ts` (disponibilidad vía Microsoft Teams Shifts), `SolviAttachments.service.ts` (subida directa a Storage), `SolviTicketNotifications.service.ts` (correos de creación/comentario), y los `*SharepointSolvi.service.ts` (categorías, subcategorías, artículos, ANS y técnicos, todos leídos de listas de SharePoint vía `GraphRest`).
- **Estilos**: `src/styles/solvi.css` — hoja dedicada (namespace `solvi-*`, ~386 líneas) que calca visualmente `tasks.css` pero con su propio acento de color (tomado de `Board_Team_Color` del equipo cuya `Board_Team_Integration_Key === 'solvi'`).
- **Guard de ruta**: `RequireTI` (`src/App.tsx`), basado en `canSeeBoard()` (`src/auth/roles.ts`: `admin` o `ti_member`), aplicado solo a la ruta de bandeja `/integracion/solvi/tickets`, no a la de creación ni al overlay de detalle.

### Backend (Edge Function)

Handler: `supabase/functions/api/handlers/solvi.ts` (`solviHandlers`). Registrado en `router.ts`.

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchSolviTickets` | Lista paginada (keyset por `ticket_solvi_fechaapertura` + `ticket_solvi_id` desc, tamaño 300, tope 500) con búsqueda global opcional (`ilike` sobre título/solicitante/resolutor/categoría, más match exacto por ID si el término es numérico). | Pide un registro de más para saber si hay página siguiente. |
| `fetchSolviTicketDetail` | Trae el ticket completo + sus `seguimientos` (orden cronológico) + adjuntos del ticket y de sus seguimientos, con signed URLs (30 min) generadas *best-effort* por adjunto. | Si el bucket/path no resuelve, deja `signedUrl: null` (degradación elegante); usa bucket fijo `ticket-attachments` como fallback si `storage_bucket` viene null. |
| `fetchSolviComments` | Lista los comentarios PRISMA (`TBL_Solvi_Comments`) de un ticket, con autor embebido. | Distintos de los `seguimientos` nativos. |
| `createSolviComment` | Crea un comentario con gate de autorización y validación de menciones server-side. | Ver reglas de negocio abajo. |
| `deleteSolviComment` | Borra un comentario por `commentId`. | Sin verificación de autoría en el propio handler (ver riesgos). |
| `fetchSolviParticipants` | Lista participantes de un ticket (`User_ID`, `Added_Via`, `Added_By`); nombre/avatar vienen vacíos, los resuelve el front contra su lista de usuarios. | Igual patrón que participantes de tickets normales. |
| `removeSolviParticipant` | Revoca un participante. | Solo `admin` (no hay "resolutor" validable por `User_ID` en SOLVI). |
| `fetchMySolviMentions` | Tickets SOLVI donde el usuario fue mencionado (vía `TBL_Solvi_Participants` con `Added_Via = 'mention'`). | Alimenta "Mis menciones". |
| `fetchMySolviTickets` | Tickets abiertos por un usuario, buscados por su correo (`ilike` + filtro extra en memoria por `trim`, porque `ilike` no recorta espacios al borde). | Alimenta "Mis solicitudes". |
| `fetchTicketAttachments` | Adjuntos directos de un ticket (`id_ticket`), sin generar signed URLs. | Versión liviana de `fetchSolviTicketDetail`; ver duplicidad con la versión "directa a Supabase" del frontend, en riesgos. |

No existe un handler `uploadSolviAttachment` en la Edge Function (ver Puntos frágiles): la subida real ocurre fuera de este flujo.

### Tablas de base de datos involucradas

- `TBL_Ticket_Solvi` — el ticket SOLVI en sí (título, estado, fuente, solicitante/resolutor por nombre y correo, categoría/subcategoría/artículo, ANS, fechas de apertura/máxima/cierre). Sin flag de confidencialidad.
- `TBL_Seguimientos_Solvi` — línea de tiempo de acciones del ticket (tipo de acción, fecha, descripción, actor); solo lectura desde PRISMA (no hay handler para crearlos/editarlos), consistente con ser el log nativo del sistema SOLVI.
- `TBL_Ticket_Attachments_Solvi` — adjuntos, ligados a un ticket y opcionalmente a un seguimiento puntual.
- `TBL_Solvi_Comments` — comentarios que el equipo agrega desde PRISMA sobre un ticket SOLVI (capa propia, no viene de SOLVI).
- `TBL_Solvi_Comment_Mentions` — menciones dentro de esos comentarios.
- `TBL_Solvi_Participants` — acceso durable al ticket (por mención o asignación manual), usado tanto para el gate de comentarios como para "Mis menciones".
- `TBL_Users` — para resolver autor/mencionado y para el gate de rol (`admin`).
- `TBL_Board_Teams` — de aquí sale el color de acento (`Board_Team_Color`) del equipo con `Board_Team_Integration_Key = 'solvi'`.

(Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.)

## Reglas de negocio y validaciones clave

- **Asignación automática de resolutor** (`useSolviActionsTickets.saveTicket` → `assignResolutor`): fuera de horario laboral (17:00–7:00, turno nocturno) se prioriza a quien esté activo ahora mismo en Teams Shifts (`fetchPersonaDisponibleAhora`); si no hay nadie en turno o falla esa consulta, o si es horario laboral, se asigna al técnico con **menos casos activos** (`pickTecnicoConMenosCasos`, lista de SharePoint) y se le incrementa `Numerodecasos` en 1 como efecto secundario.
- **SLA / fecha máxima de solución**: se calcula con `calcularFechaSolucion(horasEfectivas)`, usando las horas del ANS resuelto para la combinación categoría/subcategoría/artículo elegida, o `DEFAULT_SLA_HORAS` si no hay ANS aplicable (p. ej. subcategoría sin artículos, resuelto por categoría+subcategoría solamente).
- **Gate de comentarios/adjuntos** (`createSolviComment`, y replicado en el frontend para adjuntos): puede comentar quien sea `admin`, quien coincida por **correo** (no `User_ID`) con `ticket_solvi_correo_solicitante` o `ticket_solvi_correo_resolutor`, o quien ya conste como participante. Nunca se permite comentar/adjuntar si el estado del ticket (texto libre) contiene "cerrado" o "resuelto".
- **Menciones sin confidencialidad**: a diferencia de los comentarios de tickets normales (`comments.ts::createComment`, que primero chequean `Request_Is_Confidential` y bloquean toda mención si el ticket es confidencial y el autor no es admin), SOLVI no tiene ese concepto — la única regla es de departamento: un `admin` puede mencionar a cualquiera; un no-admin solo puede mencionar a TI (`Department_ID === 7`) o a su propio departamento; nunca auto-mención. Las menciones permitidas se persisten y además dan acceso durable como participante (`Added_Via: 'mention'`, upsert idempotente).
- **Revocar participante**: solo `admin` puede hacerlo (`removeSolviParticipant`); el comentario en el propio código deja explícito que no se puede usar "resolutor" como autoridad alternativa porque en SOLVI el resolutor es un string, no un `User_ID` referenciable.
- **Bandeja restringida, detalle no tanto**: la ruta de listado (`/integracion/solvi/tickets`) exige `RequireTI`; la ruta de detalle por ID no. La autorización real para *ver* un ticket puntual queda, en la práctica, en "si sabés el ID/tenés el link" — el handler `fetchSolviTicketDetail` no valida que quien pregunta sea el solicitante, el resolutor o TI.

## Automatizaciones y efectos secundarios

- Al crear un ticket: notificación a solicitante y resolutor (`notifyTicketCreatedSolicitante` / `notifyTicketCreatedResolutor`), cada envío aislado en su propio `try/catch` (un fallo notificando a uno no bloquea al otro ni la creación del ticket).
- Al crear un comentario con menciones válidas: alta idempotente de esos usuarios como participantes + notificación (`notifySolviCommentActivity`, invocada desde `SolviTicketModal` tras crear el comentario, no desde el handler — ver riesgos).
- Incremento de `Numerodecasos` del técnico elegido en SharePoint como parte de la asignación automática (efecto secundario persistente fuera de Supabase).
- Signed URLs de adjuntos con vigencia de 30 minutos, regeneradas en cada `fetchSolviTicketDetail` (no se cachean ni se reutilizan).

## Puntos frágiles / riesgos conocidos

- **La creación de tickets y la subida de adjuntos de SOLVI no pasan por la Edge Function.** `useSolviActionsTickets.saveTicket` (`src/features/requests/hooks/useSolviActions.ts:243-257`) hace `supabase.from('TBL_Ticket_Solvi').insert(...)` directo desde el navegador, y `SolviAttachments.service.ts` (`uploadSolviAttachment`) sube el archivo a Storage e inserta en `TBL_Ticket_Attachments_Solvi` también directo. Esto contradice el principio general de la app ("el frontend nunca habla directamente con Supabase", comentario en `src/lib/apiClient.ts:2-3`) y significa que, para este flujo, la única barrera de seguridad real son las políticas RLS de esas tablas — el gate de negocio de `createSolviComment`/`canComment` **no aplica** a la creación de adjuntos.
- **`uploadSolviAttachment` existe duplicado y divergente.** `src/features/requests/hooks/useSolviTickets.ts` define un hook `useUploadSolviAttachment` que llama `apiClient.call('uploadSolviAttachment', …)`, pero **no existe ningún handler con ese nombre de acción** en `solvi.ts` ni en ningún otro módulo (`router.ts` no lo registra) — invocarlo lanzaría `Acción desconocida`. El flujo realmente usado por `SolviTicketModal` es el directo a Supabase (`useSolviActionsTickets().uploadSolviAttachment`, vía `SolviAttachments.service.ts`). El hook basado en `apiClient` parece código muerto/obsoleto de un rediseño anterior.
- **`fetchTicketAttachments` también está duplicado.** Existe como acción de la Edge Function (`solvi.ts`) y, por separado, como función suelta (`fetchTicketAttachments` en `src/features/requests/hooks/useSolviTickets.ts:200-211`) que consulta Supabase directamente con el mismo nombre. `SolviTicketModal` usa la versión directa a Supabase, no la de la API.
- **`deleteSolviComment` no valida autoría.** El handler (`solvi.ts:348-353`) borra el comentario por `commentId` sin comprobar que quien pide el borrado sea su autor o un admin; el único control es que el botón de borrar solo aparece en el frontend para comentarios propios (`isOwn` en `SolviTicketModal.tsx:379`).
- **Notificación de comentario es responsabilidad del cliente, no del servidor.** `createSolviComment` deja explícito en su comentario que las notificaciones "quedan pendientes para la Entrega 2"; en la práctica, `SolviTicketModal.tsx` las dispara desde el frontend (`notifySolviCommentActivity`) después de que la mutación resuelve — si el usuario cierra la pestaña justo después de comentar, la notificación puede no llegar a enviarse.
- **Ruta de detalle sin gate de rol/pertenencia.** Como se indica arriba, `integracion/solvi/tickets/:ticketId` solo exige sesión autenticada, no `RequireTI` ni verificación de que el usuario tenga relación con ese ticket — la protección depende de que el ID no se filtre.
- **`SolviTicketModal` renderiza HTML con un sanitizador casero.** `sanitizeHtml` (`SolviTicketModal.tsx:28-37`) es una limpieza por regex (quita `script`/`style`/`iframe`, atributos `on*`, `javascript:`), no una librería probada como DOMPurify; el propio comentario en el código lo señala como "limpieza conservadora".

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchSolviTickets` | Lista paginada (keyset) de tickets SOLVI con búsqueda global. | `supabase/functions/api/handlers/solvi.ts` |
| `fetchSolviTicketDetail` | Detalle completo: ticket + seguimientos + adjuntos con signed URLs. | `supabase/functions/api/handlers/solvi.ts` |
| `fetchSolviComments` | Lista los comentarios PRISMA de un ticket SOLVI. | `supabase/functions/api/handlers/solvi.ts` |
| `createSolviComment` | Crea un comentario, valida gate de acceso y menciones. | `supabase/functions/api/handlers/solvi.ts` |
| `deleteSolviComment` | Elimina un comentario por ID. | `supabase/functions/api/handlers/solvi.ts` |
| `fetchSolviParticipants` | Lista participantes de un ticket SOLVI. | `supabase/functions/api/handlers/solvi.ts` |
| `removeSolviParticipant` | Revoca un participante (solo admin). | `supabase/functions/api/handlers/solvi.ts` |
| `fetchMySolviMentions` | Tickets SOLVI donde el usuario fue mencionado. | `supabase/functions/api/handlers/solvi.ts` |
| `fetchMySolviTickets` | Tickets SOLVI abiertos por el usuario (por correo). | `supabase/functions/api/handlers/solvi.ts` |
| `fetchTicketAttachments` | Adjuntos de un ticket, sin signed URLs. | `supabase/functions/api/handlers/solvi.ts` |
