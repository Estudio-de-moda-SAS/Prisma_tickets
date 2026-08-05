import React from 'react';
import { TZDate } from '@date-fns/tz';
import { addMinutes, isSaturday, isSunday } from 'date-fns';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRecipient, GraphRest, GraphSendMailPayload } from '@/graph/GraphRest';
import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/types/commons';
import type { AppUser } from './useUsers';
import { fetchHolidays, type Holiday } from '../services/HolidayService.service';
import {
  UsuariosSPService,
  type UsuariosSP,
} from '../services/TecnicosSharepointSolvi.service';

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

const TIMEZONE = 'America/Bogota';
const WORK_START = 7;
const WORK_END = 17;
const TICKETS_ATTACHMENTS_BUCKET = "ticket-attachments"

const sliceYMD = (s?: string) => (s ? s.slice(0, 10) : '');

const toYMD = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(12, 0, 0, 0);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function pad(n: number) { return String(n).padStart(2, '0'); }

const isHoliday = (date: Date, holidays: Holiday[]) => {
  const ymd = toYMD(date);
  return holidays.some((h) => sliceYMD(h.date) === ymd);
};

export function parseDateFlex(v?: string | Date | null): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  const s = String(v).trim();
  if (!s) return null;

  // 1) Intento directo (ISO u otros)
  const attempt = new Date(s);
  if (!Number.isNaN(attempt.getTime())) return attempt;

  // 2) dd/mm/yyyy [hh[:mm]]
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?)?$/.exec(s);
  if (m) {
    const [, dd, mm, yy, hh = '0', mi = '0'] = m;
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const month = Number(mm) - 1;
    const day = Number(dd);
    const hour = Number(hh);
    const min = Number(mi);
    const d = new Date(year, month, day, hour, min, 0);
    if (
      d.getFullYear() === year &&
      d.getMonth() === month &&
      d.getDate() === day
    ) return d;
  }

  return null;
}

export function toISODateTimeFlex(v?: string | Date | null): string {
  const d = parseDateFlex(v);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


export async function calcularFechaSolucion(): Promise<TZDate> {
  let restante = 4 * 60;
  let actual = new TZDate(new Date(), TIMEZONE);
  const holidays = await fetchHolidays();

  while (restante > 0) {
    const hora = actual.getHours();

    if (isSaturday(actual) || isSunday(actual) || isHoliday(actual, holidays)) {
      actual = new TZDate(
        new TZDate(
          actual.getFullYear(),
          actual.getMonth(),
          actual.getDate() + 1,
          WORK_START,
          0,
          0,
          TIMEZONE,
        ),
        TIMEZONE,
      );
      continue;
    }

    if (hora < WORK_START) {
      actual = new TZDate(
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate(),
        WORK_START,
        0,
        0,
        TIMEZONE,
      );
      continue;
    }

    if (hora >= WORK_END) {
      actual = new TZDate(
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate() + 1,
        WORK_START,
        0,
        0,
        TIMEZONE,
      );
      continue;
    }

    const minutosHastaFin = (WORK_END - hora) * 60 - actual.getMinutes();
    const aConsumir = Math.min(restante, minutosHastaFin);
    actual = new TZDate(addMinutes(actual, aConsumir), TIMEZONE);
    restante -= aConsumir;

    if (restante > 0) {
      actual = new TZDate(
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate() + 1,
        WORK_START,
        0,
        0,
        TIMEZONE,
      );
    }
  }

  return actual;
}

export async function pickTecnicoConMenosCasos(Usuarios: UsuariosSPService): Promise<UsuariosSP | null>{
  const tecnicos = await Usuarios.getAll({filter: "fields/Rol eq 'Tecnico' and fields/Disponible eq 'Disponible'", top: 50});

  console.table(tecnicos)

  if (!tecnicos || tecnicos.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let candidatos: UsuariosSP[] = [];

  for (const t of tecnicos) {
    const carga = Number(t.Numerodecasos ?? 0); 
    if (carga < min) {
      min = carga;
      candidatos = [t];
    } else if (carga === min) {
      candidatos.push(t);
    }
  }

  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)] ?? null;

  if (elegido) {
    //console.log(`Asignar a: ${elegido.Title} (casos activos: ${elegido.Numerodecasos ?? 0})`);
  }

  return elegido;
};

const getFileExtension = (file: File) => {
  const nameExtension = file.name.split(".").pop()?.trim().toLowerCase();
  if (nameExtension) return nameExtension;

  const mimeExtension = file.type.split("/").pop()?.trim().toLowerCase();
  return mimeExtension || "png";
};

export async function getPubliURLFromSupabase(bucket: string, path: string): Promise<{url: string}>{
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);

    if (!data?.publicUrl) {
      alert("No se ha podido obtener la URL pública")
      throw new Error("No se pudo obtener la URL pública de la imagen.");
    }

    return {
      url: data.publicUrl
    };
  };

export async function uploadImageToSupabase(file: File, bucket: string, path: string): Promise<{ok: boolean, url: string}>{
  const extension = getFileExtension(file);;
  const finalPath = `${path}.${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage
      .from(bucket)
      .upload(finalPath, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });

    if (error) {
      alert("Algo ha salido mal subiendo el archivo " + error.message)
      throw new Error(error.message || "No se pudo subir la imagen a Supabase.");
    }

    const data = await getPubliURLFromSupabase(bucket, finalPath)

    return {
      ok: true,
      url: data.url
    };
  };

type MailProps = {
  payload: GraphSendMailPayload;
  senderMail: string;
};

type MentionNotificationParams = {
  ticket: Pick<SolviTicket, "ticket_solvi_id" | "ticket_solvi_titulo">;
  authorName: string;
  authorEmail?: string | null;
  commentText: string;
  recipients: string[];
};

type ConversationCommentNotificationParams = {
  ticket: Pick<SolviTicket, "ticket_solvi_id" | "ticket_solvi_titulo">;
  authorName: string;
  authorEmail?: string | null;
  commentText: string;
  recipients: string[];
};

type ResolveSolviCommentNotificationRecipientsParams = {
  ticket: Pick<
    SolviTicket,
    | "ticket_solvi_correo_solicitante"
    | "ticket_solvi_correo_resolutor"
    | "ticket_solvi_id"
    | "ticket_solvi_titulo"
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


export async function sendMail({ payload, senderMail }: MailProps) {
  const sended = await fetch(
    "https://api-envio-correos-bchfaebqdhfcbdgw.canadacentral-01.azurewebsites.net/mail/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderMail,
        ...payload,
      }),
    }
  );

  //console.log(sended);
  return sended;
}

function normalizeEmails(emails: readonly string[]): string[] {
  return [...new Set(
    emails
      .map((email) => String(email ?? "").trim().toLowerCase())
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
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace('"', "&quot;")
    .replace("'", "&#39;");
}

function buildCommentSnippet(commentText: string): string {
  const trimmed = String(commentText ?? "").trim();
  const compact = trimmed.replace(/\s+/g, " ");
  const shortened = compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
  return escapeHtml(shortened || "Sin contenido");
}

function buildTicketUrl(ticketId: string | number | undefined): string {
  const baseUrl = "https://prisma.estudiodemoda.co/ticket";
  const safeTicketId = String(ticketId ?? "").trim();

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
      .map((userId) => lookup.get(userId) ?? "")
      .filter(Boolean),
  );
}

export function resolveSolviCommentNotificationRecipients(
  params: ResolveSolviCommentNotificationRecipientsParams,
): SolviCommentNotificationRecipients {
  const mentionRecipients = excludeEmails(
    findUserEmailsByIds(params.mentionedUserIds ?? [], params.users),
    [params.authorEmail ?? ""],
  );

  const participantRecipients = findUserEmailsByIds(params.participantUserIds ?? [], params.users);
  const baseConversationRecipients = normalizeEmails([
    params.ticket.ticket_solvi_correo_solicitante ?? "",
    params.ticket.ticket_solvi_correo_resolutor ?? "",
    params.ticket.ticket_solvi_correo_observador ?? "",
    ...participantRecipients,
  ]);

  const conversationRecipients = excludeEmails(baseConversationRecipients, [
    params.authorEmail ?? "",
    ...mentionRecipients,
  ]);

  return {
    mentionRecipients,
    conversationRecipients,
  };
}

export async function notifyConversationComment(
  params: ConversationCommentNotificationParams,
): Promise<void> {
  const to = buildRecipients(params.recipients);

  if (!to.length) {
    return;
  }

  const subject = `Nuevo comentario en el ticket ${params.ticket.ticket_solvi_id}`;
  const body = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
      <p>Hola,</p>
      <p>Se agrego un nuevo comentario en el ticket <strong>${escapeHtml(String(params.ticket.ticket_solvi_id ?? "-"))}</strong>.</p>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#f9fafb;">
        <p style="margin:0 0 8px 0;"><strong>Ticket:</strong> ${escapeHtml(String(params.ticket.ticket_solvi_titulo ?? "Sin asunto"))}</p>
        <p style="margin:0 0 8px 0;"><strong>Autor:</strong> ${escapeHtml(params.authorName)}${params.authorEmail ? ` (${escapeHtml(params.authorEmail)})` : ""}</p>
        <p style="margin:0;"><strong>Comentario:</strong><br>${buildCommentSnippet(params.commentText)}</p>
      </div>
      ${buildOpenTicketButton(params.ticket.ticket_solvi_id)}
      <p style="margin-top:16px;">Este es un mensaje automatico, por favor no respondas.</p>
    </div>
  `.trim();

  await sendMail({
    payload: {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: to,
      },
    },
    senderMail: "listo@estudiodemoda.com.co",
  });
}

export async function notifyCommentMention(
  params: MentionNotificationParams,
): Promise<void> {
  const to = buildRecipients(params.recipients);

  if (!to.length) {
    return;
  }

  const subject = `Te mencionaron en el ticket ${params.ticket.ticket_solvi_id}`;
  const body = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
      <p>Hola,</p>
      <p><strong>${escapeHtml(params.authorName)}</strong>${params.authorEmail ? ` (${escapeHtml(params.authorEmail)})` : ""} te menciono en el ticket <strong>${escapeHtml(String(params.ticket.ticket_solvi_id ?? "-"))}</strong>.</p>
      <div style="border:1px solid #dbeafe;border-radius:12px;padding:16px;background:#eff6ff;">
        <p style="margin:0 0 8px 0;"><strong>Asunto:</strong> ${escapeHtml(String(params.ticket.ticket_solvi_titulo ?? "Sin asunto"))}</p>
        <p style="margin:0;"><strong>Comentario:</strong><br>${buildCommentSnippet(params.commentText)}</p>
      </div>
      ${buildOpenTicketButton(params.ticket.ticket_solvi_id)}
      <p style="margin-top:16px;">Este es un mensaje automatico, por favor no respondas.</p>
    </div>
  `.trim();

  await sendMail({
    payload: {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: to,
      },
    },
    senderMail: "listo@estudiodemoda.com.co",
  });
}

type NotifySolviCommentActivityParams = {
  ticket: Pick<
    SolviTicket,
    | "ticket_solvi_correo_resolutor"
    | "ticket_solvi_correo_solicitante"
    | "ticket_solvi_id"
    | "ticket_solvi_titulo"
  > & {
    ticket_solvi_correo_observador?: string | null;
  };
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
  const body = `
    <p>¡Hola ${ticket.ticket_solvi_solicitante ?? ""}!<br><br>
    Tu solicitud ha sido registrada exitosamente y ha sido asignada a un técnico para su gestión. Estos son los detalles del caso:<br><br>
    <strong>ID del Caso:</strong> ${ticket.ticket_solvi_id}<br>
    <strong>Espacio fisico:</strong> ${ticket.ticket_solvi_titulo}<br>
    <strong>Resolutor asignado:</strong> ${ticket.ticket_solvi_correo_resolutor ?? "—"}<br>
    <strong>Fecha máxima de solución:</strong> ${toISODateTimeFlex(ticket.ticket_solvi_fechamaxima) ?? "No aplica"}<br><br>
    El resolutor asignado se pondrá en contacto contigo en el menor tiempo posible para darte solución a tu requerimiento.<br><br>
    Este es un mensaje automático, por favor no respondas.
    </p>
  `.trim();

  const address = (ticket.ticket_solvi_correo_solicitante?? "").trim();

  if (!address) {
    throw new Error("notifyTicketCreatedSolicitante: correo del solicitante inválido");
  }

  const to: GraphRecipient[] = [
    {
      emailAddress: { address },
    },
  ];

  await sendMail({
    payload: {
      message: {
        subject: `Asignación de Caso - ${ticket.ticket_solvi_id}`,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: to,
      },
    },
    senderMail: "listo@estudiodemoda.com.co",
  });
}

export async function notifyTicketCreatedResolutor(ticket: SolviTicket): Promise<void> {
  const body = `
    <p>¡Hola!<br><br>
    Tienes un nuevo caso asignado con estos detalles:<br><br>
    <strong>ID del Caso:</strong> ${ticket.ticket_solvi_id}<br>
    <strong>Solicitante:</strong> ${ticket.ticket_solvi_solicitante ?? "—"}<br>
    <strong>Correo del Solicitante:</strong> ${ticket.ticket_solvi_correo_solicitante ?? "—"}<br>
    <strong>Asunto:</strong> ${ticket.ticket_solvi_titulo}<br>
    <strong>Fecha máxima de solución:</strong> ${ticket.ticket_solvi_fechamaxima}<br><br>
    Por favor, contacta al usuario para brindarle solución.<br><br>
    Este es un mensaje automático, por favor no respondas.
    </p>
  `.trim();

  if (!ticket.ticket_solvi_correo_resolutor) {
    throw new Error("notifyTicketCreatedResolutor: correo del resolutor inválido");
  }

  const to: GraphRecipient[] = [
    {
      emailAddress: { address: ticket.ticket_solvi_correo_resolutor },
    },
  ];

  await sendMail({
    payload: {
      message: {
        subject: `Nuevo caso asignado - ${ticket.ticket_solvi_id}`,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: to,
      },
    },
    senderMail: "listo@estudiodemoda.com.co",
  });
}


function cleanState(user?: UserProfile | null): SolviTicket {
  return {
    FechaCierreReal: null,
    ticket_solvi_ans: null,
    ticket_solvi_articulo: null,
    ticket_solvi_categoria: null,
    ticket_solvi_correo_resolutor: null,
    ticket_solvi_correo_solicitante: user?.User_Email ?? '',
    ticket_solvi_descripcion: '',
    ticket_solvi_estado: 'En Atención',
    ticket_solvi_fechaapertura: new Date(),
    ticket_solvi_fechamaxima: null,
    ticket_solvi_fuente: 'Aplicación',
    ticket_solvi_resolutor: null,
    ticket_solvi_solicitante: user?.User_Name ?? '',
    ticket_solvi_subcategoria: null,
    ticket_solvi_titulo: '',
  };
}

type UseSolviActionsResult = {
  state: SolviTicket;
  setState: React.Dispatch<React.SetStateAction<SolviTicket>>;
  loading: boolean;
  graphService: GraphRest;
  tecnicosService: UsuariosSPService;
  saveTicket: (titulo: string, descripcion: string, archivos: File[]) => Promise<boolean>;
  uploadSolviAttachment(file: File, ticketId: number): Promise<{ok: boolean, url: string}>;
};

export function useSolviActionsTickets(user?: UserProfile | null): UseSolviActionsResult {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const tecnicosService = React.useMemo(
    () => new UsuariosSPService(graphService),
    [graphService],
  );

  const [state, setState] = React.useState<SolviTicket>(() => cleanState(user));
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setState(cleanState(user));
  }, [user]);

  const uploadSolviAttachment = React.useCallback(async (file: File, ticketId: number) => {
    setLoading(true);
    try {
      const result = await uploadImageToSupabase(file, TICKETS_ATTACHMENTS_BUCKET, `/${ticketId}/Creacion/${file.name}`);
      await supabase
        .from("TBL_Ticket_Attachments_Solvi")
        .insert({
          attachment_path: result.url,
          attachment_type: "Creacion",
          created_at: new Date().toISOString(),
          file_name: file.name,
          id_ticket: Number(ticketId),
          storage_bucket: TICKETS_ATTACHMENTS_BUCKET
        })
        .select()
        .single();
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveTicket = React.useCallback(async (titulo: string, descripcion: string, archivos: File[]): Promise<boolean> => {
    if (!user) {
      throw new Error('El usuario actual aún no está disponible.');
    }

    setLoading(true);
    try {
      const fechaMaxima = await calcularFechaSolucion();
      const resolutor = await pickTecnicoConMenosCasos(tecnicosService)
      const payload: SolviTicket = {
        ...state,
        ticket_solvi_fechamaxima: fechaMaxima.toISOString(),
        ticket_solvi_correo_resolutor: resolutor?.Correo ?? "",
        ticket_solvi_resolutor: resolutor?.Title ?? "",
        ticket_solvi_titulo: titulo,
        ticket_solvi_descripcion: descripcion,
      };

      const { error, data: ticketCreated} = await supabase.from('TBL_Ticket_Solvi').insert(payload).select("*").maybeSingle();

      if(archivos.length > 0){
        await Promise.all(
          archivos.map(async (file) => {
              await uploadSolviAttachment(file, ticketCreated?.ticket_solvi_id ?? 0)
            }
          )
        )
      }

      cleanState(user)

      //console.log(ticketCreated);
      if (resolutor) {
        const casosActuales = Number(resolutor.Numerodecasos ?? 0); // ← default 0 ANTES de Number()
        const nuevoTotal = casosActuales + 1;
        await tecnicosService.update(String(resolutor.Id), {Numerodecasos: nuevoTotal,});
      }

      if (ticketCreated?.ticket_solvi_correo_resolutor) {

          try {
            await notifyTicketCreatedSolicitante(ticketCreated)
          } catch (err) {
            console.error("[Flow] Error enviando a solicitante:", err);
          }
        }

      // Notificar resolutor    
      if (ticketCreated?.ticket_solvi_correo_resolutor) {

        try {
          await notifyTicketCreatedResolutor(ticketCreated)
        } catch (err) {
          console.error("[Flow] Error enviando a resolutor:", err);
        }
      }

      if (error) throw error;

      return true
    } finally {
      setLoading(false);
    }
  }, [state]);


  return {
    state,
    setState,
    loading,
    graphService,
    tecnicosService,
    saveTicket,
    uploadSolviAttachment
  };
}
