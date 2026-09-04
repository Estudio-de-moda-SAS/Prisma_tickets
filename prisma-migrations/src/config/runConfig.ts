/* ════════════════════════════════════════════════════════════
   ⚙️  EDITAR AQUÍ ANTES DE CADA CORRIDA
   ════════════════════════════════════════════════════════════ */

/** Board destino. La app usa siempre 1 (config.DEFAULT_BOARD_ID). */
export const BOARD_ID = 1;

/** 👉 Plantilla destino de ESTA corrida (Request_Template_ID).
 *   - General (Form_Schema = []): 1
 *   - Migraciones (campo datos_adicionales): 12 */
export const TEMPLATE_ID = 1;

/** 👉 Equipo destino de ESTA corrida (Board_Team_ID). Cambiar por equipo. 
 * Desarrollo & UX Ecom : 1
 * CRM : 2
 * Sistemas de la informacion : 3
 * Ciencia de datos : 4
 * Pruebas PRISMA : 7
 * Proyectos : 9
 * Desarrollo TI : 11
 * Procesos : 12
*/
export const TARGET_TEAM_ID = 4;

/** 👉 Columna destino. Hoy todo va a "Historial" (Board_Column_ID = 9). */
export const TARGET_COLUMN_ID = 9;

/** Autor de los comentarios migrados ("Notas"). Usuario "MigracionesPRISMA". */
export const COMMENT_USER_ID = 17;

/** 👉 Columnas extra del Excel que se vuelcan al campo `datos_adicionales`
 *   del template de Migraciones, como "Etiqueta: valor" separadas por salto
 *   de línea. Vacío [] = no se arma datos_adicionales (corrida General).
 *   `excelHeader` debe coincidir EXACTO con el encabezado del Excel. */
export const EXTRA_DATA_COLS: { excelHeader: string; label: string }[] = [
  { excelHeader: 'Impacto normativo (legal)', label: 'Impacto normativo' },
  { excelHeader: 'Impacto económico en la venta', label: 'Impacto económico en la venta' },
  { excelHeader: 'Impacto en el gasto', label: 'Impacto en el gasto' },
  { excelHeader: 'Impacto en capital de trabajo', label: 'Impacto en capital de trabajo' },
  { excelHeader: 'Impacto experiencia del cliente', label: 'Impacto experiencia del cliente' },
];

/** Key del campo en el Form_Schema del template de Migraciones (ID 12). */
export const EXTRA_DATA_FIELD_KEY = 'datos_adicionales';
/* ════════════════════════════════════════════════════════════
   Mapa Prioridad → Score
   Claves normalizadas (minúsculas, sin tildes). Acepta las
   variantes masculino/femenino que aparezcan en el Excel.
   ════════════════════════════════════════════════════════════ */
export const PRIORITY_TO_SCORE: Record<string, number> = {
  bajo: 1, baja: 1,
  medio: 2, media: 2,
  alto: 4, alta: 4,
  urgente: 6,
};