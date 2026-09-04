// supabase/functions/api/handlers/solvi.ts
// Handlers de la integración SOLVI.
// Lectura de TBL_Ticket_Solvi / TBL_Seguimientos_Solvi / TBL_Ticket_Attachments_Solvi.
/**
 * Handlers de la integración SOLVI (sistema de ticketing externo).
 *
 * Registrados en {@link solviHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. SOLVI comparte la infraestructura
 * de Supabase pero vive en sus propias tablas (`TBL_Ticket_Solvi`,
 * `TBL_Seguimientos_Solvi`, `TBL_Ticket_Attachments_Solvi`, y las de comentarios
 * y participantes propias). Diferencias clave respecto al núcleo de PRISMA: los
 * tickets SOLVI no tienen flag de confidencialidad, y el "resolutor"/
 * "solicitante" se identifican por correo (texto), no por `User_ID`.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Forma de un ticket SOLVI completo, tal como se lee de `TBL_Ticket_Solvi`.
 */
export type SolviTicket = {
  ticket_solvi_id?: number;
  ticket_solvi_titulo: string;
  ticket_solvi_estado: string | null;
  ticket_solvi_fuente: string | null;
  ticket_solvi_solicitante: string | null;
  ticket_solvi_correo_solicitante: string | null;
  ticket_solvi_resolutor: string | null;
  ticket_solvi_categoria: string | null;
  ticket_solvi_subcategoria: string | null;
  ticket_solvi_ans: string | null;
  ticket_solvi_fechaapertura: Date | null;
  ticket_solvi_fechamaxima: string | null;
  FechaCierreReal: string | null;
  ticket_solvi_correo_resolutor: string | null;
  ticket_solvi_descripcion: string;
  ticket_solvi_articulo: string | null;
};

/** Campos del listado (subconjunto liviano para la tabla). */
const SOLVI_LIST_SELECT =
  'ticket_solvi_id, ticket_solvi_titulo, ticket_solvi_estado, ticket_solvi_fuente, ' +
  'ticket_solvi_solicitante, ticket_solvi_correo_solicitante, ticket_solvi_resolutor, ' +
  'ticket_solvi_categoria, ticket_solvi_subcategoria, ticket_solvi_ans, ' +
  'ticket_solvi_fechaapertura, ticket_solvi_fechamaxima, "FechaCierreReal"';

/** Todos los campos del ticket (para el modal de detalle). */
const SOLVI_FULL_SELECT = '*';

/** Campos de un seguimiento SOLVI. */
const SEGUIMIENTO_SELECT =
  'seguimientos_solvi_id, seguimientos_solvi_id_ticket, seguimientos_solvi_tipo_de_accion, ' +
  'seguimientos_solvi_action_date, seguimientos_solvi_descripcion, ' +
  'seguimientos_solvi_correo_actor, seguimientos_solvi_actor';

/** Campos de un adjunto SOLVI. */
const ATTACHMENT_SELECT =
  'id, created_at, attachment_path, attachment_type, id_ticket, seguimiento_id, storage_bucket, file_name';

/** Tamaño de página por defecto del listado paginado (keyset). */
const PAGE_SIZE = 300;
/** Vigencia de las signed URLs de adjuntos (30 minutos). */
const SIGNED_URL_TTL = 60 * 30; // 30 min

/** Cursor keyset del listado: fecha de apertura + id como desempate. */
type SolviCursor = { fecha: string | null; id: number };

/**
 * Destinatario en el formato que espera la API de Microsoft Graph.
 */
export type GraphRecipient = {
  emailAddress: {
    address: string;
  };
};

/**
 * Mapa de handlers de SOLVI indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const solviHandlers: Record<string, ActionHandler> = {
  /**
   * Lista tickets SOLVI con paginación keyset y búsqueda global opcional.
   *
   * Pagina por cursor compuesto `(fechaapertura, id)` descendente (maneja el
   * caso de fecha nula por separado). Con `search`, filtra por título,
   * solicitante, resolutor o categoría (`ilike`), y además por ID exacto si el
   * término es numérico. Pide un elemento de más para saber si hay página
   * siguiente.
   *
   * @param payload - `{ cursor?, limit?, search? }` (limit tope 500).
   * @returns `{ items, nextCursor }` — `nextCursor` es `null` si no hay más.
   */
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

  /**
   * Trae el detalle completo de un ticket SOLVI: ticket + seguimientos + adjuntos.
   *
   * Trae el ticket completo, sus seguimientos en orden cronológico, y los
   * adjuntos tanto del ticket como de sus seguimientos (aunque `id_ticket` venga
   * null). Por cada adjunto genera una signed URL best-effort: si el bucket o el
   * path no resuelven, deja `signedUrl` en null y el front muestra solo el
   * nombre (degradación elegante). Si `storage_bucket` viene null, cae al bucket
   * fijo `ticket-attachments`.
   *
   * @param payload - `{ id }`.
   * @returns `{ ticket, seguimientos, attachments }` con `signedUrl` por adjunto.
   * @throws Si falta el `id` del ticket.
   */
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

    // Adjuntos (del ticket y de sus seguimientos, aunque id_ticket venga null)
    const segIds = (seguimientos ?? []).map((s: { seguimientos_solvi_id: number }) => s.seguimientos_solvi_id);
    const orFilter = segIds.length > 0
      ? `id_ticket.eq.${id},seguimiento_id.in.(${segIds.join(',')})`
      : `id_ticket.eq.${id}`;
    const { data: attachments, error: aErr } = await supabase
      .from('TBL_Ticket_Attachments_Solvi')
      .select(ATTACHMENT_SELECT)
      .or(orFilter)
      .order('created_at', { ascending: true });
    if (aErr) throw new Error(aErr.message);

    // Signed URLs — best-effort: si el bucket/path no resuelve, se deja null
    // y el front muestra solo el nombre (degradación elegante).
    // NOTA: storage_bucket puede venir null en las filas → fallback al bucket fijo.
    const DEFAULT_BUCKET = 'ticket-attachments';
    const withUrls = await Promise.all((attachments ?? []).map(async (a: {
      id: number; created_at: string; attachment_path: string | null;
      attachment_type: string | null; id_ticket: number | null;
      seguimiento_id: number | null; storage_bucket: string | null; file_name: string | null;
    }) => {
      let url: string | null = null;
      const bucket = a.storage_bucket ?? DEFAULT_BUCKET;
      if (bucket && a.attachment_path) {
        try {
          const { data: signed, error: uErr } = await supabase.storage
            .from(bucket)
            .createSignedUrl(a.attachment_path, SIGNED_URL_TTL);
          if (uErr) console.error(`[solvi] signedUrl id=${a.id} path=${a.attachment_path}: ${uErr.message}`);
          url = signed?.signedUrl ?? null;
        } catch (e) {
          console.error(`[solvi] signedUrl id=${a.id}:`, e);
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

  /**
   * Lista los comentarios PRISMA sobre un ticket SOLVI.
   *
   * Estos comentarios viven en `TBL_Solvi_Comments` (capa de PRISMA sobre SOLVI),
   * son distintos de los seguimientos nativos del ticket.
   *
   * @param payload - `{ ticketId }`.
   * @returns Los comentarios ordenados cronológicamente, con su autor embebido.
   */
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

  /**
   * Crea un comentario sobre un ticket SOLVI, con gate de acceso y menciones.
   *
   * Gate de autoría: solo puede comentar un admin, quien coincida por correo con
   * el solicitante o el resolutor del ticket, o quien ya sea participante. Tras
   * insertar, valida las menciones server-side: como SOLVI no tiene
   * confidencialidad, aplica solo la regla de departamento (admin menciona a
   * cualquiera; no-admin solo a TI o a su propio departamento; nunca
   * auto-mención). Persiste las menciones permitidas y da acceso durable como
   * participantes. Las notificaciones quedan pendientes para la Entrega 2.
   *
   * @param payload - `{ ticketId, userId, text, mentionedUserIds? }`.
   * @returns El comentario creado, con su autor embebido.
   * @throws Si el usuario no está autorizado a comentar en el ticket.
   */
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

  /**
   * Elimina un comentario PRISMA de un ticket SOLVI.
   *
   * @param payload - `{ commentId }`.
   * @returns `{ ok: true }` tras eliminar el comentario.
   */
  deleteSolviComment: async (payload, { supabase }) => {
    const { commentId } = payload as { commentId: number };
    const { error } = await supabase.from('TBL_Solvi_Comments').delete().eq('Comment_ID', commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Lista los participantes de un ticket SOLVI (identificadores y procedencia).
   *
   * Igual que en el núcleo de PRISMA, devuelve `User_Name`/`User_Avatar_url`
   * vacíos: el front los resuelve con su lista de usuarios.
   *
   * @param payload - `{ ticketId }`.
   * @returns Participantes con `Added_Via`/`Added_By` y campos de nombre en blanco.
   */
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

  /**
   * Revoca a un participante de un ticket SOLVI (solo admin).
   *
   * A diferencia del núcleo de PRISMA, acá no se puede validar "resolutor" por
   * asignación: en SOLVI el resolutor es texto, no un `User_ID`. Por eso el
   * criterio es más estricto — solo un admin puede revocar.
   *
   * @param payload - `{ ticketId, userId, actorId }`.
   * @returns `{ ok: true }` tras revocar al participante.
   * @throws Si el actor no es admin.
   */
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

  /**
   * Lista los tickets SOLVI donde el usuario fue mencionado.
   *
   * Resuelve los `Ticket_ID` de participación vía mención y trae esos tickets
   * (campos reducidos), ordenados por fecha de apertura descendente.
   *
   * @param payload - `{ userId }`.
   * @returns Los tickets SOLVI con mención al usuario.
   */
  fetchMySolviMentions: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    const { data: links, error: linksErr } = await supabase
      .from('TBL_Solvi_Participants')
      .select('Ticket_ID')
      .eq('User_ID', userId)
      .eq('Added_Via', 'mention');
    if (linksErr) throw new Error(linksErr.message);
    const ids = [...new Set((links as { Ticket_ID: number }[]).map((l) => l.Ticket_ID))];
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('TBL_Ticket_Solvi')
      .select('ticket_solvi_id, ticket_solvi_titulo, ticket_solvi_estado, ticket_solvi_categoria, ticket_solvi_resolutor, ticket_solvi_fechaapertura')
      .in('ticket_solvi_id', ids)
      .order('ticket_solvi_fechaapertura', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /**
   * Lista los tickets SOLVI abiertos por un usuario, según su correo.
   *
   * Filtra por `correo_solicitante` con `ilike` (case-insensitive) y aplica un
   * filtro extra en memoria por `trim`, porque `ilike` no maneja los espacios al
   * borde.
   *
   * @param payload - `{ email }`.
   * @returns Los tickets del solicitante; `[]` si el correo viene vacío.
   */
  fetchMySolviTickets: async (payload, { supabase }) => {
    const { email } = payload as { email: string };
    const e = (email ?? '').toLowerCase().trim();
    if (!e) return [];
    const { data, error } = await supabase
      .from('TBL_Ticket_Solvi')
      .select('ticket_solvi_id, ticket_solvi_titulo, ticket_solvi_estado, ticket_solvi_categoria, ticket_solvi_resolutor, ticket_solvi_fechaapertura, ticket_solvi_correo_solicitante')
      .ilike('ticket_solvi_correo_solicitante', e)   // ilike = case-insensitive
      .order('ticket_solvi_fechaapertura', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    // Filtro extra en memoria por trim (ilike no maneja espacios al borde)
    return (data ?? []).filter((t: { ticket_solvi_correo_solicitante: string | null }) =>
      (t.ticket_solvi_correo_solicitante ?? '').toLowerCase().trim() === e);
  },

  /**
   * Lista los adjuntos de un ticket SOLVI (sin generar signed URLs).
   *
   * Versión ligera de {@link solviHandlers.fetchSolviTicketDetail} acotada a los
   * adjuntos directos del ticket (`id_ticket`), sin firmar URLs.
   *
   * @param payload - `{ id }`.
   * @returns `{ attachments }` con los adjuntos del ticket.
   * @throws Si falta el `id` del ticket.
   */
  fetchTicketAttachments: async (payload, { supabase }) => {
    const { id } = (payload ?? {}) as { id?: number };
    if (id == null) throw new Error('Falta el id del ticket.');

    const { data: attachments, error: aErr } = await supabase
      .from('TBL_Ticket_Attachments_Solvi')
      .select(ATTACHMENT_SELECT)
      .eq('id_ticket', id)
      .order('created_at', { ascending: true });
    if (aErr) throw new Error(aErr.message);

    return {
      attachments
    };
  },

};