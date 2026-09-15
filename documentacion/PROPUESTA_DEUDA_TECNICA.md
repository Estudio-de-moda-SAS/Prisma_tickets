# Propuesta: arquitectura del backend a mediano plazo

> Documento de propuesta, no de arquitectura vigente. Complementa a [`ARQUITECTURA.md`](ARQUITECTURA.md) (§8 documenta los riesgos puntuales que este documento agrupa y les da un camino de solución). No implica ningún cambio ya decidido — es insumo para que el equipo discuta y priorice. El camino recomendado en §4 está desglosado en historias ejecutables, con criterios de aceptación y orden, en [`ROADMAP_DEUDA_TECNICA.md`](ROADMAP_DEUDA_TECNICA.md).

## 1. Resumen ejecutivo

La Edge Function única `api` (Supabase/Deno) que concentra **todo** el backend de PRISMA ya pesa ~10.300 líneas en 27 handlers de dominio, sin tests, sin migraciones SQL versionadas y con despliegue 100% manual. Ninguno de estos síntomas es urgente hoy, pero la app lleva ~5 meses en producción con muy alta velocidad de commits (250+ commits, 6 personas) y el patrón de crecimiento (un handler nuevo por cada funcionalidad, todos en el mismo router) no se detiene solo.

Se evaluaron las tres opciones planteadas — backend separado, seguir creciendo la función única, particionar en varias funciones — más dos alternativas adicionales. **Ninguna de las tres opciones "puras" es la recomendación**: la propuesta es una combinación de (a) resolver primero la deuda transversal que hoy hace *cualquier* cambio arquitectónico más riesgoso de lo necesario (migraciones versionadas, pipeline de despliegue, un mínimo de tests), y (b) una partición **incremental**, no total, que saca de la función principal solo los 2-3 dominios que ya están marcados como frágiles o son operacionalmente distintos (SOLVI, exportaciones/jobs, migración ETL), dejando el núcleo de tickets/Kanban donde está. Ver §4.

## 2. Diagnóstico: por qué esto es un problema que crece solo

### 2.1. Tamaño y forma actual del backend

| Métrica | Valor |
|---|---|
| Edge Functions desplegadas en el proyecto Supabase de PRISMA | **1** (`api`) |
| Líneas de TypeScript en `supabase/functions/api/` | **~10.345** |
| Archivos de handler (`handlers/*.ts`) | **27**, agrupados en ~12 dominios de negocio (ver tabla en [`ARQUITECTURA.md` §9](ARQUITECTURA.md#9-handlers-de-la-edge-function-mapa-completo)) |
| Handler más grande | `requests.ts` — **1.232 líneas** (tickets, Kanban, asignación, sub-equipos) |
| Otros handlers grandes | `exportJobs.ts` (590), `solvi.ts` (487), `system.ts` (399), `migration.ts` (336), `templates.ts` (345) |
| Archivos de soporte (`jobs/`, `shared/`, `lib/`) | ~2.700 líneas adicionales, incluyendo `jobs/exportJob.ts` (643) y `shared/requests.ts` (566) |
| Router | Una única tabla `action → handler` (`router.ts`, 122 líneas) construida por `spread` de los 27 mapas — **"ante colisión de nombres de acción entre dos módulos, gana el último en el spread"** (comentario del propio archivo) |

No es un problema de rendimiento hoy (Deno/V8 arranca un archivo de 10K líneas sin dificultad) — es un problema de **manejo de cambio y de blast radius**: todo dominio de negocio (tickets, SOLVI, exportaciones, migración de datos históricos, bug reports) comparte el mismo proceso, el mismo despliegue, el mismo cliente `service_role` sin RLS y el mismo espacio de nombres de acciones.

### 2.2. Riesgos que ya están documentados y que la escala agrava

`ARQUITECTURA.md` §8 ya enumera 13 puntos frágiles conocidos. Varios se agravan específicamente **porque** todo vive en un solo lugar, no porque el código en sí esté mal escrito:

- **Sin RLS + sin autorización centralizada** (§8.1): cada uno de los 27 handlers es responsable de validar acceso por su cuenta. Cuantos más handlers, más superficie para que uno se olvide — ya hay un caso confirmado (§8.13: `resolveVisibleBoardIds` solo se invoca desde `boardTeams.ts`, ningún handler de tickets/comentarios/adjuntos lo usa).
- **Dos implementaciones de `sendEventEmail`** (§8.6) y **`notifyEvent()` sin adoptar** (§6.2 de `ARQUITECTURA.md`): exactamente el tipo de divergencia silenciosa que aparece cuando 6 personas tocan el mismo directorio sin un test que la detecte.
- **Integración SOLVI "en desarrollo activo" y ya marcada como la zona menos madura del sistema** (§8.10), con **escrituras directas a Supabase desde el navegador** que se saltan por completo la Edge Function — es decir, ya rompió el principio de punto único de entrada antes de que este documento existiera.
- **`src/types/supabase.types.ts` desactualizado** (§8.4) y **sin migraciones SQL versionadas** (§8.5): el esquema real vive únicamente en la base de Supabase; nadie puede reconstruirlo desde el repo. Esto no es un problema de la Edge Function, pero cualquier cambio de arquitectura del backend (particionar, separar, lo que sea) hereda este riesgo si no se resuelve antes.

### 2.3. Deuda transversal que no depende de qué arquitectura se elija

- **Despliegue 100% manual, sin pipeline**: el único workflow de CI/CD del repo (`.github/workflows/azure-static-web-apps-*.yml`) despliega el **frontend**. El backend se despliega a mano con `supabase functions deploy api`, en un orden que depende de que la persona recuerde los 3 pasos documentados en el README (migración SQL manual → deploy de la función → build del frontend). No hay ambiente de staging documentado.
- **Cero tests automatizados**: no hay `vitest`/`jest` configurado, ni en frontend ni en la Edge Function. Cualquier refactor — particionar la función, moverla a otro runtime, lo que sea — hoy se verifica solo probando a mano en producción o pidiéndole a alguien que lo revise.
- **Equipo pequeño y joven en este proyecto**: el repo tiene ~5 meses de vida (primer commit 2026-04-09) y 250+ commits concentrados en 4-5 personas activas. Es información relevante para dimensionar cualquier propuesta: **la capacidad de operar infraestructura adicional es limitada**, y la velocidad de entrega actual es un activo que ninguna propuesta debería arriesgar sin necesidad clara.

## 3. Opciones evaluadas

### Opción A — Backend separado (fuera de Supabase Edge Functions)

Mover la lógica de negocio a un servicio propio (Node/Express, NestJS, Fastify, etc.) desplegado aparte (contenedor, VM, otro PaaS), que hable con la misma base Postgres de Supabase (o la reemplace).

| | |
|---|---|
| **Qué resuelve** | Runtime más maduro para lógica de negocio compleja (mejor debugging, más librerías, sin las limitaciones de Deno Edge Runtime); posibilidad de tests de integración más tradicionales; desacopla el backend del vendor lock-in de Supabase Functions. |
| **Qué NO resuelve por sí solo** | Nada del diagnóstico de §2 se arregla por cambiar de runtime — el mismo código de 10K líneas sin tests, sin RLS y sin migraciones versionadas simplemente se muda de lugar. La falta de autorización centralizada y las dos implementaciones de email no se corrigen moviendo archivos. |
| **Costo/riesgo** | **Alto**. Implica: nueva infraestructura de despliegue y observabilidad (hoy inexistente — ni siquiera el backend actual tiene pipeline), reescritura completa de 27 handlers con superficie de bugs de regresión sin red de tests, posible pérdida de las ventajas operativas de Supabase (Storage con URLs firmadas ya integrado, Auth, `EdgeRuntime.waitUntil` para jobs en background). Requiere goobernar autenticación Azure AD/Supabase Auth dual (§5.1 de `ARQUITECTURA.md`) en un servicio nuevo. |
| **Encaje con el equipo actual** | Bajo. Un equipo de 4-5 personas sin pipeline de CI/CD para el backend actual no tiene, hoy, la capacidad ociosa para operar y mantener infraestructura nueva (contenedores, healthchecks, logs centralizados, alertas) además de seguir entregando funcionalidad al ritmo actual. |
| **Cuándo tendría sentido** | Si en el futuro aparece una necesidad concreta que Supabase Edge Functions no puede cubrir (cómputo pesado sostenido, WebSockets persistentes, integraciones que requieran un runtime Node específico) — no es el caso hoy: los jobs en background ya se resuelven con auto-invocación + `waitUntil` (§6.1 de `ARQUITECTURA.md`) sin problemas reportados. |

### Opción B — Seguir creciendo la función única (statu quo)

No cambiar nada estructuralmente: cada funcionalidad nueva sigue siendo un handler más en `handlers/`, registrado en el mismo `router.ts`.

| | |
|---|---|
| **Qué resuelve** | Costo de cambio = 0 hoy. Es la opción más rápida en el corto plazo y no requiere coordinación ni ventana de migración. |
| **Qué NO resuelve** | Nada de §2 — al contrario, todos los riesgos ahí descritos (colisión de nombres de acción "gana el último en el spread", ausencia de autorización centralizada, blast radius compartido entre SOLVI/tickets/exportaciones) crecen linealmente con cada handler nuevo. `requests.ts` ya tiene 1.232 líneas; sin límite, seguirá creciendo porque es el dominio central. |
| **Costo/riesgo** | Bajo a corto plazo, **creciente a mediano plazo**: cada nuevo dominio hace el despliegue manual único más riesgoso (un bug en un handler de bajo tráfico puede tumbar disponibilidad de todo `api`, incluido el tablero Kanban que es lo más usado), y hace más cara la eventual migración a cualquier otra opción, porque el acoplamiento entre dominios (imports cruzados en `shared/`, colisiones de nombre) sigue aumentando. |
| **Encaje con el equipo actual** | Alto en el día a día, pero es la opción que **más depende de que nunca haya un incidente** que exponga el riesgo de §2.2 (ej. RLS ausente + un handler nuevo sin validar visibilidad). |

### Opción C — Particionar la Edge Function en varias, por dominio

Separar `api` en múltiples Edge Functions desplegables independientemente (p. ej. `api-tickets`, `api-solvi`, `api-exports`, `api-admin`), cada una con su propio `router.ts`/`index.ts`, compartiendo el código común (`shared/`, `lib/`) como paquete importado.

| | |
|---|---|
| **Qué resuelve** | Blast radius acotado por dominio (un bug en exportaciones ya no puede tumbar el Kanban); despliegues independientes (se puede desplegar solo `api-solvi` sin tocar el resto, reduciendo el riesgo de cada release); permite eventualmente distintos niveles de confianza/autenticación por función (la integración SOLVI, ya marcada como "menos madura", queda operacionalmente aislada del resto). |
| **Qué NO resuelve por sí solo** | RLS/autorización centralizada sigue sin existir dentro de cada función partida — el problema se acota, no se elimina. Migraciones SQL y tests siguen faltando. Y agrega un problema nuevo: **duplicación o extracción cuidadosa de `shared/`** (boardAccess, mappers, email, requests helpers) entre funciones, con el riesgo de que diverjan igual que ya divergieron las dos implementaciones de `sendEventEmail`. |
| **Costo/riesgo** | Medio. Requiere decidir cómo se comparte código entre funciones (import relativo entre carpetas de `supabase/functions/`, que Deno soporta directamente, sin necesidad de un paquete publicado), y reescribir el `apiClient` del frontend para enrutar cada `action` a la función correcta (hoy asume una única URL `${VITE_SUPABASE_URL}/functions/v1/api`). No requiere infraestructura nueva: sigue siendo Supabase Edge Functions, mismo proyecto, mismo modelo de auth. |
| **Encaje con el equipo actual** | **Alto — y ya validado dentro de la propia organización**: el proyecto hermano `TI-HelpDesk` (el backend real del sistema SOLVI que PRISMA integra, ver [`modulos/11-integracion-solvi.md`](modulos/11-integracion-solvi.md)) ya usa exactamente este patrón — **6 Edge Functions pequeñas y enfocadas** (`process-emails`, `sync-sharepoint-list`, `monitor-ticket-expirations`, `sync-holidays`, `obtener-disponibilidad-hoy`, `obtener-disponibilidad-teams`) en vez de una función monolítica. El equipo ya sabe operar `supabase functions deploy <nombre>` por función individual — no es una capacidad nueva a construir. |

### Opción D — Alternativas no planteadas originalmente

**D1. Partición incremental, no total** (variante acotada de la Opción C). En vez de partir las 27 handlers en varias funciones de una vez, sacar de `api` únicamente los dominios que ya cumplen alguno de estos criterios:
- Ya están marcados como frágiles/menos maduros (`solvi.ts`, 487 líneas — riesgo #10 de `ARQUITECTURA.md`).
- Tienen un perfil operacional distinto al resto (jobs de exportación/renombrado — `exportJobs.ts` + `jobs/exportJob.ts` + `jobs/renameJob.ts`, ~1.450 líneas combinadas — son procesos largos por chunking, con auto-invocación y timeouts propios, no request/response típico).
- Ya usan un mecanismo de autenticación distinto al JWT de usuario (`migration.ts`, protegido por `X-Internal-Job-Secret` para la herramienta externa `prisma-migrations`, nunca lo llama un usuario final).

El núcleo (tickets, Kanban, comentarios, organización, notificaciones, sprints/estadísticas — el código que cambia todos los días) se queda en `api` tal cual está. Esto reduce el costo de la Opción C (menos superficie a repartir de una vez, menos riesgo de romper `apiClient`) mientras captura la mayor parte del beneficio (aísla justamente las zonas que `ARQUITECTURA.md` ya identificó como las más riesgosas).

**D2. Modularizar internamente sin tocar el modelo de despliegue.** Adoptar un micro-framework de ruteo (p. ej. Hono, que corre nativo en Deno/Edge Functions) en reemplazo del `spread` manual de `router.ts`, con validación de payload por acción (p. ej. Zod) y un middleware único de autorización que **obligue** a cada handler a declarar explícitamente su regla de visibilidad, en vez de confiar en que cada uno recuerde llamar a `resolveVisibleBoardIds`. Esto no cambia nada de arquitectura de despliegue (sigue siendo Opción B en la práctica) pero ataca directamente el riesgo #1 y #13 de `ARQUITECTURA.md` (autorización no centralizada) con una inversión de código, no de infraestructura.

**D3. Resolver primero la deuda transversal, independiente de qué arquitectura se elija.** Esto no es una alternativa a A/B/C — es un prerrequisito que hoy falta para cualquiera de las tres:
1. **Migraciones SQL versionadas** (`supabase/migrations/`) — hoy el esquema solo existe en la base viva; sin esto, ni particionar ni separar el backend es seguro de reproducir en un ambiente nuevo.
2. **Pipeline de CI/CD para el backend** — hoy solo el frontend tiene GitHub Actions. Hace falta como mínimo `supabase functions deploy` automatizado desde `main`, sea cual sea la arquitectura elegida.
3. **Un mínimo de tests** sobre los handlers de mayor riesgo (autorización, cierre de tickets, exportaciones) antes de tocar la estructura del backend — no hace falta cobertura total, alcanza con una red de seguridad para no romper el flujo de tickets en producción durante la migración.

**D4. RLS como defensa en profundidad, sin migrar el modelo de autorización.** Activar políticas RLS básicas en las tablas más sensibles (`TBL_Requests`, `TBL_Board_Team_Access`, etc.) que repliquen — aunque sea de forma aproximada — la lógica de `resolveVisibleBoardIds`, no para reemplazar la validación en cada handler sino como red de seguridad adicional si un handler nuevo (o una función partida sin querer) olvida validar. Nota: PRISMA ya tiene esta pieza a medias — la excepción `USE_DIRECT_READS` (§3.1.a de `ARQUITECTURA.md`) ya depende de RLS para dos lecturas puntuales, así que el patrón ya existe en el repo, solo no está generalizado.

## 4. Recomendación

**No** se recomienda la Opción A (backend separado) en este momento: el diagnóstico de §2 no es un problema de runtime, es un problema de organización de código y de procesos de despliegue/testing — cambiar de Deno a Node no arregla ninguno de los 13 riesgos de `ARQUITECTURA.md` §8, y sí introduce una carga operativa nueva que el equipo actual (4-5 personas, sin pipeline de backend hoy) no tiene margen para absorber sin sacrificar velocidad de entrega. Es una opción a revisar más adelante si aparece una necesidad técnica concreta que Supabase Edge Functions no pueda cubrir — hoy no la hay.

**Tampoco** se recomienda seguir en la Opción B (statu quo) indefinidamente: es la más barata hoy pero es la única de las tres cuyo riesgo crece con cada PR, sin que nada lo frene.

**Camino recomendado — en este orden:**

1. **D3 primero, como base**: migraciones SQL versionadas + pipeline de despliegue del backend + un mínimo de tests en los handlers más sensibles. Sin esto, cualquier partición (D1/C) se hace a ciegas. Es además la inversión de menor riesgo y la que más protege lo que ya existe, independientemente de hacia dónde evolucione la arquitectura después.
2. **D1 (partición incremental)** una vez lo anterior esté en marcha: sacar `solvi.ts` (ya documentado como la zona menos madura) y el subsistema de jobs (`exportJobs.ts` + `jobs/`) a funciones propias. Esto acota el blast radius exactamente en los dos lugares donde `ARQUITECTURA.md` ya señala más riesgo, sin pagar el costo completo de particionar los 27 handlers de una vez. El equipo ya conoce este patrón operativamente por `TI-HelpDesk`.
3. **D2 (middleware de autorización + validación de payload)** en paralelo o inmediatamente después, aplicado primero a los handlers que quedan en el núcleo (`requests.ts`, `comments.ts`, `closure.ts` — los que hoy no llaman a `resolveVisibleBoardIds`, riesgo #13).
4. **D4 (RLS como red de seguridad)** como capa adicional una vez el modelo de autorización esté más consolidado — generalizar el patrón que hoy solo cubre `USE_DIRECT_READS`.
5. Recién ahí, si el crecimiento lo justifica, evaluar particionar el resto del núcleo (Opción C completa) o revisar la Opción A con datos reales de qué falta.

## 5. Riesgos de no actuar

- Cada handler nuevo agregado a `api` sin autorización centralizada es una posibilidad más de fuga de datos entre departamentos/equipos (riesgo #1 de `ARQUITECTURA.md`, hoy sin mitigar).
- Un bug de despliegue en un dominio de bajo tráfico (p. ej. migración ETL o exportaciones) puede tumbar disponibilidad del tablero Kanban, que es lo que usa todo el resto de la organización a diario, porque comparten el mismo proceso.
- Cuanto más crezca `requests.ts` y el resto de handlers sin tests ni migraciones versionadas, más caro se vuelve *cualquiera* de los tres caminos evaluados — incluido seguir como está.

---

*Documento generado a partir de una revisión del código fuente (`supabase/functions/api/`), de `ARQUITECTURA.md`, del historial de git y del proyecto hermano `TI-HelpDesk` (integración SOLVI) en septiembre de 2026. Es una propuesta para discusión, no una decisión tomada — actualizar o descartar según lo que el equipo decida.*
