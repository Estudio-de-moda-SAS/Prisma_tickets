import { useState } from 'react';
import { X, Bug, ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '@/lib/apiClient';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';


type Props = { onClose: () => void };

export function BugReportModal({ onClose }: Props) {
  const { pathname } = useLocation();
  const { data: currentUser } = useCurrentUser();

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      setError('El título y la descripción son obligatorios.');
      return;
    }
    if (!currentUser?.User_ID) {
      setError('No se pudo identificar tu usuario.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.call('createBugReport', {
        userId:      currentUser.User_ID,
        title:       title.trim(),
        description: description.trim(),
        screenPath:  pathname,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message ?? 'Error al enviar el reporte.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="feedback-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="feedback-modal">
        {/* Header */}
        <div className="feedback-modal__header">
          <div className="feedback-modal__header-left">
            <div className="feedback-modal__icon feedback-modal__icon--bug">
              <Bug size={16} />
            </div>
            <span className="feedback-modal__title">Reportar un fallo</span>
          </div>
          <button className="feedback-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="feedback-modal__success">
            <div className="feedback-modal__success-icon">✓</div>
            <p className="feedback-modal__success-title">¡Reporte enviado!</p>
            <p className="feedback-modal__success-sub">
              El equipo de TI revisará el fallo a la brevedad.
            </p>
            <button className="feedback-modal__btn feedback-modal__btn--primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <div className="feedback-modal__body">
            {/* Título */}
            <label className="feedback-modal__label">
              Título del problema <span className="feedback-modal__required">*</span>
            </label>
            <input
              className="feedback-modal__input"
              placeholder="Ej: El botón de guardar no responde"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={loading}
            />


            {/* Descripción */}
            <label className="feedback-modal__label" style={{ marginTop: 14 }}>
              Descripción <span className="feedback-modal__required">*</span>
            </label>
            <textarea
              className="feedback-modal__textarea"
              placeholder="Describe el problema con el mayor detalle posible: qué hiciste, qué esperabas y qué ocurrió."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={loading}
            />

            {/* Ruta automática */}
            <p className="feedback-modal__hint">
              <ChevronDown size={11} style={{ transform: 'rotate(-90deg)', marginRight: 4, opacity: 0.5 }} />
              Pantalla actual: <code>{pathname}</code>
            </p>

            {error && <p className="feedback-modal__error">{error}</p>}

            {/* Acciones */}
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
                disabled={loading || !title.trim() || !description.trim()}
              >
                {loading ? 'Enviando…' : 'Enviar reporte'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}