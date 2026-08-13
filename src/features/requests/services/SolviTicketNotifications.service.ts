import { GraphRecipient, GraphSendMailPayload } from '@/graph/GraphRest';
import type { AppUser } from '../hooks/useUsers';
import type { SolviTicket } from '../types/SolviTicket';
import { toISODateTimeFlex } from './SolviBusinessDate.service';

const SENDER_MAIL = 'listo@estudiodemoda.com.co';
const MAIL_API_URL =
  'https://api-envio-correos-bchfaebqdhfcbdgw.canadacentral-01.azurewebsites.net/mail/send';

async function sendMail(payload: GraphSendMailPayload) {
  return fetch(MAIL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderMail: SENDER_MAIL, ...payload }),
  });
}

function normalizeEmails(emails: readonly string[]): string[] {
  return [...new Set(
    emails
      .map((email) => String(email ?? '').trim().toLowerCase())
      .filter(Boolean),
  )];
}

function excludeEmails(emails: readonly string[], excluded: readonly string[]): string[] {
  const excludedSet = new Set(normalizeEmails(excluded));
  return normalizeEmails(emails).filter((email) => !excludedSet.has(email));
}

function buildRecipients(emails: readonly string[]): GraphRecipient[] {
  return normalizeEmails(emails).map((address) => ({
    emailAddress: { address },
  }));
}

function escapeHtml(value: string): string {
  return value
    .replace('&', '&amp;')
    .replace('<', '&lt;')
    .replace('>', '&gt;')
    .replace('"', '&quot;')
    .replace("'", '&#39;');
}

function buildCommentSnippet(commentText: string): string {
  const trimmed = String(commentText ?? '').trim();
  const compact = trimmed.replace(/\s+/g, ' ');
  const shortened = compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
  return escapeHtml(shortened || 'Sin contenido');
}

function buildTicketUrl(ticketId: string | number | undefined): string {
  const baseUrl = 'https://prisma.estudiodemoda.co/ticket';
  const safeTicketId = String(ticketId ?? '').trim();

  if (!safeTicketId) {
    return baseUrl;
  }

  return `${baseUrl}/${encodeURIComponent(safeTicketId)}`;
}

function buildOpenTicketButton(ticketId: string | number | undefined): string {
  const ticketUrl = buildTicketUrl(ticketId);
  return `
    <div style="margin-top:18px;">
      <a
        href="${escapeHtml(ticketUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;"
      >
        Ver ticket en Prisma
      </a>
    </div>
  `.trim();
}

function findUserEmailsByIds(userIds: readonly number[], users: readonly AppUser[]): string[] {
  const lookup = new Map(users.map((user) => [user.User_ID, user.User_Email]));
  return normalizeEmails(
    userIds
      .map((userId) => lookup.get(userId) ?? '')
      .filter(Boolean),
  );
}

type ResolveSolviCommentNotificationRecipientsParams = {
  ticket: Pick<
    SolviTicket,
    | 'ticket_solvi_correo_solicitante'
    | 'ticket_solvi_correo_resolutor'
    | 'ticket_solvi_id'
    | 'ticket_solvi_titulo'
  > & {
    ticket_solvi_correo_observador?: string | null;
  };
  authorEmail?: string | null;
  mentionedUserIds?: number[];
  participantUserIds?: number[];
  users: AppUser[];
};

type SolviCommentNotificationRecipients = {
  mentionRecipients: string[];
  conversationRecipients: string[];
};

export function resolveSolviCommentNotificationRecipients(
  params: ResolveSolviCommentNotificationRecipientsParams,
): SolviCommentNotificationRecipients {
  const mentionRecipients = excludeEmails(
    findUserEmailsByIds(params.mentionedUserIds ?? [], params.users),
    [params.authorEmail ?? ''],
  );

  const participantRecipients = findUserEmailsByIds(params.participantUserIds ?? [], params.users);
  const baseConversationRecipients = normalizeEmails([
    params.ticket.ticket_solvi_correo_solicitante ?? '',
    params.ticket.ticket_solvi_correo_resolutor ?? '',
    params.ticket.ticket_solvi_correo_observador ?? '',
    ...participantRecipients,
  ]);

  const conversationRecipients = excludeEmails(baseConversationRecipients, [
    params.authorEmail ?? '',
    ...mentionRecipients,
  ]);

  return {
    mentionRecipients,
    conversationRecipients,
  };
}

type CommentActivityAuthor = {
  ticket: Pick<SolviTicket, 'ticket_solvi_id' | 'ticket_solvi_titulo'>;
  authorName: string;
  authorEmail?: string | null;
  commentText: string;
  recipients: string[];
};

async function notifyConversationComment(params: CommentActivityAuthor): Promise<void> {
  const to = buildRecipients(params.recipients);
  if (!to.length) return;

  const subject = `Nuevo comentario en el ticket ${params.ticket.ticket_solvi_id}`;
  const body = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
      <p>Hola,</p>
      <p>Se agrego un nuevo comentario en el ticket <strong>${escapeHtml(String(params.ticket.ticket_solvi_id ?? '-'))}</strong>.</p>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#f9fafb;">
        <p style="margin:0 0 8px 0;"><strong>Ticket:</strong> ${escapeHtml(String(params.ticket.ticket_solvi_titulo ?? 'Sin asunto'))}</p>
        <p style="margin:0 0 8px 0;"><strong>Autor:</strong> ${escapeHtml(params.authorName)}${params.authorEmail ? ` (${escapeHtml(params.authorEmail)})` : ''}</p>
        <p style="margin:0;"><strong>Comentario:</strong><br>${buildCommentSnippet(params.commentText)}</p>
      </div>
      ${buildOpenTicketButton(params.ticket.ticket_solvi_id)}
      <p style="margin-top:16px;">Este es un mensaje automatico, por favor no respondas.</p>
    </div>
  `.trim();

  await sendMail({
    message: {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients: to,
    },
  });
}

async function notifyCommentMention(params: CommentActivityAuthor): Promise<void> {
  const to = buildRecipients(params.recipients);
  if (!to.length) return;

  const subject = `Te mencionaron en el ticket ${params.ticket.ticket_solvi_id}`;
  const body = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
      <p>Hola,</p>
      <p><strong>${escapeHtml(params.authorName)}</strong>${params.authorEmail ? ` (${escapeHtml(params.authorEmail)})` : ''} te menciono en el ticket <strong>${escapeHtml(String(params.ticket.ticket_solvi_id ?? '-'))}</strong>.</p>
      <div style="border:1px solid #dbeafe;border-radius:12px;padding:16px;background:#eff6ff;">
        <p style="margin:0 0 8px 0;"><strong>Asunto:</strong> ${escapeHtml(String(params.ticket.ticket_solvi_titulo ?? 'Sin asunto'))}</p>
        <p style="margin:0;"><strong>Comentario:</strong><br>${buildCommentSnippet(params.commentText)}</p>
      </div>
      ${buildOpenTicketButton(params.ticket.ticket_solvi_id)}
      <p style="margin-top:16px;">Este es un mensaje automatico, por favor no respondas.</p>
    </div>
  `.trim();

  await sendMail({
    message: {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients: to,
    },
  });
}

type NotifySolviCommentActivityParams = {
  ticket: ResolveSolviCommentNotificationRecipientsParams['ticket'];
  authorName: string;
  authorEmail?: string | null;
  commentText: string;
  mentionedUserIds?: number[];
  participantUserIds?: number[];
  users: AppUser[];
};

export async function notifySolviCommentActivity(
  params: NotifySolviCommentActivityParams,
): Promise<void> {
  const recipients = resolveSolviCommentNotificationRecipients({
    ticket: params.ticket,
    authorEmail: params.authorEmail,
    mentionedUserIds: params.mentionedUserIds,
    participantUserIds: params.participantUserIds,
    users: params.users,
  });

  await Promise.all([
    notifyConversationComment({
      ticket: params.ticket,
      authorName: params.authorName,
      authorEmail: params.authorEmail,
      commentText: params.commentText,
      recipients: recipients.conversationRecipients,
    }),
    notifyCommentMention({
      ticket: params.ticket,
      authorName: params.authorName,
      authorEmail: params.authorEmail,
      commentText: params.commentText,
      recipients: recipients.mentionRecipients,
    }),
  ]);
}

export async function notifyTicketCreatedSolicitante(ticket: SolviTicket): Promise<void> {
  const address = (ticket.ticket_solvi_correo_solicitante ?? '').trim();
  if (!address) {
    throw new Error('notifyTicketCreatedSolicitante: correo del solicitante inválido');
  }

  const body = `
    <p>¡Hola ${ticket.ticket_solvi_solicitante ?? ''}!<br><br>
    Tu solicitud ha sido registrada exitosamente y ha sido asignada a un técnico para su gestión. Estos son los detalles del caso:<br><br>
    <strong>ID del Caso:</strong> ${ticket.ticket_solvi_id}<br>
    <strong>Espacio fisico:</strong> ${ticket.ticket_solvi_titulo}<br>
    <strong>Resolutor asignado:</strong> ${ticket.ticket_solvi_correo_resolutor ?? '—'}<br>
    <strong>Fecha máxima de solución:</strong> ${toISODateTimeFlex(ticket.ticket_solvi_fechamaxima) ?? 'No aplica'}<br><br>
    El resolutor asignado se pondrá en contacto contigo en el menor tiempo posible para darte solución a tu requerimiento.<br><br>
    Este es un mensaje automático, por favor no respondas.
    </p>
  `.trim();

  const to: GraphRecipient[] = [{ emailAddress: { address } }];

  await sendMail({
    message: {
      subject: `Asignación de Caso - ${ticket.ticket_solvi_id}`,
      body: { contentType: 'HTML', content: body },
      toRecipients: to,
    },
  });
}

export async function notifyTicketCreatedResolutor(ticket: SolviTicket): Promise<void> {
  if (!ticket.ticket_solvi_correo_resolutor) {
    throw new Error('notifyTicketCreatedResolutor: correo del resolutor inválido');
  }

  const body = `
    <p>¡Hola!<br><br>
    Tienes un nuevo caso asignado con estos detalles:<br><br>
    <strong>ID del Caso:</strong> ${ticket.ticket_solvi_id}<br>
    <strong>Solicitante:</strong> ${ticket.ticket_solvi_solicitante ?? '—'}<br>
    <strong>Correo del Solicitante:</strong> ${ticket.ticket_solvi_correo_solicitante ?? '—'}<br>
    <strong>Asunto:</strong> ${ticket.ticket_solvi_titulo}<br>
    <strong>Fecha máxima de solución:</strong> ${ticket.ticket_solvi_fechamaxima}<br><br>
    Por favor, contacta al usuario para brindarle solución.<br><br>
    Este es un mensaje automático, por favor no respondas.
    </p>
  `.trim();

  const to: GraphRecipient[] = [{ emailAddress: { address: ticket.ticket_solvi_correo_resolutor } }];

  await sendMail({
    message: {
      subject: `Nuevo caso asignado - ${ticket.ticket_solvi_id}`,
      body: { contentType: 'HTML', content: body },
      toRecipients: to,
    },
  });
}
