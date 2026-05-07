import { useState } from 'react';
import { Mail, Eye } from 'lucide-react';

import { ticketCreatedEmail } from '@/emails/templates/ticketCreatedEmail';
import { ticketAssignedEmail } from '@/emails/templates/ticketAssignedEmail';
import { ticketStatusChangedEmail } from '@/emails/templates/ticketStatusChangedEmail';

const emailPreviews = [
  {
    id: 'created',
    label: 'Solicitud creada',
    description: 'Correo enviado cuando se crea una nueva solicitud.',
    html: ticketCreatedEmail({
      userName: 'Cristian Montoya',
      ticketName: 'Configurar correos',
      ticketUrl: 'https://tusistema.com/tickets/123',
    }),
  },
  {
    id: 'assigned',
    label: 'Solicitud asignada',
    description: 'Correo enviado cuando una solicitud es asignada a un responsable.',
    html: ticketAssignedEmail({
      userName: 'Cristian Montoya',
      ticketName: 'Configurar correos',
      assignedTo: 'Cristian Montoya',
      ticketUrl: 'https://tusistema.com/tickets/123',
    }),
  },
  {
    id: 'status',
    label: 'Cambio de estado',
    description: 'Correo enviado cuando una solicitud cambia de estado.',
    html: ticketStatusChangedEmail({
      userName: 'Cristian Montoya',
      ticketName: 'Configurar correos',
      previousStatus: 'En progreso',
      newStatus: 'Finalizado',
      ticketUrl: 'https://tusistema.com/tickets/123',
    }),
  },
];

export default function EmailsPage() {
  const [selectedEmailId, setSelectedEmailId] = useState(emailPreviews[0].id);

  const selectedEmail =
    emailPreviews.find((email) => email.id === selectedEmailId) ?? emailPreviews[0];

  return (
    <main style={{ padding: '22px 32px 32px' }}>
      <section style={{ maxWidth: 960, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 22,
                lineHeight: 1.2,
                fontWeight: 800,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: 'var(--txt)',
              }}
            >
              <Mail size={20} color="#00b8ff" />
              Correos
            </h1>

            <p
              style={{
                margin: '8px 0 0',
                maxWidth: 560,
                fontSize: 13,
                lineHeight: 1.45,
                color: 'var(--txt-muted)',
              }}
            >
              Plantillas HTML base para las notificaciones enviadas durante el ciclo de vida
              de una solicitud.
            </p>
          </div>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '300px minmax(0, 1fr)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <aside
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--txt)',
              }}
            >
              Plantillas disponibles
            </h2>

            <p
              style={{
                margin: '6px 0 14px',
                fontSize: 12,
                lineHeight: 1.45,
                color: 'var(--txt-muted)',
              }}
            >
              Selecciona una plantilla para revisar su vista previa.
            </p>

            <div style={{ display: 'grid', gap: 8 }}>
              {emailPreviews.map((email) => {
                const isActive = email.id === selectedEmail.id;

                return (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => setSelectedEmailId(email.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: isActive ? '1px solid #00b8ff' : '1px solid var(--line)',
                      background: isActive ? 'rgba(0, 184, 255, 0.08)' : 'var(--card)',
                      color: 'var(--txt)',
                      borderRadius: 7,
                      padding: '11px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 5,
                      }}
                    >
                      <Eye
                        size={13}
                        color={isActive ? '#00b8ff' : 'var(--txt-muted)'}
                      />

                      <strong style={{ fontSize: 13 }}>
                        {email.label}
                      </strong>
                    </span>

                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        lineHeight: 1.35,
                        color: 'var(--txt-muted)',
                      }}
                    >
                      {email.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section style={{ minWidth: 0 }}>
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '16px 18px',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#00b8ff',
                }}
              >
                <Mail size={13} />
                Vista previa HTML
              </span>

              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 800,
                  color: 'var(--txt)',
                }}
              >
                {selectedEmail.label}
              </h2>

              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 12.5,
                  color: 'var(--txt-muted)',
                }}
              >
                {selectedEmail.description}
              </p>
            </div>

            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 18,
                height: 540,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: 640,
                    transform: 'scale(0.68)',
                    transformOrigin: 'top center',
                    borderRadius: 12,
                    overflow: 'hidden',
                    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
                  }}
                  dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                />
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}