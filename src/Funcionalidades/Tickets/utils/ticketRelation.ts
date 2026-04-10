import type { TicketsService } from "../../../services/Tickets.service";

export async function relateTickets(TicketsSvc: TicketsService, actualId: string | number, relatedId: string | number, type: "padre" | "hijo"): Promise<{ ok: boolean; message?: string }> {
  const aId = String(actualId ?? "").trim();
  const rId = String(relatedId ?? "").trim();

  if (!aId || !rId) {
    return { ok: false, message: "Ids inválidos para relacionar el ticket" };
  }

  if (type === "padre") {
    await TicketsSvc.update(aId, { IdCasoPadre: rId });
    return { ok: true };
  }

  await TicketsSvc.update(rId, { IdCasoPadre: aId });
  return { ok: true };
}