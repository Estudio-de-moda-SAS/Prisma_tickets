import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { SIGNED_URL_EXPIRES_IN } from '../lib/storage.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants, isCloseColumn } from '../shared/requests.ts';
// @ts-ignore
import { sendEventEmail } from '../email/send.ts';

export const closureHandlers: Record<string, ActionHandler> = {
  closeRequest: async (payload, { supabase }) => {
    const p = payload as {
      requestId: string; closedBy: number; closureNote: string;
      targetColumnId: number;
      evidenceMode?:       'new' | 'reuse' | 'skip';
      reuseFromClosureId?: number | null;
      attachmentUrl?: string | null;
      attachmentName?: string | null;
      attachmentMime?: string | null;
    };

    const mode = p.evidenceMode ?? 'new';

    const { data: closure, error: closureErr } = await supabase
      .from('TBL_Request_Closure')
      .insert({
        Request_ID:       p.requestId,
        Closed_By:        p.closedBy,
        Closure_Note:     p.closureNote,
        Target_Column_ID: p.targetColumnId,
        Closure_Type:     mode,
        Attachment_URL:   p.attachmentUrl  ?? null,
        Attachment_Name:  p.attachmentName ?? null,
        Attachment_Mime:  p.attachmentMime ?? null,
        Closed_At:        new Date().toISOString(),
      })
      .select(`
        Closure_ID, Closure_Note, Closure_Type,
        Attachment_URL, Attachment_Name, Attachment_Mime, Closed_At,
        closer:TBL_Users!Closed_By ( User_ID, User_Name )
      `)
      .single();
    if (closureErr) throw new Error(closureErr.message);

    if (mode === 'reuse' && p.reuseFromClosureId) {
      const { data: srcAttachments, error: srcErr } = await supabase
        .from('TBL_Closure_Attachments')
        .select('Storage_Path, File_Name, Mime_Type, File_Size')
        .eq('Closure_ID', p.reuseFromClosureId);
      if (srcErr) throw new Error(srcErr.message);

      if (srcAttachments && srcAttachments.length > 0) {
        const rows = (srcAttachments as Array<{
          Storage_Path: string;
          File_Name:    string;
          Mime_Type:    string;
          File_Size:    number;
        }>).map((a) => ({
          Closure_ID:   (closure as any).Closure_ID,
          Storage_Path: a.Storage_Path,
          File_Name:    a.File_Name,
          Mime_Type:    a.Mime_Type,
          File_Size:    a.File_Size,
          Created_At:   new Date().toISOString(),
        }));
        const { error: cloneErr } = await supabase
          .from('TBL_Closure_Attachments')
          .insert(rows);
        if (cloneErr) throw new Error(cloneErr.message);
      }
    }

    const willClose = await isCloseColumn(supabase, p.targetColumnId, p.requestId);
    const updateData: Record<string, unknown> = {
      Request_Board_Column_ID: p.targetColumnId,
    };
    if (willClose) {
      updateData['Request_Finished_At'] = new Date().toISOString();
      updateData['Request_Progress']    = 100;
    }
    const { error: updateErr } = await supabase
      .from('TBL_Requests')
      .update(updateData)
      .eq('Request_ID', p.requestId);
    if (updateErr) throw new Error(updateErr.message);

    const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, p.requestId);
    const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
      .filter((uid) => uid !== p.closedBy);
    await insertNotifications(supabase, {
      userIds:   recipientIds,
      type:      'closure',
      title:     `Ticket ${p.requestId} enviado a revisión`,
      body:      `El ticket fue enviado a revisión con evidencia adjunta. Nota: ${p.closureNote.slice(0, 80)}${p.closureNote.length > 80 ? '…' : ''}`,
      requestId: p.requestId,
      actorId:   p.closedBy,
    });

    // ── Correo "listo para revisión del cliente" ──────────────────────────
    // SOLO al mover a Client Review (columna 10). Otras columnas con evidencia
    // pasan por acá también, por eso el guard === 10.
    // Solo al solicitante, solo si es externo y NO es también resolutor.
    // La notificación in-app de arriba queda intacta; esto es SOLO correo.
console.log(`[cr-debug] closeRequest targetColumnId=${p.targetColumnId} (${typeof p.targetColumnId}) requestedBy=${requestedBy}`);
    if (p.targetColumnId === 10 && requestedBy) {
      console.log('[cr-debug] entró al if de columna 10');
      try {
        const { data: reqUser } = await supabase
          .from('TBL_Users')
          .select('User_Name, User_Role')
          .eq('User_ID', requestedBy)
          .single();

        const role       = (reqUser as any)?.User_Role as string | undefined;
        const isExternal  = role !== 'admin' && role !== 'ti_member';
        const isAlsoResolver = assigneeIds.includes(requestedBy);
        console.log(`[cr-debug] role=${role} isExternal=${isExternal} isAlsoResolver=${isAlsoResolver}`);

        if (isExternal && !isAlsoResolver) {
          console.log('[cr-debug] pasó validaciones, va a mandar correo');
          const fullName = (reqUser as any)?.User_Name ?? '';
          const parts    = fullName.trim().split(/\s+/);
          const requesterName = parts.length >= 4 ? `${parts[0]} ${parts[2]}` : fullName.trim();

          const { data: reqRow } = await supabase
            .from('TBL_Requests')
            .select('Request_Title')
            .eq('Request_ID', p.requestId)
            .single();

          await sendEventEmail(supabase, {
            eventKey:  'moveToClientReview',
            requestId: p.requestId,
            userIds:   [requestedBy],
            vars: {
              requester_name: requesterName,
              ticket_id:      p.requestId,
              ticket_title:   (reqRow as any)?.Request_Title ?? '',
              ticket_url:     `${Deno.env.get('MAIL_APP_URL')}/ticket/${p.requestId}`,
            },
          });
          console.log('[cr-debug] sendEventEmail terminó');
        } else {
          console.log('[cr-debug] CORTÓ: interno o es también resolutor');
        }
      } catch (emailErr) {
        console.log('[cr-debug] ERROR:', emailErr);
      }
    } else {
      console.log('[cr-debug] CORTÓ: targetColumnId no es 10 o requestedBy vacío');
    }
    // ── /Correo ───────────────────────────────────────────────────────────

    return closure;
  },

  fetchClosureAttachments: async (payload, { supabase }) => {
    const { closureId } = payload as { closureId: number };
    const { data, error } = await supabase
      .from('TBL_Closure_Attachments')
      .select('Closure_Attachment_ID, Storage_Path, File_Name, Mime_Type, File_Size, Created_At')
      .eq('Closure_ID', closureId);
    if (error) throw new Error(error.message);
    const results = await Promise.all(
      (data as any[]).map(async (a) => {
        const { data: signed, error: signErr } = await supabase.storage
          .from('attachments')
          .createSignedUrl(a.Storage_Path, SIGNED_URL_EXPIRES_IN);
        return {
          Closure_Attachment_ID: a.Closure_Attachment_ID,
          Storage_Path:          a.Storage_Path,
          File_Name:             a.File_Name,
          Mime_Type:             a.Mime_Type,
          File_Size:             a.File_Size,
          Created_At:            a.Created_At,
          Signed_Url:            signErr ? null : signed?.signedUrl ?? null,
        };
      })
    );
    return results;
  },

  uploadClosureAttachment: async (payload, { supabase }) => {
    const p = payload as {
      closureId: number; requestId: string; userId: number;
      fileName: string; mimeType: string; sizeBytes: number; base64: string;
    };
    const bucket   = 'attachments';
    const filePath = `closures/${p.requestId}/${Date.now()}_${p.fileName}`;
    const bytes    = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, { contentType: p.mimeType, upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: inserted, error: insertErr } = await supabase
      .from('TBL_Closure_Attachments')
      .insert({
        Closure_ID:   p.closureId,
        Storage_Path: filePath,
        File_Name:    p.fileName,
        Mime_Type:    p.mimeType,
        File_Size:    p.sizeBytes,
        Created_At:   new Date().toISOString(),
      })
      .select('Closure_Attachment_ID, Storage_Path, File_Name, Mime_Type, File_Size, Created_At')
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const { data: signedData, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);

    return {
      Closure_Attachment_ID: (inserted as any).Closure_Attachment_ID,
      Storage_Path:          (inserted as any).Storage_Path,
      File_Name:             (inserted as any).File_Name,
      Mime_Type:             (inserted as any).Mime_Type,
      File_Size:             (inserted as any).File_Size,
      Created_At:            (inserted as any).Created_At,
      Signed_Url:            signErr ? null : signedData?.signedUrl ?? null,
    };
  },
};
