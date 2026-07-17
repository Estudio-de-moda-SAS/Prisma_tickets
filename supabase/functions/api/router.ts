import type { ActionHandler, Dispatch } from './shared/types.ts';
import type { DB } from './lib/supabase.ts';
// @ts-ignore
import { requestHandlers }          from './handlers/requests.ts';
// @ts-ignore
import { closureHandlers }          from './handlers/closure.ts';
// @ts-ignore
import { feedbackHandlers }         from './handlers/feedback.ts';
// @ts-ignore
import { criteriaHandlers }         from './handlers/criteria.ts';
// @ts-ignore
import { userHandlers }             from './handlers/users.ts';
// @ts-ignore
import { orgUnitHandlers }          from './handlers/orgUnits.ts';
// @ts-ignore
import { boardTeamHandlers }        from './handlers/boardTeams.ts';
// @ts-ignore
import { columnHandlers }           from './handlers/columns.ts';
// @ts-ignore
import { labelHandlers }            from './handlers/labels.ts';
// @ts-ignore
import { templateHandlers }         from './handlers/templates.ts';
// @ts-ignore
import { subTeamHandlers }          from './handlers/subteams.ts';
// @ts-ignore
import { sprintHandlers }           from './handlers/sprints.ts';
// @ts-ignore
import { assignmentHandlers }       from './handlers/assignments.ts';
// @ts-ignore
import { commentHandlers }          from './handlers/comments.ts';
// @ts-ignore
import { attachmentHandlers }       from './handlers/attachments.ts';
// @ts-ignore
import { notificationHandlers }     from './handlers/notifications.ts';
// @ts-ignore
import { emailTemplateHandlers }    from './handlers/emailTemplates.ts';
// @ts-ignore
import { announcementHandlers }     from './handlers/announcements.ts';
// @ts-ignore
import { automationRuleHandlers }   from './handlers/automationRules.ts';
// @ts-ignore
import { teamColumnConfigHandlers } from './handlers/teamColumnConfig.ts';
// @ts-ignore
import { systemHandlers }           from './handlers/system.ts';
// @ts-ignore
import { exportJobHandlers }        from './handlers/exportJobs.ts';
// @ts-ignore
import { migrationHandlers } from './handlers/migration.ts';
// @ts-ignore
import { resolutionRatingHandlers } from './handlers/resolutionRatings.ts';

const handlers: Record<string, ActionHandler> = {
  ...requestHandlers,
  ...closureHandlers,
  ...feedbackHandlers,
  ...criteriaHandlers,
  ...userHandlers,
  ...orgUnitHandlers,
  ...boardTeamHandlers,
  ...columnHandlers,
  ...labelHandlers,
  ...templateHandlers,
  ...subTeamHandlers,
  ...sprintHandlers,
  ...assignmentHandlers,
  ...commentHandlers,
  ...attachmentHandlers,
  ...notificationHandlers,
  ...emailTemplateHandlers,
  ...announcementHandlers,
  ...automationRuleHandlers,
  ...teamColumnConfigHandlers,
  ...systemHandlers,
  ...exportJobHandlers,
  ...migrationHandlers,
  ...resolutionRatingHandlers,
};

export function createDispatch(supabase: DB): Dispatch {
  const dispatch: Dispatch = (action, payload) => {
    const handler = handlers[action];
    if (!handler) throw new Error(`[API] Acción desconocida: ${action}`);
    return handler(payload, { supabase, dispatch });
  };
  return dispatch;
}