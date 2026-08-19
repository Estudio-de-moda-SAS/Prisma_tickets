# PRISMA

**Sistema interno de gestión de solicitudes y tablero Kanban (ITSM)** — Estudio de Moda S.A.S.

PRISMA centraliza, organiza y da trazabilidad a las solicitudes que los distintos departamentos de la organización (clientes internos) dirigen a los equipos de tecnología. Actualmente se encuentra **en producción** y en uso por la organización.

> Aplicación web full-stack construida con React + TypeScript en el frontend y Supabase (PostgreSQL + Edge Functions) en el backend, con autenticación corporativa vía Microsoft Entra ID y despliegue en Azure Static Web Apps.

---

## Tabla de contenido

- [Características](#características)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos previos](#requisitos-previos)
- [Configuración e instalación](#configuración-e-instalación)
- [Desarrollo](#desarrollo)
- [Despliegue](#despliegue)
- [Convenciones y principios de diseño](#convenciones-y-principios-de-diseño)
- [Roles del sistema](#roles-del-sistema)
- [Licencia](#licencia)

---

## Características

- **Tablero Kanban** con arrastrar y soltar (dnd-kit), actualizaciones optimistas y paginación por cursor en el historial.
- **Sistema de tickets** con identificadores estructurados (`TCK-AÑO-LETRA-NÚMERO`), criterios de aceptación, sub-solicitudes, adjuntos y plantillas dinámicas con *snapshot* inmutable.
- **Flujo de revisión con el cliente** (aprobación / rechazo con evidencia de cierre).
- **Gestión de sprints** con puntaje de cumplimiento y panel de estadísticas por equipo y global.
- **Panel de configuración** administrable (etiquetas, sub-equipos, sprints, plantillas, usuarios, correos, anuncios, exportaciones).
- **Notificaciones** dentro de la aplicación y por correo electrónico.
- **Automatizaciones** (asignación de responsable, prioridad y avisos).
- **Control de acceso por roles** y visibilidad de tableros por equipo y departamento.
- **Migración de datos (ETL)** desde Excel mediante la herramienta *PRISMA Migrations*.
- **Filtrado del lado del servidor** e integración de sistemas externos (SOLVI).
- **Aplicación instalable (PWA)** para computador y dispositivos Android, con experiencia móvil completa.

---

## Stack tecnológico

**Frontend**
- React 19 · TypeScript · Vite
- TanStack Query (datos de servidor y caché)
- Zustand (estado local, con persistencia)
- React Router v6
- dnd-kit (tablero arrastrable)
- Tiptap (menciones y texto enriquecido) · Lucide (íconos) · Chart.js

**Backend**
- Supabase — PostgreSQL + Edge Functions (Deno)
- Supabase Storage (archivos adjuntos, con URLs firmadas generadas en el servidor)

**Autenticación**
- Supabase Auth con Microsoft Entra ID (Azure AD) como proveedor de identidad (OAuth 2.0 / OIDC)
- Verificación de JWT dentro del Edge Function

**Correo**
- API corporativa basada en Microsoft Graph

**Estilos**
- CSS a mano con variables/BEM y temas claro/oscuro (Tailwind y PostCSS configurados en el proyecto)

**Despliegue**
- Azure Static Web Apps (frontend)

---

## Arquitectura

El principio central del proyecto es un **punto único de entrada**: el frontend **nunca** accede directamente a la base de datos. Toda operación se realiza a través de un único Edge Function mediante:

```ts
apiClient.call(action, payload)
```

Ese Edge Function verifica el JWT de la sesión (emitido por Supabase Auth / Entra ID) y aplica las reglas de negocio y los permisos antes de tocar los datos. Esto concentra la seguridad y la lógica en un solo lugar y facilita el mantenimiento.

```
Frontend (React) ──apiClient.call(action, payload)──▶ Edge Function (Deno)
                                                          │  1) Verifica JWT
                                                          │  2) Reglas de negocio y permisos
                                                          ▼
                                        PostgreSQL · Supabase Storage · API de correo
```

> Diagrama completo en `docs/arquitectura.png`.

---

## Estructura del proyecto

```
src/
├── api/                 # Servicios base
├── auth/                # AuthProvider, roles, hooks de sesión
├── components/
│   ├── layout/          # AppLayout, Sidebar, Topbar, NotificationBell, modales
│   └── ConfigPanel.tsx  # Panel de configuración
├── features/
│   ├── automations/
│   └── requests/
│       ├── components/  # KanbanBoard, KanbanColumn, RequestCard, RequestModal, ...
│       ├── hooks/       # useRequests, useSprints, useStatsData, useMoveRequests, ...
│       ├── services/    # SupabaseRequestsService
│       └── stats/
├── graph/               # Integración con Microsoft Graph
├── lib/                 # apiClient.ts, compressImage.ts
├── pages/               # HomePage, BoardPage, StatsPage, LoginPage, OnBoardingPage, ...
├── store/               # boardStore, filterStore, configStore, useTheme, ...
├── styles/              # CSS por dominio (kanban, stats, layout, variables, ...)
└── types/               # commons.ts, supabase.types.ts

supabase/
└── functions/
    └── api/             # Edge Function (punto único de entrada)
        └── index.ts
```

---

## Requisitos previos

- **Node.js** (LTS) y **npm**
- **Supabase CLI** (para desplegar el Edge Function y aplicar migraciones)
- Acceso a un **proyecto de Supabase** (base de datos, funciones y storage)
- Una **aplicación registrada en Microsoft Entra ID** (App Registration) con sus *redirect URIs* configurados

---

## Configuración e instalación

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd prisma

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local   # o crear .env.local
```

Definir en `.env.local` las variables que usa el proyecto (URL y clave pública de Supabase, configuración de Entra ID, etc.). Ejemplo orientativo — **ajustar a los nombres reales del proyecto**:

```env
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave-publica-anon>
VITE_ENTRA_CLIENT_ID=<client-id-de-la-app-en-entra>
VITE_ENTRA_TENANT_ID=<tenant-id>
```

> Nunca subir claves de servicio (`service_role`) al frontend ni al repositorio. Esas viven únicamente como secretos del Edge Function en el backend.

---

## Desarrollo

```bash
# Levantar el servidor de desarrollo (Vite)
npm run dev

# Verificar tipos (silencio = cero errores)
npx tsc --noEmit
```

---

## Despliegue

El orden importa. Cada entrega se integra en tres pasos:

```bash
# 1) Migración de base de datos (aplicar cambios de esquema en SQL)
#    Recordar refrescar el cache de PostgREST tras agregar columnas:
#    NOTIFY pgrst, 'reload schema';

# 2) Desplegar el Edge Function
supabase functions deploy api

# 3) Compilar y publicar el frontend en Azure Static Web Apps
npm run build
```

> Si se agregan columnas en una migración, es obligatorio ejecutar `NOTIFY pgrst, 'reload schema';` para que PostgREST reconozca los cambios.

---

## Convenciones y principios de diseño

- **Punto único de entrada:** el frontend solo se comunica con los datos mediante `apiClient.call(action, payload)`; nunca accede a Supabase directamente.
- **Identificadores en SQL:** las columnas usan **PascalCase** con identificadores entre comillas dobles (`"Column_Name"`).
- **Actualizaciones optimistas:** requeridas para la percepción de rapidez; `invalidateQueries` por sí solo genera retrasos visibles.
- **Cache de PostgREST:** refrescar (`NOTIFY pgrst, 'reload schema'`) después de migraciones que agreguen columnas.
- **Edge Functions (Deno):** los imports locales requieren extensión `.ts` explícita.
- **Fechas:** los *timestamps* de Supabase sin `Z` deben normalizarse (agregar `Z`) antes de parsearlos en JavaScript.
- **Adjuntos:** no enviar base64 mayor a ~20 MB; comprimir imágenes antes de codificar; guardar solo la ruta y generar URLs firmadas en el servidor.
- **Consultas grandes:** usar procesamiento por lotes (*chunking*) y paginación para no perder rendimiento a medida que crecen los datos.
- **Plantillas:** cada ticket guarda una copia inmutable (*snapshot*) del esquema de su plantilla al crearse.

---

## Roles del sistema

| Rol | Descripción |
|-----|-------------|
| `admin` | Administrador de TI. Gestión completa del sistema. |
| `ti_member` | Miembro de TI. Atiende y trabaja las solicitudes. |
| `client` | Usuario cliente (resto de departamentos). Crea, sigue y aprueba solicitudes. |

---

## Licencia

Proyecto interno de **Estudio de Moda S.A.S.** — uso privado. Todos los derechos reservados.