import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

const SCORE_LABELS: Record<number, string> = {
  1: 'Muy malo',
  2: 'Malo',
  3: 'Regular',
  4: 'Bueno',
  5: 'Excelente',
};

function StarRow({
  value, hover, onSelect, onHover, onLeave, disabled,
}: {
  value: number; hover: number;
  onSelect: (n: number) => void;
  onHover: (n: number) => void;
  onLeave: () => void;
  disabled: boolean;
}) {
  const display = hover || value;
  return (
    <div className="feedback-modal__stars" onMouseLeave={onLeave}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={['feedback-modal__star', n <= display ? 'is-active' : ''].join(' ')}
          onClick={() => onSelect(n)}
          onMouseEnter={() => onHover(n)}
          disabled={disabled}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
        >
          <Star size={26} />
        </button>
      ))}
    </div>
  );
}

type Props = {
  requestId:    string;
  requestTitle: string;
  ratedBy:      number;
  resolverIds:  number[];
  onClose:      () => void;
  onSubmitted?: () => void;
};

export function ResolutionRatingModal({
  requestId, requestTitle, ratedBy, resolverIds, onClose, onSubmitted,
}: Props) {
  const [solution,  setSolution]  = useState(0);
  const [solHover,  setSolHover]  = useState(0);
  const [attention, setAttention] = useState(0);
  const [attHover,  setAttHover]  = useState(0);
  const [comment,   setComment]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const solDisplay = solHover || solution;
  const attDisplay = attHover || attention;
  const canSubmit  = solution > 0 && attention > 0;

  async function handleSubmit() {
    if (!canSubmit) { setError('Califica ambos aspectos.'); return; }
    setLoading(true);
    setError(null);
    try {
      await apiClient.call('submitResolutionRating', {
        requestId,
        ratedBy,
        solutionScore:  solution,
        attentionScore: attention,
        comment:        comment.trim() || null,
        resolverIds,
      });
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setError((e as Error).message ?? 'Error al enviar la calificación.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="feedback-overlay"
      style={{ zIndex: 300 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="feedback-modal feedback-modal--satisfaction">
        {/* Header */}
        <div className="feedback-modal__header">
          <div className="feedback-modal__header-left">
            <div className="feedback-modal__icon feedback-modal__icon--star">
              <Star size={16} />
            </div>
            <span className="feedback-modal__title">Califica la solución</span>
          </div>
          <button className="feedback-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="feedback-modal__success">
            <div className="feedback-modal__success-icon">✓</div>
            <p className="feedback-modal__success-title">¡Gracias por calificar!</p>
            <p className="feedback-modal__success-sub">
              Tu evaluación ayuda a mejorar la atención del equipo.
            </p>
            <button className="feedback-modal__btn feedback-modal__btn--primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <div className="feedback-modal__body">
            <p className="feedback-modal__sub">
              Aprobaste <strong>{requestTitle}</strong>. Tu calificación evalúa la
              atención y la solución del equipo que resolvió tu solicitud.
            </p>

            {/* Solución */}
            <label className="feedback-modal__label" style={{ marginTop: 4 }}>
              Solución brindada
            </label>
            <StarRow
              value={solution} hover={solHover}
              onSelect={setSolution} onHover={setSolHover}
              onLeave={() => setSolHover(0)} disabled={loading}
            />
            {solDisplay > 0 && (
              <p className="feedback-modal__score-label">{SCORE_LABELS[solDisplay]}</p>
            )}

            {/* Atención */}
            <label className="feedback-modal__label" style={{ marginTop: 14 }}>
              Atención recibida
            </label>
            <StarRow
              value={attention} hover={attHover}
              onSelect={setAttention} onHover={setAttHover}
              onLeave={() => setAttHover(0)} disabled={loading}
            />
            {attDisplay > 0 && (
              <p className="feedback-modal__score-label">{SCORE_LABELS[attDisplay]}</p>
            )}

            {/* Comentario opcional */}
            <label className="feedback-modal__label" style={{ marginTop: 16 }}>
              Comentario <span className="feedback-modal__optional">(opcional)</span>
            </label>
            <textarea
              className="feedback-modal__textarea"
              placeholder="¿Algo que destacar o mejorar?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              disabled={loading}
            />

            {error && <p className="feedback-modal__error">{error}</p>}

            <div className="feedback-modal__actions">
              <button
                className="feedback-modal__btn feedback-modal__btn--ghost"
                onClick={onClose}
                disabled={loading}
              >
                Ahora no
              </button>
              <button
                className="feedback-modal__btn feedback-modal__btn--primary"
                onClick={handleSubmit}
                disabled={loading || !canSubmit}
              >
                {loading ? 'Enviando…' : 'Enviar calificación'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}