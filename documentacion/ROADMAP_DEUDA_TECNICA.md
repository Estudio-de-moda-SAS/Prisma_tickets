# Roadmap: ejecución de la propuesta de deuda técnica

> Desglose accionable de [`PROPUESTA_DEUDA_TECNICA.md`](PROPUESTA_DEUDA_TECNICA.md) en historias/tareas tipo Scrum, con orden, dependencias, criterios de aceptación y tamaño relativo. Sigue exactamente el camino recomendado en su §4 (D3 → D1 → D2 → D4 → revisión condicional de C/A) — no introduce alcance nuevo, solo lo hace ejecutable. Como el documento base, esto es insumo para que el equipo priorice, no un compromiso de fechas.

## Cómo leer este documento

- **Fase** = una de las etapas del camino recomendado en la propuesta (§4). Las fases van en orden: no se empieza la Fase *N+1* sin haber cerrado los criterios de aceptación de la Fase *N*, salvo que se indique explícitamente que dos historias son paralelizables.
- **Tamaño** es una talla relativa (XS/S/M/L/XL, escala Fibonacci-ish: 1/2/3/5/8) para comparar historias entre sí — **no es una estimación en días**, porque no hay dato de velocidad real del equipo todavía. Úsese solo para ordenar/priorizar, no para prometer fecha de entrega.
- **DoD transversal** (aplica a toda historia de este roadmap, no se repite en cada tarjeta): código revisado por otra persona · documentación de `documentacion/` actualizada en el mismo PR si el cambio afecta algo ya documentado · no rompe ninguna acción existente de la API (regresión) · si la Fase 0 ya cerró, se despliega vía el pipeline de 0.2, no a mano.

## Backlog ordenado (resumen)

| # | Historia | Fase | Tamaño | Depende de | Paralelizable con |
|---|---|---|---|---|---|
| 0.1 | Versionar el esquema SQL (migraciones) | 0 — Fundamentos | L | — | 0.3 |
| 0.2 | Pipeline de CI/CD para el backend | 0 — Fundamentos | M | 0.1 (parcial) | — |
| 0.3 | Tests mínimos en handlers de alto riesgo | 0 — Fundamentos | M | — | 0.1, 0.2 |
| 1.0 | Mecanismo de ruteo multi-función en `apiClient` | 1 — Partición incremental | S | Fase 0 cerrada | — |
| 1.1 | Extraer integración SOLVI a función propia | 1 — Partición incremental | L | 1.0 | 1.2, 1.3 |
| 1.2 | Extraer subsistema de jobs (exports + rename) a función propia | 1 — Partición incremental | L | 1.0 | 1.1, 1.3 |
| 1.3 | *(opcional)* Extraer migración ETL a función propia | 1 — Partición incremental | S | 1.0 | 1.1, 1.2 |
| 2.1 | Adoptar micro-framework de ruteo + validación de payload en el núcleo | 2 — Autorización centralizada | L | Fase 1 cerrada | — |
| 2.2 | Middleware de autorización obligatorio (retrofit `requests.ts`/`comments.ts`/`closure.ts`) | 2 — Autorización centralizada | M | 2.1 | — |
| 3.1 | Generalizar RLS como red de seguridad adicional | 3 — Defensa en profundidad | M | Fase 2 cerrada | — |
| 4.1 | Spike condicional: ¿partición total del núcleo o backend separado? | 4 — Revisión futura | XS | Fase 3 cerrada + señal concreta de necesidad | — |
| B.1 | Arreglar bugs puntuales ya documentados del tablero (correo, timestamps, `Request_ID`) | Transversal — sin fase, no bloquea el roadmap | M | — | Cualquier fase |

**Agrupación orientativa en sprints** (asumiendo sprints de 2 semanas y sin dato real de velocidad — solo para dimensionar, no comprometer): Fase 0 ≈ 2-3 sprints · Fase 1 ≈ 2-3 sprints · Fase 2 ≈ 2 sprints · Fase 3 ≈ 1 sprint · Fase 4 no tiene fecha, se dispara por señal (ver 4.1).

---

## Fase 0 — Fundamentos transversales (D3 de la propuesta)

> Objetivo de la fase: que cualquier cambio arquitectónico posterior deje de hacerse "a ciegas". Ninguna historia de la Fase 1 arranca sin esto.

### 0.1 — Versionar el esquema SQL (migraciones)

**Por qué**: hoy el esquema solo existe en la base viva de Supabase (`PROPUESTA_DEUDA_TECNICA.md` §2.2, `ARQUITECTURA.md` §8.5); no se puede reproducir en un ambiente nuevo ni saber con certeza qué cambió entre dos momentos.

**Criterios de aceptación**
- [ ] Existe `supabase/migrations/` con al menos una migración inicial que reconstruye el esquema actual (las 49 tablas mapeadas en `BASE_DE_DATOS.md`).
- [ ] Reconstruir un proyecto Supabase desde cero aplicando solo las migraciones produce un esquema equivalente al de producción (mismas tablas/columnas/constraints relevantes) — verificado al menos una vez y dejado como procedimiento repetible.
- [ ] El README raíz documenta cómo crear y aplicar una migración nueva, reemplazando la instrucción actual de "aplicar cambios de esquema en SQL manualmente".
- [ ] A partir de esta historia, todo cambio de esquema (incluida cualquier otra historia de este roadmap que toque tablas) se hace vía un archivo de migración nuevo — se agrega esta regla a las convenciones de `ARQUITECTURA.md` §11.

**Tamaño**: L. **Depende de**: nada — puede arrancar primero. **Paralelizable con**: 0.3.

### 0.2 — Pipeline de CI/CD para el backend

**Por qué**: hoy el único workflow de GitHub Actions despliega el frontend; el backend se despliega a mano con `supabase functions deploy api`, dependiendo de que alguien recuerde el orden de 3 pasos del README (`PROPUESTA_DEUDA_TECNICA.md` §2.3).

**Criterios de aceptación**
- [ ] Existe un workflow de GitHub Actions que despliega la Edge Function `api` (mínimo: al mergear a `main`, o manual vía `workflow_dispatch` si se prefiere no auto-desplegar aún).
- [ ] El pipeline aplica las migraciones pendientes de `supabase/migrations/` (de 0.1) **antes** de desplegar la función, respetando el orden ya documentado (migración → deploy de función → build de frontend).
- [ ] El pipeline corre los tests de 0.3 (cuando existan) y **bloquea el deploy si fallan**.
- [ ] El estado del deploy (éxito/fallo) es visible sin tener que preguntar — alcanza con el check de GitHub Actions en el PR/commit.
- [ ] El README ya no describe el deploy manual como el flujo esperado; refleja el pipeline.
- [ ] *(Stretch, no bloqueante)*: existe algún ambiente de staging (proyecto Supabase separado, o al menos una forma de probar un deploy antes de `main`) — hoy no existe ninguno (`PROPUESTA_DEUDA_TECNICA.md` §2.3); si no se resuelve acá, queda anotado como pendiente explícito para no perderlo de vista.

**Tamaño**: M. **Depende de**: 0.1 (para el paso de migraciones — el resto del pipeline puede prototiparse en paralelo).

### 0.3 — Tests mínimos en los handlers de mayor riesgo

**Por qué**: sin ningún test hoy, cualquier refactor (incluida toda la Fase 1) se verifica solo probando a mano en producción (`PROPUESTA_DEUDA_TECNICA.md` §2.3). No hace falta cobertura total — alcanza con una red de seguridad en las zonas más riesgosas antes de tocarlas.

**Criterios de aceptación**
- [ ] Hay un test runner configurado y documentado para la Edge Function (Deno test nativo, o vitest si se prefiere unificar con el frontend — decisión a tomar al arrancar la historia, no bloquea el resto).
- [ ] Existen tests para **autorización**: al menos un caso que confirme que `resolveVisibleBoardIds` filtra correctamente, y un caso que documente (aunque sea marcado como *known failing* o *skip* con comentario) que `requests.ts`/`comments.ts`/`closure.ts` **no** la invocan hoy (riesgo #13 de `ARQUITECTURA.md`) — sirve de línea base para medir el arreglo en 2.2.
- [ ] Existen tests para **cierre de tickets** (`closure.ts`): al menos el camino feliz de cerrar un ticket con evidencia.
- [ ] Existen tests para **exportaciones** (`exportJobs.ts`/`jobs/exportJob.ts`): al menos que un job de exportación completa su chunking sin perder registros.
- [ ] Cada test nuevo referencia en un comentario el riesgo de `ARQUITECTURA.md`/`PROPUESTA_DEUDA_TECNICA.md` que cubre, cuando aplica — para que quede trazable por qué existe.
- [ ] Los tests corren en CI una vez exista 0.2 (si 0.3 se termina antes, corren igual localmente/en un workflow simple hasta que 0.2 los integre).

**Tamaño**: M. **Depende de**: nada. **Paralelizable con**: 0.1, 0.2.

---

## Fase 1 — Partición incremental (D1 de la propuesta)

> Objetivo de la fase: acotar el *blast radius* sacando de `api` los dominios ya marcados como frágiles o de perfil operacional distinto, sin tocar el núcleo (tickets/Kanban/comentarios/notificaciones/sprints). No arranca sin la Fase 0 cerrada — particionar sin migraciones versionadas ni un mínimo de tests sería "a ciegas" (`PROPUESTA_DEUDA_TECNICA.md` §4).

### 1.0 — Mecanismo de ruteo multi-función en `apiClient`

**Por qué**: hoy [`src/lib/apiClient.ts`](../src/lib/apiClient.ts) resuelve toda llamada contra una única URL fija (`EDGE_FUNCTION_URL = ${VITE_SUPABASE_URL}/functions/v1/api`) — no existe ningún mecanismo para que una `action` se resuelva contra una Edge Function distinta de `api`. Antes de poder extraer SOLVI (1.1), jobs (1.2) o la migración ETL (1.3) a funciones propias, el frontend necesita poder enrutar cada `action` hacia la función que le corresponda, de forma transparente para el resto del código.

**Criterios de aceptación**
- [ ] `apiClient.call(action, payload)` sigue siendo el único punto de entrada para que el frontend llame al backend — no cambia su firma ni obliga a tocar ningún componente/hook que ya lo use.
- [ ] Internamente, `apiClient` resuelve la URL de destino a partir de un mapa `action → función` (p. ej. `{ 'solvi.createTicket': 'api-solvi', ... }`), con `api` como destino por defecto para toda acción no mapeada explícitamente.
- [ ] Si una acción no está mapeada a ninguna función conocida y no aplica el destino por defecto, el error es explícito e identifica la acción faltante — no puede manifestarse como un 404 silencioso ni como un `JSON.parse` fallido sobre una respuesta HTML de error.
- [ ] Con el mapa vacío (o solo con el default), el comportamiento observable es idéntico al actual: todas las acciones existentes siguen resolviendo a `api`, sin cambios de comportamiento. Esta historia no mueve ningún handler todavía — solo deja el mecanismo listo para que 1.1/1.2/1.3 lo usen.
- [ ] Se agrega un test (sobre el runner de 0.3) que cubra el ruteo: una acción mapeada llega a la función esperada, una no mapeada cae al default, y una acción sin mapeo ni default produce el error explícito.

**Tamaño**: S. **Depende de**: Fase 0 cerrada.

### 1.1 — Extraer integración SOLVI a una Edge Function propia

**Por qué**: ya es "la zona menos madura del sistema" (`ARQUITECTURA.md` §8.10, `PROPUESTA_DEUDA_TECNICA.md` §D1) — aislarla acota el riesgo de que un bug ahí tumbe el resto de `api`, incluido el tablero Kanban.

**Criterios de aceptación**
- [ ] Existe `supabase/functions/api-solvi/` (nombre a confirmar) con su propio `index.ts`/router, reutilizando `shared/`/`lib/` por import relativo (sin duplicar código).
- [ ] Todas las acciones de `handlers/solvi.ts` (ver referencia de API en [`modulos/11-integracion-solvi.md`](modulos/11-integracion-solvi.md)) responden desde la función nueva y ya no están registradas en `api`.
- [ ] `apiClient` (de 1.0) enruta esas acciones a `api-solvi`.
- [ ] Smoke test manual documentado: crear un ticket SOLVI, comentarlo y adjuntarle un archivo end-to-end sigue funcionando igual que antes de la extracción.
- [ ] `modulos/11-integracion-solvi.md` se actualiza con la nueva ubicación del handler.
- [ ] *(No incluido en esta historia, fuera de alcance)*: arreglar que SOLVI escriba directo a Supabase desde el navegador (riesgo #10/§3.1.b de `ARQUITECTURA.md`) — es un problema distinto, no se resuelve solo con mover el handler de dominio.

**Tamaño**: L. **Depende de**: 1.0. **Paralelizable con**: 1.2, 1.3.

### 1.2 — Extraer el subsistema de jobs (exportaciones + rename) a una Edge Function propia

**Por qué**: tiene un perfil operacional distinto al resto — procesos largos por chunking con auto-invocación y timeouts propios, no request/response típico (`PROPUESTA_DEUDA_TECNICA.md` §D1). Aislarlo evita que un job pesado afecte la disponibilidad del núcleo.

**Criterios de aceptación**
- [ ] Existe una función propia (`api-jobs` o `api-exports`, nombre a confirmar) con `handlers/exportJobs.ts`, `jobs/exportJob.ts`, `jobs/renameJob.ts` y las acciones internas de auto-invocación (`_processExportJobChunk`, `_processBackgroundJobChunk`).
- [ ] La auto-invocación (`fetch(SELF_URL, ...)` con `X-Internal-Job-Secret`) apunta a la nueva función, no a `api`.
- [ ] `apiClient` enruta las acciones correspondientes a la nueva función.
- [ ] Smoke test manual documentado: una exportación de tickets completa corre de punta a punta, incluido el chunking en varios ciclos de auto-invocación.
- [ ] Smoke test manual documentado: un renombrado de campo de plantilla propaga correctamente a todos los tickets existentes.
- [ ] `resumeStalledJob` (la red de seguridad si la auto-invocación se pierde) se verifica funcionando contra la nueva función.
- [ ] `modulos/08-plantillas.md` y `modulos/09-exportaciones.md` se actualizan con la nueva ubicación.

**Tamaño**: L. **Depende de**: 1.0. **Paralelizable con**: 1.1, 1.3.

### 1.3 — *(Opcional)* Extraer migración ETL (`migration.ts`) a una Edge Function propia

**Por qué**: ya usa un mecanismo de autenticación distinto al JWT de usuario (`X-Internal-Job-Secret`, exclusivo para la herramienta externa `prisma-migrations`) — aislarla no cambia su modelo de seguridad, solo reduce superficie compartida con el resto de `api`. Es la de menor urgencia de las tres candidatas porque nunca la llama un usuario final.

**Criterios de aceptación**
- [ ] Existe una función propia (`api-migration`, nombre a confirmar) con `handlers/migration.ts`, protegida por el mismo `X-Internal-Job-Secret`.
- [ ] La herramienta externa `prisma-migrations` apunta a la nueva URL (coordinar el cambio con quien la opera).
- [ ] `modulos/10-migracion-de-datos.md` se actualiza con la nueva ubicación.

**Tamaño**: S. **Depende de**: 1.0. **Paralelizable con**: 1.1, 1.2. **Nota**: puede posponerse sin bloquear el cierre de la Fase 1 si el equipo decide priorizar solo SOLVI + jobs.

---

## Fase 2 — Autorización centralizada (D2 de la propuesta)

> Objetivo de la fase: que un handler nuevo no pueda "olvidarse" de validar visibilidad, que es hoy la causa raíz del riesgo #1/#13 de `ARQUITECTURA.md`. Aplica primero sobre lo que queda en el núcleo tras la Fase 1.

### 2.1 — Adoptar un micro-framework de ruteo con validación de payload en el núcleo

**Por qué**: hoy `router.ts` arma la tabla `action → handler` por `spread` de los 27 mapas de dominio y, ante una colisión de nombre, "gana el último en el spread" — en silencio, sin error. Tampoco hay validación de `payload`: cada handler hace su propio cast (`payload as {...}`) sin verificar nada en runtime. Esta historia no cierra ningún riesgo de autorización por sí sola — eso es 2.2 — pero es su prerrequisito técnico: para que el router pueda exigir una regla de autorización por acción (2.2), primero necesita un registro explícito de acciones del que colgar esa regla, en vez del `spread` actual. Sin 2.1, 2.2 terminaría siendo un parche de autorización metido a mano en cada uno de los 27 handlers.

**Nota de prioridad**: lo que hace urgente a este par (2.1 habilita, 2.2 cierra) es el riesgo #13 de `ARQUITECTURA.md` (§8.13): hoy cualquier usuario autenticado que llame directo a la Edge Function con el `Request_ID` de un ticket de otro departamento no encuentra ninguna barrera de autorización del lado del servidor — lo único que lo frena es que la UI nunca expone ese ID. Es una exposición real, no hipotética, vigente desde que el sistema está en producción (~5 meses). El orden recomendado en la propuesta (§4) ubica 2.1/2.2 después de que cierre la Fase 1 (partición SOLVI/jobs) por prudencia operativa (evitar migrar el router mientras se mueven handlers a otras funciones), no por una dependencia técnica dura — vale la pena que el equipo evalúe explícitamente si conviene adelantar 2.1+2.2 en paralelo a la Fase 1 en vez de esperar a que cierre, dado lo que hay expuesto mientras tanto.

**Criterios de aceptación**
- [ ] El router de `api` se reescribe sobre un micro-framework compatible con Deno/Edge Functions (p. ej. Hono), manteniendo el mismo contrato externo `{ action, payload } → { data }` / error — el frontend no necesita cambios.
- [ ] Cada acción declara un schema de payload (p. ej. con Zod); un payload inválido responde error 400 con mensaje claro, sin que el handler llegue a ejecutarse.
- [ ] Una colisión de nombre de acción entre dos handlers ahora falla explícitamente (error en build/arranque), no "gana el último silenciosamente" como hoy.
- [ ] Todos los tests de 0.3 siguen en verde tras la migración (regresión).

**Tamaño**: L. **Depende de**: Fase 1 cerrada — *o, si el equipo decide adelantarla (ver nota de prioridad), coordinación explícita con quien esté ejecutando 1.1/1.2/1.3 para no migrar el router en paralelo a mover handlers.*

### 2.2 — Middleware de autorización obligatorio (retrofit de `requests.ts`/`comments.ts`/`closure.ts`)

**Por qué**: `resolveVisibleBoardIds` hoy solo se invoca desde `boardTeams.ts` — los handlers de tickets, comentarios y cierre no verifican acceso al board/ticket sobre el que operan (riesgo #13 de `ARQUITECTURA.md`).

**Criterios de aceptación**
- [ ] Cada acción del núcleo declara explícitamente su regla de autorización (p. ej. `requireBoardAccess: true/false`, o una función de chequeo), ejecutada por el router de 2.1 **antes** de invocar el handler.
- [ ] Se aplica, como mínimo, a `requests.ts`, `comments.ts` y `closure.ts` — los identificados en riesgo #13.
- [ ] Un usuario sin acceso al board/ticket recibe 403 antes de que el handler toque datos (verificado con un test que reproduce el caso documentado en 0.3).
- [ ] Se agrega una verificación (test o chequeo en el router de 2.1) que **falla si se registra una acción nueva sin declarar su regla de autorización** — esto es lo que evita que el problema vuelva a aparecer con el próximo handler.
- [ ] `ARQUITECTURA.md` §8.1 y §8.13 se actualizan reflejando la mitigación (no se borran — quedan como "resuelto en [fecha/PR]" para que el historial no se pierda).

**Tamaño**: M. **Depende de**: 2.1.

---

## Fase 3 — RLS como defensa en profundidad (D4 de la propuesta)

### 3.1 — Generalizar RLS como red de seguridad adicional

**Por qué**: PRISMA ya depende de RLS para la excepción `USE_DIRECT_READS` (§3.1.a de `ARQUITECTURA.md`) — el patrón ya existe, solo no está generalizado. No reemplaza la validación de la Fase 2, es una segunda capa por si un handler (o una función mal configurada) se olvida.

**Criterios de aceptación**
- [ ] Existen políticas RLS activas en, como mínimo, `TBL_Requests` y `TBL_Board_Team_Access`, que aproximan la lógica de `resolveVisibleBoardIds`.
- [ ] Se documenta explícitamente (en `ARQUITECTURA.md`) que la Edge Function sigue siendo la vía primaria soportada — RLS es defensa en profundidad, no un segundo camino de acceso a promover.
- [ ] Se verifica (test o procedimiento manual documentado) que un JWT "authenticated" de un usuario sin permiso, usado directo contra PostgREST, no puede leer requests fuera de su alcance.
- [ ] La excepción ya existente `USE_DIRECT_READS` sigue funcionando igual o mejor — no se rompe `fetchByTeamCode`/`fetchUncategorized`.

**Tamaño**: M. **Depende de**: Fase 2 cerrada (tiene más sentido generalizar RLS una vez la autorización en código ya es consistente, para no mantener dos lógicas divergentes desde el principio).

---

## Fase 4 — Revisión futura (condicional, no comprometida)

### 4.1 — Spike: ¿partición del resto del núcleo, o backend separado?

**Por qué**: la propuesta (§4, paso 5) es explícita en que esto **no** se decide hoy — se revisa "si el crecimiento lo justifica", con datos reales de qué falta.

**Criterios de aceptación**
- [ ] Esta historia **no se planifica en un sprint fijo** — se dispara cuando aparezca al menos una señal concreta: p. ej. `requests.ts` (u otro handler del núcleo) supera un tamaño que empieza a doler en la práctica, el equipo crece lo suficiente para operar más infraestructura, o aparece una necesidad técnica que Supabase Edge Functions no cubre (cómputo pesado sostenido, WebSockets persistentes, runtime Node específico).
- [ ] Cuando se dispare, el resultado esperado es una decisión documentada (actualizar `PROPUESTA_DEUDA_TECNICA.md` §4 con la evaluación nueva), no necesariamente código.
- [ ] Explícitamente **no** se recomienda adelantar esta historia solo porque las Fases 0-3 ya cerraron — el gate es la señal de necesidad, no el calendario.

**Tamaño**: XS (es una decisión/spike, no una implementación). **Depende de**: Fase 3 cerrada + señal concreta.

---

## Backlog transversal — bugs puntuales ya documentados (sin fase, no bloquea el roadmap arquitectónico)

> A diferencia de las Fases 0-4, esta historia no depende de ningún orden ni de que cierre nada anterior — son bugs de comportamiento ya identificados en `ARQUITECTURA.md` §8, independientes de qué arquitectura de backend se elija. Puede tomarse en paralelo a cualquier fase.

### B.1 — Arreglar bugs puntuales ya documentados del tablero

**Por qué**: son fallos de comportamiento concretos ya señalados en `ARQUITECTURA.md` §8, no deuda de arquitectura — no requieren decidir nada de particionamiento/autorización/RLS para corregirse, solo trabajo de bugfixing puntual sobre el núcleo de tickets.

**Criterios de aceptación**
- [ ] **Correo duplicado y `notifyEvent()` sin adoptar** (`ARQUITECTURA.md` §8.6): existen dos implementaciones de `sendEventEmail` (`supabase/functions/api/email/send.ts` vs. `supabase/functions/api/shared/email.ts`, esta última deja el correo en `pending` sin enviarlo nunca). Se consolida en una sola implementación, se migran los handlers que hoy importan la versión que no envía, y se adopta `notifyEvent()` como punto único para notificación in-app + correo en vez de que cada handler arme ambas por separado.
- [ ] **Timestamps sin `Z`** (`ARQUITECTURA.md` §8.7): los timestamps que devuelve Supabase no siempre traen el sufijo `Z` (UTC); si se parsean tal cual, el navegador los interpreta en hora local. El "Fix de horas hábiles" reciente corrigió un caso puntual — esta historia audita el resto de los puntos donde se hace `new Date(...)` sobre un timestamp del backend (cálculos de SLA, fechas mostradas en el tablero) y normaliza agregando `Z` de forma consistente, no caso por caso a medida que aparece el síntoma.
- [ ] **`Request_ID` como `number` vs `string`** (`ARQUITECTURA.md` §8.12): el tipo generado (obsoleto) lo declara `number`, pero el código actual lo trata como `string` en casi todos los puntos de uso. Se corrige la declaración de tipo y se audita el código en busca de comparaciones estrictas, claves de caché de React Query o parámetros de URL que asuman el tipo equivocado (ver detalle en [`BASE_DE_DATOS.md`](BASE_DE_DATOS.md)).
- [ ] Cada fix queda acompañado de un test si ya existe runner (de 0.3) o, si 0.3 todavía no cerró, al menos un smoke test manual documentado en el PR.
- [ ] `ARQUITECTURA.md` §8 se actualiza marcando cada punto corregido como "resuelto en [fecha/PR]", sin borrar el punto (para no perder el historial del riesgo).

**Tamaño**: M. **Depende de**: nada. **Paralelizable con**: cualquier fase — no toca router, autorización ni despliegue.

---

## Qué queda deliberadamente fuera de este roadmap

- **Backend separado (Opción A completa)**: no recomendado hoy por la propuesta (§4); solo reaparece, condicionalmente, en 4.1.
- **Particionar el resto del núcleo** (tickets, comentarios, organización, notificaciones, sprints) más allá de lo que ya sale en la Fase 1: mismo motivo, es parte de 4.1.
- **Arreglar que SOLVI escriba directo a Supabase desde el navegador** (riesgo #10/§3.1.b de `ARQUITECTURA.md`): es un problema de arquitectura de esa integración puntual, no de dónde vive el handler — mover el handler en 1.1 no lo resuelve, y no está en el alcance de `PROPUESTA_DEUDA_TECNICA.md`.
- **Otros puntos frágiles puntuales de `ARQUITECTURA.md` §8 no cubiertos por B.1** (p. ej. §8.3 migración MSAL⇄Supabase Auth en curso, §8.4 `supabase.types.ts` desactualizado, §8.9 flags de desarrollo, §8.11 PWA/versión): son bugs/inconsistencias a corregir por su cuenta si el equipo lo prioriza, no parte de este roadmap (aunque los tests de 0.3 podrían ser el lugar natural para atraparlos si el equipo quiere sumarlos ahí).

---

*Documento derivado de `PROPUESTA_DEUDA_TECNICA.md` (septiembre de 2026). Es un backlog ordenado para discusión y priorización del equipo, no un compromiso de fechas — ajustar tamaños/orden según lo que se aprenda al ejecutar cada historia.*
