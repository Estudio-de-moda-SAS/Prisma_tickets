import { baseEmailTemplate } from './baseEmailTemplate';

type TicketAssignedEmailProps = {
  userName: string;
  ticketName: string;
  assignedTo: string;
  ticketUrl: string;
};

export const ticketAssignedEmail = ({
  userName,
  ticketName,
  assignedTo,
  ticketUrl,
}: TicketAssignedEmailProps) => {
  return baseEmailTemplate({
    title: 'Solicitud asignada',
    content: `
      <p style="margin:0 0 16px;">
        Hola <strong>${userName}</strong>,
      </p>

      <p style="margin:0 0 16px;">
        La solicitud <strong>${ticketName}</strong> fue asignada a <strong>${assignedTo}</strong>.
      </p>

      <p style="margin:0;">
        Puedes consultar el detalle de la solicitud desde la plataforma.
      </p>
    `,
    buttonText: 'Ver solicitud',
    buttonUrl: ticketUrl,
  });
};