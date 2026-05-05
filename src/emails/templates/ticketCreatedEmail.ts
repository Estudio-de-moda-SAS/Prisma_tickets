import { baseEmailTemplate } from "./baseEmailTemplate";

type TicketCreatedEmailProps = {
  userName: string;
  ticketName: string;
  ticketUrl: string;
};

export const ticketCreatedEmail = ({
  userName,
  ticketName,
  ticketUrl,
}: TicketCreatedEmailProps) => {
  return baseEmailTemplate({
    title: "Solicitud creada exitosamente",
    content: `
      <p style="margin:0 0 16px;">
        Hola <strong>${userName}</strong>,
      </p>

      <p style="margin:0 0 16px;">
        Tu solicitud <strong>${ticketName}</strong> fue creada correctamente.
      </p>

      <p style="margin:0;">
        Puedes consultar el estado de la solicitud desde la plataforma.
      </p>
    `,
    buttonText: "Ver solicitud",
    buttonUrl: ticketUrl,
  });
};