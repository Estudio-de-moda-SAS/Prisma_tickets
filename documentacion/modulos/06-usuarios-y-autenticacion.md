# Módulo: Usuarios y Autenticación

## Resumen

PRISMA se autentica exclusivamente con cuentas corporativas de Microsoft
(Entra ID / Azure AD) — no existe registro con usuario/contraseña propio. El
proyecto está migrando el mecanismo de login de **MSAL directo contra Azure
AD** (camino legacy) hacia **Supabase Auth con Azure como proveedor OAuth**
(camino nuevo), controlado por el flag `config.USE_SUPABASE_AUTH`. Durante la
migración, el backend acepta tokens firmados por cualquiera de los dos
emisores. `TBL_Users` es la tabla de identidad central (rol, departamento,
equipo, estado activo); `TBL_User_Identities` permite asociar varios correos a
un mismo usuario, principalmente para pre-registrarlo antes de su primer
login. Todo usuario nuevo pasa por un onboarding obligatorio (elegir
departamento/equipo) antes de usar el resto de la app.

## Flujos de usuario

- **Primer login de un usuario nunca visto**: entra a `/login`, pulsa
  "Continuar con Microsoft 365", inicia sesión con su cuenta corporativa. El
  backend crea su fila en `TBL_Users` on-the-fly (`upsertUserByEntraId`) con
  `Is_New = true`. Es redirigido a `/onboarding` (`OnBoardingPage.tsx`), elige
  departamento y, si aplica, equipo organizacional, y confirma
  (`completeOnboarding`). Recién ahí entra a `/home`.
- **Primer login de un usuario pre-registrado**: un admin ya creó su fila en
  `TBL_Users` desde Config → Usuarios (`preRegisterUser`) con rol, departamento
  y equipo definidos de antemano, y `Is_New` en `false` o `true` según se
  quiera que pase o no por el selector. Cuando esa persona hace login por
  primera vez, el mismo `upsertUserByEntraId` debe resolver su fila existente
  (por correo, vía la identidad primaria ya creada) y completar su
  `User_EntraID`.
- **Login recurrente**: sesión persistida (localStorage, vía MSAL o vía
  supabase-js); el token se renueva en segundo plano sin pedir credenciales.
- **Logout**: cierra la sesión del proveedor activo y limpia el estado local.
- **Cuenta desactivada**: si `Is_Active = false`, toda la UI se reemplaza por
  una pantalla de "Acceso suspendido" (`AuthProvider.tsx`, `BlockedScreen`)
  con un link de contacto y botón de cerrar sesión — no se toca el router,
  simplemente no se renderiza la app.
- **Admin gestiona usuarios** (Config → Usuarios, `UsersConfig.tsx`): busca por
  nombre/correo, filtra activos/inactivos, pre-registra usuarios nuevos, edita
  rol/departamento/equipo/estado de onboarding de uno existente, desactiva o
  reactiva cuentas, y revisa "posibles duplicados" (mismo nombre, correos
  distintos) para intentar vincularlos.
- **Admin otorga acceso a boards extra**: dentro de la ficha de edición de un
  usuario `member`, el `BoardAccessPicker` (mismo archivo) le da acceso a
  kanbans puntuales fuera de su departamento — ver
  `documentacion/modulos/05-organizacion-y-equipos.md`.

## Arquitectura técnica

### Frontend

- `src/auth/AuthProvider.tsx` — contexto real de autenticación de la app
  (`AuthCtx`: `ready`, `dbReady`, `dbError`, `account`, `dbUser`, `getToken`,
  `signIn`, `signOut`, `refreshDbUser`). Bifurca **todo** su comportamiento
  según `config.BYPASS_AUTH` y `config.USE_SUPABASE_AUTH`; también renderiza
  `BlockedScreen` cuando el usuario está desactivado.
- `src/auth/msal.ts` — wrapper de `@azure/msal-browser`: inicialización,
  cuenta activa, login popup/redirect con fallback automático entre ambos,
  adquisición silenciosa de tokens (`acquireTokenSilent` → popup → redirect) y
  logout. Camino **legacy** (`USE_SUPABASE_AUTH = false`).
- `src/auth/supabaseAuth.ts` — login con Supabase Auth usando Azure como
  `provider`. Maneja la particularidad de que Supabase solo entrega el
  `provider_token`/`provider_refresh_token` de Microsoft en el intercambio
  OAuth inicial: cachea el access token de Graph, persiste el refresh token en
  `localStorage`, y ante su ausencia intenta renovarlo silenciosamente
  (`refreshProviderTokenSilently`, POST directo al endpoint de token de Azure)
  antes de recurrir a un reintento con `prompt=none` (`trySilentGraphReauth`,
  con cooldown de 30s). También reconstruye el `entraId` (`<oid>.<tid>`) desde
  los `custom_claims` de la sesión de Supabase para poder matchear contra
  `TBL_Users.User_EntraID` igual que hace MSAL.
- `src/auth/roles.ts` — hook `useRole()`: deriva `admin | ti_member | client`
  a partir de `dbUser.User_Role` y `dbUser.Department_ID === 7`. Expone
  guards de conveniencia: `canSeeBoard`, `canSeeConfig`, `canSeeStats`,
  `canSeeAutomations`.
- `src/lib/supabaseClient.ts` — cliente `supabase-js` único de la app
  (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`,
  `flowType: 'pkce'`).
- `src/lib/apiClient.ts` — único cliente HTTP hacia la Edge Function; elige el
  token según `config.USE_SUPABASE_AUTH` (sesión de Supabase vs. MSAL) y lo
  manda como `Authorization: Bearer <token>`.
- `src/pages/LoginPage.tsx` — pantalla de login; si ya hay sesión (`ready &&
  dbReady && account`) redirige a `/home` o a la ruta guardada por
  `consumePostLoginRedirect()`.
- `src/pages/OnBoardingPage.tsx` — selector de departamento/equipo para
  usuarios `Is_New`; llama `getDepartments`, `getTeamsByDepartment` y
  `completeOnboarding`.
- `src/components/ConfigPanelComponents/UsersConfig.tsx` — panel admin
  completo: `UserList`, `UserEditForm`, `PreRegisterForm`,
  `LinkIdentityForm`, `BoardAccessPicker`.
- `src/config.ts` — flags de arranque (ver detalle abajo).
- `src/auth/useAuth.ts` — **no se usa en ningún lugar del código actual**
  (ver Puntos frágiles); define su propio `AuthContext`/`useAuth` separado del
  que realmente exporta `AuthProvider.tsx`.

### Flags de `src/config.ts`

| Flag | Valor actual | Qué hace |
|---|---|---|
| `USE_MOCK` | `false` | Si `true`, varias pantallas usan datos locales de prueba en vez de llamar al backend (se referencia en ~25 archivos del front, no solo en auth); hoy está desactivado, la app corre contra Supabase real. |
| `BYPASS_AUTH` | `false` | Si `true`, `AuthProvider` se salta por completo el login: usa una cuenta y un `UserProfile` ficticios (`MOCK_ACCOUNT`/`MOCK_DB_USER`, rol `admin`, departamento TI) para desarrollar la UI sin backend de auth. Hoy está desactivado. |
| `USE_SUPABASE_AUTH` | `true` | Selecciona el camino de login: `true` = Supabase Auth + proveedor Azure (camino nuevo, activo hoy); `false` = MSAL directo contra Azure AD (camino legacy, todavía soportado en el código pero no en uso). Es aditivo por diseño: mientras esté en `false` no cambia nada en producción. |
| `USE_DIRECT_READS` | `true` | No es de auth; no se documenta en este módulo. |

### Backend (Edge Function)

**`lib/auth.ts`** — verificación de JWT para los dos flujos:

- `verifyAzureToken(token)` — valida la firma contra el JWKS público de
  Entra ID (`login.microsoftonline.com/<tenant>/discovery/v2.0/keys`),
  detecta si el token es v1 (`sts.windows.net`) o v2 para elegir el emisor
  esperado, exige audiencia `api://<CLIENT_ID>` y verifica que el claim `tid`
  coincida con el tenant configurado.
- `verifySupabaseToken(token)` — valida la firma (ES256) contra el JWKS del
  proyecto Supabase (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), exige
  emisor `<SUPABASE_URL>/auth/v1`, audiencia `authenticated` y claim
  `role = 'authenticated'`.

**`index.ts`** — punto de entrada HTTP: para toda acción que no sea pública ni
de job interno, intenta primero `verifyAzureToken`; si falla, intenta
`verifySupabaseToken`; solo si **ambos** fallan responde 401. Este
"aceptar dos emisores a la vez" es intencional y temporal (documentado en el
propio TSDoc del archivo como parte de la migración MSAL → Supabase), no un
descuido.

**`handlers/users.ts`** (`userHandlers`):

| Acción | Qué hace | Notas |
|---|---|---|
| `fetchUserByEntraId` | Busca un usuario por `User_EntraID`. | Devuelve identidad y rol básicos; determinístico incluso ante duplicados (ordena por `User_ID`, limita a 1). |
| `fetchAllUsers` | Lista todos los usuarios con departamento y equipo embebidos. | Alimenta `UsersConfig.tsx`. |
| `upsertUserByEntraId` | Crea o actualiza un usuario a partir de su `entraId`/`name`/`email`. | Delega en la RPC de Postgres `upsert_user_by_entra_id` (no hay SQL de esta RPC en el repo; su lógica exacta de resolución de identidad no se pudo verificar desde el código fuente, solo se infiere de los call-sites y comentarios). Es la vía usada en cada login para sincronizar la cuenta de Azure con `TBL_Users`. |
| `fetchMembersBySubTeams` | Usuarios únicos de un conjunto de sub-equipos. | Deduplicado por `User_ID`. |
| `preRegisterUser` | Da de alta a alguien por correo antes de su primer login. | Normaliza el email (`ilike` para chequear duplicados), inserta con `User_EntraID=''` y crea su identidad primaria en `TBL_User_Identities` — sin esa fila, la RPC de upsert no podría resolver al usuario cuando llegue su primer login real. |
| `completeOnboarding` | Asigna departamento/equipo y pone `Is_New=false`. | |
| `updateUser` | Actualiza rol/departamento/equipo/`Is_New`. | Regla no obvia: si cambia de departamento a uno **no nulo**, el rol se fuerza a `'member'` sin importar lo que se haya pedido, para no arrastrar permisos de admin al mover a alguien de área. |
| `deactivateUser` / `reactivateUser` | Borrado lógico (`"Is_Active"`). | Nunca se elimina la fila de `TBL_Users`. |

El frontend (`UsersConfig.tsx`) también llama a `fetchUserIdentities` y
`linkUserIdentity`, pero **ninguna de las dos existe** en `userHandlers` ni en
ningún otro handler del backend — ver Puntos frágiles.

### Tablas de base de datos involucradas

- `TBL_Users` — identidad central: nombre, correo, `User_EntraID`, rol
  (`'admin' | 'member'` — `'ti_member'` no es un valor real, solo una
  convención de UI derivada de `Department_ID === 7`), departamento, equipo,
  `Is_New`, `"Is_Active"`.
- `TBL_User_Identities` — correos adicionales asociados a un `User_ID`; se usa
  para pre-registro (antes del primer login) y para resolver destinatarios de
  notificación (`VW_User_Notification_Emails`, consultada desde
  `email/send.ts`).
- `TBL_Departments` / `TBL_Teams` — ver
  `documentacion/modulos/05-organizacion-y-equipos.md`; se leen aquí para el
  onboarding y los selectores de la ficha de usuario.
- `TBL_Board_Team_Access` — grants de boards, gestionados desde la ficha de
  usuario (`BoardAccessPicker`) aunque la tabla pertenece conceptualmente al
  módulo de Organización y Equipos.

Detalle completo de columnas en `documentacion/BASE_DE_DATOS.md`.

## Reglas de negocio y validaciones clave

- **Dos proveedores de token aceptados a la vez** (`index.ts`): mientras dure
  la migración, un token válido de Azure AD *o* de Supabase Auth basta para
  autenticar cualquier request. Es deliberado y transitorio, pensado para que
  usuarios ya logueados con MSAL y usuarios nuevos con Supabase Auth
  convivan sin cortar el servicio.
- **El rol no se elige libremente al cambiar de departamento**: `updateUser`
  fuerza `User_Role = 'member'` si el nuevo `Department_ID` no es `null` y es
  distinto del actual, aunque el admin haya marcado "Administrador" en el
  formulario.
- **`'ti_member'` no es un rol real en la base de datos** — es una etiqueta
  que solo existe en el frontend (`roles.ts`) para distinguir en la UI a un
  miembro de TI (`Department_ID = 7`, rol `'member'`) de un admin de TI. El
  código de otros módulos que compara contra el string `'ti_member'` lo hace
  por compatibilidad histórica, no porque la columna pueda tener ese valor.
- **Pre-registro exige correo único** (`ilike` case-insensitive contra
  `TBL_Users.User_Email`) y crea automáticamente su identidad primaria en
  `TBL_User_Identities`.
- **Verificación de token vs. identidad de negocio son cosas separadas**: el
  backend solo comprueba que el JWT sea válido y esté correctamente firmado
  por Azure o por Supabase (`index.ts`); no ató ese payload verificado a los
  `userId`/`entraId` que cada acción recibe en su `payload`. La resolución de
  "a qué usuario le hago esto" ocurre handler por handler, confiando en los
  IDs que manda el propio cliente — consistente con que, según el contexto
  general del proyecto, la autorización no está centralizada y cada handler
  valida lo que necesita explícitamente.

## Automatizaciones y efectos secundarios

- Al desactivar un usuario, en su próxima carga de sesión `AuthProvider`
  detecta `Is_Active === false` y reemplaza toda la app por `BlockedScreen`,
  sin redirigir ni tocar rutas.
- El listener `supabase.auth.onAuthStateChange` re-sincroniza `dbUser` en cada
  evento (login, refresh de token, vuelta de foco de pestaña); usa refs
  (`loadedUserIdRef`, `inFlightRef`) para no disparar `upsertUserByEntraId`
  dos veces ante eventos concurrentes (`INITIAL_SESSION` + `getSession()`
  manual).
- Cuando Supabase renueva su propio JWT (`TOKEN_REFRESHED`) sin traer de
  vuelta `provider_token` de Microsoft, `AuthProvider` dispara en segundo
  plano la cadena de recuperación de `getSupabaseProviderToken()` (cache →
  refresh silencioso con `provider_refresh_token` → reintento con
  `prompt=none` como último recurso) para no romper las llamadas a Graph.
- Eliminar el departamento o equipo de un usuario (desde el módulo de
  Organización) lo marca `Is_New = true`, lo que lo devuelve al flujo de
  onboarding en su próximo login.

## Puntos frágiles / riesgos conocidos

- **`fetchUserIdentities` y `linkUserIdentity` no existen en el backend.** Se
  llaman desde `src/components/ConfigPanelComponents/UsersConfig.tsx` (líneas
  453-454 y 688-692) pero no hay ningún handler con esos nombres en
  `supabase/functions/api/handlers/` (confirmado por búsqueda en todo el
  directorio) ni en `router.ts`. Efecto concreto:
  - La sección "Correos vinculados" del formulario de edición de usuario
    queda **siempre vacía**, porque el `catch` de `fetchUserIdentities` la
    deja en `[]` en silencio (no hay error visible).
  - La función de "Vincular cuentas" (fusionar duplicados detectados por
    nombre) está **completamente rota**: al confirmar, `linkUserIdentity`
    dispara `Acción desconocida: linkUserIdentity` en `router.ts` (línea
    119), y el admin solo ve "Error al vincular las cuentas." La detección de
    duplicados sí funciona (es cálculo puramente local sobre `fetchAllUsers`),
    pero no hay forma de completar la fusión desde el panel hoy.
- **`src/auth/useAuth.ts` es código muerto**: define su propio
  `AuthContext`/`useAuth`, pero ningún archivo del proyecto lo importa (se
  verificó con búsqueda de `@/auth/useAuth` en todo `src/`); el hook `useAuth`
  que realmente usa toda la app es el que exporta `AuthProvider.tsx`. Si en el
  futuro algo importa por error desde `@/auth/useAuth`, fallará con
  "useAuth must be used within <AuthProvider>" aunque el `AuthProvider` real
  esté montado, porque son dos contextos de React distintos.
- **La RPC `upsert_user_by_entra_id` es una caja negra desde este repo**: no
  hay migraciones SQL versionadas; su comportamiento exacto para resolver a un
  usuario pre-registrado por correo (y completar su `User_EntraID` recién en
  el primer login real) se infiere de los comentarios de
  `handlers/users.ts` y no se pudo confirmar leyendo código fuente.
- **`Identity_Notify` en `TBL_User_Identities` es una columna inferida, no
  observada**: no hay ningún `select`/`insert` directo sobre ella en el
  código revisado; su existencia se deduce de un comentario en
  `email/send.ts` que dice que la vista `VW_User_Notification_Emails` filtra
  "identidades con `Identity_Notify = false`" (mismo hallazgo que
  `documentacion/BASE_DE_DATOS.md`).
- **Riesgo si un usuario tuviera tokens inconsistentes de ambos sistemas**: el
  backend no cruza el `sub`/`oid` del token verificado contra el `entraId`
  que el propio cliente envía en el payload de `upsertUserByEntraId`; en
  teoría, un usuario autenticado (con un token válido de cualquiera de los
  dos proveedores) que enviara un `entraId`/`userId` distinto al suyo en el
  payload de una acción sería procesado igual, porque la verificación de
  token y la resolución de identidad de negocio son pasos independientes. No
  se encontró, en los archivos revisados (`index.ts`, `router.ts`,
  `handlers/users.ts`, `shared/boardAccess.ts`), un chequeo adicional que
  ate ambas cosas.

## Referencia rápida de acciones de la API

| Acción | Descripción | Handler (archivo) |
|---|---|---|
| `fetchUserByEntraId` | Busca usuario por Entra ID. | `handlers/users.ts` |
| `fetchAllUsers` | Lista todos los usuarios con depto/equipo. | `handlers/users.ts` |
| `upsertUserByEntraId` | Crea/actualiza usuario en cada login. | `handlers/users.ts` |
| `fetchMembersBySubTeams` | Usuarios únicos de varios sub-equipos. | `handlers/users.ts` |
| `preRegisterUser` | Pre-registra usuario por correo. | `handlers/users.ts` |
| `completeOnboarding` | Asigna depto/equipo y cierra onboarding. | `handlers/users.ts` |
| `updateUser` | Edita rol/depto/equipo/estado de onboarding. | `handlers/users.ts` |
| `deactivateUser` | Desactiva usuario (borrado lógico). | `handlers/users.ts` |
| `reactivateUser` | Reactiva usuario. | `handlers/users.ts` |
| `getDepartments` | Lista departamentos (usado en onboarding). | `handlers/orgUnits.ts` |
| `getTeamsByDepartment` | Lista equipos de un departamento (onboarding). | `handlers/orgUnits.ts` |
| `fetchUserBoardAccess` | IDs de boards con grant para un usuario. | `handlers/boardTeams.ts` |
| `setUserBoardAccess` | Reemplaza los grants de boards de un usuario. | `handlers/boardTeams.ts` |
| `fetchUserIdentities` *(sin implementar)* | Debería listar correos vinculados. | No existe ningún handler — ver Puntos frágiles. |
| `linkUserIdentity` *(sin implementar)* | Debería fusionar cuentas duplicadas. | No existe ningún handler — ver Puntos frágiles. |
