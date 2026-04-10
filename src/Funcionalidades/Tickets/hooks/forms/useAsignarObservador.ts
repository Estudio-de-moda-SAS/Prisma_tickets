import * as React from "react";
import type { FormObservadorErrors, FormObservadorState, Ticket } from "../../../../Models/Tickets";
import { useGraphServices } from "../../../../graph/GrapServicesContext";
import { validateObservador } from "../../utils/ticketValidators";
import { logObserverAssigned } from "../../../Log/utils/ticketsLogs";

export function useAsignarObservador( ticket: Ticket) {
  const { Logs, Tickets } = useGraphServices();

  const [state, setState] = React.useState<FormObservadorState>({ observador: null });
  const [errors, setErrors] = React.useState<FormObservadorErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const setField = <K extends keyof FormObservadorState>(k: K, v: FormObservadorState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const handleObservador = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validation = validateObservador(state);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);

    try {
      await Tickets.update(ticket.ID ?? "", {
        Observador: state.observador?.label,
        CorreoObservador: state.observador?.email,
      });

      await logObserverAssigned(Logs, ticket, state.observador?.label ?? "");

      setState({ observador: null });
      setErrors({});
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        general: err?.message ?? "Error asignando observador",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return { state, setField, errors, submitting, handleObservador };
}