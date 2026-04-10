import { useGraphServices } from "../../../../graph/GrapServicesContext";
import type { Archivo } from "../../../../Models/Attachments";
import type { TicketsAttachments } from "../../../../Models/Tickets";
import { useTicketAttachment } from "../../Library/useTicketAttachment";

export function useTicketsAttachmentsList() {
  const services = useGraphServices()
  const libraryController = useTicketAttachment()

  const handleCreateRelation = async (ticketId: string, file: File[]) => {
    try{
      for(const f of file) {
        const createdAttachment = await libraryController.handleUploadClick("/", f, `Ticket_Attachment_${ticketId}`)
        const attachMentId = createdAttachment?.id
        if(attachMentId) {
          const payload: TicketsAttachments = {
            IdAttachment: attachMentId,
            IdTicket: ticketId,
            Title: `Relación Ticket ${ticketId} - Attachment ${attachMentId}`,
          }
          await services.tickesAttachments.create(payload)
        }  
      }
    } catch(e: any) {
      console.error(e);
      alert("Error creando relación: " + e.message);
    }
  }

  const loadAttachments = async (ticketId: string,): Promise<Archivo[]> => {
    try{
      const relations = await services.tickesAttachments.getAll({ filter: `IdTicket eq '${ticketId}'`});
      if(relations.items.length === 0) return []
      const file = await libraryController.reload(relations.items)
      return file
    } catch(e: any) {
      console.error(e);
      alert("Error creando relación: " + e.message);
      return []
    }
  }

  return { handleCreateRelation, loadAttachments };
}
