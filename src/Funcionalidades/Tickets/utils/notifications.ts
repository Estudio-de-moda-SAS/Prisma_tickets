import type { GraphRecipient,  } from "../../../graph/GraphRest";
import type { Ticket } from "../../../Models/Tickets";
import type { MailService } from "../../../services/Mail.service";
import { toISODateTimeFlex } from "../../../utils/Date";

export async function notifyTicketCreatedSolicitante(mail: MailService, ticket: Ticket): Promise<void> {

  const body = `
    <p>¡Hola ${ticket.Solicitante ?? ""}!<br><br>
    Tu solicitud ha sido registrada exitosamente y ha sido asignada a un técnico para su gestión. Estos son los detalles del caso:<br><br>
    <strong>ID del Caso:</strong> ${ticket.ID}<br>
    <strong>Asunto del caso:</strong> ${ticket.Title}<br>
    <strong>Resolutor asignado:</strong> ${ticket.Correoresolutor ?? "—"}<br>
    <strong>Fecha máxima de solución:</strong> ${toISODateTimeFlex(ticket.TiempoSolucion) ?? "No aplica"}<br><br>
    El resolutor asignado se pondrá en contacto contigo en el menor tiempo posible para darte solución a tu requerimiento.<br><br>
    Este es un mensaje automático, por favor no respondas.
    </p>
  `.trim();

  const address = (ticket.CorreoSolicitante ?? "").trim();

  if (!address) {
    throw new Error("notifyTicketCreatedSolicitante: correo del solicitante inválido");
  }

  const to: GraphRecipient[] = [
    {
      emailAddress: { address },
    },
  ];

  await mail.sendEmail({
    message: {
      subject: `Asignación de Caso - ${ticket.ID}`,
      body: {
        contentType: "HTML",
        content: body,
      },
      toRecipients: to,
    },
  });
}

export async function notifyTicketCreatedResolutor(mail: MailService, ticket: Ticket): Promise<void> {

  const body = `
    <p>¡Hola!<br><br>
    Tienes un nuevo caso asignado con estos detalles:<br><br>
    <strong>ID del Caso:</strong> ${ticket.ID}<br>
    <strong>Solicitante:</strong> ${ticket.Solicitante ?? "—"}<br>
    <strong>Correo del Solicitante:</strong> ${ticket.CorreoSolicitante ?? "—"}<br>
    <strong>Asunto:</strong> ${ticket.Title}<br>
    <strong>Fecha máxima de solución:</strong> ${toISODateTimeFlex(ticket.TiempoSolucion) ?? "No aplica"}<br><br>
    Por favor, contacta al usuario para brindarle solución.<br><br>
    Este es un mensaje automático, por favor no respondas.
    </p>
  `.trim();

  const address = (ticket.CorreoSolicitante ?? "").trim();

  if (!address) {
    throw new Error("notifyTicketCreatedSolicitante: correo del solicitante inválido");
  }

  const to: GraphRecipient[] = [
    {
      emailAddress: { address },
    },
  ];

  await mail.sendEmail({
    message: {
      subject: `Nuevo caso asignado - ${ticket.ID}`,
      body: {
        contentType: "HTML",
        content: body,
      },
      toRecipients: to,
    },
  });
}