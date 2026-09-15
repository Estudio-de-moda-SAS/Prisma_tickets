# PRISMA — Arquitectura general

> Documento técnico de referencia. Complementa al [`README.md`](../README.md) de la raíz del repo (que sigue siendo la guía de instalación/arranque) y a los documentos de módulo en [`modulos/`](modulos/) y al mapeo de base de datos en [`BASE_DE_DATOS.md`](BASE_DE_DATOS.md).

## 1. Qué es PRISMA

PRISMA es el sistema interno de gestión de solicitudes (ITSM) de **Estudio de Moda S.A.S.**: centraliza las solicitudes que los departamentos internos ("clientes") dirigen al equipo de Tecnología, con un tablero Kanban, plantillas dinámicas, sprints, automatizaciones, notificaciones y exportaciones. Está **en producción** y en uso activo por la organización.

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite, TanStack Query, Zustand, React Router v6, dnd-kit, Tiptap, Chart.js |
| Backend | Supabase (PostgreSQL + una única Edge Function en Deno) |
| Storage | Supabase Storage (adjuntos, URLs firmadas generadas en el servidor) |
| Autenticación | Microsoft Entra ID (Azure AD) vía OAuth2/OIDC — en migración hacia Supabase Auth (ver §5) |
| Correo | API corporativa basada en Microsoft Graph |
| Despliegue frontend | Azure Static Web Apps |
| PWA | vite-plugin-pwa (Workbox), instalable en escritorio y Android |

## 3. Principio central: punto único de entrada

El frontend **nunca** consulta la base de datos directamente (con una excepción parcial y deliberada, ver §3.1). Toda operación pasa por:

```ts
apiClient.call(action, payload)   // src/lib/apiClient.ts
```

`apiClient` obtiene el token de sesión vigente (Azure AD o Supabase Auth, según `config.USE_SUPABASE_AUTH`) y hace `POST` a la Edge Function `api` con `{ action, payload }` y el header `Authorization: Bearer <token>`.

```
Frontend (React)
   │  apiClient.call(action, payload)
   ▼
Edge Function "api" (Deno) — supabase/functions/api/index.ts
   │  1) Verifica el JWT (Azure AD o Supabase Auth)
   │  2) createDispatch(supabase) — supabase/functions/api/router.ts
   │  3) El router busca `action` en la tabla combinada de handlers
   │     (supabase/functions/api/handlers/*.ts) y lo invoca
   │  4) El handler aplica reglas de negocio y permisos, y toca:
   ▼
PostgreSQL (service_role, sin RLS) · Supabase Storage · API de correo (Graph)
```

Puntos clave del entry point (`supabase/functions/api/index.ts`):

- Solo acepta `POST` (y `OPTIONS` para CORS preflight).
- `get_public_announcements` es la única acción **pública** (sin JWT) — sirve los anuncios activos para mostrarlos antes de iniciar sesión.
- `_processBackgroundJobChunk` y `_processExportJobChunk` son **auto-invocaciones internas** (la propia función se llama a sí misma para seguir procesando un job por chunks) protegidas por el header `X-Internal-Job-Secret` en vez de un JWT de usuario — ver §6.1.
- `migrateRequest`, `upsertLabelByName`, `upsertSprintByName`, `migrationFetchUsers` también se protegen con ese mismo secreto interno: es el canal que usa la herramienta externa `prisma-migrations` (ver [`modulos/10-migracion-de-datos.md`](modulos/10-migracion-de-datos.md)) para escribir en la base de datos sin ser un usuario final.
- El resto de acciones requieren `Authorization: Bearer <token>` válido.

El cliente de Supabase que usa la Edge Function se crea con la **service_role key** (`createServiceClient()`), es decir, **sin RLS**: toda la seguridad de acceso a datos depende de que cada handler valide correctamente permisos y visibilidad — no hay una red de seguridad a nivel de base de datos para las rutas normales. Ver el riesgo asociado en §8.

### 3.1. Excepciones al punto único de entrada

Hay dos grietas conocidas en el principio "el frontend nunca toca Supabase directamente":

**a) Lecturas directas a PostgREST (RLS), intencional y acotada.** Desde una migración marcada como "Fase 4" en el código, dos operaciones de lectura del tablero (`SupabaseRequestsService.fetchByTeamCode` y `fetchUncategorized`, en `src/features/requests/services/SupabaseRequestsService.ts`) pueden saltarse la Edge Function y consultar PostgREST directamente con el cliente `src/lib/supabaseClient.ts`, protegidas por RLS en vez de por un handler. Está controlado por el flag `config.USE_DIRECT_READS` (`src/config.ts`) y requiere `USE_SUPABASE_AUTH = true` (token de sesión "authenticated").

**b) Escrituras directas en la integración SOLVI, no documentada como intencional.** La creación de tickets SOLVI y la subida de sus adjuntos escriben **directo a Supabase desde el navegador**, sin pasar por `apiClient.call`/la Edge Function (ver [`modulos/11-integracion-solvi.md`](modulos/11-integracion-solvi.md)). A diferencia del caso (a), esto no está detrás de un flag ni parece deliberado como excepción arquitectónica — es la zona del código a tratar con más cautela del sistema (ver también §8.10).

Ver riesgos de ambas en §8.

## 4. Ciclo de vida de una petición

1. El componente/hook de React llama a un método de servicio (p. ej. `SupabaseRequestsService`) que internamente usa `apiClient.call(action, payload)`.
2. `apiClient` resuelve el token vigente y hace `fetch` a `${VITE_SUPABASE_URL}/functions/v1/api`.
3. La Edge Function valida el JWT (ver §5), crea un `dispatch` (`createDispatch(supabase)` en `router.ts`) y lo invoca con `(action, payload)`.
4. `dispatch` busca `action` en la tabla combinada `handlers` (spread de los ~25 mapas de handlers por dominio) y ejecuta el handler correspondiente con `{ supabase, dispatch }` como contexto — un handler puede, a su vez, invocar otras acciones vía `dispatch` (ver `ActionContext` en `supabase/functions/api/shared/types.ts`).
5. El handler valida reglas de negocio/permisos, lee/escribe en PostgreSQL y dispara efectos secundarios (notificaciones in-app, correo, historial de auditoría) cuando corresponde.
6. La respuesta viaja como `{ data: <resultado> }`; los errores como HTTP 4xx/5xx con `errorResponse` (headers CORS incluidos siempre).
7. En el frontend, las mutaciones aplican **actualización optimista** en TanStack Query/Zustand antes de confirmar con el servidor (ver §8 — `invalidateQueries` solo no alcanza para la percepción de velocidad que requiere el tablero).

## 5. Autenticación y autorización

### 5.1. Autenticación (¿quién sos?)

PRISMA está **a mitad de una migración** de MSAL/Azure AD directo hacia Supabase Auth (con Azure como proveedor OIDC dentro de Supabase). Este estado dual es intencional y temporal, controlado por `config.USE_SUPABASE_AUTH` (`src/config.ts`):

- `false` → login directo por MSAL (`src/auth/msal.ts`), comportamiento histórico.
- `true` (estado actual) → login vía Supabase Auth (`src/auth/supabaseAuth.ts`, `src/lib/supabaseClient.ts`), con Azure como identity provider detrás.

Del lado del backend, `supabase/functions/api/lib/auth.ts` acepta **ambos** tipos de token en cada request no interna: primero intenta `verifyAzureToken` (JWKS de Entra ID, valida `iss`, `aud=api://<CLIENT_ID>` y `tid`); si falla, intenta `verifySupabaseToken` (JWKS del propio proyecto Supabase, valida `iss`, `aud=authenticated` y `role=authenticated`). Solo si ambas fallan responde `401`. Esto permite convivir con usuarios en ambos esquemas mientras dura la migración (ver `TBL_User_Identities`, documentada en [`modulos/06-usuarios-y-autenticacion.md`](modulos/06-usuarios-y-autenticacion.md)).

### 5.2. Autorización (¿qué puede hacer/ver?)

No existe un middleware central de autorización por rol o por recurso. **Cada handler es responsable de validar** lo que corresponda, usando utilidades compartidas como:

- `supabase/functions/api/shared/boardAccess.ts` → `resolveVisibleBoardIds(supabase, userId)`: resuelve qué boards/equipos ve un usuario (admin de TI ve todo con `null` = sin restricción; el resto ve los boards de su departamento excluyendo los admin-only, más los otorgados por `TBL_Board_Team_Access`).
- Roles de aplicación (`src/auth/roles.ts`, fuente de verdad `TBL_Users.User_Role` + `Department_ID`):

  | Rol | Quién | Alcance |
  |---|---|---|
  | `admin` | TI (`Department_ID = 7`) con `User_Role = 'admin'` | Todo: tablero, configuración, automatizaciones, estadísticas |
  | `ti_member` | TI, sin rol admin | Tablero y estadísticas, sin panel de configuración ni automatizaciones |
  | `client` | Cualquier otro departamento | Inicio, crear solicitud, seguimiento de sus propias solicitudes; ve estadísticas solo si tiene ≥1 kanban asignado |

- Guards de React (`src/App.tsx`): `RequireAuth`, `RequireOnboarding`, `RequireTI`, `RequireStats`, `RequireAdmin` — protegen rutas en el **frontend**, pero son una capa de UX, no de seguridad: la validación real y obligatoria vive en cada handler del backend, porque el frontend es código que corre en el navegador del usuario.

## 6. Patrones recurrentes

### 6.1. Jobs en background por auto-invocación

Operaciones largas (exportar miles de tickets, renombrar un campo de plantilla en todos los tickets existentes) no se resuelven en una sola invocación HTTP. Patrón usado:

1. La acción "iniciar" crea una fila en `TBL_Background_Jobs` (o `TBL_Export_History` para exportaciones) y devuelve de inmediato un `jobId`.
2. La Edge Function se **auto-invoca** a sí misma (`fetch(SELF_URL, ...)` con el header `X-Internal-Job-Secret`) pasando `_processBackgroundJobChunk` o `_processExportJobChunk`, y sigue en segundo plano con `EdgeRuntime.waitUntil(...)` (o `.catch(() => {})` si `EdgeRuntime` no está disponible).
3. Cada invocación procesa un lote acotado (`JOB_CHUNK_SIZE=100` / `EXPORT_JOB_CHUNK_SIZE=500`, hasta `JOB_MAX_CHUNKS_PER_INVOKE=5` / `EXPORT_MAX_CHUNKS_PER_INVOKE=8` chunks por invocación — constantes en `supabase/functions/api/config.ts`) y, si queda trabajo, vuelve a auto-invocarse.
4. El frontend hace *polling* del estado del job para mostrar progreso.

Usado por: renombrado de campos de plantilla (`jobs/renameJob.ts`, [`modulos/08-plantillas.md`](modulos/08-plantillas.md)) y exportaciones (`jobs/exportJob.ts`, [`modulos/09-exportaciones.md`](modulos/09-exportaciones.md)).

### 6.2. Notificación combinada in-app + correo

`notifyEvent()` (`supabase/functions/api/handlers/notifyEvent.ts`) está *diseñado* para centralizar el patrón "avisá adentro de la app y, si corresponde, por correo": la parte in-app **siempre** se ejecuta; el correo es condicional (requiere `emailVars` **y** `requestId`, y que exista una plantilla de correo activa para el `eventKey`) y **best-effort** (try/catch dentro de `sendEventEmail`, para que un fallo de la API de Graph nunca tumbe la operación de negocio que lo originó).

> **Estado real (verificado por grep en todo el repo):** ningún handler de negocio importa `notifyEvent()` hoy — es el patrón *documentado como intención* pero no adoptado. Los módulos llaman por separado a `insertNotifications` (in-app) y a `sendEventEmail` (correo), replicando a mano la misma lógica de condición en cada punto de llamada. Además, `supabase/functions/api/shared/email.ts` contiene una **segunda implementación** de `sendEventEmail` que deja el correo en estado `pending` sin enviarlo nunca. Al tocar notificaciones, confirmar primero cuál de las dos implementaciones está activa en el import del handler que se está editando — ver el detalle en [`modulos/04-notificaciones-y-correo.md`](modulos/04-notificaciones-y-correo.md) y el riesgo correspondiente en §8.

### 6.3. Snapshot inmutable de plantilla

Cada ticket (`TBL_Requests`) guarda al crearse una copia congelada del esquema de su plantilla (`TBL_Requests_Templates`) vigente en ese momento. Si la plantilla cambia después, los tickets ya creados no se ven afectados — por eso renombrar un campo de plantilla requiere el job en background de §6.1 en vez de una simple actualización de la plantilla. Detalle en [`modulos/08-plantillas.md`](modulos/08-plantillas.md).

### 6.4. Chunking y paginación en consultas grandes

Tanto para exportar como para filtrar por relaciones (equipos, sprints, etiquetas, asignados), el código evita pedir listas gigantes de IDs a PostgREST en un solo `.in(...)`: usa procesamiento por lotes (*chunking*) para no perder rendimiento a medida que la base crece. El historial de columnas del tablero también pagina por cursor en vez de traer todo el histórico.

## 7. Estructura del repositorio

```
src/
├── api/                 # Servicios base (BaseSharePointListService — remanente de una integración previa)
├── auth/                # AuthProvider, roles, MSAL, Supabase Auth
├── components/           # ConfigPanel + layout compartido (Sidebar, Topbar, modales globales)
├── features/
│   ├── automations/      # Motor de reglas de automatización (frontend)
│   ├── exports/          # Exportaciones (frontend)
│   ├── requests/         # Núcleo: tickets, tablero Kanban, plantillas dinámicas
│   └── stats/            # Estadísticas/dashboard
├── graph/                # Integración con Microsoft Graph (frontend)
├── lib/                  # apiClient.ts (único gateway a datos), supabaseClient.ts, compressImage.ts
├── pages/                # Una página por ruta de React Router
├── store/                # Zustand: boardStore, filterStore, configStore, statsStore, timerStore, ...
├── styles/               # CSS a mano por dominio (BEM + variables, temas claro/oscuro)
└── types/                # commons.ts, supabase.types.ts (generado, DESACTUALIZADO — ver §8)

supabase/
├── config.toml           # verify_jwt = false a nivel de gateway (ver nota en el propio archivo: el JWT es de Azure AD/Supabase, no del secret HS256 que Supabase intentaría usar por defecto)
└── functions/api/
    ├── index.ts           # entry point HTTP (Deno.serve)
    ├── router.ts          # tabla acción→handler + createDispatch
    ├── config.ts          # env vars y constantes de tuning
    ├── lib/                # auth.ts (verificación JWT), supabase.ts, storage.ts, https.ts
    ├── shared/             # helpers de dominio compartidos (boardAccess, mappers, selects, criteria, requests, notifications, email, types, templateKeys)
    ├── email/send.ts       # envío vía Microsoft Graph + registro en TBL_Email_Logs
    ├── jobs/               # exportJob.ts, renameJob.ts (procesamiento por chunks)
    └── handlers/           # ~25 archivos, uno por dominio de negocio (ver tabla en §9)

prisma-migrations/         # Proyecto HERMANO independiente (ETL Excel → PRISMA), no se despliega
```

No existen migraciones `.sql` versionadas en el repositorio (ver riesgo en §8): la fuente de verdad del esquema es la base de datos de Supabase en sí.

## 8. Riesgos arquitectónicos y puntos frágiles conocidos ("fallos")

Esta sección documenta **riesgos de diseño y áreas frágiles**, no bugs puntuales ya resueltos. Es la referencia a revisar antes de tocar código en esas zonas.

1. **Sin RLS + sin autorización centralizada.** La Edge Function usa `service_role` (bypassa RLS por completo) y cada handler debe acordarse de llamar a `resolveVisibleBoardIds` u otra validación equivalente. Un handler nuevo que olvide esa validación expone datos entre departamentos/equipos sin que nada a nivel de base de datos lo impida. Al revisar un PR que agrega un handler, verificar explícitamente que valida rol/visibilidad.
2. **Excepción de lecturas directas (`USE_DIRECT_READS`).** `fetchByTeamCode` y `fetchUncategorized` dependen de que las políticas RLS de `TBL_Requests` (y tablas relacionadas) repliquen exactamente las mismas reglas que el handler equivalente de la Edge Function. Si diverge una de la otra (p. ej. se ajusta el filtro en el handler pero no en la política RLS, o viceversa), un usuario puede ver de más o de menos según qué código path se ejecute. Doble mantenimiento a vigilar.
3. **Migración de autenticación en curso (MSAL ⇄ Supabase Auth).** El backend acepta ambos tipos de token indefinidamente mientras `USE_SUPABASE_AUTH` no se retire del todo. Vigilar `TBL_User_Identities` para usuarios con estado inconsistente entre ambos proveedores (ver [`modulos/06-usuarios-y-autenticacion.md`](modulos/06-usuarios-y-autenticacion.md)).
4. **`src/types/supabase.types.ts` desactualizado.** Solo describe 19 de las 49 tablas reales que usa la Edge Function (confirmado por grep de `.from('TBL_...')` en `supabase/functions/`). El tipado de TypeScript sobre `Database` da una falsa sensación de exhaustividad. Regenerar con `supabase gen types typescript` periódicamente, y no asumir que una tabla ausente de ese archivo no existe.
5. **Sin migraciones SQL versionadas.** No hay carpeta `supabase/migrations/` en el repo: los cambios de esquema se aplican manualmente contra la base de datos. Esto dificulta reproducir el esquema en un entorno nuevo y detectar *drift* entre ambientes. Recordatorio operativo ya documentado en el README: tras agregar columnas hay que ejecutar `NOTIFY pgrst, 'reload schema';` o PostgREST seguirá sirviendo el esquema viejo.
6. **Envío de correo silenciosamente best-effort, y con dos implementaciones.** `sendEventEmail` atrapa cualquier error de la API de Graph para no tumbar la operación de negocio (correcto para no bloquear al usuario), pero implica que un fallo de correo (plantilla mal configurada, token de Graph vencido, etc.) no se ve en ningún lado salvo logs del servidor — no hay alerta visible ni reintento. Si se reportan "no me llegó el correo", el primer lugar a mirar es `TBL_Email_Logs` y los logs de la función, no la UI. Además existen **dos implementaciones** de `sendEventEmail` (`supabase/functions/api/email/send.ts` vs. `supabase/functions/api/shared/email.ts`, esta última deja el correo en `pending` sin enviarlo nunca) — confirmar cuál importa el handler que se está tocando antes de asumir que "el correo se envía". El helper `notifyEvent()` que debería unificar este patrón no está en uso (§6.2).
7. **Timestamps sin `Z`.** Los timestamps que devuelve Supabase no siempre incluyen el sufijo `Z` (UTC); si se parsean tal cual en JavaScript, el navegador puede interpretarlos en hora local y producir corrimientos de horas. Convención del proyecto: normalizar agregando `Z` antes de `new Date(...)`. Un commit reciente ("Fix de horas hábiles") corrigió justamente un cálculo de horas afectado por esto — zona de atención al tocar cualquier cálculo de fechas/SLA.
8. **Adjuntos en base64.** No enviar payloads base64 mayores a ~20 MB (límite práctico de la Edge Function/Storage); las imágenes deben comprimirse en el cliente (`src/lib/compressImage.ts`) antes de codificarlas. Solo se persiste la ruta del archivo; las URLs firmadas se generan siempre en el servidor, nunca en el cliente.
9. **Flags de desarrollo en `src/config.ts`.** `USE_MOCK`, `BYPASS_AUTH`, `USE_SUPABASE_AUTH`, `USE_DIRECT_READS` cambian el comportamiento global de la app. Verificar su valor antes de diagnosticar un bug "no reproducible" — un flag mal configurado en un entorno puede explicar comportamiento inesperado sin que haya ningún bug real.
10. **Integración SOLVI: escribe fuera del punto único de entrada, y en desarrollo activo.** Además de ser la parte del código con más commits de "fix" recientes (ver historial de `feat/SOLVI`), la creación de tickets SOLVI y sus adjuntos se hace con escrituras directas a Supabase desde el navegador (§3.1.b), no vía la Edge Function — es decir, sin las validaciones/permiso centralizados que sí aplican al resto del sistema, y dependiendo enteramente de que las políticas RLS estén bien configuradas para esas tablas. Tratar esta zona como menos madura que el resto del sistema; ver [`modulos/11-integracion-solvi.md`](modulos/11-integracion-solvi.md) para el detalle y sus puntos frágiles específicos (incluye además comentarios/menciones sin el chequeo de confidencialidad que sí tiene el módulo de comentarios normal, e implementaciones duplicadas de subida de adjuntos).
11. **PWA / versión.** `public/version.json` **nunca** debe entrar al precache del service worker (`globIgnores` en `vite.config.ts`) — si un cambio futuro al build de PWA lo precachea por accidente, el mecanismo de aviso de nueva versión (`VersionUpdateBanner.tsx`) deja de funcionar silenciosamente (los usuarios quedan en versiones viejas sin saberlo). Un bug puntual ya detectado en ese componente (`setTimeout` sin delay) está documentado en [`modulos/12-sistema-y-soporte.md`](modulos/12-sistema-y-soporte.md).
12. **Inconsistencia de tipo en `Request_ID`.** El tipo generado (obsoleto) lo declara `number`, pero el código actual lo trata como `string` en casi todos los puntos de uso. No es solo un detalle de tipado: mezclar ambos supuestos en código nuevo (comparaciones estrictas, claves de caché de React Query, parámetros de URL) es una fuente probable de bugs sutiles. Ver detalle en [`BASE_DE_DATOS.md`](BASE_DE_DATOS.md).
13. **Autorización por board casi no se aplica fuera de la gestión de equipos.** `resolveVisibleBoardIds` (§5.2) hoy solo se invoca desde `boardTeams.ts`. Los handlers de tickets, comentarios, adjuntos, cierre y feedback no verifican que el usuario tenga acceso al board/ticket sobre el que operan — ver [`modulos/02-ciclo-de-vida-del-ticket.md`](modulos/02-ciclo-de-vida-del-ticket.md). En la práctica esto se mitiga porque las pantallas solo ofrecen IDs de tickets visibles, pero un llamado directo a la Edge Function con un `Request_ID` ajeno no encontraría una barrera de autorización adicional del lado del servidor.

## 9. Handlers de la Edge Function (mapa completo)

Todos se combinan en `supabase/functions/api/router.ts`. Ante colisión de nombres de acción entre dos módulos, gana el último en el `spread` (ver orden en el propio archivo).

| Handler | Dominio | Documentado en |
|---|---|---|
| `requests.ts` | Tickets, tablero Kanban, asignación, sub-equipos | [`modulos/01-tickets-y-kanban.md`](modulos/01-tickets-y-kanban.md) |
| `closure.ts`, `feedback.ts`, `criteria.ts`, `comments.ts`, `attachments.ts`, `history.ts`, `resolutionRatings.ts` | Ciclo de vida colaborativo del ticket | [`modulos/02-ciclo-de-vida-del-ticket.md`](modulos/02-ciclo-de-vida-del-ticket.md) |
| `automationRules.ts` | Motor de automatizaciones | [`modulos/03-automatizaciones.md`](modulos/03-automatizaciones.md) |
| `notifications.ts`, `notifyEvent.ts`, `emailTemplates.ts`, `announcements.ts` | Notificaciones y correo | [`modulos/04-notificaciones-y-correo.md`](modulos/04-notificaciones-y-correo.md) |
| `orgUnits.ts`, `boardTeams.ts`, `subteams.ts`, `teamColumnConfig.ts`, `columns.ts`, `labels.ts` | Organización y equipos | [`modulos/05-organizacion-y-equipos.md`](modulos/05-organizacion-y-equipos.md) |
| `users.ts` | Usuarios y autenticación | [`modulos/06-usuarios-y-autenticacion.md`](modulos/06-usuarios-y-autenticacion.md) |
| `sprints.ts` | Sprints | [`modulos/07-sprints-y-estadisticas.md`](modulos/07-sprints-y-estadisticas.md) |
| `templates.ts` | Plantillas de solicitud | [`modulos/08-plantillas.md`](modulos/08-plantillas.md) |
| `exportJobs.ts` | Exportaciones | [`modulos/09-exportaciones.md`](modulos/09-exportaciones.md) |
| `migration.ts` | Migración de datos históricos (ETL) | [`modulos/10-migracion-de-datos.md`](modulos/10-migracion-de-datos.md) |
| `solvi.ts` | Integración SOLVI | [`modulos/11-integracion-solvi.md`](modulos/11-integracion-solvi.md) |
| `system.ts` | Bug reports, satisfacción, jobs genéricos | [`modulos/12-sistema-y-soporte.md`](modulos/12-sistema-y-soporte.md) |
| *(sin handler propio — consume `requests.ts`, `sprints.ts`, `teamColumnConfig.ts`, `resolutionRatings.ts`)* | Dashboards y métricas de desempeño | [`modulos/13-dashboard.md`](modulos/13-dashboard.md) |

## 10. Despliegue

Orden obligatorio en cada entrega (de [`README.md`](../README.md)):

1. **Migración de base de datos** — aplicar cambios de esquema en SQL manualmente contra Supabase. Si se agregan columnas: `NOTIFY pgrst, 'reload schema';`.
2. **Desplegar la Edge Function** — `supabase functions deploy api`.
3. **Compilar y publicar el frontend** — `npm run build` → Azure Static Web Apps (`staticwebapp.config.json` define el *fallback* de navegación SPA y cabeceras `no-cache` para `sw.js`/`version.json`).

## 11. Convenciones de desarrollo

- **Punto único de entrada:** el frontend solo habla con datos vía `apiClient.call(action, payload)` (excepción acotada en §3.1).
- **Identificadores SQL:** PascalCase entre comillas dobles (`"Request_ID"`), tablas con prefijo `TBL_`.
- **Actualizaciones optimistas** en el tablero: obligatorias para la percepción de velocidad; `invalidateQueries` solo genera demoras visibles al usuario.
- **Cache de PostgREST:** refrescar con `NOTIFY pgrst, 'reload schema';` tras migraciones que agreguen columnas.
- **Edge Functions (Deno):** los imports locales requieren extensión `.ts` explícita.
- **Fechas:** normalizar agregando `Z` a los timestamps de Supabase antes de parsearlos en JS (ver riesgo §8.7).
- **Adjuntos:** no enviar base64 > ~20 MB; comprimir imágenes antes de codificar; guardar solo la ruta, generar URLs firmadas en el servidor.
- **Consultas grandes:** usar *chunking* y paginación.
- **Plantillas:** snapshot inmutable por ticket al crearse (§6.3).
- **Documentación de código:** TSDoc (`/** ... */`) en frontend y backend, generado a HTML unificado con TypeDoc (`npm run docs`, ver README §"Documentación técnica"). Esta carpeta (`documentacion/`) es documentación de producto/arquitectura complementaria, escrita a mano, y **sí se versiona** (a diferencia de `docs/`, que es la salida generada de TypeDoc y está en `.gitignore`).

## 12. Glosario rápido (para evitar confusiones frecuentes)

| Término | Qué es | Dónde se define |
|---|---|---|
| Request / Ticket | Una solicitud creada por un cliente interno | `TBL_Requests` |
| Board | Un tablero Kanban. En la práctica el sistema opera sobre un único board implícito (`config.DEFAULT_BOARD_ID`), identificado solo por un entero suelto (`Request_Board_ID`, `Board_Column_Board_ID`, ...) — la tabla `TBL_Boards` que aparece en el tipo generado ya **no se usa** en ningún handler (confirmado por grep); el concepto de "board" como entidad propia quedó en desuso. | `TBL_Board_Columns` (columnas reales del tablero) — ver [`BASE_DE_DATOS.md`](BASE_DE_DATOS.md) |
| Board Team | Un equipo de TI visible como carril/filtro dentro de un board (p. ej. "Infraestructura", "Desarrollo") | `TBL_Board_Teams` |
| Department / Team (organizacionales) | La estructura organizacional real de la empresa (departamentos y equipos de negocio), NO necesariamente igual a los Board Teams del tablero | `TBL_Departments`, `TBL_Teams` — ver aclaración en [`modulos/05-organizacion-y-equipos.md`](modulos/05-organizacion-y-equipos.md) |
| Sub Team | Subdivisión interna de un Board Team, con miembros y supervisores propios, usada para rutear tickets | `TBL_Sub_Teams`, `TBL_Sub_Team_Members`, `TBL_Sub_Team_Supervisors` |
| Template | Plantilla de solicitud (define los campos dinámicos de un tipo de ticket) | `TBL_Requests_Templates` |
| Sprint | Período de trabajo al que se pueden asociar tickets, con capacidad por equipo | `TBL_Sprint`, `TBL_Sprint_Team_Capacity` |

---

*Última actualización de este documento: generado a partir de una revisión del código fuente. Si el código cambia, este documento puede quedar desactualizado — al tocar alguno de los mecanismos descritos aquí, actualízalo en el mismo PR.*
