import './ApprovalTicketModal.css';

export type TicketSupport = {
  id: string;
  name: string;
  type: 'link' | 'image' | 'file';
  url: string;
  previewUrl?: string;
};

type ApprovalTicketModalProps = {
  ticketId: string;
  ticketTitle: string;
  description: string;
  supports: TicketSupport[];
  onApprove?: () => void;
  onReject?: () => void;
  onClose?: () => void;
};

export function ApprovalTicketModal({
  ticketId,
  ticketTitle,
  description,
  supports,
  onApprove,
  onReject,
  onClose,
}: ApprovalTicketModalProps) {
  const links = supports.filter((support) => support.type === 'link');
  const files = supports.filter((support) => support.type !== 'link');

  return (
    <section className="approval-ticket">
      <header className="approval-ticket__header">
        <div className="approval-ticket__header-top">
          <h1 className="approval-ticket__title">
            TICKET <span>{ticketId}</span>
          </h1>

          {onClose && (
            <button
              type="button"
              className="approval-ticket__close"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              ×
            </button>
          )}
        </div>

        <h2 className="approval-ticket__subtitle">{ticketTitle}</h2>
      </header>

      <section className="approval-ticket__section">
        <h3 className="approval-ticket__section-title">Descripción</h3>
        <div className="approval-ticket__description">{description}</div>
      </section>

      {links.length > 0 && (
        <section className="approval-ticket__support-box">
          <h3 className="approval-ticket__support-title">Tarea:</h3>

          <div className="approval-ticket__support-links">
            {links.map((support) => (
              <a
                key={support.id}
                href={support.url}
                target="_blank"
                rel="noreferrer"
                className="approval-ticket__link"
              >
                {support.url}
              </a>
            ))}
          </div>
        </section>
      )}

      {files.length > 0 && (
        <section className="approval-ticket__support-box">
          <h3 className="approval-ticket__support-title">Soportes:</h3>

          <div className="approval-ticket__files">
            {files.map((support) => (
              <a
                key={support.id}
                href={support.url}
                target="_blank"
                rel="noreferrer"
                className="approval-ticket__file"
              >
                <div className="approval-ticket__file-preview">
                  {support.previewUrl ? (
                    <img src={support.previewUrl} alt={support.name} />
                  ) : (
                    <span>Archivo</span>
                  )}
                </div>

                <p title={support.name}>{support.name}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="approval-ticket__footer">
        <p>¿Resolvimos tu solicitud?</p>

        <div className="approval-ticket__actions">
          <button
            type="button"
            className="approval-ticket__button approval-ticket__button--approve"
            onClick={onApprove}
          >
            Aprobada
          </button>

          <button
            type="button"
            className="approval-ticket__button approval-ticket__button--reject"
            onClick={onReject}
          >
            No aprobado
          </button>
        </div>
      </footer>
    </section>
  );
}