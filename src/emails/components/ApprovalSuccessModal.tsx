import './ApprovalSuccessModal.css';

type ApprovalSuccessModalProps = {
  onClose?: () => void;
};

export function ApprovalSuccessModal({ onClose }: ApprovalSuccessModalProps) {
  return (
    <section className="approval-success-modal">
      {onClose && (
        <button
          type="button"
          className="approval-success-modal__close"
          onClick={onClose}
          aria-label="Cerrar modal"
        >
          ×
        </button>
      )}

      <div className="approval-success-modal__icon">
        ✓
      </div>

      <h2 className="approval-success-modal__title">
        Tu respuesta ha sido enviada con éxito
      </h2>
    </section>
  );
}