# PRISMA · Migración de solicitudes históricas

Proyecto independiente para migrar solicitudes históricas desde archivos **Excel** hacia la base de datos relacional de **PRISMA Tickets** (Supabase), respetando su modelo de plantillas, junctions y generación de IDs.

Es un proyecto **hermano** de la app (vive fuera de `src/` y de `supabase/`). No se despliega: se ejecuta de forma puntual desde tu máquina.

---

## 1. Qué hace y cómo piensa

La migración sigue el patrón **ETL** en tres fases separadas, lo que permite validar sin escribir y reejecutar sin duplicar:

1. **Extract** — lee el Excel y entrega cada fila como `{ 'Encabezado': valor }` (lectura por *nombre* de columna, no por posición).
2. **Transform** — un *manifiesto declarativo* mapea cada columna a su destino en Prisma y aplica las conversiones (horas, fechas, booleanos, score, asignados).
3. **Load** — crea las solicitudes llamando al Edge Function, resolviendo antes sus dependencias (sprints y etiquetas).

Principios clave:

- **Idempotencia**: cada fila migrada se registra en `TBL_Migration_Map` por `(archivo, fila)`. Reejecutar no duplica; solo procesa lo que falta.
- **Dry-run primero**: una pasada que valida y reporta sin escribir nada.
- **No se pierden datos**: campos imperfectos (sin título, prioridad rara, asignado ambiguo) se migran igual y se marcan en el reporte para revisión.
- **Nunca adivina asignados**: si un nombre no resuelve a un único usuario, la solicitud queda sin asignar y se reporta.

---

### 2 Usuario para comentariso del sistema

Debe existir el usuario **id 17** **sisinfo@estudiodemoda.com.co**(`MigracionesPRISMA`), autor de los comentarios migrados ("Notas").

---

## 3. Estructura del proyecto

```
prisma-migrations/
├── .env                         # URL + secreto (no se sube)
├── package.json
├── tsconfig.json
└── src/
    ├── run.ts                   # orquestador CLI (punto de entrada)
    ├── config/
    │   ├── runConfig.ts         # ⚙️ IDs de la corrida + mapa de prioridad
    │   └── mapping.ts           # 📋 MANIFIESTO: columnas → destino
    ├── lib/
    │   ├── apiClient.ts         # fetch al Edge Function (X-Internal-Job-Secret)
    │   ├── excel.ts             # lectura del .xlsx → filas por encabezado
    │   ├── transforms.ts        # conversiones (horas, fechas, bool, score)
    │   ├── users.ts             # resuelve "Asignada" → User_ID
    │   └── buildPayload.ts      # fila cruda → payload de migrateRequest
    └── phases/
        ├── 01-resolve.ts        # upsert de sprints y etiquetas → mapas id
        ├── 02-validate.ts       # DRY-RUN: reporte sin escribir
        └── 03-load.ts           # COMMIT: crea las solicitudes
```

---

## 4. Cómo usarlo

Pon el Excel en una carpeta (ej. `excels/`) y corre **siempre el dry-run primero**:

```bash
# 1. Dry-run: valida y reporta, NO escribe
npm run dry -- --file ./excels/crm.xlsx

# Si los datos no están en la primera hoja:
npm run dry -- --file ./excels/crm.xlsx --sheet "Todas"

# 2. Cuando el reporte se vea bien: commit (ESCRIBE)
npm run commit -- --file ./excels/crm.xlsx
```

El `--` después de `npm run dry` es obligatorio: separa los argumentos de npm de los del script.

### Qué leer del reporte del dry-run

- **Encabezados faltantes**: si un nombre de columna del manifiesto no existe en el Excel (por una tilde o espacio), ese campo quedaría vacío. Corrígelo en `mapping.ts`.
- **Asignados sin resolver**: nombres que no matchean a un único usuario. Se migran sin asignar.
- **Sprints / etiquetas a crear**: lo que nacerá nuevo en la base.
- **Filas con advertencias**: fechas ilegibles, prioridades desconocidas, etc.

### Reejecutar

El commit es **idempotente**. Si falla a mitad o quieres reintentar filas fallidas: corrige el dato y vuelve a correr `npm run commit`. Las filas ya migradas se saltan automáticamente (aparecen como "saltadas").

---

## 5. Cómo cambiar el manifiesto (otro Excel)

Esta es la parte clave del diseño: **para adaptar otro Excel solo se edita `src/config/mapping.ts` y `src/config/runConfig.ts`. El motor no se toca.**

### 5.1 Cambiar a qué columna del Excel corresponde cada campo

En `mapping.ts`, el objeto `COL` ata cada destino al **nombre exacto** del encabezado:

```ts
export const COL = {
  titulo:      'Actividad',                  // ← nombre del encabezado en el Excel
  descripcion: 'Descripción de la solicitud',
  asignada:    'Asignada',
  sprint:      'Sprint',
  epica:       'Epica',
  // …
};
```

Si tu nuevo Excel llama "Asunto" a lo que antes era "Actividad", cambias **solo el valor**:

```ts
  titulo: 'Asunto',
```

El nombre debe coincidir **carácter por carácter** con el encabezado (tildes, mayúsculas, espacios incluidos). El dry-run avisa si no coincide.

### 5.2 Columnas que se ignoran

`DISCARDED_COLUMNS` es solo documentación de qué se descarta y por qué. No afecta la ejecución; sirve para dejar explícito el criterio.

### 5.3 Enrutar por Status (cuando haga falta)

Hoy todas las solicitudes caen en la columna **Historial** (`DEFAULT_COLUMN_ID`). Para enrutar según el Status del Excel, agrega entradas a `STATUS_TO_COLUMN` con la **clave normalizada** (minúsculas, sin tildes) y el `Board_Column_ID` destino:

```ts
export const STATUS_TO_COLUMN: Record<string, number> = {
  'en curso':       5,
  'historial done': 9,
};
```

Lo que no esté en el mapa cae en `DEFAULT_COLUMN_ID`.

### 5.4 Plantilla destino y "Datos adicionales"

Cada corrida elige a qué **plantilla** (`Request_Template_ID`) se migran las solicitudes, vía `TEMPLATE_ID` en `runConfig.ts`:

- **General** (`TEMPLATE_ID = 1`): plantilla con `Form_Schema = []`. Las solicitudes quedan con `Form_Data = {}`. Se usa cuando el Excel no trae columnas extra que valga la pena conservar.
- **Migraciones** (`TEMPLATE_ID = 12`): plantilla con un único campo `datos_adicionales` (tipo *textarea*, solo lectura). Se usa cuando el Excel trae columnas extra (ej. "Tienda") que no encajan en el modelo estándar pero deben conservarse.

La plantilla de Migraciones existe para guardar datos heterogéneos sin contaminar plantillas operativas: el campo es texto libre, así que acepta **cualquier** valor (uno, varios, o fuera de lista) sin romper la UI. Las solicitudes migradas son de solo lectura sobre ese dato.

#### Volcar varias columnas del Excel al campo

`EXTRA_DATA_COLS` (en `runConfig.ts`) declara **qué columnas del Excel** se vuelcan al campo `datos_adicionales`, cada una con la etiqueta con la que se mostrará:

```ts
export const EXTRA_DATA_COLS: { excelHeader: string; label: string }[] = [
  { excelHeader: 'Tienda', label: 'Tienda' },
];
```

Cada columna con valor se agrega como `Etiqueta: valor`, y si hay **varias**, se separan con salto de línea. Por ejemplo, con esta config:

```ts
export const EXTRA_DATA_COLS = [
  { excelHeader: 'Tienda',    label: 'Tienda'    },
  { excelHeader: 'Sucursal',  label: 'Sucursal'  },
  { excelHeader: 'Proveedor', label: 'Proveedor' },
];
```
una fila produce un `datos_adicionales` así:
Tienda: Pilatos
Sucursal: Centro
Proveedor: ACME

### 5.5 IDs de la corrida

En `runConfig.ts` están los parámetros que cambian entre ejecuciones, marcados arriba del archivo:

```ts
export const BOARD_ID         = 1;   // board destino
export const TEMPLATE_ID      = 12;  // 👉 plantilla: 1=General, 12=Migraciones
export const TARGET_TEAM_ID   = 1;   // 👉 equipo destino — cambiar por corrida
export const TARGET_COLUMN_ID = 9;   // 👉 columna destino (Historial)
export const COMMENT_USER_ID  = 17;  // autor de las notas migradas

// 👉 Columnas extra del Excel → campo datos_adicionales (vacío en corrida General)
export const EXTRA_DATA_COLS = [
  { excelHeader: 'Tienda', label: 'Tienda' },
];
export const EXTRA_DATA_FIELD_KEY = 'datos_adicionales';
```

Para migrar a otro equipo: cambias `TARGET_TEAM_ID`. **Un equipo por corrida.**

### 5.6 Mapa de prioridad

`PRIORITY_TO_SCORE` traduce el texto de Prioridad a `Request_Score`. Las claves van normalizadas:

```ts
export const PRIORITY_TO_SCORE = {
  bajo: 1, baja: 1,
  medio: 2, media: 2,
  alto: 4, alta: 4,
  urgente: 6,
};
```

### 5.7 Conversiones nuevas

Si un Excel trae un formato distinto (ej. fechas con guiones, horas en otro formato), las funciones de conversión viven en `src/lib/transforms.ts`. Ahí se ajusta el parseo sin tocar el manifiesto.

---

## 6. Decisiones de mapeo (referencia)

| Columna Excel | Destino en Prisma | Conversión |
|---|---|---|
| Actividad | `Request_Title` | — |
| Descripción de la solicitud | `Request_Description` | — |
| Prioridad | `Request_Score` | texto → score |
| Información sensible o confidencial | `Request_Is_Confidential` | Sí/No → bool |
| Tiempo estimado | `Request_Estimated_Hours` | HH:MM → decimal |
| Tiempo real consumido | `Request_Logged_Hours` | HH:MM → decimal |
| Actividad creada | `Request_Created_At` | D/M/AAAA → UTC (Bogotá) |
| Actividad cerrada | `Request_Finished_At` | D/M/AAAA → UTC; deriva Progress=100 |
| Equipo solicitante | `Request_Legacy_Requester` (+ `Is_Legacy=true`) | texto crudo |
| Status | `Request_Board_Column_ID` | mapa (hoy → Historial) |
| Sprint | junction `TBL_Request_Sprint` | upsert por texto |
| Epica | junction `TBL_Request_Labels` | upsert por (nombre, equipo, board) |
| Asignada | junction `TBL_Requests_Assignments` | nombre → User_ID |
| Notas | `TBL_Comments` (autor: user 17) | — |
| (equipo destino) | junction `TBL_Request_Team` | de `TARGET_TEAM_ID` |
| (columnas extra, ej. Tienda) | `Request_Form_Data.datos_adicionales` (template 12) | `Etiqueta: valor` por línea |

Las solicitudes migradas se crean con `Request_Requested_By = null` y `Request_Is_Legacy = true`. La plantilla depende de la corrida: **General** (`Form_Data = {}`) cuando no hay columnas extra, o **Migraciones** (template 12) cuando se conservan datos adicionales en el campo `datos_adicionales`.

---

## 7. Reglas de resolución

- **Sprints**: por `Sprint_Text` exacto. Si no existe, se crea con fechas en `null`. Si hubiera repetidos, se usa el de menor `Sprint_ID`.
- **Etiquetas (Epica)**: por la tripleta `(nombre, equipo, board)` — el nombre es único dentro de un equipo. Si no existe en ese equipo, se crea con ícono (emoji) y color aleatorios del pool del ConfigPanel.
- **Asignados**: el nombre del Excel se compara (sin tildes, ignorando mayúsculas) contra nombre completo, display colombiano (1er nombre + 1er apellido) y primer nombre. Si matchea exactamente uno → asigna. Si cero o varios → sin asignar + reporte.

---

## 8. Rollback

Para revertir una migración se usan `TBL_Migration_Map` (solicitudes) y los arrays de sprints/etiquetas creados que reporta el commit. Las solicitudes migradas son identificables por `Request_Is_Legacy = true`. El SQL de rollback se genera bajo demanda (no incluido aquí por defecto para evitar borrados accidentales).

> Nota: detectar "huérfanos" (solicitudes creadas pero no registradas en el mapa, por un fallo a mitad de fila) es directo: son solicitudes con `Is_Legacy = true` que no aparecen en `TBL_Migration_Map`.

---

## 9. Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `401 No autorizado (internal)` | El `INTERNAL_JOB_SECRET` del `.env` no coincide con el de Supabase, o quedó con `<>`. |
| `Falta PRISMA_API_URL` | El archivo es `.env.local` en vez de `.env`, o falta la variable. |
| Un campo siempre vacío | El encabezado en el Excel no coincide con el nombre en `COL`. Revisa el aviso de "encabezados faltantes" del dry-run. |
| Muchos asignados "no encontrados" | Inconsistencias de nombre entre el Excel y `TBL_Users`. Se revisan a mano. |
| Fechas corridas un día | El Excel trae un formato no esperado; ajustar `colombianDateToUTC` en `transforms.ts`. |
| `No inputs were found` (TS) | No hay archivos `.ts` dentro de `src/`. |

---

## 10. Mantenimiento

- El **pool de íconos/colores** está duplicado en `handlers/migration.ts` (el Edge Function no puede importar de `src/`). Si cambia el pool del ConfigPanel del front, reflejarlo ahí.
- `BASE_SELECT` es el contrato: si se agregan campos a `TBL_Requests`, actualizarlo.
