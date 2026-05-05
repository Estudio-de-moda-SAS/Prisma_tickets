import { baseEmailTemplate } from './baseEmailTemplate';

type TicketStatusChangedEmailProps = {
  userName: string;
  ticketName: string;
  previousStatus: string;
  newStatus: string;
  ticketUrl: string;
};

export const ticketStatusChangedEmail = ({
  userName,
  ticketName,
  previousStatus,
  newStatus,
  ticketUrl,
}: TicketStatusChangedEmailProps) => {
  return baseEmailTemplate({
    title: 'Estado de solicitud actualizado',
    content: `
      <p style="margin:0 0 16px;">
        Hola <strong>${userName}</strong>,
      </p>

      <p style="margin:0 0 16px;">
        La solicitud <strong>${ticketName}</strong> cambió de estado.
      </p>

      <p style="margin:0 0 16px;">
        <strong>${previousStatus}</strong> → <strong>${newStatus}</strong>
      </p>

      <p style="margin:0;">
        Puedes revisar el detalle completo desde la plataforma.
      </p>
    `,
    buttonText: 'Ver solicitud',
    buttonUrl: ticketUrl,
  });
};