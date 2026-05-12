import { useState } from 'react';
import { Mail, Eye } from 'lucide-react';

import { ticketCreatedEmail } from '@/emails/templates/ticketCreatedEmail';
import { ticketAssignedEmail } from '@/emails/templates/ticketAssignedEmail';
import { ticketStatusChangedEmail } from '@/emails/templates/ticketStatusChangedEmail';
import { taskReminderEmail } from '@/emails/templates/taskReminderEmail';
import { taskApprovalEmail } from '@/emails/templates/taskApprovalEmail';

import { ApprovalTicketModal } from '@/emails/components/ApprovalTicketModal';
import { ApprovalRejectModal } from '@/emails/components/ApprovalRejectModal';
import { ApprovalSuccessModal } from '@/emails/components/ApprovalSuccessModal';

type ApprovalFlowStep = 'ticket' | 'reject-comment' | 'success' | null;

const emailPreviews = [
  {
    id: 'created',
    label: 'Solicitud creada',
    description: 'Correo enviado cuando se crea una nueva solicitud.',
    scale: 0.68,
    height: 540,
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
    scale: 0.68,
    height: 540,
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
    scale: 0.68,
    height: 540,
    html: ticketStatusChangedEmail({
      userName: 'Cristian Montoya',
      ticketName: 'Configurar correos',
      previousStatus: 'En progreso',
      newStatus: 'Finalizado',
      ticketUrl: 'https://tusistema.com/tickets/123',
    }),
  },
  {
    id: 'task-reminder',
    label: 'Email automatización 1',
    description: 'Correo enviado para notificar la recepción y programación de una solicitud.',
    scale: 0.88,
    height: 540,
    html: taskReminderEmail({
      userName: 'Sonia Lopez',
      requestTitle: 'Recibimos tu solicitud',
      requestId: '#1520D',
      requestName: 'Ajustar correos electrónicos Entrega en tienda',
      requestDescription:
        'Se deben ajustar los correos transaccionales de entrega en tienda, pues están mostrando información incompleta.',
      sprintName: '2026-10',
      sprintStartDate: '15',
      sprintEndDate: '20 Julio',
    }),
  },
  {
    id: 'task-approval',
    label: 'Email automatización 2',
    description: 'Correo enviado cuando una solicitud está lista para revisión y aprobación.',
    scale: 0.98,
    height: 540,
    html: taskApprovalEmail({
      userName: 'Sonia Lopez',
      requestId: '#1520D',
      requestName: 'Ajustar correos electrónicos Entrega en tienda',
      approvalUrl: '#',
    }),
  },
];

export default function EmailsPage() {
  const [selectedEmailId, setSelectedEmailId] = useState(emailPreviews[0].id);
  const [approvalFlowStep, setApprovalFlowStep] = useState<ApprovalFlowStep>(null);

  const selectedEmail =
    emailPreviews.find((email) => email.id === selectedEmailId) ?? emailPreviews[0];

  const isApprovalEmail = selectedEmail.id === 'task-approval';

  return (
    <main style={{ padding: '22px 32px 32px' }}>
      <section style={{ maxWidth: 960, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, lineHeight: 1.2, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--txt)' }}>
              <Mail size={20} color="#00b8ff" />
              Correos
            </h1>

            <p style={{ margin: '8px 0 0', maxWidth: 560, fontSize: 13, lineHeight: 1.45, color: 'var(--txt-muted)' }}>
              Plantillas HTML base para las notificaciones enviadas durante el ciclo de vida de una solicitud.
            </p>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          <aside style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>
              Plantillas disponibles
            </h2>

            <p style={{ margin: '6px 0 14px', fontSize: 12, lineHeight: 1.45, color: 'var(--txt-muted)' }}>
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <Eye size={13} color={isActive ? '#00b8ff' : 'var(--txt-muted)'} />
                      <strong style={{ fontSize: 13 }}>{email.label}</strong>
                    </span>

                    <span style={{ display: 'block', fontSize: 12, lineHeight: 1.35, color: 'var(--txt-muted)' }}>
                      {email.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section style={{ minWidth: 0 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '16px 18px', marginBottom: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00b8ff' }}>
                <Mail size={13} />
                Vista previa HTML
              </span>

              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>
                {selectedEmail.label}
              </h2>

              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--txt-muted)' }}>
                {selectedEmail.description}
              </p>
            </div>

            <div style={{ height: selectedEmail.height, overflow: 'hidden', display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'hidden' }}>
                <div
                  style={{
                    height: selectedEmail.height,
                    transform: `scale(${selectedEmail.scale})`,
                    transformOrigin: 'top center',
                    borderRadius: 12,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      pointerEvents: isApprovalEmail ? 'none' : 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                  />

                  {isApprovalEmail && (
                    <button
                      type="button"
                      aria-label="Abrir modal de aprobación"
                      onClick={() => setApprovalFlowStep('ticket')}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </section>
        </section>
      </section>

      {approvalFlowStep && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
            padding: 24,
          }}
          onClick={() => setApprovalFlowStep(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            {approvalFlowStep === 'ticket' && (
              <ApprovalTicketModal
                ticketId="#1520D"
                ticketTitle="Ajustar correos electrónicos Entrega en tienda"
                description={`Los correos electrónicos de entrega en tienda deben contener más información como:
A
B
C`}
                supports={[
                  {
                    id: '1',
                    type: 'link',
                    name: 'Workspace',
                    url: 'https://workspace.myvtex.com/tenis',
                  },
                  {
                    id: '2',
                    type: 'image',
                    name: 'Captura4783.png',
                    url: 'https://via.placeholder.com/300',
                    previewUrl: 'https://via.placeholder.com/300',
                  },
                  {
                    id: '3',
                    type: 'image',
                    name: 'Grabación.mp4',
                    url: 'https://via.placeholder.com/300',
                    previewUrl: 'https://via.placeholder.com/300',
                  },
                  {
                    id: '4',
                    type: 'file',
                    name: 'Maestro.xlsx',
                    url: '#',
                    previewUrl: 'https://via.placeholder.com/300x200?text=XLSX',
                  },
                ]}
                onApprove={() => {
                  console.log('Solicitud aprobada');
                  setApprovalFlowStep('success');
                }}
                onReject={() => {
                  setApprovalFlowStep('reject-comment');
                }}
                onClose={() => {
                  setApprovalFlowStep(null);
                }}
              />
            )}

            {approvalFlowStep === 'reject-comment' && (
              <ApprovalRejectModal
                onSubmit={(comment) => {
                  console.log('Solicitud no aprobada:', comment);
                  setApprovalFlowStep('success');
                }}
                onClose={() => {
                  setApprovalFlowStep('ticket');
                }}
              />
            )}

            {approvalFlowStep === 'success' && (
              <ApprovalSuccessModal
                onClose={() => {
                  setApprovalFlowStep(null);
                }}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}