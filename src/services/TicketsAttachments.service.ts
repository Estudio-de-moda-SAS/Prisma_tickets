import type { GraphRest } from "../graph/GraphRest";
import type { TicketsAttachments } from "../Models/Tickets";
import { BaseSharePointListService } from "./base.Service";

export class TicketsAttachmentsService extends BaseSharePointListService<TicketsAttachments> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "SA - TicketsAttachments"
    );
  }

  protected toModel(item: any): TicketsAttachments {
    const f = item?.fields ?? {};

    return {
      Id: String(item?.id ?? ''),
      Title: f.Title,
      IdTicket: f.IdTicket,
      IdAttachment: f.IdAttachment
    };
  }
}