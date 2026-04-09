import type {FormObservadorErrors, FormObservadorState, FormReasignarState, Ticket,
  TicketErrors,
} from "../../../Models/Tickets";

export function validateNuevoTicket(state: Partial<Ticket>): TicketErrors {
  const e: TicketErrors = {};

  if (!state.Solicitante) e.Solicitante = "Requerido";
  if (!state.Nombreresolutor) e.Nombreresolutor = "Requerido";
  if (!state.Fuente) e.Fuente = "Seleccione una fuente";
  if (!state.Title?.trim()) e.Title = "Ingrese el motivo";
  if (state.Descripcion && state.Descripcion.length < 60) {
    e.Descripcion = "La descripción debe tener minimo 60 caracteres";
  }
  if (!state.Descripcion?.trim()) e.Descripcion = "Describa el problema";
  if (!state.Categoria) e.Categoria = "Seleccione una categoría";

  return e;
}

export function validateObservador(state: FormObservadorState): FormObservadorErrors {
  const e: FormObservadorErrors = {};
  if (!state.observador) e.observador = "Seleccione un usuario para asignar como observador";
  return e;
}

export function validateReasignacion(state: FormReasignarState): TicketErrors {
  const e: TicketErrors = {};
  if (!state.resolutor) e.Nombreresolutor = "Seleccione un resolutor para reasignar";
  return e;
}