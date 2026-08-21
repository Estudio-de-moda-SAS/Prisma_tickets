import type { DB } from '../lib/supabase.ts';

/**
 * Tipos compartidos y mappers de fila → DTO.
 *
 * Define el contrato del sistema de acciones ({@link Dispatch},
 * {@link ActionContext}, {@link ActionHandler}), la forma de los filtros de
 * exportación ({@link ExportFilters}) y utilidades para mapear filas crudas de
 * la base a objetos con claves camelCase ({@link mapCriteria},
 * {@link mapAnnouncement}).
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

/**
 * Mapea una fila cruda de criterio de aceptación a su DTO camelCase.
 *
 * @param row - Fila de `TBL_Acceptance_Criteria`.
 * @returns El criterio con claves camelCase; campos opcionales quedan en `null`
 *   si están ausentes.
 */
export function mapCriteria(row: Record<string, unknown>) {
  return {
    criteriaId:    row['Criteria_ID'],
    requestId:     row['Request_ID'],
    title:         row['Title'],
    status:        row['Status'],
    reviewerNotes: row['Reviewer_Notes'] ?? null,
    reviewedBy:    row['Reviewed_By']    ?? null,
    reviewedAt:    row['Reviewed_At']    ?? null,
    createdAt:     row['Created_At'],
    updatedAt:     row['Updated_At'],
  };
}

/**
 * Mapea una fila cruda de anuncio a su DTO camelCase.
 *
 * @param row - Fila de la tabla de anuncios.
 * @returns El anuncio con claves camelCase; campos opcionales quedan en `null`
 *   si están ausentes.
 */
export function mapAnnouncement(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id:         row['announcement_id'],
    title:      row['title'],
    body:       row['body'] ?? null,
    type:       row['type'],
    showIn:     row['show_in'],
    targetRole: row['target_role'] ?? null,
    isActive:   row['is_active'],
    startsAt:   row['starts_at'],
    endsAt:     row['ends_at'] ?? null,
    createdAt:  row['created_at'],
  };
}