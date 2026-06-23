import type { DB } from '../lib/supabase.ts';

export async function attachCriteriaSummary(
  rows: Record<string, unknown>[],
  supabase: DB,
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r['Request_ID'] as string);
  const { data, error } = await supabase
    .from('TBL_Acceptance_Criteria')
    .select('Request_ID, Status')
    .in('Request_ID', ids);
  if (error || !data) return rows;

  const map: Record<string, { total: number; accepted: number; rejected: number }> = {};
  for (const c of data as { Request_ID: string; Status: string }[]) {
    if (!map[c.Request_ID]) map[c.Request_ID] = { total: 0, accepted: 0, rejected: 0 };
    map[c.Request_ID].total++;
    if (c.Status === 'accepted') map[c.Request_ID].accepted++;
    if (c.Status === 'rejected') map[c.Request_ID].rejected++;
  }

  return rows.map((r) => ({
    ...r,
    criteria_summary: map[r['Request_ID'] as string] ?? null,
  }));
}