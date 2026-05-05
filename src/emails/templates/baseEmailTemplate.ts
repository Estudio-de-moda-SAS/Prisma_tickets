type BaseEmailTemplateProps = {
  title: string;
  subtitle?: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
};

export const baseEmailTemplate = ({
  title,
  subtitle,
  content,
  buttonText,
  buttonUrl,
}: BaseEmailTemplateProps) => `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>

  <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Inter, Arial, Helvetica, sans-serif; color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; background-color:#f4f6f8; padding:32px 16px;">
      <tr>
        <td align="center">

          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px; background-color:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 12px 32px rgba(15,23,42,0.08);">

            <tr>
              <td style="padding:28px 32px; background:linear-gradient(135deg,#6b2cff,#7c3aed); text-align:center;">
                <p style="margin:0 0 8px; color:#e9ddff; font-size:13px; font-weight:600; letter-spacing:0.4px; text-transform:uppercase;">
                  Gestión de solicitudes
                </p>

                <h1 style="margin:0; color:#ffffff; font-size:26px; line-height:1.25; font-weight:700;">
                  ${title}
                </h1>

                ${
                  subtitle
                    ? `
                      <p style="margin:12px 0 0; color:#f3eefe; font-size:15px; line-height:1.5;">
                        ${subtitle}
                      </p>
                    `
                    : ''
                }
              </td>
            </tr>

            <tr>
              <td style="padding:32px; color:#1f2937; font-size:16px; line-height:1.65;">
                ${content}

                ${
                  buttonText && buttonUrl
                    ? `
                      <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:28px;">
                        <tr>
                          <td style="background-color:#6b2cff; border-radius:10px;">
                            <a href="${buttonUrl}" style="display:inline-block; padding:13px 24px; color:#ffffff; text-decoration:none; font-size:15px; font-weight:700;">
                              ${buttonText}
                            </a>
                          </td>
                        </tr>
                      </table>
                    `
                    : ''
                }
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px; background-color:#f9fafb; border-top:1px solid #eef0f3;">
                <p style="margin:0 0 8px; color:#6b7280; font-size:13px; line-height:1.5; text-align:center;">
                  Este correo fue enviado automáticamente. Por favor, no responder este mensaje.
                </p>

                <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.5; text-align:center;">
                  Si necesitas más información, consulta la solicitud desde la plataforma.
                </p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
`;