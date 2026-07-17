import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { sendEventEmail } from '../email/send.ts';

const TI_DEPARTMENT_ID   = 7;
const CLIENT_REVIEW_SLUG = 'cliente_review';
const IN_PROGRESS_SLUG   = 'en_progreso';

/**
 * Correo "ya empezamos a trabajar".
 * Se dispara al mover a En progreso. Solo pasa por moveToColumn: en_progreso
 * no requiere evidencia, así que nunca abre el ClosureModal.
 *
 * Condiciones: (a) columna destino = en_progreso, (b) hay solicitante,
 * (c) el solicitante NO es también resolutor, (d) el solicitante es EXTERNO
 * (Department_ID !== 7), (e) NO se envió antes este correo para el ticket.
 *
 * (e) importa porque en_progreso no es columna de cierre: un ticket puede
 * volver a entrar varias veces (rechazo del cliente → QAS → en progreso).
 * El aviso "ya empezamos" solo tiene sentido la primera vez.
 *
 * Nunca lanza: el correo no puede tumbar el move.
 */
export async function maybeSendInProgressEmail(
  supabase: DB,
  args: {
    requestId:   string;
    columnId:    number;
    requestedBy: number | null;
    assigneeIds: number[];
  },
): Promise<void> {
  try {
    if (!args.requestedBy) return;

    const { data: col } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_Slug')
      .eq('Board_Column_ID', args.columnId)
      .single();
    if ((col as any)?.Board_Column_Slug !== IN_PROGRESS_SLUG) return;

    if (args.assigneeIds.includes(args.requestedBy)) {
      console.log('[in-progress-mail] omitido: el solicitante es también resolutor');
      return;
    }

    const { data: reqUser } = await supabase
      .from('TBL_Users')
      .select('User_Name, Department_ID')
      .eq('User_ID', args.requestedBy)
      .single();

    const deptId = (reqUser as any)?.Department_ID as number | null | undefined;
    if (deptId === TI_DEPARTMENT_ID) {
      console.log('[in-progress-mail] omitido: solicitante interno (TI)');
      return;
    }

    // Solo una vez por ticket: si ya salió, no se repite aunque vuelva a entrar.
    const { data: previous } = await supabase
      .from('TBL_Email_Logs')
      .select('Email_Log_ID')
      .eq('Email_Log_Request_ID', args.requestId)
      .eq('Email_Log_Event_Key', 'movido_en_progreso')
      .eq('Email_Log_Status', 'sent')
      .limit(1)
      .maybeSingle();

    if (previous) {
      console.log('[in-progress-mail] omitido: ya se envió antes para este ticket');
      return;
    }

    const requesterName = shortName((reqUser as any)?.User_Name ?? '');

    const { data: reqRow } = await supabase
      .from('TBL_Requests')
      .select('Request_Title')
      .eq('Request_ID', args.requestId)
      .single();

    console.log(`[in-progress-mail] ✅ enviando a userId=${args.requestedBy} (dept=${deptId})`);
    await sendEventEmail(supabase, {
      eventKey:  'movido_en_progreso',
      requestId: args.requestId,
      userIds:   [args.requestedBy],
      vars: {
        requester_name: requesterName,
        ticket_id:      args.requestId,
        ticket_title:   (reqRow as any)?.Request_Title ?? '',
        ticket_url:     `${Deno.env.get('MAIL_APP_URL')}/ticket/${args.requestId}`,
      },
    });
  } catch (e) {
    console.error('[in-progress-mail] falló:', e);
  }
}

/**
 * Correo "listo para revisión del cliente".
 * Se llama desde moveToColumn Y desde closeRequest (los dos caminos reales
 * para llegar a Client Review). Nunca lanza: el correo no puede tumbar el move.
 *
 * Condiciones: (a) columna destino = cliente_review, (b) hay solicitante,
 * (c) el solicitante es EXTERNO (Department_ID !== 7 — la verdad real, no el
 * rol 'ti_member' que no existe en TBL_Users.User_Role), (d) el solicitante
 * NO es también resolutor del ticket.
 */
export async function maybeSendClientReviewEmail(
  supabase: DB,
  args: {
    requestId:   string;
    columnId:    number;
    requestedBy: number | null;
    assigneeIds: number[];
  },
): Promise<void> {
  try {
    //console.log(`[client-review-mail] ENTRADA req=${args.requestId} columnId=${args.columnId} requestedBy=${args.requestedBy}`);

    if (!args.requestedBy) {
      //console.log('[client-review-mail] omitido: sin requestedBy');
      return;
    }

    const { data: col, error: colErr } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_Slug')
      .eq('Board_Column_ID', args.columnId)
      .single();
    const slug = (col as any)?.Board_Column_Slug;
    //console.log(`[client-review-mail] slug="${slug}" (esperado "${CLIENT_REVIEW_SLUG}") colErr=${colErr?.message ?? 'none'}`);
    if (slug !== CLIENT_REVIEW_SLUG) {
      //console.log('[client-review-mail] omitido: no es cliente_review');
      return;
    }

    if (args.assigneeIds.includes(args.requestedBy)) {
      //console.log('[client-review-mail] omitido: el solicitante es también resolutor');
      return;
    }

    const { data: reqUser } = await supabase
      .from('TBL_Users')
      .select('User_Name, Department_ID')
      .eq('User_ID', args.requestedBy)
      .single();

    const deptId = (reqUser as any)?.Department_ID as number | null | undefined;
    if (deptId === TI_DEPARTMENT_ID) {
      //console.log('[client-review-mail] omitido: solicitante interno (TI)');
      return;
    }

    const fullName = (reqUser as any)?.User_Name ?? '';
    const parts    = fullName.trim().split(/\s+/);
    const requesterName = parts.length >= 4 ? `${parts[0]} ${parts[2]}` : fullName.trim();

    const { data: reqRow } = await supabase
      .from('TBL_Requests')
      .select('Request_Title')
      .eq('Request_ID', args.requestId)
      .single();

    console.log(`[client-review-mail] ✅ enviando a userId=${args.requestedBy} (dept=${deptId})`);
    await sendEventEmail(supabase, {
      eventKey:  'movido_client_review',
      requestId: args.requestId,
      userIds:   [args.requestedBy],
      vars: {
        requester_name: requesterName,
        ticket_id:      args.requestId,
        ticket_title:   (reqRow as any)?.Request_Title ?? '',
        ticket_url:     `${Deno.env.get('MAIL_APP_URL')}/ticket/${args.requestId}`,
      },
    });
  } catch (e) {
    console.error('[client-review-mail] falló:', e);
  }
}

/** Ventana anti-spam: no se manda otro correo de comentario al mismo
 *  destinatario/ticket si ya salió uno dentro de estos minutos. */
const COMMENT_MAIL_COOLDOWN_MIN = 15;

/** Escapa HTML para no romper la plantilla ni permitir inyección desde un comentario. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Formato PRISMA: "Nombre1 Nombre2 Apellido1 Apellido2" → "Nombre1 Apellido1" */
function shortName(fullName: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/);
  return parts.length >= 4 ? `${parts[0]} ${parts[2]}` : (fullName ?? '').trim();
}

/**
 * Correo "nuevo comentario".
 * Destinatarios: resolutores + solicitante, excluyendo al autor del comentario.
 * Confidencial: se avisa que hay comentario, pero NO se manda el contenido.
 * Anti-spam: se omite si ya se mandó uno a ese destinatario en la última ventana.
 * Nunca lanza: el correo no puede tumbar la creación del comentario.
 */
export async function maybeSendCommentEmail(
  supabase: DB,
  args: {
    requestId:   string;
    actorId:     number;
    commentText: string;
    assigneeIds: number[];
    requestedBy: number | null;
  },
): Promise<void> {
  try {
    const candidates = [...new Set([
      ...args.assigneeIds,
      ...(args.requestedBy ? [args.requestedBy] : []),
    ])].filter((uid) => uid !== args.actorId);

    if (candidates.length === 0) {
      console.log('[comment-mail] omitido: sin destinatarios');
      return;
    }

    const { data: reqRow } = await supabase
      .from('TBL_Requests')
      .select('Request_Title, Request_Is_Confidential')
      .eq('Request_ID', args.requestId)
      .single();

    const isConfidential = !!(reqRow as any)?.Request_Is_Confidential;

    const { data: actorRow } = await supabase
      .from('TBL_Users').select('User_Name').eq('User_ID', args.actorId).single();
    const actorName = shortName((actorRow as any)?.User_Name ?? 'Un miembro del equipo');

    // Bloque de contenido: texto real o aviso de confidencialidad
    const raw     = (args.commentText ?? '').trim();
    const clipped = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
    const preview = isConfidential
      ? '<strong>Esta solicitud es confidencial.</strong><br />Por seguridad no incluimos el contenido del comentario en este correo. Ingresá a PRISMA para leerlo.'
      : escapeHtml(clipped).replace(/\n/g, '<br />');

    // Anti-spam: descartar destinatarios con correo reciente para este ticket
    const cutoff = new Date(Date.now() - COMMENT_MAIL_COOLDOWN_MIN * 60_000).toISOString();
    const { data: recentLogs } = await supabase
      .from('TBL_Email_Logs')
      .select('Email_Log_Sent_To')
      .eq('Email_Log_Request_ID', args.requestId)
      .eq('Email_Log_Event_Key', 'createComment')
      .eq('Email_Log_Status', 'sent')
      .gte('Email_Log_Sent_At', cutoff);

    const recentSet = new Set(
      ((recentLogs ?? []) as { Email_Log_Sent_To: number }[]).map((l) => l.Email_Log_Sent_To),
    );
    const finalIds = candidates.filter((uid) => !recentSet.has(uid));

    if (finalIds.length === 0) {
      console.log(`[comment-mail] omitido: todos en cooldown (${COMMENT_MAIL_COOLDOWN_MIN} min)`);
      return;
    }

    // Un envío por destinatario: el saludo lleva su propio nombre.
    const { data: users } = await supabase
      .from('TBL_Users').select('User_ID, User_Name').in('User_ID', finalIds);

    for (const u of ((users ?? []) as { User_ID: number; User_Name: string }[])) {
      await sendEventEmail(supabase, {
        eventKey:  'createComment',
        requestId: args.requestId,
        userIds:   [u.User_ID],
        vars: {
          recipient_name:  shortName(u.User_Name),
          actor_name:      actorName,
          ticket_id:       args.requestId,
          ticket_title:    (reqRow as any)?.Request_Title ?? '',
          ticket_url:      `${Deno.env.get('MAIL_APP_URL')}/ticket/${args.requestId}`,
          comment_preview: preview,
          is_confidential: isConfidential ? 'true' : 'false',
        },
      });
    }
    console.log(`[comment-mail] ✅ enviado a ${finalIds.length} destinatario(s) · confidencial=${isConfidential}`);
  } catch (e) {
    console.error('[comment-mail] falló:', e);
  }
}

/**
 * Correo "el cliente respondió la revisión".
 * Destinatarios: los que ya calculó el handler (resolutores; el solicitante
 * queda fuera porque es quien envía el feedback).
 * Confidencial: no se manda el texto de la nota del cliente, solo el aviso.
 * Nunca lanza: el correo no puede tumbar el registro del feedback.
 */
export async function maybeSendClientFeedbackEmail(
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
    if (args.recipientIds.length === 0) {
      console.log('[feedback-mail] omitido: sin destinatarios (nadie asignado)');
      return;
    }

    const { data: reqRow } = await supabase
      .from('TBL_Requests')
      .select('Request_Title, Request_Is_Confidential')
      .eq('Request_ID', args.requestId)
      .single();
    const isConfidential = !!(reqRow as any)?.Request_Is_Confidential;

    const { data: clientRow } = await supabase
      .from('TBL_Users').select('User_Name').eq('User_ID', args.clientId).single();
    const clientName = shortName((clientRow as any)?.User_Name ?? 'El cliente');

    const approved = args.decision === 'approved';

    // Paleta y copy según la decisión
    const statusColor  = approved ? '#16a34a' : '#dc2626';
    const statusBg     = approved ? '#f0fdf4' : '#fef2f2';
    const statusBorder = approved ? '#bbf7d0' : '#fecaca';
    const statusLower  = approved ? 'aprob\u00F3' : 'solicit\u00F3 ajustes en';

    /* ── Stepper: Recibida → En proceso → Revisión → Completada ──────────
       Aprobado  → pasos 1-3 verdes, paso 4 activo (morado ★).
       Ajustes   → paso 2 en ROJO con ↻ (el ticket RETROCEDE a En proceso),
                   pasos 3 y 4 vuelven a gris pendiente.
    ─────────────────────────────────────────────────────────────────────── */
    const GREEN = '#16a34a', PURPLE = '#6b2cff', RED = '#dc2626';
    const GREY_BG = '#e8e8e8', GREY_TXT = '#999999', GREY_LINE = '#d9d9d9';

    const step = approved
      ? {
          s2_bg: GREEN, s2_icon: '\u2713', s2_label_color: '#333333', s2_bold: 'normal',
          s3_bg: GREEN, s3_fg: '#ffffff', s3_icon: '\u2713', s3_label_color: '#333333',
          s4_bg: PURPLE, s4_fg: '#ffffff', s4_icon: '\u2605', s4_label_color: PURPLE, s4_bold: 'bold',
          line23: GREEN, line34: GREEN,
        }
      : {
          s2_bg: RED, s2_icon: '\u21BB', s2_label_color: RED, s2_bold: 'bold',
          s3_bg: GREY_BG, s3_fg: GREY_TXT, s3_icon: '3', s3_label_color: GREY_TXT,
          s4_bg: GREY_BG, s4_fg: GREY_TXT, s4_icon: '4', s4_label_color: GREY_TXT, s4_bold: 'normal',
          line23: GREY_LINE, line34: GREY_LINE,
        };

    const statusMessage = approved
      ? `<strong>${escapeHtml(clientName)}</strong> revis\u00F3 la solicitud y la <strong style="color:${statusColor};">aprob\u00F3</strong>.`
      : `<strong>${escapeHtml(clientName)}</strong> revis\u00F3 la solicitud y <strong style="color:${statusColor};">solicit\u00F3 ajustes</strong>.`;

    const nextStep = approved
      ? 'La solicitud avanz\u00F3 a <strong>Ready to Deploy</strong>. No requiere m\u00E1s trabajo de tu parte, salvo el despliegue.'
      : 'La solicitud volvi\u00F3 a <strong>En revisi\u00F3n QAS</strong>. Revis\u00E1 los comentarios del cliente y realiz\u00E1 los ajustes necesarios.';

    // Bloque de la nota del cliente: <tr> completo, o vacío si no aplica
    const rawNote = (args.feedbackNote ?? '').trim();
    let feedbackBlock = '';
    if (isConfidential && rawNote) {
      feedbackBlock = `<tr><td style="padding:4px 0 20px;"><div style="padding:16px 18px; border-radius:8px; background:#fffbeb; border:1px solid #fde68a; font-size:13px; line-height:1.6; color:#92400e;"><strong>Esta solicitud es confidencial.</strong><br />Por seguridad no incluimos el comentario del cliente en este correo. Ingres\u00E1 a PRISMA para leerlo.</div></td></tr>`;
    } else if (rawNote) {
      const clipped = rawNote.length > 400 ? `${rawNote.slice(0, 400)}\u2026` : rawNote;
      const safe    = escapeHtml(clipped).replace(/\n/g, '<br />');
      feedbackBlock = `<tr><td style="padding:4px 0 20px;"><p style="margin:0 0 8px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#888888;">Comentario del cliente</p><div style="padding:16px 18px; border-radius:8px; background:#f5f0ff; border:1px solid #d9c9ff; border-left:4px solid ${statusColor}; font-size:13px; line-height:1.6; color:#4a2a99; font-style:italic;">&ldquo;${safe}&rdquo;</div></td></tr>`;
    }

    // Un envío por destinatario: el saludo lleva su propio nombre.
    const { data: users } = await supabase
      .from('TBL_Users').select('User_ID, User_Name').in('User_ID', args.recipientIds);

    for (const u of ((users ?? []) as { User_ID: number; User_Name: string }[])) {
      await sendEventEmail(supabase, {
        eventKey:  'submitClientFeedback',
        requestId: args.requestId,
        userIds:   [u.User_ID],
        vars: {
          recipient_name:        shortName(u.User_Name),
          client_name:           clientName,
          ticket_id:             args.requestId,
          ticket_title:          (reqRow as any)?.Request_Title ?? '',
          ticket_url:            `${Deno.env.get('MAIL_APP_URL')}/ticket/${args.requestId}`,
          feedback_status_lower: statusLower,
          status_color:          statusColor,
          status_bg:             statusBg,
          status_border:         statusBorder,
          status_message:        statusMessage,
          next_step:             nextStep,
          feedback_block:        feedbackBlock,
          ...step,
        },
      });
    }
    console.log(`[feedback-mail] ✅ ${args.decision} · enviado a ${args.recipientIds.length} destinatario(s) · confidencial=${isConfidential}`);
  } catch (e) {
    console.error('[feedback-mail] falló:', e);
  }
}

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