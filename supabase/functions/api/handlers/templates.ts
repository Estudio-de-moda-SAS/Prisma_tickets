import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { _collectSchemaKeys, _renameKeysInFormData, _renameKeysInSchema } from '../shared/templateKeys.ts';
// @ts-ignore
import { _kickoffJobChunk, _finalizeRenameJob } from '../jobs/renameJob.ts';

export const templateHandlers: Record<string, ActionHandler> = {
  fetchTemplatesByBoardId: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Requests_Templates')
      .select(`
        Request_Template_ID, Request_Template_Name, Request_Template_Description,
        Request_Template_Icon, Request_Template_Color, Request_Template_Badge,
        Request_Template_Form_Schema, Request_Template_Teams, Request_Template_Is_Active
      `)
      .eq('Request_Template_Board_ID', boardId)
      .order('Request_Template_ID', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  createTemplate: async (payload, { supabase }) => {
    const p = payload as {
      boardId: number; name: string; description: string; icon: string; color: string;
      badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
    };
    const { data, error } = await supabase
      .from('TBL_Requests_Templates')
      .insert({
        Request_Template_Board_ID:    p.boardId,
        Request_Template_Name:        p.name,
        Request_Template_Description: p.description,
        Request_Template_Icon:        p.icon,
        Request_Template_Color:       p.color,
        Request_Template_Badge:       p.badge,
        Request_Template_Form_Schema: p.formSchema,
        Request_Template_Teams:       p.teamIds,
        Request_Template_Is_Active:   p.isActive,
        Request_Template_Created_At:  new Date().toISOString(),
      })
      .select(`
        Request_Template_ID, Request_Template_Name, Request_Template_Description,
        Request_Template_Icon, Request_Template_Color, Request_Template_Badge,
        Request_Template_Form_Schema, Request_Template_Teams, Request_Template_Is_Active
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateTemplate: async (payload, { supabase }) => {
    const { id, ...p } = payload as {
      id: number; name: string; description: string; icon: string; color: string;
      badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
    };
    const { error } = await supabase.from('TBL_Requests_Templates').update({
      Request_Template_Name:        p.name,
      Request_Template_Description: p.description,
      Request_Template_Icon:        p.icon,
      Request_Template_Color:       p.color,
      Request_Template_Badge:       p.badge,
      Request_Template_Form_Schema: p.formSchema,
      Request_Template_Teams:       p.teamIds,
      Request_Template_Is_Active:   p.isActive,
    }).eq('Request_Template_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  deleteTemplate: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    const { error } = await supabase.from('TBL_Requests_Templates').delete().eq('Request_Template_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  getTemplateRenameImpact: async (payload, { supabase }) => {
    const { templateId } = payload as { templateId: number };
    const { count, error } = await supabase
      .from('TBL_Requests')
      .select('Request_ID', { count: 'exact', head: true })
      .eq('Request_Template_ID', templateId);
    if (error) throw new Error(error.message);
    return { requestsCount: count ?? 0 };
  },

  updateTemplateWithRenames: async (payload, { supabase }) => {
    const p = payload as {
      id: number; name: string; description: string; icon: string; color: string;
      badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
      renames: { oldKey: string; newKey: string }[];
      renamedBy: number | null;
    };

    const renameMap: Record<string, string> = {};
    for (const r of p.renames ?? []) {
      if (!r.oldKey || !r.newKey) {
        throw new Error('Rename inválido: oldKey y newKey son requeridos.');
      }
      if (!/^[a-z0-9_]+$/.test(r.newKey)) {
        throw new Error(`Key inválido: "${r.newKey}". Solo se permiten minúsculas, dígitos y guión bajo.`);
      }
      if (renameMap[r.oldKey]) {
        throw new Error(`Rename duplicado para la key origen "${r.oldKey}".`);
      }
      renameMap[r.oldKey] = r.newKey;
    }

    const allKeys = _collectSchemaKeys(p.formSchema);
    const seen = new Set<string>();
    for (const k of allKeys) {
      if (seen.has(k)) throw new Error(`Key duplicada en el template: "${k}". Cada campo debe tener una key única.`);
      seen.add(k);
    }

    const { error: tplErr } = await supabase.from('TBL_Requests_Templates').update({
      Request_Template_Name:        p.name,
      Request_Template_Description: p.description,
      Request_Template_Icon:        p.icon,
      Request_Template_Color:       p.color,
      Request_Template_Badge:       p.badge,
      Request_Template_Form_Schema: p.formSchema,
      Request_Template_Teams:       p.teamIds,
      Request_Template_Is_Active:   p.isActive,
    }).eq('Request_Template_ID', p.id);
    if (tplErr) throw new Error(tplErr.message);

    if (Object.keys(renameMap).length === 0) {
      return { ok: true, requestsUpdated: 0, renames: [] };
    }

    const BATCH_SIZE = 100;
    let updated = 0;
    let from    = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: batch, error: fetchErr } = await supabase
        .from('TBL_Requests')
        .select('Request_ID, Request_Form_Data, Request_Template_Schema_Snapshot')
        .eq('Request_Template_ID', p.id)
        .order('Request_Created_At', { ascending: true })
        .range(from, from + BATCH_SIZE - 1);
      if (fetchErr) throw new Error(fetchErr.message);
      if (!batch || batch.length === 0) break;

      for (const row of batch as Array<{
        Request_ID: string;
        Request_Form_Data: unknown;
        Request_Template_Schema_Snapshot: unknown[] | null;
      }>) {
        const newFormData = _renameKeysInFormData(row.Request_Form_Data, renameMap);
        const newSnapshot = _renameKeysInSchema(row.Request_Template_Schema_Snapshot ?? [], renameMap);

        const { error: updErr } = await supabase
          .from('TBL_Requests')
          .update({
            Request_Form_Data:                newFormData,
            Request_Template_Schema_Snapshot: newSnapshot,
          })
          .eq('Request_ID', row.Request_ID);
        if (updErr) throw new Error(updErr.message);
        updated++;
      }

      if (batch.length < BATCH_SIZE) break;
      from += BATCH_SIZE;
    }

    const auditRows = p.renames.map((r) => ({
      Template_ID:       p.id,
      Old_Key:           r.oldKey,
      New_Key:           r.newKey,
      Renamed_By:        p.renamedBy ?? null,
      Renamed_At:        new Date().toISOString(),
      Requests_Affected: updated,
    }));
    await supabase.from('TBL_Template_Field_Renames').insert(auditRows);

    return { ok: true, requestsUpdated: updated, renames: p.renames };
  },

  createTemplateRenameJob: async (payload, { supabase }) => {
    const p = payload as {
      id: number; name: string; description: string; icon: string; color: string;
      badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
      renames: { oldKey: string; newKey: string }[];
      renamedBy: number | null;
    };

    const renameMap: Record<string, string> = {};
    for (const r of p.renames ?? []) {
      if (!r.oldKey || !r.newKey) throw new Error('Rename inválido: oldKey y newKey son requeridos.');
      if (!/^[a-z0-9_]+$/.test(r.newKey)) throw new Error(`Key inválido: "${r.newKey}". Solo se permiten minúsculas, dígitos y guión bajo.`);
      if (renameMap[r.oldKey]) throw new Error(`Rename duplicado para "${r.oldKey}".`);
      renameMap[r.oldKey] = r.newKey;
    }
    const allKeys = _collectSchemaKeys(p.formSchema);
    const seen = new Set<string>();
    for (const k of allKeys) {
      if (seen.has(k)) throw new Error(`Key duplicada en el template: "${k}".`);
      seen.add(k);
    }

    const { error: tplErr } = await supabase.from('TBL_Requests_Templates').update({
      Request_Template_Name:        p.name,
      Request_Template_Description: p.description,
      Request_Template_Icon:        p.icon,
      Request_Template_Color:       p.color,
      Request_Template_Badge:       p.badge,
      Request_Template_Form_Schema: p.formSchema,
      Request_Template_Teams:       p.teamIds,
      Request_Template_Is_Active:   p.isActive,
    }).eq('Request_Template_ID', p.id);
    if (tplErr) throw new Error(tplErr.message);

    if (Object.keys(renameMap).length === 0) {
      return { jobId: null, requestsTotal: 0, ok: true };
    }

    const { count } = await supabase
      .from('TBL_Requests')
      .select('Request_ID', { count: 'exact', head: true })
      .eq('Request_Template_ID', p.id);
    const total = count ?? 0;

    const { data: jobData, error: jobInsErr } = await supabase
      .from('TBL_Background_Jobs')
      .insert({
        Job_Type:    'template_field_rename',
        Job_Status:  'pending',
        Job_Payload: {
          templateId: p.id,
          renames:    p.renames,
          renamedBy:  p.renamedBy,
        },
        Job_Progress_Total: total,
        Job_Created_By:     p.renamedBy,
      })
      .select('Job_ID')
      .single();
    if (jobInsErr) throw new Error(jobInsErr.message);
    const jobId = (jobData as { Job_ID: string }).Job_ID;

    if (total > 0) {
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(_kickoffJobChunk(jobId));
      } else {
        _kickoffJobChunk(jobId).catch(() => {});
      }
    } else {
      await _finalizeRenameJob(supabase, jobId, 0, {
        templateId: p.id,
        renames:    p.renames,
        renamedBy:  p.renamedBy,
      });
    }

    return { jobId, requestsTotal: total, ok: true };
  },
};
