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
// @ts-ignore
import { solviHandlers } from './handlers/solvi.ts';
// @ts-ignore
import { historyHandlers } from './handlers/history.ts';

/**
 * Router central de acciones.
 *
 * Agrega todos los mapas de handlers por dominio (requests, cierre, feedback,
 * criterios, usuarios, etc.) en una única tabla `action → handler` y expone
 * {@link createDispatch}, que construye la función de despacho usada por el
 * entry point y por los propios handlers.
 *
 * @module router
 */

/**
 * Tabla combinada de todos los handlers, indexados por nombre de acción.
 *
 * @remarks
 * Se arma con *spread* de cada mapa de dominio. El orden importa ante colisiones:
 * si dos módulos definen la misma clave de acción, gana el último en fusionarse.
 */
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
  ...solviHandlers,
  ...historyHandlers,
};

/**
 * Crea la función de despacho ligada a un cliente de Supabase.
 *
 * @remarks
 * La `dispatch` resultante busca el handler por nombre de acción y lo invoca con
 * el `payload` y un {@link ActionContext} que incluye el `supabase` recibido y la
 * propia `dispatch` (referencia recursiva), de modo que un handler pueda invocar
 * otras acciones. Si la acción no existe, lanza un error.
 *
 * @param supabase - Cliente de Supabase que se inyecta en el contexto de cada handler.
 * @returns La función {@link Dispatch} lista para ejecutar acciones.
 * @throws Al despachar una acción desconocida (`Acción desconocida: <action>`).
 */
export function createDispatch(supabase: DB): Dispatch {
  const dispatch: Dispatch = (action, payload) => {
    const handler = handlers[action];
    if (!handler) throw new Error(`[API] Acción desconocida: ${action}`);
    return handler(payload, { supabase, dispatch });
  };
  return dispatch;
}