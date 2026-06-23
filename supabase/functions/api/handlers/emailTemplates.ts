import type { ActionHandler } from '../shared/types.ts';

export const emailTemplateHandlers: Record<string, ActionHandler> = {
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

  toggleEmailTemplate: async (payload, { supabase }) => {
    const { id, isActive } = payload as { id: number; isActive: boolean };
    const { error } = await supabase
      .from('TBL_Email_Templates')
      .update({ Email_Template_Is_Active: isActive })
      .eq('Email_Template_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

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

  deleteEmailTemplate: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    const { error } = await supabase
      .from('TBL_Email_Templates')
      .delete()
      .eq('Email_Template_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

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
