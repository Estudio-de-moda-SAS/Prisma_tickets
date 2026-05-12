type TaskApprovalEmailProps = {
  userName: string;
  requestId: string;
  requestName: string;
  approvalUrl: string;
};

export const taskApprovalEmail = ({
  userName,
  requestId,
  requestName,
  approvalUrl,
}: TaskApprovalEmailProps) => `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Área lista para revisión</title>
  </head>

  <body style="margin:0; padding:0; background:#ffffff; font-family:Arial, Helvetica, sans-serif; color:#111111;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff; padding:0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px; background:#ffffff; padding:24px 64px 32px;">
            
            <tr>
              <td align="center" style="padding-bottom:12px;">
                <h1 style="margin:0; font-size:42px; line-height:1; font-weight:800; letter-spacing:1px; color:#6b2cff;">
                  PRISMA
                </h1>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding-bottom:24px;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" style="width:82px;">
                      <div style="width:28px; height:28px; border-radius:50%; background:#16a34a; color:#ffffff; line-height:28px; font-size:16px; font-weight:bold;">
                        ✓
                      </div>
                      <p style="margin:5px 0 0; font-size:7px; color:#333333;">
                        Solicitud recibida
                      </p>
                    </td>

                    <td style="width:44px; border-top:1px solid #16a34a;"></td>

                    <td align="center" style="width:82px;">
                      <div style="width:28px; height:28px; border-radius:50%; background:#16a34a; color:#ffffff; line-height:28px; font-size:16px; font-weight:bold;">
                        ✓
                      </div>
                      <p style="margin:5px 0 0; font-size:7px; color:#333333;">
                        En revisión
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="font-size:13px; line-height:1.45;">
                <p style="margin:0 0 12px;">
                  ¡Hola! ${userName}
                </p>

                <p style="margin:0 0 14px; font-weight:700;">
                  Esta tarea está lista para tu revisión
                </p>

                <p style="margin:0;">
                  <strong>ID:</strong> ${requestId}
                </p>

                <p style="margin:0 0 20px;">
                  <strong>Nombre:</strong> ${requestName}
                </p>
              </td>
            </tr>

            <tr>
              <td align="center">
                <a
                  href="${approvalUrl}" 
                  data-approval-trigger="true"
                  style="display:inline-block; width:280px; padding:10px 16px; background:#000000; color:#ffffff; text-decoration:none; border-radius:7px; font-size:13px; font-weight:700; text-align:center;"
                >
                  Clic aquí para aprobar
                </a>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;