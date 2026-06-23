import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';

const SCORE_LABELS: Record<number, string> = {
  1: 'Muy insatisfecho',
  2: 'Insatisfecho',
  3: 'Neutral',
  4: 'Satisfecho',
  5: 'Muy satisfecho',
};

type Props = { onClose: () => void };

export function SatisfactionModal({ onClose }: Props) {
  const { data: currentUser } = useCurrentUser();

  const [score,   setScore]   = useState<number>(0);
  const [hovered, setHovered] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const displayScore = hovered || score;

  async function handleSubmit() {
    if (score === 0) { setError('Selecciona una calificación.'); return; }
    if (!currentUser?.User_ID) { setError('No se pudo identificar tu usuario.'); return; }
    setLoading(true);
    setError(null);
    try {
      await apiClient.call('createSatisfactionRating', {
        userId:  currentUser.User_ID,
        score,
        comment: comment.trim() || null,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message ?? 'Error al enviar la calificación.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="feedback-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="feedback-modal feedback-modal--satisfaction">
        {/* Header */}
        <div className="feedback-modal__header">
          <div className="feedback-modal__header-left">
            <div className="feedback-modal__icon feedback-modal__icon--star">
              <Star size={16} />
            </div>
            <span className="feedback-modal__title">Tu opinión</span>
          </div>
          <button className="feedback-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="feedback-modal__success">
            <div className="feedback-modal__success-icon">✓</div>
            <p className="feedback-modal__success-title">¡Gracias por tu opinión!</p>
            <p className="feedback-modal__success-sub">
              Tu calificación nos ayuda a mejorar PRISMA.
            </p>
            <button className="feedback-modal__btn feedback-modal__btn--primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <div className="feedback-modal__body">
            <p className="feedback-modal__sub">
              ¿Cómo calificarías tu experiencia con PRISMA Tickets?<br></br>
              Tu opinion nos importa! asi que tus sinceros comentarios son bienvenidos.
            </p>

            {/* Estrellas */}
            <div
              className="feedback-modal__stars"
              onMouseLeave={() => setHovered(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={['feedback-modal__star', n <= displayScore ? 'is-active' : ''].join(' ')}
                  onClick={() => setScore(n)}
                  onMouseEnter={() => setHovered(n)}
                  disabled={loading}
                  aria-label={`Calificar ${n} estrella${n > 1 ? 's' : ''}`}
                >
                  <Star size={28} />
                </button>
              ))}
            </div>

            {displayScore > 0 && (
              <p className="feedback-modal__score-label">
                {SCORE_LABELS[displayScore]}
              </p>
            )}

            {/* Comentario opcional */}
            <label className="feedback-modal__label" style={{ marginTop: 16 }}>
              Comentario <span className="feedback-modal__optional">(opcional)</span>
            </label>
            <textarea
              className="feedback-modal__textarea"
              placeholder="¿Qué mejorarías? ¿Algo que te haya gustado especialmente?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              disabled={loading}
            />

            {error && <p className="feedback-modal__error">{error}</p>}

            <div className="feedback-modal__actions">
              <button
                className="feedback-modal__btn feedback-modal__btn--ghost"
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="feedback-modal__btn feedback-modal__btn--primary"
                onClick={handleSubmit}
                disabled={loading || score === 0}
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