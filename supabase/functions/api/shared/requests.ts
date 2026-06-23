import type { DB } from '../lib/supabase.ts';

export async function getRequestParticipants(
  supabase: DB,
  requestId: string,
): Promise<{ assigneeIds: number[]; requestedBy: number | null }> {
  const [assignmentsRes, requestRes] = await Promise.all([
    supabase
      .from('TBL_Requests_Assignments')
      .select('Request_Assignment_User_ID')
      .eq('Request_Assignment_ID', requestId),
    supabase
      .from('TBL_Requests')
      .select('Request_Requested_By')
      .eq('Request_ID', requestId)
      .single(),
  ]);

  const assigneeIds = (
    (assignmentsRes.data ?? []) as { Request_Assignment_User_ID: number }[]
  ).map((a) => a.Request_Assignment_User_ID);

  const requestedBy = requestRes.data
    ? (requestRes.data as { Request_Requested_By: number }).Request_Requested_By
    : null;

  return { assigneeIds, requestedBy };
}

export async function isCloseColumn(
  supabase: DB,
  columnId: number,
  requestId: string,
): Promise<boolean> {
  const { data: reqTeams } = await supabase
    .from('TBL_Request_Team')
    .select('Request_Team_ID')
    .eq('Request_Team_Request_ID', requestId);

  const teamIds = ((reqTeams ?? []) as { Request_Team_ID: number }[])
    .map((t) => t.Request_Team_ID);
  if (teamIds.length === 0) return false;

  const { data: cfg } = await supabase
    .from('TBL_Team_Column_Config')
    .select('Config_ID')
    .eq('Column_ID', columnId)
    .in('Team_ID', teamIds)
    .eq('Is_Close_Column', true)
    .limit(1)
    .maybeSingle();

  return cfg !== null;
}