# Base de datos: mapeo de tablas

## Cómo leer este documento

PRISMA usa **Supabase** (PostgreSQL) como base de datos. Todas las tablas de
aplicación siguen la convención de nombre `TBL_NombreTabla`, y casi todas sus
columnas están en `PascalCase` (algunas requieren comillas dobles en SQL/PostgREST
porque empiezan con mayúscula o tienen guiones bajos internos, p. ej.
`"Is_Active"`). Un puñado de tablas más nuevas o de integraciones externas
(`TBL_Announcements`, `TBL_Ticket_Solvi` y las tablas SOLVI en general) rompen esa
convención y usan `snake_case`; se señala en cada caso.

**No existe ningún archivo `.sql` de esquema ni carpeta de migraciones en este
repositorio** (se verificó explícitamente). Por lo tanto, este documento se
reconstruyó leyendo el código fuente de la Edge Function única de PRISMA
(`supabase/functions/api/`), específicamente cómo cada tabla se usa en
`.from(...)`, `.select(...)`, `.insert(...)`, `.update(...)`, `.eq(...)` y demás
filtros a lo largo de `handlers/`, `shared/`, `jobs/`, `lib/history.ts` y
`email/send.ts`.

Hay una fuente adicional, pero **parcial y desactualizada**:
`src/types/supabase.types.ts`, un archivo autogenerado por la CLI de Supabase.
Documenta el `Row`/`Insert`/`Update`/`Relationships` de solo **19 tablas** (de
las 49 realmente usadas hoy por la Edge Function), y para varias de esas 19 le
faltan columnas que el código sí usa activamente (por ejemplo `TBL_Requests` real
tiene ~20 columnas más que las que aparece en ese archivo). Se usó como fuente de
**alta confianza** para tipos exactos, nullability y relaciones FK explícitas
allí donde coincide con el código actual, y se señala explícitamente cualquier
discrepancia encontrada.

Convenciones de esta tabla de columnas:
- **Tipo**: inferido del uso (comparaciones, inserts, aritmética, `new Date()`,
  nombres). `number`, `string`, `boolean`, `timestamp` (ISO 8601 almacenado como
  string), `jsonb`/`array` para columnas de datos estructurados.
- **Notas**: PK, FK, nullable, defaults observados, o incertidumbre explícita
  cuando el código no permite confirmar el tipo con certeza.
- **Módulo relacionado**: el/los handler(s) de `supabase/functions/api/` donde
  se usa la tabla. Solo existe un documento de módulo funcional hoy
  (`documentacion/modulos/07-sprints-y-estadisticas.md`, para sprints); para el
  resto de las tablas se referencia directamente el archivo de handler porque
  todavía no hay documentos de módulo equivalentes.

## Diagrama de dominios

Las 49 tablas activas se agrupan en 12 dominios funcionales:

1. **Tickets y su ciclo de vida** — `TBL_Requests`, `TBL_Requests_Assignments`,
   `TBL_Requests_History`, `TBL_Requests_Templates`, `TBL_Request_Closure`,
   `TBL_Closure_Attachments`, `TBL_Request_Participants`, `TBL_Client_Feedback`,
   `TBL_Acceptance_Criteria`, `TBL_Attachments`.
2. **Comentarios y menciones** — `TBL_Comments`, `TBL_Comment_Mentions`.
3. **Organización, equipos y usuarios** — `TBL_Users`, `TBL_User_Identities`,
   `TBL_Departments`, `TBL_Teams`, `TBL_Board_Teams`, `TBL_Board_Team_Access`,
   `TBL_Sub_Teams`, `TBL_Sub_Team_Members`, `TBL_Sub_Team_Supervisors`.
4. **Configuración del tablero Kanban** — `TBL_Board_Columns`,
   `TBL_Team_Column_Config`, `TBL_Labels`, `TBL_Request_Labels`,
   `TBL_Request_Team`, `TBL_Request_Sub_Team`.
5. **Sprints** — `TBL_Sprint`, `TBL_Request_Sprint`, `TBL_Sprint_Team_Capacity`.
6. **Automatizaciones y notificaciones** — `TBL_Automation_Rules`,
   `TBL_Notifications`, `TBL_Announcements`.
7. **Correo transaccional** — `TBL_Email_Templates`, `TBL_Email_Logs`.
8. **Calificaciones de servicio** — `TBL_Resolution_Ratings`,
   `TBL_Resolution_Rating_Resolvers`, `TBL_Satisfaction_Ratings`.
9. **Exportaciones y jobs en background** — `TBL_Background_Jobs`,
   `TBL_Export_History`, `TBL_Template_Field_Renames`.
10. **Integración SOLVI** (ticketing externo) — `TBL_Ticket_Solvi`,
    `TBL_Seguimientos_Solvi`, `TBL_Ticket_Attachments_Solvi`,
    `TBL_Solvi_Comments`, `TBL_Solvi_Comment_Mentions`, `TBL_Solvi_Participants`.
11. **Sistema y soporte** — `TBL_Bug_Reports`.
12. **Migración de datos históricos** — `TBL_Migration_Map`.

## Tablas

### TBL_Acceptance_Criteria

**Propósito:** Criterios de aceptación (checklist de condiciones a cumplir) de una
solicitud, con flujo de revisión (pendiente/aceptado/rechazado) y notas del
revisor.
**Módulo relacionado:** `supabase/functions/api/handlers/criteria.ts`;
también se lee desde `shared/selects.ts` (`DETAIL_SELECT`) y se borra en cascada
manual desde `handlers/requests.ts::deleteRequest`.

| Columna | Tipo | Notas |
|---|---|---|
| Criteria_ID | number | PK, autogenerado |
| Request_ID | string (ver Notas y hallazgos) | FK a `TBL_Requests.Request_ID` |
| Title | string | Texto del criterio |
| Status | string | `'pending' \| 'accepted' \| 'rejected'` |
| Reviewer_Notes | string, nullable | Comentario del revisor |
| Reviewed_By | number, nullable | FK a `TBL_Users.User_ID` |
| Reviewed_At | timestamp, nullable | Se limpia (`null`) si el estado vuelve a `pending` |
| Created_At | timestamp | |
| Updated_At | timestamp | Se refresca en cada update |

**Relaciones:**
- `Request_ID` → `TBL_Requests.Request_ID` (muchos criterios por solicitud)
- `Reviewed_By` → `TBL_Users.User_ID`

---

### TBL_Announcements

**Propósito:** Anuncios/banners mostrados en login u otras superficies de la app,
con ventana de vigencia y segmentación de audiencia por rol/equipo/departamento.
**Módulo relacionado:** `supabase/functions/api/handlers/announcements.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| announcement_id | string/number (no confirmado) | PK; se filtra con `.eq('announcement_id', id)` donde `id: string` en el payload |
| title | string | |
| body | string, nullable | |
| type | string | Categoría del anuncio (no se ve un enum cerrado en el código) |
| show_in | array de string | Se consulta con `.contains('show_in', [surface])`; valores vistos: `'login'` |
| target_role | string, nullable | Formatos: `'admin'`, `'team:<id>'`, `'dept:<id>'`, o un rol directo; el filtrado por esto ocurre en memoria, no en SQL |
| is_active | boolean | |
| starts_at | timestamp | |
| ends_at | timestamp, nullable | `null` = sin fecha de fin |
| created_by | number | FK a `TBL_Users.User_ID` |
| created_at | timestamp | |

**Relaciones:**
- `created_by` → `TBL_Users.User_ID`

**Nota de convención:** esta es de las pocas tablas que usa `snake_case` en vez
de `PascalCase`, a diferencia del resto del esquema.

---

### TBL_Attachments

**Propósito:** Adjuntos subidos a una solicitud (archivos en Supabase Storage,
bucket `attachments`); la tabla solo guarda la ruta/metadata, no el archivo.
**Módulo relacionado:** `supabase/functions/api/handlers/attachments.ts`.
**Fuente de alta confianza:** cubierta por `src/types/supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Attachment_ID | number | PK |
| Attachment_File_Name | string | |
| Attachment_File_Size | number | Bytes |
| Attachment_File_url | string | Pese al nombre, guarda la **ruta relativa** del bucket (`extractStoragePath` normaliza si llegó una URL pública completa por datos heredados) |
| Attachment_Mime_Type | string | |
| Attachment_Request_ID | number | FK a `TBL_Requests.Request_ID` |
| Attachment_Uploaded_By | number | FK a `TBL_Users.User_ID` |
| Attachment_Created_At | string (timestamp) | |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Attachment_Request_ID` → `TBL_Requests.Request_ID`
- `Attachment_Uploaded_By` → `TBL_Users.User_ID`

---

### TBL_Automation_Rules

**Propósito:** Reglas de automatización configurables por un admin: un disparador
(creación de ticket, cambio de columna) que ejecuta una acción (asignar
resolutor, asignar prioridad, notificar usuario) sobre tickets de un equipo.
**Módulo relacionado:** `supabase/functions/api/handlers/automationRules.ts`;
ejecutadas desde `handlers/requests.ts` (`createRequest`, `moveToColumn`).

| Columna | Tipo | Notas |
|---|---|---|
| Rule_ID | number | PK |
| Rule_Name | string | |
| Rule_Description | string, nullable | |
| Rule_Team_ID | number, nullable | FK a `TBL_Board_Teams.Board_Team_ID`; `null` = aplica a todos los equipos |
| Rule_Trigger | string | `'solicitud_creada' \| 'columna_cambiada'` |
| Rule_Trigger_Value | string, nullable | Para `columna_cambiada`: nombre de la columna destino |
| Rule_Action | string | `'asignar_resolutor' \| 'asignar_prioridad' \| 'notificar_usuario'` |
| Rule_Action_Value | string | Valor genérico dependiente de la acción: `User_ID` como texto, clave de prioridad (`baja/media/alta/critica`), o audiencia (`solicitante/todos/asignados`) / `User_ID` como texto |
| Rule_Is_Active | boolean | |
| Rule_Exec_Count | number | Contador, se incrementa en cada ejecución |
| Rule_Last_Exec_At | timestamp, nullable | |
| Rule_Created_At | timestamp | |

**Relaciones:**
- `Rule_Team_ID` → `TBL_Board_Teams.Board_Team_ID`
- `Rule_Action_Value` referencia condicionalmente a `TBL_Users.User_ID` (cuando la acción es `asignar_resolutor` o `notificar_usuario` con un ID numérico) — es una FK "blanda" (no declarada, solo por convención de valor)

---

### TBL_Background_Jobs

**Propósito:** Cola de trabajos en background (renombrado de campos de
plantilla, exportaciones grandes) procesados por chunks vía auto-invocación de
la Edge Function.
**Módulo relacionado:** `supabase/functions/api/jobs/exportJob.ts`,
`jobs/renameJob.ts`, `handlers/exportJobs.ts`, `handlers/templates.ts`,
`handlers/system.ts` (polling/resume).

| Columna | Tipo | Notas |
|---|---|---|
| Job_ID | string (probable UUID) | PK; se pasa como `string` en todos los payloads |
| Job_Type | string | `'template_field_rename' \| 'export_requests'` |
| Job_Status | string | `'pending' \| 'running' \| 'done' \| 'failed'` |
| Job_Payload | jsonb | Estructura distinta según `Job_Type` |
| Job_Progress_Total | number | |
| Job_Progress_Current | number | |
| Job_Result | jsonb, nullable | |
| Job_Error | string, nullable | |
| Job_Created_By | number, nullable | FK a `TBL_Users.User_ID` |
| Job_Created_At | timestamp | |
| Job_Updated_At | timestamp | Usada para detectar jobs "estancados" (>60s sin actualizar) |
| Job_Completed_At | timestamp, nullable | |

**Relaciones:**
- `Job_Created_By` → `TBL_Users.User_ID`
- Relación lógica (no FK declarada) con `TBL_Export_History.Export_Job_ID`

---

### TBL_Board_Columns

**Propósito:** Columnas del tablero Kanban de un board (p. ej. "Sin categorizar",
"En progreso", "Cliente review", "Historial").
**Módulo relacionado:** `supabase/functions/api/handlers/columns.ts`,
`handlers/teamColumnConfig.ts`; consultada extensamente desde
`handlers/requests.ts`, `shared/requests.ts`, `shared/selects.ts`.
**Fuente de alta confianza:** cubierta parcialmente por `supabase.types.ts` (le
falta `Board_Column_Slug`, que sí existe y se usa activamente en el código).

| Columna | Tipo | Notas |
|---|---|---|
| Board_Column_ID | number | PK |
| Board_Column_Board_ID | number | Ver nota sobre "board" en *Notas y hallazgos*: el tipo generado lo declara FK a `TBL_Boards`, tabla hoy en desuso |
| Board_Column_Name | string | |
| Board_Column_Slug | string | **No está en `supabase.types.ts`** (desactualizado); se deriva del nombre al crear la columna (normaliza acentos, minúsculas, `_`); usado como identificador estable para lógica de negocio (`en_progreso`, `cliente_review`, `sin_categorizar`) |
| Board_Column_Position | number | Orden dentro del board |
| Board_Column_Color | string | |
| Board_Column_Limit | number | Límite WIP |

**Relaciones:**
- `Board_Column_Board_ID` → (conceptualmente) un "board"; ver nota sobre `TBL_Boards`
- Referenciada por `TBL_Requests.Request_Board_Column_ID`, `TBL_Request_Closure.Target_Column_ID`, `TBL_Team_Column_Config.Column_ID`

---

### TBL_Board_Team_Access

**Propósito:** Grants explícitos de acceso a un board (equipo Kanban) para un
usuario puntual, típicamente cross-departamento (además de la visibilidad
automática por departamento).
**Módulo relacionado:** `supabase/functions/api/handlers/boardTeams.ts`,
`shared/boardAccess.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| User_ID | number | FK a `TBL_Users.User_ID`; parte de la clave (se borra con `.eq('User_ID', userId)` como delete-all) |
| Board_Team_ID | number | FK a `TBL_Board_Teams.Board_Team_ID` |
| Granted_By | number, nullable | FK a `TBL_Users.User_ID` — quién otorgó el acceso |

**Relaciones:**
- `User_ID` → `TBL_Users.User_ID`
- `Board_Team_ID` → `TBL_Board_Teams.Board_Team_ID`
- `Granted_By` → `TBL_Users.User_ID`

**Nota:** no se observó una columna de ID propia en ningún `select`; es posible
que exista un PK autogenerado no consultado, o que la PK sea compuesta
`(User_ID, Board_Team_ID)`.

---

### TBL_Board_Teams

**Propósito:** Los "equipos de tablero" (kanbans) de PRISMA — la unidad
organizativa principal de trabajo (ej. "Desarrollo TI", "SOLVI"). Puede ser
externo (link a otro sistema) o de integración (ej. SOLVI), nunca ambos.
**Módulo relacionado:** `supabase/functions/api/handlers/boardTeams.ts`; leída
extensamente por casi todos los demás handlers (requests, automationRules,
exportJobs, labels, etc.).
**Fuente de alta confianza:** cubierta parcialmente por `supabase.types.ts`, que
solo documenta 4 de las ~13 columnas reales.

| Columna | Tipo | Notas |
|---|---|---|
| Board_Team_ID | number | PK |
| Board_Team_Name | string | |
| Board_Team_Code | string | Código corto usado para lookups (`.eq('Board_Team_Code', teamCode)`) |
| Board_Team_Color | string | |
| Board_Team_Description | string, nullable | |
| Board_Team_Icon | string | Emoji; default `'🗂️'` |
| Board_Team_Is_Admin_Only | boolean | Excluye el board de la visibilidad automática por departamento |
| Board_Team_Is_External | boolean | Excluyente con `Is_Integration` |
| Board_Team_External_URL | string, nullable | Requerido si `Is_External = true` |
| Board_Team_Is_Integration | boolean | Excluyente con `Is_External` |
| Board_Team_Integration_Key | string, nullable | Requerido si `Is_Integration = true` (ej. `'solvi'`) |
| Board_Team_Sort_Order | number | Orden de despliegue, con reordenamiento por departamento |
| Board_Team_Is_Active | boolean | |
| Department_ID | number, nullable | FK a `TBL_Departments.Department_ID` |

**Relaciones:**
- `Department_ID` → `TBL_Departments.Department_ID`
- Referenciada por: `TBL_Labels.Label_Team_ID`, `TBL_Request_Team.Request_Team_ID`, `TBL_Sub_Teams.Sub_Team_Team_ID`, `TBL_Board_Team_Access.Board_Team_ID`, `TBL_Automation_Rules.Rule_Team_ID`, `TBL_Sprint_Team_Capacity.Board_Team_ID`, `TBL_Team_Column_Config.Team_ID`

---

### TBL_Bug_Reports

**Propósito:** Reportes de fallos de la propia app PRISMA (bug tracker interno),
con flujo de conversión a ticket real cuando el bug requiere trabajo formal.
**Módulo relacionado:** `supabase/functions/api/handlers/system.ts`; sincronizado
también desde `handlers/requests.ts::moveToColumn` (cierre/reapertura del ticket
vinculado).

| Columna | Tipo | Notas |
|---|---|---|
| Report_ID | string (probable UUID) | PK; tratado como `string` en el payload |
| User_ID | number | FK a `TBL_Users.User_ID` (reportante); FK nombrada `TBL_Bug_Reports_User_ID_fkey` |
| Title | string | |
| Description | string | |
| Severity | string, nullable | `'bajo' \| 'medio' \| 'alto' \| 'critico'` |
| Screen_Path | string, nullable | |
| Status | string | `'pendiente' \| 'asignado' \| 'cerrado'` |
| Created_At | timestamp | |
| Updated_At | timestamp | |
| Linked_Request_ID | string, nullable | FK a `TBL_Requests.Request_ID`; guard anti doble-conversión (FK nombrada `TBL_Bug_Reports_Linked_Request_ID_fkey`) |
| Resolver_ID | number, nullable | FK a `TBL_Users.User_ID` (FK nombrada `TBL_Bug_Reports_Resolver_ID_fkey`) |
| Assigned_By | number, nullable | FK a `TBL_Users.User_ID` |
| Assigned_At | timestamp, nullable | |

**Relaciones:**
- `User_ID`, `Resolver_ID`, `Assigned_By` → `TBL_Users.User_ID`
- `Linked_Request_ID` → `TBL_Requests.Request_ID`

---

### TBL_Client_Feedback

**Propósito:** Veredicto del cliente (aprobado/rechazado) sobre una solicitud en
revisión, ligado 1:1 a cada ciclo de cierre.
**Módulo relacionado:** `supabase/functions/api/handlers/feedback.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Feedback_ID | number | PK |
| Request_ID | string | FK a `TBL_Requests.Request_ID` |
| Submitted_By | number | FK a `TBL_Users.User_ID` (el cliente) |
| Decision | string | `'approved' \| 'rejected'` |
| Feedback_Note | string, nullable | Se omite en el correo si el ticket es confidencial |
| Submitted_At | timestamp | |

**Relaciones:**
- `Request_ID` → `TBL_Requests.Request_ID`
- `Submitted_By` → `TBL_Users.User_ID`

**Regla de negocio observada:** solo se permite un `Client_Feedback` por cada
`Request_Closure` existente para el mismo `Request_ID` (control de ciclo en
`submitClientFeedback`).

---

### TBL_Closure_Attachments

**Propósito:** Adjuntos de evidencia asociados a un cierre de ticket
(`TBL_Request_Closure`), soporta reutilizar adjuntos de un cierre previo.
**Módulo relacionado:** `supabase/functions/api/handlers/closure.ts`;
seleccionada dentro de `shared/selects.ts` (`BASE_SELECT`, no en
`BASE_SELECT_LIGHT`/`DETAIL_SELECT`).

| Columna | Tipo | Notas |
|---|---|---|
| Closure_Attachment_ID | number | PK |
| Closure_ID | number | FK a `TBL_Request_Closure.Closure_ID` |
| Storage_Path | string | Ruta en el bucket `attachments` |
| File_Name | string | |
| Mime_Type | string | |
| File_Size | number | |
| Created_At | timestamp | |

**Relaciones:**
- `Closure_ID` → `TBL_Request_Closure.Closure_ID`

---

### TBL_Comment_Mentions

**Propósito:** Registro de qué usuarios fueron mencionados en un comentario
(auditoría/base de las notificaciones de mención).
**Módulo relacionado:** `supabase/functions/api/handlers/comments.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Comment_ID | number | FK a `TBL_Comments.Comment_ID` |
| Mentioned_User_ID | number | FK a `TBL_Users.User_ID` |

**Relaciones:**
- `Comment_ID` → `TBL_Comments.Comment_ID`
- `Mentioned_User_ID` → `TBL_Users.User_ID`

**Nota:** tabla puente pura (insert-only visto en el código); no se observó
columna de ID propia ni operaciones de lectura/borrado sobre ella.

---

### TBL_Comments

**Propósito:** Comentarios de una solicitud, con soporte de menciones.
**Módulo relacionado:** `supabase/functions/api/handlers/comments.ts`; también
insertada automáticamente por `handlers/requests.ts::moveToColumn` (comentario
de sistema al reabrir un ticket) y por `handlers/migration.ts` (nota migrada).
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Comment_ID | number | PK |
| Comment_Request_ID | number | FK a `TBL_Requests.Request_ID` |
| Comment_User_ID | number | FK a `TBL_Users.User_ID`; en comentarios migrados usa el "usuario de sistema" (`User_ID = 17`) |
| Comment_Text | string | |
| Comment_Created_At | string (timestamp) | |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Comment_Request_ID` → `TBL_Requests.Request_ID`
- `Comment_User_ID` → `TBL_Users.User_ID`

---

### TBL_Departments

**Propósito:** Departamentos de la organización (estructura de personas, no de
tableros). El departamento de TI (`Department_ID = 7`) tiene reglas especiales
en varios lugares del código (define quién es "interno").
**Módulo relacionado:** `supabase/functions/api/handlers/orgUnits.ts`; leído
también por `handlers/users.ts`, `handlers/boardTeams.ts`,
`shared/boardAccess.ts`, `shared/selects.ts` (`requester_department`).

| Columna | Tipo | Notas |
|---|---|---|
| Department_ID | number | PK; `7` = TI (hardcodeado como constante en varios archivos) |
| Department_Name | string | |
| Department_Code | string | Normalizado a minúsculas al guardar |
| Is_Hidden_From_Onboarding | boolean | |
| Created_At | timestamp | |

**Relaciones:**
- Referenciado por `TBL_Teams.Department_ID`, `TBL_Board_Teams.Department_ID`, `TBL_Users.Department_ID`, `TBL_Requests.Request_Requester_Department_ID`

---

### TBL_Email_Logs

**Propósito:** Auditoría de cada correo enviado (uno por destinatario), con
soporte de hilos de respuesta (`In-Reply-To`/`References` de Microsoft Graph) y
anti-spam por ventana de tiempo.
**Módulo relacionado:** `supabase/functions/api/email/send.ts`;
consultada por `shared/requests.ts` para anti-duplicado/anti-spam.
**Fuente de alta confianza parcial:** `supabase.types.ts` cubre 8 columnas, pero
el código real usa varias más (`Email_Log_Event_Key`, `Email_Log_Sent_To_Address`,
`Email_Log_Provider_Msg_ID`, `Email_Log_In_Reply_To`, `Email_Log_References`,
`Email_Log_Error`) que no aparecen en el archivo generado.

| Columna | Tipo | Notas |
|---|---|---|
| Email_Log_ID | number | PK |
| Email_Log_Request_ID | number | FK a `TBL_Requests.Request_ID` |
| Email_Log_Sent_To | number | FK a `TBL_Users.User_ID` |
| Email_Log_Sent_To_Address | string | **No está en `supabase.types.ts`**; dirección real de envío (un usuario puede tener varias identidades/correos) |
| Email_Log_Template_Name | string | |
| Email_Log_Event_Key | string | **No está en `supabase.types.ts`**; clave estable del evento (no cambia si se renombra el template) |
| Email_Log_Subject_Sent | string | |
| Email_Log_Body_Sent | string | HTML final ya interpolado |
| Email_Log_Status | string | `'sent' \| 'error'` |
| Email_Log_Sent_At | timestamp | |
| Email_Log_Provider_Msg_ID | string, nullable | **No está en `supabase.types.ts`**; `internetMessageId` de Microsoft Graph |
| Email_Log_In_Reply_To | string, nullable | **No está en `supabase.types.ts`** |
| Email_Log_References | string, nullable | **No está en `supabase.types.ts`**; cadena de IDs para el hilo |
| Email_Log_Error | string, nullable | **No está en `supabase.types.ts`** |

**Relaciones:**
- `Email_Log_Request_ID` → `TBL_Requests.Request_ID`
- `Email_Log_Sent_To` → `TBL_Users.User_ID`

---

### TBL_Email_Templates

**Propósito:** Plantillas de correo transaccional por evento (`Event_Key` único
global), con interpolación `{{variable}}`.
**Módulo relacionado:** `supabase/functions/api/handlers/emailTemplates.ts`,
`email/send.ts`.
**Fuente de alta confianza parcial:** `supabase.types.ts` no incluye
`Email_Template_Event_Key`, `Email_Template_Is_Active` ni
`Email_Template_Variables`, que son columnas centrales en el código actual.

| Columna | Tipo | Notas |
|---|---|---|
| Email_Template_ID | number | PK |
| Email_Template_Board_ID | number | Ver nota sobre "board" en *Notas y hallazgos* |
| Email_Template_Name | string | |
| Email_Template_Subject | string | Soporta `{{variable}}` |
| Email_Template_Body_html | string | Soporta `{{variable}}` |
| Email_Template_Body_Text | string | |
| Email_Template_Event_Key | string | **No está en `supabase.types.ts`**; único a nivel global (`createEmailTemplate` valida duplicados) |
| Email_Template_Is_Active | boolean | **No está en `supabase.types.ts`**; una plantilla inactiva no dispara correo |
| Email_Template_Variables | array de string | **No está en `supabase.types.ts`** |
| Email_Template_Created_At | timestamp | |
| Email_Template_Updated_At | timestamp | |

**Relaciones:**
- `Email_Template_Board_ID` → (conceptualmente) un "board"

---

### TBL_Export_History

**Propósito:** Historial de exportaciones de tickets solicitadas por un usuario
(filtros usados, formato, estado, descargas), ligado a un `TBL_Background_Jobs`.
**Módulo relacionado:** `supabase/functions/api/handlers/exportJobs.ts`,
`jobs/exportJob.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Export_ID | string (probable UUID) | PK |
| Export_Job_ID | string | FK a `TBL_Background_Jobs.Job_ID` |
| Export_User_ID | number | FK a `TBL_Users.User_ID` |
| Export_Format | string | `'xlsx' \| 'csv'` |
| Export_Filters | jsonb | Snapshot de `ExportFilters` |
| Export_Columns | array de string | Columnas seleccionadas por el usuario |
| Export_Sheet_Per_Tpl | boolean | Si exporta una hoja por plantilla |
| Export_Total | number | Total de tickets en la exportación |
| Export_File_Name | string, nullable | Se llena al finalizar |
| Export_Storage_Prefix | string, nullable | Prefijo en el bucket `exports` |
| Export_Status | string | `'pending' \| 'running' \| 'done' \| 'failed'` |
| Export_Error | string, nullable | |
| Export_Created_At | timestamp | |
| Export_Completed_At | timestamp, nullable | |
| Export_Downloaded_At | timestamp, nullable | |
| Export_Download_Count | number | |
| Export_Auto_Delete_At | timestamp, nullable | Se lee pero no se vio código que la escriba; probablemente un default/trigger de la BD para limpieza automática (7 días, según mensaje de notificación) |

**Relaciones:**
- `Export_Job_ID` → `TBL_Background_Jobs.Job_ID`
- `Export_User_ID` → `TBL_Users.User_ID`

---

### TBL_Labels

**Propósito:** Etiquetas de tickets, con color e ícono, agrupadas por board y
equipo.
**Módulo relacionado:** `supabase/functions/api/handlers/labels.ts`; usada
también en `handlers/migration.ts` (creación/lookup durante migración) y
`shared/selects.ts`.
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Label_ID | number | PK |
| Label_Board_ID | number | Ver nota sobre "board" |
| Label_Team_ID | number, nullable | FK a `TBL_Board_Teams.Board_Team_ID` |
| Label_Name | string | Único dentro de `(Label_Team_ID, Label_Board_ID)` según lógica de migración |
| Label_Color | string | |
| Label_Icon | string | Emoji |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Label_Team_ID` → `TBL_Board_Teams.Board_Team_ID`
- Referenciada por `TBL_Request_Labels.Request_Labels_Label_ID`

---

### TBL_Migration_Map

**Propósito:** Tabla de idempotencia de la migración histórica Excel → PRISMA:
mapea cada fila de origen a la solicitud creada, evitando duplicar si el script
se reintenta.
**Módulo relacionado:** `supabase/functions/api/handlers/migration.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Source_File | string | Parte de la clave lógica (nombre del archivo Excel origen) |
| Source_Row | number | Parte de la clave lógica (número de fila) |
| Request_ID | string | FK a `TBL_Requests.Request_ID` |

**Relaciones:**
- `Request_ID` → `TBL_Requests.Request_ID`

**Nota:** el chequeo de idempotencia consulta por `(Source_File, Source_Row)`
exacto; probablemente son la clave única (compuesta) de la tabla, aunque no se
confirma si hay además un ID autogenerado.

---

### TBL_Notifications

**Propósito:** Notificaciones in-app (fan-out por usuario) de eventos del
sistema: asignaciones, menciones, comentarios, cambios de columna, feedback del
cliente, etc.
**Módulo relacionado:** `supabase/functions/api/handlers/notifications.ts`
(lectura/marcado); la inserción vive en `shared/notifications.ts::insertNotifications`,
usada desde prácticamente todos los demás handlers de dominio.

| Columna | Tipo | Notas |
|---|---|---|
| Notification_ID | number | PK |
| Notification_User_ID | number | FK a `TBL_Users.User_ID` (destinatario) |
| Notification_Type | string | Valores vistos: `assignment`, `mention`, `comment`, `column_move`, `closure`, `client_approved`, `client_rejected`, `criteria_reviewed`, `new_external_request`, `bug_report`, `export_ready` (no parece ser un enum de BD, es texto libre por convención) |
| Notification_Title | string | |
| Notification_Body | string | |
| Notification_Request_ID | string, nullable | FK a `TBL_Requests.Request_ID`; `null` para eventos sin ticket (ej. `bug_report`) |
| Notification_Actor_ID | number, nullable | FK a `TBL_Users.User_ID`; `null` = originado por el sistema |
| Notification_Is_Read | boolean | |
| Notification_Created_At | timestamp | |

**Relaciones:**
- `Notification_User_ID`, `Notification_Actor_ID` → `TBL_Users.User_ID`
- `Notification_Request_ID` → `TBL_Requests.Request_ID`

---

### TBL_Request_Closure

**Propósito:** Registro de cada cierre/envío a revisión de una solicitud, con su
nota y evidencia (nueva, reutilizada de un cierre previo, u omitida).
**Módulo relacionado:** `supabase/functions/api/handlers/closure.ts`; consultada
también por `handlers/feedback.ts` (control de ciclo) y `shared/selects.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Closure_ID | number | PK |
| Request_ID | string | FK a `TBL_Requests.Request_ID` |
| Closed_By | number | FK a `TBL_Users.User_ID` |
| Closure_Note | string | |
| Target_Column_ID | number | FK a `TBL_Board_Columns.Board_Column_ID` |
| Closure_Type | string | `'new' \| 'reuse' \| 'skip'` |
| Attachment_URL | string, nullable | |
| Attachment_Name | string, nullable | |
| Attachment_Mime | string, nullable | |
| Closed_At | timestamp | |

**Relaciones:**
- `Request_ID` → `TBL_Requests.Request_ID`
- `Closed_By` → `TBL_Users.User_ID`
- `Target_Column_ID` → `TBL_Board_Columns.Board_Column_ID`
- Referenciada por `TBL_Closure_Attachments.Closure_ID`

---

### TBL_Request_Labels

**Propósito:** Tabla puente muchos-a-muchos entre solicitudes y etiquetas.
**Módulo relacionado:** `supabase/functions/api/handlers/requests.ts`
(estrategia delete-all + insert al editar), `handlers/labels.ts`,
`handlers/exportJobs.ts` (filtro relacional), `shared/selects.ts`.
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Request_Labels_Request_ID | number | FK a `TBL_Requests.Request_ID` |
| Request_Labels_Label_ID | number | FK a `TBL_Labels.Label_ID` |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Request_Labels_Request_ID` → `TBL_Requests.Request_ID`
- `Request_Labels_Label_ID` → `TBL_Labels.Label_ID`

---

### TBL_Request_Participants

**Propósito:** Acceso durable de un usuario a una solicitud, más allá de ser
solicitante o resolutor asignado (típicamente por haber sido mencionado en un
comentario).
**Módulo relacionado:** `supabase/functions/api/handlers/comments.ts`,
`handlers/requests.ts` (`fetchByParticipant`, `fetchMyMentions`).

| Columna | Tipo | Notas |
|---|---|---|
| Request_ID | string | FK a `TBL_Requests.Request_ID`; clave compuesta con `User_ID` (`onConflict: 'Request_ID,User_ID'`) |
| User_ID | number | FK a `TBL_Users.User_ID` |
| Added_Via | string | Valor visto: `'mention'` |
| Added_By | number, nullable | FK a `TBL_Users.User_ID` — quién originó el acceso |
| Created_At | timestamp | |

**Relaciones:**
- `Request_ID` → `TBL_Requests.Request_ID`
- `User_ID`, `Added_By` → `TBL_Users.User_ID`

---

### TBL_Request_Sprint

**Propósito:** Tabla puente entre solicitudes y sprints (relación 1:1 en la
práctica: cada solicitud tiene a lo sumo un sprint activo, reemplazado con
delete+insert al editar).
**Módulo relacionado:** `supabase/functions/api/handlers/requests.ts`,
`handlers/sprints.ts`, `handlers/exportJobs.ts`, `handlers/migration.ts`,
`shared/selects.ts`.
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Request_Sprint_ID | number | **Nombre confuso**: pese al nombre, es la FK a `TBL_Sprint.Sprint_ID`, no un ID propio de la fila |
| Request_Sprint_Request_ID | number | FK a `TBL_Requests.Request_ID` |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Request_Sprint_ID` → `TBL_Sprint.Sprint_ID`
- `Request_Sprint_Request_ID` → `TBL_Requests.Request_ID`

---

### TBL_Request_Sub_Team

**Propósito:** Tabla puente entre solicitudes y sub-equipos (varios sub-equipos
por solicitud).
**Módulo relacionado:** `supabase/functions/api/handlers/requests.ts`
(`updateRequestSubTeams`, `deleteRequest`), `shared/selects.ts`,
`handlers/history.ts` (gating de visibilidad del historial).

| Columna | Tipo | Notas |
|---|---|---|
| Request_Sub_Team_Request_ID | string | FK a `TBL_Requests.Request_ID` |
| Request_Sub_Team_ID | number | FK a `TBL_Sub_Teams.Sub_Team_ID` |

**Relaciones:**
- `Request_Sub_Team_Request_ID` → `TBL_Requests.Request_ID`
- `Request_Sub_Team_ID` → `TBL_Sub_Teams.Sub_Team_ID`

**Nota:** en `handlers/history.ts` se selecciona además `Request_Sub_Team_ID`
como si fuera el ID de la fila puente (no el FK) — posible ambigüedad de nombre
similar a otras tablas puente de este esquema; no se pudo confirmar con
certeza si existe una columna de ID de fila separada.

---

### TBL_Request_Team

**Propósito:** Tabla puente muchos-a-muchos entre solicitudes y equipos de
tablero (`TBL_Board_Teams`) — a qué equipo(s) va dirigida la solicitud.
**Módulo relacionado:** `supabase/functions/api/handlers/requests.ts` (uso
intensivo), `handlers/exportJobs.ts`, `shared/requests.ts` (`isCloseColumn`),
`shared/selects.ts`, `handlers/migration.ts`.
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Request_Team_ID | number | **Nombre confuso**: es la FK a `TBL_Board_Teams.Board_Team_ID`, no un ID propio |
| Request_Team_Request_ID | string | FK a `TBL_Requests.Request_ID` |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Request_Team_ID` → `TBL_Board_Teams.Board_Team_ID`
- `Request_Team_Request_ID` → `TBL_Requests.Request_ID`

---

### TBL_Requests

**Propósito:** La tabla central de PRISMA — cada fila es un ticket/solicitud.
Concentra el ciclo de vida completo: creación, categorización, asignación,
progreso, cierre, confidencialidad, jerarquía padre/hijo y datos de formulario
dinámico (`Form_Data` + snapshot de esquema de plantilla).
**Módulo relacionado:** `supabase/functions/api/handlers/requests.ts` (handler
principal), y consumida por prácticamente todos los demás handlers y por
`shared/selects.ts` (`BASE_SELECT`, `BASE_SELECT_LIGHT`, `DETAIL_SELECT`,
`STATS_SELECT`).
**Fuente de alta confianza parcial:** `supabase.types.ts` documenta solo 13
columnas; el código real usa bastantes más (ver filas marcadas abajo).

| Columna | Tipo | Notas |
|---|---|---|
| Request_ID | string (ver Notas y hallazgos) | PK. `supabase.types.ts` lo declara `number`; el código actual lo tipa como `string` en prácticamente todos los payloads |
| Request_Board_ID | number | Ver nota sobre "board" en *Notas y hallazgos* |
| Request_Board_Column_ID | number | FK a `TBL_Board_Columns.Board_Column_ID` |
| Request_Requested_By | number, nullable | FK a `TBL_Users.User_ID`; `null` en tickets legacy migrados (`Request_Is_Legacy = true`) |
| Request_Template_ID | number | FK a `TBL_Requests_Templates.Request_Template_ID` |
| Request_Title | string, nullable | |
| Request_Description | string, nullable | |
| Request_Score | number, nullable | Puntaje de prioridad; mapeo visto: baja=1, media=2, alta=4, critica=6 |
| Request_Progress | number, nullable | 0–100, acotado en `updateRequest` |
| Request_Created_At | timestamp, nullable | |
| Request_Finished_At | timestamp, nullable | Se fija al cerrar, se limpia al reabrir |
| Request_Parent_ID | string, nullable | **No está en `supabase.types.ts`**; FK auto-referencial a `TBL_Requests.Request_ID` (sub-tickets) |
| Request_Estimated_Hours | number, nullable | **No está en `supabase.types.ts`** |
| Request_Logged_Hours | number, nullable | **No está en `supabase.types.ts`** |
| Request_Requester_Team_ID | number, nullable | **No está en `supabase.types.ts`**; FK a `TBL_Teams.Team_ID` (equipo organizacional del solicitante, no board team) |
| Request_Requester_Department_ID | number, nullable | **No está en `supabase.types.ts`**; FK a `TBL_Departments.Department_ID` |
| Request_Is_Confidential | boolean, nullable | **No está en `supabase.types.ts`**; oculta contenido de comentarios/feedback en correos |
| Request_Is_Legacy | boolean | **No está en `supabase.types.ts`**; `true` para tickets migrados desde Excel |
| Request_Legacy_Requester | string, nullable | **No está en `supabase.types.ts`**; texto libre del solicitante histórico cuando no hay `User_ID` |
| Request_Form_Data | jsonb | **No está en `supabase.types.ts`**; datos del formulario dinámico según la plantilla |
| Request_Template_Schema_Snapshot | jsonb (array) | **No está en `supabase.types.ts`**; snapshot inmutable del `Form_Schema` de la plantilla al momento de crear el ticket |
| Request_Deadline | timestamp, nullable | Solo aparece en `supabase.types.ts`; **no se encontró ningún uso en el código actual** — posiblemente una columna en desuso o eliminada |
| Request_Time_Consumed | string, nullable | Solo aparece en `supabase.types.ts`; **no se encontró ningún uso en el código actual** — posiblemente en desuso, reemplazada por `Request_Logged_Hours` |

**Relaciones:**
- `Request_Board_Column_ID` → `TBL_Board_Columns.Board_Column_ID`
- `Request_Requested_By` → `TBL_Users.User_ID`
- `Request_Template_ID` → `TBL_Requests_Templates.Request_Template_ID`
- `Request_Parent_ID` → `TBL_Requests.Request_ID` (auto-referencial)
- `Request_Requester_Team_ID` → `TBL_Teams.Team_ID`
- `Request_Requester_Department_ID` → `TBL_Departments.Department_ID`
- Referenciada por: `TBL_Attachments`, `TBL_Comments`, `TBL_Comment_Mentions` (indirecta), `TBL_Requests_Assignments`, `TBL_Requests_History`, `TBL_Request_Team`, `TBL_Request_Labels`, `TBL_Request_Sprint`, `TBL_Request_Sub_Team`, `TBL_Request_Participants`, `TBL_Request_Closure`, `TBL_Client_Feedback`, `TBL_Acceptance_Criteria`, `TBL_Resolution_Ratings`, `TBL_Email_Logs`, `TBL_Notifications`, `TBL_Bug_Reports.Linked_Request_ID`, `TBL_Migration_Map`

---

### TBL_Requests_Assignments

**Propósito:** Tabla puente entre solicitudes y sus resolutores asignados
(varios resolutores por ticket).
**Módulo relacionado:** `supabase/functions/api/handlers/assignments.ts`,
`handlers/requests.ts`, `handlers/exportJobs.ts`, `handlers/comments.ts`
(chequeo de autoridad), `handlers/system.ts` (`assignBugToRequest`).
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Request_Assignment_ID | string | **Nombre confuso**: es la FK a `TBL_Requests.Request_ID`, no un ID propio de la asignación |
| Request_Assignment_User_ID | number | FK a `TBL_Users.User_ID` |
| Request_Assignment_At | timestamp | |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Request_Assignment_ID` → `TBL_Requests.Request_ID`
- `Request_Assignment_User_ID` → `TBL_Users.User_ID`

**Nota:** la clave única real es la combinación `(Request_Assignment_ID,
Request_Assignment_User_ID)` — se ve explícitamente en el `onConflict` de los
`upsert()`.

---

### TBL_Requests_History

**Propósito:** Bitácora de auditoría de cada solicitud: movimientos de columna,
cierres/reaperturas, ediciones de campo (incluyendo `Form_Data`), y operaciones
sobre criterios de aceptación.
**Módulo relacionado:** `supabase/functions/api/lib/history.ts` (escritura,
`logHistory`/`diffFields`/`diffFormData`), `handlers/history.ts` (lectura con
control de acceso).
**Fuente de alta confianza parcial:** `supabase.types.ts` documenta una versión
más simple/vieja de esta tabla (sin `Action` ni `Metadata`, y con
`Old_Value`/`New_Value`/`Field` no-nullable) que no coincide con el uso actual.

| Columna | Tipo | Notas |
|---|---|---|
| Request_History_ID | number | PK |
| Request_History_Request_ID | string | FK a `TBL_Requests.Request_ID` |
| Request_History_Changed_By | number, nullable | FK a `TBL_Users.User_ID`; `null` = cambio del sistema |
| Request_History_Action | string | **No está en `supabase.types.ts`**; `'created' \| 'field_update' \| 'column_move' \| 'closed' \| 'reopened' \| 'deleted' \| 'criterion_added' \| 'criterion_status' \| 'criterion_removed' \| 'criterion_edited'` |
| Request_History_Field | string, nullable | Nombre lógico del campo; prefijo `form:` si viene de `Form_Data` |
| Request_History_Old_Value | string, nullable | Siempre serializado a texto (JSON si era objeto/array) |
| Request_History_New_Value | string, nullable | Ídem |
| Request_History_Metadata | jsonb, nullable | **No está en `supabase.types.ts`** |
| Request_History_Changed_At | timestamp | |

**Relaciones:**
- `Request_History_Request_ID` → `TBL_Requests.Request_ID`
- `Request_History_Changed_By` → `TBL_Users.User_ID`

---

### TBL_Requests_Templates

**Propósito:** Plantillas de solicitud: definen el formulario dinámico
(`Form_Schema`) que se les presenta a los usuarios según equipo/tipo de ticket.
**Módulo relacionado:** `supabase/functions/api/handlers/templates.ts`;
consultada por `handlers/requests.ts` (snapshot al crear), `handlers/system.ts`
(`assignBugToRequest`), `handlers/migration.ts`, `shared/selects.ts`.
**Fuente de alta confianza parcial:** `supabase.types.ts` documenta 5 columnas;
al código le faltan `Icon`, `Color`, `Badge`, `Form_Schema`, `Teams`, `Is_Active`.

| Columna | Tipo | Notas |
|---|---|---|
| Request_Template_ID | number | PK; `13` = plantilla "Fallo PRISMA" (hardcodeada en `system.ts`) |
| Request_Template_Board_ID | number | Ver nota sobre "board" |
| Request_Template_Name | string | |
| Request_Template_Description | string | |
| Request_Template_Icon | string | **No está en `supabase.types.ts`** |
| Request_Template_Color | string | **No está en `supabase.types.ts`** |
| Request_Template_Badge | string | **No está en `supabase.types.ts`** |
| Request_Template_Form_Schema | jsonb (array) | **No está en `supabase.types.ts`**; esquema del formulario dinámico, soporta campos condicionales/multicondicionales |
| Request_Template_Teams | array de number | **No está en `supabase.types.ts`**; IDs de `Board_Team_ID` — es un **array embebido**, no una tabla puente |
| Request_Template_Is_Active | boolean | **No está en `supabase.types.ts`** |
| Request_Template_Created_At | timestamp | |

**Relaciones:**
- `Request_Template_Board_ID` → (conceptualmente) un "board"
- Referenciada por `TBL_Requests.Request_Template_ID`, `TBL_Template_Field_Renames.Template_ID`

---

### TBL_Resolution_Rating_Resolvers

**Propósito:** Snapshot de qué resolutores atendieron un ticket al momento de
calificarlo (para que el registro no cambie si luego se reasigna el ticket).
**Módulo relacionado:** `supabase/functions/api/handlers/resolutionRatings.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Rating_ID | number | FK a `TBL_Resolution_Ratings.Rating_ID` |
| Resolver_User_ID | number | FK a `TBL_Users.User_ID` |

**Relaciones:**
- `Rating_ID` → `TBL_Resolution_Ratings.Rating_ID`
- `Resolver_User_ID` → `TBL_Users.User_ID`

---

### TBL_Resolution_Ratings

**Propósito:** Calificación de la resolución de un ticket (dos puntajes:
solución y atención, 1–5) con comentario opcional.
**Módulo relacionado:** `supabase/functions/api/handlers/resolutionRatings.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Rating_ID | number | PK |
| Request_ID | string | FK a `TBL_Requests.Request_ID` |
| Rated_By | number | FK a `TBL_Users.User_ID` |
| Solution_Score | number | 1–5 (validado en código; probablemente también `CHECK` en BD) |
| Attention_Score | number | 1–5 |
| Comment | string, nullable | |
| Created_At | timestamp | |

**Relaciones:**
- `Request_ID` → `TBL_Requests.Request_ID`
- `Rated_By` → `TBL_Users.User_ID`
- Referenciada por `TBL_Resolution_Rating_Resolvers.Rating_ID`

---

### TBL_Satisfaction_Ratings

**Propósito:** Calificación general de satisfacción del usuario con PRISMA (no
ligada a un ticket puntual), con rate-limit configurable.
**Módulo relacionado:** `supabase/functions/api/handlers/system.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Rating_ID | number | PK |
| User_ID | number | FK a `TBL_Users.User_ID` |
| Score | number | |
| Comment | string, nullable | |
| Created_At | timestamp | Usada para el rate-limit (`RATING_RATE_LIMIT_DAYS`, hoy configurado en `0` = sin límite) |

**Relaciones:**
- `User_ID` → `TBL_Users.User_ID`

---

### TBL_Seguimientos_Solvi

**Propósito:** Seguimientos (log de acciones) nativos de un ticket SOLVI,
sincronizados desde el sistema externo SOLVI.
**Módulo relacionado:** `supabase/functions/api/handlers/solvi.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| seguimientos_solvi_id | number | PK; `snake_case` (convención distinta al resto del esquema, es tabla de integración) |
| seguimientos_solvi_id_ticket | number | FK a `TBL_Ticket_Solvi.ticket_solvi_id` |
| seguimientos_solvi_tipo_de_accion | string | |
| seguimientos_solvi_action_date | timestamp, nullable | |
| seguimientos_solvi_descripcion | string | |
| seguimientos_solvi_correo_actor | string | Email del actor (no hay `User_ID`: SOLVI identifica por correo) |
| seguimientos_solvi_actor | string | Nombre del actor |

**Relaciones:**
- `seguimientos_solvi_id_ticket` → `TBL_Ticket_Solvi.ticket_solvi_id`
- Referenciada por `TBL_Ticket_Attachments_Solvi.seguimiento_id`

---

### TBL_Solvi_Comment_Mentions

**Propósito:** Igual que `TBL_Comment_Mentions` pero para comentarios PRISMA
sobre tickets SOLVI.
**Módulo relacionado:** `supabase/functions/api/handlers/solvi.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Comment_ID | number | FK a `TBL_Solvi_Comments.Comment_ID` |
| Mentioned_User_ID | number | FK a `TBL_Users.User_ID` |

**Relaciones:**
- `Comment_ID` → `TBL_Solvi_Comments.Comment_ID`
- `Mentioned_User_ID` → `TBL_Users.User_ID`

---

### TBL_Solvi_Comments

**Propósito:** Comentarios que el personal de PRISMA agrega sobre un ticket
SOLVI (capa propia de PRISMA, distinta de los seguimientos nativos de SOLVI).
**Módulo relacionado:** `supabase/functions/api/handlers/solvi.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Comment_ID | number | PK |
| Comment_Ticket_ID | number | FK a `TBL_Ticket_Solvi.ticket_solvi_id` |
| Comment_User_ID | number | FK a `TBL_Users.User_ID` |
| Comment_Text | string | |
| Comment_Created_At | timestamp | |

**Relaciones:**
- `Comment_Ticket_ID` → `TBL_Ticket_Solvi.ticket_solvi_id`
- `Comment_User_ID` → `TBL_Users.User_ID`

---

### TBL_Solvi_Participants

**Propósito:** Igual que `TBL_Request_Participants` pero para tickets SOLVI.
**Módulo relacionado:** `supabase/functions/api/handlers/solvi.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Ticket_ID | number | FK a `TBL_Ticket_Solvi.ticket_solvi_id` |
| User_ID | number | FK a `TBL_Users.User_ID` |
| Added_Via | string | Valor visto: `'mention'` |
| Added_By | number, nullable | FK a `TBL_Users.User_ID` |
| Created_At | timestamp | |

**Relaciones:**
- `Ticket_ID` → `TBL_Ticket_Solvi.ticket_solvi_id`
- `User_ID`, `Added_By` → `TBL_Users.User_ID`

---

### TBL_Sprint

**Propósito:** Períodos de trabajo (sprints) con fecha de inicio/fin, usados
para planificar y auto-asignar solicitudes de usuarios externos.
**Módulo relacionado:** `supabase/functions/api/handlers/sprints.ts`
(documentado también en `documentacion/modulos/07-sprints-y-estadisticas.md`);
usado en `handlers/requests.ts` (auto-asignación), `handlers/migration.ts`.
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Sprint_ID | number | PK |
| Sprint_Text | string | Nombre/etiqueta del sprint |
| Sprint_Start_Date | string (timestamp), nullable | `supabase.types.ts` lo declara no-nullable, pero `migration.ts` inserta `null` explícitamente — discrepancia |
| Sprint_End_Date | string (timestamp), nullable | Misma discrepancia que `Sprint_Start_Date` |

**Relaciones (confirmadas por `supabase.types.ts`):**
- Referenciado por `TBL_Request_Sprint.Request_Sprint_ID`, `TBL_Sprint_Team_Capacity.Sprint_ID`

---

### TBL_Sprint_Team_Capacity

**Propósito:** Capacidad externa por equipo dentro de un sprint (cuántos
tickets de usuarios externos puede recibir ese equipo en ese sprint), usada
para la auto-asignación de sprint al crear un ticket.
**Módulo relacionado:** `supabase/functions/api/handlers/sprints.ts`,
`handlers/requests.ts::createRequest`.

| Columna | Tipo | Notas |
|---|---|---|
| Capacity_ID | number | PK |
| Sprint_ID | number | FK a `TBL_Sprint.Sprint_ID` |
| Board_Team_ID | number | FK a `TBL_Board_Teams.Board_Team_ID` |
| External_Capacity | number | Default aplicado en código si falta: `20` |

**Relaciones:**
- `Sprint_ID` → `TBL_Sprint.Sprint_ID`
- `Board_Team_ID` → `TBL_Board_Teams.Board_Team_ID`

**Clave única:** `(Sprint_ID, Board_Team_ID)` — visto en el `onConflict` de los `upsert()`.

---

### TBL_Sub_Team_Members

**Propósito:** Tabla puente entre sub-equipos y sus integrantes (usuarios).
**Módulo relacionado:** `supabase/functions/api/handlers/subteams.ts`,
`handlers/users.ts` (`fetchMembersBySubTeams`), `handlers/requests.ts`
(notificación a sub-equipos en tickets externos), `handlers/system.ts`
(notificación de bug reports).

| Columna | Tipo | Notas |
|---|---|---|
| Sub_Team_Member_Sub_Team_ID | number | FK a `TBL_Sub_Teams.Sub_Team_ID` |
| Sub_Team_Member_User_ID | number | FK a `TBL_Users.User_ID` |

**Relaciones:**
- `Sub_Team_Member_Sub_Team_ID` → `TBL_Sub_Teams.Sub_Team_ID`
- `Sub_Team_Member_User_ID` → `TBL_Users.User_ID`

**Clave única:** `(Sub_Team_Member_Sub_Team_ID, Sub_Team_Member_User_ID)` — visto en `onConflict`.

---

### TBL_Sub_Team_Supervisors

**Propósito:** Marca qué integrantes de un sub-equipo son supervisores (regla:
un supervisor debe ser también integrante).
**Módulo relacionado:** `supabase/functions/api/handlers/subteams.ts`,
`handlers/history.ts` (control de acceso al historial de auditoría).

| Columna | Tipo | Notas |
|---|---|---|
| Sub_Team_Supervisor_Sub_Team_ID | number | FK a `TBL_Sub_Teams.Sub_Team_ID` |
| Sub_Team_Supervisor_User_ID | number | FK a `TBL_Users.User_ID` |

**Relaciones:**
- `Sub_Team_Supervisor_Sub_Team_ID` → `TBL_Sub_Teams.Sub_Team_ID`
- `Sub_Team_Supervisor_User_ID` → `TBL_Users.User_ID`

**Clave única:** `(Sub_Team_Supervisor_Sub_Team_ID, Sub_Team_Supervisor_User_ID)`.

---

### TBL_Sub_Teams

**Propósito:** Sub-equipos dentro de un equipo de tablero (`TBL_Board_Teams`);
agrupan integrantes y supervisores para asignación de trabajo más granular.
**Módulo relacionado:** `supabase/functions/api/handlers/subteams.ts`; usado en
`handlers/requests.ts` (notificación externa), `handlers/system.ts`,
`shared/selects.ts`.
**Fuente de alta confianza:** cubierta por `supabase.types.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Sub_Team_ID | number | PK |
| Sub_Team_Team_ID | number | **Nombre confuso**: FK a `TBL_Board_Teams.Board_Team_ID` (el "Team" acá es el board team, no `TBL_Teams`) |
| Sub_Team_Name | string | |
| Sub_Team_Color | string | |

**Relaciones (confirmadas por `supabase.types.ts`):**
- `Sub_Team_Team_ID` → `TBL_Board_Teams.Board_Team_ID`
- Referenciado por `TBL_Sub_Team_Members.Sub_Team_Member_Sub_Team_ID`, `TBL_Sub_Team_Supervisors.Sub_Team_Supervisor_Sub_Team_ID`, `TBL_Request_Sub_Team.Request_Sub_Team_ID`

---

### TBL_Team_Column_Config

**Propósito:** Override por equipo del comportamiento de una columna global del
board: visibilidad, si requiere evidencia para cerrar, si cierra el ticket,
colores propios, y si marca el inicio del conteo de estadísticas.
**Módulo relacionado:** `supabase/functions/api/handlers/teamColumnConfig.ts`;
consultada por `shared/requests.ts::isCloseColumn`.

| Columna | Tipo | Notas |
|---|---|---|
| Config_ID | number | PK |
| Team_ID | number | FK a `TBL_Board_Teams.Board_Team_ID` |
| Column_ID | number | FK a `TBL_Board_Columns.Board_Column_ID` |
| Is_Visible | boolean | Default aplicado en código si no hay fila: `true` |
| Evidence_Required | boolean | Default: `false` |
| Evidence_Label | string, nullable | |
| Is_Close_Column | boolean | Default: `false`; determina si mover/cerrar a esta columna marca el ticket como finalizado |
| Is_Stats_Start | boolean | Default: `false`; solo una columna por equipo puede tenerlo en `true` (aplicado en código, no visto como constraint) |
| Team_Column_Color | string, nullable | |
| Team_Column_Title_Color | string, nullable | |

**Relaciones:**
- `Team_ID` → `TBL_Board_Teams.Board_Team_ID`
- `Column_ID` → `TBL_Board_Columns.Board_Column_ID`

**Clave única:** `(Team_ID, Column_ID)` — visto en `onConflict`.

---

### TBL_Teams

**Propósito:** Equipos organizacionales de personas (estructura interna), hijos
de un `TBL_Departments`. **Distinto** de `TBL_Board_Teams` (los tableros
Kanban).
**Módulo relacionado:** `supabase/functions/api/handlers/orgUnits.ts`; leído en
`handlers/users.ts`, `shared/selects.ts` (`requester_team`).

| Columna | Tipo | Notas |
|---|---|---|
| Team_ID | number | PK |
| Team_Name | string | |
| Team_Code | string | Normalizado a minúsculas |
| Department_ID | number | FK a `TBL_Departments.Department_ID` |
| Created_At | timestamp | |

**Relaciones:**
- `Department_ID` → `TBL_Departments.Department_ID`
- Referenciada por `TBL_Users.Team_ID`, `TBL_Requests.Request_Requester_Team_ID`

---

### TBL_Template_Field_Renames

**Propósito:** Auditoría de renombrados de `key` de campos de una plantilla,
registrando cuántas solicitudes se vieron afectadas por cada renombre.
**Módulo relacionado:** `supabase/functions/api/handlers/templates.ts`,
`jobs/renameJob.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Template_ID | number | FK a `TBL_Requests_Templates.Request_Template_ID` |
| Old_Key | string | |
| New_Key | string | |
| Renamed_By | number, nullable | FK a `TBL_Users.User_ID` |
| Renamed_At | timestamp | |
| Requests_Affected | number | Cantidad de tickets actualizados por ese renombre |

**Relaciones:**
- `Template_ID` → `TBL_Requests_Templates.Request_Template_ID`
- `Renamed_By` → `TBL_Users.User_ID`

**Nota:** no se observó una columna de ID propia en el `insert`; probablemente
existe un PK autogenerado no seleccionado en el código.

---

### TBL_Ticket_Attachments_Solvi

**Propósito:** Adjuntos de tickets/seguimientos SOLVI (pueden colgar del ticket
directamente o de uno de sus seguimientos).
**Módulo relacionado:** `supabase/functions/api/handlers/solvi.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| id | number | PK |
| created_at | timestamp | |
| attachment_path | string, nullable | Ruta dentro del bucket |
| attachment_type | string, nullable | |
| id_ticket | number, nullable | FK a `TBL_Ticket_Solvi.ticket_solvi_id`; puede ser `null` si el adjunto cuelga de un seguimiento |
| seguimiento_id | number, nullable | FK a `TBL_Seguimientos_Solvi.seguimientos_solvi_id` |
| storage_bucket | string, nullable | Puede venir `null`; el código usa fallback fijo `'ticket-attachments'` |
| file_name | string, nullable | |

**Relaciones:**
- `id_ticket` → `TBL_Ticket_Solvi.ticket_solvi_id`
- `seguimiento_id` → `TBL_Seguimientos_Solvi.seguimientos_solvi_id`

---

### TBL_Ticket_Solvi

**Propósito:** Tickets del sistema externo SOLVI, sincronizados a Supabase para
que PRISMA los muestre de forma unificada. A diferencia de los tickets PRISMA,
no tienen flag de confidencialidad y el solicitante/resolutor se identifican
por **correo** (texto), no por `User_ID`.
**Módulo relacionado:** `supabase/functions/api/handlers/solvi.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| ticket_solvi_id | number | PK; `snake_case` |
| ticket_solvi_titulo | string | |
| ticket_solvi_estado | string, nullable | |
| ticket_solvi_fuente | string, nullable | |
| ticket_solvi_solicitante | string, nullable | Nombre (texto) |
| ticket_solvi_correo_solicitante | string, nullable | Email; usado para "mis tickets SOLVI" vía `ilike` |
| ticket_solvi_resolutor | string, nullable | Nombre (texto) |
| ticket_solvi_categoria | string, nullable | |
| ticket_solvi_subcategoria | string, nullable | |
| ticket_solvi_ans | string, nullable | Probablemente "Acuerdo de Nivel de Servicio" (SLA) |
| ticket_solvi_fechaapertura | timestamp, nullable | |
| ticket_solvi_fechamaxima | string, nullable | |
| FechaCierreReal | string, nullable | **Única columna en `PascalCase`** de esta tabla (se selecciona entre comillas dobles); inconsistencia de convención frente al resto de columnas `snake_case` |
| ticket_solvi_correo_resolutor | string, nullable | Email |
| ticket_solvi_descripcion | string | |
| ticket_solvi_articulo | string, nullable | |

**Relaciones:**
- Referenciada por `TBL_Seguimientos_Solvi.seguimientos_solvi_id_ticket`, `TBL_Ticket_Attachments_Solvi.id_ticket`, `TBL_Solvi_Comments.Comment_Ticket_ID`, `TBL_Solvi_Participants.Ticket_ID`
- No tiene FK real hacia `TBL_Users`: la vinculación con usuarios PRISMA se hace comparando `ticket_solvi_correo_solicitante`/`ticket_solvi_correo_resolutor` contra `TBL_Users.User_Email` en tiempo de ejecución, no a nivel de esquema

---

### TBL_User_Identities

**Propósito:** Identidades de correo asociadas a un usuario (un mismo `User_ID`
puede tener varios correos registrados); usada para pre-registro antes del
primer login y para resolver destinatarios de correo.
**Módulo relacionado:** `supabase/functions/api/handlers/users.ts`
(`preRegisterUser`); leída indirectamente vía la vista `VW_User_Notification_Emails`
en `email/send.ts`.

| Columna | Tipo | Notas |
|---|---|---|
| Identity_User_ID | number | FK a `TBL_Users.User_ID` |
| Identity_Email | string | |
| Identity_Is_Primary | boolean | |
| Identity_Notify | boolean (inferido) | **No se observa un `insert`/`select` directo de esta columna en el código**; se infiere su existencia solo por un comentario en `email/send.ts` que dice que la vista "filtra... identidades con `Identity_Notify = false`". Marcado como incertidumbre |

**Relaciones:**
- `Identity_User_ID` → `TBL_Users.User_ID`

**Nota:** existe una vista `VW_User_Notification_Emails` (no es una tabla; fuera
del alcance de "tablas" de este documento) que expone `User_ID, Identity_Email`
ya filtrados por usuario activo e identidad notificable, usada por
`email/send.ts` para resolver destinatarios reales.

---

### TBL_Users

**Propósito:** Usuarios de PRISMA (personal interno y clientes/usuarios
externos), con su rol, departamento, equipo organizacional y estado de
onboarding/actividad.
**Módulo relacionado:** `supabase/functions/api/handlers/users.ts`; leída y
referenciada desde prácticamente todos los demás handlers.
**Fuente de alta confianza parcial:** `supabase.types.ts` documenta 7 columnas;
al código le faltan `Department_ID`, `Team_ID`, `Is_New` e `"Is_Active"`, todas
en uso activo (onboarding, borrado lógico, visibilidad de boards).

| Columna | Tipo | Notas |
|---|---|---|
| User_ID | number | PK |
| User_Name | string | |
| User_Email | string | Usado también para pre-registro (`ilike` case-insensitive) |
| User_EntraID | string | ID de Azure AD/Entra; vacío (`''`) en usuarios pre-registrados hasta su primer login |
| User_Avatar_url | string | |
| User_Role | string | `'admin' \| 'member'` — **`'ti_member'` NO es un valor real**, pese a que el código lo compara en varios lugares por retrocompatibilidad; la pertenencia a TI se determina por `Department_ID === 7`, no por rol |
| Department_ID | number, nullable | **No está en `supabase.types.ts`**; FK a `TBL_Departments.Department_ID` |
| Team_ID | number, nullable | **No está en `supabase.types.ts`**; FK a `TBL_Teams.Team_ID` |
| Is_New | boolean | **No está en `supabase.types.ts`**; controla si el usuario debe pasar por onboarding |
| "Is_Active" | boolean | **No está en `supabase.types.ts`**; requiere comillas dobles en SQL/PostgREST; borrado lógico (`deactivateUser`/`reactivateUser`) |
| User_Created_At | string (timestamp) | |

**Relaciones (confirmadas por `supabase.types.ts` donde aplica, más las inferidas):**
- `Department_ID` → `TBL_Departments.Department_ID`
- `Team_ID` → `TBL_Teams.Team_ID`
- Referenciada por prácticamente toda tabla con un `*_User_ID`, `*_By` o similar: `TBL_Attachments`, `TBL_Comments`, `TBL_Comment_Mentions`, `TBL_Requests.Request_Requested_By`, `TBL_Requests_Assignments`, `TBL_Requests_History.Changed_By`, `TBL_Notifications`, `TBL_Client_Feedback`, `TBL_Resolution_Ratings`, `TBL_Resolution_Rating_Resolvers`, `TBL_Satisfaction_Ratings`, `TBL_Bug_Reports`, `TBL_Sub_Team_Members`, `TBL_Sub_Team_Supervisors`, `TBL_Board_Team_Access`, `TBL_User_Identities`, `TBL_Email_Logs`, `TBL_Announcements.created_by`, `TBL_Background_Jobs.Job_Created_By`, `TBL_Export_History.Export_User_ID`, `TBL_Template_Field_Renames.Renamed_By`, `TBL_Request_Participants`, `TBL_Solvi_Comments`, `TBL_Solvi_Comment_Mentions`, `TBL_Solvi_Participants`

---

## Notas y hallazgos

1. **`TBL_Boards` y `TBL_Request_CRM_Example` están en desuso / son legacy.**
   Se confirmó con `grep -r` sobre `supabase/` y `src/` que ninguna de las dos
   aparece en ningún `.from(...)` de la Edge Function actual ni en ningún otro
   código fuente del repositorio. Ambas **solo existen** en
   `src/types/supabase.types.ts` (el tipo autogenerado), lo que sugiere que en
   algún momento existieron como tablas reales (probablemente al inicio del
   proyecto, cuando el modelo tenía múltiples "boards" reales) y luego se
   dejaron de usar sin regenerar el tipo. Esto es consistente con el hallazgo
   siguiente.

2. **El concepto de "board" quedó como un entero suelto, no como una tabla.**
   Numerosas columnas (`Request_Board_ID`, `Board_Column_Board_ID`,
   `Label_Board_ID`, `Email_Template_Board_ID`, `Request_Template_Board_ID`)
   siguen usándose activamente como si apuntaran a un "board", y el tipo
   generado (`supabase.types.ts`) efectivamente las declara como FK a
   `TBL_Boards`. Pero como esa tabla está en desuso (ver punto 1), todo indica
   que PRISMA colapsó su modelo a un **board implícito único** (se ve, por
   ejemplo, en `handlers/sprints.ts::triggerSprintStartMoves`, que usa
   `boardId ?? 1` como default). No se pudo confirmar con certeza si
   `TBL_Boards` fue eliminada de la base real o si simplemente ya no se
   consulta — solo que el código no la usa.

3. **Nombres de columna "ID" que en realidad son claves foráneas a *otra*
   tabla**, no identificadores propios de la fila. Este patrón aparece en casi
   todas las tablas puente de este esquema y puede confundir a quien lea el
   código sin este mapeo:
   - `TBL_Request_Sprint.Request_Sprint_ID` → en realidad es `Sprint_ID`.
   - `TBL_Request_Team.Request_Team_ID` → en realidad es `Board_Team_ID`.
   - `TBL_Requests_Assignments.Request_Assignment_ID` → en realidad es `Request_ID`.

4. **Tipo de `Request_ID` (y de otros IDs "modernos") incierto.** El tipo
   generado (`supabase.types.ts`) declara `Request_ID: number`, pero
   prácticamente todos los handlers actuales tipan sus payloads como
   `requestId: string` (y lo mismo pasa con `Job_ID`, `Export_ID`, `Report_ID`
   de `TBL_Bug_Reports`). No se pudo determinar con certeza si esto refleja: (a)
   un cambio real de tipo de columna (p. ej. a `bigint` mapeado a `string` para
   evitar pérdida de precisión en JS, o a `uuid`/`text`), o (b) simple
   convención de tipado en TypeScript sin que la columna real haya cambiado. Se
   documentó cada columna con el tipo más probable según el contexto de uso,
   señalando la incertidumbre explícitamente.

5. **`Request_Deadline` y `Request_Time_Consumed`** (columnas de
   `TBL_Requests`) solo aparecen en el tipo generado y **no se encontró ningún
   uso** en el código actual de la Edge Function ni en las selects
   (`BASE_SELECT`, `BASE_SELECT_LIGHT`, `DETAIL_SELECT`, `STATS_SELECT`). Es
   posible que sigan existiendo como columnas de la tabla real pero ya no se
   usen (reemplazadas por `Request_Finished_At` y `Request_Logged_Hours`
   respectivamente), o que ya no existan y el tipo simplemente no se
   regeneró. Se documentaron igual, marcadas como posiblemente obsoletas.

6. **Convenciones de nomenclatura mixtas.** El esquema es mayormente
   `PascalCase` con prefijo `TBL_`, pero hay dos grupos que rompen la
   convención:
   - `TBL_Announcements` usa `snake_case` completo (`announcement_id`,
     `is_active`, `show_in`, etc.).
   - Las tablas de la integración SOLVI (`TBL_Ticket_Solvi`,
     `TBL_Seguimientos_Solvi`, `TBL_Ticket_Attachments_Solvi`) usan
     `snake_case`, salvo una columna suelta en `TBL_Ticket_Solvi`
     (`FechaCierreReal`) que quedó en `PascalCase` — posible resabio de una
     migración parcial de nomenclatura o de un import point-in-time desde el
     sistema SOLVI original.

7. **`User_Role = 'ti_member'` no es un valor real** de `TBL_Users.User_Role`
   (solo existen `'admin'` y `'member'` como valores efectivamente insertados),
   pero varios fragmentos de código todavía comparan contra ese string por
   compatibilidad histórica — están comentados explícitamente en
   `shared/requests.ts` y `handlers/requests.ts` advirtiendo que la
   pertenencia real a TI se determina por `Department_ID === 7`, no por rol.
   Quien lea el código sin este contexto podría asumir erróneamente que
   `'ti_member'` es un rol vigente.

8. **Vista `VW_User_Notification_Emails`** (no es una tabla, está fuera del
   alcance de este documento pero se menciona porque la Edge Function la
   consulta en `email/send.ts`): resuelve, para una lista de `User_ID`, todas
   sus identidades de correo notificables (filtrando usuarios inactivos e
   identidades con `Identity_Notify = false`, según comentario del código).
   Probablemente se construye sobre `TBL_Users` + `TBL_User_Identities`, pero
   no se pudo confirmar su definición SQL exacta al no existir migraciones en
   el repo.

9. **Varias tablas puente no muestran una columna de ID propia** en ningún
   `select`/`insert` observado (`TBL_Comment_Mentions`, `TBL_Solvi_Comment_Mentions`,
   `TBL_Board_Team_Access`, `TBL_Migration_Map`, `TBL_Template_Field_Renames`).
   Es posible que tengan un PK autogenerado que el código simplemente no
   necesita leer nunca, o que su clave primaria sea compuesta sobre las
   columnas que sí se usan. No se puede confirmar cuál de las dos opciones es
   la real sin acceso al esquema.

10. **Cobertura de `src/types/supabase.types.ts`**: de las 49 tablas activas,
    17 están cubiertas (parcialmente, en varios casos) por ese archivo
    autogenerado: `TBL_Attachments`, `TBL_Board_Columns`, `TBL_Board_Teams`,
    `TBL_Comments`, `TBL_Email_Logs`, `TBL_Email_Templates`, `TBL_Labels`,
    `TBL_Request_Labels`, `TBL_Request_Sprint`, `TBL_Request_Team`,
    `TBL_Requests`, `TBL_Requests_Assignments`, `TBL_Requests_History`,
    `TBL_Requests_Templates`, `TBL_Sprint`, `TBL_Sub_Teams`, `TBL_Users`. Las
    32 restantes no aparecen en absoluto en ese archivo y se documentaron
    exclusivamente a partir del código de la Edge Function.
