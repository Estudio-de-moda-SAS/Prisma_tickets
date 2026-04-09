import * as React from "react";
import type { Archivo } from "../../../Models/Attachments";
import { useGraphServices } from "../../../graph/GrapServicesContext";
import type { TicketsAttachments } from "../../../Models/Tickets";


type UseTicketDataParams = {
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useTicketAttachmentData({ setLoading, setError,}: UseTicketDataParams) {
  const graph = useGraphServices()

  const load = React.useCallback(async (items: TicketsAttachments[]): Promise<Archivo[]> => {
    setLoading(true);
    setError(null);

    try {
      let archivos: Archivo[] = [];
      for(const item of items) {
        const file = await graph.ticketBiblioteca.getFileById(item.IdAttachment);
        if(file) {
          archivos.push(file)
        }
      }
      return archivos
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Error cargando elementos de la carpeta.");
      return []
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);


  return { load };
}