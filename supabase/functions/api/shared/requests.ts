import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { notifyEvent } from '../handlers/notifyEvent.ts';

/**
 * Notificadores por evento del ticket y helpers de participantes/cierre.
 *
 * Cada función `notify*` decide destinatarios y contenido de un evento
 * (creación, asignación, movimiento de columna, revisión del cliente, en
 * progreso, comentario, cierre con evidencia, feedback del cliente) y lo emite
 * siempre a través de {@link notifyEvent}. Los handlers las despachan en segundo
 * plano con `dispatchEvent`.
 *
 * También expone helpers para resolver participantes
 * ({@link getRequestParticipants}) y planificar el cierre al mover columnas
 * ({@link planColumnTransition}).
 *
 * @remarks
 * Todas las funciones `notify*` son best-effort: nunca lanzan, porque la
 * notificación no puede tumbar la operación principal.
 *
 * @module notificationEvents
 */

/** ID del departamento de TI; sus solicitantes se consideran internos. */
const TI_DEPARTMENT_ID   = 7;
/** Slug de la columna "revisión del cliente". */
const CLIENT_REVIEW_SLUG = 'cliente_review';
/** Slug de la columna "en progreso". */
const IN_PROGRESS_SLUG   = 'en_progreso';

/**
 * Escapa caracteres HTML para no romper la plantilla ni permitir inyección desde
 * texto del usuario.
 *
 * @param s - Texto a escapar.
 * @returns El texto con `&`, `<`, `>`, `"` y `'` convertidos a entidades HTML.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Acorta un nombre completo al formato PRISMA "Nombre1 Apellido1".
 *
 * @remarks
 * Si el nombre tiene 4 o más partes ("Nombre1 Nombre2 Apellido1 Apellido2"),
 * toma la 1ª y la 3ª; en otro caso devuelve el nombre tal cual (trim).
 *
 * @param fullName - Nombre completo.
 * @returns El nombre corto.
 */
function shortName(fullName: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/);
  return parts.length >= 4 ? `${parts[0]} ${parts[2]}` : (fullName ?? '').trim();
}

/** URL del ticket en la app, para los correos. */
function ticketUrl(requestId: string): string {
  return `${Deno.env.get('MAIL_APP_URL')}/ticket/${requestId}`;
}

/** Recorta un texto y lo deja listo para insertar como HTML en un correo. */
function clipHtml(text: string | null | undefined, max: number): string {
  const raw     = (text ?? '').trim();
  const clipped = raw.length > max ? `${raw.slice(0, max)}…` : raw;
  return escapeHtml(clipped).replace(/\n/g, '<br />');
}

/** Título y confidencialidad de un ticket. */
async function getRequestInfo(
  supabase: DB,
  requestId: string,
): Promise<{ title: string; isConfidential: boolean }> {
  const { data } = await supabase
    .from('TBL_Requests')
    .select('Request_Title, Request_Is_Confidential')
    .eq('Request_ID', requestId)
    .single();
  return {
    title:          (data as any)?.Request_Title ?? '',
    isConfidential: !!(data as any)?.Request_Is_Confidential,
  };
}

/** Slug de una columna del tablero, o `null` si no existe. */
async function getColumnSlug(supabase: DB, columnId: number): Promise<string | null> {
  const { data } = await supabase
    .from('TBL_Board_Columns')
    .select('Board_Column_Slug')
    .eq('Board_Column_ID', columnId)
    .maybeSingle();
  return (data as { Board_Column_Slug: string } | null)?.Board_Column_Slug ?? null;
}

/** Nombre corto de un usuario, o `fallback` si no existe. */
async function getShortUserName(supabase: DB, userId: number, fallback: string): Promise<string> {
  const { data } = await supabase
    .from('TBL_Users').select('User_Name').eq('User_ID', userId).maybeSingle();
  return shortName((data as any)?.User_Name ?? '') || fallback;
}

/**
 * Evento "solicitud creada por formulario".
 *
 * @remarks
 * - Correo `ticket_recibido` al solicitante, siempre (sin filtro por departamento).
 * - In-app `new_external_request` a los miembros de los sub-equipos de los
 *   equipos destino, solo si la solicitud es externa (el solicitante no es de TI).
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket creado.
 * @param args.title - Título del ticket.
 * @param args.description - Descripción del ticket.
 * @param args.requestedBy - Solicitante.
 * @param args.requesterDepartmentId - Departamento del solicitante.
 * @param args.equipoIds - Equipos a los que se dirigió la solicitud.
 * @param args.autoAssignedSprint - Sprint asignado automáticamente, o `null`.
 */
export async function notifyRequestCreated(
  supabase: DB,
  args: {
    requestId:             string;
    title:                 string;
    description:           string;
    requestedBy:           number;
    requesterDepartmentId: number | null;
    equipoIds:             number[];
    autoAssignedSprint:    Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    // In-app a los sub-equipos (solo solicitudes externas).
    let memberIds: number[] = [];
    if (args.requesterDepartmentId !== TI_DEPARTMENT_ID && args.equipoIds.length > 0) {
      const { data: subTeamRows } = await supabase
        .from('TBL_Sub_Teams')
        .select('Sub_Team_ID')
        .in('Sub_Team_Team_ID', args.equipoIds);
      const subTeamIds = ((subTeamRows ?? []) as { Sub_Team_ID: number }[]).map((s) => s.Sub_Team_ID);

      if (subTeamIds.length > 0) {
        const { data: memberRows } = await supabase
          .from('TBL_Sub_Team_Members')
          .select('Sub_Team_Member_User_ID')
          .in('Sub_Team_Member_Sub_Team_ID', subTeamIds);
        memberIds = [...new Set(
          ((memberRows ?? []) as { Sub_Team_Member_User_ID: number }[])
            .map((m) => m.Sub_Team_Member_User_ID),
        )].filter((uid) => uid !== args.requestedBy);
      }
    }

    const fmtFecha = (iso: string) => {
      if (!iso) return '';
      const clean = iso.includes('T') ? iso : `${iso}T00:00:00`;
      return new Date(clean).toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
      });
    };

    const sp = args.autoAssignedSprint as any;
    let sprintInfo: string;
    if (sp) {
      const desde = fmtFecha(sp.Sprint_Start_Date ?? '');
      const hasta = fmtFecha(sp.Sprint_End_Date ?? '');
      const rango = (desde && hasta) ? ` (del ${desde} al ${hasta})` : '';
      sprintInfo  = `Tu solicitud quedó programada para ${sp.Sprint_Text}${rango}.`;
    } else {
      sprintInfo = 'El equipo te notificará cuando tu solicitud quede programada en un sprint.';
    }

    const requesterName = await getShortUserName(supabase, args.requestedBy, '');

    await notifyEvent(supabase, {
      eventKey:  'ticket_recibido',
      requestId: args.requestId,
      actorId:   args.requestedBy,
      inApp: {
        userIds: memberIds,
        type:    'new_external_request',
        title:   `Nueva solicitud externa ${args.requestId}`,
        body:    `Se creó la solicitud externa "${args.title}" dirigida a tu equipo.`,
      },
      email: {
        userIds: [args.requestedBy],
        vars: {
          requester_name:     requesterName,
          ticket_id:          args.requestId,
          ticket_title:       args.title ?? '',
          ticket_description: args.description ?? '',
          ticket_url:         ticketUrl(args.requestId),
          sprint_info:        sprintInfo,
          sprint_name:        sp ? String(sp.Sprint_Text) : '',
        },
      },
    });
  } catch (e) {
    console.error('[notify:created] falló:', e);
  }
}

/**
 * Evento "asignación de resolutor".
 *
 * @remarks
 * In-app `assignment` + correo `assignRequest` al resolutor asignado. No se
 * notifica si el resolutor se asignó a sí mismo, ni si ya tiene una
 * notificación de asignación sin leer para el mismo ticket (evita duplicados).
 * Cubre tanto la asignación manual (`actorId`) como la automática por reglas
 * (`actorId = null`, con `reason` como cuerpo de la in-app).
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket asignado.
 * @param args.userId - Resolutor asignado.
 * @param args.actorId - Quién asignó, o `null` si fue una automatización.
 * @param args.reason - Texto de la in-app para asignaciones automáticas.
 */
export async function notifyAssignment(
  supabase: DB,
  args: { requestId: string; userId: number; actorId: number | null; reason?: string },
): Promise<void> {
  try {
    if (args.actorId === args.userId) return;

    const { data: existing } = await supabase
      .from('TBL_Notifications')
      .select('Notification_ID')
      .eq('Notification_User_ID', args.userId)
      .eq('Notification_Type', 'assignment')
      .eq('Notification_Request_ID', args.requestId)
      .eq('Notification_Is_Read', false)
      .limit(1);
    if (existing && existing.length > 0) return;

    const [{ title }, assigneeName, actorName] = await Promise.all([
      getRequestInfo(supabase, args.requestId),
      getShortUserName(supabase, args.userId, ''),
      args.actorId ? getShortUserName(supabase, args.actorId, 'Alguien') : Promise.resolve(''),
    ]);

    await notifyEvent(supabase, {
      eventKey:  'assignRequest',
      requestId: args.requestId,
      actorId:   args.actorId,
      inApp: args.actorId
        ? {
            userIds: [args.userId],
            type:    'assignment',
            title:   'Te asignaron una solicitud',
            body:    `${actorName} te asignó ${args.requestId}`,
          }
        : {
            userIds: [args.userId],
            type:    'assignment',
            title:   `Te asignaron el ticket ${args.requestId}`,
            body:    args.reason ?? `Fuiste asignado automáticamente al ticket "${title}".`,
          },
      email: {
        userIds: [args.userId],
        vars: {
          assignee_name: assigneeName,
          actor_name:    actorName || 'PRISMA (automatización)',
          ticket_id:     args.requestId,
          ticket_title:  title,
          ticket_url:    ticketUrl(args.requestId),
        },
      },
    });
  } catch (e) {
    console.error('[notify:assignment] falló:', e);
  }
}

/**
 * Evento "ticket movido de columna".
 *
 * @remarks
 * In-app `column_move` a los participantes (resolutores + solicitante, sin quien
 * movió) y, según la columna destino, los correos de revisión del cliente
 * ({@link notifyClientReview}) y de en progreso ({@link notifyInProgress}).
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket movido.
 * @param args.columnId - Columna destino.
 * @param args.columnName - Nombre de la columna destino.
 * @param args.movedBy - Quién movió el ticket.
 * @param args.assigneeIds - Resolutores asignados.
 * @param args.requestedBy - Solicitante, o `null`.
 */
export async function notifyColumnMove(
  supabase: DB,
  args: {
    requestId:   string;
    columnId:    number;
    columnName:  string;
    movedBy:     number;
    assigneeIds: number[];
    requestedBy: number | null;
  },
): Promise<void> {
  const recipientIds = [...new Set([...args.assigneeIds, ...(args.requestedBy ? [args.requestedBy] : [])])]
    .filter((uid) => uid !== args.movedBy);

  await notifyEvent(supabase, {
    eventKey:  'moveToColumn',
    requestId: args.requestId,
    actorId:   args.movedBy,
    inApp: {
      userIds: recipientIds,
      type:    'column_move',
      title:   `Ticket movido a "${args.columnName}"`,
      body:    `El ticket ${args.requestId} fue movido a la columna "${args.columnName}".`,
    },
  });

  await notifyClientReview(supabase, args);
  await notifyInProgress(supabase, args);
}

/**
 * Correo "ya empezamos a trabajar" (paso a En progreso).
 *
 * @remarks
 * Es el único evento que conserva filtros. Condiciones para enviar:
 * (a) columna destino = en_progreso, (b) hay solicitante, (c) el solicitante NO
 * es también resolutor, (d) el solicitante es EXTERNO (`Department_ID !== 7`),
 * (e) NO se envió antes este correo para el ticket.
 *
 * La condición (e) importa porque en_progreso no es columna de cierre: un ticket
 * puede volver a entrar varias veces (rechazo del cliente → QAS → en progreso).
 * El aviso "ya empezamos" solo tiene sentido la primera vez.
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket movido.
 * @param args.columnId - Columna destino.
 * @param args.requestedBy - Solicitante, o `null`.
 * @param args.assigneeIds - Resolutores asignados.
 */
export async function notifyInProgress(
  supabase: DB,
  args: { requestId: string; columnId: number; requestedBy: number | null; assigneeIds: number[] },
): Promise<void> {
  try {
    if (!args.requestedBy) return;
    if (await getColumnSlug(supabase, args.columnId) !== IN_PROGRESS_SLUG) return;

    if (args.assigneeIds.includes(args.requestedBy)) {
      console.log('[notify:in-progress] omitido: el solicitante es también resolutor');
      return;
    }

    const { data: reqUser } = await supabase
      .from('TBL_Users')
      .select('User_Name, Department_ID')
      .eq('User_ID', args.requestedBy)
      .single();
    if ((reqUser as any)?.Department_ID === TI_DEPARTMENT_ID) {
      console.log('[notify:in-progress] omitido: solicitante interno (TI)');
      return;
    }

    const { data: previous } = await supabase
      .from('TBL_Email_Logs')
      .select('Email_Log_ID')
      .eq('Email_Log_Request_ID', args.requestId)
      .eq('Email_Log_Event_Key', 'movido_en_progreso')
      .eq('Email_Log_Status', 'sent')
      .limit(1)
      .maybeSingle();
    if (previous) {
      console.log('[notify:in-progress] omitido: ya se envió antes para este ticket');
      return;
    }

    const { title } = await getRequestInfo(supabase, args.requestId);

    await notifyEvent(supabase, {
      eventKey:  'movido_en_progreso',
      requestId: args.requestId,
      actorId:   null,
      email: {
        userIds: [args.requestedBy],
        vars: {
          requester_name: shortName((reqUser as any)?.User_Name ?? ''),
          ticket_id:      args.requestId,
          ticket_title:   title,
          ticket_url:     ticketUrl(args.requestId),
        },
      },
    });
  } catch (e) {
    console.error('[notify:in-progress] falló:', e);
  }
}

/**
 * Correo "listo para revisión del cliente" (envío a revisión).
 *
 * @remarks
 * Se dispara al llegar a la columna cliente_review, ya sea moviendo la tarjeta
 * (`moveToColumn`) o cerrando con evidencia (`closeRequest`). Va siempre al
 * solicitante, aunque también sea resolutor o sea de TI: en revisión actúa como
 * aprobador.
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket movido.
 * @param args.columnId - Columna destino.
 * @param args.requestedBy - Solicitante, o `null`.
 */
export async function notifyClientReview(
  supabase: DB,
  args: { requestId: string; columnId: number; requestedBy: number | null },
): Promise<void> {
  try {
    if (!args.requestedBy) return;
    if (await getColumnSlug(supabase, args.columnId) !== CLIENT_REVIEW_SLUG) return;

    const [{ title }, requesterName] = await Promise.all([
      getRequestInfo(supabase, args.requestId),
      getShortUserName(supabase, args.requestedBy, ''),
    ]);

    await notifyEvent(supabase, {
      eventKey:  'movido_client_review',
      requestId: args.requestId,
      actorId:   null,
      email: {
        userIds: [args.requestedBy],
        vars: {
          requester_name: requesterName,
          ticket_id:      args.requestId,
          ticket_title:   title,
          ticket_url:     ticketUrl(args.requestId),
        },
      },
    });
  } catch (e) {
    console.error('[notify:client-review] falló:', e);
  }
}

/**
 * Evento "nuevo comentario".
 *
 * @remarks
 * - In-app `mention` a los mencionados (ya validados por el handler).
 * - In-app `comment` a resolutores + solicitante, sin el autor ni los mencionados.
 * - Correo `createComment` a resolutores + solicitante, sin el autor; un envío
 *   por destinatario con su nombre. Si el ticket es confidencial, el correo
 *   avisa que hay comentario pero no incluye el contenido.
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket comentado.
 * @param args.actorId - Autor del comentario.
 * @param args.commentText - Texto completo del comentario.
 * @param args.mentionedIds - Usuarios mencionados (ya filtrados por las reglas de mención).
 * @param args.assigneeIds - Resolutores asignados.
 * @param args.requestedBy - Solicitante, o `null`.
 */
export async function notifyComment(
  supabase: DB,
  args: {
    requestId:    string;
    actorId:      number;
    commentText:  string;
    mentionedIds: number[];
    assigneeIds:  number[];
    requestedBy:  number | null;
  },
): Promise<void> {
  try {
    const trimmed    = (args.commentText ?? '').trim();
    const shortPrev  = trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : '');
    const participants = [...new Set([...args.assigneeIds, ...(args.requestedBy ? [args.requestedBy] : [])])]
      .filter((uid) => uid !== args.actorId);

    if (args.mentionedIds.length > 0) {
      await notifyEvent(supabase, {
        eventKey:  'mention',
        requestId: args.requestId,
        actorId:   args.actorId,
        inApp: {
          userIds: args.mentionedIds,
          type:    'mention',
          title:   `Te mencionaron en ${args.requestId}`,
          body:    shortPrev,
        },
      });
    }

    const [{ title, isConfidential }, actorName] = await Promise.all([
      getRequestInfo(supabase, args.requestId),
      getShortUserName(supabase, args.actorId, 'Un miembro del equipo'),
    ]);
    const preview = isConfidential
      ? '<strong>Esta solicitud es confidencial.</strong><br />Por seguridad no incluimos el contenido del comentario en este correo. Ingresá a PRISMA para leerlo.'
      : clipHtml(trimmed, 200);

    await notifyEvent(supabase, {
      eventKey:  'createComment',
      requestId: args.requestId,
      actorId:   args.actorId,
      inApp: {
        userIds: participants.filter((uid) => !args.mentionedIds.includes(uid)),
        type:    'comment',
        title:   `Nuevo comentario en ${args.requestId}`,
        body:    shortPrev,
      },
      email: {
        userIds: participants,
        vars: (u) => ({
          recipient_name:  shortName(u.User_Name),
          actor_name:      actorName,
          ticket_id:       args.requestId,
          ticket_title:    title,
          ticket_url:      ticketUrl(args.requestId),
          comment_preview: preview,
          is_confidential: isConfidential ? 'true' : 'false',
        }),
      },
    });
  } catch (e) {
    console.error('[notify:comment] falló:', e);
  }
}

/**
 * Evento "cierre con evidencia".
 *
 * @remarks
 * - In-app `closure` a resolutores + solicitante, sin quien cerró.
 * - Correo `closeRequest` a esos mismos destinatarios, con la nota de cierre
 *   (oculta si el ticket es confidencial). Si el cierre manda el ticket a
 *   revisión del cliente, el solicitante no recibe este correo porque ya recibe
 *   el de revisión ({@link notifyClientReview}), que también se dispara aquí.
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket cerrado.
 * @param args.closedBy - Quién cerró.
 * @param args.closureNote - Nota de cierre.
 * @param args.targetColumnId - Columna destino del cierre.
 * @param args.assigneeIds - Resolutores asignados.
 * @param args.requestedBy - Solicitante, o `null`.
 */
export async function notifyClosure(
  supabase: DB,
  args: {
    requestId:      string;
    closedBy:       number;
    closureNote:    string;
    targetColumnId: number;
    assigneeIds:    number[];
    requestedBy:    number | null;
  },
): Promise<void> {
  try {
    const recipientIds = [...new Set([...args.assigneeIds, ...(args.requestedBy ? [args.requestedBy] : [])])]
      .filter((uid) => uid !== args.closedBy);
    const toClientReview = await getColumnSlug(supabase, args.targetColumnId) === CLIENT_REVIEW_SLUG;
    const note = args.closureNote ?? '';

    const [{ title, isConfidential }, actorName] = await Promise.all([
      getRequestInfo(supabase, args.requestId),
      getShortUserName(supabase, args.closedBy, 'Un miembro del equipo'),
    ]);
    const closureNotes = isConfidential
      ? '<strong>Esta solicitud es confidencial.</strong><br />Por seguridad no incluimos la nota de cierre en este correo. Ingresá a PRISMA para leerla.'
      : clipHtml(note, 400);

    await notifyEvent(supabase, {
      eventKey:  'closeRequest',
      requestId: args.requestId,
      actorId:   args.closedBy,
      inApp: {
        userIds: recipientIds,
        type:    'closure',
        title:   `Ticket ${args.requestId} enviado a revisión`,
        body:    `El ticket fue enviado a revisión con evidencia adjunta. Nota: ${note.slice(0, 80)}${note.length > 80 ? '…' : ''}`,
      },
      email: {
        userIds: toClientReview ? recipientIds.filter((uid) => uid !== args.requestedBy) : recipientIds,
        vars: (u) => ({
          recipient_name: shortName(u.User_Name),
          actor_name:     actorName,
          ticket_id:      args.requestId,
          ticket_title:   title,
          ticket_url:     ticketUrl(args.requestId),
          closure_notes:  closureNotes,
        }),
      },
    });

    await notifyClientReview(supabase, {
      requestId:   args.requestId,
      columnId:    args.targetColumnId,
      requestedBy: args.requestedBy,
    });
  } catch (e) {
    console.error('[notify:closure] falló:', e);
  }
}

/**
 * Evento "el cliente respondió la revisión".
 *
 * @remarks
 * In-app `client_approved` / `client_rejected` + correo `submitClientFeedback` a
 * los destinatarios que calculó el handler (participantes sin el cliente). Si el
 * ticket es confidencial no se manda el texto de la nota, solo el aviso. El
 * correo lleva un stepper visual y una paleta según la decisión: si `approved`,
 * avanza a Ready to Deploy; si `rejected`, retrocede a En revisión QAS.
 *
 * @param supabase - Cliente de Supabase.
 * @param args.requestId - Ticket revisado.
 * @param args.recipientIds - Destinatarios ya calculados por el handler.
 * @param args.clientId - Cliente que dio el feedback.
 * @param args.decision - `'approved'` o `'rejected'`.
 * @param args.feedbackNote - Nota del cliente, o `null` (se recorta a 400 chars).
 */
export async function notifyClientFeedback(
  supabase: DB,
  args: {
    requestId:    string;
    recipientIds: number[];
    clientId:     number;
    decision:     'approved' | 'rejected';
    feedbackNote: string | null;
  },
): Promise<void> {
  try {
    const approved = args.decision === 'approved';
    const notePrev = args.feedbackNote ? ` Nota: ${args.feedbackNote.slice(0, 60)}` : '';

    const [{ title, isConfidential }, clientName] = await Promise.all([
      getRequestInfo(supabase, args.requestId),
      getShortUserName(supabase, args.clientId, 'El cliente'),
    ]);

    // Paleta y copy según la decisión
    const statusColor  = approved ? '#16a34a' : '#dc2626';
    const statusBg     = approved ? '#f0fdf4' : '#fef2f2';
    const statusBorder = approved ? '#bbf7d0' : '#fecaca';
    const statusLower  = approved ? 'aprobó' : 'solicitó ajustes en';

    /* ── Stepper: Recibida → En proceso → Revisión → Completada ──────────
       Aprobado  → pasos 1-3 verdes, paso 4 activo (morado ★).
       Ajustes   → paso 2 en ROJO con ↻ (el ticket RETROCEDE a En proceso),
                   pasos 3 y 4 vuelven a gris pendiente.
    ─────────────────────────────────────────────────────────────────────── */
    const GREEN = '#16a34a', PURPLE = '#6b2cff', RED = '#dc2626';
    const GREY_BG = '#e8e8e8', GREY_TXT = '#999999', GREY_LINE = '#d9d9d9';

    const step = approved
      ? {
          s2_bg: GREEN, s2_icon: '✓', s2_label_color: '#333333', s2_bold: 'normal',
          s3_bg: GREEN, s3_fg: '#ffffff', s3_icon: '✓', s3_label_color: '#333333',
          s4_bg: PURPLE, s4_fg: '#ffffff', s4_icon: '★', s4_label_color: PURPLE, s4_bold: 'bold',
          line23: GREEN, line34: GREEN,
        }
      : {
          s2_bg: RED, s2_icon: '↻', s2_label_color: RED, s2_bold: 'bold',
          s3_bg: GREY_BG, s3_fg: GREY_TXT, s3_icon: '3', s3_label_color: GREY_TXT,
          s4_bg: GREY_BG, s4_fg: GREY_TXT, s4_icon: '4', s4_label_color: GREY_TXT, s4_bold: 'normal',
          line23: GREY_LINE, line34: GREY_LINE,
        };

    const statusMessage = approved
      ? `<strong>${escapeHtml(clientName)}</strong> revisó la solicitud y la <strong style="color:${statusColor};">aprobó</strong>.`
      : `<strong>${escapeHtml(clientName)}</strong> revisó la solicitud y <strong style="color:${statusColor};">solicitó ajustes</strong>.`;

    const nextStep = approved
      ? 'La solicitud avanzó a <strong>Ready to Deploy</strong>. No requiere más trabajo de tu parte, salvo el despliegue.'
      : 'La solicitud volvió a <strong>En revisión QAS</strong>. Revisá los comentarios del cliente y realizá los ajustes necesarios.';

    // Bloque de la nota del cliente: <tr> completo, o vacío si no aplica
    const rawNote = (args.feedbackNote ?? '').trim();
    let feedbackBlock = '';
    if (isConfidential && rawNote) {
      feedbackBlock = `<tr><td style="padding:4px 0 20px;"><div style="padding:16px 18px; border-radius:8px; background:#fffbeb; border:1px solid #fde68a; font-size:13px; line-height:1.6; color:#92400e;"><strong>Esta solicitud es confidencial.</strong><br />Por seguridad no incluimos el comentario del cliente en este correo. Ingresá a PRISMA para leerlo.</div></td></tr>`;
    } else if (rawNote) {
      feedbackBlock = `<tr><td style="padding:4px 0 20px;"><p style="margin:0 0 8px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#888888;">Comentario del cliente</p><div style="padding:16px 18px; border-radius:8px; background:#f5f0ff; border:1px solid #d9c9ff; border-left:4px solid ${statusColor}; font-size:13px; line-height:1.6; color:#4a2a99; font-style:italic;">&ldquo;${clipHtml(rawNote, 400)}&rdquo;</div></td></tr>`;
    }

    await notifyEvent(supabase, {
      eventKey:  'submitClientFeedback',
      requestId: args.requestId,
      actorId:   args.clientId,
      inApp: {
        userIds: args.recipientIds,
        type:    approved ? 'client_approved' : 'client_rejected',
        title:   approved
          ? `Ticket ${args.requestId} aprobado por el cliente ✓`
          : `Ticket ${args.requestId} rechazado por el cliente ✗`,
        body:    approved
          ? `El cliente aprobó la solicitud. Pasa a Ready to Deploy.${notePrev}`
          : `El cliente rechazó la solicitud y solicita correcciones.${notePrev}`,
      },
      email: {
        userIds: args.recipientIds,
        vars: (u) => ({
          recipient_name:        shortName(u.User_Name),
          client_name:           clientName,
          ticket_id:             args.requestId,
          ticket_title:          title,
          ticket_url:            ticketUrl(args.requestId),
          feedback_status_lower: statusLower,
          status_color:          statusColor,
          status_bg:             statusBg,
          status_border:         statusBorder,
          status_message:        statusMessage,
          next_step:             nextStep,
          feedback_block:        feedbackBlock,
          ...step,
        }),
      },
    });
  } catch (e) {
    console.error('[notify:feedback] falló:', e);
  }
}

/**
 * Resuelve los participantes de un request: resolutores y solicitante.
 *
 * @remarks
 * Ejecuta en paralelo la lectura de asignaciones y del solicitante. Se usa para
 * calcular destinatarios de los `notify*`.
 *
 * @param supabase - Cliente de Supabase.
 * @param requestId - ID del request.
 * @returns `assigneeIds` (IDs de resolutores) y `requestedBy` (solicitante o `null`).
 */
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

/**
 * Indica si una columna es de cierre para los equipos del request.
 *
 * @remarks
 * Obtiene los equipos del request y consulta `TBL_Team_Column_Config` buscando
 * una configuración con `Is_Close_Column = true` para esa columna en alguno de
 * esos equipos. Si el request no tiene equipos, devuelve `false`.
 *
 * @param supabase - Cliente de Supabase.
 * @param columnId - Columna a evaluar.
 * @param requestId - Request cuyos equipos determinan la configuración.
 * @returns `true` si la columna es de cierre para algún equipo del request.
 */
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

/** Columnas terminales: siempre cuentan como cierre y moverse entre ellas nunca
 *  reabre ni re-sella la fecha (mismo criterio que DONE_COLUMNS de las stats). */
export const DONE_COLUMN_SLUGS = new Set(['ready_to_deploy', 'hecho', 'historial']);

/** Resultado de planificar el movimiento de un ticket a otra columna. */
export type ColumnTransition = {
  /** La columna destino cierra el ticket (Is_Close_Column o columna terminal). */
  willClose: boolean;
  /** Primer cierre: se sella `Request_Finished_At`. */
  closing:   boolean;
  /** Reapertura: sale de cierre hacia una columna que no cierra. */
  reopening: boolean;
  /** Campos a aplicar en `TBL_Requests` (columna + fecha/progreso si cambian). */
  update:    Record<string, unknown>;
};

/**
 * Decide cómo afecta al cierre mover un ticket a otra columna.
 *
 * @remarks
 * Fuente única de verdad para `moveToColumn`, `closeRequest` y
 * `submitClientFeedback`:
 * - La columna destino cierra si es `Is_Close_Column` para algún equipo del
 *   ticket, o si es terminal ({@link DONE_COLUMN_SLUGS}).
 * - La fecha se sella solo en el primer cierre; si ya estaba cerrado y va a otra
 *   columna que cierra (Ready → Hecho → Historial) se conserva la original.
 * - Solo se reabre (fecha `null`, progreso 0) al salir hacia una columna que no cierra.
 *
 * @param supabase - Cliente de Supabase.
 * @param p.requestId - Ticket a mover.
 * @param p.targetColumnId - Columna destino.
 * @param p.wasClosed - Si el ticket tenía `Request_Finished_At` antes del movimiento.
 * @param p.targetSlug - Slug de la columna destino si ya se consultó; si se omite, se busca.
 * @returns El plan de transición con el `update` listo para aplicar.
 */
export async function planColumnTransition(
  supabase: DB,
  p: { requestId: string; targetColumnId: number; wasClosed: boolean; targetSlug?: string | null },
): Promise<ColumnTransition> {
  let slug = p.targetSlug;
  if (slug === undefined) {
    const { data: col } = await supabase
      .from('TBL_Board_Columns').select('Board_Column_Slug')
      .eq('Board_Column_ID', p.targetColumnId).maybeSingle();
    slug = (col as { Board_Column_Slug: string } | null)?.Board_Column_Slug ?? null;
  }

  const willClose = DONE_COLUMN_SLUGS.has(slug ?? '')
    || await isCloseColumn(supabase, p.targetColumnId, p.requestId);
  const closing   = willClose && !p.wasClosed;
  const reopening = !willClose && p.wasClosed;

  const update: Record<string, unknown> = { Request_Board_Column_ID: p.targetColumnId };
  if (closing) {
    update['Request_Finished_At'] = new Date().toISOString();
    update['Request_Progress']    = 100;
  } else if (reopening) {
    update['Request_Finished_At'] = null;
    update['Request_Progress']    = 0;
  }
  return { willClose, closing, reopening, update };
}
