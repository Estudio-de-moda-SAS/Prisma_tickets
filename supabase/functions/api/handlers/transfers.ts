/**
 * Handlers de transferencia de tickets entre equipos.
 *
 * Una única acción, `transferTicket`, cubre los cuatro recorridos posibles
 * según el origen (`source`) y el tipo del equipo destino:
 *
 * | Origen    | Destino        | Función                    |
 * |-----------|----------------|----------------------------|
 * | `request` | equipo PRISMA  | {@link transferRequestToTeam}  |
 * | `request` | SOLVI          | {@link transferRequestToSolvi} (crea el ticket SOLVI y elimina la solicitud) |
 * | `solvi`   | equipo PRISMA  | {@link transferSolviToTeam}    |
 * | `solvi`   | SOLVI          | rechazado (ya está en SOLVI)   |
 *
 * La validación común (payload, equipo destino activo, motivo) vive en
 * `transferTicket`; cada recorrido resuelve sus particularidades marcadas con
 * `TODO(transfer)`. Los recorridos aún no implementados lanzan error para que
 * el front nunca reciba un éxito falso.
 *
 * @module
 */
import type { ActionHandler, Dispatch } from '../shared/types.ts';
import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { logHistory } from '../lib/history.ts';

/** Clave de integración del equipo SOLVI en `TBL_Board_Teams`. */
const SOLVI_INTEGRATION_KEY = 'solvi';

/** Valores fijos del ticket SOLVI creado al transferir desde PRISMA. */
const SOLVI_DEFAULTS = {
  fuente:          'Aplicativo',
  estado:          'En Atención',
  resolutor:       'Alexander Garcia Palacio',
  correoResolutor: 'agarcia@estudiodemoda.com.co',
} as const;

/** Payload de `transferTicket`. */
export type TransferTicketPayload = {
  /** Sistema del que proviene el ticket. */
  source:   'request' | 'solvi';
  /** `Request_ID` (PRISMA) o `ticket_solvi_id` (SOLVI). */
  ticketId: string | number;
  /** `Board_Team_ID` del equipo destino. */
  toTeamId: number;
  /** Motivo de la transferencia (obligatorio). */
  reason:   string;
  /** Si se debe notificar al solicitante y al equipo destino. */
  notify:   boolean;
  /** Usuario PRISMA que ejecuta la transferencia. */
  actorId:  number;
};

/** Resultado de `transferTicket`. */
export type TransferTicketResult = {
  ok:         true;
  source:     TransferTicketPayload['source'];
  ticketId:   string | number;
  fromTeamId: number | null;
  toTeamId:   number;
  /** ID de la solicitud PRISMA resultante cuando el origen es SOLVI. */
  createdRequestId?: string | null;
  /** ID del ticket SOLVI resultante cuando el destino es SOLVI. */
  createdSolviTicketId?: number | null;
};

/** Equipo destino tal como se lee de `TBL_Board_Teams`. */
type TargetTeam = {
  Board_Team_ID:              number;
  Board_Team_Name:            string;
  Board_Team_Is_Active:       boolean;
  Board_Team_Is_Integration:  boolean;
  Board_Team_Integration_Key: string | null;
};

type TransferContext = {
  supabase: DB;
  dispatch: Dispatch;
  payload:  TransferTicketPayload;
  target:   TargetTeam;
};

/**
 * Valida y normaliza el payload crudo.
 *
 * @throws Si falta algún campo obligatorio o tiene un formato inválido.
 */
function parsePayload(raw: Record<string, unknown>): TransferTicketPayload {
  const { source, ticketId, toTeamId, reason, notify, actorId } = (raw ?? {}) as Partial<TransferTicketPayload>;
  if (source !== 'request' && source !== 'solvi') throw new Error('transferTicket: `source` debe ser "request" o "solvi".');
  if (ticketId == null || ticketId === '')        throw new Error('transferTicket: falta `ticketId`.');
  if (typeof toTeamId !== 'number')               throw new Error('transferTicket: falta `toTeamId`.');
  if (typeof actorId !== 'number')                throw new Error('transferTicket: falta `actorId`.');
  const cleanReason = String(reason ?? '').trim();
  if (!cleanReason)                               throw new Error('transferTicket: el motivo es obligatorio.');
  return { source, ticketId, toTeamId, reason: cleanReason, notify: notify !== false, actorId };
}

/** Lee el equipo destino y verifica que exista y esté activo. */
async function loadTargetTeam(supabase: DB, teamId: number): Promise<TargetTeam> {
  const { data, error } = await supabase
    .from('TBL_Board_Teams')
    .select('Board_Team_ID, Board_Team_Name, Board_Team_Is_Active, Board_Team_Is_Integration, Board_Team_Integration_Key')
    .eq('Board_Team_ID', teamId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`transferTicket: el equipo destino ${teamId} no existe.`);
  const team = data as TargetTeam;
  if (!team.Board_Team_Is_Active) throw new Error(`transferTicket: el equipo destino "${team.Board_Team_Name}" está inactivo.`);
  return team;
}

function isSolviTeam(team: TargetTeam): boolean {
  return team.Board_Team_Is_Integration && team.Board_Team_Integration_Key === SOLVI_INTEGRATION_KEY;
}

/* ─── Recorridos ───────────────────────────────────────────────────────────── */

/**
 * Solicitud PRISMA → otro equipo PRISMA.
 *
 * Base implementada: reemplaza el equipo en `TBL_Request_Team` y deja la
 * traza en el historial (como `field_update` de `equipoIds`, con el motivo en
 * `metadata`).
 */
async function transferRequestToTeam({ supabase, payload, target }: TransferContext): Promise<TransferTicketResult> {
  const requestId = String(payload.ticketId);

  const { data: req, error: reqErr } = await supabase
    .from('TBL_Requests').select('Request_ID').eq('Request_ID', requestId).maybeSingle();
  if (reqErr) throw new Error(reqErr.message);
  if (!req)   throw new Error(`transferTicket: la solicitud ${requestId} no existe.`);

  const { data: teamRows, error: teamErr } = await supabase
    .from('TBL_Request_Team').select('Request_Team_ID').eq('Request_Team_Request_ID', requestId);
  if (teamErr) throw new Error(teamErr.message);
  const beforeTeamIds = ((teamRows ?? []) as { Request_Team_ID: number }[]).map((r) => r.Request_Team_ID);
  const fromTeamId    = beforeTeamIds[0] ?? null;

  if (beforeTeamIds.length === 1 && fromTeamId === target.Board_Team_ID) {
    throw new Error('transferTicket: la solicitud ya pertenece a ese equipo.');
  }

  const { error: delErr } = await supabase.from('TBL_Request_Team').delete().eq('Request_Team_Request_ID', requestId);
  if (delErr) throw new Error(delErr.message);
  const { error: insErr } = await supabase.from('TBL_Request_Team').insert({
    Request_Team_Request_ID: requestId,
    Request_Team_ID:         target.Board_Team_ID,
  });
  if (insErr) throw new Error(insErr.message);

  const {error: updateErr} = await supabase
    .from("TBL_Requests")
    .update({Request_Board_Column_ID: 1})
    .eq("Request_ID", requestId)
  if (updateErr) throw new Error(updateErr.message);

  // TODO(transfer): validar que `actorId` tenga acceso al equipo de origen (shared/boardAccess.ts).
  // TODO(transfer): columna destino (¿columna inicial del equipo nuevo?).
  // TODO(transfer): sub-equipos y asignados del equipo anterior.
  // TODO(transfer): etiquetas y sprint ligados al equipo anterior.

  await logHistory(supabase, {
    requestId,
    changedBy: payload.actorId,
    action:    'field_update',
    field:     'equipoIds',
    oldValue:  beforeTeamIds,
    newValue:  [target.Board_Team_ID],
    metadata:  { kind: 'team_transfer', reason: payload.reason, toTeamName: target.Board_Team_Name },
  });

  if (payload.notify) {
    // TODO(transfer): notificar al solicitante y al equipo destino (best-effort, try/catch).
  }

  return { ok: true, source: 'request', ticketId: requestId, fromTeamId, toTeamId: target.Board_Team_ID };
}

/**
 * Solicitud PRISMA → SOLVI.
 *
 * Crea el ticket en `TBL_Ticket_Solvi` con los datos de la solicitud y, solo
 * si eso funcionó, elimina la solicitud original (con todas sus relaciones,
 * vía la acción `deleteRequest`). El orden importa: si la creación falla, la
 * solicitud queda intacta.
 */
async function transferRequestToSolvi({ supabase, dispatch, payload, target }: TransferContext): Promise<TransferTicketResult> {
  const requestId = String(payload.ticketId);

  const { data: req, error: reqErr } = await supabase
    .from('TBL_Requests')
    .select('Request_ID, Request_Title, Request_Description, Request_Requested_By')
    .eq('Request_ID', requestId)
    .maybeSingle();
  if (reqErr) throw new Error(reqErr.message);
  if (!req)   throw new Error(`transferTicket: la solicitud ${requestId} no existe.`);
  const request = req as {
    Request_ID:           string;
    Request_Title:        string | null;
    Request_Description:  string | null;
    Request_Requested_By: number | null;
  };

  const { data: teamRows, error: teamErr } = await supabase
    .from('TBL_Request_Team').select('Request_Team_ID').eq('Request_Team_Request_ID', requestId);
  if (teamErr) throw new Error(teamErr.message);
  const fromTeamId = ((teamRows ?? []) as { Request_Team_ID: number }[])[0]?.Request_Team_ID ?? null;

  if (request.Request_Requested_By == null) {
    throw new Error('transferTicket: la solicitud no tiene solicitante.');
  }
  const { data: user, error: userErr } = await supabase
    .from('TBL_Users')
    .select('User_Name, User_Email')
    .eq('User_ID', request.Request_Requested_By)
    .maybeSingle();
  if (userErr) throw new Error(userErr.message);
  if (!user)   throw new Error('transferTicket: el solicitante no existe o no se encuentra activo.');
  const requester = user as { User_Name: string; User_Email: string };

  // 1) Crear el ticket SOLVI.
  const { data: created, error: solviErr } = await supabase
    .from('TBL_Ticket_Solvi')
    .insert({
      ticket_solvi_titulo:             request.Request_Title,
      ticket_solvi_fuente:             SOLVI_DEFAULTS.fuente,
      ticket_solvi_estado:             SOLVI_DEFAULTS.estado,
      ticket_solvi_resolutor:          SOLVI_DEFAULTS.resolutor,
      ticket_solvi_correo_resolutor:   SOLVI_DEFAULTS.correoResolutor,
      ticket_solvi_fechaapertura:      new Date().toISOString(),
      ticket_solvi_descripcion:        request.Request_Description,
      ticket_solvi_solicitante:        requester.User_Name,
      ticket_solvi_correo_solicitante: requester.User_Email,
    })
    .select('ticket_solvi_id')
    .single();
  if (solviErr) throw new Error(solviErr.message);
  const createdSolviTicketId = (created as { ticket_solvi_id: number }).ticket_solvi_id;

  // 2) Eliminar la solicitud original con todas sus relaciones.
  await dispatch('deleteRequest', { id: requestId });

  // TODO(transfer): copiar adjuntos/comentarios relevantes al ticket SOLVI.
  if (payload.notify) {
    // TODO(transfer): notificar al solicitante y al resolutor SOLVI (best-effort, try/catch).
  }

  return { ok: true, source: 'request', ticketId: requestId, fromTeamId, toTeamId: target.Board_Team_ID, createdSolviTicketId };
}

/**
 * Ticket SOLVI → equipo PRISMA.
 *
 * Base implementada: verifica que el ticket exista y no esté cerrado.
 *
 * TODO(transfer): crear la solicitud PRISMA en el equipo destino (p. ej. vía
 * `dispatch('createRequest', …)`), copiar adjuntos/seguimientos que apliquen,
 * dejar un seguimiento en SOLVI y cerrar o marcar el ticket como transferido.
 * Lo que toque SharePoint (carga de casos del técnico) no puede hacerse aquí
 * sin permisos de aplicación en Graph.
 */
async function transferSolviToTeam({ supabase, payload }: TransferContext): Promise<TransferTicketResult> {
  const ticketId = Number(payload.ticketId);
  if (!Number.isFinite(ticketId)) throw new Error('transferTicket: `ticketId` de SOLVI inválido.');

  const { data: ticket, error } = await supabase
    .from('TBL_Ticket_Solvi').select('ticket_solvi_id, ticket_solvi_estado').eq('ticket_solvi_id', ticketId).maybeSingle();
  if (error)   throw new Error(error.message);
  if (!ticket) throw new Error(`transferTicket: el ticket SOLVI ${ticketId} no existe.`);

  const estado = String((ticket as { ticket_solvi_estado: string | null }).ticket_solvi_estado ?? '').toLowerCase();
  if (estado.includes('cerrado') || estado.includes('resuelto')) {
    throw new Error('transferTicket: el ticket SOLVI está cerrado.');
  }

  throw new Error('transferTicket: la transferencia de SOLVI a otro equipo aún no está implementada.');
}

/* ─── Acción ───────────────────────────────────────────────────────────────── */

/** Mapa de handlers de transferencia indexado por nombre de acción. */
export const transferHandlers: Record<string, ActionHandler> = {
  /**
   * Transfiere un ticket (solicitud PRISMA o ticket SOLVI) a otro equipo.
   *
   * @param payload - {@link TransferTicketPayload}.
   * @returns {@link TransferTicketResult}.
   * @throws Si el payload es inválido, el equipo destino no existe o está
   *   inactivo, o el recorrido aún no está implementado.
   */
  transferTicket: async (raw, { supabase, dispatch }) => {
    const payload = parsePayload(raw);
    const target  = await loadTargetTeam(supabase, payload.toTeamId);
    const ctx: TransferContext = { supabase, dispatch, payload, target };

    if (payload.source === 'solvi') {
      if (isSolviTeam(target)) throw new Error('transferTicket: el ticket ya está en SOLVI.');
      return transferSolviToTeam(ctx);
    }
    return isSolviTeam(target) ? transferRequestToSolvi(ctx) : transferRequestToTeam(ctx);
  },
};
