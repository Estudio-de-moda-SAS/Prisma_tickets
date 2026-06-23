import type { DB } from '../lib/supabase.ts';

export type Dispatch = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

export interface ActionContext {
  supabase: DB;
  dispatch: Dispatch;
}

export type ActionHandler = (
  payload: Record<string, unknown>,
  ctx: ActionContext,
) => Promise<unknown>;

export type ExportFilters = {
  boardId:          number;
  teamIds?:         number[] | null;
  sprintIds?:       number[] | null;
  columnIds?:       number[] | null;
  requestedByIds?:  number[] | null;
  assignedToIds?:   number[] | null;
  priorityScores?:  number[] | null;
  templateIds?:     number[] | null;
  labelIds?:        number[] | null;
  isConfidential?:  boolean | null;
  dateFrom?:        string | null;
  dateTo?:          string | null;
};
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