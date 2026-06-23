import type { DB } from '../lib/supabase.ts';

export function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

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