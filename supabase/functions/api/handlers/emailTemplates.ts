/**
 * Handlers CRUD de plantillas de correo (`TBL_Email_Templates`).
 *
 * Registrados en {@link emailTemplateHandlers} y despachados desde el Edge
 * Function único vía el envelope `{ action, payload }`. Cada plantilla está
 * asociada a un board y a un `event_key` único (p. ej. `ticket_recibido`,
 * `assignRequest`), con cuerpos HTML/texto que soportan interpolación de
 * variables `{{variable}}`.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de plantillas de correo indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const emailTemplateHandlers: Record<string, ActionHandler> = {
  /**
   * Lista las plantillas de correo de un board.
   *
   * @param payload - `{ boardId }`.
   * @returns Las plantillas del board ordenadas por ID ascendente.
   */
  fetchEmailTemplates: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Email_Templates')
      .select(`
        Email_Template_ID,
        Email_Template_Name,
        Email_Template_Subject,
        Email_Template_Body_html,
        Email_Template_Body_Text,
        Email_Template_Event_Key,
        Email_Template_Is_Active,
        Email_Template_Variables,
        Email_Template_Updated_At
      `)
      .eq('Email_Template_Board_ID', boardId)
      .order('Email_Template_ID', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Actualiza el contenido (asunto, HTML y texto) de una plantilla.
   *
   * Refresca `Email_Template_Updated_At`. Para editar nombre/variables sin
   * tocar el cuerpo, ver {@link emailTemplateHandlers.updateEmailTemplateMetadata}.
   *
   * @param payload - `{ id, subject, html, text }`.
   * @returns `{ ok: true }` tras actualizar.
   */
  updateEmailTemplate: async (payload, { supabase }) => {
    const p = payload as {
      id:      number;
      subject: string;
      html:    string;
      text:    string;
    };
    const { error } = await supabase
      .from('TBL_Email_Templates')
      .update({
        Email_Template_Subject:     p.subject,
        Email_Template_Body_html:   p.html,
        Email_Template_Body_Text:   p.text,
        Email_Template_Updated_At:  new Date().toISOString(),
      })
      .eq('Email_Template_ID', p.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Activa o desactiva una plantilla sin eliminarla.
   *
   * Una plantilla inactiva hace que su evento asociado no dispare correo.
   *
   * @param payload - `{ id, isActive }`.
   * @returns `{ ok: true }` tras actualizar el estado.
   */
  toggleEmailTemplate: async (payload, { supabase }) => {
    const { id, isActive } = payload as { id: number; isActive: boolean };
    const { error } = await supabase
      .from('TBL_Email_Templates')
      .update({ Email_Template_Is_Active: isActive })
      .eq('Email_Template_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Crea una plantilla nueva (activa, con cuerpos vacíos) para un event key.
   *
   * Valida que el `eventKey` no esté ya en uso —es único a nivel global— y
   * lanza error si existe. Los cuerpos HTML/texto se inicializan vacíos para
   * completarse luego vía {@link emailTemplateHandlers.updateEmailTemplate}.
   *
   * @param payload - `{ boardId, name, eventKey, subject, variables }`.
   * @returns La plantilla creada.
   * @throws Si ya existe una plantilla con el mismo `eventKey`.
   */
  createEmailTemplate: async (payload, { supabase }) => {
    const p = payload as {
      boardId:   number;
      name:      string;
      eventKey:  string;
      subject:   string;
      variables: string[];
    };

    const { data: existing } = await supabase
      .from('TBL_Email_Templates')
      .select('Email_Template_ID')
      .eq('Email_Template_Event_Key', p.eventKey)
      .maybeSingle();
    if (existing) throw new Error(`Ya existe un template con el event key "${p.eventKey}"`);

    const { data, error } = await supabase
      .from('TBL_Email_Templates')
      .insert({
        Email_Template_Board_ID:   p.boardId,
        Email_Template_Name:       p.name,
        Email_Template_Subject:    p.subject,
        Email_Template_Body_html:  '',
        Email_Template_Body_Text:  '',
        Email_Template_Event_Key:  p.eventKey,
        Email_Template_Is_Active:  true,
        Email_Template_Variables:  p.variables,
        Email_Template_Created_At: new Date().toISOString(),
        Email_Template_Updated_At: new Date().toISOString(),
      })
      .select(`
        Email_Template_ID, Email_Template_Name, Email_Template_Subject,
        Email_Template_Body_html, Email_Template_Body_Text,
        Email_Template_Event_Key, Email_Template_Is_Active,
        Email_Template_Variables, Email_Template_Updated_At
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Elimina una plantilla de correo de forma permanente.
   *
   * @param payload - `{ id }`.
   * @returns `{ ok: true }` tras eliminar la plantilla.
   */
  deleteEmailTemplate: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    const { error } = await supabase
      .from('TBL_Email_Templates')
      .delete()
      .eq('Email_Template_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Actualiza los metadatos de una plantilla (nombre, asunto y variables).
   *
   * A diferencia de {@link emailTemplateHandlers.updateEmailTemplate}, no toca
   * los cuerpos HTML/texto.
   *
   * @param payload - `{ id, name, subject, variables }`.
   * @returns `{ ok: true }` tras actualizar.
   */
  updateEmailTemplateMetadata: async (payload, { supabase }) => {
    const p = payload as {
      id:        number;
      name:      string;
      subject:   string;
      variables: string[];
    };
    const { error } = await supabase
      .from('TBL_Email_Templates')
      .update({
        Email_Template_Name:      p.name,
        Email_Template_Subject:   p.subject,
        Email_Template_Variables: p.variables,
        Email_Template_Updated_At: new Date().toISOString(),
      })
      .eq('Email_Template_ID', p.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};