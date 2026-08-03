// supabase/functions/api/handlers/solvi.ts
// Handlers de la integración SOLVI.
// Lectura de TBL_Ticket_Solvi / TBL_Seguimientos_Solvi / TBL_Ticket_Attachments_Solvi.

import type { ActionHandler } from '../shared/types.ts';

// Campos del listado (subconjunto liviano para la tabla).
const SOLVI_LIST_SELECT =
  'ticket_solvi_id, ticket_solvi_titulo, ticket_solvi_estado, ticket_solvi_fuente, ' +
  'ticket_solvi_solicitante, ticket_solvi_correo_solicitante, ticket_solvi_resolutor, ' +
  'ticket_solvi_categoria, ticket_solvi_subcategoria, ticket_solvi_ans, ' +
  'ticket_solvi_fechaapertura, ticket_solvi_fechamaxima, "FechaCierreReal"';

// Todos los campos del ticket (para el modal de detalle).
const SOLVI_FULL_SELECT = '*';

const SEGUIMIENTO_SELECT =
  'seguimientos_solvi_id, seguimientos_solvi_id_ticket, seguimientos_solvi_tipo_de_accion, ' +
  'seguimientos_solvi_action_date, seguimientos_solvi_descripcion, ' +
  'seguimientos_solvi_correo_actor, seguimientos_solvi_actor';

const ATTACHMENT_SELECT =
  'id, created_at, attachment_path, attachment_type, id_ticket, seguimiento_id, storage_bucket, file_name';

const PAGE_SIZE = 300;
const SIGNED_URL_TTL = 60 * 30; // 30 min

type SolviCursor = { fecha: string | null; id: number };

export const solviHandlers: Record<string, ActionHandler> = {
  // ── Listado paginado (keyset) + búsqueda global ──
  fetchSolviTickets: async (payload, { supabase }) => {
    const { cursor, limit, search } = (payload ?? {}) as {
      cursor?: SolviCursor | null; limit?: number; search?: string;
    };
    const pageSize = Math.min(limit ?? PAGE_SIZE, 500);
    const term = (search ?? '').trim();

    let query = supabase
      .from('TBL_Ticket_Solvi')
      .select(SOLVI_LIST_SELECT)
      .order('ticket_solvi_fechaapertura', { ascending: false, nullsFirst: false })
      .order('ticket_solvi_id', { ascending: false })
      .limit(pageSize + 1);

    if (term) {
      const like = `%${term.replace(/[%_]/g, '\\$&')}%`;
      const ors = [
        `ticket_solvi_titulo.ilike.${like}`,
        `ticket_solvi_solicitante.ilike.${like}`,
        `ticket_solvi_resolutor.ilike.${like}`,
        `ticket_solvi_categoria.ilike.${like}`,
      ];
      if (/^\d+$/.test(term)) ors.push(`ticket_solvi_id.eq.${term}`);
      query = query.or(ors.join(','));
    }

    if (cursor) {
      if (cursor.fecha === null) {
        query = query.is('ticket_solvi_fechaapertura', null).lt('ticket_solvi_id', cursor.id);
      } else {
        query = query.or(
          `ticket_solvi_fechaapertura.lt.${cursor.fecha},` +
          `and(ticket_solvi_fechaapertura.eq.${cursor.fecha},ticket_solvi_id.lt.${cursor.id})`,
        );
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const last = items[items.length - 1] as
      | { ticket_solvi_fechaapertura: string | null; ticket_solvi_id: number } | undefined;
    const nextCursor: SolviCursor | null =
      hasMore && last ? { fecha: last.ticket_solvi_fechaapertura, id: last.ticket_solvi_id } : null;

    return { items, nextCursor };
  },

  // ── Detalle completo: ticket + seguimientos + adjuntos (con signed URLs) ──
  fetchSolviTicketDetail: async (payload, { supabase }) => {
    const { id } = (payload ?? {}) as { id?: number };
    if (id == null) throw new Error('Falta el id del ticket.');

    // Ticket completo
    const { data: ticket, error: tErr } = await supabase
      .from('TBL_Ticket_Solvi')
      .select(SOLVI_FULL_SELECT)
      .eq('ticket_solvi_id', id)
      .single();
    if (tErr) throw new Error(tErr.message);

    // Seguimientos (orden cronológico)
    const { data: seguimientos, error: sErr } = await supabase
      .from('TBL_Seguimientos_Solvi')
      .select(SEGUIMIENTO_SELECT)
      .eq('seguimientos_solvi_id_ticket', id)
      .order('seguimientos_solvi_action_date', { ascending: true, nullsFirst: true })
      .order('seguimientos_solvi_id', { ascending: true });
    if (sErr) throw new Error(sErr.message);

    // Adjuntos (del ticket y de sus seguimientos)
    const { data: attachments, error: aErr } = await supabase
      .from('TBL_Ticket_Attachments_Solvi')
      .select(ATTACHMENT_SELECT)
      .eq('id_ticket', id)
      .order('created_at', { ascending: true });
    if (aErr) throw new Error(aErr.message);

    // Signed URLs — best-effort: si el bucket/path no resuelve, se deja null
    // y el front muestra solo el nombre (degradación elegante).
    const withUrls = await Promise.all((attachments ?? []).map(async (a: {
      id: number; created_at: string; attachment_path: string | null;
      attachment_type: string | null; id_ticket: number | null;
      seguimiento_id: number | null; storage_bucket: string | null; file_name: string | null;
    }) => {
      let url: string | null = null;
      if (a.storage_bucket && a.attachment_path) {
        try {
          const { data: signed } = await supabase.storage
            .from(a.storage_bucket)
            .createSignedUrl(a.attachment_path, SIGNED_URL_TTL);
          url = signed?.signedUrl ?? null;
        } catch {
          url = null;
        }
      }
      return { ...a, signedUrl: url };
    }));

    return {
      ticket,
      seguimientos: seguimientos ?? [],
      attachments: withUrls,
    };
  },

  fetchSolviComments: async (payload, { supabase }) => {
    const { ticketId } = payload as { ticketId: number };
    const { data, error } = await supabase
      .from('TBL_Solvi_Comments')
      .select(`Comment_ID, Comment_Text, Comment_Created_At,
               author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
      .eq('Comment_Ticket_ID', ticketId)
      .order('Comment_Created_At', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  createSolviComment: async (payload, { supabase }) => {
    const { ticketId, userId, text, mentionedUserIds = [] } =
      payload as { ticketId: number; userId: number; text: string; mentionedUserIds?: number[] };

    const trimmed = text.trim();

    // 0. Enforcement del gate: solicitante/resolutor (por correo) ∪ mencionado ∪ admin.
    {
      const [{ data: user }, { data: ticket }, { data: part }] = await Promise.all([
        supabase.from('TBL_Users').select('User_Email, User_Role').eq('User_ID', userId).single(),
        supabase.from('TBL_Ticket_Solvi')
          .select('ticket_solvi_correo_solicitante, ticket_solvi_correo_resolutor')
          .eq('ticket_solvi_id', ticketId).single(),
        supabase.from('TBL_Solvi_Participants')
          .select('User_ID').eq('Ticket_ID', ticketId).eq('User_ID', userId).maybeSingle(),
      ]);
      const myEmail  = (user?.User_Email ?? '').toLowerCase().trim();
      const reqEmail = String(ticket?.ticket_solvi_correo_solicitante ?? '').toLowerCase().trim();
      const resEmail = String(ticket?.ticket_solvi_correo_resolutor ?? '').toLowerCase().trim();
      const isAdmin  = user?.User_Role === 'admin';
      const allowed  = isAdmin
        || (myEmail !== '' && (myEmail === reqEmail || myEmail === resEmail))
        || !!part;
      if (!allowed) throw new Error('No autorizado para comentar en este ticket');
    }

    // 1. Insertar comentario
    const { data, error } = await supabase
      .from('TBL_Solvi_Comments')
      .insert({
        Comment_Ticket_ID: ticketId,
        Comment_User_ID:   userId,
        Comment_Text:      trimmed,
        Comment_Created_At: new Date().toISOString(),
      })
      .select(`Comment_ID, Comment_Text, Comment_Created_At,
               author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
      .single();
    if (error) throw new Error(error.message);

    // 2. Validar menciones server-side. SOLVI NO tiene confidencialidad → solo regla de depto.
    let allowedMentionIds: number[] = [];
    if (mentionedUserIds.length > 0) {
      const { data: mentioner } = await supabase
        .from('TBL_Users').select('User_Role, Department_ID').eq('User_ID', userId).single();
      const isAdmin = mentioner?.User_Role === 'admin';

      if (isAdmin) {
        allowedMentionIds = [...new Set(mentionedUserIds)];
      } else {
        const { data: targets } = await supabase
          .from('TBL_Users').select('User_ID, Department_ID')
          .in('User_ID', [...new Set(mentionedUserIds)]);
        allowedMentionIds = (targets ?? [])
          .filter((t: { User_ID: number; Department_ID: number | null }) =>
            t.Department_ID === 7 || t.Department_ID === mentioner?.Department_ID)
          .map((t: { User_ID: number; Department_ID: number | null }) => t.User_ID);
      }
      allowedMentionIds = allowedMentionIds.filter((id) => id !== userId);
    }

    // 3. Persistir menciones + participantes (participantes ya, para Entrega 2)
    if (allowedMentionIds.length > 0) {
      const commentId = (data as { Comment_ID: number }).Comment_ID;
      await supabase.from('TBL_Solvi_Comment_Mentions').insert(
        allowedMentionIds.map((mid) => ({ Comment_ID: commentId, Mentioned_User_ID: mid })),
      );
      await supabase.from('TBL_Solvi_Participants').upsert(
        allowedMentionIds.map((mid) => ({
          Ticket_ID: ticketId, User_ID: mid, Added_Via: 'mention', Added_By: userId,
        })),
        { onConflict: 'Ticket_ID,User_ID', ignoreDuplicates: true },
      );
      // Notificaciones → Entrega 2 (requiere ver cómo referenciás tickets SOLVI en notifs)
    }

    return data;
  },

  deleteSolviComment: async (payload, { supabase }) => {
    const { commentId } = payload as { commentId: number };
    const { error } = await supabase.from('TBL_Solvi_Comments').delete().eq('Comment_ID', commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  fetchSolviParticipants: async (payload, { supabase }) => {
    const { ticketId } = payload as { ticketId: number };
    const { data, error } = await supabase
      .from('TBL_Solvi_Participants')
      .select('User_ID, Added_Via, Added_By, Created_At')
      .eq('Ticket_ID', ticketId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { User_ID: number; Added_Via: string; Added_By: number | null }) => ({
      User_ID:         r.User_ID,
      User_Name:       '',
      User_Avatar_url: '',
      Added_Via:       r.Added_Via,
      Added_By:        r.Added_By,
    }));
  },

  removeSolviParticipant: async (payload, { supabase }) => {
    const { ticketId, userId, actorId } =
      payload as { ticketId: number; userId: number; actorId: number };

    // Autoridad: admin o resolutor. Ojo — en SOLVI el "resolutor" es texto,
    // no un User_ID, así que NO podemos validar resolutor por assignment.
    // Criterio SOLVI: solo admin revoca. (Ver nota abajo.)
    const { data: actor } = await supabase
      .from('TBL_Users').select('User_Role').eq('User_ID', actorId).single();
    if (actor?.User_Role !== 'admin') throw new Error('No autorizado para revocar participantes');

    const { error } = await supabase
      .from('TBL_Solvi_Participants')
      .delete().eq('Ticket_ID', ticketId).eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};