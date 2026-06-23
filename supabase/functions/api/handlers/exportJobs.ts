import type { ActionHandler, ExportFilters } from '../shared/types.ts';
// @ts-ignore
import { MAX_EXPORT_SIZE, EXPORT_JOB_CHUNK_SIZE, EXPORT_BUCKET } from '../config.ts';
// @ts-ignore
import { BASE_SELECT } from '../shared/selects.ts';
import {
  _resolveExportCandidateIds, _countExportMatches, _uploadExportArtifact,
  _kickoffExportChunk, _cleanupExportArtifacts,
// @ts-ignore
} from '../jobs/exportJob.ts';

export const exportJobHandlers: Record<string, ActionHandler> = {
  createExportJob: async (payload, { supabase }) => {
    const p = payload as {
      userId:           number;
      boardId:          number;
      filters:          Omit<ExportFilters, 'boardId'>;
      format:           'xlsx' | 'csv';
      selectedColumns:  string[];
      sheetPerTemplate: boolean;
    };

    const fullFilters: ExportFilters = { ...p.filters, boardId: p.boardId };

    const candidateIds = await _resolveExportCandidateIds(supabase, fullFilters);

    const total = await _countExportMatches(supabase, fullFilters, candidateIds);

    if (total === 0) throw new Error('Ningún ticket coincide con los filtros seleccionados.');
    if (total > MAX_EXPORT_SIZE) {
      throw new Error(`El export tiene ${total.toLocaleString('es-CO')} tickets, supera el límite máximo de ${MAX_EXPORT_SIZE.toLocaleString('es-CO')}. Ajustá los filtros para reducir el alcance.`);
    }

    const chunksTotal = Math.ceil(total / EXPORT_JOB_CHUNK_SIZE);

    const { data: jobInsert, error: jobErr } = await supabase
      .from('TBL_Background_Jobs')
      .insert({
        Job_Type:           'export_requests',
        Job_Status:         'pending',
        Job_Payload:        {},
        Job_Progress_Total: total,
        Job_Created_By:     p.userId,
      })
      .select('Job_ID')
      .single();
    if (jobErr) throw new Error(jobErr.message);
    const jobId = (jobInsert as { Job_ID: string }).Job_ID;

    const { data: histInsert, error: histErr } = await supabase
      .from('TBL_Export_History')
      .insert({
        Export_Job_ID:        jobId,
        Export_User_ID:       p.userId,
        Export_Format:        p.format,
        Export_Filters:       fullFilters,
        Export_Columns:       p.selectedColumns,
        Export_Sheet_Per_Tpl: p.sheetPerTemplate,
        Export_Total:         total,
      })
      .select('Export_ID')
      .single();
    if (histErr) throw new Error(histErr.message);
    const exportId = (histInsert as { Export_ID: string }).Export_ID;

    const storagePrefix = `${p.userId}/${jobId}`;

    await supabase.from('TBL_Background_Jobs').update({
      Job_Payload: {
        userId:           p.userId,
        exportId,
        filters:          fullFilters,
        format:           p.format,
        selectedColumns:  p.selectedColumns,
        sheetPerTemplate: p.sheetPerTemplate,
        storagePrefix,
        chunksTotal,
        candidateIds,
      },
    }).eq('Job_ID', jobId);

    const [teamsRes, columnsRes, templatesRes] = await Promise.all([
      supabase.from('TBL_Board_Teams')
        .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Sort_Order')
        .order('Board_Team_Sort_Order', { ascending: true }),
      supabase.from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color')
        .eq('Board_Column_Board_ID', p.boardId)
        .order('Board_Column_Position', { ascending: true }),
      supabase.from('TBL_Requests_Templates')
        .select('Request_Template_ID, Request_Template_Name, Request_Template_Icon, Request_Template_Color, Request_Template_Form_Schema')
        .eq('Request_Template_Board_ID', p.boardId)
        .order('Request_Template_ID', { ascending: true }),
    ]);

    const meta = {
      templates:    templatesRes.data ?? [],
      boardTeams:   teamsRes.data    ?? [],
      boardColumns: columnsRes.data  ?? [],
      meta: {
        totalMatched: total,
        returned:     total,
        truncated:    false,
        maxLimit:     MAX_EXPORT_SIZE,
        generatedAt:  new Date().toISOString(),
        chunksTotal,
      },
    };
    await _uploadExportArtifact(supabase, storagePrefix, 'metadata.json', meta);

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(_kickoffExportChunk(jobId));
    } else {
      _kickoffExportChunk(jobId).catch(() => {});
    }

    return { jobId, exportId, total, chunksTotal };
  },

  getExportArtifactUrls: async (payload, { supabase }) => {
    const { jobId, userId } = payload as { jobId: string; userId: number };

    const { data: jobRow, error: jobErr } = await supabase
      .from('TBL_Background_Jobs')
      .select('Job_Status, Job_Payload, Job_Result, Job_Created_By')
      .eq('Job_ID', jobId)
      .single();
    if (jobErr || !jobRow) throw new Error('Export no encontrado.');

    const job = jobRow as {
      Job_Status:    string;
      Job_Payload:   { userId: number; storagePrefix: string; chunksTotal: number; format: string };
      Job_Result:    { fileName?: string } | null;
      Job_Created_By: number;
    };

    if (job.Job_Created_By !== userId && job.Job_Payload.userId !== userId) {
      throw new Error('No autorizado para acceder a este export.');
    }
    if (job.Job_Status !== 'done') {
      throw new Error(`El export aún no está listo (estado: ${job.Job_Status}).`);
    }

    const { storagePrefix, chunksTotal, format } = job.Job_Payload;
    const fileName = job.Job_Result?.fileName ?? 'export';

    const filesToSign: string[] = [`${storagePrefix}/metadata.json`];
    for (let i = 1; i <= chunksTotal; i++) {
      filesToSign.push(`${storagePrefix}/chunk_${String(i).padStart(4, '0')}.json`);
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(EXPORT_BUCKET)
      .createSignedUrls(filesToSign, 600);
    if (signErr) throw new Error(signErr.message);

    return {
      fileName,
      format,
      metadataUrl: (signed?.[0] as { signedUrl: string } | undefined)?.signedUrl ?? null,
      chunkUrls:   (signed ?? []).slice(1).map((s: { signedUrl: string }) => s.signedUrl),
      chunksTotal,
    };
  },

  confirmExportDownloaded: async (payload, { supabase }) => {
    const { exportId, userId } = payload as { jobId: string; exportId: string; userId: number };

    const { data: histRow } = await supabase
      .from('TBL_Export_History')
      .select('Export_User_ID, Export_Download_Count')
      .eq('Export_ID', exportId)
      .single();
    if (!histRow) throw new Error('Entrada de historial no encontrada.');
    const hist = histRow as { Export_User_ID: number; Export_Download_Count: number };
    if (hist.Export_User_ID !== userId) throw new Error('No autorizado.');

    await supabase.from('TBL_Export_History').update({
      Export_Downloaded_At:  new Date().toISOString(),
      Export_Download_Count: hist.Export_Download_Count + 1,
    }).eq('Export_ID', exportId);

    return { ok: true };
  },

  fetchExportHistory: async (payload, { supabase }) => {
    const { userId, limit = 20 } = payload as { userId: number; limit?: number };
    const { data, error } = await supabase
      .from('TBL_Export_History')
      .select(`
        Export_ID, Export_Job_ID, Export_Format, Export_Filters, Export_Columns,
        Export_Sheet_Per_Tpl, Export_Total, Export_File_Name, Export_Storage_Prefix,
        Export_Status, Export_Error,
        Export_Created_At, Export_Completed_At, Export_Downloaded_At,
        Export_Download_Count, Export_Auto_Delete_At
      `)
      .eq('Export_User_ID', userId)
      .order('Export_Created_At', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  deleteExportHistoryEntry: async (payload, { supabase }) => {
    const { exportId, userId } = payload as { exportId: string; userId: number };
    const { data: hist } = await supabase
      .from('TBL_Export_History')
      .select('Export_User_ID, Export_Storage_Prefix, Export_Job_ID')
      .eq('Export_ID', exportId)
      .single();
    if (!hist) throw new Error('No encontrado.');
    const h = hist as { Export_User_ID: number; Export_Storage_Prefix: string | null; Export_Job_ID: string };
    if (h.Export_User_ID !== userId) throw new Error('No autorizado.');

    if (h.Export_Storage_Prefix) {
      await _cleanupExportArtifacts(supabase, h.Export_Storage_Prefix);
    }
    await supabase.from('TBL_Export_History').delete().eq('Export_ID', exportId);
    await supabase.from('TBL_Background_Jobs').delete().eq('Job_ID', h.Export_Job_ID);
    return { ok: true };
  },

  repeatExport: async (payload, { supabase, dispatch }) => {
    const { exportId, userId } = payload as { exportId: string; userId: number };
    const { data: hist, error: histErr } = await supabase
      .from('TBL_Export_History')
      .select('Export_User_ID, Export_Filters, Export_Format, Export_Columns, Export_Sheet_Per_Tpl')
      .eq('Export_ID', exportId)
      .single();
    if (histErr || !hist) throw new Error('Export original no encontrado.');
    const h = hist as {
      Export_User_ID:        number;
      Export_Filters:        ExportFilters;
      Export_Format:         'xlsx' | 'csv';
      Export_Columns:        string[];
      Export_Sheet_Per_Tpl:  boolean;
    };
    if (h.Export_User_ID !== userId) throw new Error('No autorizado.');

    const { boardId, ...filtersWithoutBoard } = h.Export_Filters;
    return dispatch('createExportJob', {
      userId,
      boardId,
      filters:          filtersWithoutBoard,
      format:           h.Export_Format,
      selectedColumns:  h.Export_Columns,
      sheetPerTemplate: h.Export_Sheet_Per_Tpl,
    });
  },

  exportRequests: async (payload, { supabase }) => {
    const p = payload as {
      boardId:         number;
      teamIds?:        number[] | null;
      sprintIds?:      number[] | null;
      columnIds?:      number[] | null;
      requestedByIds?: number[] | null;
      assignedToIds?:  number[] | null;
      priorityScores?: number[] | null;
      templateIds?:    number[] | null;
      labelIds?:       number[] | null;
      isConfidential?: boolean | null;
      dateFrom?:       string | null;
      dateTo?:         string | null;
      limit?:          number;
    };

    const MAX_LIMIT = 500;
    const limit     = Math.min(p.limit ?? MAX_LIMIT, MAX_LIMIT);

    const emptyResponse = async () => {
      const [teamsRes, columnsRes, templatesRes] = await Promise.all([
        supabase.from('TBL_Board_Teams')
          .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Sort_Order')
          .order('Board_Team_Sort_Order', { ascending: true }),
        supabase.from('TBL_Board_Columns')
          .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color')
          .eq('Board_Column_Board_ID', p.boardId)
          .order('Board_Column_Position', { ascending: true }),
        supabase.from('TBL_Requests_Templates')
          .select('Request_Template_ID, Request_Template_Name, Request_Template_Icon, Request_Template_Color, Request_Template_Form_Schema')
          .eq('Request_Template_Board_ID', p.boardId)
          .order('Request_Template_ID', { ascending: true }),
      ]);
      return {
        tickets:      [],
        templates:    templatesRes.data ?? [],
        boardTeams:   teamsRes.data    ?? [],
        boardColumns: columnsRes.data  ?? [],
        meta: {
          totalMatched: 0,
          returned:     0,
          truncated:    false,
          maxLimit:     MAX_LIMIT,
          generatedAt:  new Date().toISOString(),
        },
      };
    };

    let candidateIds: string[] | null = null;
    const intersect = (a: string[] | null, b: string[]): string[] => {
      if (a === null) return b;
      const setB = new Set(b);
      return a.filter((id) => setB.has(id));
    };

    if (p.teamIds && p.teamIds.length > 0) {
      const { data, error } = await supabase
        .from('TBL_Request_Team')
        .select('Request_Team_Request_ID')
        .in('Request_Team_ID', p.teamIds);
      if (error) throw new Error(error.message);
      const ids = [...new Set(((data ?? []) as { Request_Team_Request_ID: string }[]).map((r) => r.Request_Team_Request_ID))];
      candidateIds = intersect(candidateIds, ids);
      if (candidateIds.length === 0) return emptyResponse();
    }

    if (p.sprintIds && p.sprintIds.length > 0) {
      const { data, error } = await supabase
        .from('TBL_Request_Sprint')
        .select('Request_Sprint_Request_ID')
        .in('Request_Sprint_ID', p.sprintIds);
      if (error) throw new Error(error.message);
      const ids = [...new Set(((data ?? []) as { Request_Sprint_Request_ID: string }[]).map((r) => r.Request_Sprint_Request_ID))];
      candidateIds = intersect(candidateIds, ids);
      if (candidateIds.length === 0) return emptyResponse();
    }

    if (p.assignedToIds && p.assignedToIds.length > 0) {
      const { data, error } = await supabase
        .from('TBL_Requests_Assignments')
        .select('Request_Assignment_ID')
        .in('Request_Assignment_User_ID', p.assignedToIds);
      if (error) throw new Error(error.message);
      const ids = [...new Set(((data ?? []) as { Request_Assignment_ID: string }[]).map((r) => r.Request_Assignment_ID))];
      candidateIds = intersect(candidateIds, ids);
      if (candidateIds.length === 0) return emptyResponse();
    }

    if (p.labelIds && p.labelIds.length > 0) {
      const { data, error } = await supabase
        .from('TBL_Request_Labels')
        .select('Request_Labels_Request_ID')
        .in('Request_Labels_Label_ID', p.labelIds);
      if (error) throw new Error(error.message);
      const ids = [...new Set(((data ?? []) as { Request_Labels_Request_ID: string }[]).map((r) => r.Request_Labels_Request_ID))];
      candidateIds = intersect(candidateIds, ids);
      if (candidateIds.length === 0) return emptyResponse();
    }

    let countQuery = supabase
      .from('TBL_Requests')
      .select('Request_ID', { count: 'exact', head: true })
      .eq('Request_Board_ID', p.boardId);

    let dataQuery = supabase
      .from('TBL_Requests')
      .select(BASE_SELECT)
      .eq('Request_Board_ID', p.boardId);

    if (candidateIds !== null) {
      countQuery = countQuery.in('Request_ID', candidateIds);
      dataQuery  = dataQuery.in('Request_ID',  candidateIds);
    }
    if (p.columnIds && p.columnIds.length > 0) {
      countQuery = countQuery.in('Request_Board_Column_ID', p.columnIds);
      dataQuery  = dataQuery.in('Request_Board_Column_ID',  p.columnIds);
    }
    if (p.requestedByIds && p.requestedByIds.length > 0) {
      countQuery = countQuery.in('Request_Requested_By', p.requestedByIds);
      dataQuery  = dataQuery.in('Request_Requested_By',  p.requestedByIds);
    }
    if (p.priorityScores && p.priorityScores.length > 0) {
      countQuery = countQuery.in('Request_Score', p.priorityScores);
      dataQuery  = dataQuery.in('Request_Score',  p.priorityScores);
    }
    if (p.templateIds && p.templateIds.length > 0) {
      countQuery = countQuery.in('Request_Template_ID', p.templateIds);
      dataQuery  = dataQuery.in('Request_Template_ID',  p.templateIds);
    }
    if (p.isConfidential !== null && p.isConfidential !== undefined) {
      countQuery = countQuery.eq('Request_Is_Confidential', p.isConfidential);
      dataQuery  = dataQuery.eq('Request_Is_Confidential',  p.isConfidential);
    }
    if (p.dateFrom) {
      countQuery = countQuery.gte('Request_Created_At', p.dateFrom);
      dataQuery  = dataQuery.gte('Request_Created_At',  p.dateFrom);
    }
    if (p.dateTo) {
      countQuery = countQuery.lte('Request_Created_At', p.dateTo);
      dataQuery  = dataQuery.lte('Request_Created_At',  p.dateTo);
    }

    dataQuery = dataQuery
      .order('Request_Created_At', { ascending: false })
      .limit(limit);

    const [countRes, dataRes] = await Promise.all([countQuery, dataQuery]);
    if (countRes.error) throw new Error(countRes.error.message);
    if (dataRes.error)  throw new Error(dataRes.error.message);

    const tickets      = (dataRes.data ?? []) as Record<string, unknown>[];
    const totalMatched = countRes.count ?? tickets.length;
    const truncated    = totalMatched > tickets.length;

    const [teamsRes, columnsRes, templatesRes] = await Promise.all([
      supabase.from('TBL_Board_Teams')
        .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Sort_Order')
        .order('Board_Team_Sort_Order', { ascending: true }),
      supabase.from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color')
        .eq('Board_Column_Board_ID', p.boardId)
        .order('Board_Column_Position', { ascending: true }),
      supabase.from('TBL_Requests_Templates')
        .select('Request_Template_ID, Request_Template_Name, Request_Template_Icon, Request_Template_Color, Request_Template_Form_Schema')
        .eq('Request_Template_Board_ID', p.boardId)
        .order('Request_Template_ID', { ascending: true }),
    ]);

    return {
      tickets,
      templates:    templatesRes.data ?? [],
      boardTeams:   teamsRes.data    ?? [],
      boardColumns: columnsRes.data  ?? [],
      meta: {
        totalMatched,
        returned:     tickets.length,
        truncated,
        maxLimit:     MAX_LIMIT,
        generatedAt:  new Date().toISOString(),
      },
    };
  },
};
