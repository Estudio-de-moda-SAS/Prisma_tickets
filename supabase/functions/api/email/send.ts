import type { DB } from '../lib/supabase.ts';

const MAIL_API_URL   = Deno.env.get('MAIL_API_URL')   ?? '';
const MAIL_API_TOKEN = Deno.env.get('MAIL_API_TOKEN') ?? '';
const MAIL_SENDER    = Deno.env.get('MAIL_SENDER')    ?? '';

// Poné en true SOLO cuando el dueño de la API confirme que:
//  (a) el endpoint acepta message.internetMessageHeaders, y
//  (b) devuelve el internetMessageId en la respuesta.
// Mientras esté en false: se envía sin headers de reply (agrupación best-effort por subject).
const MAIL_SUPPORTS_REPLY_HEADERS = true;

export function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

type Recipient = { User_ID: number; User_Email: string };

export async function sendEventEmail(
  supabase: DB,
  params: {
    eventKey:  string;
    requestId: string;
    userIds:   number[];
    vars:      Record<string, string>;
    cc?:       string[];
  },
): Promise<void> {
  // El correo NUNCA debe romper la acción principal.
  try {
    if (!MAIL_API_URL || !MAIL_SENDER) {
      //console.warn('[email] MAIL_API_URL / MAIL_SENDER sin configurar — se omite envío');
      return;
    }
    if (params.userIds.length === 0) return;

    // 1. Template activo para el evento (Event_Key es UNIQUE global en tu tabla)
    const { data: tpl } = await supabase
      .from('TBL_Email_Templates')
      .select('Email_Template_ID, Email_Template_Name, Email_Template_Subject, Email_Template_Body_html')
      .eq('Email_Template_Event_Key', params.eventKey)
      .eq('Email_Template_Is_Active', true)
      .maybeSingle();
    if (!tpl) {
      //console.warn(`[email] sin template activo para Event_Key="${params.eventKey}" — no se envía nada`);
      return;
    }

    // 2. Destinatarios con correo válido
    const { data: users } = await supabase
      .from('TBL_Users')
      .select('User_ID, User_Email')
      .in('User_ID', params.userIds);
    const recipients = (users ?? []).filter((u: any) => !!u.User_Email) as Recipient[];
    if (recipients.length === 0) return;

    const subject = renderTemplate((tpl as any).Email_Template_Subject,   params.vars);
    const html    = renderTemplate((tpl as any).Email_Template_Body_html, params.vars);
    const nowIso  = new Date().toISOString();

    // 3. Un envío por destinatario (hilo propio por bandeja, sin exponer direcciones)
    for (const r of recipients) {
      let inReplyTo: string | null = null;
      let references: string | null = null;

      if (MAIL_SUPPORTS_REPLY_HEADERS) {
        const { data: last } = await supabase
          .from('TBL_Email_Logs')
          .select('Email_Log_Provider_Msg_ID, Email_Log_References')
          .eq('Email_Log_Request_ID', params.requestId)
          .eq('Email_Log_Sent_To', r.User_ID)
          .not('Email_Log_Provider_Msg_ID', 'is', null)
          .order('Email_Log_Sent_At', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.Email_Log_Provider_Msg_ID) {
          inReplyTo  = last.Email_Log_Provider_Msg_ID;
          references = [last.Email_Log_References, last.Email_Log_Provider_Msg_ID]
            .filter(Boolean).join(' ');
        }
      }

      const message: Record<string, unknown> = {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: r.User_Email } }],
      };
      if (params.cc?.length) {
        message.ccRecipients = params.cc.map((a) => ({ emailAddress: { address: a } }));
      }
      if (MAIL_SUPPORTS_REPLY_HEADERS && inReplyTo) {
        message.internetMessageHeaders = [
          { name: 'In-Reply-To', value: `<${inReplyTo}>` },
          { name: 'References',
            value: (references ?? '').split(' ').filter(Boolean).map((id) => `<${id}>`).join(' ') },
        ];
      }

      let providerMsgId: string | null = null;
      let status: 'sent' | 'error' = 'sent';
      let errText: string | null = null;

      try {
        const res = await fetch(MAIL_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(MAIL_API_TOKEN ? { Authorization: `Bearer ${MAIL_API_TOKEN}` } : {}),
          },
          body: JSON.stringify({ senderMail: MAIL_SENDER, message, saveToSentItems: true }),
        });
const rawText = await res.text();
        let json: any = {};
        try { json = JSON.parse(rawText); } catch { /* respuesta no-JSON */ }

        if (!res.ok || json.ok === false) {
          status  = 'error';
          errText = json.message ?? `HTTP ${res.status}: ${rawText.slice(0, 500)}`;
        } else {
          providerMsgId = json.graph?.internetMessageId ?? json.graph?.id ?? null;
        }
        } catch (e) {
        status  = 'error';
        errText = String(e);
      }

      await supabase.from('TBL_Email_Logs').insert({
        Email_Log_Request_ID:      params.requestId,
        Email_Log_Sent_To:         r.User_ID,
        Email_Log_Template_Name:   (tpl as any).Email_Template_Name,
        Email_Log_Event_Key:       params.eventKey,   // estable aunque renombren el template
        Email_Log_Subject_Sent:    subject,
        Email_Log_Body_Sent:       html,
        Email_Log_Status:          status,
        Email_Log_Sent_At:         nowIso,
        Email_Log_Provider_Msg_ID: providerMsgId,
        Email_Log_In_Reply_To:     inReplyTo,
        Email_Log_References:      references,   // cadena SIN el id propio; el próximo envío lo suma
        Email_Log_Error:          errText,
      });
    }
  } catch (e) {
    console.error('[email] sendEventEmail falló:', e);
  }
}