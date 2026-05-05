import { useState } from 'react';
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
}
];

export default function EmailPreviewPage() {
  const [selectedEmailId, setSelectedEmailId] = useState(emailPreviews[0].id);

  const selectedEmail =
    emailPreviews.find((email) => email.id === selectedEmailId) ?? emailPreviews[0];

  return (
    <main style={{ minHeight: '100vh', background: '#f4f6f8', padding: '32px' }}>
      <section
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <aside
          style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: 16,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
          }}
        >
          <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#111827' }}>
            Preview de correos
          </h1>

          <p style={{ fontSize: 14, margin: '0 0 20px', color: '#6b7280' }}>
            Selecciona un formato para visualizarlo.
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
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
                    border: isActive ? '1px solid #6b2cff' : '1px solid #e5e7eb',
                    background: isActive ? '#f3efff' : '#ffffff',
                    color: '#111827',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 14 }}>{email.label}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    {email.description}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section>
          <div
            style={{
              marginBottom: 16,
              background: '#ffffff',
              borderRadius: 16,
              padding: '16px 20px',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
            }}
          >
            <h2 style={{ fontSize: 18, margin: '0 0 4px', color: '#111827' }}>
              {selectedEmail.label}
            </h2>
            <p style={{ fontSize: 14, margin: 0, color: '#6b7280' }}>
              {selectedEmail.description}
            </p>
          </div>

          <div
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
            }}
            dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
          />
        </section>
      </section>
    </main>
  );
}