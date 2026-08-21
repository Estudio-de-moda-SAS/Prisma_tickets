import type { DB } from '../lib/supabase.ts';

/**
 * Tipos compartidos del sistema de acciones y de la exportación.
 *
 * Define el contrato de despacho de acciones ({@link Dispatch},
 * {@link ActionContext}, {@link ActionHandler}) y la forma de los filtros de
 * exportación ({@link ExportFilters}).
 *
 * @module types
 */

/**
 * Despacha una acción por nombre hacia su handler correspondiente.
 *
 * @param action - Nombre de la acción a ejecutar.
 * @param payload - Datos de entrada de la acción.
 * @returns El resultado del handler.
 */
export type Dispatch = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Contexto de ejecución que recibe cada {@link ActionHandler}.
 */
export interface ActionContext {
  /** Cliente de Supabase con rol de servicio. */
  supabase: DB;
  /** Función para invocar otras acciones desde dentro de un handler. */
  dispatch: Dispatch;
}

/**
 * Firma de un manejador de acción.
 *
 * @param payload - Datos de entrada de la acción.
 * @param ctx - Contexto de ejecución ({@link ActionContext}).
 * @returns El resultado de la acción.
 */
export type ActionHandler = (
  payload: Record<string, unknown>,
  ctx: ActionContext,
) => Promise<unknown>;

/**
 * Filtros para la exportación de requests.
 *
 * @remarks
 * `boardId` es obligatorio; el resto son opcionales. Los filtros relacionales
 * (`teamIds`, `sprintIds`, `assignedToIds`, `labelIds`) se resuelven vía tablas
 * de unión, mientras que los demás son escalares aplicados directamente sobre
 * `TBL_Requests`.
 */
export type ExportFilters = {
  /** Board del que se exportan los requests (obligatorio). */
  boardId:          number;
  /** Filtra por equipos asignados (relacional). */
  teamIds?:         number[] | null;
  /** Filtra por sprints (relacional). */
  sprintIds?:       number[] | null;
  /** Filtra por columnas del board (escalar). */
  columnIds?:       number[] | null;
  /** Filtra por usuarios solicitantes (escalar). */
  requestedByIds?:  number[] | null;
  /** Filtra por usuarios asignados (relacional). */
  assignedToIds?:   number[] | null;
  /** Filtra por puntajes de prioridad (escalar). */
  priorityScores?:  number[] | null;
  /** Filtra por plantillas (escalar). */
  templateIds?:     number[] | null;
  /** Filtra por etiquetas (relacional). */
  labelIds?:        number[] | null;
  /** Filtra por confidencialidad; `null`/ausente = sin filtro. */
  isConfidential?:  boolean | null;
  /** Fecha de creación desde (inclusive), ISO. */
  dateFrom?:        string | null;
  /** Fecha de creación hasta (inclusive), ISO. */
  dateTo?:          string | null;
};