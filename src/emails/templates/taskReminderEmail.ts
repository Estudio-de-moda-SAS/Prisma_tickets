type TaskReminderEmailProps = {
  userName: string;
  requestTitle: string;
  requestId: string;
  requestName: string;
  requestDescription: string;
  sprintName: string;
  sprintStartDate: string;
  sprintEndDate: string;
};

export const taskReminderEmail = ({
  userName,
  requestTitle,
  requestId,
  requestName,
  requestDescription,
  sprintName,
  sprintStartDate,
  sprintEndDate,
}: TaskReminderEmailProps) => `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${requestTitle}</title>
  </head>

  <body style="margin:0; padding:0; background:#ffffff; font-family:Arial, Helvetica, sans-serif; color:#222;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff; padding:0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:720px; background:#ffffff; padding:28px 72px 24px;">
            
            <tr>
              <td align="center" style="padding-bottom:18px;">
                <h1 style="margin:0; font-size:40px; line-height:1; font-weight:800; letter-spacing:1px; color:#6b2cff;">
                  PRISMA
                </h1>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding-bottom:26px;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" style="width:90px;">
                      <div style="width:34px; height:34px; border-radius:50%; background:#16a34a; color:#ffffff; line-height:34px; font-size:18px; font-weight:bold;">
                        ✓
                      </div>
                      <p style="margin:6px 0 0; font-size:8px; color:#333;">
                        Solicitud recibida
                      </p>
                    </td>

                    <td style="width:42px; border-top:1px solid #cccccc;"></td>

                    <td align="center" style="width:90px;">
                      <div style="width:34px; height:34px; border-radius:50%; background:#d9d9d9; color:#ffffff; line-height:34px; font-size:18px; font-weight:bold;">
                        ✓
                      </div>
                      <p style="margin:6px 0 0; font-size:8px; color:#333;">
                        En revisión
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="font-size:14px; line-height:1.45;">
                <p style="margin:0 0 14px;">
                  ¡Hola! ${userName}
                </p>

                <p style="margin:0 0 10px; font-weight:700;">
                  ${requestTitle}
                </p>

                <p style="margin:0;">
                  <strong>ID:</strong> ${requestId}
                </p>

                <p style="margin:0;">
                  <strong>Nombre:</strong> ${requestName}
                </p>

                <p style="margin:0 0 18px;">
                  <strong>Descripción:</strong> ${requestDescription}
                </p>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding-bottom:16px;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:2px solid #555555;">
                  <tr>
                    <td align="center" style="padding:8px 12px; font-size:13px;">
                      Esta tarea se realizará en el sprint: 
                      <strong>${sprintName}</strong> 
                      del ${sprintStartDate} al ${sprintEndDate}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center">
                <p style="margin:0; font-size:14px; color:#555555;">
                  ¡Te deseamos un lindo día!
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