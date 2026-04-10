import * as React from "react";
import { useGraphServices } from "../../../graph/GrapServicesContext";
import type { Archivo } from "../../../Models/Attachments";


export function useExplorerActions() {

  const service = useGraphServices()

  const handleUploadClick = React.useCallback(async (path: string, file: File, name?: string): Promise<Archivo | null> => {
    if (!file) {
      alert("Debes seleccionar un archivo antes de subirlo");
      return null;
    }

    try {
      const createdAttachment = await service.ticketBiblioteca.uploadFile(path, file, name);
      return createdAttachment
    } catch (e: any) {
      console.error(e);
      alert("Error subiendo archivo: " + e.message);
      return null
    }
  }, [service.ticketBiblioteca,]);

  return {
    handleUploadClick,
  };
}