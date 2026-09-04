import type { DB } from '../lib/supabase.ts';

/**
 * Envío (registro) de correos por evento a partir de plantillas.
 *
 * Expone {@link renderTemplate} para interpolar variables en una plantilla y
 * {@link sendEventEmail} para resolver la plantilla activa de un evento y
 * registrar un correo por destinatario.
 *
 * @module email
 */

/**
 * Interpola variables `{{clave}}` en una plantilla de texto/HTML.
 *
 * @remarks
 * Reemplaza cada marcador `{{clave}}` por `vars[clave]`; si la clave no existe,
 * usa cadena vacía. Solo reconoce claves alfanuméricas (`\w+`).
 *
 * @param html - Plantilla con marcadores `{{clave}}`.
 * @param vars - Mapa de variables a interpolar.
 * @returns La plantilla con las variables sustituidas.
 */
export function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Resuelve la plantilla activa de un evento y registra un correo por cada destinatario.
 *
 * @remarks
 * Busca la plantilla activa (`Is_Active`) asociada al `eventKey`, resuelve los
 * correos de los usuarios indicados, interpola asunto y cuerpo con `vars`
 * ({@link renderTemplate}) e inserta una fila en `TBL_Email_Logs` por cada uno.
 *
 * Actualmente el estado se registra como `pending`: la función deja el correo
 * *logueado* pero el envío real aún no está activado (ver comentario en el
 * cuerpo). Sale temprano y sin error si no hay destinatarios, si no existe
 * plantilla activa, o si no se resuelve ningún usuario.
 *
 * @param supabase - Cliente de Supabase.
 * @param params - Parámetros del evento.
 * @param params.eventKey - Clave del evento que selecciona la plantilla.
 * @param params.requestId - Request asociado al correo (se guarda en el log).
 * @param params.userIds - IDs de los usuarios destinatarios.
 * @param params.vars - Variables para interpolar en asunto y cuerpo.
 */
export async function sendEventEmail(
  supabase: DB,
  params: {
    eventKey:  string;
    requestId: string;
    userIds:   number[];
    vars:      Record<string, string>;
  },
): Promise<void> {
  if (params.userIds.length === 0) return;

  const { data: tpl } = await supabase
    .from('TBL_Email_Templates')
    .select('Email_Template_ID, Email_Template_Name, Email_Template_Subject, Email_Template_Body_html')
    .eq('Email_Template_Event_Key', params.eventKey)
    .eq('Email_Template_Is_Active', true)
    .single();

  if (!tpl) return;

  const { data: users } = await supabase
    .from('TBL_Users')
    .select('User_ID, User_Email')
    .in('User_ID', params.userIds);

  if (!users || users.length === 0) return;

  const subject  = renderTemplate((tpl as any).Email_Template_Subject, params.vars);
  const htmlBody = renderTemplate((tpl as any).Email_Template_Body_html, params.vars);

  for (const user of users as { User_ID: number; User_Email: string }[]) {
    const status = 'pending'; // cambiar a variable cuando actives el envío real

    await supabase.from('TBL_Email_Logs').insert({
      Email_Log_Request_ID:    params.requestId,
      Email_Log_Sent_To:       user.User_ID,
      Email_Log_Template_Name: (tpl as any).Email_Template_Name,
      Email_Log_Subject_Sent:  subject,
      Email_Log_Body_Sent:     htmlBody,
      Email_Log_Status:        status,
      Email_Log_Sent_At:       new Date().toISOString(),
    });
  }
}