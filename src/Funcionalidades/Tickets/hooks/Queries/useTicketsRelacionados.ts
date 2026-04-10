import * as React from "react";
import type { Ticket } from "../../../../Models/Tickets";
import { useGraphServices } from "../../../../graph/GrapServicesContext";

export function useTicketsRelacionados( ticket: Ticket) {
  const service = useGraphServices();

  const [padre, setPadre] = React.useState<Ticket | null>(null);
  const [hijos, setHijos] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadRelateds = React.useCallback(async () => {
    if (!ticket?.ID) {
      setPadre(null);
      setHijos([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idPadre = ticket.IdCasoPadre;

      if (idPadre != null && idPadre !== "") {
        const padreRes = await service.Tickets.get(String(ticket.IdCasoPadre));
        setPadre(padreRes ?? null);
      } else {
        setPadre(null);
      }

      const hijosRes = await service.Tickets.getAll({
        filter: `fields/IdCasoPadre eq ${Number(ticket.ID)}`,
      });

      setHijos(hijosRes?.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando tickets relacionados");
      setPadre(null);
      setHijos([]);
    } finally {
      setLoading(false);
    }
  }, [ticket?.ID, ticket?.IdCasoPadre]);

  React.useEffect(() => {
    loadRelateds();
  }, [loadRelateds]);

  return {
    padre,
    hijos,
    loading,
    error,
    loadRelateds,
  };
}