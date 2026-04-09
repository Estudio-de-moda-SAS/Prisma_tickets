import type { Log } from "../../../Models/Log";
import type { LogService } from "../../../services/Logs.service";
import type { Ticket } from "../../../Models/Tickets";

export async function logTicketCreated(Logs: LogService, ticketId: string | number): Promise<void> {
  const payload: Log = {
    Actor: "Sistema",
    Descripcion: `Se ha creado un nuevo ticket para el siguiente requerimiento: ${String(ticketId ?? "")}`,
    CorreoActor: "",
    Tipo_de_accion: "Creacion",
    Title: String(ticketId ?? ""),
  };

  await Logs.create(payload);
}

export async function logObserverAssigned(Logs: LogService, ticket: Ticket, observadorNombre: string): Promise<void> {
  const payload: Log = {
    Title: ticket.ID ?? "",
    Actor: ticket.Nombreresolutor ?? "",
    CorreoActor: ticket.Correoresolutor ?? "",
    Descripcion: `${ticket.Nombreresolutor} ha asignado como observador del ticket con ID #${ticket.ID} a ${observadorNombre}`,
    Tipo_de_accion: "Asignacion observador",
  };

  await Logs.create(payload);
}

export async function logTicketReassigned(Logs: LogService, ticketId: string | number, actor: { nombre: string; correo: string }, candidatoNombre: string): Promise<void> {
  const payload: Log = {
    Title: String(ticketId ?? ""),
    Actor: actor.nombre,
    CorreoActor: actor.correo,
    Descripcion: `${actor.nombre} ha reasignado el caso ID ${ticketId} a ${candidatoNombre}`,
    Tipo_de_accion: "Reasignación de caso",
  };

  await Logs.create(payload);
}