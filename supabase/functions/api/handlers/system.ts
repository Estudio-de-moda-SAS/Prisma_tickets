import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { RATING_RATE_LIMIT_DAYS } from '../config.ts';
// @ts-ignore
import { _kickoffJobChunk } from '../jobs/renameJob.ts';

export const systemHandlers: Record<string, ActionHandler> = {
  createBugReport: async (payload, { supabase }) => {
    const p = payload as {
      userId:     number;
      title:      string;
      description: string;
      severity:   'bajo' | 'medio' | 'alto' | 'critico';
      screenPath: string | null;
    };
    const { data, error } = await supabase
      .from('TBL_Bug_Reports')
      .insert({
        User_ID:     p.userId,
        Title:       p.title.trim(),
        Description: p.description.trim(),
        Severity:    p.severity,
        Screen_Path: p.screenPath ?? null,
        Status:      'pendiente',
        Created_At:  new Date().toISOString(),
        Updated_At:  new Date().toISOString(),
      })
      .select('"Report_ID", "Title", "Severity", "Status", "Created_At"')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  fetchBugReports: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Bug_Reports')
      .select(`
        "Report_ID", "Title", "Description", "Severity", "Status", "Screen_Path",
        "Created_At", "Updated_At",
        reporter:TBL_Users!User_ID ( User_ID, User_Name, User_Email )
      `)
      .order('Created_At', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  updateBugReportStatus: async (payload, { supabase }) => {
    const { reportId, status } = payload as { reportId: number; status: string };
    const { error } = await supabase
      .from('TBL_Bug_Reports')
      .update({ Status: status, Updated_At: new Date().toISOString() })
      .eq('Report_ID', reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  createSatisfactionRating: async (payload, { supabase }) => {
    const p = payload as {
      userId:  number;
      score:   number;
      comment: string | null;
    };

    if (RATING_RATE_LIMIT_DAYS > 0) {
      const since = new Date();
      since.setDate(since.getDate() - RATING_RATE_LIMIT_DAYS);
      const { data: recent } = await supabase
        .from('TBL_Satisfaction_Ratings')
        .select('"Rating_ID"')
        .eq('User_ID', p.userId)
        .gte('Created_At', since.toISOString())
        .limit(1)
        .maybeSingle();
      if (recent) throw new Error(`Solo puedes calificar cada ${RATING_RATE_LIMIT_DAYS} días.`);
    }

    const { data, error } = await supabase
      .from('TBL_Satisfaction_Ratings')
      .insert({
        User_ID:    p.userId,
        Score:      p.score,
        Comment:    p.comment?.trim() ?? null,
        Created_At: new Date().toISOString(),
      })
      .select('"Rating_ID", "Score", "Created_At"')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  fetchSatisfactionRatings: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Satisfaction_Ratings')
      .select(`
        "Rating_ID", "Score", "Comment", "Created_At",
        rater:TBL_Users!User_ID ( User_ID, User_Name, User_Email )
      `)
      .order('Created_At', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  getBackgroundJob: async (payload, { supabase }) => {
    const { jobId } = payload as { jobId: string };
    const { data, error } = await supabase
      .from('TBL_Background_Jobs')
      .select('Job_ID, Job_Type, Job_Status, Job_Progress_Current, Job_Progress_Total, Job_Result, Job_Error, Job_Created_At, Job_Updated_At, Job_Completed_At')
      .eq('Job_ID', jobId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  resumeStalledJob: async (payload, { supabase }) => {
    const { jobId } = payload as { jobId: string };
    const { data: job } = await supabase
      .from('TBL_Background_Jobs')
      .select('Job_Status, Job_Updated_At')
      .eq('Job_ID', jobId)
      .single();
    if (!job) throw new Error('Job no encontrado.');
    if ((job as any).Job_Status === 'done' || (job as any).Job_Status === 'failed') {
      return { resumed: false, status: (job as any).Job_Status };
    }
    const lastUpdate = new Date((job as any).Job_Updated_At).getTime();
    if (Date.now() - lastUpdate > 60_000) {
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(_kickoffJobChunk(jobId));
      } else {
        _kickoffJobChunk(jobId).catch(() => {});
      }
      return { resumed: true };
    }
    return { resumed: false };
  },
};
