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