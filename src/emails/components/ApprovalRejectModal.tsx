import { useState } from 'react';
import './ApprovalRejectModal.css';

type ApprovalRejectModalProps = {
  onSubmit: (comment: string) => void;
  onClose?: () => void;
};

export function ApprovalRejectModal({
  onSubmit,
  onClose,
}: ApprovalRejectModalProps) {
  const [comment, setComment] = useState('');
  const [showError, setShowError] = useState(false);

  function handleSubmit() {
    const normalizedComment = comment.trim();

    if (!normalizedComment) {
      setShowError(true);
      return;
    }

    onSubmit(normalizedComment);
  }

  return (
    <section className="approval-reject-modal">
      {onClose && (
        <button
          type="button"
          className="approval-reject-modal__close"
          onClick={onClose}
          aria-label="Cerrar modal"
        >
          ×
        </button>
      )}

      <h2 className="approval-reject-modal__title">
        Cuéntanos qué nos hizo falta
      </h2>

      <textarea
        className={[
          'approval-reject-modal__textarea',
          showError ? 'approval-reject-modal__textarea--error' : '',
        ].join(' ')}
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
          if (showError) setShowError(false);
        }}
        rows={4}
      />

      {showError && (
        <p className="approval-reject-modal__error">
          Debes escribir un comentario antes de enviar.
        </p>
      )}

      <button
        type="button"
        className="approval-reject-modal__submit"
        onClick={handleSubmit}
      >
        Enviar
      </button>
    </section>
  );
}